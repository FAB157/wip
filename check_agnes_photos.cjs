const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543
});

async function run() {
  try {
    await client.connect();
    const countTotal = await client.query('SELECT count(*) FROM shared_pois WHERE enriched_at IS NOT NULL');
    const countPhotos = await client.query('SELECT count(*) FROM shared_pois WHERE enriched_at IS NOT NULL AND photo_url IS NOT NULL');
    
    console.log(`Arricchiti: ${countTotal.rows[0].count}`);
    console.log(`Con Foto: ${countPhotos.rows[0].count}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
