require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  
  const supabase = createClient(url, key);
  const sql = fs.readFileSync('create_poi_tracking_tables.sql', 'utf8');
  
  // Eseguiamo il pgsodium query tramite RPC se disponibile, o un custom RPC
  // Normalmente si usa supabase.rpc('exec_sql', { sql }) ma serve l'admin.
  // Dato che l'utente può eseguirlo dal backend, stampiamo un messaggio per farglielo fare dal terminale manuale.
  console.log("Se l'RPC non esiste, devi incollare il file in Supabase SQL Editor.");
}

run().catch(console.error);
