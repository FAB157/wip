const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking if user_id exists in saved_pois...");
  const { data, error } = await supabase.from('saved_pois').select('user_id').limit(1);
  if (error && error.code === '42703') { // column does not exist
    console.log("Column user_id does not exist. Please add it via Supabase Dashboard SQL editor:");
    console.log("ALTER TABLE saved_pois ADD COLUMN user_id UUID REFERENCES auth.users(id);");
  } else if (error) {
    console.error("Other error:", error);
  } else {
    console.log("Column user_id exists!");
  }
}

run();
