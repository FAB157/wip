require('dotenv').config({ path: '.env.local' });
if (!process.env.VITE_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if(!supabaseUrl || !supabaseKey) { console.error('No env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Testing RPC...");
  // Use a dummy UUID
  const dummyUUID = "00000000-0000-0000-0000-000000000000";
  const { data, error } = await supabase.rpc('consume_credits', { p_user_id: dummyUUID, p_amount: 1 });
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
