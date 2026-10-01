#!/usr/bin/env node
// LE LISTE DELL'ARRICCHIMENTO TOTALE (26/09/2026): legge i file esportati da esporta-arricchimento-totale.mjs
// (g1…g6.jsonl) e scrive le DUE corsie di lavoro.
//
//  · completa.jsonl — luoghi che hanno UNA FONTE da cui scrivere (Wikidata/Wikipedia salvati, sito ufficiale, o
//    dentro una delle 2.179 città principali dove Wikipedia/web di solito rispondono): /api/poi/enrich in modo
//    COMPLETO — foto, descrizione breve, descrizione dettagliata e info, con il modello, dalle sole fonti. UNA
//    lingua (la lingua del posto se è una delle 7 dell'app, altrimenti italiano), nessuna traduzione, nessuna
//    audioguida (ordine del committente: «dopo vediamo se inserire l'audioguida»; le traduzioni si fanno alla
//    prima apertura). Stesso formato di lista-tutti-culturali.jsonl: si lavora con driver-totale.mjs.
//  · veloce.jsonl — luoghi SENZA fonte, e tutta la schedina del gruppo 6 (gusto, sentieri, ciclabili, shopping,
//    lusso): /api/poi/enrich in modo `fast` — foto, fatti di Wikidata, incipit di Wikipedia, riga dei dati; niente
//    modello. Un luogo senza nessuna fonte resta com'è: mai testo inventato.
//
// Ordine della corsia completa: prima chi ha Wikidata/Wikipedia (materiale certo), poi chi ha il sito ufficiale,
// poi le città principali; a parità, l'ordine dei gruppi del committente (1 chiese/musei…, 2 altri culturali,
// 3 beni culturali, 4 natura, 5 tematici/località/famiglie). Corsia veloce: per gruppo, 1→6.
// Le categorie che wip-mondo (giro veloce dei culturali senza fonte) lavora già NON si rimettono in coda.
// Nomi fatti SOLO di parole generiche («Chiesa», «Park», «Lake») si scartano: nessuna fonte può combaciare per
// nome, e il tempo di ricerca è il bene più scarso (file scartati-generici.jsonl, per un giro futuro «solo dati»).
//   node scripts/lista-arricchimento-totale.mjs --in=D:/arricchimento-totale --geonames=scratch/geonames
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { LINGUA_PAESE, raggioKm } from './lib-lingue-citta.mjs';

const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const IN = arg('in', 'D:/arricchimento-totale'), GEO = arg('geonames', 'scratch/geonames');
const OUT = arg('out', path.join(IN, 'liste'));
// Si può costruire a tappe (l'esportazione dura ore): --gruppi=1 --suffisso= poi --gruppi=2,3,4,5,6 --suffisso=-2 →
// completa.jsonl / veloce.jsonl e completa-2.jsonl / veloce-2.jsonl. Il driver le lavora in fila (--lista=a,b).
const GRUPPI_DA_FARE = String(arg('gruppi', '1,2,3,4,5,6')).split(',').map(Number).filter(Boolean);
const SUF = arg('suffisso', '');
fs.mkdirSync(OUT, { recursive: true });

// ── Lingua del posto (stessa griglia di lista-tutti-culturali.mjs) ──
const cella = (lat, lon, passo) => `${Math.floor(lat / passo)}:${Math.floor(lon / passo)}`;
const grigliaMondo = new Map();
for (const r of fs.readFileSync(path.join(GEO, 'cities15000.txt'), 'utf8').split(/\r?\n/)) {
  if (!r) continue;
  const c = r.split('\t');
  const citta = { lat: Number(c[4]), lon: Number(c[5]), cc: c[8] };
  const k = cella(citta.lat, citta.lon, 0.5);
  if (!grigliaMondo.has(k)) grigliaMondo.set(k, []);
  grigliaMondo.get(k).push(citta);
}
const distKm = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, s = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
function paeseVicino(lat, lon) {
  let best = null, dMin = Infinity;
  const cy = Math.floor(lat / 0.5), cx = Math.floor(lon / 0.5);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) for (const c of grigliaMondo.get(`${cy + dy}:${cx + dx}`) || []) { const d = distKm(lat, lon, c.lat, c.lon); if (d < dMin) { dMin = d; best = c; } }
  return best && dMin <= 150 ? best.cc : null;
}
// ── Le 2.179 città principali ──
const principali = fs.readFileSync('scripts/data/citta-prearricchimento.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map((r) => JSON.parse(r));
const grigliaPrincipali = new Map();
for (const c of principali) {
  c.km = raggioKm(c.popolazione);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = cella(c.lat + dy * 0.1, c.lon + dx * 0.1, 0.1); if (!grigliaPrincipali.has(k)) grigliaPrincipali.set(k, []); grigliaPrincipali.get(k).push(c); }
}
const inCittaPrincipale = (lat, lon) => (grigliaPrincipali.get(cella(lat, lon, 0.1)) || []).some((c) => distKm(lat, lon, c.lat, c.lon) <= c.km);

// ── Nomi generici ──
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const GENERICHE = new Set(('church chiesa chiese iglesia igreja kirche eglise kerk kosciol kostel cerkev temple tempio tempel templo mosque moschea mezquita moschee masjid cami mosquee synagogue sinagoga synagoge chapel cappella capilla capela kapelle abbey abbazia abbaye monastery monastero monasterio kloster museum museo musee museu muzeum gallery galleria galerie galeria castle castello castillo chateau schloss burg palace palazzo palacio palais park parco parque parc lake lago lac see river fiume rio riviere fluss peak monte mount mountain forest foresta bosque bois wald garden giardino jardin garten monument monumento memorial cathedral cattedrale catedral cathedrale dom duomo fountain fontana fuente fontaine bridge ponte puente pont brucke square piazza plaza place platz tower torre tour turm theatre teatro theater viewpoint belvedere mirador lookout cave grotta cueva waterfall cascata cascada island isola isla spring sorgente fonte source cemetery cimitero cementerio friedhof market mercato mercado marche markt zoo playground statue statua estatua sculpture scultura arch arco arc gate porta puerta ruins rovine ruinas villa the of and de del della di dei la le les el los las da do dos das du des von van und et y e a in al nel sul').split(/\s+/));
const generico = (nome) => { const w = norm(nome).split(' ').filter(Boolean); return !w.length || w.every((x) => GENERICHE.has(x) || /^\d+$/.test(x) || x.length <= 2); };

// Categorie già in mano a wip-mondo (giro veloce dei culturali senza fonte): non si rimettono in coda.
const IN_WIP_MONDO = new Set(['monumenti', 'chiese', 'musei', 'gemme', 'church', 'museum', 'monument', 'castle', 'cathedral', 'palace', 'art_museum', 'gallery', 'theatre', 'memorial', 'fort', 'ruins', 'archaeological_site', 'tower', 'villa', 'beni_culturali', 'panorami', 'viewpoint', 'archeologia', 'castelli', 'arte', 'artwork', 'borghi', 'shrine', 'church_cathedral', 'catholic_church', 'square', 'fountain', 'bridge']);
const SORGENTI_LIVELLI = /^(osm_sentieri|osm_ciclabili|osm_mtb|osm_ippovie|osm_storici|osm_corsa|osm_canoa|cai_sentiero_italia|pdipr_fr)/;

const conta = { letti: 0, completa: 0, veloce: 0, wipMondo: 0, generici: 0, schedina: 0 };
const perGruppo = {};
const comp = new Map(); // chiave di ordine → righe (corsia completa, si ordina)
const veloceFile = (n) => path.join(OUT, `.veloce${SUF}-g${n}.jsonl`);
const scrittori = {};
const scriviVeloce = (g, riga) => { (scrittori[g] ||= fs.createWriteStream(veloceFile(g))).write(JSON.stringify(riga) + '\n'); };
const wsGen = fs.createWriteStream(path.join(OUT, `scartati-generici${SUF}.jsonl`));

for (const n of GRUPPI_DA_FARE) {
  const file = path.join(IN, `g${n}.jsonl`);
  if (!fs.existsSync(file)) { console.log(`manca ${file}`); continue; }
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const r of rl) {
    if (!r) continue;
    let p; try { p = JSON.parse(r); } catch { continue; } // l'ultima riga di un file ancora in scrittura può essere a metà
    conta.letti++;
    const gruppo = (n === 4 && SORGENTI_LIVELLI.test(String(p.source || ''))) ? 6 : n; // sentieri e ciclabili stanno in `natura`
    (perGruppo[gruppo] ||= { letti: 0 }).letti++;
    // Cinema (moviescenemap) e fontane (Wikidata Q43483): li ha già arricchiti android-d9 (26/09/2026: foto Commons, riga
    // Wikidata, opere, traduzioni in corso). Non si riscrivono descrizioni, foto, works_json né poi_details.
    if (/^(cinema:|wikidata:fontane)/.test(String(p.source || ''))) { conta.dAltra = (conta.dAltra || 0) + 1; continue; }
    if (generico(p.name)) { conta.generici++; wsGen.write(JSON.stringify({ id: p.id, name: p.name, category: p.category }) + '\n'); continue; }
    const base = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, poi_type: p.poi_type, city: p.city || undefined };
    if (gruppo === 6) { conta.schedina++; scriviVeloce(6, base); continue; }
    const fonte = !!(p.wikidata || p.wikipedia_url);
    const tier = p.is_gem ? 0 : fonte ? 1 : p.ha_sito ? 2 : inCittaPrincipale(p.lat, p.lon) ? 3 : 9;
    if (tier === 9) {
      // Senza fonte: corsia veloce, salvo le categorie che wip-mondo lavora già.
      if (IN_WIP_MONDO.has(String(p.category))) { conta.wipMondo++; continue; }
      conta.veloce++; scriviVeloce(gruppo, base); continue;
    }
    const cc = paeseVicino(p.lat, p.lon);
    const locale = (cc && LINGUA_PAESE[cc]) || 'it';
    const scritta = p.ha_breve || p.ha_lunga ? String(p.description_lang || 'it').toLowerCase().slice(0, 2) : null;
    const riga = { ...base, wikidata: p.wikidata || undefined, wikipedia_url: p.wikipedia_url || undefined, is_gem: p.is_gem === true, lang: scritta || locale, solo_traduci: false, altre: [] };
    const k = `${tier}:${gruppo}`;
    (comp.get(k) || comp.set(k, []).get(k)).push(riga); conta.completa++;
  }
  console.log(`gruppo ${n} letto: ${JSON.stringify(conta)}`);
}
await new Promise((r) => wsGen.end(r));
// Corsia completa, in ordine.
const chiavi = [...comp.keys()].sort((a, b) => { const [ta, ga] = a.split(':').map(Number), [tb, gb] = b.split(':').map(Number); return ta - tb || ga - gb; });
const wsC = fs.createWriteStream(path.join(OUT, `completa${SUF}.jsonl`));
const dettaglio = {};
for (const k of chiavi) { dettaglio[k] = comp.get(k).length; for (const riga of comp.get(k)) wsC.write(JSON.stringify(riga) + '\n'); }
await new Promise((r) => wsC.end(r));
// Corsia veloce: per gruppo, 1→6.
for (const w of Object.values(scrittori)) await new Promise((r) => w.end(r));
const wsV = fs.createWriteStream(path.join(OUT, `veloce${SUF}.jsonl`));
const perGruppoV = {};
for (const n of [1, 2, 3, 4, 5, 6]) {
  const f = veloceFile(n);
  if (!fs.existsSync(f)) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
  for await (const r of rl) { if (r) { wsV.write(r + '\n'); perGruppoV[n] = (perGruppoV[n] || 0) + 1; } }
  fs.unlinkSync(f);
}
await new Promise((r) => wsV.end(r));
console.log('\n=== RIEPILOGO ===');
console.log(JSON.stringify(conta));
console.log('corsia COMPLETA per (tier:gruppo) — tier 0 gemme, 1 Wikidata/Wikipedia, 2 sito, 3 città principali:', dettaglio);
console.log('corsia VELOCE per gruppo:', perGruppoV);
for (const f of [`completa${SUF}.jsonl`, `veloce${SUF}.jsonl`, `scartati-generici${SUF}.jsonl`]) console.log(`${f}: ${Math.round(fs.statSync(path.join(OUT, f)).size / 1048576)} MB`);
