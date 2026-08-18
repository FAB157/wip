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
// - cooldown per-POI 6 h (localStorage 'wip_web_trigger_history')
// - throttle globale: max 1 trigger ogni 90 s
// - arbitraggio: il più vicino vince, con bonus gemme/premium
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { isFeatureEnabled } from '../featureFlags';
import { reportTrigger } from './telemetry';
import { locationService } from '../../services/locationService';

// ── Costanti (SPECULARI al canary server) ─────────────────────────
const ACCURACY_MAX_M = 50;          // fix con accuracy peggiore → scartato
const HAS_PASSED_M = 40;            // metri oltre il CPA = POI superato
const DEFAULT_TRIGGER_RADIUS_M = 50;
const GLOBAL_THROTTLE_MS = 90_000;  // max 1 trigger ogni 90 s
const POI_COOLDOWN_MS = 6 * 3_600_000; // 6 h per-POI
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

function triggerRadiusFor(poi: any): number {
  const eff = Number(poi?.eff_geofence_radius);
  if (Number.isFinite(eff) && eff > 0) return eff;
  const cat = String(poi?.category || '').toLowerCase();
  if (poi?.is_gem) return CATEGORY_RADIUS_M.gemme;
  return CATEGORY_RADIUS_M[cat] ?? DEFAULT_TRIGGER_RADIUS_M;
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
  const ts = readHistory()[poiId];
  return Number.isFinite(ts) && Date.now() - ts < POI_COOLDOWN_MS;
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
    const [{ getGeofencePois }, { isCategoryAllowed }] = await Promise.all([
      import('../../services/poiRepository'),
      import('../guideSettings'),
    ]);
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
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // Kill switch admin (fail-open) e audioguida attiva (stesso flag che
    // GeofenceAudioGuide sincronizza in locationService via syncSettings).
    if (!isFeatureEnabled('web_foreground_triggers')) return;
    if (!locationService.getIsTourActive()) return;

    void maybeRefreshCandidates(lat, lon);

    // Filtro accuracy: un fix scadente non deve né triggerare né inquinare
    // gli stati di avvicinamento (CPA falsati da salti di 100 m).
    const accuracy = Number(d.accuracy);
    if (Number.isFinite(accuracy) && accuracy > ACCURACY_MAX_M) return;

    if (candidates.length === 0) return;

    interface Eligible { poi: any; id: string; dist: number }
    const eligible: Eligible[] = [];
    const seenNear = new Set<string>();

    for (const poi of candidates) {
      const pLat = Number(poi?.lat);
      const pLon = Number(poi?.lon);
      if (!poi?.id || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
      if (poi.audio_enabled === false) continue;
      const id = String(poi.id);
      const dist = haversineMeters(lat, lon, pLat, pLon);
      const radius = triggerRadiusFor(poi);

      // Stati solo per i POI in zona (mappa piccola, pruning sotto)
      if (dist > radius * 4 + 200) { approachStates.delete(id); continue; }
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
      if (dist > st.minDist + HAS_PASSED_M) st.passed = true;
      if (dist < st.minDist) st.minDist = dist;

      if (dist <= radius && approaching && !st.passed) {
        eligible.push({ poi, id, dist });
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

/** Ferma i trigger e ripulisce gli stati di avvicinamento. */
export function stopForegroundTriggers(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('pois-updated', onPoisUpdated);
  window.removeEventListener('wip-location-update', boundOnLocationUpdate);
  approachStates.clear();
  candidates = [];
  candidatesAt = 0;
}

/** Stato per diagnostica/test. */
export function isForegroundTriggersActive(): boolean {
  return started;
}
