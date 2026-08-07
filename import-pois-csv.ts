/**
 * ITAINTA · Import POI da CSV Overpass -> tabella public.pois
 * ---------------------------------------------------------------------------
 * Uso:
 *   npx tsx import-pois-csv.ts "D:\\0MAPPA POI WIP\\file punti per database\\italia nord.csv" --country Italy --region Nord
 *
 * - Filtra/mappa solo le 9 categorie itainta (scarta highway, shop, ecc.)
 * - status = 'approved', source = 'csv'
 * - Dedup su osm_id (upsert onConflict, salta i duplicati anche gia' in DB)
 * - Insert a batch + log: importati / saltati / errori
 *
 * Richiede in env (o file .env):  SUPABASE_SERVICE_ROLE_KEY   (bypassa la RLS)
 * Opzionale:                      SUPABASE_URL  (default: progetto itainta)
 */

import { readFileSync } from 'node:fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mapToItaintaCategory, isAcceptablePoi, normalizeOsmId } from './src/lib/poiCategories';
import type { PoiCategory } from './src/types/poi';

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH_SIZE = 500;

// --------------------------------------------------------------------------
// CLI args
// --------------------------------------------------------------------------
function parseArgs(argv: string[]): { file: string; country: string; region: string | null } {
  const positional: string[] = [];
  let country = 'Italy';
  let region: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--country') country = argv[++i] ?? country;
    else if (argv[i] === '--region') region = argv[++i] ?? null;
    else positional.push(argv[i]);
  }
  return { file: positional[0], country, region };
}

// --------------------------------------------------------------------------
// CSV parser (gestisce campi quotati, virgole e newline interni)
// --------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignora (gestito dal \n)
    } else {
      field += c;
    }
  }
  // ultima riga senza newline finale
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Colonne CSV che corrispondono a tag OSM usati dal mapper. */
const TAG_COLUMNS = [
  'amenity', 'historic', 'railway', 'aeroway', 'highway', 'tourism',
  'leisure', 'religion', 'place', 'craft', 'shop', 'cuisine', 'building',
];

interface PoiInsertRow {
  osm_id: string;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory;
  country: string;
  region: string | null;
  source: 'csv';
  status: 'approved';
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  const { file, country, region } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error('❌ Specifica il percorso del CSV. Es:\n   npx tsx import-pois-csv.ts "italia nord.csv" --country Italy --region Nord');
    process.exit(1);
  }
  if (!SERVICE_KEY) {
    console.error('❌ Manca SUPABASE_SERVICE_ROLE_KEY (mettila nel file .env). Serve per bypassare la RLS in import.');
    process.exit(1);
  }

  console.log(`📂 Leggo: ${file}`);
  const text = readFileSync(file, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error('❌ CSV vuoto o senza righe dati.');
    process.exit(1);
  }

  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const colId = idx('@id');
  const colLat = idx('@lat');
  const colLon = idx('@lon');
  const colName = idx('name');
  if (colId < 0 || colLat < 0 || colLon < 0 || colName < 0) {
    console.error(`❌ Header inatteso. Trovato: ${header.join(', ')}`);
    process.exit(1);
  }
  const tagColIdx: Record<string, number> = {};
  for (const t of TAG_COLUMNS) {
    const i = idx(t);
    if (i >= 0) tagColIdx[t] = i;
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const seen = new Set<string>();
  let batch: PoiInsertRow[] = [];

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase
      .from('pois')
      .upsert(batch, { onConflict: 'osm_id', ignoreDuplicates: true });
    if (error) {
      errors += batch.length;
      console.warn(`⚠️  Errore batch (${batch.length} righe): ${error.message}`);
    } else {
      imported += batch.length;
      process.stdout.write(`\r✅ Importati: ${imported}  ·  Saltati: ${skipped}  ·  Errori: ${errors}   `);
    }
    batch = [];
  };

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols || cols.length < header.length - 2) { skipped++; continue; }

    const tags: Record<string, string | undefined> = {};
    for (const t of TAG_COLUMNS) {
      if (tagColIdx[t] !== undefined) tags[t] = cols[tagColIdx[t]];
    }

    const category = mapToItaintaCategory(tags);
    const name = (cols[colName] || '').trim();
    if (!isAcceptablePoi(name, category)) { skipped++; continue; }

    const lat = parseFloat(cols[colLat]);
    const lon = parseFloat(cols[colLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped++; continue; }

    const osm_id = normalizeOsmId(cols[colId]);
    if (seen.has(osm_id)) { skipped++; continue; }  // dedup intra-file
    seen.add(osm_id);

    batch.push({
      osm_id,
      name,
      lat,
      lon,
      category: category as PoiCategory,
      country,
      region,
      source: 'csv',
      status: 'approved',
    });

    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  process.stdout.write('\n');
  console.log('───────────────────────────────────────────');
  console.log(`✅ Importati: ${imported}`);
  console.log(`⏭️  Saltati (fuori categoria / nome/coord invalidi / duplicati): ${skipped}`);
  console.log(`⚠️  Errori:   ${errors}`);
  console.log('───────────────────────────────────────────');
}

main().catch((e) => {
  console.error('💥 Errore fatale:', e);
  process.exit(1);
});
