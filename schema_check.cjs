const { Client } = require('pg');
const client = new Client({ user: 'postgres.qfxxhzkkrkvbuekfknhh', host: 'aws-0-eu-west-1.pooler.supabase.com', database: 'postgres', password: 'Maf,Chj/S.2Jx8x', port: 6543 });
async function run() {
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'shared_pois'");
  console.log(res.rows);
  await client.end();
}
run();
