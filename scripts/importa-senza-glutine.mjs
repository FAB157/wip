#!/usr/bin/env node
/**
 * I LOCALI SENZA GLUTINE IN locali_pois + locali_gf (03/10/2026).
 *
 *   node scripts/importa-senza-glutine.mjs <gluten_free_italia_completo.csv>            prova: abbina e conta, NON scrive
 *   node scripts/importa-senza-glutine.mjs <csv> --scrivi [--pausa=150] [--limite=N]
 *
 * Fonte: Find Me Gluten Free (scraper «19.py» del committente), 8.518 locali
 * italiani. Stesse regole dell'import della Guida (scripts/importa-michelin.mjs):
 * - Il locale che c'e' gia' in locali_pois NON diventa una seconda riga: gli
 *   si aggancia il livello (tabella locali_gf, id = id del locale). Abbinamento
 *   per NOME, mai «il piu' vicino»: telefono + una parola in comune (≤ 300 m),
 *   stesso nome (≤ 250 m), nome contenuto (≤ 100 m).
 * - Chi non c'e' diventa 'ov-gf-<n>' (source 'findmeglutenfree'): nome e
 *   coordinate; citta' e paese dai locali vicini. Niente indirizzo, telefono,
 *   sito, voti, recensioni o frasi degli utenti presi dalla fonte (prudenza:
 *   e' la banca dati di un'azienda). Restano il LIVELLO e il link alla scheda.
 * - COSA ENTRA (deciso col committente, 03/10 sera): «dedicated» → dedicato;
 *   «GF Menu» → menu; «No GF Menu» → opzioni, tutti tranne quelli con voto
 *   sotto 3. Il fumetto delle «opzioni» dice di chiedere al locale prima di
 *   ordinare: sono segnalazioni di utenti, non un menu dedicato.
 * - «Tutte le info» (stesso ordine): telefono, sito, indirizzo, piatti senza
 *   glutine, fascia di prezzo, voto e numero di recensioni vanno in locali_gf;
 *   telefono/sito/via riempiono locali_pois solo dove i nostri mancano.
 * - Una riga per volta, pausa, /api/health ogni 100. Rilanciabile: ritrova le
 *   righe gia' fatte dal link.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const RADICE = process.env.WIP_RADICE || 'C:/progetti/itainta';
const args = process.argv.slice(2);
const fileCsv = args.find((a) => !a.startsWith('--'));
const SCRIVI = args.includes('--scrivi');
const PAUSA_MS = Number((args.find((a) => a.startsWith('--pausa=')) || '').split('=')[1]) || 150;
const LIMITE = Number((args.find((a) => a.startsWith('--limite=')) || '').split('=')[1]) || 0;
if (!fileCsv) { console.error('Uso: node scripts/importa-senza-glutine.mjs <csv> [--scrivi] [--pausa=ms] [--limite=N]'); process.exit(1); }

// ── CSV
const t = fs.readFileSync(fileCsv, 'utf8').replace(/^\uFEFF/, '');
const righe = []; let r = [], c = '', q = false;
for (let i = 0; i < t.length; i++) { const ch = t[i];
  if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
  else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); righe.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
if (c || r.length) { r.push(c); righe.push(r); }
const testa = righe.shift().map((x) => x.trim());
const col = (n) => testa.indexOf(n);
const vuoto = (v) => !v || v === 'N/D';

function livello(x) {
  const s = x[col('Sicurezza_Gluten_Free')] || '';
  if (/dedicated/i.test(s)) return 'dedicato';
  if (/^GF Menu/i.test(s)) return 'menu';
  // (03/10 sera, committente: «sì», tutti dentro) Anche i «No GF Menu» con una
  // sola recensione entrano come «opzioni» (targhetta grigia, avviso «chiedi
  // al locale prima di ordinare»). Fuori solo chi ha un voto sotto 3: e' stato
  // segnalato MALE proprio sul senza glutine.
  // (04/10/2026, committente: «meglio inserire anche quelli senza voto?» sì) Un locale SENZA voto
  // non e' un locale valutato male: nessuno l'ha ancora valutato. Fuori resta solo chi ha un voto
  // vero sotto 3. Prima `v >= 3` escludeva anche i «N/D» (553 al terzo import).
  const v = Number(x[col('Valutazione')]) || 0;
  return v === 0 || v >= 3 ? 'opzioni' : null;
}
function tipoDa(cat) {
  const k = String(cat || '').toLowerCase();
  if (/pizza/.test(k)) return 'pizzeria';
  if (/ice cream|gelat/.test(k)) return 'gelateria';
  if (/bakery|pastry|dessert|donut|bagel|creperie/.test(k)) return 'forno';
  if (/grocery|supermarket|health food|market|store/.test(k)) return 'negozio';
  if (/^bar\b|cafe|coffee|pub|tea /.test(k)) return 'bar';
  return 'ristorante';
}
const SUB_DA_TIPO = { pizzeria: 'pizzeria', gelateria: 'gelateria', bar: 'bar', forno: 'panetteria', negozio: 'alimentari', ristorante: 'ristorante' };

// ── nomi (come importa-michelin.mjs)
const GENERICHE = new Set(('ristorante restaurant restaurante trattoria osteria hostaria locanda taverna enoteca bistrot bistro brasserie cafe caffe bar pizzeria gelateria pasticceria panificio forno ' +
  'antica antico nuova nuovo hotel the il lo la le gli un una da dal dalla di del della dei degli delle al alla alle ai a e ed et and de du des les el los las by at of senza glutine gluten free').split(/\s+/));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const parole = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 1 && !GENERICHE.has(w)))];
const chiaveTel = (x) => { const d = String(x || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : null; };
function punteggio(v, cand) {
  const d = Number(cand.m);
  const na = norm(v.nome), nb = norm(cand.name);
  const pa = parole(v.nome), pb = parole(cand.name);
  const comuni = pa.filter((w) => pb.includes(w)).length;
  const uguale = (na && na === nb) || (pa.length > 0 && pa.length === pb.length && comuni === pa.length);
  const [corto, lungo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const contenuto = corto.length > 0 && corto.every((w) => lungo.includes(w)) && lungo.length - corto.length <= 2;
  const tel = v.telKey && v.telKey === chiaveTel(cand.phone);
  if (tel && d <= 300 && (uguale || comuni > 0)) return 3;
  if (uguale && d <= 250) return 2;
  if (contenuto && d <= 100) return 1;
  return 0;
}

const voci = [];
const fuori = { sogliaOpzioni: 0, coordinate: 0 };
for (const x of righe) {
  if (x.length < testa.length) continue;
  const liv = livello(x);
  if (!liv) { fuori.sogliaOpzioni++; continue; }
  const lat = Number(x[col('Latitudine')]), lon = Number(x[col('Longitudine')]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { fuori.coordinate++; continue; }
  const link = x[col('Link_Scheda')];
  if (vuoto(x[col('Nome')]) || vuoto(link)) continue;
  const n = link.replace(/\/$/, '').split('/').pop().replace(/[^A-Za-z0-9]/g, '');
  const dato = (nomeCol) => (vuoto(x[col(nomeCol)]) ? null : x[col(nomeCol)].trim());
  const tel = dato('Telefono');
  // (04/10/2026) TUTTO IL MONDO: il paese e' la colonna «Paese» del file (ISO-2, scritta dallo
  // scraper); prima l'import dava per scontata l'Italia (prefisso +39, paese 'IT').
  const paeseFile = /^[A-Z]{2}$/.test(dato('Paese') || '') ? dato('Paese') : 'IT';
  voci.push({ nome: x[col('Nome')], lat, lon, link, liv, tipo: tipoDa((x[col('Categoria')] || '').split(',')[0]), catNota: !vuoto(x[col('Categoria')]),
    telKey: chiaveTel(tel || ''), idNuovo: `ov-gf-${n}`, paeseFile,
    // (03/10 sera, committente: «metti tutte le info») I dati della scheda sulla fonte.
    // Il telefono del file e' in formato nazionale («0585 634266»): col prefisso internazionale
    // solo dove lo si conosce con certezza (Italia); altrove resta com'e' scritto.
    telefono: tel ? (tel.startsWith('+') || paeseFile !== 'IT' ? tel : `+39 ${tel}`) : null,
    sito: dato('Sito_Web'),
    indirizzo: dato('Indirizzo'),
    piatti: (dato('Piatti_GF') || '').replace(/^[—–-]\s*/, '') || null,
    prezzo: /^[$€£]{1,4}$/.test(x[col('Prezzo')] || '') ? x[col('Prezzo')].length : null,
    voto: Number(x[col('Valutazione')]) > 0 ? Number(x[col('Valutazione')]) : null,
    recensioni: Number(x[col('Numero_Recensioni')]) || null,
    categoria: dato('Categoria') });
}
const daFare = LIMITE ? voci.slice(0, LIMITE) : voci;
const perLivello = voci.reduce((m, v) => { m[v.liv] = (m[v.liv] || 0) + 1; return m; }, {});
console.log(`File: ${righe.length} righe · entrano ${voci.length} ${JSON.stringify(perLivello)} · fuori soglia «senza menu»: ${fuori.sogliaOpzioni}${LIMITE ? ` · ne elaboro ${daFare.length}` : ''}`);

// ── DB
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(RADICE, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const cl = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await cl.connect();
await cl.query('SET default_transaction_read_only = off');
await cl.query(`SET statement_timeout = '20s'`);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function saluteSitoOk() {
  try {
    const t0 = Date.now();
    const res = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    if (!res.ok || ms > 2500) { console.log(`[salute] /api/health non ok o lento (status ${res.status}, ${ms} ms)`); return false; }
    return true;
  } catch (e) { console.log(`[salute] /api/health irraggiungibile: ${e.message}`); return false; }
}

// Le righe gia' fatte (rilancio): la tabellina e' piccola, si legge una volta.
const giaFatteRighe = (await cl.query(`select url, id, tipo from public.locali_gf where url is not null`)).rows;
const giaFatte = new Map(giaFatteRighe.map((x) => [x.url, x.id]));
// Il tipo gia' deciso al primo giro (anche da sub_category del locale agganciato) non si perde al rilancio.
const tipoGiaFatto = new Map(giaFatteRighe.map((x) => [x.url, x.tipo]));
const idPresi = new Set(giaFatte.values());
const conta = { ritrovati: 0, abbinati: [0, 0, 0, 0], nuovi: 0, errori: 0 };
const campione = { abbinati: [], nuovi: [] };

for (let i = 0; i < daFare.length; i++) {
  const v = daFare[i];
  try {
    let idRiga = giaFatte.get(v.link) || null;
    let subRiga = null;
    if (idRiga) conta.ritrovati++;
    else {
      const vicini = (await cl.query(
        `select id, name, sub_category, address, city, country, phone,
                st_distance(geog, st_setsrid(st_makepoint($1,$2),4326)::geography) m
           from public.locali_pois
          where geog is not null and st_dwithin(geog, st_setsrid(st_makepoint($1,$2),4326)::geography, 300)
          order by geog <-> st_setsrid(st_makepoint($1,$2),4326)::geography limit 60`, [v.lon, v.lat])).rows;
      let migliore = null, pMigliore = 0;
      for (const cand of vicini) {
        if (idPresi.has(cand.id)) continue;
        const p = punteggio(v, cand);
        if (p > pMigliore) { pMigliore = p; migliore = cand; }
      }
      if (migliore) {
        idRiga = migliore.id; subRiga = migliore.sub_category; conta.abbinati[pMigliore]++;
        if (campione.abbinati.length < 50 || pMigliore === 1) campione.abbinati.push(`[p${pMigliore}] ${v.nome}  →  ${migliore.name} · ${migliore.address || '—'} · ${migliore.city || '—'} (${Math.round(migliore.m)} m)`);
      } else {
        const voti = {};
        for (const cand of vicini.slice(0, 10)) if (cand.city) { const k = `${cand.city}|${cand.country || ''}`; voti[k] = (voti[k] || 0) + 1; }
        const [citta, paeseVicini] = (Object.entries(voti).sort((a, b) => b[1] - a[1])[0]?.[0] || '|').split('|');
        const paese = paeseVicini || v.paeseFile;
        conta.nuovi++;
        if (campione.nuovi.length < 40) campione.nuovi.push(`${v.nome} · ${citta || '—'} · ${v.tipo} · vicini: ${vicini.slice(0, 3).map((x) => x.name).join(' | ') || 'nessuno'}`);
        idRiga = v.idNuovo;
        if (SCRIVI) {
          await cl.query(
            `insert into public.locali_pois (id, name, lat, lon, sub_category, city, country, confidence, source)
             values ($1,$2,$3,$4,$5,$6,$7,0.8,'findmeglutenfree')
             on conflict (id) do update set name = excluded.name, lat = excluded.lat, lon = excluded.lon`,
            [idRiga, v.nome, v.lat, v.lon, SUB_DA_TIPO[v.tipo], citta || null, paese || null]);
        }
      }
      idPresi.add(idRiga);
    }
    // Il tipo: quello della fonte se lo dice; altrimenti quello del locale che abbiamo (pizzeria, gelateria, bar).
    let tipo = v.tipo;
    if (!v.catNota && tipoGiaFatto.has(v.link)) tipo = tipoGiaFatto.get(v.link);
    else if (!v.catNota && subRiga) tipo = subRiga === 'pizzeria' ? 'pizzeria' : subRiga === 'gelateria' ? 'gelateria' : ['bar', 'caffe'].includes(subRiga) ? 'bar' : 'ristorante';
    if (SCRIVI) {
      await cl.query(
        `insert into public.locali_gf (id, lat, lon, livello, tipo, url, telefono, sito, indirizzo, piatti, prezzo, voto, recensioni, categoria, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         on conflict (id) do update set lat = excluded.lat, lon = excluded.lon, livello = excluded.livello, tipo = excluded.tipo, url = excluded.url,
           telefono = excluded.telefono, sito = excluded.sito, indirizzo = excluded.indirizzo, piatti = excluded.piatti,
           prezzo = excluded.prezzo, voto = excluded.voto, recensioni = excluded.recensioni, categoria = excluded.categoria, updated_at = now()`,
        [idRiga, v.lat, v.lon, v.liv, tipo, v.link, v.telefono, v.sito, v.indirizzo, v.piatti, v.prezzo, v.voto, v.recensioni, v.categoria]);
      // Sul locale: telefono, sito e indirizzo SOLO dove i nostri mancano (per chiave, una riga).
      if (v.telefono || v.sito || v.indirizzo) {
        await cl.query(
          `update public.locali_pois set phone = coalesce(phone, $2), website = coalesce(website, $3), address = coalesce(address, $4)
            where id = $1 and (phone is null or website is null or address is null)`,
          // In locali_pois `address` e' la sola via («Via Carriona, 265»): CAP e citta' hanno le loro colonne.
          [idRiga, v.telefono, v.sito, v.indirizzo ? (v.indirizzo.match(/^(.*?),\s*\d{5}\b/)?.[1] || v.indirizzo) : null]);
      }
    }
  } catch (e) {
    conta.errori++;
    if (conta.errori <= 10) console.log(`[errore] ${v.nome}: ${e.message}`);
    if (conta.errori > 50) { console.log('[STOP] troppi errori.'); break; }
  }
  await sleep(PAUSA_MS);
  if ((i + 1) % 100 === 0) {
    console.log(`… ${i + 1}/${daFare.length} · abbinati ${conta.abbinati[1] + conta.abbinati[2] + conta.abbinati[3]} · ritrovati ${conta.ritrovati} · nuovi ${conta.nuovi}`);
    let male = 0;
    while (!(await saluteSitoOk())) {
      if (++male >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila: mi fermo. Rilanciabile.'); await cl.end(); process.exit(0); }
      await sleep(60000);
    }
  }
}
const abb = conta.abbinati[1] + conta.abbinati[2] + conta.abbinati[3];
console.log(`\n${SCRIVI ? 'SCRITTO' : 'PROVA (nessuna scrittura)'}`);
console.log(`  gia' fatti (ritrovati dal link): ${conta.ritrovati}`);
console.log(`  agganciati a un locale esistente: ${abb}  (telefono+nome ${conta.abbinati[3]}, stesso nome ${conta.abbinati[2]}, nome contenuto ${conta.abbinati[1]})`);
console.log(`  locali nuovi (ov-gf-…): ${conta.nuovi}`);
console.log(`  errori: ${conta.errori}`);
fs.mkdirSync(path.join(RADICE, 'scratch'), { recursive: true });
const rapporto = path.join(RADICE, 'scratch', 'senza-glutine-import-rapporto.txt');
fs.writeFileSync(rapporto, `ABBINATI (campione; tutti i «nome contenuto» p1)\n${campione.abbinati.join('\n')}\n\nNUOVI (campione)\n${campione.nuovi.join('\n')}\n`, 'utf8');
console.log(`Campione: ${rapporto}`);
await cl.end();
