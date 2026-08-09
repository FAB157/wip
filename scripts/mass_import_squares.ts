import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { normalizeOsmId, mapToItaintaCategory } from '../src/lib/poiCategories';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

async function run() {
  console.log("🚀 Avvio mass-import piazze mondiali con Wikipedia...");

  const query = `
    [out:json][timeout:900];
    (
      nwr["place"="square"]["wikipedia"];
      nwr["highway"="pedestrian"]["area"="yes"]["wikipedia"];
    );
    out center tags;
  `;

  let elements = [];
  for (const endpoint of OVERPASS_URLS) {
    try {
      console.log(`Tentativo su endpoint: ${endpoint}`);
      const res = await axios.post(endpoint, `data=${encodeURIComponent(query)}`, {
        timeout: 900000, // 15 min timeout
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WorldInPocketMassImport/1.0'
        }
      });
      if (res.data && res.data.elements) {
        elements = res.data.elements;
        console.log(`✅ Successo! Trovate ${elements.length} piazze.`);
        break;
      }
    } catch (e: any) {
      console.warn(`❌ Fallito endpoint ${endpoint}:`, e.message);
    }
  }

  if (elements.length === 0) {
    console.error("Nessun dato recuperato. Uscita.");
    process.exit(1);
  }

  let inseriti = 0;
  let giaEsistenti = 0;
  let errori = 0;

  for (const el of elements) {
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    if (!lat || !lon) continue;

    const tags = el.tags || {};
    if (!tags.name) continue;

    // Use poiCategories logic (we mapped place=square to 'monument')
    // but here we force category 'monument' since we know it's a square
    const id = normalizeOsmId(el.type, el.id);

    const poiPayload = {
      id,
      name: tags.name,
      lat,
      lon,
      category: 'monument', // Le piazze importanti vanno sotto monumenti
      city: null, // Si potrebbe geocodificare ma lascio null o "Global"
      image_url: null,
      description: `[Wikipedia Import] ${tags.wikipedia || ''}`,
      raw_tags: tags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('shared_pois').insert([poiPayload]);
    if (error) {
      if (error.code === '23505') { // unique violation
        giaEsistenti++;
      } else {
        console.error(`Errore inserimento ${tags.name}:`, error.message);
        errori++;
      }
    } else {
      inseriti++;
      if (inseriti % 50 === 0) {
        console.log(`Inseriti ${inseriti} / ${elements.length}...`);
      }
    }
  }

  console.log("🏁 Import completato!");
  console.log(`Nuovi inseriti: ${inseriti}`);
  console.log(`Già esistenti: ${giaEsistenti}`);
  console.log(`Errori: ${errori}`);
  process.exit(0);
}

run();
