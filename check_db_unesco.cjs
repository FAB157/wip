const { Client } = require('pg');
const client = new Client({ user: 'postgres.qfxxhzkkrkvbuekfknhh', host: 'aws-0-eu-west-1.pooler.supabase.com', database: 'postgres', password: 'Maf,Chj/S.2Jx8x', port: 6543 });
async function run() {
  await client.connect();
  const res1 = await client.query("SELECT COUNT(*) FROM shared_pois WHERE id LIKE 'unesco-%'");
  const res2 = await client.query("SELECT COUNT(*) FROM shared_pois WHERE id LIKE 'unesco-%' AND description_ai IS NOT NULL");
  console.log('UNESCO POIs totali:', res1.rows[0].count);
  console.log('UNESCO POIs arricchiti:', res2.rows[0].count);
  await client.end();
}
run();
