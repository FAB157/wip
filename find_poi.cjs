const { Client } = require('pg');

const sql = `
SELECT id, name, category, lat, lon, status, is_gem, location 
FROM public.shared_pois 
WHERE name ILIKE '%fabrizio musetti%';
`;

async function main() {
  const c = new Client({
    user: 'postgres.qfxxhzkkrkvbuekfknhh',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    database: 'postgres',
    password: 'Maf,Chj/S.2Jx8x',
    port: 6543
  });
  
  try {
    await c.connect();
    const res = await c.query(sql);
    console.log("Found POIs:", res.rows);
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
