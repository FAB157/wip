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
import { ET_GUIDA, ET_ITINERARIO, lingua, urlMappaStatica } from './generaPdf.js';
import { haCaratteriNonLatini } from './pulisci.js';
import GuidaPremiumPdf from './GuidaPremiumPdf.js';
import ItinerarioPdf from './ItinerarioPdf.js';

/**
 * Solo per il tracciatore di Vercel (@vercel/nft), 07/09/2026. Nel pacchetto
 * della function un import «./x.js» viene mappato sul sorgente «x.ts» ma NON
 * su «x.tsx»: i componenti React del PDF non finivano nel bundle e l'email
 * partiva senza allegato («Cannot find module .../base.js»). Un import
 * SENZA estensione invece li fa includere (e compilare in .js). Questa
 * funzione non viene mai chiamata: serve solo a farli vedere al tracciatore.
 * Se aggiungi un altro .tsx alla catena del PDF, aggiungilo anche qui.
 */
export function _tracciaPerVercel(): Promise<unknown[]> {
  return Promise.all([import('./base'), import('./GuidaPremiumPdf'), import('./ItinerarioPdf')]);
}

const MAX_IMG = 6 * 1024 * 1024;

/** Ultimo errore (per la diagnostica /api/admin/pdf-prova). */
export let ultimoErrore: string | null = null;

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
  } catch (e: any) {
    // MAI in silenzio (18/11/2026): se pdf-lib non si carica (nel collaudo notturno su Oracle e' una dipendenza
    // esterna del bundle: «npm i pdf-lib» accanto a server-pdf.bundle.mjs) le pagine escono senza numero e
    // nessuno lo sapeva. Il PDF parte comunque, ma l'errore si vede nel log e in `ultimoErrore`.
    ultimoErrore = `numerazione pagine non riuscita: ${e?.message || e}`;
    console.warn('[pdf server] numerazione pagine non riuscita (pdf-lib mancante?):', e?.message || e);
    return buf;
  }
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
    const buf = await renderToBuffer(React.createElement(GuidaPremiumPdf, { content, immagini, etichette: ET_GUIDA[L] }) as any);
    return await numeraPagine(Buffer.from(buf), ET_GUIDA[L].pagina, 2);
  } catch (e: any) {
    ultimoErrore = `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(1, 5).join('\n')}`;
    console.warn('[pdf server] guida non generata:', e?.message);
    return null;
  }
}

/**
 * 21/11/2026 (collaudo notturno, Seoul e Kyoto: email del piano senza allegato). Il controllo dei caratteri guardava
 * TUTTO il JSON del piano (campi tecnici compresi: nome della riga agganciata, note interne) e rinunciava al PDF se un
 * solo nome era in coreano o giapponese. Ora: un titolo di tappa in un altro alfabeto prende il titolo del modello
 * (`titolo_ai`, nella lingua dell'utente) quando quello è latino; si rinuncia solo se resta testo STAMPATO non latino
 * (i campi che ItinerarioPdf mette sulla pagina).
 */
function pianoPerStampa(plan: any): any {
  const copia = JSON.parse(JSON.stringify(plan));
  for (const g of Array.isArray(copia?.giorni) ? copia.giorni : []) {
    for (const t of Array.isArray(g?.tappe) ? g.tappe : []) {
      const alternativa = [t?.titolo_ai, t?.sostituito_da_archivio].find((x) => typeof x === 'string' && x.trim() && !haCaratteriNonLatini(x));
      if (!alternativa) continue;
      for (const k of ['titolo_tappa', 'titolo']) if (typeof t[k] === 'string' && haCaratteriNonLatini(t[k])) t[k] = alternativa;
    }
  }
  return copia;
}
function testoStampato(plan: any): string {
  const s = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
  const pezzi: string[] = [s(plan?.titolo), s(plan?.info_viaggio)];
  for (const g of Array.isArray(plan?.giorni) ? plan.giorni : []) {
    pezzi.push(s(g?.tabella_budget));
    for (const t of Array.isArray(g?.tappe) ? g.tappe : []) {
      pezzi.push(...['titolo_tappa', 'titolo', 'attivita', 'consiglio_guida', 'mezzi_precedente', 'spostamento_precedente', 'tipo', 'tempo_necessario', 'ora'].map((k) => s(t?.[k])));
    }
  }
  return pezzi.join('\n');
}

/** PDF dell'itinerario; null se non realizzabile. */
export async function pdfItinerarioServer(planIn: any, language: unknown): Promise<Buffer | null> {
  try {
    if (!Array.isArray(planIn?.giorni) || !planIn.giorni.length) return null;
    const plan = pianoPerStampa(planIn);
    if (haCaratteriNonLatini(testoStampato(plan))) return null;
    const L = lingua(language);
    // Stessa mappa del PDF fatto dal telefono (07/09: l'allegato usciva senza).
    const urlMappa = urlMappaStatica(plan, process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN);
    const mappa = urlMappa ? (await immagineDataUrl(urlMappa)) || undefined : undefined;
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const buf = await renderToBuffer(React.createElement(ItinerarioPdf, { plan, etichette: ET_ITINERARIO[L], mappa }) as any);
    return await numeraPagine(Buffer.from(buf), ET_ITINERARIO[L].pagina, 1);
  } catch (e: any) {
    ultimoErrore = `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(1, 5).join('\n')}`;
    console.warn('[pdf server] itinerario non generato:', e?.message);
    return null;
  }
}
