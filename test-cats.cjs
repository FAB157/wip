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

  const { rows } = await client.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'pois_sync_location'
  `);
  if (rows.length > 0) {
    console.log(rows[0].pg_get_functiondef);
  } else {
    console.log("Function not found");
  }

  const { rows: r2 } = await client.query(`
    SELECT trigger_name, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'pois' OR event_object_table = 'shared_pois'
  `);
  console.log("All triggers on pois and shared_pois:", r2);

  await client.end();
}
main();
