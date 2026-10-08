#!/usr/bin/env node
/**
 * GLI EX «RISTORANTI STELLATI» DEL LUSSO → TABELLA DEI LOCALI (04/10/2026).
 *
 *   node scripts/sposta-ex-stellati-in-locali.mjs <backup-lusso-stellati.csv>            prova: abbina e conta, NON scrive
 *   node scripts/sposta-ex-stellati-in-locali.mjs <backup.csv> --scrivi [--pausa=200] [--limite=N]
 *
 * Il 03/10 i 2.137 «ristoranti stellati» del livello Lusso che la Guida non
 * conferma sono passati a category 'locali' in shared_pois
 * (scripts/correggi-lusso-stellati.mjs). Ma la chip Locali dal 28/09 legge
 * solo locali_pois: li' non comparivano. Committente (03/10): «non c'e' la
 * tabella locali?» … «sposta i non stellati».
 *
 * Per ognuno (id presi dalla copia salvata, nessuna lettura di massa):
 * - SE IL LOCALE C'E' GIA' in locali_pois (stesso nome/telefono entro poche
 *   centinaia di metri, regole di importa-michelin.mjs): gli si copiano
 *   telefono e sito DOVE MANCANO, e la riga di shared_pois si nasconde. Un pin
 *   solo, niente perso.
 * - SE NON C'E': nasce in locali_pois ('ov-osm-<id>', source 'osm') con nome,
 *   coordinate, telefono, sito; citta' e paese dai locali vicini. Poi la riga
 *   di shared_pois si nasconde.
 * - locali_pois non ha una colonna per la foto: l'URL della foto della riga
 *   nascosta resta nel REGISTRO (scratch/ex-stellati-spostati-<data>.csv,
 *   scritto PRIMA di toccare il database, con tutti i valori di prima) e la
 *   riga nascosta finisce da sola in doppioni_da_ereditare (trigger). Il sito
 *   viene copiato, quindi la foto dal sito ufficiale si ritrova all'apertura.
 * - Si tocca SOLO una riga ancora category 'locali', poi_type 'ristorante',
 *   non nascosta: se qualcuno l'ha cambiata nel frattempo, resta com'e'.
 * - Una riga per volta, per chiave, pausa, /api/health ogni 100.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const RADICE = process.env.WIP_RADICE || 'C:/progetti/itainta';
const args = process.argv.slice(2);
const fileBackup = args.find((a) => !a.startsWith('--'));
const SCRIVI = args.includes('--scrivi');
const PAUSA_MS = Number((args.find((a) => a.startsWith('--pausa=')) || '').split('=')[1]) || 200;
const LIMITE = Number((args.find((a) => a.startsWith('--limite=')) || '').split('=')[1]) || 0;
if (!fileBackup) { console.error('Uso: node scripts/sposta-ex-stellati-in-locali.mjs <backup-lusso-stellati.csv> [--scrivi]'); process.exit(1); }

const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join(RADICE, f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
let ids = fs.readFileSync(fileBackup, 'utf8').split(/\r?\n/).slice(1).map((l) => l.split(',')[0]).filter((x) => x && !x.startsWith('"'));
if (LIMITE) ids = ids.slice(0, LIMITE);

// ── nomi (come importa-michelin.mjs)
const GENERICHE = new Set(('ristorante restaurant restaurante trattoria osteria hostaria locanda taverna enoteca bistrot bistro brasserie cafe caffe bar pizzeria gasthaus gasthof wirtshaus ' +
  'antica antico nuova nuovo hotel the il lo la le gli un una da dal dalla di del della dei degli delle al alla alle ai a e ed et and de du des les el los las der die das zum zur im am by at of').split(/\s+/));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const parole = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 1 && !GENERICHE.has(w)))];
const chiaveTel = (x) => { const d = String(x || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : null; };
function punteggio(v, cand) {
  const d = Number(cand.m);
  const na = norm(v.name), nb = norm(cand.name);
  const pa = parole(v.name), pb = parole(cand.name);
  const comuni = pa.filter((w) => pb.includes(w)).length;
  const uguale = (na && na === nb) || (pa.length > 0 && pa.length === pb.length && comuni === pa.length);
  const [corto, lungo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const contenuto = corto.length > 0 && corto.every((w) => lungo.includes(w)) && lungo.length - corto.length <= 2;
  const tel = chiaveTel(v.contact_phone) && chiaveTel(v.contact_phone) === chiaveTel(cand.phone);
  if (tel && d <= 300 && (uguale || comuni > 0)) return 3;
  if (uguale && d <= 250) return 2;
  if (contenuto && d <= 100) return 1;
  return 0;
}

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

const cl = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await cl.connect();
await cl.query('SET default_transaction_read_only = off');
await cl.query(`SET statement_timeout = '15s'`);

// Le righe d'origine, a gruppi di 200 id (chiave primaria).
const righe = [];
for (let i = 0; i < ids.length; i += 200) {
  righe.push(...(await cl.query(
    `select id, name, lat, lon, category, poi_type, status, is_hidden, contact_phone, contact_website, image_url, photo_url
       from public.shared_pois where id = any($1)`, [ids.slice(i, i + 200)])).rows);
}
const daFare = righe.filter((x) => x.category === 'locali' && x.poi_type === 'ristorante' && x.is_hidden !== true
  && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon)) && x.name);
console.log(`id nella copia: ${ids.length} · righe trovate: ${righe.length} · da spostare (ancora 'locali'/'ristorante', visibili): ${daFare.length}`);

// IL REGISTRO, prima di toccare qualsiasi cosa.
const cella = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.mkdirSync(path.join(RADICE, 'scratch'), { recursive: true });
const registro = path.join(RADICE, 'scratch', `ex-stellati-spostati-${new Date().toISOString().slice(0, 10)}.csv`);
const testa = ['id', 'name', 'lat', 'lon', 'category', 'poi_type', 'status', 'is_hidden', 'contact_phone', 'contact_website', 'image_url', 'photo_url'];
if (!fs.existsSync(registro)) fs.writeFileSync(registro, testa.join(',') + ',destinazione\n', 'utf8');

const conta = { agganciati: [0, 0, 0, 0], nuovi: 0, errori: 0, conFoto: 0 };
const campione = [];
for (let i = 0; i < daFare.length; i++) {
  const v = daFare[i];
  // In che passo si era quando qualcosa e' andato storto (04/10: da Oracle timeout senza sapere dove).
  let passo = 'vicini';
  const t0riga = Date.now();
  try {
    const vicini = (await cl.query(
      `select id, name, sub_category, city, country, phone, website,
              st_distance(geog, st_setsrid(st_makepoint($1,$2),4326)::geography) m
         from public.locali_pois
        where geog is not null and st_dwithin(geog, st_setsrid(st_makepoint($1,$2),4326)::geography, 300)
        order by geog <-> st_setsrid(st_makepoint($1,$2),4326)::geography limit 60`, [Number(v.lon), Number(v.lat)])).rows;
    let migliore = null, pMigliore = 0;
    for (const cand of vicini) { const p = punteggio(v, cand); if (p > pMigliore) { pMigliore = p; migliore = cand; } }
    const destinazione = migliore ? migliore.id : `ov-osm-${String(v.id).replace(/^lusso-/, '')}`;
    if (migliore) conta.agganciati[pMigliore]++; else conta.nuovi++;
    if (v.image_url || v.photo_url) conta.conFoto++;
    if (campione.length < 40) campione.push(migliore ? `[p${pMigliore}] ${v.name} → ${migliore.name} (${Math.round(migliore.m)} m, ${migliore.city || '—'})` : `[nuovo] ${v.name} · vicini: ${vicini.slice(0, 3).map((x) => x.name).join(' | ') || 'nessuno'}`);
    if (SCRIVI) {
      fs.appendFileSync(registro, testa.map((k) => cella(v[k])).join(',') + ',' + cella(destinazione) + '\n', 'utf8');
      if (migliore) {
        if (v.contact_phone || v.contact_website) {
          passo = 'update locali_pois';
          await cl.query(`update public.locali_pois set phone = coalesce(phone, $2), website = coalesce(website, $3) where id = $1 and (phone is null or website is null)`,
            [migliore.id, v.contact_phone || null, v.contact_website || null]);
        }
      } else {
        const voti = {};
        for (const cand of vicini.slice(0, 10)) if (cand.city) { const k = `${cand.city}|${cand.country || ''}`; voti[k] = (voti[k] || 0) + 1; }
        const [citta, paese] = (Object.entries(voti).sort((a, b) => b[1] - a[1])[0]?.[0] || '|').split('|');
        passo = 'insert locali_pois';
        await cl.query(
          `insert into public.locali_pois (id, name, lat, lon, sub_category, city, country, website, phone, confidence, source)
           values ($1,$2,$3,$4,'ristorante',$5,$6,$7,$8,0.7,'osm')
           on conflict (id) do nothing`,
          [destinazione, v.name, Number(v.lat), Number(v.lon), citta || null, paese || null, v.contact_website || null, v.contact_phone || null]);
      }
      // Solo adesso, col locale al sicuro nell'altra tabella, la copia di shared_pois si nasconde.
      passo = 'nascondi shared_pois';
      // (04/10/2026) Circa una scrittura su dieci andava in timeout a 15 s anche con lo script da
      // solo, mentre la stessa riga, riprovata, passa in meno di un secondo: sono fermate
      // momentanee del database, non un difetto della riga. Quindi si riprova (3 volte, con
      // pausa) prima di contarla come errore.
      for (let tentativo = 1; ; tentativo++) {
        try {
          await cl.query(`update public.shared_pois set is_hidden = true where id = $1 and category = 'locali' and poi_type = 'ristorante' and is_hidden is not true`, [v.id]);
          break;
        } catch (e) {
          if (tentativo >= 3 || !/timeout/i.test(String(e.message))) throw e;
          conta.riprovate = (conta.riprovate || 0) + 1;
          await sleep(8000);
        }
      }
    }
  } catch (e) {
    conta.errori++;
    if (conta.errori <= 25) console.log(`[errore] passo «${passo}» dopo ${Date.now() - t0riga} ms · ${v.id} ${v.name}: ${e.message}`);
    if (conta.errori > 80) { console.log('[STOP] troppi errori.'); break; }
  }
  await sleep(PAUSA_MS);
  if ((i + 1) % 100 === 0) {
    console.log(`… ${i + 1}/${daFare.length} · agganciati ${conta.agganciati[1] + conta.agganciati[2] + conta.agganciati[3]} · nuovi ${conta.nuovi} · riprovate ${conta.riprovate || 0} · errori ${conta.errori}`);
    let male = 0;
    while (!(await saluteSitoOk())) {
      if (++male >= 3) { console.log('[STOP] sito non sano per 3 controlli di fila: mi fermo. Rilanciabile.'); await cl.end(); process.exit(0); }
      await sleep(60000);
    }
  }
}
const agg = conta.agganciati[1] + conta.agganciati[2] + conta.agganciati[3];
console.log(`\n${SCRIVI ? 'SCRITTO' : 'PROVA (nessuna scrittura)'}`);
console.log(`  gia' presenti in locali_pois (agganciati): ${agg}  (telefono+nome ${conta.agganciati[3]}, stesso nome ${conta.agganciati[2]}, nome contenuto ${conta.agganciati[1]})`);
console.log(`  aggiunti a locali_pois come nuovi: ${conta.nuovi}`);
console.log(`  con una foto sulla riga nascosta (URL nel registro): ${conta.conFoto}`);
console.log(`  errori: ${conta.errori}`);
console.log(SCRIVI ? `Registro dei valori di prima: ${registro}` : campione.join('\n'));
await cl.end();
