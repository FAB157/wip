import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('pois')
    .select('id, name, lat, lon, category');

  const shortNames = data.filter(p => !p.name || p.name.trim().length === 0);
  console.log("Pois with short/empty names:", shortNames.length);
  if (shortNames.length > 0) {
    console.log(shortNames);
  }

  const { data: data2 } = await supabase
    .from('shared_pois')
    .select('id, name, lat, lon, category');

  const shortNames2 = data2.filter(p => !p.name || p.name.trim().length === 0);
  console.log("Shared_pois with short/empty names:", shortNames2.length);
  if (shortNames2.length > 0) {
    console.log(shortNames2);
  }
}
test();
