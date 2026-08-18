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
      // Semina continua della biblioteca itinerari: chiama in ciclo
      // /api/library/seed-cron su wip.guide (la generazione gira là, dove
      // ci sono le chiavi dei motori; qui c'è solo il metronomo). Serve
      // CRON_SECRET nel .env. È un ciclo infinito: se esce è un errore,
      // quindi l'autorestart ha senso. Consuma pochissima memoria, ma vale
      // la regola generale: non farlo girare insieme a mass-enrich.
      name: 'seed-library',
      script: 'node',
      args: 'scripts/seed-library.mjs',
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
