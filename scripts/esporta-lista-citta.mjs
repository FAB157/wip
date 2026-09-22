#!/usr/bin/env node
// LISTA DEI PIN DA PRE-ARRICCHIRE NELLE CITTA' (22/09/2026, committente: «lingue 4 e gemme 100»).
// Per ogni citta' di scripts/data/citta-prearricchimento.jsonl (le prime 20 di ogni nazione di Europa,
// Asia e America, da GeoNames) prende fino a 100 pin culturali — gemme prima, poi chi ha una fonte
// esatta (Wikidata/Wikipedia), poi gli altri — e scrive UNA RIGA PER (pin, lingua) per le 4 lingue
// della citta' (vedi lib-lingue-citta.mjs), saltando le lingue gia' presenti (shared_pois.description_lang
// o una riga in poi_details). La lista la consuma il motore gia' in uso sul droplet 104
// (driver-arricchimento-file.mjs, 5 lavoratori): stesso formato di gemme.jsonl piu' il campo `lang`.
//
// SOLA LETTURA, connessione diretta Postgres (le stesse SUPABASE_DB_* di applica-*.mjs): via REST le
// query col filtro per categoria vanno in timeout (prova a secco del 22/09: «canceling statement»),
// qui il tetto e' 120 s per query, una citta' alla volta, pausa fra una e l'altra.
//   node scripts/esporta-lista-citta.mjs [--citta=N] [--da=N] [--iso=FR,DE] [--continente=Europa] [--tetto=100]
//        [--out=scratch/lista-citta.jsonl] [--pausa=800]
// Ripartibile: --continua riprende dalla citta' dopo l'ultima scritta (stato in <out>.stato.json).
import fs from 'node:fs';
import { Client } from 'pg';
import { lingueCitta, raggioKm } from './lib-lingue-citta.mjs';

const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const tetto = Number(arg('tetto', 100)), pausaMs = Number(arg('pausa', 800));
const out = arg('out', 'scratch/lista-citta.jsonl'), STATO = `${out}.stato.json`;
const soloIso = new Set(String(arg('iso', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const soloCont = arg('continente', '');
const maxCitta = Number(arg('citta', 0)), da = Number(arg('da', 0));
const CONTINUA = A.includes('--continua');
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let citta = fs.readFileSync('scripts/data/citta-prearricchimento.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r));
if (soloCont) citta = citta.filter((c) => c.continente.toLowerCase().startsWith(soloCont.toLowerCase()));
if (soloIso.size) citta = citta.filter((c) => soloIso.has(c.iso));
citta = citta.slice(da, maxCitta ? da + maxCitta : undefined);
let stato = { indice: 0, righe: 0, pin: 0 };
if (CONTINUA) { try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {} } else { fs.mkdirSync('scratch', { recursive: true }); fs.writeFileSync(out, ''); }
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));

const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query("SET statement_timeout = '120s'");
const SQL = `
  WITH box AS (
    SELECT id, name, lat, lon, category, poi_type, city, wikidata, wikipedia_url, is_gem, description_short, description_lang
    FROM shared_pois
    WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4
      AND lat <> 'NaN'::float8 AND lon <> 'NaN'::float8
      AND is_hidden IS NOT TRUE AND coalesce(is_locked, false) = false AND coalesce(name, '') <> ''
      AND category IN ('gemme', 'monumenti', 'musei', 'chiese', 'panorami')
      AND coalesce(source, '') NOT IN ('itinerary')
      AND id !~ '^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-|ov-)'
      AND name !~* '(car ?park|parking|parcheggio|supercharger|q-park)'
  )
  SELECT b.*, coalesce(array_agg(lower(pd.language)) FILTER (WHERE pd.summary IS NOT NULL), '{}') AS lingue_pronte
  FROM box b LEFT JOIN poi_details pd ON pd.poi_id = b.id
  GROUP BY b.id, b.name, b.lat, b.lon, b.category, b.poi_type, b.city, b.wikidata, b.wikipedia_url, b.is_gem, b.description_short, b.description_lang
  ORDER BY (b.is_gem IS TRUE) DESC, (coalesce(b.wikidata, '') <> '' OR coalesce(b.wikipedia_url, '') <> '') DESC, b.id
  LIMIT $5`;

console.log(`${new Date().toISOString()} citta': ${citta.length}, tetto ${tetto} pin, riparto da ${stato.indice}, gia' ${stato.righe} righe → ${out}`);
for (; stato.indice < citta.length; stato.indice++, salva()) {
  const cit = citta[stato.indice];
  const km = raggioKm(cit.popolazione);
  const d = km / 111, dl = km / (111 * Math.max(0.15, Math.cos(cit.lat * Math.PI / 180)));
  const lingue = lingueCitta(cit.iso);
  const t0 = Date.now();
  let r;
  try { r = await c.query(SQL, [cit.lat - d, cit.lat + d, cit.lon - dl, cit.lon + dl, tetto]); }
  catch (e) { console.log(`${new Date().toISOString()} ${cit.citta} (${cit.iso}): ${e.message} — freno 60 s e riprovo`); await pausa(60000); stato.indice--; continue; }
  const ms = Date.now() - t0;
  // Prima la lingua principale per tutti i pin, poi le altre tre: cosi' il motore sul droplet
  // puo' saltare le altre lingue dei pin usciti «senza fonte» (vedi driver-citta.mjs).
  const righe = [];
  for (const [fase, l] of lingue.entries()) {
    for (const p of r.rows) {
      const pronte = new Set(p.lingue_pronte || []);
      if (p.description_short && p.description_lang) pronte.add(String(p.description_lang).toLowerCase());
      if (pronte.has(l)) continue;
      righe.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, poi_type: p.poi_type, city: p.city || cit.citta, wikidata: p.wikidata || undefined, wikipedia_url: p.wikipedia_url || undefined, is_gem: p.is_gem === true, lang: l, fase, citta: cit.citta, iso: cit.iso });
    }
  }
  if (righe.length) fs.appendFileSync(out, righe.map((x) => JSON.stringify(x)).join('\n') + '\n');
  stato.righe += righe.length; stato.pin += r.rows.length;
  const gemme = r.rows.filter((p) => p.is_gem).length;
  console.log(`${new Date().toISOString()} ${String(stato.indice + 1).padStart(4)}/${citta.length} ${cit.citta} (${cit.iso}, ±${km} km, ${ms} ms): ${r.rows.length} pin (${gemme} gemme), lingue ${lingue.join('/')}, ${righe.length} righe`);
  await pausa(ms > 5000 ? 30000 : pausaMs);
}
console.log(`${new Date().toISOString()} FINE: ${stato.pin} pin, ${stato.righe} righe (pin × lingua) → ${out}`);
await c.end();
