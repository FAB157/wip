#!/usr/bin/env node
// TUTTI I PIN CULTURALI DEL MONDO, in un file (22/09/2026, per il pre-arricchimento delle citta').
// Il riquadro geografico per citta' sul database e' lento (Parigi ±7 km: 33.750 righe, 90 s con il
// filtro categoria — la tabella e' 11 GB e ogni riga costa una lettura dal disco). La strada leggera e'
// quella di scratch/driver-esporta-liste.mjs: una categoria alla volta in scansione ORDINATA
// sull'indice (category, id), pagine da 1.000, ~0,4 s l'una, pausa fra le pagine. L'assegnazione
// alle citta' si fa DOPO, offline, in scripts/assegna-citta.mjs.
//   node scripts/esporta-culturali-mondo.mjs [--continua] [--pagina=1000] [--pausa=1500]
// Scrive scratch/lista-culturali.jsonl (+ .stato.json per riprendere).
import fs from 'fs';
import { Client } from 'pg';
const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const CONTINUA = A.includes('--continua');
const PAGINA = Number(arg('pagina', 1000)), PAUSA = Number(arg('pausa', 1500));
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const CATEGORIE = ['gemme', 'monumenti', 'musei', 'chiese', 'panorami'];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// La connessione a Supabase puo' cadere a meta' («Connection terminated unexpectedly» a 380.000 righe il
// 22/09): si riapre e si riprende dall'ultimo id, invece di morire con un errore non gestito.
let c;
async function connetti() {
  c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  c.on('error', (e) => console.log(`${new Date().toISOString()} connessione persa: ${e.message}`));
  await c.connect();
  // Stesse impostazioni dell'esportatore delle gemme: scansione ordinata dell'indice, niente bitmap/sort.
  await c.query("SET statement_timeout = '60s'; SET enable_bitmapscan = off; SET enable_sort = off; SET max_parallel_workers_per_gather = 0");
}
await connetti();
fs.mkdirSync('scratch', { recursive: true });
const out = 'scratch/lista-culturali.jsonl', STATO = `${out}.stato.json`;
let stato = { cat: 0, ultimo: '', tot: 0 };
if (CONTINUA) { try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {} } else { fs.writeFileSync(out, ''); }
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
console.log(`${new Date().toISOString()} culturali del mondo: riparto da «${CATEGORIE[stato.cat] || 'fine'}» id > «${stato.ultimo}», gia' ${stato.tot}`);
for (; stato.cat < CATEGORIE.length; stato.cat++, stato.ultimo = '', salva()) {
  const cat = CATEGORIE[stato.cat];
  let nCat = 0;
  for (;;) {
    const t0 = Date.now();
    let r;
    try {
      r = await c.query(`SELECT id, name, lat, lon, category, poi_type, city, is_gem, wikidata, wikipedia_url,
          (length(coalesce(description_short, '')) >= 30) AS ha_testo, description_lang, (coalesce(image_url, photo_url, '') <> '') AS ha_foto
        FROM shared_pois
        WHERE category = $1 AND id > $2 AND is_hidden IS NOT TRUE AND coalesce(is_locked, false) = false AND coalesce(name, '') <> ''
          AND coalesce(source, '') NOT IN ('itinerary') AND lat <> 'NaN'::float8 AND lon <> 'NaN'::float8
        ORDER BY id LIMIT ${PAGINA}`, [cat, stato.ultimo]);
    } catch (e) {
      if (/terminat|ECONNRESET|closed|not queryable|timeout expired/i.test(String(e.message))) {
        console.log(`${new Date().toISOString()} ${cat}: ${e.message} — riapro la connessione fra 15 s`);
        try { await c.end(); } catch {}
        await pausa(15000);
        try { await connetti(); } catch (e2) { console.log(`${new Date().toISOString()} riconnessione fallita: ${e2.message} — riprovo fra 60 s`); await pausa(60000); }
        continue;
      }
      console.log(`${new Date().toISOString()} ${cat}: ${e.message} — freno 2 minuti e riprovo`);
      await pausa(120000); continue;
    }
    const ms = Date.now() - t0;
    if (!r.rows.length) break;
    fs.appendFileSync(out, r.rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
    stato.tot += r.rows.length; nCat += r.rows.length; stato.ultimo = r.rows[r.rows.length - 1].id; salva();
    if (stato.tot % 20000 < PAGINA) console.log(`${new Date().toISOString()}  ${stato.tot} (${cat} ${nCat}, pagina ${ms} ms)`);
    // Le pagine qui costano 7-10 s (colonne in piu' rispetto all'esportatore delle gemme): il freno
    // scatta solo oltre i 20 s, altrimenti un milione di righe avrebbe chiesto 19 ore di soste.
    if (ms > 20000) { console.log(`${new Date().toISOString()} pagina lenta (${ms} ms): freno 60 s`); await pausa(60000); } else await pausa(PAUSA);
  }
  console.log(`${new Date().toISOString()} categoria ${cat}: ${nCat}`);
}
console.log(`${new Date().toISOString()} FINE: ${stato.tot} pin → ${out} (${Math.round(fs.statSync(out).size / 1048576)} MB)`);
await c.end();
