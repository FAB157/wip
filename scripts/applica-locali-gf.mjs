#!/usr/bin/env node
/**
 * Applica 20261003120000_locali_gf.sql IN SICUREZZA (03/10/2026).
 *
 *   node scripts/applica-locali-gf.mjs            crea la tabellina e la funzione DI PROVA, la misura, e si ferma
 *   node scripts/applica-locali-gf.mjs --scambia  come sopra e, SOLO se ogni prova passa, la mette al posto di quella vera
 *
 * Perche' cosi': il 02/10 due versioni della RPC sono andate in produzione
 * senza prova e hanno scelto piani sbagliati (chiamata appesa 100 s, chip
 * Locali lenta, /api/health 503). Qui la funzione nuova nasce come
 * «locali_pois_vicini_prova», viene chiamata col ruolo anon e un tetto di 8 s
 * su tutti i casi che la mappa usa, e sostituisce quella vera solo se ognuno
 * risponde entro SOGLIA_MS. Nessun indice, nessuna lettura di massa.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const RADICE = process.env.WIP_RADICE || 'C:/progetti/itainta';
const SCAMBIA = process.argv.includes('--scambia');
const SOGLIA_MS = 4000;
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(RADICE, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const sql = fs.readFileSync(path.join(RADICE, 'supabase/migrations/20261003120000_locali_gf.sql'), 'utf8');
const [parteTabella, parteFunzione] = sql.split('--@FUNZIONE');
const FIRMA = '(float8, float8, float8, float8, text[], integer, text[], boolean, text[], text[])';

const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = off');
await c.query(`SET statement_timeout = '15s'`);
await c.query(`SET lock_timeout = '5s'`);

await c.query(parteTabella.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n'));
console.log('[ok] tabella locali_gf');
await c.query(parteFunzione.replace(/__NOME__/g, 'locali_pois_vicini_prova'));
console.log('[ok] funzione di prova');

const lucca = [43.83, 10.48, 43.86, 10.53], versilia = [43.75, 9.3, 44.5, 11.2], italia = [36.5, 6.6, 47.1, 18.6], mondo = [-60, -170, 72, 179];
const CASI = [
  ['Lucca, Tutti', lucca, {}],
  ['Lucca, Pizza', lucca, { p_sub_category: ['pizzeria'] }],
  ['Versilia, Tutti (zoom di regione)', versilia, { p_limit: 800 }],
  ['Italia, Stellati', italia, { p_michelin: true, p_limit: 800 }],
  ['Mondo, Stellati', mondo, { p_michelin: true, p_limit: 800 }],
  ['Lucca, Gluten-Free', lucca, { p_diete: ['gluten_free'], p_limit: 800 }],
  ['Versilia, Gluten-Free', versilia, { p_diete: ['gluten_free'], p_limit: 800 }],
  ['Italia, 100% senza glutine', italia, { p_diete: ['gluten_free'], p_gf: ['dedicato'], p_limit: 800 }],
  ['Italia, senza glutine: gelaterie', italia, { p_diete: ['gluten_free'], p_gf_tipo: ['gelateria'], p_limit: 800 }],
  ['Mondo, senza glutine (solo tabellina)', mondo, { p_gf: ['dedicato', 'menu', 'opzioni'], p_limit: 800 }],
];
await c.query(`SET statement_timeout = '8s'`);
await c.query('set role anon');
let tuttoBene = true;
for (const [nome, b, extra] of CASI) {
  const p = { p_sub_category: null, p_limit: 400, p_diete: null, p_michelin: false, p_gf: null, p_gf_tipo: null, ...extra };
  const t0 = Date.now();
  try {
    const r = await c.query(
      `select id, michelin_distinzione, gf_livello from public.locali_pois_vicini_prova(p_south => $1, p_west => $2, p_north => $3, p_east => $4,
         p_sub_category => $5, p_limit => $6, p_diete => $7, p_michelin => $8, p_gf => $9, p_gf_tipo => $10)`,
      [...b, p.p_sub_category, p.p_limit, p.p_diete, p.p_michelin, p.p_gf, p.p_gf_tipo]);
    const ms = Date.now() - t0;
    const ok = ms <= SOGLIA_MS;
    if (!ok) tuttoBene = false;
    console.log(`${ok ? 'OK ' : 'LENTO'} ${String(ms).padStart(5)} ms · ${String(r.rows.length).padStart(3)} righe · stellati ${r.rows.filter((x) => /stell/.test(x.michelin_distinzione || '')).length} · senza glutine ${r.rows.filter((x) => x.gf_livello).length} · ${nome}`);
  } catch (e) {
    tuttoBene = false;
    console.log(`ERRORE (${Date.now() - t0} ms) ${nome}: ${e.message}`);
  }
}
await c.query('reset role');
await c.query(`SET statement_timeout = '15s'`);

if (!tuttoBene) {
  console.log('\nNON scambio: almeno un caso e\' lento o in errore. La funzione vera non e\' stata toccata.');
} else if (!SCAMBIA) {
  console.log('\nTutti i casi passano. Rilancia con --scambia per metterla in produzione.');
} else {
  await c.query(`begin;
    drop function if exists public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[]);
    drop function if exists public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[], boolean);
    drop function if exists public.locali_pois_vicini${FIRMA};
    ${parteFunzione.replace(/__NOME__/g, 'locali_pois_vicini')}
    commit;`);
  console.log('\n[ok] funzione vera sostituita (10 parametri, retrocompatibile con 7 e 8).');
}
await c.query(`drop function if exists public.locali_pois_vicini_prova${FIRMA}`);
const s = await fetch('https://www.wip.guide/api/health').then((r) => r.status).catch((e) => e.message);
console.log(`salute sito: ${s}`);
await c.end();
