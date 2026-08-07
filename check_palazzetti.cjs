require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const {data, error} = await supabase.from('shared_pois').select('id, name, category').ilike('name', '%palazzetti%');
  console.log(data || error);
  
  if (data && data.length > 0) {
    const ids = data.map(d => d.id);
    const {error: delErr} = await supabase.from('shared_pois').delete().in('id', ids);
    if(delErr) console.log(delErr);
    else console.log('Deleted palazzetti');
  }
}
run();
