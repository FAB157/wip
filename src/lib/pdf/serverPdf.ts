/**
 * PDF «come un libro» generati DAL SERVER (06/09/2026): servono per
 * l'allegato dell'email «la tua guida e' pronta» quando l'utente ha lasciato
 * l'app. Stessi componenti del client (GuidaPremiumPdf, ItinerarioPdf),
 * ma con renderToBuffer di @react-pdf/renderer e le immagini scaricate con
 * axios in data URL (solo jpg/png: react-pdf non legge webp/gif e qui non
 * c'e' un canvas per riconvertirle — la scheda esce senza foto, mai con
 * una foto rotta).
 *
 * Ritorna null per le lingue non latine (i font incorporati non hanno
 * cirillico/CJK) o su qualsiasi errore: l'email parte comunque col link.
 * Node-only: non importarlo dal client.
 */
import React from 'react';
import axios from 'axios';
import { ET_GUIDA, ET_ITINERARIO, lingua } from './generaPdf';
import { haCaratteriNonLatini } from './pulisci';

const MAX_IMG = 6 * 1024 * 1024;

async function immagineDataUrl(url: string): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, maxContentLength: MAX_IMG, headers: { 'User-Agent': 'WIP-guide-pdf/1.0 (https://wip.guide)' } });
    const tipo = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (tipo !== 'image/jpeg' && tipo !== 'image/png') return null;
    return `data:${tipo};base64,${Buffer.from(r.data).toString('base64')}`;
  } catch { return null; }
}

async function numeraPagine(buf: Buffer, etichetta: string, daPagina: number): Promise<Buffer> {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.load(buf);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pagine = doc.getPages();
    const X = 18 * 2.835, Y = 9 * 2.835, DIM = 7.5;
    pagine.forEach((p, i) => {
      if (i + 1 < daPagina) return;
      const testo = `${etichetta} ${i + 1} / ${pagine.length}`;
      const w = font.widthOfTextAtSize(testo, DIM);
      p.drawText(testo, { x: p.getWidth() - X - w, y: Y + 1, size: DIM, font, color: rgb(0.47, 0.47, 0.47) });
    });
    return Buffer.from(await doc.save());
  } catch { return buf; }
}

/** PDF della guida premium; null se non realizzabile. */
export async function pdfGuidaServer(content: any, mediaManifest: Record<string, string>, language: unknown): Promise<Buffer | null> {
  try {
    if (!content?.giorni) return null;
    const testo = JSON.stringify(content).slice(0, 20000);
    if (haCaratteriNonLatini(testo)) return null;
    const L = lingua(language);
    const immagini: Record<string, string> = {};
    const richieste: Array<[string, string]> = [];
    const cover = mediaManifest?.cover || mediaManifest?.copertina || mediaManifest?.citta_intro_1;
    if (cover) richieste.push(['cover', cover]);
    for (const g of content.giorni || []) for (const p of g?.pois || []) {
      const u = (p?.poi_id && mediaManifest?.[p.poi_id]) || p?.image_url;
      if (u && p?.poi_id) richieste.push([p.poi_id, u]);
    }
    // Poche alla volta: la function ha memoria e tempo contati.
    for (let i = 0; i < richieste.length; i += 4) {
      const lotto = richieste.slice(i, i + 4);
      const esiti = await Promise.all(lotto.map(([, u]) => immagineDataUrl(u)));
      esiti.forEach((d, k) => { if (d) immagini[lotto[k][0]] = d; });
    }
    if (!immagini.cover) { const primo = Object.keys(immagini)[0]; if (primo) immagini.cover = immagini[primo]; }
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { default: GuidaPremiumPdf } = await import('./GuidaPremiumPdf');
    const buf = await renderToBuffer(React.createElement(GuidaPremiumPdf, { content, immagini, etichette: ET_GUIDA[L] }) as any);
    return await numeraPagine(Buffer.from(buf), ET_GUIDA[L].pagina, 2);
  } catch (e: any) {
    console.warn('[pdf server] guida non generata:', e?.message);
    return null;
  }
}

/** PDF dell'itinerario; null se non realizzabile. */
export async function pdfItinerarioServer(plan: any, language: unknown): Promise<Buffer | null> {
  try {
    if (!Array.isArray(plan?.giorni) || !plan.giorni.length) return null;
    if (haCaratteriNonLatini(JSON.stringify(plan).slice(0, 20000))) return null;
    const L = lingua(language);
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { default: ItinerarioPdf } = await import('./ItinerarioPdf');
    const buf = await renderToBuffer(React.createElement(ItinerarioPdf, { plan, etichette: ET_ITINERARIO[L] }) as any);
    return await numeraPagine(Buffer.from(buf), ET_ITINERARIO[L].pagina, 1);
  } catch (e: any) {
    console.warn('[pdf server] itinerario non generato:', e?.message);
    return null;
  }
}
