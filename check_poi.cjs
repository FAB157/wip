const { Client } = require('pg');

const sql = `
-- Try to add the columns just in case
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS reviewed_by UUID;

SELECT id, name, category, lat, lon, status, is_gem 
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
    console.log("Query Results:");
    console.dir(res, {depth: null});
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
