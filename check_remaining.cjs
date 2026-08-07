const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CULTURAL_CATEGORIES = [
  'monumenti', 'monument', 
  'musei', 'museum', 'museo',
  'castle', 'castelli',
  'archaeological_site', 'siti_archeologici',
  'memorial',
  'artwork', 'statua', 'statue', 'scultura', 'sculture',
  'panorami', 'panorama', 'viewpoint',
  'cave_entrance', 'grotte',
  'nature_reserve',
  'chiese', 'church',
  'gemme'
];

async function main() {
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .is('enriched_at', null)
    .in('category', CULTURAL_CATEGORIES);
  
  if (error) console.error(error);
  console.log('Unenriched cultural POIs:', count);

  const { count: countAll } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .is('enriched_at', null);
    
  console.log('Unenriched ALL POIs (any category):', countAll);

  const { count: countEnrichedCult } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .not('enriched_at', 'is', null)
    .in('category', CULTURAL_CATEGORIES);
    
  console.log('Enriched cultural POIs:', countEnrichedCult);
}
main();
