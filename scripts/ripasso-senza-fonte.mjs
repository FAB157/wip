// RIPASSO DEI «SENZA FONTE» (02/10/2026). Fino a oggi un 429 di Wikimedia diventava «nessuna fonte»:
// il giro veloce del mondo (wip-mondo) ne ha contati 282.075 su 402.312, senza registro per id.
// Qui si rilegge la STESSA lista dalla riga --da alla riga --a, si chiede al database quali luoghi
// sono ancora senza testo (lettura per chiave primaria, a lotti) e solo quelli si rimandano alla
// rotta, in modalita` `fast` come il giro originale (senza modello). Un guasto NON conta come esito:
// il luogo finisce in <stato>.guasti.jsonl. Con il sito non sano si aspetta. Ripartibile.
//
//   node ripasso-senza-fonte.mjs --lista=/root/wip-mondo/lavori/lista-mondo.jsonl --a=402312
//     [--da=0] [--passo=1] [--limite=0] [--lavoratori=2] [--pausa=3000] [--base=http://127.0.0.1:3010]
//     [--stato=/root/citta/ripasso-senza-fonte.stato.json]
import fs from 'node:fs';
import readline from 'node:readline';
import pg from '/root/arrivo-v4/node_modules/pg/lib/index.js';
const { Client } = pg;

const A = process.argv.slice(2);
const opt = (n, d) => { const a = A.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const LISTA = opt('lista', ''), DA = Number(opt('da', 0)), FINO = Number(opt('a', 0)) || Infinity, PASSO = Math.max(1, Number(opt('passo', 1)));
const LIMITE = Number(opt('limite', 0)) || Infinity, LAV = Number(opt('lavoratori', 2)), PAUSA = Number(opt('pausa', 3000));
const BASE = opt('base', 'http://127.0.0.1:3010');
const STATO = opt('stato', '/root/citta/ripasso-senza-fonte.stato.json');
const SEG = (fs.readFileSync(process.env.ENVF || '/root/citta/.env', 'utf8')).match(/^SCRIPT_SHARED_SECRET=(.*)$/m)?.[1]?.trim();
if (!LISTA || !SEG) { console.error('mancano --lista o SCRIPT_SHARED_SECRET'); process.exit(1); }

const pw = fs.readFileSync('/root/fase-b/fase-b-ciclo.cjs', 'utf8').match(/password:\s*'([^']+)'/)?.[1];
const nuovoDb = async () => { const c = new Client({ host: 'aws-0-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.qfxxhzkkrkvbuekfknhh', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } }); c.on('error', () => {}); await c.connect(); return c; };
let db = await nuovoDb();

let stato = { riga: DA, visti: 0, giaConTesto: 0, nonTrovati: 0, riprovati: 0, recuperati: 0, conFoto: 0, ancoraVuoti: 0, guasti: 0, errori: 0 };
try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {}
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const saluteOk = async () => { try { const t0 = Date.now(); const r = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) }); return r.ok && Date.now() - t0 < 1500; } catch { return false; } };

async function uno(p) {
  let j = {}, s = 0;
  for (let giro = 0; giro < 2; giro++) {
    try {
      const r = await fetch(`${BASE}/api/poi/enrich`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': SEG }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, subCategory: p.poi_type, lang: 'it', fast: true, mode: 'short', motivo: 'ripasso_senza_fonte' }) });
      s = r.status; j = await r.json().catch(() => ({}));
    } catch { s = 0; j = {}; }
    if (s === 200 && !j.ricerca_guasta && !j.salvataggio_fallito) break;
    await pausa(25000);
  }
  stato.riprovati++;
  if (s !== 200) { stato.errori++; return; }
  if (j.ricerca_guasta || j.salvataggio_fallito) { stato.guasti++; try { fs.appendFileSync(`${STATO}.guasti.jsonl`, JSON.stringify(p) + '\n'); } catch {} return; }
  const breve = String(j.description_short || j.extract || '').trim();
  if (j.thumbnail) stato.conFoto++;
  if (breve.length >= 30 && !j.solo_dati) { stato.recuperati++; try { fs.appendFileSync(`${STATO}.recuperati.tsv`, `${p.id}\t${breve.length}\t${j.pageUrl || ''}\n`); } catch {} }
  else stato.ancoraVuoti++;
}

async function lotto(righe) {
  let attesa = 1;
  while (!(await saluteOk())) { console.log(`${new Date().toISOString()} sito non sano: pausa ${attesa} min`); await pausa(attesa * 60000); attesa = Math.min(attesa * 2, 10); }
  let conTesto = null;
  for (let t = 0; t < 3 && !conTesto; t++) {
    try {
      const r = await db.query(`select id, (greatest(coalesce(char_length(description_short),0), coalesce(char_length(description_long),0), coalesce(char_length(description_ai),0)) >= 30) as pieno from shared_pois where id = any($1::text[]) and is_hidden is not true`, [righe.map((x) => x.id)]);
      conTesto = new Map(r.rows.map((x) => [x.id, x.pieno]));
    } catch (e) { console.log('lettura fallita:', e.message); await pausa(15000); try { await db.end(); } catch {} try { db = await nuovoDb(); } catch {} }
  }
  if (!conTesto) return false;
  const coda = [];
  for (const p of righe) {
    stato.visti++;
    if (!conTesto.has(p.id)) stato.nonTrovati++; else if (conTesto.get(p.id)) stato.giaConTesto++; else coda.push(p);
  }
  await Promise.all(Array.from({ length: LAV }, async () => { while (coda.length) { await uno(coda.shift()); await pausa(PAUSA); } }));
  return true;
}

console.log(`${new Date().toISOString()} ripasso senza fonte: righe ${stato.riga}→${FINO} passo ${PASSO}, lavoratori ${LAV}, verso ${BASE}`);
const rl = readline.createInterface({ input: fs.createReadStream(LISTA), crlfDelay: Infinity });
let i = -1, buf = [], ultimaRiga = stato.riga;
for await (const riga of rl) {
  i++;
  if (i < stato.riga) continue;
  if (i >= FINO || stato.riprovati >= LIMITE) break;
  ultimaRiga = i + 1;
  if ((i - DA) % PASSO !== 0 || !riga) continue;
  try { const p = JSON.parse(riga); if (p?.id && p?.name) buf.push(p); } catch { /* riga rotta */ }
  if (buf.length >= 200) {
    if (await lotto(buf)) { stato.riga = ultimaRiga; salva(); }
    buf = [];
    console.log(`${new Date().toISOString()} riga ${stato.riga} | visti ${stato.visti} | gia' con testo ${stato.giaConTesto} | riprovati ${stato.riprovati} | RECUPERATI ${stato.recuperati} | ancora vuoti ${stato.ancoraVuoti} | guasti ${stato.guasti} | errori ${stato.errori} | foto ${stato.conFoto}`);
    await pausa(3000);
  }
}
if (buf.length && await lotto(buf)) { stato.riga = ultimaRiga; salva(); }
console.log(`${new Date().toISOString()} FINITO ${JSON.stringify(stato)}`);
try { await db.end(); } catch {}
