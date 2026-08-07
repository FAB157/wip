const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const CSV_FILE = path.resolve('D:\\0MAPPA POI WIP\\museitoscana15.csv');

// ── CSV Parser ──
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function generateId(lat, lon) {
  return parseFloat(lat).toFixed(4).replace('.', '_') + '_' + parseFloat(lon).toFixed(4).replace('.', '_');
}

async function updateGems() {
  console.log('💎 Aggiornamento Gemme — POI con Wikidata ID');
  console.log('');

  const raw = fs.readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(raw);

  // Find all POIs that have a wikidata field
  const gemIds = [];
  for (const row of rows) {
    const lat = parseFloat(row['Y']);
    const lon = parseFloat(row['X']);
    const name = row['name'] || row['name:it'] || '';
    const wikidata = row['wikidata'] || '';

    if (isNaN(lat) || isNaN(lon) || !name) continue;

    if (wikidata && wikidata.startsWith('Q')) {
      gemIds.push(generateId(lat, lon));
    }
  }

  // Deduplicate
  const uniqueGemIds = [...new Set(gemIds)];
  console.log(`📊 POI con Wikidata ID trovati: ${uniqueGemIds.length}`);
  console.log('');

  // Update in batches
  const BATCH_SIZE = 50;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < uniqueGemIds.length; i += BATCH_SIZE) {
    const batch = uniqueGemIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueGemIds.length / BATCH_SIZE);

    process.stdout.write(`  💎 Batch ${batchNum}/${totalBatches} (${batch.length} POI)... `);

    const { error } = await supabase
      .from('shared_pois')
      .update({ is_gem: true })
      .in('id', batch);

    if (error) {
      console.log(`❌ ${error.message}`);
      errors++;
    } else {
      console.log('✅');
      updated += batch.length;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('');
  console.log(`🎉 Gemme aggiornate: ${updated} / ${uniqueGemIds.length}`);
  if (errors > 0) console.log(`⚠️  Batch con errori: ${errors}`);
}

updateGems().catch(err => {
  console.error('💥 Errore:', err);
  process.exit(1);
});
