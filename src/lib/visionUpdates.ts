import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { getApiUrl } from './api';
import { getTranslation, Language } from './i18n';

/**
 * Novità sulle proprie Vision (GET /api/vision/my-updates): schede approvate
 * o rifiutate dall'admin dopo l'ultima volta che l'utente le ha viste.
 * Il "visto" vive in localStorage (`wip_vision_updates_seen`, ISO): finché
 * l'utente non preme Ok il banner resta.
 *
 * Profili e nomi sono SEMPRE anonimi: qui non passa nessun nickname, l'unica
 * statistica è quella personale (`stats`), senza nomi di altri utenti.
 */

export const VISION_UPDATES_SEEN_KEY = 'wip_vision_updates_seen';
const VISION_UPDATES_NOTIFIED_KEY = 'wip_vision_updates_notified';
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface VisionApprovedUpdate {
  id: string;
  name: string;
  published_poi_id: string | null;
  reviewed_at: string;
  /** Crediti accreditati (10 nuovo POI / 3 accorpata / +5 bonus zona). */
  rewarded: number | null;
  merged: boolean;
}

export interface VisionRejectedUpdate {
  id: string;
  name: string;
  reject_reason: string | null;
  reject_note: string | null;
  reviewed_at: string;
}

export interface VisionStats {
  month: string;
  my_published: number;
  my_rank: number | null;
  total_contributors: number;
}

export interface VisionUpdates {
  approved: VisionApprovedUpdate[];
  rejected: VisionRejectedUpdate[];
  stats: VisionStats | null;
  now: string;
}

export function getVisionUpdatesSeen(): string | null {
  try {
    const v = localStorage.getItem(VISION_UPDATES_SEEN_KEY);
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function markVisionUpdatesSeen(nowIso?: string) {
  try {
    const iso = nowIso && !Number.isNaN(Date.parse(nowIso)) ? nowIso : new Date().toISOString();
    localStorage.setItem(VISION_UPDATES_SEEN_KEY, iso);
  } catch { /* storage non disponibile */ }
}

/**
 * Legge le novità dal server. `null` = utente non loggato o rete assente
 * (il chiamante non mostra nulla).
 */
export async function fetchVisionUpdates(): Promise<VisionUpdates | null> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return null;
    const since = getVisionUpdatesSeen() || new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();
    const res = await fetch(getApiUrl(`/api/vision/my-updates?since=${encodeURIComponent(since)}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const stats: VisionStats | null = data.stats && typeof data.stats === 'object'
      ? {
          month: String(data.stats.month || ''),
          my_published: num(data.stats.my_published) ?? 0,
          my_rank: num(data.stats.my_rank),
          total_contributors: num(data.stats.total_contributors) ?? 0,
        }
      : null;
    return {
      approved: Array.isArray(data.approved) ? data.approved : [],
      rejected: Array.isArray(data.rejected) ? data.rejected : [],
      stats,
      now: typeof data.now === 'string' ? data.now : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Etichetta tradotta del motivo di rifiuto (enum della spec; sconosciuto → "Altro"). */
export function visionRejectReasonLabel(reason: string | null | undefined, language: Language): string {
  const known = ['duplicate', 'not_a_place', 'photo_quality', 'people', 'inappropriate', 'other'];
  const key = reason && known.includes(reason) ? reason : 'other';
  return getTranslation(`vis_reason_${key}`, language);
}

/**
 * Notifica locale riassuntiva su app nativa (best-effort, mai bloccante).
 * Lo stesso insieme di novità viene notificato UNA volta sola: la firma
 * (id delle schede) si salva in localStorage, così riaprire la tab non
 * fa suonare di nuovo il telefono.
 */
export async function notifyVisionUpdatesNative(updates: VisionUpdates | null, language: Language = 'IT'): Promise<void> {
  try {
    if (!updates || !Capacitor.isNativePlatform()) return;
    const nA = updates.approved.length;
    const nR = updates.rejected.length;
    if (nA === 0 && nR === 0) return;

    const signature = [...updates.approved.map(a => `a:${a.id}`), ...updates.rejected.map(r => `r:${r.id}`)].sort().join('|');
    try {
      if (localStorage.getItem(VISION_UPDATES_NOTIFIED_KEY) === signature) return;
    } catch { /* senza storage si notifica comunque */ }

    const credits = updates.approved.reduce((sum, a) => sum + (Number(a.rewarded) || 0), 0);
    const lines: string[] = [];
    if (nA > 0) {
      lines.push(getTranslation('vis_updates_approved', language).replace('{n}', String(nA)).replace('{credits}', String(credits)));
    }
    if (nR > 0) {
      lines.push(getTranslation('vis_updates_rejected', language).replace('{n}', String(nR)));
    }

    const { LocalNotifications } = await import('@capacitor/local-notifications');
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') return;
      }
    } catch { /* plugin senza checkPermissions: si tenta lo schedule */ }
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 100000),
        title: getTranslation('vis_my_title', language),
        body: lines.join('\n'),
      }],
    });
    try { localStorage.setItem(VISION_UPDATES_NOTIFIED_KEY, signature); } catch { /* ignora */ }
  } catch {
    /* best-effort: nessuna notifica, nessun errore in superficie */
  }
}
