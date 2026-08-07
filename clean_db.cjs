const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanDb() {
  console.log("Cleaning api_cache...");
  const { error: err1 } = await supabase.from('api_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log("api_cache cleaned", err1);

  console.log("Cleaning itineraries...");
  const { error: err2 } = await supabase.from('itineraries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log("itineraries cleaned", err2);
}

cleanDb();
