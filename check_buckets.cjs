const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.storage.listBuckets();
  if(error) console.error(error);
  else console.log('Buckets:', data.map(b => b.name));
}
test();
