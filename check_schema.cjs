const { createClient } = require('@supabase/supabase-js');

const url = "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y";

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
