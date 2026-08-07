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
    // Prima guardiamo se c'è la colonna country
    const resCountry = await client.query(`
      SELECT country, COUNT(*) as count
      FROM shared_pois 
      WHERE (image_url IS NOT NULL OR photo_url IS NOT NULL) 
        AND description_ai LIKE '{%'
      GROUP BY country
      ORDER BY count DESC
    `);
    console.log("=== COUNTRIES ===");
    console.table(resCountry.rows);

    const resRegion = await client.query(`
      SELECT region, COUNT(*) as count
      FROM shared_pois 
      WHERE (image_url IS NOT NULL OR photo_url IS NOT NULL) 
        AND description_ai LIKE '{%'
      GROUP BY region
      ORDER BY count DESC
      LIMIT 15
    `);
    console.log("\n=== REGIONS ===");
    console.table(resRegion.rows);

    const resCity = await client.query(`
      SELECT city, COUNT(*) as count
      FROM shared_pois 
      WHERE (image_url IS NOT NULL OR photo_url IS NOT NULL) 
        AND description_ai LIKE '{%'
      GROUP BY city
      ORDER BY count DESC
      LIMIT 15
    `);
    console.log("\n=== CITIES ===");
    console.table(resCity.rows);

  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
