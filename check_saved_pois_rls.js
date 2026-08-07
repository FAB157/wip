async function testInsert() {
  const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

  try {
    const res = await fetch(`${supabaseUrl}/saved_pois`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        poi_id: 'test-poi-999',
        data: { name: 'Test Fallback POI' },
        created_at: new Date().toISOString()
      })
    });
    console.log('Insert Status:', res.status);
    const text = await res.text();
    console.log('Insert Response:', text);
  } catch(e) {
    console.error(e);
  }
}
testInsert();
