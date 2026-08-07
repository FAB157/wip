require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: userItin, error: e1 } = await s.from('user_itineraries').select('id').limit(1);
  const itinId = userItin?.[0]?.id || 'test';
  
  const { data: poi, error: e2 } = await s.from('shared_pois').select('id').limit(1);
  const poiId = poi?.[0]?.id || 'test';

  const r = await s.from('poi_itinerari').insert({poi_id: poiId, itinerary_id: itinId});
  console.log('Result:', r.error ? r.error : 'Success!');
}

test();
