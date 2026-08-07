import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import fs from 'fs';
import path from 'path';

// Carica l'ambiente manually from .env.local
let envData = '';
try {
  envData = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
} catch(e) {
  try {
    envData = fs.readFileSync(path.resolve('.env'), 'utf-8');
  } catch(e2) {}
}

const envVars = {};
envData.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const supabaseUrl = process.env.VITE_SUPABASE_URL || envVars['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPois() {
  // Calcola la data di oggi a mezzanotte
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error, count } = await supabase
    .from('shared_pois')
    .select('id, name, lat, lon, created_at, category', { count: 'exact' })
    .gte('created_at', today.toISOString());

  if (error) {
    console.error('Errore durante la query:', error);
    return;
  }

  console.log(`POI AGGIUNTI OGGI: ${count}`);
  
  if (data && data.length > 0) {
    console.log('\nElenco POI aggiunti oggi:');
    data.forEach(poi => {
      console.log(`- [${poi.category}] ${poi.name} (Lat: ${poi.lat}, Lon: ${poi.lon}) - Creato alle: ${new Date(poi.created_at).toLocaleTimeString()}`);
    });
  } else {
    console.log('Nessun POI aggiunto oggi nel database condiviso.');
  }
}

checkPois();
