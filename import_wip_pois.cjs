const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Supabase config ──
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── CLI arguments ──
const CSV_FILE = path.resolve(process.argv[2] || '');
const CATEGORY = (process.argv[3] || 'monumenti').toLowerCase().trim();

if (!CSV_FILE) {
  console.error('❌ Must provide a CSV file path');
  process.exit(1);
}

// Simple CSV parser handling quoted fields
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
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

// Generate deterministic id from lat/lon (rounded to 4 decimals)
function generateId(lat, lon) {
  const latStr = parseFloat(lat).toFixed(4).replace('.', '_');
  const lonStr = parseFloat(lon).toFixed(4).replace('.', '_');
  return `${latStr}_${lonStr}`;
}

async function importPois() {
  console.log('📦 Starting POI import');
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`🔎 Parsed ${rows.length} rows`);

  // Detect coordinate columns (support @lat/@lon or lat/lon)
  const sample = rows[0] || {};
  let latCol = null, lonCol = null;
  if ('@lat' in sample && '@lon' in sample) { latCol = '@lat'; lonCol = '@lon'; }
  else if ('lat' in sample && 'lon' in sample) { latCol = 'lat'; lonCol = 'lon'; }
  else if ('latitude' in sample && 'longitude' in sample) { latCol = 'latitude'; lonCol = 'longitude'; }
  else {
    console.error('❌ Could not determine coordinate columns');
    process.exit(1);
  }

  const pois = [];
  let skipped = 0;
  for (const row of rows) {
    const lat = parseFloat(row[latCol]);
    const lon = parseFloat(row[lonCol]);
    const name = row['name'] || '';
    if (isNaN(lat) || isNaN(lon) || !name) { skipped++; continue; }
    const id = generateId(lat, lon);
    // Build description from any extra columns we have
    const extraFields = Object.keys(row).filter(k => ![latCol, lonCol, 'name'].includes(k));
    const description = extraFields.map(k => `${k}: ${row[k]}`).join('. ');
    pois.push({
      id,
      lat,
      lon,
      name,
      category: CATEGORY,
      description_ai: description || null,
      // Optional extra columns (they exist in DB schema but we may not have data)
      desc: null,
      tech: null,
      info: null,
      audio: null,
      source_link: null,
      is_gem: false,
    });
  }

  console.log(`✅ Ready to upsert ${pois.length} POIs (skipped ${skipped})`);

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < pois.length; i += BATCH) {
    const batch = pois.slice(i, i + BATCH);
    const { data, error } = await supabase.from('shared_pois').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error('❌ Batch error:', error.message);
    } else {
      inserted += batch.length;
      console.log(`  ⬆️ Inserted batch ${i / BATCH + 1}`);
    }
    // tiny delay
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('📊 Import finished');
  console.log(`Inserted: ${inserted}`);
}

importPois().catch(e => { console.error('💥 Fatal error', e); process.exit(1); });
