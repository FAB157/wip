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
// da soli ciò che è già fatto. Si chiama SENZA `live`, quindi con Agnes:
// DeepSeek è a pagamento e va usato solo quando c'è un utente in attesa.
//
// Uso:   pm2 start ecosystem.config.cjs --only seed-library
//        pm2 logs seed-library
//
// Variabili (.env accanto al progetto, oppure ambiente):
//   VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   obbligatorie
//   LIB_API        default https://wip.guide
//   LIB_CONCURRENCY item lavorati in parallelo (default 3, max 6)
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
// Quanti item lavorare insieme. Sono attese di rete: il limite è la memoria
// del processo API sul droplet, non la CPU (che resta allo 0%).
const CONCURRENZA = Math.min(6, Math.max(1, Number(K('LIB_CONCURRENCY')) || 3));
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

// Attesa massima per un item: deve SUPERARE il budget sincrono del server
// (LIB_SYNC_BUDGET_MS: 270s su Vercel, 900s sul droplet), altrimenti si
// abortisce dal lato client una generazione che sta ancora lavorando — e il
// lavoro fatto si perde comunque, perché l'item viene salvato solo alla fine.
const TIMEOUT_MS = (Number(K('LIB_SYNC_BUDGET_MS')) || 270000) + 90000;

// NON si usa fetch(): undici (il motore di fetch dentro Node) ha un
// headersTimeout di 300 secondi che NON si disattiva col signal, e da quando
// la generazione gira su Agnes ogni item ne impiega 4-6. Risultato misurato il
// 19/08/2026: 82 "fetch failed" in 9 ore contro 13 esiti veri — il server
// finiva e salvava l'item, il driver lo dava per perso e passava al
// successivo, avviando una seconda generazione sopra la prima (di qui i
// riavvii per memoria del processo API). http.request non ha quel tetto.
//
// Il corpo non contiene live:true: `live` significa "c'è un utente che
// aspetta" e accende DeepSeek, che è a pagamento. Qui il motore è Agnes con
// Groq di riserva: più lenti, ma gratuiti e senza limiti di tempo.
async function generate(d: any): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify({ descriptor: d });
  const u = new URL(`${API}/api/library/request`);
  const mod: any = u.protocol === 'https:' ? await import('node:https') : await import('node:http');
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res: any) => {
        let txt = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => { txt += c; });
        res.on('end', () => {
          let body: any = null;
          try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 200) }; }
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`nessuna risposta entro ${Math.round(TIMEOUT_MS / 1000)}s`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig as NodeJS.Signals, () => { console.log(`${ts()} ${sig}: chiudo dopo l'item in corso.`); stop = true; });
}

// Il database può essere momentaneamente in ginocchio (è successo il
// 18/08/2026: PGRST002 su tutte le rotte per un'ora). In quel caso NON si
// insiste e non si esce sbattendo la porta — pm2 riavvierebbe subito
// aggiungendo carico: si aspetta in silenzio, con un sondaggio ogni 5
// minuti, e si comincia solo quando il database è tornato.
async function attendiDatabase(): Promise<Set<string>> {
  for (let tentativo = 1; ; tentativo++) {
    try {
      return await loadSeeded();
    } catch (e: any) {
      console.warn(`${ts()} database non disponibile (${String(e.message).slice(0, 120)}) — riprovo tra 5 minuti [${tentativo}]`);
      await sleep(5 * 60 * 1000);
    }
  }
}

const all = getPriorityDescriptors();
const state = loadState();
let seeded = await attendiDatabase();
console.log(`${ts()} avvio su ${API} — catalogo ${all.length} descrittori, ${seeded.size} già in biblioteca, ${all.length - seeded.size} da fare.`);

let salvati = 0, scartati = 0, rimandati = 0, retiKO = 0, daUltimoRefresh = 0;
let cursore = 0;
let refreshInCorso = false;

/** Prossimo descrittore da lavorare, saltando fatti e falliti di recente.
 *  Unico punto che avanza il cursore: i worker non si pestano. */
function prossimo(): any | null {
  while (cursore < all.length) {
    const d = all[cursore++];
    if (seeded.has(d.slug)) continue;
    const f = state.failed[d.slug];
    if (f && Date.now() - f.at < RETRY_AFTER_MS) continue;
    return d;
  }
  return null;
}

async function refreshSeeded(): Promise<void> {
  if (refreshInCorso) return;
  refreshInCorso = true;
  try {
    seeded = await loadSeeded();
  } catch (e: any) {
    // Se il database si è appena piantato, meglio aspettare che continuare a
    // generare item che non riusciremmo a salvare.
    console.warn(`${ts()} refresh lista fallito (${String(e.message).slice(0, 120)}): aspetto che il database torni.`);
    seeded = await attendiDatabase();
  } finally {
    refreshInCorso = false;
  }
}

async function lavora(d: any): Promise<void> {
  // Un errore di rete NON è un difetto dell'item: si riprova lo stesso
  // descrittore (una volta) invece di saltarlo. Prima si passava al
  // successivo lasciando il server a finire il lavoro precedente: due
  // generazioni sovrapposte e memoria esaurita.
  for (let tentativoRete = 1; tentativoRete <= 2 && !stop; tentativoRete++) {
    const t0 = Date.now();
    let res: { status: number; body: any };
    try {
      res = await generate(d);
    } catch (e: any) {
      retiKO++;
      console.error(`${ts()} ${d.slug}: rete KO (${String(e.message).slice(0, 80)})${tentativoRete < 2 ? ' — riprovo tra 30s' : ' — lo lascio ai prossimi giri'}`);
      if (tentativoRete < 2) await sleep(30000);
      continue;
    }
    const sec = Math.round((Date.now() - t0) / 1000);

    if (res.status === 200 && res.body?.itinerary) {
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
      state.failed[d.slug] = { n: (state.failed[d.slug]?.n || 0) + 1, at: Date.now() };
      saveState(state);
      console.log(`${ts()} - ${d.slug} scartato (${sec}s): ${String(res.body?.reason || res.body?.error || '').slice(0, 160)}`);
    } else if (res.status === 429) {
      console.log(`${ts()} 429 rate limit su ${d.slug}: attesa 60s e ritento`);
      await sleep(60000);
      continue;
    } else {
      console.error(`${ts()} ! ${d.slug}: HTTP ${res.status} (${sec}s) ${JSON.stringify(res.body).slice(0, 140)}`);
      await sleep(15000);
    }
    return;
  }
}

async function worker(n: number): Promise<void> {
  while (!stop && salvati + scartati < MAX) {
    const d = prossimo();
    if (!d) return;
    await lavora(d);
    if (++daUltimoRefresh >= REFRESH_EVERY) { daUltimoRefresh = 0; await refreshSeeded(); }
    await sleep(PAUSE);
  }
}

// Gli item sono quasi tutta attesa di rete (i motori AI impiegano minuti), la
// CPU del droplet resta ferma: lavorarne più di uno alla volta moltiplica la
// resa senza costare nulla. Il tetto è la memoria del processo API, non il
// processore — da qui il default prudente di 3.
console.log(`${ts()} ${CONCURRENZA} item in parallelo.`);
await Promise.all(Array.from({ length: CONCURRENZA }, (_, i) => worker(i + 1)));

console.log(`${ts()} fine giro: ${salvati} salvati, ${scartati} scartati, ${rimandati} rimandati, ${retiKO} errori di rete. In biblioteca: ${seeded.size}/${all.length}.`);

// Giro a vuoto (catalogo finito o tutto in attesa dei ritentativi): pm2
// riavvierebbe subito il processo, che rifarebbe il giro in un lampo e
// ripartirebbe di nuovo. Mezz'ora di pausa prima di uscire evita il
// mulinello e lascia scadere i 24h dei descrittori scartati.
if (!stop && salvati === 0 && scartati === 0) {
  console.log(`${ts()} niente da seminare in questo giro: pausa di 30 minuti prima di ricominciare.`);
  await sleep(30 * 60 * 1000);
}
