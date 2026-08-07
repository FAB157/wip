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

// Dizionario di normalizzazione: Mappa i valori vecchi/sbagliati al valore ufficiale in inglese
const NORMALIZZAZIONE = {
  'museo': 'museum',
  'musei': 'museum',
  'monumento': 'monument',
  'monumenti': 'monument',
  'chiese': 'church',
  'chiesa': 'church',
  'area archeologica': 'archaeological_site',
  'area faunistica': 'attraction', // Corregge gli errori di Llama 3 visti in passato
  'panorami': 'viewpoint',
  'paesaggio': 'viewpoint', // Il paesaggio è assimilabile a un belvedere/panorama
  'locali': 'restaurant',
  'utilita': 'utilita' // Lasciamo utilita così, è già gestito bene dall'app
};

async function normalizeCategories() {
  console.log("🛠️ Avvio NORMALIZZAZIONE di massa delle categorie...");

  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 5000;

  // 1. Scarichiamo solo ID e Category per velocizzare al massimo
  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, category')
      .order('id')
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

  console.log(`✅ Letti ${pois.length} POI dal database. Inizio ricerca anomalie...`);
  
  // 2. Prepariamo gli aggiornamenti (batch)
  let updatedCount = 0;

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    if (!poi.category) continue;

    const catAttuale = poi.category.trim().toLowerCase();
    const catCorretta = NORMALIZZAZIONE[catAttuale];

    // Se esiste una traduzione ufficiale per questa categoria
    if (catCorretta && catCorretta !== catAttuale) {
      
      const { error } = await supabase
        .from('shared_pois')
        .update({ category: catCorretta })
        .eq('id', poi.id);

      if (!error) {
        updatedCount++;
        // Logghiamo solo ogni tanto per non intasare il terminale
        if (updatedCount % 500 === 0) {
          console.log(`✅ Normalizzati ${updatedCount} luoghi finora... (es. ${poi.name} da [${catAttuale}] a [${catCorretta}])`);
        }
      } else {
        console.error(`❌ Errore su ${poi.id}:`, error.message);
      }
    }
  }

  console.log(`\n🎉 Finito! Sono stati normalizzati e uniformati esattamente ${updatedCount} POI in tutto il database.`);
}

normalizeCategories();
