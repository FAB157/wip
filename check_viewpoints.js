import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkViewpoints() {
  const latMin = 44.03;
  const latMax = 44.12;
  const lonMin = 10.02;
  const lonMax = 10.15;

  const { data, error } = await supabase
    .from('shared_pois')
    .select('name')
    .eq('category', 'viewpoint')
    .gte('lat', latMin)
    .lte('lat', latMax)
    .gte('lon', lonMin)
    .lte('lon', lonMax);
    
  if (error) {
    console.error("Error querying viewpoints:", error.message);
  } else {
    console.log("Punti panoramici a Carrara:");
    data.forEach(p => console.log(`- ${p.name}`));
  }
}

checkViewpoints();
