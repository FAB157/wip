#!/usr/bin/env node
// PRE-ARRICCHIMENTO DELLE CITTA' (22/09/2026, committente: «tutto deve essere
// velocissimo» → «lingue 4 e gemme 100»). Scorre la lista delle prime 20 citta'
// di ogni nazione (scripts/data/citta-prearricchimento.jsonl, da GeoNames) e
// per ogni citta' riempie in anticipo — testo breve, testo dettagliato, foto,
// copione audio — fino a 100 pin culturali, in 4 lingue, cosi' l'utente li
// trova gia' pronti. Precedenza alle GEMME, poi monumenti/musei/chiese/panorami
// con una fonte esatta (Wikipedia/Wikidata), poi gli altri culturali.
//
// Le 4 lingue per citta': la lingua del posto (se e' una delle 7 dell'app),
// poi italiano, inglese, spagnolo, francese, tedesco in quest'ordine fino a 4.
// Le altre lingue dell'app si traducono al volo alla prima apertura.
//
// Chiama la stessa rotta dell'app (/api/poi/enrich) col segreto di servizio:
// la richiesta vale come `background-script`, quindi usa il POOL a rotazione
// (Groq 4 chiavi, Gonka 'poi') e MAI le chiavi dedicate agli utenti in attesa
// ne' DeepSeek diretto. Le regole restano quelle della rotta: nessun testo
// inventato, riga dei dati per i commerciali, foto solo se ritrae il luogo.
// Ogni descrizione generata resta in poi_details (una riga per lingua) e la
// prima anche in shared_pois; le lingue gia' presenti si SALTANO.
//
//   node scripts/prearricchisci-citta.mjs [--prova] [--citta=N] [--da=N] [--tetto=100]
//        [--continente=Europa] [--iso=IT,FR] [--base=https://www.wip.guide] [--pausa=1500]
//   --prova: conta e stampa cosa farebbe, senza chiamare la rotta.
//   Ripartibile: lo stato sta in scripts/data/citta-prearricchimento.stato.json.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const prova = args.includes('--prova');
const tetto = Number(opt('tetto', 100));
const base = opt('base', 'https://www.wip.guide');
const pausa = Number(opt('pausa', 1500));
const soloContinente = opt('continente', '');
const soloIso = new Set(String(opt('iso', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const maxCitta = Number(opt('citta', 0));
const da = Number(opt('da', 0));
const LISTA = 'scripts/data/citta-prearricchimento.jsonl';
const STATO = 'scripts/data/citta-prearricchimento.stato.json';
if (!env.SCRIPT_SHARED_SECRET && !prova) { console.error('manca SCRIPT_SHARED_SECRET nel .env/.env.local'); process.exit(1); }

// NOTA (22/09/2026 sera): la lettura via REST del riquadro con filtro per categoria va in timeout
// sulle metropoli (Parigi). La strada buona e' scripts/esporta-lista-citta.mjs (Postgres diretto,
// una riga per pin × lingua) + il motore a 5 lavoratori del droplet 104. Questo script resta per
// una singola citta' piccola o per la prova a secco.
// Lingua del posto → una delle 7 lingue dell'app; altrimenti nessuna (si parte da it/en).
const LINGUA_PAESE_LOCALE = {
  IT: 'it', SM: 'it', VA: 'it',
  GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en', MT: 'en', JM: 'en', TT: 'en', BB: 'en', BS: 'en', BZ: 'en', GY: 'en', GI: 'en', IM: 'en', JE: 'en', GG: 'en', BM: 'en', KY: 'en', VG: 'en', AG: 'en', DM: 'en', GD: 'en', KN: 'en', LC: 'en', VC: 'en', SG: 'en', PH: 'en', IN: 'en', PK: 'en', BD: 'en', LK: 'en', MY: 'en', HK: 'en',
  FR: 'fr', MC: 'fr', LU: 'fr', BE: 'fr', CH: 'fr', HT: 'fr', GP: 'fr', MQ: 'fr', GF: 'fr', PM: 'fr', BL: 'fr', MF: 'fr', LB: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', AD: 'es',
  DE: 'de', AT: 'de', LI: 'de',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  CN: 'zh', TW: 'zh', MO: 'zh',
};
const ORDINE = ['it', 'en', 'es', 'fr', 'de'];
function lingueCitta(iso) {
  const out = [];
  const locale = LINGUA_PAESE_LOCALE[iso];
  if (locale) out.push(locale);
  for (const l of ORDINE) { if (out.length >= 4) break; if (!out.includes(l)) out.push(l); }
  return out.slice(0, 4);
}
// Raggio in km dalla popolazione: le metropoli sono larghe, i paesi no.
const raggioKm = (pop) => pop >= 3_000_000 ? 10 : pop >= 1_000_000 ? 7 : pop >= 300_000 ? 5 : 3;

const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CULTURALI = new Set(['gemme', 'monumenti', 'musei', 'chiese', 'panorami', 'attraction']);
const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-|ov-)/;
const nonLuoghi = /metropolitana|stazione|station|ev_charging|parking|utilita|fuel|pharmacy|bank|atm|information/i;

let citta = fs.readFileSync(LISTA, 'utf8').split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r));
if (soloContinente) citta = citta.filter((c) => c.continente.toLowerCase().startsWith(soloContinente.toLowerCase()));
if (soloIso.size) citta = citta.filter((c) => soloIso.has(c.iso));
citta = citta.slice(da, maxCitta ? da + maxCitta : undefined);
const stato = fs.existsSync(STATO) ? JSON.parse(fs.readFileSync(STATO, 'utf8')) : { fatte: {} };
const salvaStato = () => { if (!prova) fs.writeFileSync(STATO, JSON.stringify(stato)); };

console.log(`citta' in lista: ${citta.length}, tetto ${tetto} pin per citta', 4 lingue${prova ? ' — PROVA, nessuna chiamata' : ''}`);
let totChiamate = 0, totOk = 0, totErr = 0, totSaltati = 0;
for (const [ci, c] of citta.entries()) {
  const chiave = `${c.iso}:${c.geonameid}`;
  if (stato.fatte[chiave] && !prova) { console.log(`${ci + 1}/${citta.length} ${c.citta} (${c.iso}): gia' fatta, salto`); continue; }
  const lingue = lingueCitta(c.iso);
  const km = raggioKm(c.popolazione);
  const d = km / 111, dl = km / (111 * Math.max(0.15, Math.cos(c.lat * Math.PI / 180)));
  // Mai ORDER BY su shared_pois (timeout, vedi memoria): riquadro chiuso + limit, ordine in locale.
  // Supabase taglia a 1.000 righe per chiamata: a Parigi le prime 1.000 del riquadro erano quasi
  // tutte non culturali e le gemme restavano fuori (prova a secco: «0 gemme»). Si filtra la
  // categoria lato server, le GEMME con una chiamata a parte (sono poche, entrano tutte), poi i
  // culturali non gemma a pagine di 1.000 fino a un tetto.
  const campi = 'id, name, category, poi_type, lat, lon, is_gem, wikidata, wikipedia_url, description_short, description_lang, image_url, photo_url';
  const box = (q) => q.gte('lat', c.lat - d).lte('lat', c.lat + d).gte('lon', c.lon - dl).lte('lon', c.lon + dl).not('is_hidden', 'is', true).in('category', [...CULTURALI]);
  const { data: gemmeRows, error } = await box(sb.from('shared_pois').select(campi).eq('is_gem', true)).limit(1000);
  if (error) { console.error(`${c.citta}: lettura fallita: ${error.message}`); totErr++; continue; }
  const altri = [];
  for (let pag = 0; pag < 5 && altri.length < tetto * 3; pag++) {
    const { data: rows, error: e2 } = await box(sb.from('shared_pois').select(campi).eq('is_gem', false)).range(pag * 1000, pag * 1000 + 999);
    if (e2) { console.error(`${c.citta}: lettura pagina ${pag} fallita: ${e2.message}`); break; }
    altri.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  const data = [...(gemmeRows || []), ...altri];
  const candidati = data.filter((r) =>
    r.name && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && !Number.isNaN(Number(r.lat))
    && CULTURALI.has(String(r.category || '').toLowerCase()) && !salta.test(String(r.id))
    && !nonLuoghi.test(`${r.category} ${r.poi_type || ''}`) && !/\b(car ?park|parking|parcheggio|supercharger|q-park)\b/i.test(String(r.name)),
  );
  // Precedenza: gemme, poi chi ha una fonte esatta, poi gli altri.
  const peso = (r) => (r.is_gem ? 100 : 0) + (r.wikidata || r.wikipedia_url ? 10 : 0);
  candidati.sort((a, b) => peso(b) - peso(a));
  const scelti = candidati.slice(0, tetto);
  // Lingue gia' presenti: in shared_pois (description_lang) o in poi_details.
  const ids = scelti.map((r) => r.id);
  const gia = new Map(); // id → Set(lingue minuscole)
  for (const r of scelti) if (r.description_short && r.description_lang) gia.set(r.id, new Set([String(r.description_lang).toLowerCase()]));
  for (let i = 0; i < ids.length; i += 200) {
    const { data: pd } = await sb.from('poi_details').select('poi_id, language, summary').in('poi_id', ids.slice(i, i + 200));
    for (const p of pd || []) { if (!p.summary) continue; if (!gia.has(p.poi_id)) gia.set(p.poi_id, new Set()); gia.get(p.poi_id).add(String(p.language).toLowerCase()); }
  }
  const lavori = [];
  for (const r of scelti) for (const l of lingue) if (!gia.get(r.id)?.has(l)) lavori.push({ r, l });
  const gemme = scelti.filter((r) => r.is_gem).length;
  console.log(`${ci + 1}/${citta.length} ${c.citta} (${c.iso}, ±${km} km): ${data.length} pin, ${candidati.length} culturali, ${scelti.length} scelti (${gemme} gemme), lingue ${lingue.join('/')}, ${lavori.length} generazioni da fare`);
  totChiamate += lavori.length;
  if (prova) { for (const w of lavori.slice(0, 8)) console.log(`    ${w.l} | ${w.r.id} | ${w.r.name}${w.r.is_gem ? ' ◆' : ''}`); continue; }
  for (const [i, w] of lavori.entries()) {
    try {
      const res = await fetch(`${base}/api/poi/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
        body: JSON.stringify({ id: w.r.id, name: w.r.name, lat: w.r.lat, lon: w.r.lon, category: w.r.category, subCategory: w.r.poi_type, wikidata: w.r.wikidata || undefined, wikipedia: w.r.wikipedia_url || undefined, lang: w.l, mode: 'full' }),
        signal: AbortSignal.timeout(120000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) totOk++; else totErr++;
      console.log(`  ${String(i + 1).padStart(4)}/${lavori.length} ${res.status} ${w.l} ${String(w.r.name).slice(0, 40).padEnd(40)} testo:${j.description_short ? 'si' : 'no'} foto:${j.thumbnail ? 'si' : 'no'}`);
    } catch (e) { totErr++; console.log(`  ${String(i + 1).padStart(4)}/${lavori.length} ERRORE ${w.l} ${w.r.name}: ${e.message}`); }
    await new Promise((ok2) => setTimeout(ok2, pausa)); // gentile con Supabase, Wikimedia e il pool
  }
  stato.fatte[chiave] = { quando: new Date().toISOString(), scelti: scelti.length, generazioni: lavori.length };
  salvaStato();
}
console.log(`\nFINITO: ${totChiamate} generazioni previste, ${totOk} riuscite, ${totErr} errori, ${totSaltati} saltate.`);
