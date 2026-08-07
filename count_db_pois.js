import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const categoryCounts = {};
  let total = 0;
  let gems = 0;
  
  let offset = 0;
  const limit = 5000; // faster chunks
  let hasMore = true;
  
  console.log("Fetching all rows...");
  
  while (hasMore) {
    const { data: pois, error: poisErr } = await supabase
      .from('shared_pois')
      .select('category, is_gem')
      .range(offset, offset + limit - 1);
      
    if (poisErr) {
      if (poisErr.code === 'PGRST103') {
        break; // Reached end
      }
      console.error(poisErr);
      break;
    }
    
    if (!pois || pois.length === 0) {
      break;
    }
    
    for(const poi of pois) {
       total++;
       if (poi.is_gem) gems++;
       const cat = poi.category || 'null';
       
       if(!categoryCounts[cat]) categoryCounts[cat] = 0;
       categoryCounts[cat]++;
    }
    
    offset += limit;
  }
  
  console.log("\n=== POI COUNTS BY CATEGORY (ALL DB) ===");
  console.table(categoryCounts);
  
  console.log(`\nTotal POIs in DB: ${total}`);
  console.log(`Total Gems in DB: ${gems}`);
}
run();
