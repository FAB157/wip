#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// SEMINA CONTINUA DELLA BIBLIOTECA ITINERARI (droplet DigitalOcean)
//
// Il cron di Vercel chiama /api/library/seed-cron una volta all'ora: 240s di
// lavoro ogni 3.600, cioè ~32 itinerari al giorno. Con un catalogo da oltre
// 14.000 descrittori servirebbe più di un anno.
//
// Questo processo chiama la STESSA rotta in continuo, uno alla volta: la
// generazione resta su Vercel (dove ci sono tutte le chiavi dei motori AI e
// il codice deployato), il droplet fa solo da metronomo. Consumo di memoria
// trascurabile: è un ciclo di fetch, non un server — sta comodo nei 512 MB
// insieme a nient'altro (regola di ecosystem.config.cjs: UN processo alla
// volta, mai insieme a mass-enrich).
//
// Perché non /api/library/seed: seed-cron ha un budget interno di 240s e
// chiude in modo pulito prima del maxDuration 300s della function; /seed
// lavora finché non finisce il limit e su item lenti si becca un 504.
//
// Uso:
//   pm2 start ecosystem.config.cjs --only seed-library
//   pm2 logs seed-library
//
// Variabili (.env del droplet):
//   CRON_SECRET   OBBLIGATORIA, lo stesso valore configurato su Vercel
//   LIB_API       default https://wip.guide
//   LIB_PAUSE_MS  pausa tra una chiamata e l'altra (default 20000)
// ─────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = {};
for (const f of ['.env', '.env.local']) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(here, '..', f), 'utf8'); } catch { continue; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const API = process.env.LIB_API || env.LIB_API || 'https://wip.guide';
const SECRET = process.env.CRON_SECRET || env.CRON_SECRET;
const PAUSE = Number(process.env.LIB_PAUSE_MS || env.LIB_PAUSE_MS) || 20000;

if (!SECRET) {
  console.error('CRON_SECRET mancante: mettilo nel .env accanto alle altre chiavi (stesso valore di Vercel).');
  process.exit(1);
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
let salvatiTotali = 0, giri = 0, giriSenzaLavoro = 0, erroriDiFila = 0;

// SIGINT/SIGTERM: pm2 stop chiude dopo il giro in corso, senza troncare una
// generazione a metà (l'item si perderebbe e conterebbe come fallito).
let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.log(`${ts()} segnale ${sig}: chiudo dopo il giro in corso.`); stop = true; });

console.log(`${ts()} semina avviata su ${API}, pausa ${PAUSE / 1000}s tra i giri.`);

while (!stop) {
  giri++;
  const t0 = Date.now();
  let r, txt;
  try {
    r = await fetch(`${API}/api/library/seed-cron`, { headers: { Authorization: `Bearer ${SECRET}` } });
    txt = await r.text();
  } catch (e) {
    erroriDiFila++;
    console.error(`${ts()} giro ${giri}: rete KO (${e.message}) — attesa 60s [${erroriDiFila} di fila]`);
    if (erroriDiFila >= 20) { console.error('Venti errori di rete di fila: mi fermo, pm2 riavvierà.'); process.exit(1); }
    await new Promise(res => setTimeout(res, 60000));
    continue;
  }
  const sec = Math.round((Date.now() - t0) / 1000);

  if (r.status === 401) { console.error(`${ts()} 401: CRON_SECRET diverso da quello di Vercel. Mi fermo.`); process.exit(1); }
  if (!r.ok) {
    erroriDiFila++;
    console.error(`${ts()} giro ${giri}: HTTP ${r.status} in ${sec}s — ${txt.slice(0, 200)}`);
    if (erroriDiFila >= 20) { console.error('Venti risposte di errore di fila: mi fermo, pm2 riavvierà.'); process.exit(1); }
    await new Promise(res => setTimeout(res, 60000));
    continue;
  }
  erroriDiFila = 0;

  let j;
  try { j = JSON.parse(txt); } catch { console.error(`${ts()} risposta non JSON: ${txt.slice(0, 200)}`); await new Promise(res => setTimeout(res, 60000)); continue; }

  salvatiTotali += j.saved || 0;
  console.log(`${ts()} giro ${giri}: processati ${j.processed ?? 0}, salvati ${j.saved ?? 0}, saltati ${j.skippedByFailMemory ?? 0} — ${sec}s (totale ${salvatiTotali})`);
  for (const f of (j.failed || []).slice(0, 3)) console.log(`    ✗ ${f.slug}: ${String(f.reason).slice(0, 140)}`);

  // Nessun descrittore lavorabile: o è finito il catalogo, o sono tutti in
  // memoria dei falliti (che si sblocca dopo 24h). Si rallenta molto invece
  // di uscire: il catalogo cresce e i falliti tornano disponibili.
  if (!j.processed) {
    giriSenzaLavoro++;
    console.log(`${ts()} niente da seminare [${giriSenzaLavoro}] — attesa 30 minuti.`);
    await new Promise(res => setTimeout(res, 30 * 60 * 1000));
    continue;
  }
  giriSenzaLavoro = 0;
  await new Promise(res => setTimeout(res, PAUSE));
}

console.log(`${ts()} fine: ${salvatiTotali} itinerari salvati in ${giri} giri.`);
