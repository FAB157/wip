import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('get_nearby_pois', {
    user_lat: 44.0755998,
    user_lon: 10.0989008,
    radius_meters: 500
  });

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Result:", data);
  }
}
test();
