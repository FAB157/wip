// =====================================================================
// WIP · pdfArchivio — i PDF «stampati» restano nell'archivio (20/09/2026,
// committente: «l'archivio deve avere anche gli itinerari in pdf, le guide
// premium in pdf e le guide museo in pdf (se stampate)»).
//
// Fino a oggi un PDF generato finiva nei Documenti del telefono (o nei
// download del browser) e l'app non ne sapeva piu' nulla. Qui se ne tiene una
// copia nell'IndexedDB del dispositivo (idb-keyval: nessuna migrazione Dexie)
// con un indice leggero; «I miei download» la mostra nella cartella giusta e
// la riapre senza rigenerarla. Best-effort ovunque: un archivio che non si
// aggiorna non deve mai far fallire il salvataggio vero.
// =====================================================================

import { get, set, del } from 'idb-keyval';
import { EVENTO_DOWNLOADS } from './downloadsRegistry';

export type PdfTipo = 'itinerario' | 'guida' | 'museo';

export interface PdfVoce {
  id: string;
  tipo: PdfTipo;
  /** Titolo leggibile (nome dell'itinerario, della guida, del museo). */
  nome: string;
  file: string;
  bytes: number;
  data: number;
}

const INDICE = 'wip_pdf_indice';
const chiaveBlob = (id: string) => `wip_pdf_blob:${id}`;
// Un PDF con le foto pesa 5-8 MB: oltre questo numero escono i piu' vecchi.
const MASSIMO = 25;

const norma = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** L'id con cui un documento finisce in archivio: serve a chi vuole sapere se «questo» e' gia' stato stampato. */
export const idPdf = (tipo: PdfTipo, nome: string) => `${tipo}:${norma(nome)}`;

export async function elencoPdf(): Promise<PdfVoce[]> {
  try {
    const v = await get(INDICE);
    return Array.isArray(v) ? (v as PdfVoce[]).sort((a, b) => b.data - a.data) : [];
  } catch { return []; }
}

/** Una stampa nuova dello stesso documento sostituisce la precedente. */
export async function archiviaPdf(tipo: PdfTipo, nome: string, file: string, blob: Blob): Promise<void> {
  try {
    const id = `${tipo}:${norma(nome) || norma(file)}`;
    await set(chiaveBlob(id), blob);
    const resto = (await elencoPdf()).filter(v => v.id !== id);
    const indice = [{ id, tipo, nome: nome || file, file, bytes: blob.size, data: Date.now() }, ...resto];
    for (const vecchio of indice.slice(MASSIMO)) { try { await del(chiaveBlob(vecchio.id)); } catch { /* niente */ } }
    await set(INDICE, indice.slice(0, MASSIMO));
    try { window.dispatchEvent(new CustomEvent(EVENTO_DOWNLOADS)); } catch { /* niente */ }
  } catch (e) {
    console.warn('[pdfArchivio] copia non riuscita', e);
  }
}

export async function leggiPdf(id: string): Promise<Blob | null> {
  try {
    const b = await get(chiaveBlob(id));
    return b instanceof Blob ? b : null;
  } catch { return null; }
}

/**
 * Esito di una riapertura: 'salvato' = sull'app nativa il PDF e' stato
 * riscritto nei Documenti (non c'e' un visore), 'aperto' = nuova scheda del
 * browser, 'scaricato' = scheda bloccata e file scaricato, 'errore' = file
 * non scrivibile, 'assente' = il PDF non e' piu' in archivio. I messaggi li
 * mostra il chiamante nella sua lingua.
 */
export type EsitoRiapertura = 'salvato' | 'aperto' | 'scaricato' | 'errore' | 'assente';

/**
 * Riapre un PDF gia' stampato, senza rigenerarlo (23/09/2026: spostata qui da
 * DownloadsScreen, la usa anche il widget «Guida stampata»).
 */
export async function riapriPdf(id: string): Promise<EsitoRiapertura> {
  const voce = (await elencoPdf()).find(v => v.id === id);
  const blob = await leggiPdf(id);
  if (!blob || !voce) return 'assente';
  const { saveBlobAsFile } = await import('../services/premiumGuideService');
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const ok = await saveBlobAsFile(blob, voce.file);
    return ok ? 'salvato' : 'errore';
  }
  const url = URL.createObjectURL(blob);
  const finestra = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (finestra) return 'aperto';
  return (await saveBlobAsFile(blob, voce.file)) ? 'scaricato' : 'errore';
}

/**
 * Condivide un PDF dell'archivio con il foglio di condivisione del sistema
 * (navigator.share con file). Dove non c'e' (la WebView Android di norma non
 * lo espone) si riapre: sul nativo il file finisce nei Documenti e il
 * chiamante lo dice con un avviso. 'annullato' = l'utente ha chiuso il foglio.
 */
export async function condividiPdf(id: string): Promise<'condiviso' | 'annullato' | EsitoRiapertura> {
  const voce = (await elencoPdf()).find(v => v.id === id);
  const blob = await leggiPdf(id);
  if (!blob || !voce) return 'assente';
  try {
    const f = new File([blob], voce.file, { type: 'application/pdf' });
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.canShare?.({ files: [f] }) && typeof nav.share === 'function') {
      try {
        await nav.share({ files: [f], title: voce.nome });
        return 'condiviso';
      } catch (e: any) {
        if (e?.name === 'AbortError') return 'annullato';
        /* condivisione rifiutata: si ripiega sulla riapertura */
      }
    }
  } catch { /* File o share non disponibili */ }
  return riapriPdf(id);
}

export async function eliminaPdf(id: string): Promise<void> {
  try {
    await del(chiaveBlob(id));
    await set(INDICE, (await elencoPdf()).filter(v => v.id !== id));
    try { window.dispatchEvent(new CustomEvent(EVENTO_DOWNLOADS)); } catch { /* niente */ }
  } catch { /* niente */ }
}
