import {createClient} from '@supabase/supabase-js';
import * as fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const filePath = 'G:\\Il mio Drive\\000 wip modifiche\\borghi_piu_belli_italia_completato.csv';
  console.log('Reading CSV da:', filePath);
  
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const lines = csvContent.split('\n');
  
  let imported = 0;
  let errors = 0;
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parser for "Borgo,Regione,Latitudine,Longitudine,Informazioni,Link"
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    const thirdComma = line.indexOf(',', secondComma + 1);
    const fourthComma = line.indexOf(',', thirdComma + 1);
    
    const borgoName = line.substring(0, firstComma).trim();
    const region = line.substring(firstComma + 1, secondComma).trim();
    const latStr = line.substring(secondComma + 1, thirdComma).trim();
    const lonStr = line.substring(thirdComma + 1, fourthComma).trim();
    
    // We don't strictly need to parse the rest manually if we just use description_ai to generate it,
    // but let's grab it roughly.
    
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    
    if (isNaN(lat) || isNaN(lon)) {
      console.log('Skipping invalid coordinates for:', borgoName);
      continue;
    }
    
    const id = `borghi_${borgoName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
    
    const { error } = await sb.from('shared_pois').upsert({
      id,
      name: borgoName,
      lat,
      lon,
      city: borgoName,
      region,
      category: 'gemme', // Let's use 'gemme' or 'village' based on what UI expects. UI expects categories, let's use 'borghi' or 'gemme'.
      is_gem: true,
      enriched_at: null, // Forces Agnes to enrich it!
      photo_url: null
    }, { onConflict: 'id' });
    
    if (error) {
      console.error(`Errore per ${borgoName}:`, error.message);
      errors++;
    } else {
      imported++;
      if (imported % 50 === 0) console.log(`Importati ${imported} borghi...`);
    }
  }
  
  console.log(`\nFinito! Importati: ${imported}, Errori: ${errors}`);
}
run();
