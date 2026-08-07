import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Starting deletion of pharmacies and herbalist shops...");

  // Query shared_pois
  const { data: pois, error } = await supabase
    .from('shared_pois')
    .select('id, name')
    .or('name.ilike.%farmacia%,name.ilike.%farmacie%,name.ilike.%erboristeria%,name.ilike.%erboristerie%');

  if (error) {
    console.error("Error fetching POIs:", error);
    process.exit(1);
  }

  if (!pois || pois.length === 0) {
    console.log("No pharmacies or herbalist shops found in shared_pois.");
    return;
  }

  console.log(`Found ${pois.length} POIs to delete.`);
  // Log a few for verification
  pois.slice(0, 5).forEach(p => console.log(` - ${p.name} (${p.id})`));

  const poiIds = pois.map(p => p.id);

  // Since shared_poi_audio_cache doesn't have ON DELETE CASCADE, we must delete from it first
  // However, wait, let's delete in batches if there are many.
  console.log(`Deleting ${poiIds.length} entries from shared_poi_audio_cache...`);
  const { error: cacheError } = await supabase
    .from('shared_poi_audio_cache')
    .delete()
    .in('poi_id', poiIds);
    
  if (cacheError) {
    console.error("Error deleting from cache:", cacheError);
  } else {
    console.log("Cache entries deleted.");
  }

  // Delete from shared_pois
  console.log(`Deleting ${poiIds.length} entries from shared_pois...`);
  const { error: deleteError } = await supabase
    .from('shared_pois')
    .delete()
    .in('id', poiIds);

  if (deleteError) {
    console.error("Error deleting POIs:", deleteError);
  } else {
    console.log("POIs successfully deleted!");
  }
}

main();
