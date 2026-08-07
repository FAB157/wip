import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Searching for parchi divertimento...");
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .eq('region', 'Veneto')
    .or('category.ilike.%parch%,category.ilike.%parco%');
    
  if (error) console.error(error);
  else console.log(`Total count: ${count}`);
  
  process.exit(0);
}
run();
