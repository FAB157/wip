import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const toDelete: any[] = [];
  let offset = 0;
  const limit = 1000;

  console.log("Searching for generic localities and cemeteries...");
  while (true) {
    const { data: pois, error } = await sb
      .from('shared_pois')
      .select('id, name, category, is_gem, city')
      .range(offset, offset + limit - 1);

    if (error || !pois || pois.length === 0) break;

    for (const p of pois) {
      const name = p.name.toLowerCase();
      
      // Cemeteries (not monumental)
      if (name.includes('cimitero') && !name.includes('monumentale')) {
        toDelete.push(p);
      }
      
      // Generic localities
      const badLocalities = [
        'marina di carrara', 'avenza', 'marina di massa', 'carrara', 'massa', 
        'montignoso', 'cinquale', 'poveromo', 'partaccia', 'fossola', 'codena', 
        'sorgnano', 'castelpoggio', 'gragnana', 'turigliano'
      ];
      
      if (badLocalities.includes(name)) {
        toDelete.push(p);
      }
    }
    offset += limit;
  }
  
  console.log(`Trovati ${toDelete.length} POI da cancellare.`);
  if (toDelete.length > 0) {
    console.log("Esempi da cancellare:", toDelete.slice(0, 20).map(x => `${x.name} (${x.category})`));
  }
}
run();
