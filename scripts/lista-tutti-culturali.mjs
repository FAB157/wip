#!/usr/bin/env node
// LA LISTA DI TUTTI I PIN CULTURALI DEL MONDO PER IL PRE-ARRICCHIMENTO (22/09/2026, committente: «tutti i POI
// culturali iniziando dalle gemme», «1 lingua e tradurre tutte le altre», «fallo per tutte le 7 lingue»).
// Legge scratch/lista-culturali.jsonl (1,1 milioni di pin, da esporta-culturali-mondo.mjs) e scrive UNA riga per pin:
//   lang        = lingua in cui generare (la lingua del posto se e' una delle 7 dell'app, altrimenti italiano),
//                 oppure la lingua in cui il testo e' GIA' scritto (description_lang) se il pin ha gia' un testo;
//   altre       = le altre lingue dell'app da tradurre da quella (quelle gia' in poi_details si tolgono);
//   solo_traduci= true se il testo c'e' gia': niente generazione, solo le traduzioni.
// Ordine: 1) gemme, 2) pin dentro una delle 2.179 citta' principali, 3) pin con fonte esatta (Wikidata/Wikipedia),
// 4) tutti gli altri. La lingua del posto si ricava dalla citta' GeoNames piu' vicina (cities15000, 26.000 citta').
// Offline; l'unica lettura dal database sono le lingue gia' presenti in poi_details (per id, chiave primaria).
//   node scripts/lista-tutti-culturali.mjs --geonames=<cartella con cities15000.txt> [--out=scratch/lista-tutti-culturali.jsonl]
//        [--senza-controllo-poi-details]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { LINGUA_PAESE, raggioKm } from './lib-lingue-citta.mjs';

const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const geonames = arg('geonames', ''), out = arg('out', 'scratch/lista-tutti-culturali.jsonl');
const controllaPoiDetails = !A.includes('--senza-controllo-poi-details');
if (!geonames) { console.error('uso: --geonames=<cartella con cities15000.txt>'); process.exit(1); }
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const LINGUE = ['it', 'en', 'es', 'fr', 'de', 'ru', 'zh'];

// Griglia 0,5° delle 26.000 citta' GeoNames: per ogni pin la piu' vicina entro 150 km da' il paese → la lingua del posto.
const cella = (lat, lon, passo) => `${Math.floor(lat / passo)}:${Math.floor(lon / passo)}`;
const grigliaMondo = new Map();
for (const r of fs.readFileSync(path.join(geonames, 'cities15000.txt'), 'utf8').split(/\r?\n/)) {
  if (!r) continue;
  const c = r.split('\t');
  const citta = { lat: Number(c[4]), lon: Number(c[5]), cc: c[8] };
  const k = cella(citta.lat, citta.lon, 0.5);
  if (!grigliaMondo.has(k)) grigliaMondo.set(k, []);
  grigliaMondo.get(k).push(citta);
}
const distKm = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, s = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
function paeseVicino(lat, lon) {
  let best = null, dMin = Infinity;
  const cy = Math.floor(lat / 0.5), cx = Math.floor(lon / 0.5);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    for (const c of grigliaMondo.get(`${cy + dy}:${cx + dx}`) || []) {
      const d = distKm(lat, lon, c.lat, c.lon);
      if (d < dMin) { dMin = d; best = c; }
    }
  }
  return best && dMin <= 150 ? best.cc : null;
}

// Le 2.179 citta' principali (livello 2 dell'ordine).
const principali = fs.readFileSync('scripts/data/citta-prearricchimento.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r));
const grigliaPrincipali = new Map();
for (const c of principali) {
  c.km = raggioKm(c.popolazione);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = cella(c.lat + dy * 0.1, c.lon + dx * 0.1, 0.1); if (!grigliaPrincipali.has(k)) grigliaPrincipali.set(k, []); grigliaPrincipali.get(k).push(c); }
}
const inCittaPrincipale = (lat, lon) => (grigliaPrincipali.get(cella(lat, lon, 0.1)) || []).some((c) => distKm(lat, lon, c.lat, c.lon) <= c.km);

const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-|ov-)/;
const pin = [];
let letti = 0;
const rl = readline.createInterface({ input: fs.createReadStream('scratch/lista-culturali.jsonl'), crlfDelay: Infinity });
for await (const r of rl) {
  if (!r) continue;
  const p = JSON.parse(r); letti++;
  if (salta.test(String(p.id)) || /\b(car ?park|parking|parcheggio|supercharger|q-park)\b/i.test(String(p.name))) continue;
  const livello = p.is_gem ? 0 : inCittaPrincipale(p.lat, p.lon) ? 1 : (p.wikidata || p.wikipedia_url) ? 2 : 3;
  const cc = paeseVicino(p.lat, p.lon);
  const locale = (cc && LINGUA_PAESE[cc]) || 'it';
  // Testo gia' presente: si traduce da quella lingua (NULL = righe vecchie, quasi sempre italiano).
  const scritta = p.ha_testo ? (String(p.description_lang || 'it').toLowerCase().slice(0, 2)) : null;
  pin.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, poi_type: p.poi_type, city: p.city || undefined, wikidata: p.wikidata || undefined, wikipedia_url: p.wikipedia_url || undefined, is_gem: p.is_gem === true, livello, lang: scritta || locale, solo_traduci: !!scritta });
  if (letti % 200000 === 0) console.log(`  letti ${letti}`);
}
console.log(`pin letti ${letti}, tenuti ${pin.length}`);
pin.sort((a, b) => a.livello - b.livello);
const perLivello = {}; for (const p of pin) perLivello[p.livello] = (perLivello[p.livello] || 0) + 1;
console.log('per livello (0 gemme, 1 citta principali, 2 con fonte, 3 altri):', perLivello);

// Lingue gia' in poi_details (per id, 200 alla volta): ~5.500 chiamate per 1,1 milioni di id, chiave primaria.
const pronte = new Map();
if (controllaPoiDetails) {
  const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (let i = 0; i < pin.length; i += 200) {
    const ids = pin.slice(i, i + 200).map((p) => p.id);
    const { data, error } = await sb.from('poi_details').select('poi_id, language').not('summary', 'is', null).in('poi_id', ids);
    if (error) { console.log('poi_details:', error.message); await new Promise((r) => setTimeout(r, 5000)); i -= 200; continue; }
    for (const d of data || []) { if (!pronte.has(d.poi_id)) pronte.set(d.poi_id, new Set()); pronte.get(d.poi_id).add(String(d.language).toLowerCase()); }
    if (i % 100000 === 0) console.log(`  poi_details ${i}/${pin.length} (${pronte.size} pin con lingue gia' pronte)`);
  }
}
const ws = fs.createWriteStream(out);
let generazioni = 0, traduzioni = 0;
for (const p of pin) {
  const gia = new Set(pronte.get(p.id) || []);
  if (p.solo_traduci) gia.add(p.lang);
  const altre = LINGUE.filter((l) => l !== p.lang && !gia.has(l));
  if (p.solo_traduci && !altre.length) continue; // tutto gia' fatto
  if (!p.solo_traduci) generazioni++;
  traduzioni += altre.length;
  const { livello, ...riga } = p;
  ws.write(JSON.stringify({ ...riga, altre }) + '\n');
}
await new Promise((r) => ws.end(r));
console.log(`righe scritte → ${out} (${Math.round(fs.statSync(out).size / 1048576)} MB): generazioni ${generazioni}, traduzioni ${traduzioni}`);
