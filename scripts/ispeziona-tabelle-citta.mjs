#!/usr/bin/env node
/** Cerca nel DB una tabella di citta'/localita' con coordinate e popolazione, per la lista delle citta' da pre-arricchire. */
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
await c.query("SET statement_timeout = '60s'");
const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%cit%' OR table_name ILIKE '%local%' OR table_name ILIKE '%geoname%' OR table_name ILIKE '%comun%' OR table_name ILIKE '%place%') ORDER BY 1");
console.log('tabelle candidate:', t.rows.map(x => x.table_name));
for (const tn of t.rows.map(x => x.table_name)) {
  const cols = await c.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [tn]);
  console.log(' -', tn, ':', cols.rows.map(x => x.column_name).join(', '));
}
// shared_pois: localita' con popolazione?
const loc = await c.query("SELECT count(*) FROM shared_pois WHERE category = 'localita'");
console.log("shared_pois category='localita':", loc.rows[0].count);
const tdKeys = await c.query("SELECT key, count(*) FROM (SELECT jsonb_object_keys(technical_data) AS key FROM shared_pois WHERE category='localita' AND technical_data IS NOT NULL LIMIT 20000) s GROUP BY key ORDER BY 2 DESC LIMIT 15");
console.log('chiavi technical_data delle localita:', tdKeys.rows);
await c.end();
