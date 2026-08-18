// =====================================================================
// Traduzione best-effort del nome POI nella lingua UI dell'utente.
// Solo client, silenziosa: usa i riferimenti wikidata/wikipedia del POI
// (tag OSM o technical_data) contro le API pubbliche Wikidata/Wikipedia
// (origin=* per CORS). Nessun dato → null, mai errori, mai spinner.
// Cache localStorage `wip_poi_name_i18n`: mappa id → {lang: label},
// max ~300 voci (le più vecchie vengono scartate).
// =====================================================================

import type { Language } from "./i18n";

export interface PoiNameRef {
  id: string | number;
  name?: string | null;
  /** Tag OSM `wikidata` (es. "Q12345") o wikidata_id da technical_data. */
  wikidata?: string | null;
  /** Tag OSM `wikipedia` (es. "it:Piazza San Vitale") o URL Wikipedia completo. */
  wikipedia?: string | null;
}

const CACHE_KEY = "wip_poi_name_i18n";
const MAX_ENTRIES = 300;
const FETCH_TIMEOUT_MS = 8000;

type CacheMap = Record<string, Record<string, string>>;

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
    // Trim FIFO: gli oggetti JS conservano l'ordine di inserimento,
    // quindi le prime chiavi sono le più vecchie.
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota piena: si vive senza cache */ }
}

/** "IT" → "it", "ZH" → "zh"… (i codici UI coincidono con quelli Wikidata). */
export function uiLangToCode(lang: Language | string): string {
  return String(lang || "IT").toLowerCase();
}

/**
 * Euristica minima "nome chiaramente non italiano": caratteri di altri
 * alfabeti (cirillico, CJK, greco, arabo, coreano) o diacritici estranei
 * all'italiano (ä ö ü ß ñ ç…). Serve solo con UI in italiano, per non
 * interrogare Wikidata su ogni POI già in italiano.
 */
function looksForeignName(name: string): boolean {
  if (/[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ぀-ヿ一-鿿가-힯]/.test(name)) return true;
  if (/[äöüßñçâêîôûëïÿøåæœãõšžł]/i.test(name)) return true;
  return false;
}

/** Estrae {wiki, title} da "it:Titolo" o da un URL Wikipedia completo. */
function parseWikipediaRef(ref: string): { wiki: string; title: string } | null {
  const trimmed = ref.trim();
  const mUrl = trimmed.match(/^https?:\/\/([a-z][a-z0-9-]{1,11})\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i);
  if (mUrl) {
    try {
      return { wiki: mUrl[1].toLowerCase(), title: decodeURIComponent(mUrl[2]).replace(/_/g, " ") };
    } catch {
      return { wiki: mUrl[1].toLowerCase(), title: mUrl[2].replace(/_/g, " ") };
    }
  }
  const mTag = trimmed.match(/^([a-z][a-z0-9-]{1,11}):(.+)$/i);
  if (mTag) return { wiki: mTag[1].toLowerCase(), title: mTag[2].trim() };
  return null;
}

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Etichetta Wikidata nella lingua richiesta (null se assente). */
async function fetchWikidataLabel(qid: string, lang: string): Promise<string | null> {
  const json = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=labels&languages=${encodeURIComponent(lang)}&format=json&origin=*`
  );
  const label = json?.entities?.[qid]?.labels?.[lang]?.value;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

/** Titolo dell'articolo collegato (langlinks) nella lingua richiesta. */
async function fetchWikipediaLanglink(wiki: string, title: string, lang: string): Promise<string | null> {
  const json = await fetchJson(
    `https://${wiki}.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(title)}&lllang=${encodeURIComponent(lang)}&lllimit=1&format=json&origin=*`
  );
  const pages = json?.query?.pages;
  if (!pages) return null;
  for (const pageId of Object.keys(pages)) {
    const links = pages[pageId]?.langlinks;
    if (Array.isArray(links) && links[0]?.["*"]) {
      const t = String(links[0]["*"]).trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Traduzione del nome POI nella lingua UI, o null se non c'è nulla di utile.
 * Best-effort e silenziosa: mai eccezioni verso il chiamante.
 * - UI italiana: si attiva solo se il nome sembra in un'altra lingua.
 * - Richiede un riferimento wikidata/wikipedia sul POI.
 * - La traduzione identica al nome mostrato viene scartata (inutile).
 */
export async function getTranslatedPoiName(poi: PoiNameRef, uiLang: Language | string): Promise<string | null> {
  try {
    const name = String(poi?.name || "").trim();
    if (!name) return null;

    const lang = uiLangToCode(uiLang);
    if (lang === "it" && !looksForeignName(name)) return null;

    const qidRaw = String(poi.wikidata || "").trim();
    const qid = /^Q\d+$/i.test(qidRaw) ? qidRaw.toUpperCase() : null;
    const wikiRef = poi.wikipedia ? parseWikipediaRef(String(poi.wikipedia)) : null;
    if (!qid && !wikiRef) return null;

    const id = String(poi.id);

    // ── Cache-first (anche negativa: "" = già cercato, niente trovato) ──
    const cache = readCache();
    const cachedForPoi = cache[id];
    if (cachedForPoi && typeof cachedForPoi[lang] === "string") {
      return cachedForPoi[lang] ? cachedForPoi[lang] : null;
    }

    let label: string | null = null;

    // Se il tag wikipedia è GIÀ nella lingua utente, il titolo è la traduzione.
    if (wikiRef && wikiRef.wiki === lang) {
      label = wikiRef.title;
    }
    if (!label && qid) {
      label = await fetchWikidataLabel(qid, lang);
    }
    if (!label && wikiRef && wikiRef.wiki !== lang) {
      label = await fetchWikipediaLanglink(wikiRef.wiki, wikiRef.title, lang);
    }

    const cleaned = (label || "").trim();
    const useful = !!cleaned && cleaned.toLowerCase() !== name.toLowerCase();

    // Aggiorna la cache (rilettura: un altro popup potrebbe averla toccata)
    const fresh = readCache();
    if (!fresh[id]) fresh[id] = {};
    fresh[id][lang] = useful ? cleaned : "";
    writeCache(fresh);

    return useful ? cleaned : null;
  } catch {
    return null;
  }
}
