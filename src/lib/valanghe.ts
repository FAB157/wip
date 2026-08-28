// =====================================================================
// Pericolo valanghe — bollettino Euregio via il nostro /api/valanghe/punto
//
// Fonte: avalanche.report (Tirolo, Alto Adige, Trentino), open data CC BY
// 4.0, formato CAAML v6. Il server fa il punto→micro-regione EAWS e tiene
// in cache bollettino e poligoni; qui c'è solo la chiamata, con una cache
// per cella di 0,05° (~5 km: una micro-regione è una valle intera) valida
// un'ora, così aprire dieci rifugi della stessa valle costa una richiesta.
//
// Fuori dall'Euregio la risposta è {dentro:false} e il chiamante non mostra
// nulla: non si inventa un pericolo dove non abbiamo un bollettino.
// =====================================================================

import { getApiUrl } from './api';

export interface PericoloValanghe {
  dentro: boolean;
  regione?: { id: string; nome?: string | null };
  pericolo?: { livello: number; valore: Array<{ valore: string; quota: any; periodo: string }> };
  problemi?: string[];
  tendenza?: string | null;
  testo?: string | null;
  stagione_attiva?: boolean;
  url?: string;
  fonte?: string;
}

/** Colori della scala europea del pericolo valanghe (EAWS), 0 = senza neve. */
export const VALANGHE_COLORE: Record<number, string> = {
  0: '#9ca3af', 1: '#ccff66', 2: '#ffff00', 3: '#ff9900', 4: '#ff0000', 5: '#7f0000',
};

const TTL_MS = 60 * 60 * 1000;
const memoria = new Map<string, { ts: number; v: PericoloValanghe | null }>();

export async function fetchValanghe(lat: number, lon: number, lang: string): Promise<PericoloValanghe | null> {
  // Riquadro grossolano dell'Euregio: fuori non si chiama nemmeno il server.
  if (lat < 45.6 || lat > 47.8 || lon < 9.9 || lon > 13.1) return { dentro: false };
  const l = String(lang || 'it').toLowerCase().slice(0, 2);
  const chiave = `${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}_${l}`;
  const m = memoria.get(chiave);
  if (m && Date.now() - m.ts < TTL_MS) return m.v;
  try {
    const r = await fetch(getApiUrl(`/api/valanghe/punto?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&lang=${l}`),
      { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const j = await r.json();
    const v: PericoloValanghe | null = j?.ok ? j : null;
    memoria.set(chiave, { ts: Date.now(), v });
    return v;
  } catch {
    return null;
  }
}
