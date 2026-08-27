#!/usr/bin/env node
/**
 * PATCH: RevenueCat + AGP 9 — la build Android non parte senza questa.
 * ===================================================================
 * `node_modules/@revenuecat/purchases-capacitor/android/build.gradle` chiama
 *
 *     proguardFiles getDefaultProguardFile('proguard-android.txt'), …
 *
 * e Android Gradle Plugin 9 lo **rifiuta**, perché quel file contiene
 * `-dontoptimize` e impedirebbe a R8 gran parte delle ottimizzazioni:
 *
 *     A problem occurred evaluating project ':revenuecat-purchases-capacitor'.
 *     > `getDefaultProguardFile('proguard-android.txt')` is no longer supported…
 *
 * La build fallisce in CONFIGURAZIONE, quindi non compila nulla: né debug né
 * release, né i moduli nostri. È il motivo per cui «gradle è rotto» in questo
 * progetto da giorni. La sostituzione con `proguard-android-optimize.txt` è
 * esattamente quella che il messaggio d'errore suggerisce.
 *
 * Perché uno script e non una modifica a mano: `node_modules` si rigenera a
 * ogni `npm install` e la patch sparisce. Questo file gira come `postinstall`
 * ed è idempotente (se la riga è già corretta non fa nulla).
 *
 * LA CORREZIONE DEFINITIVA è aggiornare `@revenuecat/purchases-capacitor` a una
 * versione che supporti AGP 9: quando succede, questo script smette da solo di
 * trovare la riga e si può cancellare.
 *
 *   node scripts/patch-revenuecat-agp9.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(
  process.cwd(),
  'node_modules', '@revenuecat', 'purchases-capacitor', 'android', 'build.gradle',
);
const VECCHIO = "getDefaultProguardFile('proguard-android.txt')";
const NUOVO = "getDefaultProguardFile('proguard-android-optimize.txt')";

if (!fs.existsSync(FILE)) {
  // Dipendenza non installata (o rinominata): non è un errore, non c'è niente
  // da correggere. Mai far fallire un postinstall per questo.
  console.log('[patch-revenuecat] build.gradle non trovato: niente da fare.');
  process.exit(0);
}

const testo = fs.readFileSync(FILE, 'utf8');
if (!testo.includes(VECCHIO)) {
  console.log('[patch-revenuecat] già a posto (o versione nuova): nessuna modifica.');
  process.exit(0);
}

fs.writeFileSync(FILE, testo.replace(VECCHIO, NUOVO), 'utf8');
console.log('[patch-revenuecat] applicata: proguard-android.txt → proguard-android-optimize.txt');
