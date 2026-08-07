/**
 * check_cultural_enrichment.cjs
 * Verifica quanti POI delle categorie culturali sono "arricchiti"
 * - con Q-code Wikidata
 * - con descrizioni estese (description_ai / description_long)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Definiamo le categorie "culturali"
const CULTURAL_CATS = [
  'monument',
  'museum',
  'church',
  'castle',
  'archaeological_site',
  'attraction',
  'artwork',
  'gemme'
];

async function check() {
  console.log('=== Analisi Arricchimento Categorie Culturali ===\n');

  const PAGE = 1000;
  let allPois = [];
  let from = 0;

  console.log('📥 Scaricamento POI culturali...');

  while (true) {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, category, description_ai, description_long, technical_data, enriched_at')
      .in('category', CULTURAL_CATS)
      .range(from, from + PAGE - 1);

    if (error) { console.error('❌', error.message); break; }
    if (!data || data.length === 0) break;
    allPois = allPois.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\r  Scaricati ${allPois.length} POI...`);
  }

  console.log(`\n\n📊 Totale POI culturali: ${allPois.length}`);

  const statsByCat = {};
  CULTURAL_CATS.forEach(c => {
    statsByCat[c] = { total: 0, withQcode: 0, withDesc: 0 };
  });

  let totalQcode = 0;
  let totalDesc = 0;

  for (const p of allPois) {
    const cat = p.category;
    if (!statsByCat[cat]) continue;
    
    statsByCat[cat].total++;

    // Controllo Q-code
    const td = p.technical_data || {};
    const qcode = td.wikidata || td.wikidata_id || null;
    if (qcode && /^Q\d+$/.test(String(qcode).trim())) {
      statsByCat[cat].withQcode++;
      totalQcode++;
    }

    // Controllo Descrizione (description_ai o description_long)
    const hasDesc = (p.description_ai && p.description_ai.length > 50) || 
                    (p.description_long && p.description_long.length > 50);
    if (hasDesc) {
      statsByCat[cat].withDesc++;
      totalDesc++;
    }
  }

  const pct = (n, t) => t > 0 ? ((n / t) * 100).toFixed(1) : '0.0';

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║               STATISTICHE ARRICCHIMENTO CULTURALE                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║ Totale POI culturali       : ${String(allPois.length).padStart(6)}                            ║`);
  console.log(`║ ✅ Con Wikidata Q-code     : ${String(totalQcode).padStart(6)} (${pct(totalQcode, allPois.length).padStart(5)}%)                    ║`);
  console.log(`║ ❌ Senza Wikidata Q-code   : ${String(allPois.length - totalQcode).padStart(6)} (${pct(allPois.length - totalQcode, allPois.length).padStart(5)}%)                    ║`);
  console.log(`║                                                                  ║`);
  console.log(`║ 📝 Con Descrizione Lunga   : ${String(totalDesc).padStart(6)} (${pct(totalDesc, allPois.length).padStart(5)}%)                    ║`);
  console.log(`║ 🈳 Senza Descrizione Lunga : ${String(allPois.length - totalDesc).padStart(6)} (${pct(allPois.length - totalDesc, allPois.length).padStart(5)}%)                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('📂 Dettaglio per Categoria:');
  console.log('  Categoria              | Totale | Con Q-Code  | Con Descrizione');
  console.log('  -----------------------+--------+-------------+-----------------');
  
  Object.entries(statsByCat).sort((a,b) => b[1].total - a[1].total).forEach(([cat, stats]) => {
    if (stats.total === 0) return;
    const catName = cat.padEnd(22);
    const tot = String(stats.total).padStart(6);
    const qcode = `${stats.withQcode} (${pct(stats.withQcode, stats.total)}%)`.padStart(11);
    const desc = `${stats.withDesc} (${pct(stats.withDesc, stats.total)}%)`.padStart(15);
    console.log(`  ${catName} | ${tot} | ${qcode} | ${desc}`);
  });
  
  console.log('\n✅ Analisi completata!');
}

check().catch(console.error);
