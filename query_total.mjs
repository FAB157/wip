import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true });
    
  if (error) console.error(error);
  else console.log(`Total POIs in DB: ${count}`);
  process.exit(0);
}
run();
