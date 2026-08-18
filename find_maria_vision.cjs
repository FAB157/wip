const { Client } = require('pg');

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
    console.log('Querying vision_cards around 2026-06-12...');
    const vRes = await c.query("SELECT * FROM public.vision_cards WHERE created_at BETWEEN '2026-06-11' AND '2026-06-13'");
    console.log("Found in vision_cards:", JSON.stringify(vRes.rows, null, 2));
  } catch (e) {
    console.error("Error executing SQL:", e);
  } finally {
    c.end();
  }
}

main();
