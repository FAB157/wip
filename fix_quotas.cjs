const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixQuota() {
  const { data, error } = await supabase
    .from('user_quotas')
    .update({ 
       audioguide_used: 0,
       audioguide_limit: 5000 
    })
    .neq('user_id', '00000000-0000-0000-0000-000000000000'); // update all
  
  if (error) {
    console.error('Error updating quotas:', error);
  } else {
    console.log('Quotas reset and updated successfully.', data);
  }
}

fixQuota();
