const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const tables = [
    'user_profiles',
    'global_quotas',
    'shared_pois',
    'shared_poi_audio_cache',
    'api_usage_logs',
    'pending_edits',
    'user_quotas',
    'api_cache',
    'saved_pois',
    'shared_itinerary_cache',
    'poi_interactions'
  ];

  for (const table of tables) {
    try {
      const { data, count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`❌ Table "${table}": Error - ${error.message} (${error.code})`);
      } else {
        console.log(`✅ Table "${table}": EXISTS, count = ${count}`);
      }
    } catch (e) {
      console.log(`❌ Table "${table}": Exception - ${e.message}`);
    }
  }
}

test();
