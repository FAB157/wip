const { Client } = require('pg');

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
    
    const sql = `
      CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          poi_name TEXT NOT NULL,
          poi_city TEXT,
          source_page TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow public insert on affiliate_clicks" ON public.affiliate_clicks;
      CREATE POLICY "Allow public insert on affiliate_clicks" ON public.affiliate_clicks FOR INSERT TO public WITH CHECK (true);

      DROP POLICY IF EXISTS "Allow authenticated read on affiliate_clicks" ON public.affiliate_clicks;
      CREATE POLICY "Allow authenticated read on affiliate_clicks" ON public.affiliate_clicks FOR SELECT TO public USING (true);
    `;

    console.log('✅ Connected! Executing affiliate table creation...');
    await client.query(sql);
    console.log('✅ Affiliate table creation completed successfully.');
  } catch (e) {
    console.error('❌ Connection error:', e);
  } finally {
    await client.end();
    console.log('🔌 Disconnected.');
  }
}

run();
