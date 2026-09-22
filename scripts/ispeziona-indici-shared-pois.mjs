#!/usr/bin/env node
/** Tempi delle varianti «veloci» per riquadro (Parigi ±7 km): gemme, con Wikipedia, con Wikidata — via indici parziali. */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query("SET statement_timeout = '90s'");
const lat = 48.85341, lon = 2.3488, km = 7, d = km / 111, dl = km / (111 * Math.cos(lat * Math.PI / 180));
const bbox = `lat BETWEEN ${lat - d} AND ${lat + d} AND lon BETWEEN ${lon - dl} AND ${lon + dl}`;
const CAT = `category IN ('gemme','monumenti','musei','chiese','panorami')`;
const varianti = {
  'gemme (indice parziale is_gem)': `SELECT count(*) FROM shared_pois WHERE ${bbox} AND is_gem = true`,
  'con wikipedia_url (indice parziale)': `SELECT count(*) FROM shared_pois WHERE ${bbox} AND wikipedia_url IS NOT NULL AND ${CAT}`,
  'con wikidata (indice parziale)': `SELECT count(*) FROM shared_pois WHERE ${bbox} AND wikidata IS NOT NULL AND ${CAT}`,
  'senza foto (indice parziale) + cat': `SELECT count(*) FROM shared_pois WHERE ${bbox} AND image_url IS NULL AND photo_url IS NULL AND ${CAT}`,
};
for (const [nome, sql] of Object.entries(varianti)) {
  const t0 = Date.now();
  try {
    const plan = await c.query(`EXPLAIN (FORMAT TEXT) ${sql}`);
    const r = await c.query(sql);
    console.log(`\n== ${nome}: ${r.rows[0].count} righe in ${Date.now() - t0} ms`);
    console.log(plan.rows.slice(0, 7).map((x) => '   ' + x['QUERY PLAN']).join('\n'));
  } catch (e) { console.log(`\n== ${nome}: ERRORE ${e.message} dopo ${Date.now() - t0} ms`); }
}
await c.end();
