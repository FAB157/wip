#!/usr/bin/env node
/** Applica 20260927110000_pin_mappa_servizi.sql con la connessione diretta (vedi applica-description-lang.mjs). */
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
await c.query("SET statement_timeout = '10min'");
await c.query(fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260927110000_pin_mappa_servizi.sql', 'utf8'));
const r = await c.query(`SELECT fonte, count(*) FROM pin_mappa_servizi GROUP BY fonte ORDER BY fonte`);
console.log('pin_mappa_servizi riempita:', r.rows);
await c.end();
