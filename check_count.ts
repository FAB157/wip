import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: pois, error } = await sb
    .from('shared_pois')
    .select('id, name, enriched_at, description_ai_it')
    .gte('lat', 43.95)
    .lte('lat', 44.3)
    .gte('lon', 9.85)
    .lte('lon', 10.2);

  if (error) {
    console.error("Error:", error);
    return;
  }

  const total = pois.length;
  const enriched = pois.filter(p => p.enriched_at !== null);
  const pending = total - enriched.length;
  
  console.log(`Massa-Carrara Totale: ${total}`);
  console.log(`Enriched: ${enriched.length}`);
  console.log(`Pending: ${pending}`);
}
run();
