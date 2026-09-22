#!/usr/bin/env node
// ASSEGNA I PIN ALLE CITTA' E FA LA LISTA PER IL DROPLET (22/09/2026, committente: «lingue 4 e gemme 100»).
// Legge scratch/lista-culturali.jsonl (tutti i pin culturali del mondo, da esporta-culturali-mondo.mjs) e
// scripts/data/citta-prearricchimento.jsonl (le prime 20 citta' di ogni nazione di Europa, Asia e America).
// Offline, senza database: ogni pin va alla citta' piu' vicina il cui raggio lo contiene (raggio dalla
// popolazione, vedi lib-lingue-citta.mjs); per citta' al massimo `tetto` pin — gemme prima, poi chi ha
// una fonte esatta (Wikidata/Wikipedia), poi gli altri — e per ogni pin le 4 lingue della citta', saltando
// quella in cui il pin e' gia' scritto (description_lang). Le lingue gia' in poi_details si controllano
// a parte, per id (chiave primaria: veloce), via REST.
//   node scripts/assegna-citta.mjs [--tetto=100] [--out=scratch/lista-citta.jsonl] [--senza-controllo-poi-details]
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { lingueCitta, raggioKm } from './lib-lingue-citta.mjs';

const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const tetto = Number(arg('tetto', 100)), out = arg('out', 'scratch/lista-citta.jsonl');
const controllaPoiDetails = !A.includes('--senza-controllo-poi-details');
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }

const citta = fs.readFileSync('scripts/data/citta-prearricchimento.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r));
// Griglia 0,1° per trovare in fretta le citta' vicine a un pin (un raggio massimo di 10 km ≈ 0,09°).
const cella = (lat, lon) => `${Math.floor(lat * 10)}:${Math.floor(lon * 10)}`;
const griglia = new Map();
for (const c of citta) {
  c.km = raggioKm(c.popolazione);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const k = cella(c.lat + dy * 0.1, c.lon + dx * 0.1);
    if (!griglia.has(k)) griglia.set(k, []);
    griglia.get(k).push(c);
  }
}
const distKm = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, s = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-|ov-)/;
const perCitta = new Map();
let letti = 0, assegnati = 0;
for (const r of fs.readFileSync('scratch/lista-culturali.jsonl', 'utf8').split(/\r?\n/)) {
  if (!r) continue;
  const p = JSON.parse(r); letti++;
  if (salta.test(String(p.id)) || /\b(car ?park|parking|parcheggio|supercharger|q-park)\b/i.test(String(p.name))) continue;
  let migliore = null, dMin = Infinity;
  for (const c of griglia.get(cella(p.lat, p.lon)) || []) {
    const d = distKm(p.lat, p.lon, c.lat, c.lon);
    if (d <= c.km && d < dMin) { dMin = d; migliore = c; }
  }
  if (!migliore) continue;
  const k = `${migliore.iso}:${migliore.geonameid}`;
  if (!perCitta.has(k)) perCitta.set(k, { citta: migliore, pin: [] });
  perCitta.get(k).pin.push(p); assegnati++;
}
console.log(`pin letti ${letti}, dentro una citta' ${assegnati}, citta' con pin ${perCitta.size} su ${citta.length}`);

// Precedenza: gemme, poi fonte esatta, poi gli altri; tetto per citta'.
const peso = (p) => (p.is_gem ? 100 : 0) + (p.wikidata || p.wikipedia_url ? 10 : 0) + (p.ha_testo ? 1 : 0);
const scelti = [];
for (const { citta: c, pin } of perCitta.values()) {
  pin.sort((a, b) => peso(b) - peso(a));
  for (const p of pin.slice(0, tetto)) scelti.push({ p, c });
}
console.log(`pin scelti (tetto ${tetto} per citta'): ${scelti.length}`);

// Lingue gia' presenti in poi_details (id = chiave primaria: 200 alla volta, veloce).
const pronte = new Map();
if (controllaPoiDetails) {
  const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ids = [...new Set(scelti.map((s) => s.p.id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('poi_details').select('poi_id, language').not('summary', 'is', null).in('poi_id', ids.slice(i, i + 200));
    if (error) { console.log('poi_details:', error.message); break; }
    for (const d of data || []) { if (!pronte.has(d.poi_id)) pronte.set(d.poi_id, new Set()); pronte.get(d.poi_id).add(String(d.language).toLowerCase()); }
    if (i % 4000 === 0) console.log(`  poi_details ${Math.min(i + 200, ids.length)}/${ids.length}`);
  }
}

// Una riga per (pin, lingua): per ogni citta' prima la lingua principale di tutti i pin, poi le altre tre.
const righe = [];
const perCittaScelti = new Map();
for (const s of scelti) { const k = `${s.c.iso}:${s.c.geonameid}`; if (!perCittaScelti.has(k)) perCittaScelti.set(k, { c: s.c, pin: [] }); perCittaScelti.get(k).pin.push(s.p); }
const conteggio = {};
for (const { c, pin } of perCittaScelti.values()) {
  const lingue = lingueCitta(c.iso);
  for (const [fase, l] of lingue.entries()) {
    for (const p of pin) {
      const gia = new Set(pronte.get(p.id) || []);
      if (p.ha_testo && p.description_lang) gia.add(String(p.description_lang).toLowerCase());
      if (gia.has(l)) continue;
      righe.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, poi_type: p.poi_type, city: p.city || c.citta, wikidata: p.wikidata || undefined, wikipedia_url: p.wikipedia_url || undefined, is_gem: p.is_gem === true, lang: l, fase, citta: c.citta, iso: c.iso });
      conteggio[l] = (conteggio[l] || 0) + 1;
    }
  }
}
fs.writeFileSync(out, righe.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(`righe (pin × lingua): ${righe.length}`, conteggio, `→ ${out} (${Math.round(fs.statSync(out).size / 1048576)} MB)`);
