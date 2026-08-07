const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543
});
client.connect().then(async () => {
  const r = await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net') AS has_pgnet,
      EXISTS(SELECT 1 FROM pg_extension WHERE extname='http') AS has_http
  `);
  console.log('pg_net disponibile:', r.rows[0].has_pgnet);
  console.log('http disponibile:  ', r.rows[0].has_http);
  try {
    const f = await client.query(`SELECT routine_name FROM information_schema.routines WHERE routine_schema='net' LIMIT 5`);
    console.log('net.* functions:', f.rows.map(x => x.routine_name).join(', ') || 'nessuna');
  } catch(e) { console.log('Schema net non accessibile:', e.message); }
  await client.end();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
