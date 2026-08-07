import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkParchi() {
  const { data, error, count } = await supabase
    .from('shared_pois')
    .select('name, category, city, region', { count: 'exact' })
    .eq('region', 'Veneto')
    .ilike('category', '%parch%');
    
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log(`Trovati ${count} parchi in Veneto:`);
    console.log(data);
  }
}

checkParchi();
