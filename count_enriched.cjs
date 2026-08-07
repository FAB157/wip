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
      WHERE (image_url IS NOT NULL OR photo_url IS NOT NULL) 
        AND description_short IS NOT NULL 
        AND description_long IS NOT NULL 
        AND description_ai LIKE '%testo_nicky_it%' 
        AND description_ai LIKE '%testo_dante_it%'
    `);
    
    console.log('POI con Foto + Desc. Breve + Desc. Dettagliata + 2 Audioguide:', res.rows[0].count);
  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
