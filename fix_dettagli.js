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

// Regole fisse di salvataggio per i dettagli storici/artistici
const DETTAGLI_RULES = [
  // Arte e Opere
  { keywords: ['murales', 'affresco', 'street art', 'dipinto'], category: 'artwork' },
  // Fontane
  { keywords: ['fontana'], category: 'fountain' },
  // Porte Storiche e Archi (Monumenti)
  { keywords: ['porta ', 'arco di', 'torrione'], category: 'monument' },
  // Terme Storiche e Siti
  { keywords: ['terme romane', 'bagni romani', 'bagni antichi'], category: 'archaeological_site' }
];

async function fixDettagli() {
  console.log("🛠️ Avvio pulizia: Recupero Dettagli (Fontane, Murales, Archi e Porte)...");

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

  console.log(`✅ Trovati ${pois.length} POI totali. Inizio filtraggio su tutto il database...`);
  let updatedCount = 0;

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    if (!poi.name) continue;

    const lowerName = poi.name.toLowerCase();
    
    // Ignoriamo i ristoranti che per caso si chiamano "Osteria della Fontana"
    const isLocali = lowerName.includes('ristorante') || lowerName.includes('pizzeria') || 
                     lowerName.includes('bar ') || lowerName.includes('osteria') ||
                     lowerName.includes('hotel ') || lowerName.includes('albergo');
    if (isLocali) continue;

    let newCategory = null;

    for (const rule of DETTAGLI_RULES) {
      if (rule.keywords.some(kw => lowerName.includes(kw))) {
        newCategory = rule.category;
        break; // Trovata la categoria
      }
    }

    // Se c'è una categoria specifica da applicare e il POI non ce l'ha già
    if (newCategory && newCategory !== poi.category) {
      console.log(`🎨 Classifico "${poi.name}": [${poi.category || 'sconosciuta'}] -> [${newCategory}]`);
      
      let payload = { category: newCategory };
      
      // Preserviamo sempre il bollino se era una gemma
      if (poi.category === 'gemme' || poi.is_gem === true) {
        payload.is_gem = true;
      }

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

  console.log(`\n🎉 Finito! Sono stati categorizzati con successo ${updatedCount} fontane, murales, porte storiche e archi!`);
}

fixDettagli();
