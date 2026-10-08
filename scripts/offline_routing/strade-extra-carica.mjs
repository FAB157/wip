// Carica le tile «extra» nel deposito road_tiles (vedi strade-extra-celle.mjs).
// Piano: pochi file al secondo, e ci si ferma da soli se il sito soffre — il database è piccolo e ogni
// file caricato è una riga in storage.objects. Riprende da dove si era fermato (file di stato).
// Uso: node strade-extra-carica.mjs <cartella-tile> [--al-secondo=6] [--prova]
// Chiavi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY dall'ambiente o da /root/itainta/.env (mai stampate).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const alSecondo = Number((process.argv.find(a => a.startsWith('--al-secondo=')) || '').split('=')[1]) || 6;
const PROVA = process.argv.includes('--prova');
if (!dir) { console.error('uso: node strade-extra-carica.mjs <cartella-tile> [--al-secondo=6] [--prova]'); process.exit(2); }

const env = { ...process.env };
for (const f of ['/root/itainta/.env', '/root/itainta/.env.local']) {
  if (!fs.existsSync(f)) continue;
  for (const riga of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const URL_BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const CHIAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHIAVE) { console.error('mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const fileStato = path.join(dir, '..', path.basename(dir) + '.caricati.txt');
const fatti = new Set(fs.existsSync(fileStato) ? fs.readFileSync(fileStato, 'utf8').split('\n').filter(Boolean) : []);
const tutti = fs.readdirSync(dir).filter(n => n.endsWith('_extra.json.gz') && !fatti.has(n));
console.error(`${tutti.length} da caricare (${fatti.size} già fatti), ${alSecondo} al secondo${PROVA ? ' — PROVA, non carico' : ''}`);

const pausa = (ms) => new Promise(ok => setTimeout(ok, ms));
async function sitoSano() {
  try { const r = await fetch('https://wip.guide/api/health', { signal: AbortSignal.timeout(8000) }); return r.ok; } catch { return false; }
}
let ok = 0, ko = 0, fermate = 0;
for (let i = 0; i < tutti.length; i++) {
  const nome = tutti[i];
  if (i % 300 === 0 && i > 0) {
    while (!(await sitoSano())) { fermate++; console.error(`sito in affanno: fermo 90 s (${fermate})`); await pausa(90_000); }
    console.error(`${i}/${tutti.length} · ok ${ok} · falliti ${ko}`);
  }
  if (PROVA) { ok++; continue; }
  const t0 = Date.now();
  let riuscito = false;
  for (let t = 0; t < 3 && !riuscito; t++) {
    try {
      const r = await fetch(`${URL_BASE}/storage/v1/object/road_tiles/${nome}`, {
        method: 'POST',
        headers: { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}`, 'Content-Type': 'application/gzip', 'x-upsert': 'true', 'cache-control': 'max-age=86400' },
        body: fs.readFileSync(path.join(dir, nome)),
        signal: AbortSignal.timeout(30_000),
      });
      riuscito = r.ok;
      if (!r.ok && t === 2) console.error(`✗ ${nome}: ${r.status}`);
    } catch (e) { if (t === 2) console.error(`✗ ${nome}: ${e.message}`); }
    if (!riuscito) await pausa(2000 * (t + 1));
  }
  if (riuscito) { ok++; fs.appendFileSync(fileStato, nome + '\n'); } else ko++;
  const attesa = 1000 / alSecondo - (Date.now() - t0);
  if (attesa > 0) await pausa(attesa);
}
console.error(`fine: ok ${ok}, falliti ${ko}, soste per il sito ${fermate}`);
