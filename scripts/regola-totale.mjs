#!/usr/bin/env node
// REGOLATORE DELL'ARRICCHIMENTO TOTALE (26/09/2026) — gira ogni 3 minuti da cron sul droplet 104 e scrive i file
// `<lista>.lavoratori` che driver-totale.mjs rilegge a ogni lotto: cambia i lavoratori senza riavviare niente.
// Le regole sono quelle concordate con la sessione che gestisce il database e le passate notturne (26/09/2026):
//  · si parte LENTI (completa 4 lavoratori, veloce 2) e si sale solo se /api/health resta sotto 0,5 s;
//  · fra 01:00 e 02:00 UTC la completa scende a metà (2): lo svuotamento notturno delle descrizioni su shared_pois si
//    ferma se health supera 1 s, e non deve fermarsi per colpa nostra;
//  · scritture di massa su shared_pois solo 01-06 UTC: di giorno la completa resta a ritmo basso (4), di notte
//    (02:00-06:00 UTC) può salire a 6;
//  · se il sito rallenta (health > 1 s) tutto scende a 1 lavoratore; se non risponde, a 1 e si aspetta;
//  · c'è un interruttore a mano: il file /root/totale/PAUSA_TUTTO ferma i due servizi (li riporta a 1 lavoratore e
//    alza la pausa a 60 s) senza spegnerli.
// Uso: `node regola-totale.mjs` (una regolazione) oppure `node regola-totale.mjs --ciclo` (si ripete ogni 3 minuti:
// è come gira il servizio wip-totale-regola, senza toccare il crontab che è di tutti).
import fs from 'node:fs';
const DIR = process.env.TOTALE_DIR || '/root/totale';
const CICLO = process.argv.includes('--ciclo');
const sh = (t) => new Promise((r) => setTimeout(r, t));
async function health() {
  const t0 = Date.now();
  try { const r = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) }); return r.ok ? Date.now() - t0 : Infinity; } catch { return Infinity; }
}
async function regola() {
  // Due misure, la migliore: un singolo picco non deve frenare tutto.
  let h = await health(); if (h > 500) { await sh(2000); h = Math.min(h, await health()); }
  const ora = new Date().getUTCHours();
  // Misurato il 26/09/2026 (2 ore a 4+3 lavoratori: health sempre 100-300 ms, 0 errori, la completa faceva 8 luoghi al
  // minuto e la veloce 26): si sale a 8 di giorno, 12 di notte (02-06 UTC), 4 fra 01 e 02 UTC (svuotamento notturno delle
  // descrizioni: non deve fermarsi per colpa nostra). Sopra 500 ms di health si torna ai valori di partenza, sopra 1 s a 1.
  let completa = ora === 1 ? 4 : (ora >= 2 && ora < 6) ? 12 : 8;
  let veloce = ora === 1 ? 2 : (ora >= 2 && ora < 6) ? 6 : 4;
  if (h >= 500) { completa = Math.min(completa, 4); veloce = Math.min(veloce, 2); }
  if (h > 1000) { completa = 1; veloce = 1; }
  let pC = 1500, pV = 3000;
  const inPausa = fs.existsSync(`${DIR}/PAUSA_TUTTO`);
  if (inPausa) { completa = 1; veloce = 1; pC = 60000; pV = 60000; }
  for (const [lista, n, p] of [['completa', completa, pC], ['veloce', veloce, pV]]) {
    try { fs.writeFileSync(`${DIR}/${lista}.jsonl.lavoratori`, String(n)); fs.writeFileSync(`${DIR}/${lista}.jsonl.pausa`, String(p)); } catch { /* cartella non ancora pronta */ }
  }
  console.log(`${new Date().toISOString()} health ${h === Infinity ? 'KO' : h + ' ms'} · ora UTC ${ora} → completa ${completa}, veloce ${veloce}${inPausa ? ' (PAUSA_TUTTO)' : ''}`);
}
do { try { await regola(); } catch (e) { console.log(`regolatore: ${e?.message}`); } if (CICLO) await sh(180000); } while (CICLO);
