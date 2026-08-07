const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543
});

client.connect()
  .then(() => client.query('SELECT count(*) FROM shared_pois WHERE enriched_at IS NOT NULL'))
  .then(res => {
    console.log('Enriched:', res.rows[0].count);
    return client.query('SELECT count(*) FROM shared_pois WHERE enriched_at IS NULL');
  })
  .then(res => {
    console.log('Pending:', res.rows[0].count);
    return client.end();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
