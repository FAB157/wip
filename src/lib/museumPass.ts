import { supabase } from './supabase';
import { getApiUrl } from './api';
import { notifyCreditsChanged } from './pricing';

/**
 * Pass Museo — audioguide delle opere per una finestra di tempo (la visita a
 * un museo). Due livelli dal 10/09/2026:
 *  - 'base' (100 crediti): 40 audioguide, si inquadrano le opere che si vogliono
 *  - 'tour' (150 crediti): le stesse 40 più la VISITA GUIDATA del museo
 *    (percorso interno con sale, ordine e opere da non perdere)
 *
 * L'autorità è il server (/api/vision/museum-pass); qui si tiene solo un
 * mirror in localStorage per mostrare il banner subito e sopravvivere alla
 * rete scarsa dei musei. Il server ri-verifica comunque il pass a ogni
 * scansione: il mirror non è un'autorizzazione.
 */

const LS_KEY = 'wip_museum_pass_expires_at';
const LS_KEY_TIER = 'wip_museum_pass_tier';

export type MuseumPassTier = 'base' | 'tour';
export type MuseumPassStatus = {
  expiresAt: number | null;
  tier: MuseumPassTier | null;
  tourIncluded: boolean;
  scansUsed: number;
  scansLimit: number;
  priceCredits: number;
  priceCreditsTour: number;
};

export function getLocalMuseumPassExpiry(): number | null {
  try {
    const v = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
    return v > Date.now() ? v : null;
  } catch {
    return null;
  }
}

export function getLocalMuseumPassTier(): MuseumPassTier | null {
  try {
    if (!getLocalMuseumPassExpiry()) return null;
    const t = localStorage.getItem(LS_KEY_TIER);
    return t === 'tour' || t === 'base' ? t : null;
  } catch {
    return null;
  }
}

function storeExpiry(expiresAt: number | null, tier?: MuseumPassTier | null) {
  try {
    if (expiresAt && expiresAt > Date.now()) {
      localStorage.setItem(LS_KEY, String(expiresAt));
      if (tier) localStorage.setItem(LS_KEY_TIER, tier);
    } else {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_KEY_TIER);
    }
  } catch { /* storage non disponibile */ }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** Stato dal server; offline o senza login vale il mirror locale. */
export async function fetchMuseumPassStatus(): Promise<number | null> {
  const full = await fetchMuseumPassFull();
  return full.expiresAt;
}

/** Stato completo: scadenza, livello, scansioni usate e i due prezzi. */
export async function fetchMuseumPassFull(): Promise<MuseumPassStatus> {
  const localFallback = (): MuseumPassStatus => ({
    expiresAt: getLocalMuseumPassExpiry(),
    tier: getLocalMuseumPassTier(),
    tourIncluded: getLocalMuseumPassTier() === 'tour',
    scansUsed: 0, scansLimit: 40, priceCredits: 100, priceCreditsTour: 150,
  });
  try {
    const res = await fetch(getApiUrl('/api/vision/museum-pass'), { headers: await authHeaders() });
    if (!res.ok) return localFallback();
    const data = await res.json();
    const expiresAt = data?.active && data?.expiresAt ? Number(data.expiresAt) : null;
    const tier: MuseumPassTier | null = data?.tier === 'tour' || data?.tier === 'base' ? data.tier : null;
    storeExpiry(expiresAt, tier);
    return {
      expiresAt,
      tier,
      tourIncluded: !!data?.tourIncluded,
      scansUsed: Number(data?.scansUsed) || 0,
      scansLimit: Number(data?.scansLimit) || 40,
      priceCredits: Number(data?.priceCredits) || 100,
      priceCreditsTour: Number(data?.priceCreditsTour) || 150,
    };
  } catch {
    return localFallback();
  }
}

export async function buyMuseumPass(tier: MuseumPassTier = 'base'): Promise<{ ok: boolean; expiresAt?: number; tier?: MuseumPassTier; upgraded?: boolean; error?: 'login' | 'credits' | 'generic' }> {
  try {
    const res = await fetch(getApiUrl('/api/vision/museum-pass'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ tier }),
    });
    if (res.status === 401) return { ok: false, error: 'login' };
    if (res.status === 402) return { ok: false, error: 'credits' };
    if (!res.ok) return { ok: false, error: 'generic' };
    const data = await res.json();
    const expiresAt = Number(data?.expiresAt) || 0;
    if (!expiresAt) return { ok: false, error: 'generic' };
    const tierOut: MuseumPassTier = data?.tier === 'tour' ? 'tour' : 'base';
    storeExpiry(expiresAt, tierOut);
    const { data: session } = await supabase.auth.getSession();
    notifyCreditsChanged({ userId: session?.session?.user?.id });
    return { ok: true, expiresAt, tier: tierOut, upgraded: !!data?.upgraded };
  } catch {
    return { ok: false, error: 'generic' };
  }
}

/** "1h 23m" / "45 min" per il countdown del banner. */
export function formatPassRemaining(expiresAt: number): string {
  const ms = Math.max(0, expiresAt - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
