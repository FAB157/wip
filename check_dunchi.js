const fs = require('fs');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('shared_pois')
    .select('id, name, city, category, lat, lon')
    .gte('lat', 44.0)
    .lte('lat', 44.2)
    .gte('lon', 10.0)
    .lte('lon', 10.2);
  if (error) console.error(error);
  else {
    const dunchi = data.filter(p => p.name && p.name.toLowerCase().includes('dunchi'));
    console.log('Results for Dunchi in Carrara (bbox):', dunchi);
  }
}
check();
