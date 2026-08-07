import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Inizio scansione cancellazione per località italiane e cimiteri...");
  let offset = 0;
  const limit = 1000;
  let deletedCount = 0;
  
  while (true) {
    const { data: pois, error } = await sb
      .from('shared_pois')
      .select('id, name, category, lat, lon')
      .range(offset, offset + limit - 1);

    if (error || !pois || pois.length === 0) break;

    const idsToDelete: string[] = [];
    
    for (const p of pois) {
      const name = p.name ? p.name.toLowerCase() : '';
      
      // 1. Cimiteri generici (Ovunque)
      if ((name.includes('cimitero') || name.includes('cemetery')) && !name.includes('monumental')) {
        idsToDelete.push(p.id);
        continue;
      }
      
      // 2. Località generiche (Solo Italia: Lat 36.6-47.1, Lon 6.6-18.5)
      const isItaly = p.lat >= 36.6 && p.lat <= 47.1 && p.lon >= 6.6 && p.lon <= 18.5;
      
      if (isItaly) {
        const isLocality = ['locality', 'village', 'town', 'city', 'hamlet', 'suburb'].includes(p.category);
        
        // Also catch specific ones the user complained about even if their category isn't one of the above
        // just in case they were tagged differently (e.g. Marina di Carrara was gemme).
        const badLocalities = [
          'marina di carrara', 'avenza', 'marina di massa', 'carrara', 'massa', 
          'montignoso', 'cinquale', 'poveromo', 'partaccia', 'fossola', 'codena', 
          'sorgnano', 'castelpoggio', 'gragnana', 'turigliano'
        ];
        
        if (isLocality || badLocalities.includes(name)) {
          idsToDelete.push(p.id);
        }
      }
    }
    
    if (idsToDelete.length > 0) {
      const { error: delErr } = await sb.from('shared_pois').delete().in('id', idsToDelete);
      if (delErr) {
        console.error("Errore cancellazione batch:", delErr);
      } else {
        deletedCount += idsToDelete.length;
        console.log(`Cancellati ${idsToDelete.length} POI... (Totale parziale: ${deletedCount})`);
      }
    }
    offset += limit;
  }
  
  console.log(`\n🎉 Finito! Totale POI generici/cimiteri eliminati: ${deletedCount}`);
}

run();
