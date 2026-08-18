// =====================================================================
// ITAINTA · Telemetria trigger geofencing WEB (fire-and-forget)
//
// Sul nativo esiste già TriggerTelemetry (Kotlin/Swift); qui si copre il
// percorso web/WebView: ogni volta che il geofencing web fa scattare
// un'audioguida ('fired') o sopprime un trigger per cooldown/dedupe
// ('suppressed'/'skipped') si chiama reportTrigger.
//
// Vincoli: MAI bloccare il chiamante, catch sempre silenzioso, massimo
// UN POST ogni 10 secondi con coalescing (eventi identici accumulati nel
// campo `count` del body). Il server aggrega in api_cache per giorno.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { getApiUrl } from '../api';

export type TriggerTelemetryEvent = 'fired' | 'suppressed' | 'skipped';

interface QueuedEvent {
  event: TriggerTelemetryEvent;
  poiId?: string;
  accuracy?: number;
  speed?: number;
  ts: number;
  count: number;
}

const SEND_INTERVAL_MS = 10_000;
const MAX_QUEUE = 20;

const queue: QueuedEvent[] = [];
let lastSentAt = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Contatori di sessione (usati dal replay GPS per mostrare fired/suppressed
// in tempo reale senza dipendere dal server).
const sessionCounters: Record<TriggerTelemetryEvent, number> = {
  fired: 0,
  suppressed: 0,
  skipped: 0,
};

/** Piattaforma effettiva ('web' | 'android' | 'ios') per l'aggregato server. */
function currentPlatform(): string {
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios' ? p : 'web';
  } catch {
    return 'web';
  }
}

/** Invia UN evento coalescente dalla coda (mai più di uno ogni 10 s). */
function flushOne(): void {
  flushTimer = null;
  const item = queue.shift();
  if (!item) return;
  lastSentAt = Date.now();
  try {
    const body: Record<string, unknown> = {
      event: item.event,
      platform: currentPlatform(),
      ts: item.ts,
      count: item.count,
    };
    if (item.poiId) body.poiId = item.poiId;
    if (Number.isFinite(item.accuracy)) body.accuracy = item.accuracy;
    if (Number.isFinite(item.speed)) body.speed = item.speed;
    // keepalive: la POST sopravvive anche a un cambio pagina imminente
    fetch(getApiUrl('/api/telemetry/trigger'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => { /* telemetria: mai disturbare l'utente */ });
  } catch { /* idem */ }
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - lastSentAt));
  flushTimer = setTimeout(flushOne, wait);
}

/**
 * Registra un evento trigger del geofencing web. Fire-and-forget:
 * non ritorna nulla, non lancia mai, non blocca mai il chiamante.
 */
export function reportTrigger(
  event: TriggerTelemetryEvent,
  extra: { poiId?: string | number; accuracy?: number; speed?: number } = {},
): void {
  try {
    sessionCounters[event] = (sessionCounters[event] || 0) + 1;
    const poiId = extra.poiId !== undefined && extra.poiId !== null ? String(extra.poiId).slice(0, 64) : undefined;
    // Coalescing: stesso evento sullo stesso POI → si incrementa il count
    const existing = queue.find(q => q.event === event && q.poiId === poiId);
    if (existing) {
      existing.count = Math.min(50, existing.count + 1);
    } else if (queue.length < MAX_QUEUE) {
      queue.push({
        event,
        poiId,
        accuracy: Number.isFinite(extra.accuracy) ? Number(extra.accuracy) : undefined,
        speed: Number.isFinite(extra.speed) ? Number(extra.speed) : undefined,
        ts: Date.now(),
        count: 1,
      });
    }
    scheduleFlush();
  } catch { /* mai propagare */ }
}

/** Contatori di sessione (fired/suppressed/skipped dal load della pagina). */
export function getSessionCounters(): Record<TriggerTelemetryEvent, number> {
  return { ...sessionCounters };
}
