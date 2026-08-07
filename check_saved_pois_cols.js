const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('saved_pois')
    .insert({ poi_id: 'test_temp_id_2', data: { name: 'temp' } })
    .select('*');
  if (error) {
    console.error('Error inserting:', error);
  } else {
    console.log('Columns of saved_pois:', Object.keys(data[0]));
    await supabase.from('saved_pois').delete().eq('poi_id', 'test_temp_id_2');
  }
}
check();
