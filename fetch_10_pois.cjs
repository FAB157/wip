const { Client } = require('pg');
const fs = require('fs');
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
    
    // Get 10 recent POIs with full data
    const res = await client.query(`
      SELECT name, city, category, photo_url, description_ai 
      FROM shared_pois 
      WHERE enriched_at IS NOT NULL 
        AND photo_url IS NOT NULL 
        AND description_ai IS NOT NULL
      ORDER BY enriched_at DESC 
      LIMIT 10
    `);
    
    fs.writeFileSync('10_pois.json', JSON.stringify(res.rows, null, 2));
    console.log("Fatto.");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
