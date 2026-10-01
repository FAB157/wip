#!/usr/bin/env node
/**
 * FOTO DELLE GEMME (16-18/09/2026, committente: «attiva la ricerca e il
 * salvataggio delle foto dei POI, iniziamo con le gemme», «deve usare
 * SearXNG», «questo processo deve essere sempre attivo», «report ogni 200»).
 *
 * NIENTE RICERCA IMMAGINI GENERICA (Google/Bing Images): la regola del
 * repository, nata dall'incidente delle foto di La Spezia sbagliate
 * (22/08/2026), vieta una foto trovata per parola chiave — serve una fonte
 * legata al LUOGO. Ordine voluto dal committente («prima sito ufficiale, in
 * caso nulla sito alternativo: Wikipedia o altro sito istituzionale; come
 * ultima strada social ecc., ma da accettare»):
 *
 *  1. SITO UFFICIALE / ENTE PUBBLICO — contact_website se noto, altrimenti
 *     ricerca TESTUALE su SearXNG (droplet 104, X-Searx-Token) accettata solo
 *     se il risultato e la pagina nominano davvero il luogo e il dominio è
 *     dell'ente o richiama il nome; dalla pagina si prende og:image.
 *     → scrittura diretta, image_source 'sito_ufficiale:<dominio>'.
 *  2. FONTI APERTE VERIFICATE — voce Wikipedia già collegata (og:image), poi
 *     la pipeline stretta del 07/09 (scratch/footprint-pilot/ripara-da-lista):
 *     Wikidata P18 → Wikipedia geosearch 1 km con titolo IDENTICO (it, en) →
 *     Commons geosearch 150 m con nome che combacia; stemmi/bandiere/loghi
 *     filtrati ovunque, MAI il file «più vicino» senza match sul nome.
 *     → scrittura diretta, image_source 'wikipedia:<host>' / 'wikidata_p18' /
 *       'wikipedia_it' / 'wikipedia_en' / 'commons_geosearch'.
 *  3. FONTI TERZE (blog, social, guide turistiche) via SearXNG — la foto NON
 *     tocca mai shared_pois: va in foto_pois_da_verificare ('da_verificare'),
 *     invisibile in app finché il committente non la approva.
 *
 * Nessuna chiamata AI. Sempre attivo: gira sotto systemd (foto-gemme.service,
 * Restart=always), un giro dopo l'altro; le gemme già esaminate si ritentano
 * dopo RITENTA_GIORNI.
 *
 *   node scripts/foto-gemme-sito-ufficiale.mjs [--limit=N] [--pausa=600]
 */
import fs from 'fs';
import path from 'path';

const BASE_DIR = process.env.SEMINA_DIR || '.';
const env = {};
// Prima il .env della semina, poi — SOLO per le chiavi che mancano — quello
// del server (/opt/wip/.env sul droplet): SEARXNG_URL/SEARXNG_TOKEN stanno lì
// e non nella cartella della semina. Senza questo ripiego lo script usciva
// subito con «Manca SEARXNG_URL» e il supervisore lo rilanciava ogni 10 s:
// 5.296 riavvii a vuoto nella notte fra il 16 e il 17/09/2026.
for (const f of [path.join(BASE_DIR, '.env'), path.join(BASE_DIR, '.env.local'), '/opt/wip/.env']) {
  try {
    for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const SB = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const SEARXNG_URL = env.SEARXNG_URL;
const SEARXNG_TOKEN = env.SEARXNG_TOKEN;
if (!SB || !KEY) { console.error('Manca VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nel .env'); process.exit(1); }
if (!SEARXNG_URL) { console.error('Manca SEARXNG_URL nel .env'); process.exit(1); }

const arg = (nome, def) => { const m = process.argv.find(a => a.startsWith(`--${nome}=`)); return m ? m.split('=')[1] : def; };
const LIMIT = parseInt(arg('limit', '100000000'), 10);
const PAUSA_MS = parseInt(arg('pausa', '600'), 10);
const SOLO_GEMME = process.argv.includes('--solo-gemme'); // senza: gemme, poi tutti i POI delle quattro famiglie
const TERZO_LIVELLO_PER_TUTTI = process.argv.includes('--terzo-livello-per-tutti');
// Più POI insieme (18/09/2026, «caricane più che puoi»): la maggior parte del
// tempo per gemma è attesa di rete (SearXNG, Wikipedia, Commons), non CPU —
// lavorarne N insieme accorcia il giro quasi di N volte. Tenuto basso perché
// Gonka condivide la chiave MUSEI con la semina dei musei (che già vede
// 429/502 con 5 richieste insieme) e SearXNG serve anche a loro.
const CONCORRENZA = Math.max(1, parseInt(arg('concorrenza', '3'), 10));
const RITENTA_GIORNI = 7;
// Due servizi in parallelo dal 18/09: foto-gemme.service (--solo-gemme) e
// foto-poi.service (--solo-ampio), ognuno col suo stato e il suo elenco dei
// visti — uno solo in fila avrebbe fatto aspettare giorni il giro ampio.
const SOLO_AMPIO = process.argv.includes('--solo-ampio');
const STATO_FILE = path.join(BASE_DIR, 'scratch', SOLO_AMPIO ? 'foto-poi-stato.json' : 'foto-gemme-stato.json');
const VISTI_FILE = path.join(BASE_DIR, 'scratch', SOLO_AMPIO ? 'foto-poi-visti.tsv' : 'foto-gemme-visti.tsv');
const UA = 'WorldInPocket/1.0 (https://wip.guide; support@wip.guide)';
const STATI_VISIBILI = new Set(['verified', 'auto', 'approved']);

const normalizza = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const PAROLE_VUOTE = new Set(['di','del','della','dello','dei','degli','delle','the','of','la','le','il','lo','i','gli','a','e','and','da','in','al','alla','san','santa','saint','st']);
const paroleSignificative = (s) => normalizza(s).split(' ').filter(w => w.length >= 3 && !PAROLE_VUOTE.has(w));
/** Sovrapposizione: quante parole significative del nome compaiono nel testo. */
function sovrapposizione(nome, testo) {
  const parole = paroleSignificative(nome);
  if (!parole.length) return 0;
  const t = normalizza(testo);
  const trovate = parole.filter(p => t.includes(p)).length;
  return trovate / parole.length;
}

// ── GONKA COME GIUDICE (18/09/2026, committente: «usa Gonka») ───────────────
// Gonka è solo testo: non guarda la foto. Giudica però meglio di una regex la
// domanda che al primo giro sbagliavamo 21 volte su 24: «questo file, dal
// titolo X, scattato entro 150 m, ritrae davvero QUESTO luogo o solo la sua
// città / un altro soggetto?» — in qualunque lingua (titoli in cinese,
// composti tedeschi). Regole del 16/09: canale GonkaRouter ammesso in sfondo,
// modello DeepSeek-V4-Flash (gli altri due offerti sono inaffidabili), pool
// «musei», caso d'uso e tetto dichiarati: GONKA_FOTO_GEMME_LIMIT_USD (default
// 1 $ al mese), e la spesa si somma al contatore del pool che il server già
// controlla (gonka_semina_usd_musei_AAAA-MM). Senza chiave, a tetto raggiunto
// o su errore risponde null e il chiamante ricade sulle regole a regex.
const GONKA_KEY = env.GONKAROUTER_API_KEY_MUSEI || '';
const GONKA_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731';
// Tetto: 10 $/mese (committente, 18/09/2026: «aumenta il tetto gonka a 10 dollari al mese»).
const GONKA_TETTO_USD = (() => { const raw = String(env.GONKA_FOTO_GEMME_LIMIT_USD ?? '').trim(); const v = Number(raw); return raw !== '' && Number.isFinite(v) && v >= 0 ? v : 10; })();
const gonka = { chiamate: 0, usdMese: 0, usdDaRegistrare: 0, mese: '' };

async function registraSpesaGonka() {
  if (gonka.usdDaRegistrare <= 0) return;
  const chiave = `gonka_semina_usd_musei_${new Date().toISOString().slice(0, 7)}`;
  try {
    const r = await fetch(`${SB}/rest/v1/api_cache?cache_key=eq.${chiave}&select=text_content`, { headers: H, signal: AbortSignal.timeout(10000) });
    const riga = r.ok ? (await r.json())[0] : null;
    const nuovo = ((Number(riga?.text_content) || 0) + gonka.usdDaRegistrare).toFixed(6);
    const w = riga
      ? await fetch(`${SB}/rest/v1/api_cache?cache_key=eq.${chiave}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ text_content: nuovo }) })
      : await fetch(`${SB}/rest/v1/api_cache`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ cache_key: chiave, content_type: 'counter', text_content: nuovo }) });
    if (w.ok) gonka.usdDaRegistrare = 0;
  } catch { /* si riprova al prossimo giro di registrazione */ }
}

/** Una domanda a Gonka, risposta JSON. null = non disponibile (si ricade sulle regex). */
async function chiediAGonka(domanda) {
  const mese = new Date().toISOString().slice(0, 7);
  if (gonka.mese !== mese) { gonka.mese = mese; gonka.usdMese = 0; }
  if (!GONKA_KEY || gonka.usdMese >= GONKA_TETTO_USD) return null;
  try {
    const r = await fetch('https://api.gonkarouter.io/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GONKA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GONKA_MODEL, temperature: 0, max_tokens: 300, messages: [
        { role: 'system', content: 'You verify photo metadata for a travel app. Answer ONLY with a JSON object, no prose.' },
        { role: 'user', content: domanda },
      ] }),
      signal: AbortSignal.timeout(150000),
    });
    if (!r.ok) { console.warn(`     [gonka] HTTP ${r.status}`); return null; }
    const j = await r.json();
    const usd = (Number(j?.usage?.total_tokens) || 0) * 0.0018 / 1e6; // listino Gonka: 0,0018 $ per 1M token
    gonka.chiamate++; gonka.usdMese += usd; gonka.usdDaRegistrare += usd;
    if (gonka.chiamate % 25 === 0) await registraSpesaGonka();
    const testo = String(j?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Il PRIMO oggetto JSON (sono oggetti piatti, senza graffe annidate): il
    // modello a volte ne scrive due o aggiunge testo dopo — «Unexpected
    // non-whitespace character after JSON» al secondo giudizio del 18/09.
    const primo = testo.match(/\{[^{}]*\}/);
    if (!primo) return null;
    return JSON.parse(primo[0]);
  } catch (e) { console.warn(`     [gonka] non disponibile: ${e?.message || e}`); return null; }
}

const descriviLuogo = (g) => `PLACE: "${g.name}" — category: ${g.category || 'n/a'}; town: ${g.city || 'unknown'}; country: ${g.country || 'unknown'}.`;

/** Quale dei file vicini ritrae davvero il luogo? indice, -1 = nessuno, null = Gonka assente. */
async function gonkaScegliFile(g, titoli) {
  const out = await chiediAGonka(`${descriviLuogo(g)}
These are the titles of photo files taken within 150 m of it:
${titoli.map((t, i) => `${i}. ${t}`).join('\n')}
Which file's TITLE shows that the photo depicts THIS place itself (the promenade / square / beach / monument named above, or a view of it)? A title that only names the town or district, or that names another subject (a church, mosque, hotel, shop, restaurant, port, statue, building, event, protest, vehicle, person) is NOT a match. When in doubt answer -1.
JSON: {"indice": <number or -1>, "motivo": "<short reason>"}`);
  if (!out || typeof out.indice !== 'number') return null;
  return Number.isInteger(out.indice) && out.indice >= 0 && out.indice < titoli.length ? out.indice : -1;
}

/** Il sito trovato è davvero quello ufficiale del luogo (o dell'ente che lo gestisce)? true/false, null = Gonka assente. */
async function gonkaSitoUfficiale(g, url, titoloPagina) {
  const out = await chiediAGonka(`${descriviLuogo(g)}
Web page: ${url}
Page title: "${String(titoloPagina).slice(0, 160)}"
Is this the OFFICIAL website of the place, or a page of the public body / institution that manages it (municipality, park authority, heritage agency, the museum or church itself)? Third-party catalogues, travel guides, blogs, booking sites, hiking apps and encyclopedias are NOT official. When in doubt answer false.
JSON: {"ufficiale": true|false, "motivo": "<short reason>"}`);
  return out && typeof out.ufficiale === 'boolean' ? out.ufficiale : null;
}

// ── 1. SITO UFFICIALE (SearXNG) ─────────────────────────────────────────────

// TETTO DI RICERCHE (19/09/2026, segnalato da chi rimette in salute SearXNG):
// ogni ricerca SearXNG interroga 5 motori, e 35 ricerche/min da un solo IP di
// datacenter hanno fatto sospendere Google (CAPTCHA), Brave e Google CSE «too
// many requests». Con concorrenza 3 e due servizi avevo moltiplicato io il
// carico. Ora le ricerche di QUESTO processo escono in fila, una ogni
// SEARX_GAP_MS (default 6 s = 10/min per processo), qualunque sia la
// concorrenza: gli altri passi (Wikipedia, Wikidata, Commons) non lo pagano.
const SEARX_GAP_MS = Math.max(0, parseInt(arg('searx-gap', '6000'), 10));
let searxProssimoVia = 0;
async function turnoSearx() {
  const ora = Date.now();
  const via = Math.max(ora, searxProssimoVia);
  searxProssimoVia = via + SEARX_GAP_MS;
  if (via > ora) await new Promise(res => setTimeout(res, via - ora));
}

/** `g._searxKO = true` se la ricerca è FALLITA (errore, timeout, HTTP no): non «niente trovato». */
async function searxngSearch(query, g = null) {
  await turnoSearx();
  try {
    const u = new URL(`${SEARXNG_URL.replace(/\/$/, '')}/search`);
    u.searchParams.set('q', query);
    u.searchParams.set('format', 'json');
    const headers = { 'User-Agent': UA };
    if (SEARXNG_TOKEN) headers['X-Searx-Token'] = SEARXNG_TOKEN;
    const r = await fetch(u.toString(), { headers, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { if (g) g._searxKO = true; return []; }
    const j = await r.json();
    return Array.isArray(j?.results) ? j.results : [];
  } catch { if (g) g._searxKO = true; return []; }
}

/** Legge l'HTML di una pagina, con timeout e tetto di dimensione. */
async function fetchHtml(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorldInPocketBot/1.0; +https://wip.guide)' },
      signal: AbortSignal.timeout(12000), redirect: 'follow',
    });
    if (!r.ok) return null;
    const ct = String(r.headers.get('content-type') || '');
    if (!/text\/html/i.test(ct)) return null;
    const reader = r.body?.getReader();
    if (!reader) return await r.text();
    let out = ''; let bytes = 0;
    while (bytes < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      out += Buffer.from(value).toString('utf8');
      bytes += value.length;
    }
    try { reader.cancel(); } catch {}
    return out;
  } catch { return null; }
}

/**
 * og:image, poi twitter:image; SOLO se `soloMeta` è falso anche la prima
 * <img> della pagina. Per la scrittura diretta si usa soloMeta=true: l'og:image
 * è la foto che il sito ha SCELTO per rappresentarsi, la prima <img> no — al
 * primo giro del 18/09 il Centro Storico di Cosenza prendeva
 * «credits_accademia3.jpg», il banner dei crediti. Il ripiego resta solo per
 * le candidate da verificare, che un umano guarda prima di accettare.
 */
function estraiImmagine(html, baseUrl, soloMeta = false) {
  // Anche le og:image «di servizio»: il 18/09 le «piazze dei Teatri» di Reggio
  // Emilia prendevano dal sito del teatro «simboli-tv-e-newsletter.jpg».
  const scartare = /logo|icon|sprite|favicon|placeholder|avatar|pixel\.gif|spinner|loader|credits?|sponsor|partner|banner|footer|cookie|badge|button|bg[-_.]|background|newsletter|simbol|default[-_.]|social[-_]?(share|card|image)|og[-_]?image|cover[-_]?default/i;
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og?.[1] && !scartare.test(og[1])) return risolviUrl(og[1], baseUrl);
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (tw?.[1] && !scartare.test(tw[1])) return risolviUrl(tw[1], baseUrl);
  if (soloMeta) return '';
  const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const src of imgs) {
    if (scartare.test(src)) continue;
    if (/\.(svg)(\?|$)/i.test(src)) continue;
    return risolviUrl(src, baseUrl);
  }
  return '';
}
function risolviUrl(src, base) {
  try { return new URL(src, base).href; } catch { return ''; }
}

/** L'immagine esiste, è davvero un'immagine, e non è minuscola (icona travestita). */
async function verificaImmagine(url) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorldInPocketBot/1.0)' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return false;
    const ct = String(r.headers.get('content-type') || '');
    if (!/^image\//i.test(ct)) return false;
    const len = parseInt(r.headers.get('content-length') || '0', 10);
    if (len && len < 8000) return false; // sotto 8 KB è quasi sempre un'icona
    return true;
  } catch { return false; }
}

const hostDi = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

const RE_ENTE_FIDATO = /\.gov(\.|$)|\.gob(\.|$)|\.gouv\.|comune\.|\.mairie\.|parcoregionale|parconazionale|\.pref\.|beniculturali\.it|turismo\.|\.museum$/i;

/** Il dominio è dell'ente pubblico che gestisce il luogo, o richiama il nome del luogo. */
function dominioUfficiale(host, nome) {
  const scartati = /wikipedia\.org|wikimedia\.org|facebook\.com|instagram\.com|twitter\.com|x\.com|tripadvisor\.|booking\.com|google\.com|maps\.|yelp\.|pagesjaunes|foursquare\.com|getyourguide|viator\.com|expedia\.|komoot\.|alltrails\.|outdooractive\./i;
  if (!host || scartati.test(host)) return false;
  // Enti pubblici: .gov/.gob/.gouv anche in coda (nps.gov, non solo gov.uk —
  // il primo giro del 17/09 mandava il National Park Service fra le
  // «candidate da verificare» per un punto mancante).
  if (RE_ENTE_FIDATO.test(host)) return true;
  // Altrimenti deve essere IL sito della gemma: pezzi di almeno 4 lettere e
  // TLD tolto per intero — «monestirs.cat» passava per la cattedrale di
  // Mondoñedo perché «cat» sta dentro «catedral».
  const senzaTld = host.replace(/\.(co\.uk|com\.[a-z]{2}|org\.[a-z]{2}|gov\.[a-z]{2}|[a-z]{2,6})$/, '');
  const paroleDominio = paroleSignificative(senzaTld.replace(/[-.]/g, ' ')).filter(d => d.length >= 4);
  const paroleNome = paroleSignificative(nome).filter(p => p.length >= 4);
  return paroleNome.some(p => paroleDominio.some(d => d.includes(p) || p.includes(d)));
}

async function daSitoUfficiale(g, { sitoNoto = true, ricerca = true } = {}) {
  const prova = async (u, sogliaPagina) => {
    const html = await fetchHtml(u);
    if (!html || sovrapposizione(g.name, html.slice(0, 6000)) < sogliaPagina) return null;
    const foto = estraiImmagine(html, u, true); // scrittura diretta: solo l'immagine scelta dal sito
    if (!foto || eAraldico(foto) || !(await verificaImmagine(foto))) return null;
    const dominio = hostDi(u).replace(/^www\./, '');
    // Secondo parere di Gonka: un catalogo di terzi che parla del luogo
    // (monestirs.cat per la cattedrale di Mondoñedo) non è il sito ufficiale.
    // Se dice di no, la foto non si butta: va fra le candidate da verificare.
    const titoloPagina = (html.match(/<title[^>]*>([^<]{0,200})/i) || [])[1] || '';
    const parere = await gonkaSitoUfficiale(g, u, titoloPagina);
    // Il «sito» scritto nel POI non è una prova (18/09/2026): i dati Overture
    // davano dorsetcamper.com (noleggio camper) alla Weymouth Promenade e
    // mallorca.com alla passeggiata di Palma, e con Gonka in pausa (429)
    // passavano dritti in app (mallorca.com persino con il dominio «giusto»:
    // è un portale commerciale). Ora scrive da solo soltanto il dominio di un
    // ENTE pubblico; per ogni altro serve il sì esplicito di Gonka. Il resto
    // → candidata da verificare.
    const ente = RE_ENTE_FIDATO.test(hostDi(u));
    if (parere === false || (!ente && parere !== true)) {
      return { url: foto, fonte: `sito_ufficiale:${dominio}`, certa: false, pagina: u, dominioCandidata: dominio, tipoCandidata: classificaFonteTerza(hostDi(u)) };
    }
    return { url: foto, fonte: `sito_ufficiale:${dominio}`, sito: u };
  };
  // Un contact_website che punta a Wikipedia non è un sito ufficiale: lo
  // valuta viaWikipediaCollegata, con la sua prova sul titolo dell'articolo.
  if (sitoNoto && g.contact_website && !/wiki[pm]edia\.org/i.test(hostDi(g.contact_website))) {
    const t = await prova(g.contact_website, 0.5); // sito noto: deve comunque confermare il nome
    if (t) return t;
  }
  if (!ricerca) return null;
  const luogo = [g.city, g.country].filter(Boolean).join(' ');
  const risultati = await searxngSearch(`"${g.name}" ${luogo} sito ufficiale`.trim(), g);
  for (const cand of risultati.slice(0, 5)) {
    const u = String(cand.url || '');
    if (!u || sovrapposizione(g.name, `${cand.title || ''} ${cand.content || ''}`) < 0.6) continue;
    if (!dominioUfficiale(hostDi(u), g.name)) continue;
    const t = await prova(u, 0.5);
    if (t) return t;
  }
  return null;
}

// ── 2. FONTI APERTE VERIFICATE (Wikipedia collegata, P18, geosearch) ────────

const RE_ARALDICO = /gonfalone|stemma|coat[_ ]of[_ ]arms|coa[_-]|bandiera|flag[_ ]of|blazon|logo[_-]|wappen|armoiries|escudo|seal[_ ]of|emblem/i;
function eAraldico(url) { return RE_ARALDICO.test(String(url || '')); }

const STOP_NOME = new Set(['di','del','della','dei','delle','degli','the','of','la','le','il','lo','san','santa','santo','chiesa','church','museo','museum','palazzo','villa','via','piazza','torre','castello','castle','cattedrale','cathedral','basilica','passeggiata','lungomare','promenade','seafront','waterfront','square','plaza','place','platz',
  // Anche il TIPO non è un pezzo proprio del nome (18/09): «Beach Promenade d'Annunzio» prendeva «Lido beach, Venice» per il solo «beach».
  'beach','spiaggia','plage','playa','praia','strand','boardwalk','esplanade','corniche','lungolago','promenades','strandpromenade','uferpromenade','seepromenade','walkway']);
function tokensSignificativi(s) {
  return normalizza(s).split(' ').filter(t => t.length >= 4 && !STOP_NOME.has(t));
}
function nomeCombacia(candidato, nome) {
  const a = tokensSignificativi(candidato), b = tokensSignificativi(nome);
  if (!a.length || !b.length) return false;
  return a.some(t => b.includes(t));
}

// L'ARTICOLO DEVE ESSERE QUELLO DEL LUOGO, NON DELLA SUA CITTÀ (18/09/2026):
// molte gemme hanno come wikipedia_url la voce del comune, e la foto di testa
// della voce finiva sul POI — «PAMUCAK/İzmir» con piazza Cumhuriyet, «Playa
// de San Sebastian» col municipio, la spiaggia dell'Arcomagno col paese. Il
// TITOLO dell'articolo deve portare i pezzi propri del nome (tutti se sono
// uno o due, i due terzi se di più); altrimenti la foto va fra le candidate.
function articoloDelLuogo(titoloArticolo, g) {
  const distintivi = tokensDistintivi(g);
  if (!distintivi.length) return false;
  const nelTitolo = new Set(tokensSignificativi(String(titoloArticolo).replace(/\s[-–—]\s*wikip[eé]dia.*$/i, '')));
  const trovati = distintivi.filter(t => nelTitolo.has(t)).length;
  return trovati >= (distintivi.length <= 2 ? distintivi.length : Math.ceil(distintivi.length * 2 / 3));
}

async function viaWikipediaCollegata(g) {
  const voce = g.wikipedia_url || (/wikipedia\.org/i.test(hostDi(g.contact_website)) ? g.contact_website : '');
  if (!voce) return null;
  const html = await fetchHtml(voce);
  if (!html || sovrapposizione(g.name, html.slice(0, 6000)) < 0.4) return null;
  const foto = estraiImmagine(html, voce, true);
  if (!foto || eAraldico(foto) || !(await verificaImmagine(foto))) return null;
  const titolo = (html.match(/<title[^>]*>([^<]{0,200})/i) || [])[1] || '';
  if (!articoloDelLuogo(titolo, g)) return { url: foto, fonte: `wikipedia:${hostDi(voce)}`, certa: false, pagina: voce, dominioCandidata: hostDi(voce), tipoCandidata: 'commons' };
  return { url: foto, fonte: `wikipedia:${hostDi(voce)}` };
}

async function viaWikidata(qid) {
  if (!/^Q\d+$/.test(String(qid || ''))) return null;
  try {
    const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const p18 = (await r.json())?.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!p18 || eAraldico(p18)) return null;
    return { url: `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(String(p18).replace(/ /g, '_'))}&width=800`, fonte: 'wikidata_p18' };
  } catch { return null; }
}

async function viaWikipediaGeosearch(lingua, g) {
  try {
    const r = await fetch(`https://${lingua}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${g.lat}|${g.lon}&gsradius=1000&gslimit=10&gsprop=type&format=json&origin=*`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const pagine = ((await r.json()).query?.geosearch || []).filter(p => !/^(comune|city|town|village) of /i.test(p.title || ''));
    const stessa = pagine.find(p => String(p.title).toLowerCase() === String(g.name || '').toLowerCase()); // titolo IDENTICO
    if (!stessa) return null;
    const s = await fetch(`https://${lingua}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(stessa.title)}`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!s.ok) return null;
    const j = await s.json();
    const foto = j.thumbnail?.source || j.originalimage?.source || '';
    if (!foto || eAraldico(foto)) return null;
    return { url: foto, fonte: `wikipedia_${lingua}` };
  } catch { return null; }
}

// IL NOME DELLA CITTÀ NON BASTA (18/09/2026, primo giro vero): con «un pezzo
// qualsiasi del nome» la Rheinpromenade del Medienhafen prendeva «Regional
// Government of Düsseldorf», il Waterfront di Albany un Hilton Garden Inn, la
// piazza di Cathedral City una manifestazione — file VICINI che nominano la
// città, ma con un altro soggetto. Ora contano solo i pezzi DISTINTIVI del
// nome (tolti città, paese, punti cardinali, «city/town»), ne deve combaciare
// almeno la metà, e i titoli che dichiarano un altro soggetto si scartano.
// Un file vicino che combacia solo alla larga non si butta: va fra le
// candidate da verificare (licenza Commons a posto, dubbio solo sul soggetto).
const GENERICI_GEO = new Set(['north','south','east','west','northern','southern','eastern','western','nord','sud','est','ovest','centro','central','centrale','city','town','village','citta','ville','stadt','old','vecchio','nuovo']);
const RE_ALTRO_SOGGETTO = /protest|rally|demonstrat|manifestaz|strike|riot|parade|portrait|selfie|hotel|\binn\b|hostel|restaurant|ristorante|\bshop\b|\bstore\b|office|government|regierung|ministry|ministero|police|polizia|\bcar\b|\bbus\b|\btram\b|\btrain\b|locomotiv|aircraft|airplane|\bship\b|wedding|concert|festival|marathon|no[_ ]kings/i;
function tokensDistintivi(g) {
  const geo = new Set([...tokensSignificativi(g.city), ...tokensSignificativi(g.country)]);
  return tokensSignificativi(g.name).filter(t => !geo.has(t) && !GENERICI_GEO.has(t));
}
// IL TIPO DEVE COMBACIARE (regola n.2 delle passate Commons del 24-25/08,
// ricordata da android-1a il 18/09): se il nome dice che è una passeggiata,
// una piazza o una spiaggia, il titolo del file deve dirlo anche lui —
// «Lungomare di Numana» non può prendere «Porto di Numana».
const FAMIGLIE_TIPO = [
  /promenade|lungomare|lungolago|passeggiata|seafront|waterfront|boardwalk|esplanade|malecon|paseo|corniche|\bquai\b|ufer|\briva\b/,
  /piazza|square|platz|plaza|\bplace\b|praca|plein|\btrg\b|namesti/,
  /beach|spiaggia|plage|playa|praia|\bstrand\b/,
];
function tipoCombacia(titoloFile, nome) {
  const n = normalizza(nome), t = normalizza(titoloFile);
  const famiglie = FAMIGLIE_TIPO.filter(re => re.test(n));
  return !famiglie.length || famiglie.some(re => re.test(t));
}
function combaciaPerBene(titoloFile, g) {
  if (!tipoCombacia(titoloFile, g.name)) return false;
  const distintivi = tokensDistintivi(g);
  if (!distintivi.length) return false;
  const nelTitolo = new Set(tokensSignificativi(titoloFile));
  const trovati = distintivi.filter(t => nelTitolo.has(t)).length;
  return trovati >= Math.max(1, Math.ceil(distintivi.length / 2));
}

async function viaCommonsGeosearch(g) {
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${g.lat}|${g.lon}&gsradius=150&gslimit=10&gsnamespace=6&format=json&origin=*`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const file = ((await r.json()).query?.geosearch || [])
      .filter(p => /\.(jpe?g|png)$/i.test(p.title) && !eAraldico(p.title) && !RE_ALTRO_SOGGETTO.test(p.title) && !/statue|map|plan\.(jpe?g|png)$/i.test(p.title));
    const urlDi = (p) => `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(p.title.replace(/^File:/, '').replace(/ /g, '_'))}&width=800`;
    if (!file.length) return null;
    const certo = file.find(p => combaciaPerBene(p.title, g));
    if (certo) return { url: urlDi(certo), fonte: 'commons_geosearch', certa: true };
    // Le regex non trovano un match pieno: Gonka fa da ARBITRO, ma solo fra
    // i file che contengono già un pezzo proprio del nome del luogo. Da solo
    // non basta: al primo giudizio del 18/09, per «Fountain Square» ha scelto
    // «The Beatles Monument in Ulaanbaatar» (un monumento lì vicino, proprio
    // ciò che il prompt vietava) ed è finita in app. Con questo vincolo un
    // file senza il nome non può passare; Gonka decide i casi veri — «Place
    // royale du Peyrou» per la Promenade du Peyrou sì, «Porto di Numana» per
    // il Lungomare di Numana no. Gonka assente → niente scrittura diretta.
    const conNome = file.filter(p => nomeCombacia(p.title, g.name || '') && tokensDistintivi(g).some(t => tokensSignificativi(p.title).includes(t)));
    if (conNome.length) {
      const scelto = await gonkaScegliFile(g, conNome.map(p => p.title.replace(/^File:/, '')));
      if (scelto !== null && scelto >= 0) {
        console.log(`     [gonka] sceglie «${conNome[scelto].title.slice(5, 75)}»`);
        return { url: urlDi(conNome[scelto]), fonte: 'commons_geosearch', certa: true, giudice: 'gonka' };
      }
    }
    const largo = file.find(p => nomeCombacia(p.title, g.name || '')); // MAI il più vicino senza match sul nome
    if (largo) return { url: urlDi(largo), fonte: 'commons_geosearch', certa: false, pagina: `https://commons.wikimedia.org/wiki/${encodeURIComponent(largo.title.replace(/ /g, '_'))}` };
    return null;
  } catch { return null; }
}

async function daFontiAperte(g) {
  return (await viaWikipediaCollegata(g))
    || (await viaWikidata(g.wikidata))
    || (await viaWikipediaGeosearch('it', g))
    || (await viaWikipediaGeosearch('en', g))
    || (await viaCommonsGeosearch(g));
}

// ── 3. FONTI TERZE → SOLO DA VERIFICARE ─────────────────────────────────────

function classificaFonteTerza(host) {
  if (/instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|pinterest\./i.test(host)) return 'social';
  if (/tripadvisor\.|lonelyplanet\.|timeout\.com|michelin\.|guida|guide\.|routard\.|viaggi|komoot\.|alltrails\.|outdooractive\./i.test(host)) return 'guida';
  if (/blog|wordpress\.|blogspot\.|medium\.com|tumblr\./i.test(host)) return 'blog';
  return 'terzi';
}

/** La foto NON tocca mai shared_pois: entra in foto_pois_da_verificare. */
async function terzoLivelloDaVerificare(g) {
  try {
    const luogo = [g.city, g.country].filter(Boolean).join(' ');
    const risultati = await searxngSearch(`"${g.name}" ${luogo} foto`.trim(), g);
    let scritte = 0;
    for (const cand of risultati.slice(0, 8)) {
      if (scritte >= 2) break; // due candidate bastano, non si vuole allagare la coda
      const u = String(cand.url || '');
      const host = hostDi(u);
      if (!host || /wikipedia\.org|wikimedia\.org|google\.com|maps\./i.test(host)) continue;
      // Soglia alta: a 0,5 «Promenade d'Happeau» prendeva un dizionario
      // tedesco (dwds.de) perché c'era la parola «promenade».
      if (sovrapposizione(g.name, `${cand.title || ''} ${cand.content || ''}`) < 0.75) continue;
      if (/dwds\.de|treccani\.|wiktionary|dictionary|dizionario|wordreference|glosbe|reverso/i.test(host)) continue;
      const h = await fetchHtml(u);
      if (!h || sovrapposizione(g.name, h.slice(0, 6000)) < 0.6) continue;
      const foto = estraiImmagine(h, u);
      if (!foto || eAraldico(foto) || !(await verificaImmagine(foto))) continue;
      const dominio = host.replace(/^www\./, '');
      const r = await fetch(`${SB}/rest/v1/foto_pois_da_verificare`, {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ poi_id: g.id, poi_nome: g.name, foto_url: foto, fonte_url: u, fonte_dominio: dominio, fonte_tipo: classificaFonteTerza(host) }),
      });
      if (r.ok) { scritte++; console.log(`     → candidata da verificare: ${g.name} — ${dominio} (${classificaFonteTerza(host)})`); }
    }
    return scritte;
  } catch (e) { console.warn(`  ⚠ ${g.name}: terzo livello fallito — ${e?.message || e}`); return 0; }
}

// ── LETTURA DELLE GEMME ─────────────────────────────────────────────────────
// `is_gem` da solo non è indicizzato: «is_gem=true ORDER BY id» scandisce
// tutta la tabella e va in timeout (57014); `category` sì. Si pagina per id
// (keyset) DENTRO ogni categoria — provato a secco da android-5a il 17/09.
// L'offset profondo su questa tabella va in timeout allo stesso modo.
const CATEGORIE = ['square', 'beach', 'monument', 'natura', 'gemme', 'monumenti', 'chiese', 'musei',
  'church', 'museum', 'castle', 'viewpoint', 'localita', 'lighthouse', 'harbour', 'park', 'attraction',
  'synagogue', 'stadium', 'peak', 'waterfall', 'cave', 'lake', 'island', 'bridge', 'theatre', 'tower',
  'ruins', 'archaeological_site', 'memorial', 'fort', 'enogastronomia'];

// TUTTI I POI, NON SOLO LE GEMME (ordine del committente 18/09/2026: «fai
// continuare il servizio su tutti i poi: monumenti, panorami, musei e
// chiese»). Finite le gemme, il giro prosegue sulle quattro famiglie, nei
// valori di `category` che la tassonomia dell'app ci mette dentro
// (MONUMENTI/PANORAMI/MUSEI/CHIESE_TYPES di src/lib/poiTaxonomy.ts; fuori
// «attraction» e «artwork», troppo generici, e i sentieri). Sono milioni di
// righe: il cursore di ogni categoria sta nello stato, così un riavvio
// riprende da dov'era invece di rileggere tutto; a categoria finita si
// riparte da capo solo dopo RITENTA_GIORNI.
const FAMIGLIE_AMPIE = [
  ['monumenti', ['monument', 'monumenti', 'monumento', 'castle', 'castelli', 'ruins', 'archaeological_site', 'archeo', 'memorial', 'fort', 'tower']],
  ['panorami', ['viewpoint', 'panorami', 'panorama', 'lighthouse', 'faro']],
  ['musei', ['museum', 'musei', 'museo', 'gallery', 'galleria', 'art_gallery']],
  ['chiese', ['church', 'chiesa', 'chiese', 'place_of_worship', 'cathedral', 'cattedrale', 'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia', 'shrine', 'santuario']],
];

async function* gemme(stato) {
  if (!SOLO_AMPIO) yield* scorri(CATEGORIE, true, null);
  if (SOLO_GEMME) return;
  stato.cursori = stato.cursori || {};
  for (const [famiglia, categorie] of FAMIGLIE_AMPIE) {
    console.log(`[foto-gemme] tutti i POI — famiglia «${famiglia}»`);
    yield* scorri(categorie, false, stato.cursori);
  }
}

async function* scorri(categorie, soloGemme, cursori) {
  for (const cat of categorie) {
    const c = cursori ? (cursori[cat] = cursori[cat] || { id: '', finitaIl: 0 }) : null;
    if (c && c.finitaIl && Date.now() - c.finitaIl < RITENTA_GIORNI * 86_400_000) continue;
    if (c && c.finitaIl) { c.id = ''; c.finitaIl = 0; }
    let ultimoId = c ? c.id : '';
    // Nel giro ampio le righe che hanno già una foto non si scaricano nemmeno.
    const filtro = soloGemme ? '&is_gem=eq.true' : '&image_url=is.null&photo_url=is.null';
    for (;;) {
      let blocco = null;
      for (let tentativo = 1; tentativo <= 5 && !blocco; tentativo++) {
        try {
          const u = `${SB}/rest/v1/shared_pois?select=id,name,category,lat,lon,city,country,wikidata,wikipedia_url,contact_website,photo_url,image_url,status,is_gem&category=eq.${encodeURIComponent(cat)}${filtro}&id=gt.${encodeURIComponent(ultimoId)}&order=id.asc&limit=500`;
          const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(40000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          blocco = await r.json();
        } catch (e) {
          console.log(`  [${cat}] pagina dopo '${ultimoId}': tentativo ${tentativo}/5 fallito (${e.message})`);
          await new Promise(res => setTimeout(res, 15_000 * tentativo));
        }
      }
      if (!blocco) { console.log(`  [${cat}] pagina fallita 5 volte: salto la categoria`); break; }
      for (const p of blocco) { yield p; if (c) c.id = p.id; }
      if (blocco.length < 500) { if (c) c.finitaIl = Date.now(); console.log(`  [${cat}] categoria completata`); break; }
      ultimoId = blocco[blocco.length - 1].id;
    }
  }
}

// ── STATO E REPORT ──────────────────────────────────────────────────────────

function leggiStato() {
  const vuoto = { esaminate: 0, aggiunte: 0, candidate: 0, senzaFoto: 0, perFonte: {}, lotto: [], dettaglio: [] };
  try { return { ...vuoto, ...JSON.parse(fs.readFileSync(STATO_FILE, 'utf8')) }; } catch { return vuoto; }
}
function scriviStato(s) {
  try { fs.mkdirSync(path.dirname(STATO_FILE), { recursive: true }); fs.writeFileSync(STATO_FILE, JSON.stringify(s, null, 1)); } catch {}
}
/** Le gemme già esaminate: id → quando. Un file in sola aggiunta, non un JSON da riscrivere intero. */
function leggiVisti() {
  const m = new Map();
  try { for (const l of fs.readFileSync(VISTI_FILE, 'utf8').split('\n')) { const [id, ts] = l.split('\t'); if (id) m.set(id, Number(ts) || 0); } } catch {}
  return m;
}

/** Un solo POI: cerca, scrive o mette fra le candidate, aggiorna stato/log. Isolata per poterne lavorare N insieme. */
async function lavoraUnPoi(g, stato, visti) {
    let trovata = null;
    try {
      // Gemme: sito ufficiale (anche cercato con SearXNG) e poi fonti aperte.
      // Tutti gli altri POI sono milioni: il sito ufficiale GIÀ NOTO resta
      // primo, ma la ricerca SearXNG scende in fondo, solo se Wikidata,
      // Wikipedia e Commons non hanno dato nulla — ventimila ricerche al
      // giorno farebbero bloccare SearXNG dai motori a monte, e SearXNG
      // serve anche alla semina dei musei.
      const ampia = !g.is_gem;
      trovata = ampia
        ? (await daSitoUfficiale(g, { ricerca: false })) || (await daFontiAperte(g)) || (await daSitoUfficiale(g, { sitoNoto: false }))
        : (await daSitoUfficiale(g)) || (await daFontiAperte(g));
      let giaCandidata = false;
      if (trovata && trovata.certa === false) {
        // Trovata ma non certa (file Commons che combacia solo alla larga, o
        // sito che Gonka non riconosce come ufficiale): da guardare → fra le
        // candidate, mai in app da sola.
        const dominioC = trovata.dominioCandidata || 'commons.wikimedia.org';
        const tipoC = trovata.tipoCandidata || 'commons';
        const rc = await fetch(`${SB}/rest/v1/foto_pois_da_verificare`, {
          method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ poi_id: g.id, poi_nome: g.name, foto_url: trovata.url, fonte_url: trovata.pagina || trovata.url, fonte_dominio: dominioC, fonte_tipo: tipoC }),
        });
        if (rc.ok) { stato.candidate++; giaCandidata = true; console.log(`     → candidata da verificare: ${g.name} — ${dominioC} (${tipoC}, non certa)`); }
        trovata = null;
      }
      if (trovata) {
        const upd = await fetch(`${SB}/rest/v1/shared_pois?id=eq.${encodeURIComponent(g.id)}`, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ image_url: trovata.url, photo_url: trovata.url, image_source: trovata.fonte, ...(trovata.sito && !g.contact_website ? { contact_website: trovata.sito } : {}) }),
        });
        if (!upd.ok) throw new Error(`scrittura fallita ${upd.status} ${(await upd.text()).slice(0, 120)}`);
        stato.aggiunte++;
        const chiave = trovata.fonte.split(':')[0];
        stato.perFonte[chiave] = (stato.perFonte[chiave] || 0) + 1;
        const voce = { id: g.id, nome: g.name, categoria: g.category, fonte: trovata.fonte, foto: trovata.url, quando: new Date().toISOString() };
        stato.lotto.push(voce);
        stato.dettaglio.push(voce);
        if (stato.dettaglio.length > 3000) stato.dettaglio = stato.dettaglio.slice(-3000);
        console.log(`  ✓ ${g.name} (${g.category}) — ${trovata.fonte} — ${trovata.url.slice(0, 90)}`);
      } else {
        // Blog, social e guide si guardano a mano una per una: per le gemme
        // sì, per milioni di POI la coda da approvare diventerebbe infinita.
        if (!giaCandidata && (!ampia || TERZO_LIVELLO_PER_TUTTI)) stato.candidate += await terzoLivelloDaVerificare(g);
        stato.senzaFoto++;
        console.log(`  – ${g.name} (${g.category}): nessuna foto da fonte verificata`);
      }
    } catch (e) {
      console.warn(`  ⚠ ${g.name}: errore — ${e?.message || e}`);
    }
    // OGNI gemma esaminata conta (prima contavano solo quelle con foto: mai
    // un report, mai uno stato salvato — 17/09/2026).
    stato.esaminate++;
    // Se la ricerca web è FALLITA per questo POI, «nessuna foto» non è una
    // risposta: il POI si riprova fra un giorno invece che fra RITENTA_GIORNI
    // (falso negativo segnalato il 19/09 mentre SearXNG era degradato).
    const marca = g._searxKO ? Date.now() - (RITENTA_GIORNI - 1) * 86_400_000 : Date.now();
    visti.set(g.id, marca);
    try { fs.appendFileSync(VISTI_FILE, `${g.id}\t${marca}\n`); } catch {}
    if (stato.esaminate % 200 === 0) {
      await registraSpesaGonka();
      console.log(`\n=== REPORT a ${stato.esaminate} esaminate — foto aggiunte in totale ${stato.aggiunte} ${JSON.stringify(stato.perFonte)}, candidate da verificare ${stato.candidate}; Gonka: ${gonka.chiamate} giudizi, ${gonka.usdMese.toFixed(4)} $ (tetto ${GONKA_TETTO_USD} $/mese${GONKA_KEY ? '' : ', CHIAVE ASSENTE: solo regex'}) ===`);
      if (stato.lotto.length) for (const v of stato.lotto) console.log(`   + ${v.nome} (${v.categoria}) — ${v.fonte}`);
      else console.log('   (nessuna foto aggiunta in questo lotto di 200)');
      console.log('=== fine report ===\n');
      stato.lotto = [];
    }
    if (stato.esaminate % 20 === 0) scriviStato(stato);
}

async function unGiro(stato, visti) {
  console.log(`[foto-gemme] giro — esaminate ${stato.esaminate}, foto aggiunte ${stato.aggiunte}, candidate da verificare ${stato.candidate} (concorrenza ${CONCORRENZA})`);
  let lavorate = 0;
  let batch = []; // POI presi insieme (non «stato.lotto»: quello è per il report ogni 200)
  const scaricaBatch = async () => {
    if (!batch.length) return;
    await Promise.all(batch.map(g => lavoraUnPoi(g, stato, visti)));
    batch = [];
    await new Promise(res => setTimeout(res, PAUSA_MS));
  };
  for await (const g of gemme(stato)) {
    if (lavorate >= LIMIT) break;
    if (SOLO_AMPIO && g.is_gem) continue; // le gemme sono dell'altro servizio
    if (g.photo_url || g.image_url || !STATI_VISIBILI.has(g.status) || g.lat == null || g.lon == null) continue;
    const visto = visti.get(g.id);
    if (visto && Date.now() - visto < RITENTA_GIORNI * 86_400_000) continue;
    lavorate++;
    batch.push(g);
    if (batch.length >= CONCORRENZA) await scaricaBatch();
  }
  await scaricaBatch();
  scriviStato(stato);
  console.log(`[foto-gemme] fine giro: esaminate ${stato.esaminate}, foto aggiunte ${stato.aggiunte}, candidate da verificare ${stato.candidate}, senza foto ${stato.senzaFoto}`);
  return lavorate > 0;
}

/** SEMPRE ATTIVO: un giro dopo l'altro; se non c'era nulla di nuovo si aspetta. */
async function main() {
  const stato = leggiStato();
  const visti = leggiVisti();
  console.log(`[foto-gemme] avvio — ${visti.size} gemme già esaminate in passato`);
  for (;;) {
    let qualcosa = false;
    try { qualcosa = await unGiro(stato, visti); }
    catch (e) { console.error('[foto-gemme] giro interrotto da un errore, riprovo:', e?.message || e); }
    const attesa = qualcosa ? 60_000 : 60 * 60_000;
    console.log(`[foto-gemme] pausa di ${Math.round(attesa / 60000)} min prima del prossimo giro…`);
    await new Promise(res => setTimeout(res, attesa));
  }
}

main().catch(e => { console.error('ECCEZIONE FATALE', e); process.exit(1); });
