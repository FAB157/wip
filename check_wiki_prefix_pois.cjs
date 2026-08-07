/**
 * check_wiki_prefix_pois.cjs
 * Conta quanti POI con ID "wiki-XXXXXXX" NON hanno ancora un Q-code Wikidata
 * e mostra quanti potrebbero essere arricchiti automaticamente.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('=== Analisi POI con prefisso wiki-* ===\n');

  const PAGE = 1000;
  let allPois = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, category, status, technical_data')
      .like('id', 'wiki-%')
      .range(from, from + PAGE - 1);

    if (error) { console.error('❌', error.message); break; }
    if (!data || data.length === 0) break;
    allPois = allPois.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\r  Scaricati ${allPois.length} POI wiki-*...`);
  }

  console.log(`\n\n📊 Totale POI con ID "wiki-*": ${allPois.length}`);

  let withQcode = 0;
  let withPageId = 0;
  let missingBoth = 0;

  for (const p of allPois) {
    const td = p.technical_data || {};
    const qcode = td.wikidata || td.wikidata_id || null;
    const pageId = p.id.replace('wiki-', '') || td.wikipedia_raw?.pageid || null;

    if (qcode && /^Q\d+$/.test(String(qcode).trim())) {
      withQcode++;
    } else if (pageId) {
      withPageId++;
    } else {
      missingBoth++;
    }
  }

  console.log(`\n✅ Con Q-code già presente        : ${withQcode}`);
  console.log(`🔄 Con page ID (arricchibili auto) : ${withPageId}  ← questi possiamo completare!`);
  console.log(`❓ Senza né Q-code né page ID      : ${missingBoth}`);

  // Mostra un campione dei arricchibili
  const sample = allPois
    .filter(p => {
      const td = p.technical_data || {};
      const qcode = td.wikidata || td.wikidata_id || null;
      return !qcode || !/^Q\d+$/.test(String(qcode).trim());
    })
    .slice(0, 10);

  console.log('\n📋 Campione POI arricchibili:');
  sample.forEach(p => {
    const pageId = p.id.replace('wiki-', '');
    console.log(`  [${p.id}] "${p.name}" | cat: ${p.category} | pageId: ${pageId}`);
  });
}

check().catch(console.error);
