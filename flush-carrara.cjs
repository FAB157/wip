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
  console.log("Deleting auto POIs in Carrara region...");
  const { data: pData, error: pErr } = await supabase
    .from('shared_pois')
    .delete()
    .eq('status', 'auto')
    .gte('lat', 43.9)
    .lte('lat', 44.2)
    .gte('lon', 9.9)
    .lte('lon', 10.2);

  if (pErr) console.error("Error deleting POIs:", pErr);
  else console.log("Deleted POIs successfully.");

  console.log("Deleting indexed_areas in Carrara region...");
  const { data: iData, error: iErr } = await supabase
    .from('indexed_areas')
    .delete()
    .gte('center_lat', 43.9)
    .lte('center_lat', 44.2)
    .gte('center_lon', 9.9)
    .lte('center_lon', 10.2);

  if (iErr) console.error("Error deleting indexed_areas:", iErr);
  else console.log("Deleted indexed_areas successfully.");

}

run();
