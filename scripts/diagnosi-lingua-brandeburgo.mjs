#!/usr/bin/env node
/** Diagnosi: perché /api/poi/details?lang=fr torna ancora in italiano. */
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
  // Coordinate reali della Porta di Brandeburgo: 52.5163, 13.3777
  const lat = 52.5163, lon = 13.3777, d = 0.003;
  const r = await fetch(`${supabaseUrl}/rest/v1/shared_pois?lat=gte.${lat - d}&lat=lte.${lat + d}&lon=gte.${lon - d}&lon=lte.${lon + d}&select=id,name,description_short,description_long,description_lang,updated_at&order=updated_at.desc&limit=15`, { headers });
  const rows = await r.json();
  console.log('righe trovate vicino alle coordinate:', rows.length);
  let target = null;
  for (const row of rows) {
    console.log('---');
    console.log('id:', row.id, '| name:', row.name, '| lang:', row.description_lang, '| long len:', (row.description_long || '').length, '| updated_at:', row.updated_at);
    if (!target && (row.description_long || '').length > 100) target = row;
  }
  if (!target) { console.log('Nessuna riga con description_long trovata vicino alle coordinate.'); return; }
  console.log('\n=== TARGET SCELTO:', target.id, target.name, '===');
  console.log('description_long (it):', target.description_long.slice(0, 150));

  const pd = await fetch(`${supabaseUrl}/rest/v1/poi_details?poi_id=eq.${encodeURIComponent(target.id)}&select=*`, { headers });
  console.log('poi_details:', await pd.json());
  const cacheKey = `poidesc_fr_${target.id}`;
  const ac = await fetch(`${supabaseUrl}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=*`, { headers });
  console.log('api_cache', cacheKey, ':', await ac.json());

  const live = await fetch(`https://wip.guide/api/poi/details?id=${encodeURIComponent(target.id)}&lang=fr`);
  console.log('live status:', live.status);
  const j = await live.json();
  console.log('--- risposta LIVE /api/poi/details?lang=fr (ospite) ---');
  console.log('description_lang nel payload:', j.description_lang);
  console.log('description_short:', (j.description_short || '').slice(0, 80));
  console.log('description_long primi 150:', (j.description_long || '').slice(0, 150));
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
