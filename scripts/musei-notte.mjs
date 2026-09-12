#!/usr/bin/env node
/**
 * IL GIRO NOTTURNO DEI MUSEI (12/09/2026, punto 4 del piano): una notte, un
 * blocco di musei prioritari per rango, tutte le passate in fila, ognuna
 * idempotente (salta quanto è già fatto):
 *   1. fonti_poi (Wikipedia 7 lingue, Wikidata, Wikivoyage, Commons, sito + PDF)
 *   2. piante da altre fonti (Wikidata P3311, Commons, Wayback) per chi non ne ha
 *   3. PDF → immagini + testo (mupdf)
 *   4. verifica piante a due modelli + pin (Gemini, GPT-4o-mini, GPT-4o)
 * Si ferma da solo quando un passo fallisce per quota (429) tre volte: la
 * notte dopo riparte dallo stesso punto.
 *
 *   node scripts/musei-notte.mjs --da 1 --a 100        # ranghi 1-100
 *   node scripts/musei-notte.mjs --blocco 100          # i primi 100 non ancora completi
 * Sul droplet: crontab «0 2 * * * cd /root/itainta && node scripts/musei-notte.mjs --blocco 100 >> /var/log/musei-notte.log 2>&1»
 * Le guide e le audioguide delle opere NON sono qui: le fa la semina della
 * sessione libreria (semina-musei sul droplet 104), che legge da fonti_poi.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(process.cwd(), f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const SB = env.VITE_SUPABASE_URL || env.SUPABASE_URL; const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DA = parseInt(arg('--da', '1'), 10), A = parseInt(arg('--a', '0'), 10), BLOCCO = parseInt(arg('--blocco', '100'), 10);

// La lista del giro: dai musei prioritari per rango.
const rows = await (await fetch(`${SB}/rest/v1/musei_prioritari?select=qid,rango,nome,lat,lon,sito&order=rango&limit=1000`, { headers: H })).json();
if (!Array.isArray(rows) || !rows.length) { console.error('musei_prioritari vuota: node scripts/musei-prioritari-carica.mjs <lista>'); process.exit(1); }
let lista = A > 0 ? rows.filter(r => r.rango >= DA && r.rango <= A) : rows.filter(r => r.rango >= DA).slice(0, BLOCCO);
const file = path.join(process.cwd(), 'scratch', `giro-notte-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(lista.map(r => ({ qid: r.qid, nome: r.nome, lat: r.lat, lon: r.lon, sito: r.sito }))));
console.log(`[notte] ${new Date().toISOString()} musei ${lista.length} (ranghi ${lista[0]?.rango}-${lista[lista.length - 1]?.rango})`);

const passi = [
  ['fonti', ['scripts/fonti-passata-musei.mjs', '--lista', file]],
  ['altre fonti piante', ['scripts/mappe-altre-fonti.mjs', '--lista', file]],
  ['pdf → immagini', ['scripts/mappe-pdf-rasterizza.mjs']],
  ['verifica piante + pin', ['scripts/mappe-auto-pins.mjs']],
];
for (const [nome, args] of passi) {
  const t0 = Date.now();
  console.log(`\n[notte] ── ${nome} ──`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env, timeout: 3 * 60 * 60 * 1000 });
  console.log(`[notte] ${nome}: exit ${r.status} in ${Math.round((Date.now() - t0) / 60000)} min`);
  if (r.status !== 0 && r.status !== null) { console.log('[notte] passo fallito: mi fermo, la prossima notte si riparte da qui'); process.exit(r.status); }
}
console.log(`[notte] fine ${new Date().toISOString()}`);
