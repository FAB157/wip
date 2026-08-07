import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from("shared_pois")
    .select("id,name,lat,lon,category,description_ai,description_short,description_long,image_url,photo_url,is_gem,status")
    .eq('id', '44_0756_10_0989');
    
  console.log("DB Data:", data);
}
run();
