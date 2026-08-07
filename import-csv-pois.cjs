const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Supabase config ──
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ══════════════════════════════════════════════════
//  USAGE:
//    node import-csv-pois.cjs "D:\path\to\file.csv" categoria
//
//  Esempi:
//    node import-csv-pois.cjs "D:\0MAPPA POI WIP\museitoscana15.csv" musei
//    node import-csv-pois.cjs "D:\0MAPPA POI WIP\chiese.csv" chiese
//    node import-csv-pois.cjs "D:\0MAPPA POI WIP\ristoranti.csv" ristoranti
//    node import-csv-pois.cjs "D:\0MAPPA POI WIP\monumenti.csv" monumenti
//
//  Categorie supportate dall'app:
//    musei, monumenti, chiese, ristoranti, bar, hotel,
//    panorami, parchi, parcheggi, farmacie, castelli, archeo
//
//  Se ometti la categoria, viene usata "monumenti" come default.
//  I POI con un Wikidata ID vengono automaticamente segnati come 💎 gemme.
// ══════════════════════════════════════════════════

// ── Parse CLI arguments ──
const CSV_FILE = path.resolve(process.argv[2] || '');
const CATEGORY = (process.argv[3] || 'monumenti').toLowerCase().trim();

if (!process.argv[2]) {
  console.log('');
  console.log('  ❌ Devi specificare il percorso del file CSV!');
  console.log('');
  console.log('  Uso:  node import-csv-pois.cjs "percorso/file.csv" categoria');
  console.log('');
  console.log('  Esempi:');
  console.log('    node import-csv-pois.cjs "D:\\0MAPPA POI WIP\\musei.csv" musei');
  console.log('    node import-csv-pois.cjs "D:\\0MAPPA POI WIP\\chiese.csv" chiese');
  console.log('    node import-csv-pois.cjs "D:\\0MAPPA POI WIP\\ristoranti.csv" ristoranti');
  console.log('');
  process.exit(1);
}

// ── Simple CSV parser that handles quoted fields ──
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ── Generate deterministic ID from lat/lon ──
function generateId(lat, lon) {
  const latStr = parseFloat(lat).toFixed(4).replace('.', '_');
  const lonStr = parseFloat(lon).toFixed(4).replace('.', '_');
  return `${latStr}_${lonStr}`;
}

// ── Build description from available OSM fields ──
function buildDescription(row) {
  const parts = [];
  const name = row['name'] || '';
  const museumType = row['museum'] || row['museum:type'] || row['tourism'] || '';
  const city = row['addr:city'] || '';
  const street = row['addr:street'] || '';
  const hn = row['addr:housenumber'] || '';

  if (name) {
    parts.push(name);
  }

  if (museumType && museumType !== 'yes' && museumType !== 'museum') {
    parts.push(`Tipologia: ${museumType}`);
  }

  if (street) {
    let addr = street;
    if (hn) addr += ` ${hn}`;
    if (city) addr += `, ${city}`;
    parts.push(`Indirizzo: ${addr}`);
  } else if (city) {
    parts.push(`Località: ${city}`);
  }

  const hours = row['opening_hours'] || '';
  if (hours) {
    parts.push(`Orari: ${hours}`);
  }

  const phone = row['phone'] || row['contact:phone'] || '';
  if (phone) {
    parts.push(`Tel: ${phone}`);
  }

  return parts.join('. ') || null;
}

// ── Main import function ──
async function importPois() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   📍 ITA IN TAS — Importazione POI da CSV      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  📂 File:      ${CSV_FILE}`);
  console.log(`  🏷️  Categoria: ${CATEGORY}`);
  console.log('');

  // 1. Read CSV
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ File CSV non trovato: ${CSV_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`📄 Letto CSV: ${rows.length} righe trovate`);

  // 2. Auto-detect coordinate columns
  //    Supporta: X/Y (QGIS), lat/lon, latitude/longitude
  const first = rows[0] || {};
  const colMap = { lat: null, lon: null };

  if ('Y' in first && 'X' in first) {
    colMap.lat = 'Y'; colMap.lon = 'X';
  } else if ('lat' in first && 'lon' in first) {
    colMap.lat = 'lat'; colMap.lon = 'lon';
  } else if ('latitude' in first && 'longitude' in first) {
    colMap.lat = 'latitude'; colMap.lon = 'longitude';
  } else if ('LAT' in first && 'LON' in first) {
    colMap.lat = 'LAT'; colMap.lon = 'LON';
  } else if ('@lat' in first && '@lon' in first) {
    colMap.lat = '@lat'; colMap.lon = '@lon';
  } else {
    console.error('❌ Colonne coordinate non trovate!');
    console.error('   Servono: X/Y, lat/lon, o latitude/longitude');
    process.exit(1);
  }
  console.log(`📐 Coordinate rilevate: ${colMap.lat} (lat), ${colMap.lon} (lon)`);

  // 3. Transform rows to shared_pois format
  const pois = [];
  let skipped = 0;
  let gemCount = 0;

  for (const row of rows) {
    const lat = parseFloat(row[colMap.lat]);
    const lon = parseFloat(row[colMap.lon]);

    const name = row['name'] || row['name:it'] || row['alt_name'] || row['official_name'] || '';

    // Skip rows without valid coordinates or name
    if (isNaN(lat) || isNaN(lon) || !name) {
      skipped++;
      continue;
    }

    const id = generateId(lat, lon);
    const description = buildDescription(row);
    const imageUrl = row['image'] || row['image_url'] || null;
    const wikidata = row['wikidata'] || '';

    // POI con Wikidata ID → gemma automatica
    const isGem = !!(wikidata && wikidata.startsWith('Q'));
    if (isGem) gemCount++;

    pois.push({
      id,
      lat,
      lon,
      name,
      category: CATEGORY,
      description_ai: description,
      image_url: imageUrl,
      is_gem: isGem,
      wikidata: wikidata || null,
    });
  }

  // Deduplicate by ID (same coordinates rounded to 4 decimals)
  const deduped = new Map();
  for (const p of pois) {
    deduped.set(p.id, p); // last wins if duplicate
  }
  const uniquePois = Array.from(deduped.values());
  const dupes = pois.length - uniquePois.length;

  console.log(`✅ POI validi trovati: ${pois.length}`);
  if (dupes > 0) {
    console.log(`🔄 Duplicati rimossi (stesse coordinate): ${dupes}`);
  }
  console.log(`📍 POI unici da inserire: ${uniquePois.length}`);
  console.log(`💎 Di cui gemme (con Wikidata): ${gemCount}`);
  console.log(`⏭️  Righe scartate (senza nome o coordinate): ${skipped}`);
  console.log('');

  if (uniquePois.length === 0) {
    console.log('⚠️  Nessun POI da inserire. Controlla il CSV.');
    return;
  }

  // 4. Show preview
  console.log('── Anteprima primi 5 POI ──');
  uniquePois.slice(0, 5).forEach((p, i) => {
    const gem = p.is_gem ? ' 💎' : '';
    console.log(`  ${i + 1}. ${p.name} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}) [${p.category}]${gem}`);
  });
  console.log('');

  // 5. Upsert in batches of 50
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < uniquePois.length; i += BATCH_SIZE) {
    const batch = uniquePois.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniquePois.length / BATCH_SIZE);

    process.stdout.write(`  📦 Batch ${batchNum}/${totalBatches} (${batch.length} POI)... `);

    const { data, error } = await supabase
      .from('shared_pois')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      console.log(`❌ Errore: ${error.message}`);
      errors++;

      // Retry with minimal schema (fallback)
      if (error.message?.includes('column') || error.code === 'PGRST204') {
        console.log('    ↪ Riprovo con schema minimale...');
        const minimalBatch = batch.map(p => ({
          id: p.id,
          lat: p.lat,
          lon: p.lon,
          name: p.name,
          category: p.category,
          is_gem: p.is_gem,
        }));
        const retry = await supabase
          .from('shared_pois')
          .upsert(minimalBatch, { onConflict: 'id', ignoreDuplicates: false });
        if (retry.error) {
          console.log(`    ❌ Anche il retry è fallito: ${retry.error.message}`);
        } else {
          console.log(`    ✅ Retry riuscito!`);
          inserted += batch.length;
          errors--;
        }
      }
    } else {
      console.log(`✅`);
      inserted += batch.length;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // 6. Summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   📊 RIEPILOGO IMPORTAZIONE                    ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║   File:                ${path.basename(CSV_FILE).padEnd(25)} ║`);
  console.log(`║   Categoria:           ${CATEGORY.padEnd(25)} ║`);
  console.log(`║   Totale righe CSV:    ${String(rows.length).padStart(6)}                   ║`);
  console.log(`║   POI inseriti:        ${String(inserted).padStart(6)}                   ║`);
  console.log(`║   💎 Gemme:            ${String(gemCount).padStart(6)}                   ║`);
  console.log(`║   Righe scartate:      ${String(skipped).padStart(6)}                   ║`);
  console.log(`║   Batch con errori:    ${String(errors).padStart(6)}                   ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (errors === 0) {
    console.log('\n🎉 Importazione completata con successo!');
  } else {
    console.log('\n⚠️  Importazione completata con alcuni errori. Controlla i log sopra.');
  }
}

importPois().catch(err => {
  console.error('💥 Errore fatale:', err);
  process.exit(1);
});
