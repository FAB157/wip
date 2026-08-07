const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};

async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  await client.query(`
    ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS visited_categories JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS unlocked_badges TEXT[] DEFAULT '{}';
  `);
  console.log("Added gamification columns to user_profiles");

  await client.end();
}
main();
