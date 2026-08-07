const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/rest/v1';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

async function check() {
  const tables = ['user_profiles', 'saved_pois', 'shared_pois', 'shared_poi_audio_cache', 'pending_edits', 'api_usage_logs', 'user_quotas', 'global_quotas', 'user_api_quotas'];
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
check();
