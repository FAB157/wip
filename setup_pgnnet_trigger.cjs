/**
 * Setup trigger HTTP su shared_pois usando estensione `http` di PostgreSQL
 * (già disponibile su questo progetto Supabase — pg_net non necessario)
 *
 * Flusso automatico dopo deploy:
 *   Import/Seed → shared_pois INSERT
 *   → trigger_auto_enrich_poi()
 *   → http_post → auto-enrich-poi Edge Function
 *   → Wikipedia + Wikidata + WikiVoyage + Wikimedia salvati in automatico
 */
const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};

const EDGE_FUNCTION_URL = 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/auto-enrich-poi';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Connesso a Supabase\n');

  try {
    // 1. Verifica http extension
    const httpCheck = await client.query(`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='http') AS has_http
    `);
    if (!httpCheck.rows[0].has_http) {
      console.log('⚠️  Estensione http non disponibile. Provo ad abilitarla...');
      await client.query(`CREATE EXTENSION IF NOT EXISTS http;`);
    }
    console.log('✅ Estensione http disponibile\n');

    // 2. Funzione trigger che chiama la Edge Function via http
    console.log('📋 Creo funzione trigger_auto_enrich_poi...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.trigger_auto_enrich_poi()
      RETURNS TRIGGER AS $$
      DECLARE
        payload text;
        response http_response;
      BEGIN
        -- Solo POI con wikipedia/wikidata nel technical_data e non ancora arricchiti
        IF (
          (NEW.technical_data ? 'wikipedia' OR NEW.technical_data ? 'wikidata')
          AND NEW.enriched_at IS NULL
        ) THEN
          payload := json_build_object(
            'record', json_build_object(
              'id',             NEW.id,
              'name',           NEW.name,
              'category',       NEW.category,
              'lat',            NEW.lat,
              'lon',            NEW.lon,
              'technical_data', NEW.technical_data,
              'practical_info', NEW.practical_info
            )
          )::text;

          -- Chiamata HTTP sincrona alla Edge Function
          -- Nota: usa http_post dall'estensione 'http'
          BEGIN
            SELECT * INTO response FROM http_post(
              '${EDGE_FUNCTION_URL}',
              payload,
              'application/json'
            );
            -- Log del risultato (visibile nei Supabase logs)
            RAISE NOTICE '[auto-enrich] POI % chiamata edge function: status=%', NEW.id, response.status;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[auto-enrich] POI % errore HTTP: %', NEW.id, SQLERRM;
          END;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  ✅ Funzione trigger creata');

    // 3. Trigger AFTER INSERT
    console.log('\n📋 Creo trigger AFTER INSERT su shared_pois...');
    await client.query(`
      DROP TRIGGER IF EXISTS tr_auto_enrich_poi ON public.shared_pois;
      CREATE TRIGGER tr_auto_enrich_poi
        AFTER INSERT ON public.shared_pois
        FOR EACH ROW
        EXECUTE FUNCTION public.trigger_auto_enrich_poi();
    `);
    console.log('  ✅ Trigger AFTER INSERT creato');

    // 4. Test del trigger con un INSERT fittizio (rollback)
    console.log('\n📋 Test trigger (rollback automatico)...');
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO public.shared_pois (id, name, category, lat, lon, status, technical_data)
        VALUES (
          'test-trigger-check-' || NOW()::text,
          'Test Trigger POI',
          'monument',
          45.4654, 9.1859,
          'verified',
          '{"wikipedia": "it:Duomo_di_Milano", "wikidata": "Q182133"}'::jsonb
        )
      `);
      console.log('  ✅ INSERT test eseguito — trigger attivato');
    } finally {
      await client.query('ROLLBACK');
      console.log('  ✅ Rollback eseguito (POI test rimosso)');
    }

    console.log('\n══════════════════════════════════════════════════');
    console.log('✅ TRIGGER AUTO-ENRICH ATTIVO');
    console.log('══════════════════════════════════════════════════');
    console.log('\n🎯 Flusso automatico:');
    console.log('   Import/Seed CSV → shared_pois INSERT');
    console.log('   → trigger_auto_enrich_poi() si attiva');
    console.log('   → HTTP POST → auto-enrich-poi Edge Function');
    console.log('   → Wikipedia + Wikidata + WikiVoyage + Wikimedia');
    console.log('   → full_description + audio_script salvati');
    console.log('\n⚡ NESSUN INTERVENTO MANUALE NECESSARIO!');
    console.log('\n⚠️  NOTA: La Edge Function deve essere deployata su Supabase.');
    console.log('   Vai su: https://app.supabase.com/project/qfxxhzkkrkvbuekfknhh/functions');
    console.log('   Crea funzione "auto-enrich-poi" e incolla il codice da:');
    console.log('   supabase/functions/auto-enrich-poi/index.ts');

  } catch (err) {
    console.error('❌ Errore:', err.message);
  } finally {
    await client.end();
    console.log('\n✅ Done.');
  }
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
