const { Client } = require('pg');

const sql = `
-- =====================================================================
-- MIGRATION: Fix POI Status (seed/import = verified, click admin = draft)
-- =====================================================================

-- 1. Approva tutti i POI già importati/seeded che sono ancora draft
--    (hanno description_ai già compilata = completati dall'enrich)
UPDATE public.shared_pois
SET status = 'verified'
WHERE status = 'draft'
  AND description_ai IS NOT NULL
  AND description_ai != '';

-- 2. Approva anche i POI draft senza testo ma che vengono da importazioni
--    (identificabili perché hanno lat/lon reali e nome definito)
UPDATE public.shared_pois
SET status = 'verified'
WHERE status = 'draft'
  AND lat IS NOT NULL
  AND lon IS NOT NULL
  AND name IS NOT NULL
  AND name != '';

-- 3. Cambia il DEFAULT STATUS da 'draft' a 'verified' per i nuovi INSERT
ALTER TABLE public.shared_pois 
  ALTER COLUMN status SET DEFAULT 'verified';

-- 4. Fix il trigger di enrich per attivarsi su description_ai IS NULL (non status=draft)
CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger enrichment whenever a new POI has no AI description yet
    IF (NEW.description_ai IS NULL OR NEW.description_ai = '') THEN
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

-- 5. Aggiungi indice su created_at per conteggi efficienti per periodo
CREATE INDEX IF NOT EXISTS idx_shared_poi_audio_cache_created 
  ON public.shared_poi_audio_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_shared_pois_status 
  ON public.shared_pois (status);
`;

async function run() {
  const client = new Client({
    user: 'postgres.qfxxhzkkrkvbuekfknhh',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    database: 'postgres',
    password: 'Maf,Chj/S.2Jx8x',
    port: 6543,
  });

  console.log('🔌 Connecting to Supabase...');
  try {
    await client.connect();
    console.log('✅ Connected! Executing POI status migration...\n');

    // Esegui ogni statement individualmente per vedere i risultati
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 10);
    
    for (const stmt of statements) {
      try {
        const result = await client.query(stmt);
        if (result.rowCount > 0) {
          console.log(`✅ OK (${result.rowCount} rows affected): ${stmt.substring(0, 80).replace(/\n/g, ' ')}...`);
        } else {
          console.log(`✅ OK: ${stmt.substring(0, 80).replace(/\n/g, ' ')}...`);
        }
      } catch (stmtErr) {
        console.warn(`⚠️  Warning (non-fatal): ${stmtErr.message} → ${stmt.substring(0, 60).replace(/\n/g, ' ')}...`);
      }
    }

    // Verifica finale
    console.log('\n📊 POST-MIGRATION COUNTS:');
    const verifyRes = await client.query(`
      SELECT 
        COUNT(*) AS totale,
        COUNT(*) FILTER (WHERE status = 'verified') AS verificati,
        COUNT(*) FILTER (WHERE status = 'draft') AS bozze,
        COUNT(*) FILTER (WHERE status = 'needs_revision') AS da_revisionare,
        COUNT(*) FILTER (WHERE description_ai IS NOT NULL) AS con_testo_ai
      FROM public.shared_pois
    `);
    console.table(verifyRes.rows);

    const audioRes = await client.query(`
      SELECT COUNT(*) AS totale_audio_cache FROM public.shared_poi_audio_cache
    `);
    console.log('Audio cache entries:', audioRes.rows[0].totale_audio_cache);

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
    console.log('\n🔌 Connection closed.');
  }
}

run();
