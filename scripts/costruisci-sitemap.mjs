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
// Nessun tetto vero (committente, 09/09/2026: «fino a quante ne prende, no
// limiti»). Resta solo un fermo di sicurezza a 5 milioni di pagine, che serve
// a non scrivere un indice che nessun crawler accetterebbe: il protocollo
// sitemap ammette 50.000 voci per file indice, e 5.000 ci stanno larghe.
const MAX_SHARD = 5000;
// Soglia unica a 100 caratteri, foto o no: passa ogni luogo che abbia una
// descrizione vera. Sotto i 100 restano solo frammenti tipo «Chiesa a
// Milano», che farebbero pagine vuote (misurato: valgono il 3% del totale).
// Vale il testo PIU' LUNGO fra description_short e description_long: molti
// luoghi hanno solo il secondo, e prima venivano scartati per sbaglio.
const MIN_DESCRIZIONE = 100;

// ── LA LUNGHEZZA NON BASTA: I TESTI COMPILATI (09/09/2026) ────────────────
// Misurato su un campione per categoria: il 43% dei testi ammessi in «cinema»
// e il 33% in «beni_culturali» non erano descrizioni ma un modello riempito
// con nome e luogo. Superavano i 100 caratteri senza dire niente del posto —
// esattamente le pagine che un motore di ricerca chiama «doorway» e che, in
// massa, fanno male a tutto il dominio, non solo a se stesse.
//
// Due famiglie, trattate in modo diverso perche' sono cose diverse.
//
// 1. SEGNAPOSTO NOSTRI. Si dichiarano da soli: «sara' sostituita da una
//    descrizione completa non appena una fonte documentata raccontera' questo
//    luogo». Una pagina che ammette di non avere contenuto non va pubblicata:
//    si scarta tutta, per firma, senza guardare la lunghezza.
//    Nella stessa famiglia stanno i RIFIUTI DEL MODELLO: schede in cui l'AI ha
//    scritto di non sapere niente del posto («Mi dispiace, ma il materiale
//    fornito non contiene alcuna informazione…»). Sono l'1% del campione, ma
//    su una pagina pubblica sono la cosa peggiore che si possa pubblicare.
const SEGNAPOSTO = [
  /gemme segnalate su WIP/i,
  /questa scheda essenziale/i,
  /luogo d['’]interesse a\b/i,
  /mi\s+dispiace/i,
  /non\s+essendo\s+disponibili\s+informazioni/i,
  /non\s+(?:sono|risultano)\s+disponibili\s+informazioni/i,
  /informazioni\s+(?:specifiche\s+)?non\s+disponibili/i,
  /non\s+(?:ho|abbiamo|posso)\s+(?:informazioni|scrivere)/i,
  /no\s+(?:specific\s+)?information\s+(?:is\s+)?available/i,
  /(?:could|can)\s*not\s+find\s+(?:any\s+)?information/i,
  /as\s+an\s+ai\s+language\s+model/i,
  /come\s+modello\s+(?:di\s+)?linguaggio/i,
];

// 2. FRASI DI REGISTRO. Il registro storico americano (NRHP) da' sempre la
//    stessa frase: vera, ma identica per decine di migliaia di beni. Qui non
//    si scarta la riga: si TOGLIE la frase di formula e si guarda cosa resta.
//    Chi ha anche un paragrafo suo passa, chi era solo formula no.
const MODELLI = [
  /[^.]*\bis\s+listed\s+on\s+the\s+United\s+States\s+National\s+Register\s+of\s+Historic\s+Places\b[^.]*\.?/gi,
  /\bListed\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\.?/gi,
  /\bNational\s+Register\s+(?:of\s+Historic\s+Places\s+)?(?:reference|number)\b[^.]*\.?/gi,
];

/** Il testo tolte le formule: e' questo che deve valere i 100 caratteri. */
const testoProprio = (t) => {
  const s = String(t || '');
  if (SEGNAPOSTO.some((re) => re.test(s))) return '';
  return MODELLI.reduce((x, re) => x.replace(re, ' '), s).replace(/\s+/g, ' ').trim();
};

const LOTTO = 1000;    // righe lette per giro: senza filtri in SQL regge
// Respiro fra un lotto e l'altro. Tenuto alto apposta: questo database serve
// anche l'app e i lavori di massa delle altre sessioni, e il 09/09/2026 il
// login degli utenti e' caduto proprio mentre era sotto pressione. Una
// sitemap che ci mette un'ora in piu' non fa male a nessuno; un login che
// non funziona si'.
const PAUSA_MS = 1500;

// Le categorie stanno in un modulo a parte perche' le usa anche
// costruisci-vicini.mjs: se le due liste divergessero, la sitemap elencherebbe
// pagine senza vicini, o i vicini punterebbero a pagine che non esistono.
import { CATEGORIE } from "./categorie-seo.mjs";

/* La lista era qui: spostata in scripts/categorie-seo.mjs il 09/09/2026.
// LA COLONNA `category` HA DUE GENERAZIONI DI VALORI (misurato il 09/09/2026).
// Accanto alle macro storiche («musei», «monumenti», «chiese», «panorami»)
// convivono i valori a grana fine scritti dagli harvest: `beach` da solo vale
// 170.133 righe, `peak` 121.708, `waterfall` 43.729, `viewpoint` 38.204,
// `castle` 33.933. La lista di prima ne conosceva dieci e lasciava fuori
// milioni di luoghi — non per scelta, per omissione.
// Quindi qui c'e' l'UNIONE di tutto: le macro, i poi_type di CategoryMap.kt
// (con le varianti italiane), i verticali tematici e le famiglie naturali.
// Le voci che nel database non esistono costano una domanda vuota a testa
// (risposta immediata), quindi e' meglio abbondare che indovinare.
// L'ORDINE E' PRIORITA': prima il patrimonio con le schede piu' curate, che e'
// anche quello che la gente cerca. Il lavoro dura giorni, e chi arriva prima
// viene indicizzato prima.
const CATEGORIE = [
  // ── Patrimonio curato: le macro storiche ──
  'musei', 'monumenti', 'chiese', 'castelli', 'archeo', 'beni_culturali',
  'localita', 'panorami', 'natura', 'cinema',

  // ── Musei a grana fine ──
  'museum', 'gallery', 'art_museum', 'art_gallery', 'natural_history_museum',
  'house_museum', 'museum_ship',

  // ── Monumenti e patrimonio costruito a grana fine ──
  'monument', 'castle', 'ruins', 'archaeological_site', 'archaeological_park',
  'artwork', 'attraction', 'square', 'bridge', 'fountain', 'theatre',
  'opera_house', 'palace', 'tower', 'skyscraper', 'cemetery', 'library',
  'windmill', 'watermill', 'aqueduct', 'observatory', 'stadium', 'birthplace',
  'necropolis', 'catacomb', 'fortress', 'stronghold', 'city_walls', 'city_gate',
  'villa', 'domus', 'harbour', 'pier', 'shipyard', 'mine', 'quarry', 'saltworks',
  'chimney', 'funicular', 'rack_railway', 'amphitheatre', 'roman_baths',
  'roman_theatre', 'roman_circus', 'roman_villa', 'triumphal_arch', 'obelisk',
  'mausoleum', 'market_hall', 'train_station', 'dam', 'prison', 'memorial',
  'sculpture', 'university', 'town_hall', 'coastal_tower', 'racetrack',
  'racecourse', 'ski_jump', 'war_cemetery', 'concentration_camp', 'archive',
  'radio_telescope', 'hydro_plant',

  // ── Luoghi di culto a grana fine ──
  'church', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale', 'chapel',
  'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
  'shrine', 'santuario', 'baptistery', 'bell_tower', 'cloister', 'crypt',
  'synagogue', 'mosque', 'temple',

  // ── Natura e panorami: famiglie e grana fine, con le varianti italiane ──
  'viewpoint', 'lighthouse', 'scenic_road', 'aerialway', 'via_ferrata',
  'ski_resort', 'geopark', 'national_park',
  'spiagge', 'beach', 'spiaggia', 'bay', 'baia', 'island', 'isola',
  'cliff', 'falesia', 'coast', 'costa', 'dune',
  'vette', 'peak', 'vetta', 'volcano', 'vulcano', 'glacier', 'ghiacciaio',
  'mountain_pass', 'valico', 'ridge', 'arete', 'saddle',
  'acque', 'waterfall', 'cascata', 'cascate', 'spring', 'sorgente', 'hot_spring',
  'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'gola', 'canyon',
  'grotte', 'cave', 'grotta', 'cave_entrance', 'sinkhole', 'abisso',
  'parchi', 'park', 'parco', 'garden', 'giardino', 'botanical_garden',
  'nature_reserve', 'riserva', 'forest', 'foresta', 'wood', 'bosco',
  'desert', 'deserto', 'tree', 'albero',

  // ── Verticali tematici e layer a sé ──
  'enogastronomia', 'cantina', 'enoteca', 'vigneto', 'uliveto', 'birrificio',
  'distilleria', 'caseificio', 'formaggi', 'frantoio', 'gastronomia', 'fattoria',
  'pasticceria', 'cioccolato', 'caffe', 'te', 'miele', 'spezie', 'museo_gusto',
  'strada_del_vino', 'panificio', 'macelleria', 'pescheria', 'ortofrutta',
  'dolciumi',
  'shopping', 'shopping_street', 'department_store', 'shopping_mall',
  'historic_arcade', 'outlet_village', 'souk_bazaar', 'duty_free_zone',
  'lusso', 'palace_hotel', 'hotel_5_stelle', 'ristorante_stellato',
  'chiave_michelin', 'resort_esclusivo', 'marina_yacht', 'club_esclusivo',
  'treno_lusso_storico', 'isola_privata', 'stazione_sci_lusso', 'ryokan_lusso',
  'noleggio_yacht', 'jet_privato', 'casino_lusso',
  'street_art', 'terme', 'sentieri', 'trail', 'gemme', 'mercati', 'cieli',
  'fioriture', 'memoria', 'lento',

  // ── Coda: contenuto piu' magro, ma se ha una descrizione vera merita la pagina ──
  'famiglie', 'playground', 'theme_park', 'aquarium', 'zoo', 'water_park',
  'locali', 'restaurant', 'cafe', 'bar', 'pub', 'fast_food',
  'consigli', 'information', 'tourism_information', 'community', 'utilita',
];
*/

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
  // Ripresa. Il progresso si tiene per NOME di categoria, non per indice:
  // la lista qui sopra e' cresciuta ed e' stata riordinata (09/09/2026), e un
  // indice salvato avrebbe fatto ripartire il lavoro dalla categoria
  // sbagliata — saltandone alcune per sempre e rifacendone altre da capo.
  // `fatte` e' l'elenco delle categorie gia' esaurite: cosi' la ripresa non
  // dipende piu' nemmeno dall'ordine.
  const progresso = JSON.parse((await cacheLeggi('seo_sitemap_progresso')) || '{}');
  let shard = Number(await cacheLeggi('seo_sitemap_shard_totale')) || 0;
  const fatte = new Set(Array.isArray(progresso.fatte) ? progresso.fatte : []);
  // Conversione dal vecchio formato (categoria = indice nella lista di allora),
  // per non buttare le ore gia' spese.
  const LISTA_VECCHIA = ['musei', 'monumenti', 'chiese', 'cinema', 'beni_culturali',
    'localita', 'natura', 'enogastronomia', 'street_art', 'sentieri'];
  let inCorso = progresso.categoria;
  if (typeof inCorso === 'number') {
    LISTA_VECCHIA.slice(0, inCorso).forEach((c) => fatte.add(c));
    inCorso = LISTA_VECCHIA[inCorso];
  }
  let ultimoId = progresso.id || '';
  if (inCorso || fatte.size) {
    console.log(`Riprendo da «${inCorso}», id > ${ultimoId}, shard ${shard}, ${fatte.size} categorie gia' fatte`);
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

  // Si riparte dalla categoria interrotta e si saltano quelle esaurite.
  const daFare = CATEGORIE.filter((c) => !fatte.has(c));
  const partenza = inCorso && daFare.includes(inCorso) ? daFare.indexOf(inCorso) : 0;
  if (partenza > 0) daFare.splice(0, partenza);
  if (inCorso && !daFare.includes(inCorso)) ultimoId = '';  // categoria sparita dalla lista

  for (const categoria of daFare) {
    if (shard >= MAX_SHARD) break;
    console.log(`\n── ${categoria} ──`);
    let ammesseQui = 0;
    let abbandonata = false;

    while (shard < MAX_SHARD) {
      // UN SOLO GIRO, DESCRIZIONE INCLUSA. Il primo tentativo la chiedeva
      // separatamente per i soli candidati, per non trascinare testo inutile;
      // ma dentro una categoria (che e' indicizzata) il costo sparisce —
      // misurato: 500 righe di «musei» con tutto dentro in 409 ms. La
      // seconda fase aggiungeva solo un modo di sbagliare, ed e' bastato un
      // `in.(...)` con le virgole codificate per farla fallire con un 400.
      const filtro = `category=eq.${encodeURIComponent(categoria)}`
        + (ultimoId ? `&id=gt.${encodeURIComponent(ultimoId)}` : '');
      // Una categoria che non risponde piu' non deve fermare le altre
      // duecento: la si abbandona dove sta, e la ripresa la ritrovera' (non
      // finisce in `fatte`) al giro dopo, quando il database respira.
      let righe;
      try {
        righe = await leggiConPazienza(
          `${SUPABASE_URL}/rest/v1/shared_pois?select=id,name,image_url,description_short,description_long,is_hidden,status,updated_at`
          + `&${filtro}&order=id.asc&limit=${LOTTO}`,
          `lettura (${categoria})`,
        );
      } catch (e) {
        console.warn(`  ${categoria} ABBANDONATA: ${e?.message || e}`);
        abbandonata = true;
        break;
      }
      if (!righe.length) break;
      ultimoId = righe[righe.length - 1].id;
      letteTotali += righe.length;

      const ammesse = righe.filter((p) => {
        if (p.is_hidden === true || STATI_ESCLUSI.has(String(p.status || ''))) return false;
        const corto = testoProprio(p.description_short).length;
        const lungo = testoProprio(p.description_long).length;
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
      await cacheScrivi('seo_sitemap_progresso',
        JSON.stringify({ categoria, id: ultimoId, fatte: [...fatte] }));
      await attesa(PAUSA_MS);
    }

    console.log(`  ${categoria}: ${ammesseQui} pagine ammesse${abbandonata ? ' (interrotta, si riprende dopo)' : ''}`);
    // Se e' stata abbandonata si tiene il suo segnalibro, cosi' al rilancio
    // riprende da dove era arrivata invece che dall'inizio.
    if (!abbandonata) {
      fatte.add(categoria);
      await cacheScrivi('seo_sitemap_progresso',
        JSON.stringify({ categoria: null, id: '', fatte: [...fatte] }));
    }
    ultimoId = '';  // la categoria dopo riparte dal suo inizio
  }

  if (buffer.length && shard < MAX_SHARD) await scriviShard();

  console.log(`\nFatto: ${shard} sitemap, ${letteTotali} righe lette, ${Math.round((Date.now() - t0) / 60000)} minuti.`);
  console.log('Ora la sitemap le dichiara e le serve dalla cache.');
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
