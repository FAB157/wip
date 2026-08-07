const { Client } = require('pg');

const sql = `
-- Aggiungi colonne per la telemetria precisa nella tabella api_usage_logs
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS cost_estimation DOUBLE PRECISION DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
`;

async function run() {
  const client = new Client({
    user: 'postgres.qfxxhzkkrkvbuekfknhh',
    host: 'db.qfxxhzkkrkvbuekfknhh.supabase.co',
    database: 'postgres',
    password: 'Maf,Chj/S.2Jx8x',
    port: 5432,
  });
  console.log('Connessione a Supabase per aggiornamento schema telemetria...');
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ Tabella api_usage_logs aggiornata con successo!');
  } catch (err) {
    console.error('❌ Errore durante la migrazione:', err.message);
  } finally {
    await client.end();
  }
}

run();
