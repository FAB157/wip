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
    SELECT proname, pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname IN ('trigger_auto_enrich_poi', 'trigger_enrich_poi', 'assign_geofence_radii')
  `);
  rows.forEach(r => {
    console.log("---- " + r.proname + " ----");
    console.log(r.pg_get_functiondef);
  });

  await client.end();
}
main();
