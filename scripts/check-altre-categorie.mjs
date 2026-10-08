import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const candidate = ['gallery','art_gallery','castello','castle','palazzo','palace','unesco','sito_storico','historic_site','cammini','sentieri','trail','hiking','parco','park','natura','nature','archeologico','archaeological','fortezza','fortress','rovine','ruins','anfiteatro','amphitheatre','teatro_antico','villa_storica'];
for (const cat of candidate) {
  const { count, error } = await sb.from('shared_pois').select('id', { count: 'exact', head: true }).eq('category', cat).not('is_hidden', 'is', true);
  if (!error && count > 0) console.log(cat.padEnd(20), count);
}
