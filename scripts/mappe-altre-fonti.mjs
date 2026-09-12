#!/usr/bin/env node
/**
 * PIANTE DA ALTRE FONTI (12/09/2026, committente: «le mappe non si possono
 * trovare anche in altri siti? usiamo tutti i siti / mezzi»). Per ogni
 * museo della lista (o della libreria) SENZA una pianta verificata:
 *  1. Wikidata P3311 «immagine della pianta» → file Commons;
 *  2. Wikimedia Commons: categoria «Floor plans of <museo>» / ricerca
 *     «<museo> floor plan|plan|map» fra i file (con licenza e autore);
 *  3. Wayback Machine: l'ultima copia salvata della pagina «mappa/plan»
 *     del sito ufficiale e dei suoi PDF, per i siti che bloccano i bot
 *     (British, Prado, Orsay, Met, Getty, Ermitage…).
 * Tutto finisce in fonti_poi come fonte 'mappa' (tipo png/jpg/pdf, dati.
 * origine = wikidata|commons|wayback) e poi passa dalla stessa verifica a
 * due modelli di scripts/mappe-auto-pins.mjs (e dalla rasterizzazione per
 * i PDF). Mai una pianta accettata senza verifica.
 *
 *   node scripts/mappe-altre-fonti.mjs --lista scratch/top100-musei.json
 *   node scripts/mappe-altre-fonti.mjs --poi wd-Q6373
 */
import fs from 'fs';
import path from 'path';

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const SB = env.VITE_SUPABASE_URL || env.SUPABASE_URL; const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const UA = { 'User-Agent': 'WorldInPocket/1.0 (support@wip.guide)' };
const LISTA = (() => { const i = process.argv.indexOf('--lista'); return i > 0 ? process.argv[i + 1] : ''; })();
const SOLO_POI = (() => { const i = process.argv.indexOf('--poi'); return i > 0 ? process.argv[i + 1] : ''; })();
const dormi = ms => new Promise(x => setTimeout(x, ms));
const getJson = async (u, h = UA) => { const r = await fetch(u, { headers: h }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.json(); };
const MAX_FILE = 12 * 1024 * 1024;

async function salvaRiga(riga) {
  for (const k of ['testo', 'titolo', 'chiave', 'attribuzione']) if (typeof riga[k] === 'string') riga[k] = riga[k].replace(/ /g, '');
  const r = await fetch(`${SB}/rest/v1/fonti_poi?on_conflict=poi_id,fonte,lingua,chiave`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(riga) });
  if (!r.ok) throw new Error(`fonti_poi ${r.status} ${(await r.text()).slice(0, 160)}`);
}
async function scaricaSuStorage(url, pathStorage, h = UA) {
  const r = await fetch(url, { headers: h, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000 || buf.length > MAX_FILE) return null;
  const up = await fetch(`${SB}/storage/v1/object/fonti/${pathStorage}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': ct || 'application/octet-stream', 'x-upsert': 'true' }, body: buf });
  if (!up.ok) return null;
  return { byte: buf.length, ct };
}
const tipoDa = (nome, ct = '') => { const m = String(nome).match(/\.(pdf|png|jpe?g|webp|svg)(\?|$)/i); const t = (m?.[1] || (ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : ct.includes('svg') ? 'svg' : '')).toLowerCase(); return t === 'jpeg' ? 'jpg' : t; };

/** Commons: info file (URL 2000 px, licenza, autore). */
async function infoCommons(file) {
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata|sha1|size|mime&iiurlwidth=2000&titles=File:${encodeURIComponent(file)}&format=json`);
  const p = Object.values(j.query?.pages || {})[0]; const ii = p?.imageinfo?.[0]; if (!ii) return null;
  const x = ii.extmetadata || {}; const pulisci = s => String(s || '').replace(/<[^>]+>/g, '').trim();
  return { file, url: ii.mime === 'application/pdf' ? ii.url : (ii.thumburl || ii.url), mime: ii.mime, sha1: ii.sha1, licenza: pulisci(x.LicenseShortName?.value) || pulisci(x.License?.value), autore: pulisci(x.Artist?.value) || pulisci(x.Credit?.value), pagina: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` };
}
async function candidatiCommons(qid, nomi) {
  const out = new Map();
  // 1. P3311 (plan view image) e P1846 (distribution map, no) — solo P3311.
  try {
    const e = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P3311&format=json`);
    for (const c of (e.claims?.P3311 || [])) { const f = c.mainsnak?.datavalue?.value; if (f) out.set(f, 'wikidata-P3311'); }
  } catch {}
  // 2. Categoria «Floor plans of X» e ricerca file.
  for (const nome of nomi.slice(0, 2)) {
    for (const cat of [`Floor plans of the ${nome}`, `Floor plans of ${nome}`, `Maps of the ${nome}`, `Maps of ${nome}`, `Plans of ${nome}`]) {
      try {
        const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmtype=file&cmlimit=20&format=json`);
        for (const m of (j.query?.categorymembers || [])) out.set(String(m.title).replace(/^File:/, ''), `commons-cat:${cat}`);
      } catch {}
      await dormi(120);
    }
    try {
      const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent(`"${nome}" (floor plan OR floorplan OR "plan of" OR planimetria OR pianta OR plano OR grundriss)`)}&format=json`);
      for (const m of (j.query?.search || [])) { const t = String(m.title).replace(/^File:/, ''); if (/plan|pianta|planimetr|map|karte|grundriss/i.test(t)) out.set(t, 'commons-search'); }
    } catch {}
  }
  return out;
}
/** Wayback: ultima copia della pagina o del PDF. */
async function wayback(url) {
  try {
    const j = await getJson(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    const s = j?.archived_snapshots?.closest; if (s?.available && s.url) return s.url.replace(/^http:/, 'https:');
  } catch {}
  return null;
}
async function candidatiWayback(sito) {
  const out = [];
  let home; try { home = new URL(sito); } catch { return out; }
  // Le pagine tipiche della pianta, nelle lingue dei grandi musei.
  const percorsi = ['/visit/museum-map', '/visit/map', '/visit/floor-plans', '/visit/floorplans', '/plan', '/plans', '/map', '/maps', '/visite/plan', '/en/visit/map', '/en/plan-your-visit', '/visita/mapa', '/visita/plano', '/en/visita/mapa', '/visit/plan-your-visit', '/floor-plan', '/floorplan', '/en/map', '/en/visit/museum-map'];
  for (const p of percorsi) {
    const snap = await wayback(home.origin + p); if (!snap) continue;
    try {
      const r = await fetch(snap, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const html = await r.text();
      // I file di pianta linkati nella copia (URL riscritti da Wayback: /web/<ts>/<orig>)
      for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+\.(?:pdf|png|jpe?g|svg|webp))(?:\?[^"']*)?["']/gi)) {
        let u = m[1]; if (u.startsWith('//')) u = 'https:' + u; else if (u.startsWith('/web/')) u = 'https://web.archive.org' + u;
        if (!/plan|map|mapp|pianta|floor|piano|level|guide|guida|brochure|visitor/i.test(u)) continue;
        if (!out.some(x => x.url === u)) out.push({ url: u, pagina: snap });
      }
    } catch {}
    if (out.length >= 6) break;
    await dormi(300);
  }
  return out.slice(0, 6);
}

// Lista di lavoro
let musei = [];
if (LISTA) musei = JSON.parse(fs.readFileSync(LISTA, 'utf8')).map(x => ({ poiId: `wd-${x.qid}`, qid: x.qid, nome: x.nome, sito: x.sito || null }));
else {
  const lib = await (await fetch(`${SB}/rest/v1/museum_guides?select=venue_key,venue_name,poi_id,official_site,source&order=venue_key`, { headers: H })).json();
  const visti = new Set();
  for (const r of lib) { const k = r.poi_id || r.venue_key; if (visti.has(k)) continue; visti.add(k); musei.push({ poiId: k, qid: String(k).match(/-(Q\d+)$/)?.[1] || null, nome: r.venue_name, sito: r.official_site || null }); }
}
if (SOLO_POI) musei = musei.filter(m => m.poiId === SOLO_POI);
console.log('musei:', musei.length);
const stat = { musei: 0, giaConPianta: 0, commons: 0, wayback: 0, errori: 0 };
for (const m of musei) {
  try {
    // Ha già una pianta verificata (con lo stesso QID, qualunque prefisso)?
    const filtro = m.qid ? `poi_id=like.*-${m.qid}` : `poi_id=eq.${encodeURIComponent(m.poiId)}`;
    const gia = await (await fetch(`${SB}/rest/v1/fonti_poi?${filtro}&fonte=eq.mappa&dati->>verificataMappa=eq.true&dati->>nonMappa=eq.false&select=chiave&limit=1`, { headers: H })).json();
    if (Array.isArray(gia) && gia.length) { stat.giaConPianta++; continue; }
    stat.musei++;
    let nuove = 0;
    // Nomi in en e nella lingua locale per Commons
    const nomi = [m.nome];
    if (m.qid) { try { const e = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${m.qid}&props=labels&languages=en|it|fr|es|de&format=json`); const l = e.entities?.[m.qid]?.labels || {}; for (const k of ['en', 'fr', 'es', 'de', 'it']) if (l[k]?.value && !nomi.includes(l[k].value)) nomi.push(l[k].value); } catch {} }
    // A) Commons / Wikidata
    if (m.qid) {
      const cand = await candidatiCommons(m.qid, nomi);
      let i = 0;
      for (const [file, origine] of cand) {
        if (i >= 5) break;
        const info = await infoCommons(file).catch(() => null); if (!info || !info.licenza) continue;
        const tipo = tipoDa(file, info.mime); if (!tipo) continue;
        const dst = `musei/${m.poiId.replace(/[^A-Za-z0-9_-]/g, '_')}/commons-${info.sha1.slice(0, 10)}.${tipo}`;
        const s = await scaricaSuStorage(info.url, dst); if (!s) continue;
        await salvaRiga({ poi_id: m.poiId, fonte: 'mappa', lingua: '', chiave: `commons:${file}`.slice(0, 500), url: info.pagina, titolo: `Pianta da Commons (${tipo})`, dati: { tipo, origine, paginaUfficiale: info.pagina }, storage_path: dst, revisione: info.sha1, licenza: info.licenza, attribuzione: info.autore || 'Wikimedia Commons', byte: s.byte });
        i++; nuove++; stat.commons++;
        await dormi(200);
      }
    }
    // B) Wayback del sito ufficiale (solo se il sito c'è)
    if (m.sito) {
      const cand = await candidatiWayback(m.sito);
      let i = 0;
      for (const c of cand) {
        if (i >= 4) break;
        const tipo = tipoDa(c.url); if (!tipo) continue;
        const dst = `musei/${m.poiId.replace(/[^A-Za-z0-9_-]/g, '_')}/wayback-${i + 1}.${tipo}`;
        const s = await scaricaSuStorage(c.url, dst); if (!s) continue;
        await salvaRiga({ poi_id: m.poiId, fonte: 'mappa', lingua: '', chiave: c.url.slice(0, 500), url: c.url, titolo: `Mappa del museo (${tipo}, copia Wayback)`, dati: { tipo, origine: 'wayback', paginaUfficiale: c.pagina }, storage_path: dst, revisione: new Date().toISOString().slice(0, 10), licenza: 'Sito ufficiale (copia Internet Archive), tutti i diritti riservati: si rimanda alla pagina ufficiale', attribuzione: new URL(m.sito).hostname, byte: s.byte });
        i++; nuove++; stat.wayback++;
        await dormi(300);
      }
    }
    console.log(`  ${nuove ? '✓' : '–'} ${m.nome}: ${nuove} candidate nuove`);
  } catch (e) { stat.errori++; console.log(`  ✗ ${m.nome}: ${String(e?.message || e).slice(0, 120)}`); }
}
console.log('\nRIEPILOGO', JSON.stringify(stat));
