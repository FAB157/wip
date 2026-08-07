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

async function runCleanup() {
  console.log("🛠️ Avvio pulizia database dalle Frazioni e Comuni...");

  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, description_ai, description_short')
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

  console.log(`✅ Trovati ${pois.length} POI totali nel database. Inizio analisi...`);
  
  const idsToDelete = [];

  for (const poi of pois) {
    const titleLower = (poi.name || "").toLowerCase();
    const descLower = `${poi.description_ai || ''} ${poi.description_short || ''}`.toLowerCase();

    const isAdministrative = 
      titleLower.includes("frazione") || titleLower.includes("comune di") || titleLower.includes("stazione di") ||
      titleLower.startsWith("stazione ") ||
      descLower.includes("frazione") || descLower.includes("comune") || descLower.includes("quartiere") || 
      descLower.includes("località") || descLower.includes("centro abitato") || descLower.includes("villaggio") ||
      descLower.includes("fiume") || descLower.includes("torrente");

    // Escludi falsi positivi: "statua", "monumento", "chiesa", ecc. non vanno mai cancellati anche se menzionano il comune
    const isSafe = titleLower.includes("statua") || titleLower.includes("monumento") || titleLower.includes("chiesa") || titleLower.includes("museo") || titleLower.includes("castello") || titleLower.includes("palazzo");

    if (isAdministrative && !isSafe) {
        console.log(`🗑️ DA CANCELLARE: ${poi.name}`);
        idsToDelete.push(poi.id);
    }
  }

  console.log(`\n🚨 Trovati ${idsToDelete.length} POI classificati come 'frazioni' o 'comuni'.`);
  
  if (idsToDelete.length === 0) {
      console.log("Niente da pulire!");
      return;
  }

  console.log("Inizio la cancellazione dal database...");
  let deletedCount = 0;
  
  // Cancellazione a batch
  for (let i = 0; i < idsToDelete.length; i += 100) {
      const chunk = idsToDelete.slice(i, i + 100);
      const { error } = await supabase
          .from('shared_pois')
          .delete()
          .in('id', chunk);

      if (error) {
          console.error("❌ Errore durante la cancellazione:", error);
      } else {
          deletedCount += chunk.length;
          console.log(`Cancellati ${deletedCount}/${idsToDelete.length}...`);
      }
  }

  console.log("✅ PULIZIA COMPLETATA CON SUCCESSO!");
}

runCleanup();
