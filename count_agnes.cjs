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
    const countRes = await client.query("SELECT COUNT(*) FROM shared_pois WHERE description_ai IS NOT NULL");
    console.log('POIs arricchiti da Agnes: ' + countRes.rows[0].count);
    
    // Vediamo quanti sono in totale per dare una percentuale
    const totalRes = await client.query("SELECT COUNT(*) FROM shared_pois");
    console.log('Totale POIs nel DB: ' + totalRes.rows[0].count);
  } catch (e) {
    console.error('Errore:', e.message);
  }

  await client.end();
}
run();
