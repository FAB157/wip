/**
 * ITAINTA — CSV POI IMPORT v4 — ITALIASUD
 * Fix v4:
 *   1. GEM SCORE più stringente (soglia 8, top-tier solo castle/ruins/arch/artwork)
 *   2. VIEWPOINT solo paesaggi veri (no park/garden, no edifici taggati viewpoint)
 *   3. GEOFENCING scritto in shared_pois (alert_radius + geofence_radius)
 *   4. Solo italiasud.csv (IT-S)
 */
const fs       = require('fs');
const readline = require('readline');
const { Client } = require('pg');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh', host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres', password: 'Maf,Chj/S.2Jx8x', port: 6543,
};

const CSV_FILES = [
  { path: 'D:/0MAPPA POI WIP/file punti per database/italiasud.csv', region: 'IT-S' },
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
  pharmacy:'attraction',
  drinking_water:'attraction',
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
  // ✅ FIX v4: viewpoint SOLO se NON ha già una categoria storica prioritaria
  viewpoint:'viewpoint',
  museum:'museum', gallery:'museum', artwork:'artwork',
  attraction:'attraction', theme_park:'attraction', zoo:'attraction', aquarium:'attraction',
  hotel:'attraction', guest_house:'attraction', hostel:'attraction', camp_site:'attraction',
};
// ✅ FIX v4: LEISURE — park e garden → attraction (non viewpoint!), solo nature_reserve → viewpoint
const LEISURE_CAT = {
  nature_reserve:'viewpoint',  // riserva naturale = paesaggio autentico
  park:'attraction',           // parco urbano NON è un panorama
  garden:'attraction',         // giardino NON è un panorama
  sports_centre:'attraction',
};
const HIGHWAY_CAT = { toll_booth:'attraction', services:'attraction' };
const RAILWAY_CAT = {
  station:'attraction', halt:'attraction',
  subway_entrance:'attraction',
  tram_stop:'attraction',
};

function getCategory(r) {
  if (r.highway && EXCLUDE_HW.has(r.highway)) return null;
  if (r.amenity && EXCLUDE_AM.has(r.amenity)) return null;
  if (r.railway && EXCLUDE_RW.has(r.railway)) return null;
  if (r.amenity === 'place_of_worship' || r.religion) return 'church';

  // PRIORITÀ 1: historic (architettura storica) — batte sempre tourism=viewpoint
  if (r.historic && HISTORIC_CAT[r.historic]) return HISTORIC_CAT[r.historic];

  // PRIORITÀ 2: amenity
  if (r.amenity && AMENITY_CAT[r.amenity]) return AMENITY_CAT[r.amenity];

  // PRIORITÀ 3: tourism (viewpoint solo se NON ha historic)
  if (r.tourism && TOURISM_CAT[r.tourism]) return TOURISM_CAT[r.tourism];

  // PRIORITÀ 4: railway, leisure, highway
  if (r.railway && RAILWAY_CAT[r.railway]) return RAILWAY_CAT[r.railway];
  if (r.leisure && LEISURE_CAT[r.leisure]) return LEISURE_CAT[r.leisure];
  if (r.highway && HIGHWAY_CAT[r.highway]) return HIGHWAY_CAT[r.highway];
  return null;
}

// ── Geofencing radii — DETTAGLIATO per tipo ───────────────────────────
const GEO_BASE = {
  viewpoint:           [600, 300],   // panorami: raggio ampio perché si vedono da lontano
  castle:              [400, 180],
  archaeological_site: [400, 180],
  ruins:               [350, 150],
  monument:            [280, 100],
  museum:              [250, 100],
  church:              [220,  90],
  attraction:          [200,  80],
  artwork:             [80,   40],
  restaurant:          [100,  50],
};

function getRadii(cat, r) {
  // Override specifici per sotto-tipi
  if (r.amenity === 'pharmacy')          return [80,  40];
  if (r.amenity === 'drinking_water')    return [30,  15];
  if (r.highway === 'toll_booth')        return [500, 250];
  if (r.highway === 'services')          return [400, 200];
  if (r.railway === 'subway_entrance')   return [60,  30];
  if (r.railway === 'tram_stop')         return [80,  40];
  if (r.railway === 'station')           return [300, 120];
  if (r.historic === 'cathedral')        return [350, 150];
  if (r.historic === 'abbey' || r.historic === 'monastery') return [400, 180];
  if (r.leisure === 'nature_reserve')    return [800, 400]; // riserve naturali: grande
  return GEO_BASE[cat] || [200, 80];
}

// ── GEM SCORE v4 — più stringente ────────────────────────────────────
// SOGLIA: 8 (era 5)
// TOP-TIER (+3): solo castle, ruins, archaeological_site, artwork
// RIMOSSI dal top-tier: monument, church, viewpoint, museum (troppo comuni)
// museum → +2
// wikipedia → +3 (fonte editoriale autorevole, NON +2)
// wikidata → +1 (DB, non garanzia di rilevanza)
// historic → +2
// wikimedia_commons → +1
// image → +1
// opening_hours → +1
// NUOVO: must have (wikipedia OR wikidata) + (historic OR è top-tier)
const GEM_THRESHOLD = 8;

function gemScore(r, cat) {
  let s = 0;

  // Top-tier culturale: solo le categorie rare e speciali
  const topTier = new Set(['castle','ruins','archaeological_site','artwork']);
  if (topTier.has(cat)) s += 3;

  // Museum pesa +2 (importante ma comune)
  if (cat === 'museum') s += 2;

  // Fonti esterne
  if (r.wikipedia)         s += 3;  // ↑ alzato da 2 a 3
  if (r.wikidata)          s += 1;  // ↓ abbassato da 2 a 1
  if (r.historic)          s += 2;
  if (r.wikimedia_commons) s += 1;
  if (r.image)             s += 1;
  if (r.opening_hours)     s += 1;
  // website e phone rimossi (troppo comuni, non indicano importanza)

  // PENALITÀ: nome generico corto senza wikipedia
  if (!r.wikipedia && (r.name || '').trim().split(/\s+/).length < 3) {
    s -= 2;
  }

  return s;
}

function isGem(r, cat) {
  const score = gemScore(r, cat);
  if (score < GEM_THRESHOLD) return false;

  // GUARD AGGIUNTIVO: deve avere almeno una fonte esterna autorevole
  const hasSources = !!(r.wikipedia || (r.wikidata && r.historic));
  return hasSources;
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

// ── Descrizioni ───────────────────────────────────────────────────────
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

// ── Insert batch ──────────────────────────────────────────────────────
async function insertBatch(client, batch) {
  if (!batch.length) return;

  for (const p of batch) {
    const r = p.r;

    // ── 1. shared_pois (con geofencing) ──────────────────────────────
    await client.query(`
      INSERT INTO public.shared_pois
        (id,name,lat,lon,category,
         description_ai,description_short,description_long,
         image_url,photo_url,
         is_gem,status,verified,created_at,
         alert_radius,geofence_radius)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'verified',true,NOW(),$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        name              = EXCLUDED.name,
        category          = EXCLUDED.category,
        description_ai    = COALESCE(shared_pois.description_ai, EXCLUDED.description_ai),
        description_short = COALESCE(shared_pois.description_short, EXCLUDED.description_short),
        description_long  = COALESCE(shared_pois.description_long, EXCLUDED.description_long),
        image_url         = COALESCE(shared_pois.image_url, EXCLUDED.image_url),
        photo_url         = COALESCE(shared_pois.photo_url, EXCLUDED.photo_url),
        is_gem            = GREATEST(shared_pois.is_gem, EXCLUDED.is_gem),
        alert_radius      = EXCLUDED.alert_radius,
        geofence_radius   = EXCLUDED.geofence_radius,
        status            = 'verified',
        verified          = true
    `, [
      p.poiId, p.name, p.lat, p.lon, p.cat,
      p.descShort, p.descShort, p.descLong,
      p.imgUrl, p.imgUrl,
      p.gem,
      p.alertR, p.geoR
    ]);

    // ── 2. punti_interesse ────────────────────────────────────────────
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

  const BATCH = 30;
  const stats = { ok:0, skip:0, gems:0, viewpoints:0, bycat:{} };

  // Conteggio iniziale
  const r0 = await client.query('SELECT COUNT(*) AS tot FROM public.shared_pois');
  console.log(`📦 POI esistenti prima dell'import: ${r0.rows[0].tot}\n`);

  for (const csvFile of CSV_FILES) {
    console.log(`\n📂 ${csvFile.region}: ${csvFile.path}`);

    if (!require('fs').existsSync(csvFile.path)) {
      console.error(`  ❌ File non trovato: ${csvFile.path}`);
      continue;
    }

    const rl = readline.createInterface({
      input: require('fs').createReadStream(csvFile.path, { encoding:'utf8' }),
      crlfDelay: Infinity,
    });

    let header=null, batch=[], lineN=0, fileOk=0, fileSkip=0, fileGems=0;

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
      const gem     = isGem(r, cat);         // ✅ nuova logica stringente
      const imgUrl  = getImageUrl(r);
      const sottocat= r.historic || r.cuisine?.split(';')[0] || r.amenity || r.tourism || r.railway || r.highway || cat;
      const [alertR, geoR] = getRadii(cat, r); // ✅ geofencing dettagliato
      const hasWiki = !!(r.wikipedia || r.wikidata);
      const descShort = hasWiki ? null : buildDescShort(r, cat);
      const descLong  = hasWiki ? null : buildDescLong(r, cat);

      if (cat === 'viewpoint') stats.viewpoints++;
      if (gem) { stats.gems++; fileGems++; }
      stats.bycat[cat] = (stats.bycat[cat]||0)+1;

      batch.push({ osmId, poiId, lat, lon, name, cat, sottocat,
        descShort, descLong, imgUrl, gem, alertR, geoR, r });

      if (batch.length >= BATCH) {
        try {
          await insertBatch(client, batch);
          fileOk += batch.length; stats.ok += batch.length;
        } catch(e) {
          console.error(`\n  ⚠️  Batch error: ${e.message.substring(0,120)}`);
          for (const p of batch) {
            try { await insertBatch(client,[p]); fileOk++; stats.ok++; }
            catch(e2) { fileSkip++; stats.skip++; }
          }
        }
        batch=[];
        if (fileOk % 2000 === 0) process.stdout.write(`\r   ✅ ${fileOk} importati, 💎 ${fileGems} gemme...`);
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
    console.log(`\n   ✅ ${csvFile.region}: OK=${fileOk}, Skip=${fileSkip}, Gemme=${fileGems}`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('🏁 IMPORT COMPLETATO');
  console.log('══════════════════════════════════════════════════');
  console.log(`  ✅ Importati:    ${stats.ok}`);
  console.log(`  ❌ Saltati:     ${stats.skip}`);
  console.log(`  💎 Gemme (v4): ${stats.gems}`);
  console.log(`  🗺️  Viewpoints: ${stats.viewpoints}`);
  console.log('\n  Per categoria:');
  Object.entries(stats.bycat).sort((a,b)=>b[1]-a[1])
    .forEach(([c,n])=>console.log(`    ${c.padEnd(25)} ${n}`));

  // Verifica finale DB
  const r1 = await client.query(`
    SELECT COUNT(*) tot,
           COUNT(*) FILTER(WHERE is_gem) gems,
           COUNT(*) FILTER(WHERE status='verified') verified,
           COUNT(*) FILTER(WHERE category='viewpoint') viewpoints,
           COUNT(*) FILTER(WHERE image_url IS NOT NULL) con_immagine,
           COUNT(*) FILTER(WHERE description_ai IS NULL) needs_enrichment
    FROM public.shared_pois WHERE id LIKE 'osm-%'
  `);
  console.log('\n📦 shared_pois finale:', r1.rows[0]);

  await client.end();
  console.log('\n✅ Done.');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
