const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});
(async () => {
  await client.connect();
  const r = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='shared_pois' 
    ORDER BY ordinal_position
  `);
  console.log('Colonne shared_pois:');
  r.rows.forEach(x => console.log('  ' + x.column_name.padEnd(30) + x.data_type));
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
