require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const p1 = lat1 * Math.PI/180; // φ, λ in radians
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(dp/2) * Math.sin(dp/2) +
          Math.cos(p1) * Math.cos(p2) *
          Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
}

async function deduplicatePois() {
  console.log("Inizio scaricamento di tutti i POI...");
  let allPois = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    console.log(`Scaricamento da ${from} a ${from + limit - 1}...`);
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon, description_long, description_ai, photo_url, image_url, audio_url, audio_url_short, audio_url_long')
      .range(from, from + limit - 1);
      
    if (error) {
      console.error("Errore fetch:", error.message);
      break;
    }
    
    if (data && data.length > 0) {
      allPois.push(...data);
      from += limit;
      if (data.length < limit) break; // Siamo all'ultima pagina
    } else {
      break;
    }
  }
  
  console.log(`Scaricati ${allPois.length} POI in totale.`);
  
  console.log("Raggruppamento per nome...");
  const byName = {};
  for (const poi of allPois) {
    if (!poi.name || poi.name.length < 4 || poi.name === "Punto di Utilità") continue;
    const key = poi.name.toLowerCase().trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(poi);
  }
  
  console.log("Ricerca dei duplicati per distanza (< 100 metri)...");
  const idsToDelete = new Set();
  
  let checkedGroups = 0;
  let dupesFound = 0;
  
  for (const nameKey of Object.keys(byName)) {
    const group = byName[nameKey];
    if (group.length < 2) continue;
    
    checkedGroups++;
    
    // Controlliamo ogni coppia
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const poi1 = group[i];
        const poi2 = group[j];
        
        // Se uno di essi è già stato inserito in eliminazione, possiamo saltare, ma controlliamo
        if (idsToDelete.has(poi1.id) || idsToDelete.has(poi2.id)) continue;
        
        const dist = getDistanceFromLatLonInM(poi1.lat, poi1.lon, poi2.lat, poi2.lon);
        if (dist < 100) {
          // Sono duplicati!
          // Vediamo chi salvare. 
          // Chi ha più info tra descrizione, foto e audioguida vince.
          const score1 = (poi1.description_long || poi1.description_ai ? 1 : 0) + 
                         (poi1.photo_url || poi1.image_url ? 1 : 0) + 
                         (poi1.audio_url || poi1.audio_url_short || poi1.audio_url_long ? 1 : 0);
                         
          const score2 = (poi2.description_long || poi2.description_ai ? 1 : 0) + 
                         (poi2.photo_url || poi2.image_url ? 1 : 0) + 
                         (poi2.audio_url || poi2.audio_url_short || poi2.audio_url_long ? 1 : 0);
          
          if (score1 > score2) {
            idsToDelete.add(poi2.id);
            dupesFound++;
          } else if (score2 > score1) {
            idsToDelete.add(poi1.id);
            dupesFound++;
          } else if (score1 === 0 && score2 === 0) {
            // Nessuno dei due ha info. Cancelliamo il secondo per pulizia,
            // Selezioniamo in base all'ID: preferiamo l'osm- se c'è
            if (String(poi1.id).startsWith("osm-") && !String(poi2.id).startsWith("osm-")) {
              idsToDelete.add(poi2.id);
            } else {
              idsToDelete.add(poi2.id);
            }
            dupesFound++;
          } else {
            // Entrambi hanno lo stesso livello di completezza.
            // Cancelliamo il secondo per evitare doppi nella mappa.
            idsToDelete.add(poi2.id);
            dupesFound++;
          }
        }
      }
    }
  }
  
  const toDeleteArray = Array.from(idsToDelete);
  console.log(`Trovati ${dupesFound} duplicati ravvicinati (< 100m). ID unici da cancellare: ${toDeleteArray.length}`);
  
  if (toDeleteArray.length === 0) {
    console.log("Nessun duplicato trovato. Pulizia terminata.");
    return;
  }
  
  // Salva backup
  fs.writeFileSync('deleted_dupes_backup.json', JSON.stringify(toDeleteArray));
  
  console.log("Inizio cancellazione in batch...");
  const batchSize = 1000;
  for (let i = 0; i < toDeleteArray.length; i += batchSize) {
    const batch = toDeleteArray.slice(i, i + batchSize);
    console.log(`Cancellazione batch ${i} a ${i + batch.length - 1}...`);
    
    const { error } = await supabase
      .from('shared_pois')
      .delete()
      .in('id', batch);
      
    if (error) {
      console.error("Errore cancellazione:", error);
    }
  }
  
  console.log("Pulizia completata con successo!");
}

deduplicatePois();
