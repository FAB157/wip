#!/usr/bin/env node
/**
 * SALE E PIANTE DAL WEB (12/09/2026 sera, committente: «cerca su internet le
 * info delle sale e la pianta»). Per i musei prioritari il cui sito è
 * anti-bot (Orsay, British, Met…) le sale delle opere e la planimetria non
 * arrivano dalle fonti dirette: si cercano sul web (Brave, via la rotta
 * /api/admin/museums/web-search del server, la chiave sta su Vercel).
 *
 *  - SALE: per ogni tappa senza «dove» si cerca «<opera> <museo> room/salle/
 *    sala»; una sala vale se uno snippet la scrive vicino al nome dell'opera
 *    E nomina il museo («Room 43», «Salle 6», «Sala 15», «Saal 2», «Gallery
 *    12»). Si scrive in salaCodice (codice nudo) e in dove (se vuoto), sulla
 *    guida in libreria; la cache della rotta si svuota così la prossima
 *    lettura la ricostruisce.
 *  - PIANTE: si cerca «<museo> floor plan / plan pdf / map» (inglese e lingua
 *    del paese); i file diretti (pdf/png/jpg) e le immagini/PDF con
 *    «plan|map|pianta|piantina|grundriss» dentro le pagine trovate vanno in
 *    fonti_poi come candidate 'mappa' (origine 'web'): NON entrano da sole,
 *    le verificano i due modelli visivi in scripts/mappe-auto-pins.mjs.
 *
 * Uso: node scripts/sale-e-piante-dal-web.mjs [--da 1 --a 100] [--qid Q23402]
 *      [--lingua IT] [--solo sale|piante] [--max-musei N]
 */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const SB = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY, API = env.WIP_API || 'https://www.wip.guide';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DA = parseInt(arg('--da', '1'), 10), A = parseInt(arg('--a', '100'), 10), SOLO_QID = arg('--qid', ''), LINGUA = String(arg('--lingua', 'IT')).toUpperCase();
const SOLO = arg('--solo', ''), MAX_MUSEI = parseInt(arg('--max-musei', '200'), 10);
// TETTO DI RICERCHE (12/09/2026 sera): ~30 ricerche a museo hanno quasi
// azzerato il credito Brave condiviso con gli Eventi. Per giro al massimo
// --max-ricerche (default 80: sotto i 100/giorno gratis di Google CSE) e al
// massimo 12 ricerche sale per museo. --provider google forza Google CSE.
const MAX_RICERCHE = parseInt(arg('--max-ricerche', '80'), 10);
const MAX_SALE_PER_MUSEO = parseInt(arg('--max-sale', '12'), 10);
const PROVIDER = arg('--provider', '');
let ricercheFatte = 0;
const dormi = ms => new Promise(x => setTimeout(x, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 WorldInPocket/1.0 (support@wip.guide)' };
const MAX_FILE = 8 * 1024 * 1024;

async function ricerca(queries, lang = 'en') {
  const spazio = Math.max(0, MAX_RICERCHE - ricercheFatte);
  if (!spazio) { console.log('  tetto ricerche raggiunto per questo giro'); return {}; }
  queries = queries.slice(0, spazio);
  ricercheFatte += queries.length;
  const r = await fetch(`${API}/api/admin/museums/web-search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET }, body: JSON.stringify({ queries, lang, count: 8, ...(PROVIDER ? { provider: PROVIDER } : {}) }), signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { console.log('  ricerca web:', r.status, j.reason || j.error || ''); return {}; }
  return j.risultati || {};
}

const PAROLE_SALA = 'room|rooms|salle|sala|sale|saal|zaal|gallery|galerie|galleria|hall';
const RX_SALA = new RegExp(`\\b(?:${PAROLE_SALA})\\s*(?:n\\.?|no\\.?|nº|°)?\\s*([A-Z]?\\d{1,3}[A-Za-z]?(?:\\s*[-–]\\s*\\d{1,3})?)\\b`, 'gi');
/** Dallo snippet: la sala scritta vicino (entro 160 caratteri) a una parola distintiva dell'opera. */
function salaDaSnippet(testo, opera, museo) {
  const t = String(testo || '');
  const n = norm(t);
  const parMuseo = norm(museo).split(' ').filter(w => w.length >= 4 && !['museo', 'museum', 'musee', 'national', 'nazionale', 'gallery', 'galleria', 'the', 'della', 'delle'].includes(w));
  if (parMuseo.length && !parMuseo.some(w => n.includes(w))) return null;
  const parOpera = norm(opera).split(' ').filter(w => w.length >= 4 && !['della', 'delle', 'with', 'from', 'the', 'and', 'des', 'les', 'une', 'del'].includes(w));
  if (!parOpera.length) return null;
  let m; RX_SALA.lastIndex = 0;
  while ((m = RX_SALA.exec(t))) {
    const intorno = norm(t.slice(Math.max(0, m.index - 160), m.index + 160));
    if (parOpera.filter(w => intorno.includes(w)).length >= Math.min(2, parOpera.length)) return m[1].replace(/\s*[-–]\s*/, '-').toUpperCase();
  }
  return null;
}
const ETICHETTA_SALA = { IT: 'Sala', EN: 'Room', FR: 'Salle', ES: 'Sala', DE: 'Saal', RU: 'Зал', ZH: '展厅' };

async function scaricaSuStorage(url, pathStorage) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000 || buf.length > MAX_FILE) return null;
  if (!/pdf|image\//.test(ct)) return null;
  const up = await fetch(`${SB}/storage/v1/object/fonti/${pathStorage}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': ct || 'application/octet-stream', 'x-upsert': 'true' }, body: buf });
  if (!up.ok) return null;
  return { byte: buf.length, ct };
}
const tipoDa = (nome, ct = '') => { const m = String(nome).match(/\.(pdf|png|jpe?g|webp)(\?|$)/i); const t = (m?.[1] || (ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : '')).toLowerCase(); return t === 'jpeg' ? 'jpg' : t; };
async function salvaRiga(riga) {
  const r = await fetch(`${SB}/rest/v1/fonti_poi?on_conflict=poi_id,fonte,lingua,chiave`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...riga, recuperato_at: new Date().toISOString() }) });
  return r.ok;
}
/** Dentro una pagina HTML: link a pdf/immagini che parlano di pianta/mappa. */
async function candidateDaPagina(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r || !r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) return [];
  const html = (await r.text()).slice(0, 600000);
  const out = new Set();
  for (const m of html.matchAll(/(?:href|src|data-src)=["']([^"']+\.(?:pdf|png|jpe?g|webp)(?:\?[^"']*)?)["']/gi)) {
    const u = m[1];
    if (!/plan|map|mappa|pianta|piantina|planimetr|grundriss|plano|floor|etage|piano|level|salle|sale|room/i.test(u)) continue;
    try { out.add(new URL(u, url).href); } catch {}
  }
  return [...out].slice(0, 6);
}
const PAROLE_PIANTA = { it: 'pianta OR planimetria OR mappa', en: 'floor plan OR map', fr: 'plan du musée OR plan des salles', es: 'plano del museo', de: 'Grundriss OR Lageplan', nl: 'plattegrond', ru: 'план музея', zh: '平面图' };
const linguaPaese = (paese) => ({ IT: 'it', FR: 'fr', ES: 'es', DE: 'de', AT: 'de', CH: 'de', NL: 'nl', RU: 'ru', CN: 'zh', BE: 'fr' }[String(paese || '').toUpperCase()] || 'en');

const musei = await (await fetch(`${SB}/rest/v1/musei_prioritari?select=qid,rango,nome,sito,paese&rango=gte.${DA}&rango=lte.${A}&order=rango`, { headers: H })).json();
const lista = (SOLO_QID ? musei.filter(m => m.qid === SOLO_QID) : musei).slice(0, MAX_MUSEI);
console.log(`[web] ${new Date().toISOString()} musei ${lista.length}, lingua guida ${LINGUA}, solo ${SOLO || 'sale+piante'}`);
const stat = { musei: 0, saleTrovate: 0, guideAggiornate: 0, pianteCandidate: 0, errori: 0 };

for (const m of lista) {
  stat.musei++;
  try {
    // La guida in libreria (qualunque chiave con quel QID) nella lingua chiesta.
    const g = await (await fetch(`${SB}/rest/v1/museum_guides?or=(poi_id.like.*-${m.qid},venue_key.like.*-${m.qid})&language=eq.${LINGUA}&select=venue_key,poi_id,venue_name,guide,stops_count&limit=1`, { headers: H })).json();
    const riga = Array.isArray(g) ? g[0] : null;
    const nomeMuseo = riga?.venue_name || m.nome;
    const poiId = riga?.poi_id || `wd-${m.qid}`;
    // ── SALE ──
    if (riga && SOLO !== 'piante') {
      const tappe = riga.guide?.tappe || [];
      const senza = tappe.map((t, i) => ({ t, i })).filter(({ t }) => !t.soloCollezione && !String(t.salaCodice || '').trim() && !String(t.dove || '').trim()).slice(0, MAX_SALE_PER_MUSEO);
      if (senza.length) {
        const langRicerca = linguaPaese(m.paese);
        const queries = senza.map(({ t }) => `"${t.nomeFonte || t.nome}" ${nomeMuseo} ${langRicerca === 'it' ? 'sala' : langRicerca === 'fr' ? 'salle' : langRicerca === 'de' ? 'Saal' : langRicerca === 'es' ? 'sala' : 'room'}`);
        const ris = await ricerca(queries, langRicerca);
        let trovate = 0;
        const nuove = tappe.map(t => ({ ...t }));
        senza.forEach(({ t, i }, k) => {
          const r = ris[queries[k]] || [];
          const voti = {};
          for (const x of r) { const s = salaDaSnippet(`${x.title}. ${x.snippet}`, t.nomeFonte || t.nome, nomeMuseo); if (s) voti[s] = (voti[s] || 0) + 1; }
          const migliore = Object.entries(voti).sort((a, b) => b[1] - a[1])[0];
          if (!migliore) return;
          const codice = migliore[0];
          nuove[i] = { ...nuove[i], salaCodice: codice, dove: nuove[i].dove || `${ETICHETTA_SALA[LINGUA] || 'Sala'} ${codice}`, salaDalWeb: true };
          trovate++;
        });
        if (trovate) {
          const conSala = nuove.filter(t => String(t.salaCodice || t.dove || '').trim()).length;
          const u = await fetch(`${SB}/rest/v1/museum_guides?venue_key=eq.${encodeURIComponent(riga.venue_key)}&language=eq.${LINGUA}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ guide: { ...riga.guide, tappe: nuove }, stops_with_room: conSala, updated_at: new Date().toISOString() }) });
          await fetch(`${SB}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(`venue_guide:v1:${riga.venue_key}:${LINGUA}`)}`, { method: 'DELETE', headers: H });
          stat.saleTrovate += trovate; if (u.ok) stat.guideAggiornate++;
          console.log(`  ✓ ${m.rango}. ${nomeMuseo}: ${trovate}/${senza.length} sale dal web (ora ${conSala}/${tappe.length} con sala)`);
        } else console.log(`  – ${m.rango}. ${nomeMuseo}: nessuna sala trovata sul web per ${senza.length} opere`);
      } else console.log(`  = ${m.rango}. ${nomeMuseo}: tutte le tappe hanno già la sala`);
    }
    // ── PIANTE ──
    if (SOLO !== 'sale') {
      const gia = await (await fetch(`${SB}/rest/v1/fonti_poi?poi_id=eq.${encodeURIComponent(poiId)}&fonte=eq.mappa&select=chiave,dati`, { headers: H })).json();
      const giaChiavi = new Set((Array.isArray(gia) ? gia : []).map(x => x.chiave));
      const buone = (Array.isArray(gia) ? gia : []).filter(x => x?.dati?.verificataMappa && !x?.dati?.nonMappa).length;
      if (buone >= 2) { console.log(`  = ${nomeMuseo}: ${buone} piante già verificate, non cerco`); continue; }
      const langRicerca = linguaPaese(m.paese);
      const queries = [...new Set([`${nomeMuseo} floor plan`, `${nomeMuseo} plan pdf`, `${nomeMuseo} map of the museum rooms`, langRicerca !== 'en' ? `${nomeMuseo} ${PAROLE_PIANTA[langRicerca] || ''}`.trim() : ''])].filter(Boolean);
      const ris = await ricerca(queries, 'en');
      const candidate = new Map();
      for (const q of queries) for (const x of (ris[q] || [])) {
        const u = String(x.url || '');
        if (/\.(pdf|png|jpe?g|webp)(\?|$)/i.test(u)) candidate.set(u, x.url);
        else if (/plan|map|pianta|piantina|planimetr|grundriss|plano|visit|visite|orientation/i.test(u + ' ' + x.title)) candidate.set(u, 'pagina');
      }
      let nuove = 0, i = giaChiavi.size;
      for (const [u, tipoC] of [...candidate].slice(0, 8)) {
        const file = tipoC === 'pagina' ? await candidateDaPagina(u) : [u];
        for (const f of file) {
          if (nuove >= 4) break;
          const chiave = `web:${f}`.slice(0, 500);
          if (giaChiavi.has(chiave)) continue;
          const tipo = tipoDa(f); if (!tipo) continue;
          const dst = `musei/${poiId.replace(/[^A-Za-z0-9_-]/g, '_')}/web-${++i}.${tipo}`;
          const s = await scaricaSuStorage(f, dst); if (!s) continue;
          const ok = await salvaRiga({ poi_id: poiId, fonte: 'mappa', lingua: '', chiave, url: f, titolo: `Pianta trovata sul web (${tipo})`, dati: { tipo, origine: 'web', paginaUfficiale: tipoC === 'pagina' ? u : f }, storage_path: dst, revisione: new Date().toISOString().slice(0, 10), licenza: 'Sito terzo, tutti i diritti riservati: si rimanda alla pagina', attribuzione: (() => { try { return new URL(f).hostname; } catch { return 'web'; } })(), byte: s.byte });
          if (ok) { nuove++; stat.pianteCandidate++; }
          await dormi(300);
        }
      }
      console.log(`  ${nuove ? '✓' : '–'} ${nomeMuseo}: ${nuove} piante candidate dal web (da verificare coi modelli)`);
    }
  } catch (e) { stat.errori++; console.log(`  ✗ ${m.nome}: ${String(e?.message || e).slice(0, 140)}`); }
  await dormi(1500);
}
console.log('\nRIEPILOGO', JSON.stringify({ ...stat, ricercheFatte }));
