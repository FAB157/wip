async function testInsert() {
  const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

  try {
    const payload = {
      id: '44_9999_10_9999',
      lat: 44.9999,
      lon: 10.9999,
      name: 'Test Placement POI',
      category: 'monumenti',
      is_gem: false,
      description_ai: 'A test placeholder description.',
      image_url: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800',
      created_at: new Date().toISOString()
    };

    const res = await fetch(`${supabaseUrl}/shared_pois`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
  } catch(e) {
    console.error(e);
  }
}
testInsert();
