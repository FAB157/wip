require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('category, country')
    .like('id', 'csv-luoghi-%');
  if (error) { console.error(error.message); return; }
  const byCat = {}, byCountry = {};
  for (const p of data) {
    byCat[p.category||'N/A'] = (byCat[p.category||'N/A']||0) + 1;
    byCountry[p.country||'N/A'] = (byCountry[p.country||'N/A']||0) + 1;
  }
  console.log(`\nTotale csv-luoghi: ${data.length}\n`);
  console.log('📂 Per categoria:');
  Object.entries(byCat).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
    console.log(`  ${k.padEnd(25)}: ${v} (${((v/data.length)*100).toFixed(1)}%)`)
  );
  console.log('\n🌍 Per paese:');
  Object.entries(byCountry).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
    console.log(`  ${k.padEnd(20)}: ${v}`)
  );
}
run().catch(console.error);
