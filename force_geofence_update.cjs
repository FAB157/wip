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

  const { rows } = await client.query('SELECT COUNT(*) as count FROM public.shared_pois WHERE alert_radius IS NULL');
  console.log('NULL count:', rows[0].count);

  if (parseInt(rows[0].count) > 0) {
    console.log('Executing direct UPDATE to force trigger...');
    // A single direct update since there's no timeout issue for 200k rows in postgres typically
    await client.query(`
      UPDATE public.shared_pois 
      SET updated_at = NOW() 
      WHERE alert_radius IS NULL;
    `).catch(async (e) => {
      // If updated_at doesn't exist, try setting category = category
      console.log('Falling back to category = category...');
      await client.query(`
        UPDATE public.shared_pois 
        SET category = category 
        WHERE alert_radius IS NULL;
      `);
    });
    console.log('✅ Update finished.');
  }

  await client.end();
}

run();
