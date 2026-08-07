const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};

async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  // POIs created today
  const { rows: newPois } = await client.query(`
    SELECT COUNT(*) as count 
    FROM public.shared_pois 
    WHERE created_at >= CURRENT_DATE
  `);
  console.log("Nuovi POI creati oggi:", newPois[0].count);

  // POIs enriched today
  const { rows: enrichedPois } = await client.query(`
    SELECT COUNT(*) as count 
    FROM public.shared_pois 
    WHERE enriched_at >= CURRENT_DATE
  `);
  console.log("POI arricchiti oggi:", enrichedPois[0].count);

  // Check recent POIs sources
  const { rows: recentPois } = await client.query(`
    SELECT source, status, category, created_at 
    FROM public.shared_pois 
    WHERE created_at >= CURRENT_DATE
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log("Ultimi 20 POI:", recentPois);

  await client.end();
}
main();
