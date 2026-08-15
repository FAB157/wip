// =====================================================================
// WIP Community · Moderazione lato utente (App Store Guideline 1.2)
// - segnala un contenuto community offensivo (/api/community/report)
// - blocca l'autore di un contenuto (/api/community/block)
// - lista dei POI community da nascondere (autori bloccati), cache locale
//   così mappa/radar filtrano anche offline e senza round-trip per fix GPS.
// L'identità dell'autore resta SOLO server-side: il client passa l'id del
// POI e riceve id di POI da nascondere, mai user_id altrui.
// =====================================================================

import { supabase } from './supabase';
import { getApiUrl } from './api';

const BLOCKED_POIS_KEY = 'wip_blocked_community_pois';

export type CommunityReportReason = 'offensive' | 'inappropriate' | 'spam' | 'copyright' | 'other';

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Segnala un POI community. Ritorna false solo su errore rete/login. */
export async function reportCommunityContent(
  poiId: string,
  reason: CommunityReportReason,
  details?: string,
): Promise<{ ok: boolean; hidden?: boolean }> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false };
    const res = await fetch(getApiUrl('/api/community/report'), {
      method: 'POST', headers,
      body: JSON.stringify({ poiId, reason, details }),
    });
    if (!res.ok) return { ok: false };
    const j = await res.json();
    return { ok: true, hidden: !!j?.hidden };
  } catch {
    return { ok: false };
  }
}

/** Blocca l'autore del POI community e aggiorna subito la cache locale. */
export async function blockCommunityAuthor(poiId: string): Promise<boolean> {
  try {
    const headers = await authHeaders();
    if (!headers) return false;
    const res = await fetch(getApiUrl('/api/community/block'), {
      method: 'POST', headers,
      body: JSON.stringify({ poiId }),
    });
    if (!res.ok) return false;
    await refreshBlockedCommunityPois();
    // Il POI appena bloccato sparisce subito anche se il refresh fallisse.
    const set = getBlockedCommunityPoiIds();
    set.add(String(poiId));
    writeBlockedCache([...set]);
    return true;
  } catch {
    return false;
  }
}

function writeBlockedCache(ids: string[]): void {
  try { localStorage.setItem(BLOCKED_POIS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('wip-community-blocklist-updated')); } catch { /* ignore */ }
}

/** Lettura sincrona della cache (per i filtri di mappa/radar). */
export function getBlockedCommunityPoiIds(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_POIS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** True se il POI community va nascosto (autore bloccato dall'utente). */
export function isCommunityPoiBlocked(poi: { id?: string | number; category?: string | null }): boolean {
  if (!poi?.id) return false;
  if (String(poi.category || '').toLowerCase() !== 'community') return false;
  return getBlockedCommunityPoiIds().has(String(poi.id));
}

/** Rinfresca la cache dal server (best-effort: al login e dopo un blocco). */
export async function refreshBlockedCommunityPois(): Promise<void> {
  try {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch(getApiUrl('/api/community/blocked-pois'), { headers });
    if (!res.ok) return;
    const j = await res.json();
    if (Array.isArray(j?.poiIds)) writeBlockedCache(j.poiIds.map(String));
  } catch { /* best-effort */ }
}
