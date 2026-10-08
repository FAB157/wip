#!/usr/bin/env node
/** Applica 20260927150000_gist_denominazioni_e_route_geometries.sql. */
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
await c.query('SET default_transaction_read_only = off');
await c.query("SET statement_timeout = '5min'");
await c.query(fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260927150000_gist_denominazioni_e_route_geometries.sql', 'utf8'));
const a = await c.query(`select count(*) from denominazioni_geometrie where bbox is not null`);
const b = await c.query(`select count(*) from route_geometries where bbox is not null`);
console.log('denominazioni_geometrie con bbox:', a.rows[0].count);
console.log('route_geometries con bbox:', b.rows[0].count);
await c.end();
