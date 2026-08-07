require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const readline = require('readline');

// Configurazione Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERRORE: Credenziali Supabase mancanti nel file .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const categoryMap = {
  // 1. Utilità
  'railway:station': 'utilita',
  'railway:subway_entrance': 'utilita',
  'amenity:taxi': 'utilita',
  'amenity:pharmacy': 'utilita',
  'amenity:hospital': 'utilita',
  'amenity:police': 'utilita',
  'amenity:drinking_water': 'utilita',
  
  // 2. Famiglie
  'leisure:playground': 'famiglie',
  'tourism:theme_park': 'famiglie',
  'tourism:zoo': 'famiglie',
  'tourism:aquarium': 'famiglie',

  // 3. Locali
  'shop:bakery': 'locali',
  'shop:pastry': 'locali',
  'amenity:ice_cream': 'locali',
  'amenity:fast_food': 'locali',
  'shop:deli': 'locali',
  'amenity:cafe': 'locali'
};

async function importPois() {
  const filePath = 'C:\\Users\\HP\\Desktop\\utilitàwip.csv';
  
  if (!fs.existsSync(filePath)) {
    console.error("❌ File non trovato:", filePath);
    return;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let batch = [];
  const BATCH_SIZE = 1000;
  let totalInserted = 0;
  
  let headers = [];

  console.log("Inizio analisi e importazione...");

  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split('\t');
    } else {
      const cols = line.split('\t');
      if (cols.length < 3) continue;
      
      const lat = parseFloat(cols[1]);
      const lon = parseFloat(cols[2]);
      
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        continue;
      }

      let assignedCategory = null;
      for (const field of ['amenity', 'shop', 'leisure', 'railway', 'tourism']) {
        const idx = headers.indexOf(field);
        if (idx !== -1 && cols[idx] && cols[idx].trim() !== '') {
          const key = `${field}:${cols[idx].trim()}`;
          if (categoryMap[key]) {
            assignedCategory = categoryMap[key];
            break;
          }
        }
      }

      if (!assignedCategory) {
        lineCount++;
        continue;
      }

      const techData = {};
      const gfIdx = headers.indexOf('diet:gluten_free');
      const vegIdx = headers.indexOf('diet:vegetarian');
      const wheelIdx = headers.indexOf('wheelchair');

      if (gfIdx !== -1 && cols[gfIdx] && ['yes', 'only'].includes(cols[gfIdx].trim().toLowerCase())) {
        techData.gluten_free = true;
      }
      if (vegIdx !== -1 && cols[vegIdx] && ['yes', 'only'].includes(cols[vegIdx].trim().toLowerCase())) {
        techData.vegetarian = true;
      }
      if (wheelIdx !== -1 && cols[wheelIdx] && cols[wheelIdx].trim().toLowerCase() === 'yes') {
        techData.wheelchair_accessible = true;
      }

      const rawName = cols[3] && cols[3].trim() !== '' ? cols[3].trim() : null;
      const poiId = `${lat},${lon}`;
      const fallbackName = assignedCategory === 'utilita' ? 'Punto di Utilità' : (assignedCategory === 'locali' ? 'Locale' : 'Punto di interesse');
      
      const row = {
        id: poiId,
        lat: lat,
        lon: lon,
        name: rawName || fallbackName,
        category: assignedCategory,
        technical_data: Object.keys(techData).length > 0 ? JSON.stringify(techData) : null,
        is_gem: false,
        source: 'csv'
      };

      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        const success = await upsertBatch(batch);
        if (success) totalInserted += batch.length;
        batch = [];
      }
    }
    lineCount++;
  }

  if (batch.length > 0) {
    const success = await upsertBatch(batch);
    if (success) totalInserted += batch.length;
  }

  console.log(`\n✅ Importazione completata! Letti ${lineCount} record (esclusa l'intestazione). Inseriti/Aggiornati: ${totalInserted}`);
}

async function upsertBatch(batch) {
  try {
    const { data, error } = await supabase
      .from('shared_pois')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });
    
    if (error) {
      console.error("\n❌ Errore durante l'upsert del batch:", error.message);
      return false;
    } else {
      process.stdout.write(`+`); 
      return true;
    }
  } catch (err) {
    console.error("\n❌ Eccezione durante l'upsert:", err);
    return false;
  }
}

importPois().catch(console.error);
