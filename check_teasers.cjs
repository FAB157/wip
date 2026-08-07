const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Try to find env vars in .env or .env.local
let envContent = '';
try { envContent = fs.readFileSync('.env.local', 'utf8'); } catch(e) {
  try { envContent = fs.readFileSync('.env', 'utf8'); } catch(e) {}
}

const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch ? urlMatch[1].trim() : null;
const key = keyMatch ? keyMatch[1].trim() : null;

if (!url || !key) {
  console.error("Supabase URL or Key not found in .env files");
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkTeasers() {
  console.log("Checking POIs for teaser_text_it content...");

  // We check shared_pois or punti_interesse table
  // Based on SupabaseClient.kt, it uses a RPC 'nearby_pois' which likely queries one of these

  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, teaser_text_it')
    .not('teaser_text_it', 'is', null)
    .limit(10);

  if (error) {
    console.error("Error fetching from shared_pois:", error);
  } else {
    console.log(`Found ${data.length} POIs with teaser_text_it in shared_pois:`);
    data.forEach(p => console.log(`- ${p.name} (${p.id}): ${p.teaser_text_it}`));
  }

  const { data: data2, error: error2 } = await supabase
    .from('punti_interesse')
    .select('id, nome, teaser_text_it')
    .not('teaser_text_it', 'is', null)
    .limit(10);

  if (error2) {
    console.error("Error fetching from punti_interesse:", error2);
  } else {
    console.log(`Found ${data2.length} POIs with teaser_text_it in punti_interesse:`);
    data2.forEach(p => console.log(`- ${p.nome} (${p.id}): ${p.teaser_text_it}`));
  }
}

checkTeasers();
