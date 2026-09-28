#!/usr/bin/env node
// Diagnosi lingua di un POI (22/09/2026): riga, cache di traduzione, righe poi_details, ultimi log del traduttore.
//   node scripts/ispeziona-lingua-poi.mjs "<nome esatto>"
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const u = env.VITE_SUPABASE_URL, k = env.SUPABASE_SERVICE_ROLE_KEY, h = { headers: { apikey: k, Authorization: 'Bearer ' + k } };
const nome = process.argv[2] || 'Memorial to the Murdered Members of the Reichstag';
const righe = await (await fetch(`${u}/rest/v1/shared_pois?select=id,description_lang,enrichment_source,description_short&name=eq.${encodeURIComponent(nome)}&is_hidden=not.is.true`, h)).json();
if (!Array.isArray(righe)) { console.log('errore REST:', JSON.stringify(righe)); process.exit(1); }
console.log('righe:', JSON.stringify(righe.map((x) => ({ ...x, description_short: (x.description_short || '').slice(0, 60) }))));
for (const r of righe) {
  const c = await (await fetch(`${u}/rest/v1/api_cache?select=cache_key,created_at&cache_key=like.poidesc_%25${encodeURIComponent(r.id)}`, h)).json();
  console.log(r.id, 'cache:', JSON.stringify(c));
  const d = await (await fetch(`${u}/rest/v1/poi_details?select=language,updated_at&poi_id=eq.${encodeURIComponent(r.id)}`, h)).json();
  console.log(r.id, 'poi_details:', JSON.stringify(d));
}
const logs = await (await fetch(`${u}/rest/v1/api_usage_logs?select=created_at,engine,model,success,error_message,user_id&order=created_at.desc&limit=10&feature=eq.poi_details_i18n`, h)).json();
console.log('log traduttore:', JSON.stringify(logs).slice(0, 2000));
