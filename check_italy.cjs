const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CULTURAL_CATEGORIES = [
  'gemme',
  'monumenti',
  'musei',
  'panorami',
  'siti archeologici',
  'chiese',
  'storico',
  'castelli',
  'palazzi',
  'piazze',
  'ponti',
  'ville',
  'torri'
];

async function main() {
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .is('enriched_at', null)
    .in('category', CULTURAL_CATEGORIES)
    .gte('lat', 36.6)
    .lte('lat', 47.1)
    .gte('lon', 6.6)
    .lte('lon', 18.5);
    
  if (error) console.error(error);
  console.log(`Luoghi culturali NON arricchiti in Italia: ${count}`);
}
main();
