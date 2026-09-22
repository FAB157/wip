#!/usr/bin/env node
/** Prova l'upsert di poi_details con la service key, esattamente come farà
 *  salvaPoiDetailsPerLingua in server.ts. Usa un POI VERO gia' presente in
 *  shared_pois (il vincolo FK lo richiede), scrive una riga di test per una
 *  lingua di prova, la rilegge, poi la elimina — non tocca la lingua
 *  primaria del POI. */
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
const headers = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' };
const testLang = 'ZZ'; // lingua di comodo, non reale: facile da ripulire senza toccare dati veri

async function main() {
  // 0. un POI vero già in shared_pois
  const r0 = await fetch(`${supabaseUrl}/rest/v1/shared_pois?select=id&limit=1`, { headers });
  const [row0] = await r0.json();
  if (!row0) { console.error('Nessun POI trovato in shared_pois'); process.exit(1); }
  const testId = row0.id;
  console.log('POI di prova:', testId);

  // 1. upsert (come salvaPoiDetailsPerLingua)
  const r1 = await fetch(`${supabaseUrl}/rest/v1/poi_details?on_conflict=poi_id,language`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ poi_id: testId, language: testLang, summary: 'Prova corta', wiki_extract: 'Prova lunga', enriched: true, updated_at: new Date().toISOString() }),
  });
  console.log('upsert status:', r1.status, r1.ok ? '' : await r1.text());

  // 2. upsert di nuovo (deve aggiornare, non duplicare)
  const r2 = await fetch(`${supabaseUrl}/rest/v1/poi_details?on_conflict=poi_id,language`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ poi_id: testId, language: testLang, summary: 'Prova corta AGGIORNATA', wiki_extract: 'Prova lunga', enriched: true, updated_at: new Date().toISOString() }),
  });
  console.log('upsert #2 status:', r2.status, r2.ok ? '' : await r2.text());

  // 3. rilettura
  const r3 = await fetch(`${supabaseUrl}/rest/v1/poi_details?poi_id=eq.${testId}&language=eq.${testLang}&select=*`, { headers });
  const rows = await r3.json();
  console.log('righe trovate:', rows.length, JSON.stringify(rows));

  // 4. pulizia
  const r4 = await fetch(`${supabaseUrl}/rest/v1/poi_details?poi_id=eq.${testId}&language=eq.${testLang}`, { method: 'DELETE', headers });
  console.log('cleanup status:', r4.status);
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
