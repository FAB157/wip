const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Supabase config ──
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TARGET_DIR = process.argv[2];

if (!TARGET_DIR || !fs.existsSync(TARGET_DIR)) {
  console.log('❌ Devi specificare una cartella valida!');
  console.log('Uso: node import-africa-batch.cjs "C:\\Users\\HP\\Desktop\\cvs Africa\\africa_pois_csv"');
  process.exit(1);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  function splitCSVRow(row) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"' && row[i+1] === '"') {
        cur += '"'; i++;
      } else if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        result.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur);
    return result;
  }

  const header = splitCSVRow(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVRow(lines[i]);
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = vals[j] ? vals[j].trim() : '';
    }
    rows.push(obj);
  }
  return rows;
}

function generateId(lat, lon) {
  const latStr = parseFloat(lat).toFixed(4).replace('.', '_');
  const lonStr = parseFloat(lon).toFixed(4).replace('.', '_');
  return `${latStr}_${lonStr}`;
}

const GEO_BASE = {
  viewpoint:           [600, 300],
  castle:              [400, 180],
  archaeological_site: [400, 180],
  ruins:               [350, 150],
  monument:            [280, 100],
  museum:              [250, 100],
  church:              [220,  90],
  artwork:             [80,   40],
  attraction:          [200,  80],
  restaurant:          [100,  50],
  pharmacy:            [80,   40],
  hospital:            [300, 120],
  police:              [150,  60],
  library:             [150,  60],
  post_office:         [100,  40],
  taxi:                [80,   40],
  station:             [300, 120],
  subway_entrance:     [60,   30],
  playground:          [200,  80],
  theme_park:          [500, 200],
  zoo:                 [400, 180],
  aquarium:            [300, 120],
};

function getRadii(row) {
  if (row.highway === 'toll_booth')          return [500, 250];
  if (row.highway === 'services')            return [400, 200];
  if (row.historic === 'cathedral')          return [350, 150];
  if (row.historic === 'abbey' || row.historic === 'monastery') return [400, 180];
  if (row.leisure === 'nature_reserve')      return [800, 400];
  
  const subCat = row.tourism || row.historic || row.amenity || row.leisure || 'monument';
  return GEO_BASE[subCat] || [200, 80];
}

function deriveCategory(row) {
  let cat = "monumenti";
  const hist = row.historic || "";
  const amenity = row.amenity || "";
  const tourism = row.tourism || "";
  const building = row.building || "";
  const leisure = row.leisure || "";
  const natural = row.natural || "";
  const shop = row.shop || "";
  
  if (amenity === "place_of_worship" || building.match(/church|cathedral|chapel|basilica|mosque|temple|synagogue/) || hist.match(/church|monastery|abbey|convent/)) cat = "chiese";
  else if (tourism.match(/museum|gallery/)) cat = "musei";
  else if (tourism === "viewpoint" || natural === "peak") cat = "panorami";
  else if (hist.match(/monument|castle|ruins|archaeological_site|fort|fortress|tower|city_gate|memorial|tomb|milestone|manor|rune_stone|boundary_stone|building/)) cat = "monumenti";
  else if (amenity.match(/restaurant|cafe|fast_food|bar|pub|ice_cream/)) cat = "locali";
  else if (amenity.match(/hospital|pharmacy|police|library|post_office|drinking_water|taxi|toilets/)) cat = "utilita";
  else if (leisure === "playground" || tourism.match(/theme_park|aquarium|zoo/)) cat = "famiglie";
  else if (amenity === "marketplace" || shop.match(/craft|cheese|bakery/) || row.craft || tourism === "winery") cat = "esperienze_locali";
  
  return cat;
}

async function processFile(file) {
  console.log(`\n📄 Processando: ${path.basename(file)}`);
  const raw = fs.readFileSync(file, 'utf-8');
  const rows = parseCSV(raw);
  
  if (rows.length === 0) return;

  const colMap = { lat: '@lat', lon: '@lon' };
  const pois = [];
  
  for (const row of rows) {
    const lat = parseFloat(row[colMap.lat]);
    const lon = parseFloat(row[colMap.lon]);
    const name = row['name'] || '';

    if (isNaN(lat) || isNaN(lon) || !name) continue;

    const id = generateId(lat, lon);
    const wikidata = row['wikidata'] || '';
    const isGem = !!(wikidata && wikidata.startsWith('Q'));

    const [alert_radius, geofence_radius] = getRadii(row);

    pois.push({
      id,
      lat,
      lon,
      name,
      category: deriveCategory(row),
      is_gem: isGem,
      wikidata: wikidata || null,
      status: 'verified',
      alert_radius,
      geofence_radius
    });
  }

  const deduped = new Map();
  for (const p of pois) { deduped.set(p.id, p); }
  const uniquePois = Array.from(deduped.values());

  if (uniquePois.length === 0) return { inserted: 0, gems: 0 };
  
  let chunkGems = 0;
  for(const p of uniquePois) { if(p.is_gem) chunkGems++; }
  console.log(`📍 Inserimento di ${uniquePois.length} POI (${chunkGems} gemme) in corso...`);
  
  for (let i = 0; i < uniquePois.length; i += 1000) {
    const chunk = uniquePois.slice(i, i + 1000);
    const { error } = await supabase.from('shared_pois').upsert(chunk, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error(`❌ Errore al chunk ${i}:`, error.message);
    else console.log(`✅ Upsertati ${chunk.length} record. (${i + chunk.length}/${uniquePois.length})`);
  }
  return { inserted: uniquePois.length, gems: chunkGems };
}

function getAllCsvFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllCsvFiles(fullPath, arrayOfFiles);
    } else {
      if (file.endsWith('.csv')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

async function startBatch() {
  console.log(`Avvio importazione batch RICORSIVA da cartella: ${TARGET_DIR}`);
  const files = getAllCsvFiles(TARGET_DIR);
  let totalInserted = 0;
  let totalGems = 0;
  
  for (const f of files) {
    const res = await processFile(f);
    if (res) {
      totalInserted += res.inserted;
      totalGems += res.gems;
    }
  }
  console.log(`\n🎉 BATCH COMPLETO! Elaborati ${files.length} file CSV.`);
  console.log(`📈 POI totali validi/importati: ${totalInserted}`);
  console.log(`💎 Gemme totali: ${totalGems}`);
}

startBatch();
