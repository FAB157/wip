// Prova di caricamento del server prima del deploy (regola dopo l'incidente
// TDZ del 12/09/2026): se il modulo non si carica, non si pubblica.
// Uso: PORT=3997 npx tsx scripts/prova-caricamento.mjs
import('../server.ts')
  .then(() => { console.log('MODULO CARICATO'); process.exit(0); })
  .catch((e) => { console.error('ERRORE CARICAMENTO:', String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')); process.exit(1); });
