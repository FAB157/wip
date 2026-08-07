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
      SELECT category, COUNT(*) as count 
      FROM public.shared_pois 
      GROUP BY category 
      ORDER BY count DESC
    `);
    
    console.log('POI Count by Category:');
    res.rows.forEach(row => {
      console.log(`- ${row.category}: ${row.count}`);
    });
  } catch (e) {
    console.error('Error querying database:', e);
  } finally {
    c.end();
  }
}).catch(e => {
  console.error('Error connecting to database:', e);
});
