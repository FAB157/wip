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

// Regole per le utilità (spazzatura turistica)
const UTILITY_RULES = [
  // Supermercati e Negozi
  { 
    keywords: ['conad', 'coop ', 'esselunga', 'carrefour', 'despar', 'pam ', 'lidl', 'supermercato', 'minimarket', 'macelleria', 'panetteria', 'abbigliamento', 'parrucchiere', 'centro commerciale', 'tabacchi', 'tabaccheria', 'farmacia'], 
    category: 'utilita' 
  },
  // Uffici e Servizi
  { 
    keywords: ['banca ', 'intesa ', 'unicredit', 'monte dei paschi', 'credem', 'poste italiane', 'ufficio postale', 'agenzia ', 'assicurazione', 'scuola', 'istituto', 'liceo', 'università', 'municipio', 'comune di '], 
    category: 'utilita' 
  },
  // Auto e Trasporti
  { 
    keywords: ['parcheggio', 'garage', 'autorimessa', 'stazione di servizio', 'eni ', 'q8 ', 'ip ', 'esso ', 'distributore', 'fermata ', 'autostazione'], 
    category: 'utilita' 
  },
  // Sanità
  { 
    keywords: ['ospedale', 'clinica', 'poliambulatorio', 'dentista', 'pronto soccorso', 'croce rossa', 'croce verde', 'croce bianca', 'misericordia'], 
    category: 'utilita' 
  }
];

// Categorie "culturali/principali" in cui NON dovrebbero stare
const CULTURAL_CATEGORIES = [
  'gemme', 'castle', 'museum', 'church', 'archaeological_site', 
  'viewpoint', 'monument', 'attraction', 'ruins', 'artwork', 'monumenti', 'musei', 'chiese'
];

async function fixUtilita() {
  console.log("🛠️ Avvio pulizia di massa: Rimuovo Negozi, Banche e Ospedali dai monumenti...");

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

    // Controlliamo se è attualmente in una categoria culturale "sbagliata" (oppure se ha il bollino gemma per sbaglio)
    if (!CULTURAL_CATEGORIES.includes(poi.category) && poi.is_gem !== true) {
      continue;
    }

    const lowerName = poi.name.toLowerCase();
    let newCategory = null;

    // Applica le regole delle utilità
    for (const rule of UTILITY_RULES) {
      if (rule.keywords.some(kw => lowerName.includes(kw))) {
        newCategory = rule.category;
        break;
      }
    }

    if (newCategory) {
      console.log(`🧹 Cestino Falso Positivo "${poi.name}": [${poi.category}] -> [${newCategory}]`);
      
      const payload = { 
        category: newCategory,
        is_gem: false // Togliamo assolutamente il bollino di gemma a un ospedale o una banca!
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

  console.log(`\n🎉 Finito! Sono stati rimossi ${updatedCount} luoghi spazzatura dalle mappe turistiche!`);
}

fixUtilita();
