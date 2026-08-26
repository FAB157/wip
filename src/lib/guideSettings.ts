// =====================================================================
// ITAINTA · Impostazioni guida/geofencing persistite in localStorage
// - distanze trigger per modalita' A PIEDI / IN AUTO (con slider UI)
// - modalita' attivazione (automatica / semi-automatica)
// - personaggio guida (nicky / dante)
// - anti-ripetizione: set dei POI gia' riprodotti (NON si resetta da solo)
// =====================================================================

import type { GuideCharacter } from '../types/poi';

export type ActivationMode = 'automatic' | 'semi-automatic';
export type TransportMode = 'walk' | 'car';
export type TransportPreference = 'auto' | 'walk' | 'car';

const KEYS = {
  walkAlert: 'wip_walk_alert',
  walkTrigger: 'wip_walk_trigger',
  carAlert: 'wip_car_alert',
  carTrigger: 'wip_car_trigger',
  mode: 'wip_activation_mode',
  character: 'wip_guide_character',
  transport: 'wip_transport_pref',
  played: 'wip_played_pois',
} as const;

/** Default e range per gli slider (spec sezione 6). */
export const DISTANCE_CONFIG = {
  // Spec confermata: alert 150m a piedi / 300m in auto; arrivo (teaser)
  // 30m a piedi / 50m in auto. Stessi default nel servizio Kotlin
  // (ItaintaBackgroundPoiService.kt): tenerli allineati.
  walkAlert:   { default: 150, min: 50,  max: 400 },
  walkTrigger: { default: 30,  min: 15,  max: 100 },
  carAlert:    { default: 300, min: 100, max: 600 },
  carTrigger:  { default: 50,  min: 20,  max: 150 },
} as const;

export type DistanceKey = keyof typeof DISTANCE_CONFIG;

export interface GuideDistances {
  walkAlert: number;
  walkTrigger: number;
  carAlert: number;
  carTrigger: number;
}

function readInt(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// --- Distanze trigger ---------------------------------------------------
export function getDistances(): GuideDistances {
  return {
    walkAlert: readInt(KEYS.walkAlert, DISTANCE_CONFIG.walkAlert.default),
    walkTrigger: readInt(KEYS.walkTrigger, DISTANCE_CONFIG.walkTrigger.default),
    carAlert: readInt(KEYS.carAlert, DISTANCE_CONFIG.carAlert.default),
    carTrigger: readInt(KEYS.carTrigger, DISTANCE_CONFIG.carTrigger.default),
  };
}

export function setDistance(key: DistanceKey, value: number): void {
  const cfg = DISTANCE_CONFIG[key];
  const clamped = clamp(value, cfg.min, cfg.max);
  try {
    localStorage.setItem(KEYS[key], String(clamped));
  } catch {
    /* ignore */
  }
}

/**
 * Raggi operativi (alert/trigger) per la modalita' di trasporto corrente.
 * Include una logica di espansione del raggio per edifici grandi (Musei, Castelli, ecc.)
 */
/** Raggi calibrati sul perimetro reale del POI (footprint OSM), quando presenti. */
export interface PoiFootprint {
  /** Raggio di trigger/arrivo derivato dal perimetro (colonna geofence_radius). */
  geofenceRadius?: number | null;
  /** Raggio di alert derivato dal perimetro (colonna alert_radius). */
  alertRadius?: number | null;
  /** True se il POI è stato processato col footprint (entrance valorizzato). */
  hasEntrance?: boolean;
}

export function radiiForTransport(
  mode: TransportMode,
  category?: string | null,
  footprint?: PoiFootprint | null,
): {
  alert: number;
  trigger: number;
} {
  const d = getDistances();
  let { alert, trigger } = mode === 'car'
    ? { alert: d.carAlert, trigger: d.carTrigger }
    : { alert: d.walkAlert, trigger: d.walkTrigger };

  // RAGGI CALIBRATI SUL PERIMETRO REALE. Se il POI è stato processato col
  // footprint OSM (entrance valorizzato → hasEntrance), usa i suoi raggi reali,
  // EspAndendo (mai riducendo) i default di modalità: una piazza ottiene un
  // raggio grande, una statua resta stretta. Sostituisce il bump forfettario.
  // Gated su hasEntrance: i POI non processati sono IDENTICI a oggi (i valori
  // 50/150 di default sono indistinguibili da raggi reali e non vanno usati).
  const fpTrigger = Number(footprint?.geofenceRadius) || 0;
  const fpAlert = Number(footprint?.alertRadius) || 0;
  if (footprint?.hasEntrance && (fpTrigger > 0 || fpAlert > 0)) {
    if (fpTrigger > 0) trigger = Math.max(trigger, fpTrigger);
    if (fpAlert > 0) alert = Math.max(alert, fpAlert);
    return { alert, trigger };
  }

  // Fallback (comportamento attuale): bump forfettario per edifici grandi,
  // perché il centroide di un edificio massiccio è lontano dalla strada.
  const cat = (category || '').toLowerCase();
  const largeScaleCategories = [
    'castle', 'castelli', 'museum', 'musei', 'church', 'chiese',
    'place_of_worship', 'fortress', 'palazzo', 'palace', 'monastery', 'abbey',
    'archaeological_site', 'ruins', 'rovine', 'monument', 'monumento', 'attraction'
  ];

  if (largeScaleCategories.includes(cat)) {
    trigger += 40; // Aggiungiamo 40 metri di tolleranza per edifici massicci
    alert += 50;   // Espandiamo anche l'alert per dare tempo al GPS di stabilizzarsi
  }

  return { alert, trigger };
}

// --- Categorie ammesse per il trigger audioguida -------------------------
// Fonte di verità JS per la stessa logica di GeofenceBroadcastReceiver.CATEGORY_MAP
// (Kotlin) / PoiCategories.map (Swift): traduce la categoria GREZZA del POI
// (tag OSM-like salvato in shared_pois.category) nel bucket del setup
// GeoControl (monumenti/musei/chiese/panorami/castelli/archeo/consigli/community/gemme).
// Usata da locationService.ts e GeofenceAudioGuide.tsx: prima confrontavano
// direttamente activeCategories (nomi bucket) con la categoria grezza del POI
// ("museum", "church", "viewpoint"...), un confronto che non poteva mai
// combaciare → il filtro per categoria del radar/audioguida sul web non
// applicava di fatto la selezione dell'utente.
export function isCategoryAllowed(
  poi: { category?: string | null; premium?: boolean; is_gem?: boolean },
  activeSubcats: Record<string, boolean>,
): boolean {
  const cat = (poi.category || '').toLowerCase();

  // BENI CULTURALI: scheda e foto, MAI audioguida.
  // Sono i beni dei registri nazionali del patrimonio promossi a POI (circa
  // 430.000): chiese di campagna, mulini, ma anche case private vincolate e
  // magazzini storici. Vanno visti sulla mappa e aperti se interessano, ma non
  // devono far partire un racconto — un turista che passa davanti a casa di
  // qualcuno non deve sentirsi parlare nell'orecchio, e su quei numeri
  // l'audioguida diventerebbe rumore continuo invece che un momento.
  // Chi merita l'audioguida ce l'ha lo stesso: se il bene combacia con un POI
  // che abbiamo gia' (una chiesa importata da Wikidata), quello conserva la
  // SUA categoria e passa da uno dei rami sotto. Solo i beni che esistono
  // unicamente come `beni_culturali` restano muti.
  if (cat === 'beni_culturali') return false;

  // WIP COMMUNITY E VERTICALI TEMATICI: MAI audioguida (committente,
  // 22/08/2026: "le categorie delle audioguide devono fermarsi a Consigli
  // gratuiti; da WIP Community in giu' non hanno audioguide"). Restano sulla
  // mappa, nelle chip, negli itinerari e negli eventi: cambia solo che non
  // fanno partire la voce. Il controllo sta QUI e non nella lista del setup,
  // perche' le chip mappa scrivono le stesse chiavi in wip_active_subcategories
  // (App.tsx) e una chiave gia' salvata a `true` riaccenderebbe tutto.
  // `return false` esplicito, come per beni_culturali: il default in fondo e'
  // gia' false, ma un ramo aggiunto domani fra qui e la fine non deve poterle
  // riprendere per sbaglio.
  if (SENZA_AUDIOGUIDA.has(cat)) return false;

  if (poi.premium || poi.is_gem || cat === 'gemme') return activeSubcats.gemme ?? true;
  // Monumenti: include il patrimonio costruito importato in fase 2 (piazze,
  // ponti, fontane, teatri, palazzi, torri, grattacieli, cimiteri monumentali,
  // biblioteche storiche, mulini, acquedotti, osservatori, stadi).
  if (['monument', 'artwork', 'monumenti', 'attraction',
       'square', 'bridge', 'fountain', 'theatre', 'opera_house', 'palace',
       'tower', 'skyscraper', 'cemetery', 'library', 'windmill', 'aqueduct',
       'observatory', 'stadium',
       // Fasi 3-5: archeologia romana, difensivo, industria, memoria,
       // trasporti storici, cultura, scienza.
       'birthplace', 'house_museum', 'necropolis', 'catacomb', 'fortress',
       'city_walls', 'villa', 'harbour', 'mine', 'chimney', 'funicular',
       'amphitheatre', 'roman_baths', 'triumphal_arch', 'obelisk', 'mausoleum',
       'market_hall', 'train_station', 'dam', 'watermill', 'prison', 'museum_ship',
       'archaeological_park', 'memorial', 'sculpture', 'university', 'town_hall',
       'roman_theatre', 'roman_circus', 'roman_villa', 'domus', 'city_gate',
       'coastal_tower', 'stronghold', 'quarry', 'saltworks', 'racetrack',
       'racecourse', 'ski_jump', 'war_cemetery', 'concentration_camp',
       'rack_railway', 'pier', 'shipyard', 'archive', 'radio_telescope', 'hydro_plant',
      ].includes(cat)) return activeSubcats.monumenti ?? true;
  if (['castle', 'castelli'].includes(cat)) return activeSubcats.castelli ?? activeSubcats.monumenti ?? true;
  if (['ruins', 'archaeological_site', 'archeo'].includes(cat)) return activeSubcats.archeo ?? activeSubcats.monumenti ?? true;
  if (['church', 'chiese', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale',
       'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
       'shrine', 'santuario',
       // Sottotipi religiosi importati dalle fasi 3-5: NESSUN chip nuovo,
       // confluiscono tutti nel filtro "chiese" già esistente.
       'cathedral', 'basilica', 'baptistery', 'bell_tower', 'cloister', 'crypt',
       'abbey', 'synagogue', 'mosque', 'temple',
      ].includes(cat)) return activeSubcats.chiese ?? true;
  // Panorami e NATURA: oltre a belvedere e parchi, le verticali naturali
  // (spiagge, cascate, grotte, vette, sorgenti termali, isole, riserve, fari,
  // funivie panoramiche). Confluiscono qui invece di avere una categoria
  // propria perché "panorami" è già cablata ovunque — web, Kotlin, iOS, chip,
  // traduzioni — e soprattutto è già abilitata all'audioguida.
  // NATURA PER FAMIGLIE (21/08/2026): ognuna risponde al SUO interruttore,
  // e se quello non è mai stato toccato ricade su `panorami` — cioè sulla
  // scelta che l'utente aveva già fatto quando erano tutte insieme. Senza
  // questo doppio passaggio, chi aveva spento «panorami» si ritroverebbe
  // le spiagge riaccese da sole.
  // Dal 22/08/2026 c'e' anche la macro «natura» (chip mappa e setup): vale
  // per tutte e cinque le famiglie quando la famiglia non e' stata toccata.
  const naturaSub = (famiglia: string): boolean =>
    (activeSubcats as any)[famiglia] ?? (activeSubcats as any).natura ?? activeSubcats.panorami ?? true;
  if (['beach', 'spiaggia', 'spiagge', 'bay', 'baia', 'island', 'isola', 'cliff', 'falesia', 'coast', 'costa', 'dune',
      ].includes(cat)) return naturaSub('spiagge');
  if (['peak', 'vetta', 'vette', 'volcano', 'vulcano', 'glacier', 'ghiacciaio', 'mountain_pass', 'valico', 'ridge', 'arete', 'saddle',
      ].includes(cat)) return naturaSub('vette');
  if (['waterfall', 'cascata', 'cascate', 'spring', 'sorgente', 'hot_spring', 'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'gola', 'canyon',
      ].includes(cat)) return naturaSub('acque');
  if (['cave', 'grotta', 'grotte', 'cave_entrance', 'sinkhole', 'abisso',
      ].includes(cat)) return naturaSub('grotte');
  if (['park', 'parchi', 'parco', 'garden', 'giardino', 'botanical_garden', 'nature_reserve', 'riserva',
       'geopark', 'forest', 'foresta', 'wood', 'bosco', 'desert', 'deserto', 'tree', 'albero', 'national_park',
      ].includes(cat)) return naturaSub('parchi');
  if (['viewpoint', 'panorami', 'panorama', 'lighthouse', 'faro', 'scenic_road', 'aerialway', 'natura',
       'trail', 'sentiero', 'cammino', 'hiking', 'via_ferrata', 'ski_resort',
      ].includes(cat)) return activeSubcats.panorami ?? true;
  if (['museum', 'gallery', 'musei', 'art_museum', 'natural_history_museum',
       'art_gallery', 'house_museum'].includes(cat)) return activeSubcats.musei ?? true;
  if (['information', 'tourism_information', 'office', 'consigli'].includes(cat))
    return activeSubcats.consigli ?? false;
  // 'community' e gli otto tematici sono gia' stati rifiutati in cima
  // (SENZA_AUDIOGUIDA): qui non arrivano.
  // VINO E GUSTO: default OFF (come community), ma quando l'utente accende la
  // chip l'audioguida DEVE parlare — è il senso della categoria. Una cantina
  // o un frantoio hanno una storia da raccontare quanto una chiesa, e chi
  // accende "Vino e Gusto" ha chiesto esattamente quello.
  // La categoria in shared_pois è 'enogastronomia'; i poi_type sono elencati
  // qui perché un domani potrebbero arrivare come `category` grezza dal radar.
  if (['enogastronomia',
       'cantina', 'enoteca', 'vigneto', 'uliveto', 'birrificio', 'distilleria',
       'caseificio', 'formaggi', 'frantoio', 'gastronomia', 'fattoria',
       'pasticceria', 'cioccolato', 'caffe', 'te', 'miele', 'spezie',
       'museo_gusto', 'strada_del_vino', 'winery',
      ].includes(cat)) return activeSubcats.enogastronomia ?? false;
  // I verticali tematici (terme, cinema, cieli, street_art, mercati,
  // fioriture, memoria, lento) stavano qui con `activeSubcats[cat] ?? false`
  // fino al 22/08/2026: ora sono in SENZA_AUDIOGUIDA, vedi in cima.
  return false; // categorie commerciali/utilitarie (locali/utilita/famiglie) → mai audioguida
}

/**
 * Le categorie che NON hanno audioguida qualunque cosa dica
 * wip_active_subcategories: WIP Community e gli otto verticali tematici.
 * Decisione del committente del 22/08/2026. Usata da isCategoryAllowed e da
 * locationService, che non passa queste chiavi al servizio nativo.
 */
export const SENZA_AUDIOGUIDA: ReadonlySet<string> = new Set([
  'community',
  'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento',
]);

/**
 * Le chiavi di wip_active_subcategories che il servizio nativo deve vedere:
 * solo quelle con audioguida. Le chip mappa scrivono nello stesso oggetto
 * anche community/tematici/enogastronomia (servono alla mappa), e senza
 * questo filtro il nativo le prenderebbe per categorie da raccontare.
 */
export const CHIAVI_NATIVO_AUDIOGUIDA: ReadonlySet<string> = new Set([
  'gemme', 'monumenti', 'musei', 'panorami', 'chiese', 'consigli',
  'castelli', 'archeo', 'natura', 'spiagge', 'vette', 'acque', 'grotte', 'parchi',
  'enogastronomia',
]);

// --- Modalita' attivazione ---------------------------------------------
export function getActivationMode(): ActivationMode {
  try {
    return (localStorage.getItem(KEYS.mode) as ActivationMode) || 'automatic';
  } catch {
    return 'automatic';
  }
}

export function setActivationMode(mode: ActivationMode): void {
  try {
    localStorage.setItem(KEYS.mode, mode);
  } catch {
    /* ignore */
  }
}

// --- Personaggio guida --------------------------------------------------
export function getGuideCharacter(): GuideCharacter {
  try {
    return (localStorage.getItem(KEYS.character) as GuideCharacter) || 'nicky';
  } catch {
    return 'nicky';
  }
}

export function setGuideCharacter(character: GuideCharacter): void {
  try {
    localStorage.setItem(KEYS.character, character);
  } catch {
    /* ignore */
  }
}

// --- Preferenza trasporto (auto = rileva da velocita') ------------------
export function getTransportPreference(): TransportPreference {
  try {
    return (localStorage.getItem(KEYS.transport) as TransportPreference) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setTransportPreference(pref: TransportPreference): void {
  try {
    localStorage.setItem(KEYS.transport, pref);
  } catch {
    /* ignore */
  }
}

/** Soglie dell'isteresi piedi/auto, le STESSE del servizio nativo. */
const AUTO_SOPRA_KMH = 12;
const PIEDI_SOTTO_KMH = 6;
/** L'ultimo modo deciso in 'auto': e' lo stato che rende possibile l'isteresi. */
let ultimoModoAuto: TransportMode = 'walk';

/**
 * Modalita' trasporto effettiva data la velocita' (m/s) e la preferenza.
 * In 'auto' applica la stessa ISTERESI del nativo: sopra 12 km/h si passa
 * in auto, sotto 6 km/h si torna a piedi, in mezzo si resta come si era.
 * Prima c'era una soglia secca a 10 km/h: a ogni semaforo il modo
 * oscillava e locationService rilanciava il servizio nativo a ogni fix.
 */
export function resolveTransportMode(speedMetersPerSec: number | null): TransportMode {
  const pref = getTransportPreference();
  if (pref === 'walk') return 'walk';
  if (pref === 'car') return 'car';
  const kmh = (speedMetersPerSec || 0) * 3.6;
  if (kmh >= AUTO_SOPRA_KMH) ultimoModoAuto = 'car';
  else if (kmh <= PIEDI_SOTTO_KMH) ultimoModoAuto = 'walk';
  return ultimoModoAuto;
}

/** Azzera lo stato dell'isteresi (allo spegnimento dell'audioguida). */
export function resetTransportHysteresis(): void {
  ultimoModoAuto = 'walk';
}

// --- Anti-ripetizione (POI gia' riprodotti) -----------------------------
// Formato: { [poiId]: timestampMs }. Il vecchio formato (array di id) si
// migra al volo con timestamp "adesso": un POI ascoltato ieri resta in
// cooldown ancora un giorno, poi si libera — come sul nativo (24 h).

/** Cooldown per-POI dopo un ascolto: lo stesso del servizio nativo. */
export const PLAYED_COOLDOWN_MS = 24 * 3_600_000;

function readPlayed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEYS.played);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const now = Date.now();
      const out: Record<string, number> = {};
      for (const id of parsed) out[String(id)] = now;
      return out;
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePlayed(map: Record<string, number>): void {
  try {
    localStorage.setItem(KEYS.played, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Quando e' stato ascoltato l'ultima volta (ms), o null. */
export function playedAt(poiId: string | number): number | null {
  const ts = readPlayed()[String(poiId)];
  return Number.isFinite(ts) ? ts : null;
}

/** true se ascoltato da meno di `maxAgeMs` (default 24 h). */
export function isPlayed(poiId: string | number, maxAgeMs = PLAYED_COOLDOWN_MS): boolean {
  const ts = playedAt(poiId);
  return ts != null && Date.now() - ts < maxAgeMs;
}

export function markPlayed(poiId: string | number): void {
  const map = readPlayed();
  const now = Date.now();
  // Potatura: le voci piu' vecchie di 7 giorni non servono piu' a nessuno.
  for (const [id, ts] of Object.entries(map)) {
    if (!Number.isFinite(ts) || now - ts > 7 * 24 * 3_600_000) delete map[id];
  }
  map[String(poiId)] = now;
  writePlayed(map);
}

/** Reset esplicito di un singolo POI (es. click PLAY dalla scheda). */
export function resetPlayedOne(poiId: string | number): void {
  const map = readPlayed();
  if (String(poiId) in map) { delete map[String(poiId)]; writePlayed(map); }
}

/** Reset totale ("Reimposta audioguide ascoltate" nelle settings). */
export function resetAllPlayed(): void {
  try {
    localStorage.removeItem(KEYS.played);
  } catch {
    /* ignore */
  }
}
