#!/usr/bin/env node
/** Trova un POI reale MAI arricchito (nessuna descrizione in nessuna lingua). */
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

async function main() {
  // Vicino a Parigi, categoria monumenti, senza description_short, con nome
  const r = await fetch(`${supabaseUrl}/rest/v1/shared_pois?lat=gte.48.84&lat=lte.48.90&lon=gte.2.30&lon=lte.2.36&category=eq.monumenti&description_short=is.null&select=id,name,lat,lon,category&limit=5`, { headers });
  const rows = await r.json();
  console.log('candidati vergini vicino a Parigi:', rows);
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
