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
const MAX_SHARD = 50;
const MIN_DESCRIZIONE = 180;

const LOTTO = 1000;    // righe lette per giro: senza filtri in SQL regge
const PAUSA_MS = 300;  // respiro: il database serve anche l'app

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
    { cache_key: chiave, endpoint: 'seo', text_content: contenuto, created_at: new Date().toISOString() },
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
  // Ripresa: si riparte dall'ultimo confine di sitemap completata.
  let ultimoId = (await cacheLeggi('seo_sitemap_progresso_id')) || '';
  let shard = Number(await cacheLeggi('seo_sitemap_shard_totale')) || 0;
  if (ultimoId) console.log(`Riprendo dallo shard ${shard}, id > ${ultimoId}`);

  let buffer = [];
  let letteTotali = 0;
  const t0 = Date.now();

  while (shard < MAX_SHARD) {
    // ── Fase 1: colonne leggere, cammino sulla chiave primaria ──
    const filtro = ultimoId ? `&id=gt.${encodeURIComponent(ultimoId)}` : '';
    const righe = await leggiConPazienza(
      `${SUPABASE_URL}/rest/v1/shared_pois?select=id,name,image_url,is_hidden,status,updated_at`
      + `&order=id.asc&limit=${LOTTO}${filtro}`,
      'fase 1',
    );
    if (!righe.length) break;
    ultimoId = righe[righe.length - 1].id;
    letteTotali += righe.length;

    const candidati = righe.filter((p) =>
      p.is_hidden !== true && p.image_url && !STATI_ESCLUSI.has(String(p.status || '')));

    // ── Fase 2: la descrizione solo per i candidati (di solito ~1%) ──
    if (candidati.length) {
      const lista = candidati.map((p) => `"${String(p.id).replace(/"/g, '')}"`).join(',');
      const testi = await leggiConPazienza(
        `${SUPABASE_URL}/rest/v1/shared_pois?select=id,description_short&id=in.(${encodeURIComponent(lista)})`,
        'fase 2',
      );
      const lunghezza = new Map(testi.map((t) => [String(t.id), String(t.description_short || '').length]));

      for (const p of candidati) {
        if ((lunghezza.get(String(p.id)) || 0) < MIN_DESCRIZIONE) continue;
        const loc = `https://wip.guide/luogo/${urlLuogo(p)}`;
        const lastmod = p.updated_at ? String(p.updated_at).slice(0, 10) : '';
        buffer.push(`<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq></url>`);

        if (buffer.length >= URL_PER_SITEMAP) {
          const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${buffer.join('\n')}\n</urlset>`;
          await cacheScrivi(`seo_sitemap_shard_${shard}`, xml);
          shard++;
          buffer = [];
          // Progresso salvato solo al confine di una sitemap completa: cosi'
          // una ripresa non lascia mai una sitemap a meta'.
          await cacheScrivi('seo_sitemap_progresso_id', String(ultimoId));
          await cacheScrivi('seo_sitemap_shard_totale', String(shard));
          console.log(`  sitemap ${shard - 1} scritta — ${letteTotali} righe lette, ${Math.round((Date.now() - t0) / 60000)} min`);
          if (shard >= MAX_SHARD) break;
        }
      }
    }

    await attesa(PAUSA_MS);
  }

  // L'ultimo pezzo, se ne resta uno.
  if (buffer.length && shard < MAX_SHARD) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${buffer.join('\n')}\n</urlset>`;
    await cacheScrivi(`seo_sitemap_shard_${shard}`, xml);
    shard++;
    await cacheScrivi('seo_sitemap_progresso_id', String(ultimoId));
    await cacheScrivi('seo_sitemap_shard_totale', String(shard));
  }

  console.log(`\nFatto: ${shard} sitemap, ${letteTotali} righe lette, ${Math.round((Date.now() - t0) / 60000)} minuti.`);
  console.log('Ora /sitemap.xml le dichiara e /sitemap-luoghi-N.xml le serve dalla cache.');
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
