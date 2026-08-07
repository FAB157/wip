const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
    console.log('✅ Connected! Executing pois_schema.sql...\n');

    const sqlFilePath = path.join(__dirname, 'pois_schema.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    // Dividiamo sulle occorrenze sicure o eseguiamo in blocco?
    // Meglio eseguire in blocco poiché ci sono definizioni di funzioni con doppi dollari $$
    try {
      await client.query(sql);
      console.log('✅ Schema migration completed successfully.');
    } catch (err) {
      console.error('❌ Error executing schema:', err.message);
    }
  } catch (e) {
    console.error('❌ Connection error:', e);
  } finally {
    await client.end();
    console.log('🔌 Disconnected.');
  }
}

run();
