const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsertMinimal() {
  console.log('Inserting with only poi_id...');
  try {
    const { data, error } = await supabase
      .from('shared_poi_audio_cache')
      .insert({ poi_id: 'test_minimal_insert_id', guide_mode: 'dante', audio_base64: 'dGVzdA==' })
      .select('*');

    if (error) {
      console.error('❌ Insert failed:', error.message, error.code);
    } else {
      console.log('✅ Insert succeeded! Columns present in the returned row:');
      console.log(Object.keys(data[0]));
      // Cleanup
      await supabase.from('shared_poi_audio_cache').delete().eq('poi_id', 'test_minimal_insert_id');
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

testInsertMinimal();
