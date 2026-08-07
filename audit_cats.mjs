import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Credenziali Supabase mancanti nel file .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("🛠️ Avvio Audit delle Categorie...");

  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('category, name')
      .range(from, from + step - 1);

    if (error) {
      console.error("❌ Errore lettura POI:", error);
      return;
    }

    if (data && data.length > 0) {
      pois = pois.concat(data);
      from += step;
    } else {
      hasMore = false;
    }
  }

  const stats = {};

  pois.forEach(poi => {
    let cat = poi.category || 'SENZA_CATEGORIA';
    
    // Escludi gemme e monumenti come richiesto
    if (cat.toLowerCase() === 'gemme' || cat.toLowerCase() === 'monumenti' || cat.toLowerCase() === 'monument') return;

    if (!stats[cat]) stats[cat] = { total: 0, examples: [] };
    stats[cat].total++;

    if (stats[cat].examples.length < 15) {
        stats[cat].examples.push(poi.name);
    }
  });

  console.log("✅ RISULTATI AUDIT CATEGORIE:\n");
  
  for (const [cat, data] of Object.entries(stats).sort((a,b) => b[1].total - a[1].total)) {
    console.log(`\n===========================================`);
    console.log(`📌 CATEGORIA: ${cat.toUpperCase()} (Totale: ${data.total})`);
    console.log(`===========================================`);
    console.log(`Esempi in questa categoria:`);
    data.examples.forEach(ex => console.log(`  * ${ex}`));
  }
}

runAudit();
