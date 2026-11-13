#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// DA ESEGUIRE SUL DROPLET:  node /root/p.cjs
//
// Fa tutto da solo, in ordine, fermandosi al primo errore:
//   1. patch di /root/itainta/server.ts (due modifiche in libraryVerifyWithAi)
//   2. compila in /tmp/server.new.cjs
//   3. solo se la compilazione riesce, sostituisce dist/server.cjs
//   4. riavvia wip-api
//
// IDEMPOTENTE: rilanciarlo non applica la patch due volte.
// Se le ancore nel sorgente non combaciano, NON scrive niente ed esce.
// Backup gia' presenti: server.ts.bak-20260823, dist/server.cjs.bak-20260823
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = '/root/itainta';
const FILE = DIR + '/server.ts';
const run = (cmd) => execSync(cmd, { cwd: DIR, stdio: 'inherit', timeout: 600000 });

let t = fs.readFileSync(FILE, 'utf8');
const prima = t.length;

if (t.includes('LIB_REVISORI_GRATIS') && t.includes('provaRevisore')) {
  console.log('1/4  patch gia\' applicata, salto.');
} else {
  // ── 1a. la lista dei revisori comprende TUTTI i motori gratuiti ──────
  // Mancava AGNES, che e' il motore che regge la semina: oggi 2.249
  // generazioni su 2.252. Agnes finiva a fare il revisore lo stesso per la
  // coda di fallback interna (971 chiamate library_verify servite da
  // agnes_flash), ma poi scattava il rifiuto "stesso motore del generatore"
  // e la revisione veniva buttata: chiamata pagata, risultato cestinato.
  const VECCHIA = "    const candidates = ['groq', 'mistral', 'together'].filter((e) => !String(genEngine || '').includes(e));";
  const NUOVA = `    // TUTTI i motori gratuiti (23/08/2026): la lista lasciava fuori AGNES,
    // che e' il motore che regge la semina. Ordine: groq perche' e' rapido,
    // poi agnes che e' lento ma risponde sempre, in fondo i due a credito
    // zero (402) e gemini (tetto gratuito 20 richieste/giorno).
    const LIB_REVISORI_GRATIS = ['groq', 'agnes', 'mistral', 'together', 'gemini'];
    const candidates = LIB_REVISORI_GRATIS.filter((e) => !String(genEngine || '').includes(e));`;
  const k = t.indexOf(VECCHIA);
  if (k < 0) { console.error('STOP: lista revisori non trovata. Niente scritto.'); process.exit(1); }
  if (t.indexOf(VECCHIA, k + 1) >= 0) { console.error('STOP: lista revisori ambigua. Niente scritto.'); process.exit(1); }
  t = t.slice(0, k) + NUOVA + t.slice(k + VECCHIA.length);

  // ── 1b. ripiego sul motore del generatore invece di rinunciare ───────
  const INIZIO = `    for (const eng of candidates) {
      try {
        const opts: any = { temperature: 0.2, response_format: { type: 'json_object' } };`;
  const FINE = `    return { approved: false, score: 0, problemi: ['revisore AI non disponibile'], engine: null };`;
  const i = t.indexOf(INIZIO);
  const j = t.indexOf(FINE, i);
  if (i < 0 || j < 0) { console.error('STOP: ancore del ciclo revisori non trovate. Niente scritto.'); process.exit(1); }
  if (t.indexOf(INIZIO, i + 1) >= 0) { console.error('STOP: ancora di inizio ambigua. Niente scritto.'); process.exit(1); }

  const NUOVO = `    const provaRevisore = async (eng: string, ammettiStessoMotore: boolean): Promise<any | null> => {
      try {
        const opts: any = { temperature: 0.2, response_format: { type: 'json_object' } };
        // strictEngine NON sul ramo groq: li' le options vengono passate
        // pari pari all'SDK (...options) e un campo sconosciuto e' un 400.
        if (eng !== 'groq') opts.strictEngine = true;
        const resp = await callUniversalAi(eng,
          [{ role: 'system', content: sys }, { role: 'user', content: user }],
          opts, 'library_verify', supabaseUrl, supabaseServiceKey, null);
        const used = libEngineName(resp?.model);
        // Il fallback interno puo' essere ricaduto sul motore generatore:
        // in quel caso NON vale come seconda opinione, si prova il prossimo.
        if (!ammettiStessoMotore && used && String(genEngine || '').includes(used)) return null;
        const o = libParseJsonLoose(resp?.data);
        if (!o || typeof o.approved !== 'boolean') return null;
        return {
          approved: o.approved === true,
          score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
          problemi: (Array.isArray(o.problemi) ? o.problemi : []).map((p: any) => String(p).slice(0, 300)).slice(0, 12),
          engine: used || eng,
          stessoMotoreDelGeneratore: ammettiStessoMotore,
        };
      } catch { return null; }
    };

    for (const eng of candidates) {
      const esito = await provaRevisore(eng, false);
      if (esito) return esito;
    }

    // ── RIPIEGO: REVISIONE CON LO STESSO MOTORE DEL GENERATORE ─────────────
    // (23/08/2026) La seconda opinione vuole un motore DIVERSO dal generatore.
    // Con mistral e together a credito zero (402) e gemini oltre il tetto
    // gratuito (429), quando anche groq non risponde non resta nessuno e
    // l'item viene RIMANDATO. Misurato oggi: ~2.940 chiamate AI e DUE
    // itinerari salvati in tutta la giornata.
    //
    // Una rilettura dello stesso motore vale meno di una seconda opinione,
    // ma vale molto piu' di niente — e il controllo indipendente resta: la
    // revisione DeepSeek al primo utente che apre l'itinerario. Si marca
    // l'esito, cosi' questi item sono riconoscibili e ripassabili.
    const ripiego = String(genEngine || '').split('+')[0] || 'groq';
    const esitoRipiego = await provaRevisore(ripiego, true);
    if (esitoRipiego) {
      console.warn(\`[library] revisione di ripiego con lo stesso motore del generatore (\${ripiego}): gli altri revisori non rispondono\`);
      return esitoRipiego;
    }
    return { approved: false, score: 0, problemi: ['revisore AI non disponibile'], engine: null };`;

  t = t.slice(0, i) + NUOVO + t.slice(j + FINE.length);
  fs.writeFileSync(FILE, t);
  console.log(`1/4  patch applicata: ${prima} -> ${t.length} byte (+${t.length - prima}).`);
}

console.log('2/4  compilo in /tmp/server.new.cjs ...');
run('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=/tmp/server.new.cjs');

console.log('3/4  sostituisco dist/server.cjs ...');
run('cp /tmp/server.new.cjs dist/server.cjs');

console.log('4/4  riavvio wip-api ...');
run('npx pm2 restart wip-api');

console.log('');
console.log('FATTO. Ora la semina dovrebbe tornare a salvare itinerari.');
console.log('Per annullare tutto:');
console.log('  cd /root/itainta && cp server.ts.bak-20260823 server.ts && cp dist/server.cjs.bak-20260823 dist/server.cjs && npx pm2 restart wip-api');
