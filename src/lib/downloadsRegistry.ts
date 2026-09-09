// =====================================================================
// ITAINTA · downloadsRegistry — il REGISTRO UNICO di cio' che l'utente ha
// scaricato (08/09/2026). Itinerari, zone mappa, audioguide, guide: ogni
// flusso di download esistente registra qui la sua voce e le PARTI che la
// compongono; la schermata "I miei download" legge solo da qui.
// Best-effort ovunque: un registro che non si aggiorna non deve mai far
// fallire il download vero.
// =====================================================================

import { db, type DownloadRecord, type DownloadTipo } from './db';

export type { DownloadRecord, DownloadTipo };

export const EVENTO_DOWNLOADS = 'wip-downloads-updated';

function avvisa() {
  try { window.dispatchEvent(new CustomEvent(EVENTO_DOWNLOADS)); } catch { /* SSR/test */ }
}

export function chiaveDownload(tipo: DownloadTipo, id: string | number): string {
  const pref = tipo === 'itinerario' ? 'iti' : tipo === 'zona' ? 'zona' : tipo === 'audioguida' ? 'audio' : 'guida';
  return `${pref}:${String(id)}`;
}

/** Crea o aggiorna una voce (merge superficiale di `parti` e `meta`). */
export async function registraDownload(
  tipo: DownloadTipo,
  id: string | number,
  dati: Partial<Omit<DownloadRecord, 'id' | 'tipo' | 'createdAt' | 'updatedAt'>> & { nome?: string },
): Promise<void> {
  try {
    const key = chiaveDownload(tipo, id);
    const ora = Date.now();
    const esistente = await db.downloads.get(key);
    const record: DownloadRecord = {
      id: key,
      tipo,
      nome: dati.nome ?? esistente?.nome ?? '',
      sottotitolo: dati.sottotitolo ?? esistente?.sottotitolo,
      bytes: dati.bytes ?? esistente?.bytes ?? 0,
      parti: { ...(esistente?.parti || {}), ...(dati.parti || {}) },
      meta: { ...(esistente?.meta || {}), ...(dati.meta || {}) },
      createdAt: esistente?.createdAt ?? ora,
      updatedAt: ora,
    };
    await db.downloads.put(record);
    avvisa();
  } catch (e) {
    console.warn('[downloads] registrazione fallita', e);
  }
}

export async function rimuoviDownload(tipo: DownloadTipo, id: string | number): Promise<void> {
  try {
    await db.downloads.delete(chiaveDownload(tipo, id));
    avvisa();
  } catch (e) {
    console.warn('[downloads] rimozione fallita', e);
  }
}

export async function leggiDownload(tipo: DownloadTipo, id: string | number): Promise<DownloadRecord | undefined> {
  try { return await db.downloads.get(chiaveDownload(tipo, id)); } catch { return undefined; }
}

export async function elencoDownload(tipo?: DownloadTipo): Promise<DownloadRecord[]> {
  try {
    const tutti = tipo ? await db.downloads.where('tipo').equals(tipo).toArray() : await db.downloads.toArray();
    return tutti.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

/** Byte totali registrati (stima dello spazio usato dai download). */
export async function byteTotaliDownload(): Promise<number> {
  try {
    const tutti = await db.downloads.toArray();
    return tutti.reduce((s, d) => s + (d.bytes || 0), 0);
  } catch { return 0; }
}

/**
 * Stato sintetico di una voce: "pronto" se tutte le parti previste ci sono,
 * "parziale" se ne manca qualcuna, "vuoto" se non c'e' niente.
 */
export function statoDownload(d: DownloadRecord | undefined | null): 'pronto' | 'parziale' | 'vuoto' {
  if (!d) return 'vuoto';
  const p = d.parti || {};
  const attese: boolean[] = [];
  if ('mappa' in p) attese.push(!!p.mappa);
  if ('strade' in p) attese.push(!!p.strade);
  if ('poi' in p) attese.push(!!p.poi);
  if (p.audioguide) attese.push(p.audioguide.totali === 0 || p.audioguide.fatte >= p.audioguide.totali);
  if (!attese.length) return 'vuoto';
  return attese.every(Boolean) ? 'pronto' : 'parziale';
}
