import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('admin_stats').select('*').limit(1).catch(() => ({}));
  console.log("admin_stats", error ? error.message : "Exists");
  
  const { data: d2, error: e2 } = await supabase.from('token_usage').select('*').limit(1).catch(() => ({}));
  console.log("token_usage", e2 ? e2.message : "Exists");
}
check();
