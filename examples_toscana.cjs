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
      SELECT name, city, category, description_short, description_ai 
      FROM shared_pois 
      WHERE description_ai IS NOT NULL AND description_ai LIKE '{%'
        AND lat >= 42.2 AND lat <= 44.5 AND lon >= 9.6 AND lon <= 12.4
      LIMIT 3;
    `);
    
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('Errore:', e.message);
  }

  await client.end();
}
run();
