const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://qfxxhzkkrkvbuekfknhh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs');

async function search() {
  console.log('Searching in vision_cards...');
  const { data: vCards, error: vError } = await supabase
    .from('vision_cards')
    .select('*')
    .ilike('nome', '%Maria Beatrice%');

  if (vError) console.error('vision_cards error:', vError);
  else if (vCards && vCards.length > 0) {
    console.log('Found in vision_cards:');
    console.log(JSON.stringify(vCards, null, 2));
  } else {
    console.log('Not found in vision_cards.');
  }

  console.log('Searching in shared_pois...');
  const { data: pois, error: pError } = await supabase
    .from('shared_pois')
    .select('*')
    .ilike('name', '%Maria Beatrice%');

  if (pError) console.error('shared_pois error:', pError);
  else if (pois && pois.length > 0) {
    console.log('Found in shared_pois:');
    console.log(JSON.stringify(pois, null, 2));
  } else {
    console.log('Not found in shared_pois.');
  }
}
search();
