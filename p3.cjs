#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// DA ESEGUIRE SUL DROPLET:  node /root/p3.cjs
//
// Aggiunge le 20 città più visitate al mondo alla libreria: Pattaya a
// livello città + 209 quartieri reali (19 città) × 2 giorni × 8 angoli =
// 3.360 descrittori nuovi, con priorità di semina alta.
//
// PREREQUISITO (fatto a mano, non da questo script): libraryMostVisited
// Cities.ts già copiato in /root/itainta/src/lib/.
//
// NOTA IMPORTANTE scoperta oggi: il libraryDescriptors.ts di QUESTO droplet
// è più vecchio del repo locale — non ha MAI ricevuto EXTRA_WORLD_ZONES /
// EXTRA_WORLD_ZONES_2 / EXTRA_THEME_PLACES (~5.000 descrittori, i file
// libraryDescriptorsExtra.ts e Extra2.ts non esistono qui). Questo script
// NON tocca quel problema: aggiunge solo il blocco delle 20 città sopra
// a quello che il droplet ha già. Il buco dei ~5.000 descrittori extra
// resta, ed è una patch separata.
//
// Cosa fa, in ordine, fermandosi al primo errore:
//   1. patch di libraryDescriptors.ts (import + merge Pattaya in
//      worldZoneDescriptors + nuova funzione megacityDistrictDescriptors +
//      hook in getAllDescriptors + blocco di priorità prima di ENOGASTRONOMIA)
//   2. compila server.ts in /tmp/server.new.cjs
//   3. solo se la compilazione riesce, sostituisce dist/server.cjs
//   4. riavvia wip-api
//
// IDEMPOTENTE. Se le ancore non combaciano non scrive niente ed esce.
// Backup: crea src/lib/libraryDescriptors.ts.bak-20260823 se non esiste.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = '/root/itainta';
const FILE = DIR + '/src/lib/libraryDescriptors.ts';
const BAK = FILE + '.bak-20260823';
const NEWDATA = DIR + '/src/lib/libraryMostVisitedCities.ts';

if (!fs.existsSync(NEWDATA)) {
  console.error(`STOP: manca ${NEWDATA}. Copialo prima di lanciare questo script.`);
  process.exit(1);
}

let t = fs.readFileSync(FILE, 'utf8');
const prima = t.length;

if (t.includes('MEGACITY_DISTRICTS') || t.includes('megacityDistrictDescriptors')) {
  console.log('1/4  patch già applicata, salto.');
} else {
  // ── 1a. import ─────────────────────────────────────────────────────
  const IMP_ANCORA = "import { WORLD_ZONES, type WorldZone } from './libraryZonesWorld';";
  const IMP_NUOVO = `${IMP_ANCORA}
// Le 20 città più visitate al mondo (23/08/2026): quartieri reali + Pattaya
// (l'unica delle 20 senza itinerario di livello città già in catalogo).
// Solo dati, nessun import — stessa regola delle altre "Extra".
import { MEGACITY_DISTRICTS, MEGACITY_TOP_LEVEL_EXTRA, type MegacityDistrict } from './libraryMostVisitedCities';`;
  {
    const k = t.indexOf(IMP_ANCORA);
    if (k < 0) { console.error('STOP: ancora import non trovata. Niente scritto.'); process.exit(1); }
    if (t.indexOf(IMP_ANCORA, k + 1) >= 0) { console.error('STOP: ancora import ambigua. Niente scritto.'); process.exit(1); }
    t = t.slice(0, k) + IMP_NUOVO + t.slice(k + IMP_ANCORA.length);
  }

  // ── 1b. Pattaya nel merge di worldZoneDescriptors ────────────────────
  const MERGE_ANCORA = '  for (const z of WORLD_ZONES) {';
  const MERGE_NUOVO = '  for (const z of [...WORLD_ZONES, ...MEGACITY_TOP_LEVEL_EXTRA]) {';
  {
    const k = t.indexOf(MERGE_ANCORA);
    if (k < 0) { console.error('STOP: ancora merge WORLD_ZONES non trovata. Niente scritto.'); process.exit(1); }
    if (t.indexOf(MERGE_ANCORA, k + 1) >= 0) { console.error('STOP: ancora merge ambigua. Niente scritto.'); process.exit(1); }
    t = t.slice(0, k) + MERGE_NUOVO + t.slice(k + MERGE_ANCORA.length);
  }

  // ── 1c. nuova funzione megacityDistrictDescriptors, prima di
  //        worldZonesByTier ───────────────────────────────────────────
  const FUNC_ANCORA = `/** Le zone mondiali ordinate per priorità di semina (tier 1 → 3), a parità
 *  di tier nell'ordine di catalogo (Italia, Francia, Spagna, resto). */
function worldZonesByTier(): WorldZone[] {`;
  const FUNC_NUOVO = `// ─────────────────────────────────────────────────────────────────────
// I QUARTIERI DELLE 20 CITTÀ PIÙ VISITATE AL MONDO (23/08/2026,
// MEGACITY_DISTRICTS in libraryMostVisitedCities.ts). Stessa forma di
// zoneDescriptors/worldZoneDescriptors: STESSI 8 angoli (PORT_ZONE_ANGLES,
// gratis ed esperienze compresi), stesso schema JSON, stessa verifica
// anti-invenzione lato server. Unica differenza editoriale: 1-2 giorni
// invece di 1-2-3, perché un quartiere è più piccolo di una città intera.
// Le coordinate sono quelle del QUARTIERE, non del centro città.
// ─────────────────────────────────────────────────────────────────────

const DISTRICT_DAYS = [1, 2] as const;

export function megacityDistrictDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  const seenSlug = new Set<string>();
  for (const r of MEGACITY_DISTRICTS as MegacityDistrict[]) {
    const cityKey = slugify(r.city);
    const distKey = slugify(r.district);
    for (const d of DISTRICT_DAYS) {
      for (const a of PORT_ZONE_ANGLES) {
        const slug = \`zone-\${cityKey}-\${distKey}-\${d}g-\${a.id}\`;
        if (seenSlug.has(slug)) continue;
        seenSlug.add(slug);
        const brief = [
          a.brief,
          \`CONTESTO QUARTIERE: \${r.district}, dentro \${r.city} (\${r.country}) — \${r.note}.\`,
          \`Questo itinerario resta DENTRO \${r.district} e nelle sue immediate vicinanze: non è un giro di tutta \${r.city}, è la lettura approfondita di UNA sua parte. Se il taglio scelto porterebbe fuori da qui, scegli una tappa diversa ma resta nel quartiere.\`,
          \`Durata: \${d} \${d === 1 ? 'giorno' : 'giorni'}. \${
            d === 1
              ? 'Un giorno: il meglio del quartiere, senza correre e senza uscirne.'
              : 'Due giorni: il primo per orientarsi e vedere i punti noti, il secondo per scendere più a fondo nello stesso quartiere.'
          }\`,
        ].join('\\n');
        out.push({
          slug,
          kind: 'zone',
          title: \`\${r.district} (\${r.city}) in \${d} \${d === 1 ? 'giorno' : 'giorni'} — \${a.label}\`,
          city: \`\${r.district}, \${r.city}\`,
          country: r.country,
          coords: { lat: r.lat, lon: r.lon },
          days: d,
          angle: a.id,
          brief,
          ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
          ...(a.id === 'gastronomica' ? { contextHints: { osmGusto: true, osmWinery: true } } : {}),
        });
      }
    }
  }
  return out;
}

${FUNC_ANCORA}`;
  {
    const k = t.indexOf(FUNC_ANCORA);
    if (k < 0) { console.error('STOP: ancora worldZonesByTier non trovata. Niente scritto.'); process.exit(1); }
    if (t.indexOf(FUNC_ANCORA, k + 1) >= 0) { console.error('STOP: ancora worldZonesByTier ambigua. Niente scritto.'); process.exit(1); }
    t = t.slice(0, k) + FUNC_NUOVO + t.slice(k + FUNC_ANCORA.length);
  }

  // ── 1d. hook in getAllDescriptors ────────────────────────────────────
  const GAD_ANCORA = '      ...zoneDescriptors(),\n      ...worldZoneDescriptors(),';
  const GAD_NUOVO = '      ...zoneDescriptors(),\n      ...worldZoneDescriptors(),\n      ...megacityDistrictDescriptors(),';
  {
    const k = t.indexOf(GAD_ANCORA);
    if (k < 0) { console.error('STOP: ancora getAllDescriptors non trovata. Niente scritto.'); process.exit(1); }
    if (t.indexOf(GAD_ANCORA, k + 1) >= 0) { console.error('STOP: ancora getAllDescriptors ambigua. Niente scritto.'); process.exit(1); }
    t = t.slice(0, k) + GAD_NUOVO + t.slice(k + GAD_ANCORA.length);
  }

  // ── 1e. blocco di priorità, prima di ENOGASTRONOMIA ──────────────────
  const PRI_ANCORA = "  // 2-quater) ENOGASTRONOMIA. Prima di questo blocco la sezione del gusto";
  const PRI_NUOVO = `  // 2-ter-bis) I QUARTIERI DELLE 20 CITTÀ PIÙ VISITATE AL MONDO (23/08/2026,
  //    MEGACITY_DISTRICTS). Prima Pattaya a livello città, poi per ogni
  //    quartiere il giorno 1 con TUTTI gli 8 angoli (gratis/esperienze
  //    incluse fin dal primo giro), poi il giorno 2 nello stesso ordine.
  for (const combo of ['2g-classica', \`2g-\${FREE_ANGLE.id}\`, \`2g-\${BOOKABLE_ANGLE.id}\`, '3g-classica']) {
    push(\`zone-pattaya-\${combo}\`);
  }
  for (const d of [1, 2]) {
    for (const r of MEGACITY_DISTRICTS as MegacityDistrict[]) {
      const key = \`\${slugify(r.city)}-\${slugify(r.district)}\`;
      for (const a of PORT_ZONE_ANGLES) {
        push(\`zone-\${key}-\${d}g-\${a.id}\`);
      }
    }
  }

${PRI_ANCORA}`;
  {
    const k = t.indexOf(PRI_ANCORA);
    if (k < 0) { console.error('STOP: ancora blocco priorità non trovata. Niente scritto.'); process.exit(1); }
    if (t.indexOf(PRI_ANCORA, k + 1) >= 0) { console.error('STOP: ancora blocco priorità ambigua. Niente scritto.'); process.exit(1); }
    t = t.slice(0, k) + PRI_NUOVO + t.slice(k + PRI_ANCORA.length);
  }

  if (!fs.existsSync(BAK)) fs.copyFileSync(FILE, BAK);
  fs.writeFileSync(FILE, t);
  console.log(`1/4  patch applicata: ${prima} -> ${t.length} byte (+${t.length - prima}).`);
  console.log(`     backup: ${BAK}`);
}

console.log('2/4  compilo in /tmp/server.new.cjs ...');
execSync('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=/tmp/server.new.cjs', { cwd: DIR, stdio: 'inherit', timeout: 600000 });

console.log('3/4  sostituisco dist/server.cjs ...');
execSync('cp /tmp/server.new.cjs dist/server.cjs', { cwd: DIR, stdio: 'inherit' });

console.log('4/4  riavvio wip-api ...');
execSync('npx pm2 restart wip-api', { cwd: DIR, stdio: 'inherit', timeout: 300000 });

console.log('');
console.log('FATTO.');
console.log('Per annullare:');
console.log('  cd /root/itainta && cp src/lib/libraryDescriptors.ts.bak-20260823 src/lib/libraryDescriptors.ts && npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=/tmp/server.rollback.cjs && cp /tmp/server.rollback.cjs dist/server.cjs && npx pm2 restart wip-api');
