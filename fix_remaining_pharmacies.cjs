require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  let count = 0;
  while(true) {
    const {data} = await supabase.from('shared_pois').select('id').eq('category', 'pharmacy').limit(1000);
    if(!data || data.length === 0) break;
    const ids = data.map(d=>d.id);
    await supabase.from('shared_pois').update({category: 'utilita', is_gem: false}).in('id', ids);
    count += data.length;
    console.log('Updated', count);
  }
  console.log('Done fixing all remaining pharmacies!');
}
run();
