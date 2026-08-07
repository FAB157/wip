const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

async function check() {
  await client.connect();

  // 1. Stats generali arricchimento
  const s = await client.query(`
    SELECT
      COUNT(*)                                                                 AS total,
      COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)                         AS enriched,
      COUNT(*) FILTER (WHERE full_description IS NOT NULL AND length(full_description) > 50) AS con_descrizione,
      COUNT(*) FILTER (WHERE technical_data IS NOT NULL AND technical_data != '{}') AS con_technical,
      COUNT(*) FILTER (WHERE practical_info IS NOT NULL)                       AS con_practical,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL)                            AS con_image,
      COUNT(*) FILTER (WHERE technical_data ? 'wikivoyage_url')               AS con_wikivoyage,
      COUNT(*) FILTER (WHERE technical_data ? 'wikipedia_url')                AS con_wikipedia,
      COUNT(*) FILTER (WHERE technical_data ? 'wikidata_id')                  AS con_wikidata,
      COUNT(*) FILTER (WHERE technical_data ? 'wikimedia_commons')            AS con_wikimedia,
      COUNT(*) FILTER (WHERE technical_data ? 'inception')                    AS con_inception,
      COUNT(*) FILTER (WHERE technical_data ? 'architect')                    AS con_architect,
      COUNT(*) FILTER (WHERE technical_data ? 'style')                        AS con_style
    FROM public.shared_pois WHERE id LIKE 'osm-%'
  `);
  const r = s.rows[0];

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       REPORT QUALITÀ ARRICCHIMENTO POI          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Totale POI OSM:          ${r.total}`);
  console.log(`  ✅ Arricchiti (tutte fonti): ${r.enriched} (${(r.enriched/r.total*100).toFixed(1)}%)`);
  console.log(`\n  📝 Con descrizione lunga: ${r.con_descrizione}`);
  console.log(`  🗂️  Con technical_data:    ${r.con_technical}`);
  console.log(`  📋 Con practical_info:    ${r.con_practical}`);
  console.log(`  🖼️  Con immagine:          ${r.con_image}`);
  console.log(`\n  ── Fonti ────────────────────────────────────────`);
  console.log(`  📖 Wikipedia:             ${r.con_wikipedia}`);
  console.log(`  🗃️  Wikidata:              ${r.con_wikidata}`);
  console.log(`  🧭 WikiVoyage:            ${r.con_wikivoyage}`);
  console.log(`  🖼️  Wikimedia Commons:     ${r.con_wikimedia}`);
  console.log(`\n  ── Dati tecnici (da Wikidata) ────────────────────`);
  console.log(`  🏗️  Anno costruzione:      ${r.con_inception}`);
  console.log(`  👷 Architetto:            ${r.con_architect}`);
  console.log(`  🏛️  Stile architettonico:  ${r.con_style}`);

  // 2. Qualità per categoria
  const bycat = await client.query(`
    SELECT
      category,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE enriched_at IS NOT NULL) AS enriched,
      COUNT(*) FILTER (WHERE full_description IS NOT NULL) AS con_desc
    FROM public.shared_pois
    WHERE id LIKE 'osm-%'
    GROUP BY category
    ORDER BY total DESC
    LIMIT 12
  `);
  console.log(`\n  ── Per categoria ──────────────────────────────────`);
  console.log(`  ${'Categoria'.padEnd(22)} ${'Totale'.padStart(8)} ${'Arricchiti'.padStart(11)} ${'Con desc'.padStart(9)}`);
  bycat.rows.forEach(row => {
    const pct = row.total > 0 ? Math.round(row.enriched / row.total * 100) : 0;
    console.log(`  ${row.category.padEnd(22)} ${String(row.total).padStart(8)} ${String(row.enriched).padStart(8)} (${String(pct).padStart(2)}%) ${String(row.con_desc).padStart(5)}`);
  });

  // 3. Esempi concreti: POI con tutti e 4 le fonti
  const ex = await client.query(`
    SELECT
      name, category,
      left(full_description, 200) AS desc_preview,
      practical_info,
      technical_data
    FROM public.shared_pois
    WHERE id LIKE 'osm-%'
      AND enriched_at IS NOT NULL
      AND full_description IS NOT NULL
      AND length(full_description) > 50
    ORDER BY is_gem DESC, enriched_at DESC
    LIMIT 5
  `);

  console.log(`\n  ── Esempi POI arricchiti ─────────────────────────`);
  ex.rows.forEach((p, i) => {
    const td = typeof p.technical_data === 'string' ? JSON.parse(p.technical_data) : (p.technical_data || {});
    console.log(`\n  [${i+1}] ${p.name} (${p.category})`);
    console.log(`      📖 Desc:       ${p.desc_preview ? p.desc_preview.substring(0,100).replace(/\n/g,' ')+'...' : 'N/A'}`);
    console.log(`      📋 Practical:  ${p.practical_info || 'N/A'}`);
    console.log(`      🔗 Fonti:      WP=${td.wikipedia_url?'✅':'❌'} WD=${td.wikidata_id?'✅':'❌'} WV=${td.wikivoyage_url?'✅':'❌'} WM=${td.wikimedia_commons?'✅':'❌'}`);
    if (td.inception)  console.log(`      🏗️  Anno:       ${td.inception}`);
    if (td.architect)  console.log(`      👷 Architetto: ${td.architect}`);
    if (td.style)      console.log(`      🏛️  Stile:      ${td.style}`);
  });

  console.log('\n');
  await client.end();
}

check().catch(e => { console.error('❌', e.message); process.exit(1); });
