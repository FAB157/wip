require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function countIt() {
  const BBOX = { minLat: 36.6, maxLat: 47.1, minLon: 6.6, maxLon: 18.5 };
  let { count, error } = await supabase.from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .not('enriched_at', 'is', null)
    .gte('lat', BBOX.minLat).lte('lat', BBOX.maxLat)
    .gte('lon', BBOX.minLon).lte('lon', BBOX.maxLon);
  if(error) console.log(error);
  console.log('Arricchiti in Italia (BBOX):', count);
  
  let res2 = await supabase.from('shared_pois').select('*', { count: 'exact', head: true }).not('enriched_at', 'is', null);
  console.log('Totale Arricchiti Globale:', res2.count);
}
countIt();
