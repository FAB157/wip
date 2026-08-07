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
    const res = await c.query(`
      SELECT DISTINCT region
      FROM public.shared_pois 
      WHERE region IS NOT NULL
      ORDER BY region ASC
    `);
    
    console.log('Regions:');
    res.rows.forEach(row => {
      console.log(`- ${row.region}`);
    });
  } catch (e) {
    console.error('Error querying database:', e);
  } finally {
    c.end();
  }
}).catch(e => {
  console.error('Error connecting to database:', e);
});
