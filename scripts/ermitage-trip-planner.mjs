#!/usr/bin/env node
/**
 * ERMITAGE: PIANTE UFFICIALI E SALE POSIZIONATE (12/09/2026 sera, il
 * committente ha indicato hermitagemuseum.org/trip-planner-map-view).
 * La pagina carica per piano (POST /api/other/load/trip-planner, campo
 * «floor» 1-3) un'immagine della pianta e un HTML con una <canvas> per sala,
 * id «TP_B<edificio>_F<piano>_H<sala>» e posizione in pixel (style top/left/
 * width/height): 67 + 151 + 77 = 295 sale, con il titolo della sala.
 * Qui si scaricano le tre piante nel bucket «mappe» (wd-Q132783/mappa-N.jpg)
 * e si scrivono in mappe_museo con UN PIN PER SALA (sala = numero, etichetta =
 * titolo), origine 'sito', pins_origine 'ufficiale' (l'admin non li rifà).
 * In fonti_poi resta la riga 'mappa' verificata (è la pianta ufficiale).
 *
 * Dal PC di sviluppo i domini dell'Ermitage non rispondono (blocco di rete):
 * si lancia dal droplet. Uso: node scripts/ermitage-trip-planner.mjs
 */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join(process.cwd(), f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const SB = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Accept-Language': 'en' };
const BASE = 'https://www.hermitagemuseum.org';
const POI = 'wd-Q132783';

// Dimensioni JPEG senza librerie (marker SOF).
function dimJpeg(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: 0, h: 0 };
}

const piani = [];
for (const f of ['1', '2', '3']) {
  const fd = new FormData(); fd.append('floor', f); fd.append('lng', 'en');
  const j = await (await fetch(`${BASE}/api/other/load/trip-planner`, { method: 'POST', body: fd, headers: UA, signal: AbortSignal.timeout(30000) })).json();
  const d = j?.data?.floorData || {};
  if (!d.img) { console.log(`piano ${f}: nessun dato`); continue; }
  const img = Buffer.from(await (await fetch(BASE + d.img, { headers: UA, signal: AbortSignal.timeout(30000) })).arrayBuffer());
  const dim = dimJpeg(img);
  const sale = [];
  for (const m of String(d.points || '').matchAll(/<canvas[^>]*id="TP_B(\d+)_F(\d+)_H([A-Za-z0-9]+)"[^>]*>/g)) {
    const tag = m[0];
    const g = k => { const mm = new RegExp(`${k}:\\s*(-?[\\d.]+)px`).exec(tag); return mm ? +mm[1] : null; };
    const titolo = (tag.match(/title="([^"]*)"/) || [])[1] || '';
    const w = g('width') || 30, h = g('height') || 30;
    sale.push({ edificio: m[1], sala: m[3], x: +(((g('left') || 0) + w / 2) / dim.w).toFixed(4), y: +(((g('top') || 0) + h / 2) / dim.h).toFixed(4), titolo: titolo.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") });
  }
  piani.push({ piano: +f, img: BASE + d.img, dim, byte: img.length, sale, buf: img });
  console.log(`piano ${f}: ${dim.w}x${dim.h}, ${img.length} byte, ${sale.length} sale`);
}
fs.writeFileSync('ermitage-sale.json', JSON.stringify(piani.map(({ buf, ...p }) => p), null, 1));

// Bucket pubblico «mappe»
const b = await fetch(`${SB}/storage/v1/bucket/mappe`, { headers: H });
if (!b.ok) await fetch(`${SB}/storage/v1/bucket`, { method: 'POST', headers: H, body: JSON.stringify({ id: 'mappe', name: 'mappe', public: true }) });

for (const p of piani) {
  const dst = `${POI}/mappa-${p.piano}.jpg`;
  const up = await fetch(`${SB}/storage/v1/object/mappe/${dst}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: p.buf });
  console.log(`pianta ${p.piano} su Storage:`, up.status);
  const fonteDst = `musei/${POI}/trip-planner-${p.piano}.jpg`;
  await fetch(`${SB}/storage/v1/object/fonti/${fonteDst}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: p.buf });
  await fetch(`${SB}/rest/v1/fonti_poi?on_conflict=poi_id,fonte,lingua,chiave`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ poi_id: POI, fonte: 'mappa', lingua: '', chiave: p.img.slice(0, 500), url: p.img, titolo: `Pianta ufficiale piano ${p.piano} (trip planner)`, dati: { tipo: 'jpg', origine: 'sito', paginaUfficiale: `${BASE}/trip-planner-map-view`, verificataMappa: true, nonMappa: false, motivo: 'pianta ufficiale del trip planner con le sale posizionate', piani: 1, larghezza: p.dim.w, altezza: p.dim.h }, storage_path: fonteDst, revisione: new Date().toISOString().slice(0, 10), licenza: 'Sito ufficiale, tutti i diritti riservati: si rimanda alla pagina ufficiale', attribuzione: 'hermitagemuseum.org', byte: p.byte, recuperato_at: new Date().toISOString() }) });
  const pins = p.sale.filter(s => s.x > 0.005 && s.y > 0.005 && s.x < 0.995 && s.y < 0.995).map(s => ({ sala: s.sala, x: s.x, y: s.y, origine: 'admin', concordi: true, etichetta: (s.titolo ? `${s.sala} · ${s.titolo}` : `Room ${s.sala}`).slice(0, 80) }));
  const riga = { poi_id: POI, indice: p.piano, titolo: `Piano ${p.piano}`, storage_path: dst, url: `${SB}/storage/v1/object/public/mappe/${dst}`, fonte_url: `${BASE}/trip-planner-map-view`, origine: 'sito', larghezza: p.dim.w, altezza: p.dim.h, pins, pins_origine: 'admin', aggiornato_at: new Date().toISOString() };
  const r = await fetch(`${SB}/rest/v1/mappe_museo?on_conflict=poi_id,indice`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(riga) });
  console.log(`mappe_museo piano ${p.piano}:`, r.status, `${pins.length} pin`);
}
console.log('fatto: ermitage-sale.json scritto, piante e pin in DB');
