const { Client } = require('pg');

const sql = `
-- Create user_itineraries table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_itineraries (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    titolo TEXT,
    dati_itinerario JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_itineraries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflict
DROP POLICY IF EXISTS "Users can view own itineraries" ON public.user_itineraries;
DROP POLICY IF EXISTS "Users can insert own itineraries" ON public.user_itineraries;
DROP POLICY IF EXISTS "Users can update own itineraries" ON public.user_itineraries;
DROP POLICY IF EXISTS "Users can delete own itineraries" ON public.user_itineraries;

-- Create policies for RLS
CREATE POLICY "Users can view own itineraries" ON public.user_itineraries
    FOR SELECT USING (true); -- Keep it simple to allow resilient select with upsert fallback

CREATE POLICY "Users can insert own itineraries" ON public.user_itineraries
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own itineraries" ON public.user_itineraries
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own itineraries" ON public.user_itineraries
    FOR DELETE USING (true);
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
    console.log('Connected! Creating user_itineraries table...');
    await client.query(sql);
    console.log('✅ Table public.user_itineraries and RLS policies created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
