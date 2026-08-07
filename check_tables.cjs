const { Client } = require('pg');
const c = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres', password: 'Maf,Chj/S.2Jx8x', port: 6543
});
c.connect().then(async () => {
  const r1 = await c.query(`SELECT COUNT(*) tot, COUNT(*) FILTER(WHERE is_gem) gems, COUNT(*) FILTER(WHERE image_url IS NOT NULL) con_foto FROM public.shared_pois WHERE id LIKE 'osm-%'`);
  console.log('shared_pois (id LIKE osm-%):', r1.rows[0]);
  const r2 = await c.query(`SELECT COUNT(*) tot, COUNT(*) FILTER(WHERE is_gemma) gems FROM public.punti_interesse WHERE country_code='IT'`);
  console.log('punti_interesse (IT):', r2.rows[0]);
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
