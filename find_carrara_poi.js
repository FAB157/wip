import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Searching for Ferrovia Marmifera in shared_pois...");
  
  // Search by description or description_ai
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, category, description_ai, lat, lon')
    .ilike('description_ai', '%Ferrovia Marmifera%');
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Found ${data.length} matches:`);
  console.dir(data, { depth: null });
  
  // Check how many have empty or null names in Carrara (roughly lat 44.0, lon 10.0)
  const { data: noNameData, error: noNameError } = await supabase
    .from('shared_pois')
    .select('id, name, category, description_ai, lat, lon')
    .or('name.is.null,name.eq.')
    .gte('lat', 43.9)
    .lte('lat', 44.2)
    .gte('lon', 9.9)
    .lte('lon', 10.2);
    
  if (noNameError) {
    console.error("Error fetching no-names:", noNameError);
  } else {
    console.log(`\nFound ${noNameData.length} POIs with missing names around Carrara.`);
    if (noNameData.length > 0) {
      console.log("Examples:");
      console.dir(noNameData.slice(0, 5), { depth: null });
    }
  }
}

run();
