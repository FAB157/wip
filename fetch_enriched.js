import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Credenziali mancanti");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('shared_pois')
    .select('name, city, enriched_at, category')
    .eq('enrichment_source', 'groq_bg_sources')
    .order('enriched_at', { ascending: false })
    .limit(100);

  if (error) {
    fs.writeFileSync('C:\\progetti\\itainta\\scratch_enriched.txt', 'Error: ' + error.message);
    return;
  }

  const list = data.map(d => `- ${d.name} (${d.city || d.category}) - ${d.enriched_at}`).join('\n');
  fs.writeFileSync('C:\\progetti\\itainta\\scratch_enriched.txt', list || 'Nessun POI trovato.');
}

run();
