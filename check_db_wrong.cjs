const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data, error } = await supabase.from('shared_pois')
        .select('name, photo_url, image_url, description_ai, status, is_gem')
        .or('name.ilike.%dunchi%,name.ilike.%bresci%,name.ilike.%tramvia%');
        
    console.log("Weird POIs:", JSON.stringify(data, null, 2), error);
    
    const { data: mData } = await supabase.from('shared_pois')
        .select('name, lat, lon, photo_url, description_ai')
        .ilike('name', '%marmo%');
    console.log("Marmo POIs:", JSON.stringify(mData?.slice(0, 5), null, 2));
}
run();
