#!/usr/bin/env node
/** Ispeziona lo schema di poi_details/poi_audioguides/api_cache (vedi applica-fonti-poi.mjs per il pattern di connessione). */
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
const r = await c.query('SELECT poi_id, language, left(summary,40) s, enriched, created_at FROM poi_details ORDER BY created_at DESC LIMIT 10');
console.log(r.rows);
const langs = await c.query('SELECT DISTINCT language, count(*) FROM poi_details GROUP BY language');
console.log('langs:', langs.rows);
const alang = await c.query("SELECT DISTINCT language, count(*) FROM poi_audioguides GROUP BY language ORDER BY count DESC LIMIT 15");
console.log('audioguide langs:', alang.rows);
await c.end();
