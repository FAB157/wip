import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carica variabili d'ambiente (.env)
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ERRORE: Variabili Supabase mancanti nel file .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_FOLDER = './import_csv';
const BATCH_SIZE = 500;

if (!fs.existsSync(CSV_FOLDER)) {
  fs.mkdirSync(CSV_FOLDER);
  console.log(`📁 Ho creato la cartella '${CSV_FOLDER}'. Inserisci i tuoi file CSV lì dentro e riavvia lo script!`);
  process.exit(0);
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Rilevamento automatico del delimitatore
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  // Helper per dividere le righe CSV gestendo i doppi apici e il delimitatore scelto
  const splitCSVLine = (line) => {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      if (line[i] === delimiter && !inQuotes) {
        result.push(line.substring(start, i).trim().replace(/^"|"$/g, ''));
        start = i + 1;
      }
    }
    result.push(line.substring(start).trim().replace(/^"|"$/g, '').replace(/;$/, ''));
    return result;
  };

  const headers = splitCSVLine(lines[0]);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = splitCSVLine(lines[i]);
    // Gestione tollerante della lunghezza riga
    if (currentLine.length < headers.length - 1) continue;

    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = currentLine[index] || '';
      }
    });
    results.push(obj);
  }
  return results;
}

function mapCategory(row) {
  const historic = row.historic?.toLowerCase() || '';
  const tourism = row.tourism?.toLowerCase() || '';
  const leisure = row.leisure?.toLowerCase() || '';
  const natural = row.natural?.toLowerCase() || '';
  const amenity = row.amenity?.toLowerCase() || '';

  if (amenity === 'place_of_worship' || historic === 'church' || historic === 'monastery' || historic === 'chapel') return 'church';
  if (tourism === 'museum' || tourism === 'artwork' || tourism === 'gallery') return 'museum';
  if (historic === 'archaeological_site' || historic === 'ruins') return 'archaeological_site';
  if (historic === 'castle' || historic === 'fort') return 'castle';
  if (historic === 'monument' || historic === 'memorial' || historic !== '') return 'monument';
  if (tourism === 'viewpoint' || natural !== '') return 'viewpoint';
  if (leisure === 'nature_reserve' || leisure === 'park') return 'park';
  if (tourism === 'attraction' || tourism === 'theme_park' || tourism === 'zoo') return 'attraction';
  if (tourism === 'information' || amenity === 'tourist_info') return 'information';

  return 'attraction';
}

function isPremium(row, category) {
  if (category === 'castle' || category === 'archaeological_site' || category === 'museum') return true;
  if (row.tourism === 'attraction' && row.historic === 'monument') return true;
  return false;
}

async function processFile(filePath) {
  console.log(`\n🚀 Inizio importazione da ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);

  const pois = [];
  rows.forEach((row) => {
    // Normalizziamo le chiavi che hanno il prefisso '@'
    const id = row['@id'] || row.id;
    const latStr = row['@lat'] || row.lat;
    const lonStr = row['@lon'] || row.lon;
    const name = row.name;

    // Consentiamo l'importazione anche senza nome, ma lat/lon sono obbligatori
    if (!latStr || !lonStr) return;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return;

    const category = mapCategory(row);
    const premium = isPremium(row, category);
    const csvDesc = row.description || row.note || null;

    // Gestione Metadati Tecnici e Wikipedia
    const technicalData = {
      wikipedia_url: row.wikipedia ? `https://it.wikipedia.org/wiki/${row.wikipedia.replace(/ /g, '_')}` : null,
      wikidata_id: row.wikidata || null,
      osm_type: row['@type'] || null,
      heritage: row.heritage || null,
      inception: row.inception || row.start_date || null
    };

    pois.push({
      id: `osm_${id}`,
      name: name || "Punto di interesse",
      lat: lat,
      lon: lon,
      category: category,
      description_ai: null,
      audio_url: null,
      is_hidden: false,
      verified: true,
      created_at: new Date().toISOString(),
      image_url: null,
      is_gem: premium,
      status: 'verified',
      last_reviewed_at: null,
      reviewed_by: null,
      place_id: null,
      description_short: csvDesc ? csvDesc.substring(0, 150) : null,
      description_long: null,
      audio_url_short: null,
      audio_url_long: null,
      photo_url: null,
      is_locked: false,
      flag_review: false,
      full_description: null,
      technical_data: technicalData,
      images_json: null,
      practical_info: null,
      audio_script: null,
      last_updated: null,
      alert_radius: 150,
      geofence_radius: 50,
      enriched_at: null,
      enrichment_source: null,
      location: null,
      city: null,
      region: null,
      country: null,
      source: 'csv',
      footprint: null,
      entrance_lat: null,
      entrance_lon: null,
      poi_type: category,
      indoor: false,
      updated_at: new Date().toISOString(),
      teaser_text_it: name ? `Sei vicino a ${name}. Apri l'app per scoprire la sua storia.` : null,
      teaser_text_en: null
    });
  });

  console.log(`✅ File processato. Trovati ${pois.length} POI da caricare.`);
  let inserted = 0;

  for (let i = 0; i < pois.length; i += BATCH_SIZE) {
    const batch = pois.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await supabase
        .from('shared_pois')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        console.error(`❌ Errore batch ${i}:`, error.message);
      } else {
        inserted += batch.length;
        console.log(`  ⬆️ Inseriti ${inserted} / ${pois.length}...`);
      }
    } catch (err) {
      console.error(`❌ Errore imprevisto nel batch ${i}:`, err);
    }
  }
  console.log(`🎉 Finito con ${filePath}! Inseriti in totale: ${inserted}`);
}

async function importAllData() {
  const TARGET_FILE = 'cvs RO SM RS.csv';
  const files = fs.readdirSync(CSV_FOLDER).filter(f => f === TARGET_FILE);
  
  if (files.length === 0) {
    console.log(`⚠️ Il file '${TARGET_FILE}' non è stato trovato nella cartella '${CSV_FOLDER}'.`);
    return;
  }

  console.log(`📦 File individuato: ${TARGET_FILE}. Inizio elaborazione...`);
  const fullPath = path.join(CSV_FOLDER, TARGET_FILE);
  await processFile(fullPath);

  console.log(`\n🏆 IMPORTAZIONE DEL FILE SELEZIONATO COMPLETATA!`);
}

importAllData();
