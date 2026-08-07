const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function count() {
  const { count: draftCount, error: err1 } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');

  const { count: verifiedCount, error: err2 } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'verified');

  const { count: nullDescCount, error: err3 } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .is('description_ai', null);

  console.log(`📊 Current DB Stats:`);
  console.log(`- Draft POIs: ${draftCount}`);
  console.log(`- Verified POIs: ${verifiedCount}`);
  console.log(`- POIs with NULL description_ai: ${nullDescCount}`);
}
count();
