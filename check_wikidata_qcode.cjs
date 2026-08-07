/**
 * check_wikidata_qcode.cjs
 * Verifica se ogni POI in shared_pois ha un codice Wikidata Q...
 * Controlla sia la colonna diretta `wikidata` sia il campo JSONB `technical_data->wikidata`
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qfxxhzkkrkvbuekfknhh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkWikidataQCodes() {
  console.log('=== Verifica codici Wikidata Q... in shared_pois ===\n');

  // Prima: scopriamo le colonne disponibili sulla tabella
  console.log('🔍 Recupero struttura tabella...');
  const { data: sample, error: sampleErr } = await supabase
    .from('shared_pois')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Errore accesso tabella shared_pois:', sampleErr.message);
    return;
  }

  const availableCols = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
  console.log('📋 Colonne disponibili:', availableCols.join(', '), '\n');

  const hasWikidataCol = availableCols.includes('wikidata');
  const hasTechnicalData = availableCols.includes('technical_data');

  console.log(`→ Colonna 'wikidata' diretta: ${hasWikidataCol ? '✅ presente' : '❌ assente'}`);
  console.log(`→ Colonna 'technical_data' JSONB: ${hasTechnicalData ? '✅ presente' : '❌ assente'}`);
  console.log('');

  // Recupera tutti i POI con i campi rilevanti (paginato a 1000 per volta)
  console.log('📥 Recupero tutti i POI...');
  
  const PAGE = 1000;
  let allPois = [];
  let from = 0;

  while (true) {
    const selectFields = ['id', 'name', 'status', 'category'];
    if (hasWikidataCol) selectFields.push('wikidata');
    if (hasTechnicalData) selectFields.push('technical_data');

    const { data, error } = await supabase
      .from('shared_pois')
      .select(selectFields.join(','))
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('❌ Errore fetch:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allPois = allPois.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`📊 Totale POI trovati: ${allPois.length}\n`);

  if (allPois.length === 0) {
    console.log('Nessun POI trovato.');
    return;
  }

  // Analisi per ogni POI
  const withQCode = [];
  const withoutQCode = [];
  const withInvalidQCode = [];

  for (const poi of allPois) {
    // Cerca il Q-code nella colonna diretta o nel JSONB
    let qcode = null;

    if (hasWikidataCol && poi.wikidata) {
      qcode = typeof poi.wikidata === 'string' ? poi.wikidata : JSON.stringify(poi.wikidata);
    }

    if (!qcode && hasTechnicalData && poi.technical_data) {
      const td = typeof poi.technical_data === 'string'
        ? JSON.parse(poi.technical_data)
        : poi.technical_data;
      qcode = td?.wikidata || null;
    }

    if (!qcode) {
      withoutQCode.push(poi);
    } else if (/^Q\d+$/.test(qcode.trim())) {
      withQCode.push({ ...poi, _qcode: qcode });
    } else {
      // Ha un valore ma non è un Q-code valido
      withInvalidQCode.push({ ...poi, _qcode: qcode });
    }
  }

  // ── Riepilogo ────────────────────────────────────────────────────────
  const total = allPois.length;
  const pct = (n) => ((n / total) * 100).toFixed(1);

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          RIEPILOGO WIKIDATA Q-CODE               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║ Totale POI                    : ${String(total).padStart(7)}          ║`);
  console.log(`║ ✅ Con Q-code valido (Q\\d+)   : ${String(withQCode.length).padStart(7)} (${pct(withQCode.length).padStart(5)}%) ║`);
  console.log(`║ ⚠️  Con valore non-valido      : ${String(withInvalidQCode.length).padStart(7)} (${pct(withInvalidQCode.length).padStart(5)}%) ║`);
  console.log(`║ ❌ Senza Q-code               : ${String(withoutQCode.length).padStart(7)} (${pct(withoutQCode.length).padStart(5)}%) ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // ── POI con valore non valido ─────────────────────────────────────
  if (withInvalidQCode.length > 0) {
    console.log(`⚠️  POI con valore wikidata NON conforme a Q\\d+ (primi 20):`);
    withInvalidQCode.slice(0, 20).forEach(p => {
      console.log(`   [${p.id}] "${p.name}" → wikidata="${p._qcode}"`);
    });
    console.log('');
  }

  // ── POI senza Q-code ─────────────────────────────────────────────
  if (withoutQCode.length > 0) {
    console.log(`❌ POI senza Q-code (primi 50):`);
    withoutQCode.slice(0, 50).forEach(p => {
      const cat = p.category || '?';
      const status = p.status || '?';
      console.log(`   [${p.id}] "${p.name}" | cat: ${cat} | status: ${status}`);
    });

    if (withoutQCode.length > 50) {
      console.log(`   ... e altri ${withoutQCode.length - 50} POI senza Q-code`);
    }
  }

  // ── Breakdown per categoria dei mancanti ────────────────────────
  if (withoutQCode.length > 0) {
    console.log('\n📂 POI senza Q-code per categoria:');
    const byCat = {};
    for (const p of withoutQCode) {
      const cat = p.category || 'N/A';
      byCat[cat] = (byCat[cat] || 0) + 1;
    }
    Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat.padEnd(25)}: ${count} POI (${pct(count)}%)`);
      });
  }

  console.log('\n✅ Verifica completata.');
}

checkWikidataQCodes().catch(console.error);
