const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_nearby_pois', { user_lat: 44.0792, user_lon: 10.1, radius_meters: 50000 });
  console.log("DATA:");
  console.log(JSON.stringify(data?.[0], null, 2));
  console.log("ERROR:");
  console.log(error);
}

run();
