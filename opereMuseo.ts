/**
 * OPERE DI UN MUSEO, OPERA PER OPERA (12/09/2026)
 * ================================================
 *
 * Una funzione pura: QID del museo (o della chiesa) + lingua → le sue opere
 * migliori, ognuna con foto, testo di fonte per la spiegazione e sala.
 * Nessuna AI, nessun database, nessuna cache: solo letture HTTP da fonti
 * pubbliche. La cache e la scrittura della spiegazione restano nella rotta
 * (/api/vision/venue-guide), che è la stessa per l'utente dal vivo e per la
 * semina di sfondo: la logica vive in un posto solo.
 *
 * PERCHÉ OPERA PER OPERA. Prima la rotta dava all'AI la voce Wikipedia DEL
 * MUSEO e le lasciava pescare le tappe dalla prosa: un capolavoro citato in
 * mezza riga diventava una spiegazione generica, una stampa citata per
 * confronto diventava una tappa di un altro museo, e le foto si trovavano solo
 * se il titolo scelto dal modello combaciava con l'elenco. Misurato l'11/09
 * su 9 musei e 224 opere (scratch/prototipo-opera-per-opera.mjs): ognuna delle
 * prime 25 opere per notorietà ha una foto sua (224/224), 205 hanno una voce
 * Wikipedia tutta per sé di almeno 1.500 caratteri (186 in italiano, 19 solo
 * in inglese), e la sala si trova da fonti ufficiali per un museo su due.
 *
 * OGNI FONTE FA IL SUO MESTIERE:
 *   CHI     Wikidata: opere con collezione (P195) o luogo (P276) nel museo o
 *           in una sua PARTE (P361: i dipinti del Louvre stanno nel
 *           «Dipartimento di pittura», non nel Louvre), ordinate per numero
 *           di Wikipedia che ne parlano. Il taglio è fatto sulle OPERE, in
 *           una sottoquery: con LIMIT sulle righe il British dava 9 opere.
 *   FOTO    P18 dell'opera → prima immagine della sua categoria Commons (P373)
 *           → immagine della sua voce Wikipedia. Sempre QUELL'opera, mai una
 *           ricerca per parola chiave (regola delle foto vere del progetto).
 *   PERCHÉ  la voce Wikipedia DELL'OPERA nella lingua della guida, poi in
 *           inglese: introduzione + sezioni descrittive, fino a ~2.500
 *           caratteri. Senza voce: i fatti di Wikidata (autore, anno,
 *           materiale, misure, inventario, descrizione) e l'eventuale testo
 *           curatoriale della scheda ufficiale.
 *   DOVE    in ordine, ci si ferma alla prima risposta:
 *           a) API aperta del museo (Met, Art Institute of Chicago, Cleveland):
 *              sala esatta ed «esposta ora sì/no»;
 *           b) P276 dell'opera che punta a una sala che è PARTE del museo;
 *           c) scheda ufficiale dell'opera sul sito del museo, trovata dagli
 *              identificativi esterni dell'opera su Wikidata il cui URL sta
 *              sul dominio del museo (id.rijksmuseum.nl, collezioni.
 *              museoegizio.it, collections.louvre.fr, khm.at…): nessuna
 *              tabella da mantenere a mano, vale per ogni museo che Wikidata
 *              collega. Dalla pagina si leggono sala, «non esposta» e testo.
 *   ESCLUSE le opere con collezioni dichiarate TUTTE fuori dal museo (il
 *           caso dell'Arazzo di Bayeux, che al British sta solo come luogo di
 *           un prestito). Senza collezione dichiarata conta il luogo.
 *
 * Ogni passo ha un tetto di tempo (opzioni.budgetMs): se Wikidata o un sito
 * rallentano, la funzione restituisce quello che ha, mai un errore. Una sala
 * non trovata è "", una foto non trovata è "": nessun ripiego inventato.
 */

export type TipoOpera = 'dipinto' | 'scultura' | 'altro';

export type OperaDelMuseo = {
  qid: string;
  /** Titolo nella lingua della guida, altrimenti quello disponibile. */
  titolo: string;
  /** Titolo inglese (per le API e per chi cerca col cartellino in inglese). */
  titoloEn: string;
  autore: string;
  anno: string;
  inv: string;
  tipo: TipoOpera;
  materiale: string;
  dimensioni: string;
  /** Numero di Wikipedia che hanno una voce sull'opera: la notorietà. */
  fama: number;
  foto: string;
  fonteFoto: 'P18' | 'commons' | 'voce' | '';
  voce: { lingua: string; titolo: string; url: string } | null;
  /** Il materiale da cui l'AI scrive la spiegazione: solo su QUESTA opera. */
  testoFonte: string;
  fonteTesto: 'voce' | 'voce_en' | 'scheda_ufficiale' | 'wikidata' | '';
  sala: string;
  fonteSala: 'api_museo' | 'wikidata' | 'scheda_ufficiale' | '';
  urlScheda: string;
  /** Testo curatoriale della scheda ufficiale, se la pagina ne ha. */
  testoScheda: string;
  /** false = la fonte ufficiale dice che ora non è esposta. null = non si sa. */
  esposta: boolean | null;
};

export type OpereDelMuseoRisultato = {
  museo: { qid: string; parti: number; dominio: string; api: string };
  opere: OperaDelMuseo[];
  diagnostica: { ms: Record<string, number>; errori: string[]; escluse: { qid: string; titolo: string; motivo: string }[] };
};

export type OpzioniOpereMuseo = {
  /** Quante opere restituire (default 25; la rotta ne usa fino a 20). */
  n?: number;
  /** Quante candidate chiedere a Wikidata prima di escludere (default 2n). */
  candidate?: number;
  /** Tetto complessivo di tempo in ms (default 25.000). */
  budgetMs?: number;
  /** Lunghezza massima del testo di fonte per opera (default 4.000). */
  maxTesto?: number;
  /** Scaricare le schede ufficiali (default true). */
  schede?: boolean;
  /** 'chiesa': anche le PARTI dell'edificio (facciate, cappelle, cripta,
   *  chiostri, vetrate: P361) diventano candidate tappe. Default 'museo'. */
  luogo?: 'museo' | 'chiesa';
  userAgent?: string;
};

const UA_DEFAULT = 'WorldInPocket/1.0 (support@wip.guide)';

type Legame = { value: string };
type Riga = Record<string, Legame | undefined>;

const ultimo = (u: string | undefined): string => String(u || '').split('/').pop() || '';
const dormi = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Dominio registrabile: www.louvre.fr → louvre.fr, collections.vam.ac.uk → vam.ac.uk. */
export function dominioBase(url: string): string {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
  const parti = host.split('.').filter(Boolean);
  const SUFFISSI_DOPPI = /^(co|com|org|ac|gov|gob|net|edu|or|ne|go)\.[a-z]{2}$/;
  const coda2 = parti.slice(-2).join('.');
  return SUFFISSI_DOPPI.test(coda2) ? parti.slice(-3).join('.') : coda2;
}

/**
 * Titolo da cartellino, non da catalogo. Le etichette Wikidata dei reperti
 * sono spesso descrizioni intere («Il cosiddetto "Papiro dei Re o Liste dei
 * Re", con un elenco di re sul verso e un testo amministrativo sul recto»,
 * Museo Egizio): oltre i 70 caratteri si preferisce il titolo della voce
 * Wikipedia dell'opera, poi il nome fra virgolette, poi la prima frase.
 */
export function titoloBreve(etichetta: string, titoloVoce = ''): string {
  const e = String(etichetta || '').replace(/\s+/g, ' ').trim();
  if (e.length <= 70) return e;
  const voce = String(titoloVoce || '').replace(/_/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (voce && voce.length <= 70) return voce;
  const virgolette = /[“"«]([^”"»]{4,70})[”"»]/.exec(e);
  if (virgolette) return virgolette[1].trim();
  const taglio = e.split(/,|;| con | with | mit | avec /)[0].trim();
  return (taglio.length <= 70 ? taglio : taglio.slice(0, 67).replace(/\s+\S*$/, '') + '…');
}

/** Esegue n compiti con al massimo `k` in parallelo. */
async function aGruppi<T>(elementi: T[], k: number, fn: (e: T, i: number) => Promise<void>): Promise<void> {
  let i = 0;
  const lavoratori = Array.from({ length: Math.min(k, elementi.length) }, async () => {
    while (i < elementi.length) { const mio = i++; await fn(elementi[mio], mio); }
  });
  await Promise.all(lavoratori);
}

export async function opereDelMuseo(qidMuseo: string, lingua: string, opzioni: OpzioniOpereMuseo = {}): Promise<OpereDelMuseoRisultato> {
  const inizio = Date.now();
  const N = opzioni.n ?? 25;
  const CANDIDATE = opzioni.candidate ?? Math.max(N * 2, 40);
  const BUDGET = opzioni.budgetMs ?? 25000;
  // 4.000 caratteri (~650 parole di fonte): servono per spiegazioni di 150-250
  // parole senza riempitivo (committente 12/09: «non sono poche?»).
  const MAX_TESTO = opzioni.maxTesto ?? 4000;
  const UA = opzioni.userAgent || UA_DEFAULT;
  const lang = String(lingua || 'it').toLowerCase().slice(0, 2);
  const restante = () => BUDGET - (Date.now() - inizio);
  const ms: Record<string, number> = {};
  const errori: string[] = [];
  const escluse: { qid: string; titolo: string; motivo: string }[] = [];
  const vuoto: OpereDelMuseoRisultato = { museo: { qid: qidMuseo, parti: 0, dominio: '', api: '' }, opere: [], diagnostica: { ms, errori, escluse } };
  if (!/^Q\d+$/.test(qidMuseo)) return vuoto;

  const prendi = async (url: string, accetto = 'application/json', timeout = 12000): Promise<Response | null> => {
    const t = Math.min(timeout, Math.max(1500, restante()));
    try {
      return await fetch(url, { headers: { 'User-Agent': UA, Accept: accetto, 'Accept-Language': `${lang},en;q=0.8` }, redirect: 'follow', signal: AbortSignal.timeout(t) });
    } catch (e: any) { errori.push(`${new URL(url).hostname}: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message || e}`); return null; }
  };
  const sparql = async (q: string, timeout = 20000): Promise<Riga[] | null> => {
    for (let tentativo = 0; tentativo < 2; tentativo++) {
      if (restante() < 2000) return null;
      const r = await prendi('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 'application/sparql-results+json', timeout);
      if (r?.ok) { try { return (await r.json()).results.bindings as Riga[]; } catch { return null; } }
      if (r?.status === 429) await dormi(3000); else await dormi(800);
    }
    errori.push('wikidata: nessuna risposta');
    return null;
  };

  const sparqlUnaVolta = async (q: string, timeout: number): Promise<Riga[] | null> => {
    if (restante() < 2000) return null;
    const r = await prendi('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 'application/sparql-results+json', timeout);
    if (!r?.ok) return null;
    try { return (await r.json()).results.bindings as Riga[]; } catch { return null; }
  };

  // ── 1. IL MUSEO E LE SUE PARTI ──────────────────────────────────────────
  let t0 = Date.now();
  const righeMuseo = await sparql(`SELECT ?parte ?sito ?nome ?ente WHERE {
    { ?parte wdt:P361+ wd:${qidMuseo} . } UNION { wd:${qidMuseo} wdt:P856 ?sito . }
    UNION { wd:${qidMuseo} rdfs:label ?nome . FILTER(LANG(?nome) IN ("${lang}", "en")) }
    UNION { wd:${qidMuseo} wdt:P361|wdt:P749 ?ente . }
    UNION { ?ospite wdt:P276|wdt:P361 wd:${qidMuseo} . }
  } LIMIT 400`, 12000) || [];
  const parti = new Set<string>([qidMuseo]);
  // L'ENTE DI CUI IL MUSEO FA PARTE (12/09/2026): alla Tate Modern le opere
  // esposte appartengono a «Tate», l'ente che possiede anche Tate Britain, e
  // venivano scartate come «di un altro museo» — la guida restava senza una
  // sola opera. Un'opera dell'ente si tiene SOLO se è esposta QUI (P276), così
  // non entrano quelle delle altre sedi.
  const antenati = new Set<string>();
  let sito = '';
  const nomiLuogo: string[] = [];
  for (const r of righeMuseo) {
    if (r.parte) parti.add(ultimo(r.parte.value));
    // LA COLLEZIONE OSPITATA DENTRO IL LUOGO (12/09/2026): al Centre Pompidou
    // 274 delle 322 opere esposte appartengono al «Musée National d'Art
    // Moderne», che ha sede lì dentro; senza questo il Pompidou usciva senza
    // una sola opera e l'AI riempiva con tappe generiche («Opere di Picasso»).
    // Diverso dal prestito (Arazzo di Bayeux): lì il proprietario ha sede
    // altrove, qui la collezione È di casa.
    if (r.ospite) parti.add(ultimo(r.ospite.value));
    if (r.ente) antenati.add(ultimo(r.ente.value));
    if (r.sito && !sito) sito = r.sito.value;
    if (r.nome?.value) nomiLuogo.push(r.nome.value);
  }
  // «Passion Facade of the Sagrada Família» → «Passion Facade»; «Grandi organi
  // della cattedrale di Notre-Dame a Parigi» → «Grandi organi»: dentro la
  // guida di quel luogo il suo nome in coda è rumore.
  const senzaNomeLuogo = (t: string): string => {
    const basso = t.toLowerCase();
    for (const n of nomiLuogo) {
      const i = basso.indexOf(n.toLowerCase());
      if (i <= 0) continue;
      // Solo se il nome sta IN CODA (al più una città dopo, «a Parigi»): nel
      // titolo di Canaletto «London: Westminster Abbey, with a Procession…»
      // il nome è a metà e tagliarlo lasciava «London:».
      const dopo = t.slice(i + n.length).trim();
      if (dopo.length > 15 || /[,:;]/.test(dopo)) continue;
      const prima = t.slice(0, i).replace(/\s+(of the|of|de la|de l'|du|des|de|della|dello|dell'|del|dei|degli|delle|di|der|des|von|van)\s*$/i, '').trim();
      if (prima.length >= 4 && prima.length < t.length) return prima.charAt(0).toUpperCase() + prima.slice(1);
    }
    return t;
  };
  const dominio = sito ? dominioBase(sito) : '';
  ms.museo = Date.now() - t0;
  const valoriParti = [...parti].slice(0, 300).map(q => `wd:${q}`).join(' ');

  // ── 2. CHI: LE PRIME OPERE PER NOTORIETÀ ─────────────────────────────────
  // Il taglio sta nella sottoquery: una riga per opera, poi i dettagli.
  t0 = Date.now();
  const righeTop = await sparql(`SELECT ?o ?fama WHERE {
    { SELECT DISTINCT ?o ?fama WHERE {
        VALUES ?m { ${valoriParti} }
        { ?o wdt:P195 ?m } UNION { ?o wdt:P276 ?m }
        ?o wikibase:sitelinks ?fama .
      } ORDER BY DESC(?fama) LIMIT ${CANDIDATE} }
  } ORDER BY DESC(?fama)`) || [];
  ms.chi = Date.now() - t0;
  const fama: Record<string, number> = {};
  for (const r of righeTop) fama[ultimo(r.o?.value)] = Number(r.fama?.value || 0);
  // IN UNA CHIESA LE TAPPE SONO ANCHE PARTI DELL'EDIFICIO (11/09, prova su 8
  // chiese): facciate, cappelle, cripta, chiostri, vetrate stanno su Wikidata
  // come P361 «parte di» della chiesa, non come opere in collezione. Alla
  // Sagrada Família le «opere» erano 5 e quattro sbagliate; la facciata della
  // Passione e la cripta erano fra le parti.
  if (opzioni.luogo === 'chiesa' && parti.size > 1) {
    const idParti = [...parti].filter(q => q !== qidMuseo).slice(0, 300);
    const righeParti = await sparql(`SELECT ?o ?fama WHERE { VALUES ?o { ${idParti.map(q => `wd:${q}`).join(' ')} } ?o wikibase:sitelinks ?fama . }`, 12000) || [];
    for (const r of righeParti) { const q = ultimo(r.o?.value); if (!(q in fama)) fama[q] = Number(r.fama?.value || 0); }
  }
  const qidOpere = Object.keys(fama).filter(q => /^Q\d+$/.test(q)).sort((a, b) => fama[b] - fama[a] || a.localeCompare(b)).slice(0, CANDIDATE);
  if (!qidOpere.length) return { ...vuoto, museo: { qid: qidMuseo, parti: parti.size, dominio, api: '' } };

  // EVENTI, ORGANIZZAZIONI, CONCETTI NON SONO TAPPE (11/09, prova su 8 chiese):
  // su Wikidata hanno per luogo (P276) la chiesa l'incendio di Notre-Dame, la
  // morte di Giovanni Paolo II, nove incoronazioni e matrimoni reali a
  // Westminster, i funerali di Berlusconi al Duomo, una corsa podistica alla
  // Sagrada Família, la «scuola di Chartres». Due domande di classe:
  //  - EVENTO (P31/P279* «occorrenza» Q1190554) o ORGANIZZAZIONE (Q43229) o
  //    GRUPPO DI PERSONE (Q16334295) → fuori, sempre;
  //  - OGGETTO FISICO (P31/P279* Q223557): chi sta nel luogo SENZA essere in
  //    una collezione del museo deve esserlo. Chi è in collezione (P195) si
  //    tiene anche se la classe non risponde: l'Uomo di Lindow è un «essere
  //    umano», e al British sta davvero.
  t0 = Date.now();
  const valoriCand = qidOpere.map(q => `wd:${q}`).join(' ');
  // `hint:gearing "forward"`: si risale l'albero delle classi DALLE opere
  // verso la radice. Senza, il motore partiva dalla radice («oggetto fisico»
  // ha milioni di sottoclassi) e andava oltre i 15 s, o in 502 (misurato
  // l'11/09: 0,9 s contro errore). Un solo tentativo, 8 s: se non risponde si
  // va avanti senza quel filtro invece di perdere il museo.
  const classe = (radice: string) => sparqlUnaVolta(`SELECT DISTINCT ?o WHERE { VALUES ?o { ${valoriCand} } ?o wdt:P31/wdt:P279* wd:${radice} . hint:Prior hint:gearing "forward" . }`, 8000);
  const [rOccorrenze, rOrganizzazioni, rGruppi, rFisici] = await Promise.all([classe('Q1190554'), classe('Q43229'), classe('Q16334295'), classe('Q223557')]);
  const eventi = new Set([...(rOccorrenze || []), ...(rOrganizzazioni || []), ...(rGruppi || [])].map(r => ultimo(r.o?.value)));
  // Istituzioni e gruppi (organizzazione, gruppo di persone) valgono più
  // dell'essere «fisico»: la «scuola di Chartres» risale anche a edificio,
  // ma non è una cosa da guardare. «Occorrenza» invece è ambigua in Wikidata
  // (l'orologio astronomico di Chartres ci risale): lì vince l'oggetto fisico.
  const istituzioni = new Set([...(rOrganizzazioni || []), ...(rGruppi || [])].map(r => ultimo(r.o?.value)));
  // Se la domanda sugli oggetti fisici non risponde, non si esclude nessuno
  // per quel motivo (null): meglio una tappa in più che un museo vuoto.
  const fisici: Set<string> | null = rFisici ? new Set(rFisici.map(r => ultimo(r.o?.value))) : null;
  ms.classi = Date.now() - t0;

  // Dettagli su quelle opere precise (VALUES). NON in una query sola: ogni
  // proprietà a più valori (collezioni, luoghi, tipi, materiali, autori)
  // moltiplica le righe delle altre, e al British, al Rijksmuseum, al Met e
  // all'Art Institute la query unica andava oltre i 25 s (misurato l'11/09).
  // Sei domande piccole in parallelo: ognuna ha al più poche righe per opera.
  t0 = Date.now();
  const valoriOpere = qidOpere.map(q => `wd:${q}`).join(' ');
  const ETICHETTE = `SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,mul". }`;
  const [rNomi, rSingoli, rAutori, rMateriali, rColl, rLuoghi] = await Promise.all([
    sparql(`SELECT ?o ?lab ?labEn ?desc ?voce ?voceEn WHERE { VALUES ?o { ${valoriOpere} }
      OPTIONAL { ?o rdfs:label ?lab . FILTER(LANG(?lab) = "${lang}") }
      OPTIONAL { ?o rdfs:label ?labEn . FILTER(LANG(?labEn) = "en") }
      OPTIONAL { ?o schema:description ?desc . FILTER(LANG(?desc) = "${lang}") }
      OPTIONAL { ?voce schema:about ?o ; schema:isPartOf <https://${lang}.wikipedia.org/> . }
      OPTIONAL { ?voceEn schema:about ?o ; schema:isPartOf <https://en.wikipedia.org/> . } }`, 15000),
    sparql(`SELECT ?o (SAMPLE(?anno0) AS ?anno) (SAMPLE(?inv0) AS ?inv) (SAMPLE(?img0) AS ?img) (SAMPLE(?cat0) AS ?cat) (SAMPLE(?alt0) AS ?alt) (SAMPLE(?larg0) AS ?larg) (GROUP_CONCAT(DISTINCT STRAFTER(STR(?tipo0), "entity/"); separator="|") AS ?tipi) WHERE {
      VALUES ?o { ${valoriOpere} }
      OPTIONAL { ?o wdt:P571 ?data . BIND(YEAR(?data) AS ?anno0) } OPTIONAL { ?o wdt:P217 ?inv0 . } OPTIONAL { ?o wdt:P18 ?img0 . }
      OPTIONAL { ?o wdt:P373 ?cat0 . } OPTIONAL { ?o wdt:P2048 ?alt0 . } OPTIONAL { ?o wdt:P2049 ?larg0 . } OPTIONAL { ?o wdt:P31 ?tipo0 . }
    } GROUP BY ?o`, 15000),
    // FILTER(isIRI): «autore sconosciuto» su Wikidata è un nodo vuoto, e la sua
    // etichetta usciva come «http://www.wikidata.org/.well-known/genid/…».
    sparql(`SELECT ?o ?autoreLabel WHERE { VALUES ?o { ${valoriOpere} } ?o wdt:P170 ?autore . FILTER(isIRI(?autore)) ${ETICHETTE} }`, 15000),
    sparql(`SELECT ?o ?matLabel WHERE { VALUES ?o { ${valoriOpere} } ?o wdt:P186 ?mat . FILTER(isIRI(?mat)) ${ETICHETTE} }`, 15000),
    sparql(`SELECT ?o ?coll WHERE { VALUES ?o { ${valoriOpere} } ?o wdt:P195 ?coll . FILTER(isIRI(?coll)) }`, 15000),
    sparql(`SELECT ?o ?luogo ?luogoLabel WHERE { VALUES ?o { ${valoriOpere} } ?o wdt:P276 ?luogo . FILTER(isIRI(?luogo)) ${ETICHETTE} }`, 15000),
  ]);
  // Le righe delle sei domande nel formato della query unica di prima.
  const righeDett: Riga[] = [
    ...(rNomi || []),
    ...(rSingoli || []).flatMap(r => [{ ...r, tipo: undefined }, ...String(r.tipi?.value || '').split('|').filter(Boolean).map(t => ({ o: r.o, tipo: { value: `http://www.wikidata.org/entity/${t}` } }))]),
    ...(rAutori || []), ...(rMateriali || []), ...(rColl || []), ...(rLuoghi || []),
  ];
  if (!rNomi) errori.push('etichette delle opere non lette');
  ms.dettagli = Date.now() - t0;

  const TIPO_DA_QID: Record<string, TipoOpera> = {
    Q3305213: 'dipinto', Q134194: 'dipinto', Q1229071: 'dipinto', Q219423: 'dipinto', Q93184: 'dipinto',
    Q860861: 'scultura', Q179700: 'scultura', Q241045: 'scultura', Q17489160: 'scultura',
  };
  // Voci che stanno «nel» museo su Wikidata ma non sono opere da mettere in
  // un percorso (11/09, Art Institute of Chicago: «neoimpressionismo» e la
  // mostra «Armory Show» uscivano fra i capolavori): movimenti, stili, generi,
  // mostre, eventi. NON le persone: l'Uomo di Lindow (British) e le mummie
  // sono «esseri umani» per Wikidata e sono proprio ciò che si va a vedere.
  const NON_OPERE = new Set(['Q968159', 'Q1792644', 'Q483394', 'Q667276', 'Q464980', 'Q1656682', 'Q1792379', 'Q16887380', 'Q1400264']);
  type Grezza = {
    qid: string; lab: string; labEn: string; desc: string; autori: Set<string>; anno: string; inv: string; img: string; cat: string;
    tipo: TipoOpera; materiali: Set<string>; alt: string; larg: string; coll: Set<string>; luoghi: Map<string, string>; voce: string; voceEn: string; nonOpera: boolean;
  };
  const grezze = new Map<string, Grezza>();
  for (const r of righeDett) {
    const q = ultimo(r.o?.value);
    const g: Grezza = grezze.get(q) || { qid: q, lab: '', labEn: '', desc: '', autori: new Set(), anno: '', inv: '', img: '', cat: '', tipo: 'altro', materiali: new Set(), alt: '', larg: '', coll: new Set(), luoghi: new Map(), voce: '', voceEn: '', nonOpera: false };
    if (r.lab && !g.lab) g.lab = r.lab.value;
    if (r.labEn && !g.labEn) g.labEn = r.labEn.value;
    if (r.desc && !g.desc) g.desc = r.desc.value;
    // «Autore sconosciuto» su Wikidata è un nodo vuoto che il servizio rende
    // come IRI (…/.well-known/genid/…): isIRI non lo ferma, il prefisso sì.
    const autore = r.autoreLabel?.value || '';
    if (autore && !/^Q\d+$/.test(autore) && !/^https?:\/\//.test(autore) && !/^(anonimo|anonymous|sconosciuto|unknown|non noto|ignoto)$/i.test(autore)) g.autori.add(autore);
    if (r.anno && !g.anno) g.anno = r.anno.value;
    if (r.inv && !g.inv) g.inv = r.inv.value;
    if (r.img && !g.img) g.img = r.img.value;
    if (r.cat && !g.cat) g.cat = r.cat.value;
    const tq = ultimo(r.tipo?.value);
    if (g.tipo === 'altro' && TIPO_DA_QID[tq]) g.tipo = TIPO_DA_QID[tq];
    const mat = r.matLabel?.value || '';
    if (mat && !/^Q\d+$/.test(mat) && !/^https?:\/\//.test(mat)) g.materiali.add(mat);
    if (tq && NON_OPERE.has(tq)) g.nonOpera = true;
    if (r.alt && !g.alt) g.alt = r.alt.value;
    if (r.larg && !g.larg) g.larg = r.larg.value;
    if (r.coll) g.coll.add(ultimo(r.coll.value));
    if (r.luogo) g.luoghi.set(ultimo(r.luogo.value), r.luogoLabel?.value || '');
    if (r.voce && !g.voce) g.voce = decodeURIComponent(r.voce.value.split('/wiki/')[1] || '');
    if (r.voceEn && !g.voceEn) g.voceEn = decodeURIComponent(r.voceEn.value.split('/wiki/')[1] || '');
    grezze.set(q, g);
  }

  // Esclusione: collezioni dichiarate TUTTE fuori dal museo (Bayeux al British).
  const scelte: Grezza[] = [];
  for (const q of qidOpere) {
    const g = grezze.get(q);
    if (!g) continue;
    const titolo = g.lab || g.labEn;
    if (!titolo || /^Q\d+$/.test(titolo)) continue;
    if (g.nonOpera) { escluse.push({ qid: q, titolo, motivo: 'non è un\'opera (movimento, mostra…)' }); continue; }
    const espostaQui = [...g.luoghi.keys()].some(l => parti.has(l));
    const inCollezione = [...g.coll].some(c => parti.has(c))
      || (espostaQui && [...g.coll].some(c => antenati.has(c)));
    if (g.coll.size && !inCollezione) { escluse.push({ qid: q, titolo, motivo: 'collezione di un altro museo (qui solo come luogo)' }); continue; }
    // IN COLLEZIONE = OGGETTO. Un evento non sta nella collezione di un museo.
    // La domanda di classe «è un'occorrenza / un'organizzazione?» NON si usa
    // per chi è in collezione: nella gerarchia di Wikidata anche stele, stampe,
    // tesori e biblioteche risalgono lì (11/09: al British erano finiti fuori
    // la Stele di Rosetta, la Grande Onda, il Tesoro dell'Oxus).
    // Per chi sta nel luogo SENZA collezione (chiese, parti dell'edificio)
    // decide l'oggetto fisico: un oggetto fisico si tiene anche se la sua
    // classe risale a «occorrenza» (l'orologio astronomico di Chartres); ciò
    // che non è fisico esce (incoronazioni, incendi, funerali, scuole).
    // Materiale, misure o numero d'inventario valgono come prova di fisicità.
    const fisicoPerDati = g.materiali.size > 0 || !!g.alt || !!g.larg || !!g.inv;
    if (!inCollezione) {
      const fisico = fisicoPerDati || (!istituzioni.has(q) && (fisici ? fisici.has(q) : !eventi.has(q)));
      if (!fisico) {
        escluse.push({ qid: q, titolo, motivo: eventi.has(q) ? 'evento, organizzazione o gruppo di persone, non un oggetto da vedere' : 'non è un oggetto fisico (concetto, testo, avvenimento)' });
        continue;
      }
    }
    scelte.push(g);
    // Qualche opera in più del necessario: quelle che la fonte ufficiale
    // dirà «non esposte ora» (all'Art Institute 8 su 20: stampe e foto
    // ruotate per la luce) vanno in fondo, e le esposte le rimpiazzano.
    if (scelte.length >= N + Math.ceil(N / 3)) break;
  }

  const opere: OperaDelMuseo[] = scelte.map(g => {
    const autori = [...g.autori];
    const dimensioni = g.alt && g.larg ? `${Math.round(Number(g.alt))} × ${Math.round(Number(g.larg))} cm` : g.alt ? `h ${Math.round(Number(g.alt))} cm` : '';
    // Sala da Wikidata: un P276 diverso dal museo che è una sua parte.
    let sala = '', fonteSala: OperaDelMuseo['fonteSala'] = '';
    for (const [luogo, etichetta] of g.luoghi) {
      if (luogo !== qidMuseo && parti.has(luogo) && etichetta && !/^Q\d+$/.test(etichetta)) { sala = etichetta; fonteSala = 'wikidata'; break; }
    }
    return {
      qid: g.qid, titolo: senzaNomeLuogo(titoloBreve(g.lab || g.labEn, g.voce || g.voceEn)), titoloEn: titoloBreve(g.labEn || g.lab, g.voceEn), autore: autori.slice(0, 2).join(', '), anno: g.anno, inv: g.inv,
      tipo: g.tipo, materiale: [...g.materiali].slice(0, 3).join(', '), dimensioni, fama: fama[g.qid] || 0,
      foto: g.img, fonteFoto: g.img ? 'P18' : '',
      voce: g.voce ? { lingua: lang, titolo: g.voce, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(g.voce.replace(/ /g, '_'))}` }
        : g.voceEn ? { lingua: 'en', titolo: g.voceEn, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(g.voceEn.replace(/ /g, '_'))}` } : null,
      testoFonte: '', fonteTesto: '', sala, fonteSala, urlScheda: '', testoScheda: '', esposta: null,
      // campi di lavoro, tolti alla fine
      ...({ _cat: g.cat, _desc: g.desc } as any),
    } as OperaDelMuseo;
  });

  // ── 3. PERCHÉ: LA VOCE DELL'OPERA ────────────────────────────────────────
  // Voce intera in testo semplice (una pagina per richiesta: con testo
  // completo l'API non ne dà di più), poi introduzione + sezioni descrittive.
  t0 = Date.now();
  const SEZIONI_BUONE = /descri|analis|composi|iconograf|soggett|stile|tecnica|interpretaz|significat|description|analysis|composition|iconograph|subject|style|technique|interpretation|beschreib|bildbeschreibung|komposition|deutung|descripci|análisis|composici|iconograf|описан|анализ|композиц/i;
  const SEZIONI_VIETATE = /^(note|bibliografia|voci correlate|collegamenti esterni|altri progetti|fonti|references|notes|bibliography|see also|external links|further reading|sources|citations|einzelnachweise|literatur|weblinks|siehe auch|referencias|enlaces externos|véase también|примечания|литература|ссылки)$/i;
  const ritaglia = (testo: string): string => {
    const pezzi = testo.split(/\n(?===+\s*[^=\n]+?\s*==+\s*\n)/);
    const intro = pezzi[0].trim();
    const sezioni = pezzi.slice(1).map(p => {
      const m = /^==+\s*([^=\n]+?)\s*==+\s*\n([\s\S]*)$/.exec(p);
      return m ? { titolo: m[1].trim(), corpo: m[2].replace(/\n==+\s*[^=\n]+?\s*==+\s*\n/g, '\n').trim() } : { titolo: '', corpo: p.trim() };
    }).filter(s => s.corpo && !SEZIONI_VIETATE.test(s.titolo));
    const ordinate = [...sezioni.filter(s => SEZIONI_BUONE.test(s.titolo)), ...sezioni.filter(s => !SEZIONI_BUONE.test(s.titolo))];
    let out = intro;
    for (const s of ordinate) { if (out.length >= MAX_TESTO) break; out += `\n\n${s.titolo ? s.titolo + '. ' : ''}${s.corpo}`; }
    return out.replace(/\n{3,}/g, '\n\n').slice(0, MAX_TESTO).trim();
  };
  await aGruppi(opere, 5, async (o) => {
    if (!o.voce || restante() < 3000) return;
    const r = await prendi(`https://${o.voce.lingua}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&explaintext=1&exsectionformat=wiki&piprop=original&redirects=1&format=json&titles=${encodeURIComponent(o.voce.titolo)}`);
    if (!r?.ok) return;
    try {
      const j: any = await r.json();
      const p: any = Object.values(j?.query?.pages || {})[0] || {};
      const testo = ritaglia(String(p.extract || ''));
      if (testo.length >= 200) { o.testoFonte = testo; o.fonteTesto = o.voce.lingua === lang ? 'voce' : 'voce_en'; }
      if (!o.foto && p.original?.source) { o.foto = p.original.source; o.fonteFoto = 'voce'; }
    } catch { /* voce illeggibile: resta vuoto */ }
  });
  // Voce in lingua troppo corta: si prova quella inglese (stessa opera).
  const daInglese = opere.filter(o => o.testoFonte.length < 800 && o.voce?.lingua === lang);
  if (daInglese.length && restante() > 4000) {
    const enPerQid: Record<string, string> = {};
    for (const g of scelte) if (g.voceEn) enPerQid[g.qid] = g.voceEn;
    await aGruppi(daInglese.filter(o => enPerQid[o.qid]), 5, async (o) => {
      const r = await prendi(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&titles=${encodeURIComponent(enPerQid[o.qid])}`);
      if (!r?.ok) return;
      try {
        const j: any = await r.json();
        const p: any = Object.values(j?.query?.pages || {})[0] || {};
        const testo = ritaglia(String(p.extract || ''));
        if (testo.length > o.testoFonte.length + 400) { o.testoFonte = testo; o.fonteTesto = 'voce_en'; }
      } catch { /* resta la voce corta */ }
    });
  }
  ms.perche = Date.now() - t0;

  // ── 4. FOTO MANCANTI: la categoria Commons dell'opera ────────────────────
  t0 = Date.now();
  await aGruppi(opere.filter(o => !o.foto && (o as any)._cat), 4, async (o) => {
    if (restante() < 2000) return;
    const r = await prendi(`https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtype=file&cmlimit=10&format=json&cmtitle=${encodeURIComponent('Category:' + (o as any)._cat)}`);
    if (!r?.ok) return;
    try {
      const j: any = await r.json();
      const file = (j?.query?.categorymembers || []).map((m: any) => String(m.title || '')).find((t: string) => /\.(jpe?g|png|tiff?|webp)$/i.test(t));
      if (file) { o.foto = `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/, ''))}`; o.fonteFoto = 'commons'; }
    } catch { /* niente foto: meglio nessuna che una sbagliata */ }
  });
  ms.foto = Date.now() - t0;

  // ── 5. DOVE: API APERTE E SCHEDE UFFICIALI ───────────────────────────────
  // Gli identificativi esterni dell'opera il cui URL sta sul dominio del
  // museo: così si arriva alla scheda ufficiale senza tabelle a mano.
  t0 = Date.now();
  const idEsterni: Record<string, { prop: string; valore: string; url: string }[]> = {};
  if (dominio && restante() > 4000) {
    // Prima le proprietà-catalogo il cui URL sta sul dominio del museo (poche,
    // e la domanda scorre solo i formati URL delle proprietà); poi i valori di
    // QUELLE proprietà sulle nostre opere. La domanda unica «tutti gli
    // identificativi esterni delle opere» andava in timeout al KHM: le opere
    // famose ne hanno centinaia.
    const dominioSparql = dominio.replace(/["\\]/g, '');
    const righeProp = await sparql(`SELECT ?p ?fmt WHERE { ?p wikibase:propertyType wikibase:ExternalId ; wdt:P1630 ?fmt . FILTER(CONTAINS(LCASE(STR(?fmt)), "${dominioSparql}")) } LIMIT 40`, 12000) || [];
    const formati = new Map<string, string>();
    for (const r of righeProp) {
      const p = ultimo(r.p?.value), fmt = r.fmt?.value || '';
      if (/^P\d+$/.test(p) && fmt && dominioBase(fmt.replace('$1', 'x')) === dominio && !formati.has(p)) formati.set(p, fmt);
    }
    if (formati.size) {
      const righeId = await sparql(`SELECT ?o ?p ?v WHERE {
        VALUES ?o { ${opere.map(o => `wd:${o.qid}`).join(' ')} }
        VALUES (?p ?diretta) { ${[...formati.keys()].map(p => `(wd:${p} wdt:${p})`).join(' ')} }
        ?o ?diretta ?v .
      }`, 12000) || [];
      for (const r of righeId) {
        const p = ultimo(r.p?.value), v = r.v?.value || '', fmt = formati.get(p) || '';
        if (!fmt || !v) continue;
        const url = fmt.replace('$1', encodeURIComponent(v).replace(/%2F/gi, '/'));
        (idEsterni[ultimo(r.o?.value)] ||= []).push({ prop: p, valore: v, url });
      }
    }
    // P973 «descritto all'URL» sul dominio del museo, come ripiego.
    const righe973 = await sparql(`SELECT ?o ?u WHERE { VALUES ?o { ${opere.map(o => `wd:${o.qid}`).join(' ')} } ?o wdt:P973 ?u . }`, 10000) || [];
    for (const r of righe973) {
      const u = r.u?.value || '';
      if (u && dominioBase(u) === dominio) (idEsterni[ultimo(r.o?.value)] ||= []).push({ prop: 'P973', valore: u, url: u });
    }
  }

  // a) API aperte, per dominio del museo. Rispondono in JSON, senza chiave.
  type EsitoApi = { sala: string; esposta: boolean | null; testo?: string };
  const API: Record<string, { nome: string; url: (id: string) => string; leggi: (j: any) => EsitoApi }> = {
    'metmuseum.org': {
      nome: 'met', url: id => `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
      leggi: j => ({ sala: j?.GalleryNumber ? `Gallery ${j.GalleryNumber}` : '', esposta: j ? Boolean(j.GalleryNumber) : null }),
    },
    'artic.edu': {
      nome: 'artic', url: id => `https://api.artic.edu/api/v1/artworks/${id}?fields=gallery_title,is_on_view,description`,
      leggi: j => ({ sala: j?.data?.gallery_title || '', esposta: typeof j?.data?.is_on_view === 'boolean' ? j.data.is_on_view : null, testo: String(j?.data?.description || '').replace(/<[^>]+>/g, ' ') }),
    },
    'clevelandart.org': {
      nome: 'cleveland', url: id => `https://openaccess-api.clevelandart.org/api/artworks/${id}`,
      leggi: j => ({ sala: j?.data?.current_location || '', esposta: j?.data ? Boolean(j.data.current_location) : null, testo: String(j?.data?.wall_description || j?.data?.description || '') }),
    },
  };
  const api = API[dominio];
  if (api) {
    await aGruppi(opere, 4, async (o) => {
      const id = (idEsterni[o.qid] || []).find(x => x.prop !== 'P973')?.valore;
      if (!id || restante() < 2500) return;
      const r = await prendi(api.url(id));
      if (!r?.ok) return;
      try {
        const e = api.leggi(await r.json());
        if (e.sala) { o.sala = e.sala; o.fonteSala = 'api_museo'; }
        if (e.esposta !== null) o.esposta = e.esposta;
        if (e.testo && e.testo.trim().length > 150) o.testoScheda = e.testo.replace(/\s+/g, ' ').trim().slice(0, 1500);
      } catch { /* API muta: si passa oltre */ }
    });
  }

  // c) Schede ufficiali in HTML (o JSON Linked Art): sala, «non esposta», testo.
  const soloTesto = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|tr|dd|dt|section)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n');
  const NUMERO_SALA = '(?:n\\.?\\s*|nr\\.?\\s*|no\\.?\\s*)?(?:[0-9]{1,4}(?:\\.[0-9]{1,3})?[A-Za-z]?|[IVXLC]{1,6})\\b';
  const PAROLA_SALA = '(?:Saal|Kabinett|Raum|Room|Gallery|Galerie|Salle|Sala|Zaal|Sal|Sală|Зал)';
  // «Ort» è tolto: in tedesco è qualunque luogo. E una collocazione vale solo
  // se nomina una sala, un piano o un'ala (sotto): al Rijksmuseum «Location:»
  // precedeva il credito fotografico «M. Zeldenrust / G. Tauber, RMA, 2007».
  const RE_COLLOCAZIONE = /(?:Collocazione|Emplacement|Location|Standort|Ubicaci[oó]n|Locatie|Current location|Zu sehen|On view|En salle|Esposto in|Exposé)\s*[:\-–]\s*([^\n]{3,140})/i;
  const RE_LUOGO_INTERNO = /\b(sala|salle|saal|room|gallery|galerie|zaal|kabinett|raum|piano|floor|level|niveau|etage|étage|stock|wing|aile|ala|flügel|pavilion|padiglione)\b/i;
  const RE_SALA = new RegExp(`\\b${PAROLA_SALA}\\s+${NUMERO_SALA}(?:\\s*[,(–-]\\s*[^\\n,;)]{2,40})?`, 'i');
  // Solo frasi di STATO, mai parole di storia: «in deposito», «in storage»,
  // «en réserve» compaiono nel racconto di dove l'opera è stata un secolo fa
  // (11/09: tre opere degli Uffizi segnate «non esposte» per una parola del
  // genere). Meglio non sapere (null) che dire il falso.
  const RE_NON_ESPOSTA = /\b((l'opera|quest'opera|l'oggetto|this (work|object|artwork)|the (work|object|artwork))\s+(non è (attualmente |al momento )?espost[ao]|is (currently |not currently )?not on (view|display))|currently not on (view|display)|not currently on (view|display)|attualmente non espost[ao]|momentaneamente non espost[ao]|nicht ausgestellt|derzeit nicht (zu sehen|ausgestellt)|actuellement non exposée?|niet te zien|niet tentoongesteld)\b/i;
  // «Kunsthistorisches Museum , Gemäldegalerie Saal X» → «Gemäldegalerie Saal X»:
  // il nome del museo davanti alla sala non dice niente a chi è già dentro.
  const pulisciSala = (s: string) => s.replace(/\s+/g, ' ').replace(/^[^,\/]*\b(museo|museum|musée|musei|museu|muzeum)\b[^,\/]*\s*[,\/]\s*/i, '').replace(/^(museo|museum|musée)\s*\/\s*/i, '').replace(/\s*\/\s*(cornice|vetrina|case|vitrine|shelf|ripiano)\b.*$/i, '').replace(/\s*[|·].*$/, '').trim().slice(0, 90);
  const leggiScheda = (corpo: string, tipo: string, titolo: string): { sala: string; esposta: boolean | null; testo: string } => {
    let testo = '';
    if (/json/i.test(tipo)) {
      // Linked Art (Rijksmuseum): i testi stanno nei campi "content".
      const contenuti: string[] = [];
      const visita = (x: any) => { if (!x || typeof x !== 'object') return; for (const [k, v] of Object.entries(x)) { if (k === 'content' && typeof v === 'string') contenuti.push(v); else visita(v); } };
      try { visita(JSON.parse(corpo)); } catch { /* non è JSON vero */ }
      const lunghi = contenuti.filter(c => c.length > 150).sort((a, b) => b.length - a.length);
      const sala = contenuti.find(c => new RegExp(`^${PAROLA_SALA}\\s+${NUMERO_SALA}`, 'i').test(c) || /\b(Gallery|Zaal|Room)\b/.test(c) && c.length < 60) || '';
      return { sala: pulisciSala(sala), esposta: null, testo: lunghi.slice(0, 2).join('\n\n').slice(0, 1500) };
    }
    const t = soloTesto(corpo);
    // Si guarda vicino al titolo quando c'è: una scheda nomina anche le
    // opere «correlate» con le loro sale (Kunsthistorisches), e la prima
    // collocazione DOPO il titolo è quella dell'opera.
    const chiaveTitolo = titolo.toLowerCase().slice(0, 18);
    const da = Math.max(0, chiaveTitolo ? t.toLowerCase().indexOf(chiaveTitolo) : 0);
    const finestra = t.slice(da, da + 6000);
    const m1 = RE_COLLOCAZIONE.exec(finestra) || RE_COLLOCAZIONE.exec(t);
    let sala = '';
    if (m1 && RE_LUOGO_INTERNO.test(m1[1]) && !/\b(19|20)\d{2}\b/.test(m1[1])) sala = pulisciSala(m1[1]);
    if (!sala) { const m2 = RE_SALA.exec(finestra); if (m2) sala = pulisciSala(m2[0]); }
    const esposta = RE_NON_ESPOSTA.test(finestra.slice(0, 3000)) ? false : null;
    const paragrafi = [...corpo.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => soloTesto(m[1]).replace(/\s+/g, ' ').trim())
      .filter(p => p.length >= 150 && !/cookie|javascript|newsletter|privacy|©|copyright|iscriviti|subscribe/i.test(p));
    testo = paragrafi.slice(0, 3).join('\n\n').slice(0, 1500);
    return { sala, esposta, testo };
  };
  if (opzioni.schede !== false) {
    await aGruppi(opere, 4, async (o) => {
      const cand = (idEsterni[o.qid] || []);
      if (!cand.length || restante() < 3000) return;
      // Prima gli identificativi veri (proprietà-catalogo), poi P973.
      const scelta = cand.find(c => c.prop !== 'P973') || cand[0];
      o.urlScheda = scelta.url;
      if (o.fonteSala === 'api_museo') return;
      const r = await prendi(scelta.url, 'text/html,application/ld+json,application/json;q=0.9,*/*;q=0.5', 10000);
      if (!r?.ok) return;
      try {
        const corpo = (await r.text()).slice(0, 400000);
        const e = leggiScheda(corpo, r.headers.get('content-type') || '', o.titoloEn || o.titolo);
        if (e.sala && !o.sala) { o.sala = e.sala; o.fonteSala = 'scheda_ufficiale'; }
        if (e.esposta === false) o.esposta = false;
        if (e.testo && !o.testoScheda) o.testoScheda = e.testo;
      } catch { /* scheda illeggibile */ }
    });
  }
  ms.dove = Date.now() - t0;

  // ── 6. TESTO DI RIPIEGO: fatti Wikidata + scheda ufficiale ───────────────
  for (const o of opere) {
    if (o.testoFonte) continue;
    if (o.testoScheda.length >= 300) { o.testoFonte = o.testoScheda; o.fonteTesto = 'scheda_ufficiale'; continue; }
    const fatti = [
      (o as any)._desc ? `${o.titolo}: ${(o as any)._desc}.` : '',
      o.autore ? `Autore: ${o.autore}.` : '', o.anno ? `Anno: ${o.anno}.` : '', o.materiale ? `Materiale e tecnica: ${o.materiale}.` : '',
      o.dimensioni ? `Dimensioni: ${o.dimensioni}.` : '', o.inv ? `Inventario: ${o.inv}.` : '', o.testoScheda,
    ].filter(Boolean).join(' ');
    if (fatti) { o.testoFonte = fatti.slice(0, MAX_TESTO); o.fonteTesto = 'wikidata'; }
  }
  for (const o of opere) { delete (o as any)._cat; delete (o as any)._desc; }

  // Le esposte prima (per notorietà), le «non esposte ora» in fondo; poi N.
  // Le non esposte tagliate restano nella diagnostica: la rotta può dirlo.
  const ordinate = [...opere.filter(o => o.esposta !== false), ...opere.filter(o => o.esposta === false)];
  for (const o of ordinate.slice(N)) if (o.esposta === false) escluse.push({ qid: o.qid, titolo: o.titolo, motivo: 'non esposta ora (fonte ufficiale)' });

  ms.totale = Date.now() - inizio;
  return { museo: { qid: qidMuseo, parti: parti.size, dominio, api: api?.nome || '' }, opere: ordinate.slice(0, N), diagnostica: { ms, errori: errori.slice(0, 30), escluse } };
}
