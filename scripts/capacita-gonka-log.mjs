#!/usr/bin/env node
// Capacita' reale dei motori AI dai log (23/09/2026): chiamate riuscite per fascia di 10 minuti, per motore,
// nelle ultime N ore. Serve a dimensionare i lavoratori del pre-arricchimento (chiamate/min sostenibili).
//   node scripts/capacita-gonka-log.mjs [ore=3]
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const u = env.VITE_SUPABASE_URL, k = env.SUPABASE_SERVICE_ROLE_KEY, h = { headers: { apikey: k, Authorization: 'Bearer ' + k } };
const ore = Number(process.argv[2] || 3);
const da = new Date(Date.now() - ore * 3600e3).toISOString();
const righe = [];
for (let off = 0; off < 20000; off += 1000) {
  const r = await fetch(`${u}/rest/v1/api_usage_logs?select=api_name,created_at,feature_context&api_name=neq.poi_audioguide_diritto&created_at=gte.${encodeURIComponent(da)}&order=created_at.desc&limit=1000&offset=${off}`, h);
  const j = await r.json(); if (!Array.isArray(j) || !j.length) break; righe.push(...j); if (j.length < 1000) break;
}
console.log(`chiamate AI riuscite nelle ultime ${ore} ore (senza il log del diritto audio): ${righe.length}`);
const fasce = {};
for (const r of righe) {
  const t = new Date(r.created_at); const f = `${String(t.getUTCHours()).padStart(2, '0')}:${String(Math.floor(t.getUTCMinutes() / 10) * 10).padStart(2, '0')}`;
  const m = r.api_name.startsWith('gonka') ? 'gonka' : r.api_name;
  fasce[f] = fasce[f] || {}; fasce[f][m] = (fasce[f][m] || 0) + 1;
}
for (const f of Object.keys(fasce).sort()) console.log(f, JSON.stringify(fasce[f]));
const ctx = {};
for (const r of righe) { const c = String(r.feature_context || '').split('|')[0].trim().slice(0, 40); ctx[c] = (ctx[c] || 0) + 1; }
console.log('per contesto:', JSON.stringify(Object.fromEntries(Object.entries(ctx).sort((a, b) => b[1] - a[1]).slice(0, 12))));
