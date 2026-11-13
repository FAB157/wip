// =====================================================================
// ITAINTA · offlineRoads — celle stradali PEDONALI per la navigazione senza
// rete (08/09/2026). Stessa griglia 0,05° delle road tiles del server; una
// cella = tutte le polilinee percorribili a piedi in ~5,5 x 5,5 km.
// Si scaricano da /api/roads/cell (il bucket e' privato) e si salvano in
// IndexedDB (db.roadCells). Sono il grafo su cui il motore offline (A*, da
// fare) ricalcola il percorso quando manca la rete.
// =====================================================================

import { db, type RoadCell } from './db';
import { getApiUrl } from './api';

export const PASSO_CELLA = 0.05;

export interface Bbox { minLat: number; minLon: number; maxLat: number; maxLon: number; }

/** Rettangolo che contiene tutti i punti, allargato di `margineM` metri. */
export function bboxDaPunti(punti: Array<{ lat: number; lon: number }>, margineM = 400): Bbox | null {
  const validi = punti.filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  if (!validi.length) return null;
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const p of validi) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
  }
  const dLat = margineM / 111_320;
  const latMedia = (minLat + maxLat) / 2;
  const dLon = margineM / (111_320 * Math.max(0.2, Math.cos((latMedia * Math.PI) / 180)));
  return { minLat: minLat - dLat, minLon: minLon - dLon, maxLat: maxLat + dLat, maxLon: maxLon + dLon };
}

/** Chiavi "gx_gy" delle celle che coprono il rettangolo (angolo sud-ovest della cella). */
export function celleDelBbox(b: Bbox): Array<{ gx: number; gy: number; cella: string }> {
  const out: Array<{ gx: number; gy: number; cella: string }> = [];
  const x0 = Math.floor(b.minLon / PASSO_CELLA), x1 = Math.floor(b.maxLon / PASSO_CELLA);
  const y0 = Math.floor(b.minLat / PASSO_CELLA), y1 = Math.floor(b.maxLat / PASSO_CELLA);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const gx = Number((x * PASSO_CELLA).toFixed(2));
      const gy = Number((y * PASSO_CELLA).toFixed(2));
      out.push({ gx, gy, cella: `${gx.toFixed(2)}_${gy.toFixed(2)}` });
    }
  }
  return out;
}

/** Stima grezza del peso: ~120 KB per cella urbana (misurato sulle tile europee). */
export function stimaByteCelle(numeroCelle: number): number {
  return numeroCelle * 120 * 1024;
}

export interface EsitoScaricoStrade {
  richieste: number;
  scaricate: number;
  giaPresenti: number;
  mancanti: string[];
  bytes: number;
}

/**
 * Scarica (o riusa) le celle pedonali che coprono il rettangolo. Le celle non
 * pre-estratte sul server (404) finiscono in `mancanti` — la zona e' fuori
 * copertura per il ricalcolo offline, il chiamante lo dice all'utente.
 * `onProgress(fatte, totali)` per la barra.
 */
export async function scaricaStradePerBbox(
  b: Bbox,
  onProgress?: (fatte: number, totali: number) => void,
): Promise<EsitoScaricoStrade> {
  const celle = celleDelBbox(b);
  const esito: EsitoScaricoStrade = { richieste: celle.length, scaricate: 0, giaPresenti: 0, mancanti: [], bytes: 0 };
  let fatte = 0;
  // Poche richieste in parallelo: sono file da ~100 KB, il server li legge
  // dallo storage e li decomprime — 3 alla volta bastano e non lo intasano.
  const coda = [...celle];
  const lavoratore = async () => {
    for (;;) {
      const c = coda.shift();
      if (!c) return;
      try {
        const presente = await db.roadCells.get(c.cella);
        if (presente && Date.now() - presente.lastUpdated < 90 * 24 * 3600 * 1000) {
          esito.giaPresenti++;
          esito.bytes += presente.bytes || 0;
        } else {
          const r = await fetch(getApiUrl(`/api/roads/cell?gx=${c.gx}&gy=${c.gy}`), { signal: AbortSignal.timeout(20000) });
          if (r.status === 404) { esito.mancanti.push(c.cella); }
          else if (!r.ok) { esito.mancanti.push(c.cella); }
          else {
            const j = await r.json();
            const geometrie: number[][][] = Array.isArray(j?.foot) ? j.foot : [];
            const bytes = JSON.stringify(geometrie).length;
            const rec: RoadCell = { cella: c.cella, geometrie, bytes, lastUpdated: Date.now() };
            await db.roadCells.put(rec);
            esito.scaricate++;
            esito.bytes += bytes;
          }
        }
      } catch {
        esito.mancanti.push(c.cella);
      } finally {
        fatte++;
        onProgress?.(fatte, celle.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, celle.length) }, lavoratore));
  return esito;
}

/** Le celle salvate che coprono il rettangolo (per il motore offline). */
export async function celleSalvatePerBbox(b: Bbox): Promise<RoadCell[]> {
  const chiavi = celleDelBbox(b).map(c => c.cella);
  try {
    const righe = await db.roadCells.bulkGet(chiavi);
    return righe.filter((r): r is RoadCell => !!r);
  } catch { return []; }
}

/** Quante delle celle del rettangolo sono gia' salvate. */
export async function coperturaStrade(b: Bbox): Promise<{ presenti: number; totali: number }> {
  const chiavi = celleDelBbox(b).map(c => c.cella);
  try {
    const righe = await db.roadCells.bulkGet(chiavi);
    return { presenti: righe.filter(Boolean).length, totali: chiavi.length };
  } catch { return { presenti: 0, totali: chiavi.length }; }
}

export async function rimuoviStradePerBbox(b: Bbox): Promise<void> {
  const chiavi = celleDelBbox(b).map(c => c.cella);
  try { await db.roadCells.bulkDelete(chiavi); } catch { /* best-effort */ }
}
