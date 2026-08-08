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
 * La ricerca vive in scripts/lib/wiki.ts, condivisa con gli script di
 * arricchimento: parte dalle COORDINATE del POI (mai dalla ricerca testuale su
 * Commons, che per "Duomo" restituisce mezzo mondo), risolve l'entità Wikidata
 * e ne prende l'immagine ufficiale.
 *
 * Uso:
 *   npx tsx scripts/fix_poi_photos.ts                 # simulazione, 200 POI
 *   npx tsx scripts/fix_poi_photos.ts --apply         # scrive sul database
 *   npx tsx scripts/fix_poi_photos.ts --near=44.079,10.098,15 --apply
 *   npx tsx scripts/fix_poi_photos.ts --probe="44.0793,10.0977,Duomo di Carrara"
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { findOfficialPhoto } from './lib/wiki';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Mancano VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env / .env.local)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ── Parametri da riga di comando ────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (f: string) => args.includes(f);
const getArg = (name: string, fallback: string) =>
  (args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);

const APPLY = hasFlag('--apply');
const PROCESS_ALL = hasFlag('--all');
const LIMIT = parseInt(getArg('limit', '200'), 10);
const CITY_FILTER = getArg('city', '');
/** `--near=lat,lon,km`: limita l'elaborazione a una zona. */
const NEAR = (() => {
  const raw = getArg('near', '');
  if (!raw) return null;
  const [lat, lon, km] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, km: Number.isFinite(km) && km > 0 ? km : 20 };
})();
/** Pausa tra POI: le API Wikimedia sono gratuite, non abusiamone. */
const DELAY_MS = parseInt(getArg('delay', '350'), 10);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Riconoscimento delle foto generiche ─────────────────────────────────────

/**
 * Una foto è "generica" quando non ritrae il luogo specifico: stock Unsplash,
 * placeholder, o campo vuoto.
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
  console.log(`🔎 ${name} (${lat}, ${lon})\n`);
  const found = await findOfficialPhoto(name, lat, lon);
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
  console.log(`   limite: ${LIMIT} POI${CITY_FILTER ? ` · città: ${CITY_FILTER}` : ''}${NEAR ? ` · zona: ${NEAR.lat},${NEAR.lon} (${NEAR.km}km)` : ''}`);
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

    const found = await findOfficialPhoto(poi.name || '', poi.lat, poi.lon);

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
