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
