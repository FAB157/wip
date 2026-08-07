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

// Regole per i locali/hotel
const LOCALI_RULES = [
  { keywords: ['ristorante', 'osteria', 'trattoria', 'pizzeria', 'locanda', 'taverna'], category: 'restaurant' },
  { keywords: ['torrefazione', 'bar ', 'caffè', 'caffe', 'pub '], category: 'cafe' },
  { keywords: ['albergo', 'albero', 'hotel', 'b&b', 'bed and breakfast', 'resort', 'agriturismo', 'relais', 'pensione'], category: 'hotel' }
];

// Categorie "culturali/principali" in cui NON dovrebbero stare (es. "Ristorante Il Castello" finito per sbaglio in "castle")
const CULTURAL_CATEGORIES = [
  'gemme', 'castle', 'museum', 'church', 'archaeological_site', 
  'viewpoint', 'monument', 'attraction', 'ruins', 'artwork', 'monumenti', 'musei', 'chiese'
];

async function fixLocali() {
  console.log("🛠️ Avvio pulizia: Sposto i Ristoranti/Hotel fuori dalle categorie culturali...");

  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, category, is_gem')
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

  console.log(`✅ Trovati ${pois.length} POI totali. Inizio filtraggio...`);
  let updatedCount = 0;

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    if (!poi.name || !poi.category) continue;

    // Controlliamo se è attualmente in una categoria culturale "sbagliata" per un locale
    if (!CULTURAL_CATEGORIES.includes(poi.category) && poi.is_gem !== true) {
      continue;
    }

    const lowerName = poi.name.toLowerCase();
    let newCategory = null;

    // Applica le regole dei locali
    for (const rule of LOCALI_RULES) {
      if (rule.keywords.some(kw => lowerName.includes(kw))) {
        newCategory = rule.category;
        break;
      }
    }

    if (newCategory) {
      console.log(`🧹 Correggo Falso Positivo "${poi.name}": [${poi.category}] -> [${newCategory}]`);
      
      const payload = { 
        category: newCategory,
        is_gem: false // Rimuoviamo il bollino gemma se era stato dato per sbaglio a un ristorante
      };

      const { error } = await supabase
        .from('shared_pois')
        .update(payload)
        .eq('id', poi.id);

      if (!error) {
        updatedCount++;
      } else {
        console.error(`❌ Errore su ${poi.name}:`, error.message);
      }
    }
  }

  console.log(`\n🎉 Finito! Sono stati declassati e puliti ${updatedCount} ristoranti/hotel finiti per sbaglio tra i monumenti!`);
}

fixLocali();
