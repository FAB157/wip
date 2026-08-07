const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

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
    console.log("🚀 Ricerca dei record duplicati da eliminare...");
    
    // 1. Troviamo gli ID di tutti i record scartati (row_num > 1)
    // Diamo precedenza a quelli con audioguide Nicky/Dante, descrizioni e foto
    const findQuery = `
      WITH RankedDuplicates AS (
        SELECT 
          p.id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(p.name)), ROUND(p.lat::numeric, 3), ROUND(p.lon::numeric, 3)
            ORDER BY 
              (SELECT COUNT(*) FROM poi_audioguides a WHERE a.poi_id = p.id) DESC,
              (CASE WHEN p.description_short IS NOT NULL AND p.description_long IS NOT NULL THEN 1 ELSE 0 END) DESC,
              (CASE WHEN p.enriched_at IS NOT NULL THEN 1 ELSE 0 END) DESC,
              (CASE WHEN p.image_url IS NOT NULL OR p.photo_url IS NOT NULL THEN 1 ELSE 0 END) DESC,
              p.updated_at DESC NULLS LAST,
              p.id ASC
          ) as row_num
        FROM shared_pois p
        WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
      )
      SELECT id 
      FROM RankedDuplicates 
      WHERE row_num > 1
    `;
    
    const res = await client.query(findQuery);
    const idsToDelete = res.rows.map(row => row.id);
    console.log(`Trovati ${idsToDelete.length} ID duplicati da rimuovere permanentemente.`);

    if (idsToDelete.length === 0) {
      console.log("Nessun duplicato da rimuovere. Esco.");
      await client.end();
      return;
    }

    // 2. Cancellazione in lotti per evitare timeout o blocchi lunghi
    const BATCH_SIZE = 5000;
    let deletedCount = 0;

    console.log(`Inizio cancellazione in batch da ${BATCH_SIZE}...`);
    
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
      const deleteQuery = `DELETE FROM shared_pois WHERE id = ANY($1::text[])`;
      
      const delRes = await client.query(deleteQuery, [chunk]);
      deletedCount += delRes.rowCount;
      console.log(`Cancellati ${deletedCount} / ${idsToDelete.length} record...`);
    }

    console.log(`✅ Operazione completata! Cancellati definitivamente ${deletedCount} record duplicati.`);

  } catch (e) {
    console.error('❌ Errore durante l\'eliminazione:', e.message);
  }
  await client.end();
}
run();
