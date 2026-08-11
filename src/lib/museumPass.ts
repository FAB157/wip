import { supabase } from './supabase';
import { getApiUrl } from './api';
import { notifyCreditsChanged } from './pricing';

/**
 * Pass Museo — riconoscimenti Vision illimitati per una finestra di tempo
 * (la visita a un museo). L'autorità è il server (/api/vision/museum-pass);
 * qui si tiene solo un mirror in localStorage per mostrare il banner subito
 * e sopravvivere alla rete scarsa dei musei. Il server ri-verifica comunque
 * il pass a ogni scansione: il mirror non è un'autorizzazione.
 */

const LS_KEY = 'wip_museum_pass_expires_at';

export function getLocalMuseumPassExpiry(): number | null {
  try {
    const v = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
    return v > Date.now() ? v : null;
  } catch {
    return null;
  }
}

function storeExpiry(expiresAt: number | null) {
  try {
    if (expiresAt && expiresAt > Date.now()) localStorage.setItem(LS_KEY, String(expiresAt));
    else localStorage.removeItem(LS_KEY);
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
  try {
    const res = await fetch(getApiUrl('/api/vision/museum-pass'), { headers: await authHeaders() });
    if (!res.ok) return getLocalMuseumPassExpiry();
    const data = await res.json();
    const expiresAt = data?.active && data?.expiresAt ? Number(data.expiresAt) : null;
    storeExpiry(expiresAt);
    return expiresAt;
  } catch {
    return getLocalMuseumPassExpiry();
  }
}

export async function buyMuseumPass(): Promise<{ ok: boolean; expiresAt?: number; error?: 'login' | 'credits' | 'generic' }> {
  try {
    const res = await fetch(getApiUrl('/api/vision/museum-pass'), { method: 'POST', headers: await authHeaders() });
    if (res.status === 401) return { ok: false, error: 'login' };
    if (res.status === 402) return { ok: false, error: 'credits' };
    if (!res.ok) return { ok: false, error: 'generic' };
    const data = await res.json();
    const expiresAt = Number(data?.expiresAt) || 0;
    if (!expiresAt) return { ok: false, error: 'generic' };
    storeExpiry(expiresAt);
    const { data: session } = await supabase.auth.getSession();
    notifyCreditsChanged({ userId: session?.session?.user?.id });
    return { ok: true, expiresAt };
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
