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
    const latMin = 44.01, latMax = 44.15;
    const lonMin = 9.95, lonMax = 10.20;
    
    const resSearch = await client.query(`
      SELECT name, category, description_ai 
      FROM shared_pois 
      WHERE (name ILIKE '%palazzetti%' OR name ILIKE '%dunchi%')
    `);

    console.log('\nRisultati ricerca per Palazzetti / Dunchi (in tutto il DB):');
    if (resSearch.rows.length === 0) {
      console.log('Nessun POI trovato con questi nomi.');
    } else {
      resSearch.rows.forEach(r => {
        const arricchito = (r.description_ai && r.description_ai.includes('{')) ? 'SÌ (Perfetto)' : 'NO';
        console.log(`- ${r.name} [Cat: ${r.category}] -> Arricchito: ${arricchito}`);
      });
    }

  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
