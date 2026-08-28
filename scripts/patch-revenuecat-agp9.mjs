#!/usr/bin/env node
/**
 * PATCH: plugin Capacitor + AGP 9 — la build Android non parte senza questa.
 * ==========================================================================
 * Diversi plugin pubblicano un `android/build.gradle` che chiama
 *
 *     proguardFiles getDefaultProguardFile('proguard-android.txt'), …
 *
 * e Android Gradle Plugin 9 lo **rifiuta**, perché quel file contiene
 * `-dontoptimize` e impedirebbe a R8 gran parte delle ottimizzazioni:
 *
 *     A problem occurred evaluating project ':capacitor-browser'.
 *     > `getDefaultProguardFile('proguard-android.txt')` is no longer supported…
 *
 * La build fallisce in CONFIGURAZIONE, quindi non compila NULLA: né debug né
 * release, né i moduli nostri. È il motivo per cui «gradle è rotto» in questo
 * progetto. La sostituzione con `proguard-android-optimize.txt` è esattamente
 * quella che suggerisce il messaggio d'errore.
 *
 * (29/08/2026) Prima questo script guardava SOLO
 * `@revenuecat/purchases-capacitor`. Dopo un `npm install` che ha toccato i
 * pacchetti Capacitor è saltato fuori lo stesso identico errore su
 * `@capacitor/browser`: il difetto non è di un plugin, è di tutti quelli
 * pubblicati prima di AGP 9. Ora si scandiscono tutti gli `android/build.gradle`
 * dei moduli installati, così il prossimo plugin con lo stesso problema non
 * ferma di nuovo la build per mezza giornata.
 *
 * Perché uno script e non una modifica a mano: `node_modules` si rigenera a
 * ogni `npm install` e la patch sparisce. Gira come `postinstall` ed è
 * idempotente.
 *
 * LA CORREZIONE DEFINITIVA è che i plugin passino ad AGP 9: quando succede,
 * questo script non trova più nulla da correggere e si può cancellare.
 *
 *   node scripts/patch-revenuecat-agp9.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const VECCHIO = "getDefaultProguardFile('proguard-android.txt')";
const NUOVO = "getDefaultProguardFile('proguard-android-optimize.txt')";
const RADICE = path.join(process.cwd(), 'node_modules');

/** I `android/build.gradle` dei moduli installati (anche negli scope @xxx/yyy). */
function moduliConGradle() {
  const fuori = [];
  if (!fs.existsSync(RADICE)) return fuori;
  const primoLivello = fs.readdirSync(RADICE, { withFileTypes: true });
  for (const voce of primoLivello) {
    if (!voce.isDirectory()) continue;
    const cartelle = voce.name.startsWith('@')
      ? fs.readdirSync(path.join(RADICE, voce.name), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => path.join(RADICE, voce.name, d.name))
      : [path.join(RADICE, voce.name)];
    for (const c of cartelle) {
      const g = path.join(c, 'android', 'build.gradle');
      if (fs.existsSync(g)) fuori.push(g);
    }
  }
  return fuori;
}

let corretti = 0;
for (const file of moduliConGradle()) {
  let testo;
  try { testo = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (!testo.includes(VECCHIO)) continue;
  try {
    fs.writeFileSync(file, testo.split(VECCHIO).join(NUOVO), 'utf8');
    corretti++;
    console.log(`[patch-agp9] corretto: ${path.relative(process.cwd(), file)}`);
  } catch (e) {
    // Un postinstall non deve MAI far fallire l'installazione: al massimo
    // si segnala e la build dirà da sola quale modulo è rimasto indietro.
    console.warn(`[patch-agp9] non scrivibile: ${file} (${e.message})`);
  }
}

console.log(corretti === 0
  ? '[patch-agp9] nessun modulo da correggere.'
  : `[patch-agp9] moduli corretti: ${corretti}.`);
