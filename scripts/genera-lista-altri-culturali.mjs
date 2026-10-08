// Genera la lista JSONL (stesso formato di lista-tutti-culturali.jsonl) per le categorie
// culturali NON incluse nella semina wip-citta originale: gallery, palace, fortress, ruins,
// amphitheatre (29/09/2026, ~132k POI). Stesso schema riga per riga: lang='it' da generare,
// altre = le 6 lingue rimanenti da tradurre.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CATEGORIE = ['gallery', 'art_gallery', 'palace', 'fortress', 'ruins', 'amphitheatre'];
const ALTRE = ['en', 'es', 'fr', 'de', 'ru', 'zh'];
const OUT = 'scratch/lista-altri-culturali.jsonl';
fs.writeFileSync(OUT, '');

let dopoId = null, totale = 0;
for (const cat of CATEGORIE) {
  dopoId = null;
  let contaCat = 0;
  while (true) {
    let q = sb.from('shared_pois')
      .select('id,name,lat,lon,category,poi_type,city,wikidata,wikipedia_url')
      .eq('category', cat)
      .not('is_hidden', 'is', true)
      .order('id', { ascending: true })
      .limit(1000);
    if (dopoId) q = q.gt('id', dopoId);
    const { data, error } = await q;
    if (error) { console.error(cat, 'errore:', error.message); break; }
    if (!data || data.length === 0) break;
    dopoId = data[data.length - 1].id;
    const righe = data
      .filter((r) => r.name && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => JSON.stringify({
        id: r.id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, poi_type: r.poi_type,
        city: r.city || undefined, wikidata: r.wikidata || undefined, wikipedia_url: r.wikipedia_url || undefined,
        lang: 'it', altre: ALTRE,
      }));
    fs.appendFileSync(OUT, righe.join('\n') + '\n');
    contaCat += data.length; totale += data.length;
    if (data.length < 1000) break;
  }
  console.log(cat, contaCat);
}
console.log('TOTALE', totale, '->', OUT);
