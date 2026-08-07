const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('pois').select('category');
  if (error) {
    console.error("Error:", error);
    return;
  }
  const counts = data.reduce((acc, poi) => {
    acc[poi.category] = (acc[poi.category] || 0) + 1;
    return acc;
  }, {});
  console.log("Categories in DB:", counts);
}
run();
