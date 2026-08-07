const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs'
);

(async () => {
  // Conteggio totale
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Errore:', error.message);
    return;
  }

  console.log('=============================');
  console.log(`  TOTALE POI IMPORTATI: ${count}`);
  console.log('=============================');

  // Conteggio per categoria
  const { data: cats, error: e2 } = await supabase
    .from('shared_pois')
    .select('category');

  if (e2) { console.error(e2.message); return; }

  const grouped = {};
  cats.forEach(r => {
    const c = r.category || 'senza_categoria';
    grouped[c] = (grouped[c] || 0) + 1;
  });

  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  console.log('\nPer categoria:');
  sorted.forEach(([cat, n]) => {
    console.log(`  ${cat.padEnd(25)} ${n}`);
  });

  // Conteggio per status
  const { data: statuses, error: e3 } = await supabase
    .from('shared_pois')
    .select('status');

  if (!e3) {
    const gs = {};
    statuses.forEach(r => {
      const s = r.status || 'null';
      gs[s] = (gs[s] || 0) + 1;
    });
    console.log('\nPer status:');
    Object.entries(gs).sort((a,b) => b[1]-a[1]).forEach(([s, n]) => {
      console.log(`  ${s.padEnd(25)} ${n}`);
    });
  }
})();
