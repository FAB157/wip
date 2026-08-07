require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCount() {
  const { count, error } = await supabase
    .from('shared_pois')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'csv');
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Total POIs with source='csv':", count);
  }
}
checkCount();
