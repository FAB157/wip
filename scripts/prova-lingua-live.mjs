#!/usr/bin/env node
// Prova dal vivo (22/09/2026): trova un POI per nome+bbox, poi chiede /api/poi/details e
// /api/poi/enrich-stream in produzione nella lingua data, da ospite e da utente loggato.
//   node scripts/prova-lingua-live.mjs "<nome (ilike)>" <lang> [latMin latMax lonMin lonMax]
import fs from 'fs';
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const u = env.VITE_SUPABASE_URL, k = env.SUPABASE_SERVICE_ROLE_KEY, h = { headers: { apikey: k, Authorization: 'Bearer ' + k } };
const [nome, lang = 'es', latMin, latMax, lonMin, lonMax] = process.argv.slice(2);
let q = `${u}/rest/v1/shared_pois?select=id,name,description_lang,description_short&name=ilike.${encodeURIComponent(nome + '%')}&is_hidden=not.is.true&limit=5`;
if (latMin) q += `&lat=gte.${latMin}&lat=lte.${latMax}&lon=gte.${lonMin}&lon=lte.${lonMax}`;
const righe = await (await fetch(q, h)).json();
if (!Array.isArray(righe) || !righe.length) { console.log('nessuna riga', JSON.stringify(righe)); process.exit(1); }
const r = righe.find((x) => String(x.description_short || '').trim()) || righe[0];
console.log('riga:', r.id, '| lang riga:', r.description_lang, '|', (r.description_short || '').slice(0, 70));
const c = await (await fetch(`${u}/rest/v1/api_cache?select=cache_key,created_at&cache_key=like.poidesc_%25${encodeURIComponent(r.id)}`, h)).json();
console.log('cache traduzioni:', JSON.stringify(c));
const login = await (await fetch(`${u}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'appreview@wip.guide', password: 'WipReview2026!' }) })).json();
const tok = login.access_token; console.log('login:', !!tok);
for (const [lbl, hh] of [['ospite', {}], ['loggato', { Authorization: 'Bearer ' + tok }]]) {
  const t0 = Date.now();
  const g = await fetch(`https://www.wip.guide/api/poi/details?id=${encodeURIComponent(r.id)}&lang=${lang}`, { headers: hh });
  const d = await g.json();
  console.log(`details ${lbl}: ${g.status} ${Date.now() - t0} ms lingua_testo=${d.lingua_testo} |`, (d.description_short || '').slice(0, 80));
}
const t0 = Date.now();
const s = await fetch('https://www.wip.guide/api/poi/enrich-stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ id: r.id, name: r.name, lang, extract: '' }) });
const testo = await s.text();
console.log(`stream loggato: ${s.status} ${Date.now() - t0} ms |`, testo.slice(0, 300).replace(/\n/g, ' '));
