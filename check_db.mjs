import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, description_ai, description_short, description_long, practical_info, teaser_text_it, teaser_text_en, enrichment_source')
    .like('enrichment_source', '%json%') // check the new json ones
    .order('enriched_at', { ascending: false })
    .limit(1);
    
  if (error) console.error("ERRORE DB:", error);
  else if (data && data.length > 0) {
    console.log("=== ULTIMO POI ARRICCHITO CON JSON ===");
    console.log("Nome:", data[0].name);
    console.log("Source:", data[0].enrichment_source);
    console.log("Short IT:", data[0].description_short);
    console.log("Long IT:", data[0].description_long ? data[0].description_long.substring(0, 100) + '...' : null);
    console.log("Teaser IT:", data[0].teaser_text_it);
    console.log("Teaser EN:", data[0].teaser_text_en);
    console.log("Practical Info:", data[0].practical_info ? data[0].practical_info.substring(0, 100) + '...' : null);
    console.log("\n=== CONTENUTO DESCRIPTION_AI (FULL JSON) ===");
    try {
      const parsed = JSON.parse(data[0].description_ai);
      console.log("Testo Nicky IT:", parsed.testo_nicky_it);
      console.log("Testo Dante IT:", parsed.testo_dante_it);
    } catch(e) {
      console.log("JSON Parse err:", data[0].description_ai);
    }
  } else {
    console.log("Nessun record trovato ancora.");
  }
}
check();
