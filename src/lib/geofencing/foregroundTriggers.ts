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
import { radiiForTransport, luogoSenzaPorta, resolveTransportMode, isPlayed, isCategoryAllowed, PLAYED_COOLDOWN_MS,
  fiduciaPunto, fattoreFiducia, applicaFiducia, SOGLIA_ACCURATEZZA_TRIGGER_M,
  type LivelloFiducia, type TransportMode } from '../guideSettings';
import { valutaPredizione, stabilizzaFix, azzeraFiltro, type FixPredittore } from './predittore';
import { puntoArrivoSincrono, puntoStradaInCache, precaricaPuntoStrada, collegaGrafoStrade } from '../puntoArrivo';
import * as roadSnap from '../roadSnap';
import { getRoadIndex, getGrafoStrade, refreshRoadTile, shouldRefreshRoads } from '../roadSnap';
import { distanzaCheDecide, type SorgenteStrada } from './distanzaStrada';
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
// 10/09/2026 — tempo massimo di attesa della conferma "audio partito" prima
// di lasciare il POI di nuovo eleggibile (vedi markFired/pendingConfirmId più
// sotto). Più largo del throttle globale: un utente puo' restare un po' sul
// modale del paywall prima di decidere.
const CONFIRM_TIMEOUT_MS = 120_000;
const APPROACH_EPSILON_M = 0.5;     // isteresi minima per "in diminuzione"
const GEM_BONUS_M = 30;             // arbitraggio: le gemme "valgono" 30 m
const PREMIUM_BONUS_M = 20;
// (04/10/2026, test virtuale a Roma: davanti al Pantheon parlava una targa, in
// Piazza Navona un locale) UN LUOGO CON UNA FONTE VALE DI PIÙ. Chi ha una voce
// di Wikipedia/Wikidata alle spalle pesa 25 m nell'arbitraggio, e un luogo
// senza peso (né gemma né fonte) CEDE IL PASSO se uno che pesa sta arrivando
// entro 100 m di strada: altrimenti il primo luogo minore incontrato parla e i
// 90 s di silenzio che seguono si mangiano il monumento.
const FONTE_BONUS_M = 25;
const ATTESA_IMPORTANTE_M = 100;
const haFonte = (poi: any): boolean => /wiki/i.test(String(poi?.source || ''));
const pesa = (poi: any): boolean => !!poi?.is_gem || !!poi?.premium || haFonte(poi);
/** Il nome senza parentesi, accenti e articolo: «Pantheon (Roma)» e «The Pantheon» sono lo stesso luogo. */
const nomeNudo = (n: any): string => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, ' ').replace(/^(the|il|la|lo|le|i|gli|l')\s+/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
  // 01/09/2026: non piu' gated su hasEntrance - un raggio grezzo dal DB e'
  // una misura (o un default di categoria Overture) anche senza entrance
  // geocodificato, vedi guideSettings.ts::radiiForTransport.
  const calibrato = rawTrigger > 0;

  const r = radiiForTransport(modo, poi?.category, {
    geofenceRadius: rawTrigger || null,
    alertRadius: rawAlert || null,
    hasEntrance,
  }).trigger;

  // Il POI e' misurato: si rispetta la misura e ci si ferma qui. L'unico
  // limite che resta e' fisico, non di prodotto: sotto i 10 m il rumore del
  // GPS (5-15 m in citta') rende il cerchio un sorteggio.
  if (calibrato) return Math.max(r, MIN_TRIGGER_RADIUS_M);

  // (03/10/2026, committente: «deve essere a 30 m e 50 in auto») Niente più
  // default di categoria (musei 40, panorami 80) né bonus gemme (60): il raggio
  // d'arrivo è quello dell'utente, per tutti. Vedi radiiForTransport.
  let out = r;

  // 23/08/2026, rivisto 01/09/2026 — LA FIDUCIA NEL PUNTO. Un cerchio non e'
  // fatto solo di raggio: e' fatto di raggio E di centro. `fiduciaPunto`
  // resta per sapere se il centro e' un muro/porta/indirizzo o un centroide
  // incerto, ma `fattoreFiducia` non allarga piu' nessun livello (decisione
  // utente 01/09/2026: mai raddoppiare per incertezza). Il bonus gemme resta
  // dov'e': sta sotto i tetti e non viene mai stretto.
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

/**
 * Conferma che l'audio e' REALMENTE partito (10/09/2026). markFired/st.passed
 * segnavano il POI come "fatto" per 24 h al semplice DISPATCH di
 * 'wip-poi-trigger' — non quando la voce inizia. Se a valle il paywall viene
 * annullato, il TTS fallisce o la modalita' silenziosa lo zittisce, il POI
 * restava marcato come ascoltato senza che una sola parola fosse stata detta.
 * 'wip-audio-state-change' e' lo stesso evento che ttsService dispatcha per
 * la barra del player quando una voce (audioguida, agente, fallback) parte
 * davvero: qui non porta il poiId (non e' pensato per un feedback loop), ma
 * il throttle globale (GLOBAL_THROTTLE_MS) garantisce al massimo un trigger
 * "in volo" per volta, quindi il primo isPlaying:true dopo il dispatch e'
 * quello del nostro POI.
 */
function onAudioStateChange(e: Event): void {
  try {
    const detail = (e as CustomEvent).detail;
    if (!detail?.isPlaying || !pendingConfirmId) return;
    markFired(pendingConfirmId);
    const st = approachStates.get(pendingConfirmId);
    if (st) st.passed = true; // già servito: niente ri-valutazioni nello stesso passaggio
    if (pendingConfirmTimer) { clearTimeout(pendingConfirmTimer); pendingConfirmTimer = null; }
    pendingConfirmId = null;
  } catch { /* evento non disponibile: si resta in attesa, scade da solo */ }
}

// ── Stato del modulo ──────────────────────────────────────────────
let started = false;
let candidates: any[] = [];
let candidatesAt = 0;                 // ultimo aggiornamento lista (pois-updated o fetch proprio)
let lastOwnFetch: { ts: number; lat: number; lon: number } | null = null;
let ownFetchInFlight = false;
let lastGlobalFireTs = 0;
// POI in attesa di conferma "audio partito" (vedi onAudioStateChange) e il
// timer che, se la conferma non arriva, lo rilascia senza marcare il cooldown.
let pendingConfirmId: string | null = null;
let pendingConfirmTimer: ReturnType<typeof setTimeout> | null = null;
const approachStates = new Map<string, PoiApproachState>();
// Dove e quando si è valutato l'ultima volta (vedi «non si ricalcola se non ci si è mossi»).
let ultimaValutazione: { ts: number; lat: number; lon: number } | null = null;
// Luoghi pronti a parlare, fermati solo dal silenzio fra due guide (vedi dentroRaggio).
const inAttesa = new Set<string>();
// Parsimonia telemetria: 'suppressed' al massimo una volta per POI a sessione.
const suppressedReported = new Set<string>();

const onPoisUpdated = (e: Event) => {
  const pois = (e as CustomEvent).detail;
  if (!Array.isArray(pois)) return;
  candidates = pois;
  candidatesAt = Date.now();
  rivalutaConNuoviLuoghi();
};

// L'ELENCO DEI LUOGHI ARRIVA DOPO LA PRIMA POSIZIONE (05/10/2026, prova a New York:
// app aperta da fermi davanti al Chrysler Building, nessuna valutazione). Da fermi
// non arriva un altro fix: quando l'elenco cambia si rivaluta l'ultima posizione,
// così chi è già nel raggio entra in attesa e parla.
function rivalutaConNuoviLuoghi(): void {
  setTimeout(() => {
    try {
      if (!ultimoFix || Date.now() - ultimoFix.ts > 10 * 60_000) return;
      ultimaValutazione = null;
      onLocationUpdate(new CustomEvent('wip-location-update', { detail: { ...ultimoFix.detail, speed: 0, __daFermi: true } }));
    } catch { /* si rivaluterà al prossimo fix */ }
  }, 0);
}

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
    rivalutaConNuoviLuoghi();
  } catch { /* offline/circuit breaker: si riprova al prossimo giro utile */ }
  finally { ownFetchInFlight = false; }
}

/** Valutazione di un fix GPS: aggiorna gli stati di avvicinamento e decide. */
// DA FERMI IL GPS TACE (05/10/2026, collaudo a Firenze: fermo a 29 m dal Battistero e
// a 14 m dalla Colonna di San Zanobi, messi «in attesa» dal silenzio fra due guide, e
// poi muti per oltre due minuti). Il browser non manda posizioni a chi non si muove:
// senza un nuovo fix nessuno rivalutava chi aspettava il suo turno. Finché c'è
// qualcuno in attesa, l'ultima posizione si rivaluta da sola ogni 5 secondi.
// CHI STA PARLANDO DAVVERO (05/10/2026, prova a Parigi: la guida suonava ma né
// getAudioState().isPlaying né 'wip-audio-state-change' lo dicevano — la scheda fa
// partire la voce per più strade — e la conferma «audio partito» non arrivava mai:
// la Sainte-Chapelle è rimasta 120 s dietro a un «sta per partire» già partito).
// Si guarda il fatto: ogni elemento audio che parte nella pagina viene seguito
// (playing / pause / ended). Fuori i due suoni di servizio che tengono viva la
// pagina (data: e il tappeto mixkit) e tutto ciò che è muto.
const vociAttive = new Set<HTMLMediaElement>();
const vociSeguite = new WeakSet<HTMLMediaElement>();
let fineVoceTs = 0;
let playOriginale: ((this: HTMLMediaElement) => Promise<void>) | null = null;
function suonoDiServizio(el: HTMLMediaElement): boolean {
  const s = String(el.currentSrc || el.src || '');
  return !s || s.startsWith('data:audio') || s.includes('mixkit') || el.muted || el.volume === 0;
}
function seguiVoce(el: HTMLMediaElement): void {
  if (vociSeguite.has(el)) return;
  vociSeguite.add(el);
  const parte = () => {
    if (suonoDiServizio(el)) return;
    vociAttive.add(el);
    if (pendingConfirmId) onAudioStateChange(new CustomEvent('wip-audio-state-change', { detail: { isPlaying: true } }));
  };
  const finisce = () => { if (vociAttive.delete(el)) fineVoceTs = Date.now(); };
  el.addEventListener('playing', parte);
  el.addEventListener('pause', finisce);
  el.addEventListener('ended', finisce);
  el.addEventListener('error', finisce);
  el.addEventListener('emptied', finisce);
}
function unaVoceSuona(): boolean {
  for (const el of vociAttive) {
    if (el.paused || el.ended || suonoDiServizio(el)) { vociAttive.delete(el); fineVoceTs = Date.now(); }
  }
  return vociAttive.size > 0;
}
function ascoltaLeVoci(): void {
  try {
    if (playOriginale || typeof HTMLMediaElement === 'undefined') return;
    const originale = HTMLMediaElement.prototype.play;
    playOriginale = originale;
    // Anche il navigatore e l'arrivo alla meta chiedono «sta parlando qualcuno?».
    (window as any).__wipVoceInCorso = () => unaVoceSuona();
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      try { seguiVoce(this); } catch { /* si suona comunque */ }
      return originale.apply(this);
    };
  } catch { /* senza questo si resta alle due fonti di prima */ }
}

// Targa o lapide: dalla categoria, dall'id dell'archivio delle targhe o dal nome. Una gemma non è mai «solo una targa».
const TARGA_M = 100;
function eTarga(poi: any): boolean {
  if (!poi || poi.is_gem === true || poi.premium === true) return false;
  const cat = String(poi.category || '').toLowerCase();
  if (/plaque|targa|lapide|stolperstein/.test(cat)) return true;
  if (String(poi.id || '').startsWith('plaque-')) return true;
  return /\b(plaque|targa|lapide|stolperstein|gedenktafel|placa conmemorativa)\b/i.test(String(poi.name || poi.nome || ''));
}
/** C'è, entro 100 m dalla targa, un luogo che non è una targa (fra quelli che il setup lascia parlare)? */
function monumentoVicino(targa: any): boolean {
  const la = Number(targa?.lat), lo = Number(targa?.lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  const id = String(targa?.id ?? '');
  for (const p of candidates) {
    if (!p || String(p.id) === id || eTarga(p)) continue;
    const pla = Number(p.lat), plo = Number(p.lon);
    if (!Number.isFinite(pla) || !Number.isFinite(plo)) continue;
    if (Math.abs(pla - la) > 0.0012 || Math.abs(plo - lo) > 0.002) continue;
    if (haversineMeters(la, lo, pla, plo) <= TARGA_M) return true;
  }
  return false;
}

// Luoghi a cui la guida è già stata preparata in questa sessione, e quando (tetto 3 al minuto).
const guidePreparate = new Set<string>();
const preparazioniTs: number[] = [];
let ultimoEsternoTs = 0;
// L'ultima volta che, valutando, si è trovata una guida in riproduzione.
let ultimaVoceVistaTs = 0;
let ultimoFix: { detail: any; ts: number } | null = null;
let battitoAttesa: ReturnType<typeof setInterval> | null = null;
function rivalutaDaFermi(): void {
  // (07/10/2026, Los Angeles) Non più «solo se qualcuno è in attesa»: davanti al TCL Chinese Theatre
  // (27 m, fermo) il gate di bussola aveva rimandato la guida e nessuna rivalutazione è più arrivata
  // per 5 minuti — il browser non manda fix a chi sta fermo e l'insieme in attesa può essere stato
  // azzerato da uno stop/start del motore (cambio scheda, impostazioni). Da fermi si valuta una volta
  // ogni 5 s comunque: il costo è quello già previsto dalla regola «una valutazione ogni 4 s da fermi».
  try { if ((window as any).__wipTestVirtuale === true) (window as any).__wipBattitoFermi = { ts: Date.now(), fix: ultimoFix ? Date.now() - ultimoFix.ts : null }; } catch { /* niente */ }
  if (!ultimoFix) return;
  const adesso = Date.now();
  if (adesso - ultimoFix.ts < 5000 || adesso - ultimoFix.ts > 10 * 60_000) return;
  onLocationUpdate(new CustomEvent('wip-location-update', { detail: { ...ultimoFix.detail, speed: 0, __daFermi: true } }));
}

// Diagnosi delle uscite anticipate, solo a test virtuale acceso (07/10/2026, Los Angeles: da fermi davanti alla
// Walk of Fame nessuna valutazione lasciava traccia e non si capiva DOVE il motore uscisse).
function diagUscita(esito: string): void {
  try { if ((window as any).__wipTestVirtuale === true) (window as any).__wipDiagTrigger = { ts: Date.now(), esito, luoghi: [] }; } catch { /* niente */ }
}

function onLocationUpdate(e: Event): void {
  try {
    const d = (e as CustomEvent).detail || {};
    let lat = Number(d.lat);
    let lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (!d.__daFermi) ultimoFix = { detail: d, ts: Date.now() };

    // Kill switch admin (fail-open) e audioguida attiva (stesso flag che
    // GeofenceAudioGuide sincronizza in locationService via syncSettings).
    if (!isFeatureEnabled('web_foreground_triggers')) { diagUscita('motore spento (feature flag)'); return; }
    if (!locationService.getIsTourActive()) { diagUscita('audioguida spenta'); return; }
    // Dieci Tappe: durante un giro l'audio lo governa lib/tour/giroDriver
    // (guida piena alle tappe, teaser agli incontri). Se questo modulo
    // continuasse a scattare, la stessa tappa parlerebbe due volte.
    if (tourService.inCorso()) { diagUscita('giro in corso: parla il giro'); return; }
    // WIP Nav verso una meta (05/10/2026): parlano solo i luoghi scelti nel suo
    // modale, e li fa scattare lui (useWalkingNavigation.checkRoutePois). Senza
    // questa uscita i due motori facevano partire due luoghi nello stesso momento.
    if ((window as any).__wipNavAttivo === true) { diagUscita('navigatore attivo: parla il navigatore'); return; }

    void maybeRefreshCandidates(lat, lon);

    // Filtro accuracy: un fix scadente non deve né triggerare né inquinare
    // gli stati di avvicinamento (CPA falsati da salti di 100 m).
    const accuracy = Number(d.accuracy);
    if (Number.isFinite(accuracy) && accuracy > ACCURACY_MAX_M) { diagUscita(`fix scartato: accuratezza ${Math.round(accuracy)} m`); return; }

    if (candidates.length === 0) { diagUscita('nessun luogo caricato'); return; }

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
    // (04/10/2026, CONSUMO) NON SI RICALCOLA SE NON CI SI È MOSSI. Misurato a Roma:
    // 73 ms di calcolo a ogni posizione sul PC (sul telefono molti di più), una
    // posizione al secondo, anche da fermi. Se dall'ultima valutazione ci si è
    // spostati di meno di 3 m e sono passati meno di 4 s non cambia niente che
    // conti (i raggi sono 30 e 150 m): si esce. Da fermi si valuta una volta
    // ogni 4 s — abbastanza perché un luogo in attesa parli appena tocca a lui.
    {
      const adesso = Date.now();
      if (ultimaValutazione && adesso - ultimaValutazione.ts < 4000
          && haversineMeters(lat, lon, ultimaValutazione.lat, ultimaValutazione.lon) < 3) return;
      ultimaValutazione = { ts: adesso, lat, lon };
    }
    if (shouldRefreshRoads(lat, lon)) void refreshRoadTile(lat, lon);
    // Il punto PRIMA dell'aggancio alla strada: serve sotto, per non fidarsi di un aggancio sbagliato.
    const latLibero = lat, lonLibero = lon;
    const snappato = getRoadIndex()?.snap(lat, lon, Number.isFinite(accuracy) ? accuracy : 20, modo === 'car' ? 'car' : 'walk');
    if (snappato) { lat = snappato.lat; lon = snappato.lon; }

    // Le distanze di strada da QUI, calcolate una volta per fix e poi lette
    // per ogni luogo. null = utente fuori rete o tile non ancora arrivata.
    // (04/10/2026, CONSUMO) La ricerca sulla rete si ferma poco oltre il raggio
    // d'avviso: prima arrivava a 450 m a piedi e 700 in auto, tre volte più
    // lontano di quanto serva a decidere avviso (150/300) e arrivo (30/50). Oltre
    // il limite `verso()` risponde Infinity (lontano), non «strada sconosciuta».
    let limiteStrada = modo === 'car' ? 400 : 230;
    try { limiteStrada = Math.max(limiteStrada, radiiForTransport(modo, null, null).alert + 80); } catch { /* default */ }
    let sorgenteStrada: SorgenteStrada | null = null;
    try {
      sorgenteStrada = getGrafoStrade(modo === 'car' ? 'car' : 'walk')?.da(lat, lon, limiteStrada) ?? null;
    } catch { sorgenteStrada = null; }
    // L'AGGANCIO PUÒ SBAGLIARE VIA (04/10/2026, test a Roma: Palazzo Doria-Pamphili
    // scattato a 99 m di strada). Accanto a un incrocio l'aggancio può posare il
    // telefono sulla via parallela, e da lì il luogo risulta «a 30 m». Se l'aggancio
    // ha spostato il punto di più di 5 m si misura ANCHE dal punto non agganciato, e
    // vale la distanza PIÙ LUNGA delle due: la guida parte solo se entrambe la danno
    // nel raggio. Davanti alla porta le due misure coincidono.
    let sorgenteLibera: SorgenteStrada | null = null;
    if (snappato && haversineMeters(latLibero, lonLibero, lat, lon) > 5) {
      // Serve solo a confermare un ARRIVO: basta guardare poco oltre il raggio d'arrivo.
      try { sorgenteLibera = getGrafoStrade(modo === 'car' ? 'car' : 'walk')?.da(latLibero, lonLibero, modo === 'car' ? 150 : 100) ?? null; } catch { sorgenteLibera = null; }
    }

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
    let importantiInArrivo = 0;
    let daPreparare: { poi: any; dist: number } | null = null;
    let raggioAvvisoUtente = 150;
    try { raggioAvvisoUtente = radiiForTransport(modo, null, null).alert || 150; } catch { /* default */ }

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
      // (04/10/2026, consumo) I LONTANI SI SALTANO SUBITO. In un centro storico i
      // candidati sono più di mille e per ognuno, a ogni posizione, si calcolavano
      // punto d'arrivo, fiducia e metri di strada: un blocco di ~150 ms a fix,
      // il processore occupato per il 22% del tempo (misurato a Roma). Oltre
      // 500 m in linea d'aria dal centro un luogo non può essere né nel raggio
      // d'arrivo né in quello d'avviso; restano fuori dal salto solo i luoghi
      // senza porta, il cui perimetro può arrivare lontano dal centro.
      if (!approachStates.has(id) && haversineMeters(lat, lon, pLat, pLon) > 500 && !luogoSenzaPorta(poi)) continue;
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
      // METRI DI STRADA, non linea d'aria (03/10/2026): dalla via parallela o
      // dal retro dell'isolato il luogo è «a 20 m» solo sulla carta. La linea
      // d'aria resta dove una strada da misurare non c'è (utente o luogo fuori
      // rete, tile non ancora scaricata). Vedi distanzaStrada.ts.
      const aria = haversineMeters(lat, lon, arrivo.lat, arrivo.lon);
      const radius = triggerRadiusFor(poi, modo, fiducia);
      // (CONSUMO) Oltre il limite in linea d'aria la strada non può essere più
      // corta: niente ricerca sulla rete, il luogo è «lontano» e basta.
      let dist = aria > limiteStrada ? aria : distanzaCheDecide(aria, sorgenteStrada ? sorgenteStrada.verso(arrivo.lat, arrivo.lon) : null);
      if (sorgenteLibera && dist <= radius) {
        const ariaLibera = haversineMeters(latLibero, lonLibero, arrivo.lat, arrivo.lon);
        dist = Math.max(dist, distanzaCheDecide(ariaLibera, sorgenteLibera.verso(arrivo.lat, arrivo.lon)));
      }

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
      // (03/10/2026) Solo per i luoghi senza porta (piazze, parchi, ponti,
      // panorami): per un edificio conta il punto d'arrivo. Vedi luogoSenzaPorta.
      // RETE DI SICUREZZA PER GLI EDIFICI IMPORTANTI (committente 05/10/2026, «rete
      // sicurezza ok»). Con 30 m esatti dal punto d'arrivo un punto sbagliato vuol
      // dire silenzio: Notre-Dame aveva il punto sul lato nord ed era muta davanti
      // ai portali, la Sainte-Chapelle non ne aveva affatto. Gli ingressi calcolati
      // sono giusti circa 4 volte su 5 e non si correggono a mano su milioni di
      // luoghi. Per un edificio che PESA (gemma o con fonte), A PIEDI, chi è a 30 m
      // dal muro c'è: la guida parte anche se il punto d'arrivo dice altro. Per
      // tutti gli altri edifici la regola resta il punto d'arrivo; in auto anche.
      const senzaPorta = luogoSenzaPorta(poi);
      const reteSicurezza = !senzaPorta && modo !== 'car' && pesa(poi);
      const distPerimetro = (senzaPorta || reteSicurezza) ? distanzaDalPerimetro(id, lat, lon) : Infinity;
      const alPerimetro = distPerimetro <= (senzaPorta && modo === 'car' ? PERIMETER_TRIGGER_CAR_M : PERIMETER_TRIGGER_WALK_M);
      const inside = distPerimetro === 0;

      // Stati solo per i POI in zona (mappa piccola, pruning sotto)
      if (!alPerimetro && dist > radius * 4 + 200) { approachStates.delete(id); continue; }
      seenNear.add(id);

      const st = approachStates.get(id);
      if (!st) {
        // Primo avvistamento: si registra, si triggera dal fix successivo
        // (serve l'evidenza dell'avvicinamento).
        approachStates.set(id, { minDist: dist, prevDist: dist, passed: false });
        // GIÀ DENTRO IL RAGGIO AL PRIMO SGUARDO (05/10/2026, committente: «risolvi»):
        // chi apre l'app fermo davanti a un luogo non si «avvicina» mai e non
        // sentiva nulla. Entra in attesa: parla alla prossima valutazione (da
        // fermi ci pensa rivalutaDaFermi), con le stesse precedenze degli altri.
        if (dist <= radius && !isInCooldown(id)) inAttesa.add(id);
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
      // (03/10/2026, committente: «la previsione la toglierei del tutto») Il
      // predittore resta per la telemetria, ma non anticipa più lo scatto: la
      // guida parte solo dentro il raggio scelto dall'utente (o sul perimetro
      // dei luoghi senza porta). Parità con PredictiveTrigger.kt/.swift.
      const predetto = false;

      // A 30 M DAL PERIMETRO (o dentro) batte tutto il resto.
      //
      // Le due condizioni che valgono per il cerchio — "ti stai avvicinando"
      // e "non l'hai gia' superato" — sono misurate sull'ingresso, e accanto
      // a un edificio grande sono sbagliate: camminando lungo la facciata di
      // una basilica di 120 metri ci si allontana dall'ingresso per meta' del
      // percorso, e il codice a raggi lo leggerebbe come "sta andando via".
      // Se sei a 30 m dal muro, ci sei: il cooldown di 24 ore basta a evitare
      // che parli due volte. Il cerchio resta per i POI senza perimetro.
      // (04/10/2026, test a Roma: arrivati alla Fontana di Trevi mentre parlava il
      // Teatro Quirino, la fontana è rimasta muta — da fermi non ci si «avvicina»
      // più) Chi era pronto a parlare ed è stato fermato solo dal silenzio fra due
      // guide resta IN ATTESA: finché si è nel raggio parla appena tocca a lui,
      // anche da fermi. Uscendo dal raggio l'attesa cade.
      if (dist > radius) inAttesa.delete(id);
      // Il più vicino fra quelli in arrivo dentro il raggio d'avviso: gli si prepara la guida (vedi sotto).
      if (approaching && !st.passed && dist > radius && dist <= raggioAvvisoUtente && !guidePreparate.has(id)
          && (!daPreparare || (pesa(poi) && !pesa(daPreparare.poi)) || (pesa(poi) === pesa(daPreparare.poi) && dist < daPreparare.dist))) {
        daPreparare = { poi, dist };
      }
      const dentroRaggio = dist <= radius && !st.passed && (approaching || inAttesa.has(id));
      // Un luogo che pesa sta arrivando (non ancora nel raggio): chi non pesa gli cede il passo.
      if (!dentroRaggio && !alPerimetro && approaching && !st.passed && dist <= ATTESA_IMPORTANTE_M && pesa(poi) && !isInCooldown(id)) importantiInArrivo += 1;
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

    // DIAGNOSI PER IL TEST VIRTUALE (solo a test acceso): perché a questa posizione
    // ha parlato — o non ha parlato — qualcuno. Si legge da window.__wipDiagTrigger.
    const diagnosi = (esito: string, lista?: Eligible[]) => {
      try {
        if ((window as any).__wipTestVirtuale !== true) return;
        (window as any).__wipDiagTrigger = { ts: Date.now(), esito, luoghi: (lista || eligible).slice(0, 6).map(c => `${c.poi?.name || c.id} (${Math.round(c.dist)} m${pesa(c.poi) ? ', pesa' : ''})`) };
      } catch { /* la diagnosi non ferma nulla */ }
    };
    // LA GUIDA SI PREPARA ALL'AVVISO, COME SUL NATIVO (05/10/2026, prova a New York: la
    // voce arrivava 28–66 s dopo lo scatto). Sul web nessuno chiedeva il testo prima
    // dell'arrivo: l'evento `poiApproaching` lo manda solo il servizio nativo. Qui si
    // chiede il testo del luogo più vicino in arrivo dentro il raggio d'avviso —
    // senza addebito e senza contare un ascolto (prefetch) — una volta per luogo,
    // al più 3 al minuto, e solo se passerebbe il trigger.
    if (daPreparare) {
      const adesso = Date.now();
      while (preparazioniTs.length && adesso - preparazioniTs[0] > 60_000) preparazioniTs.shift();
      const p = (daPreparare as { poi: any; dist: number }).poi;
      if (preparazioniTs.length < 3 && passerebbeIlTrigger(p) && !(eTarga(p) && monumentoVicino(p))) {
        preparazioniTs.push(adesso);
        guidePreparate.add(String(p.id));
        void (async () => {
          try {
            const [{ getOrCreateAudioguideText }, { linguaCorrente }] = await Promise.all([
              import('../../services/audioguideService'), import('../i18n'),
            ]);
            const personaggio = (localStorage.getItem('wip_guide_character') || 'nicky') as any;
            await getOrCreateAudioguideText(p, linguaCorrente(), personaggio, { incrementPlay: false });
          } catch { /* si genererà all'arrivo */ }
        })();
      }
    }

    if (eligible.length === 0) { diagUscita(`nessun luogo eleggibile (${candidates.length} caricati, ${approachStates.size} seguiti)`); return; }

    const now = Date.now();
    // Uno scatto fatto da un ALTRO motore (navigatore, arrivo alla meta, giro) conta
    // come nostro per il silenzio fra due guide: lo si legge dal segno condiviso.
    try {
      const esterno = Number((window as any).__wipLastPoiTrigger?.ts) || 0;
      if (esterno > lastGlobalFireTs && esterno <= now) { lastGlobalFireTs = esterno; ultimoEsternoTs = esterno; }
    } catch { /* nessun segno */ }

    // Cooldown per-POI (6 h, persistente) e dedupe recente condiviso
    // (__wipLastPoiTrigger, stesso meccanismo di WIP Nav e deep link).
    const lastTrig = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
    // STESSO NOME APPENA RACCONTATO DA UN ALTRO MOTORE (05/10/2026, prova a Roma: il
    // navigatore racconta «Piazza Navona», arriva, si spegne, e 20 s dopo questo
    // motore la fa ripartire con un'altra riga dello stesso luogo, sopra la prima).
    const nomeAppenaDetto = lastTrig.nome && now - lastTrig.ts < 10 * 60_000 ? nomeNudo(String(lastTrig.nome)) : '';
    const ready = eligible.filter(c => {
      // TARGHE E LAPIDI IN SILENZIO SE C'È UN MONUMENTO VICINO (committente 05/10/2026,
      // prova a Parigi: sull'Île de la Cité le targhe parlavano prima di Notre-Dame).
      // Non entrano nel cooldown: lontano dai monumenti una targa parla come prima.
      if (eTarga(c.poi) && monumentoVicino(c.poi)) return false;
      if (nomeAppenaDetto && nomeNudo(String(c.poi?.name || '')) === nomeAppenaDetto) {
        try { markFired(c.id); } catch { /* storage non disponibile */ }
        return false;
      }
      if (isInCooldown(c.id) || (String(lastTrig.id) === c.id && now - lastTrig.ts < 60_000)) {
        if (!suppressedReported.has(c.id)) {
          suppressedReported.add(c.id);
          reportTrigger('suppressed', { poiId: c.id, accuracy, speed });
        }
        return false;
      }
      return true;
    });
    if (ready.length === 0) { diagnosi('tutti già ascoltati o appena scattati'); return; }
    // Chi è nel raggio e non è in cooldown resta IN ATTESA qualunque cosa lo fermi
    // adesso (bussola, silenzio fra due guide, precedenza a un altro): da fermi
    // davanti al luogo deve poter parlare appena tocca a lui.
    for (const x of ready) inAttesa.add(x.id);

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
    let davanti = ready.filter(c => {
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
      diagnosi('rimandati: tutti alle spalle', ready);
      return;
    }

    // MAI SOPRA UNA GUIDA CHE STA PARLANDO O CHE STA PER PARTIRE (05/10/2026, prova a
    // New York: l'acquedotto Croton scatta, il testo arriva dopo 65 s, e 26 s dopo
    // l'inizio della voce un altro luogo gli parla sopra — i 90 s si contavano dallo
    // scatto, non dalla voce). Finché la guida suona, o è stata chiesta e non è ancora
    // partita, si aspetta; dopo la fine servono 20 s di silenzio.
    {
      let suona = false;
      try { suona = !!locationService.getAudioState().isPlaying; } catch { suona = false; }
      if (!suona) suona = unaVoceSuona();
      if (suona) ultimaVoceVistaTs = now;
      ultimaVoceVistaTs = Math.max(ultimaVoceVistaTs, fineVoceTs);
      // «Sta per partire» vale 75 s dallo scatto (il testo più lento visto: 66 s): oltre,
      // la guida non è partita e non si tiene muto tutto il resto.
      const inPartenza = !!pendingConfirmId && now - lastGlobalFireTs < 75_000;
      // (prova a Parigi) La pausa era 20 s: finita la guida della piazza, Notre-Dame
      // aspettava ancora e intanto si usciva dal suo raggio. 10 s bastano a staccare.
      // Un luogo che pesa e sta aspettando il suo turno parte dopo 3 s: la Sainte-Chapelle,
      // a 12 m, perdeva il turno perché chi ascolta riparte appena la voce tace.
      const pausaMs = davanti.some(c => pesa(c.poi)) ? 3_000 : 10_000;
      if (suona || inPartenza || now - ultimaVoceVistaTs < pausaMs) {
        for (const x of davanti) inAttesa.add(x.id);
        diagnosi(suona ? 'in attesa: una guida sta parlando' : inPartenza ? 'in attesa: una guida sta per partire' : 'in attesa: pausa dopo la guida', davanti);
        return;
      }
    }

    // Throttle globale: mai più di un trigger ogni 90 s (i candidati restano
    // eleggibili ai fix successivi finché non superano il POI).
    // (04/10/2026, test a Roma: il Teatro Quirino parla e 50 s dopo la Fontana di
    // Trevi resta muta) UN LUOGO CHE PESA NON ASPETTA I 90 SECONDI: gli basta che
    // la guida precedente sia PARTITA e FINITA (conferma arrivata, audio fermo) e
    // che siano passati 20 s. I luoghi senza peso aspettano come prima.
    let eccezioneImportante = false;
    // Dopo uno scatto di un ALTRO motore non si sa se la sua guida è partita e finita:
    // lì l'eccezione non vale, si aspettano i 90 secondi interi.
    if (now - lastGlobalFireTs < GLOBAL_THROTTLE_MS && now - lastGlobalFireTs >= 20_000 && !pendingConfirmId
        && lastGlobalFireTs !== ultimoEsternoTs) {
      let parla = true;
      try { parla = locationService.getAudioState().isPlaying; } catch { parla = true; }
      const soloImportanti = davanti.filter(c => pesa(c.poi));
      if (!parla && soloImportanti.length > 0) { eccezioneImportante = true; davanti = soloImportanti; }
    }
    if (!eccezioneImportante && now - lastGlobalFireTs < GLOBAL_THROTTLE_MS) {
      for (const x of davanti) inAttesa.add(x.id);
      const c = davanti[0];
      if (!suppressedReported.has(`global:${c.id}`)) {
        suppressedReported.add(`global:${c.id}`);
        reportTrigger('suppressed', { poiId: c.id, accuracy, speed });
      }
      diagnosi('in attesa: silenzio fra due guide', davanti);
      return;
    }

    // Arbitraggio: vince il più vicino, con bonus d'importanza gemme/premium.
    davanti.sort((a, b) => {
      const score = (c: Eligible) =>
        // (06/10/2026, Sainte-Chapelle a 8 m battuta dalla Grand-Salle a 10 m) La RPC
        // get_geofence_pois non restituisce `is_gem`, solo `premium` (= is_gem): una gemma
        // prendeva 20 m di vantaggio invece di 50 e perdeva contro un luogo con fonte (25).
        c.dist - ((c.poi.is_gem || c.poi.premium) ? GEM_BONUS_M + PREMIUM_BONUS_M : 0) - (haFonte(c.poi) ? FONTE_BONUS_M : 0);
      return score(a) - score(b);
    });
    const winner = davanti[0];
    // Il vincitore non pesa e un luogo che pesa è a meno di 100 m: si aspetta
    // quello. Niente cooldown, niente throttle consumato: se il luogo importante
    // non arriva (si svolta prima), il minore resta eleggibile al fix dopo.
    if (!pesa(winner.poi) && !winner.inside && winner.poi?.isFromItinerary !== true && importantiInArrivo > 0) {
      if (!suppressedReported.has(`attesa:${winner.id}`)) {
        suppressedReported.add(`attesa:${winner.id}`);
        reportTrigger('skipped', { poiId: winner.id, accuracy, speed });
      }
      diagnosi('il minore cede il passo: un luogo che pesa sta arrivando', davanti);
      return;
    }
    diagnosi(`scatta ${winner.poi?.name || winner.id}`, davanti);

    lastGlobalFireTs = now;
    // Il cooldown 24 h (markFired/st.passed) NON si marca qui: si aspetta la
    // conferma "audio partito" in onAudioStateChange. Il dedupe condiviso a
    // 60 s (__wipLastPoiTrigger, poco sotto) resta immediato: basta a evitare
    // un doppio dispatch mentre si aspetta la conferma.
    if (pendingConfirmTimer) clearTimeout(pendingConfirmTimer);
    pendingConfirmId = winner.id;
    pendingConfirmTimer = setTimeout(() => {
      if (pendingConfirmId === winner.id) pendingConfirmId = null;
      pendingConfirmTimer = null;
    }, CONFIRM_TIMEOUT_MS);

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
    // I DOPPIONI DELLO STESSO LUOGO (il Pantheon ha dieci righe visibili): chi ha
    // lo stesso nome entro 150 m è lo stesso luogo, e non deve parlare di nuovo
    // fra novanta secondi. Entra nel cooldown insieme al vincitore.
    try {
      const nv = nomeNudo(winner.poi.name || winner.poi.nome);
      if (nv.length >= 4) {
        for (const p of candidates) {
          const idp = String(p?.id ?? '');
          if (!idp || idp === winner.id) continue;
          const np = nomeNudo(p.name || p.nome);
          if (!np || !(np === nv || (np.length >= 6 && nv.length >= 6 && (np.includes(nv) || nv.includes(np))))) continue;
          if (haversineMeters(Number(p.lat), Number(p.lon), Number(winner.poi.lat), Number(winner.poi.lon)) > 150) continue;
          markFired(idp);
          const sp = approachStates.get(idp);
          if (sp) sp.passed = true;
        }
      }
    } catch { /* un nome strano non ferma lo scatto */ }
    inAttesa.delete(winner.id);
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
  } catch (e: any) {
    // Un fix rotto non deve mai rompere il flusso posizioni; ma a test acceso l'errore si deve VEDERE
    // (07/10/2026: un'eccezione silenziosa qui è indistinguibile da «nessuna rivalutazione»).
    try { if ((window as any).__wipTestVirtuale === true) (window as any).__wipDiagTrigger = { ts: Date.now(), esito: `errore: ${String(e?.message || e).slice(0, 120)}`, luoghi: [] }; } catch { /* niente */ }
  }
}

/**
 * Il browser ha rifiutato l'audio automatico (vedi locationService.playAudio): il
 * luogo in attesa di conferma si considera SERVITO — la scheda è aperta e chiede
 * un tocco — altrimenti, senza conferma «audio partito», riscatterebbe ogni due
 * minuti finché si resta nel raggio.
 */
function onAudioBloccato(): void {
  try {
    if (!pendingConfirmId) return;
    markFired(pendingConfirmId);
    const st = approachStates.get(pendingConfirmId);
    if (st) st.passed = true;
    inAttesa.delete(pendingConfirmId);
    if (pendingConfirmTimer) { clearTimeout(pendingConfirmTimer); pendingConfirmTimer = null; }
    pendingConfirmId = null;
  } catch { /* si resta com'era */ }
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
  window.addEventListener('wip-audio-state-change', onAudioStateChange);
  window.addEventListener('wip-audio-bloccato', onAudioBloccato);
  battitoAttesa = setInterval(rivalutaDaFermi, 5000);
  // Riacceso da fermi: si rivaluta subito l'ultima posizione nota (vedi stopForegroundTriggers).
  if (ultimoFix) setTimeout(() => { try { ultimaValutazione = null; rivalutaDaFermi(); } catch { /* al prossimo battito */ } }, 1500);
  ascoltaLeVoci();
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
  window.removeEventListener('wip-audio-state-change', onAudioStateChange);
  window.removeEventListener('wip-audio-bloccato', onAudioBloccato);
  if (pendingConfirmTimer) { clearTimeout(pendingConfirmTimer); pendingConfirmTimer = null; }
  if (battitoAttesa) { clearInterval(battitoAttesa); battitoAttesa = null; }
  // `ultimoFix` resta (07/10/2026): è la posizione, non uno stato del trigger. Chi riaccende il motore
  // stando fermo (cambio scheda, impostazioni) altrimenti non veniva più valutato finché non si muoveva.
  pendingConfirmId = null;
  approachStates.clear();
  inAttesa.clear();
  azzeraGate();   // niente rinvii ereditati dal giro precedente
  azzeraFiltro(); // ne' una traccia GPS: al riavvio si riparte dal primo fix grezzo
  candidates = [];
  candidatesAt = 0;
  // Prima restavano: il throttle globale (un giro spento e riacceso partiva
  // gia' "in attesa"), la telemetria dei soppressi e il fetch proprio.
  lastGlobalFireTs = 0;
  suppressedReported.clear();
  lastOwnFetch = null;
  ultimaValutazione = null;
  ownFetchInFlight = false;
}

/** Stato per diagnostica/test. */
export function isForegroundTriggersActive(): boolean {
  return started;
}
