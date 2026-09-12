#!/usr/bin/env node
/**
 * GUIDE E PIANTE IN PDF → IMMAGINI + TESTO (12/09/2026, committente: «la
 * piantina se è in PDF va estrapolata ed usata»; «se ci sono sul sito
 * delle guide in PDF usiamole sia per la pianta che le stanze, le
 * informazioni, i servizi»).
 * Per ogni riga fonti_poi (fonte 'mappa', tipo 'pdf') non ancora lavorata:
 *  - il TESTO di tutte le pagine (max 40) → riga fonte 'pdf' (sale, orari,
 *    servizi, percorso: la generazione legge da lì);
 *  - le prime pagine (max 6) disegnate a ~2000 px → PNG nel bucket «fonti»
 *    e righe fonti_poi tipo 'png' (dati.daPdf, dati.pagina); poi
 *    scripts/mappe-auto-pins.mjs decide con due modelli quali sono piante
 *    e mette i pin.
 * Motore: mupdf (WebAssembly): pdfjs + canvas nativo crashava (heap
 * corruption) su Windows.
 *
 *   node scripts/mappe-pdf-rasterizza.mjs            # tutte
 *   node scripts/mappe-pdf-rasterizza.mjs --poi wd-Q19675
 */
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

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
const SOLO_POI = (() => { const i = process.argv.indexOf('--poi'); return i > 0 ? process.argv[i + 1] : ''; })();
const RIFAI = process.argv.includes('--rifai');
const MAX_PAGINE_IMG = 6, MAX_PAGINE_TESTO = 40, LARGHEZZA = 2000;
process.on('uncaughtException', (e) => { console.error('ECCEZIONE:', String(e?.stack || e).slice(0, 400)); process.exit(2); });
process.on('unhandledRejection', (e) => { console.error('PROMESSA:', String(e?.stack || e).slice(0, 400)); process.exit(3); });

const righe = await (await fetch(`${SB}/rest/v1/fonti_poi?fonte=eq.mappa&dati->>tipo=eq.pdf&select=poi_id,chiave,url,titolo,dati,storage_path,attribuzione,licenza${SOLO_POI ? `&poi_id=eq.${encodeURIComponent(SOLO_POI)}` : ''}&order=poi_id`, { headers: H })).json();
if (!Array.isArray(righe)) { console.log('DB', JSON.stringify(righe).slice(0, 200)); process.exit(1); }
console.log('PDF da lavorare:', righe.length);
const stat = { pdf: 0, immagini: 0, testi: 0, byteTesto: 0, saltati: 0, errori: 0 };
for (const r of righe) {
  if (r?.dati?.rasterizzato && !RIFAI) { stat.saltati++; continue; }
  try {
    const src = await fetch(`${SB}/storage/v1/object/fonti/${r.storage_path}`, { headers: H });
    if (!src.ok) { console.log(`  ✗ ${r.poi_id}: PDF non letto (${src.status})`); stat.errori++; continue; }
    const buf = Buffer.from(await src.arrayBuffer());
    const doc = mupdf.Document.openDocument(buf, 'application/pdf');
    const nPag = doc.countPages();

    // 1. Testo
    const pezzi = [];
    for (let p = 0; p < Math.min(MAX_PAGINE_TESTO, nPag); p++) {
      try {
        const page = doc.loadPage(p);
        const t = page.toStructuredText('preserve-whitespace').asText().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (t.length > 40) pezzi.push(`— pagina ${p + 1} —\n${t}`);
        page.destroy?.();
      } catch { /* pagina illeggibile */ }
    }
    const testo = pezzi.join('\n\n').replace(/ /g, '').slice(0, 120000);
    if (testo.length > 300) {
      const rigaTesto = { poi_id: r.poi_id, fonte: 'pdf', lingua: '', chiave: r.chiave, url: r.url, titolo: r.titolo || 'Guida in PDF', testo, dati: { pagine: nPag, paginaUfficiale: r?.dati?.paginaUfficiale || null }, revisione: new Date().toISOString().slice(0, 10), licenza: r.licenza || 'Sito ufficiale, tutti i diritti riservati: solo come fonte di fatti', attribuzione: r.attribuzione || null, byte: Buffer.byteLength(testo) };
      const ins = await fetch(`${SB}/rest/v1/fonti_poi?on_conflict=poi_id,fonte,lingua,chiave`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rigaTesto) });
      if (ins.ok) { stat.testi++; stat.byteTesto += Buffer.byteLength(testo); } else console.log(`  ✗ ${r.poi_id}: testo (${ins.status}) ${(await ins.text()).slice(0, 100)}`);
    }

    // 2. Immagini delle prime pagine
    let fatte = 0;
    for (let p = 0; p < Math.min(MAX_PAGINE_IMG, nPag); p++) {
      try {
        const page = doc.loadPage(p);
        const [x0, y0, x1, y1] = page.getBounds();
        const scale = Math.min(3, Math.max(1, LARGHEZZA / Math.max(1, x1 - x0)));
        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
        const png = Buffer.from(pix.asPNG());
        const w = pix.getWidth(), h = pix.getHeight();
        pix.destroy?.(); page.destroy?.();
        if (png.length < 15000) continue; // pagina bianca
        const dst = `${r.storage_path.replace(/\.pdf$/i, '')}-p${p + 1}.png`;
        const up = await fetch(`${SB}/storage/v1/object/fonti/${dst}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: png });
        if (!up.ok) { console.log(`  ✗ ${r.poi_id}: upload p${p + 1} (${up.status})`); stat.errori++; continue; }
        const riga = { poi_id: r.poi_id, fonte: 'mappa', lingua: '', chiave: `${r.chiave}#p${p + 1}`, url: r.url, titolo: `${r.titolo || 'Mappa del museo'} · pagina ${p + 1}`, dati: { tipo: 'png', daPdf: r.chiave, pagina: p + 1, paginaUfficiale: r?.dati?.paginaUfficiale || null, larghezza: w, altezza: h }, storage_path: dst, revisione: new Date().toISOString().slice(0, 10), licenza: r.licenza || 'Sito ufficiale, tutti i diritti riservati: si rimanda alla pagina ufficiale', attribuzione: r.attribuzione || null, byte: png.length };
        const ins = await fetch(`${SB}/rest/v1/fonti_poi?on_conflict=poi_id,fonte,lingua,chiave`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(riga) });
        if (!ins.ok) { console.log(`  ✗ ${r.poi_id}: riga p${p + 1} (${ins.status}) ${(await ins.text()).slice(0, 100)}`); stat.errori++; continue; }
        fatte++; stat.immagini++;
      } catch (e) { console.log(`     p${p + 1}: ${String(e?.message || e).slice(0, 100)}`); }
    }
    await fetch(`${SB}/rest/v1/fonti_poi?poi_id=eq.${encodeURIComponent(r.poi_id)}&fonte=eq.mappa&chiave=eq.${encodeURIComponent(r.chiave)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ dati: { ...(r.dati || {}), rasterizzato: true, pagineTotali: nPag, pagineFatte: fatte } }) });
    stat.pdf++;
    console.log(`  ✓ ${r.poi_id}: «${r.chiave.slice(-50)}» ${nPag} pagine → ${fatte} immagini, testo ${Math.round(testo.length / 1024)} kB`);
    doc.destroy?.();
  } catch (e) {
    stat.errori++; console.log(`  ✗ ${r.poi_id}: ${String(e?.message || e).slice(0, 140)}`);
  }
}
console.log('\nRIEPILOGO', JSON.stringify(stat));
