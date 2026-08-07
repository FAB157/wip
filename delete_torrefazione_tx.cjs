const { Client } = require('pg');

const client = new Client({ 
  user: 'postgres.qfxxhzkkrkvbuekfknhh', 
  host: 'aws-0-eu-west-1.pooler.supabase.com', 
  database: 'postgres', 
  password: 'Maf,Chj/S.2Jx8x', 
  port: 6543 
});

async function run() {
  await client.connect();
  try {
    // Eseguiamo il tutto in una singola transazione così il pooler non ci scollega
    const query = `
      BEGIN;
      SET LOCAL statement_timeout = '300s';
      DELETE FROM shared_pois WHERE name ILIKE '%torrefazione%';
      COMMIT;
    `;
    console.log("Esecuzione della query di cancellazione in transazione con timeout a 300s...");
    
    await client.query(query);
    console.log("Cancellazione andata a buon fine senza timeout!");
  } catch (e) {
    console.error('Errore PG:', e.message);
  }
  await client.end();
}
run();
