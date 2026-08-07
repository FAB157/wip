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

// Funzione per calcolare la distanza in metri (Haversine)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const deltaP = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function cleanDuplicates() {
  console.log("🔍 Scaricamento di tutti i POI dal database...");
  
  // Usiamo un limit altissimo per essere sicuri di prenderli tutti,
  // oppure paginiamo. Dato che potrebbero essere migliaia, facciamo una paginazione semplice.
  let allPois = [];
  let hasMore = true;
  let from = 0;
  const step = 1000;

  while (hasMore) {
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon, created_at, source, category')
      .range(from, from + step - 1);

    if (error) {
      console.error("Errore durante il fetch dei POI:", error.message);
      return;
    }

    if (pois && pois.length > 0) {
      allPois = allPois.concat(pois);
      from += step;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Trovati ${allPois.length} POI. Analisi duplicati in corso...`);

  const toDelete = new Set();
  const keepMap = new Map();

  for (const poi of allPois) {
    if (!poi.name) continue;
    
    const normName = poi.name.trim().toLowerCase();
    
    if (!keepMap.has(normName)) {
      keepMap.set(normName, [poi]);
    } else {
      const existingPois = keepMap.get(normName);
      let isDuplicate = false;

      for (const existing of existingPois) {
        // Stesso nome + Stessa Categoria + Distanza < 100 metri
        const dist = getDistanceInMeters(poi.lat, poi.lon, existing.lat, existing.lon);
        
        if (dist < 100 && poi.category === existing.category) {
          isDuplicate = true;
          // Preferiamo tenere quello inserito manualmente ("csv") 
          // oppure quello più vecchio (se hanno la stessa sorgente)
          if (poi.source === 'csv' && existing.source !== 'csv') {
            toDelete.add(existing.id);
            existingPois[existingPois.indexOf(existing)] = poi;
          } else {
            toDelete.add(poi.id);
          }
          break;
        }
      }

      if (!isDuplicate) {
        existingPois.push(poi);
      }
    }
  }

  const deleteArray = Array.from(toDelete);
  
  if (deleteArray.length === 0) {
    console.log("✨ Nessun POI duplicato trovato! Il database è pulito.");
    return;
  }

  console.log(`⚠️ Trovati ${deleteArray.length} POI duplicati in un raggio di 100 metri. Eliminazione in corso...`);

  let deletedCount = 0;
  for (let i = 0; i < deleteArray.length; i += 100) {
    const chunk = deleteArray.slice(i, i + 100);
    const { error: delError } = await supabase.from('shared_pois').delete().in('id', chunk);
    if (delError) {
      console.error("❌ Errore eliminazione:", delError.message);
    } else {
      deletedCount += chunk.length;
      console.log(`🗑️ Eliminati ${deletedCount}/${deleteArray.length}...`);
    }
  }

  console.log(`✅ Pulizia completata! Rimossi definitivamente ${deletedCount} duplicati.`);
}

cleanDuplicates();
