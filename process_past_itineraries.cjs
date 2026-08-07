require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function processItineraries() {
  console.log("Starting script to process past itineraries...");

  // 1. Fetch all itineraries
  const { data: itineraries, error } = await supabase
    .from('itineraries')
    .select('id, user_id, plan, created_at');

  if (error && error.code !== '42P01') {
    console.error("Error fetching itineraries:", error.message);
  }

  // Also fetch user_itineraries
  const { data: userItineraries, error: errUser } = await supabase
    .from('user_itineraries')
    .select('id, user_id, dati_itinerario, created_at');

  const allItineraries = [...(itineraries || []), ...(userItineraries || [])];

  console.log(`Found ${allItineraries.length} total itineraries.`);

  let totalPoisInserted = 0;

  for (const itinerary of allItineraries) {
    let pois = [];
    const route_data = itinerary.plan || itinerary.dati_itinerario;
    if (route_data) {
      if (Array.isArray(route_data)) {
        pois = route_data;
      } else if (route_data.giorni && Array.isArray(route_data.giorni)) {
        pois = route_data.giorni.flatMap(g => g.tappe).filter(Boolean);
      } else if (route_data.pois && Array.isArray(route_data.pois)) {
        pois = route_data.pois;
      } else if (route_data.waypoints && Array.isArray(route_data.waypoints)) {
        pois = route_data.waypoints.map(w => w.poi).filter(Boolean);
      }
    }

    if (pois.length === 0) continue;

    console.log(`Itinerary ${itinerary.id} has ${pois.length} POIs.`);

    for (const poi of pois) {
      const lat = poi.coordinate?.lat || poi.lat || poi.location?.lat;
      const lon = poi.coordinate?.lng || poi.coordinate?.lon || poi.lon || poi.location?.lng;
      
      if (!lat || !lon) continue;
      
      const id = poi.id_tappa || poi.id || `gen_${lat}_${lon}`;

      // 1. Insert into shared_pois
      // In questo modo si aziona il trigger `trg_enrich_poi_on_insert` che arricchisce il POI (Wiki, AI, Foto, Audioguida)
      const payload = {
        id: String(id),
        lat: typeof lat === "number" ? lat : parseFloat(lat),
        lon: typeof lon === "number" ? lon : parseFloat(lon),
        name: poi.titolo_tappa || poi.name || null,
        category: poi.category || "monumenti",
        status: 'draft',
        created_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase
        .from('shared_pois')
        .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
        
      if (insertErr) {
        console.error(`Error inserting POI ${poi.id}:`, insertErr.message);
      } else {
        totalPoisInserted++;
        
        // 2. Track in poi_itinerari
        const { error: trackErr } = await supabase
          .from('poi_itinerari')
          .insert({
            poi_id: String(id),
            itinerary_id: itinerary.id
          });
          
        if (trackErr && trackErr.code !== '23505') { // Ignore unique violation if we already added it
             console.error(`Error tracking poi_itinerari ${poi.id}:`, trackErr.message);
        }
      }
    }
  }

  console.log(`Finished processing! Inserted/Processed ${totalPoisInserted} POIs into shared_pois and poi_itinerari.`);
}

processItineraries().catch(console.error);
