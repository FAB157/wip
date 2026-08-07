require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, category, image_url, description_short')
    .gte('created_at', d.toISOString());
    
  if (error) {
    console.error(error);
  } else {
    const res = data.filter(p => p.name.toLowerCase().includes('blackstone'));
    console.log(JSON.stringify(res, null, 2));
  }
}
check();
