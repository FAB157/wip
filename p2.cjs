#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// DA ESEGUIRE SUL DROPLET:  node /root/p2.cjs
//
// SEMINA MONDIALE: il seeder smette di percorrere il catalogo in fila e
// prende un itinerario per PAESE a rotazione.
//
// Perche': la biblioteca e' al 38,5% italiana (700 su 1.817) mentre 68 paesi
// su 88 stanno sotto l'1%, e il catalogo e' ordinato Italia-first a piu'
// livelli (porti italiani, poi Napoli/Roma/Venezia/Firenze, poi le citta'
// storiche, e MERCATI_CASA = Italia/Francia/Spagna nelle strade del gusto).
// Il cursore stava macinando Asti, Lerici, Cilento: settimane di Italia
// prima che il resto del mondo avesse un turno.
//
// Cosa NON cambia: l'ordine di priorita' resta identico DENTRO ogni paese,
// quindi le mete importanti di ciascun paese restano davanti alle minori.
// L'Italia rallenta, non si ferma.
//
// IDEMPOTENTE. Se le ancore non combaciano non scrive niente ed esce.
// Backup: crea scripts/seed-library.mts.bak-20260823 se non esiste.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = '/root/itainta';
const FILE = DIR + '/scripts/seed-library.mts';
const BAK = FILE + '.bak-20260823';

let t = fs.readFileSync(FILE, 'utf8');
const prima = t.length;

if (t.includes('codaPerPaese')) {
  console.log('1/2  rotazione gia\' attiva, salto la patch.');
} else {
  const VECCHIA = `let cursore = 0;
let refreshInCorso = false;

/** Prossimo descrittore da lavorare, saltando fatti e falliti di recente.
 *  Unico punto che avanza il cursore: i worker non si pestano. */
function prossimo(): any | null {
  while (cursore < all.length) {
    const d = all[cursore++];
    if (seeded.has(d.slug)) continue;
    const f = state.failed[d.slug];
    if (f && Date.now() - f.at < RETRY_AFTER_MS) continue;
    return d;
  }
  return null;
}`;

  const NUOVA = `let refreshInCorso = false;

// ── SEMINA MONDIALE: UN ITINERARIO PER PAESE, A ROTAZIONE ────────────────
// (23/08/2026) Prima si percorreva \`all\` in fila. Ma il catalogo e' ordinato
// Italia-first a piu' livelli, e il risultato misurato era una biblioteca al
// 38,5% italiana (700 su 1.817) con 68 paesi su 88 sotto l'1% — mentre il
// cursore era fermo a macinare Asti, Lerici, Cilento.
//
// Ora ogni paese ha la SUA coda, nell'ordine di priorita' originale, e si
// prende un descrittore per paese a turno. Dentro un paese non cambia
// niente: le mete importanti restano davanti alle minori. Cambia solo che
// l'Italia non blocca piu' il turno di tutti gli altri.
const codaPerPaese = new Map<string, any[]>();
for (const d of all) {
  const p = String(d?.country || '').trim() || '(senza paese)';
  if (!codaPerPaese.has(p)) codaPerPaese.set(p, []);
  codaPerPaese.get(p)!.push(d);
}
const paesi = [...codaPerPaese.keys()];
const indicePaese: Record<string, number> = {};
for (const p of paesi) indicePaese[p] = 0;
let giro = 0;

/** Prossimo descrittore da lavorare, saltando fatti e falliti di recente.
 *  Gira sui paesi a turno; unico punto che avanza gli indici, cosi' i
 *  worker non si pestano. Torna null solo quando TUTTI i paesi sono finiti. */
function prossimo(): any | null {
  // Un giro completo senza che nessun paese abbia qualcosa = catalogo finito.
  for (let vuoti = 0; vuoti < paesi.length; ) {
    const p = paesi[giro % paesi.length];
    giro++;
    const coda = codaPerPaese.get(p)!;
    let i = indicePaese[p];
    let trovato: any = null;
    while (i < coda.length) {
      const d = coda[i++];
      if (seeded.has(d.slug)) continue;
      const f = state.failed[d.slug];
      if (f && Date.now() - f.at < RETRY_AFTER_MS) continue;
      trovato = d;
      break;
    }
    indicePaese[p] = i;
    if (trovato) return trovato;
    vuoti++; // questo paese non ha piu' niente da dare adesso
  }
  return null;
}`;

  const k = t.indexOf(VECCHIA);
  if (k < 0) { console.error('STOP: il cursore non combacia con quello atteso. Niente scritto.'); process.exit(1); }
  if (t.indexOf(VECCHIA, k + 1) >= 0) { console.error('STOP: ancora ambigua. Niente scritto.'); process.exit(1); }

  if (!fs.existsSync(BAK)) fs.copyFileSync(FILE, BAK);
  t = t.slice(0, k) + NUOVA + t.slice(k + VECCHIA.length);
  fs.writeFileSync(FILE, t);
  console.log(`1/2  patch applicata: ${prima} -> ${t.length} byte (+${t.length - prima}).`);
  console.log(`     backup: ${BAK}`);
}

console.log('2/2  riavvio seed-library ...');
execSync('npx pm2 restart seed-library', { cwd: DIR, stdio: 'inherit', timeout: 300000 });

console.log('');
console.log('FATTO. Nel log di avvio vedrai quanti paesi sono in rotazione.');
console.log('Per annullare:');
console.log('  cd /root/itainta && cp scripts/seed-library.mts.bak-20260823 scripts/seed-library.mts && npx pm2 restart seed-library');
