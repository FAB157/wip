#!/usr/bin/env node
/** Applica 20260917080000_foto_pois_da_verificare.sql con la connessione diretta (vedi applica-mappe-museo.mjs). */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
const BASE_DIR = process.env.SEMINA_DIR || '.';
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(BASE_DIR, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = off');
await c.query("SET statement_timeout = '120s'");
await c.query(fs.readFileSync(path.join(BASE_DIR, 'supabase/migrations/20260917080000_foto_pois_da_verificare.sql'), 'utf8'));
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'foto_pois_da_verificare' ORDER BY ordinal_position`);
console.log('foto_pois_da_verificare:', r.rows.map(x => x.column_name).join(', '));
await c.end();
