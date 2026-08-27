#!/usr/bin/env node
/**
 * VERIFICA DOPO IL DEPLOY — dieci secondi che valgono tredici ore.
 *
 * Il 22/08/2026 l'API e' rimasta giu' 13 ore: tre deploy consecutivi
 * risultavano "Ready" su Vercel perche' il BUILD passava, ma il bundle
 * esplodeva al caricamento (un import JSON senza `with { type: "json" }`) e
 * ogni rotta rispondeva 500. Nessuno chiamava una rotta vera dopo il deploy.
 *
 * Questo script chiama tre rotte REALI e non costa nulla:
 *   - /api/flags    pubblica, nessuna chiave, nessuna AI
 *   - /api/pricing  pubblica, legge il listino crediti
 *   - /api/admin/users  DEVE rispondere 403: dimostra insieme che l'app e'
 *     caricata, che il routing funziona e che il gate admin non e' aperto.
 *
 * Un 500 o una risposta HTML dove serve JSON = deploy da NON considerare
 * finito. Esce con codice 1 cosi' `npm run deploy` fallisce rumorosamente.
 *
 * Uso:
 *   node scripts/smoke-deploy.mjs
 *   node scripts/smoke-deploy.mjs https://itainta-xxxx.vercel.app
 */

// Si usa `www`: l'apex wip.guide risponde 308 e il salto in piu' confonde la
// lettura dei tempi. Un argomento esplicito ha comunque la precedenza.
const BASE = (process.argv[2] || 'https://www.wip.guide').replace(/\/$/, '');
const ATTESA_MS = Number(process.env.SMOKE_WAIT_MS || 8000);
const TENTATIVI = Number(process.env.SMOKE_RETRIES || 3);

/** Le rotte da provare: [percorso, codici accettati, cosa dimostra] */
const PROVE = [
  ['/api/flags', [200], 'il bundle si carica e le rotte pubbliche rispondono'],
  ['/api/pricing', [200], 'il listino crediti e leggibile'],
  ['/api/admin/users?limit=1', [401, 403], 'il gate admin e attivo (403 atteso, non 500)'],
];

const chiama = async (percorso) => {
  const t0 = Date.now();
  const r = await fetch(BASE + percorso, {
    redirect: 'follow',
    headers: { 'User-Agent': 'WIP-smoke-test' },
    signal: AbortSignal.timeout(30000),
  });
  const testo = await r.text();
  return { stato: r.status, ms: Date.now() - t0, testo, html: testo.trimStart().startsWith('<') };
};

console.log(`\nVerifica dopo il deploy su ${BASE}\n`);

// Il primo avvio della funzione serverless e' a freddo: si concede una
// finestra invece di bocciare un deploy sano solo perche' e' appena nato.
let falliti = [];
for (const [percorso, ok, cosa] of PROVE) {
  let esito = null;
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
    try {
      esito = await chiama(percorso);
      if (ok.includes(esito.stato) && !esito.html) break;
    } catch (e) {
      esito = { stato: 0, ms: 0, testo: e.message, html: false };
    }
    if (tentativo < TENTATIVI) await new Promise(s => setTimeout(s, ATTESA_MS));
  }

  const buono = esito && ok.includes(esito.stato) && !esito.html;
  const nota = esito?.html ? 'HTML invece di JSON (la rotta non esiste nel bundle)' : '';
  console.log(`  ${buono ? 'OK  ' : 'ROTTO'} ${String(esito?.stato ?? '---').padEnd(4)} ${percorso.padEnd(26)} ${esito?.ms ?? 0} ms  ${buono ? cosa : nota || esito?.testo?.slice(0, 90).replace(/\s+/g, ' ')}`);
  if (!buono) falliti.push(`${percorso} → ${esito?.stato}${nota ? ' (' + nota + ')' : ''}`);
}

if (falliti.length) {
  console.error(`\nDEPLOY DA NON CONSIDERARE FINITO — ${falliti.length} prova/e fallita/e:`);
  for (const f of falliti) console.error(`  · ${f}`);
  console.error(`\nPer l'errore vero:  npx vercel logs <url-del-deployment>`);
  console.error(`(Attenzione: "Ready" su Vercel significa solo che il BUILD e' passato.)`);
  console.error(`\nSe le rotte sono a 500 MA il codice sembra corretto, controlla dove`);
  console.error(`puntano davvero i domini:  npx vercel alias ls`);
  console.error(`Dopo un rollback dalla dashboard i domini restano PINNATI e`);
  console.error(`\`vercel --prod\` non li sposta: serve  npx vercel promote <url>\n`);
  process.exitCode = 1;
} else {
  console.log(`\nTutto risponde: il deploy e' vivo.\n`);
}
