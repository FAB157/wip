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
    
    const resTotal = await client.query(`
      SELECT COUNT(*) 
      FROM shared_pois 
      WHERE lat >= $1 AND lat <= $2 AND lon >= $3 AND lon <= $4
    `, [latMin, latMax, lonMin, lonMax]);
    
    const resEnriched = await client.query(`
      SELECT COUNT(*) 
      FROM shared_pois 
      WHERE lat >= $1 AND lat <= $2 AND lon >= $3 AND lon <= $4
        AND description_ai LIKE '{%'
    `, [latMin, latMax, lonMin, lonMax]);
    
    console.log('Totale POI Massa-Carrara:', resTotal.rows[0].count);
    console.log('Arricchiti Massa-Carrara (Agnes):', resEnriched.rows[0].count);

    const resExamples = await client.query(`
      SELECT name, category 
      FROM shared_pois 
      WHERE lat >= $1 AND lat <= $2 AND lon >= $3 AND lon <= $4
        AND description_ai LIKE '{%'
      LIMIT 10
    `, [latMin, latMax, lonMin, lonMax]);

    console.log('\nAlcuni esempi di luoghi arricchiti a Massa-Carrara:');
    resExamples.rows.forEach(r => console.log(`- ${r.name} (${r.category})`));

  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
