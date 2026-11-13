// ROAD TILES «EXTRA» (03/10/2026): le classi di strada che generate_road_tiles.py non aveva estratto
// (service, cycleway, road, corridor, platform, bridleway). Senza di esse la rete su cui si misura la
// distanza di strada è a pezzi nei centri storici: Roma centro, 10 coppie di punti su 20 contro 23 su 24
// con la rete completa (scratch/collaudo-distanza-strada-vera.mts e -rete-completa.mts).
//
// NON si rigenerano le 1,6 milioni di tile esistenti: si AGGIUNGE un terzo file per cella,
// x{gx}_y{gy}_extra.json.gz, stessa griglia (0,05°) e stesso formato (FeatureCollection di LineString
// con properties.class). /api/roads/tile lo legge accanto a _car e _foot.
//
// Due passi, perché il mondo non sta in memoria:
//   1) node strade-extra-celle.mjs spezza <file.geojsonseq> <cartella-pezzi>
//        (uscita di `osmium export -f geojsonseq`): ogni via → una riga nel pezzo da 1°×1° che la contiene.
//        Si può chiamare più volte (un continente alla volta): i pezzi si accodano.
//   2) node strade-extra-celle.mjs celle <cartella-pezzi> <cartella-tile>
//        ogni pezzo → fino a 400 tile .json.gz. Le vie doppie (estratti che si sovrappongono al
//        confine) si tolgono per id.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const PASSO = 0.05;
const TOLLERANZA = 0.00005; // come generate_road_tiles.py (SIMPLIFICATION_TOLERANCE)
const CLASSI = new Set(['service', 'cycleway', 'road', 'corridor', 'platform', 'bridleway']);

// Douglas-Peucker in gradi, iterativo (vie lunghe: niente ricorsione profonda).
function semplifica(pts, tol) {
  if (pts.length <= 2) return pts;
  const tieni = new Uint8Array(pts.length); tieni[0] = 1; tieni[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    if (b <= a + 1) continue;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, l2 = dx * dx + dy * dy;
    let max = -1, iMax = -1;
    for (let i = a + 1; i < b; i++) {
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / l2));
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      if (d > max) { max = d; iMax = i; }
    }
    if (max > tol) { tieni[iMax] = 1; pila.push([a, iMax], [iMax, b]); }
  }
  return pts.filter((_, i) => tieni[i]);
}
const cella = (v) => (Math.floor(v / PASSO) * PASSO).toFixed(2);
const r6 = (v) => Math.round(v * 1e6) / 1e6;

async function spezza(file, dirPezzi) {
  fs.mkdirSync(dirPezzi, { recursive: true });
  const code = new Map(); let inCoda = 0, lette = 0, tenute = 0;
  const scarica = () => { for (const [k, righe] of code) fs.appendFileSync(path.join(dirPezzi, k + '.ndjson'), righe.join('')); code.clear(); inCoda = 0; };
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (let riga of rl) {
    if (riga.charCodeAt(0) === 0x1e) riga = riga.slice(1);
    if (riga.length < 20) continue;
    lette++;
    let f; try { f = JSON.parse(riga); } catch { continue; }
    const g = f.geometry; const classe = f.properties?.highway;
    if (!g || g.type !== 'LineString' || !CLASSI.has(classe)) continue;
    // niente strade private o chiuse al pubblico: non sono percorribili
    const accesso = f.properties?.access;
    if (accesso === 'private' || accesso === 'no') continue;
    const pts = semplifica(g.coordinates, TOLLERANZA).map(([x, y]) => [r6(x), r6(y)]);
    if (pts.length < 2) continue;
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const [x, y] of g.coordinates) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const pezzo = `${Math.floor(cx)}_${Math.floor(cy)}`;
    const id = f.id ?? f.properties?.['@id'] ?? `${pts[0][0]},${pts[0][1]},${pts.length}`;
    const voce = JSON.stringify([`x${cella(cx)}_y${cella(cy)}`, String(id), classe, pts]) + '\n';
    const arr = code.get(pezzo); if (arr) arr.push(voce); else code.set(pezzo, [voce]);
    tenute++;
    if (++inCoda >= 200_000) scarica();
    if (lette % 1_000_000 === 0) console.error(`  ${lette} lette, ${tenute} tenute`);
  }
  scarica();
  console.error(`spezza: ${lette} vie lette, ${tenute} tenute → ${fs.readdirSync(dirPezzi).length} pezzi`);
}

async function celle(dirPezzi, dirTile) {
  fs.mkdirSync(dirTile, { recursive: true });
  let tile = 0, vie = 0, doppie = 0;
  for (const nome of fs.readdirSync(dirPezzi).filter(n => n.endsWith('.ndjson'))) {
    const perCella = new Map(); const visti = new Set();
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(dirPezzi, nome)), crlfDelay: Infinity });
    for await (const riga of rl) {
      if (!riga) continue;
      let v; try { v = JSON.parse(riga); } catch { continue; }
      const [c, id, classe, pts] = v;
      const chiave = c + '|' + id;
      if (visti.has(chiave)) { doppie++; continue; }
      visti.add(chiave);
      const f = { type: 'Feature', properties: { id, class: classe }, geometry: { type: 'LineString', coordinates: pts } };
      const arr = perCella.get(c); if (arr) arr.push(f); else perCella.set(c, [f]);
      vie++;
    }
    for (const [c, features] of perCella) {
      fs.writeFileSync(path.join(dirTile, `${c}_extra.json.gz`), zlib.gzipSync(JSON.stringify({ type: 'FeatureCollection', features }), { level: 9 }));
      tile++;
    }
  }
  console.error(`celle: ${tile} tile, ${vie} vie, ${doppie} doppie scartate`);
}

const [modo, a, b] = process.argv.slice(2);
if (modo === 'spezza' && a && b) await spezza(a, b);
else if (modo === 'celle' && a && b) await celle(a, b);
else { console.error('uso: spezza <file.geojsonseq> <cartella-pezzi> | celle <cartella-pezzi> <cartella-tile>'); process.exit(2); }
