import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .in('category', ['theme_park', 'amusement_park', 'water_park', 'zoo', 'attraction']);
    
  if (error) console.error(error);
  else console.log(`Total amusement/theme parks in DB: ${count}`);
  process.exit(0);
}
run();
