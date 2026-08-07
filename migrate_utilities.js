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

const UTILITY_CATEGORIES = [
  'locali', 'utilita', 'famiglie', 'esperienze_locali', 'eventi',
  'restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'ice_cream', 'pizzeria', 
  'pesce', 'carne', 'vegetariano', 'sushi', 'gelateria', 'ristorante', 'glutenfree',
  'servizi'
];

async function migrateUtilities() {
  console.log("Inizio migrazione delle categorie non storiche da shared_pois a utility_pois...");
  
  let pois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon, category, photo_url, image_url, status, created_at')
      .in('category', UTILITY_CATEGORIES)
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

  console.log(`Trovati ${pois.length} POI non storici da migrare.`);
  
  if (pois.length === 0) return;

  let movedCount = 0;
  let deletedCount = 0;

  // Insert in chunks of 100
  for (let i = 0; i < pois.length; i += 100) {
    const chunk = pois.slice(i, i + 100);
    
    // Map to utility_pois schema
    const toInsert = chunk.map(p => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
        photo_url: p.photo_url,
        image_url: p.image_url,
        status: p.status || 'verified',
        created_at: p.created_at || new Date().toISOString()
    }));

    const { error: insertError } = await supabase.from('utility_pois').upsert(toInsert, { onConflict: "id", ignoreDuplicates: true });
    
    if (insertError) {
        console.error("Errore inserimento chunk:", insertError.message);
    } else {
        movedCount += chunk.length;
        // Delete from shared_pois
        const idsToDelete = chunk.map(p => p.id);
        const { error: deleteError } = await supabase.from('shared_pois').delete().in('id', idsToDelete);
        
        if (deleteError) {
             console.error("Errore eliminazione chunk:", deleteError.message);
        } else {
             deletedCount += chunk.length;
        }
    }
    console.log(`Progresso: Migrati e rimossi ${deletedCount} / ${pois.length}...`);
  }

  console.log(`✅ Finito! ${movedCount} POI copiati in utility_pois, ${deletedCount} rimossi da shared_pois.`);
}

migrateUtilities();
