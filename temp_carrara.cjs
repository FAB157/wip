const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCarrara() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('*')
    .ilike('name', '%Gianpaoli%')
    .limit(10);
    
  console.log("Villa Gianpaoli in shared_pois:", JSON.stringify(data, null, 2));
  
  const { data: v2, error: e2 } = await supabase
    .from('punti_interesse')
    .select('*')
    .ilike('nome', '%Gianpaoli%')
    .limit(10);
    
  console.log("Villa Gianpaoli in punti_interesse:", JSON.stringify(v2, null, 2));
  
  // Check triggers in DB using raw query if possible (not supported in JS unless we have an RPC)
}

checkCarrara().catch(console.error);
