const { Client } = require('pg');

const sql = `
-- Create punti_interesse table
CREATE TABLE IF NOT EXISTS public.punti_interesse (
    osm_id BIGINT PRIMARY KEY,
    lat NUMERIC NOT NULL,
    lon NUMERIC NOT NULL,
    name TEXT,
    amenity TEXT,
    historic TEXT,
    railway TEXT,
    aeroway TEXT,
    highway TEXT,
    tourism TEXT,
    leisure TEXT,
    religion TEXT,
    place TEXT,
    craft TEXT,
    shop TEXT,
    cuisine TEXT,
    diet_gluten_free TEXT,
    diet_gluten_free_only TEXT,
    diet_vegetarian TEXT,
    opening_hours TEXT,
    phone TEXT,
    website TEXT,
    wikipedia TEXT,
    wikidata TEXT,
    wikimedia_commons TEXT,
    image TEXT,
    country_code VARCHAR(2) NOT NULL,
    macro_categoria TEXT NOT NULL,
    sotto_categoria TEXT NOT NULL,
    is_gemma BOOLEAN DEFAULT FALSE,
    descrizione_ai TEXT,
    audio_guide_url TEXT
);

-- Enable RLS
ALTER TABLE public.punti_interesse ENABLE ROW LEVEL SECURITY;

-- Drop existing indexes & policies if they exist to avoid conflict
DROP INDEX IF EXISTS idx_poi_country;
DROP INDEX IF EXISTS idx_poi_macro;
DROP INDEX IF EXISTS idx_poi_gemma;
DROP POLICY IF EXISTS "Allow public read on punti_interesse" ON public.punti_interesse;
DROP POLICY IF EXISTS "Allow public upsert on punti_interesse" ON public.punti_interesse;

-- Create Indexes
CREATE INDEX idx_poi_country ON public.punti_interesse(country_code);
CREATE INDEX idx_poi_macro ON public.punti_interesse(macro_categoria);
CREATE INDEX idx_poi_gemma ON public.punti_interesse(is_gemma);

-- Create Policies
CREATE POLICY "Allow public read on punti_interesse" ON public.punti_interesse
    FOR SELECT USING (true);

CREATE POLICY "Allow public upsert on punti_interesse" ON public.punti_interesse
    FOR ALL TO public USING (true) WITH CHECK (true);
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
    console.log('Connected! Creating public.punti_interesse table and indexes...');
    await client.query(sql);
    console.log('✅ Table public.punti_interesse and indexes created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
