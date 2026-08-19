/**
 * Configurazione pm2 degli script dati (droplet DigitalOcean).
 *
 * Nasce da un incidente: sul server giravano cinque processi insieme su
 * 1 vCPU / 512 MB, due dei quali erano script "una tantum" già conclusi che
 * pm2 riavviava ogni due secondi. Il risultato erano timeout e
 * "Could not query the database for the schema cache" su Supabase — che
 * colpiscono anche gli utenti dell'app, non solo gli script.
 *
 * Regole che questa configurazione mette per iscritto:
 *   • UN processo alla volta: si avvia con --only, mai tutto insieme;
 *   • gli script che finiscono hanno autorestart:false (non sono servizi);
 *   • tetto di memoria basso, perché la macchina ne ha 512 MB in tutto;
 *   • i flag --apply sono espliciti: senza, gli script girano in simulazione
 *     e non scrivono nulla (comportamento voluto, ma inutile in produzione).
 *
 * Uso tipico:
 *   pm2 start ecosystem.config.cjs --only mass-enrich
 *   pm2 logs mass-enrich
 *   pm2 stop mass-enrich && pm2 start ecosystem.config.cjs --only wikidata-retro
 *   pm2 save        # ricorda la configurazione al riavvio del droplet
 */
module.exports = {
  apps: [
    {
      // Arricchimento continuo dei POI mai lavorati. È un ciclo infinito:
      // se esce, è un errore, quindi qui l'autorestart ha senso.
      name: 'mass-enrich',
      script: 'npx',
      args: 'tsx scripts/mass_enrich_background.ts --concurrency=2',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      // Riavvio pigro: un crash immediato ripetuto non deve trasformarsi in
      // un loop che martella Supabase.
      restart_delay: 15000,
      min_uptime: 60000,
      max_restarts: 10,
      max_memory_restart: '320M',
      time: true,
    },
    {
      // Copia locale dell'API (dist/server.cjs, buildata a parte e copiata
      // qui): serve SOLO alla semina della biblioteca. Su Vercel la function
      // muore a 300s e la terza rigenerazione correttiva non fa in tempo a
      // finire — misurato il 18/08/2026: 3 item su 7 buttati a metà lavoro.
      // Qui non c'è tetto (LIB_SYNC_BUDGET_MS=900000 nel .env) e si può usare
      // anche Agnes, che impiega 2-4 minuti a chiamata.
      // Aggiornamento: rifare `npx esbuild server.ts --bundle --platform=node
      // --format=cjs --packages=external --outfile=dist/server.cjs` e copiare
      // il file; il frontend NON serve (qui gira solo l'API).
      name: 'wip-api',
      script: 'node',
      // Tetti alzati il 19/08/2026: con 256 MB di heap e il riavvio pm2 a 330
      // MB il processo veniva ucciso 7 volte a notte, e OGNI riavvio uccideva
      // la generazione in corso (4-6 minuti di lavoro buttati). Il droplet ha
      // 1 GB di swap, quindi il picco si attraversa invece di morire; con la
      // semina in parallelo il picco è più alto e questi tetti servono.
      args: '--max-old-space-size=320 dist/server.cjs',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      min_uptime: 30000,
      max_restarts: 20,
      max_memory_restart: '420M',
      time: true,
    },
    {
      // Semina continua della biblioteca itinerari: scorre il catalogo dei
      // descrittori e chiede a wip.guide di generare quelli mancanti (la
      // generazione gira sull'API indicata da LIB_API nel .env: sul droplet
      // è http://127.0.0.1:3000, cioè il processo wip-api qui sopra, senza
      // il tetto dei 300s di Vercel). Va quindi avviato DOPO wip-api.
      // Riparte da capo a ogni giro saltando ciò che è già fatto,
      // quindi l'autorestart è voluto. Serve SUPABASE_SERVICE_ROLE_KEY nel
      // .env (già presente). Vale la regola generale: non insieme a
      // mass-enrich.
      name: 'seed-library',
      script: 'npx',
      args: 'tsx scripts/seed-library.mts',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 30000,
      min_uptime: 60000,
      max_restarts: 20,
      max_memory_restart: '150M',
      time: true,
    },
    {
      // Ripassa i POI già arricchiti e li riscrive dove esistono fonti
      // verificate. Finisce: non è un servizio.
      name: 'wikidata-retro',
      script: 'npx',
      args: 'tsx scripts/wikidata_retro_enrich.ts --apply',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: false,
      max_memory_restart: '320M',
      time: true,
    },
    {
      // Bonifica del pregresso: riscrive i POI col testo inventato dal vecchio
      // prompt. Da lanciare una volta, guardando prima l'esito in simulazione
      // (stesso comando senza --apply).
      name: 'redo-invented',
      script: 'npx',
      args: 'tsx scripts/wikidata_retro_enrich.ts --redo-invented --apply',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: false,
      max_memory_restart: '320M',
      time: true,
    },
    {
      // Sostituzione delle foto generiche con quelle ufficiali del luogo.
      // ATTENZIONE: NON usare più scripts/update_poi_photos.ts né
      // backfill_photos.ts (archiviati in scratch/): cercavano per nome e
      // sovrascrivevano foto buone con quelle di monumenti omonimi.
      name: 'wiki-photos',
      script: 'npx',
      args: 'tsx scripts/fix_poi_photos.ts --apply --limit=2000',
      interpreter: 'none',
      cwd: __dirname,
      autorestart: false,
      max_memory_restart: '320M',
      time: true,
    },
  ],
};
