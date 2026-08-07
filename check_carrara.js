import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listCarraraPOIs() {
  const latMin = 44.03;
  const latMax = 44.12;
  const lonMin = 10.02;
  const lonMax = 10.15;

  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, category')
    .gte('lat', latMin)
    .lte('lat', latMax)
    .gte('lon', lonMin)
    .lte('lon', lonMax);
    
  if (error) {
    console.error("Error:", error.message);
    return;
  }

  const culturalCategories = [
    'monument', 'monumenti', 'museo', 'musei', 'museum', 
    'gemme', 'artwork', 'attraction', 'viewpoint', 
    'church', 'chiese', 'castle', 'esperienze_locali', 'locali'
  ];

  const filtered = data.filter(poi => 
    poi.category && culturalCategories.includes(poi.category)
  );

  // Group by category for better readability
  const grouped = {};
  filtered.forEach(poi => {
    let cat = poi.category;
    // Normalize some categories
    if (['museo', 'musei', 'museum'].includes(cat)) cat = 'Musei';
    else if (['monument', 'monumenti'].includes(cat)) cat = 'Monumenti';
    else if (['church', 'chiese'].includes(cat)) cat = 'Chiese';
    else if (cat === 'artwork') cat = 'Opere d\'arte';
    else if (cat === 'gemme') cat = 'Gemme Nascoste';
    else if (cat === 'attraction') cat = 'Attrazioni';
    else if (cat === 'viewpoint') cat = 'Punti Panoramici';
    else if (cat === 'castle') cat = 'Castelli';
    else cat = 'Altro';

    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(poi.name || 'Senza Nome');
  });

  console.log(JSON.stringify(grouped, null, 2));
}

listCarraraPOIs();
