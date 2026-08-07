const fs = require('fs');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('shared_pois')
    .select('id, name, city, category, subCategory, lat, lon')
    .in('name', ['Avenza', 'Marina di Carrara']);
    
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  console.log('Found places:', data);
  
  // Also let's check what kind of POIs have 'description' issues.
  const { data: descData, error: descErr } = await supabase.from('shared_pois')
    .select('id, name, description, category')
    .not('description', 'is', null)
    .limit(5);
    
  if (descErr) console.error(descErr);
  else console.log('Sample descriptions:', descData);
}
check();
