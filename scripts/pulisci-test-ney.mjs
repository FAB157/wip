#!/usr/bin/env node
/** Ripulisce la descrizione italiana scritta per errore dal collaudo su
 *  bc-merimee-PA00088649 (Monument du Maréchal Ney), PRIMA del fix della
 *  lingua di generazione. Riporta il POI allo stato "mai arricchito". */
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
const headers = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function main() {
  const id = 'bc-merimee-PA00088649';
  const before = await (await fetch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${id}&select=id,name,description_short,description_long,description_ai,description_lang,audio_script`, { headers })).json();
  console.log('prima:', before);
  const r = await fetch(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${id}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ description_short: null, description_long: null, description_ai: null, description_lang: null, audio_script: null }),
  });
  console.log('patch status:', r.status);
  const after = await r.json();
  console.log('dopo:', after);
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
