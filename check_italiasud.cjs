const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

// Prende un campione di ID OSM dal file italiasud.csv per verificare
// se sono già presenti nel DB
const CSV_PATH = 'D:/0MAPPA POI WIP/file punti per database/italiasud.csv';
const readline = require('readline');

async function main() {
  await client.connect();
  console.log('✅ Connesso al DB\n');

  // 1. Totale shared_pois
  const r1 = await client.query('SELECT COUNT(*) AS tot FROM public.shared_pois');
  console.log(`📦 TOTALE shared_pois: ${r1.rows[0].tot}`);

  // 2. Totale punti_interesse
  const r2 = await client.query('SELECT COUNT(*) AS tot FROM public.punti_interesse WHERE country_code=\'IT\'');
  console.log(`📦 TOTALE punti_interesse (IT): ${r2.rows[0].tot}`);

  // 3. Leggi i primi 20 ID OSM da italiasud.csv
  console.log('\n🔍 Campionamento da italiasud.csv (primi 20 ID validi)...');
  const sampleIds = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let header = null;
  let lineN = 0;
  for await (const rawLine of rl) {
    lineN++;
    const line = rawLine.trim();
    if (!line) continue;
    if (lineN === 1) {
      header = line.split(',').map(h => h.replace(/^@/, '').replace(/"/g, '').trim());
      continue;
    }
    // parse semplice
    const vals = line.split(',');
    const r = {};
    header.forEach((h, i) => { r[h] = (vals[i] || '').replace(/"/g, '').trim(); });
    const id = r.id;
    const name = r.name;
    if (id && name) {
      sampleIds.push(`osm-${id}`);
    }
    if (sampleIds.length >= 20) break;
  }

  console.log(`  Campione di ${sampleIds.length} ID: ${sampleIds.slice(0,5).join(', ')}...`);

  // 4. Controlla quanti di questi sono nel DB
  const r3 = await client.query(
    'SELECT COUNT(*) AS found FROM public.shared_pois WHERE id = ANY($1)',
    [sampleIds]
  );
  console.log(`\n✅ Di 20 ID campione da italiasud.csv → ${r3.rows[0].found} trovati nel DB`);

  if (parseInt(r3.rows[0].found) > 0) {
    console.log('👍 italiasud.csv è stato IMPORTATO nel database!');
  } else {
    console.log('❌ italiasud.csv NON sembra essere stato importato.');
  }

  // 5. Cerca POI di città tipicamente del Sud Italia
  const southCities = ['Palermo', 'Napoli', 'Catania', 'Bari', 'Messina', 'Reggio Calabria', 'Salerno'];
  console.log('\n📍 POI di città del Sud nel DB:');
  for (const city of southCities) {
    const rc = await client.query(
      "SELECT COUNT(*) AS n FROM public.shared_pois WHERE name ILIKE $1",
      [`%${city}%`]
    );
    console.log(`  ${city.padEnd(20)} ${rc.rows[0].n}`);
  }

  // 6. Distribuzione per categoria (totale)
  const r4 = await client.query(
    'SELECT category, COUNT(*) AS n FROM public.shared_pois GROUP BY category ORDER BY n DESC'
  );
  console.log('\n📊 Distribuzione per categoria (shared_pois):');
  r4.rows.forEach(row => console.log(`  ${(row.category||'NULL').padEnd(25)} ${row.n}`));

  await client.end();
}

main().catch(e => { console.error('❌ Errore:', e.message); process.exit(1); });
