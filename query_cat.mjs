import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Searching categories in Veneto...");
  const { data, error } = await supabase
    .from('shared_pois')
    .select('category')
    .eq('region', 'Veneto')
    .limit(100);
    
  if (error) console.error(error);
  else {
    const categories = new Set(data.map(d => d.category));
    console.log(`Categories found:`, Array.from(categories));
  }
  
  process.exit(0);
}
run();
