#!/usr/bin/env node
/**
 * I FALSI «RISTORANTI STELLATI» DEL LIVELLO LUSSO (03/10/2026).
 *
 *   node scripts/correggi-lusso-stellati.mjs <ristoranti_michelin_mondo_completo.csv>            prova: conta, NON scrive
 *   node scripts/correggi-lusso-stellati.mjs <csv> --scrivi                                       scrive
 *
 * Il livello Lusso aveva 2.857 «ristoranti stellati» importati da OpenStreetMap
 * (shared_pois, category 'lusso', poi_type 'ristoranti_stellati'): confrontati
 * con la Guida completa (scraper del 02-03/10) solo 720 hanno davvero una
 * stella. Committente: «correggi». Chi la Guida NON conferma come stellato
 * (assente, solo selezionato, Bib Gourmand) passa fra i ristoranti normali:
 * category 'locali', poi_type 'ristorante'. NON si cancella niente.
 *
 * REGOLE
 * - Prima di scrivere, i valori precedenti (id, nome, category, poi_type) vanno
 *   in scratch/backup-lusso-stellati-<data>.csv: per tornare indietro basta
 *   rimetterli (CLAUDE.md, «mai in massa senza registro dei valori di prima»).
 * - Confermato = nome che combacia (tutte le parole proprie del piu' corto
 *   nell'altro) entro 150 m da un ristorante con 1, 2 o 3 stelle.
 * - Una riga per volta, per chiave esatta (id), pausa 250 ms, /api/health ogni
 *   100: niente update «di massa» su shared_pois (incidenti del 24/09 e 02/10).
 *   I trigger che scattano su category/poi_type aggiornano solo pin_mappa e
 *   pin_mappa_servizi: nessuna chiamata di arricchimento o audio.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const RADICE = process.env.WIP_RADICE || 'C:/progetti/itainta';
const args = process.argv.slice(2);
const fileCsv = args.find((a) => !a.startsWith('--'));
const SCRIVI = args.includes('--scrivi');
if (!fileCsv) { console.error('Uso: node scripts/correggi-lusso-stellati.mjs <csv Guida completa> [--scrivi]'); process.exit(1); }

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(RADICE, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// ── la Guida
const t = fs.readFileSync(fileCsv, 'utf8');
const righe = []; let r = [], c = '', q = false;
for (let i = 0; i < t.length; i++) { const ch = t[i];
  if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
  else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); righe.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
const h = righe.shift(); const col = (n) => h.indexOf(n);
const guida = righe.map((x) => ({ nome: x[col('Nome')], d: x[col('Distinzione_Michelin')], lat: +x[col('Latitudine')], lon: +x[col('Longitudine')] })).filter((g) => Number.isFinite(g.lat));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const GEN = new Set('ristorante restaurant restaurante trattoria osteria locanda the il la le da di del al bistrot bistro de du des les el'.split(' '));
const parole = (s) => norm(s).split(' ').filter((w) => w.length > 1 && !GEN.has(w));
const dist = (a, b, c2, d) => { const R = 6371000, x = (c2 - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const s = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c2 * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const griglia = new Map();
for (const g of guida) { const k = `${Math.round(g.lat * 100)}|${Math.round(g.lon * 100)}`; (griglia.get(k) || griglia.set(k, []).get(k)).push(g); }
const vicini = (lat, lon) => { const out = []; const a = Math.round(lat * 100), b = Math.round(lon * 100); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(griglia.get(`${a + i}|${b + j}`) || [])); return out; };
function nellaGuida(p) {
  const pa = parole(p.nome);
  return vicini(+p.lat, +p.lon).filter((g) => dist(+p.lat, +p.lon, g.lat, g.lon) < 150).find((g) => {
    const pb = parole(g.nome); const [s, l] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
    return norm(g.nome) === norm(p.nome) || (s.length > 0 && s.every((w) => l.includes(w)));
  }) || null;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function saluteSitoOk() {
  try {
    const t0 = Date.now();
    const res = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    if (!res.ok || ms > 2500) { console.log(`[salute] /api/health non ok o lento (status ${res.status}, ${ms} ms)`); return false; }
    return true;
  } catch (e) { console.log(`[salute] /api/health irraggiungibile: ${e.message}`); return false; }
}

const cl = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await cl.connect();
await cl.query('SET default_transaction_read_only = off');
await cl.query(`SET statement_timeout = '8s'`);

// --da-backup=<csv>: riprende da una copia gia' salvata (id + valori di prima), SENZA rileggere il
// livello. pin_mappa_servizi ha 9,4M di righe e nessun indice su category: la lettura iniziale e'
// andata in timeout su Oracle (03/10/2026). Qui solo update per chiave esatta; le righe gia'
// corrette (category non piu' 'lusso') vengono saltate dall'update stesso.
const daBackup = (args.find((a) => a.startsWith('--da-backup=')) || '').split('=').slice(1).join('=');
if (daBackup) {
  const testo = fs.readFileSync(daBackup, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const ids = testo.map((l) => l.split(',')[0]).filter((x) => x && !x.startsWith('"'));
  console.log(`da copia: ${ids.length} id (${daBackup})`);
  if (!SCRIVI) { console.log('PROVA: nessuna scrittura.'); await cl.end(); process.exit(0); }
  let fatte = 0, saltate = 0, errori = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      const r = await cl.query(`update public.shared_pois set category = 'locali', poi_type = 'ristorante' where id = $1 and category = 'lusso' and poi_type in ('ristoranti_stellati','ristorante_stellato')`, [ids[i]]);
      if (r.rowCount) fatte++; else saltate++;
    } catch (e) {
      if (++errori <= 10) console.log(`[errore] ${ids[i]}: ${e.message}`);
      if (errori > 30) { console.log('[STOP] troppi errori.'); break; }
    }
    await sleep(250);
    if ((i + 1) % 100 === 0) {
      console.log(`… ${i + 1}/${ids.length} · corrette ora ${fatte} · gia' corrette ${saltate}`);
      let male = 0;
      while (!(await saluteSitoOk())) {
        if (++male >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila: mi fermo. Rilanciabile.'); await cl.end(); process.exit(0); }
        await sleep(60000);
      }
    }
  }
  console.log(`FATTO: corrette ora ${fatte}, gia' corrette prima ${saltate}, errori ${errori}. Valori di prima: ${daBackup}`);
  await cl.end();
  process.exit(0);
}

// Le righe del livello e, per id esatto, quelle d'origine in shared_pois.
const lusso =(await cl.query(`select id, nome, lat, lon from public.pin_mappa_servizi where category = 'lusso' and sub_category in ('ristoranti_stellati','ristorante_stellato') and fonte = 'shared_pois'`)).rows;
const daCorreggere = [];
const esito = { confermati: 0, bib: 0, selezionati: 0, assenti: 0 };
for (const p of lusso) {
  const g = nellaGuida(p);
  if (g && /Stell/.test(g.d)) { esito.confermati++; continue; }
  if (g && /Bib/.test(g.d)) esito.bib++; else if (g) esito.selezionati++; else esito.assenti++;
  daCorreggere.push(p);
}
console.log(`«stellati» nel livello: ${lusso.length} · confermati dalla Guida: ${esito.confermati} · da spostare fra i ristoranti: ${daCorreggere.length} (assenti ${esito.assenti}, selezionati ${esito.selezionati}, Bib ${esito.bib})`);

// Valori precedenti, letti da shared_pois a gruppi di 200 id (chiave primaria).
const prima = [];
for (let i = 0; i < daCorreggere.length; i += 200) {
  const ids = daCorreggere.slice(i, i + 200).map((p) => p.id);
  prima.push(...(await cl.query(`select id, name, category, poi_type from public.shared_pois where id = any($1)`, [ids])).rows);
}
const cella = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const backup = path.join(RADICE, 'scratch', `backup-lusso-stellati-${new Date().toISOString().slice(0, 10)}.csv`);
fs.writeFileSync(backup, 'id,name,category,poi_type\n' + prima.map((x) => [x.id, x.name, x.category, x.poi_type].map(cella).join(',')).join('\n') + '\n', 'utf8');
console.log(`valori precedenti salvati: ${prima.length} righe → ${backup}`);

if (!SCRIVI) { console.log('PROVA: nessuna scrittura. Rilancia con --scrivi.'); await cl.end(); process.exit(0); }

let fatte = 0, errori = 0;
for (let i = 0; i < prima.length; i++) {
  const x = prima[i];
  if (x.category !== 'lusso' || !/stellat/.test(String(x.poi_type || ''))) continue;   // gia' corretta o cambiata da altri: non si tocca
  try {
    await cl.query(`update public.shared_pois set category = 'locali', poi_type = 'ristorante' where id = $1 and category = 'lusso'`, [x.id]);
    fatte++;
  } catch (e) {
    if (++errori <= 10) console.log(`[errore] ${x.id}: ${e.message}`);
    if (errori > 30) { console.log('[STOP] troppi errori.'); break; }
  }
  await sleep(250);
  if ((i + 1) % 100 === 0) {
    console.log(`… ${i + 1}/${prima.length} · corrette ${fatte}`);
    let male = 0;
    while (!(await saluteSitoOk())) {
      if (++male >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila: mi fermo. Rilanciabile.'); await cl.end(); process.exit(0); }
      await sleep(60000);
    }
  }
}
console.log(`FATTO: ${fatte} righe spostate fra i ristoranti (category 'locali', poi_type 'ristorante'), errori ${errori}. Per tornare indietro: ${backup}`);
await cl.end();
