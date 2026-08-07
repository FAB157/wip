const { Client } = require('pg');

const client = new Client({ 
  user: 'postgres.qfxxhzkkrkvbuekfknhh', 
  host: 'aws-0-eu-west-1.pooler.supabase.com', 
  database: 'postgres', 
  password: 'Maf,Chj/S.2Jx8x', 
  port: 6543 
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT COUNT(*) 
      FROM shared_pois 
      WHERE description_ai LIKE '{%' 
        AND updated_at >= NOW() - INTERVAL '1 hour'
    `);
    console.log('Enriched in last hour:', res.rows[0].count);
  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
