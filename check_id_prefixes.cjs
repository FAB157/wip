/**
 * check_id_prefixes.cjs
 * Analizza la distribuzione degli ID prefix in shared_pois
 * per capire quanti POI potrebbero avere riferimenti Wikipedia/Wikidata
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('=== Distribuzione ID prefissi in shared_pois ===\n');

  const PAGE = 1000;
  let allIds = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, technical_data')
      .range(from, from + PAGE - 1);

    if (error) { console.error('❌', error.message); break; }
    if (!data || data.length === 0) break;
    allIds = allIds.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
    if (from % 10000 === 0) process.stdout.write(`\r  Scaricati ${from}...`);
  }

  console.log(`\n📊 Totale POI: ${allIds.length}\n`);

  // Categorizza per prefisso
  const prefixes = {};
  let withWikidataInTD = 0;
  let withWikipediaInTD = 0;
  let withWikibaseInTD = 0;

  for (const p of allIds) {
    // Prefisso ID
    let prefix;
    if (p.id.startsWith('wiki-')) prefix = 'wiki-';
    else if (p.id.startsWith('osm-')) prefix = 'osm-';
    else if (p.id.startsWith('csv-luoghi-')) prefix = 'csv-luoghi-';
    else if (p.id.startsWith('unesco-')) prefix = 'unesco-';
    else if (/^\d+_\d+_\d+_\d+$/.test(p.id)) prefix = 'NUM_NUM_NUM_NUM (coordinate-based)';
    else if (/^\d+$/.test(p.id)) prefix = 'numerico puro';
    else prefix = 'altro: ' + p.id.split('-')[0];

    prefixes[prefix] = (prefixes[prefix] || 0) + 1;

    // Controlla technical_data per wikipedia/wikidata
    const td = p.technical_data || {};
    if (td.wikidata) withWikidataInTD++;
    if (td.wikipedia || td.wikipedia_raw) withWikipediaInTD++;
    if (td.wikibase_item) withWikibaseInTD++;
  }

  // Mostra distribuzione
  console.log('📂 Distribuzione per prefisso ID:');
  Object.entries(prefixes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([prefix, count]) => {
      const pct = ((count / allIds.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / allIds.length * 40));
      console.log(`  ${prefix.padEnd(35)} ${String(count).padStart(7)} (${pct.padStart(5)}%) ${bar}`);
    });

  console.log('\n📋 Dati Wikipedia/Wikidata in technical_data:');
  console.log(`  Con td.wikidata             : ${withWikidataInTD}`);
  console.log(`  Con td.wikipedia/_raw       : ${withWikipediaInTD}`);
  console.log(`  Con td.wikibase_item        : ${withWikibaseInTD}`);

  // Mostra campione dei "osm-" con wikidata nel td
  const osmWithWiki = allIds
    .filter(p => p.id.startsWith('osm-') && (p.technical_data?.wikidata || p.technical_data?.wikipedia))
    .slice(0, 5);
  if (osmWithWiki.length > 0) {
    console.log('\n📋 Campione osm-* con Wikipedia/Wikidata in technical_data:');
    osmWithWiki.forEach(p => {
      console.log(`  [${p.id}] td.wikidata="${p.technical_data?.wikidata}" td.wikipedia="${p.technical_data?.wikipedia}"`);
    });
  }
}

check().catch(console.error);
