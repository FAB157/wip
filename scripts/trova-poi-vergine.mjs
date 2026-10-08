#!/usr/bin/env node
/** Trova POI reali MAI arricchiti in due citta' diverse, per il collaudo multilingua. */
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

async function cerca(nome, lat, lon, d) {
  const r = await fetch(`${supabaseUrl}/rest/v1/shared_pois?lat=gte.${lat - d}&lat=lte.${lat + d}&lon=gte.${lon - d}&lon=lte.${lon + d}&category=eq.monumenti&description_short=is.null&select=id,name,lat,lon&limit=3`, { headers });
  console.log(nome, ':', await r.json());
}

async function main() {
  await cerca('Madrid', 40.4168, -3.7038, 0.03);
  await cerca('Monaco di Baviera', 48.1351, 11.5820, 0.03);
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
