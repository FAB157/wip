import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function countItalyPois() {
  const BBOX = { minLat: 36.6, maxLat: 47.1, minLon: 6.6, maxLon: 18.5 };
  const CATS = ['monumenti', 'monument', 'musei', 'museum', 'chiese', 'church', 'castle', 'ruins', 'archaeological_site', 'artwork'];

  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .is('enriched_at', null)
    .or(`is_gem.eq.true,category.in.(${CATS.join(',')})`)
    .gte('lat', BBOX.minLat).lte('lat', BBOX.maxLat)
    .gte('lon', BBOX.minLon).lte('lon', BBOX.maxLon);

  if (error) console.error(error);
  console.log("Totale POI da arricchire in Italia:", count);
}

countItalyPois();
