// SEMINA TESTI AUDIOGUIDA per i POI culturali (29/09/2026, committente: pre-generare i testi
// delle audioguide — mai l'mp3, quello resta on-demand con cache come oggi — partendo da IT+EN
// e dai piu' importanti. Chiama la stessa rotta dell'app (/api/regenerate) col segreto di
// servizio: la richiesta vale come `background-script`, quindi usa SOLO il pool a rotazione
// (Groq 4 chiavi, mai DeepSeek diretto), mai le chiavi dedicate agli utenti in attesa.
//
// Priorita': POI con wikipedia_url valorizzato (indice idx_shared_pois_wikipedia_url) vengono
// prima — un articolo Wikipedia e' un buon proxy di notorieta'/importanza reale, evita un
// ORDER BY su colonne non indicizzate (timeout noto su shared_pois da 9.5M righe).
//
// node scripts/semina-audioguide-testi.mjs --lingua=it [--limite=2000] [--base=https://www.wip.guide] [--prova]
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const lingua = opt('lingua', 'it');
const limite = Number(opt('limite', 2000));
const base = opt('base', 'https://www.wip.guide');
const prova = args.includes('--prova');
if (!env.SCRIPT_SHARED_SECRET && !prova) { console.error('manca SCRIPT_SHARED_SECRET nel .env/.env.local'); process.exit(1); }

const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CATEGORIE = ['chiese', 'monumenti', 'musei', 'gallery', 'art_gallery'];
const PERSONAGGI = ['dante', 'nicky'];

async function saluteOk() {
  try {
    const t0 = Date.now();
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    return r.ok && (Date.now() - t0) < 1500;
  } catch { return false; }
}

async function prendiLotto(dopoId, dimensione) {
  // Tier 1: con wikipedia_url (piu' importanti), poi tier 2: senza — due passate separate
  // chiamate dal loop principale, qui solo la query di un singolo lotto per keyset su id.
  let q = sb.from('shared_pois')
    .select('id, name, category, lat, lon, description_short, description_long, description_ai, wikipedia_url')
    .in('category', CATEGORIE)
    .not('is_hidden', 'is', true)
    .order('id', { ascending: true })
    .limit(dimensione);
  if (dopoId) q = q.gt('id', dopoId);
  return q;
}

async function generaTesto(poi, lang, personaggio) {
  const testoBase = poi.description_long || poi.description_ai || poi.description_short || poi.name;
  const res = await fetch(`${base}/api/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
    body: JSON.stringify({ poi_id: poi.id, poiName: poi.name, text: testoBase, mode: personaggio, lang, location: `${poi.lat},${poi.lon}` }),
    signal: AbortSignal.timeout(60000),
  });
  return res;
}

let dopoId = null;
let esaminati = 0, generati = 0, gia_presenti = 0, errori = 0, saluteMaleDiFila = 0;
console.log(`SEMINA testi audioguida — lingua ${lingua}, personaggi ${PERSONAGGI.join('+')}, categorie ${CATEGORIE.join(',')}, limite ${limite}${prova ? ' — PROVA' : ''}`);

while (esaminati < limite) {
  const dimensione = Math.min(300, limite - esaminati);
  const { data, error } = await prendiLotto(dopoId, dimensione);
  if (error) { console.error('lettura fallita:', error.message); break; }
  if (!data || data.length === 0) { console.log('nessun altro POI culturale, fine.'); break; }
  dopoId = data[data.length - 1].id;

  // Priorita' nel lotto stesso: quelli con wikipedia_url prima.
  data.sort((a, b) => (b.wikipedia_url ? 1 : 0) - (a.wikipedia_url ? 1 : 0));

  const ids = data.map((r) => r.id);
  const { data: esistenti } = await sb.from('poi_audioguides')
    .select('poi_id, language, character')
    .in('poi_id', ids)
    .eq('language', lingua.toUpperCase());
  const presenti = new Set((esistenti || []).map((r) => `${r.poi_id}|${r.character}`));

  for (const poi of data) {
    esaminati++;
    for (const personaggio of PERSONAGGI) {
      if (presenti.has(`${poi.id}|${personaggio}`)) { gia_presenti++; continue; }
      if (prova) { console.log(`  [prova] ${poi.id} | ${poi.name} | ${personaggio} | wiki:${poi.wikipedia_url ? 'si' : 'no'}`); continue; }

      if (!(await saluteOk())) {
        saluteMaleDiFila++;
        console.log(`[salute] /api/health non ok, pausa 60s (${saluteMaleDiFila}/3)`);
        if (saluteMaleDiFila >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila, mi fermo per sicurezza. Riprendibile in seguito con --dopo-id=' + poi.id); process.exit(0); }
        await new Promise((r) => setTimeout(r, 60000));
        continue;
      }
      saluteMaleDiFila = 0;

      try {
        const res = await generaTesto(poi, lingua, personaggio);
        if (res.ok) { generati++; }
        else { errori++; console.log(`  ERRORE ${res.status} ${poi.name} (${personaggio})`); }
      } catch (e) { errori++; console.log(`  ERRORE ${poi.name} (${personaggio}): ${e.message}`); }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (esaminati % 50 === 0) console.log(`${esaminati}/${limite} esaminati | generati ${generati} | gia' presenti ${gia_presenti} | errori ${errori} | ultimo id ${poi.id}`);
  }
}
console.log(`\nFINITO: esaminati ${esaminati}, generati ${generati}, gia' presenti ${gia_presenti}, errori ${errori}.`);
