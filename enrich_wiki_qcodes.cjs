/**
 * enrich_wiki_qcodes.cjs
 * Per ogni POI con ID "wiki-XXXXXX", recupera il Q-code Wikidata
 * tramite Wikipedia API e lo salva in technical_data.wikidata su Supabase.
 *
 * Strategia:
 *  - Chiama Wikipedia API a batch di 50 pageId (limite API)
 *  - Legge pageprops.wikibase_item → Q-code
 *  - Aggiorna technical_data JSONB su shared_pois
 *  - Salva un log JSON dei risultati
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WIKI_API = 'https://it.wikipedia.org/w/api.php';
const BATCH_SIZE = 50;   // max pageids per Wikipedia API call
const DELAY_MS  = 300;   // delay tra batch (rispetto rate limit Wikipedia)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Recupera Q-codes da Wikipedia API per un batch di pageIds ────────────
async function fetchQcodes(pageIds) {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('pageids', pageIds.join('|'));
  url.searchParams.set('prop', 'pageprops');
  url.searchParams.set('ppprop', 'wikibase_item');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const resp = await fetch(url.toString(), {
    headers: { 'User-Agent': 'ItaInta/1.0 (info@itainta.it)' }
  });

  if (!resp.ok) throw new Error(`Wikipedia API error: ${resp.status}`);
  const json = await resp.json();

  const result = {};
  const pages = json?.query?.pages || {};
  for (const [pid, page] of Object.entries(pages)) {
    const qcode = page?.pageprops?.wikibase_item;
    if (qcode && /^Q\d+$/.test(qcode)) {
      result[pid] = qcode;
    }
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Arricchimento Q-code Wikidata per POI wiki-* ===\n');

  // 1. Scarica tutti i POI wiki-* senza Q-code
  console.log('📥 Recupero POI wiki-* dal database...');
  const PAGE = 1000;
  let allPois = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, category, technical_data')
      .like('id', 'wiki-%')
      .range(from, from + PAGE - 1);

    if (error) { console.error('❌ Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allPois = allPois.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Filtra solo quelli senza Q-code già valido
  const toEnrich = allPois.filter(p => {
    const td = p.technical_data || {};
    const qcode = td.wikidata || td.wikidata_id || null;
    return !qcode || !/^Q\d+$/.test(String(qcode).trim());
  });

  console.log(`📊 Totale POI wiki-*: ${allPois.length}`);
  console.log(`🔄 Da arricchire    : ${toEnrich.length}`);
  console.log(`✅ Già con Q-code   : ${allPois.length - toEnrich.length}\n`);

  if (toEnrich.length === 0) {
    console.log('✅ Nessun POI da arricchire. Tutto aggiornato!');
    return;
  }

  // 2. Processa a batch
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  const notFoundList = [];

  const batches = [];
  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    batches.push(toEnrich.slice(i, i + BATCH_SIZE));
  }

  console.log(`🚀 Avvio arricchimento: ${batches.length} batch da max ${BATCH_SIZE} POI ciascuno\n`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pageIds = batch.map(p => p.id.replace('wiki-', ''));

    process.stdout.write(`\r  Batch ${bi + 1}/${batches.length} (${updated} aggiornati, ${notFound} non trovati)...`);

    let qcodeMap = {};
    try {
      qcodeMap = await fetchQcodes(pageIds);
    } catch (err) {
      console.error(`\n  ❌ Errore batch ${bi + 1}: ${err.message}`);
      errors++;
      await sleep(DELAY_MS * 3);
      continue;
    }

    // 3. Aggiorna ogni POI con il Q-code trovato
    for (const poi of batch) {
      const pageId = poi.id.replace('wiki-', '');
      const qcode = qcodeMap[pageId];

      if (!qcode) {
        notFound++;
        notFoundList.push({ id: poi.id, name: poi.name, cat: poi.category });
        continue;
      }

      // Merge Q-code nel technical_data esistente
      const existingTd = poi.technical_data || {};
      const newTd = { ...existingTd, wikidata: qcode };

      const { error: updateErr } = await supabase
        .from('shared_pois')
        .update({ technical_data: newTd })
        .eq('id', poi.id);

      if (updateErr) {
        console.error(`\n  ❌ Update error per ${poi.id}: ${updateErr.message}`);
        errors++;
      } else {
        updated++;
      }
    }

    await sleep(DELAY_MS);
  }

  // ── Riepilogo finale ───────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════╗');
  console.log('║        RIEPILOGO ARRICCHIMENTO Q-CODE            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║ ✅ Q-code salvati con successo  : ${String(updated).padStart(6)}           ║`);
  console.log(`║ ❓ PageId senza match Wikidata  : ${String(notFound).padStart(6)}           ║`);
  console.log(`║ ❌ Errori                       : ${String(errors).padStart(6)}           ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (notFoundList.length > 0) {
    console.log(`\n⚠️  POI senza match Wikipedia→Wikidata (primi 20):`);
    notFoundList.slice(0, 20).forEach(p => {
      console.log(`   [${p.id}] "${p.name}" | cat: ${p.cat}`);
    });

    // Salva lista completa su file per analisi successiva
    const fs = require('fs');
    fs.writeFileSync('wiki_not_found_qcode.json', JSON.stringify(notFoundList, null, 2));
    console.log(`\n💾 Lista completa salvata in: wiki_not_found_qcode.json`);
  }

  console.log('\n✅ Arricchimento completato!');
}

main().catch(console.error);
