const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, city, category, enriched_at')
    .not('enriched_at', 'is', null)
    .order('enriched_at', { ascending: false })
    .limit(5);
  
  if (error) console.error(error);
  console.log('Ultimi arricchiti:');
  console.log(JSON.stringify(data, null, 2));
}
main();
