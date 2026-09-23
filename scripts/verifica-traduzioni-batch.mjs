#!/usr/bin/env node
// Diagnosi traduzioni del pre-arricchimento (23/09/2026): prende un tratto della lista (righe da..a, 1-based),
// legge da shared_pois se il pin ha testo e in che lingua, e da poi_details quante lingue ha gia'.
//   node scripts/verifica-traduzioni-batch.mjs <da> <a> [lista]
import fs from 'fs';
import readline from 'readline';
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const u = env.VITE_SUPABASE_URL, k = env.SUPABASE_SERVICE_ROLE_KEY, h = { headers: { apikey: k, Authorization: 'Bearer ' + k } };
const [da, a, lista = 'scratch/lista-tutti-culturali.jsonl'] = process.argv.slice(2);
const DA = Number(da), A = Number(a);
const pin = [];
let n = 0;
const rl = readline.createInterface({ input: fs.createReadStream(lista), crlfDelay: Infinity });
for await (const r of rl) { n++; if (n < DA) continue; if (n > A) break; if (r) pin.push(JSON.parse(r)); }
console.log(`pin nel tratto ${DA}-${A}: ${pin.length}`);
const perId = new Map(pin.map((p) => [p.id, p]));
const conTesto = new Map(), lingue = new Map();
for (let i = 0; i < pin.length; i += 100) {
  const ids = pin.slice(i, i + 100).map((p) => encodeURIComponent(`"${p.id}"`)).join(',');
  const sp = await (await fetch(`${u}/rest/v1/shared_pois?select=id,description_lang,description_short,description_long&id=in.(${ids})`, h)).json();
  for (const r of (Array.isArray(sp) ? sp : [])) conTesto.set(r.id, { lang: r.description_lang, lunga: String(r.description_long || '').length, breve: String(r.description_short || '').length });
  const pd = await (await fetch(`${u}/rest/v1/poi_details?select=poi_id,language&poi_id=in.(${ids})`, h)).json();
  for (const r of (Array.isArray(pd) ? pd : [])) { if (!lingue.has(r.poi_id)) lingue.set(r.poi_id, new Set()); lingue.get(r.poi_id).add(String(r.language).toUpperCase()); }
}
let testo = 0, senza = 0;
const dist = {};
for (const p of pin) {
  const t = conTesto.get(p.id);
  const ha = t && (t.lunga >= 30 || t.breve >= 30);
  if (ha) testo++; else senza++;
  if (ha) { const q = (lingue.get(p.id) || new Set()).size; dist[q] = (dist[q] || 0) + 1; }
}
console.log(`con testo: ${testo}, senza testo: ${senza}`);
console.log('pin con testo per numero di lingue in poi_details (0..7):', JSON.stringify(dist));
// Qualche esempio di pin con testo ma poche lingue.
let mostrati = 0;
for (const p of pin) {
  const t = conTesto.get(p.id); const q = (lingue.get(p.id) || new Set());
  if (t && (t.lunga >= 30 || t.breve >= 30) && q.size <= 1 && mostrati < 5) { mostrati++; console.log(`  es. ${p.id} «${p.name}» lang riga=${t.lang} lingue=[${[...q].join(',')}] lunga=${t.lunga} altre=${(p.altre || []).join(',')}`); }
}
