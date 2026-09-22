#!/usr/bin/env node
/** Applica 20260922140000_description_lang.sql con la connessione diretta (vedi applica-fonti-poi.mjs). */
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
await c.query(fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260922140000_description_lang.sql', 'utf8'));
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'shared_pois' AND column_name = 'description_lang'`);
console.log('shared_pois.description_lang:', r.rows);
await c.end();
