import { createClient } from '@supabase/supabase-js';

const url = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const key = 'sb_publishable_BdoIKBDn0BjMrBJHLjG-wg_er4fV3US';
const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('saved_pois').select('*');
  console.log("Data:", data);
  console.log("Error:", error);
}

test();
