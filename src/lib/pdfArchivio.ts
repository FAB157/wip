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

export async function eliminaPdf(id: string): Promise<void> {
  try {
    await del(chiaveBlob(id));
    await set(INDICE, (await elencoPdf()).filter(v => v.id !== id));
    try { window.dispatchEvent(new CustomEvent(EVENTO_DOWNLOADS)); } catch { /* niente */ }
  } catch { /* niente */ }
}
