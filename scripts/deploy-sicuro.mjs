// DEPLOY SICURO (22/11/2026, committente: «dove posso cliccando autorizzare il deploy o farlo io?» → «il file mettilo
// nella tab con report e correzioni»). Lo lancia il committente con un doppio clic su deploy-sicuro.cmd (scaricabile da
// Download › Test › Deploy). Fa nell'ordine, e si FERMA al primo controllo rosso:
//   1. banco di prova degli itinerari (scratch/banco-prova-itinerari.mjs, deve uscire 0)
//   2. import del server con estensione (scratch/verifica-import-server.mjs, incidente del 04/10)
//   3. bundle del server e prova di caricamento (incidente TDZ del 12/09: «CARICATO» o niente deploy)
//   4. annota la versione in produzione ADESSO (serve per tornare indietro)
//   5. chiede conferma («SI»), poi `vercel --prod --yes` dalla radice del repo (mai da una sottocartella)
//   6. controlla /api/health e la home; se falliscono → `vercel promote <versione di prima>` da solo
// Tutto finisce in scratch/deploy-log/deploy-<data>.txt. Nessuna chiave è letta o scritta da qui.
// Opzioni: --senza-conferma (non chiede «SI»), --solo-controlli (fa 1–3 e si ferma).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const radice = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
process.chdir(radice);
const args = new Set(process.argv.slice(2));
const SITO = 'https://www.wip.guide';
fs.mkdirSync(path.join(radice, 'scratch', 'deploy-log'), { recursive: true });
const fileLog = path.join(radice, 'scratch', 'deploy-log', `deploy-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
const log = (s) => { const r = `[${new Date().toLocaleTimeString('it-IT')}] ${s}`; console.log(r); fs.appendFileSync(fileLog, r + '\n'); };

function esegui(nome, cmd, argv, { mostra = 40 } = {}) {
  log(`→ ${nome}…`);
  // Su questo PC un processo a volte non parte (exit null, nessun output: spawn negato o memoria): si dice perché e si
  // riprova una volta dopo 5 s, invece di chiamarlo «non si impacchetta».
  let r;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    r = spawnSync(cmd, argv, { cwd: radice, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
    // Non partito = status null, oppure un codice di errore di Windows (4294963248 = −4048 = EPERM) senza una riga di output.
    const nonPartito = r.status === null || (r.status > 255 && !`${r.stdout || ''}${r.stderr || ''}`.trim());
    if (!nonPartito) break;
    if (r.status !== null) r.error = r.error || Object.assign(new Error(`codice ${r.status} (${r.status - 4294967296})`), { code: 'EPERM?' });
    log(`  il processo non è partito (${r.error?.code || r.error?.message || r.signal || 'motivo ignoto'})${tentativo < 3 ? ', riprovo' : ''}`);
    if (tentativo < 3) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},8000)']);
  }
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n[spawn] ${r.error.message}` : ''}`;
  fs.appendFileSync(fileLog, `----- ${nome} (exit ${r.status}) -----\n${out}\n`);
  const coda = out.trim().split('\n').slice(-mostra).join('\n');
  return { ok: r.status === 0, status: r.status, out, coda };
}
function ferma(motivo) {
  log(`✖ FERMATO: ${motivo}`);
  log(`Niente è stato pubblicato. Dettagli in ${fileLog}`);
  process.exit(1);
}
const chiedi = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a); }); });
async function vivo() {
  const prove = [];
  for (const [u, attesa] of [[`${SITO}/api/health`, 200], [`${SITO}/`, 200]]) {
    try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000) }); prove.push(`${u} → ${r.status}`); if (r.status !== attesa) return { ok: false, prove }; }
    catch (e) { prove.push(`${u} → ${e?.message || 'errore'}`); return { ok: false, prove }; }
  }
  return { ok: true, prove };
}

log(`DEPLOY SICURO — cartella ${radice}`);

// 1. Banco di prova
const banco = esegui('banco di prova itinerari', 'node', ['scratch/banco-prova-itinerari.mjs'], { mostra: 6 });
console.log(banco.coda);
if (!banco.ok) ferma('il banco di prova non è verde');
log('✔ banco verde');

// 2. Import del server
const imp = esegui('import del server', 'node', ['scratch/verifica-import-server.mjs'], { mostra: 10 });
if (!imp.ok) { console.log(imp.coda); ferma('ci sono import senza estensione (farebbero cadere l\'API)'); }
log('✔ import a posto');

// 3. Bundle e prova di caricamento
const bundle = esegui('bundle del server', 'node', ['node_modules/esbuild/bin/esbuild', 'server.ts', '--bundle', '--platform=node', '--format=cjs', '--packages=external', '--log-level=error', '--outfile=dist-server/server-prova.cjs'], { mostra: 15 });
if (!bundle.ok) { console.log(bundle.coda); ferma('il server non si impacchetta'); }
const carica = esegui('prova di caricamento', 'node', ['scratch/carica-server-prova.cjs', path.join(radice, 'dist-server', 'server-prova.cjs')], { mostra: 15 });
if (!/CARICATO/.test(carica.out)) { console.log(carica.coda); ferma('il server non si carica (in produzione l\'API andrebbe giù)'); }
log('✔ il server si carica');

if (args.has('--solo-controlli')) { log('Solo controlli: tutto verde, nessun deploy.'); process.exit(0); }

// 4. Versione in produzione adesso
const insp = esegui('versione in produzione', 'npx', ['vercel', 'inspect', SITO], { mostra: 5 });
const prima = (insp.out.match(/https:\/\/itainta-[a-z0-9]+-[a-z0-9-]+\.vercel\.app/i) || [])[0] || null;
if (!prima) ferma('non riesco a leggere la versione in produzione: senza di lei non si torna indietro');
log(`Versione di adesso (per tornare indietro): ${prima}`);
const salute0 = await vivo();
log(`Produzione adesso: ${salute0.prove.join(' · ')}`);

// 5. Conferma e deploy
if (!args.has('--senza-conferma')) {
  const a = await chiedi('\nControlli verdi. Scrivi SI per pubblicare in produzione: ');
  if (String(a).trim().toUpperCase() !== 'SI') ferma('pubblicazione annullata');
}
const dep = esegui('deploy in produzione', 'npx', ['vercel', '--prod', '--yes'], { mostra: 12 });
console.log(dep.coda);
if (!dep.ok) ferma('vercel ha rifiutato il deploy (produzione non toccata)');
const nuova = (dep.out.match(/https:\/\/itainta-[a-z0-9]+-[a-z0-9-]+\.vercel\.app/i) || [])[0] || '?';
log(`Pubblicata: ${nuova}`);

// 6. Controllo, con ritorno indietro automatico
let ok = false;
for (let i = 0; i < 8 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const s = await vivo();
  log(`Controllo ${i + 1}/8: ${s.prove.join(' · ')}`);
  ok = s.ok;
}
if (!ok) {
  log('✖ La produzione non risponde bene: torno alla versione di prima…');
  const p = esegui('ritorno alla versione di prima', 'npx', ['vercel', 'promote', prima, '--yes'], { mostra: 8 });
  console.log(p.coda);
  const s = await vivo();
  log(`Dopo il ritorno: ${s.prove.join(' · ')}`);
  ferma(`deploy ${nuova} tornato indietro a ${prima}`);
}
log(`✔ FATTO. Produzione: ${nuova}. Per tornare indietro: npx vercel promote ${prima} --yes`);
log(`Registro: ${fileLog}`);
