/**
 * Verifica la "regola ferrea" del filtro categorie (src/lib/poiTaxonomy.ts).
 *
 * È il punto in cui un errore si vede subito dall'utente: chiese e musei
 * deselezionati che restano sulla mappa, o al contrario POI legittimi che
 * spariscono. La logica è pura apposta per poter essere provata qui.
 *
 *   npm run test:data
 */
async function main() {
  const mod: any = await import('../../src/lib/poiTaxonomy');

  const { resolvePoiTaxonomy, passesCategoryRule } = mod;
  let passed = 0, failed = 0;
  const check = (nome: string, cond: boolean, det = '') => {
    if (cond) { passed++; console.log(`  ✅ ${nome}`); }
    else { failed++; console.log(`  ❌ ${nome} ${det}`); }
  };

  const chiesa = { id: '1', name: 'Chiesa di San Martino', category: 'church', baseCategory: 'chiese' };
  const museo = { id: '2', name: 'Museo Civico', category: 'museum', baseCategory: 'musei' };
  const monumento = { id: '3', name: 'Torre Civica', category: 'monument', baseCategory: 'monumenti' };
  const gemma = { id: '4', name: 'Pieve nascosta', category: 'chiese', baseCategory: 'chiese', is_gem: true };
  const ristorante = { id: '5', name: 'Trattoria da Gino', category: 'locali', baseCategory: 'locali', amenity: 'restaurant' };
  const farmacia = { id: '6', name: 'Farmacia Centrale', category: 'utilita', baseCategory: 'utilita', subCategory: 'farmacia' };

  console.log('\n=== Tassonomia ===');
  check('chiesa → macro monumenti / sub chiese',
    resolvePoiTaxonomy(chiesa).macro === 'monumenti' && resolvePoiTaxonomy(chiesa).subId === 'chiese',
    JSON.stringify(resolvePoiTaxonomy(chiesa)));
  check('gemma resta macro gemme',
    resolvePoiTaxonomy(gemma).macro === 'gemme', JSON.stringify(resolvePoiTaxonomy(gemma)));
  check('ristorante → locali', resolvePoiTaxonomy(ristorante).macro === 'locali');
  check('farmacia → utilita/farmacia',
    resolvePoiTaxonomy(farmacia).macro === 'utilita' && resolvePoiTaxonomy(farmacia).subId === 'farmacia');

  console.log('\n=== Regola ferrea ===');
  // Il bug segnalato: "monumenti" selezionato, chiese/musei deselezionati.
  const soloMonumenti = ['monumenti'];
  check('con solo Monumenti e sub "monumenti_sub": la chiesa NON si vede',
    !passesCategoryRule(chiesa, soloMonumenti, ['monumenti_sub']));
  check('con solo Monumenti e sub "monumenti_sub": il museo NON si vede',
    !passesCategoryRule(museo, soloMonumenti, ['monumenti_sub']));
  check('con solo Monumenti e sub "monumenti_sub": il monumento SI vede',
    passesCategoryRule(monumento, soloMonumenti, ['monumenti_sub']));

  check('senza sub-chip attivi si vede tutta la macro (chiesa)',
    passesCategoryRule(chiesa, soloMonumenti, []));
  check('macro non selezionata: il locale NON si vede',
    !passesCategoryRule(ristorante, soloMonumenti, []));

  // I sub-chip di ALTRE macro non devono influenzare questo POI.
  check('sub-chip di Locali non nasconde le chiese',
    passesCategoryRule(chiesa, ['monumenti', 'locali'], ['ristorante']));
  check('sub-chip di Locali filtra i locali',
    passesCategoryRule(ristorante, ['monumenti', 'locali'], ['ristorante']));

  check('gemma visibile solo se "gemme" è selezionata',
    passesCategoryRule(gemma, ['gemme'], []) && !passesCategoryRule(gemma, ['monumenti'], []));

  check('utilita con sub farmacia attivo',
    passesCategoryRule(farmacia, ['utilita'], ['farmacia']));
  check('utilita con sub diverso (ospedale) esclude la farmacia',
    !passesCategoryRule(farmacia, ['utilita'], ['ospedale']));

  console.log(`\n──────── FILTRO: ${passed} superati, ${failed} falliti ────────`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
