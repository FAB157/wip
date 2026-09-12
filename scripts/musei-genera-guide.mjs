#!/usr/bin/env node
/**
 * GUIDE COMPLETE DEI MUSEI PRIORITARI (12/09/2026, committente: «continua a
 * creare le guide dei 100 musei»). Per ogni museo di musei_prioritari (per
 * rango) SENZA una guida buona nella lingua richiesta (guida con almeno 8
 * tappe e almeno una sala), chiama la rotta di PRODUZIONE
 * POST /api/vision/venue-guide come script (x-script-secret): la rotta parte
 * dall'archivio fonti_poi (guida PDF ufficiale, sito, Wikivoyage), poi
 * Wikidata/Wikipedia, scrive «salaCodice» e salva in museum_guides.
 * Nessun pass, nessun credito, solo motori gratuiti: su ai_unavailable si
 * registra e si riprova al giro dopo. Idempotente, rilanciabile.
 *
 *   node scripts/musei-genera-guide.mjs --da 1 --a 100 --lingue IT,EN
 *   node scripts/musei-genera-guide.mjs --qid Q19675 --lingue IT
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const SEGRETO = env.SCRIPT_SHARED_SECRET;
if (!SEGRETO) { console.error('Manca SCRIPT_SHARED_SECRET in .env.local'); process.exit(1); }
const API = env.WIP_API || 'https://www.wip.guide';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DA = parseInt(arg('--da', '1'), 10), A = parseInt(arg('--a', '100'), 10);
const LINGUE = String(arg('--lingue', 'IT')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const SOLO_QID = arg('--qid', '');
const PAUSA = parseInt(arg('--pausa', '4000'), 10);
const dormi = ms => new Promise(x => setTimeout(x, ms));

const musei = await (await fetch(`${SB}/rest/v1/musei_prioritari?select=qid,rango,nome,lat,lon,sito&rango=gte.${DA}&rango=lte.${A}&order=rango`, { headers: H })).json();
if (!Array.isArray(musei)) { console.log('DB', JSON.stringify(musei).slice(0, 200)); process.exit(1); }
const lista = SOLO_QID ? musei.filter(m => m.qid === SOLO_QID) : musei;
console.log(`[guide] ${new Date().toISOString()} musei ${lista.length} (ranghi ${DA}-${A}), lingue ${LINGUE.join(',')}, API ${API}`);

/** La guida esistente vale? Almeno 8 tappe e una sala. */
async function guidaBuona(qid, lingua) {
  const g = await (await fetch(`${SB}/rest/v1/museum_guides?or=(poi_id.like.*-${qid},venue_key.like.*-${qid})&language=eq.${lingua}&select=venue_key,stops_count,guide->tappe&limit=5`, { headers: H })).json();
  for (const r of (Array.isArray(g) ? g : [])) {
    const tappe = Array.isArray(r.tappe) ? r.tappe : [];
    const conSala = tappe.filter(t => t?.dove || t?.salaCodice).length;
    // Anche le spiegazioni contano: una guida con le tappe ma senza «perché»
    // (revisore troppo severo del 12/09 pomeriggio) è da rifare.
    const conPerche = tappe.filter(t => String(t?.perche || '').trim().length > 20).length;
    if (tappe.length >= 8 && conSala >= 1 && conPerche >= tappe.length * 0.6) return { chiave: r.venue_key, tappe: tappe.length, conSala, conCodice: tappe.filter(t => t?.salaCodice).length, conPerche };
  }
  return null;
}

const stat = { musei: 0, giaBuone: 0, generate: 0, aiNonDisponibile: 0, senzaFonti: 0, errori: 0, tappe: 0 };
for (const m of lista) {
  for (const lingua of LINGUE) {
    const t0 = Date.now();
    try {
      const gia = await guidaBuona(m.qid, lingua);
      if (gia) { stat.giaBuone++; console.log(`  = ${m.rango}. ${m.nome} [${lingua}] già buona: ${gia.tappe} tappe, ${gia.conSala} con sala, ${gia.conCodice} con codice, ${gia.conPerche} spiegazioni`); continue; }
      stat.musei++;
      const r = await fetch(`${API}/api/vision/venue-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-script-secret': SEGRETO },
        // rigenera: la guida esistente non è buona (zero sale) → si salta
        // cache e libreria e la rotta riparte dalle fonti.
        body: JSON.stringify({ poiId: `wd-${m.qid}`, venueHint: m.nome, venueHintSource: 'user', lat: m.lat, lon: m.lon, language: lingua, rigenera: true }),
        signal: AbortSignal.timeout(290000),
      });
      const j = await r.json().catch(() => ({}));
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      if (j?.ok === true) {
        const g = j?.guide || {}; const tappe = g.tappe || [];
        const conSala = tappe.filter(t => t?.dove || t?.salaCodice).length, conCodice = tappe.filter(t => t?.salaCodice).length;
        // COMPLETEZZA (committente: «complete di foto museo, foto opere,
        // piante, informazioni, spiegazioni, consigli e curiosità, servizi»).
        const conFoto = tappe.filter(t => t?.foto || t?.fotoIcona).length;
        const conCuriosita = tappe.filter(t => String(t?.curiosita || '').trim().length > 20).length;
        const conPerche = tappe.filter(t => String(t?.perche || '').trim().length > 20).length;
        const servizi = Object.values(g.servizi || {}).filter(v => String(v || '').trim()).length;
        const manca = [];
        if (!j.venuePhoto) manca.push('foto museo');
        if (conFoto < Math.ceil(tappe.length * 0.6)) manca.push(`foto opere ${conFoto}/${tappe.length}`);
        if (conSala === 0) manca.push('sale');
        if (conCuriosita < tappe.length) manca.push(`curiosità ${conCuriosita}/${tappe.length}`);
        if (!String(g.intro || '').trim()) manca.push('intro');
        if (!String(g.consiglio || '').trim()) manca.push('consiglio');
        if (servizi === 0) manca.push('servizi');
        stat.generate++; stat.tappe += tappe.length;
        if (manca.length) { stat.incomplete = (stat.incomplete || 0) + 1; (stat.mancanze ||= {}); for (const x of manca) { const k = x.split(' ')[0]; stat.mancanze[k] = (stat.mancanze[k] || 0) + 1; } }
        console.log(`  ✓ ${m.rango}. ${m.nome} [${lingua}] ${tappe.length} tappe, ${conSala} sale, ${conCodice} codici, ${conFoto} foto, ${conCuriosita} curiosità, ${conPerche} spiegazioni, ${servizi} servizi${j.venuePhoto ? ', foto museo' : ''}${j.fromLibrary ? ' (libreria)' : j.cached ? ' (cache)' : ''} — ${sec} s${manca.length ? `  ⚠ manca: ${manca.join(', ')}` : ''}`);
      } else if (j?.reason === 'ai_unavailable' || r.status === 503) {
        stat.aiNonDisponibile++; console.log(`  ⏸ ${m.rango}. ${m.nome} [${lingua}] motori saturi (${j?.reason || r.status}) — riprovo al giro dopo`);
        await dormi(20000);
      } else if (j?.reason === 'no_source' || j?.reason === 'insufficient_material' || j?.reason === 'venue_unknown') {
        stat.senzaFonti++; console.log(`  ✗ ${m.rango}. ${m.nome} [${lingua}] ${j.reason}`);
      } else {
        stat.errori++; console.log(`  ✗ ${m.rango}. ${m.nome} [${lingua}] ${r.status} ${j?.reason || j?.error || JSON.stringify(j).slice(0, 120)}`);
      }
    } catch (e) { stat.errori++; console.log(`  ✗ ${m.rango}. ${m.nome} [${lingua}] ${String(e?.message || e).slice(0, 120)}`); }
    await dormi(PAUSA);
  }
}
console.log('\nRIEPILOGO', JSON.stringify(stat));
