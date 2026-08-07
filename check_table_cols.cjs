const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  console.log('Querying shared_poi_audio_cache table rows...');
  try {
    const { data, error } = await supabase
      .from('shared_poi_audio_cache')
      .select('*')
      .limit(5);

    if (error) {
      console.error('❌ Table select failed:', error.message, error.code);
    } else {
      console.log('✅ Select succeeded! Count of rows:', data.length);
      if (data.length > 0) {
        console.log('Sample row:', data[0]);
      }
    }
  } catch (err) {
    console.error('❌ Selective query exception:', err.message);
  }
}

testQuery();
