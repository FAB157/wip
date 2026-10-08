// LUOGHI SENZA STRADA e VOTO PER ZONA (04/10/2026, su ordine del committente).
//
// La guida parte a 30 m DI STRADA dal punto d'arrivo: se quel punto è lontano da ogni strada nota (il
// Teatro antico di Taormina era a 71 m dalla rete) la guida rischia di non partire mai. Questo lavoro
// passa le GEMME visibili (is_gem), prende il loro punto d'arrivo con la stessa regola dell'app
// (arrivo → ingresso → centro) e misura quanto dista dalla strada più vicina nelle road tiles
// (car + foot + extra). Scrive due voci in api_cache, lette dall'admin:
//   luoghi_senza_strada  → i luoghi oltre SOGLIA_M, dal peggiore (max 1.500)
//   voto_zone            → per ogni quadrato di 1°: gemme controllate, quante senza strada, se la zona
//                          ha già le tile «extra», e un voto 0-100
// SOLA LETTURA sul database dei luoghi (pagine per id, con pausa); le tile scaricate restano su disco 30
// giorni, così le notti successive non riscaricano niente. Si ferma da solo se il sito soffre.
// Uso (su Oracle): node luoghi-senza-strada.mjs [--max=N]      Cron: ogni notte alle 01:00 UTC.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import pg from '/root/arrivo-v4/node_modules/pg/lib/index.js';

const SOGLIA_M = 60;          // oltre: «senza strada»
const PASSO = 0.05;
const DIR_CACHE = '/root/strade-extra/cache-tile';
const DIR_EXTRA = '/root/strade-extra/mondo/tile';
const MAX = Number((process.argv.find(a => a.startsWith('--max=')) || '').split('=')[1]) || 400_000;
fs.mkdirSync(DIR_CACHE, { recursive: true });

const env = { ...process.env };
for (const f of ['/root/itainta/.env', '/root/itainta/.env.local']) {
  if (!fs.existsSync(f)) continue;
  for (const riga of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const URL_BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL, CHIAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHIAVE) { console.error('mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const pausa = (ms) => new Promise(ok => setTimeout(ok, ms));
const sitoSano = async () => { try { return (await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) })).ok; } catch { return false; } };

// ── 1. Le gemme, a pagine per id ──
const pw = fs.readFileSync('/root/fase-b/fase-b-ciclo.cjs', 'utf8').match(/password:\s*'([^']+)'/)?.[1];
const db = new pg.Client({ host: 'aws-0-eu-west-1.pooler.supabase.com', port: 5432, user: 'postgres.qfxxhzkkrkvbuekfknhh', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } });
await db.connect(); await db.query("set statement_timeout = '240s'");
const cellaDi = (v) => (Math.floor(v / PASSO) * PASSO).toFixed(2);
const perCella = new Map(); // "x.._y.." → [{id,nome,lat,lon,fonte}]
// `is_gem = true` (e non «is true», né un ordinamento per id): è la forma che usa l'indice parziale
// idx_shared_pois_gem. Con ORDER BY id il database scorreva la chiave primaria di 9 milioni di righe e
// andava in timeout. Un cursore, 1.500 righe alla volta con una pausa: mai una lettura pesante.
let letti = 0;
await db.query('begin');
await db.query(`declare gemme no scroll cursor for
  select id, name, lat, lon, arrival_lat, arrival_lon, entrance_lat, entrance_lon, is_hidden from shared_pois where is_gem = true`);
for (;;) {
  const r = await db.query('fetch 500 from gemme');
  if (!r.rows.length) break;
  for (const p of r.rows) {
    if (p.is_hidden === true) continue;
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ok = (a, b) => a != null && b != null && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && (Number(a) !== 0 || Number(b) !== 0);
    let pt = { lat, lon, fonte: 'centro' };
    if (ok(p.arrival_lat, p.arrival_lon)) pt = { lat: Number(p.arrival_lat), lon: Number(p.arrival_lon), fonte: 'punto d’arrivo' };
    else if (ok(p.entrance_lat, p.entrance_lon)) pt = { lat: Number(p.entrance_lat), lon: Number(p.entrance_lon), fonte: 'ingresso' };
    const k = `x${cellaDi(pt.lon)}_y${cellaDi(pt.lat)}`;
    const v = { id: p.id, nome: p.name, ...pt };
    const arr = perCella.get(k); if (arr) arr.push(v); else perCella.set(k, [v]);
  }
  letti += r.rows.length;
  if (letti % 15000 < 1500) console.error(`gemme lette: ${letti}`);
  if (letti >= MAX) break;
  await pausa(700);
}
await db.query('close gemme').catch(() => {});
await db.query('commit').catch(() => {});
await db.end();
console.error(`gemme: ${letti} in ${perCella.size} celle`);

// ── 2. Le strade di una cella (car + foot dal deposito, extra dal disco), con cache su disco ──
async function scarica(nome) {
  const f = path.join(DIR_CACHE, nome);
  try { const s = fs.statSync(f); if (Date.now() - s.mtimeMs < 30 * 86400_000) return s.size > 0 ? fs.readFileSync(f) : null; } catch { /* non in cache */ }
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${URL_BASE}/storage/v1/object/road_tiles/${nome}`, { headers: { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` }, signal: AbortSignal.timeout(25_000) });
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, b); return b; }
      if (r.status === 400 || r.status === 404) { fs.writeFileSync(f, ''); return null; } // la cella non esiste: lo si ricorda
    } catch { /* si riprova */ }
    await pausa(1500 * (t + 1));
  }
  return null; // errore di rete: NON si ricorda, e la cella non si giudica
}
const linee = (buf) => {
  if (!buf) return [];
  try {
    const fc = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); const out = [];
    for (const f of fc.features || []) {
      const g = f.geometry;
      if (g?.type === 'LineString') out.push(g.coordinates);
      else if (g?.type === 'MultiLineString') out.push(...g.coordinates);
    }
    return out;
  } catch { return []; }
};
const cacheCelle = new Map(); // cella → { seg: Float64Array-like [], griglia, conExtra, vuota } (LRU 40)
async function stradeDi(cella) {
  if (cacheCelle.has(cella)) return cacheCelle.get(cella);
  const [car, foot] = await Promise.all([scarica(`${cella}_car.json.gz`), scarica(`${cella}_foot.json.gz`)]);
  let extra = null;
  try { extra = fs.readFileSync(path.join(DIR_EXTRA, `${cella}_extra.json.gz`)); } catch { /* non ancora estratta */ }
  const tutte = [...linee(car), ...linee(foot), ...linee(extra)];
  const griglia = new Map(); // celle da ~110 m (0,001°) → segmenti [x1,y1,x2,y2] in gradi
  for (const l of tutte) for (let i = 0; i + 1 < l.length; i++) {
    const a = l[i], b = l[i + 1];
    const x0 = Math.floor(Math.min(a[0], b[0]) * 1000), x1 = Math.floor(Math.max(a[0], b[0]) * 1000);
    const y0 = Math.floor(Math.min(a[1], b[1]) * 1000), y1 = Math.floor(Math.max(a[1], b[1]) * 1000);
    if (x1 - x0 > 30 || y1 - y0 > 30) continue; // segmento lunghissimo (traghetto, dato rotto): non si indicizza
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = x * 1_000_003 + y; const arr = griglia.get(k); if (arr) arr.push(a[0], a[1], b[0], b[1]); else griglia.set(k, [a[0], a[1], b[0], b[1]]);
    }
  }
  const v = { griglia, conExtra: !!extra, vuota: tutte.length === 0 };
  cacheCelle.set(cella, v);
  if (cacheCelle.size > 40) cacheCelle.delete(cacheCelle.keys().next().value);
  return v;
}
function metriDallaStrada(strade, lat, lon) {
  const mLat = 111_320, mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const cx = Math.floor(lon * 1000), cy = Math.floor(lat * 1000);
  let best = Infinity;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    const s = strade.griglia.get((cx + dx) * 1_000_003 + (cy + dy)); if (!s) continue;
    for (let i = 0; i < s.length; i += 4) {
      const ax = (s[i] - lon) * mLon, ay = (s[i + 1] - lat) * mLat, bx = (s[i + 2] - lon) * mLon, by = (s[i + 3] - lat) * mLat;
      const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * ux + ay * uy) / l2));
      const d = Math.hypot(ax + t * ux, ay + t * uy);
      if (d < best) best = d;
    }
  }
  return best;
}

// ── 3. Il giro ──
const senza = []; const zone = new Map(); let fatte = 0, celleSenzaDati = 0;
// Quattro celle alla volta: le gemme sono sparse (3.000 gemme stanno in 2.500 celle) e una alla volta
// il primo giro durava un giorno. Le tile restano su disco: le notti dopo non scarica quasi nulla.
const voci = [...perCella]; let prossima = 0;
const operaio = async () => { for (;;) {
  const iVoce = prossima++;
  if (iVoce >= voci.length) return;
  const [cella, luoghi] = voci[iVoce];
  if (++fatte % 200 === 0) {
    while (!(await sitoSano())) { console.error('sito in affanno: fermo 90 s'); await pausa(90_000); }
    console.error(`celle ${fatte}/${perCella.size} · senza strada finora ${senza.length}`);
  }
  const strade = await stradeDi(cella);
  for (const p of luoghi) {
    const kz = `${Math.floor(p.lat)},${Math.floor(p.lon)}`;
    const z = zone.get(kz) || { lat: Math.floor(p.lat), lon: Math.floor(p.lon), n: 0, senza: 0, senzaDati: 0, conExtra: 0 };
    zone.set(kz, z); z.n++;
    if (strade.conExtra) z.conExtra++;
    if (strade.vuota) { z.senzaDati++; continue; } // nessuna strada nella cella: zona non coperta, non colpa del luogo
    let d = metriDallaStrada(strade, p.lat, p.lon);
    if (d > SOGLIA_M) {
      // vicino al bordo la strada può stare nella cella accanto (le vie sono assegnate per baricentro)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const vicina = `x${cellaDi(p.lon + dx * 0.004)}_y${cellaDi(p.lat + dy * 0.004)}`;
        if (vicina === cella) continue;
        d = Math.min(d, metriDallaStrada(await stradeDi(vicina), p.lat, p.lon));
        if (d <= SOGLIA_M) break;
      }
    }
    if (d > SOGLIA_M) { z.senza++; senza.push({ id: p.id, nome: p.nome, lat: p.lat, lon: p.lon, fonte: p.fonte, metri: Number.isFinite(d) ? Math.round(d) : null }); }
  }
  if (strade.vuota) celleSenzaDati++;
  await pausa(60);
} };
await Promise.all([operaio(), operaio(), operaio(), operaio()]);
// peggiori per primi; «null» = nessuna strada entro ~200 m
senza.sort((a, b) => (b.metri ?? 9999) - (a.metri ?? 9999));
const elencoZone = [...zone.values()].map(z => {
  const giudicati = z.n - z.senzaDati;
  // voto: quota di gemme con la strada vicina; una zona senza dati stradali vale 0; senza le extra perde 15 punti
  const base = giudicati > 0 ? ((giudicati - z.senza) / z.n) * 100 : 0;
  return { ...z, voto: Math.max(0, Math.round(base - (z.conExtra < z.n * 0.5 ? 15 : 0))) };
});
async function salva(chiave, dati) {
  const r = await fetch(`${URL_BASE}/rest/v1/api_cache`, {
    method: 'POST',
    headers: { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ cache_key: chiave, content_type: chiave, text_content: JSON.stringify({ ...dati, _salvatoIl: new Date().toISOString() }), audio_url: null }),
  });
  console.error(`${chiave}: ${r.status}`);
}
await salva('luoghi_senza_strada', { soglia: SOGLIA_M, controllati: letti, totale: senza.length, luoghi: senza.slice(0, 1500) });
await salva('voto_zone', { zone: elencoZone, celleSenzaDati });
console.error(`fine: ${letti} gemme, ${senza.length} senza strada entro ${SOGLIA_M} m, ${celleSenzaDati} celle senza dati stradali, ${elencoZone.length} zone`);
