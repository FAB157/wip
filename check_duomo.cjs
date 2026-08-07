const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Variabili Supabase non trovate.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuomo() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, description_short, description_long, image_url, audio_script, is_gem')
    .ilike('name', '%duomo%pietrasanta%');
    
  if (error) {
    console.error("Errore:", error);
  } else {
    console.log("Risultati Trovati:", JSON.stringify(data, null, 2));
  }
}

checkDuomo();
