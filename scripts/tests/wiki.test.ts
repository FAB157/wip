/**
 * Banco di prova del modulo fonti (scripts/lib/wiki.ts).
 *
 * Parte è offline (confronto dei nomi, filtri sui file), parte interroga
 * davvero Wikipedia/Wikidata/Commons: serve a verificare che l'aggancio per
 * coordinate riconosca i monumenti veri e NON accosti nulla ai POI generici,
 * che è l'errore più costoso (foto e fatti di un altro luogo).
 *
 *   npm run test:data
 */
import {
  nameSimilarity,
  isAcceptableMatch,
  looksLikeBadFile,
  cleanImageUrl,
  collectPoiSources,
  findOfficialPhoto,
  fetchWikivoyageContext,
} from '../lib/wiki';

let passed = 0;
let failed = 0;

function check(nome: string, condizione: boolean, dettaglio = '') {
  if (condizione) {
    passed++;
    console.log(`  ✅ ${nome}`);
  } else {
    failed++;
    console.log(`  ❌ ${nome} ${dettaglio}`);
  }
}

async function main() {
  console.log('\n=== 1. Somiglianza dei nomi (Jaccard) ===');
  const identico = nameSimilarity('Duomo di Carrara', 'Duomo di Carrara');
  check('nome identico = 1', identico === 1, `(${identico})`);

  // Il caso che produceva il falso positivo: toponimo condiviso.
  const galleriaVsDuomo = nameSimilarity('Galleria Giovanni Bonelli Pietrasanta', 'Duomo di Pietrasanta');
  check('toponimo condiviso non basta (< 0.34)', galleriaVsDuomo < 0.34, `(${galleriaVsDuomo.toFixed(2)})`);

  const torre = nameSimilarity('Torre pendente di Pisa', 'Torre di Pisa');
  check('varianti dello stesso nome >= 0.34', torre >= 0.34, `(${torre.toFixed(2)})`);

  // Sinonimi IT/EN: i titoli stranieri di Commons devono restare confrontabili.
  const sinonimi = nameSimilarity('Monumento a Leopoldo II', 'Pietrasanta Monument Leopoldo II');
  check('sinonimi IT/EN riconosciuti', sinonimi >= 0.34, `(${sinonimi.toFixed(2)})`);

  const estranei = nameSimilarity('Bar Gelateria Da Mario', 'Piazza Alberica');
  check('nomi estranei ~ 0', estranei < 0.15, `(${estranei.toFixed(2)})`);

  console.log('\n=== 2. Soglia con la distanza ===');
  check('nome debole ma stesso punto (3m) accettato', isAcceptableMatch(0.2, 3));
  check('nome debole a 56m rifiutato', !isAcceptableMatch(0.2, 56));
  check('nome forte a 150m accettato', isAcceptableMatch(0.5, 150));

  console.log('\n=== 3. File da scartare su Commons ===');
  check('stemma scartato', looksLikeBadFile('File:Stemma di Carrara.png'));
  check('mappa scartata', looksLikeBadFile('File:Map of Tuscany.jpg'));
  check('svg scartato', looksLikeBadFile('File:Logo.svg'));
  check('foto vera accettata', !looksLikeBadFile('File:Carrara, duomo, esterno 02.jpg'));

  console.log('\n=== 4. Pulizia URL ===');
  const sporco = 'https://upload.wikimedia.org/x/y.jpg?utm_source=commons&utm_campaign=imageinfo';
  check('parametri di tracciamento rimossi', cleanImageUrl(sporco) === 'https://upload.wikimedia.org/x/y.jpg');

  console.log('\n=== 5. Fonti reali (rete) ===');
  const duomo = await collectPoiSources('Duomo di Carrara', 44.0793, 10.0977);
  check('Duomo di Carrara agganciato', !!duomo.match, JSON.stringify(duomo.match));
  check('Duomo: fatti Wikidata presenti', duomo.wikidata.length > 0, duomo.wikidata.slice(0, 60));
  check('Duomo: estratto Wikipedia presente', duomo.wikipedia.length > 100);

  const bar = await collectPoiSources('Bar Gelateria Da Mario', 44.0793, 10.0977);
  check('bar generico NON agganciato', bar.match === null, JSON.stringify(bar.match));

  const omonimo = await collectPoiSources('Chiesa di San Giuseppe', 44.04, 10.13);
  check('omonimo in mezzo al nulla NON agganciato', omonimo.match === null, JSON.stringify(omonimo.match));

  console.log('\n=== 6. Foto ufficiali (rete) ===');
  const fotoDuomo = await findOfficialPhoto('Duomo di Carrara', 44.0793, 10.0977);
  check('Duomo: foto ufficiale trovata', !!fotoDuomo, fotoDuomo?.source);
  check('Duomo: URL Wikimedia', !!fotoDuomo?.url.includes('wikimedia.org'), fotoDuomo?.url.slice(0, 70));

  const fotoBar = await findOfficialPhoto('Bar Gelateria Da Mario', 44.0793, 10.0977);
  check('bar: nessuna foto (niente falsi positivi)', fotoBar === null, fotoBar?.detail);

  console.log('\n=== 7. Wikivoyage come contesto ===');
  const wv = await fetchWikivoyageContext('Carrara');
  check('estratto Wikivoyage su Carrara', wv.length > 50, `${wv.length} caratteri`);

  console.log(`\n──────── RISULTATO: ${passed} superati, ${failed} falliti ────────`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Errore imprevisto nei test:', e);
  process.exit(1);
});
