const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://qfxxhzkkrkvbuekfknhh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = today.toISOString();
  
  const { data: added, error: e1 } = await supabase.from('shared_pois').select('id, name, created_at').gte('created_at', todayStr);
  const { data: enriched, error: e2 } = await supabase.from('shared_pois').select('id, name, last_reviewed_at').gte('last_reviewed_at', todayStr).not('description_ai', 'is', null);
  
  console.log('--- STATISTICHE DI OGGI ---');
  console.log('Aggiunti oggi:', added ? added.length : 0, e1 ? e1.message : '');
  console.log('Arricchiti oggi:', enriched ? enriched.length : 0, e2 ? e2.message : '');
}
run().catch(console.error);
