import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const query = () => sb.from('shared_pois').select('id, name, category, city')
    .gte('lat', 44.01).lte('lat', 44.15).gte('lon', 9.95).lte('lon', 10.20);
    
  let { data: cimitero } = await query().ilike('name', '%cimitero%');
  console.log('Cimiteri a Massa-Carrara:', cimitero);
  
  let { data: marina } = await query().ilike('name', '%marina di carrara%');
  console.log('Marina di Carrara:', marina);

  let { data: avenza } = await query().ilike('name', '%avenza%');
  console.log('Avenza:', avenza);
}
run();
