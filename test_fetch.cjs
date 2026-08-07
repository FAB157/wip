import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('*')
    .ilike('name', '%Stabile%')
    .limit(1);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

run();
