#!/usr/bin/env node
/**
 * Applica la migration 20260912120000_fonti_poi_archivio_privato.sql con la
 * connessione diretta (porta 5432, sessione): il pooler apre le sessioni in
 * sola lettura, quindi si spegne default_transaction_read_only prima del DDL
 * (vedi memoria infra 09/09/2026). Idempotente.
 */
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
if (!env.SUPABASE_DB_PASSWORD) { console.error('Manca SUPABASE_DB_PASSWORD in .env.local'); process.exit(1); }
const c = new Client({
  user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres',
  password: env.SUPABASE_DB_PASSWORD, port: 5432,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000,
});
await c.connect();
await c.query('SET default_transaction_read_only = off');
await c.query("SET statement_timeout = '120s'");
const sql = fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260912120000_fonti_poi_archivio_privato.sql', 'utf8');
await c.query(sql);
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fonti_poi' ORDER BY ordinal_position`);
console.log('fonti_poi:', r.rows.map(x => `${x.column_name}:${x.data_type}`).join(', '));
await c.end();
