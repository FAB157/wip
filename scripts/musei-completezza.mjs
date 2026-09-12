#!/usr/bin/env node
/**
 * COMPLETEZZA DELLE GUIDE (12/09/2026): per ogni guida di museum_guides
 * (o solo quelle scritte oggi con --oggi) conta tappe, foto delle opere,
 * spiegazioni, curiosità, sale, codici sala, servizi, intro, foto del museo,
 * piante e pin. Serve a rispondere a «sono guide complete?» coi numeri.
 *   node scripts/musei-completezza.mjs --oggi
 *   node scripts/musei-completezza.mjs --lingua IT --da 1 --a 100
 */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const SB = env.VITE_SUPABASE_URL || env.SUPABASE_URL; const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OGGI = process.argv.includes('--oggi'); const LINGUA = arg('--lingua', 'IT');
const oggi = new Date().toISOString().slice(0, 10);
// --da / --a (12/09/2026 sera): solo i musei di musei_prioritari in quel
// rango, in ordine di rango, e i mancanti (senza guida) elencati in fondo.
const DA = parseInt(arg('--da', '0'), 10), A = parseInt(arg('--a', '0'), 10);
const prioritari = A > 0 ? await (await fetch(`${SB}/rest/v1/musei_prioritari?select=qid,rango,nome&rango=gte.${DA}&rango=lte.${A}&order=rango`, { headers: H })).json() : [];
const normNome = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const rangoDiQid = {}; const rangoDiNome = {}; for (const p of prioritari) { rangoDiQid[p.qid] = p; rangoDiNome[normNome(p.nome)] = p; }
const qidDi = s => String(s || '').match(/-(Q\d+)$/)?.[1] || '';
// La guida si abbina per QID (poi_id o venue_key «…-Q123») e, in mancanza,
// per nome normalizzato: le guide seminate dall'altra sessione portano il
// poi_id dell'archivio, non il QID.
const prioDi = r => rangoDiQid[qidDi(r.poi_id) || qidDi(r.venue_key)] || rangoDiNome[normNome(r.venue_name)] || null;
let g = await (await fetch(`${SB}/rest/v1/museum_guides?select=venue_key,venue_name,poi_id,language,stops_count,updated_at,venue_photo,guide&language=eq.${LINGUA}${OGGI ? `&updated_at=gte.${oggi}` : ''}&order=updated_at.desc&limit=1000`, { headers: H })).json();
if (A > 0) {
  g = g.filter(r => prioDi(r)).sort((x, y) => prioDi(x).rango - prioDi(y).rango);
}
const mappe = await (await fetch(`${SB}/rest/v1/mappe_museo?select=poi_id,pins`, { headers: H })).json();
const pinPerQid = {}; for (const m of (Array.isArray(mappe) ? mappe : [])) { const q = qidDi(m.poi_id); if (!q) continue; pinPerQid[q] = (pinPerQid[q] || 0) + (Array.isArray(m.pins) ? m.pins.length : 0); pinPerQid[q + ':piante'] = (pinPerQid[q + ':piante'] || 0) + 1; }
console.log(`guide ${LINGUA}${OGGI ? ' scritte oggi' : ''}: ${g.length}`);
console.log('rango/museo | tappe | foto | spieg | curios | sale | codici | servizi | intro | fotoMuseo | piante/pin');
const tot = { n: 0, complete: 0, foto: 0, tappe: 0, sale: 0, senzaFoto: 0, senzaSale: 0, senzaServizi: 0, senzaFotoMuseo: 0, conPianta: 0, conPin: 0 };
for (const r of g) {
  const t = r.guide?.tappe || []; const q = qidDi(r.poi_id) || qidDi(r.venue_key);
  const foto = t.filter(x => x.foto || x.fotoIcona).length, sp = t.filter(x => String(x.perche || '').length > 20).length, cu = t.filter(x => String(x.curiosita || '').length > 20).length;
  const sale = t.filter(x => x.dove || x.salaCodice).length, cod = t.filter(x => x.salaCodice).length;
  const serv = Object.values(r.guide?.servizi || {}).filter(v => String(v || '').trim()).length;
  const intro = String(r.guide?.intro || '').length > 40 ? 'sì' : 'NO'; const fm = r.venue_photo ? 'sì' : 'NO';
  const piante = pinPerQid[q + ':piante'] || 0, pin = pinPerQid[q] || 0;
  const ok = t.length >= 8 && foto >= Math.ceil(t.length * 0.6) && sp >= t.length * 0.9 && cu >= t.length * 0.8 && sale > 0 && serv > 0 && intro === 'sì' && fm === 'sì';
  tot.n++; if (ok) tot.complete++; tot.foto += foto; tot.tappe += t.length; tot.sale += sale;
  if (foto < Math.ceil(t.length * 0.6)) tot.senzaFoto++; if (!sale) tot.senzaSale++; if (!serv) tot.senzaServizi++; if (fm === 'NO') tot.senzaFotoMuseo++; if (piante) tot.conPianta++; if (pin) tot.conPin++;
  const rg = A > 0 ? String(prioDi(r)?.rango || '').padStart(3) + ' ' : '';
  console.log(`${ok ? '✓' : '·'} ${rg}${r.venue_name.slice(0, 34).padEnd(34)} | ${String(t.length).padStart(2)} | ${String(foto).padStart(2)} | ${String(sp).padStart(2)} | ${String(cu).padStart(2)} | ${String(sale).padStart(2)} | ${String(cod).padStart(2)} | ${serv} | ${intro} | ${fm} | ${piante}/${pin}`);
}
if (A > 0) {
  const conGuida = new Set(g.map(r => prioDi(r)?.qid));
  const mancanti = prioritari.filter(p => !conGuida.has(p.qid));
  console.log(`\nSENZA GUIDA ${LINGUA} (${mancanti.length} su ${prioritari.length} del rango ${DA}-${A}): ${mancanti.map(p => `${p.rango} ${p.nome}`).join('; ')}`);
}
console.log(`\nTOTALE: ${tot.n} guide, complete ${tot.complete}; tappe ${tot.tappe}, con foto ${tot.foto} (${Math.round(100 * tot.foto / Math.max(1, tot.tappe))}%), con sala ${tot.sale}; guide con poche foto ${tot.senzaFoto}, senza sale ${tot.senzaSale}, senza servizi ${tot.senzaServizi}, senza foto museo ${tot.senzaFotoMuseo}; con pianta ${tot.conPianta}, con pin ${tot.conPin}`);
