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
  console.log('Aggiunta colonne geofencing a shared_pois...');
  await client.query(`
    ALTER TABLE public.shared_pois
      ADD COLUMN IF NOT EXISTS alert_radius   integer DEFAULT 200,
      ADD COLUMN IF NOT EXISTS geofence_radius integer DEFAULT 80;
  `);
  console.log('✅ Colonne alert_radius e geofence_radius aggiunte (o già presenti).');
  await client.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
