// Lista mondiale dei locali senza glutine da OpenStreetMap (tag diet:gluten_free).
// SOLA LETTURA: scrive file in scratch/out/, non tocca il database.
//
// Uso:   node scratch/lista-gluten-free-mondo.mjs            # tutti i paesi
//        node scratch/lista-gluten-free-mondo.mjs IT FR DE   # solo alcuni
//
// Classificazione (wiki OSM Key:diet:gluten_free):
//   only    -> gluten_free_only     (100% senza glutine)
//   yes     -> gluten_free_options  (buona scelta di opzioni)
//   limited -> gluten_free_limited  (pochissime opzioni: da mostrare con avviso)
// Licenza dati: ODbL, © OpenStreetMap contributors.
import fs from 'node:fs';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OUT_DIR = new URL('./out/', import.meta.url).pathname;
const TIPO = { only: 'gluten_free_only', yes: 'gluten_free_options', limited: 'gluten_free_limited' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'wip-guide-gf-import/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(20 * 60 * 1000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(15000 * (attempt + 1)); // backoff: il server pubblico limita l'uso
    }
  }
  throw lastErr;
}

async function listaPaesi() {
  const j = await overpass('[out:json][timeout:120];rel["admin_level"="2"]["ISO3166-1"];out tags;');
  return [...new Set(j.elements.map((e) => e.tags['ISO3166-1']).filter(Boolean))].sort();
}

// Sotto-categoria WIP (ids dei chip Locali) da amenity/shop/cuisine di OSM.
function sottoCategoria(t) {
  if (t.shop === 'bakery' || t.shop === 'pastry' || t.craft === 'bakery') return 'panetteria';
  if (['supermarket', 'convenience', 'health_food', 'deli', 'organic', 'greengrocer', 'general'].includes(t.shop)) return 'negozio_gf';
  if (t.amenity === 'ice_cream' || t.shop === 'ice_cream') return 'gelateria';
  if (['cafe', 'bar', 'pub'].includes(t.amenity)) return 'bar';
  if (/pizza/i.test(t.cuisine || '')) return 'pizzeria';
  if (['restaurant', 'fast_food', 'food_court'].includes(t.amenity)) return 'ristorante';
  return '';
}

function riga(e, paese) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat == null || lon == null || !t.name) return null; // niente nome/coordinate = inutilizzabile
  if (/^(no)$/.test(t['diet:gluten_free'])) return null;
  if (t['disused:amenity'] || t['abandoned:amenity'] || t.disused === 'yes') return null;
  return {
    osm: `${e.type}/${e.id}`,
    paese,
    nome: t.name,
    lat, lon,
    tipo: TIPO[t['diet:gluten_free']] || null,
    amenity: t.amenity || t.shop || '',
    sotto_categoria: sottoCategoria(t),
    cucina: t.cuisine || '',
    via: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
    citta: t['addr:city'] || '',
    sito: t.website || t['contact:website'] || '',
    telefono: t.phone || t['contact:phone'] || '',
    orari: t.opening_hours || '',
    check_date: t.check_date || t['check_date:diet:gluten_free'] || '',
  };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const paesi = process.argv.length > 2 ? process.argv.slice(2).map((s) => s.toUpperCase()) : await listaPaesi();
  console.log(`Paesi da scaricare: ${paesi.length}`);

  const tutte = [];
  const falliti = [];
  for (const cc of paesi) {
    const q = `[out:json][timeout:900];area["ISO3166-1"="${cc}"][admin_level=2]->.a;` +
      `nwr(area.a)["diet:gluten_free"~"^(yes|only|limited)$"];out center tags;`;
    try {
      const j = await overpass(q);
      const righe = j.elements.map((e) => riga(e, cc)).filter((r) => r && r.tipo);
      tutte.push(...righe);
      const c = (k) => righe.filter((r) => r.tipo === k).length;
      console.log(`${cc}: ${righe.length} (only ${c('gluten_free_only')}, yes ${c('gluten_free_options')}, limited ${c('gluten_free_limited')})`);
    } catch (e) {
      falliti.push(cc);
      console.warn(`${cc}: FALLITO (${e.message}) — rilanciare da solo`);
    }
    await sleep(3000);
  }

  const cols = ['osm', 'paese', 'nome', 'lat', 'lon', 'tipo', 'amenity', 'sotto_categoria', 'cucina', 'via', 'citta', 'sito', 'telefono', 'orari', 'check_date'];
  fs.writeFileSync(OUT_DIR + 'gluten-free-mondo.csv',
    [cols.join(','), ...tutte.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'));
  fs.writeFileSync(OUT_DIR + 'gluten-free-mondo.json', JSON.stringify(tutte));

  const perPaese = {};
  for (const r of tutte) {
    perPaese[r.paese] ??= { gluten_free_only: 0, gluten_free_options: 0, gluten_free_limited: 0 };
    perPaese[r.paese][r.tipo]++;
  }
  fs.writeFileSync(OUT_DIR + 'riepilogo-per-paese.json', JSON.stringify({ totale: tutte.length, falliti, perPaese }, null, 2));
  console.log(`Totale: ${tutte.length}. Falliti: ${falliti.join(' ') || 'nessuno'}. File in ${OUT_DIR}`);
}
main();
