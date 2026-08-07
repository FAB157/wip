const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('shared_pois').select('*').limit(1).then(r => {
    const fs = require('fs');
    fs.writeFileSync('schema_out.txt', Object.keys(r.data[0]).join('\n'));
});
