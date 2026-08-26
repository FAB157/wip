// =====================================================================
// ITAINTA · Trigger web autonomi in FOREGROUND (PWA/browser)
//
// Fuori dalla navigazione WIP Nav il geofencing web era morto: la PWA in
// foreground non faceva mai scattare un'audioguida per prossimità. Questo
// modulo colma il buco SOLO su web: ascolta 'wip-location-update' (emesso
// da locationService a ogni fix) e, quando l'utente entra nel raggio di un
// POI avvicinandosi, dispatcha lo STESSO CustomEvent 'wip-poi-trigger' già
// gestito da App.tsx/PoiDetailSheet (pagamenti, silenziosa, banner: tutto
// a valle resta invariato).
//
// GUARDIE (chi NON deve girare qui):
// - piattaforma nativa: Android/iOS hanno il service in background con la
//   stessa logica → il modulo è un no-op (mai doppi trigger);
// - audioguida spenta: si valuta locationService.getIsTourActive() a ogni
//   fix (stesso flag di syncSettings/GeofenceAudioGuide);
// - feature flag 'web_foreground_triggers' (fail-open): spegnibile dal
//   pannello admin senza deploy.
//
// CANDIDATI: nessuna chiamata rete propria in condizioni normali — si
// riusa la lista che locationService già scarica ogni 15 s a tour attivo
// (evento 'pois-updated', get_geofence_pois filtrata per categorie).
// Fallback (es. replay GPS, dove quel fetch non parte): refresh diretto
// dal repository al massimo ogni 60 s o 300 m.
//
// COSTANTI SPECULARI: la simulazione server-side del canarino notturno
// (server.ts, regione canary, simulateGeofenceTriggers) replica questa
// stessa matematica — se cambi una costante qui, cambiala anche lì.
// - accuracy > 50 m → fix scartato
// - avvicinamento richiesto (distanza in diminuzione tra due fix)
// - hasPassed: 40 METRI oltre il punto di massimo avvicinamento (CPA),
//   MAI soglie in secondi (memoria di progetto trigger pedonali)
// - raggio di ingresso: eff_geofence_radius del POI, altrimenti default
//   per categoria (50 m base)
// - cooldown per-POI 24 h (localStorage 'wip_web_trigger_history' +
//   wip_played_pois con timestamp), come il nativo
// - throttle globale: max 1 trigger ogni 90 s
// - arbitraggio: il più vicino vince, con bonus gemme/premium
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { isFeatureEnabled } from '../featureFlags';
import { reportTrigger } from './telemetry';
import { caricaPerimetri, distanzaDalPerimetro } from './footprints';
import { locationService } from '../../services/locationService';
import { tourService } from '../../services/tourService';
import { radiiForTransport, resolveTransportMode, isPlayed, isCategoryAllowed, PLAYED_COOLDOWN_MS, type TransportMode } from '../guideSettings';
import { puntoArrivo } from '../puntoArrivo';
import { getRoadIndex, refreshRoadTile, shouldRefreshRoads } from '../roadSnap';

// ── Costanti (SPECULARI al canary server) ─────────────────────────
const ACCURACY_MAX_M = 50;          // fix con accuracy peggiore → scartato
const HAS_PASSED_M = 40;            // metri oltre il CPA = POI superato
// In auto 40 m sono un secondo e mezzo: fra un fix e l'altro il POI risulta
// "superato" prima ancora di essere stato valutato (22/08/2026).
const HAS_PASSED_CAR_M = 150;
const DEFAULT_TRIGGER_RADIUS_M = 50;
// A quanti metri DAL BORDO del perimetro parte la guida, quando il POI ha il
// poligono (decisione del 22/08/2026: "a 30 metri dal perimetro, non quando
// si e' dentro"). In auto 30 m sono un secondo a 50 km/h: la frase inizierebbe
// a POI gia' superato, quindi 100 m. Stessi valori in Footprints.kt e
// PoiFootprints.swift.
const PERIMETER_TRIGGER_WALK_M = 30;
const PERIMETER_TRIGGER_CAR_M = 100;
const GLOBAL_THROTTLE_MS = 90_000;  // max 1 trigger ogni 90 s
// 24 h per-POI, come il servizio nativo (era 6 h: lo stesso POI poteva
// riparlare nel pomeriggio di chi l'aveva sentito al mattino).
const POI_COOLDOWN_MS = PLAYED_COOLDOWN_MS;
const APPROACH_EPSILON_M = 0.5;     // isteresi minima per "in diminuzione"
const GEM_BONUS_M = 30;             // arbitraggio: le gemme "valgono" 30 m
const PREMIUM_BONUS_M = 20;

// Raggi di ingresso di default per categoria quando il POI non porta
// eff_geofence_radius (allineati ai fallback di poiRepository/nativo).
const CATEGORY_RADIUS_M: Record<string, number> = {
  musei: 40, museum: 40, gallery: 40,
  panorami: 80, viewpoint: 80, park: 80,
  gemme: 60,
};

// ── Fallback refresh candidati (mai aggressivo) ───────────────────
const CANDIDATE_STALE_MS = 60_000;      // lista più vecchia di così → refresh
const OWN_FETCH_MIN_INTERVAL_MS = 60_000;
const OWN_FETCH_MIN_MOVE_M = 300;
const CANDIDATE_RADIUS_M = 1000;

const HISTORY_KEY = 'wip_web_trigger_history';
const MAX_HISTORY_ENTRIES = 300;

interface PoiApproachState {
  minDist: number;   // CPA finora (metri)
  prevDist: number;  // distanza al fix precedente
  passed: boolean;   // superato: oltre HAS_PASSED_M dal CPA
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Il raggio di trigger: quello del GeoControl per il modo di trasporto
 * (a piedi / in auto, con gli slider dell'utente), allargato dal perimetro
 * reale dell'edificio quando c'e', dal raggio effettivo del POI e dal bonus
 * gemme. Fino al 22/08/2026 qui c'erano 50 m fissi per tutti (40 musei, 80
 * panorami): gli slider del setup e il modo auto non esistevano sul web, e a
 * 90 km/h un cerchio di 50 m si salta intero fra due fix.
 */
function triggerRadiusFor(poi: any, modo: TransportMode): number {
  const footprint = {
    geofenceRadius: Number(poi?.eff_geofence_radius) || Number(poi?.geofence_radius) || null,
    alertRadius: Number(poi?.eff_alert_radius) || Number(poi?.alert_radius) || null,
    hasEntrance: !!(Number(poi?.entrance_lat) && Number(poi?.entrance_lon)),
  };
  let r = radiiForTransport(modo, poi?.category, footprint).trigger;
  const eff = Number(poi?.eff_geofence_radius);
  if (Number.isFinite(eff) && eff > 0) r = Math.max(r, eff);
  const cat = String(poi?.category || '').toLowerCase();
  if (CATEGORY_RADIUS_M[cat]) r = Math.max(r, CATEGORY_RADIUS_M[cat]);
  if (poi?.is_gem) r = Math.max(r, CATEGORY_RADIUS_M.gemme);
  return Math.max(r, DEFAULT_TRIGGER_RADIUS_M * 0.5);
}

// ── Cooldown per-POI persistente (condiviso tra sessioni PWA) ─────
function readHistory(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeHistory(h: Record<string, number>): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* storage pieno/bloccato */ }
}

/** Pruning: via le voci più vecchie del cooldown, cap sul numero totale. */
function pruneHistory(h: Record<string, number>): Record<string, number> {
  const now = Date.now();
  let entries = Object.entries(h).filter(([, ts]) => Number.isFinite(ts) && now - ts < POI_COOLDOWN_MS);
  if (entries.length > MAX_HISTORY_ENTRIES) {
    entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_HISTORY_ENTRIES);
  }
  return Object.fromEntries(entries);
}

function isInCooldown(poiId: string): boolean {
  // Due registri, stessa finestra: lo storico dei trigger scattati e
  // wip_played_pois (ascolti veri, con timestamp). Basta uno dei due.
  if (isPlayed(poiId, POI_COOLDOWN_MS)) return true;
  const ts = readHistory()[poiId];
  return Number.isFinite(ts) && Date.now() - ts < POI_COOLDOWN_MS;
}

/** Il POI passerebbe il trigger adesso? (categoria, cooldown, gia' ascoltato) */
export function passerebbeIlTrigger(poi: any): boolean {
  try {
    const id = String(poi?.id ?? '');
    if (!id) return false;
    if (poi?.audio_enabled === false) return false;
    if (isInCooldown(id)) return false;
    const lastTrig = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
    if (String(lastTrig.id) === id && Date.now() - lastTrig.ts < 60_000) return false;
    let activeSubcats: Record<string, boolean> = {};
    try { activeSubcats = JSON.parse(localStorage.getItem('wip_active_subcategories') || '{}') || {}; } catch { /* default */ }
    return isCategoryAllowed(poi, activeSubcats);
  } catch { return false; }
}

function markFired(poiId: string): void {
  const h = pruneHistory(readHistory());
  h[poiId] = Date.now();
  writeHistory(h);
}

// ── Stato del modulo ──────────────────────────────────────────────
let started = false;
let candidates: any[] = [];
let candidatesAt = 0;                 // ultimo aggiornamento lista (pois-updated o fetch proprio)
let lastOwnFetch: { ts: number; lat: number; lon: number } | null = null;
let ownFetchInFlight = false;
let lastGlobalFireTs = 0;
const approachStates = new Map<string, PoiApproachState>();
// Parsimonia telemetria: 'suppressed' al massimo una volta per POI a sessione.
const suppressedReported = new Set<string>();

const onPoisUpdated = (e: Event) => {
  const pois = (e as CustomEvent).detail;
  if (!Array.isArray(pois)) return;
  candidates = pois;
  candidatesAt = Date.now();
};

/**
 * Fallback: se 'pois-updated' non arriva (es. replay GPS, dove il fetch di
 * locationService non parte), si ricarica dal repository — mai più spesso
 * di 60 s né sotto i 300 m di spostamento.
 */
async function maybeRefreshCandidates(lat: number, lon: number): Promise<void> {
  const now = Date.now();
  if (now - candidatesAt < CANDIDATE_STALE_MS) return;
  if (ownFetchInFlight) return;
  if (lastOwnFetch) {
    const moved = haversineMeters(lat, lon, lastOwnFetch.lat, lastOwnFetch.lon);
    if (now - lastOwnFetch.ts < OWN_FETCH_MIN_INTERVAL_MS && moved < OWN_FETCH_MIN_MOVE_M) return;
  }
  ownFetchInFlight = true;
  lastOwnFetch = { ts: now, lat, lon };
  try {
    const { getGeofencePois } = await import('../../services/poiRepository');
    let userId: string | null = null;
    try {
      const { supabase } = await import('../supabase');
      const { data } = await supabase.auth.getSession();
      userId = data?.session?.user?.id || null;
    } catch { /* anonimo: raggi di default */ }
    let pois = await getGeofencePois(lat, lon, userId, CANDIDATE_RADIUS_M);
    // Stesso filtro categorie del fetch di locationService (setup GeoControl)
    let activeSubcats: Record<string, boolean> = {};
    try { activeSubcats = JSON.parse(localStorage.getItem('wip_active_subcategories') || '{}') || {}; } catch { /* default */ }
    pois = pois.filter((p: any) => isCategoryAllowed(p, activeSubcats));
    candidates = pois;
    candidatesAt = Date.now();
  } catch { /* offline/circuit breaker: si riprova al prossimo giro utile */ }
  finally { ownFetchInFlight = false; }
}

/** Valutazione di un fix GPS: aggiorna gli stati di avvicinamento e decide. */
function onLocationUpdate(e: Event): void {
  try {
    const d = (e as CustomEvent).detail || {};
    let lat = Number(d.lat);
    let lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // Kill switch admin (fail-open) e audioguida attiva (stesso flag che
    // GeofenceAudioGuide sincronizza in locationService via syncSettings).
    if (!isFeatureEnabled('web_foreground_triggers')) return;
    if (!locationService.getIsTourActive()) return;
    // Dieci Tappe: durante un giro l'audio lo governa lib/tour/giroDriver
    // (guida piena alle tappe, teaser agli incontri). Se questo modulo
    // continuasse a scattare, la stessa tappa parlerebbe due volte.
    if (tourService.inCorso()) return;

    void maybeRefreshCandidates(lat, lon);

    // Filtro accuracy: un fix scadente non deve né triggerare né inquinare
    // gli stati di avvicinamento (CPA falsati da salti di 100 m).
    const accuracy = Number(d.accuracy);
    if (Number.isFinite(accuracy) && accuracy > ACCURACY_MAX_M) return;

    if (candidates.length === 0) return;

    // Il modo di trasporto decide raggi e soglia di "superato": lo stesso
    // criterio del servizio nativo (preferenza dell'utente, altrimenti la
    // velocita' del fix).
    const speed = Number(d.speed);
    const modo = resolveTransportMode(Number.isFinite(speed) ? speed : null);
    const passatoM = modo === 'car' ? HAS_PASSED_CAR_M : HAS_PASSED_M;

    // SNAP SULLA STRADA, come il servizio nativo (ItaintaBackgroundPoiService
    // .kt:448-453 e BackgroundPoiManager.swift:311-312). roadSnap.ts esisteva
    // dal giorno uno ma nessuno lo importava: il web valutava i geofence col
    // GPS grezzo, che fra i palazzi rimbalza di 20-30 m e fa scattare (o
    // "superare") un POI dal marciapiede sbagliato. Conservativo: senza una
    // strada entro max(accuratezza, 20 m), cap 40 m, si resta al GPS grezzo
    // (sei in una piazza, in un parco). La tile si scarica ogni 400 m e senza
    // rete si lavora come prima. Il fix grezzo resta nel dettaglio dell'evento
    // per chi lo volesse (radar, diagnostica).
    if (shouldRefreshRoads(lat, lon)) void refreshRoadTile(lat, lon);
    const snappato = getRoadIndex()?.snap(lat, lon, Number.isFinite(accuracy) ? accuracy : 20, modo === 'car' ? 'car' : 'walk');
    if (snappato) { lat = snappato.lat; lon = snappato.lon; }

    interface Eligible { poi: any; id: string; dist: number }
    const eligible: Eligible[] = [];
    const seenNear = new Set<string>();

    // Perimetri: si chiedono per i POI vicini, una volta sola (il modulo
    // ricorda anche chi NON ce l'ha). Non si aspetta la risposta — al fix
    // successivo saranno pronti, e nel frattempo si lavora a raggi.
    const vicini = candidates
      .filter((p: any) => p?.id && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
        && haversineMeters(lat, lon, Number(p.lat), Number(p.lon)) < 600)
      .map((p: any) => String(p.id));
    if (vicini.length) void caricaPerimetri(vicini);

    for (const poi of candidates) {
      const pLat = Number(poi?.lat);
      const pLon = Number(poi?.lon);
      if (!poi?.id || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
      if (poi.audio_enabled === false) continue;
      const id = String(poi.id);
      // Gia' ascoltato (wip_played_pois): il commento in locationService lo
      // prometteva da sempre, ma qui nessuno lo leggeva. "Azzera storico" nel
      // setup riapre tutto.
      if (isPlayed(id)) { approachStates.delete(id); continue; }
      // La distanza dall'INGRESSO quando lo conosciamo (276.000 POI dal
      // 21/08), non dal centroide: su un edificio grande il trigger scattava
      // dal lato sbagliato e il radar mostrava un'altra distanza.
      const arrivo = puntoArrivo(poi);
      const dist = haversineMeters(lat, lon, arrivo.lat, arrivo.lon);
      const radius = triggerRadiusFor(poi, modo);

      // A 30 METRI DAL PERIMETRO (22/08/2026): quando il POI ha il poligono,
      // la misura che conta e' la distanza dal MURO — 0 dentro — e non il
      // cerchio attorno all'ingresso, che per un parco o una cinta muraria
      // puo' stare dall'altra parte. Calcolata prima della potatura: un
      // perimetro grande si estende ben oltre radius*4+200 dal centroide e
      // senza questo lo stato verrebbe buttato mentre ci si cammina accanto.
      // Costa quattro confronti quando il perimetro non c'e' o e' lontano.
      const distPerimetro = distanzaDalPerimetro(id, lat, lon);
      const alPerimetro = distPerimetro <= (modo === 'car' ? PERIMETER_TRIGGER_CAR_M : PERIMETER_TRIGGER_WALK_M);
      const inside = distPerimetro === 0;

      // Stati solo per i POI in zona (mappa piccola, pruning sotto)
      if (!alPerimetro && dist > radius * 4 + 200) { approachStates.delete(id); continue; }
      seenNear.add(id);

      const st = approachStates.get(id);
      if (!st) {
        // Primo avvistamento: si registra, si triggera dal fix successivo
        // (serve l'evidenza dell'avvicinamento).
        approachStates.set(id, { minDist: dist, prevDist: dist, passed: false });
        continue;
      }

      const approaching = dist < st.prevDist - APPROACH_EPSILON_M;
      // hasPassed in METRI oltre il CPA (mai secondi): superato = niente
      // trigger tardivo alle spalle dell'utente.
      if (dist > st.minDist + passatoM) st.passed = true;
      if (dist < st.minDist) st.minDist = dist;

      // A 30 M DAL PERIMETRO (o dentro) batte tutto il resto.
      //
      // Le due condizioni che valgono per il cerchio — "ti stai avvicinando"
      // e "non l'hai gia' superato" — sono misurate sull'ingresso, e accanto
      // a un edificio grande sono sbagliate: camminando lungo la facciata di
      // una basilica di 120 metri ci si allontana dall'ingresso per meta' del
      // percorso, e il codice a raggi lo leggerebbe come "sta andando via".
      // Se sei a 30 m dal muro, ci sei: il cooldown di 24 ore basta a evitare
      // che parli due volte. Il cerchio resta per i POI senza perimetro.
      if (alPerimetro || (dist <= radius && approaching && !st.passed)) {
        if (alPerimetro) st.passed = false;
        eligible.push({ poi, id, dist: inside ? 0 : Math.min(dist, distPerimetro) });
      }
      st.prevDist = dist;
    }

    if (eligible.length === 0) return;

    const now = Date.now();

    // Cooldown per-POI (6 h, persistente) e dedupe recente condiviso
    // (__wipLastPoiTrigger, stesso meccanismo di WIP Nav e deep link).
    const lastTrig = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
    const ready = eligible.filter(c => {
      if (isInCooldown(c.id) || (String(lastTrig.id) === c.id && now - lastTrig.ts < 60_000)) {
        if (!suppressedReported.has(c.id)) {
          suppressedReported.add(c.id);
          reportTrigger('suppressed', { poiId: c.id, accuracy });
        }
        return false;
      }
      return true;
    });
    if (ready.length === 0) return;

    // Throttle globale: mai più di un trigger ogni 90 s (i candidati restano
    // eleggibili ai fix successivi finché non superano il POI).
    if (now - lastGlobalFireTs < GLOBAL_THROTTLE_MS) {
      const c = ready[0];
      if (!suppressedReported.has(`global:${c.id}`)) {
        suppressedReported.add(`global:${c.id}`);
        reportTrigger('suppressed', { poiId: c.id, accuracy });
      }
      return;
    }

    // Arbitraggio: vince il più vicino, con bonus d'importanza gemme/premium.
    ready.sort((a, b) => {
      const score = (c: Eligible) =>
        c.dist - (c.poi.is_gem ? GEM_BONUS_M : 0) - (c.poi.premium ? PREMIUM_BONUS_M : 0);
      return score(a) - score(b);
    });
    const winner = ready[0];

    lastGlobalFireTs = now;
    markFired(winner.id);
    const st = approachStates.get(winner.id);
    if (st) st.passed = true; // già servito: niente ri-valutazioni nello stesso passaggio

    const activationMode = localStorage.getItem('wip_activation_mode') || 'automatic';
    const isAutomatic = activationMode !== 'semi-automatic';

    // Stesso payload dei dispatcher esistenti (WIP Nav / nativo), con ts
    // anti-stantio come gli eventi nativi. La modalità silenziosa la applica
    // il consumer (locationService/PoiDetailSheet), non qui.
    (window as any).__wipLastPoiTrigger = { id: winner.id, ts: now };
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
      detail: {
        poiId: winner.id,
        poi: { ...winner.poi, name: winner.poi.name || winner.poi.nome },
        alreadyPaid: false,
        autoPlay: isAutomatic,
        ts: now,
        fromForegroundWeb: true,
      },
    }));
    reportTrigger('fired', { poiId: winner.id, accuracy });
    console.log(`[ForegroundTriggers] 🎯 Trigger web: ${winner.poi.name || winner.id} a ${Math.round(winner.dist)} m`);

    // Pruning stati: via i POI non più tra i candidati vicini
    for (const key of Array.from(approachStates.keys())) {
      if (!seenNear.has(key)) approachStates.delete(key);
    }
  } catch { /* un fix rotto non deve mai rompere il flusso posizioni */ }
}

const boundOnLocationUpdate = (e: Event) => onLocationUpdate(e);

/**
 * Avvia i trigger web foreground. Idempotente; no-op su piattaforma nativa
 * (lì c'è il service in background: mai doppi trigger).
 */
export function startForegroundTriggers(): void {
  if (started || typeof window === 'undefined') return;
  try { if (Capacitor.isNativePlatform()) return; } catch { /* web puro */ }
  started = true;
  window.addEventListener('pois-updated', onPoisUpdated);
  window.addEventListener('wip-location-update', boundOnLocationUpdate);
  console.log('[ForegroundTriggers] ✅ Trigger web foreground attivi (PWA/browser)');
}

/**
 * Un altro modulo (WIP Nav) ha fatto scattare questo POI: entra nel cooldown
 * di 24 h come se l'avessimo fatto noi, altrimenti dopo i 60 s del dedupe
 * condiviso lo rifaremmo parlare.
 */
export function segnaScattato(poiId: string): void {
  try { markFired(String(poiId)); } catch { /* storage non disponibile */ }
}

/** Ferma i trigger e ripulisce TUTTO lo stato, non solo gli avvicinamenti. */
export function stopForegroundTriggers(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('pois-updated', onPoisUpdated);
  window.removeEventListener('wip-location-update', boundOnLocationUpdate);
  approachStates.clear();
  candidates = [];
  candidatesAt = 0;
  // Prima restavano: il throttle globale (un giro spento e riacceso partiva
  // gia' "in attesa"), la telemetria dei soppressi e il fetch proprio.
  lastGlobalFireTs = 0;
  suppressedReported.clear();
  lastOwnFetch = null;
  ownFetchInFlight = false;
}

/** Stato per diagnostica/test. */
export function isForegroundTriggersActive(): boolean {
  return started;
}
