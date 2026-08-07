import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('itineraries').update({ status: 'active' }).eq('status', 'optimizing');
  if (error) console.error("Error:", error);
  else console.log("Unstuck optimizing itineraries.");
}

run();
