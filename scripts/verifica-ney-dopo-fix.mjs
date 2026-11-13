#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };
const id = 'bc-merimee-PA00088649';

async function main() {
  const sp = await (await fetch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${id}&select=id,description_short,description_long,description_lang,audio_script`, { headers })).json();
  console.log('shared_pois:', JSON.stringify(sp, null, 2).slice(0, 800));
  const pd = await (await fetch(`${supabaseUrl}/rest/v1/poi_details?poi_id=eq.${id}&select=poi_id,language,summary,enriched`, { headers })).json();
  console.log('poi_details:', pd);
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
