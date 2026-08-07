const { Client } = require('pg');

const sql = `
CREATE TABLE IF NOT EXISTS public.user_listening_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    poi_id TEXT NOT NULL,
    poi_name TEXT,
    category TEXT,
    image_url TEXT,
    listened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_listening_history ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own history
DO $$ 
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own listening history' AND tablename = 'user_listening_history'
  ) THEN
      CREATE POLICY "Users can view their own listening history"
      ON public.user_listening_history FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own listening history' AND tablename = 'user_listening_history'
  ) THEN
      CREATE POLICY "Users can insert their own listening history"
      ON public.user_listening_history FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own listening history' AND tablename = 'user_listening_history'
  ) THEN
      CREATE POLICY "Users can delete their own listening history"
      ON public.user_listening_history FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
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
    console.log("Executing table creation...");
    await c.query(sql);
    console.log("Success! Table user_listening_history created.");
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
