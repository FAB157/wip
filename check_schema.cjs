const { createClient } = require('@supabase/supabase-js');

const url = "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('shared_pois').select('*').limit(1);
  if (error) {
    console.log("Error: " + error.message);
  } else {
    console.log("Columns: " + Object.keys(data[0]).join(", "));
  }
}
check();
