// =====================================================================
// ITAINTA · pacchettoOffline — "Scarica per offline" di un ITINERARIO in un
// colpo solo (08/09/2026): mappa della zona del percorso + celle stradali
// per la navigazione senza rete, e registrazione in "I miei download".
// Le audioguide restano nel flusso a crediti (OfflineAudioBundleModal): qui
// si registra solo quante ce ne sono. Best-effort per parte: una parte che
// fallisce non blocca le altre, e il registro dice cosa manca.
// =====================================================================

import { prefetchTilesForArea, removeTilesForArea, stimaDownloadArea } from './offlineTiles';
import { bboxDaPunti, celleDelBbox, scaricaStradePerBbox, stimaByteCelle, rimuoviStradePerBbox, coperturaStrade } from './offlineRoads';
import { registraDownload, rimuoviDownload, leggiDownload } from './downloadsRegistry';
import { haversineMeters } from './geo';

export interface PuntoTappa { lat: number; lon: number; nome?: string }

/** Le tappe con coordinate valide di un piano (giorni[].tappe[].coordinate {lat,lng}). */
export function tappeDelPiano(plan: any): PuntoTappa[] {
  const out: PuntoTappa[] = [];
  for (const g of plan?.giorni || []) {
    for (const t of g?.tappe || []) {
      const lat = Number(t?.coordinate?.lat), lon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) out.push({ lat, lon, nome: t?.titolo_tappa });
    }
  }
  return out;
}

/** Centro e raggio (km) che coprono tutte le tappe, con margine. Min 2 km. */
export function areaDelPiano(plan: any): { lat: number; lon: number; radiusKm: number } | null {
  const tappe = tappeDelPiano(plan);
  if (!tappe.length) return null;
  const lat = tappe.reduce((s, p) => s + p.lat, 0) / tappe.length;
  const lon = tappe.reduce((s, p) => s + p.lon, 0) / tappe.length;
  let maxM = 0;
  for (const p of tappe) maxM = Math.max(maxM, haversineMeters(lat, lon, p.lat, p.lon));
  const radiusKm = Math.max(2, Math.ceil((maxM + 600) / 1000));
  return { lat, lon, radiusKm };
}

export interface StimaPacchetto {
  tileMbMin: number; tileMbMax: number;
  celle: number; stradeMb: number;
  tappe: number;
}

export function stimaPacchettoOffline(plan: any): StimaPacchetto | null {
  const area = areaDelPiano(plan);
  if (!area) return null;
  const tappe = tappeDelPiano(plan);
  const bbox = bboxDaPunti(tappe, 400);
  const celle = bbox ? celleDelBbox(bbox).length : 0;
  const s = stimaDownloadArea(area.lat, area.lon, area.radiusKm);
  return { tileMbMin: s.mbMin, tileMbMax: s.mbMax, celle, stradeMb: Math.round(stimaByteCelle(celle) / 1024 / 1024 * 10) / 10, tappe: tappe.length };
}

export interface OpzioniPacchetto { mappa: boolean; strade: boolean }
export interface EsitoPacchetto {
  mappa?: { done: number; failed: number; total: number };
  strade?: { scaricate: number; giaPresenti: number; mancanti: number; richieste: number };
  bytes: number;
}

/**
 * Scarica il pacchetto per il piano e lo registra. `onProgress(fase, 0..1)`.
 * `itinerarioId` e' l'id con cui il piano e' salvato offline (offlineStorage),
 * cosi' dal registro un tocco lo riapre.
 */
export async function scaricaPacchettoOffline(
  plan: any,
  itinerarioId: string,
  opz: OpzioniPacchetto,
  onProgress?: (fase: 'mappa' | 'strade', frazione: number) => void,
): Promise<EsitoPacchetto> {
  const esito: EsitoPacchetto = { bytes: 0 };
  const area = areaDelPiano(plan);
  const tappe = tappeDelPiano(plan);
  const nome = plan?.titolo || plan?.title || 'Itinerario';
  const sottotitolo = plan?.destinazione || plan?.citta || '';
  const totali = tappe.length;
  const esistente = await leggiDownload('itinerario', itinerarioId);
  const audioguide = esistente?.parti?.audioguide || { fatte: 0, totali };

  if (area && opz.mappa) {
    try {
      const p = await prefetchTilesForArea(area.lat, area.lon, area.radiusKm, (pr) => onProgress?.('mappa', pr.total ? pr.done / pr.total : 0));
      esito.mappa = p;
      // ~60 KB per tile, come la stima di offlineTiles
      esito.bytes += p.done * 60 * 1024;
    } catch { esito.mappa = { done: 0, failed: 1, total: 1 }; }
  }
  if (opz.strade) {
    const bbox = bboxDaPunti(tappe, 400);
    if (bbox) {
      try {
        const r = await scaricaStradePerBbox(bbox, (f, t) => onProgress?.('strade', t ? f / t : 0));
        esito.strade = { scaricate: r.scaricate, giaPresenti: r.giaPresenti, mancanti: r.mancanti.length, richieste: r.richieste };
        esito.bytes += r.bytes;
      } catch { esito.strade = { scaricate: 0, giaPresenti: 0, mancanti: 1, richieste: 1 }; }
    }
  }

  await registraDownload('itinerario', itinerarioId, {
    nome, sottotitolo,
    bytes: (esistente?.bytes || 0) + esito.bytes,
    parti: {
      poi: true,
      ...(opz.mappa ? { mappa: !!esito.mappa && esito.mappa.failed === 0 && esito.mappa.done > 0 } : {}),
      ...(opz.strade ? { strade: !!esito.strade && esito.strade.mancanti === 0 && esito.strade.richieste > 0 } : {}),
      audioguide,
    },
    meta: { area, tappe: totali, offlineId: itinerarioId },
  });
  return esito;
}

/** Stato della copertura stradale per un piano (per il badge "navigazione offline"). */
export async function coperturaStradePiano(plan: any): Promise<{ presenti: number; totali: number } | null> {
  const bbox = bboxDaPunti(tappeDelPiano(plan), 400);
  return bbox ? coperturaStrade(bbox) : null;
}

/** Elimina tutto il pacchetto (tile, strade, registro). Il piano salvato lo cancella il chiamante. */
export async function eliminaPacchettoOffline(plan: any, itinerarioId: string): Promise<void> {
  const area = areaDelPiano(plan);
  if (area) { try { await removeTilesForArea(area.lat, area.lon, area.radiusKm); } catch { /* best-effort */ } }
  const bbox = bboxDaPunti(tappeDelPiano(plan), 400);
  if (bbox) await rimuoviStradePerBbox(bbox);
  await rimuoviDownload('itinerario', itinerarioId);
}
