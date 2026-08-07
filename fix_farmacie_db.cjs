require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPharmacies() {
  console.log("Fetching pharmacies...");
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, category, is_gem')
    .ilike('name', '%farmacia%')
    .neq('category', 'utilita');

  if (error) {
    console.error("Error fetching:", error);
    return;
  }

  console.log(`Found ${data.length} pharmacies incorrectly categorized.`);
  
  for (const poi of data) {
    console.log(`Fixing: ${poi.name} (was ${poi.category})`);
    const { error: updErr } = await supabase
      .from('shared_pois')
      .update({
        category: 'utilita',
        is_gem: false
      })
      .eq('id', poi.id);
      
    if (updErr) console.error("Error updating", poi.id, updErr);
  }
  
  console.log("Done fixing DB.");
}

fixPharmacies();
