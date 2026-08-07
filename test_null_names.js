import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('pois')
    .select('id, name, lat, lon, category')
    .is('name', null);
  
  const { data: data2, error: error2 } = await supabase
    .from('pois')
    .select('id, name, lat, lon, category')
    .eq('name', '');

  console.log("Pois with null name:", data?.length);
  console.log("Pois with empty string name:", data2?.length);
  if (data?.length > 0) console.log("Sample null:", data[0]);
  if (data2?.length > 0) console.log("Sample empty:", data2[0]);
}
test();
