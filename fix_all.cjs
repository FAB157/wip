const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function run() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Cancello i dettagli arricchiti errati...");
  const { error: err1 } = await supabase.from('poi_details').delete().neq('poi_id', 'none');
  console.log('Poi details delete:', err1 ? err1.message : 'OK');

  console.log("Cancello le aree indicizzate per forzare il ricalcolo Overpass...");
  const { error: err2 } = await supabase.from('indexed_areas').delete().neq('lat', 0);
  console.log('Indexed areas delete:', err2 ? err2.message : 'OK');

  console.log("Cancello i POI satellitari (osm-)...");
  const { error: err3 } = await supabase.from('shared_pois').delete().like('id', 'osm-%');
  console.log('Shared pois delete:', err3 ? err3.message : 'OK');

  console.log("Cache pulita con successo!");
}

run();
