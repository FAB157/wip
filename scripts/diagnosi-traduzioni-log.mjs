#!/usr/bin/env node
// Diagnosi traduzioni (23/09/2026): cosa dicono i log AI (api_usage_logs, feature poi_details_i18n) nelle
// ultime N ore — motori usati, successi/fallimenti, errori — e i contatori di spesa Gonka del mese.
//   node scripts/diagnosi-traduzioni-log.mjs [ore=2]
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const u = env.VITE_SUPABASE_URL, k = env.SUPABASE_SERVICE_ROLE_KEY, h = { headers: { apikey: k, Authorization: 'Bearer ' + k } };
const ore = Number(process.argv[2] || 2);
const da = new Date(Date.now() - ore * 3600e3).toISOString();
const q = async (path) => { const r = await fetch(`${u}/rest/v1/${path}`, h); const j = await r.json(); if (!Array.isArray(j)) { console.log('REST:', path.slice(0, 80), JSON.stringify(j).slice(0, 200)); return []; } return j; };
// Colonne: si chiedono tutte (select=*) e si guarda cosa c'e', perche' lo schema live e' incerto.
const logs = await q(`api_usage_logs?select=*&order=created_at.desc&limit=1000&created_at=gte.${encodeURIComponent(da)}`);
console.log(`righe api_usage_logs ultime ${ore} ore: ${logs.length}`);
if (logs.length) console.log('colonne:', Object.keys(logs[0]).join(', '));
const perFeat = {};
for (const r of logs) {
  const f = r.feature || r.api_name || r.endpoint || '?';
  const eng = r.model || r.engine || r.api_name || '?';
  const ok = r.success === undefined ? '?' : (r.success ? 'ok' : 'KO');
  const key = `${f} | ${eng} | ${ok}`;
  perFeat[key] = (perFeat[key] || 0) + 1;
}
for (const [kk, v] of Object.entries(perFeat).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(v).padStart(5), kk);
const err = logs.filter((r) => r.success === false || r.error_message || r.error);
console.log(`\nrighe con errore: ${err.length}`);
for (const r of err.slice(0, 8)) console.log('  ', r.created_at, r.feature || r.api_name, '|', String(r.error_message || r.error || '').slice(0, 160));
const gonka = await q(`api_cache?select=cache_key,text_content,created_at&cache_key=like.gonka_semina_usd_%25`);
console.log('\ncontatori Gonka:', gonka.map((x) => `${x.cache_key}=${x.text_content}`).join('  '));
