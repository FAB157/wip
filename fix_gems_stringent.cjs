/**
 * fix_gems_stringent.cjs
 * Revisiona le gemme già nel DB con la nuova logica v4 più stringente.
 * Rimuove is_gem=true dai POI che non soddisfano più i criteri.
 */
const { Client } = require('pg');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

// ── GEM SCORE v4 ─────────────────────────────────────────────────────
// Rispecchia esattamente la logica in import_italiasud_v4.cjs
const GEM_THRESHOLD = 8;

// Le categorie che possono diventare gemme (top-tier)
const TOP_TIER = new Set(['castle','ruins','archaeological_site','artwork']);

function gemScoreFromRow(row) {
  const cat = row.category || '';
  const wikipedia = row.wikipedia || '';
  const wikidata = row.wikidata || '';
  const historic = row.historic_tag || '';
  const wikimedia_commons = row.wikimedia_commons || '';
  const has_image = !!row.image_url;
  const opening_hours = row.opening_hours || '';
  const name = row.name || '';

  let s = 0;

  if (TOP_TIER.has(cat)) s += 3;
  if (cat === 'museum') s += 2;

  if (wikipedia) s += 3;
  if (wikidata)  s += 1;
  if (historic)  s += 2;
  if (wikimedia_commons) s += 1;
  if (has_image) s += 1;
  if (opening_hours) s += 1;

  // Penalità: nome corto senza wikipedia
  if (!wikipedia && name.trim().split(/\s+/).length < 3) s -= 2;

  return s;
}

function isGemV4(row) {
  const score = gemScoreFromRow(row);
  if (score < GEM_THRESHOLD) return false;
  const hasSources = !!(row.wikipedia || (row.wikidata && row.historic_tag));
  return hasSources;
}

async function main() {
  await client.connect();
  console.log('✅ Connesso al DB\n');

  // 1. Conta gemme attuali
  const r0 = await client.query(`SELECT COUNT(*) AS tot FROM public.shared_pois WHERE is_gem = true`);
  console.log(`💎 Gemme attuali nel DB: ${r0.rows[0].tot}`);

  // 2. Recupera tutte le gemme con dati utili
  // Nota: shared_pois non ha campo wikipedia/historic direttamente.
  // Li recuperiamo da punti_interesse tramite JOIN su osm_id = replace(id, 'osm-', '')
  const { rows: gems } = await client.query(`
    SELECT 
      sp.id,
      sp.name,
      sp.category,
      sp.image_url,
      pi.wikipedia,
      pi.wikidata,
      pi.historic AS historic_tag,
      pi.wikimedia_commons,
      pi.opening_hours
    FROM public.shared_pois sp
    LEFT JOIN public.punti_interesse pi 
      ON pi.osm_id = REPLACE(sp.id, 'osm-', '')
    WHERE sp.is_gem = true
    ORDER BY sp.id
  `);

  console.log(`\n🔍 Analisi di ${gems.length} gemme...\n`);

  let kept = 0, removed = 0, noMatch = 0;
  const toRemove = [];

  for (const row of gems) {
    const pass = isGemV4(row);
    if (pass) {
      kept++;
    } else {
      // Verifica se il record esiste in punti_interesse (potrebbe non esserci per record coord-based)
      if (!row.wikipedia && !row.wikidata && !row.historic_tag) {
        noMatch++;
        toRemove.push(row.id);
      } else {
        removed++;
        toRemove.push(row.id);
      }
    }
  }

  console.log(`  ✅ Mantiene gemma:  ${kept}`);
  console.log(`  ❌ Rimuove gemma:   ${removed + noMatch}`);
  console.log(`     - fallita score: ${removed}`);
  console.log(`     - nessuna fonte: ${noMatch}`);

  if (toRemove.length > 0) {
    console.log(`\n🔄 Rimozione is_gem da ${toRemove.length} POI...`);

    // Processa in batch da 100
    const BATCH = 100;
    let done = 0;
    for (let i = 0; i < toRemove.length; i += BATCH) {
      const chunk = toRemove.slice(i, i + BATCH);
      await client.query(
        `UPDATE public.shared_pois SET is_gem = false WHERE id = ANY($1)`,
        [chunk]
      );
      done += chunk.length;
      process.stdout.write(`\r   Aggiornati ${done}/${toRemove.length}...`);
    }
    console.log('\n✅ Fatto!');

    // Aggiorna anche punti_interesse
    console.log('🔄 Sincronizzazione is_gemma in punti_interesse...');
    await client.query(`
      UPDATE public.punti_interesse pi
      SET is_gemma = false
      FROM (
        SELECT REPLACE(id, 'osm-', '') AS osm_id
        FROM public.shared_pois
        WHERE is_gem = false AND id = ANY($1)
      ) sub
      WHERE pi.osm_id = sub.osm_id
    `, [toRemove]);
    console.log('✅ Sincronizzato.');
  }

  // 3. Statistiche finali
  const r1 = await client.query(`
    SELECT 
      COUNT(*) FILTER(WHERE is_gem = true) AS gems,
      COUNT(*) FILTER(WHERE is_gem = false OR is_gem IS NULL) AS non_gems,
      COUNT(*) AS total
    FROM public.shared_pois
  `);
  console.log('\n📊 Stato finale shared_pois:');
  console.log(`  Totale POI:        ${r1.rows[0].total}`);
  console.log(`  💎 Gemme rimaste:  ${r1.rows[0].gems}`);
  console.log(`  📍 Non-gemme:      ${r1.rows[0].non_gems}`);

  // Per categoria
  const r2 = await client.query(`
    SELECT category, COUNT(*) AS n
    FROM public.shared_pois
    WHERE is_gem = true
    GROUP BY category
    ORDER BY n DESC
  `);
  console.log('\n💎 Gemme per categoria:');
  r2.rows.forEach(row => console.log(`  ${(row.category||'NULL').padEnd(25)} ${row.n}`));

  await client.end();
  console.log('\n✅ Done.');
}

main().catch(e => { console.error('❌ Errore:', e.message); process.exit(1); });
