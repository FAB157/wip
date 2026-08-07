import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
  console.log("--- CONTROLLO PAESI (CITTA') IN SHARED_POIS ---");
  const { data: pois, error: poiError } = await supabase
    .from('shared_pois')
    .select('city');
    
  if (poiError) {
     console.error("Errore lettura shared_pois:", poiError);
  } else {
     const uniqueCities = new Set(pois.map(p => p.city).filter(Boolean));
     console.log(`Numero di città/paesi uniche nei POI: ${uniqueCities.size}`);
     console.log("Città:", Array.from(uniqueCities).sort().join(", "));
  }

  console.log("\n--- CONTROLLO ITINERARI PIETRASANTA ---");
  const { data: itins, error: itinsError } = await supabase
    .from('saved_itineraries')
    .select('*')
    .ilike('query_text', '%pietrasanta%')
    .order('created_at', { ascending: false });
    
  if (itinsError) {
      console.error("Errore itinerari:", itinsError);
  } else {
      if (itins && itins.length > 0) {
          console.log(`Trovati ${itins.length} itinerari per Pietrasanta.`);
          const recent = itins[0];
          console.log("Ultimo itinerario ID:", recent.id);
          console.log("Creato il:", recent.created_at);
          console.log("Prompt:", recent.query_text);
          console.log("Dettagli tappe salvate (JSON):", JSON.stringify(recent.itinerary_data, null, 2).substring(0, 1000) + "...\n(TRONCATO PER LEGGIBILITA')");
      } else {
          console.log("Nessun itinerario trovato per Pietrasanta.");
      }
  }
}

checkData();
