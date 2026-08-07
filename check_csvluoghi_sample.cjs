require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, category, city, country, source, technical_data, created_at')
    .like('id', 'csv-luoghi-%')
    .limit(10);
  if (error) { console.error(error.message); return; }
  data.forEach(p => {
    console.log(`\n[${p.id}]`);
    console.log(`  Nome     : ${p.name}`);
    console.log(`  Cat      : ${p.category}`);
    console.log(`  Città    : ${p.city || '—'}`);
    console.log(`  Paese    : ${p.country || '—'}`);
    console.log(`  Source   : ${p.source || '—'}`);
    console.log(`  Created  : ${p.created_at}`);
    console.log(`  Tech data: ${JSON.stringify(p.technical_data).substring(0, 200)}`);
  });
}
run().catch(console.error);
