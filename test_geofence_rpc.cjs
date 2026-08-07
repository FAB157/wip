const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('get_geofence_pois', {
    user_lat: 41.8902,
    user_lon: 12.4922,
    p_user_id: null,
    radius_meters: 5000
  });
  if(error) console.error("RPC Error:", error);
  else console.log("RPC Data length:", data.length, data.slice(0, 2));
}
test();
