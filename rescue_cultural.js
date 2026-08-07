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

// Regole fisse di salvataggio (se il nome contiene la parola chiave, FORZA questa categoria)
const RESCUE_RULES = [
  { keywords: ['chiesa', 'duomo', 'basilica', 'cattedrale', 'santuario', 'cappella', 'pieve', 'monastero', 'abbazia', 'convento'], category: 'church' },
  { keywords: ['museo', 'pinacoteca', 'galleria'], category: 'museum' },
  { keywords: ['castello', 'forte', 'fortezza', 'rocca', 'torre'], category: 'castle' },
  { keywords: ['scavi', 'necropoli', 'rovine', 'sito archeologico', 'parco archeologico', 'area archeologica', 'anfiteatro'], category: 'archaeological_site' },
  { keywords: ['monumento', 'caduti', 'partigian', 'statua', 'obelisco', 'memoriale', 'busto'], category: 'monument' }
];

async function rescueCultural() {
  console.log("🛠️ Avvio salvataggio: Recupero chiese e musei finiti nelle utilità...");

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
    
    // Ignoriamo i ristoranti che per caso si chiamano "Osteria della Chiesa"
    const isLocali = lowerName.includes('ristorante') || lowerName.includes('pizzeria') || 
                     lowerName.includes('bar ') || lowerName.includes('osteria') ||
                     lowerName.includes('hotel ') || lowerName.includes('albergo');
    if (isLocali) continue;

    let newCategory = null;

    for (const rule of RESCUE_RULES) {
      if (rule.keywords.some(kw => lowerName.includes(kw))) {
        newCategory = rule.category;
        break; // Trovata la categoria, esce
      }
    }

    // Se c'è una categoria di salvataggio ed è DIVERSA da quella attuale
    if (newCategory && newCategory !== poi.category) {
      console.log(`🛟 Salvo "${poi.name}": [${poi.category || 'sconosciuta'}] -> [${newCategory}]`);
      
      let payload = { category: newCategory };
      
      // Preserviamo sempre il bollino se era una gemma (anche se aveva "gemme" come testo)
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

  console.log(`\n🎉 Finito! Sono stati recuperati con successo ${updatedCount} monumenti/chiese/musei che erano finiti nelle categorie sbagliate!`);
}

rescueCultural();
