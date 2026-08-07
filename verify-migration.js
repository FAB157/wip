const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

async function verify() {
  console.log('Verifying Supabase Migration...');
  const tables = ['shared_pois', 'saved_pois', 'pending_edits', 'poi_interactions', 'revision_logs'];
  for (const table of tables) {
    const res = await fetch(`${supabaseUrl}/${table}?limit=1`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    console.log(`Table ${table} Status: ${res.status}`);
    if (res.status === 200) {
      const data = await res.json();
      console.log(`Table ${table} Columns:`, data.length > 0 ? Object.keys(data[0]) : 'empty but exists');
    } else {
      const text = await res.text();
      console.log(`Table ${table} Error: ${text}`);
    }
  }
}
verify();
