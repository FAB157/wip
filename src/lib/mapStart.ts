/**
 * Dove si apre la mappa (decisione utente 22/08/2026: «non sempre Carrara»).
 *
 * Tre scelte, persistite in localStorage:
 *  - 'gps'  : la mia posizione — al primo fix GPS la mappa vola lì (default)
 *  - 'last' : dove ero l'ultima volta — l'ultimo centro salvato a ogni moveend
 *  - 'city' : una città scelta dall'utente (cercata con Nominatim)
 *
 * In ogni caso, finché non c'è un fix o una scelta, la mappa parte
 * dall'ultimo centro conosciuto (se esiste) e non più da una costante.
 */

export type MapStartMode = 'gps' | 'last' | 'city';

export interface MapStartCity {
  name: string;
  lat: number;
  lon: number;
}

export interface MapStartPref {
  mode: MapStartMode;
  city?: MapStartCity;
}

const KEY_PREF = 'wip_map_start';
const KEY_LAST = 'wip_map_last_center';

/** Fallback finale quando non c'è nulla di meglio: Carrara, casa del progetto. */
export const MAP_FALLBACK_CENTER: [number, number] = [44.0792, 10.1];

function isFiniteLatLon(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function getMapStartPref(): MapStartPref {
  try {
    const raw = localStorage.getItem(KEY_PREF);
    if (!raw) return { mode: 'gps' };
    const p = JSON.parse(raw) as MapStartPref;
    if (p?.mode === 'city' && p.city && isFiniteLatLon(p.city.lat, p.city.lon) && p.city.name) return p;
    if (p?.mode === 'last' || p?.mode === 'gps') return { mode: p.mode };
  } catch { /* storage bloccato o JSON rotto: default */ }
  return { mode: 'gps' };
}

export function setMapStartPref(pref: MapStartPref): void {
  try {
    localStorage.setItem(KEY_PREF, JSON.stringify(pref));
    window.dispatchEvent(new CustomEvent('wip-settings-updated', { detail: { key: KEY_PREF } }));
  } catch { /* niente: la preferenza vale solo per questa sessione */ }
}

export function getLastMapCenter(): [number, number] | null {
  try {
    const raw = localStorage.getItem(KEY_LAST);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Array.isArray(c) && isFiniteLatLon(c[0], c[1])) return [c[0], c[1]];
  } catch { /* ignora */ }
  return null;
}

/** Chiamata a ogni moveend: economica, è una stringa di 40 byte. */
export function saveLastMapCenter(lat: number, lon: number): void {
  if (!isFiniteLatLon(lat, lon)) return;
  try { localStorage.setItem(KEY_LAST, JSON.stringify([+lat.toFixed(5), +lon.toFixed(5)])); } catch { /* ignora */ }
}

/**
 * Centro con cui montare la mappa, PRIMA di qualsiasi fix GPS.
 * 'city' → la città; altrimenti l'ultimo centro; altrimenti il fallback.
 */
export function getInitialMapCenter(): [number, number] {
  const pref = getMapStartPref();
  if (pref.mode === 'city' && pref.city) return [pref.city.lat, pref.city.lon];
  return getLastMapCenter() ?? MAP_FALLBACK_CENTER;
}

/** True se, al primo fix GPS, la mappa deve volare sulla posizione dell'utente. */
export function shouldFlyToGpsOnFirstFix(): boolean {
  return getMapStartPref().mode === 'gps';
}
