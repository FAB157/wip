import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('pois')
    .select('id, name, category');
  console.log("pois length:", data?.length);

  const { data: data2 } = await supabase
    .from('shared_pois')
    .select('id, name, category');
  console.log("shared_pois length:", data2?.length);
}
test();
