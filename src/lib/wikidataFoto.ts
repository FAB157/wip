// =====================================================================
// Foto di un bene culturale dell'atlante da Wikidata (P18), best-effort.
// Stesso schema di poiNameI18n.ts: solo client, API pubblica Wikidata
// (origin=* per CORS), nessuna chiave, cache localStorage, mai errori.
//
// I beni di solo atlante (beni_culturali) non hanno una colonna immagine:
// l'unica fonte legittima e' l'immagine collegata al loro stesso oggetto
// Wikidata (P18), quando esiste — mai una ricerca per nome/keyword (regola
// del progetto: la foto viene dal LUOGO, mai da un termine generico).
// =====================================================================

const CACHE_KEY = "wip_bene_foto_wikidata";
const MAX_ENTRIES = 300;
const FETCH_TIMEOUT_MS = 8000;

type CacheMap = Record<string, string | null>; // Q-id → URL Commons, o null (niente foto)

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as CacheMap;
    }
  } catch { /* cache corrotta: si riparte da zero */ }
  return {};
}

function writeCache(cache: CacheMap): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota piena: si vive senza cache */ }
}

/** "Q12345" dal tag/colonna, anche se arriva come URL completo. */
function normalizzaQid(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = String(v).match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * URL della foto (Special:FilePath, si puo' usare direttamente come <img src>)
 * per l'entita' Wikidata data, o null se l'entita' non ha P18. Cache-first.
 */
export async function fotoDaWikidata(wikidataRef: string | null | undefined): Promise<string | null> {
  const qid = normalizzaQid(wikidataRef);
  if (!qid) return null;

  const cache = readCache();
  if (qid in cache) return cache[qid];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(qid)}&property=P18&format=json&origin=*`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const nomeFile: string | undefined = json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const url = nomeFile
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(nomeFile)}?width=500`
      : null;
    cache[qid] = url;
    writeCache(cache);
    return url;
  } catch {
    // Rete assente o timeout: NON si mette in cache un null permanente per
    // un errore temporaneo, si ritenta al prossimo apri-popup.
    return null;
  }
}
