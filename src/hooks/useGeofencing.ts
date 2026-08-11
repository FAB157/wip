// =====================================================================
// ITAINTA · useGeofencing — motore geofencing con coda audioguide
//
// PIPELINE:
//   GPS tick → distanza STRADALE Mapbox (driving/walking)
//            → audioQueueManager.update()
//     → AlertZone (300m auto / 150m piedi): avviso audio + banner
//     → TriggerZone (50m auto / 25m piedi): scheda + audioguida in coda
//
// DISTANZE: SEMPRE stradali (Mapbox Directions). L'Haversine è usato
//   SOLO come guard per saltare chiamate API su POI palesemente lontani.
//
// AVANZAMENTO CODA (gestito da AudioQueueManager):
//   1. Audio finito naturalmente
//   2. Utente preme STOP
//   3. GPS rileva allontanamento
//
// Usa Mapbox Directions (auto + piedi) per distanze stradali precise.
// Fallback Haversine se Mapbox non disponibile.
// =====================================================================

import { useEffect, useRef } from 'react';
import { locationService } from '../services/locationService';
import { getGeofencePois, isAreaIndexed } from '../services/poiRepository';
import { runOverpassDiscovery } from '../services/poiDiscovery';
import { getOrCreateAudioguideText } from '../services/audioguideService';
import { speakInstruction, azureVoiceName } from '../services/ttsService';
import {
  getActivationMode,
  resolveTransportMode,
  radiiForTransport,
  isPlayed,
} from '../lib/guideSettings';
import { haversineMeters } from '../lib/geo';
import { getMapboxRoute, getRoadDistance, buildNavSpeechText } from '../lib/mapboxRouter';
import { audioQueueManager } from '../lib/AudioQueueManager';
import { useWakeLock } from './useWakeLock';
import { getApiUrl } from '../lib/api';
import type { GeofencePoi, GuideCharacter } from '../types/poi';

const DB_QUERY_INTERVAL_MS = 10_000;
const QUERY_RADIUS = 700;           // raggio DB query (> max alert 300m × 3 guard)

// Throttle Mapbox differenziato per modalità:
//  - Auto  60 km/h → 42m in 2.5s → refresh < 50m trigger ✓
//  - Piedi  5 km/h →  7m in 5s   → refresh < 25m trigger ✓
const MAPBOX_THROTTLE_CAR_MS  = 2_500;
const MAPBOX_THROTTLE_WALK_MS = 5_000;

// Cooldown tra istruzioni vocali di navigazione
const NAV_COOLDOWN_CAR_MS  = 18_000; // 18s in auto  (a 60km/h = ~300m percorsi)
const NAV_COOLDOWN_WALK_MS = 15_000; // 15s a piedi  (a 5km/h  = ~21m percorsi)
// Ritardo prima della PRIMA istruzione dopo l'avviso (lascia spazio al TTS di avviso)
const NAV_FIRST_DELAY_MS   = 6_000;  // 6s dopo l'avviso iniziale

export interface UseGeofencingOptions {
  enabled: boolean;
  userId: string | null;
  language: string;
  character: GuideCharacter;
}

// ─── Messaggi direzione (8 settori) ───────────────────────────────

type Direction = 'front' | 'front-right' | 'right' | 'behind-right' | 'behind' | 'behind-left' | 'left' | 'front-left';

function classifyDirection(relativeBearing: number): Direction {
  if (relativeBearing >= 337.5 || relativeBearing < 22.5)   return 'front';
  if (relativeBearing >= 22.5  && relativeBearing < 67.5)   return 'front-right';
  if (relativeBearing >= 67.5  && relativeBearing < 112.5)  return 'right';
  if (relativeBearing >= 112.5 && relativeBearing < 157.5)  return 'behind-right';
  if (relativeBearing >= 157.5 && relativeBearing < 202.5)  return 'behind';
  if (relativeBearing >= 202.5 && relativeBearing < 247.5)  return 'behind-left';
  if (relativeBearing >= 247.5 && relativeBearing < 292.5)  return 'left';
  return 'front-left';
}

function isBehind(dir: Direction): boolean {
  return dir === 'behind' || dir === 'behind-left' || dir === 'behind-right';
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => v * Math.PI / 180;
  const toDeg = (v: number) => v * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1), rLat2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getDirection(
  userLat: number, userLon: number,
  poiLat: number, poiLon: number,
  heading: number | null
): Direction | undefined {
  if (typeof heading !== 'number' || heading < 0) return undefined;
  const bearing = calculateBearing(userLat, userLon, poiLat, poiLon);
  return classifyDirection((bearing - heading + 360) % 360);
}

function directionLabel(dir: Direction, lang: string): string {
  const l = (lang || 'IT').toUpperCase();
  const dict: Record<string, Record<Direction, string>> = {
    IT: {
      'front': 'dritto davanti a te', 'front-right': 'davanti a te sulla destra', 'right': 'alla tua destra',
      'behind-right': 'dietro di te sulla destra', 'behind': 'dietro di te', 'behind-left': 'dietro di te sulla sinistra',
      'left': 'alla tua sinistra', 'front-left': 'davanti a te sulla sinistra'
    },
    EN: {
      'front': 'straight ahead', 'front-right': 'ahead on your right', 'right': 'on your right',
      'behind-right': 'behind you on your right', 'behind': 'behind you', 'behind-left': 'behind you on your left',
      'left': 'on your left', 'front-left': 'ahead on your left'
    },
    FR: {
      'front': 'droit devant vous', 'front-right': 'devant vous sur la droite', 'right': 'à votre droite',
      'behind-right': 'derrière vous sur la droite', 'behind': 'derrière vous', 'behind-left': 'derrière vous sur la gauche',
      'left': 'à votre gauche', 'front-left': 'devant vous sur la gauche'
    },
    ES: {
      'front': 'recto por delante', 'front-right': 'delante a su derecha', 'right': 'a su derecha',
      'behind-right': 'detrás a su derecha', 'behind': 'detrás de usted', 'behind-left': 'detrás a su izquierda',
      'left': 'a su izquierda', 'front-left': 'delante a su izquierda'
    },
    RU: {
      'front': 'прямо перед вами', 'front-right': 'впереди справа', 'right': 'справа от вас',
      'behind-right': 'позади справа', 'behind': 'позади вас', 'behind-left': 'позади слева',
      'left': 'слева от вас', 'front-left': 'впереди слева'
    },
    ZH: {
      'front': '正前方', 'front-right': '右前方', 'right': '在您右侧',
      'behind-right': '右后方', 'behind': '在您身后', 'behind-left': '左后方',
      'left': '在您左侧', 'front-left': '左前方'
    },
  };
  return (dict[l] || dict['EN'])[dir];
}

export function buildApproachMessage(
  name: string,
  distMeters: number,
  isCar: boolean,
  lang: string,
  dir?: Direction
): string {
  const l = (lang || 'IT').toUpperCase();
  const dirText = dir ? directionLabel(dir, lang) : '';
  const d = Math.round(distMeters / 10) * 10;

  let distText = '';
  let msg = '';

  const texts: Record<string, { far: string; near: string; veryNear: string; car: string; walk: string }> = {
    IT:  { far: `Tra circa ${d} metri`, near: 'Tra qualche metro', veryNear: 'Molto vicino a te',
           car:  dirText ? `{D}, {dir}, passerai vicino a ${name}` : `{D} passerai vicino a ${name}`,
           walk: dirText ? `{D}, {dir}, troverai ${name}` : `{D} arriverai a ${name}` },
    EN:  { far: `In about ${d} meters`, near: 'In a few meters', veryNear: 'Very close to you',
           car:  dirText ? `{D}, {dir}, you will pass near ${name}` : `{D} you will pass near ${name}`,
           walk: dirText ? `{D}, {dir}, you will find ${name}` : `{D} you will arrive at ${name}` },
    FR:  { far: `Dans environ ${d} mètres`, near: 'Dans quelques mètres', veryNear: 'Très proche de vous',
           car:  dirText ? `{D}, {dir}, vous passerez près de ${name}` : `{D} vous passerez près de ${name}`,
           walk: dirText ? `{D}, {dir}, vous trouverez ${name}` : `{D} vous arriverez à ${name}` },
    ES:  { far: `En unos ${d} metros`, near: 'En unos pocos metros', veryNear: 'Muy cerca de usted',
           car:  dirText ? `{D}, {dir}, pasará cerca de ${name}` : `{D} pasará cerca de ${name}`,
           walk: dirText ? `{D}, {dir}, encontrará ${name}` : `{D} llegará a ${name}` },
    RU:  { far: `Примерно через ${d} метров`, near: 'Через несколько метров', veryNear: 'Совсем рядом с вами',
           car:  dirText ? `{D}, {dir}, вы проедете мимо ${name}` : `{D} вы проедете мимо ${name}`,
           walk: dirText ? `{D}, {dir}, вы найдете ${name}` : `{D} вы прибудете к ${name}` },
    ZH:  { far: `大约 ${d} 米后`, near: '几米后', veryNear: '离您非常近',
           car:  dirText ? `{D}，{dir}，您将经过 ${name}` : `{D} 您将经过 ${name}`,
           walk: dirText ? `{D}，{dir}，您将看到 ${name}` : `{D} 您将到达 ${name}` },
  };

  const t = texts[l] || texts['EN'];
  distText = distMeters > 80 ? t.far : (distMeters > 30 ? t.near : t.veryNear);
  const template = isCar ? t.car : t.walk;
  msg = template.replace('{D}', distText).replace('{dir}', dirText);
  return msg;
}

function arrivalMessage(name: string, lang: string, dir?: Direction): string {
  const l = (lang || 'IT').toUpperCase();
  const dirText = dir ? directionLabel(dir, lang) : '';
  if (l === 'IT') return dirText ? `Sei arrivato. ${name} si trova ${dirText}` : `Sei arrivato a ${name}`;
  if (l === 'FR') return dirText ? `Vous êtes arrivé. ${name} est ${dirText}` : `Vous êtes arrivé à ${name}`;
  if (l === 'ES') return dirText ? `Ha llegado. ${name} está ${dirText}` : `Ha llegado a ${name}`;
  if (l === 'RU') return dirText ? `Вы прибыли. ${name} находится ${dirText}` : `Вы прибыли к ${name}`;
  if (l === 'ZH') return dirText ? `您已到达。${name} 位于 ${dirText}` : `您已到达 ${name}`;
  return dirText ? `You have arrived. ${name} is ${dirText}` : `You have arrived at ${name}`;
}

// ─── Blacklist nomi non-turistici ─────────────────────────────────

const BLACKLIST_KEYWORDS = [
  'farmacia', 'pharmacy', 'parafarmacia',
  'asl', 'serd', 'ser.d', 'ospedale', 'hospital', 'clinica', 'ambulatorio',
  'supermercato', 'supermarket', 'coop', 'conad', 'lidl', 'eurospin', 'carrefour', 'esselunga', 'penny',
  'tabacchi', 'tabaccheria', 'edicola',
  'benzina', 'distributore', 'stazione di servizio', 'gas station',
  'parcheggio', 'parking', 'autolavaggio',
  'banca', 'bank', 'bancomat', 'atm', 'poste italiane', 'ufficio postale',
  'scuola', 'school', 'liceo', 'istituto comprensivo', 'istituto tecnico',
  'caserma', 'questura', 'commissariato', 'vigili del fuoco',
  'comune di', 'municipio', 'anagrafe', 'tribunale',
  'centro commerciale', 'shopping center',
  'ferramenta', 'falegnameria', 'carrozzeria', 'officina',
  'veterinario', 'dentista', 'ottico', 'oculista',
  'palestra', 'gym', 'fitness',
  'autoscuola', 'lavanderia', 'agenzia', 'assicurazioni',
];

function isBlacklisted(name: string): boolean {
  const n = (name || '').toLowerCase();
  return BLACKLIST_KEYWORDS.some(kw => n.includes(kw));
}

// ─── Categorie ammesse ────────────────────────────────────────────

function isCategoryAllowed(poi: GeofencePoi, activeSubcats: Record<string, boolean>): boolean {
  const cat = poi.category as string;
  if (poi.premium || poi.is_gem || cat === 'gemme') return activeSubcats.gemme ?? true;
  if (['monument', 'artwork', 'monumenti', 'attraction'].includes(cat))  return activeSubcats.monumenti ?? true;
  // Il setup GeoControl ha un solo toggle "Monumenti & Castelli": castelli e
  // siti archeologici seguono `monumenti`. Le chiavi dedicate castelli/archeo
  // non esistono nella UI, quindi `?? true` li lasciava SEMPRE attivi anche
  // con la categoria deselezionata dall'utente.
  if (['castle', 'castelli'].includes(cat))                              return activeSubcats.castelli ?? activeSubcats.monumenti ?? true;
  if (['ruins', 'archaeological_site', 'archeo'].includes(cat))          return activeSubcats.archeo ?? activeSubcats.monumenti ?? true;
  if (['church', 'chiese', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale',
       'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
       'shrine', 'santuario'].includes(cat))                             return activeSubcats.chiese ?? true;
  // 'park' e 'gallery' sono nelle mappe native (CATEGORY_MAP Android /
  // PoiCategories.map iOS): senza di loro il nativo triggerava e il web no.
  if (['viewpoint', 'park', 'panorami'].includes(cat))                   return activeSubcats.panorami ?? true;
  if (['museum', 'gallery', 'musei'].includes(cat))                      return activeSubcats.musei ?? true;
  // Toggle "Consigli" del setup GeoControl (default OFF): allineato a
  // SupabaseClient.kt / PoiModels.swift che lo supportano già lato nativo.
  if (['information', 'tourism_information', 'office', 'consigli'].includes(cat))
    return activeSubcats.consigli ?? false;
  // WIP Community (Vision approvate): default OFF, si attiva dal setup o
  // dalla chip mappa. Stessa chiave nelle 3 mappe native.
  if (cat === 'community')
    return activeSubcats.community ?? false;
  return false; // categorie commerciali/utilitarie → mai audioguida
}

// ─── HOOK ─────────────────────────────────────────────────────────

export function useGeofencing(opts: UseGeofencingOptions): void {
  const { enabled, userId, language, character } = opts;

  useWakeLock(enabled);

  const candidatesRef   = useRef<GeofencePoi[]>([]);
  const lastQueryRef    = useRef(0);
  const optsRef         = useRef(opts);
  optsRef.current       = opts;

  // Timestamp ultima chiamata Mapbox per ogni POI (throttle 5s)
  const lastMapboxRef   = useRef<Record<string, number>>({});
  
  // Navigazione vocale: traccia per ogni POI quando e cosa è stato detto l'ultima volta
  const lastNavRef = useRef<Record<string, {
    spokenAt: number;    // timestamp ultima istruzione pronunciata
    lastText: string;    // testo dell'ultima istruzione (evita ripetizioni)
    alertAt: number;     // timestamp quando è scattato l'avviso iniziale
  }>>({});

  // Watchdog GPS: timestamp ultimo fix + flag "avviso già mostrato" (no spam)
  const lastFixRef   = useRef(Date.now());
  const gpsWarnedRef = useRef(false);

  // Ascolta evento STOP utente → avanza la coda
  useEffect(() => {
    const handleStop = () => audioQueueManager.userStoppedAudio();
    const handleSemiPlay = (e: Event) => {
      const poiId = (e as CustomEvent).detail?.poiId;
      if (poiId) audioQueueManager.userTriggeredPlay(poiId);
    };
    window.addEventListener('wip-audio-stopped', handleStop);
    window.addEventListener('wip-semi-play-audio', handleSemiPlay);
    return () => {
      window.removeEventListener('wip-audio-stopped', handleStop);
      window.removeEventListener('wip-semi-play-audio', handleSemiPlay);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // ── Watchdog GPS web: tour attivo ma nessun fix da >60s → avviso (una
    // volta sola); al fix successivo il flag si resetta con messaggio di
    // ripristino. Copre permessi revocati / GPS spento a guida in corso.
    lastFixRef.current   = Date.now();
    gpsWarnedRef.current = false;
    const gpsWatchdog = window.setInterval(() => {
      if (!locationService.getIsTourActive()) return;
      if (!gpsWarnedRef.current && Date.now() - lastFixRef.current > 60_000) {
        gpsWarnedRef.current = true;
        window.dispatchEvent(new CustomEvent('audioguide-status', {
          detail: 'GPS perso: controlla i permessi di localizzazione'
        }));
      }
    }, 15_000);

    const unsubscribe = locationService.subscribe((loc) => {
      if (!locationService.getIsTourActive()) return;

      // Watchdog GPS: fix ricevuto → ripristino
      lastFixRef.current = Date.now();
      if (gpsWarnedRef.current) {
        gpsWarnedRef.current = false;
        window.dispatchEvent(new CustomEvent('audioguide-status', {
          detail: 'Segnale GPS ripristinato.'
        }));
      }

      const { language: lang, character: char } = optsRef.current;
      const here = { lat: loc.latitude, lon: loc.longitude };
      const now  = loc.timestamp || Date.now();

      // ── Sync lingua/personaggio nel gestore coda ──
      audioQueueManager.currentLanguage  = lang;
      audioQueueManager.currentCharacter = char;

      // ── Refresh periodico POI dal DB ──
      if (now - lastQueryRef.current > DB_QUERY_INTERVAL_MS) {
        lastQueryRef.current = now;
        (async () => {
          try {
            const indexed = await isAreaIndexed(here.lat, here.lon);
            if (!indexed) {
              console.log('[Geofencing] Area non indicizzata, avvio Overpass...');
              // Leggi categorie attive dal geocontrol
              let activeCategories: string[] = [];
              try {
                const stored = localStorage.getItem('wip_active_subcategories');
                if (stored) {
                  const parsed = JSON.parse(stored);
                  activeCategories = Object.keys(parsed).filter(k => parsed[k]);
                }
              } catch { /* ignora errori di parsing */ }
              
              const result = await runOverpassDiscovery(here.lat, here.lon, QUERY_RADIUS, activeCategories);
              const poisFromDb = await getGeofencePois(here.lat, here.lon, optsRef.current.userId, QUERY_RADIUS);
              
              // Risoluzione race condition: iniettiamo subito i nuovi POI in memoria
              if (result.freshPois && result.freshPois.length > 0) {
                 const freshMapped = result.freshPois.map(p => ({
                    id: p.osm_id.includes('-') ? p.osm_id : `osm-${p.osm_id}`,
                    name: p.name,
                    lat: p.lat,
                    lon: p.lon,
                    category: p.category,
                    status: 'auto'
                 }));
                 const dbSet = new Set(poisFromDb.map(p => p.id));
                 for (const p of freshMapped) {
                   if (!dbSet.has(p.id)) poisFromDb.push(p as any);
                 }
              }
              candidatesRef.current = poisFromDb;
            } else {
              candidatesRef.current = await getGeofencePois(here.lat, here.lon, optsRef.current.userId, QUERY_RADIUS);
            }
          } catch (e) {
            console.warn('[Geofencing] Errore refresh POI:', e);
          }
        })();
      }

      const isCar    = resolveTransportMode(loc.speed) === 'car';

      // Leggi filtri categorie attivi
      const storedTree   = localStorage.getItem('wip_active_subcategories');
      // Fallback = default del setup GeoControl. Il vecchio `{ gemme: true }`,
      // con la semantica `?? true`, abilitava TUTTE le categorie (panorami e
      // consigli inclusi) finché l'utente non apriva il setup almeno una volta.
      const activeSubcats = storedTree
        ? JSON.parse(storedTree)
        : { monumenti: true, musei: true, chiese: true, panorami: false, consigli: false };

      for (const poi of candidatesRef.current) {
        // Filtri
        if (!isCategoryAllowed(poi, activeSubcats)) continue;
        if (isBlacklisted(poi.name)) continue;
        // Anti-ripetizione: POI già ascoltato (wip_played_pois) → non
        // ritriggera finché l'utente non usa "Azzera Storico" nel setup.
        if (isPlayed(poi.id)) { audioQueueManager.dequeue(poi.id); continue; }

        // PERIMETRO + INGRESSO REALE: se il POI è stato processato col footprint
        // OSM (entrance valorizzato), centra il trigger sull'INGRESSO (non sul
        // centro dell'edificio) e usa i raggi calibrati sul perimetro. Altrimenti
        // comportamento identico a oggi (centroide + raggi di modalità).
        const eLat = (poi as any).entrance_lat;
        const eLon = (poi as any).entrance_lon;
        const hasEntrance = typeof eLat === 'number' && typeof eLon === 'number';
        const targetLat = hasEntrance ? eLat : poi.lat;
        const targetLon = hasEntrance ? eLon : poi.lon;

        const radii = radiiForTransport(isCar ? 'car' : 'walk', poi.category, {
          geofenceRadius: (poi as any).geofence_radius,
          alertRadius: (poi as any).alert_radius,
          hasEntrance,
        });
        const { alert: alertRadius, trigger: triggerRadius } = radii;

        // Pre-filtro rapido con Haversine (evita chiamate Mapbox inutili)
        const haversineDist = haversineMeters(here.lat, here.lon, targetLat, targetLon);
        if (haversineDist > alertRadius * 2) {
          // Troppo lontano → dequeue se era in coda
          audioQueueManager.dequeue(poi.id);
          continue;
        }

        // ── Throttle Mapbox per modalità ──
        const throttleMs = isCar ? MAPBOX_THROTTLE_CAR_MS : MAPBOX_THROTTLE_WALK_MS;
        const lastMapbox = lastMapboxRef.current[poi.id] || 0;
        if (now - lastMapbox < throttleMs) continue;
        lastMapboxRef.current[poi.id] = now;

        ;(async () => {
          try {
            // ── DISTANZA STRADALE obbligatoria ──
            // Mapbox calcola il percorso reale considerando:
            //   - driving : strade, sensi unici, semafori, edifici
            //   - walking : marciapiedi, pedonali, ZTL, ponti
            // L'Haversine è passato come guard (3× alertRadius):
            // se la linea d'aria è > 3×alertRadius non chiama Mapbox affatto.
            const { roadDist, fromMapbox } = await getRoadDistance(
              { lat: here.lat, lon: here.lon },
              { lat: targetLat, lon: targetLon },
              isCar ? 'driving' : 'walking',
              lang,
              haversineDist,
              alertRadius               // guard = alertRadius×3 calcolato internamente
            );

            console.debug(
              `[Geofencing] ${poi.name}: ${ fromMapbox ? 'Mapbox' : 'Haversine×1.3(fallback)' }` +
              ` → ${Math.round(roadDist)}m | alert ${alertRadius}m | trigger ${triggerRadius}m` +
              ` | mode ${isCar ? '🚗' : '🚶'}`
            );

            // Informa il gestore della coda con la distanza STRADALE
            audioQueueManager.update(poi, roadDist, isCar, alertRadius, triggerRadius);

            // ── NAVIGAZIONE VOCALE TURN-BY-TURN ──
            // Attiva solo nella zona alert (dopo avviso, prima della scheda)
            const queueItem = audioQueueManager.getQueue().find(q => q.poi.id === poi.id);
            const isInAlertZone = queueItem?.state === 'alert_fired';

            if (isInAlertZone) {
              const navEntry = lastNavRef.current[poi.id];
              if (navEntry) {
                const timeSinceAlert  = now - navEntry.alertAt;
                const timeSinceSpoken = now - navEntry.spokenAt;
                const cooldown = isCar ? NAV_COOLDOWN_CAR_MS : NAV_COOLDOWN_WALK_MS;

                // Prima istruzione: dopo 6s dall'avviso (TTS avviso deve finire)
                // Istruzioni successive: ogni cooldown ms
                // Istruzioni di navigazione Mapbox se l'utente è nella zona alert
                const canSpeak = navEntry.spokenAt === 0
                  ? timeSinceAlert >= NAV_FIRST_DELAY_MS
                  : timeSinceSpoken >= cooldown;

                if (canSpeak) {
                  const route = await getMapboxRoute(
                    { lat: here.lat, lon: here.lon },
                    { lat: poi.lat,  lon: poi.lon  },
                    isCar ? 'driving' : 'walking',
                    lang
                  );

                  if (route) {
                    // Se l'utente è molto vicino ma non entra nel trigger, sii più insistente
                    const distToTrigger = roadDist - triggerRadius;
                    let navText = buildNavSpeechText(route, lang);

                    if (distToTrigger < 30 && distToTrigger > 0) {
                        navText = lang.startsWith('IT')
                          ? `Sei quasi arrivato a ${poi.name}, è a pochi passi da te.`
                          : `You're almost at ${poi.name}, just a few steps away.`;
                    }

                    if (navText && navText !== navEntry.lastText) {
                      lastNavRef.current[poi.id] = { ...navEntry, spokenAt: now, lastText: navText };
                      speakInstruction(navText, lang);
                      // Invia l'istruzione anche al banner visivo
                      window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text: navText } }));
                    }
                  }
                }
              }
            }

          } catch (e) {
            console.warn('[Geofencing] Errore Mapbox per POI', poi.name, e);
          }
        })();
      }
    });

    // ── wip-speak-approach: avviso iniziale con direzione ──
    const handleSpeakApproach = (e: Event) => {
      const { poi, distance, isCar: car } = (e as CustomEvent).detail;
      const { language: lang } = optsRef.current;
      const loc = locationService.getLastLocation();

      // Calcola la direzione relativa (davanti, dietro, destra, sinistra)
      let direction = '';
      if (loc && loc.heading !== null) {
        const bearing = calculateBearing(loc.latitude, loc.longitude, poi.lat, poi.lon);
        const relativeBearing = (bearing - loc.heading + 360) % 360;
        const dir = classifyDirection(relativeBearing);
        direction = directionLabel(dir, lang);
      }

      // Messaggio: "Tra 300 metri, alla tua destra, passerai vicino a..."
      const msg = buildApproachMessage(poi.name, distance, car, lang, direction as any);
      locationService.playAudio(msg, poi.name).catch(() => {});

      // Inizializza il tracking della navigazione per questo POI.
      // spokenAt=0 indica che la PRIMA istruzione non è ancora stata pronunciata.
      // La prima istruzione scatterà 6s dopo l'avviso (NAV_FIRST_DELAY_MS).
      lastNavRef.current[poi.id] = {
        alertAt:   Date.now(),
        spokenAt:  0,
        lastText:  '',
      };

      // Pre-carica il testo e l'audio audioguida in background (Cache Warm-up)
      const { character: char } = optsRef.current;
      getOrCreateAudioguideText(
        { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon, category: poi.category },
        lang,
        char
      ).then(text => {
         if (text) {
            // Chiamata silenziosa al TTS per mettere in cache il file audio.
            // La voce DEVE essere la stessa che userà la riproduzione reale:
            // era hardcoded in italiano, quindi per un utente EN/FR/DE la
            // chiave di cache non combaciava e si pagava la sintesi due volte.
            const voice = azureVoiceName(lang, char);
            fetch(getApiUrl('/api/tts/smart'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice, preloadOnly: true })
            }).catch(() => {});
         }
      }).catch(() => {});
    };

    // ── wip-poi-trigger: la scheda si apre → messaggio di arrivo, stop nav ──
    const handleTrigger = (e: Event) => {
      const { poi } = (e as CustomEvent).detail;
      const { language: lang } = optsRef.current;

      // Annulla le istruzioni nav per questo POI (scheda è già aperta)
      if (lastNavRef.current[poi.id]) {
        delete lastNavRef.current[poi.id];
      }

      const arrMsg = arrivalMessage(poi.name, lang);
      speakInstruction(arrMsg, lang);
    };

    // ── wip-poi-exit: pulizia tracking nav ──
    const handleExit = (e: Event) => {
      const poiId = (e as CustomEvent).detail?.poiId;
      if (poiId && lastNavRef.current[poiId]) {
        delete lastNavRef.current[poiId];
      }
    };

    window.addEventListener('wip-speak-approach', handleSpeakApproach);
    window.addEventListener('wip-poi-trigger', handleTrigger);
    window.addEventListener('wip-poi-exit', handleExit);

    return () => {
      unsubscribe();
      window.clearInterval(gpsWatchdog);
      window.removeEventListener('wip-speak-approach', handleSpeakApproach);
      window.removeEventListener('wip-poi-trigger', handleTrigger);
      window.removeEventListener('wip-poi-exit', handleExit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
