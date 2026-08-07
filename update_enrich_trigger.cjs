const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

const sql = `
CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger if newly inserted and lacks description (cache-first: enrich da Wikipedia/Wikidata)
    IF (NEW.status = 'draft' OR NEW.description_ai IS NULL) THEN
        PERFORM net.http_post(
            url := 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/manager-poi',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y'
            ),
            body := jsonb_build_object(
                'action',   'enrich-now',
                'id',       NEW.id,
                'name',     NEW.name,
                'lat',      NEW.lat,
                'lon',      NEW.lon,
                'category', NEW.category,
                'lang',     'en'
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rebind trigger (idempotente)
DROP TRIGGER IF EXISTS trg_enrich_poi_on_insert ON public.shared_pois;
CREATE TRIGGER trg_enrich_poi_on_insert
    AFTER INSERT ON public.shared_pois
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_enrich_poi();
`;

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('✅ Trigger aggiornato: lang=en (copertura globale Wikipedia)');
    console.log('   Il trigger scatta su OGNI INSERT con description_ai=NULL');
    console.log('   Funziona per POI in tutto il mondo (Italia, Francia, Giappone...)');
    return client.end();
  })
  .catch(e => { console.error('❌', e.message); client.end(); });
