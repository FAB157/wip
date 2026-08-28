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
// - accuracy > 50 m → fix scartato (SOGLIA_ACCURATEZZA_TRIGGER_M, guideSettings)
// - avvicinamento richiesto (distanza in diminuzione tra due fix) OPPURE
//   passaggio previsto dal CPA entro l'anticipo (predittore.ts: 22 s a piedi,
//   14 s in auto; corridoio 35/70 m) — i due rami convivono, vedi sotto
// - hasPassed: 40 METRI oltre il punto di massimo avvicinamento (CPA),
//   MAI soglie in secondi (memoria di progetto trigger pedonali)
// - raggio di ingresso: geofence_radius GREZZO del POI quando è calibrato sul
//   perimetro (ingresso presente), altrimenti lo slider dell'utente più i
//   default per categoria (50 m base)
// - cooldown per-POI 24 h (localStorage 'wip_web_trigger_history' +
//   wip_played_pois con timestamp), come il nativo
// - throttle globale: max 1 trigger ogni 90 s
// - arbitraggio: il più vicino vince, con bonus gemme/premium
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { isFeatureEnabled } from '../featureFlags';
import { reportTrigger } from './telemetry';
import { caricaPerimetri, distanzaDalPerimetro, perimetroNoto } from './footprints';
import { locationService } from '../../services/locationService';
import { tourService } from '../../services/tourService';
import { radiiForTransport, resolveTransportMode, isPlayed, isCategoryAllowed, PLAYED_COOLDOWN_MS,
  fiduciaPunto, fattoreFiducia, applicaFiducia, SOGLIA_ACCURATEZZA_TRIGGER_M,
  type LivelloFiducia, type TransportMode } from '../guideSettings';
import { valutaPredizione, stabilizzaFix, azzeraFiltro, type FixPredittore } from './predittore';
import { puntoArrivoSincrono, puntoStradaInCache, precaricaPuntoStrada, collegaGrafoStrade } from '../puntoArrivo';
import * as roadSnap from '../roadSnap';
import { getRoadIndex, refreshRoadTile, shouldRefreshRoads } from '../roadSnap';
import { valutaGate, azzeraGate } from './bearingGate';

// ── Costanti (SPECULARI al canary server) ─────────────────────────
// Soglia UNICA per decidere, condivisa con il predittore e il gate di bussola:
// vive in guideSettings.ts (SOGLIA_ACCURATEZZA_TRIGGER_M) proprio perche' era
// scritta a mano in tre file e nulla impediva a uno dei tre di divergere. La
// soglia larga da 100 m dei nativi NON e' la stessa cosa e non va unificata:
// serve a decidere «sono nei paraggi» (registrare geofence, scaricare POI), non
// a far partire un racconto. Vedi il commento sulle due soglie in guideSettings.
const ACCURACY_MAX_M = SOGLIA_ACCURATEZZA_TRIGGER_M; // fix peggiore → scartato
// Metri oltre il CPA perche' un POI sia "superato": 40 m come i nativi
// (PredictiveTrigger.kt PASS_DISTANCE_M, PredictiveTrigger.swift). Fino al
// 28/08/2026 in auto qui valeva 150 m, giustificato con «fra un fix e l'altro
// il POI risulta superato prima di essere valutato»: ma quel problema lo
// risolve il PAVIMENTO RADIALE (come nel nativo hasPassed: superato solo se
// ANCHE fuori dal raggio d'arrivo e in allontanamento), non una soglia tripla
// che lasciava parlare un POI gia' 100 m alle spalle a 50 km/h.
const HAS_PASSED_M = 40;
const DEFAULT_TRIGGER_RADIUS_M = 50;
// Il solo limite inferiore rimasto (23/08/2026, prima era 25 m = metà del
// default). Non è una scelta di prodotto ma di fisica: in città un fix GPS ha
// 5-15 m di errore, e un cerchio più stretto di 10 m non lo si "entra", lo si
// sorteggia. Sopra i 10 m lo slider dell'utente comanda davvero, fino al suo
// minimo di 15 m (DISTANCE_CONFIG.walkTrigger).
const MIN_TRIGGER_RADIUS_M = 10;
// A quanti metri DAL BORDO del perimetro parte la guida, quando il POI ha il
// poligono (decisione del 22/08/2026: "a 30 metri dal perimetro, non quando
// si e' dentro"). In auto 30 m sono un secondo a 50 km/h: la frase inizierebbe
// a POI gia' superato, quindi 100 m. Stessi valori in Footprints.kt e
// PoiFootprints.swift.
const PERIMETER_TRIGGER_WALK_M = 30;
const PERIMETER_TRIGGER_CAR_M = 100;
// Throttle GLOBALE: max 1 trigger ogni 90 s. SCELTA WEB ESPLICITA, non un
// disallineamento dai nativi: sul web la guida suona nel tag <audio> della
// stessa WebView e un secondo trigger a 30 s taglierebbe la narrazione in
// corso; i nativi hanno una coda TTS/ExoPlayer propria e arbitrano li'.
const GLOBAL_THROTTLE_MS = 90_000;
// 24 h per-POI, come il servizio nativo (era 6 h: lo stesso POI poteva
// riparlare nel pomeriggio di chi l'aveva sentito al mattino).
const POI_COOLDOWN_MS = PLAYED_COOLDOWN_MS;
const APPROACH_EPSILON_M = 0.5;     // isteresi minima per "in diminuzione"
const GEM_BONUS_M = 30;             // arbitraggio: le gemme "valgono" 30 m
const PREMIUM_BONUS_M = 20;

// Raggi di ingresso di default per categoria quando il POI non porta un
// geofence_radius calibrato (allineati ai fallback di poiRepository/nativo).
// Valgono SOLO per i POI non calibrati: su un POI misurato sul perimetro
// sarebbero una stima che corregge una misura. Vedi triggerRadiusFor.
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
 *
 * 23/08/2026 — VIA IL PAVIMENTO DEI 50 METRI. `eff_geofence_radius` esce dalla
 * RPC come `coalesce(geofence_radius, 50)`: un POI mai calibrato arrivava qui
 * con un 50 finto, e il `Math.max(r, eff)` lo trasformava in un pavimento. Lo
 * slider "arrivo a piedi" (min 15 m, default 30) non poteva scendere sotto i
 * 50 m: verso il basso era inerte. Ora si legge il raggio GREZZO
 * (`poi.geofence_radius`, nullo quando non c'e' calibrazione — migration
 * 20260823140000) e si distinguono due mondi:
 *
 *   • POI CALIBRATO (ingresso + raggio dal perimetro reale): comanda la
 *     misura. Niente default di categoria, niente bonus gemme, niente
 *     pavimento — sono tutte stime, e una stima non corregge una misura.
 *   • POI NON CALIBRATO: comportamento di prima, cioe' lo slider dell'utente
 *     allargato dai default di categoria e dal bonus gemme.
 *
 * `eff_*` non si legge piu': serviva solo come surrogato del grezzo, e il
 * surrogato era il bug.
 */
function triggerRadiusFor(poi: any, modo: TransportMode, livello?: LivelloFiducia): number {
  // SOLO i raggi grezzi: null = "mai calibrato". Vedi PoiFootprint in
  // guideSettings.ts. poiRepository li normalizza anche quando la RPC sul DB
  // e' ancora la versione vecchia che non li restituisce.
  const rawTrigger = Number(poi?.geofence_radius) || 0;
  const rawAlert = Number(poi?.alert_radius) || 0;
  const hasEntrance = !!(Number(poi?.entrance_lat) && Number(poi?.entrance_lon));
  const calibrato = hasEntrance && rawTrigger > 0;

  const r = radiiForTransport(modo, poi?.category, {
    geofenceRadius: rawTrigger || null,
    alertRadius: rawAlert || null,
    hasEntrance,
  }).trigger;

  // Il POI e' misurato: si rispetta la misura e ci si ferma qui. L'unico
  // limite che resta e' fisico, non di prodotto: sotto i 10 m il rumore del
  // GPS (5-15 m in citta') rende il cerchio un sorteggio.
  if (calibrato) return Math.max(r, MIN_TRIGGER_RADIUS_M);

  // POI senza calibrazione: default di categoria e bonus gemme come sempre.
  let out = r;
  const cat = String(poi?.category || '').toLowerCase();
  if (CATEGORY_RADIUS_M[cat]) out = Math.max(out, CATEGORY_RADIUS_M[cat]);
  if (poi?.is_gem) out = Math.max(out, CATEGORY_RADIUS_M.gemme);

  // 23/08/2026 — E ADESSO LA FIDUCIA NEL PUNTO. Un cerchio non e' fatto solo
  // di raggio: e' fatto di raggio E di centro. Con un centro incerto (il
  // baricentro di un poligono) il raggio di categoria non basta: il POI viene
  // marcato «superato» e non parla MAI. Vedi fiduciaPunto/fattoreFiducia in
  // guideSettings.ts per i numeri (×2 sul centroide puro — cioe' quando NON
  // abbiamo un punto — e nessun allargamento quando un punto c'e', che sia il
  // muro, il portone o l'indirizzo; tetti 80 m a piedi e 120 m in auto). Il
  // bonus gemme resta dov'e': sta sotto i tetti e non viene mai stretto.
  const liv = livello ?? fiduciaPunto(poi, {
    haPerimetro: perimetroNoto(String(poi?.id ?? '')),
    puntoIndirizzoPronto: !!puntoStradaInCache(poi),
  });
  out = applicaFiducia(out, fattoreFiducia(liv, modo), 'trigger');
  return Math.max(out, MIN_TRIGGER_RADIUS_M);
}

/**
 * Il raggio di AVVISO ("stai per arrivare"): stessa scala di fiducia del
 * trigger, con i suoi tetti (250 m a piedi, 400 m in auto). Serve qui a una
 * cosa sola: sapere quando un POI e' abbastanza vicino da meritare la
 * geocodifica dell'indirizzo — l'unica chiamata di rete della catena, fatta
 * una volta per POI e mai nel ciclo del trigger.
 */
function alertRadiusFor(poi: any, modo: TransportMode, livello: LivelloFiducia): number {
  const rawTrigger = Number(poi?.geofence_radius) || 0;
  const rawAlert = Number(poi?.alert_radius) || 0;
  const hasEntrance = !!(Number(poi?.entrance_lat) && Number(poi?.entrance_lon));
  const base = radiiForTransport(modo, poi?.category, {
    geofenceRadius: rawTrigger || null,
    alertRadius: rawAlert || null,
    hasEntrance,
  }).alert;
  return applicaFiducia(base, fattoreFiducia(livello, modo), 'avviso');
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

    // 🎚️ FILTRO SUL JITTER, PRIMA DI TUTTO IL RESTO (23/08/2026). Il CPA del
    // predittore e' una derivata: si nutre della differenza fra due posizioni,
    // e fra i palazzi un fix rimbalza di 10-30 m da un secondo all'altro. Il
    // filtro e' un Kalman scalare per asse con passo di predizione lungo la
    // rotta nota (niente ritardo su chi cammina) e un guard-rail a 10 m: se la
    // stima filtrata si allontana di piu' dal fix grezzo, vince il grezzo e lo
    // stato riparte. Vedi predittore.ts per il compromesso per esteso.
    const stabile = stabilizzaFix({ lat, lon, speed, heading: Number(d.heading), accuracy });
    if (Number.isFinite(stabile.lat) && Number.isFinite(stabile.lon)) {
      lat = stabile.lat;
      lon = stabile.lon;
    }

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

    // Il fix, nella forma che il predittore si aspetta. Costruito una volta
    // per giro: la valutazione CPA e' per-POI, il fix no.
    const fixPredittore: FixPredittore = {
      lat, lon, speed, heading: Number(d.heading), accuracy,
    };

    /** Quale ramo ha reso eleggibile il POI: serve a leggere la telemetria in strada. */
    type RamoTrigger = 'perimetro' | 'raggio' | 'predetto';
    interface Eligible { poi: any; id: string; dist: number; arrivo: { lat: number; lon: number }; inside: boolean; ramo: RamoTrigger; motivo: string }
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
      // dal lato sbagliato e il radar mostrava un'altra distanza. Dal
      // 23/08/2026 c'e' un gradino in piu': se l'indirizzo e' gia' stato
      // geocodificato (e portato sulla carreggiata) si misura DA LI', cioe'
      // dal punto sulla via giusta invece che dal baricentro dell'edificio.
      const fiducia = fiduciaPunto(poi, {
        haPerimetro: perimetroNoto(id),
        puntoIndirizzoPronto: !!puntoStradaInCache(poi),
      });
      const arrivo = puntoArrivoSincrono(poi);
      const dist = haversineMeters(lat, lon, arrivo.lat, arrivo.lon);
      const radius = triggerRadiusFor(poi, modo, fiducia);

      // GEOCODIFICA AL MOMENTO DELL'AVVISO, UNA VOLTA PER POI. Chiedere la
      // strada dell'indirizzo costa una chiamata di rete: nel ciclo dei
      // trigger (un giro per fix, decine di POI) sarebbe insostenibile. Qui
      // si lancia solo quando il POI entra nel raggio d'avviso — dove restano
      // secondi di margine prima del trigger — e non si aspetta: se al
      // passaggio successivo il punto e' pronto sale a livello `indirizzo`,
      // altrimenti si continua col centroide (e il suo raggio doppio).
      if (fiducia === 'centroide' && dist <= alertRadiusFor(poi, modo, fiducia)) {
        precaricaPuntoStrada(poi);
      }

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
      // hasPassed in METRI oltre il CPA (mai secondi), con lo stesso pavimento
      // radiale del nativo (PredictiveTrigger.hasPassed: `metersPastCpa > 40
      // && distanceNow > radiusM`, in allontanamento): finche' si e' DENTRO il
      // raggio d'arrivo non si e' "superato" nulla, anche se il CPA e' 40 m
      // indietro — e' il caso del pedone che gira attorno al monumento.
      if (dist > st.prevDist && dist > st.minDist + HAS_PASSED_M && dist > radius) st.passed = true;
      if (dist < st.minDist) st.minDist = dist;

      // 🎯 PREDIZIONE (23/08/2026): il POI e' pertinente anche se il PASSAGGIO
      // e' previsto entro l'anticipo — 22 s a piedi, 14 s in auto, corridoio
      // 35/70 m — e non solo se sei gia' dentro il cerchio. E' il ramo che i
      // nativi hanno da sempre (PredictiveTrigger.kt/.swift) e che sul web
      // mancava: qui si decideva con «la distanza e' calata di 0,5 m», che non
      // anticipa nulla e non distingue chi arriva da chi passa nella via
      // parallela. Il predittore SI AGGIUNGE, non sostituisce: fail-open per
      // costruzione (fermo, senza rotta o con un fix impreciso torna alla
      // regola radiale di prima), quindi non puo' togliere un trigger che oggi
      // scatterebbe — puo' solo anticiparlo.
      const predizione = valutaPredizione(fixPredittore, arrivo.lat, arrivo.lon, radius, modo, Date.now());
      const predetto = predizione.haPredetto && predizione.decisione === 'scatta';

      // A 30 M DAL PERIMETRO (o dentro) batte tutto il resto.
      //
      // Le due condizioni che valgono per il cerchio — "ti stai avvicinando"
      // e "non l'hai gia' superato" — sono misurate sull'ingresso, e accanto
      // a un edificio grande sono sbagliate: camminando lungo la facciata di
      // una basilica di 120 metri ci si allontana dall'ingresso per meta' del
      // percorso, e il codice a raggi lo leggerebbe come "sta andando via".
      // Se sei a 30 m dal muro, ci sei: il cooldown di 24 ore basta a evitare
      // che parli due volte. Il cerchio resta per i POI senza perimetro.
      const dentroRaggio = dist <= radius && approaching && !st.passed;
      // ORDINE DEI RAMI, dal piu' certo al piu' inferito: perimetro (misurato),
      // cerchio (com'e' sempre stato), predizione (inferita). Il `!st.passed`
      // vale anche per la predizione: un POI gia' superato resta superato.
      if (alPerimetro || dentroRaggio || (predetto && !st.passed)) {
        if (alPerimetro) st.passed = false;
        const ramo: RamoTrigger = alPerimetro ? 'perimetro' : (dentroRaggio ? 'raggio' : 'predetto');
        eligible.push({
          poi, id, dist: inside ? 0 : Math.min(dist, distPerimetro), arrivo, inside, ramo,
          motivo: ramo === 'predetto' ? predizione.motivo : ramo,
        });
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
          reportTrigger('suppressed', { poiId: c.id, accuracy, speed });
        }
        return false;
      }
      return true;
    });
    if (ready.length === 0) return;

    // 🧭 GATE DI BUSSOLA (23/08/2026). L'ultimo filtro prima di parlare: se il
    // POI ce l'hai ALLE SPALLE il racconto non si butta via, si RIMANDA — non
    // si marca come scattato, non si consuma il cooldown, non si tocca il
    // throttle globale, e si riprova al fix successivo (se torni indietro o ti
    // giri a guardarlo, parte allora).
    //
    // Il gate e' fail-open per costruzione: 'ignora-gate' in tutti i casi in
    // cui non ha titolo per decidere. Qui si aggiungono le tre esenzioni che
    // dipendono dal contesto del trigger e che il modulo non puo' conoscere:
    //  • DENTRO IL PERIMETRO: sei nell'edificio, dove guardi non conta (il
    //    modulo lo verifica anche da se' con dentroPerimetro, ma qui la misura
    //    e' gia' in mano: `inside`);
    //  • TAPPE DI UN GIRO/ITINERARIO: sono luoghi che l'utente HA SCELTO, non
    //    incontri per strada — si raccontano comunque, anche di spalle. (I giri
    //    "Dieci Tappe" non arrivano nemmeno fin qui: tourService.inCorso() esce
    //    in cima. Questo copre l'itinerario manuale, isFromItinerary.)
    // Il raggio d'arrivo stretto (25 m) e la scadenza del rinvio (90 s) sono
    // gia' dentro valutaGate: un POI rimandato parla comunque dopo un minuto e
    // mezzo, perche' un racconto tardivo vale piu' del silenzio.
    const davanti = ready.filter(c => {
      if (c.inside) return true;
      if (c.poi?.isFromItinerary === true) return true;
      const esito = valutaGate(
        { id: c.id, lat: c.arrivo.lat, lon: c.arrivo.lon },
        { latitude: lat, longitude: lon, speed: Number.isFinite(speed) ? speed : null,
          heading: Number(d.heading), accuracy: Number.isFinite(accuracy) ? accuracy : null },
        { distanzaMetri: c.dist },
      );
      return esito !== 'rimanda';
    });
    if (davanti.length === 0) {
      // Tutti alle spalle: si riprova al prossimo fix. Vale la pena saperlo —
      // e' l'unico caso in cui un POI predetto correttamente resta muto, e in
      // strada serve poterlo distinguere da «non era eleggibile». 'skipped',
      // una volta per POI a sessione come gli altri.
      const c = ready[0];
      if (!suppressedReported.has(`gate:${c.id}`)) {
        suppressedReported.add(`gate:${c.id}`);
        reportTrigger('skipped', { poiId: c.id, accuracy, speed });
      }
      return;
    }

    // Throttle globale: mai più di un trigger ogni 90 s (i candidati restano
    // eleggibili ai fix successivi finché non superano il POI).
    if (now - lastGlobalFireTs < GLOBAL_THROTTLE_MS) {
      const c = davanti[0];
      if (!suppressedReported.has(`global:${c.id}`)) {
        suppressedReported.add(`global:${c.id}`);
        reportTrigger('suppressed', { poiId: c.id, accuracy, speed });
      }
      return;
    }

    // Arbitraggio: vince il più vicino, con bonus d'importanza gemme/premium.
    davanti.sort((a, b) => {
      const score = (c: Eligible) =>
        c.dist - (c.poi.is_gem ? GEM_BONUS_M : 0) - (c.poi.premium ? PREMIUM_BONUS_M : 0);
      return score(a) - score(b);
    });
    const winner = davanti[0];

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
    // Ha parlato: il POI esce dallo stato del gate (rinvii e isteresi
    // ripartono da zero se un domani lo si reincontra).
    azzeraGate(winner.id);
    // Telemetria: `speed` va nel body insieme ad accuracy (il server aggrega
    // per giorno). Il RAMO che ha fatto scattare il POI non entra nel payload
    // — reportTrigger accetta solo poiId/accuracy/speed e non e' questo il
    // posto per allargarlo — ma finisce nel log e in una variabile globale, che
    // e' cio' che serve in strada col telefono collegato: si legge
    // `__wipUltimoRamoTrigger` e si sa se il POI e' partito dal perimetro, dal
    // cerchio o dalla predizione (con t_cpa/d_cpa nel motivo).
    reportTrigger('fired', { poiId: winner.id, accuracy, speed });
    (window as any).__wipUltimoRamoTrigger = {
      id: winner.id, ramo: winner.ramo, motivo: winner.motivo, dist: Math.round(winner.dist), modo, ts: now,
    };
    console.log(`[ForegroundTriggers] 🎯 Trigger web (${winner.ramo}/${winner.motivo}): ${winner.poi.name || winner.id} a ${Math.round(winner.dist)} m`);

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
  // Il grafo strade serve anche a puntoArrivo (per posare il civico
  // geocodificato sulla carreggiata): glielo si passa da qui, perche' un
  // import statico in puntoArrivo creerebbe un ciclo con i moduli geofencing.
  collegaGrafoStrade(roadSnap);
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
  azzeraGate();   // niente rinvii ereditati dal giro precedente
  azzeraFiltro(); // ne' una traccia GPS: al riavvio si riparte dal primo fix grezzo
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
