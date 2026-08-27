#!/usr/bin/env node
/**
 * Pulisci gli asset web copiati dentro le app native.
 *
 * PERCHÉ ESISTE
 * `npm run build` produce due cose dentro `dist/`:
 *   1. il bundle della SPA (vite build)               -> serve al telefono
 *   2. `dist/server.cjs` (esbuild di server.ts)       -> NON serve al telefono
 * `npx cap sync` copia `dist/` INTERO dentro
 *   android/app/src/main/assets/public/  e  ios/App/App/public/
 * quindi ~1,6 MB su Android e ~1,3 MB su iOS sono il backend Express
 * compilato: codice Node che dentro una WebView non gira e non girerà mai.
 *
 * PERCHÉ NON SI TOCCA `dist/`
 * `dist/server.cjs` è il target di `npm start` (`node dist/server.cjs`) ed è
 * il modo in cui il server compilato viene eseguito fuori da Vercel (droplet,
 * prove locali del build di produzione). Spostare l'output di esbuild altrove
 * significherebbe cambiare lo script `build` e rischiare di rompere chi lo
 * consuma. Su Vercel il percorso è diverso (`buildCommand: "vite build"` in
 * vercel.json, e `api/index.ts` importa `../server.js`, cioè il sorgente),
 * ma resta la regola: si cancella la COPIA dentro le app native, mai
 * l'originale in `dist/`.
 *
 * Va lanciato DOPO `npx cap sync` (vedi lo script npm `sync:native`), perché
 * ogni sync ricopia `dist/` e rimette dentro i file cancellati.
 */

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CARTELLE_NATIVE = [
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  join(root, 'ios', 'App', 'App', 'public'),
];

/**
 * File SOLO-server: non vengono mai richiesti da index.html né dal bundle,
 * non sono nel precache del service worker (workbox in vite.config.ts indicizza
 * js/css/html/ico/png/svg/json — `.cjs` e `.map` restano fuori).
 */
const SOLO_SERVER = ['server.cjs', 'server.cjs.map'];

/**
 * NON si cancella:
 * - assets/AdminPanel-*.js (267 KB): l'admin usa l'app anche dal telefono,
 *   togliere il chunk gli spegnerebbe il pannello.
 * - ic_launcher.png (432 KB, doppione byte-per-byte di icon.png, è l'icona
 *   launcher di Android finita in public/): NON è referenziata da nessun
 *   HTML/JS, ma È dentro il manifest di precache del service worker
 *   (dist/sw.js). Cancellarla dagli asset nativi farebbe fallire in 404
 *   l'install del service worker e con essa TUTTO il precache offline.
 *   La rimozione sicura è a monte: eliminare `public/ic_launcher.png` dal
 *   sorgente e ricostruire, così non entra né in dist/ né nel precache.
 */
const REFERENZIATI_NEL_SERVICE_WORKER = ['ic_launcher.png'];

function referenziato(cartella, nome) {
  for (const sw of ['sw.js', 'index.html', 'manifest.webmanifest', 'manifest.json']) {
    const p = join(cartella, sw);
    if (!existsSync(p)) continue;
    try {
      if (readFileSync(p, 'utf8').includes(nome)) return sw;
    } catch {
      /* file binario o illeggibile: nel dubbio non si cancella */
      return sw;
    }
  }
  return null;
}

let liberati = 0;
let cancellati = 0;

for (const cartella of CARTELLE_NATIVE) {
  if (!existsSync(cartella)) {
    console.log(`[pulisci-asset-nativi] salto (non esiste): ${cartella}`);
    continue;
  }
  for (const nome of SOLO_SERVER) {
    const file = join(cartella, nome);
    if (!existsSync(file)) continue;

    const dove = referenziato(cartella, nome);
    if (dove) {
      // Cintura di sicurezza: se un giorno qualcosa lo referenzia davvero,
      // meglio qualche KB in più che un'app rotta.
      console.warn(`[pulisci-asset-nativi] ATTENZIONE: ${nome} è referenziato in ${dove}, NON lo cancello`);
      continue;
    }

    const kb = Math.round(statSync(file).size / 1024);
    rmSync(file);
    liberati += kb;
    cancellati += 1;
    console.log(`[pulisci-asset-nativi] rimosso ${nome} (${kb} KB) da ${cartella}`);
  }
}

for (const nome of REFERENZIATI_NEL_SERVICE_WORKER) {
  console.log(
    `[pulisci-asset-nativi] lasciato ${nome}: è nel precache del service worker. ` +
      `Per toglierlo davvero elimina public/${nome} dal sorgente e ricostruisci.`,
  );
}

console.log(
  `[pulisci-asset-nativi] fatto: ${cancellati} file rimossi, ~${liberati} KB in meno negli asset nativi.`,
);
