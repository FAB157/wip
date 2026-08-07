const { Client } = require('pg');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

async function run() {
  await client.connect();
  console.log('✅ Connected to database for retroactive geofence update.');

  // Count how many POIs need updating
  const { rows } = await client.query('SELECT COUNT(*) FROM public.shared_pois WHERE alert_radius IS NULL');
  let pendingCount = parseInt(rows[0].count, 10);
  console.log(`⏳ Found ${pendingCount} POIs missing geofence radii.`);

  let updatedCount = 0;
  const batchSize = 5000;

  while (pendingCount > 0) {
    console.log(`Processing batch of ${batchSize}... (${pendingCount} remaining)`);
    // This query triggers the BEFORE UPDATE which will assign the radii
    // The query finds up to batchSize rows where alert_radius IS NULL
    await client.query(`
      WITH batch AS (
        SELECT id FROM public.shared_pois WHERE alert_radius IS NULL LIMIT $1
      )
      UPDATE public.shared_pois p
      SET is_gem = p.is_gem
      FROM batch
      WHERE p.id = batch.id;
    `, [batchSize]);
    
    updatedCount += batchSize;
    
    const countCheck = await client.query('SELECT COUNT(*) FROM public.shared_pois WHERE alert_radius IS NULL');
    pendingCount = parseInt(countCheck.rows[0].count, 10);
  }

  console.log(`✅ Retroactive update complete!`);
  await client.end();
}

run().catch(console.error);
