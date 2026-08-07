import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, count, error } = await supabase
    .from('shared_pois')
    .select('id, name, lat, lon, category', { count: 'exact' });

  console.log("Total pois:", count);

  // query specifically for empty names
  const { data: emptyData, error: err2 } = await supabase
    .from('shared_pois')
    .select('id, name, lat, lon, category')
    .or('name.eq.,name.is.null');

  console.log("Pois with explicitly empty/null names:", emptyData?.length);
  if (emptyData?.length > 0) {
    console.log(emptyData.slice(0, 5));
  }
}
test();
