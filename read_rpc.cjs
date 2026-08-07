const { Client } = require('pg');

const c = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543
});

c.connect().then(async () => {
  try {
    const res = await c.query("SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_name = 'get_geofence_pois'");
    console.log(res.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    c.end();
  }
});
