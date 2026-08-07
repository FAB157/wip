import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = process.env.VITE_SUPABASE_URL || envVars['VITE_SUPABASE_URL'] || process.env.SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

console.log("URL:", supabaseUrl ? "Found" : "Missing");
console.log("ANON_KEY:", supabaseKey ? "Found" : "Missing");

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const payload = { 
    id: `osm-test-123456789`,
    name: 'Test POI London',
    lat: 51.5074,
    lon: -0.1278,
    category: 'monument',
    status: 'auto' 
  };
  
  console.log("Testing insert with Anon Key (simulando l'app client)...");
  const { data, error } = await supabase
    .from('shared_pois')
    .upsert([payload], { onConflict: 'id', ignoreDuplicates: true });
    
  if (error) {
    console.error("ERRORE DI INSERIMENTO SUPABASE:", error);
  } else {
    console.log("Inserimento avvenuto con successo!", data);
  }
}

testInsert();
