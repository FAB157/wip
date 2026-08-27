import { getApiUrl } from './api';
import { getTranslation, type Language } from './i18n';

// =====================================================================
// «Che sole mi aspetta?» — indice UV e caldo percepito, dal vivo
//
// Fonte: MET Norway via /api/meteo/punto (gratuita anche per uso
// commerciale, a differenza del piano free di Open-Meteo che è
// esplicitamente non-commerciale). La chiamata passa dal server perché
// MET pretende uno User-Agent identificabile, che il browser non può
// impostare. La percepita non la fornisce nessuno: la calcola il server
// con la formula di Steadman a partire da temperatura, umidità e vento.
//
// PERCHÉ NON È UN LAYER DI PALLINI COME IL MARE.
// La qualità dell'acqua cambia da spiaggia a spiaggia, e infatti ha senso
// disegnare una località per volta. L'UV no: dentro una città è
// praticamente identico ovunque, e disegnare venti pallini tutti con lo
// stesso numero sarebbe finta precisione. Quello che cambia davvero è
// l'ORA: alle 9 UV 4, alle 13 UV 9, alle 18 UV 2. Per questo qui si
// mostrano il valore di adesso e le ore da evitare, non una mappa.
//
// Cache localStorage 30 minuti per cella di ~11 km.
// Logica pura: niente Leaflet, niente React.
// =====================================================================

export interface OraSole {
  /** Ora locale in formato "HH:MM" */
  ora: string;
  uv: number;
  percepita: number;
}

export interface DatiSole {
  uv: number;
  percepita: number;
  temperatura: number;
  /** Prossime ore di oggi, per capire quando conviene stare all'ombra */
  prossimeOre: OraSole[];
  /** Ore in cui l'UV è alto (≥6): la fascia da evitare */
  oreCritiche: string[];
  /** Massimo UV previsto oggi */
  uvMassimoOggi: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

/** Soglie OMS: 1-2 basso, 3-5 moderato, 6-7 alto, 8-10 molto alto, 11+ estremo */
export function livelloUv(uv: number): { chiave: string; it: string; en: string; colore: string } {
  if (uv < 3) return { chiave: 'basso', it: 'Basso', en: 'Low', colore: '#16a34a' };
  if (uv < 6) return { chiave: 'moderato', it: 'Moderato', en: 'Moderate', colore: '#eab308' };
  if (uv < 8) return { chiave: 'alto', it: 'Alto', en: 'High', colore: '#f97316' };
  if (uv < 11) return { chiave: 'molto_alto', it: 'Molto alto', en: 'Very high', colore: '#dc2626' };
  return { chiave: 'estremo', it: 'Estremo', en: 'Extreme', colore: '#7e22ce' };
}

/**
 * Consiglio pratico, non allarmistico: cosa cambia nel comportamento.
 * 7 lingue (24/08/2026): prima solo IT/EN, unico residuo della bonifica
 * i18n sulla mappa (le chiavi mp_sole_* vivono in lib/traduzioni/mappa.ts).
 */
export function consiglioSole(d: DatiSole, lingua: string): string {
  const l = String(lingua || 'IT').toUpperCase() as Language;
  if (d.percepita >= 35 && d.uv >= 6) {
    return getTranslation('mp_sole_percepiti_ombra', l).replace('{temp}', String(Math.round(d.percepita)));
  }
  if (d.uv >= 8) return getTranslation('mp_sole_crema_cappello', l);
  if (d.uv >= 6) return getTranslation('mp_sole_crema_mezzora', l);
  if (d.percepita <= 5) return getTranslation('mp_sole_freddo', l);
  return getTranslation('mp_sole_tranquillo', l);
}

export async function fetchDatiSole(lat: number, lon: number): Promise<DatiSole | null> {
  const chiave = `wip_sole_${lat.toFixed(1)}_${lon.toFixed(1)}`;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.ts === 'number' && Date.now() - p.ts < CACHE_TTL_MS && p.dati) return p.dati as DatiSole;
    }
  } catch { /* cache corrotta */ }

  // Stessa rotta della chip meteo: una sola chiamata al nostro server
  // fornisce temperatura, UV, percepita e le prossime ore, già in cache
  // condivisa fra utenti della stessa cella.
  try {
    const r = await fetch(getApiUrl(`/api/meteo/punto?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`),
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j?.uv !== 'number') return null;

    const dati: DatiSole = {
      uv: j.uv,
      percepita: Number(j.percepita ?? j.temp ?? 0),
      temperatura: Number(j.temp ?? 0),
      prossimeOre: Array.isArray(j.prossimeOre) ? j.prossimeOre as OraSole[] : [],
      oreCritiche: Array.isArray(j.oreCritiche) ? j.oreCritiche : [],
      uvMassimoOggi: Number(j.uvMassimoOggi ?? 0),
    };
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), dati })); } catch { /* storage pieno */ }
    return dati;
  } catch {
    return null;
  }
}
