/**
 * Sostituisce le foto generiche dei POI con quelle ufficiali del luogo.
 *
 * Le foto stock (Unsplash) finiscono in `shared_pois.image_url/photo_url` come
 * ripiego quando l'arricchimento non trova nulla: sono "una piazza qualsiasi",
 * non IL monumento. Questo script le ricontrolla e le sostituisce solo quando
 * riesce a identificare con certezza l'immagine del luogo reale; se non la
 * trova lascia intatta quella esistente — meglio una foto generica che una
 * foto sbagliata.
 *
 * Precisione prima di tutto: NON si usa la ricerca testuale su Commons (che per
 * "Duomo" restituisce mezzo mondo). Si identifica l'ENTITÀ del POI partendo
 * dalle coordinate:
 *   1. geosearch su Wikipedia attorno al POI → pagina più vicina e col nome
 *      compatibile;
 *   2. dalla pagina si ricavano l'immagine principale e l'id Wikidata;
 *   3. da Wikidata l'immagine ufficiale (P18) o la categoria Commons (P373);
 *   4. in mancanza d'altro, geosearch su Commons: file GEOREFERENZIATI entro
 *      pochi metri dal POI.
 * Ogni candidata viene poi validata (formato, dimensioni, no stemmi/mappe/loghi).
 *
 * Uso:
 *   npx tsx scripts/fix_poi_photos.ts                 # simulazione, 200 POI
 *   npx tsx scripts/fix_poi_photos.ts --apply         # scrive sul database
 *   npx tsx scripts/fix_poi_photos.ts --apply --limit=1000
 *   npx tsx scripts/fix_poi_photos.ts --city=Carrara  # solo una zona
 *   npx tsx scripts/fix_poi_photos.ts --all           # anche POI con foto non generica
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Mancano VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env / .env.local)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Le API Wikimedia richiedono uno User-Agent identificabile con un contatto.
const UA = 'WIP-WorldInPocket/1.0 (https://itainta.vercel.app; marmidicarrara@gmail.com)';

// ── Parametri da riga di comando ────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (f: string) => args.includes(f);
const getArg = (name: string, fallback: string) =>
  (args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);

const APPLY = hasFlag('--apply');
const PROCESS_ALL = hasFlag('--all');
const LIMIT = parseInt(getArg('limit', '200'), 10);
const CITY_FILTER = getArg('city', '');
/** `--near=lat,lon,km`: limita l'elaborazione a una zona (utile per i test). */
const NEAR = (() => {
  const raw = getArg('near', '');
  if (!raw) return null;
  const [lat, lon, km] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, km: Number.isFinite(km) && km > 0 ? km : 20 };
})();
/** Raggio di ricerca attorno al POI: oltre, l'immagine non è più "di quel luogo". */
const GEO_RADIUS_M = parseInt(getArg('radius', '250'), 10);
/** Somiglianza minima (Jaccard) tra nome del POI e titolo della fonte. */
const MIN_NAME_SCORE = 0.34;
/** Soglia ridotta quando il candidato è praticamente sullo stesso punto. */
const MIN_NAME_SCORE_CLOSE = 0.15;
/** Distanza entro cui due nomi diversi indicano quasi sempre lo stesso luogo. */
const SAME_SPOT_M = 20;
/** Pausa tra POI: le API Wikimedia sono gratuite, non abusiamone. */
const DELAY_MS = parseInt(getArg('delay', '350'), 10);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Riconoscimento delle foto generiche ─────────────────────────────────────

/**
 * Una foto è "generica" quando non ritrae il luogo specifico: stock Unsplash,
 * placeholder, o campo vuoto. Le foto Wikimedia/Wikipedia sono già ufficiali e
 * non vanno toccate.
 */
function isGenericPhoto(url?: string | null): boolean {
  if (!url || !url.trim()) return true;
  const u = url.toLowerCase();
  if (u.includes('unsplash.com')) return true;
  if (u.includes('placeholder') || u.includes('placehold.it') || u.includes('via.placeholder')) return true;
  if (u.includes('pexels.com') || u.includes('pixabay.com')) return true;
  if (u.startsWith('data:')) return true;
  return false;
}

/** Vero se l'URL punta già a una fonte enciclopedica (foto del luogo reale). */
function isOfficialSource(url?: string | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('wikimedia.org') || u.includes('wikipedia.org') || u.includes('wikivoyage.org');
}

// ── Confronto dei nomi ──────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'da', 'dal', 'in', 'e', 'ed', 'a', 'al', 'alla', 'ai', 'con', 'su', 'per', 'the', 'of',
]);

/**
 * Su Commons i titoli sono spesso in inglese o francese ("Pietrasanta Monument
 * Leopoldo II"): riportiamo i termini generici all'italiano, altrimenti lo
 * stesso soggetto risulta estraneo al proprio nome.
 */
const SYNONYMS: Record<string, string> = {
  monument: 'monumento', church: 'chiesa', eglise: 'chiesa', kirche: 'chiesa',
  museum: 'museo', musee: 'museo', tower: 'torre', castle: 'castello',
  cathedral: 'cattedrale', cathedrale: 'cattedrale', dome: 'duomo',
  bridge: 'ponte', square: 'piazza', palace: 'palazzo', gallery: 'galleria',
  fountain: 'fontana', theatre: 'teatro', theater: 'teatro', abbey: 'abbazia',
  basilica: 'basilica', chapel: 'cappella', tour: 'torre',
};

function normalizeName(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    // rimuove i segni diacritici combinanti (à → a) per confrontare i nomi
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
}

/** Titolo di una pagina o di un file, ripulito da prefisso ed estensione. */
function titleToText(title: string): string {
  return title.replace(/^File:/i, '').replace(/\.(jpe?g|png|gif|tiff?|webp)$/i, '');
}

/**
 * Somiglianza fra due nomi: token in comune sull'UNIONE (Jaccard).
 *
 * Con il rapporto sul nome più corto bastava il toponimo condiviso per far
 * passare accostamenti sbagliati: "Galleria Bonelli Pietrasanta" prendeva la
 * foto del "Duomo di Pietrasanta". Sull'unione quel caso scende a 0.2 e viene
 * scartato, mentre i nomi davvero coincidenti restano alti.
 */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(titleToText(a)));
  const tb = new Set(normalizeName(titleToText(b)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  ta.forEach(t => { if (tb.has(t)) common++; });
  const union = ta.size + tb.size - common;
  return union === 0 ? 0 : common / union;
}

/**
 * Un candidato è accettabile se il nome combacia, oppure se è praticamente
 * sullo stesso punto: a pochi metri di distanza un nome parzialmente diverso
 * è quasi sempre lo stesso luogo chiamato in altro modo (es. "Pieve dei Santi
 * Giovanni e Felicita" = "Pieve di Valdicastello").
 */
function isAcceptableMatch(score: number, distanceM: number): boolean {
  if (score >= MIN_NAME_SCORE) return true;
  return distanceM <= SAME_SPOT_M && score >= MIN_NAME_SCORE_CLOSE;
}

// ── Validazione delle immagini ──────────────────────────────────────────────

/**
 * Scarta i file che su Commons accompagnano i luoghi ma non li ritraggono:
 * stemmi, bandiere, mappe, planimetrie, loghi, ritratti di persone.
 */
const BAD_FILE_PATTERNS = [
  'coat_of_arms', 'stemma', 'wappen', 'blason', 'flag', 'bandiera',
  'map', 'mappa', 'karte', 'plan', 'pianta', 'planimetria', 'location',
  'logo', 'seal', 'sigillo', 'diagram', 'schema', 'chart', 'graph',
  'icon', 'symbol', 'signature', 'firma',
];

function looksLikeBadFile(fileName: string): boolean {
  const f = fileName.toLowerCase().replace(/\s+/g, '_');
  if (f.endsWith('.svg') || f.endsWith('.pdf') || f.endsWith('.ogv') || f.endsWith('.webm')) return true;
  return BAD_FILE_PATTERNS.some(p => f.includes(p));
}

interface PhotoCandidate {
  url: string;
  source: string;
  detail: string;
}

/** Toglie i parametri di tracciamento che Wikimedia aggiunge alle thumbnail. */
function cleanUrl(url: string): string {
  return url.split('?')[0];
}

/**
 * Da un nome file Commons all'URL della miniatura renderizzata, con controllo
 * di formato e dimensioni. L'originale può essere un TIFF da decine di MB che
 * il tag <img> non mostra: si usa sempre la thumbnail.
 */
async function commonsFileToUrl(fileName: string): Promise<string | null> {
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
  // Sotto i 500px è una miniatura o un'icona, non una foto utilizzabile.
  if (info.width && info.width < 500) return null;
  const url = info.thumburl || info.url;
  return url ? cleanUrl(url) : null;
}

// ── Fonti ufficiali ─────────────────────────────────────────────────────────

/** Pagina Wikipedia più vicina al POI con nome compatibile. */
async function findWikipediaPage(
  lat: number, lon: number, name: string, lang: string
): Promise<{ title: string; dist: number } | null> {
  const data = await getJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}|${lon}&gsradius=${GEO_RADIUS_M}&gslimit=15&format=json&origin=*`
  );
  const hits: any[] = data?.query?.geosearch || [];
  if (!hits.length) return null;

  const scored = hits
    .map(h => ({ title: h.title as string, dist: h.dist as number, score: nameSimilarity(name, h.title) }))
    .filter(h => isAcceptableMatch(h.score, h.dist))
    // A parità di nome vince la più vicina; a parità di distanza il nome migliore.
    .sort((a, b) => (b.score - a.score) || (a.dist - b.dist));

  return scored.length ? { title: scored[0].title, dist: scored[0].dist } : null;
}

/** Immagine principale della pagina + id Wikidata collegato. */
async function fetchPageImageAndQid(
  title: string, lang: string
): Promise<{ image: string | null; qid: string | null }> {
  const data = await getJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=pageimages|pageprops&piprop=original|thumbnail&pithumbsize=1024&ppprop=wikibase_item` +
    `&format=json&origin=*`
  );
  const pages = data?.query?.pages;
  if (!pages) return { image: null, qid: null };
  const page = Object.values(pages)[0] as any;
  const image = page?.original?.source || page?.thumbnail?.source || null;
  const qid = page?.pageprops?.wikibase_item || null;
  // pageimages a volte propone lo stemma del comune: stesso filtro dei file.
  return { image: image && !looksLikeBadFile(image) ? cleanUrl(image) : null, qid };
}

/** Immagine ufficiale (P18) o categoria Commons (P373) dell'entità Wikidata. */
async function fetchWikidataImage(qid: string): Promise<PhotoCandidate | null> {
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
    const files: any[] = members?.query?.categorymembers || [];
    for (const f of files) {
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
 * foto della piazza, che non ritrae il bar. Si accetta solo se anche il NOME
 * del file richiama il POI — altrimenti si preferisce non sostituire nulla.
 */
async function fetchCommonsNearby(lat: number, lon: number, name: string): Promise<PhotoCandidate | null> {
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}|${lon}&gsradius=${Math.min(GEO_RADIUS_M, 150)}&gslimit=25&gsnamespace=6` +
    `&format=json&origin=*`
  );
  const hits: any[] = data?.query?.geosearch || [];
  if (!hits.length) return null;

  const ordered = hits
    .filter(h => !looksLikeBadFile(h.title))
    .map(h => ({ ...h, score: nameSimilarity(name, h.title) }))
    // Niente sconti sulla distanza qui: i file di Commons sono geotaggati dove
    // si trovava il FOTOGRAFO, non il soggetto. A 15 metri da un museo c'è la
    // foto della via o del museo accanto: serve che il nome combaci davvero.
    .filter(h => h.score >= MIN_NAME_SCORE)
    .sort((a, b) => (b.score - a.score) || (a.dist - b.dist));

  for (const h of ordered.slice(0, 6)) {
    const url = await commonsFileToUrl(h.title);
    if (url) {
      return { url, source: 'commons-geo', detail: `${h.title} · ${Math.round(h.dist)}m` };
    }
  }
  return null;
}

/**
 * Cerca la foto ufficiale del POI seguendo le fonti in ordine di affidabilità.
 * Ritorna null quando nessuna fonte è sicura: in quel caso la foto attuale
 * resta dov'è.
 */
async function findOfficialPhoto(poi: { name: string; lat: number; lon: number }): Promise<PhotoCandidate | null> {
  for (const lang of ['it', 'en']) {
    const page = await findWikipediaPage(poi.lat, poi.lon, poi.name, lang);
    if (!page) continue;

    const { image, qid } = await fetchPageImageAndQid(page.title, lang);

    // Wikidata prima: P18 è l'immagine *scelta* per rappresentare il soggetto.
    if (qid) {
      const fromWikidata = await fetchWikidataImage(qid);
      if (fromWikidata) {
        return { ...fromWikidata, detail: `${page.title} (${Math.round(page.dist)}m) · ${fromWikidata.detail}` };
      }
    }
    if (image) {
      return { url: image, source: `wikipedia-${lang}`, detail: `${page.title} · ${Math.round(page.dist)}m` };
    }
  }

  return fetchCommonsNearby(poi.lat, poi.lon, poi.name);
}

// ── Ciclo principale ────────────────────────────────────────────────────────

interface PoiRow {
  id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  photo_url: string | null;
  city?: string | null;
}

/**
 * Prova la sola ricerca foto su un punto, senza toccare il database:
 *   npx tsx scripts/fix_poi_photos.ts --probe="44.0793,10.0977,Duomo di Carrara"
 * Utile per tarare raggio e soglia di somiglianza su casi reali.
 */
async function probe(spec: string) {
  const [latStr, lonStr, ...nameParts] = spec.split(',');
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  const name = nameParts.join(',').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !name) {
    console.error('Formato atteso: --probe="lat,lon,nome del POI"');
    process.exit(1);
  }
  console.log(`🔎 ${name} (${lat}, ${lon}) — raggio ${GEO_RADIUS_M}m\n`);
  const found = await findOfficialPhoto({ name, lat, lon });
  if (!found) {
    console.log('Nessuna foto ufficiale sicura: la foto attuale resterebbe invariata.');
    return;
  }
  console.log(`Fonte : ${found.source}`);
  console.log(`Match : ${found.detail}`);
  console.log(`URL   : ${found.url}`);
}

async function main() {
  const probeSpec = args.find(a => a.startsWith('--probe='))?.slice('--probe='.length);
  if (probeSpec) {
    await probe(probeSpec.replace(/^["']|["']$/g, ''));
    return;
  }

  console.log('🖼️  Verifica foto POI — fonti ufficiali (Wikipedia · Wikidata · Wikimedia Commons)');
  console.log(`   modalità: ${APPLY ? 'SCRITTURA sul database' : 'SIMULAZIONE (usa --apply per salvare)'}`);
  console.log(`   limite: ${LIMIT} POI · raggio: ${GEO_RADIUS_M}m${CITY_FILTER ? ` · città: ${CITY_FILTER}` : ''}${NEAR ? ` · zona: ${NEAR.lat},${NEAR.lon} (${NEAR.km}km)` : ''}`);
  console.log(`   selezione: ${PROCESS_ALL ? 'tutti i POI' : 'solo POI con foto generica o assente'}\n`);

  // La colonna `city` non esiste su tutti gli ambienti: se manca si ripiega
  // sulle sole colonne certe, e il filtro per città viene ignorato.
  const runQuery = async (withCity: boolean) => {
    let q = supabase
      .from('shared_pois')
      .select(withCity ? 'id,name,lat,lon,image_url,photo_url,city' : 'id,name,lat,lon,image_url,photo_url')
      .not('name', 'is', null)
      .not('lat', 'is', null)
      // Prima le gemme: sono i POI in evidenza, quelli in cui una foto
      // generica si nota di più.
      .order('is_gem', { ascending: false })
      .limit(LIMIT);
    if (withCity && CITY_FILTER) q = q.ilike('city', `%${CITY_FILTER}%`);
    if (NEAR) {
      // Riquadro attorno al punto indicato: 1° di latitudine ≈ 111 km.
      const dLat = NEAR.km / 111;
      const dLon = NEAR.km / (111 * Math.max(0.2, Math.cos((NEAR.lat * Math.PI) / 180)));
      q = q
        .gte('lat', NEAR.lat - dLat).lte('lat', NEAR.lat + dLat)
        .gte('lon', NEAR.lon - dLon).lte('lon', NEAR.lon + dLon);
    }
    return q;
  };

  let { data, error } = await runQuery(true);
  if (error) {
    console.warn(`Colonna "city" non disponibile (${error.message}); proseguo senza filtro città.`);
    ({ data, error } = await runQuery(false));
  }
  if (error) {
    console.error('Lettura POI fallita:', error.message);
    process.exit(1);
  }

  const rows = (data || []) as unknown as PoiRow[];
  const candidates = PROCESS_ALL
    ? rows
    : rows.filter(p => isGenericPhoto(p.image_url || p.photo_url));

  console.log(`Trovati ${rows.length} POI, ${candidates.length} da verificare.\n`);

  const stats = { replaced: 0, kept: 0, alreadyOfficial: 0, noCoords: 0 };
  const changes: { name: string; from: string; to: string; source: string }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const poi = candidates[i];
    const current = poi.image_url || poi.photo_url || '';
    const label = `[${i + 1}/${candidates.length}] ${poi.name}`;

    if (isOfficialSource(current) && !PROCESS_ALL) {
      stats.alreadyOfficial++;
      continue;
    }
    if (poi.lat == null || poi.lon == null) {
      stats.noCoords++;
      console.log(`${label} — senza coordinate, saltato`);
      continue;
    }

    const found = await findOfficialPhoto({ name: poi.name || '', lat: poi.lat, lon: poi.lon });

    if (!found || found.url === current) {
      stats.kept++;
      console.log(`${label} — nessuna foto ufficiale sicura, resta quella attuale`);
    } else {
      stats.replaced++;
      changes.push({ name: poi.name || poi.id, from: current || '(vuota)', to: found.url, source: found.source });
      console.log(`${label} — ✅ ${found.source}: ${found.detail}`);

      if (APPLY) {
        const { error: upErr } = await supabase
          .from('shared_pois')
          .update({ image_url: found.url, photo_url: found.url })
          .eq('id', poi.id);
        if (upErr) console.warn(`   ⚠️  salvataggio fallito: ${upErr.message}`);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log('\n──────── RIEPILOGO ────────');
  console.log(`Foto ufficiali trovate : ${stats.replaced}${APPLY ? ' (salvate)' : ' (simulazione)'}`);
  console.log(`Lasciate invariate     : ${stats.kept}`);
  console.log(`Già ufficiali          : ${stats.alreadyOfficial}`);
  console.log(`Senza coordinate       : ${stats.noCoords}`);

  if (!APPLY && changes.length) {
    console.log('\nEsempi di sostituzioni proposte:');
    changes.slice(0, 10).forEach(c => console.log(`  • ${c.name} [${c.source}]\n    ${c.to}`));
    console.log('\nRilancia con --apply per scriverle sul database.');
  }
}

main().catch(err => {
  console.error('Errore imprevisto:', err);
  process.exit(1);
});
