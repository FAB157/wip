#!/usr/bin/env node
/** Applica 20260912180000_musei_directory.sql con la connessione diretta (vedi applica-fonti-poi.mjs). */
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
await c.query("SET statement_timeout = '120s'");
await c.query(fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260912180000_musei_directory.sql', 'utf8'));
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'musei_directory' ORDER BY ordinal_position`);
console.log('musei_directory:', r.rows.map(x => x.column_name).join(', '));
await c.end();
