const fs = require('fs');
const readline = require('readline');
const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};

function parseCsvLine(text) {
  let ret = [''], i = 0, p = '', s = true;
  for (let l = text; i < l.length; i++) {
    let l_i = l[i];
    if (l_i === '"') {
      s = !s;
    } else if (l_i === ',' && s) {
      ret.push('');
    } else {
      ret[ret.length - 1] += l_i;
    }
  }
  return ret;
}

async function run() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Connesso a Supabase per import UNESCO');

  const fileStream = fs.createReadStream('D:/0MAPPA POI WIP/file punti per database/unesco_merged.csv');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  let batchMap = new Map();
  const BATCH_SIZE = 500;
  
  for await (const line of rl) {
    if (!line.trim()) continue;

    const cols = parseCsvLine(line);
    if (cols.length < 9) continue;
    
    // Skip if it's a header line
    if (cols[0] === '@id' || cols[0] === 'id') continue;

    const id = `unesco-${cols[0]}`;
    const lat = parseFloat(cols[1]);
    const lon = parseFloat(cols[2]);
    let name = cols[3] || 'Sito UNESCO';
    
    const wikipedia = cols[7] ? cols[7].trim() : null;
    const wikidata = cols[8] ? cols[8].trim() : null;
    
    const technical_data = {};
    if (wikipedia) technical_data.wikipedia = wikipedia;
    if (wikidata) technical_data.wikidata = wikidata;
    technical_data.unesco_site = true;

    batchMap.set(id, { id, name, lat, lon, td: JSON.stringify(technical_data) });

    if (batchMap.size >= BATCH_SIZE) {
      await insertBatch(client, Array.from(batchMap.values()));
      count += batchMap.size;
      console.log(`✅ Importati ${count} siti UNESCO...`);
      batchMap.clear();
    }
  }

  if (batchMap.size > 0) {
    await insertBatch(client, Array.from(batchMap.values()));
    count += batchMap.size;
  }

  console.log(`🏁 IMPORT UNESCO COMPLETATO! Totale siti unici: ${count}`);
  await client.end();
}

async function insertBatch(client, items) {
  let values = [];
  let idx = 1;
  const flatArgs = [];
  for (const item of items) {
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, 'monument', true, 'verified', true, NOW(), $${idx++}::jsonb)`);
    flatArgs.push(item.id, item.name, item.lat, item.lon, item.td);
  }
  
  const query = `
    INSERT INTO public.shared_pois
      (id, name, lat, lon, category, is_gem, status, verified, created_at, technical_data)
    VALUES ${values.join(',')}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      is_gem = true,
      technical_data = EXCLUDED.technical_data
  `;
  
  await client.query(query, flatArgs);
}

run().catch(console.error);
