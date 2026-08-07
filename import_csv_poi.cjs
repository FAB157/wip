/**
 * ITAINTA — CSV POI IMPORT v3 — COLONNE REALI
 * Tabelle: shared_pois + punti_interesse (shared_poi_audio_cache solo poi_id+audio_base64)
 * Streaming line-by-line + batch da 50
 */
const fs       = require('fs');
const readline = require('readline');
const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh', host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres', password: 'Maf,Chj/S.2Jx8x', port: 6543,
};

const CSV_FILES = [
  { path: 'D:/0MAPPA POI WIP/file punti per database/italia nord.csv', region: 'IT-N' },
  { path: 'D:/0MAPPA POI WIP/file punti per database/italiasud.csv',   region: 'IT-S' },
];

// ── Filtri ────────────────────────────────────────────────────────────
const EXCLUDE_HW = new Set(['motorway_junction','bus_stop','traffic_signals','crossing','stop','street_lamp','give_way']);
const EXCLUDE_AM = new Set(['fuel','parking','atm','bank','post_box','post_office','toilets',
  'telephone','recycling','waste_disposal','waste_basket','bench','shelter',
  'vending_machine','bicycle_parking','bicycle_rental','car_sharing','taxi','charging_station',
  'luggage_locker','parking_entrance','parking_space']);
const EXCLUDE_RW = new Set(['buffer_stop','switch','signal','level_crossing']);

// ── Mappature categoria ───────────────────────────────────────────────
const AMENITY_CAT = {
  museum:'museum', gallery:'museum', arts_centre:'museum', library:'museum',
  restaurant:'restaurant', cafe:'restaurant', bar:'restaurant', fast_food:'restaurant',
  pub:'restaurant', biergarten:'restaurant', food_court:'restaurant', ice_cream:'restaurant',
  place_of_worship:'church', monastery:'church',
  theatre:'attraction', cinema:'attraction', nightclub:'attraction', casino:'attraction',
  community_centre:'attraction', hospital:'attraction', clinic:'attraction',
  pharmacy:'attraction',       // ✅ farmacie
  drinking_water:'attraction', // ✅ fontanelle
  marketplace:'esperienze_locali',
};
const HISTORIC_CAT = {
  castle:'castle', fort:'castle', manor:'castle', palace:'castle',
  city_gate:'monument', tower:'monument', ruins:'ruins',
  archaeological_site:'archaeological_site',
  monument:'monument', memorial:'monument', wayside_cross:'monument',
  wayside_shrine:'monument', milestone:'monument', battlefield:'monument', boundary_stone:'monument',
  church:'church', cathedral:'church', chapel:'church', monastery:'church', abbey:'church', convent:'church',
  wreck:'ruins',
};
const TOURISM_CAT = {
  viewpoint:'viewpoint', museum:'museum', gallery:'museum', artwork:'artwork',
  attraction:'attraction', theme_park:'attraction', zoo:'attraction', aquarium:'attraction',
  hotel:'attraction', guest_house:'attraction', hostel:'attraction', camp_site:'attraction',
};
const LEISURE_CAT = { park:'viewpoint', garden:'viewpoint', nature_reserve:'viewpoint', sports_centre:'attraction' };
const HIGHWAY_CAT = { toll_booth:'attraction', services:'attraction' }; // ✅ caselli, NO motorway_junction
const RAILWAY_CAT = {
  station:'attraction', halt:'attraction',
  subway_entrance:'attraction', // ✅ metro
  tram_stop:'attraction',
};

function getCategory(r) {
  if (r.highway && EXCLUDE_HW.has(r.highway)) return null;
  if (r.amenity && EXCLUDE_AM.has(r.amenity)) return null;
  if (r.railway && EXCLUDE_RW.has(r.railway)) return null;
  if (r.amenity === 'place_of_worship' || r.religion) return 'church';
  if (r.historic && HISTORIC_CAT[r.historic]) return HISTORIC_CAT[r.historic];
  if (r.amenity && AMENITY_CAT[r.amenity])   return AMENITY_CAT[r.amenity];
  if (r.tourism && TOURISM_CAT[r.tourism])   return TOURISM_CAT[r.tourism];
  if (r.railway && RAILWAY_CAT[r.railway])   return RAILWAY_CAT[r.railway];
  if (r.leisure && LEISURE_CAT[r.leisure])   return LEISURE_CAT[r.leisure];
  if (r.highway && HIGHWAY_CAT[r.highway])   return HIGHWAY_CAT[r.highway];
  if (r.craft || (r.shop && ['craft', 'cheese', 'bakery', 'wine'].includes(r.shop))) return 'esperienze_locali';
  return null;
}

// ── Geofencing radii (override per sotto-tipo) ───────────────────────
const GEO_BASE = {
  viewpoint:[500,200], castle:[350,150], archaeological_site:[350,150],
  ruins:[300,120], monument:[250,90], museum:[200,80], church:[200,80],
  attraction:[200,80], artwork:[80,40], restaurant:[100,50],
};
function getRadii(cat, r) {
  if (r.amenity === 'pharmacy')          return [80,  40];
  if (r.amenity === 'drinking_water')    return [30,  15];
  if (r.highway === 'toll_booth')        return [400, 200];
  if (r.highway === 'services')          return [300, 150];
  if (r.railway === 'subway_entrance')   return [60,  30];
  if (r.railway === 'tram_stop')         return [80,  40];
  if (r.railway === 'station')           return [250, 100];
  return GEO_BASE[cat] || [150, 80];
}

// ── Gem score ─────────────────────────────────────────────────────────
function gemScore(r, cat) {
  let s = 0;
  const cultural = new Set(['castle','ruins','archaeological_site','monument','church','museum','viewpoint','artwork']);
  if (cultural.has(cat))   s += 3;
  if (r.wikipedia)          s += 2;
  if (r.wikidata)           s += 2;
  if (r.historic)           s += 2;
  if (r.wikimedia_commons)  s += 1;
  if (r.image)              s += 1;
  if (r.website)            s += 1;
  if (r.phone)              s += 1;
  if (r.opening_hours)      s += 1;
  return s;
}

// ── Image URL da Wikimedia ────────────────────────────────────────────
function getImageUrl(r) {
  const img = r.image || '';
  const com = r.wikimedia_commons || '';
  if (img.startsWith('File:'))     return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.replace('File:',''))}?width=800`;
  if (com.startsWith('File:'))     return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(com.replace('File:',''))}?width=800`;
  if (com.startsWith('Category:')) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(com.replace('Category:',''))}?width=800`;
  return null;
}

// ── Descrizioni short / long ──────────────────────────────────────────
function buildDescShort(r, cat) {
  const n = r.name || '';
  const labels = {
    castle: r.historic==='fort'?'forte':r.historic==='palace'?'palazzo storico':r.historic==='manor'?'villa storica':'castello',
    ruins: r.historic==='wreck'?'relitto':'rovine storiche',
    archaeological_site: 'sito archeologico',
    monument: ({memorial:'memoriale',monument:'monumento',milestone:'pietra miliare',city_gate:'porta cittadina',tower:'torre storica',wayside_cross:'croce votiva',battlefield:'campo di battaglia'})[r.historic]||'monumento',
    church: r.religion==='jewish'?'sinagoga':r.religion==='muslim'?'moschea':r.historic==='cathedral'?'cattedrale':r.historic==='abbey'?'abbazia':r.historic==='monastery'?'monastero':'chiesa',
    museum: r.tourism==='gallery'?'galleria d\'arte':r.amenity==='library'?'biblioteca':'museo',
    viewpoint: 'punto panoramico',
    artwork: 'opera d\'arte',
    restaurant: ({pub:'pub',bar:'bar',cafe:'caffè',fast_food:'fast food',biergarten:'birreria'})[r.amenity]||'ristorante',
    attraction: r.amenity==='pharmacy'?'farmacia':r.amenity==='drinking_water'?'fontanella':r.railway==='subway_entrance'?'ingresso metro':r.railway==='station'?'stazione ferroviaria':r.highway==='toll_booth'?'casello autostradale':'attrazione',
  };
  const label = labels[cat] || 'punto di interesse';
  let desc = `${n} è ${['a','e','i','o','u'].includes(label[0]?.toLowerCase()) ? 'un\'' : 'un '}${label}`;
  if (r.cuisine) desc += ` (${r.cuisine.split(';')[0].trim()})`;
  return desc + '.';
}

function buildDescLong(r, cat) {
  const parts = [buildDescShort(r, cat)];
  if (r.opening_hours && r.opening_hours !== '24/7') parts.push(`Orari di apertura: ${r.opening_hours}.`);
  else if (r.opening_hours === '24/7') parts.push('Aperto 24 ore su 24, 7 giorni su 7.');
  if (r.phone)   parts.push(`Telefono: ${r.phone}.`);
  if (r.website) parts.push(`Sito web: ${r.website}.`);
  if (r.wikipedia) {
    const page = r.wikipedia.replace(/^[a-z]{2}:/,'').replace(/_/g,' ');
    parts.push(`Approfondimento su Wikipedia: "${page}".`);
  }
  if (r.wikidata && !r.wikipedia) parts.push(`Codice Wikidata: ${r.wikidata}.`);
  if (r.wikimedia_commons) parts.push(`Immagini su Wikimedia Commons: ${r.wikimedia_commons}.`);
  return parts.join(' ');
}

// ── CSV parser ────────────────────────────────────────────────────────
function parseLine(line) {
  const res=[]; let cur=''; let q=false;
  for (let i=0; i<line.length; i++) {
    const c=line[i];
    if (c==='"') { q=!q; }
    else if (c===',' && !q) { res.push(cur.trim()); cur=''; }
    else { cur+=c; }
  }
  res.push(cur.trim());
  return res;
}

// ── Insert batch nelle 2 tabelle principali ───────────────────────────
async function insertBatch(client, batch) {
  if (!batch.length) return;

  // ══ 1. shared_pois ════════════════════════════════════════════════
  // Colonne reali: id, name, lat, lon, category, description_ai,
  //   description_short, description_long, image_url, photo_url,
  //   is_gem, status, verified, created_at
  const spVals = [], spParams = [];
  batch.forEach((p, i) => {
    const b = i * 10;
    spVals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},'verified',true,NOW())`);
    spParams.push(
      p.poiId, p.name, p.lat, p.lon, p.cat,
      p.descShort,   // description_ai (breve — usata dall'app)
      p.descShort,   // description_short
      p.descLong,    // description_long
      p.imgUrl,      // image_url
      p.imgUrl       // photo_url
    );
  });
  await client.query(`
    INSERT INTO public.shared_pois
      (id,name,lat,lon,category,description_ai,description_short,description_long,image_url,photo_url,status,verified,created_at)
    VALUES ${spVals.join(',')}
    ON CONFLICT (id) DO UPDATE SET
      name             = EXCLUDED.name,
      category         = EXCLUDED.category,
      description_ai   = COALESCE(shared_pois.description_ai, EXCLUDED.description_ai),
      description_short= COALESCE(shared_pois.description_short, EXCLUDED.description_short),
      description_long = COALESCE(shared_pois.description_long, EXCLUDED.description_long),
      image_url        = COALESCE(shared_pois.image_url, EXCLUDED.image_url),
      photo_url        = COALESCE(shared_pois.photo_url, EXCLUDED.photo_url),
      is_gem           = GREATEST(shared_pois.is_gem, EXCLUDED.is_gem),
      status           = 'verified',
      verified         = true
  `, spParams);

  // ══ 2. shared_pois is_gem update separato (evita conflitti) ═══════
  const gemUpdates = batch.filter(p => p.gem);
  if (gemUpdates.length > 0) {
    const ids = gemUpdates.map(p => p.poiId);
    await client.query(
      `UPDATE public.shared_pois SET is_gem=true WHERE id = ANY($1)`,
      [ids]
    );
  }

  // ══ 3. punti_interesse ════════════════════════════════════════════
  // Colonne reali: osm_id, lat, lon, name, amenity, historic, railway,
  //   aeroway, highway, tourism, leisure, religion, place, craft, shop,
  //   cuisine, diet_gluten_free, diet_gluten_free_only, diet_vegetarian,
  //   opening_hours, phone, website, wikipedia, wikidata, wikimedia_commons,
  //   image, country_code, macro_categoria, sotto_categoria,
  //   is_gemma, descrizione_ai, status, alert_radius, geofence_radius
  const piVals = [], piParams = [];
  batch.forEach((p, i) => {
    const b = i * 34;
    piVals.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},`+
      `$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},`+
      `$${b+20},$${b+21},$${b+22},$${b+23},$${b+24},$${b+25},$${b+26},$${b+27},$${b+28},`+
      `$${b+29},$${b+30},$${b+31},'verified',$${b+32},$${b+33})`
    );
    piParams.push(
      // 1-4: id, lat, lon, name
      p.osmId, p.lat, p.lon, p.name,
      // 5-14: amenity..tourism
      p.r.amenity||null, p.r.historic||null, p.r.railway||null,
      p.r.aeroway||null, p.r.highway||null, p.r.tourism||null,
      // 15-19: leisure..diet_vegetarian
      p.r.leisure||null, p.r.religion||null, p.r.place||null,
      p.r.craft||null, p.r.shop||null,
      // 20-26: cuisine..image
      p.r.cuisine||null,
      p.r['diet:gluten_free']||null, p.r['diet:gluten_free:only']||null, p.r['diet:vegetarian']||null,
      p.r.opening_hours||null, p.r.phone||null, p.r.website||null,
      // 27-30: wiki + image
      p.r.wikipedia||null, p.r.wikidata||null, p.r.wikimedia_commons||null, p.r.image||null,
      // 31-33: country, categorie, is_gemma
      'IT', p.cat, p.sottocat, p.gem,
      // 34-35: descrizione_ai, radii
      p.descLong,
      // note: alert_radius e geofence_radius passati nei prossimi 2
    );
    // Aggiungi i 2 radii separatamente (già contati nel b+34, b+35 → ma ne abbiamo 33 placeholder)
    // Fix: rimuoviamo descrizione_ai e lo aggiungiamo dopo
  });

  // Rebuild semplice e corretto per punti_interesse
  piVals.length = 0; piParams.length = 0;
  for (const p of batch) {
    const r = p.r;
    await client.query(`
      INSERT INTO public.punti_interesse (
        osm_id,lat,lon,name,
        amenity,historic,railway,aeroway,highway,tourism,
        leisure,religion,place,craft,shop,cuisine,
        diet_gluten_free,diet_gluten_free_only,diet_vegetarian,
        opening_hours,phone,website,
        wikipedia,wikidata,wikimedia_commons,image,
        country_code,macro_categoria,sotto_categoria,is_gemma,
        descrizione_ai,status,alert_radius,geofence_radius
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,
        $17,$18,$19,
        $20,$21,$22,
        $23,$24,$25,$26,
        'IT',$27,$28,$29,
        $30,'verified',$31,$32
      )
      ON CONFLICT (osm_id) DO UPDATE SET
        name            = EXCLUDED.name,
        is_gemma        = EXCLUDED.is_gemma,
        macro_categoria = EXCLUDED.macro_categoria,
        sotto_categoria = EXCLUDED.sotto_categoria,
        phone      = COALESCE(EXCLUDED.phone, punti_interesse.phone),
        website    = COALESCE(EXCLUDED.website, punti_interesse.website),
        wikipedia  = COALESCE(EXCLUDED.wikipedia, punti_interesse.wikipedia),
        wikidata   = COALESCE(EXCLUDED.wikidata, punti_interesse.wikidata),
        descrizione_ai = COALESCE(punti_interesse.descrizione_ai, EXCLUDED.descrizione_ai),
        alert_radius    = EXCLUDED.alert_radius,
        geofence_radius = EXCLUDED.geofence_radius,
        status          = 'verified'
    `, [
      p.osmId, p.lat, p.lon, p.name,
      r.amenity||null, r.historic||null, r.railway||null, r.aeroway||null, r.highway||null, r.tourism||null,
      r.leisure||null, r.religion||null, r.place||null, r.craft||null, r.shop||null, r.cuisine||null,
      r['diet:gluten_free']||null, r['diet:gluten_free:only']||null, r['diet:vegetarian']||null,
      r.opening_hours||null, r.phone||null, r.website||null,
      r.wikipedia||null, r.wikidata||null, r.wikimedia_commons||null, r.image||null,
      p.cat, p.sottocat, p.gem,
      p.descLong,
      p.alertR, p.geoR,
    ]);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Connesso a Supabase\n');

  const BATCH = 50;
  const stats = { ok:0, skip:0, gems:0, bycat:{} };

  for (const csvFile of CSV_FILES) {
    console.log(`\n📂 ${csvFile.region}: ${csvFile.path}`);
    const rl = readline.createInterface({
      input: fs.createReadStream(csvFile.path, { encoding:'utf8' }),
      crlfDelay: Infinity,
    });

    let header=null, batch=[], lineN=0, fileOk=0, fileSkip=0;

    for await (const rawLine of rl) {
      lineN++;
      const line = rawLine.trim();
      if (!line) continue;
      if (lineN===1) {
        header = parseLine(line).map(h => h.replace(/^@/,'').trim());
        continue;
      }

      const vals = parseLine(line);
      const r = {};
      header.forEach((h,i) => { r[h]=(vals[i]||'').trim(); });

      const cat = getCategory(r);
      const name = (r.name||'').trim();
      if (!cat || !name) { fileSkip++; stats.skip++; continue; }

      const lat=parseFloat(r.lat), lon=parseFloat(r.lon);
      if (isNaN(lat)||isNaN(lon)) { fileSkip++; stats.skip++; continue; }

      const osmId   = r.id;
      const poiId   = `osm-${osmId}`;
      const gem     = gemScore(r,cat) >= 5;
      const imgUrl  = getImageUrl(r);
      const sottocat= r.historic || r.cuisine?.split(';')[0] || r.amenity || r.tourism || r.railway || r.highway || cat;
      const [alertR, geoR] = getRadii(cat, r);
      const hasWiki   = !!(r.wikipedia || r.wikidata);
      // Se ha wikipedia/wikidata → lascia description_ai=NULL così il trigger
      // di Supabase scatta e arricchisce automaticamente da Wikipedia/Wikidata.
      // Se non ha wiki → scrivi descrizione base dal CSV (evita trigger inutile).
      const descShort = hasWiki ? null : buildDescShort(r, cat);
      const descLong  = hasWiki ? null : buildDescLong(r, cat);

      batch.push({ osmId, poiId, lat, lon, name, cat, sottocat,
        descShort, descLong, imgUrl, gem, alertR, geoR, r });

      if (gem) stats.gems++;
      stats.bycat[cat] = (stats.bycat[cat]||0)+1;

      if (batch.length >= BATCH) {
        try {
          await insertBatch(client, batch);
          fileOk += batch.length; stats.ok += batch.length;
        } catch(e) {
          console.error(`\n  ⚠️  Batch error: ${e.message.substring(0,150)}`);
          // fallback 1-by-1
          for (const p of batch) {
            try { await insertBatch(client,[p]); fileOk++; stats.ok++; }
            catch(e2) { fileSkip++; stats.skip++; }
          }
        }
        batch=[];
        if (fileOk%1000===0) process.stdout.write(`\r   ✅ ${fileOk} importati, 💎 ${stats.gems} gemme...`);
      }
    }

    // flush finale
    if (batch.length) {
      try { await insertBatch(client,batch); fileOk+=batch.length; stats.ok+=batch.length; }
      catch(e) {
        for (const p of batch) {
          try { await insertBatch(client,[p]); fileOk++; stats.ok++; }
          catch(e2) { fileSkip++; stats.skip++; }
        }
      }
    }
    console.log(`\n   ✅ ${csvFile.region}: OK=${fileOk}, Skip=${fileSkip}`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('🏁 IMPORT COMPLETATO');
  console.log('══════════════════════════════════════════════════');
  console.log(`  ✅ Importati:  ${stats.ok}`);
  console.log(`  ❌ Saltati:    ${stats.skip}`);
  console.log(`  💎 Gemme:      ${stats.gems}`);
  console.log('\n  Per categoria:');
  Object.entries(stats.bycat).sort((a,b)=>b[1]-a[1])
    .forEach(([c,n])=>console.log(`    ${c.padEnd(25)} ${n}`));

  // Verifica finale
  const r1 = await client.query(`
    SELECT COUNT(*) tot,
           COUNT(*) FILTER(WHERE is_gem) gems,
           COUNT(*) FILTER(WHERE status='verified') verified,
           COUNT(*) FILTER(WHERE image_url IS NOT NULL) con_immagine
    FROM public.shared_pois WHERE id LIKE 'osm-%'
  `);
  console.log('\n📦 shared_pois:', r1.rows[0]);

  const r2 = await client.query(`
    SELECT COUNT(*) tot,
           COUNT(*) FILTER(WHERE is_gemma) gems
    FROM public.punti_interesse WHERE country_code='IT'
  `);
  console.log('📦 punti_interesse:', r2.rows[0]);

  await client.end();
  console.log('\n✅ Done.');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
