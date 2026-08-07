import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ERRORE: Variabili Supabase mancanti nel file .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_FILE_PATH = './import_csv/cvs RO SM RS - da fare.csv';
const BATCH_SIZE = 500;

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

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
    if (currentLine.length < headers.length - 1) continue;
    const obj = {};
    headers.forEach((header, index) => {
      if (header) obj[header] = currentLine[index] || '';
    });
    results.push(obj);
  }
  return results;
}

async function startDeletion() {
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ Il file '${CSV_FILE_PATH}' non esiste.`);
    return;
  }

  console.log(`🚀 Analisi del file per la cancellazione: ${CSV_FILE_PATH}...`);
  const content = fs.readFileSync(CSV_FILE_PATH, 'utf8');
  const rows = parseCSV(content);

  // Estraiamo gli ID dei POI (stessa logica usata nell'import)
  const idsToDelete = rows.map(row => {
    const id = row['@id'] || row.id;
    return `osm_${id}`;
  }).filter(Boolean);

  console.log(`✅ Trovati ${idsToDelete.length} potenziali ID da rimuovere.`);

  let deletedCount = 0;
  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE);
    try {
      const { error } = await supabase
        .from('shared_pois')
        .delete()
        .in('id', batch);

      if (error) {
        console.error(`❌ Errore durante la cancellazione del batch ${i}:`, error.message);
      } else {
        deletedCount += batch.length;
        console.log(`  🗑️ Rimossi ${deletedCount} / ${idsToDelete.length}...`);
      }
    } catch (err) {
      console.error(`❌ Errore imprevisto nel batch ${i}:`, err);
    }
  }

  console.log(`\n🏆 OPERAZIONE COMPLETATA! Rimossi ${deletedCount} punti di interesse.`);
}

startDeletion();
