require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkIt() {
  const res = await supabase.from('shared_pois').select('*', { count: 'exact', head: true })
    .not('enriched_at', 'is', null)
    .eq('country', 'Italy');
  console.log('Arricchiti in Italia (country=Italy):', res.count);

  const res2 = await supabase.from('shared_pois').select('*', { count: 'exact', head: true })
    .not('enriched_at', 'is', null);
  console.log('Totale Arricchiti Globale:', res2.count);
}
checkIt();
