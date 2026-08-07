import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('*')
    .ilike('name', '%Teatro Francesco Stabile%')
    .limit(1);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

run();
