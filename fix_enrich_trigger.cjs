const { Client } = require('pg');

const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

async function run() {
  await client.connect();
  console.log('Connected, updating trigger...');
  
  await client.query(`
    CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF (NEW.description_ai IS NULL OR NEW.description_ai = '') THEN
        PERFORM net.http_post(
          url := 'https://itainta.vercel.app/api/poi/enrich',
          headers := jsonb_build_object('Content-Type','application/json'),
          body := jsonb_build_object('id',NEW.id,'name',NEW.name,'lat',NEW.lat,'lon',NEW.lon,'category',NEW.category,'lang','it')
        );
      END IF;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER
  `);
  
  console.log('✅ Trigger function updated: now triggers on description_ai IS NULL (not status=draft)');
  await client.end();
}

run().catch(e => { console.error('❌', e.message); client.end(); });
