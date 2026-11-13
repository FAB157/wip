#!/usr/bin/env node
/**
 * Crea (se manca) e riempie public.musei_prioritari dalla lista per
 * notorietà: scratch/top100-musei.json (i primi 100, filtrata dall'altra
 * sessione) e, se c'è, scratch/top500-musei.json. Formato: array di
 * {qid, nome, lat, lon, sito, paese?, sitelinks?|fama?}. Rango = posizione.
 *   node scripts/musei-prioritari-carica.mjs scratch/top100-musei.json [scratch/top500-musei.json]
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
const file = process.argv.slice(2).filter(Boolean);
if (!file.length) { console.error('Uso: node scripts/musei-prioritari-carica.mjs <lista.json> [...]'); process.exit(1); }
const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = off');
await c.query("SET statement_timeout = '120s'");
await c.query(fs.readFileSync('C:/progetti/itainta/supabase/migrations/20260912150000_musei_prioritari.sql', 'utf8'));
const visti = new Set(); let rango = 0, scritti = 0;
for (const f of file) {
  const lista = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const m of lista) {
    if (!m?.qid || visti.has(m.qid)) continue; visti.add(m.qid); rango++;
    await c.query(`INSERT INTO public.musei_prioritari (qid, rango, nome, lat, lon, sito, paese, sitelinks, aggiornato_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (qid) DO UPDATE SET rango = EXCLUDED.rango, nome = EXCLUDED.nome, lat = EXCLUDED.lat, lon = EXCLUDED.lon, sito = COALESCE(EXCLUDED.sito, musei_prioritari.sito), paese = COALESCE(EXCLUDED.paese, musei_prioritari.paese), sitelinks = COALESCE(EXCLUDED.sitelinks, musei_prioritari.sitelinks), aggiornato_at = now()`,
      [m.qid, rango, String(m.nome || m.qid), Number.isFinite(+m.lat) ? +m.lat : null, Number.isFinite(+m.lon) ? +m.lon : null, m.sito || null, m.paese || null, Number.isFinite(+(m.sitelinks ?? m.fama)) ? +(m.sitelinks ?? m.fama) : null]);
    scritti++;
  }
}
const n = await c.query('SELECT count(*)::int AS n FROM public.musei_prioritari');
console.log(`scritti ${scritti}; in tabella ${n.rows[0].n}`);
await c.end();
