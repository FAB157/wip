const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCacheUpsert() {
  console.log('Testing direct cache upsert simulation for a POI with "ristorante" subCategory using Supabase client...');
  
  const payload = {
    poi_id: 'test-node-99999_it',
    guide_mode: 'dante',
    name: 'Ristorante Test Curation',
    category: 'locali',
    sub_category: 'ristorante',
    description: 'Un eccellente ristorante di test curato con successo.',
    wiki_extract: 'Wikipedia extract test.',
    wiki_data: JSON.stringify({ extract: 'Wikipedia extract test.' }),
    trip_data: JSON.stringify({ address: 'Via Roma 1, Carrara' }),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('shared_poi_audio_cache')
      .upsert(payload, { onConflict: 'poi_id,guide_mode' });
      
    if (error) {
      console.error('❌ Direct database upsert simulation FAILED:', error.message);
      return;
    }
    
    console.log('✅ Direct database upsert simulation via Supabase client SUCCEEDED!');
    
    // Clean up
    console.log('Cleaning up test record...');
    const { error: delErr } = await supabase
      .from('shared_poi_audio_cache')
      .delete()
      .eq('poi_id', 'test-node-99999_it');
      
    if (delErr) {
      console.error('❌ Clean up FAILED:', delErr.message);
      return;
    }
    console.log('✅ Clean up completed successfully!');
  } catch (err) {
    console.error('❌ Exception occurred:', err.message);
  }
}

testCacheUpsert();
