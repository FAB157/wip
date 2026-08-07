const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking DB shared_pois...");
  const { data, error } = await supabase.from('shared_pois').select('category');
  if (error) {
    console.error("Error:", error);
    return;
  }
  const counts = data.reduce((acc, poi) => {
    acc[poi.category] = (acc[poi.category] || 0) + 1;
    return acc;
  }, {});
  console.log("Categories in DB shared_pois:", counts);
}
run();
