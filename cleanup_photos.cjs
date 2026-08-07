const { createClient } = require('@supabase/supabase-js');

// Configurazione Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('Inizio pulizia foto Unsplash di OGGI...');
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Inizio di oggi
  const todayISO = today.toISOString();

  // Cerchiamo le foto aggiornate oggi (o create) che contengono 'unsplash'
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, image_url, photo_url, created_at')
    .gte('created_at', todayISO)
    .or('image_url.ilike.%unsplash%,photo_url.ilike.%unsplash%');

  if (error) {
    console.error('Errore query:', error);
    return;
  }

  console.log(`Trovati ${data.length} POI con foto da Unsplash aggiornati oggi da ripulire.`);

  let count = 0;
  for (const poi of data) {
    console.log(`Ripulendo POI: ${poi.name} (ID: ${poi.id}, Creato il: ${poi.created_at})`);
    const { error: updateErr } = await supabase
      .from('shared_pois')
      .update({
        image_url: '',
        photo_url: ''
      })
      .eq('id', poi.id);
      
    if (updateErr) {
      console.error(`Errore aggiornamento POI ${poi.id}:`, updateErr);
    } else {
      count++;
    }
  }

  console.log(`Pulizia completata! ${count} POI azzerati con successo.`);
}

run();
