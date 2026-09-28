#!/usr/bin/env node
// ESPORTAZIONE PER L'ARRICCHIMENTO TOTALE (26/09/2026, ordine del committente: «arricchimento total — pin,
// descrizione breve, foto, descrizione dettagliata e info — per 1) chiese/church, museum, gallery, viewpoint,
// castle, moschee e templi, 2) culturali da Overture, 3) beni culturali, 4) NATURA tutta a parte le spiagge,
// 5) tematici, località e tutte le sottocategorie, 6) gusto, sentieri, ciclabili, shopping, lusso: schedina
// breve con foto»; l'audioguida dopo).
//
// Come esportazione.mjs dei culturali (stesse regole di 22/09 dopo l'incidente del 21/09): UNA categoria alla
// volta in scansione ORDINATA dell'indice (category, id), pagine da 1.000, pausa fra le pagine, tetto 60 s,
// freno se la pagina è lenta, riparte da sola dopo una caduta di connessione. In più:
//  · si esportano SOLO i pin che hanno ancora qualcosa da fare (senza foto, o senza testo breve, o — per i
//    gruppi 1-5 — senza descrizione dettagliata);
//  · le categorie che il pre-arricchimento dei culturali (wip-citta: gemme, monumenti, musei, chiese,
//    panorami) già copre si esportano SOLO per gli id `ov-…` (Overture), che quella lista salta;
//  · prima di ogni gruppo di pagine si controlla /api/health: se il sito rallenta ci si ferma (il database è
//    condiviso con gli utenti: un'esportazione non deve mai farlo soffrire);
//  · le spiagge (`beach`) NON si esportano: sono trattate come i locali (ordine del committente).
//   node scripts/esporta-arricchimento-totale.mjs --out=D:/arricchimento-totale [--continua] [--pagina=1000] [--pausa=1500] [--gruppi=1,2,3]
// Scrive <out>/g<N>.jsonl (+ <out>/stato.json per riprendere).
import fs from 'node:fs';
import pg from 'pg';
const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const OUT = arg('out', 'D:/arricchimento-totale');
const CONTINUA = A.includes('--continua');
const PAGINA = Number(arg('pagina', 1000)), PAUSA = Number(arg('pausa', 1500));
const SOLO = new Set(String(arg('gruppi', '1,2,3,4,5,6')).split(',').map((x) => Number(x.trim())).filter(Boolean));
const MAX_PER_CATEGORIA = Number(arg('max', 0)) || Infinity; // solo per le prove
const env = {};
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }

// Categorie che wip-citta lavora già (id NON ov-): qui solo gli ov-.
const COPERTE_DA_CITTA = new Set(['gemme', 'monumenti', 'musei', 'chiese', 'panorami']);
// I gruppi, nell'ordine dell'ordine del committente. `tipo`: 'completo' = pin + breve + foto + lunga + info;
// 'schedina' = schedina breve + foto (gruppo 6).
const GRUPPI = [
  { n: 1, nome: 'chiese, templi, moschee, musei, gallerie, panorami, castelli', tipo: 'completo', cat: ['church', 'chiesa', 'chiese', 'cathedral', 'temple', 'mosque', 'synagogue', 'abbey', 'monastery', 'shrine', 'chapel', 'museum', 'musei', 'gallery', 'art_museum', 'house_museum', 'natural_history_museum', 'museum_ship', 'viewpoint', 'panorami', 'observatory', 'castle', 'castelli', 'fortress', 'fort', 'palace', 'ruins', 'tower'] },
  { n: 2, nome: 'altri culturali (monumenti, memoriali, archeologia, teatri, piazze, ponti, fontane…)', tipo: 'completo', cat: ['monument', 'monumenti', 'memorial', 'archaeological_site', 'archaeological_park', 'archeo', 'archeologia', 'theatre', 'opera_house', 'square', 'bridge', 'fountain', 'sculpture', 'artwork', 'villa', 'lighthouse', 'catacomb', 'crypt', 'amphitheatre', 'mausoleum', 'town_hall', 'domus', 'city_gate', 'triumphal_arch', 'roman_circus', 'war_cemetery', 'gemme', 'borghi', 'arte'] },
  { n: 3, nome: 'beni culturali', tipo: 'completo', cat: ['beni_culturali'] },
  // NATURA: tutta a parte le spiagge (`beach`, `spiagge`), trattate come i locali. Dentro `natura` ci sono anche
  // sentieri e ciclabili (source osm_sentieri*, osm_ciclabili*, osm_mtb): li separa la lista (gruppo 6).
  { n: 4, nome: 'natura (senza spiagge)', tipo: 'completo', cat: ['natura', 'park', 'lake', 'river', 'peak', 'waterfall', 'cave_entrance', 'cave', 'nature_reserve', 'national_park', 'forest', 'island', 'botanical_garden', 'spring', 'glacier', 'volcano', 'desert', 'garden', 'tree', 'ski_resort'] },
  { n: 5, nome: 'tematici, località, famiglie e loro sottocategorie', tipo: 'completo', cat: ['terme', 'hot_spring', 'cinema', 'cieli', 'street_art', 'mercati', 'marketplace', 'market_hall', 'fioriture', 'memoria', 'lento', 'cemetery', 'localita', 'attraction', 'playground', 'theme_park', 'water_park', 'zoo', 'aquarium', 'famiglie'] },
  { n: 6, nome: 'gusto, sentieri, shopping, lusso (schedina breve + foto)', tipo: 'schedina', cat: ['enogastronomia', 'cantina', 'birrificio', 'cioccolato', 'formaggi', 'distilleria', 'pasticceria', 'caffe', 'miele', 'strada_del_vino', 'trail', 'cammini', 'ciclabili', 'shopping', 'lusso'] },
];
const MAI = new Set(['beach', 'spiagge']);
for (const g of GRUPPI) for (const c of g.cat) if (MAI.has(c)) throw new Error(`categoria vietata nel gruppo ${g.n}: ${c}`);

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function saluteOk() {
  // Il sito risponde in fretta? Altrimenti si aspetta: il database serve prima gli utenti.
  for (let t = 0; t < 30; t++) {
    const t0 = Date.now();
    try { const r = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) }); if (r.ok && Date.now() - t0 < 3500) return; } catch { /* sito lento: si aspetta */ }
    console.log(`${new Date().toISOString()} il sito rallenta (health ${Date.now() - t0} ms): aspetto 2 minuti`);
    await pausa(120000);
  }
}
let c;
async function connetti() {
  c = new pg.Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  c.on('error', (e) => console.log(`${new Date().toISOString()} connessione persa: ${e.message}`));
  await c.connect();
  await c.query("SET default_transaction_read_only = on; SET statement_timeout = '60s'; SET enable_bitmapscan = off; SET enable_sort = off; SET max_parallel_workers_per_gather = 0");
}
await connetti();
fs.mkdirSync(OUT, { recursive: true });
const STATO = `${OUT}/stato.json`;
let stato = { g: 0, cat: 0, ultimo: '', tot: {}, perCat: {} };
if (CONTINUA) { try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {} }
else for (const g of GRUPPI) fs.writeFileSync(`${OUT}/g${g.n}.jsonl`, '');
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));

for (; stato.g < GRUPPI.length; stato.g++, stato.cat = 0, stato.ultimo = '', salva()) {
  const g = GRUPPI[stato.g];
  if (!SOLO.has(g.n)) continue;
  const file = `${OUT}/g${g.n}.jsonl`;
  console.log(`${new Date().toISOString()} GRUPPO ${g.n} — ${g.nome}: riparto da «${g.cat[stato.cat] || 'fine'}» id > «${stato.ultimo}»`);
  for (; stato.cat < g.cat.length; stato.cat++, stato.ultimo = '', salva()) {
    const cat = g.cat[stato.cat];
    const soloOv = COPERTE_DA_CITTA.has(cat);
    // Completezza: per la schedina bastano foto + testo breve; per gli altri anche la descrizione dettagliata.
    const MANCA = g.tipo === 'schedina'
      ? `(coalesce(image_url, photo_url, '') = '' OR length(coalesce(description_short, '')) < 30)`
      : `(coalesce(image_url, photo_url, '') = '' OR length(coalesce(description_short, '')) < 30 OR length(coalesce(description_long, '')) < 300)`;
    let nCat = 0, ultimo = stato.ultimo || (soloOv ? 'ov-' : '');
    for (let pag = 0; ; pag++) {
      if (pag % 25 === 0) await saluteOk();
      const t0 = Date.now();
      let r;
      try {
        r = await c.query(`SELECT id, name, lat, lon, category, poi_type, city, is_gem, wikidata, wikipedia_url, source, description_lang,
            (coalesce(image_url, photo_url, '') <> '') AS ha_foto, (length(coalesce(description_short, '')) >= 30) AS ha_breve,
            (length(coalesce(description_long, '')) >= 300) AS ha_lunga, (coalesce(contact_website, '') <> '') AS ha_sito
          FROM shared_pois
          WHERE category = $1 AND id > $2 ${soloOv ? `AND id < 'ov.'` : ''} AND is_hidden IS NOT TRUE AND coalesce(is_locked, false) = false
            AND coalesce(name, '') <> '' AND coalesce(source, '') NOT IN ('itinerary') AND lat <> 'NaN'::float8 AND lon <> 'NaN'::float8 AND ${MANCA}
          ORDER BY id LIMIT ${PAGINA}`, [cat, ultimo]);
      } catch (e) {
        if (/terminat|ECONNRESET|closed|not queryable|timeout expired/i.test(String(e.message))) {
          console.log(`${new Date().toISOString()} ${cat}: ${e.message} — riapro la connessione fra 15 s`);
          try { await c.end(); } catch {}
          await pausa(15000);
          try { await connetti(); } catch (e2) { console.log(`${new Date().toISOString()} riconnessione fallita: ${e2.message} — riprovo fra 60 s`); await pausa(60000); }
          continue;
        }
        console.log(`${new Date().toISOString()} ${cat}: ${e.message} — freno 2 minuti e riprovo`);
        await pausa(120000); continue;
      }
      const ms = Date.now() - t0;
      if (!r.rows.length) break;
      fs.appendFileSync(file, r.rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
      nCat += r.rows.length; ultimo = r.rows[r.rows.length - 1].id; stato.ultimo = ultimo;
      stato.tot[g.n] = (stato.tot[g.n] || 0) + r.rows.length; stato.perCat[cat] = (stato.perCat[cat] || 0) + r.rows.length; salva();
      if (pag % 20 === 0) console.log(`${new Date().toISOString()}  g${g.n} ${cat}: ${nCat} (pagina ${ms} ms) — totale g${g.n} ${stato.tot[g.n]}`);
      if (nCat >= MAX_PER_CATEGORIA) break;
      if (ms > 20000) { console.log(`${new Date().toISOString()} pagina lenta (${ms} ms): freno 60 s`); await pausa(60000); } else await pausa(PAUSA);
    }
    console.log(`${new Date().toISOString()} g${g.n} ${cat}${soloOv ? ' (solo ov-)' : ''}: ${nCat}`);
  }
  console.log(`${new Date().toISOString()} GRUPPO ${g.n} finito: ${stato.tot[g.n] || 0} pin (${Math.round((fs.existsSync(file) ? fs.statSync(file).size : 0) / 1048576)} MB)`);
}
console.log(`${new Date().toISOString()} FINE: ${JSON.stringify(stato.tot)}`);
try { fs.writeFileSync(`${OUT}/FINITO`, new Date().toISOString()); } catch {}
await c.end();
