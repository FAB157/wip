import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, category, city, region')
    .or('category.ilike.%parch%,category.ilike.%theme%,category.ilike.%amusement%')
    .ilike('region', '%Veneto%')
    .limit(10);
    
  if (error) console.error(error);
  else console.log(data);
  process.exit(0);
}
run();
