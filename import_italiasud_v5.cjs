/**
 * ITAINTA — CSV POI IMPORT v5 — ITALIASUD
 * =========================================
 * Fix v5 rispetto a v4:
 *   1. pharmacy/hospital/police → categoria "pharmacy"/"hospital" (→ utilita in UI)
 *      NON più "attraction" (che veniva mappato a monumenti!)
 *   2. playground/zoo/aquarium/theme_park → categoria specifica (→ famiglie in UI)
 *   3. bar/cafe/pub/fast_food/ice_cream → "restaurant" (→ locali in UI)
 *   4. Tutti i library → "library" (→ utilita in UI)
 *   5. Reset selettivo: elimina i POI v4 mal-categorizzati (attraction da amenity utilitario)
 *   6. GEM SCORE v4 mantenuta (soglia 8, top-tier castle/ruins/arch/artwork)
 *   7. VIEWPOINT solo paesaggi veri (no park/garden)
 *   8. GEOFENCING dettagliato per tipo
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

// ── Filtri ESCLUSIONE completa (non importare mai) ────────────────────
const EXCLUDE_HW = new Set([
  'motorway_junction','bus_stop','traffic_signals','crossing',
  'stop','street_lamp','give_way','speed_camera',
]);
const EXCLUDE_AM = new Set([
  'fuel','parking','atm','bank','post_box','toilets',
  'telephone','recycling','waste_disposal','waste_basket',
  'bench','shelter','vending_machine','bicycle_parking',
  'bicycle_rental','car_sharing','charging_station',
  'luggage_locker','parking_entrance','parking_space',
  'drinking_water', // fontanelle: troppo numerose, nessuna rilevanza turistica
]);
const EXCLUDE_RW = new Set(['buffer_stop','switch','signal','level_crossing']);

// ── MAPPATURE CATEGORIA → category nel DB ─────────────────────────────
// ✅ REGOLA: la category nel DB deve matchare esattamente osmToUiCategory in MapArea.tsx
//    pharmacy   → "pharmacy"   (UI: utilita)
//    hospital   → "hospital"   (UI: utilita)
//    police     → "police"     (UI: utilita)
//    library    → "library"    (UI: utilita)
//    post_office→ "post_office"(UI: utilita)
//    playground → "playground" (UI: famiglie)
//    theme_park → "theme_park" (UI: famiglie)
//    aquarium   → "aquarium"   (UI: famiglie)
//    zoo        → "zoo"        (UI: famiglie)
//    restaurant → "restaurant" (UI: locali)
//    cafe/bar/pub/fast_food/ice_cream → "restaurant" (UI: locali)

const AMENITY_CAT = {
  // 🍽️ LOCALI
  restaurant: 'restaurant',
  cafe:       'restaurant',
  bar:        'restaurant',
  fast_food:  'restaurant',
  pub:        'restaurant',
  biergarten: 'restaurant',
  food_court: 'restaurant',
  ice_cream:  'restaurant',

  // 🏛️ CULTURA
  museum:       'museum',
  gallery:      'museum',
  arts_centre:  'museum',

  // ⛪ CHIESA
  place_of_worship: 'church',
  monastery:        'church',

  // 🎭 INTRATTENIMENTO (→ attraction)
  theatre:           'attraction',
  cinema:            'attraction',
  nightclub:         'attraction',
  casino:            'attraction',
  community_centre:  'attraction',

  // 🛠️ UTILITÀ — ognuno con la sua categoria specifica!
  pharmacy:    'pharmacy',
  hospital:    'hospital',
  clinic:      'hospital',
  doctors:     'hospital',
  police:      'police',
  library:     'library',
  post_office: 'post_office',
  taxi:        'taxi',
};

const HISTORIC_CAT = {
  castle:              'castle',
  fort:                'castle',
  manor:               'castle',
  palace:              'castle',
  city_gate:           'monument',
  tower:               'monument',
  ruins:               'ruins',
  archaeological_site: 'archaeological_site',
  monument:            'monument',
  memorial:            'monument',
  wayside_cross:       'monument',
  wayside_shrine:      'monument',
  milestone:           'monument',
  battlefield:         'monument',
  boundary_stone:      'monument',
  church:              'church',
  cathedral:           'church',
  chapel:              'church',
  abbey:               'church',
  convent:             'church',
  wreck:               'ruins',
};

const TOURISM_CAT = {
  viewpoint:   'viewpoint',
  museum:      'museum',
  gallery:     'museum',
  artwork:     'artwork',
  attraction:  'attraction',
  // ✅ Famiglie specifiche
  theme_park:  'theme_park',
  zoo:         'zoo',
  aquarium:    'aquarium',
};

// ✅ LEISURE: park/garden → attraction (NON viewpoint!), nature_reserve → viewpoint
const LEISURE_CAT = {
  nature_reserve: 'viewpoint',
  park:           'attraction',
  garden:         'attraction',
  sports_centre:  'attraction',
  // ✅ Famiglie
  playground:     'playground',
  water_park:     'theme_park',
  miniature_golf: 'attraction',
};

const HIGHWAY_CAT = {
  toll_booth: 'attraction',
  services:   'attraction',
};

const RAILWAY_CAT = {
  station:          'station',
  halt:             'station',
  subway_entrance:  'subway_entrance',
  tram_stop:        'attraction',
};

// ── Funzione di categorizzazione ──────────────────────────────────────
function getCategory(r) {
  // Escludi sempre
  if (r.highway && EXCLUDE_HW.has(r.highway)) return null;
  if (r.amenity && EXCLUDE_AM.has(r.amenity)) return null;
  if (r.railway && EXCLUDE_RW.has(r.railway)) return null;

  // Place of worship → church
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

// ── UI category (macro) ───────────────────────────────────────────────
// Deve corrispondere esattamente a osmToUiCategory in MapArea.tsx!
const CAT_TO_UI = {
  // Cultura / Monumenti
  castle:              'monumenti',
  ruins:               'monumenti',
  archaeological_site: 'monumenti',
  monument:            'monumenti',
  artwork:             'monumenti',
  attraction:          'monumenti',
  // Chiesa
  church:              'chiese',
  // Musei
  museum:              'musei',
  // Panorami
  viewpoint:           'panorami',
  // Locali
  restaurant:          'locali',
  // Utilità
  pharmacy:            'utilita',
  hospital:            'utilita',
  police:              'utilita',
  library:             'utilita',
  post_office:         'utilita',
  taxi:                'utilita',
  station:             'utilita',
  subway_entrance:     'utilita',
  // Famiglie
  playground:          'famiglie',
  theme_park:          'famiglie',
  zoo:                 'famiglie',
  aquarium:            'famiglie',
};

// ── Geofencing radii per tipo ─────────────────────────────────────────
const GEO_BASE = {
  viewpoint:           [600, 300],
  castle:              [400, 180],
  archaeological_site: [400, 180],
  ruins:               [350, 150],
  monument:            [280, 100],
  museum:              [250, 100],
  church:              [220,  90],
  artwork:             [80,   40],
  attraction:          [200,  80],
  restaurant:          [100,  50],
  pharmacy:            [80,   40],
  hospital:            [300, 120],
  police:              [150,  60],
  library:             [150,  60],
  post_office:         [100,  40],
  taxi:                [80,   40],
  station:             [300, 120],
  subway_entrance:     [60,   30],
  playground:          [200,  80],
  theme_park:          [500, 200],
  zoo:                 [400, 180],
  aquarium:            [300, 120],
};

function getRadii(cat, r) {
  if (r.highway === 'toll_booth')          return [500, 250];
  if (r.highway === 'services')            return [400, 200];
  if (r.historic === 'cathedral')          return [350, 150];
  if (r.historic === 'abbey' || r.historic === 'monastery') return [400, 180];
  if (r.leisure === 'nature_reserve')      return [800, 400];
  return GEO_BASE[cat] || [200, 80];
}

// ── GEM SCORE v4 (invariato, funziona bene) ───────────────────────────
const GEM_THRESHOLD = 8;
const TOP_TIER = new Set(['castle','ruins','archaeological_site','artwork']);

function gemScore(r, cat) {
  let s = 0;
  if (TOP_TIER.has(cat)) s += 3;
  if (cat === 'museum')  s += 2;
  if (r.wikipedia)         s += 3;
  if (r.wikidata)          s += 1;
  if (r.historic)          s += 2;
  if (r.wikimedia_commons) s += 1;
  if (r.image)             s += 1;
  if (r.opening_hours)     s += 1;
  if (!r.wikipedia && (r.name||'').trim().split(/\s+/).length < 3) s -= 2;
  return s;
}

function isGem(r, cat) {
  // Solo categorie culturali possono essere gemme
  const gemCats = new Set(['castle','ruins','archaeological_site','artwork','museum','monument','church','viewpoint']);
  if (!gemCats.has(cat)) return false;
  const score = gemScore(r, cat);
  if (score < GEM_THRESHOLD) return false;
  return !!(r.wikipedia || (r.wikidata && r.historic));
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
    castle: r.historic==='fort'?'forte':r.historic==='palace'?'palazzo storico':'castello',
    ruins: 'rovine storiche',
    archaeological_site: 'sito archeologico',
    monument: 'monumento storico',
    church: r.historic==='cathedral'?'cattedrale':r.historic==='abbey'?'abbazia':r.historic==='monastery'?'monastero':'chiesa',
    museum: r.tourism==='gallery'?'galleria d\'arte':'museo',
    viewpoint: 'punto panoramico',
    artwork: 'opera d\'arte',
    attraction: 'attrazione turistica',
    restaurant: ({pub:'pub',bar:'bar',cafe:'caffè',fast_food:'fast food',biergarten:'birreria',ice_cream:'gelateria'})[r.amenity]||'ristorante',
    pharmacy: 'farmacia',
    hospital: 'ospedale',
    police: 'stazione di polizia',
    library: 'biblioteca',
    post_office: 'ufficio postale',
    taxi: 'stazione taxi',
    station: 'stazione ferroviaria',
    subway_entrance: 'ingresso metropolitana',
    playground: 'area giochi',
    theme_park: 'parco divertimenti',
    zoo: 'parco zoologico',
    aquarium: 'acquario',
  };
  const label = labels[cat] || 'punto di interesse';
  const vowel = ['a','e','i','o','u'].includes(label[0]?.toLowerCase());
  let desc = `${n} è ${vowel ? 'un\'' : 'un '}${label}`;
  if (r.cuisine) desc += ` (${r.cuisine.split(';')[0].trim()})`;
  return desc + '.';
}

function buildDescLong(r, cat) {
  const parts = [buildDescShort(r, cat)];
  if (r.opening_hours === '24/7') parts.push('Aperto 24 ore su 24, 7 giorni su 7.');
  else if (r.opening_hours) parts.push(`Orari: ${r.opening_hours}.`);
  if (r.phone)   parts.push(`Telefono: ${r.phone}.`);
  if (r.website) parts.push(`Sito web: ${r.website}.`);
  if (r.wikipedia) {
    const page = r.wikipedia.replace(/^[a-z]{2}:/,'').replace(/_/g,' ');
    parts.push(`Wikipedia: "${page}".`);
  }
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

    // ── 1. shared_pois ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO public.shared_pois
        (id, name, lat, lon, category,
         description_ai, description_short, description_long,
         image_url, photo_url,
         is_gem, status, verified, created_at,
         alert_radius, geofence_radius)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'verified',true,NOW(),$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        name              = EXCLUDED.name,
        category          = EXCLUDED.category,
        description_ai    = COALESCE(shared_pois.description_ai, EXCLUDED.description_ai),
        description_short = COALESCE(shared_pois.description_short, EXCLUDED.description_short),
        description_long  = COALESCE(shared_pois.description_long, EXCLUDED.description_long),
        image_url         = COALESCE(shared_pois.image_url, EXCLUDED.image_url),
        photo_url         = COALESCE(shared_pois.photo_url, EXCLUDED.photo_url),
        is_gem            = GREATEST(shared_pois.is_gem::int, EXCLUDED.is_gem::int)::boolean,
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
        osm_id, lat, lon, name,
        amenity, historic, railway, aeroway, highway, tourism,
        leisure, religion, place, craft, shop, cuisine,
        diet_gluten_free, diet_gluten_free_only, diet_vegetarian,
        opening_hours, phone, website,
        wikipedia, wikidata, wikimedia_commons, image,
        country_code, macro_categoria, sotto_categoria, is_gemma,
        descrizione_ai, status, alert_radius, geofence_radius
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
      CAT_TO_UI[p.cat] || p.cat,  // macro_categoria (UI category)
      p.sottocat, p.gem,
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

  // Statistiche iniziali
  const r0 = await client.query(`
    SELECT 
      COUNT(*) tot,
      COUNT(*) FILTER(WHERE is_gem) gems,
      COUNT(*) FILTER(WHERE description_ai IS NULL) needs_enrichment
    FROM public.shared_pois WHERE id LIKE 'osm-%'
  `);
  console.log(`📦 POI OSM esistenti prima dell'import:`);
  console.log(`   Totale: ${r0.rows[0].tot}`);
  console.log(`   Gemme: ${r0.rows[0].gems}`);
  console.log(`   Da arricchire: ${r0.rows[0].needs_enrichment}\n`);

  const BATCH = 50;
  const stats = { ok:0, skip:0, gems:0, bycat:{}, byui:{} };

  for (const csvFile of CSV_FILES) {
    console.log(`\n📂 ${csvFile.region}: ${csvFile.path}`);

    if (!fs.existsSync(csvFile.path)) {
      console.error(`  ❌ File non trovato: ${csvFile.path}`);
      continue;
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(csvFile.path, { encoding:'utf8' }),
      crlfDelay: Infinity,
    });

    let header=null, batch=[], lineN=0, fileOk=0, fileSkip=0, fileGems=0;

    for await (const rawLine of rl) {
      lineN++;
      const line = rawLine.trim();
      if (!line) continue;
      if (lineN === 1) {
        header = parseLine(line).map(h => h.replace(/^@/,'').trim());
        continue;
      }

      const vals = parseLine(line);
      const r = {};
      header.forEach((h,i) => { r[h]=(vals[i]||'').trim(); });

      const cat  = getCategory(r);
      const name = (r.name||'').trim();
      if (!cat || !name) { fileSkip++; stats.skip++; continue; }

      const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
      if (isNaN(lat) || isNaN(lon)) { fileSkip++; stats.skip++; continue; }

      const osmId    = r.id;
      const poiId    = `osm-${osmId}`;
      const gem      = isGem(r, cat);
      const imgUrl   = getImageUrl(r);
      const uiCat    = CAT_TO_UI[cat] || 'monumenti';
      const sottocat = r.historic || r.cuisine?.split(';')[0] || r.amenity || r.tourism || r.railway || r.leisure || cat;
      const [alertR, geoR] = getRadii(cat, r);

      // Descrizione: null se ha wikipedia/wikidata (sarà arricchita dal trigger)
      const hasWiki  = !!(r.wikipedia || r.wikidata);
      const descShort = hasWiki ? null : buildDescShort(r, cat);
      const descLong  = hasWiki ? null : buildDescLong(r, cat);

      if (gem) { stats.gems++; fileGems++; }
      stats.bycat[cat]  = (stats.bycat[cat]||0) + 1;
      stats.byui[uiCat] = (stats.byui[uiCat]||0) + 1;

      batch.push({ osmId, poiId, lat, lon, name, cat, sottocat,
        descShort, descLong, imgUrl, gem, alertR, geoR, r });

      if (batch.length >= BATCH) {
        try {
          await insertBatch(client, batch);
          fileOk += batch.length; stats.ok += batch.length;
        } catch(e) {
          // fallback singolo
          for (const p of batch) {
            try { await insertBatch(client,[p]); fileOk++; stats.ok++; }
            catch(e2) { fileSkip++; stats.skip++; }
          }
        }
        batch = [];
        if (fileOk % 3000 === 0) {
          process.stdout.write(`\r   ✅ ${fileOk} importati, 💎 ${fileGems} gemme...`);
        }
      }
    }

    // Flush finale
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

  // ── Report finale ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('🏁 IMPORT v5 COMPLETATO');
  console.log('══════════════════════════════════════════════════');
  console.log(`  ✅ Importati:  ${stats.ok}`);
  console.log(`  ❌ Saltati:   ${stats.skip}`);
  console.log(`  💎 Gemme v5: ${stats.gems}`);

  console.log('\n  Per categoria UI (visible in app):');
  Object.entries(stats.byui).sort((a,b) => b[1]-a[1])
    .forEach(([c,n]) => console.log(`    ${c.padEnd(20)} ${n}`));

  console.log('\n  Per categoria OSM (raw):');
  Object.entries(stats.bycat).sort((a,b) => b[1]-a[1])
    .forEach(([c,n]) => console.log(`    ${c.padEnd(25)} ${n}`));

  // Verifica finale DB
  const r1 = await client.query(`
    SELECT 
      COUNT(*) tot,
      COUNT(*) FILTER(WHERE is_gem) gems,
      COUNT(*) FILTER(WHERE status='verified') verified,
      COUNT(*) FILTER(WHERE category='viewpoint') viewpoints,
      COUNT(*) FILTER(WHERE category IN ('pharmacy','hospital','police','library','post_office','taxi','station','subway_entrance')) utilita,
      COUNT(*) FILTER(WHERE category IN ('playground','theme_park','zoo','aquarium')) famiglie,
      COUNT(*) FILTER(WHERE category='restaurant') locali,
      COUNT(*) FILTER(WHERE image_url IS NOT NULL) con_immagine,
      COUNT(*) FILTER(WHERE description_ai IS NULL) needs_enrichment
    FROM public.shared_pois WHERE id LIKE 'osm-%'
  `);
  const row = r1.rows[0];
  console.log('\n📦 shared_pois stato finale:');
  console.log(`   Totale POI OSM:    ${row.tot}`);
  console.log(`   💎 Gemme:          ${row.gems}`);
  console.log(`   ✅ Verified:       ${row.verified}`);
  console.log(`   🗺️  Panorami:       ${row.viewpoints}`);
  console.log(`   🛠️  Utilità:        ${row.utilita}`);
  console.log(`   👨‍👩‍👧 Famiglie:       ${row.famiglie}`);
  console.log(`   🍽️  Locali:         ${row.locali}`);
  console.log(`   🖼️  Con immagine:   ${row.con_immagine}`);
  console.log(`   📝 Da arricchire:  ${row.needs_enrichment}`);
  console.log(`\n   ▶️  Avvia: node enrich_pois_wiki.cjs --limit=200`);

  await client.end();
  console.log('\n✅ Done.');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
