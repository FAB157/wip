/**
 * ITAINTA — Enrichment v4 — COORDINATE-BASED
 * ============================================
 * Logica: dati ESATTI del POI usando coordinate geografiche
 *
 * Per ogni POI:
 *   1. Wikipedia  → tag OSM (già esatto) + geosearch coordinate se mancante
 *   2. Wikidata   → tag OSM (già esatto) → estrae dati tecnici + sitelinks → Wikipedia
 *   3. WikiVoyage → GEOSEARCH per coordinate → pagina destinazione più vicina
 *   4. Wikimedia  → tag OSM wikimedia_commons + Wikidata P18 (immagine ufficiale)
 *
 * NON si cerca più per "nome del monumento" su WikiVoyage: troppo ambiguo.
 * Si usa l'API geosearch di MediaWiki che restituisce gli articoli
 * geograficamente più vicini alle coordinate del POI.
 */
const { Client } = require('pg');
const https = require('https');

const DB_CONFIG = {
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
};

// ── HTTP helper ────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'ItaInTasca/4.0 (info@itaintasca.it)' }
    }, (res) => {
      // Segui redirect (301/302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(9000, () => { req.destroy(); resolve(null); });
  });
}

// ── 1. WIKIPEDIA — tag OSM è già il link esatto al POI ────────────────
async function fetchWikipedia(wpTag) {
  try {
    const langCode = wpTag.includes(':') ? wpTag.split(':')[0] : 'it';
    const title    = wpTag.includes(':') ? wpTag.split(':').slice(1).join(':') : wpTag;
    const url = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const data = await httpGet(url);
    if (!data || data.type?.includes('not_found') || !data.extract) return null;
    return {
      extract:   data.extract,
      thumbnail: data.thumbnail?.source || null,
      url:       data.content_urls?.desktop?.page || null,
      lang:      langCode,
    };
  } catch { return null; }
}

// ── Wikipedia GEOSEARCH RIMOSSO ────────────────────────────────────────
// NON cerchiamo mai Wikipedia per nome o coordinate senza tag OSM.
// "Monumento ai Caduti" ce ne sono migliaia: cercarlo per nome o
// geosearch restituirebbe un monumento casuale da un'altra città.
// REGOLA: solo se il POI ha il tag OSM wikipedia= → usiamo quella pagina ESATTA.

// ── 2. WIKIDATA — tag OSM è già l'entità esatta del POI ───────────────
async function resolveQidLabel(qid) {
  if (!qid || !qid.startsWith('Q')) return null;
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=it|en&format=json`;
    const data = await httpGet(url);
    const entity = data?.entities?.[qid];
    return entity?.labels?.it?.value || entity?.labels?.en?.value || null;
  } catch { return null; }
}

async function fetchWikidata(qid) {
  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const data = await httpGet(url);
    if (!data?.entities?.[qid]) return null;
    const entity = data.entities[qid];
    const claims = entity.claims || {};

    const getVal = (prop) => {
      const c = claims[prop];
      if (!c?.[0]) return null;
      const sv = c[0].mainsnak?.datavalue?.value;
      if (!sv) return null;
      if (typeof sv === 'string') return sv;
      if (typeof sv === 'object') {
        if (sv.time)           return sv.time.replace(/^\+/, '').split('T')[0].split('-')[0];
        if (sv['entity-type']) return sv.id;
        if (sv.text)           return sv.text;
        if (sv.amount)         return sv.amount.replace(/^\+/, '');
      }
      return null;
    };

    const architectQid = getVal('P84');
    const styleQid     = getVal('P149');
    const materialQid  = getVal('P186');
    const adminQid     = getVal('P131');

    // Risolve in parallelo
    const [architectLabel, styleLabel, materialLabel, adminLabel] = await Promise.all([
      architectQid ? resolveQidLabel(architectQid) : null,
      styleQid     ? resolveQidLabel(styleQid)     : null,
      materialQid  ? resolveQidLabel(materialQid)  : null,
      adminQid     ? resolveQidLabel(adminQid)     : null,
    ]);

    // Sitelinks: link Wikipedia italiano dall'entità Wikidata
    const wpItTitle = entity.sitelinks?.itwiki?.title || entity.sitelinks?.enwiki?.title || null;
    const wpItLang  = entity.sitelinks?.itwiki ? 'it' : (entity.sitelinks?.enwiki ? 'en' : null);

    return {
      inception:    getVal('P571'),
      architect:    architectLabel || architectQid,
      style:        styleLabel     || styleQid,
      material:     materialLabel  || materialQid,
      height:       getVal('P2048'),
      area:         getVal('P2046'),
      image:        getVal('P18'),       // filename immagine Wikimedia
      website:      getVal('P856'),
      phone:        getVal('P1329'),
      adminLabel,                         // nome comune/città in italiano
      adminQid,
      wpTitle:      wpItTitle,            // ✅ link Wikipedia dall'entità Wikidata
      wpLang:       wpItLang,
    };
  } catch { return null; }
}

// ── 3. WIKIVOYAGE GEOSEARCH — pagina più vicina alle coordinate ────────
// WikiVoyage ha articoli per DESTINAZIONI (città, borghi, quartieri)
// Il geosearch restituisce la pagina WikiVoyage più vicina al POI
async function fetchWikiVoyageByCoords(lat, lon, lang = 'it') {
  try {
    // Raggio 15km: trova la destinazione WikiVoyage più vicina
    const url = `https://${lang}.wikivoyage.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=15000&gslimit=3&format=json&gsnamespace=0`;
    const data = await httpGet(url);
    if (!data) return null;

    const results = data.query?.geosearch || [];
    if (!results.length) return null;

    // Prendi il risultato più vicino (primo)
    const nearest = results[0];

    // Fetch del summary completo
    const summaryUrl = `https://${lang}.wikivoyage.org/api/rest_v1/page/summary/${encodeURIComponent(nearest.title.replace(/ /g, '_'))}`;
    const summary = await httpGet(summaryUrl);
    if (!summary || !summary.extract || summary.extract.length < 30) return null;

    return {
      title:   summary.title || nearest.title,
      extract: summary.extract,
      url:     summary.content_urls?.desktop?.page || null,
      dist:    nearest.dist, // distanza in metri dal POI
    };
  } catch { return null; }
}

// ── 4. WIKIMEDIA COMMONS — immagine ufficiale del POI ─────────────────
function buildWikimediaUrl(fileOrCategory) {
  if (!fileOrCategory) return null;
  const clean = fileOrCategory.replace(/^File:/i, '').replace(/^Category:/i, '');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=1200`;
}

// ── ARRICCHIMENTO SINGOLO POI ─────────────────────────────────────────
async function enrichPoi(client, poi) {
  const { id, name, wikipedia, wikidata, wikimedia_commons, lat, lon } = poi;
  const latF = parseFloat(lat), lonF = parseFloat(lon);

  let wpData = null, wdData = null, wvData = null, wmImage = null;

  // ── Step 1: Wikidata (ha sitelinks → può darci Wikipedia esatta) ──
  if (wikidata) {
    wdData = await fetchWikidata(wikidata);
  }

  // ── Step 2: Wikipedia — SOLO dal tag OSM o sitelink Wikidata ─────
  // ⚠️  NON cercare per nome: "Monumento ai Caduti" = migliaia di omonimi!
  // Il tag OSM wikipedia= è linkato da un contributor umano al POI specifico.
  const wpTag = wikipedia || (wdData?.wpTitle ? `${wdData.wpLang}:${wdData.wpTitle}` : null);
  if (wpTag) {
    wpData = await fetchWikipedia(wpTag);
  }
  // Nessun fallback geosearch Wikipedia: troppo rischioso per nomi comuni.

  // ── Step 3: WikiVoyage GEOSEARCH per coordinate ────────────────────
  // WikiVoyage descrive DESTINAZIONI turistiche (città, borghi), non monumenti.
  // Il geosearch trova la pagina-destinazione più vicina geograficamente.
  // È sempre geograficamente corretto perché usa lat/lon reali del POI.
  if (latF && lonF) {
    wvData = await fetchWikiVoyageByCoords(latF, lonF, 'it');
    // Se non trovato in italiano, prova inglese
    if (!wvData) {
      wvData = await fetchWikiVoyageByCoords(latF, lonF, 'en');
    }
  }

  // ── Step 4: Immagine Wikimedia ─────────────────────────────────────
  if (wikimedia_commons) {
    wmImage = buildWikimediaUrl(wikimedia_commons);
  } else if (wdData?.image) {
    wmImage = buildWikimediaUrl(wdData.image);
  } else if (wpData?.thumbnail) {
    wmImage = wpData.thumbnail;
  }

  // ── Costruzione testo descrittivo ──────────────────────────────────
  const descParts = [];

  if (wpData?.extract && wpData.extract.length > 30) {
    descParts.push(wpData.extract);
  }
  if (wvData?.extract && wvData.extract.length > 30) {
    // WikiVoyage descrive la destinazione, non il monumento — è il "contesto locale"
    const dist = wvData.dist ? ` (a ${wvData.dist}m)` : '';
    descParts.push(`📍 ${wvData.title}${dist}: ${wvData.extract}`);
  }
  const fullDescription = descParts.join('\n\n').trim() || null;

  // ── Technical data ─────────────────────────────────────────────────
  const techData = {};
  if (wdData?.inception) techData.inception = wdData.inception;
  if (wdData?.architect)  techData.architect = wdData.architect;
  if (wdData?.style)      techData.style     = wdData.style;
  if (wdData?.material)   techData.material  = wdData.material;
  if (wdData?.height)     techData.height    = `${wdData.height} m`;
  if (wdData?.area)       techData.area      = `${wdData.area} km²`;
  if (wdData?.adminLabel) techData.city      = wdData.adminLabel;
  if (wpData?.url)        techData.wikipedia_url   = wpData.url;
  if (wvData?.url)        techData.wikivoyage_url  = wvData.url;
  if (wvData?.title)      techData.wikivoyage_dest = wvData.title; // nome destinazione
  if (wvData?.dist)       techData.wikivoyage_dist = wvData.dist;  // distanza in m
  if (wikidata)           techData.wikidata_id      = wikidata;
  if (wikimedia_commons)  techData.wikimedia_commons = wikimedia_commons;

  // ── Practical info (da Wikidata o OSM già in technical_data) ───────
  let practicalInfo = null;
  const pParts = [];
  if (wdData?.openingHours) pParts.push(`Orari: ${wdData.openingHours}`);
  if (wdData?.phone)        pParts.push(`Tel: ${wdData.phone}`);
  if (wdData?.website)      pParts.push(`Web: ${wdData.website}`);
  if (pParts.length) practicalInfo = pParts.join(' | ');

  // ── Salva nel DB ───────────────────────────────────────────────────
  if (fullDescription || wmImage || Object.keys(techData).length > 2) {
    await client.query(`
      UPDATE public.shared_pois SET
        description_ai    = COALESCE(NULLIF(description_ai, ''), $2),
        description_long  = $2,
        full_description  = $2,
        image_url         = COALESCE(image_url, $3),
        photo_url         = COALESCE(photo_url, $3),
        technical_data    = COALESCE(technical_data, '{}'::jsonb) || $4::jsonb,
        practical_info    = COALESCE(NULLIF(practical_info, ''), $5),
        enriched_at       = NOW(),
        enrichment_source = 'geo-v4'
      WHERE id = $1
    `, [
      id,
      fullDescription,
      wmImage,
      JSON.stringify(techData),
      practicalInfo,
    ]);

    return {
      ok:    true,
      hasTxt: !!fullDescription,
      hasImg: !!wmImage,
      hasWv:  !!wvData,
      hasWd:  !!wdData,
      wvDist: wvData?.dist,
    };
  }

  return { ok: false };
}

// ── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Connesso a Supabase\n');

  const LIMIT = parseInt(process.argv[2] || '300', 10);
  const RESET = process.argv[3] === '--reset';

  try {
    // Reset opzionale dei vecchi arricchimenti sbagliati
    if (RESET) {
      const r = await client.query(`
        UPDATE public.shared_pois
        SET enriched_at = NULL, enrichment_source = 're-enrich',
            full_description = NULL, description_ai = NULL, description_long = NULL
        WHERE enrichment_source IN ('wikipedia+wikidata+wikivoyage+wikimedia', 'wp+wd+wv+wm-v3')
      `);
      console.log(`🔄 Reset: ${r.rowCount} POI da riarricchire\n`);
    }

    // Legge anche lat/lon per il geosearch
    console.log(`📋 Carico POI da arricchire (limit=${LIMIT})...`);
    const { rows } = await client.query(`
      SELECT
        sp.id, sp.name,
        sp.lat, sp.lon,
        (sp.technical_data->>'wikipedia')  AS wikipedia,
        (sp.technical_data->>'wikidata')    AS wikidata,
        (sp.technical_data->>'wikimedia')   AS wikimedia_commons
      FROM public.shared_pois sp
      WHERE sp.id LIKE 'osm-%'
        AND (sp.enriched_at IS NULL OR sp.enrichment_source = 're-enrich')
        AND sp.status IN ('verified', 'auto')
        AND sp.lat IS NOT NULL AND sp.lon IS NOT NULL
        AND (
          sp.technical_data ? 'wikipedia'
          OR sp.technical_data ? 'wikidata'
        )
      ORDER BY sp.is_gem DESC, sp.created_at ASC
      LIMIT $1
    `, [LIMIT]);

    console.log(`  📊 POI da processare: ${rows.length}\n`);

    const stats = { ok: 0, skip: 0, hasTxt: 0, hasImg: 0, hasWv: 0, hasWd: 0 };

    for (const poi of rows) {
      try {
        const res = await enrichPoi(client, poi);
        if (res.ok) {
          stats.ok++;
          if (res.hasTxt) stats.hasTxt++;
          if (res.hasImg) stats.hasImg++;
          if (res.hasWv)  stats.hasWv++;
          if (res.hasWd)  stats.hasWd++;
        } else {
          stats.skip++;
        }
        if ((stats.ok + stats.skip) % 10 === 0) {
          process.stdout.write(
            `\r  ✅ ${stats.ok} ok | 📝 ${stats.hasTxt} desc | 🖼️  ${stats.hasImg} img | ` +
            `🧭 ${stats.hasWv} WikiVoyage | 🗃️  ${stats.hasWd} Wikidata | ⏭️  ${stats.skip} skip`
          );
          await new Promise(r => setTimeout(r, 100));
        }
      } catch { stats.skip++; }
    }

    console.log(`\n`);
    console.log(`╔══════════════════════════════════════════════════╗`);
    console.log(`║         RISULTATI ARRICCHIMENTO GEO v4          ║`);
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`  ✅ Arricchiti:                ${stats.ok}`);
    console.log(`  📝 Con descrizione Wikipedia: ${stats.hasTxt}`);
    console.log(`  🖼️  Con immagine Wikimedia:   ${stats.hasImg}`);
    console.log(`  🧭 Con WikiVoyage (geosearch):${stats.hasWv}`);
    console.log(`  🗃️  Con dati Wikidata:         ${stats.hasWd}`);
    console.log(`  ⏭️  Saltati (no dati wiki):   ${stats.skip}`);

    // Verifica finale DB
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)                           AS enriched,
        COUNT(*) FILTER (WHERE full_description IS NOT NULL AND length(full_description)>30) AS con_desc,
        COUNT(*) FILTER (WHERE technical_data ? 'wikivoyage_url')                AS con_wv,
        COUNT(*) FILTER (WHERE technical_data ? 'city')                          AS con_city,
        COUNT(*) FILTER (WHERE technical_data ? 'inception')                     AS con_year,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL)                            AS con_img
      FROM public.shared_pois WHERE id LIKE 'osm-%'
    `);
    console.log(`\n📦 Totali nel DB:`);
    console.log(`   Arricchiti (enriched_at):  ${s.enriched}`);
    console.log(`   Con descrizione Wikipedia: ${s.con_desc}`);
    console.log(`   Con WikiVoyage destinazione:${s.con_wv}`);
    console.log(`   Con città (Wikidata P131):  ${s.con_city}`);
    console.log(`   Con anno fondazione:        ${s.con_year}`);
    console.log(`   Con immagine:               ${s.con_img}`);
    console.log(`\n  → Per continuare: node setup_enrichment_triggers.cjs 1000 --reset`);

  } finally {
    await client.end();
    console.log('\n✅ Done.');
  }
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
