#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────
// SEMINA CONTINUA DELLA BIBLIOTECA ITINERARI (droplet DigitalOcean)
//
// Il cron di Vercel chiama /api/library/seed-cron una volta all'ora: 240s di
// lavoro ogni 3.600 secondi, cioè ~32 itinerari al giorno. Con un catalogo
// da oltre 14.000 descrittori servirebbe più di un anno.
//
// Questo processo semina in continuo, uno alla volta:
//   1. legge l'ordine di semina dal catalogo (getPriorityDescriptors);
//   2. chiede a Supabase quali slug esistono già in api_cache;
//   3. per ogni descrittore mancante chiama POST /api/library/request su
//      wip.guide, che genera + verifica + salva con la pipeline normale.
//
// La generazione resta su Vercel (dove stanno le chiavi dei motori AI e il
// codice deployato): qui gira solo un ciclo di fetch, che nei 512 MB del
// droplet non pesa nulla. Vale comunque la regola di ecosystem.config.cjs:
// UN processo alla volta, mai insieme a mass-enrich.
//
// Perché /api/library/request e non /seed o /seed-cron: quelle due vogliono
// il CRON_SECRET o un token admin; /request è pubblica per disegno (la
// generazione è gratuita) e permette di scegliere qui l'ordine e di saltare
// da soli ciò che è già fatto. `live: true` = motore DeepSeek: su Vercel
// Agnes andrebbe comunque in timeout a 60s (impiega 2-4 minuti) bruciando
// un minuto per chiamata.
//
// Uso:   pm2 start ecosystem.config.cjs --only seed-library
//        pm2 logs seed-library
//
// Variabili (.env accanto al progetto, oppure ambiente):
//   VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   obbligatorie
//   LIB_API        default https://wip.guide
//   LIB_PAUSE_MS   pausa tra un item e il successivo (default 5000)
//   LIB_STATE      file di stato (default /root/seed-library-state.json)
// ─────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPriorityDescriptors } from '../src/lib/libraryDescriptors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = {};
for (const f of ['.env', '.env.local']) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(here, '..', f), 'utf8'); } catch { continue; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const K = (n: string) => process.env[n] || env[n] || '';

const API = K('LIB_API') || 'https://wip.guide';
const SUPA = K('VITE_SUPABASE_URL') || K('SUPABASE_URL');
const SKEY = K('SUPABASE_SERVICE_ROLE_KEY');
const PAUSE = Number(K('LIB_PAUSE_MS')) || 5000;
const STATE_FILE = K('LIB_STATE') || '/root/seed-library-state.json';
// Tetto di item per giro: serve per le prove (LIB_MAX=1) e per fermare il
// processo a comando; di default nessun limite.
const MAX = Number(K('LIB_MAX')) || Infinity;
// Un item scartato dalle verifiche non si ritenta per 24 ore: è quasi
// sempre un descrittore difficile (paesino senza ristoranti verificabili),
// non un guasto passeggero.
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
// Ogni tanto si rilegge la lista dei già fatti: nel frattempo hanno lavorato
// anche il cron di Vercel e gli utenti col bottone "Genera ora".
const REFRESH_EVERY = 100;

if (!SUPA || !SKEY) {
  console.error('Servono VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel .env del progetto.');
  process.exit(1);
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

type State = { failed: Record<string, { n: number; at: number }> };
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { failed: {} }; }
}
function saveState(s: State): void {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e: any) { console.warn(`${ts()} stato non salvato: ${e.message}`); }
}

async function loadSeeded(): Promise<Set<string>> {
  const out = new Set<string>();
  // Mai `cache_key=like.lib_item_*`: è una scansione completa di api_cache
  // (117s misurati il 18/08/2026, con il database poi finito in PGRST002).
  // content_type ha un indice dedicato.
  const r = await fetch(`${SUPA}/rest/v1/api_cache?select=cache_key&content_type=eq.library_itinerary&limit=50000`, {
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  for (const row of await r.json()) {
    const k = String(row?.cache_key || '');
    if (k.startsWith('lib_item_')) out.add(k.slice('lib_item_'.length));
  }
  return out;
}

async function generate(d: any): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController();
  // La rotta ha un budget sincrono di 270s dentro il maxDuration 300s.
  const to = setTimeout(() => ctrl.abort(), 320000);
  try {
    const r = await fetch(`${API}/api/library/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: d, live: true }),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let body: any = null;
    try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 200) }; }
    return { status: r.status, body };
  } finally { clearTimeout(to); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig as NodeJS.Signals, () => { console.log(`${ts()} ${sig}: chiudo dopo l'item in corso.`); stop = true; });
}

const all = getPriorityDescriptors();
const state = loadState();
let seeded = await loadSeeded();
console.log(`${ts()} avvio su ${API} — catalogo ${all.length} descrittori, ${seeded.size} già in biblioteca, ${all.length - seeded.size} da fare.`);

let salvati = 0, scartati = 0, rimandati = 0, daUltimoRefresh = 0, erroriDiFila = 0;

for (const d of all) {
  if (stop) break;
  if (seeded.has(d.slug)) continue;
  const f = state.failed[d.slug];
  if (f && Date.now() - f.at < RETRY_AFTER_MS) continue;

  const t0 = Date.now();
  let res: { status: number; body: any };
  try {
    res = await generate(d);
  } catch (e: any) {
    erroriDiFila++;
    console.error(`${ts()} ${d.slug}: rete KO (${e.message}) [${erroriDiFila} di fila]`);
    if (erroriDiFila >= 10) { console.error('Dieci errori di rete di fila: esco, pm2 riavvierà.'); process.exit(1); }
    await sleep(60000);
    continue;
  }
  const sec = Math.round((Date.now() - t0) / 1000);

  if (res.status === 200 && res.body?.itinerary) {
    erroriDiFila = 0;
    seeded.add(d.slug);
    delete state.failed[d.slug];
    if (res.body.cached) {
      console.log(`${ts()} = ${d.slug} già presente`);
    } else {
      salvati++;
      const g = Array.isArray(res.body.itinerary.giorni) ? res.body.itinerary.giorni.length : '?';
      console.log(`${ts()} + ${d.slug} salvato (score ${res.body.meta?.score ?? '?'}, ${g} giorni, ${sec}s) — totale ${salvati}`);
      saveState(state);
    }
  } else if (res.status === 202) {
    rimandati++;
    console.log(`${ts()} ~ ${d.slug} rimandato (in corso o budget esaurito, ${sec}s)`);
  } else if (res.status === 422) {
    scartati++;
    erroriDiFila = 0;
    state.failed[d.slug] = { n: (state.failed[d.slug]?.n || 0) + 1, at: Date.now() };
    saveState(state);
    console.log(`${ts()} - ${d.slug} scartato (${sec}s): ${String(res.body?.reason || res.body?.error || '').slice(0, 160)}`);
  } else if (res.status === 429) {
    console.log(`${ts()} 429 rate limit: attesa 60s`);
    await sleep(60000);
    continue;
  } else {
    erroriDiFila++;
    console.error(`${ts()} ! ${d.slug}: HTTP ${res.status} (${sec}s) ${JSON.stringify(res.body).slice(0, 160)} [${erroriDiFila} di fila]`);
    if (erroriDiFila >= 10) { console.error('Dieci errori di fila dal server: esco, pm2 riavvierà.'); process.exit(1); }
    await sleep(30000);
    continue;
  }

  if (salvati + scartati >= MAX) { console.log(`${ts()} raggiunto LIB_MAX=${MAX}: mi fermo.`); break; }

  if (++daUltimoRefresh >= REFRESH_EVERY) {
    daUltimoRefresh = 0;
    try { seeded = await loadSeeded(); } catch (e: any) { console.warn(`${ts()} refresh lista fallito: ${e.message}`); }
  }
  await sleep(PAUSE);
}

console.log(`${ts()} fine giro: ${salvati} salvati, ${scartati} scartati, ${rimandati} rimandati. In biblioteca: ${seeded.size}/${all.length}.`);

// Giro a vuoto (catalogo finito o tutto in attesa dei ritentativi): pm2
// riavvierebbe subito il processo, che rifarebbe il giro in un lampo e
// ripartirebbe di nuovo. Mezz'ora di pausa prima di uscire evita il
// mulinello e lascia scadere i 24h dei descrittori scartati.
if (!stop && salvati === 0 && scartati === 0) {
  console.log(`${ts()} niente da seminare in questo giro: pausa di 30 minuti prima di ricominciare.`);
  await sleep(30 * 60 * 1000);
}
