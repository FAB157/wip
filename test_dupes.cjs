require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  console.log("Ricerca dei duplicati per nome (escludendo nomi molto generici)...");
  
  // Non possiamo raggruppare milioni di record facilmente in JS lato client.
  // Cerchiamo di usare la rpc Supabase o fare una query in blocchi, ma più facile
  // chiamare Supabase e cercare i doppioni.
  // Poiché non abbiamo l'accesso SQL diretto se non tramite rpc, facciamo un piccolo test 
  // sui nomi ripetuti più frequentemente che hanno arricchimento.
  
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, description_long, description_ai, is_gem, source, lat, lon')
    .not('description_long', 'is', null) // Troviamo quelli arricchiti
    .limit(100);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  // Controlliamo se per questi nomi arricchiti esistono doppioni NON arricchiti
  let duplicateCount = 0;
  for (const poi of data) {
    if (!poi.name || poi.name === "Punto di Utilità" || poi.name === "Locale" || poi.name.length < 4) continue;
    
    // Cerca POI con lo stesso nome ma SENZA descrizione, nel raggio di "lat,lon" simili? 
    // Oppure stesso identico nome
    const { data: dupes } = await supabase
      .from('shared_pois')
      .select('id, name, description_long, source')
      .eq('name', poi.name)
      .is('description_long', null)
      .is('description_ai', null);
      
    if (dupes && dupes.length > 0) {
      console.log(`Trovato duplicato per "${poi.name}": ${dupes.length} senza descrizione (es. id: ${dupes[0].id}) vs 1 con descrizione (id: ${poi.id})`);
      duplicateCount += dupes.length;
    }
  }
  
  console.log(`\nTest completato su 100 POI arricchiti. Trovati ${duplicateCount} potenziali duplicati vuoti da rimuovere.`);
}
checkDuplicates();
