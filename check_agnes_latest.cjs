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
    
    // Get total enriched
    const countRes = await client.query('SELECT count(*) FROM shared_pois WHERE enriched_at IS NOT NULL');
    console.log('TOTAL_ENRICHED:', countRes.rows[0].count);
    
    // Get latest 50
    const latestRes = await client.query(`
      SELECT name, city, category, enriched_at 
      FROM shared_pois 
      WHERE enriched_at IS NOT NULL 
      ORDER BY enriched_at DESC 
      LIMIT 50
    `);
    
    console.log('---LATEST_50---');
    latestRes.rows.forEach(r => {
      console.log(`- **${r.name}** (${r.city || 'N/D'}) - *${r.category}*`);
    });
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
