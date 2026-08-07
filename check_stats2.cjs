const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://qfxxhzkkrkvbuekfknhh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y');
async function run() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = today.toISOString();
  
  const { data: added, error: e1 } = await supabase.from('shared_pois').select('*').gte('created_at', todayStr);
  
  // Controlliamo quanti POI totali con description_ai != null
  const { data: allEnriched, error: e2 } = await supabase.from('shared_pois').select('id, name').not('description_ai', 'is', null);
  
  // Controlliamo quanti hanno description_ai e sono stati aggiunti oggi
  const { data: enrichedToday, error: e3 } = await supabase.from('shared_pois').select('id, name, created_at, description_ai').gte('created_at', todayStr).not('description_ai', 'is', null);
  
  // Controllo quanti itinerari oggi?
  const { data: itins, error: e4 } = await supabase.from('user_itineraries').select('id').gte('created_at', todayStr);

  console.log('--- DETTAGLIO STATISTICHE ---');
  console.log('POI Totali Aggiunti o SalvatiOggi:', added ? added.length : 0);
  console.log('POI Totali con descrizione AI in tutto il DB:', allEnriched ? allEnriched.length : 0);
  console.log('POI Aggiunti o Salvati OGGI e che hanno descrizione AI:', enrichedToday ? enrichedToday.length : 0);
  console.log('Nuovi Itinerari Creati Oggi:', itins ? itins.length : 0);
  
  // Analizziamo i salvati oggi e vediamo che tipo di POI sono
  const { data: saved_pois } = await supabase.from('saved_pois').select('*').gte('created_at', todayStr);
  console.log('POI Totali nei Preferiti (Salvati) oggi:', saved_pois ? saved_pois.length : 0);
}
run().catch(console.error);
