require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  
  const yesterdayEnd = new Date();
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  yesterdayEnd.setHours(23, 59, 59, 999);
  
  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, category, created_at')
    .gte('created_at', yesterdayStart.toISOString())
    .lte('created_at', yesterdayEnd.toISOString());
    
  if (error) {
    console.error(error);
  } else {
    console.log(`Total POIs added yesterday: ${data.length}`);
    const categories = {};
    data.forEach(poi => {
      if (!categories[poi.category]) categories[poi.category] = [];
      categories[poi.category].push(poi.name);
    });
    for (const [cat, names] of Object.entries(categories)) {
      console.log(`\n-- ${cat.toUpperCase()} (${names.length}) --`);
      names.forEach(n => console.log(`- ${n}`));
    }
  }
}
run();
