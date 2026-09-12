/**
 * FEED DI EVENTI, MOSTRE E STAGIONALI — le fonti aggiunte il 07/09/2026.
 * ======================================================================
 *
 * Qui vive tutto ciò che la scheda Eventi legge OLTRE ai partner storici
 * (Ticketmaster, Viator, GetYourGuide, Tiqets, Virgilio):
 *
 *  - la città in tre nomi (locale, inglese, lingua dell'utente): i partner
 *    vogliono «Beijing», i portali cinesi «北京», l'utente legge «Pechino»;
 *  - Klook (affiliato, forte in Asia): attività dal widget dell'account, link
 *    profondo per le città senza widget;
 *  - Trip.com (affiliato, mondiale): elenco «cose da fare» letto dal sito,
 *    che è renderizzato lato server, con i parametri di affiliazione;
 *  - festival ricorrenti da Wikidata (CC0, in ogni lingua);
 *  - la tabella delle stagioni (mercatini di Natale, fioriture, aurora...)
 *    con le parole chiave per lingua, usata per interrogare gli affiliati
 *    solo nel periodo giusto;
 *  - l'estrazione delle mostre dai dati strutturati (JSON-LD Event) dei siti
 *    dei musei, prima di ricorrere all'AI, e la normalizzazione Unicode che
 *    tiene i titoli in cinese, giapponese, russo, greco.
 *
 * Regola del progetto: nessuna voce inventata, nessuna foto di ripiego. Ogni
 * funzione qui restituisce [] quando la fonte tace.
 *
 * La cache passa dalle funzioni di server.ts (api_cache) tramite
 * configuraEventiFeed: il modulo non conosce Supabase.
 */
import axios from 'axios';
import { createHash } from 'crypto';
import { KLOOK_AID, KLOOK_ADS, KLOOK_LOCALE, klookCityFor, klookCitySlug } from './klookCities.js';

// ── Affiliazioni ───────────────────────────────────────────────────────────
/** Trip.com Affiliate Platform: parametri letti dal pannello il 07/09/2026. */
export const TRIPCOM_ALLIANCE_ID = '10464833';
export const TRIPCOM_SID = '330520429';

/** Link Trip.com con l'affiliazione: mai riscrivere quelli che ce l'hanno già. */
export function tripcomAffiliateUrl(url: string, sub1 = 'wip_eventi'): string {
  try {
    const u = new URL(url);
    if (!/(^|\.)trip\.com$/i.test(u.hostname)) return url;
    if (!u.searchParams.get('Allianceid')) u.searchParams.set('Allianceid', TRIPCOM_ALLIANCE_ID);
    if (!u.searchParams.get('SID')) u.searchParams.set('SID', TRIPCOM_SID);
    if (!u.searchParams.get('trip_sub1')) u.searchParams.set('trip_sub1', sub1);
    return u.toString();
  } catch { return url; }
}

/** Link Klook con l'affiliazione (formato documentato dal pannello: ?aid=). */
export function klookAffiliateUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!/(^|\.)klook\.com$/i.test(u.hostname)) return url;
    if (u.hostname === 'affiliate.klook.com') return url;   // /redirect gia' tracciato
    if (!u.searchParams.get('aid')) u.searchParams.set('aid', String(KLOOK_AID));
    return u.toString();
  } catch { return url; }
}

// ── Cache iniettata da server.ts ──────────────────────────────────────────
type CacheFns = {
  get: (chiave: string) => Promise<any>;
  set: (chiave: string, tipo: string, valore: any) => Promise<void>;
};
let cache: CacheFns = { get: async () => null, set: async () => {} };
export function configuraEventiFeed(c: CacheFns) { cache = c; }

/** Legge dalla cache {ts, data} se piu' giovane di ttlMs; il vuoto vale 1 h. */
async function cacheLeggi(chiave: string, ttlMs: number): Promise<any | null> {
  try {
    const riga = await cache.get(chiave);
    let p: any = riga?.text_content ?? riga;
    if (!p) return null;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
    const ts = Number(p?.ts) || 0;
    if (!ts) return null;
    const vuoto = Array.isArray(p?.data) ? p.data.length === 0 : !p?.data;
    if (Date.now() - ts > (vuoto ? Math.min(ttlMs, 3_600_000) : ttlMs)) return null;
    return p.data;
  } catch { return null; }
}
function cacheScrivi(chiave: string, tipo: string, data: any): void {
  cache.set(chiave, tipo, { ts: Date.now(), data }).catch(() => {});
}

const UA = 'Mozilla/5.0 (compatible; WorldInPocket/1.0; +https://wip.guide)';
const slug = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9぀-ヿ㐀-鿿가-힯]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Normalizzazione Unicode per i confronti anti-allucinazione: tiene lettere e
 * cifre di OGNI alfabeto. La versione precedente teneva solo a-z0-9 e
 * scartava tutti i titoli cinesi, giapponesi, russi e greci.
 */
export const normUnicode = (s: any): string =>
  String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// ── La città in tre nomi ───────────────────────────────────────────────────
/** Lingua principale per paese (ISO 3166-1 → ISO 639-1). Solo dove serve. */
export const LINGUA_PAESE: Record<string, string> = {
  it: 'it', sm: 'it', va: 'it', ch: 'de', at: 'de', de: 'de', li: 'de',
  fr: 'fr', mc: 'fr', be: 'nl', lu: 'fr', nl: 'nl',
  es: 'es', mx: 'es', ar: 'es', cl: 'es', co: 'es', pe: 'es', uy: 'es', cu: 'es', ec: 'es', bo: 'es', py: 'es', ve: 'es', gt: 'es', cr: 'es', pa: 'es', do: 'es',
  pt: 'pt', br: 'pt', gb: 'en', ie: 'en', us: 'en', ca: 'en', au: 'en', nz: 'en', sg: 'en', za: 'en', in: 'en', ph: 'en', ke: 'en', ng: 'en', mt: 'en',
  ru: 'ru', by: 'ru', kz: 'ru', ua: 'uk', pl: 'pl', cz: 'cs', sk: 'sk', hu: 'hu', ro: 'ro', bg: 'bg', gr: 'el', cy: 'el', tr: 'tr',
  hr: 'hr', si: 'sl', rs: 'sr', ba: 'bs', me: 'sr', mk: 'mk', al: 'sq', ee: 'et', lv: 'lv', lt: 'lt', fi: 'fi', se: 'sv', no: 'no', dk: 'da', is: 'is',
  cn: 'zh', tw: 'zh', hk: 'zh', mo: 'zh', jp: 'ja', kr: 'ko', th: 'th', vn: 'vi', id: 'id', my: 'ms', kh: 'km', la: 'lo', mm: 'my', np: 'ne', lk: 'si', bd: 'bn', pk: 'ur', mn: 'mn',
  ae: 'ar', sa: 'ar', qa: 'ar', om: 'ar', kw: 'ar', bh: 'ar', jo: 'ar', eg: 'ar', ma: 'ar', tn: 'ar', dz: 'ar', lb: 'ar', iq: 'ar', il: 'he', ir: 'fa', ge: 'ka', am: 'hy', az: 'az',
  et: 'am', tz: 'sw', ug: 'sw', mz: 'pt', ao: 'pt', sn: 'fr', ci: 'fr', cm: 'fr', mg: 'fr', ml: 'fr',
};

export interface CittaNomi {
  cc: string;            // ISO 3166-1 alpha-2 minuscolo ('cn')
  locale: string;        // nome nella lingua del posto ('北京')
  en: string;            // nome inglese ('Beijing')
  utente: string;        // nome nella lingua dell'utente ('Pechino')
  lingua_locale: string; // 'zh'
  regione: string;       // stato/regione (per le sagre italiane)
}

/**
 * Un solo reverse Nominatim con namedetails=1: name, name:en, name:<lingua>
 * arrivano insieme. zoom=10 = livello città. Cache per cella di ~1 km.
 */
export async function cittaInTreNomi(lat: number, lon: number, lang: string): Promise<CittaNomi> {
  const lingua = String(lang || 'it').slice(0, 2).toLowerCase();
  const chiave = `citta3_${lat.toFixed(2)}_${lon.toFixed(2)}_${lingua}`;
  const hit = await cacheLeggi(chiave, 30 * 86400_000);
  if (hit && hit.en) return hit;
  const vuoto: CittaNomi = { cc: '', locale: '', en: '', utente: '', lingua_locale: '', regione: '' };
  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon, format: 'jsonv2', zoom: 10, namedetails: 1, 'accept-language': `${lingua},en` },
      headers: { 'User-Agent': 'WorldInPocketEvents/1.0 (https://wip.guide)' },
      timeout: 8000,
    });
    const d = r.data || {};
    const a = d.address || {};
    const nd = d.namedetails || {};
    const cc = String(a.country_code || '').toLowerCase();
    const linguaLocale = LINGUA_PAESE[cc] || '';
    const base = a.city || a.town || a.village || a.municipality || a.county || a.state_district || '';
    const out: CittaNomi = {
      cc,
      locale: String(nd.name || (linguaLocale && nd[`name:${linguaLocale}`]) || base || ''),
      en: String(nd['name:en'] || d.name || base || ''),
      utente: String(nd[`name:${lingua}`] || base || nd.name || ''),
      lingua_locale: linguaLocale,
      regione: String(a.state || a.region || ''),
    };
    // Nomi con la sigla di provincia («Milano (MI)») o virgole: si tiene la prima parte.
    for (const k of ['locale', 'en', 'utente'] as const) out[k] = out[k].split(/[,(]/)[0].trim();
    if (out.en) cacheScrivi(chiave, 'citta3', out);
    return out.en ? out : vuoto;
  } catch (e: any) {
    console.warn('[citta3] reverse fallito:', e?.message);
    return vuoto;
  }
}

// ── Klook ──────────────────────────────────────────────────────────────────
export interface AttivitaAffiliata {
  id: string;
  name: string;
  description: string;
  price: string;
  rating: string;
  imageUrl: string;
  url: string;
  source: 'klook' | 'tripcom';
  city: string;
  /** true = e' il link di ricerca della citta', non un prodotto. */
  isSearch?: boolean;
}

/**
 * Attività Klook per una città (nome inglese). Con un widget salvato per la
 * città arrivano 6 attività vere (prezzo, voto, foto, link affiliato); senza,
 * il link affiliato alla pagina della città. Cache 6 h.
 */
export async function klookAttivita(cityEn: string, lang: string): Promise<AttivitaAffiliata[]> {
  const lingua = String(lang || 'it').slice(0, 2).toLowerCase();
  const citta = klookCityFor(cityEn);
  if (!citta) return [];
  const locale = KLOOK_LOCALE[lingua] || 'en-US';
  const paginaCitta = klookAffiliateUrl(`https://www.klook.com/${locale}/city/${citta.id}-${klookCitySlug(citta)}/`);
  const ricerca: AttivitaAffiliata = {
    id: `klook-city-${citta.id}`,
    name: citta.name,
    description: '',
    price: '', rating: '', imageUrl: '',
    url: paginaCitta,
    source: 'klook', city: citta.name, isSearch: true,
  };
  const adid = KLOOK_ADS[citta.id];
  if (!adid) return [ricerca];

  const chiave = `klook_${citta.id}_${lingua}`;
  const hit = await cacheLeggi(chiave, 6 * 3_600_000);
  if (Array.isArray(hit) && hit.length) return hit;
  try {
    const r = await axios.get('https://affiliate.klook.com/v1/affadsrv/widget/dynamic', {
      params: { adid, lang: lingua === 'zh' ? 'zh-CN' : lingua, currency: 'EUR' },
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: 8000,
    });
    const acts: any[] = r.data?.result?.activities || [];
    const out: AttivitaAffiliata[] = acts.map((a: any) => ({
      id: `klook-${a.id}`,
      name: String(a.title || '').trim(),
      description: String(a.seo_desc || '').trim(),
      price: a.sell_price_format || (a.sell_price ? `EUR ${a.sell_price}` : ''),
      rating: a.score ? `${Number(a.score).toFixed(1)} ⭐${a.review_total ? ` (${a.review_total})` : ''}` : '',
      imageUrl: String(a.image_url_host || ''),
      url: String(a.jump_url || '').startsWith('/')
        ? `https://affiliate.klook.com${a.jump_url}`
        : klookAffiliateUrl(`https://www.klook.com/${locale}/activity/${a.id}-${a.url_seo || ''}/`),
      source: 'klook' as const,
      city: String(a.city_name || citta.name),
    })).filter((x) => x.name && x.url);
    const lista = out.length ? [...out, ricerca] : [ricerca];
    cacheScrivi(chiave, 'klook', lista);
    return lista;
  } catch (e: any) {
    console.warn('[klook] widget non risponde:', e?.message);
    return [ricerca];
  }
}

// ── Trip.com ───────────────────────────────────────────────────────────────
const TRIPCOM_HOST: Record<string, string> = { it: 'it.trip.com', fr: 'fr.trip.com', de: 'de.trip.com', es: 'es.trip.com', ru: 'ru.trip.com', zh: 'hk.trip.com', en: 'www.trip.com' };
const TRIPCOM_LOCALE: Record<string, string> = { it: 'it-IT', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU', zh: 'zh-HK', en: 'en-XX' };

const decodeHtml = (s: string) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n, 10)))
  .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

/**
 * «Cose da fare» di Trip.com per una città: la pagina elenco è renderizzata
 * lato server (verificato il 07/09/2026), quindi si legge con un GET e si
 * estraggono le card (attrazioni e tour). Nome locale o inglese: Trip.com
 * accetta entrambi. Cache 24 h per città e lingua.
 */
export async function tripcomAttivita(cityName: string, lang: string): Promise<AttivitaAffiliata[]> {
  const lingua = String(lang || 'it').slice(0, 2).toLowerCase();
  const nome = String(cityName || '').trim();
  if (nome.length < 2) return [];
  const chiave = `tripcom_${slug(nome) || 'x'}_${lingua}`;
  const hit = await cacheLeggi(chiave, 24 * 3_600_000);
  if (Array.isArray(hit) && hit.length) return hit;

  const host = TRIPCOM_HOST[lingua] || 'www.trip.com';
  const listaUrl = `https://${host}/things-to-do/list?keyword=${encodeURIComponent(nome)}&curr=EUR&locale=${TRIPCOM_LOCALE[lingua] || 'en-XX'}`;
  const ricerca: AttivitaAffiliata = {
    id: `tripcom-search-${slug(nome)}`,
    name: nome, description: '', price: '', rating: '', imageUrl: '',
    url: tripcomAffiliateUrl(listaUrl), source: 'tripcom', city: nome, isSearch: true,
  };
  let html = '';
  try {
    const r = await axios.get(listaUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': `${lingua},en;q=0.8` },
      timeout: 10000, responseType: 'text', maxContentLength: 4_000_000, validateStatus: (s) => s < 400,
    });
    html = String(r.data || '');
  } catch (e: any) {
    console.warn('[tripcom] lettura fallita:', e?.response?.status || e?.message);
    return [ricerca];
  }

  const out: AttivitaAffiliata[] = [];
  const visti = new Set<string>();
  // Ogni card e' un <a href="...travel-guide/attraction/..."> o ".../things-to-do/detail/...".
  const re = /<a\s[^>]*href="(https?:\/\/[a-z.]*trip\.com\/(?:travel-guide\/attraction|things-to-do\/detail)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 40) {
    const href = m[1].replace(/&amp;/g, '&');
    const blocco = m[2];
    const idm = href.match(/-(\d+)(?:[/?]|$)|\/detail\/(\d+)/);
    const id = idm ? (idm[1] || idm[2]) : href;
    if (visti.has(id)) continue;
    const titolo = decodeHtml((blocco.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || (blocco.match(/alt="([^"]+)"/i) || [])[1] || '');
    if (!titolo || titolo.length < 3) continue;
    visti.add(id);
    const img = (blocco.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i) || [])[1] || '';
    const testo = decodeHtml(blocco);
    const prezzo = (testo.match(/(?:From|Da|A partire da|Ab|Desde|À partir de|от|由)\s*([€$£¥₩]?\s?[\d.,]+\s?[A-Z€$£¥₩]{0,3})/i) || [])[1] || '';
    const voto = (testo.match(/\b([1-5](?:\.\d)?)\s*\/\s*5\b/) || [])[1] || '';
    const descr = testo.replace(titolo, '').replace(/\d+\s?(m|km) (from|da|de|von|desde)\b.*$/i, '').slice(0, 160).trim();
    out.push({
      id: `tripcom-${id}`,
      name: titolo,
      description: descr,
      price: prezzo ? `da ${prezzo.trim()}` : '',
      rating: voto ? `${voto} ⭐` : '',
      imageUrl: img.startsWith('http') ? img : (img.startsWith('//') ? `https:${img}` : ''),
      url: tripcomAffiliateUrl(href),
      source: 'tripcom',
      city: nome,
    });
  }
  const lista = out.length ? [...out, ricerca] : [ricerca];
  if (out.length) cacheScrivi(chiave, 'tripcom', lista);
  return lista;
}

// ── Festival da Wikidata ───────────────────────────────────────────────────
/** Mesi di Wikidata (P2922 «mese dell'anno») → numero. */
const MESE_WD: Record<string, number> = { Q108: 1, Q109: 2, Q110: 3, Q118: 4, Q119: 5, Q120: 6, Q121: 7, Q122: 8, Q123: 9, Q124: 10, Q125: 11, Q126: 12 };

export interface FestivalWd {
  id: string; kind: 'festival'; name: string; description: string; date: string; endDate?: string;
  venueName: string; url: string; imageUrl: string; lat: number; lon: number; approx: boolean;
  mese: number | null; quando: string;
}

/**
 * Festival ricorrenti collegati a un luogo nel raggio (P276/P131 → P625):
 * restano solo quelli con un giorno o un mese dell'anno (P837/P2922) o con
 * un'edizione datata da quest'anno in poi (P580). Etichette nella lingua
 * dell'utente con ripiego su inglese e lingua locale. Fail-open.
 */
export async function festivalDaWikidata(lat: number, lon: number, raggioKm: number, lang: string, linguaLocale = ''): Promise<FestivalWd[]> {
  const r = Math.min(80, Math.max(5, Math.round(raggioKm)));
  const lingua = String(lang || 'it').slice(0, 2).toLowerCase();
  const chiave = `festival_wd_${lat.toFixed(1)}_${lon.toFixed(1)}_${r}_${lingua}`;
  const hit = await cacheLeggi(chiave, 7 * 86400_000);
  if (Array.isArray(hit)) return hit;
  const anno = new Date().getUTCFullYear();
  const lingue = [lingua, 'en', linguaLocale, 'it'].filter((x, i, a) => x && a.indexOf(x) === i).join(',');
  const sparql = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?luogoLabel ?coord ?giornoLabel ?mese ?sito ?img ?inizio ?fine WHERE {
  SERVICE wikibase:around {
    ?luogo wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon.toFixed(4)} ${lat.toFixed(4)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${r}" .
  }
  ?item (wdt:P276|wdt:P131) ?luogo .
  ?item wdt:P31/wdt:P279* wd:Q132241 .
  OPTIONAL { ?item wdt:P837 ?giorno }
  OPTIONAL { ?item wdt:P2922 ?mese }
  OPTIONAL { ?item wdt:P856 ?sito }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P580 ?inizio }
  OPTIONAL { ?item wdt:P582 ?fine }
  FILTER(BOUND(?giorno) || BOUND(?mese) || (BOUND(?inizio) && ?inizio >= "${anno}-01-01T00:00:00Z"^^xsd:dateTime))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lingue}". }
} LIMIT 80`;
  try {
    const resp = await axios.get('https://query.wikidata.org/sparql', {
      params: { query: sparql, format: 'json' },
      headers: { 'User-Agent': 'WorldInPocket/1.0 (https://wip.guide; support@wip.guide)', Accept: 'application/sparql-results+json' },
      timeout: 15000,
    });
    const righe: any[] = resp.data?.results?.bindings || [];
    const visti = new Set<string>();
    const oggi = new Date().toISOString().slice(0, 10);
    const out: FestivalWd[] = [];
    for (const b of righe) {
      const qid = String(b.item?.value || '').split('/').pop() || '';
      if (!qid || visti.has(qid)) continue;
      const mc = String(b.coord?.value || '').match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      const pLat = mc ? parseFloat(mc[2]) : NaN, pLon = mc ? parseFloat(mc[1]) : NaN;
      if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
      const nome = String(b.itemLabel?.value || '');
      if (!nome || nome === qid) continue;
      // Edizioni passate (P582 prima di oggi) non servono a nessuno.
      const fine = String(b.fine?.value || '').slice(0, 10);
      if (fine && fine < oggi) continue;
      visti.add(qid);
      const meseQ = String(b.mese?.value || '').split('/').pop() || '';
      const mese = MESE_WD[meseQ] ?? null;
      const giorno = String(b.giornoLabel?.value || '');
      const inizio = String(b.inizio?.value || '').slice(0, 10);
      const quando = giorno || (mese ? new Date(Date.UTC(2000, mese - 1, 15)).toLocaleDateString(lingua === 'zh' ? 'zh-CN' : lingua, { month: 'long' }) : '') || (inizio && inizio >= oggi ? inizio : '');
      out.push({
        id: `festival-wd-${qid}`,
        kind: 'festival',
        name: nome,
        description: [String(b.itemDescription?.value || ''), quando ? `📅 ${quando}` : ''].filter(Boolean).join(' · '),
        // Una data esatta si mette solo se Wikidata la da' per un'edizione futura.
        date: inizio && inizio >= oggi ? inizio : '',
        endDate: fine || undefined,
        venueName: String(b.luogoLabel?.value || ''),
        url: String(b.sito?.value || `https://www.wikidata.org/wiki/${qid}`),
        imageUrl: b.img?.value ? `${String(b.img.value).replace(/^http:/, 'https:')}?width=640` : '',
        lat: pLat, lon: pLon, approx: false,
        mese, quando,
      });
    }
    cacheScrivi(chiave, 'festival_wd', out);
    return out;
  } catch (e: any) {
    console.warn('[festival] wikidata non risponde:', e?.message);
    return [];
  }
}

// ── Stagioni ───────────────────────────────────────────────────────────────
export interface Stagione {
  id: string;
  emoji: string;
  /** Mesi in cui e' attiva (1-12). */
  mesi: number[];
  /** Paesi (ISO minuscolo) dove ha senso; vuoto = ovunque. */
  paesi: string[];
  /** Parola chiave per lingua: quella dell'utente va ai partner, quella locale ai portali. */
  parole: Record<string, string>;
  /** Titolo del blocco per lingua. */
  titolo: Record<string, string>;
}

export const STAGIONI: Stagione[] = [
  {
    id: 'natale', emoji: '🎄', mesi: [11, 12], paesi: [],
    parole: { it: 'mercatini di Natale', en: 'Christmas market', fr: 'marché de Noël', es: 'mercado de Navidad', de: 'Weihnachtsmarkt', ru: 'рождественская ярмарка', zh: '圣诞市集', ja: 'クリスマスマーケット', nl: 'kerstmarkt', pt: 'mercado de Natal', pl: 'jarmark bożonarodzeniowy', cs: 'vánoční trhy' },
    titolo: { it: 'Mercatini di Natale', en: 'Christmas markets', fr: 'Marchés de Noël', es: 'Mercados navideños', de: 'Weihnachtsmärkte', ru: 'Рождественские ярмарки', zh: '圣诞市集' },
  },
  {
    id: 'capodanno', emoji: '🎆', mesi: [12, 1], paesi: [],
    parole: { it: 'Capodanno', en: 'New Year\'s Eve', fr: 'réveillon du Nouvel An', es: 'Nochevieja', de: 'Silvester', ru: 'Новый год', zh: '跨年', ja: '年越し' },
    titolo: { it: 'Capodanno', en: 'New Year\'s Eve', fr: 'Nouvel An', es: 'Nochevieja', de: 'Silvester', ru: 'Новый год', zh: '跨年' },
  },
  {
    id: 'carnevale', emoji: '🎭', mesi: [1, 2, 3], paesi: ['it', 'br', 'de', 'ch', 'be', 'nl', 'es', 'pt', 'fr', 'hr', 'si', 'at', 'co', 'tt', 'us', 'ca'],
    parole: { it: 'Carnevale', en: 'Carnival', fr: 'Carnaval', es: 'Carnaval', de: 'Karneval', pt: 'Carnaval', ru: 'карнавал', zh: '狂欢节' },
    titolo: { it: 'Carnevale', en: 'Carnival', fr: 'Carnaval', es: 'Carnaval', de: 'Karneval', ru: 'Карнавал', zh: '狂欢节' },
  },
  {
    id: 'lanterne', emoji: '🏮', mesi: [1, 2], paesi: ['cn', 'tw', 'hk', 'mo', 'sg', 'my', 'vn', 'kr', 'th', 'id', 'ph'],
    parole: { it: 'Capodanno cinese', en: 'Lunar New Year', fr: 'Nouvel An chinois', es: 'Año Nuevo chino', de: 'Chinesisches Neujahr', ru: 'китайский Новый год', zh: '春节', ko: '설날', vi: 'Tết' },
    titolo: { it: 'Capodanno lunare', en: 'Lunar New Year', fr: 'Nouvel An lunaire', es: 'Año Nuevo lunar', de: 'Mondneujahr', ru: 'Лунный Новый год', zh: '春节' },
  },
  {
    id: 'fioritura', emoji: '🌸', mesi: [3, 4], paesi: ['jp', 'kr', 'cn', 'tw', 'us', 'de', 'nl', 'es', 'fr', 'gb', 'ca', 'it'],
    parole: { it: 'fioritura dei ciliegi', en: 'cherry blossom', fr: 'cerisiers en fleurs', es: 'cerezos en flor', de: 'Kirschblüte', ru: 'цветение сакуры', zh: '赏樱', ja: '桜 花見', ko: '벚꽃', nl: 'tulpen' },
    titolo: { it: 'Fioriture', en: 'Blossoms', fr: 'Floraisons', es: 'Floraciones', de: 'Blütezeit', ru: 'Цветение', zh: '赏花' },
  },
  {
    id: 'pasqua', emoji: '🐣', mesi: [3, 4], paesi: ['it', 'es', 'gr', 'pt', 'fr', 'de', 'at', 'pl', 'gb', 'mx', 'gt', 'pe', 'ph', 'va'],
    parole: { it: 'Settimana Santa Pasqua', en: 'Easter Holy Week', fr: 'Semaine sainte Pâques', es: 'Semana Santa', de: 'Ostern', ru: 'Пасха', zh: '复活节' },
    titolo: { it: 'Pasqua e Settimana Santa', en: 'Easter and Holy Week', fr: 'Pâques', es: 'Semana Santa', de: 'Ostern', ru: 'Пасха', zh: '复活节' },
  },
  {
    id: 'fuochi', emoji: '🎇', mesi: [7, 8], paesi: ['jp', 'kr', 'tw', 'us', 'ca', 'fr', 'gb', 'es', 'it', 'au'],
    parole: { it: 'fuochi d\'artificio estate', en: 'summer fireworks festival', fr: 'feu d\'artifice été', es: 'fuegos artificiales verano', de: 'Feuerwerk Sommer', ru: 'фейерверк лето', zh: '烟花大会', ja: '花火大会' },
    titolo: { it: 'Fuochi d\'estate', en: 'Summer fireworks', fr: 'Feux d\'artifice', es: 'Fuegos artificiales', de: 'Sommerfeuerwerk', ru: 'Летние фейерверки', zh: '夏日烟花' },
  },
  {
    id: 'vendemmia', emoji: '🍇', mesi: [9, 10], paesi: ['it', 'fr', 'es', 'pt', 'de', 'at', 'ar', 'cl', 'za', 'au', 'us', 'ge', 'hu', 'gr', 'nz'],
    parole: { it: 'vendemmia degustazione vino', en: 'wine harvest tasting', fr: 'vendanges dégustation', es: 'vendimia cata de vinos', de: 'Weinlese Weinprobe', ru: 'сбор винограда дегустация', zh: '葡萄酒庄', pt: 'vindima' },
    titolo: { it: 'Vendemmia', en: 'Wine harvest', fr: 'Vendanges', es: 'Vendimia', de: 'Weinlese', ru: 'Сбор винограда', zh: '葡萄丰收' },
  },
  {
    id: 'oktoberfest', emoji: '🍺', mesi: [9, 10], paesi: ['de', 'at', 'ch', 'br', 'us', 'ca', 'cn', 'jp'],
    parole: { it: 'Oktoberfest', en: 'Oktoberfest', fr: 'Oktoberfest', es: 'Oktoberfest', de: 'Oktoberfest', ru: 'Октоберфест', zh: '啤酒节' },
    titolo: { it: 'Oktoberfest e feste della birra', en: 'Oktoberfest and beer festivals', fr: 'Oktoberfest', es: 'Oktoberfest', de: 'Oktoberfest und Bierfeste', ru: 'Октоберфест', zh: '啤酒节' },
  },
  {
    id: 'tartufo', emoji: '🍄', mesi: [10, 11, 12], paesi: ['it', 'fr', 'hr', 'es', 'si'],
    parole: { it: 'caccia al tartufo', en: 'truffle hunting', fr: 'chasse à la truffe', es: 'búsqueda de trufas', de: 'Trüffelsuche', ru: 'поиск трюфелей', zh: '松露' },
    titolo: { it: 'Tartufo e sapori d\'autunno', en: 'Truffles and autumn flavours', fr: 'Truffes d\'automne', es: 'Trufas de otoño', de: 'Trüffelherbst', ru: 'Трюфели', zh: '秋季美食' },
  },
  {
    id: 'foliage', emoji: '🍁', mesi: [10, 11], paesi: ['jp', 'kr', 'cn', 'us', 'ca', 'de', 'at', 'ch', 'it', 'fr', 'gb'],
    parole: { it: 'foliage autunno', en: 'autumn foliage', fr: 'couleurs d\'automne', es: 'otoño hojas', de: 'Herbstlaub', ru: 'осенняя листва', zh: '红叶', ja: '紅葉', ko: '단풍' },
    titolo: { it: 'Foliage d\'autunno', en: 'Autumn foliage', fr: 'Couleurs d\'automne', es: 'Colores de otoño', de: 'Herbstlaub', ru: 'Осенняя листва', zh: '红叶季' },
  },
  {
    id: 'halloween', emoji: '🎃', mesi: [10], paesi: ['us', 'ca', 'gb', 'ie', 'mx', 'jp', 'au', 'de', 'it', 'es', 'fr'],
    parole: { it: 'Halloween', en: 'Halloween', fr: 'Halloween', es: 'Halloween Día de Muertos', de: 'Halloween', ru: 'Хэллоуин', zh: '万圣节' },
    titolo: { it: 'Halloween', en: 'Halloween', fr: 'Halloween', es: 'Halloween y Día de Muertos', de: 'Halloween', ru: 'Хэллоуин', zh: '万圣节' },
  },
  {
    id: 'aurora', emoji: '🌌', mesi: [9, 10, 11, 12, 1, 2, 3], paesi: ['no', 'se', 'fi', 'is', 'ca', 'gl', 'ru', 'us', 'gb', 'ee', 'lv'],
    parole: { it: 'aurora boreale', en: 'northern lights', fr: 'aurores boréales', es: 'auroras boreales', de: 'Nordlichter', ru: 'северное сияние', zh: '极光', fi: 'revontulet', no: 'nordlys', sv: 'norrsken' },
    titolo: { it: 'Aurora boreale', en: 'Northern lights', fr: 'Aurores boréales', es: 'Auroras boreales', de: 'Nordlichter', ru: 'Северное сияние', zh: '极光' },
  },
  {
    id: 'neve', emoji: '⛷️', mesi: [12, 1, 2, 3], paesi: ['it', 'fr', 'ch', 'at', 'de', 'no', 'se', 'fi', 'jp', 'us', 'ca', 'kr', 'cn', 'es', 'ad', 'si', 'cl', 'ar', 'nz', 'au'],
    parole: { it: 'sci neve', en: 'ski snow', fr: 'ski neige', es: 'esquí nieve', de: 'Ski Schnee', ru: 'лыжи снег', zh: '滑雪', ja: 'スキー' },
    titolo: { it: 'Neve e sci', en: 'Snow and skiing', fr: 'Neige et ski', es: 'Nieve y esquí', de: 'Schnee und Ski', ru: 'Снег и лыжи', zh: '滑雪季' },
  },
  {
    id: 'balene', emoji: '🐋', mesi: [6, 7, 8, 9, 10], paesi: ['is', 'no', 'pt', 'es', 'za', 'au', 'nz', 'us', 'ca', 'mx', 'ar', 'cl', 'ec', 'lk', 'dm', 'to'],
    parole: { it: 'avvistamento balene', en: 'whale watching', fr: 'observation des baleines', es: 'avistamiento de ballenas', de: 'Walbeobachtung', ru: 'наблюдение за китами', zh: '观鲸', pt: 'observação de baleias' },
    titolo: { it: 'Balene in vista', en: 'Whale watching', fr: 'Baleines', es: 'Ballenas', de: 'Wale', ru: 'Киты', zh: '观鲸' },
  },
  {
    id: 'diwali', emoji: '🪔', mesi: [10, 11], paesi: ['in', 'np', 'lk', 'sg', 'my', 'mu', 'fj', 'gb'],
    parole: { it: 'Diwali', en: 'Diwali', fr: 'Diwali', es: 'Diwali', de: 'Diwali', ru: 'Дивали', zh: '排灯节', hi: 'दिवाली' },
    titolo: { it: 'Diwali', en: 'Diwali', fr: 'Diwali', es: 'Diwali', de: 'Diwali', ru: 'Дивали', zh: '排灯节' },
  },
];

/** Le stagioni attive per paese e mese (max 4, nell'ordine della tabella). */
export function stagioniAttive(cc: string, mese: number): Stagione[] {
  const paese = String(cc || '').toLowerCase();
  return STAGIONI.filter((s) => s.mesi.includes(mese) && (!s.paesi.length || !paese || s.paesi.includes(paese))).slice(0, 4);
}

// ── Mostre dai dati strutturati (JSON-LD) ──────────────────────────────────
export interface MostraStrutturata {
  titolo: string; titolo_originale: string; sottotitolo: string; artista: string;
  dal: string | null; al: string | null; descrizione: string; prezzo: string; url: string; immagine: string;
  /** Luogo e tipo schema.org (MusicEvent, ExhibitionEvent...): servono ai portali. */
  luogo: string; tipo: string; orario: string;
}

const TIPI_MOSTRA = /^(ExhibitionEvent|VisualArtsEvent|Event|Festival|EducationEvent|ChildrensEvent)$/i;
/** Tutti gli eventi schema.org: per i portali e le pagine trovate dalla ricerca web. */
const TIPI_EVENTO = /^(Event|ExhibitionEvent|VisualArtsEvent|MusicEvent|Festival|TheaterEvent|DanceEvent|ComedyEvent|SportsEvent|FoodEvent|SocialEvent|ScreeningEvent|LiteraryEvent|EducationEvent|ChildrensEvent|SaleEvent|BusinessEvent|CourseInstance)$/i;
const dataIsoJsonLd = (v: any): string | null => {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const testoJsonLd = (v: any): string => {
  if (!v) return '';
  if (typeof v === 'string') return decodeHtml(v);
  if (Array.isArray(v)) return testoJsonLd(v[0]);
  if (typeof v === 'object') return decodeHtml(v['@value'] || v.name || '');
  return String(v);
};

/**
 * Le mostre dichiarate dal sito stesso in JSON-LD (schema.org Event /
 * ExhibitionEvent): titolo copiato dalla pagina, date certe, zero AI. Molti
 * siti di musei le espongono; e' lo stesso meccanismo con cui leggiamo
 * eventiesagre.it. Restituisce solo le voci con almeno una data.
 */
export function mostreDaJsonLd(html: string, baseUrl: string): MostraStrutturata[] {
  return eventiDaJsonLd(html, baseUrl, TIPI_MOSTRA);
}

/** Tutti gli eventi schema.org di una pagina (portali, ricerca web). */
export function eventiDaJsonLd(html: string, baseUrl: string, tipi: RegExp = TIPI_EVENTO): MostraStrutturata[] {
  const out: MostraStrutturata[] = [];
  const blocchi = String(html || '').split(/<script[^>]+application\/ld\+json[^>]*>/i).slice(1);
  const visita = (nodo: any) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) { nodo.forEach(visita); return; }
    if (Array.isArray(nodo['@graph'])) nodo['@graph'].forEach(visita);
    const tipo = Array.isArray(nodo['@type']) ? nodo['@type'].find((t: any) => tipi.test(String(t))) : nodo['@type'];
    if (tipo && tipi.test(String(tipo))) {
      const titolo = testoJsonLd(nodo.name || nodo.headline);
      const dal = dataIsoJsonLd(nodo.startDate);
      const al = dataIsoJsonLd(nodo.endDate);
      if (titolo && titolo.length > 3 && (dal || al)) {
        let url = String(nodo.url || nodo['@id'] || '');
        try { url = url ? new URL(url, baseUrl).toString() : baseUrl; } catch { url = baseUrl; }
        const img = nodo.image;
        const immagine = typeof img === 'string' ? img : (Array.isArray(img) ? String(img[0]?.url || img[0] || '') : String(img?.url || ''));
        const offerta = Array.isArray(nodo.offers) ? nodo.offers[0] : nodo.offers;
        const prezzo = offerta?.price != null ? `${offerta.price} ${offerta.priceCurrency || ''}`.trim() : '';
        const loc = Array.isArray(nodo.location) ? nodo.location[0] : nodo.location;
        const luogo = [testoJsonLd(loc?.name), testoJsonLd(loc?.address?.addressLocality || (typeof loc?.address === 'string' ? loc.address : ''))].filter(Boolean).join(', ');
        const orario = (String(nodo.startDate || '').match(/T(\d{2}:\d{2})/) || [])[1] || '';
        out.push({
          titolo, titolo_originale: titolo,
          sottotitolo: testoJsonLd(nodo.alternativeHeadline || nodo.subtitle),
          artista: testoJsonLd(nodo.performer?.name || nodo.performer),
          dal, al,
          descrizione: testoJsonLd(nodo.description).slice(0, 220),
          prezzo, url,
          immagine: /^https?:/i.test(immagine) ? immagine : '',
          luogo, tipo: String(tipo), orario,
        });
      }
    }
    // Eventi annidati (subEvent, itemListElement)
    if (Array.isArray(nodo.subEvent)) nodo.subEvent.forEach(visita);
    if (Array.isArray(nodo.itemListElement)) nodo.itemListElement.forEach((e: any) => visita(e?.item || e));
  };
  for (const b of blocchi) {
    const raw = b.split('</script>')[0].replace(/[\r\n\t]+/g, ' ').trim();
    if (!raw) continue;
    let json: any;
    try { json = JSON.parse(raw); } catch { continue; }
    visita(json);
  }
  // Doppioni per titolo+dal
  const visti = new Set<string>();
  return out.filter((m) => {
    const k = `${normUnicode(m.titolo)}|${m.dal || ''}`;
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

// ── Ricerca web nella lingua locale ────────────────────────────────────────
// La rete che tiene dove non abbiamo censito un portale: «北京 展览 2026年9月»
// trova le pagine giuste, poi si leggono e si estraggono gli eventi (JSON-LD
// prima, AI dopo, sempre col titolo copiato dalla pagina).
//
// FORNITORE: si sceglie dalla chiave presente nell'ambiente.
//   - Brave Search API:      BRAVE_SEARCH_API_KEY
//   - Google Programmable:   GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX (motore su tutto il web)
// Nessuna chiave = ricerca spenta (restano i portali del registro). Costo
// nell'ordine dei 5 $ per 1.000 ricerche: la cache per query dura 7 giorni.

export interface RisultatoWeb { title: string; url: string; snippet: string; }

export function fornitoreRicerca(): 'brave' | 'google' | null {
  if (process.env.BRAVE_SEARCH_API_KEY) return 'brave';
  if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) return 'google';
  return null;
}

const hashBreve = (s: string) => createHash('md5').update(s).digest('hex').slice(0, 12);

export async function ricercaWeb(query: string, opts: { lang?: string; cc?: string; count?: number;
  /** 12/09/2026: fornitore e chiave dedicati (i musei non devono bruciare il credito degli Eventi). */
  provider?: 'brave' | 'google'; braveKey?: string } = {}): Promise<RisultatoWeb[]> {
  let fornitore: 'brave' | 'google' | null = opts.provider || fornitoreRicerca();
  if (fornitore === 'google' && !(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX)) fornitore = fornitoreRicerca();
  if (fornitore === 'brave' && !(opts.braveKey || process.env.BRAVE_SEARCH_API_KEY)) fornitore = fornitoreRicerca();
  const q = String(query || '').trim();
  if (!fornitore || !q) return [];
  const lang = String(opts.lang || 'en').slice(0, 2).toLowerCase();
  const cc = String(opts.cc || '').toUpperCase();
  const count = Math.min(20, Math.max(1, opts.count || 8));
  const chiave = `web_${fornitore}_${lang}_${hashBreve(`${q}|${cc}|${count}`)}`;
  const hit = await cacheLeggi(chiave, 7 * 86400_000);
  if (Array.isArray(hit)) return hit;
  let out: RisultatoWeb[] = [];
  try {
    if (fornitore === 'brave') {
      const r = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q, count, search_lang: lang, ...(cc ? { country: cc } : {}), safesearch: 'moderate', text_decorations: false },
        headers: { 'X-Subscription-Token': opts.braveKey || process.env.BRAVE_SEARCH_API_KEY, Accept: 'application/json' },
        timeout: 8000,
      });
      out = (r.data?.web?.results || []).map((x: any) => ({ title: String(x.title || ''), url: String(x.url || ''), snippet: String(x.description || '') }));
    } else {
      const r = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: { key: process.env.GOOGLE_CSE_API_KEY, cx: process.env.GOOGLE_CSE_CX, q, num: Math.min(10, count), lr: `lang_${lang}`, hl: lang, ...(cc ? { gl: cc.toLowerCase() } : {}) },
        timeout: 8000,
      });
      out = (r.data?.items || []).map((x: any) => ({ title: String(x.title || ''), url: String(x.link || ''), snippet: String(x.snippet || '') }));
    }
  } catch (e: any) {
    console.warn(`[ricercaWeb] ${fornitore} fallita:`, e?.response?.status || e?.message);
    return [];
  }
  out = out.filter((x) => /^https?:\/\//i.test(x.url));
  cacheScrivi(chiave, 'ricerca_web', out);
  return out;
}

/** Parole per la ricerca eventi nella lingua del posto. */
export const PAROLE_RICERCA: Record<string, { eventi: string; mostre: string; concerti: string }> = {
  it: { eventi: 'eventi', mostre: 'mostre', concerti: 'concerti' },
  en: { eventi: 'events', mostre: 'exhibitions', concerti: 'concerts' },
  fr: { eventi: 'événements', mostre: 'expositions', concerti: 'concerts' },
  es: { eventi: 'eventos', mostre: 'exposiciones', concerti: 'conciertos' },
  de: { eventi: 'Veranstaltungen', mostre: 'Ausstellungen', concerti: 'Konzerte' },
  pt: { eventi: 'eventos', mostre: 'exposições', concerti: 'concertos' },
  nl: { eventi: 'evenementen', mostre: 'tentoonstellingen', concerti: 'concerten' },
  ru: { eventi: 'события афиша', mostre: 'выставки', concerti: 'концерты' },
  uk: { eventi: 'події афіша', mostre: 'виставки', concerti: 'концерти' },
  pl: { eventi: 'wydarzenia', mostre: 'wystawy', concerti: 'koncerty' },
  cs: { eventi: 'akce', mostre: 'výstavy', concerti: 'koncerty' },
  sk: { eventi: 'podujatia', mostre: 'výstavy', concerti: 'koncerty' },
  hu: { eventi: 'programok', mostre: 'kiállítások', concerti: 'koncertek' },
  ro: { eventi: 'evenimente', mostre: 'expoziții', concerti: 'concerte' },
  bg: { eventi: 'събития', mostre: 'изложби', concerti: 'концерти' },
  el: { eventi: 'εκδηλώσεις', mostre: 'εκθέσεις', concerti: 'συναυλίες' },
  tr: { eventi: 'etkinlikler', mostre: 'sergiler', concerti: 'konserler' },
  hr: { eventi: 'događanja', mostre: 'izložbe', concerti: 'koncerti' },
  sl: { eventi: 'dogodki', mostre: 'razstave', concerti: 'koncerti' },
  sr: { eventi: 'dešavanja', mostre: 'izložbe', concerti: 'koncerti' },
  sv: { eventi: 'evenemang', mostre: 'utställningar', concerti: 'konserter' },
  no: { eventi: 'arrangementer', mostre: 'utstillinger', concerti: 'konserter' },
  da: { eventi: 'begivenheder', mostre: 'udstillinger', concerti: 'koncerter' },
  fi: { eventi: 'tapahtumat', mostre: 'näyttelyt', concerti: 'konsertit' },
  is: { eventi: 'viðburðir', mostre: 'sýningar', concerti: 'tónleikar' },
  et: { eventi: 'sündmused', mostre: 'näitused', concerti: 'kontserdid' },
  lv: { eventi: 'pasākumi', mostre: 'izstādes', concerti: 'koncerti' },
  lt: { eventi: 'renginiai', mostre: 'parodos', concerti: 'koncertai' },
  zh: { eventi: '活动', mostre: '展览', concerti: '演出 音乐会' },
  ja: { eventi: 'イベント', mostre: '展覧会', concerti: 'コンサート ライブ' },
  ko: { eventi: '행사', mostre: '전시', concerti: '공연 콘서트' },
  th: { eventi: 'กิจกรรม อีเวนต์', mostre: 'นิทรรศการ', concerti: 'คอนเสิร์ต' },
  vi: { eventi: 'sự kiện', mostre: 'triển lãm', concerti: 'hòa nhạc' },
  id: { eventi: 'acara event', mostre: 'pameran', concerti: 'konser' },
  ms: { eventi: 'acara', mostre: 'pameran', concerti: 'konsert' },
  ar: { eventi: 'فعاليات', mostre: 'معارض', concerti: 'حفلات موسيقية' },
  he: { eventi: 'אירועים', mostre: 'תערוכות', concerti: 'הופעות' },
  fa: { eventi: 'رویدادها', mostre: 'نمایشگاه', concerti: 'کنسرت' },
  hi: { eventi: 'कार्यक्रम', mostre: 'प्रदर्शनी', concerti: 'संगीत कार्यक्रम' },
  ka: { eventi: 'ღონისძიებები', mostre: 'გამოფენები', concerti: 'კონცერტები' },
  sw: { eventi: 'matukio', mostre: 'maonyesho', concerti: 'tamasha' },
};

/** «settembre 2026» nella lingua data (Intl regge quasi tutte le lingue). */
const meseAnnoLocale = (lang: string, d: Date): string => {
  try { return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { month: 'long', year: 'numeric' }); }
  catch { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
};

/**
 * Le tre ricerche per una città: eventi, mostre, concerti, nella lingua del
 * posto, col mese corrente. Se la lingua non e' in tabella si usa l'inglese
 * col nome inglese della città.
 */
export function queryEventiLocali(cittaLocale: string, linguaLocale: string, cittaEn: string, oggi = new Date()): { q: string; lang: string; tipo: 'eventi' | 'mostre' | 'concerti' }[] {
  const lingua = PAROLE_RICERCA[linguaLocale] ? linguaLocale : 'en';
  const citta = (lingua === linguaLocale && cittaLocale) ? cittaLocale : (cittaEn || cittaLocale);
  if (!citta) return [];
  const parole = PAROLE_RICERCA[lingua];
  const quando = meseAnnoLocale(lingua, oggi);
  return (['eventi', 'mostre', 'concerti'] as const).map((tipo) => ({ q: `${citta} ${parole[tipo]} ${quando}`, lang: lingua, tipo }));
}

const HOST_NON_LEGGIBILI = /(^|\.)(facebook|instagram|tiktok|twitter|x|youtube|pinterest|linkedin|reddit|amazon|google|apple|wikipedia|wikidata|tripadvisor|booking|airbnb|yelp)\.(com|it|org|net|de|fr|es|co\.uk|jp|cn)$/i;

/** Dai risultati di ricerca alle pagine che vale la pena leggere: un host una volta, niente social/PDF. */
export function pagineDaLeggere(risultati: RisultatoWeb[], max = 6): RisultatoWeb[] {
  const visti = new Set<string>();
  const out: RisultatoWeb[] = [];
  for (const r of risultati) {
    let host = '';
    try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { continue; }
    if (!host || visti.has(host) || HOST_NON_LEGGIBILI.test(host) || /\.(pdf|jpg|png|zip)(\?|$)/i.test(r.url)) continue;
    visti.add(host);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/** Il testo utile di una pagina, senza script, stili e menu (copia di testoDaHtml del server). */
export const testoPagina = (html: string, maxCaratteri: number): string =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxCaratteri);

/** Un evento estratto (JSON-LD o AI) nel formato unico dei portali. */
export interface EventoPortale {
  id: string;
  kind: 'concerto' | 'mostra' | 'festival' | 'mercato' | 'teatro' | 'sport' | 'altro';
  name: string;
  originalTitle: string;
  description: string;
  date: string;
  endDate: string;
  time: string;
  venueName: string;
  url: string;
  imageUrl: string;
  price: string;
  fonte: string;
}

const tipoDaSchema = (t: string): EventoPortale['kind'] => {
  const s = String(t || '').toLowerCase();
  if (/music|concert/.test(s)) return 'concerto';
  if (/exhibition|visualarts|mostra/.test(s)) return 'mostra';
  if (/festival/.test(s)) return 'festival';
  if (/theater|theatre|dance|comedy|screening/.test(s)) return 'teatro';
  if (/sport/.test(s)) return 'sport';
  if (/sale|market|mercato/.test(s)) return 'mercato';
  return 'altro';
};

/**
 * Filtro comune (JSON-LD e AI): titolo presente nel testo della pagina,
 * date sensate (da oggi a 12 mesi), un solo doppione per titolo+data.
 *
 * `cittaAccettate` (07/09/2026): sui portali MONDIALI (allevents.in,
 * Eventbrite) e sulle pagine trovate dalla ricerca web, una pagina intitolata
 * "/milan" può comunque mischiare promozioni globali di ALTRE città (visto
 * in produzione: un evento di Patna, India, dentro allevents.in/milan). Se
 * valorizzato, l'evento passa solo se il nome della città accettata compare
 * entro ~600 caratteri dal suo titolo nel testo — non basta stare sulla
 * pagina giusta, deve stare nel blocco giusto. Sui portali di UN solo paese
 * (Virgilio, Time Out Roma...) il parametro va lasciato vuoto: quei portali
 * non ripetono il nome città a ogni singolo evento, il controllo li
 * scarterebbe quasi tutti per un falso positivo.
 */
export function validaEventi(grezzi: any[], testoDellaPagina: string, urlPagina: string, oggi: string, cittaAccettate: string[] = []): EventoPortale[] {
  const testoNorm = normUnicode(testoDellaPagina);
  let host = '';
  try { host = new URL(urlPagina).hostname.replace(/^www\./, ''); } catch { host = ''; }
  const fraUnAnno = new Date(Date.now() + 366 * 86400_000).toISOString().slice(0, 10);
  const cittaNorm = cittaAccettate.map((c) => normUnicode(c)).filter((c) => c.length >= 3);
  const FINESTRA_CITTA = 600;
  const visti = new Set<string>();
  const out: EventoPortale[] = [];
  for (const g of grezzi) {
    const originale = String(g?.titolo_originale || g?.titolo || '').trim();
    const titolo = String(g?.titolo || originale).trim();
    if (!originale || originale.length < 3) continue;
    const chiaveTesto = normUnicode(originale).slice(0, 20);
    if (chiaveTesto.length < 3) continue;
    const posizione = testoNorm.indexOf(chiaveTesto);
    if (posizione < 0) continue;
    if (cittaNorm.length) {
      const finestra = testoNorm.slice(Math.max(0, posizione - FINESTRA_CITTA), posizione + chiaveTesto.length + FINESTRA_CITTA);
      if (!cittaNorm.some((c) => finestra.includes(c))) continue;
    }
    const dal = String(g?.dal || g?.data || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
    const al = String(g?.al || g?.data_fine || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
    if (!dal && !al) continue;
    if ((al || dal) < oggi) continue;
    if (dal && dal > fraUnAnno) continue;
    const k = `${normUnicode(originale).slice(0, 40)}|${dal || al}`;
    if (visti.has(k)) continue;
    visti.add(k);
    let url = String(g?.url || '').trim();
    try { url = url ? new URL(url, urlPagina).toString() : urlPagina; } catch { url = urlPagina; }
    out.push({
      id: `portale-${host}-${hashBreve(k)}`,
      kind: g?.kind || tipoDaSchema(g?.tipo),
      name: titolo,
      originalTitle: originale !== titolo ? originale : '',
      description: String(g?.descrizione || '').trim().slice(0, 240),
      date: dal || al,
      endDate: al && al !== dal ? al : '',
      time: String(g?.orario || '').match(/^\d{1,2}:\d{2}/)?.[0] || '',
      venueName: String(g?.luogo || '').trim(),
      url,
      imageUrl: /^https?:/i.test(String(g?.immagine || '')) ? String(g.immagine) : '',
      price: String(g?.prezzo || '').trim(),
      fonte: host,
    });
  }
  return out;
}
