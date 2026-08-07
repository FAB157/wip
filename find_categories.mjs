import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCats() {
  const { data, error } = await supabase.rpc('get_unique_categories');
  
  if (error) {
     console.log("No RPC found, trying manual grouping...");
     const { data: catData, error: catError } = await supabase
       .from('shared_pois')
       .select('category');
     
     if (catError) { console.error(catError); return; }
     
     const cats = new Set();
     catData.forEach(c => cats.add(c.category));
     console.log(Array.from(cats));
  } else {
     console.log(data);
  }
}

checkCats();
