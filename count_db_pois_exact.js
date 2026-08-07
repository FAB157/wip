import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const categoriesToQuery = [
    'pharmacy', 'farmacia', 'farmacie',
    'hospital', 'ospedale',
    'police', 
    'taxi',
    'library', 
    'post_office',
    'drinking_water', 'fontanella', 'fontanelle',
    'playground', 'theme_park', 'aquarium', 'zoo',
    'station', 'stazione_ferroviaria', 'subway_entrance'
  ];

  console.log("=== ESATTO CONTEGGIO UTILITÀ E FAMIGLIE ===");
  
  let totalQueries = 0;
  for (const cat of categoriesToQuery) {
    const { count, error } = await supabase
      .from('shared_pois')
      .select('*', { count: 'exact', head: true })
      .eq('category', cat);
      
    if (error) {
      console.error(error);
    } else {
      if (count > 0) {
        console.log(`${cat.padEnd(20)}: ${count}`);
        totalQueries += count;
      }
    }
  }
  
  const { count: totalDb } = await supabase
    .from('shared_pois')
    .select('*', { count: 'estimated', head: true });
    
  console.log(`\nTOTALE RECORD IN TABELLA (Stima DB): ${totalDb}`);
}
run();
