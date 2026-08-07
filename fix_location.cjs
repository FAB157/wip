const { Client } = require('pg');

const sql = `
SELECT id, name, lat, lon, location IS NULL as is_location_null
FROM public.shared_pois 
WHERE name ILIKE '%fabrizio musetti%';

-- Forniamo anche un fix diretto nel caso sia null
UPDATE public.shared_pois 
SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326) 
WHERE location IS NULL AND name ILIKE '%fabrizio musetti%';
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
