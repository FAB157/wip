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
    // Disabilitiamo/alziamo il timeout per questa singola connessione
    await client.query("SET statement_timeout = '120s'");
    console.log("Timeout alzato a 120s. Procedo con la cancellazione...");
    
    // Possiamo cancellare direttamente, ora che abbiamo tempo sufficiente
    const resDel = await client.query("DELETE FROM shared_pois WHERE name ILIKE '%torrefazione%'");
    
    console.log(`Cancellati con successo ${resDel.rowCount} POI relativi a "torrefazione".`);
  } catch (e) {
    console.error('Errore PG:', e.message);
  }
  await client.end();
}
run();
