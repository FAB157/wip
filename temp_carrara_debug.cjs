const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
  const { data, error } = await supabase.from('shared_pois').select('id, name').ilike('name', '%Gianpaoli%');
  console.log('shared_pois err:', error);
  console.log('shared_pois data:', data);
  
  const { data: d2, error: e2 } = await supabase.from('punti_interesse').select('id, nome').ilike('nome', '%Gianpaoli%');
  console.log('punti_interesse err:', e2);
  console.log('punti_interesse data:', d2);
  
  // also check how many pois we have in carrara area
  const { data: d3, error: e3 } = await supabase.from('shared_pois')
    .select('id, name, category, status')
    .gte('lat', 44.05)
    .lte('lat', 44.10)
    .gte('lon', 10.05)
    .lte('lon', 10.15)
    .limit(5);
  console.log('Carrara area POIs:', d3);
}

checkDB().catch(console.error);
