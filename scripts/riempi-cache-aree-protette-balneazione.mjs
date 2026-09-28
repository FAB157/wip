#!/usr/bin/env node
/**
 * Riempimento INIZIALE di aree_protette_cache e balneazione_cache
 * (migration 20260927090000): scandisce l'Europa a griglia e scarica una
 * volta sola quello che oggi il client chiedeva dal vivo ad ogni apertura
 * del livello. Nessun cron qui — solo il riempimento una tantum, come
 * richiesto («fai solo iniziale»). Il rinfresco periodico è un passo
 * separato, non ancora deciso.
 *
 * Uso: node scripts/riempi-cache-aree-protette-balneazione.mjs [--prova]
 * --prova = solo 4 celle (Italia centro-nord), per collaudo veloce.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const PROVA = process.argv.includes('--prova');

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Griglia Europa (EEA: UE + Norvegia/Islanda/Svizzera/Balcani/UK) ───────
// Mainland: lat 34-71, lon -25/45. Isole atlantiche (Canarie/Azzorre) fuori
// da questo primo giro: si aggiungono dopo se manca qualcosa (nota onesta,
// non silenziosa).
const LAT_MIN = 34, LAT_MAX = 71, LON_MIN = -25, LON_MAX = 45;
const PASSO_LAT = 4, PASSO_LON = 5;

function costruisciGriglia() {
  const celle = [];
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += PASSO_LAT) {
    for (let lon = LON_MIN; lon < LON_MAX; lon += PASSO_LON) {
      celle.push({
        south: lat, north: Math.min(lat + PASSO_LAT, LAT_MAX),
        west: lon, east: Math.min(lon + PASSO_LON, LON_MAX),
      });
    }
  }
  return celle;
}

// Riquadro piccolo (Toscana/Liguria/Emilia) per --prova.
const CELLE_PROVA = [{ south: 42, north: 46, west: 8, east: 13 }];

// ── Aree protette (EEA ArcGIS, stessi endpoint di src/lib/areeProtette.ts) ─
const BASE_AREE = 'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites';
const PAGINA = 1000;
const MAX_PER_CELLA = 6000; // tetto di sicurezza: mai un loop infinito per cella

async function interrogaArcGis(url, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${url}?${new URLSearchParams(params).toString()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || 'errore ArcGIS');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Tutte le feature di un layer per un riquadro, con paginazione resultOffset. */
async function tutteLeFeature(url, whereOutFields, envelope) {
  const risultato = [];
  let offset = 0;
  for (;;) {
    const data = await interrogaArcGis(url, {
      f: 'geojson', geometry: envelope, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true', geometryPrecision: '4',
      maxAllowableOffset: '0.0005', resultRecordCount: String(PAGINA), resultOffset: String(offset),
      ...whereOutFields,
    });
    const feats = Array.isArray(data?.features) ? data.features : [];
    risultato.push(...feats);
    if (!data?.properties?.exceededTransferLimit && feats.length < PAGINA) break;
    offset += PAGINA;
    if (offset >= MAX_PER_CELLA) break;
    await sleep(200);
  }
  return risultato;
}

async function scaricaAreeProtetteCella(cella) {
  const envelope = [cella.west.toFixed(4), cella.south.toFixed(4), cella.east.toFixed(4), cella.north.toFixed(4)].join(',');
  const aree = [];
  const visti = new Set();
  const n2k = (feats, tipoDefault) => {
    for (const f of feats) {
      const p = f?.properties || {};
      const codice = String(p.SITECODE || '').trim();
      if (!codice || visti.has(`n2k:${codice}`) || !f.geometry) continue;
      visti.add(`n2k:${codice}`);
      const st = String(p.SITETYPE || '').toUpperCase();
      const tipo = st === 'A' ? 'n2k_uccelli' : st === 'B' ? 'n2k_habitat' : tipoDefault;
      aree.push({
        id: `n2k-${codice}`, tipo, codice, nome: String(p.SITENAME || '').trim() || codice,
        kmq: Number.isFinite(Number(p.Area_km2)) ? Math.round(Number(p.Area_km2) * 10) / 10 : null,
        iucn: null, designazione: null, paese: codice.slice(0, 2), geometry: f.geometry,
      });
    }
  };
  try {
    const habitat = await tutteLeFeature(`${BASE_AREE}/Natura2000_Dyna_WM/MapServer/4/query`,
      { where: '1=1', outFields: 'SITECODE,SITENAME,SITETYPE,Area_km2' }, envelope);
    n2k(habitat, 'n2k_habitat');
    await sleep(150);
    const uccelli = await tutteLeFeature(`${BASE_AREE}/Natura2000_Dyna_WM/MapServer/8/query`,
      { where: '1=1', outFields: 'SITECODE,SITENAME,SITETYPE,Area_km2' }, envelope);
    n2k(uccelli, 'n2k_uccelli');
    await sleep(150);
    const nazionali = await tutteLeFeature(`${BASE_AREE}/CDDAv21_Dyna_WM/MapServer/4/query`,
      { where: "spatialDataDissemination='public'", outFields: 'cddaId,siteName,designatedAreaType,iucnCategory,cddaCountryCode,siteArea' }, envelope);
    for (const f of nazionali) {
      const p = f?.properties || {};
      const codice = String(p.cddaId ?? '').trim();
      if (!codice || visti.has(`cdda:${codice}`) || !f.geometry) continue;
      visti.add(`cdda:${codice}`);
      aree.push({
        id: `cdda-${codice}`, tipo: 'nazionale', codice, nome: String(p.siteName || '').trim() || codice,
        kmq: Number.isFinite(Number(p.siteArea)) ? Math.round(Number(p.siteArea) / 10) / 10 : null,
        iucn: p.iucnCategory ? String(p.iucnCategory) : null,
        designazione: p.designatedAreaType ? String(p.designatedAreaType) : null,
        paese: p.cddaCountryCode ? String(p.cddaCountryCode) : null, geometry: f.geometry,
      });
    }
  } catch (e) {
    console.warn(`  [aree] cella ${JSON.stringify(cella)} fallita:`, e.message);
  }
  return aree;
}

// ── Balneazione (EEA WISE Bathing Water) ──────────────────────────────────
async function stagioneDisponibile() {
  const anno = new Date().getFullYear();
  for (let a = anno; a >= anno - 3; a--) {
    try {
      const r = await fetch(`https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_${a}/MapServer/14/query?f=json&where=1%3D1&returnCountOnly=true`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.error) continue;
      return a;
    } catch {}
  }
  return null;
}

async function scaricaBalneazioneCella(cella, anno) {
  const envelope = [cella.west.toFixed(4), cella.south.toFixed(4), cella.east.toFixed(4), cella.north.toFixed(4)].join(',');
  const url = `https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_${anno}/MapServer/14/query`;
  const siti = [];
  try {
    const feats = await tutteLeFeature(url, {
      where: '1=1', outFields: 'OBJECTID,bathingWaterName,qualityStatus,latitude,longitude',
    }, envelope);
    for (const f of feats) {
      const p = f?.properties;
      if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
      const q = String(p.qualityStatus || '').trim().toLowerCase();
      const qualita = ['excellent', 'good', 'sufficient', 'poor'].includes(q) ? q : 'unknown';
      siti.push({
        id: `bw-${p.OBJECTID}`, nome: String(p.bathingWaterName || '').trim() || '—',
        lat: p.latitude, lon: p.longitude, qualita, stagione: anno,
      });
    }
  } catch (e) {
    console.warn(`  [balneazione] cella ${JSON.stringify(cella)} fallita:`, e.message);
  }
  return siti;
}

// ── Scrittura ──────────────────────────────────────────────────────────────
async function scriviAreeProtette(c, aree) {
  for (const a of aree) {
    await c.query(
      `insert into public.aree_protette_cache (id, tipo, codice, nome, kmq, iucn, designazione, paese, geom, aggiornato_il)
       values ($1,$2,$3,$4,$5,$6,$7,$8, st_setsrid(st_geomfromgeojson($9), 4326), now())
       on conflict (id) do update set tipo=excluded.tipo, codice=excluded.codice, nome=excluded.nome, kmq=excluded.kmq,
         iucn=excluded.iucn, designazione=excluded.designazione, paese=excluded.paese, geom=excluded.geom, aggiornato_il=now()`,
      [a.id, a.tipo, a.codice, a.nome, a.kmq, a.iucn, a.designazione, a.paese, JSON.stringify(a.geometry)],
    );
  }
}

async function scriviBalneazione(c, siti) {
  for (const s of siti) {
    await c.query(
      `insert into public.balneazione_cache (id, nome, lat, lon, geog, qualita, stagione, aggiornato_il)
       values ($1,$2,$3,$4, st_setsrid(st_makepoint($4,$3),4326)::geography, $5,$6, now())
       on conflict (id) do update set nome=excluded.nome, lat=excluded.lat, lon=excluded.lon, geog=excluded.geog,
         qualita=excluded.qualita, stagione=excluded.stagione, aggiornato_il=now()`,
      [s.id, s.nome, s.lat, s.lon, s.qualita, s.stagione],
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────
const c = new Client({
  user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD,
  port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000, query_timeout: 60000,
});
await c.connect();
await c.query('SET default_transaction_read_only = off');

const celle = PROVA ? CELLE_PROVA : costruisciGriglia();
console.log(`${celle.length} celle da scandire${PROVA ? ' (--prova)' : ''}.`);

const anno = await stagioneDisponibile();
console.log('stagione balneazione:', anno ?? 'NESSUNA (servizio EEA irraggiungibile: si salta la balneazione)');

let totAree = 0, totSiti = 0;
for (let i = 0; i < celle.length; i++) {
  const cella = celle[i];
  process.stdout.write(`[${i + 1}/${celle.length}] ${JSON.stringify(cella)} … `);
  const aree = await scaricaAreeProtetteCella(cella);
  await scriviAreeProtette(c, aree);
  totAree += aree.length;
  let siti = [];
  if (anno) {
    siti = await scaricaBalneazioneCella(cella, anno);
    await scriviBalneazione(c, siti);
    totSiti += siti.length;
  }
  console.log(`${aree.length} aree, ${siti.length} siti balneazione (tot ${totAree}/${totSiti})`);
  await sleep(300);
}

const rA = await c.query('select count(*) from aree_protette_cache');
const rB = await c.query('select count(*) from balneazione_cache');
console.log('RIEPILOGO: aree_protette_cache =', rA.rows[0].count, '| balneazione_cache =', rB.rows[0].count);
await c.end();
