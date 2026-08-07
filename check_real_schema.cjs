const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSelectKeys() {
  console.log('Querying only primary keys to bypass missing column errors...');
  try {
    const { data, error } = await supabase
      .from('shared_poi_audio_cache')
      .select('poi_id, guide_mode')
      .limit(1);

    if (error) {
      console.error('❌ Selective query failed:', error.message);
    } else {
      console.log('✅ Selective query succeeded! Data:', data);
    }
  } catch (err) {
    console.error('❌ Selective query exception:', err.message);
  }
}

testSelectKeys();
