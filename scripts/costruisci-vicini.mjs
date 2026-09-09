// Precalcola i «luoghi vicini» di ogni pagina pubblica e li lascia in
// api_cache, da dove server.ts li legge senza mai interrogare shared_pois.
//
// ── Perché esiste ─────────────────────────────────────────────────────────
//
// Finché ogni pagina esiste solo dentro la sitemap, il sito è 211.000
// indirizzi a distanza zero link dalla home: nessun percorso li collega, e un
// sito nuovo fatto così è esattamente il profilo che i motori classificano
// come generazione di massa. Otto link a luoghi veri e vicini in fondo a ogni
// pagina trasformano l'elenco in un grafo percorribile — ed è l'intervento
// che pesa di più sull'indicizzazione, senza scrivere una riga di contenuto
// nuovo.
//
// ── Perché per CELLA e non per luogo ──────────────────────────────────────
//
// Una voce di cache per luogo vorrebbe dire 211.000 scritture: al ritmo che
// questo database regge sono ore, e il database è lo stesso che serve l'app.
// Raggruppando per cella di 0,1° (~11 km) le voci diventano poche migliaia,
// e la pagina resta a UNA ricerca per chiave — non una scansione.
// La chiave deve combaciare con seoCella() in server.ts, altrimenti la
// pagina cerca una voce che nessuno ha scritto.
//
// Uso: node scripts/costruisci-vicini.mjs
import "dotenv/config";
import axios from "axios";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mancano VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const LOTTO = 1000;
const PAUSA_MS = 1500;      // stesso respiro del costruttore di sitemap
const VICINI_PER_LUOGO = 8;
const MIN_DESCRIZIONE = 100;

// Le stesse categorie del costruttore di sitemap: chi non finisce in sitemap
// non ha una pagina, quindi non è un vicino linkabile.
const { CATEGORIE } = await import("./categorie-seo.mjs");

// TENERE ALLINEATO con seoTestoProprio() in server.ts e con
// scripts/costruisci-sitemap.mjs.
const SEGNAPOSTO = [
  /gemme segnalate su WIP/i, /questa scheda essenziale/i, /luogo d['’]interesse a\b/i,
  /mi\s+dispiace/i, /non\s+essendo\s+disponibili\s+informazioni/i,
  /non\s+(?:sono|risultano)\s+disponibili\s+informazioni/i,
  /informazioni\s+(?:specifiche\s+)?non\s+disponibili/i,
  /non\s+(?:ho|abbiamo|posso)\s+(?:informazioni|scrivere)/i,
  /no\s+(?:specific\s+)?information\s+(?:is\s+)?available/i,
  /(?:could|can)\s*not\s+find\s+(?:any\s+)?information/i,
  /as\s+an\s+ai\s+language\s+model/i, /come\s+modello\s+(?:di\s+)?linguaggio/i,
];
const MODELLI = [
  /[^.]*\bis\s+listed\s+on\s+the\s+United\s+States\s+National\s+Register\s+of\s+Historic\s+Places\b[^.]*\.?/gi,
  /\bListed\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\.?/gi,
  /\bNational\s+Register\s+(?:of\s+Historic\s+Places\s+)?(?:reference|number)\b[^.]*\.?/gi,
];
const testoProprio = (t) => {
  const s = String(t || '');
  if (SEGNAPOSTO.some((re) => re.test(s))) return '';
  return MODELLI.reduce((x, re) => x.replace(re, ' '), s).replace(/\s+/g, ' ').trim();
};
const STATI_ESCLUSI = new Set(['draft', 'needs_revision', 'rejected', 'hidden']);

const ammesso = (p) => {
  if (p.is_hidden === true || STATI_ESCLUSI.has(String(p.status || ''))) return false;
  const c = testoProprio(p.description_short).length;
  const l = testoProprio(p.description_long).length;
  return Math.max(c, l) >= MIN_DESCRIZIONE;
};

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => String(s ?? '')
  .normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const urlLuogo = (p) => `${slug(p?.name) || 'luogo'}~${encodeURIComponent(String(p?.id ?? ''))}`;

/** Deve dare lo STESSO risultato di seoCella() in server.ts. */
const cella = (lat, lon) => {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return `${Math.floor(la * 10)}_${Math.floor(lo * 10)}`;
};

/** Distanza in km, formula dell'emisenoverso. */
const distanza = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const s = Math.sin(dLa / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

async function cacheScrivi(chiave, contenuto) {
  await axios.post(
    `${SUPABASE_URL}/rest/v1/api_cache`,
    { cache_key: chiave, content_type: 'seo', text_content: contenuto, created_at: new Date().toISOString() },
    { headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 30000 },
  );
}
async function cacheLeggi(chiave) {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(chiave)}&select=text_content&limit=1`,
      { headers: H, timeout: 20000 });
    return Array.isArray(data) && data[0] ? data[0].text_content : null;
  } catch { return null; }
}

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
  const progresso = JSON.parse((await cacheLeggi('seo_vicini_progresso')) || '{}');
  const fatte = new Set(Array.isArray(progresso.fatte) ? progresso.fatte : []);
  let inCorso = progresso.categoria || null;
  let ultimoId = progresso.id || '';

  // Tutti i luoghi ammessi, tenuti per cella. Sta in memoria perché servono
  // le celle VICINE per calcolare i vicini di chi sta sul bordo: scrivere una
  // cella alla volta significherebbe tagliare fuori meta' dei candidati.
  const perCella = new Map();
  let letteTotali = 0, ammesseTotali = 0;
  const t0 = Date.now();

  const daFare = CATEGORIE.filter((c) => !fatte.has(c));
  const partenza = inCorso && daFare.includes(inCorso) ? daFare.indexOf(inCorso) : 0;
  if (partenza > 0) daFare.splice(0, partenza);
  if (fatte.size) console.log(`Riprendo: ${fatte.size} categorie gia' lette`);

  for (const categoria of daFare) {
    console.log(`\n── ${categoria} ──`);
    let abbandonata = false;
    while (true) {
      const filtro = `category=eq.${encodeURIComponent(categoria)}`
        + (ultimoId ? `&id=gt.${encodeURIComponent(ultimoId)}` : '');
      let righe;
      try {
        righe = await leggiConPazienza(
          `${SUPABASE_URL}/rest/v1/shared_pois?select=id,name,lat,lon,category,city,description_short,description_long,is_hidden,status`
          + `&${filtro}&order=id.asc&limit=${LOTTO}`,
          `lettura (${categoria})`);
      } catch (e) {
        console.warn(`  ${categoria} ABBANDONATA: ${e?.message || e}`);
        abbandonata = true;
        break;
      }
      if (!righe.length) break;
      ultimoId = righe[righe.length - 1].id;
      letteTotali += righe.length;

      for (const p of righe) {
        if (!ammesso(p)) continue;
        const k = cella(p.lat, p.lon);
        if (!k) continue;
        if (!perCella.has(k)) perCella.set(k, []);
        perCella.get(k).push({
          id: String(p.id), n: p.name, u: urlLuogo(p),
          lat: Number(p.lat), lon: Number(p.lon), c: p.category,
        });
        ammesseTotali++;
      }
      await attesa(PAUSA_MS);
    }
    if (!abbandonata) fatte.add(categoria);
    ultimoId = '';
    await cacheScrivi('seo_vicini_progresso',
      JSON.stringify({ categoria: abbandonata ? categoria : null, id: abbandonata ? ultimoId : '', fatte: [...fatte] }));
    console.log(`  ${categoria}: ${ammesseTotali} ammessi finora, ${perCella.size} celle`);
  }

  console.log(`\nLettura finita: ${ammesseTotali} luoghi in ${perCella.size} celle, ${letteTotali} righe lette.`);
  console.log('Calcolo i vicini e scrivo…');

  let scritte = 0;
  for (const [k, luoghi] of perCella) {
    const [ci, cj] = k.split('_').map(Number);
    // I candidati sono la cella e le otto intorno: chi sta sul bordo ha i
    // vicini veri di la' dal confine, e senza questo passo avrebbe in pagina
    // link piu' lontani di quelli che ha sotto casa.
    const candidati = [];
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const vic = perCella.get(`${i}_${j}`);
        if (vic) candidati.push(...vic);
      }
    }
    const mappa = {};
    for (const p of luoghi) {
      mappa[p.id] = candidati
        .filter((q) => q.id !== p.id)
        .map((q) => ({ q, d: distanza(p, q) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, VICINI_PER_LUOGO)
        .map(({ q, d }) => ({
          n: q.n, u: q.u, c: q.c,
          km: d < 1 ? Number(d.toFixed(1)) : Math.round(d),
        }));
    }
    await cacheScrivi(`seo_vicini_${k}`, JSON.stringify(mappa));
    scritte++;
    if (scritte % 200 === 0) {
      console.log(`  ${scritte}/${perCella.size} celle scritte, ${Math.round((Date.now() - t0) / 60000)} min`);
    }
    await attesa(120);
  }

  console.log(`\nFatto: ${scritte} celle scritte per ${ammesseTotali} luoghi, ${Math.round((Date.now() - t0) / 60000)} minuti.`);
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
