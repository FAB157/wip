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

// Regole fisse e sicure (se il nome contiene la parola chiave, assegna la categoria)
const SAFE_RULES = [
  { keywords: ['castello', 'forte', 'fortezza', 'rocca', 'torre'], category: 'castle' },
  { keywords: ['museo', 'pinacoteca', 'galleria'], category: 'museum' },
  { keywords: ['chiesa', 'duomo', 'basilica', 'cattedrale', 'santuario', 'cappella', 'pieve', 'monastero', 'abbazia', 'convento'], category: 'church' },
  { keywords: ['scavi', 'necropoli', 'rovine', 'sito archeologico', 'parco archeologico', 'area archeologica', 'anfiteatro'], category: 'archaeological_site' },
  { keywords: ['panorama', 'belvedere', 'terrazza', 'punto panoramico', 'balcone'], category: 'viewpoint' },
  { keywords: ['monumento', 'statua', 'obelisco', 'memoriale'], category: 'monument' },
  { keywords: ['parco', 'villa ', 'piazza', 'teatro', 'palazzo', 'riserva naturale', 'oasi'], category: 'attraction' }
];

async function runStaticCategorization() {
  console.log("🛠️ Avvio sistema di correzione STATICO e SICURO...");

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

  console.log(`✅ Trovati ${pois.length} POI da analizzare in modo sicuro.`);
  let updatedCount = 0;

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    if (!poi.name) continue;

    const lowerName = poi.name.toLowerCase();

    // Ignoriamo a prescindere i ristoranti e alberghi
    const isLocali = lowerName.includes('ristorante') || lowerName.includes('pizzeria') || 
                     lowerName.includes('bar ') || lowerName.includes('hotel ') || 
                     lowerName.includes('albergo');
    if (isLocali) continue;

    let newCategory = null;

    // Applica le regole fisse in ordine
    for (const rule of SAFE_RULES) {
      if (rule.keywords.some(kw => lowerName.includes(kw))) {
        newCategory = rule.category;
        break; // Trovata la categoria, esci dal ciclo delle regole
      }
    }

    // Se abbiamo trovato una categoria nuova ed è diversa da quella vecchia
    if (newCategory && newCategory !== poi.category) {
      console.log(`🔄 Correggo "${poi.name}": [${poi.category || 'nessuna'}] -> [${newCategory}] (Gem status preserved se applicabile)`);
      
      let payload = { category: newCategory };
      
      // Se il luogo aveva come categoria testuale "gemme", ci assicuriamo che non perda lo status
      // salvandolo nel campo booleano 'is_gem' dedicato
      if (poi.category === 'gemme') {
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

  console.log(`\n🎉 Finito! Sono stati corretti in modo sicuro ${updatedCount} POI! (Niente più allucinazioni AI)`);
}

runStaticCategorization();
