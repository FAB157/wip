const { createClient } = require('@supabase/supabase-js');

const url = "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function count() {
  try {
    const { data, error } = await supabase
      .from('api_usage_logs')
      .select('feature_context')
      .ilike('feature_context', '%teaser%')
      .limit(10);

    if (error) {
      console.log("Error: " + error.message);
    } else {
      console.log("LOGS_FOUND: " + data.length);
    }
  } catch (e) {
    console.log("Exception: " + e.message);
  }
}

count();
