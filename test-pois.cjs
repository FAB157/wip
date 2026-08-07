require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envUrl = process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const envKey = process.env.VITE_SUPABASE_ANON_KEY || 'dummy';

// We can read it from .env
const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const res1 = await supabase.from('pois').select('*').limit(1);
  console.log('pois table:', res1.error ? res1.error.message : 'OK');
}

check();
