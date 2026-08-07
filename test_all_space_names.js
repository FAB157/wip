import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, lat, lon, category');

  const emptySpace = data.filter(p => !p.name || p.name.trim().length === 0);
  console.log("Pois with only spaces or empty/null names:", emptySpace.length);
  if (emptySpace.length > 0) {
    console.log(emptySpace.slice(0, 5));
  }
}
test();
