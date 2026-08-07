import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('pois')
    .select('id, name, lat, lon, category');

  const emojiNames = data.filter(p => p.name && (p.name.includes('🪨') || p.name.includes('🗿')));
  console.log("Pois with emoji:", emojiNames.length);
  if (emojiNames.length > 0) {
    console.log(emojiNames);
  }
}
test();
