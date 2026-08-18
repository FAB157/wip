// =====================================================================
// ITAINTA · GPS Replay — registrazione e riproduzione di tracce GPS reali
//
// Harness di test per il geofencing WEB:
// - REGISTRAZIONE: se localStorage wip_gps_record === '1', ogni posizione
//   ricevuta dal geofencing web viene accumulata in wip_gps_trace (max
//   2000 punti, downsample automatico). L'aggancio NON tocca
//   locationService.ts: si ascolta l'evento 'wip-location-update' che
//   quel servizio emette già su window a ogni fix GPS.
// - REPLAY: startReplay() riproduce i punti accelerati (default x10)
//   nello STESSO entry-point delle posizioni reali
//   (locationService.injectMockLocation + evento 'wip-location-update'),
//   così i moduli a valle (WIP Nav, banner avvicinamento) reagiscono come
//   in strada. Durante il replay il watch GPS reale viene fermato e
//   riattivato alla fine: replay e geofencing reale non convivono mai.
//
// VINCOLO D'USO: il replay è pensato SOLO per il pannello admin
// (AdminDiagnostics); non va mai avviato con un tour reale in corso.
// =====================================================================

import { locationService } from '../../services/locationService';
import { getSessionCounters } from './telemetry';

export interface TracePoint {
  lat: number;
  lon: number;
  /** Accuratezza GPS in metri (opzionale). */
  accuracy?: number;
  /** Timestamp epoch ms del fix. */
  ts: number;
}

const RECORD_FLAG_KEY = 'wip_gps_record';
const TRACE_KEY = 'wip_gps_trace';
const MAX_POINTS = 2000;

// ── Registrazione ─────────────────────────────────────────────────

export function isRecordingEnabled(): boolean {
  try { return localStorage.getItem(RECORD_FLAG_KEY) === '1'; } catch { return false; }
}

export function setRecordingEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(RECORD_FLAG_KEY, '1');
    else localStorage.removeItem(RECORD_FLAG_KEY);
  } catch { /* storage non disponibile */ }
}

function readTrace(): TracePoint[] {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTrace(points: TracePoint[]): void {
  try { localStorage.setItem(TRACE_KEY, JSON.stringify(points)); } catch { /* pieno/bloccato */ }
}

/**
 * Accumula un punto nella traccia registrata. Oltre MAX_POINTS la traccia
 * viene dimezzata (si tiene un punto ogni due): si perde risoluzione, mai
 * la copertura dell'intero percorso.
 */
export function recordPosition(lat: number, lon: number, accuracy?: number, ts?: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const points = readTrace();
  points.push({
    lat,
    lon,
    accuracy: Number.isFinite(accuracy) ? Number(accuracy) : undefined,
    ts: Number.isFinite(ts) ? Number(ts) : Date.now(),
  });
  if (points.length > MAX_POINTS) {
    const halved = points.filter((_, i) => i % 2 === 0);
    writeTrace(halved);
  } else {
    writeTrace(points);
  }
}

export function getRecordedTrace(): TracePoint[] {
  return readTrace();
}

export function clearRecordedTrace(): void {
  try { localStorage.removeItem(TRACE_KEY); } catch { /* ignore */ }
}

/** Scarica la traccia registrata come file JSON (download browser). */
export function exportTrace(): void {
  const points = readTrace();
  const blob = new Blob([JSON.stringify(points, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wip_gps_trace_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Valida un JSON di traccia (upload file) e ritorna i punti utilizzabili. */
export function loadTrace(json: string): TracePoint[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Traccia non valida: atteso un array di punti');
  const points: TracePoint[] = [];
  for (const p of parsed) {
    const lat = Number(p?.lat ?? p?.latitude);
    const lon = Number(p?.lon ?? p?.lng ?? p?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    points.push({
      lat,
      lon,
      accuracy: Number.isFinite(Number(p?.accuracy)) ? Number(p.accuracy) : undefined,
      ts: Number.isFinite(Number(p?.ts ?? p?.timestamp)) ? Number(p.ts ?? p.timestamp) : 0,
    });
    if (points.length >= MAX_POINTS) break;
  }
  if (points.length === 0) throw new Error('Traccia vuota o senza punti validi');
  return points;
}

// ── Replay ────────────────────────────────────────────────────────

export interface ReplayStats {
  running: boolean;
  /** Punti già iniettati / totali della traccia. */
  sent: number;
  total: number;
  /** Trigger audioguida scattati durante il replay (evento wip-poi-trigger). */
  fired: number;
  /** Trigger soppressi durante il replay (da telemetry, cooldown/dedupe). */
  suppressed: number;
}

let replayState: {
  timer: ReturnType<typeof setTimeout> | null;
  stats: ReplayStats;
  countersAtStart: { suppressed: number; skipped: number };
  onTrigger: (e: Event) => void;
  onDone?: () => void;
} | null = null;

export function isReplaying(): boolean {
  return !!replayState?.stats.running;
}

export function getReplayStats(): ReplayStats {
  if (!replayState) return { running: false, sent: 0, total: 0, fired: 0, suppressed: 0 };
  const c = getSessionCounters();
  return {
    ...replayState.stats,
    suppressed:
      (c.suppressed - replayState.countersAtStart.suppressed) +
      (c.skipped - replayState.countersAtStart.skipped),
  };
}

/**
 * Riproduce una traccia nel geofencing web, accelerata (default x10).
 * Ferma il watch GPS reale per tutta la durata (mai due sorgenti di
 * posizione insieme) e lo riattiva alla fine. Ritorna false se un replay
 * è già in corso. Da usare SOLO dal pannello admin.
 */
export function startReplay(trace: TracePoint[], speed: number = 10, onDone?: () => void): boolean {
  if (replayState?.stats.running) return false;
  if (!Array.isArray(trace) || trace.length === 0) return false;
  const factor = Math.max(1, Number(speed) || 10);

  // Guardia: mai replay sopra il geofencing reale attivo
  locationService.stopWatching();

  const counters = getSessionCounters();
  const state = {
    timer: null as ReturnType<typeof setTimeout> | null,
    stats: { running: true, sent: 0, total: trace.length, fired: 0, suppressed: 0 },
    countersAtStart: { suppressed: counters.suppressed, skipped: counters.skipped },
    onTrigger: (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      state.stats.fired += 1;
      console.log(`[GpsReplay] 🎯 Trigger scattato: ${d.poi?.name || d.poiId || '?'} (totale: ${state.stats.fired})`);
    },
    onDone,
  };
  replayState = state;
  window.addEventListener('wip-poi-trigger', state.onTrigger);
  console.log(`[GpsReplay] ▶ Replay avviato: ${trace.length} punti a velocità x${factor} (watch GPS reale sospeso)`);

  const step = (idx: number) => {
    if (!replayState || replayState !== state || !state.stats.running) return;
    if (idx >= trace.length) { stopReplay(); return; }
    const p = trace[idx];
    try {
      // Stesso entry-point delle posizioni reali: i subscriber di
      // locationService (WIP Nav ecc.) ricevono il punto come un vero fix...
      locationService.injectMockLocation(p.lat, p.lon);
      // ...e i componenti a eventi (banner avvicinamento) ricevono
      // l'aggiornamento che locationService emette per i fix reali.
      window.dispatchEvent(new CustomEvent('wip-location-update', {
        detail: { lat: p.lat, lon: p.lon, heading: null },
      }));
      // Registra anche nel recorder? No: durante il replay la registrazione
      // inquinerebbe la traccia. Il recorder ignora i replay (vedi listener).
    } catch { /* un punto rotto non ferma il replay */ }
    state.stats.sent = idx + 1;

    // Intervallo reale tra i punti (dt), compresso del fattore di velocità;
    // tracce senza ts → 1 punto al secondo compresso.
    const dtRealMs = (trace[idx + 1]?.ts && p.ts && trace[idx + 1].ts > p.ts)
      ? trace[idx + 1].ts - p.ts
      : 1000;
    state.timer = setTimeout(() => step(idx + 1), Math.min(10_000, dtRealMs) / factor);
  };
  step(0);
  return true;
}

/** Ferma il replay e RIATTIVA il watch GPS reale. */
export function stopReplay(): void {
  const state = replayState;
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.stats.running = false;
  window.removeEventListener('wip-poi-trigger', state.onTrigger);
  console.log(`[GpsReplay] ⏹ Replay terminato: ${state.stats.sent}/${state.stats.total} punti, ${state.stats.fired} trigger scattati`);
  // Il geofencing reale riparte solo a replay concluso
  locationService.startWatching().catch(() => { /* permessi/ambiente senza GPS */ });
  try { state.onDone?.(); } catch { /* callback UI best-effort */ }
}

// ── Aggancio registrazione (side-effect al load del modulo) ───────
// locationService emette 'wip-location-update' su window a ogni fix GPS
// reale: se la registrazione è attiva, il punto finisce nella traccia.
// Durante un replay non si registra (si duplicherebbe la traccia stessa).
if (typeof window !== 'undefined') {
  window.addEventListener('wip-location-update', (e: Event) => {
    try {
      if (!isRecordingEnabled() || isReplaying()) return;
      const d = (e as CustomEvent).detail || {};
      recordPosition(Number(d.lat), Number(d.lon), undefined, Date.now());
    } catch { /* mai disturbare il flusso posizioni */ }
  });
}
