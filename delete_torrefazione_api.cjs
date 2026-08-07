require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Cerco le torrefazioni tramite API...");
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name')
    .ilike('name', '%torrefazione%');

  if (error) {
    console.error('Errore ricerca:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("Nessuna torrefazione trovata.");
    return;
  }

  console.log(`Trovati ${data.length} POI (es: ${data[0].name}). Procedo con l'eliminazione...`);

  const ids = data.map(d => d.id);
  const { error: delError } = await supabase
    .from('shared_pois')
    .delete()
    .in('id', ids);

  if (delError) {
    console.error('Errore cancellazione:', delError);
  } else {
    console.log("Cancellazione completata con successo tramite API!");
  }
}
run();
