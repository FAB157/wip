#!/usr/bin/env node
/**
 * LA GUIDA MICHELIN IN locali_pois (02/10/2026).
 *
 *   node scripts/importa-michelin.mjs <file.csv>                     prova: abbina e conta, NON scrive
 *   node scripts/importa-michelin.mjs <file.csv> --schema            applica colonne, indici e RPC (20261002120000_locali_pois_michelin.sql)
 *   node scripts/importa-michelin.mjs <file.csv> --scrivi            scrive (rilanciabile: ritrova le righe dal link)
 *   … --distinzioni=<file.csv>   secondo file «Link_Michelin,Distinzione_Michelin» che vince sul primo (giro breve delle sole stelle)
 *   … --limite=N                 solo le prime N righe
 *
 * REGOLE
 * - Un ristorante della Guida che e' gia' una riga di Overture NON diventa una
 *   seconda riga (due pin per lo stesso locale): la riga che c'e' riceve le
 *   colonne michelin_*, e tiene il suo indirizzo, sito e telefono.
 * - L'abbinamento vuole il NOME, non la sola vicinanza: stesso telefono +
 *   una parola del nome in comune (≤ 300 m), oppure stesso nome (≤ 250 m),
 *   oppure tutte le parole proprie del nome piu' corto nell'altro (≤ 100 m,
 *   solo ristoranti). Mai «il locale piu' vicino».
 * - Chi non ha riscontro diventa 'ov-michelin-<slug>' (source 'michelin');
 *   citta' e paese dai locali entro 300 m, l'indirizzo resta vuoto: non si
 *   inventa.
 * - La distinzione «Piatto / Segnalato Michelin» e' il RIPIEGO dello scraper
 *   quando non legge il badge. Se nel file non c'e' nemmeno una stella o un
 *   Bib, quel testo non e' un dato e la distinzione resta NULL (= «nella
 *   Guida, livello non noto»). Una distinzione gia' salvata non viene mai
 *   cancellata da un file che non la conosce.
 * - Una riga per volta, con pausa (--pausa=ms, default 150) e controllo di
 *   /api/health ogni 100: se il sito soffre lo script si ferma da solo.
 *   INCIDENTE 02/10/2026: i due indici parziali (CONCURRENTLY, ma sempre una
 *   lettura intera di 10M di righe: 5,7 + 3,7 minuti) piu' la prova di
 *   abbinamento insieme hanno portato /api/health a 503. --schema si lancia
 *   DA SOLO, di notte, senza altri job sul database.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client } from 'pg';

// Su Oracle (/root/michelin-import) si lancia con WIP_RADICE: li' stanno .env (solo credenziali DB) e scratch/.
const RADICE = process.env.WIP_RADICE || 'C:/progetti/itainta';
const args = process.argv.slice(2);
const fileCsv = args.find((a) => !a.startsWith('--'));
const SCRIVI = args.includes('--scrivi');
const SCHEMA = args.includes('--schema');
const COMPLETO = args.includes('--completo');   // SOLO dopo un accordo scritto con Michelin: scrive anche cucina, prezzo, orari, servizi, indirizzo, telefono, sito della Guida
const SOLO_RPC = args.includes('--rpc');   // riapplica solo la funzione della mappa (leggero, nessuna lettura della tabella)
const fileDistinzioni = (args.find((a) => a.startsWith('--distinzioni=')) || '').split('=').slice(1).join('=') || null;
const PAUSA_MS = Number((args.find((a) => a.startsWith('--pausa=')) || '').split('=')[1]) || 150;
const LIMITE = Number((args.find((a) => a.startsWith('--limite=')) || '').split('=')[1]) || 0;
if (!fileCsv) { console.error('Uso: node scripts/importa-michelin.mjs <file.csv> [--schema] [--scrivi] [--distinzioni=<file.csv>] [--limite=N]'); process.exit(1); }

// ───────────────────────────────────────────────────────────── CSV
function leggiCsv(percorso) {
  const t = fs.readFileSync(percorso, 'utf8').replace(/^\uFEFF/, '');
  const righe = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n') { r.push(c); righe.push(r); r = []; c = ''; }
    else if (ch !== '\r') c += ch;
  }
  if (c || r.length) { r.push(c); righe.push(r); }
  const testa = righe.shift().map((x) => x.trim());
  return righe.filter((x) => x.length >= 2).map((x) => Object.fromEntries(testa.map((k, i) => [k, (x[i] ?? '').trim()])));
}
const vuoto = (v) => !v || v === 'N/D';

const FASCE = { 'per tutte le tasche': 1, 'un costo ragionevole': 2, "un'occasione speciale": 3, 'una piccola follia': 4 };
function prezzoECucina(testo) {
  if (vuoto(testo)) return { prezzo: null, cucina: null };
  const parti = testo.split('·').map((s) => s.trim()).filter(Boolean);
  let prezzo = null; const cucine = [];
  for (const p of parti) {
    const k = p.toLowerCase().replace(/’/g, "'");
    if (FASCE[k]) prezzo = FASCE[k];
    else if (/^[€$£¥]{1,4}$/.test(p)) prezzo = p.length;
    else cucine.push(p);
  }
  return { prezzo, cucina: cucine.join(', ') || null };
}

/** { livello, verde, ripiego } dal testo del badge. */
function leggiDistinzione(testo) {
  const t = String(testo || '').toLowerCase();
  const verde = /stella verde|green star|étoile verte/.test(t);
  const senzaVerde = t.replace(/stella verde|green star|étoile verte/g, ' ');
  if (/\b(3|tre|three)\b.*(stell|star)|(stell|star).*\b(3|tre)\b/.test(senzaVerde)) return { livello: '3_stelle', verde };
  if (/\b(2|due|two)\b.*(stell|star)|(stell|star).*\b(2|due)\b/.test(senzaVerde)) return { livello: '2_stelle', verde };
  if (/(stell|star)/.test(senzaVerde)) return { livello: '1_stella', verde };
  if (/bib/.test(t)) return { livello: 'bib_gourmand', verde };
  if (/piatto|segnalat|selezionat|selected/.test(t)) return { livello: 'selezionato', verde, ripiego: true };
  return { livello: null, verde };
}

function sottoCategoria(cucina) {
  const c = String(cucina || '').toLowerCase();
  if (/sushi/.test(c)) return 'sushi';
  if (/\bpizza/.test(c)) return 'pizzeria';
  if (/pesce|frutti di mare|seafood/.test(c)) return 'pesce';
  if (/\bcarne\b|steakhouse|barbecue|griglia/.test(c)) return 'carne';
  return 'ristorante';
}

// ───────────────────────────────────────────────────────────── nomi
const GENERICHE = new Set(('ristorante restaurant restaurante trattoria osteria hostaria locanda taverna enoteca bistrot bistro brasserie cafe caffe bar pizzeria gasthaus gasthof wirtshaus restaurace ' +
  'antica antico nuova nuovo hotel the il lo la le gli un una da dal dalla di del della dei degli delle al alla alle ai a e ed et and de du des les el los las der die das zum zur im am by at of').split(/\s+/));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const parole = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 1 && !GENERICHE.has(w)))];
const chiaveTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : null; };
const SUB_RISTORANTE = new Set(['ristorante', 'pizzeria', 'pesce', 'carne', 'sushi', '']);

/** 0 = non e' lui. 3 telefono+nome, 2 stesso nome, 1 nome contenuto. */
function punteggio(mic, cand) {
  const d = Number(cand.m);
  const na = norm(mic.nome), nb = norm(cand.name);
  const pa = parole(mic.nome), pb = parole(cand.name);
  const comuni = pa.filter((w) => pb.includes(w)).length;
  const uguale = (na && na === nb) || (pa.length > 0 && pa.length === pb.length && comuni === pa.length);
  const [corto, lungo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const contenuto = corto.length > 0 && corto.every((w) => lungo.includes(w)) && lungo.length - corto.length <= 2;
  const tel = mic.telKey && mic.telKey === chiaveTel(cand.phone);
  if (tel && d <= 300 && (uguale || comuni > 0)) return 3;
  if (uguale && d <= 250) return 2;
  if (contenuto && d <= 100 && SUB_RISTORANTE.has(String(cand.sub_category || ''))) return 1;
  return 0;
}

// ───────────────────────────────────────────────────────────── file
let righe = leggiCsv(fileCsv);
const totaleFile = righe.length;
const visti = new Set();
righe = righe.filter((r) => { const l = r.Link_Michelin; if (!l || visti.has(l)) return false; visti.add(l); return true; });
const fileHaDistinzioni = righe.some((r) => { const d = leggiDistinzione(r.Distinzione_Michelin); return d.livello && !d.ripiego; });

const distinzioniExtra = new Map();
if (fileDistinzioni) {
  for (const r of leggiCsv(fileDistinzioni)) {
    const d = leggiDistinzione(r.Distinzione_Michelin || r.Distinzione);
    if (r.Link_Michelin && d.livello) distinzioniExtra.set(r.Link_Michelin.replace(/\/$/, ''), d);
  }
}

// La Guida scrive il paese in ISO-3, la tabella in ISO-2.
const ISO3 = { ITA: 'IT', FRA: 'FR', ESP: 'ES', DEU: 'DE', GBR: 'GB', IRL: 'IE', PRT: 'PT', CHE: 'CH', AUT: 'AT', BEL: 'BE', NLD: 'NL', LUX: 'LU', DNK: 'DK', SWE: 'SE', NOR: 'NO', FIN: 'FI', ISL: 'IS', EST: 'EE', LVA: 'LV', LTU: 'LT', POL: 'PL', CZE: 'CZ', SVK: 'SK', HUN: 'HU', SVN: 'SI', HRV: 'HR', SRB: 'RS', GRC: 'GR', TUR: 'TR', MLT: 'MT', AND: 'AD', MCO: 'MC', SMR: 'SM', LIE: 'LI', USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', JPN: 'JP', KOR: 'KR', CHN: 'CN', HKG: 'HK', MAC: 'MO', TWN: 'TW', SGP: 'SG', THA: 'TH', VNM: 'VN', MYS: 'MY', PHL: 'PH', ARE: 'AE', QAT: 'QA', SAU: 'SA', NZL: 'NZ', AUS: 'AU', FRO: 'FO', GGY: 'GG', JEY: 'JE' };

const slugUsati = new Map();
const voci = [];
for (const r of righe) {
  const lat = Number(r.Latitudine), lon = Number(r.Longitudine);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
  if (vuoto(r.Nome)) continue;
  let { prezzo, cucina } = prezzoECucina(r.Cucina_E_Prezzo);
  // Colonne del file nuovo (18.py riscritto): vincono sulla colonna unita.
  if (!vuoto(r.Cucina)) cucina = r.Cucina;
  if (!vuoto(r.Prezzo)) prezzo = prezzoECucina(r.Prezzo).prezzo ?? prezzo;
  let d = leggiDistinzione(r.Distinzione_Michelin);
  if (d.ripiego && !fileHaDistinzioni) d = { livello: null, verde: false };
  if (/^(si|sì|true|1)$/i.test(r.Stella_Verde || '')) d = { ...d, verde: true };
  const extra = distinzioniExtra.get(r.Link_Michelin.replace(/\/$/, ''));
  if (extra) d = extra;
  let slug = decodeURIComponent(r.Link_Michelin.replace(/\/$/, '').split('/').pop() || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || (slugUsati.has(slug) && slugUsati.get(slug) !== r.Link_Michelin)) slug = `${slug || 'r'}-${crypto.createHash('md5').update(r.Link_Michelin).digest('hex').slice(0, 6)}`;
  slugUsati.set(slug, r.Link_Michelin);
  voci.push({
    nome: r.Nome, lat, lon, link: r.Link_Michelin, idNuovo: `ov-michelin-${slug}`,
    prezzo, cucina, livello: d.livello, verde: d.verde ? true : null,
    telefono: vuoto(r.Telefono) ? null : r.Telefono, telKey: chiaveTel(vuoto(r.Telefono) ? '' : r.Telefono),
    indirizzo: vuoto(r.Indirizzo) ? null : r.Indirizzo, sito: vuoto(r.Sito_Web_Ristorante) ? null : r.Sito_Web_Ristorante,
    cap: vuoto(r.CAP) ? null : r.CAP, citta: vuoto(r.Citta) ? null : r.Citta, regione: vuoto(r.Regione) ? null : r.Regione,
    paese: vuoto(r.Paese) ? null : (ISO3[r.Paese.toUpperCase()] || (r.Paese.length === 2 ? r.Paese.toUpperCase() : null)),
    anno: /^\d{4}$/.test(r.Anno_Distinzione || '') ? Number(r.Anno_Distinzione) : null,
    orari: vuoto(r.Orari) ? null : r.Orari,
    servizi: vuoto(r.Servizi) ? null : r.Servizi.split(';').map((s) => s.trim()).filter(Boolean),
  });
}
// VERSIONE PRUDENTE (default, 02/10/2026): senza un accordo con Michelin si
// scrive SOLO il fatto — distinzione, Stella Verde, anno, link. Cucina,
// fascia di prezzo, orari, servizi, indirizzo, telefono e sito della Guida
// NON entrano in tabella: sul pin vanno i nostri (Overture/OSM). Il telefono
// del file serve solo, in memoria, a riconoscere la riga giusta (telKey).
// Con --completo (dopo l'accordo) si scrive tutto.
if (!COMPLETO) {
  for (const v of voci) Object.assign(v, { prezzo: null, cucina: null, telefono: null, indirizzo: null, sito: null, cap: null, citta: null, regione: null, paese: null, orari: null, servizi: null });
}
const daFare = LIMITE ? voci.slice(0, LIMITE) : voci;
console.log(`File: ${totaleFile} righe, ${righe.length} link unici, ${voci.length} valide${LIMITE ? `, ne elaboro ${daFare.length}` : ''}.`);
console.log(`Distinzioni vere nel file: ${fileHaDistinzioni ? 'SI' : 'NO (solo il ripiego dello scraper: la distinzione resta vuota)'}${fileDistinzioni ? ` · dal secondo file: ${distinzioniExtra.size}` : ''}`);

// ───────────────────────────────────────────────────────────── DB
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(RADICE, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = off');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (SCHEMA || SOLO_RPC) {
  const sql = fs.readFileSync(path.join(RADICE, 'supabase/migrations/20261002120000_locali_pois_michelin.sql'), 'utf8');
  const iBegin = sql.indexOf('\nbegin;');
  const prima = sql.slice(0, iBegin).split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  for (const st of SOLO_RPC ? [] : prima.split(';').map((s) => s.trim()).filter(Boolean)) {
    const indice = /^create index/i.test(st);
    await c.query(`SET statement_timeout = '${indice ? '20min' : '15s'}'`);
    await c.query(`SET lock_timeout = '${indice ? '0' : '5s'}'`);
    const t0 = Date.now();
    await c.query(indice ? st.replace(/^create index/i, 'create index concurrently') : st);
    console.log(`[ok] ${st.slice(0, 90).replace(/\s+/g, ' ')}… (${Date.now() - t0} ms)`);
  }
  await c.query(`SET statement_timeout = '30s'`);
  await c.query(`SET lock_timeout = '5s'`);
  await c.query(sql.slice(iBegin));
  console.log('[ok] RPC locali_pois_vicini (8 parametri) + grant');
  await c.query(`SET lock_timeout = '0'`);
}

async function saluteSitoOk() {
  try {
    const t0 = Date.now();
    const res = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    if (!res.ok || ms > 2500) { console.log(`[salute] /api/health non ok o lento (status ${res.status}, ${ms} ms)`); return false; }
    return true;
  } catch (e) { console.log(`[salute] /api/health irraggiungibile: ${e.message}`); return false; }
}

// NIENTE PULIZIA «DI MASSA» (02/10/2026, secondo 503 della giornata): un
// update con `where michelin_url > '' and …` su questa tabella ha scelto un
// piano pesante ed e' stato interrotto dal tetto di 15 s, col sito gia' in
// 503. Le righe si puliscono UNA PER VOLTA, per chiave esatta, dentro il giro
// qui sotto: in versione prudente l'update azzera i campi presi dalla Guida.

const haColonne = (await c.query(`select 1 from information_schema.columns where table_schema='public' and table_name='locali_pois' and column_name='michelin_url'`)).rowCount > 0;
if (SCRIVI && !haColonne) { console.error('Mancano le colonne michelin_*: lancia prima con --schema.'); await c.end(); process.exit(1); }

await c.query(`SET statement_timeout = '20s'`);
const conta = { ritrovati: 0, abbinati: [0, 0, 0, 0], nuovi: 0, conCitta: 0, errori: 0, conIndirizzo: 0 };
const idPresi = new Set();
const campione = { abbinati: [], nuovi: [] };
let scritture = 0;

for (let i = 0; i < daFare.length; i++) {
  const v = daFare[i];
  try {
    let idRiga = null, comeTrovata = '';
    if (haColonne) {
      const gia = await c.query(`select id from public.locali_pois where michelin_url = $1 limit 1`, [v.link]);
      if (gia.rowCount) { idRiga = gia.rows[0].id; comeTrovata = 'link'; conta.ritrovati++; }
    }
    let vicini = [];
    if (!idRiga) {
      vicini = (await c.query(
        `select id, name, sub_category, address, city, country, phone, confidence,
                st_distance(geog, st_setsrid(st_makepoint($1,$2),4326)::geography) m
           from public.locali_pois
          where geog is not null and st_dwithin(geog, st_setsrid(st_makepoint($1,$2),4326)::geography, 300)
          order by geog <-> st_setsrid(st_makepoint($1,$2),4326)::geography limit 60`, [v.lon, v.lat])).rows;
      // (02/10/2026) I 60 PIU' VICINI con l'ordinamento dell'indice (<->), non
      // «tutti entro 300 m, poi ordina»: in centro a Tokyo erano migliaia di
      // righe lette dal disco per ogni ristorante, e insieme alla costruzione
      // degli indici hanno mandato /api/health in 503 per alcuni minuti.
      let migliore = null, pMigliore = 0;
      for (const cand of vicini) {
        if (idPresi.has(cand.id)) continue;
        const p = punteggio(v, cand);
        if (p > pMigliore) { pMigliore = p; migliore = cand; }   // a pari punteggio resta il piu' vicino (ordine della query)
      }
      if (migliore) {
        idRiga = migliore.id; comeTrovata = `p${pMigliore}`; conta.abbinati[pMigliore]++;
        if (migliore.address) conta.conIndirizzo++;
        if (campione.abbinati.length < 60 || pMigliore === 1) campione.abbinati.push(`[p${pMigliore}] ${v.nome}  →  ${migliore.name} · ${migliore.address || '—'} · ${migliore.city || '—'} (${Math.round(migliore.m)} m)`);
      }
    }
    if (idRiga) idPresi.add(idRiga);

    if (idRiga) {
      if (SCRIVI) {
        await c.query(
          `update public.locali_pois set michelin_url = $2,
              michelin_distinzione = coalesce($3, michelin_distinzione),
              michelin_stella_verde = coalesce($4, michelin_stella_verde),
              michelin_prezzo = case when $17::boolean then coalesce($5::smallint, michelin_prezzo) end,
              michelin_cucina = case when $17::boolean then coalesce($6::text, michelin_cucina) end,
              michelin_orari = case when $17::boolean then coalesce($15::text, michelin_orari) end,
              michelin_servizi = case when $17::boolean then coalesce($16::text[], michelin_servizi) end,
              -- prudente: una riga creata da un import precedente (source 'michelin') perde telefono/via/sito della Guida; le righe di Overture tengono i loro
              phone = case when $17::boolean then coalesce(phone, $7::text) when source = 'michelin' then null else phone end,
              address = case when $17::boolean then coalesce(address, $8::text) when source = 'michelin' then null else address end,
              website = case when $17::boolean then coalesce(website, $9::text) when source = 'michelin' then null else website end,
              postcode = case when $17::boolean then coalesce(postcode, $11::text) when source = 'michelin' then null else postcode end,
              region = case when $17::boolean then coalesce(region, $12::text) when source = 'michelin' then null else region end,
              city = coalesce(city, $10::text), country = coalesce(country, $13::text),
              michelin_anno = coalesce($14::smallint, michelin_anno),
              michelin_updated_at = now()
            where id = $1`,
          [idRiga, v.link, v.livello, v.verde, v.prezzo, v.cucina, v.telefono, v.indirizzo, v.sito,
            v.citta, v.cap, v.regione, v.paese, v.anno, v.orari, v.servizi, COMPLETO]);
        scritture++;
      }
    } else {
      // Citta' e paese: quelli piu' frequenti fra i dieci locali piu' vicini (Overture li scrive giusti, accenti compresi).
      const voti = {};
      for (const cand of vicini.slice(0, 10)) if (cand.city) { const k = `${cand.city}|${cand.country || ''}`; voti[k] = (voti[k] || 0) + 1; }
      const [cittaVicini, paeseVicini] = (Object.entries(voti).sort((a, b) => b[1] - a[1])[0]?.[0] || '|').split('|');
      const citta = v.citta || cittaVicini, paese = v.paese || paeseVicini;
      conta.nuovi++; if (citta) conta.conCitta++;
      if (campione.nuovi.length < 40) campione.nuovi.push(`${v.nome} · ${citta || '—'} ${paese || ''} · vicini: ${vicini.slice(0, 3).map((x) => x.name).join(' | ') || 'nessuno'}`);
      if (SCRIVI) {
        await c.query(
          `insert into public.locali_pois (id, name, lat, lon, sub_category, address, city, country, website, phone, confidence, source,
                                           michelin_url, michelin_distinzione, michelin_stella_verde, michelin_prezzo, michelin_cucina,
                                           postcode, region, michelin_anno, michelin_orari, michelin_servizi, michelin_updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0.95,'michelin',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now())
           on conflict (id) do update set name = excluded.name, lat = excluded.lat, lon = excluded.lon,
             city = coalesce(excluded.city, public.locali_pois.city), postcode = coalesce(excluded.postcode, public.locali_pois.postcode),
             region = coalesce(excluded.region, public.locali_pois.region), country = coalesce(excluded.country, public.locali_pois.country),
             michelin_anno = coalesce(excluded.michelin_anno, public.locali_pois.michelin_anno),
             michelin_orari = coalesce(excluded.michelin_orari, public.locali_pois.michelin_orari),
             michelin_servizi = coalesce(excluded.michelin_servizi, public.locali_pois.michelin_servizi),
             michelin_url = excluded.michelin_url,
             michelin_distinzione = coalesce(excluded.michelin_distinzione, public.locali_pois.michelin_distinzione),
             michelin_stella_verde = coalesce(excluded.michelin_stella_verde, public.locali_pois.michelin_stella_verde),
             michelin_prezzo = coalesce(excluded.michelin_prezzo, public.locali_pois.michelin_prezzo),
             michelin_cucina = coalesce(excluded.michelin_cucina, public.locali_pois.michelin_cucina),
             phone = coalesce(public.locali_pois.phone, excluded.phone),
             address = coalesce(public.locali_pois.address, excluded.address),
             website = coalesce(public.locali_pois.website, excluded.website),
             michelin_updated_at = now()`,
          [v.idNuovo, v.nome, v.lat, v.lon, COMPLETO ? sottoCategoria(v.cucina) : 'ristorante', v.indirizzo, citta || null, paese || null, v.sito, v.telefono,
            v.link, v.livello, v.verde, v.prezzo, v.cucina, v.cap, v.regione, v.anno, v.orari, v.servizi]);
        scritture++;
      }
    }
  } catch (e) {
    conta.errori++;
    if (conta.errori <= 10) console.log(`[errore] ${v.nome}: ${e.message}`);
    if (conta.errori > 50) { console.log('[STOP] troppi errori.'); break; }
  }

  // Passo lento DI PROPOSITO, anche in prova (pure le letture pesano sul
  // disco): una pausa a ogni ristorante e la salute del sito ogni 100.
  await sleep(PAUSA_MS);
  if ((i + 1) % 100 === 0) {
    console.log(`… ${i + 1}/${daFare.length} · abbinati ${conta.abbinati[1] + conta.abbinati[2] + conta.abbinati[3]} · ritrovati ${conta.ritrovati} · nuovi ${conta.nuovi}${SCRIVI ? ` · scritture ${scritture}` : ''}`);
    let male = 0;
    while (!(await saluteSitoOk())) {
      if (++male >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila: mi fermo. Rilanciabile, riparte da dove era.'); await c.end(); process.exit(0); }
      await sleep(60000);
    }
  }
}

const abbinati = conta.abbinati[1] + conta.abbinati[2] + conta.abbinati[3];
console.log(`\n${SCRIVI ? 'SCRITTO' : 'PROVA (nessuna scrittura)'}`);
console.log(`  gia' presenti (ritrovati dal link): ${conta.ritrovati}`);
console.log(`  agganciati a una riga esistente:    ${abbinati}  (telefono+nome ${conta.abbinati[3]}, stesso nome ${conta.abbinati[2]}, nome contenuto ${conta.abbinati[1]}) — con indirizzo: ${conta.conIndirizzo}`);
console.log(`  righe nuove (ov-michelin-…):        ${conta.nuovi}  (con citta' dai vicini: ${conta.conCitta})`);
console.log(`  errori: ${conta.errori}`);
const rapporto = path.join(RADICE, 'scratch', 'michelin-import-rapporto.txt');
fs.writeFileSync(rapporto, `ABBINATI (campione; tutti i «nome contenuto» p1)\n${campione.abbinati.join('\n')}\n\nNUOVI (campione)\n${campione.nuovi.join('\n')}\n`, 'utf8');
console.log(`Campione degli abbinamenti: ${rapporto}`);
await c.end();
