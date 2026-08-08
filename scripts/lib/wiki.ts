/**
 * Identificazione di un POI sulle fonti enciclopediche, ANCORATA ALLE
 * COORDINATE.
 *
 * Il metodo precedente (`wbsearchentities?search=<nome>` e poi `search[0]`,
 * oppure `generator=search&gsrlimit=1` su Wikipedia) prendeva il primo
 * risultato testuale senza alcuna verifica: per "Chiesa di San Giuseppe" o
 * "Museo Civico" restituiva l'omonimo più famoso, magari a 600 km. Quei dati
 * finivano nel prompt come "Dati Strutturati Ufficiali" e il modello li usava
 * come veri, producendo date e architetti sbagliati con tono autorevole.
 *
 * Qui si parte invece da dove il POI si trova: geosearch attorno alle sue
 * coordinate, poi si accetta la pagina solo se anche il NOME è compatibile.
 * Se nulla combacia si ritorna null, e chi chiama scriverà solo il contesto.
 *
 * Modulo condiviso da mass_enrich_background.ts e wikidata_retro_enrich.ts.
 */

/** Le API Wikimedia chiedono uno User-Agent identificabile con un contatto. */
export const WIKI_UA = 'WIP-WorldInPocket/1.0 (https://itainta.vercel.app; marmidicarrara@gmail.com)';

/** Raggio di ricerca attorno al POI: oltre, non è più "quel" luogo. */
export const GEO_RADIUS_M = 300;
/** Somiglianza minima (Jaccard) fra nome del POI e titolo della pagina. */
export const MIN_NAME_SCORE = 0.34;
/** Soglia ridotta quando la pagina è praticamente sullo stesso punto. */
const MIN_NAME_SCORE_CLOSE = 0.15;
/** Distanza entro cui due nomi diversi indicano quasi sempre lo stesso luogo. */
const SAME_SPOT_M = 25;

const STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'da', 'dal', 'in', 'e', 'ed', 'a', 'al', 'alla', 'ai', 'con', 'su', 'per', 'the', 'of',
]);

/** Termini generici tradotti in italiano: i titoli stranieri restano confrontabili. */
const SYNONYMS: Record<string, string> = {
  monument: 'monumento', church: 'chiesa', eglise: 'chiesa', kirche: 'chiesa',
  museum: 'museo', musee: 'museo', tower: 'torre', castle: 'castello',
  cathedral: 'cattedrale', cathedrale: 'cattedrale', dome: 'duomo',
  bridge: 'ponte', square: 'piazza', palace: 'palazzo', gallery: 'galleria',
  fountain: 'fontana', theatre: 'teatro', theater: 'teatro', abbey: 'abbazia',
  chapel: 'cappella',
};

function normalizeName(s: string): string[] {
  return (s || '')
    .toLowerCase()
    // NFD separa i segni diacritici dalle lettere (à → a + accento); il filtro
    // sulla riga successiva, tenendo solo a-z0-9 e spazi, li elimina.
    .normalize('NFD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
}

/**
 * Token in comune sull'UNIONE (Jaccard). Col rapporto sul nome più corto
 * bastava il toponimo condiviso ("Pietrasanta") per far combaciare due luoghi
 * diversi della stessa città.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a));
  const tb = new Set(normalizeName(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  ta.forEach(t => { if (tb.has(t)) common++; });
  const union = ta.size + tb.size - common;
  return union === 0 ? 0 : common / union;
}

/** Nome compatibile, oppure praticamente lo stesso punto sulla mappa. */
export function isAcceptableMatch(score: number, distanceM: number): boolean {
  if (score >= MIN_NAME_SCORE) return true;
  return distanceM <= SAME_SPOT_M && score >= MIN_NAME_SCORE_CLOSE;
}

async function getJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface ResolvedEntity {
  /** Titolo della pagina Wikipedia che descrive il POI. */
  title: string;
  /** Lingua della pagina trovata ('it' o 'en'). */
  lang: string;
  /** Distanza in metri fra POI e pagina: quanto è solido l'aggancio. */
  distanceM: number;
  /** Id Wikidata collegato alla pagina, se esiste. */
  qid: string | null;
}

/**
 * Trova l'entità enciclopedica del POI partendo dalle sue coordinate.
 * Ritorna null quando nessuna pagina vicina ha un nome compatibile: in quel
 * caso NON esistono fonti attendibili per quel POI.
 */
export async function resolveEntityByCoords(
  name: string,
  lat: number,
  lon: number,
  radiusM: number = GEO_RADIUS_M,
): Promise<ResolvedEntity | null> {
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  for (const lang of ['it', 'en']) {
    const geo = await getJson(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat}|${lon}&gsradius=${radiusM}&gslimit=15&format=json&origin=*`
    );
    const hits: any[] = geo?.query?.geosearch || [];
    if (!hits.length) continue;

    const best = hits
      .map(h => ({ title: h.title as string, dist: h.dist as number, score: nameSimilarity(name, h.title) }))
      .filter(h => isAcceptableMatch(h.score, h.dist))
      .sort((a, b) => (b.score - a.score) || (a.dist - b.dist))[0];
    if (!best) continue;

    const props = await getJson(
      `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(best.title)}` +
      `&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`
    );
    const pages = props?.query?.pages;
    const qid = pages ? (Object.values(pages)[0] as any)?.pageprops?.wikibase_item ?? null : null;

    return { title: best.title, lang, distanceM: Math.round(best.dist), qid };
  }

  return null;
}

/** Estratto testuale di una pagina Wikipedia già identificata. */
export async function fetchExtract(title: string, lang: string, maxChars = 1500): Promise<string> {
  const data = await getJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=extracts&explaintext=1&format=json&origin=*`
  );
  const pages = data?.query?.pages;
  if (!pages) return '';
  const extract = (Object.values(pages)[0] as any)?.extract;
  return typeof extract === 'string' ? extract.substring(0, maxChars) : '';
}

/** Proprietà Wikidata usate nei testi: sono le uniche che citiamo come fatti. */
const WIKIDATA_PROPS: Record<string, string> = {
  P571: 'Data di creazione',
  P84: 'Architetto/Creatore',
  P149: 'Stile',
  P186: 'Materiale',
  P31: 'Tipo',
  P170: 'Autore',
  P1619: 'Data di inaugurazione',
};

/**
 * Fatti strutturati di un'entità Wikidata GIÀ identificata per coordinate.
 * Nessuna ricerca testuale: se il QID è quello giusto, i fatti lo sono.
 */
export async function fetchWikidataFactsByQid(qid: string): Promise<string> {
  if (!qid) return '';
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const entity = data?.entities?.[qid];
  const claims = entity?.claims;
  if (!claims) return '';

  const facts: string[] = [];
  const description = entity?.descriptions?.it?.value || entity?.descriptions?.en?.value;
  if (description) facts.push(`Sommario: ${description}`);

  const idsToResolve: { prop: string; id: string }[] = [];
  for (const [prop, label] of Object.entries(WIKIDATA_PROPS)) {
    const value = claims[prop]?.[0]?.mainsnak?.datavalue;
    if (!value) continue;
    if (value.type === 'wikibase-entityid') {
      idsToResolve.push({ prop, id: value.value.id });
    } else if (value.type === 'time') {
      facts.push(`${label}: ${String(value.value.time).replace(/^\+/, '').split('T')[0]}`);
    }
  }

  if (idsToResolve.length > 0) {
    const ids = idsToResolve.map(i => i.id).join('|');
    const labels = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}` +
      `&languages=it|en&props=labels&format=json&origin=*`
    );
    for (const { prop, id } of idsToResolve) {
      const e = labels?.entities?.[id]?.labels;
      const label = e?.it?.value || e?.en?.value;
      if (label) facts.push(`${WIKIDATA_PROPS[prop]}: ${label}`);
    }
  }

  return facts.join(', ');
}

// ── FOTO UFFICIALI ──────────────────────────────────────────────────────────

/**
 * File che su Commons accompagnano i luoghi ma non li ritraggono: stemmi,
 * bandiere, mappe, planimetrie, loghi. Vanno esclusi o si finisce con lo
 * stemma comunale al posto della facciata.
 */
const BAD_FILE_PATTERNS = [
  'coat_of_arms', 'stemma', 'wappen', 'blason', 'flag', 'bandiera',
  'map', 'mappa', 'karte', 'plan', 'pianta', 'planimetria', 'location',
  'logo', 'seal', 'sigillo', 'diagram', 'schema', 'chart', 'graph',
  'icon', 'symbol', 'signature', 'firma',
];

export function looksLikeBadFile(fileName: string): boolean {
  const f = fileName.toLowerCase().replace(/\s+/g, '_');
  if (f.endsWith('.svg') || f.endsWith('.pdf') || f.endsWith('.ogv') || f.endsWith('.webm')) return true;
  return BAD_FILE_PATTERNS.some(p => f.includes(p));
}

/** Toglie i parametri di tracciamento dalle thumbnail Wikimedia. */
export function cleanImageUrl(url: string): string {
  return url.split('?')[0];
}

export interface PhotoCandidate {
  url: string;
  source: string;
  detail: string;
}

/**
 * Da un nome file Commons alla miniatura renderizzata, con controllo di
 * formato e dimensioni. L'originale può essere un TIFF da decine di MB che il
 * tag <img> non mostra: si usa sempre la thumbnail.
 */
export async function commonsFileToUrl(fileName: string): Promise<string | null> {
  const title = fileName.startsWith('File:') ? fileName : `File:${fileName}`;
  if (looksLikeBadFile(title)) return null;

  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024&format=json&origin=*`
  );
  const pages = data?.query?.pages;
  if (!pages) return null;
  const info = (Object.values(pages)[0] as any)?.imageinfo?.[0];
  if (!info) return null;
  if (!String(info.mime || '').startsWith('image/')) return null;
  // Sotto i 500px è un'icona, non una foto utilizzabile.
  if (info.width && info.width < 500) return null;
  const url = info.thumburl || info.url;
  return url ? cleanImageUrl(url) : null;
}

/** Immagine ufficiale (P18) o categoria Commons (P373) di un'entità Wikidata. */
export async function fetchWikidataImage(qid: string): Promise<PhotoCandidate | null> {
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const claims = data?.entities?.[qid]?.claims;
  if (!claims) return null;

  const p18 = claims.P18?.[0]?.mainsnak?.datavalue?.value;
  if (p18) {
    const url = await commonsFileToUrl(String(p18));
    if (url) return { url, source: 'wikidata-P18', detail: `${qid} · ${p18}` };
  }

  const category = claims.P373?.[0]?.mainsnak?.datavalue?.value;
  if (category) {
    const members = await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent(`Category:${category}`)}&cmtype=file&cmlimit=20&format=json&origin=*`
    );
    for (const f of (members?.query?.categorymembers || [])) {
      if (looksLikeBadFile(f.title)) continue;
      const url = await commonsFileToUrl(f.title);
      if (url) return { url, source: 'wikidata-P373', detail: `${qid} · ${f.title}` };
    }
  }
  return null;
}

/**
 * File Commons georeferenziati a pochi metri dal POI (ultima risorsa).
 *
 * La sola vicinanza NON basta: in centro storico a 10 metri da un bar c'è la
 * foto della piazza. E i file di Commons sono geotaggati dove stava il
 * FOTOGRAFO, non il soggetto: si accetta solo se anche il nome combacia.
 */
export async function fetchCommonsNearby(lat: number, lon: number, name: string): Promise<PhotoCandidate | null> {
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}|${lon}&gsradius=150&gslimit=25&gsnamespace=6&format=json&origin=*`
  );
  const ordered = (data?.query?.geosearch || [])
    .filter((h: any) => !looksLikeBadFile(h.title))
    .map((h: any) => ({ ...h, score: nameSimilarity(name, h.title) }))
    .filter((h: any) => h.score >= MIN_NAME_SCORE)
    .sort((a: any, b: any) => (b.score - a.score) || (a.dist - b.dist));

  for (const h of ordered.slice(0, 6)) {
    const url = await commonsFileToUrl(h.title);
    if (url) return { url, source: 'commons-geo', detail: `${h.title} · ${Math.round(h.dist)}m` };
  }
  return null;
}

/**
 * Foto ufficiale del POI, cercata in ordine di affidabilità: immagine scelta
 * su Wikidata, categoria Commons del soggetto, immagine della pagina
 * Wikipedia, file Commons georeferenziato col nome giusto.
 * Ritorna null quando nessuna fonte è sicura: meglio nessuna foto che la foto
 * del monumento accanto.
 */
export async function findOfficialPhoto(
  name: string,
  lat: number,
  lon: number,
  known?: ResolvedEntity | null,
): Promise<PhotoCandidate | null> {
  const entity = known ?? await resolveEntityByCoords(name, lat, lon);

  if (entity) {
    if (entity.qid) {
      const fromWikidata = await fetchWikidataImage(entity.qid);
      if (fromWikidata) {
        return { ...fromWikidata, detail: `${entity.title} (${entity.distanceM}m) · ${fromWikidata.detail}` };
      }
    }
    const page = await getJson(
      `https://${entity.lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(entity.title)}` +
      `&prop=pageimages&piprop=original|thumbnail&pithumbsize=1024&format=json&origin=*`
    );
    const pages = page?.query?.pages;
    const img = pages ? (Object.values(pages)[0] as any) : null;
    const src = img?.original?.source || img?.thumbnail?.source;
    if (src && !looksLikeBadFile(src)) {
      return { url: cleanImageUrl(src), source: `wikipedia-${entity.lang}`, detail: `${entity.title} · ${entity.distanceM}m` };
    }
  }

  return fetchCommonsNearby(lat, lon, name);
}

/**
 * Testo di CONTESTO su una località da Wikivoyage: parla della città, non del
 * singolo POI, quindi non autorizza a citare date o architetti dell'edificio.
 */
export async function fetchWikivoyageContext(city: string, maxChars = 1500): Promise<string> {
  if (!city) return '';
  // NIENTE exintro: su Wikivoyage l'introduzione è una riga sola ("Carrara è
  // una città della Toscana"), mentre il contesto vero — storia, territorio,
  // tradizioni — sta nella sezione "Da sapere" subito dopo. Si prende quindi
  // l'estratto completo e se ne tiene l'inizio. `redirects` segue i rimandi
  // (es. "Firenze città" → "Firenze").
  const data = await getJson(
    `https://it.wikivoyage.org/w/api.php?action=query&titles=${encodeURIComponent(city)}` +
    `&prop=extracts&explaintext=1&redirects=1&format=json&origin=*`
  );
  const pages = data?.query?.pages;
  if (!pages) return '';
  const extract = (Object.values(pages)[0] as any)?.extract;
  if (typeof extract !== 'string') return '';
  return extract
    // I titoli di sezione ("== Da sapere ==") sono rumore nel prompt.
    .replace(/^=+\s*.*?\s*=+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, maxChars);
}

export interface PoiSources {
  /** Estratto Wikipedia del POI (vuoto se non identificato). */
  wikipedia: string;
  /** Fatti Wikidata del POI (vuoto se non identificato). */
  wikidata: string;
  /** Come è stato agganciato il POI, per i log e per enrichment_source. */
  match: ResolvedEntity | null;
}

/**
 * Raccoglie in un colpo solo le fonti VERIFICATE di un POI.
 * Se `match` è null, il chiamante deve scrivere solo il contesto: non esistono
 * dati attendibili su quel luogo specifico.
 */
export async function collectPoiSources(
  name: string,
  lat: number,
  lon: number,
): Promise<PoiSources> {
  const match = await resolveEntityByCoords(name, lat, lon);
  if (!match) return { wikipedia: '', wikidata: '', match: null };

  const [wikipedia, wikidata] = await Promise.all([
    fetchExtract(match.title, match.lang),
    match.qid ? fetchWikidataFactsByQid(match.qid) : Promise.resolve(''),
  ]);

  return { wikipedia, wikidata, match };
}
