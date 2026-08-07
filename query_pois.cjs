require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPois() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if (error) {
    console.error("Error querying database:", error.message);
  } else {
    console.log(`Numero di POI arricchiti oggi: ${count}`);
  }
}

checkPois();
