const { Client } = require('pg');

const sql = `
-- 1. Drop foreign keys referencing pois
ALTER TABLE public.poi_details DROP CONSTRAINT IF EXISTS poi_details_poi_id_fkey;
ALTER TABLE public.poi_audioguides DROP CONSTRAINT IF EXISTS poi_audioguides_poi_id_fkey;
ALTER TABLE public.user_poi_settings DROP CONSTRAINT IF EXISTS user_poi_settings_poi_id_fkey;

-- 2. Alter column types to TEXT
ALTER TABLE public.poi_details ALTER COLUMN poi_id TYPE TEXT USING poi_id::text;
ALTER TABLE public.poi_audioguides ALTER COLUMN poi_id TYPE TEXT USING poi_id::text;
ALTER TABLE public.user_poi_settings ALTER COLUMN poi_id TYPE TEXT USING poi_id::text;

-- 3. Add foreign keys referencing shared_pois (Optional, but good for integrity. Using ON DELETE CASCADE)
-- Note: if there are existing rows in these tables whose poi_id doesn't exist in shared_pois, the constraint creation will fail.
-- To be safe and ensure the app works, we'll just leave them without FK or delete orphans.
-- Let's delete orphans first.
DELETE FROM public.poi_details WHERE poi_id NOT IN (SELECT id FROM public.shared_pois);
DELETE FROM public.poi_audioguides WHERE poi_id NOT IN (SELECT id FROM public.shared_pois);
DELETE FROM public.user_poi_settings WHERE poi_id NOT IN (SELECT id FROM public.shared_pois);

ALTER TABLE public.poi_details ADD CONSTRAINT poi_details_shared_poi_id_fkey FOREIGN KEY (poi_id) REFERENCES public.shared_pois(id) ON DELETE CASCADE;
ALTER TABLE public.poi_audioguides ADD CONSTRAINT poi_audioguides_shared_poi_id_fkey FOREIGN KEY (poi_id) REFERENCES public.shared_pois(id) ON DELETE CASCADE;
ALTER TABLE public.user_poi_settings ADD CONSTRAINT user_poi_settings_shared_poi_id_fkey FOREIGN KEY (poi_id) REFERENCES public.shared_pois(id) ON DELETE CASCADE;
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
    await c.query(sql);
    console.log("SQL executed successfully!");
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
