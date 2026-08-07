const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data, error } = await supabase.from('shared_pois')
        .select('name, photo_url, image_url, description_ai, status, is_gem')
        .ilike('name', '%dunchi%');
    console.log("Dunchi POIs:", data, error);
    
    const { data: data2 } = await supabase.from('shared_pois')
        .select('name, photo_url, image_url, description_ai, status, is_gem')
        .ilike('name', '%castruccio%');
    console.log("Castruccio POIs:", data2);
    
    const { data: data3 } = await supabase.from('shared_pois')
        .select('name, photo_url, image_url, description_ai, status, is_gem')
        .ilike('name', '%avenza%');
    console.log("Avenza POIs:", data3);
}
run();
