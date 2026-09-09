// Costruisce le sitemap dei luoghi e le lascia in api_cache, da dove
// server.ts le serve senza mai interrogare il database.
//
// ── Perché offline, e perché in questo modo ────────────────────────────────
//
// Servirle a richiesta voleva dire chiedere a Postgres mille righe che
// soddisfano tre filtri (is_hidden, description_short, image_url): misurato
// il 09/09/2026, quella query va in timeout (57014) dopo 8 secondi anche con
// `limit=200`, e continua a farlo dopo gli indici aggiunti quel giorno —
// perché al ritmo di ammissione reale (~1%) il database deve scorrere
// decine di migliaia di righe per trovarne duecento. Un crawler ripassa
// sulle sitemap in continuazione: sarebbe stata quella scansione a ogni
// passaggio, sullo stesso database che serve l'app.
//
// Quindi qui NON si filtra in SQL. Si cammina sulla chiave primaria
// (`id > ultimo`), che è una scansione a indice dal costo costante, e si
// filtra nel codice. Due fasi, per non trascinare testo inutile sulla rete:
//   1. colonne leggere (id, nome, foto, stato) per capire chi è candidato;
//   2. solo per i candidati, la descrizione, per la regola dei 180 caratteri.
//
// Il lavoro dura ore (al ritmo dell'1% servono milioni di righe lette per
// arrivare a 50.000 pagine), quindi salva i progressi a ogni sitemap
// completata e riparte da lì: si può fermare e rilanciare quando si vuole.
//
// Uso: node scratch/costruisci-sitemap.mjs
import "dotenv/config";
import axios from "axios";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mancano VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

// Devono combaciare con server.ts, altrimenti l'indice promette sitemap che
// non esistono o ne nasconde di buone.
const URL_PER_SITEMAP = 1000;
const MAX_SHARD = 300;
// Soglia unica a 100 caratteri, foto o no: passa ogni luogo che abbia una
// descrizione vera. Sotto i 100 restano solo frammenti tipo «Chiesa a
// Milano», che farebbero pagine vuote (misurato: valgono il 3% del totale).
// Vale il testo PIU' LUNGO fra description_short e description_long: molti
// luoghi hanno solo il secondo, e prima venivano scartati per sbaglio.
const MIN_DESCRIZIONE = 100;

const LOTTO = 1000;    // righe lette per giro: senza filtri in SQL regge
// Respiro fra un lotto e l'altro. Tenuto alto apposta: questo database serve
// anche l'app e i lavori di massa delle altre sessioni, e il 09/09/2026 il
// login degli utenti e' caduto proprio mentre era sotto pressione. Una
// sitemap che ci mette un'ora in piu' non fa male a nessuno; un login che
// non funziona si'.
const PAUSA_MS = 1500;

// SI CAMMINA PER CATEGORIA, NON SU TUTTA LA TABELLA (misurato il 09/09/2026).
// Sull'intera tabella la resa e' dell'1% — per 50.000 pagine servirebbe
// leggere 5 milioni di righe. Filtrando per categoria, che e' indicizzata,
// «musei» risponde in 409 ms con l'8% di ammessi: venti volte meglio.
// L'ordine non e' casuale: prima le categorie con il contenuto piu' curato,
// che sono anche quelle che la gente cerca («museo», «cosa vedere»). Se il
// tetto di pagine si esaurisce, si esaurisce sulle pagine migliori.
const CATEGORIE = [
  'musei', 'monumenti', 'chiese', 'cinema', 'beni_culturali',
  'localita', 'natura', 'enogastronomia', 'street_art', 'sentieri',
];

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

const escapeXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const slug = (s) => String(s ?? '')
  .normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** Stessa forma di seoUrlLuogo() in server.ts: la tilde separa nome e id. */
const urlLuogo = (p) => `${slug(p?.name) || 'luogo'}~${encodeURIComponent(String(p?.id ?? ''))}`;

const STATI_ESCLUSI = new Set(['draft', 'needs_revision', 'rejected', 'hidden']);

async function cacheScrivi(chiave, contenuto) {
  await axios.post(
    `${SUPABASE_URL}/rest/v1/api_cache`,
    // La colonna e' `content_type`, non `endpoint` (verificato sullo schema:
    // cache_key, content_type, text_content, audio_url, created_at).
    { cache_key: chiave, content_type: 'seo', text_content: contenuto, created_at: new Date().toISOString() },
    { headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 30000 },
  );
}

async function cacheLeggi(chiave) {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(chiave)}&select=text_content&limit=1`,
      { headers: H, timeout: 20000 },
    );
    return Array.isArray(data) && data[0] ? data[0].text_content : null;
  } catch { return null; }
}

/** Un giro di lettura, con attesa e riprova: il database è condiviso. */
async function leggiConPazienza(url, etichetta) {
  for (let tentativo = 0; ; tentativo++) {
    try {
      const { data } = await axios.get(url, { headers: H, timeout: 60000 });
      return Array.isArray(data) ? data : [];
    } catch (e) {
      const codice = e?.response?.data?.code || e?.response?.status || e.message;
      if (tentativo >= 5) throw new Error(`${etichetta}: ${codice} dopo 6 tentativi`);
      const pausa = 15000 * (tentativo + 1);
      console.warn(`  ${etichetta} fallita (${codice}) — riprovo fra ${pausa / 1000}s`);
      await attesa(pausa);
    }
  }
}

async function main() {
  // Ripresa: si riparte dalla categoria e dall'id dove ci si era fermati.
  const progresso = JSON.parse((await cacheLeggi('seo_sitemap_progresso')) || '{}');
  let shard = Number(await cacheLeggi('seo_sitemap_shard_totale')) || 0;
  let iCategoria = Number(progresso.categoria) || 0;
  let ultimoId = progresso.id || '';
  if (ultimoId || iCategoria) {
    console.log(`Riprendo dalla categoria «${CATEGORIE[iCategoria]}», id > ${ultimoId}, shard ${shard}`);
  }

  let buffer = [];
  let letteTotali = 0;
  const t0 = Date.now();

  const scriviShard = async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${buffer.join('\n')}\n</urlset>`;
    await cacheScrivi(`seo_sitemap_shard_${shard}`, xml);
    shard++;
    buffer = [];
    await cacheScrivi('seo_sitemap_shard_totale', String(shard));
    console.log(`  sitemap ${shard - 1} scritta — ${letteTotali} righe lette, ${Math.round((Date.now() - t0) / 60000)} min`);
  };

  for (; iCategoria < CATEGORIE.length && shard < MAX_SHARD; iCategoria++) {
    const categoria = CATEGORIE[iCategoria];
    console.log(`\n── ${categoria} ──`);
    let ammesseQui = 0;

    while (shard < MAX_SHARD) {
      // UN SOLO GIRO, DESCRIZIONE INCLUSA. Il primo tentativo la chiedeva
      // separatamente per i soli candidati, per non trascinare testo inutile;
      // ma dentro una categoria (che e' indicizzata) il costo sparisce —
      // misurato: 500 righe di «musei» con tutto dentro in 409 ms. La
      // seconda fase aggiungeva solo un modo di sbagliare, ed e' bastato un
      // `in.(...)` con le virgole codificate per farla fallire con un 400.
      const filtro = `category=eq.${encodeURIComponent(categoria)}`
        + (ultimoId ? `&id=gt.${encodeURIComponent(ultimoId)}` : '');
      const righe = await leggiConPazienza(
        `${SUPABASE_URL}/rest/v1/shared_pois?select=id,name,image_url,description_short,description_long,is_hidden,status,updated_at`
        + `&${filtro}&order=id.asc&limit=${LOTTO}`,
        `lettura (${categoria})`,
      );
      if (!righe.length) break;
      ultimoId = righe[righe.length - 1].id;
      letteTotali += righe.length;

      const ammesse = righe.filter((p) => {
        if (p.is_hidden === true || STATI_ESCLUSI.has(String(p.status || ''))) return false;
        const corto = String(p.description_short || '').trim().length;
        const lungo = String(p.description_long || '').trim().length;
        return Math.max(corto, lungo) >= MIN_DESCRIZIONE;
      });

      for (const p of ammesse) {
        const loc = `https://www.wip.guide/luogo/${urlLuogo(p)}`;
        const lastmod = p.updated_at ? String(p.updated_at).slice(0, 10) : '';
        buffer.push(`<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq></url>`);
        ammesseQui++;
        if (buffer.length >= URL_PER_SITEMAP) {
          await scriviShard();
          if (shard >= MAX_SHARD) break;
        }
      }

      // Il progresso si salva a ogni giro, non solo a sitemap completa: qui
      // un giro puo' costare minuti, e ripeterlo dopo un'interruzione e'
      // tempo buttato.
      await cacheScrivi('seo_sitemap_progresso', JSON.stringify({ categoria: iCategoria, id: ultimoId }));
      await attesa(PAUSA_MS);
    }

    console.log(`  ${categoria}: ${ammesseQui} pagine ammesse`);
    ultimoId = '';  // la categoria dopo riparte dal suo inizio
  }

  if (buffer.length && shard < MAX_SHARD) await scriviShard();

  console.log(`\nFatto: ${shard} sitemap, ${letteTotali} righe lette, ${Math.round((Date.now() - t0) / 60000)} minuti.`);
  console.log('Ora la sitemap le dichiara e le serve dalla cache.');
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
