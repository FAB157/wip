require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Load environment variables manually
const fs = require('fs');
let envFile = '';
try {
  envFile = fs.readFileSync('.env', 'utf-8');
} catch(e) {
  console.error("Non trovo il file .env");
  process.exit(1);
}

const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.error("Manca VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY nel .env");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPois() {
  console.log("Cerco POI con status nullo...");
  
  // Trova tutti i POI con status null
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, verified, status')
    .is('status', null);

  if (error) {
    console.error("Errore lettura DB:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("Nessun POI con status null trovato. Il database è a posto!");
    return;
  }

  console.log(`Trovati ${data.length} POI da riparare...`);

  let count = 0;
  for (const poi of data) {
    // Se verified è true, lo status deve essere 'verified', altrimenti 'draft'
    const newStatus = poi.verified ? 'verified' : 'draft';
    
    const { error: updateError } = await supabase
      .from('shared_pois')
      .update({ status: newStatus })
      .eq('id', poi.id);

    if (updateError) {
      console.error(`Errore durante aggiornamento POI ${poi.id}:`, updateError.message);
    } else {
      count++;
    }
  }

  console.log(`Riparazione completata. ${count} POI aggiornati con successo.`);
}

fixPois();
