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
      SELECT id, name, category, image_url, photo_url, description_ai 
      FROM shared_pois 
      WHERE name ILIKE '%Palazzo Cybo Malaspina%'
    `);

    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
