const { Client } = require('pg');
const dotenv = require('dotenv');
const wc = require('which-country');
const countries = require('i18n-iso-countries');

dotenv.config();

// Carica il pacchetto per l'inglese per i nomi internazionali
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const client = new Client({ 
  user: 'postgres.qfxxhzkkrkvbuekfknhh', 
  host: 'aws-0-eu-west-1.pooler.supabase.com', 
  database: 'postgres', 
  password: 'Maf,Chj/S.2Jx8x', 
  port: 6543 
});

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  await client.connect();

  try {
    console.log(`Modalità Dry Run: ${isDryRun ? 'ATTIVA (nessuna modifica al DB)' : 'DISATTIVATA (modifiche reali)'}`);

    if (isDryRun) {
      // Test su New York (i 20 POI trovati prima)
      const minLat = 40.4;
      const maxLat = 41.0;
      const minLon = -74.4;
      const maxLon = -73.5;

      console.log('--- TEST: New York POIs ---');
      const res = await client.query(`
        SELECT id, name, category, country, lat, lon 
        FROM shared_pois 
        WHERE lat BETWEEN $1 AND $2 
          AND lon BETWEEN $3 AND $4
        LIMIT 20
      `, [minLat, maxLat, minLon, maxLon]);

      for (const row of res.rows) {
        // which-country richiede [lon, lat]
        const iso3 = wc([parseFloat(row.lon), parseFloat(row.lat)]);
        const countryName = iso3 ? countries.getName(iso3, "en") : 'Sconosciuta';
        console.log(`POI: ${row.name}`);
        console.log(`  -> Coord: [${row.lat}, ${row.lon}]`);
        console.log(`  -> Vecchia Nazione DB: ${row.country}`);
        console.log(`  -> Nuova Nazione Calcolata: ${countryName}`);
        console.log('-------------------------');
      }
    } else {
      // Esecuzione REALE a blocchi
      const batchSize = 10000;
      let offset = 0;
      let totalUpdated = 0;
      
      const totalRes = await client.query(`SELECT COUNT(*) FROM shared_pois`);
      const totalPois = parseInt(totalRes.rows[0].count);
      console.log(`Inizio elaborazione di ${totalPois} POI a blocchi di ${batchSize}...`);

      while (true) {
        // Usa ctid o order by id per paginare in sicurezza, id è text.
        // Poiché offset è lento per milioni, cerchiamo di usare un cursore id.
        const batchQuery = await client.query(`
          SELECT id, country, lat, lon 
          FROM shared_pois 
          ORDER BY id 
          LIMIT $1 OFFSET $2
        `, [batchSize, offset]);

        if (batchQuery.rows.length === 0) {
          console.log(`Finito! Letti tutti i record.`);
          break;
        }

        let updateQueries = [];
        for (const row of batchQuery.rows) {
          if (!row.lat || !row.lon) continue;
          
          const iso3 = wc([parseFloat(row.lon), parseFloat(row.lat)]);
          let correctCountry = iso3 ? countries.getName(iso3, "en") : null;
          
          if (!correctCountry) continue; // Salta se in mezzo all'oceano ecc.

          if (row.country !== correctCountry) {
            updateQueries.push(`('${row.id.replace(/'/g, "''")}', '${correctCountry.replace(/'/g, "''")}')`);
          }
        }

        if (updateQueries.length > 0) {
          // Esecuzione update massivo super veloce per questo blocco
          const updateSql = `
            UPDATE shared_pois AS p
            SET country = v.new_country
            FROM (VALUES ${updateQueries.join(',')}) AS v(id, new_country)
            WHERE p.id = v.id;
          `;
          await client.query(updateSql);
          totalUpdated += updateQueries.length;
        }

        offset += batchSize;
        const progress = Math.min(((offset / totalPois) * 100).toFixed(2), 100);
        console.log(`Avanzamento: ${progress}% (Aggiornati finora: ${totalUpdated})`);
      }
      
      console.log(`====== COMPLETATO ======`);
      console.log(`Totale POI aggiornati/corretti: ${totalUpdated}`);
    }
  } catch (e) {
    console.error('Errore:', e.message);
  }
  await client.end();
}
run();
