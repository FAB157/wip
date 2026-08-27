/**
 * LA FOTO DELLA DIMENSIONE CHE SERVE DAVVERO
 * ==========================================
 * Misurato il 24/08/2026 su un campione di 300 POI: 277 su 300 hanno una
 * `image_url` che punta a `commons.wikimedia.org/.../Special:FilePath/<file>`
 * con `width=800` (in qualche caso 1200). Quell'endpoint risponde SEMPRE alla
 * larghezza richiesta — la miniatura la genera lui se non esiste — ma nessuno
 * gliela stava chiedendo su misura: una miniatura da 90 px nel popup di un pin
 * scaricava lo stesso file da 800 px.
 *
 * Pesi reali misurati (stessa immagine, larghezze diverse):
 *   width=800  →  186 · 211 · 742 KB
 *   width=480  →   60 ·  64 · 214 KB
 *   width=320  →   29 ·  30 ·  96 KB
 * Cioe' da tre a sette volte meno byte, a parita' di resa sullo schermo.
 *
 * ── PERCHE' NON SI SCRIVE L'URL DIRETTO DEL CDN ───────────────────────────
 * Tentato e SCARTATO lo stesso giorno. Il percorso diretto
 * `upload.wikimedia.org/wikipedia/commons/thumb/<h0>/<h0h1>/<file>/<w>px-<file>`
 * si ricava dal nome (le due cartelle sono le prime cifre dell'md5 del nome
 * con gli underscore) e la derivazione e' stata verificata esatta su quattro
 * file. MA quell'URL serve soltanto le miniature GIA' generate: `960px` dava
 * 200, `640px` dava 400 sullo stesso file. Wikimedia non genera piu' su
 * richiesta diretta. Passare da Special:FilePath costa due redirect (misurati
 * 180-800 ms) ed e' il prezzo da pagare per avere la larghezza che vogliamo:
 * quei due salti pesano meno dei 600 KB risparmiati, e soprattutto sono
 * prevedibili.
 *
 * ── REGOLA ────────────────────────────────────────────────────────────────
 * Si tocca SOLO Wikimedia. Gli altri host (media.beniculturali.it, lo storage
 * nostro, i siti dei POI) non sanno cosa farsene di `width` e vanno lasciati
 * esattamente come sono: un parametro in piu' su un URL firmato lo rompe.
 */

/**
 * Larghezze d'uso. Non sono gusti: sono i tre posti in cui una foto compare.
 *
 * ── PERCHE' IL PIN E LA SCHEDA CONDIVIDONO LA STESSA MISURA ───────────────
 * Sono la STESSA foto: il popup del pin e la copertina della scheda leggono
 * entrambi `poi.image_url`. Se li si chiedesse a due larghezze diverse (480 e
 * 800) sarebbero due indirizzi diversi, e il browser li tratterebbe come due
 * immagini scollegate: aprire la scheda dopo aver visto il pin rifarebbe da
 * capo tutto lo scaricamento. Con una misura sola la seconda apertura e'
 * ISTANTANEA, perche' l'immagine e' gia' nella cache del browser.
 *
 * 480 e non 800: la copertina e' alta 240 px e sta dietro una sfumatura, la
 * morbidezza non si nota; 800 costerebbe da tre a quattro volte i byte per un
 * dettaglio che nessuno guarda. Chi alza questo numero lo alza per TUTTI e
 * due i posti, mai per uno solo — separarli e' il difetto che questo commento
 * esiste per impedire.
 */
export const FOTO = {
  /** Miniature in galleria e in lista: ~96-130 px sullo schermo. */
  MINIATURA: 320,
  /** L'unica misura di copertina: popup del pin E scheda POI. Vedi sopra. */
  PRINCIPALE: 480,
  /** Solo la galleria a schermo intero, dove la foto si guarda davvero. */
  PIENA: 1024,
} as const;

/** L'URL punta a Special:FilePath di Wikimedia? (le due forme in circolazione) */
function eWikimediaFilePath(u: URL): boolean {
  if (!/(^|\.)wikimedia\.org$/i.test(u.hostname)) return false;
  return /Special:FilePath/i.test(u.pathname) || /Special:FilePath/i.test(u.searchParams.get('title') || '');
}

/**
 * Restituisce la stessa foto chiesta alla larghezza indicata.
 * Non-Wikimedia, URL vuoto o malformato → torna l'originale intatto: questa
 * funzione non deve MAI essere il motivo per cui una foto non si vede.
 */
export function fotoLarga(url: string | null | undefined, larghezza: number): string | null {
  if (!url) return null;
  const grezzo = String(url).trim();
  if (!grezzo) return null;
  try {
    const u = new URL(grezzo);
    if (!eWikimediaFilePath(u)) return grezzo;
    // Se e' gia' piu' piccola di quanto chiediamo, non la si ingrandisce:
    // costerebbe byte per un dettaglio che non c'e'.
    const attuale = Number(u.searchParams.get('width') || 0);
    if (attuale && attuale <= larghezza) return grezzo;
    u.searchParams.set('width', String(larghezza));
    return u.toString();
  } catch {
    return grezzo;
  }
}

/** Scorciatoie, per non ripetere il numero nei componenti. */
export const fotoMiniatura = (u: string | null | undefined) => fotoLarga(u, FOTO.MINIATURA);
/** Copertina: la STESSA per il popup del pin e per la scheda POI. */
export const fotoPrincipale = (u: string | null | undefined) => fotoLarga(u, FOTO.PRINCIPALE);
export const fotoPiena = (u: string | null | undefined) => fotoLarga(u, FOTO.PIENA);
