const { Client } = require('pg');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

async function run() {
  await client.connect();

  console.log('--- VERIFICA GEOFENCING ---');
  const { rows } = await client.query(`
    SELECT name, category, is_gem, alert_radius, geofence_radius 
    FROM public.shared_pois 
    WHERE alert_radius IS NOT NULL
    ORDER BY is_gem DESC, RANDOM() 
    LIMIT 10
  `);

  rows.forEach(r => {
    console.log(`[${r.category}] ${r.name} (Gemma: ${r.is_gem}) -> Alert: ${r.alert_radius}m | Geofence: ${r.geofence_radius}m`);
  });

  await client.end();
}

run();
