// =====================================================================
// Foto in chiaro dentro una pagina sicura: il browser le blocca.
//
// 04/09/2026. Le foto del Catalogo generale dei beni culturali non si
// vedevano: comparivano il riquadro dell'immagine rotta e la didascalia
// «Foto: Catalogo generale dei beni culturali — Ministero della Cultura»,
// quindi l'URL c'era ed era pure giusto. Il problema era lo SCHEMA:
//
//   http://www.sigecweb.beniculturali.it/images/fullsize/...jpg
//
// L'app viaggia su https (wip.guide, e WKWebView sul nativo). Un'immagine
// http dentro una pagina https e' «contenuto misto attivo/passivo» e viene
// bloccata dal browser prima ancora di partire: nessuna richiesta, nessun
// errore di rete, solo l'icona rotta. Non e' un problema del server:
// sigecweb.beniculturali.it risponde 200 image/jpeg anche in https
// (verificato lo stesso giorno sullo stesso file).
//
// Si corregge in LETTURA, non riscrivendo la tabella: `beni_culturali` ha
// ~1,78 M di righe, e una passata di massa muoverebbe altrettanti
// `updated_at` per cambiare quattro caratteri. Cosi' vale anche per le
// righe che verranno importate domani con lo stesso difetto.
// =====================================================================

/**
 * Promuove a https un URL immagine in chiaro. Lascia intatto tutto il
 * resto: https gia' a posto, data:/blob:, percorsi relativi, vuoti.
 * Non inventa nulla — se l'host non parla https la foto resta rotta,
 * ma lo era gia' prima.
 */
export function fotoSicura(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const pulito = String(url).trim();
  if (!pulito) return undefined;
  if (pulito.startsWith('http://')) return 'https://' + pulito.slice('http://'.length);
  return pulito;
}

/**
 * 06/09/2026: `source.unsplash.com` e' un servizio DISMESSO da Unsplash —
 * un link morto rimasto scritto su migliaia di righe prima della correzione
 * del 22/08/2026 (vedi server.ts, findFallbackPhoto). Un link morto conta
 * come assente, non come "foto presente".
 */
function fotoMorta(url: string | null | undefined): boolean {
  return !url || String(url).includes('source.unsplash.com');
}

/**
 * La MIGLIORE foto disponibile per un POI: `image_url` e `photo_url`
 * dovrebbero essere sinonimi, ma decine di punti del codice leggevano
 * sempre `image_url` per primo — se quello e' un link Unsplash morto e
 * `photo_url` ha invece la foto vera (Wikipedia/Commons), il POI sembrava
 * "senza foto" anche quando la foto vera esisteva gia' nel database.
 */
export function migliorFoto(poi: { image_url?: string | null; photo_url?: string | null } | null | undefined): string | undefined {
  if (!poi) return undefined;
  const candidati = [poi.image_url, poi.photo_url];
  for (const c of candidati) {
    if (!fotoMorta(c)) return fotoSicura(c);
  }
  return undefined;
}
