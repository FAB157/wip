const { Client } = require('pg');

const sql = `
-- 1. Create or replace trigger function for enrichment calling Vercel Express Server directly
CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if the status is 'draft' or is newly created and lacks description
    IF (NEW.status = 'draft' OR NEW.description_ai IS NULL) THEN
        PERFORM net.http_post(
            url := 'https://itainta.vercel.app/api/poi/enrich',
            headers := jsonb_build_object(
              'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'id', NEW.id,
                'name', NEW.name,
                'lat', NEW.lat,
                'lon', NEW.lon,
                'category', NEW.category,
                'lang', 'it'
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop trigger if exists to recreate it cleanly
DROP TRIGGER IF EXISTS trg_enrich_poi_on_insert ON public.shared_pois;

-- 3. Rebind the trigger
CREATE TRIGGER trg_enrich_poi_on_insert
    AFTER INSERT ON public.shared_pois
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_enrich_poi();
`;

async function run() {
  const client = new Client({
    user: 'postgres.qfxxhzkkrkvbuekfknhh',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    database: 'postgres',
    password: 'Maf,Chj/S.2Jx8x',
    port: 6543,
  });
  console.log('Connecting to Supabase PostgreSQL database...');
  try {
    await client.connect();
    console.log('Connected! Executing migration for Vercel redirection...');
    await client.query(sql);
    console.log('✅ Trigger function and trigger redirected to Vercel successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
