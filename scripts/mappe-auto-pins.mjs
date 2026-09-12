#!/usr/bin/env node
/**
 * PIN SULLE PIANTE (12/09/2026). Per ogni museo con piante in fonti_poi
 * (fonte 'mappa', PNG/JPG/WEBP) e una guida in museum_guides:
 *  1. copia la pianta sul bucket pubblico «mappe» e crea la riga mappe_museo
 *     (stessa logica della rotta GET /api/museums/map);
 *  2. chiede a Gemini dove stanno le sale della guida sulla pianta
 *     (stessa logica di POST /api/admin/museums/map/auto-pins);
 *  3. salva i pin (origine 'ai'); l'admin li corregge dal pannello.
 * Rilanciabile: salta le piante che hanno già pin admin; rifà quelle 'ai'
 * solo con --rifai.
 */
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

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
const RIFAI = process.argv.includes('--rifai');
const SOLO_POI = (() => { const i = process.argv.indexOf('--poi'); return i > 0 ? process.argv[i + 1] : ''; })();
const geminiKeys = ['GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4'].map(k => env[k]).filter(Boolean);
if (!geminiKeys.length) { console.error('Nessuna GEMINI_API_KEY nel .env'); process.exit(1); }
const clients = geminiKeys.map(k => new GoogleGenAI({ apiKey: k }));
let giro = 0;
const dormi = ms => new Promise(x => setTimeout(x, ms));
const jsonDa = (raw) => { try { const s = String(raw || ''); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { return null; } };
/** Gemini con immagine, provando le chiavi a turno. */
async function chiediGemini(testo, mime, b64) {
  for (let t = 0; t < clients.length; t++) {
    const client = clients[(giro++) % clients.length];
    try {
      const res = await client.models.generateContent({ model: 'gemini-3.5-flash-lite', contents: [{ role: 'user', parts: [{ text: testo }, { inlineData: { mimeType: mime, data: b64 } }] }], config: { responseMimeType: 'application/json' } });
      const j = jsonDa(res?.text); if (j) return j;
    } catch (e) { console.log(`     gemini (chiave ${t + 1}): ${String(e?.message || e).slice(0, 100)}`); await dormi(2000); }
  }
  return null;
}
/** GPT-4o-mini con immagine (secondo occhio, motore diverso). */
async function chiediOpenai(testo, mime, b64, modello = 'gpt-4o-mini') {
  if (!env.OPENAI_API_KEY) return null;
  // Sul 429 si aspetta e si riprova (12/09: due piante vere, Città Proibita
  // e National Gallery, erano state SCARTATE perché OpenAI aveva risposto
  // «rate limit» e il silenzio contava come un no).
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modello, temperature: 0, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: testo }, { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } }] }] }) });
      if (r.status === 429 || r.status >= 500) { console.log(`     openai: ${r.status}, riprovo fra ${20 * (t + 1)} s`); await dormi(20000 * (t + 1)); continue; }
      if (!r.ok) { console.log(`     openai: ${r.status} ${(await r.text()).slice(0, 100)}`); return null; }
      const j = await r.json(); return jsonDa(j?.choices?.[0]?.message?.content);
    } catch (e) { console.log(`     openai: ${String(e?.message || e).slice(0, 100)}`); await dormi(5000); }
  }
  return null;
}

async function bucketPubblico() {
  const r = await fetch(`${SB}/storage/v1/bucket/mappe`, { headers: H });
  if (r.ok) return;
  const c = await fetch(`${SB}/storage/v1/bucket`, { method: 'POST', headers: H, body: JSON.stringify({ id: 'mappe', name: 'mappe', public: true }) });
  console.log('bucket mappe', c.status);
}
await bucketPubblico();

// Musei con piante-immagine
const f = await (await fetch(`${SB}/rest/v1/fonti_poi?fonte=eq.mappa&select=poi_id,chiave,url,titolo,dati,storage_path&order=poi_id,recuperato_at`, { headers: H })).json();
const perPoi = new Map();
for (const r of f) { const tipo = String(r?.dati?.tipo || '').toLowerCase(); if (!['png', 'jpg', 'jpeg', 'webp'].includes(tipo)) continue; if (SOLO_POI && r.poi_id !== SOLO_POI) continue; if (!perPoi.has(r.poi_id)) perPoi.set(r.poi_id, []); perPoi.get(r.poi_id).push({ ...r, tipo }); }
console.log('musei con piante immagine:', perPoi.size);

const stat = { piante: 0, conPin: 0, senzaGuida: 0, errori: 0 };
for (const [poiId, piante] of perPoi) {
  // La guida (sale da trovare), in tutte le lingue
  // Per poi_id O per venue_key: le guide «nome_…» (Louvre, Colosseo, MoMA)
  // non hanno poi_id e in fonti_poi stanno sotto la loro venue_key.
  // …e per QID: lo stesso museo sta in libreria come wv-Q180788 (registro
  // Wikivoyage) e in fonti_poi come wd-Q180788 (lista dei 100).
  const qidDi = String(poiId).match(/-(Q\d+)$/)?.[1];
  const orGuida = [`poi_id.eq.${encodeURIComponent(poiId)}`, `venue_key.eq.${encodeURIComponent(poiId)}`, `venue_key.eq.${encodeURIComponent('poi_' + poiId)}`, ...(qidDi ? [`poi_id.like.*-${qidDi}`] : [])].join(',');
  const g = await (await fetch(`${SB}/rest/v1/museum_guides?or=(${orGuida})&select=venue_name,language,guide&limit=8`, { headers: H })).json();
  const sale = new Set();
  for (const x of (Array.isArray(g) ? g : [])) for (const tp of (x?.guide?.tappe || [])) { const d = String(tp?.dove || '').trim(); if (d && !tp.soloCollezione) sale.add(d); }
  const nome = g?.[0]?.venue_name || poiId;
  if (!sale.size) { stat.senzaGuida++; console.log(`  – ${nome}: nessuna guida con sale, salto`); continue; }
  // Righe mappe_museo esistenti
  const esistenti = await (await fetch(`${SB}/rest/v1/mappe_museo?poi_id=eq.${encodeURIComponent(poiId)}&select=*&order=indice`, { headers: H })).json();
  let indice = 0;
  for (const p of piante.slice(0, 6)) {
    // Bocciata per davvero (due modelli) → si salta; bocciata solo perché un
    // modello era muto → si riverifica sotto.
    if (p?.dati?.nonMappa && !/(openai|gemini): -/.test(String(p?.dati?.motivo || ''))) continue;
    // È DAVVERO UNA PIANTA? (12/09/2026: agli Uffizi la «mappa» era un
    // dettaglio della Venere di Botticelli preso dalla home perché l'URL
    // conteneva «map»). Prima di tutto il modello guarda l'immagine: se non
    // è una planimetria/mappa dell'edificio si scarta e si segna la fonte.
    // --riverifica: ripassa anche le piante già accettate da un modello solo
    // (prima del 12/09 pomeriggio il sì era di Gemini soltanto).
    // Da riverificare: mai verificata; oppure verificata da un modello solo;
    // oppure «bocciata» solo perché l'altro modello era muto («openai: -»).
    const mutoPrima = /(openai|gemini): -/.test(String(p?.dati?.motivo || ''));
    if (!p?.dati?.verificataMappa || mutoPrima || (process.argv.includes('--riverifica') && !p?.dati?.disaccordo && p?.dati?.motivo && !String(p.dati.motivo).includes('openai'))) {
      const src = await fetch(`${SB}/storage/v1/object/fonti/${p.storage_path}`, { headers: H });
      if (!src.ok) { console.log(`  ✗ ${nome}: file ${p.storage_path} non letto (${src.status})`); stat.errori++; continue; }
      const mimeSrc = (src.headers.get('content-type') || 'image/png').split(';')[0];
      const b64src = Buffer.from(await src.arrayBuffer()).toString('base64');
      // DUE MODELLI VISION, un «sì» vale solo se lo firmano entrambi
      // (committente 12/09: «usa tutti i modelli per essere sicuro che sia
      // la mappa»; regola del progetto: un sì va firmato da un motore
      // diverso). Gemini + GPT-4o-mini; se uno dei due non risponde, si
      // resta nel dubbio e la pianta NON entra.
      const DOMANDA = 'Questa immagine è una PLANIMETRIA o MAPPA di un edificio/museo (pianta con sale, piani, percorso di visita, etichette o numeri delle sale)? Non vale una foto, una veduta esterna, una mappa geografica del quartiere o un logo. Rispondi SOLO con JSON: {"pianta": true|false, "motivo": "<10 parole>", "piani": <numero di piani disegnati o 0>}';
      const verdettoGemini = await chiediGemini(DOMANDA, mimeSrc, b64src);
      const verdettoOpenai = await chiediOpenai(DOMANDA, mimeSrc, b64src);
      // Un modello muto non è un «no»: la pianta resta INDECISA (non
      // verificata) e si riprova al giro dopo; non si scarta e non si mostra.
      if (!verdettoGemini || !verdettoOpenai) { console.log(`     «${p.chiave.slice(-40)}»: un modello non ha risposto, resta indecisa`); stat.indecise = (stat.indecise || 0) + 1; continue; }
      const siGemini = verdettoGemini?.pianta === true, siOpenai = verdettoOpenai?.pianta === true;
      const verdetto = { pianta: siGemini && siOpenai, motivo: `gemini: ${verdettoGemini?.motivo || '-'} | openai: ${verdettoOpenai?.motivo || '-'}`, piani: Number(verdettoGemini?.piani || verdettoOpenai?.piani) || 0, disaccordo: siGemini !== siOpenai };
      if (verdetto.disaccordo) console.log(`     disaccordo su «${p.chiave.slice(-40)}»: gemini ${siGemini}, openai ${siOpenai} → non entra`);
      const dati = { ...(p.dati || {}), verificataMappa: true, nonMappa: verdetto.pianta !== true, motivo: String(verdetto.motivo || '').slice(0, 200), piani: verdetto.piani, disaccordo: verdetto.disaccordo };
      await fetch(`${SB}/rest/v1/fonti_poi?poi_id=eq.${encodeURIComponent(poiId)}&fonte=eq.mappa&chiave=eq.${encodeURIComponent(p.chiave)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ dati }) });
      if (verdetto.pianta !== true) {
        console.log(`  ✗ ${nome}: «${p.chiave.slice(-50)}» NON è una pianta (${dati.motivo}), scartata`);
        // Se era già finita in mappe_museo, via (riga e file).
        const vecchia = (Array.isArray(esistenti) ? esistenti : []).find(r => r.indice === indice + 1 && r.storage_path);
        if (vecchia) {
          await fetch(`${SB}/rest/v1/mappe_museo?poi_id=eq.${encodeURIComponent(poiId)}&indice=eq.${vecchia.indice}`, { method: 'DELETE', headers: H });
          await fetch(`${SB}/storage/v1/object/mappe/${vecchia.storage_path}`, { method: 'DELETE', headers: H });
        }
        stat.scartate = (stat.scartate || 0) + 1;
        continue;
      }
    }
    indice++;
    let riga = (Array.isArray(esistenti) ? esistenti : []).find(r => r.indice === indice);
    if (!riga) {
      const est = p.tipo === 'jpeg' ? 'jpg' : p.tipo;
      const dst = `${poiId.replace(/[^A-Za-z0-9_-]/g, '_')}/mappa-${indice}.${est}`;
      const file = await fetch(`${SB}/storage/v1/object/fonti/${p.storage_path}`, { headers: H });
      if (!file.ok) { console.log(`  ✗ ${nome}: pianta ${indice} non letta da fonti (${file.status})`); stat.errori++; continue; }
      const buf = Buffer.from(await file.arrayBuffer());
      const up = await fetch(`${SB}/storage/v1/object/mappe/${dst}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': file.headers.get('content-type') || `image/${est === 'jpg' ? 'jpeg' : est}`, 'x-upsert': 'true' }, body: buf });
      if (!up.ok) { console.log(`  ✗ ${nome}: copia su mappe fallita (${up.status})`); stat.errori++; continue; }
      riga = { poi_id: poiId, indice, titolo: p.titolo || null, storage_path: dst, url: `${SB}/storage/v1/object/public/mappe/${dst}`, fonte_url: p?.dati?.paginaUfficiale || p.url || null, origine: 'sito', pins: [], pins_origine: null };
      const ins = await fetch(`${SB}/rest/v1/mappe_museo?on_conflict=poi_id,indice`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(riga) });
      if (!ins.ok) { console.log(`  ✗ ${nome}: riga mappe_museo (${ins.status}) ${(await ins.text()).slice(0, 120)}`); stat.errori++; continue; }
    }
    stat.piante++;
    if (riga.pins_origine === 'admin') { console.log(`  = ${nome} pianta ${indice}: pin dell'admin, non tocco`); continue; }
    if (riga.pins_origine === 'ai' && !RIFAI) { console.log(`  = ${nome} pianta ${indice}: pin ai già presenti (${riga.pins.length})`); stat.conPin++; continue; }
    // Gemini: dove stanno le sale?
    const img = await fetch(riga.url); const mime = (img.headers.get('content-type') || 'image/png').split(';')[0];
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    const prompt = `Questa è la pianta (mappa) del museo «${nome}». Trova sulla pianta DOVE stanno queste sale/aree, leggendo le etichette e i numeri scritti sulla pianta: ${JSON.stringify([...sale])}.
Rispondi SOLO con JSON: {"pins":[{"sala":"<esattamente come nell'elenco>","x":0.00,"y":0.00,"trovata":true|false,"etichetta":"<testo letto sulla pianta>"}]}
x e y sono la posizione del CENTRO della sala in frazione della larghezza e dell'altezza dell'immagine (0-1, origine in alto a sinistra). Se una sala non è sulla pianta metti trovata=false e x=y=0. Non inventare posizioni: meglio trovata=false di un punto sbagliato.`;
    // I PIN da due modelli: un pin vale se entrambi mettono la sala nello
    // stesso punto (entro l'8% dell'immagine); se solo uno la trova, il pin
    // entra marcato «incerto» e l'admin lo conferma. Posizioni contrastanti
    // non entrano: meglio nessun pin di un pin sbagliato.
    const estrai = (parsed) => (Array.isArray(parsed?.pins) ? parsed.pins : []).filter(q => q && q.trovata !== false && Number.isFinite(Number(q.x)) && Number.isFinite(Number(q.y)) && sale.has(String(q.sala)))
      .map(q => ({ sala: String(q.sala), x: Math.min(1, Math.max(0, Number(q.x))), y: Math.min(1, Math.max(0, Number(q.y))), etichetta: String(q.etichetta || '').slice(0, 40) }));
    const [pg, po] = await Promise.all([chiediGemini(prompt, mime, b64), chiediOpenai(prompt, mime, b64)]);
    if (process.argv.includes('--debug')) console.log('     gemini:', JSON.stringify(pg).slice(0, 300), '\n     openai:', JSON.stringify(po).slice(0, 300));
    // Un pin sul BORDO dell'immagine (x o y a 0 o 1) è un modello che non
    // ha capito (Gemini metteva tutte le sale della National Gallery a
    // y=1,00): non vale.
    const sulBordo = (q) => q.x <= 0.02 || q.x >= 0.98 || q.y <= 0.02 || q.y >= 0.98;
    const pinG = estrai(pg).filter(q => !sulBordo(q)), pinO = estrai(po).filter(q => !sulBordo(q));
    // Terzo parere (gpt-4o, più forte) SOLO sui disaccordi: si chiede una
    // volta per pianta, per tutte le sale contese.
    let contese = [];
    for (const s of sale) { const a = pinG.find(q => q.sala === s), b = pinO.find(q => q.sala === s); if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 0.08) contese.push(s); }
    let pinT = [];
    if (contese.length) {
      const promptT = prompt.replace(JSON.stringify([...sale]), JSON.stringify(contese));
      const pt = await chiediOpenai(promptT, mime, b64, 'gpt-4o');
      pinT = estrai(pt).filter(q => !sulBordo(q));
    }
    let pins = [];
    for (const s of sale) {
      const a = pinG.find(q => q.sala === s), b = pinO.find(q => q.sala === s), c = pinT.find(q => q.sala === s);
      const vicini = (p, q) => p && q && Math.hypot(p.x - q.x, p.y - q.y) <= 0.08;
      if (vicini(a, b)) pins.push({ sala: s, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, origine: 'ai', concordi: true, etichetta: a.etichetta || b.etichetta });
      else if (c && (vicini(c, a) || vicini(c, b))) { const d = vicini(c, a) ? a : b; pins.push({ sala: s, x: (c.x + d.x) / 2, y: (c.y + d.y) / 2, origine: 'ai', concordi: true, terzoParere: true, etichetta: c.etichetta || d.etichetta }); }
      else if (a && b) console.log(`     «${s}»: tre pareri diversi (${a.x.toFixed(2)},${a.y.toFixed(2)}) (${b.x.toFixed(2)},${b.y.toFixed(2)})${c ? ` (${c.x.toFixed(2)},${c.y.toFixed(2)})` : ''} → fuori`);
      else if (a || b) pins.push({ ...(b || a), origine: 'ai', concordi: false, incerto: true });
    }
    const upd = await fetch(`${SB}/rest/v1/mappe_museo?poi_id=eq.${encodeURIComponent(poiId)}&indice=eq.${indice}`, { method: 'PATCH', headers: H, body: JSON.stringify({ pins, pins_origine: pins.length ? 'ai' : null, aggiornato_at: new Date().toISOString() }) });
    if (!upd.ok) { stat.errori++; console.log(`  ✗ ${nome}: salvataggio pin (${upd.status})`); continue; }
    if (pins.length) stat.conPin++;
    console.log(`  ✓ ${nome} pianta ${indice}: ${pins.length}/${sale.size} sale trovate${pins.length ? ' — ' + pins.slice(0, 4).map(q => `${q.sala}→(${q.x.toFixed(2)},${q.y.toFixed(2)})`).join(' ') : ''}`);
    await dormi(800);
  }
}
console.log('\nRIEPILOGO', JSON.stringify(stat));
