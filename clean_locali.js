import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Credenziali mancanti!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const LOCALI_RULES = [
  { keywords: ['sushi'], category: 'sushi' },
  { keywords: ['pesce', 'seafood', 'sea food', 'ittico'], category: 'pesce' },
  { keywords: ['carne', 'steak', 'steakhouse', 'braceria', 'griglieria'], category: 'carne' },
  { keywords: ['gluten free', 'senza glutine', 'celiaci'], category: 'glutenfree' },
  { keywords: ['vegetariano', 'vegano', 'bio', 'vegan'], category: 'vegetariano' },
  { keywords: ['pizza', 'pizzeria'], category: 'pizzeria' },
  { keywords: ['gelateria', 'gelato', 'gelaterie'], category: 'gelateria' },
  { keywords: ['bar ', 'caffe', 'caffè', 'caffetteria', 'pasticceria', 'cocktail', 'pub '], category: 'bar' },
  { keywords: ['ristorante', 'trattoria', 'osteria', 'locanda', 'taverna'], category: 'ristorante' },
];

async function cleanLocali() {
  console.log("Inizio pulizia Locali...");
  
  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, category')
      .range(from, from + step - 1);

    if (error) {
      console.error("Errore fetch:", error);
      return;
    }

    if (data && data.length > 0) {
      pois = pois.concat(data);
      from += step;
    } else {
      hasMore = false;
    }
  }

  console.log(`Trovati ${pois.length} POI in totale.`);
  let updatedCount = 0;

  for (const poi of pois) {
    if (!poi.name) continue;
    
    const lowerName = poi.name.toLowerCase();
    
    // Controlliamo se è un locale per natura del nome (o se era un locale)
    const isLocaleByName = LOCALI_RULES.some(rule => rule.keywords.some(kw => lowerName.includes(kw)));
    
    // Controlliamo se è un locale per la sua categoria attuale
    const currentIsLocale = ['restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'ice_cream', 'pizzeria', 'pesce', 'carne', 'vegetariano', 'sushi', 'gelateria', 'ristorante', 'locali'].includes(poi.category);

    if (isLocaleByName || currentIsLocale) {
      let newCategory = 'ristorante'; // default se è un locale ma non matchiamo nulla di specifico
      
      for (const rule of LOCALI_RULES) {
        if (rule.keywords.some(kw => lowerName.includes(kw))) {
          newCategory = rule.category;
          break;
        }
      }
      
      // Se era un pub/fast_food o roba specifica di OSM e non abbiamo sovrascritto, manteniamo se possibile, 
      // ma il fallback è 'ristorante' per uniformità con l'UI, oppure 'bar', 'pizzeria' ecc.
      if (!isLocaleByName && currentIsLocale && !['restaurant', 'locali'].includes(poi.category)) {
          // Mantieni la categoria corrente se è una di quelle buone
          if (['pizzeria', 'pesce', 'carne', 'vegetariano', 'sushi', 'gelateria', 'bar', 'ristorante', 'glutenfree', 'pub', 'fast_food', 'ice_cream', 'cafe'].includes(poi.category)) {
             newCategory = poi.category;
             if (newCategory === 'ice_cream') newCategory = 'gelateria';
             if (newCategory === 'cafe') newCategory = 'bar';
          }
      }

      if (newCategory !== poi.category) {
        console.log(`[Aggiorno] "${poi.name}": ${poi.category} -> ${newCategory}`);
        
        const { error } = await supabase
          .from('shared_pois')
          .update({ category: newCategory })
          .eq('id', poi.id);

        if (!error) {
          updatedCount++;
        }
      }
    }
  }

  console.log(`Finito! Aggiornati ${updatedCount} locali.`);
}

cleanLocali();
