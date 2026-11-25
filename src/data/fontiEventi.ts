/**
 * FONTI DI EVENTI E MOSTRE — il registro mondiale.
 * =================================================
 *
 * PERCHE' UN REGISTRO E NON 195 SCRAPER. Scrivere un lettore su misura per il
 * portale eventi di ogni paese sarebbe insostenibile: cambiano grafica ogni
 * anno e nessuno se ne accorge finche' un utente non vede una scheda vuota.
 * Qui ci sono solo gli INDIRIZZI e il paese che coprono; a leggerli e` un
 * estrattore unico che scarica la pagina e la fa interpretare all'AI — lo
 * stesso meccanismo gia' collaudato per GetYourGuide.
 *
 * LA REGOLA DEL PROGETTO: tutto nasce mondiale. Le fonti internazionali
 * coprono il pianeta e fanno da rete; quelle nazionali aggiungono cio' che le
 * internazionali non vedono — la sagra di paese, la mostra del museo civico.
 *
 * Il codice paese e` ISO 3166-1 alpha-2 maiuscolo. `*` vale ovunque.
 *
 * (25/11/2026, committente: «sarebbe bene avere altri portali in tutti i paesi», «ricerca più portali possibili in tutto
 * il mondo»). Registro RIFATTO dopo cinque ricerche verificate pagina per pagina e dopo il primo controllo notturno
 * (collaudo, modulo-stato-portali: 9 portali su 51 funzionavano). Tolti quelli che bloccano i robot, caricano gli eventi
 * solo con JavaScript, hanno l'indirizzo sbagliato o non nominano la città; aggiunti ~150 portali che mostrano eventi con
 * data e luogo nell'HTML. Ogni notte il collaudo li riprova tutti e li mette in Download › Test › «Portali e partner per
 * paese» con V verde / X rossa: una X ripetuta si toglie da qui. NON aggiungere un portale senza averlo provato.
 */

import { OPENCITY_COMUNI } from './opencityComuni.js'; // con .js: il server lo importa (incidente del 04/10)
import { QUOTIDIANI_EVENTI } from './quotidianiEventi.js'; // generato da scratch/scopri-eventi-quotidiani.mjs
import { COMUNI_EVENTI, CAMPI_COMUNWEB, ESCLUDI_ISTITUZIONALI } from './comuniEventi.js'; // generato da scratch/scopri-eventi-comuni.mjs

export type TipoFonte = 'eventi' | 'mostre' | 'entrambi';

export interface FonteEventi {
  /** Chiave breve, usata nei log e come `source` sulla scheda. */
  id: string;
  nome: string;
  /** ISO 3166-1 alpha-2, oppure '*' per le fonti mondiali. */
  paesi: string[];
  tipo: TipoFonte;
  /**
   * Come si costruisce l'indirizzo della pagina da leggere.
   * `{citta}` diventa il nome della citta` in minuscolo con i trattini,
   * `{citta_raw}` il nome come si scrive, `{paese}` il codice ISO minuscolo,
   * `{citta_locale}` lo slug del nome NELLA LINGUA DEL POSTO con le lettere scritte come i siti locali le
   * scrivono (München → muenchen, København → kobenhavn, București → bucuresti), `{id_paese}` il valore di `idPaese`.
   */
  url: string;
  /** Ha un'API vera invece di una pagina da leggere? */
  api?: boolean;
  /**
   * Note di licenza. NON e` decorazione: Open-Meteo ci ha insegnato che una
   * fonte gratuita puo' vietare l'uso commerciale, e WIP vende crediti.
   */
  licenza?: string;
  /** Lingua della pagina (Accept-Language e prompt di estrazione). Default: quella del paese. */
  lingua?: string;
  /**
   * Il nome della citta` da mettere in `{citta}`: 'en' (default, slug
   * inglese), 'locale' (nome nella lingua del posto: 北京, Москва).
   */
  nomeCitta?: 'en' | 'locale';
  /**
   * (25/11/2026) La fonte vale SOLO per queste città (nomi minuscoli, in qualunque lingua: basta che uno combaci col nome
   * inglese o locale della città cercata). Senza `citta` vale per tutto il paese. Sortir à Paris leggeva Parigi anche a Lione.
   */
  citta?: string[];
  /**
   * (25/11/2026) La pagina elenca eventi di PIÙ città (biglietteria nazionale, aggregatore, Ticketmaster che con uno slug
   * sbagliato mostra l'elenco nazionale): l'evento resta solo se il testo nomina la città, come per le mondiali.
   */
  rigorosa?: boolean;
  /** (25/11/2026) Codice del paese nel sito (meer.com: IT=117…): riempie `{id_paese}`. Paese assente = fonte esclusa. */
  idPaese?: Record<string, string>;
  /**
   * (25/11/2026, «aggiungiamo feed e api») La fonte dà DATI, non una pagina da interpretare: il server la legge con il
   * lettore del formato (eventiFeed.eventiDaFeed), senza AI. 'jsonld' = pagina HTML con schema.org Event dentro.
   */
  formato?: 'rss' | 'ical' | 'tribe' | 'opendatasoft' | 'linkedevents' | 'json' | 'jsonld' | 'csv' | 'xml' | 'opencity';
  /** Codifica del file quando non è UTF-8 (i CSV giapponesi sono spesso «shift_jis»). */
  codifica?: string;
  /**
   * (25/11/2026, committente: «le ricerche saranno in base alla localizzazione, specifiche per le fonti di quell'area»)
   * Il centro della fonte e il suo raggio: la fonte vale quando la ricerca cade entro `km` da lì (comuni OpenCity, agende
   * comunali). Una fonte con `vicino` vale per posizione ANCHE se il nome della città non coincide (il paese accanto).
   */
  vicino?: { lat: number; lon: number; km: number };
  /** Per 'opendatasoft'/'json': dove stanno i campi nei record (percorsi a punti). Senza: nomi comuni. */
  campi?: { elenco?: string; titolo?: string; dal?: string; al?: string; luogo?: string; url?: string; descrizione?: string; immagine?: string; escludi?: string };
}

/** Il nome della citta` come lo vogliono quasi tutti i portali. */
export function slugCitta(citta: string): string {
  return citta.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * (25/11/2026) Lo slug come lo scrivono i siti del posto: le lettere che non sono accenti si trascrivono prima
 * (ü→ue, ø→o, ß→ss…), poi si tolgono gli accenti. Con slugCitta «München» diventava «munchen» (il sito vuole «muenchen»)
 * e «København» «k-benhavn».
 */
export function slugLocale(citta: string): string {
  const t = citta.toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[øœ]/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae').replace(/ð/g, 'd').replace(/þ/g, 'th')
    .replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't');
  return slugCitta(t);
}

/**
 * (25/11/2026, feed e API) Segnaposti in più: `{oggi}` = data di oggi (YYYY-MM-DD, per le API che vogliono la data nel
 * filtro), `{lat}` e `{lon}` = il centro della ricerca (le API nazionali si chiedono già filtrate attorno alla città).
 */
export function costruisciUrl(f: FonteEventi, citta: string, paese: string, cittaLocale = '', lat?: number, lon?: number): string {
  const cc = (paese || '').toUpperCase();
  const oggi = new Date().toISOString().slice(0, 10);
  return f.url
    .replace(/\{oggi\}/g, oggi)
    .replace(/\{lat\}/g, Number.isFinite(lat) ? String(lat) : '{lat}')
    .replace(/\{lon\}/g, Number.isFinite(lon) ? String(lon) : '{lon}')
    .replace('{citta_locale}', slugLocale(cittaLocale || citta))
    .replace('{citta}', slugCitta(citta))
    .replace('{citta_raw}', encodeURIComponent(citta))
    .replace('{id_paese}', f.idPaese?.[cc] || '{id_paese}')
    .replace('{paese}', cc.toLowerCase());
}

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/** La fonte vale per questa città? (fonti senza `citta` né `vicino`: sempre) */
export function valePerCitta(f: FonteEventi, ...nomi: string[]): boolean {
  if (!f.citta?.length) return !f.vicino;
  const n = nomi.filter(Boolean).map(norm);
  return f.citta.some((c) => n.includes(norm(c)));
}
const kmTra = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
/** (25/11/2026) La fonte vale per questo punto? Sì se è vicina (`vicino`) o se vale per il nome della città. */
export function valePerLuogo(f: FonteEventi, lat: number | undefined, lon: number | undefined, ...nomi: string[]): boolean {
  if (f.vicino && Number.isFinite(lat) && Number.isFinite(lon) && kmTra(lat as number, lon as number, f.vicino.lat, f.vicino.lon) <= f.vicino.km) return true;
  return valePerCitta(f, ...nomi);
}

// ── MONDIALI ──────────────────────────────────────────────────────────────
// Coprono molti paesi con un solo indirizzo: sono la rete che tiene quando
// per un paese non abbiamo ancora la fonte locale.
export const FONTI_MONDIALI: FonteEventi[] = [
  {
    id: 'allevents', nome: 'AllEvents',
    paesi: ['*'], tipo: 'entrambi',
    url: 'https://allevents.in/{citta}',
    licenza: 'pagina pubblica, lettura con attribuzione',
  },
  {
    id: 'wikidata_mostre', nome: 'Wikidata',
    paesi: ['*'], tipo: 'mostre', api: true,
    url: 'https://query.wikidata.org/sparql',
    licenza: 'CC0 — nessun vincolo',
  },
  // Eventbrite: 405 ai robot in ogni città provata (25/11/2026) → tolta.
];

// Ticketmaster `/discover/{citta}`: elenco HTML degli eventi della città sui domini nazionali (verificati 25/11/2026).
// Con uno slug che non conosce può mostrare l'elenco NAZIONALE: per questo è sempre `rigorosa`.
const TM = (cc: string, tld: string, lingua: string, nomeCitta: 'en' | 'locale' = 'en'): FonteEventi => ({
  id: `ticketmaster_${cc.toLowerCase()}`, nome: `Ticketmaster ${cc}`, paesi: [cc], tipo: 'eventi', lingua, rigorosa: true,
  url: `https://www.ticketmaster.${tld}/discover/${nomeCitta === 'locale' ? '{citta_locale}' : '{citta}'}`,
});
// Agenda di UNA città (ente del turismo, comune).
const AG = (id: string, nome: string, cc: string, citta: string[], url: string, lingua: string, tipo: TipoFonte = 'entrambi'): FonteEventi =>
  ({ id, nome, paesi: [cc], tipo, url, lingua, citta });
// Biglietteria o agenda NAZIONALE senza filtro per città: rigorosa.
const NAZ = (id: string, nome: string, paesi: string[], url: string, lingua: string, tipo: TipoFonte = 'eventi'): FonteEventi =>
  ({ id, nome, paesi, tipo, url, lingua, rigorosa: true });

// ── NAZIONALI E LOCALI ────────────────────────────────────────────────────
// Prima quelle per città (più precise), poi le nazionali. L'elenco cresce: aggiungere una riga qui basta a coprire un
// paese nuovo, senza toccare una riga di codice — ma prima va provata (V nella tab Test).
// (25/11/2026) helper delle fonti USA/Canada (piattaforme comuni: The Events Calendar, Localist, CivicPlus, pagine)
// ── Helper (vicino ad AG/NAZ) ─────────────────────────────────────────────
// The Events Calendar (WordPress): stesso endpoint per tutti
const TRIBE = (id: string, nome: string, cc: string, host: string, citta: string[], lat: number, lon: number, km: number, tipo: TipoFonte = 'entrambi', rigorosa = false): FonteEventi =>
  ({ id, nome, paesi: [cc], tipo, lingua: 'en', citta, formato: 'tribe', vicino: { lat, lon, km }, ...(rigorosa ? { rigorosa } : {}),
    url: `https://${host}/wp-json/tribe/events/v1/events?per_page=50&start_date=now` });
// Localist (calendari universitari pubblici): fuori scadenze, lezioni, riunioni, attività interne
const ESCL_UNI = '\\b(deadline|recess|holidays?|thanksgiving|closed|study|studies|meditation|yoga|workshop|training|meeting|office hours|webinar|group|bible|seminar|defense|dissertation|application|registration|orientation|class|classes|exams?|advising|zoom|support|clinic|research|faculty|students?|staff|career|recruit\\w*)\\b';
const LOCALIST = (id: string, nome: string, host: string, citta: string[], lat: number, lon: number): FonteEventi =>
  ({ id, nome, paesi: ['US'], tipo: 'entrambi', lingua: 'en', citta, formato: 'json', vicino: { lat, lon, km: 15 },
    url: `https://${host}/api/2/events?days=60&pp=100`,
    campi: { elenco: 'events', titolo: 'event.title', dal: 'event.event_instances.0.event_instance.start', al: 'event.last_date', luogo: 'event.location_name', url: 'event.localist_url', descrizione: 'event.description_text', escludi: ESCL_UNI } });
// CivicPlus: stesso feed RSS di civicplus_grapevine/charleston, escludi più largo (chiusure uffici, riserve sale)
const CIVICPLUS = (id: string, nome: string, host: string, citta: string[], lat: number, lon: number): FonteEventi =>
  ({ id, nome, paesi: ['US'], tipo: 'eventi', lingua: 'en', citta, formato: 'rss', vicino: { lat, lon, km: 20 },
    url: `https://${host}/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`,
    campi: { dal: 'calendarEvent:EventDates', luogo: 'calendarEvent:Location', escludi: '\\b(council|commission|board|committee|meeting|closed|closure|hearing|workshop session|agenda|cancel+ed|reserved|thanksgiving)\\b' } });
const PAG = (id: string, nome: string, cc: string, citta: string[], url: string, lat: number, lon: number, km: number, tipo: TipoFonte = 'entrambi', formato?: 'jsonld'): FonteEventi =>
  ({ id, nome, paesi: [cc], tipo, lingua: 'en', citta, url, vicino: { lat, lon, km }, ...(formato ? { formato } : {}) });

export const FONTI_PAESE: FonteEventi[] = [
  // ── FEED E API (dati strutturati, senza AI: le più precise, vanno per prime)
  { id: 'paris_opendata', nome: 'Que faire à Paris (open data)', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['paris', 'parigi'], formato: 'opendatasoft',
    url: 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=100&order_by=date_start&where=date_end%3E%3Dnow()', licenza: 'ODbL (open data Ville de Paris)' },
  { id: 'helsinki_linkedevents', nome: 'Helsinki Linked Events', paesi: ['FI'], tipo: 'entrambi', lingua: 'fi', citta: ['helsinki', 'helsingfors'], formato: 'linkedevents',
    url: 'https://api.hel.fi/linkedevents/v1/event/?start=today&page_size=100&include=location', licenza: 'open data City of Helsinki' },
  { id: 'choose_chicago', nome: 'Choose Chicago', paesi: ['US'], tipo: 'entrambi', lingua: 'en', citta: ['chicago'], formato: 'tribe',
    url: 'https://www.choosechicago.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'visit_sarajevo', nome: 'Visit Sarajevo', paesi: ['BA'], tipo: 'eventi', lingua: 'en', citta: ['sarajevo'], formato: 'tribe',
    url: 'https://visitsarajevo.ba/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'experience_dubrovnik', nome: 'TZ Dubrovnik', paesi: ['HR'], tipo: 'entrambi', lingua: 'en', citta: ['dubrovnik'], formato: 'ical',
    url: 'https://experiencedubrovnik.com/tzevents/public/api/calendar.ics' },
  { id: 'go2warsaw', nome: 'Go2Warsaw', paesi: ['PL'], tipo: 'entrambi', lingua: 'en', citta: ['warszawa', 'warsaw', 'varsavia'], formato: 'jsonld',
    url: 'https://www.go2warsaw.pl/en/events/' },
  { id: 'boston_rss', nome: 'City of Boston', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['boston'], formato: 'rss', url: 'https://www.boston.gov/rss/events' },
  { id: 'vdl_lu_rss', nome: 'Ville de Luxembourg', paesi: ['LU'], tipo: 'entrambi', lingua: 'fr', citta: ['luxembourg', 'lussemburgo', 'luxemburg'], formato: 'rss', url: 'https://www.vdl.lu/agenda/rss.xml', campi: { dal: 'pubDate' } }, // qui pubDate è l'ora dell'evento
  // (25/11/2026) ricerca «tutte le API possibili del mondo»: fonti verificate con chiamate reali, lette dai lettori generici
  { id: 'openagenda_pubblico', nome: 'OpenAgenda (open data, 30 km)', paesi: ['FR', 'CH', 'BE', 'LU'], tipo: 'entrambi', lingua: 'fr', formato: 'opendatasoft',
    url: "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records?limit=100&order_by=firstdate_begin&where=lastdate_end%3E%3Dnow()%20AND%20within_distance(location_coordinates%2C%20geom'POINT({lon}%20{lat})'%2C%2030km)",
    campi: { titolo: 'title_fr', dal: 'firstdate_begin', al: 'lastdate_end', luogo: 'location_name', url: 'canonicalurl', descrizione: 'description_fr' }, licenza: 'Licence Ouverte (OpenAgenda)' },
  { id: 'bologna_opendata', nome: 'Comune di Bologna (open data)', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', citta: ['bologna'], formato: 'opendatasoft',
    url: 'https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/eventi-bologna-agenda-cultura/records?limit=100&where=end%3E%3Dnow()',
    campi: { titolo: 'title', dal: 'start', al: 'end', luogo: 'address', url: 'url', descrizione: 'description' }, licenza: 'CC BY' },
  // l'API non dà il comune dell'evento: per le città dell'Alto Adige si mostrano gli eventi della provincia (non rigorosa)
  { id: 'odh_suedtirol', nome: 'Open Data Hub Alto Adige', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', formato: 'json',
    citta: ['bolzano', 'bozen', 'merano', 'meran', 'bressanone', 'brixen', 'brunico', 'bruneck', 'vipiteno', 'sterzing', 'ortisei', 'corvara', 'selva di val gardena', 'castelrotto', 'appiano', 'caldaro', 'laives', 'silandro', 'dobbiaco', 'san candido'],
    url: 'https://tourism.api.opendatahub.com/v1/Event?pagesize=100&begindate={oggi}&language=it',
    campi: { elenco: 'Items', titolo: 'Detail.it.Title', dal: 'DateBegin', al: 'DateEnd', luogo: 'ContactInfos.it.City', descrizione: 'Detail.it.BaseText' }, licenza: 'CC0 / CC BY (Open Data Hub)' },
  { id: 'herault_manif', nome: 'Hérault Tourisme (open data)', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, formato: 'opendatasoft',
    citta: ['montpellier', 'beziers', 'sete', 'agde', 'lodeve', 'pezenas', 'lunel', 'frontignan', 'palavas-les-flots', 'la grande-motte'],
    url: "https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/fetes-et-manifestations@data-herault-occitanie/records?limit=100&where=datefin%3E%3D'{oggi}'",
    campi: { titolo: 'titremanifestation', dal: 'datedebut', al: 'datefin', luogo: 'adresses', descrizione: 'descriptionlongue' } },
  { id: 'gent_visit', nome: 'Visit Gent (open data)', paesi: ['BE'], tipo: 'entrambi', lingua: 'nl', citta: ['gent', 'gand', 'ghent'], formato: 'opendatasoft',
    url: 'https://data.stad.gent/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records?limit=100',
    campi: { titolo: 'name_nl', dal: 'date_start', al: 'date_end', luogo: 'ctcname_nl', url: 'url', descrizione: 'description_nl' } },
  { id: 'neuss_kal', nome: 'Stadt Neuss (open data)', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['neuss'], formato: 'opendatasoft',
    url: 'https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/stadt-neuss-veranstaltungskalender/records?limit=100&where=datetimeend%3E%3Dnow()',
    campi: { titolo: 'name', dal: 'datetimestart', al: 'datetimeend', luogo: 'ort', descrizione: 'info' } },
  { id: 'cyl_agenda', nome: 'Junta de Castilla y León (open data)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', rigorosa: true, formato: 'opendatasoft',
    citta: ['valladolid', 'leon', 'burgos', 'salamanca', 'segovia', 'avila', 'zamora', 'palencia', 'soria', 'ponferrada'],
    url: "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records?limit=100&where=fecha_fin%3E%3D'{oggi}'",
    campi: { titolo: 'titulo', dal: 'fecha_inicio', al: 'fecha_fin', luogo: 'localidad', url: 'enlace', descrizione: 'descripcion' } },
  { id: 'catalunya_agenda', nome: 'Agenda cultural de Catalunya (open data)', paesi: ['ES'], tipo: 'entrambi', lingua: 'ca', rigorosa: true, formato: 'json',
    citta: ['barcelona', 'barcellona', 'girona', 'tarragona', 'lleida', 'sitges', 'figueres', 'reus', 'sabadell', 'terrassa', 'badalona', 'mataro', 'vic', 'manresa'],
    url: "https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json?$where=data_fi%3E%3D'{oggi}'&$limit=1000",
    campi: { titolo: 'denominaci', dal: 'data_inici', al: 'data_fi', luogo: 'municipi', descrizione: 'descripcio' }, licenza: 'CC BY' },
  { id: 'barcelona_opendata', nome: 'Ajuntament de Barcelona (open data)', paesi: ['ES'], tipo: 'entrambi', lingua: 'ca', citta: ['barcelona', 'barcellona'], formato: 'json',
    url: "https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search_sql?sql=SELECT%20*%20from%20%22877ccf66-9106-4ae2-be51-95a9f6469e4c%22%20WHERE%20end_date%3E%3D'{oggi}'%20LIMIT%20300",
    campi: { elenco: 'result.records', titolo: 'name', dal: 'start_date', al: 'end_date' }, licenza: 'CC BY 4.0' },
  { id: 'madrid_opendata', nome: 'Ayuntamiento de Madrid (open data, 100 giorni)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['madrid'], formato: 'json',
    url: 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json',
    campi: { elenco: '@graph', titolo: 'title', dal: 'dtstart', al: 'dtend', luogo: 'event-location', url: 'link', descrizione: 'description' }, licenza: 'CC BY (Ayuntamiento de Madrid)' },
  { id: 'euskadi_kultura', nome: 'Kultura Euskadi (open data)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', rigorosa: true, formato: 'json',
    citta: ['bilbao', 'bilbo', 'san sebastian', 'donostia', 'vitoria', 'vitoria-gasteiz', 'gasteiz', 'getxo', 'irun', 'barakaldo'],
    url: 'https://api.euskadi.eus/culture/events/v1.0/events/upcoming?_elements=100&_page=1',
    campi: { elenco: 'items', titolo: 'nameEs', dal: 'startDate', al: 'endDate', luogo: 'municipalityEs', descrizione: 'descriptionEs' }, licenza: 'CC BY' },
  { id: 'failte_events', nome: 'Fáilte Ireland (open data)', paesi: ['IE'], tipo: 'entrambi', lingua: 'en', rigorosa: true, formato: 'json',
    url: 'https://failteireland.azure-api.net/opendata-api/v2/events', licenza: 'Open data Fáilte Ireland',
    campi: { elenco: 'value', titolo: 'name', dal: 'startDate', al: 'endDate', luogo: 'location.address.addressLocality', url: 'url', descrizione: 'description' } },
  { id: 'espoo_linkedevents', nome: 'Espoo Linked Events', paesi: ['FI'], tipo: 'entrambi', lingua: 'fi', citta: ['espoo', 'esbo'], formato: 'linkedevents',
    url: 'https://api.espoo.fi/events/v1/event/?start=today&page_size=100&include=location' },
  { id: 'ingolstadt_ics', nome: 'Ingolstadt live', paesi: ['DE'], tipo: 'eventi', lingua: 'de', citta: ['ingolstadt'], formato: 'ical', url: 'https://ingolstadt.live/api/v1/getAllEvents/?type=ics' },
  { id: 'karlsruhe_rss', nome: 'Stadt Karlsruhe', paesi: ['DE'], tipo: 'eventi', lingua: 'de', citta: ['karlsruhe'], formato: 'rss', url: 'https://kalender.karlsruhe.de/db/termine/rss' },
  { id: 'oxon_tribe', nome: 'Experience Oxfordshire', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['oxford', 'banbury', 'abingdon', 'henley-on-thames', 'witney', 'bicester', 'woodstock'], formato: 'tribe',
    url: 'https://www.experienceoxfordshire.org/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'cyprus_tribe', nome: 'Visit Cyprus', paesi: ['CY'], tipo: 'entrambi', lingua: 'en', rigorosa: true, formato: 'tribe', url: 'https://www.visitcyprus.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'pula_tribe', nome: 'Visit Pula', paesi: ['HR'], tipo: 'eventi', lingua: 'en', citta: ['pula', 'pola'], formato: 'tribe', url: 'https://www.visitpula.hr/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'buffalo_tribe', nome: 'Visit Buffalo Niagara', paesi: ['US'], tipo: 'entrambi', lingua: 'en', citta: ['buffalo', 'niagara falls'], formato: 'tribe', url: 'https://www.visitbuffaloniagara.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'gainesville_tribe', nome: 'Visit Gainesville', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['gainesville'], formato: 'tribe', url: 'https://www.visitgainesville.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'duluth_tribe', nome: 'Visit Duluth', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['duluth'], formato: 'tribe', url: 'https://www.visitduluth.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'windsor_tribe', nome: 'Visit Windsor Essex', paesi: ['CA'], tipo: 'eventi', lingua: 'en', citta: ['windsor', 'leamington', 'kingsville', 'amherstburg'], formato: 'tribe', url: 'https://www.visitwindsoressex.com/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'chicago_library', nome: 'Chicago Public Library (open data)', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['chicago'], formato: 'json',
    url: "https://data.cityofchicago.org/resource/vsdy-d8k7.json?$where=start%3E%3D'{oggi}'&$limit=300", campi: { titolo: 'title', dal: 'start', al: 'end', luogo: 'location_address', descrizione: 'description' } },
  { id: 'nyc_parks', nome: 'NYC Parks events (open data)', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['new york', 'new york city', 'nyc'], formato: 'json',
    url: 'https://data.cityofnewyork.us/resource/w3wp-dpdi.json?$limit=500', campi: { titolo: 'title', dal: 'starttime', al: 'endtime', luogo: 'location', url: 'link.url', descrizione: 'description' }, licenza: 'NYC Open Data' },
  { id: 'edmonton_events', nome: 'City of Edmonton events (open data)', paesi: ['CA'], tipo: 'eventi', lingua: 'en', citta: ['edmonton'], formato: 'json',
    url: "https://data.edmonton.ca/resource/64u3-c7bh.json?$where=ends%3E%3D'{oggi}'", campi: { titolo: 'title', dal: 'begins', al: 'ends', luogo: 'event_venue', url: 'event_link' } },
  { id: 'brisbane_opendata', nome: 'Brisbane City Council (open data)', paesi: ['AU'], tipo: 'entrambi', lingua: 'en', citta: ['brisbane'], formato: 'opendatasoft',
    url: 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/brisbane-city-council-events/records?limit=100&where=start_datetime%3E%3Dnow()',
    campi: { titolo: 'subject', dal: 'start_datetime', al: 'end_datetime', luogo: 'location', url: 'web_link', descrizione: 'description' }, licenza: 'CC BY 4.0' },
  // ── OPENCITY ITALIA: siti comunali Designers Italia, stessa API per tutti. Valgono per POSIZIONE (centro del comune + km).
  // 136 comuni con eventi futuri (ricerca del 25/11/2026: 270 verificati), elenco con coordinate in opencityComuni.ts
  ...OPENCITY_COMUNI.map(([nome, host, lat, lon]): FonteEventi => ({ id: `opencity_${host.replace(/^www\./, '').replace(/^comune\./, '').replace(/\.it$/, '').replace(/[^a-z0-9]+/g, '_')}`,
    nome: `Comune di ${nome}`, paesi: ['IT'], tipo: 'entrambi', lingua: 'it', formato: 'opencity',
    url: `https://${host}/api/openapi/vivere-il-comune/eventi?limit=50&sort=published&order=desc`, /* oltre 50 risponde 400 */ vicino: { lat, lon, km: 15 }, licenza: 'CC BY (OpenCity Italia)' })),
  // ── COMUNI ITALIANI dallo scopritore automatico (scratch/scopri-eventi-comuni.mjs: Indice PA + ISTAT + Wikidata, ogni sito
  // provato con OpenCity, ComunWeb, The Events Calendar, RSS/iCal, JSON-LD). Stesso host di un OpenCity sopra = una fonte sola.
  // ── AGENDE DEI QUOTIDIANI (25/11/2026, scratch/scopri-eventi-quotidiani.mjs: elenco Wikidata + pagina agenda provata).
  // Elencano anche la provincia → rigorose; valgono entro 40 km dal luogo di pubblicazione. Fuori le pagine che sono i
  // convegni della testata o una rivista, non un'agenda della città (controllo a mano del 25/11).
  ...QUOTIDIANI_EVENTI.filter(([, , url]) => !/lavanguardia\.com\/calendario|lopinion\.fr\/evenements|monu\.org|weltwoche\.ch\/events/.test(url))
    .map(([nome, paese, url, lingua, lat, lon]): FonteEventi => ({ id: `qd_${new URL(url).host.replace(/^www\./, '').replace(/[^a-z0-9]+/g, '_')}`,
      nome, paesi: [paese], tipo: 'entrambi', lingua, rigorosa: true, url, vicino: { lat, lon, km: 40 } })),
  ...COMUNI_EVENTI.filter(([, host]) => !OPENCITY_COMUNI.some(([, h]) => h.replace(/^www\./, '') === host.replace(/^(https?:\/\/)?(www\.)?/, '')))
    .map(([nome, host, formato, rel, lat, lon]): FonteEventi => ({ id: `comune_ev_${host.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^comune\./, '').replace(/\.it$/, '').replace(/[^a-z0-9]+/g, '_')}`,
      // «pagina» = pagina eventi HTML senza dati strutturati: niente formato → sul server JSON-LD, poi estrattore HTML, poi AI
      nome: `Comune di ${nome}`, paesi: ['IT'], tipo: 'entrambi', lingua: 'it', formato: formato === 'comunweb' ? 'json' : formato === 'pagina' ? undefined : formato,
      // atti dell'amministrazione (convocazioni, avvisi, anagrafe) fuori, come nello scopritore
      campi: { ...(formato === 'comunweb' ? CAMPI_COMUNWEB : {}), escludi: ESCLUDI_ISTITUZIONALI },
      url: `${/^https?:\/\//.test(host) ? host : `https://${host}`}${rel}`, vicino: { lat, lon, km: 15 }, licenza: 'sito istituzionale del comune' })),
  { id: 'montreal_evenements', nome: 'Ville de Montréal (open data)', paesi: ['CA'], tipo: 'entrambi', lingua: 'fr', formato: 'csv', vicino: { lat: 45.5017, lon: -73.5673, km: 30 },
    url: 'https://donnees.montreal.ca/dataset/6a4cbf2c-c9b7-413a-86b1-e8f7081e2578/resource/6decf611-6f11-4f34-bb36-324d804c9bad/download/evenements.csv',
    campi: { titolo: 'titre', dal: 'date_debut', al: 'date_fin', luogo: 'emplacement', url: 'url_fiche', descrizione: 'description' }, licenza: 'CC BY 4.0' },
  { id: 'malaga_agenda_csv', nome: 'Ayuntamiento de Málaga (open data)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', formato: 'csv', vicino: { lat: 36.7213, lon: -4.4214, km: 20 },
    url: 'https://datosabiertos.malaga.eu/recursos/cultura/agenda/2026.csv',
    campi: { titolo: 'NOMBRE', dal: 'F_INICIO', al: 'F_FIN', luogo: 'EQP_NOMBRECALLE', url: 'DIRECCION_WEB', descrizione: 'DESCRIPCION' }, licenza: 'CC BY 4.0' },
  { id: 'hk_lcsd', nome: 'LCSD Hong Kong (open data)', paesi: ['HK'], tipo: 'entrambi', lingua: 'en', formato: 'xml', vicino: { lat: 22.3193, lon: 114.1694, km: 40 },
    url: 'https://www.lcsd.gov.hk/datagovhk/event/events.xml',
    campi: { elenco: 'event', titolo: 'titlee', dal: 'predateE', url: 'urle', descrizione: 'desce' }, licenza: 'DATA.GOV.HK' },
  // ── CITTÀ TURISTICHE DEBOLI (25/11/2026, ricerca mirata, pagine verificate con eventi futuri)
  // Rete Citynews: stessa pagina «/eventi/» per ogni testata cittadina; elenca anche la provincia → rigorosa
  ...([
    ['milanotoday', 'MilanoToday', ['milano', 'milan']], ['veneziatoday', 'VeneziaToday', ['venezia', 'venice', 'mestre']], ['romatoday', 'RomaToday', ['roma', 'rome']],
    ['napolitoday', 'NapoliToday', ['napoli', 'naples']], ['firenzetoday', 'FirenzeToday', ['firenze', 'florence']], ['baritoday', 'BariToday', ['bari']],
    ['lecceprima', 'LeccePrima', ['lecce']], ['cataniatoday', 'CataniaToday', ['catania']], ['palermotoday', 'PalermoToday', ['palermo']],
    ['pisatoday', 'PisaToday', ['pisa']], ['quicomo', 'QuiComo', ['como']],
  ] as const).map(([dom, nome, citta]): FonteEventi => ({ id: `citynews_${dom}`, nome, paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, citta: [...citta], url: `https://www.${dom}.it/eventi/` })),
  AG('scala', 'Teatro alla Scala', 'IT', ['milano', 'milan'], 'https://www.teatroallascala.org/en/calendar.html', 'en', 'eventi'),
  AG('palazzo_reale_mi', 'Palazzo Reale Milano', 'IT', ['milano', 'milan'], 'https://www.palazzorealemilano.it/mostre/mostre-in-corso', 'it', 'mostre'),
  AG('comune_venezia', 'Comune di Venezia', 'IT', ['venezia', 'venice'], 'https://www.comune.venezia.it/it/eventi', 'it'),
  AG('guggenheim_venezia', 'Peggy Guggenheim Collection', 'IT', ['venezia', 'venice'], 'https://www.guggenheim-venice.it/en/whats-on/', 'en', 'mostre'),
  AG('muve', 'Musei Civici di Venezia', 'IT', ['venezia', 'venice'], 'https://www.visitmuve.it/mostre-ed-eventi/', 'it', 'mostre'),
  AG('london_gov', 'Mayor of London', 'GB', ['london', 'londra'], 'https://www.london.gov.uk/events', 'en', 'eventi'),
  AG('rbo_london', 'Royal Ballet and Opera', 'GB', ['london', 'londra'], 'https://www.rbo.org.uk/tickets-and-events', 'en', 'eventi'),
  AG('vam', 'V&A', 'GB', ['london', 'londra'], 'https://www.vam.ac.uk/whatson', 'en'),
  { id: 'tate', nome: 'Tate', paesi: ['GB'], tipo: 'mostre', lingua: 'en', citta: ['london', 'londra'], rigorosa: true, url: 'https://www.tate.org.uk/whats-on' },
  AG('wigmore', 'Wigmore Hall', 'GB', ['london', 'londra'], 'https://www.wigmore-hall.org.uk/whats-on', 'en', 'eventi'),
  AG('natgallery_uk', 'National Gallery', 'GB', ['london', 'londra'], 'https://www.nationalgallery.org.uk/exhibitions', 'en', 'mostre'),
  AG('timeout_london', 'Time Out London', 'GB', ['london', 'londra'], 'https://www.timeout.com/london/things-to-do-in-london-this-weekend', 'en'),
  AG('visitbath', 'Visit Bath', 'GB', ['bath'], 'https://www.visitbath.co.uk/whats-on', 'en'),
  AG('yorkminster', 'York Minster', 'GB', ['york'], 'https://yorkminster.org/whats-on/', 'en', 'eventi'),
  { id: 'junta_agenda_cultural', nome: 'Junta de Andalucía agenda cultural', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', rigorosa: true, url: 'https://www.juntadeandalucia.es/aaiicc/agendaculturaldeandalucia/',
    citta: ['sevilla', 'seville', 'siviglia', 'granada', 'cordoba', 'malaga', 'cadiz', 'almeria', 'huelva', 'jaen'] },
  { id: 'opernhaus_zh', nome: 'Opernhaus Zürich', paesi: ['CH'], tipo: 'eventi', lingua: 'en', citta: ['zurich', 'zurigo', 'zuerich'], formato: 'jsonld', url: 'https://www.opernhaus.ch/en/spielplan/calendar/' },
  AG('schauspielhaus_zh', 'Schauspielhaus Zürich', 'CH', ['zurich', 'zurigo', 'zuerich'], 'https://www.schauspielhaus.ch/de/spielplan/', 'de', 'eventi'),
  AG('zorlu_psm', 'Zorlu PSM', 'TR', ['istanbul'], 'https://www.zorlupsm.com/etkinlikler', 'tr', 'eventi'),
  AG('opera_hu', 'Hungarian State Opera', 'HU', ['budapest'], 'https://www.opera.hu/en/programme/', 'en', 'eventi'),
  AG('welovebudapest', 'We Love Budapest', 'HU', ['budapest'], 'https://welovebudapest.com/en/events/', 'en'),
  AG('lv_weekly', 'Las Vegas Weekly', 'US', ['las vegas'], 'https://lasvegasweekly.com/events/', 'en', 'eventi'),
  AG('miami_newtimes', 'Miami New Times', 'US', ['miami', 'miami beach'], 'https://www.miaminewtimes.com/eventsearch/', 'en', 'eventi'),
  AG('timeout_miami', 'Time Out Miami', 'US', ['miami', 'miami beach'], 'https://www.timeout.com/miami/things-to-do/things-to-do-in-miami-this-weekend', 'en'),
  AG('harbourfront', 'Harbourfront Centre', 'CA', ['toronto'], 'https://harbourfrontcentre.com/whats-on/', 'en'),
  { id: 'funcheap_sf', nome: 'SF Funcheap', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['san francisco'], formato: 'rss', url: 'https://feeds.feedburner.com/funcheapsf_recent_added_events/' },
  AG('sfmoma', 'SFMOMA', 'US', ['san francisco'], 'https://www.sfmoma.org/exhibitions/', 'en', 'mostre'),
  AG('hawaii_theatre', 'Hawaii Theatre', 'US', ['honolulu'], 'https://www.hawaiitheatre.com/upcoming-events/', 'en', 'eventi'),
  AG('timeout_bangkok', 'Time Out Bangkok', 'TH', ['bangkok', 'กรุงเทพมหานคร', 'krung thep'], 'https://www.timeout.com/bangkok/things-to-do/the-best-things-to-do-in-bangkok-this-weekend', 'en'),
  AG('gardensbythebay', 'Gardens by the Bay', 'SG', ['singapore'], 'https://www.gardensbythebay.com.sg/en/things-to-do/calendar-of-events.html', 'en', 'eventi'),
  AG('visitseoul', 'Visit Seoul', 'KR', ['seoul', '서울'], 'https://english.visitseoul.net/events', 'en'),
  AG('hanoi_grapevine', 'Hanoi Grapevine', 'VN', ['hanoi', 'ha noi'], 'https://hanoigrapevine.com/', 'en'),
  AG('capetownetc', 'Cape Town ETC', 'ZA', ['cape town', 'citta del capo', 'kaapstad'], 'https://www.capetownetc.com/whats-on/', 'en'),
  AG('visitstockholm', 'Visit Stockholm', 'SE', ['stockholm', 'stoccolma'], 'https://www.visitstockholm.com/events/', 'en'),
  AG('operaen_oslo', 'Den Norske Opera', 'NO', ['oslo'], 'https://www.operaen.no/en/program/', 'en', 'eventi'),
  AG('cannes_agenda', 'Cannes Tourisme', 'FR', ['cannes'], 'https://en.cannes-france.com/events/all-agenda/', 'en'),
  NAZ('visitgreece_events', 'Visit Greece', ['GR'], 'https://www.visitgreece.gr/en/events', 'en', 'entrambi'),
  // ── PIATTAFORME COMUNALI (25/11/2026): CivicPlus (USA/CA, RSS «calendarEvent:*»; via le riunioni), Tourinsoft (FR,
  // OData), GEM2GO (AT, stessa pagina calendario su ~1.100 comuni). destination.one (DE) NON usato: l'accesso pubblico è
  // un'experience DEMO del fornitore, condizioni d'uso da chiarire col committente.
  ...([
    ['banff', 'Town of Banff', 'CA', 'www.banff.ca', 51.1784, -115.5708], ['grapevine', 'City of Grapevine', 'US', 'www.grapevinetexas.gov', 32.9343, -97.0781],
    ['charleston', 'City of Charleston', 'US', 'www.charleston-sc.gov', 32.7765, -79.9311],
  ] as const).map(([id, nome, cc, host, lat, lon]): FonteEventi => ({ id: `civicplus_${id}`, nome, paesi: [cc], tipo: 'eventi', lingua: 'en', formato: 'rss', vicino: { lat, lon, km: 20 },
    url: `https://${host}/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`,
    campi: { dal: 'calendarEvent:EventDates', luogo: 'calendarEvent:Location', escludi: '\\b(council|commission|board|committee|meeting|closed|closure|hearing|workshop session|agenda)\\b' } })),
  { id: 'civicplus_bangor', nome: 'City of Bangor', paesi: ['US'], tipo: 'eventi', lingua: 'en', formato: 'ical', vicino: { lat: 44.8016, lon: -68.7712, km: 20 },
    url: 'https://www.bangormaine.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar', campi: { escludi: '\\b(council|commission|board|committee|meeting|closed|closure|hearing)\\b' } },
  { id: 'tourinsoft_vendee', nome: 'Vendée Expansion (agenda)', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', formato: 'json', vicino: { lat: 46.6705, lon: -1.426, km: 70 },
    url: 'https://wcf.tourinsoft.com/Syndication/3.0/cdt85/e5d817f6-7b50-4b7f-854c-b642df058cdd/Objects?$format=json',
    campi: { elenco: 'value', titolo: 'SyndicObjectName', dal: 'OuvertureGranule', luogo: 'Commune' }, licenza: 'Licence Ouverte 2.0' },
  ...([
    ['hallstatt', 'Gemeinde Hallstatt', 'www.hallstatt.ooe.gv.at', 47.5622, 13.6493], ['st_wolfgang', 'St. Wolfgang im Salzkammergut', 'www.st-wolfgang.ooe.gv.at', 47.7389, 13.4467],
    ['bad_ischl', 'Stadt Bad Ischl', 'www.bad-ischl.ooe.gv.at', 47.7115, 13.6239],
  ] as const).map(([id, nome, host, lat, lon]): FonteEventi => ({ id: `gem2go_${id}`, nome, paesi: ['AT'], tipo: 'entrambi', lingua: 'de', vicino: { lat, lon, km: 12 },
    url: `https://${host}/system/web/kalender.aspx` })),
  // ── GIAPPONE: CSV standard «イベント一覧» dei comuni (colonne イベント名 / 開始日 / 終了日 / 場所名称 / URL, lette dal lettore csv)
  ...([
    ['kanazawa', 'Kanazawa', 'https://catalog-data.city.kanazawa.ishikawa.jp/dataset/2e343bd2-ec53-436a-aba8-0dfe0ad4143b/resource/3eaa23d3-5a12-45e8-b7ea-3955554eaf38/download/172014_event.csv', 36.5613, 136.6562, 25, ''],
    ['osaka_pref', 'Prefettura di Osaka', 'https://data.bodik.jp/dataset/388c34d1-f97a-4865-a547-8e89c53a364a/resource/a6f32430-9e39-49f7-b429-6e4eadcc96de/download/270008_event.csv', 34.6937, 135.5023, 40, 'shift_jis'],
    ['okazaki', 'Okazaki', 'https://data.bodik.jp/ja/dataset/beb99975-6d85-4463-8767-0cb1d7c414e0/resource/92a4cbd7-1a7d-47ef-9ead-4c6e42fe6eba/download/232025_event.csv', 34.9551, 137.1747, 20, ''],
    ['toyonaka', 'Toyonaka', 'https://data.bodik.jp/ja/dataset/4f4ac809-c36a-46a6-ad39-76e7e2bbf587/resource/b0a19f54-86b5-4083-bdea-17f7fa76487f/download/272035_event.csv', 34.7814, 135.4695, 12, ''],
    ['higashiosaka', 'Higashiosaka', 'https://data.bodik.jp/dataset/ebba962b-9fa2-4997-aa3b-e5d92c83a810/resource/0849fcf9-a505-42b8-827c-58a9d72d5317/download/272272_event.csv', 34.6794, 135.6008, 10, ''],
    ['koto', 'Koto-ku (Tokyo)', 'https://www.opendata.metro.tokyo.lg.jp/koto/131083_012_event.csv', 35.6729, 139.8173, 8, ''],
  ] as const).map(([id, nome, url, lat, lon, km, codifica]): FonteEventi => ({ id: `jp_${id}`, nome, paesi: ['JP'], tipo: 'entrambi', lingua: 'ja', formato: 'csv', url,
    vicino: { lat, lon, km }, ...(codifica ? { codifica } : {}), licenza: 'open data comunale (di solito CC BY 4.0)' })),
  // ── ALTRI OPEN DATA (25/11/2026)
  { id: 'nantes_agenda', nome: 'Nantes Métropole (open data)', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', formato: 'opendatasoft', vicino: { lat: 47.2184, lon: -1.5536, km: 25 },
    url: "https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/244400404_agenda-evenements-nantes-metropole_v3/records?limit=100&order_by=date&where=date%3E%3D'{oggi}'",
    campi: { titolo: 'nom', dal: 'date', luogo: 'lieu', url: 'url_site', descrizione: 'description' }, licenza: 'Licence Ouverte' },
  // già filtrata a 25 km nella richiesta (within_distance) e senza il comune nei record: non rigorosa
  { id: 'wallonie_imio', nome: 'Communes de Wallonie (iMio)', paesi: ['BE'], tipo: 'entrambi', lingua: 'fr', formato: 'opendatasoft',
    url: "https://www.odwb.be/api/explore/v2.1/catalog/datasets/evenements-en-wallonie/records?limit=100&order_by=start_datetime&where=end_datetime%3E%3Dnow()%20AND%20within_distance(coordinates%2C%20geom'POINT({lon}%20{lat})'%2C%2025km)",
    campi: { titolo: 'title', dal: 'start_datetime', al: 'end_datetime', luogo: 'address_city', url: 'event_url', descrizione: 'description' } },
  { id: 'basel_veranstaltungen', nome: 'Kanton Basel-Stadt Grossveranstaltungen', paesi: ['CH'], tipo: 'eventi', lingua: 'de', formato: 'opendatasoft', vicino: { lat: 47.5596, lon: 7.5886, km: 15 },
    url: "https://data.bs.ch/api/explore/v2.1/catalog/datasets/100074/records?limit=100&where=datum_bis%3E%3D'{oggi}'", campi: { titolo: 'name', dal: 'datum_von', al: 'datum_bis', luogo: 'strasse_name_kanton' }, licenza: 'CC BY 4.0' },
  { id: 'er_turismo', nome: 'Emilia-Romagna Turismo (open data)', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, formato: 'json',
    citta: ['bologna', 'rimini', 'ravenna', 'parma', 'modena', 'ferrara', 'reggio emilia', 'piacenza', 'forli', 'cesena', 'riccione', 'cesenatico', 'cattolica', 'faenza', 'carpi', 'imola', 'comacchio'],
    url: 'https://emiliaromagnaturismo.it/opendata/v1/events', campi: { elenco: 'data', titolo: 'title', dal: 'dates.from', al: 'dates.to', luogo: 'locations.0.city', url: 'permalink' } },
  { id: 'chicago_parks', nome: 'Chicago Park District (open data)', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['chicago'], formato: 'json',
    url: "https://data.cityofchicago.org/resource/tn7v-6rnw.json?$where=start_date%3E%3D'{oggi}'&$limit=300&$order=start_date",
    campi: { titolo: 'title', dal: 'start_date', al: 'end_date', luogo: 'location_facility', url: 'information_link' } },
  { id: 'berlin_weihnachtsmaerkte', nome: 'Berliner Weihnachtsmärkte', paesi: ['DE'], tipo: 'eventi', lingua: 'de', citta: ['berlin', 'berlino'], formato: 'json',
    url: 'https://www.berlin.de/sen/web/service/maerkte-feste/weihnachtsmaerkte/index.php/index/all.json?q=', campi: { elenco: 'index', titolo: 'name', dal: 'von', al: 'bis', luogo: 'strasse', url: 'www' } },
  { id: 'taiwan_moc', nome: '文化部 藝文活動 (open data)', paesi: ['TW'], tipo: 'mostre', lingua: 'zh', rigorosa: true, formato: 'json',
    url: 'https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=6',
    campi: { titolo: 'title', dal: 'startDate', al: 'endDate', luogo: 'showInfo.0.location', url: 'sourceWebPromote', descrizione: 'descriptionFilterHtml' }, licenza: 'open data Ministero della Cultura di Taiwan' },

  // ── MOSTRE nel mondo: meer.com, calendario delle mostre in corso di ~95 paesi (titolo, sede, città, date)
  { id: 'meer_mostre', nome: 'Meer — mostre in corso', paesi: ['IT', 'FR', 'DE', 'GB', 'US', 'ES', 'CH', 'NL', 'BE', 'PT', 'JP', 'CN', 'HK', 'KR', 'TW', 'SG', 'IN', 'AU', 'NZ', 'BR', 'AR', 'MX', 'CL', 'CO', 'CA', 'ZA', 'AE', 'IL', 'TR', 'GR', 'PL', 'CZ', 'HU', 'RU', 'SE', 'NO', 'DK', 'FI', 'IE', 'EG', 'MA', 'LB'],
    tipo: 'mostre', lingua: 'en', rigorosa: true, url: 'https://www.meer.com/en/calendar?country_id={id_paese}&event_type=current_events',
    idPaese: { IT: '117', FR: '82', DE: '64', GB: '84', US: '241', ES: '75', CH: '50', NL: '174', BE: '27', PT: '192', JP: '121', CN: '55', HK: '102', KR: '129', TW: '236', SG: '207', IN: '112', AU: '20', NZ: '179', BR: '38', AR: '17', MX: '165', CL: '53', CO: '56', CA: '45', ZA: '255', AE: '9', IL: '110', TR: '233', GR: '96', PL: '187', CZ: '63', HU: '107', RU: '199', SE: '206', NO: '175', DK: '66', FI: '77', IE: '109', EG: '72', MA: '145', LB: '135' } },

  // ── ITALIA
  { id: 'virgilio', nome: 'Virgilio Eventi', paesi: ['IT'], tipo: 'entrambi', url: 'https://www.virgilio.it/italia/{citta_locale}/eventi/', lingua: 'it', nomeCitta: 'locale' }, // col nome inglese («florence») mostrava ROMA
  { id: 'arte_it', nome: 'Arte.it calendario', paesi: ['IT'], tipo: 'mostre', url: 'https://www.arte.it/calendario-arte/{citta}', lingua: 'it' },
  { id: 'zero_eu', nome: 'ZERO', paesi: ['IT'], tipo: 'entrambi', url: 'https://zero.eu/it/{citta_locale}/', lingua: 'it', citta: ['milano', 'milan', 'roma', 'rome'] },
  NAZ('exibart_mostre', 'Exibart mostre', ['IT'], 'https://www.exibart.com/mostre/', 'it', 'mostre'),
  // (25/11/2026, committente: «la Nazione e il Tirreno hanno agende degli eventi») La Nazione, il Resto del Carlino, Il Giorno
  // e quotidiano.net servono LA STESSA agenda del gruppo QN: una fonte sola, nazionale e rigorosa. Il Tirreno: nessuna agenda.
  NAZ('qn_eventi', 'QN (La Nazione, il Resto del Carlino, Il Giorno)', ['IT'], 'https://www.lanazione.it/eventi', 'it', 'entrambi'),
  // (25/11/2026) Agende dei QUOTIDIANI verificate (date future nell'HTML). Gruppo SESAAB, Mentelocale, La Sicilia, Trentino.
  { id: 'eco_bergamo', nome: "L'Eco di Bergamo (Eppen)", paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, url: 'https://www.ecodibergamo.it/eventi/eppen/', vicino: { lat: 45.6983, lon: 9.6773, km: 35 } },
  { id: 'provincia_como', nome: 'La Provincia di Como', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, url: 'https://www.laprovinciadicomo.it/eventi/agenda-degli-appuntamenti/', vicino: { lat: 45.8081, lon: 9.0852, km: 30 } },
  { id: 'cittadino_lodi', nome: 'Il Cittadino di Lodi', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, url: 'https://www.ilcittadino.it/eventi/agenda-degli-appuntamenti/', vicino: { lat: 45.3097, lon: 9.5037, km: 25 } },
  { id: 'lasicilia_eventi', nome: 'La Sicilia eventi', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, url: 'https://www.lasicilia.it/sezioni/957/eventi', vicino: { lat: 37.5, lon: 14.2, km: 180 } },
  { id: 'trentino_eventi', nome: 'Giornale Trentino eventi', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, url: 'https://www.giornaletrentino.it/eventi', vicino: { lat: 46.0748, lon: 11.1217, km: 60 } },
  ...([['genova', 'genova', 44.4056, 8.9463], ['milano', 'milano', 45.4642, 9.19], ['torino', 'torino', 45.0703, 7.6869]] as const)
    .map(([c, slug, lat, lon]): FonteEventi => ({ id: `mentelocale_${c}`, nome: `Mentelocale ${c}`, paesi: ['IT'], tipo: 'entrambi', lingua: 'it', url: `https://www.mentelocale.it/${slug}/eventi/`, vicino: { lat, lon, km: 20 } })),
  // Francia: stessa piattaforma per La Dépêche, Midi Libre, L'Indépendant (regionali → rigorose)
  { id: 'ladepeche_agenda', nome: 'La Dépêche du Midi agenda', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, url: 'https://www.ladepeche.fr/agenda/', vicino: { lat: 43.6, lon: 1.44, km: 150 } },
  { id: 'midilibre_agenda', nome: 'Midi Libre agenda', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, url: 'https://www.midilibre.fr/agenda/', vicino: { lat: 43.61, lon: 3.88, km: 120 } },
  { id: 'lindependant_agenda', nome: "L'Indépendant agenda", paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, url: 'https://www.lindependant.fr/agenda/', vicino: { lat: 42.7, lon: 2.9, km: 80 } },
  // Svizzera: agende Tamedia per città
  ...([['tagi', 'Tages-Anzeiger', 'https://agenda.tagesanzeiger.ch/veranstaltungen.html', 'de', 47.3769, 8.5417], ['bz', 'Berner Zeitung', 'https://agenda.bernerzeitung.ch/veranstaltungen.html', 'de', 46.948, 7.4474],
    ['baz', 'Basler Zeitung', 'https://agenda.bazonline.ch/veranstaltungen.html', 'de', 47.5596, 7.5886], ['24h', '24 heures', 'https://agenda.24heures.ch/evenements.html', 'fr', 46.5197, 6.6323],
    ['tdg', 'Tribune de Genève', 'https://agenda.tdg.ch/evenements.html', 'fr', 46.2044, 6.1432]] as const)
    .map(([id, nome, url, lingua, lat, lon]): FonteEventi => ({ id: `${id}_agenda`, nome: `${nome} agenda`, paesi: ['CH'], tipo: 'entrambi', lingua, url, vicino: { lat, lon, km: 25 } })),
  NAZ('port_hu', 'port.hu programmi', ['HU'], 'https://port.hu/', 'hu', 'entrambi'),
  // Nord America: settimanali alternativi (Voice Media Group, EverOut) e calendari locali
  AG('westword', 'Westword', 'US', ['denver'], 'https://www.westword.com/eventsearch/', 'en', 'eventi'),
  AG('phoenix_newtimes', 'Phoenix New Times', 'US', ['phoenix'], 'https://www.phoenixnewtimes.com/eventsearch/', 'en', 'eventi'),
  AG('dallas_observer', 'Dallas Observer', 'US', ['dallas'], 'https://www.dallasobserver.com/eventsearch/', 'en', 'eventi'),
  AG('houston_press', 'Houston Press', 'US', ['houston'], 'https://community.houstonpress.com/houston/EventSearch', 'en', 'eventi'),
  AG('everout_seattle', 'EverOut Seattle', 'US', ['seattle'], 'https://everout.com/seattle/', 'en'),
  AG('everout_portland', 'EverOut Portland', 'US', ['portland'], 'https://everout.com/portland/', 'en'),
  AG('georgia_straight', 'Georgia Straight', 'CA', ['vancouver'], 'https://www.straight.com/listings/events', 'en'),
  AG('boston_calendar', 'The Boston Calendar', 'US', ['boston', 'cambridge'], 'https://www.thebostoncalendar.com/', 'en', 'eventi'),
  AG('metropolis_japan', 'Metropolis Japan', 'JP', ['tokyo', '東京'], 'https://metropolisjapan.com/events/', 'en'),
  // (25/11/2026, «carrara?») Comune di Carrara: non è OpenCity standard (API 404), pagina elenco leggibile; vale per posizione
  { id: 'comune_carrara', nome: 'Comune di Carrara', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', url: 'https://www.comune.carrara.ms.it/it/eventi', vicino: { lat: 44.0793, lon: 10.0977, km: 15 } },
  { id: 'palazzo_cucchiari', nome: 'Palazzo Cucchiari', paesi: ['IT'], tipo: 'mostre', lingua: 'it', url: 'https://www.palazzocucchiari.it/', vicino: { lat: 44.0793, lon: 10.0977, km: 15 } },
  AG('turismo_roma', 'Turismo Roma', 'IT', ['roma', 'rome'], 'https://www.turismoroma.it/en/tipo-evento/events', 'en'),
  AG('destination_florence', 'Destination Florence', 'IT', ['firenze', 'florence'], 'https://destinationflorence.com/it/eventi', 'it'),
  AG('bologna_welcome', 'Bologna Welcome', 'IT', ['bologna'], 'https://www.bolognawelcome.com/it/eventi', 'it'),
  AG('napoli_new_city', 'Napoli a New City', 'IT', ['napoli', 'naples'], 'https://www.napolianewcity.it/it/eventi/', 'it'),
  AG('visit_genoa', 'Visit Genoa', 'IT', ['genova', 'genoa'], 'https://www.visitgenoa.it/eventi', 'it'),
  AG('turismo_torino', 'Turismo Torino', 'IT', ['torino', 'turin'], 'https://www.turismotorino.org/it/visita/eventi/agenda', 'it'),
  AG('comune_palermo', 'Comune di Palermo', 'IT', ['palermo'], 'https://www.comune.palermo.it/eventi', 'it', 'eventi'),
  AG('comune_verona', 'Comune di Verona', 'IT', ['verona'], 'https://www.comune.verona.it/Vivere-il-comune/Eventi', 'it'),
  AG('visit_siena', 'Visit Siena', 'IT', ['siena'], 'https://www.visitsiena.it/eventi', 'it'),
  AG('turismo_pisa', 'Turismo Pisa', 'IT', ['pisa'], 'https://www.turismo.pisa.it/eventi/index.html', 'it'),
  AG('turismo_ravenna', 'Turismo Ravenna', 'IT', ['ravenna'], 'https://www.turismo.ra.it/eventi/', 'it'),
  AG('turismo_padova', 'Turismo Padova', 'IT', ['padova', 'padua'], 'https://www.turismopadova.it/eventi/', 'it'),
  AG('turismo_lucca', 'Turismo Lucca', 'IT', ['lucca'], 'https://www.turismo.lucca.it/eventi', 'it'),
  AG('turismo_mantova', 'Turismo Mantova', 'IT', ['mantova', 'mantua'], 'https://www.turismo.mantova.it/eventi', 'it'),
  AG('visit_bergamo', 'VisitBergamo', 'IT', ['bergamo'], 'https://www.visitbergamo.net/it/eventi/', 'it'),
  AG('visit_assisi', 'Visit Assisi', 'IT', ['assisi'], 'https://www.visit-assisi.it/eventi', 'it'),
  AG('discover_trieste', 'Discover Trieste', 'IT', ['trieste'], 'https://www.discover-trieste.it/vivi/trieste-now', 'it'),
  AG('oggi_a_como', 'Oggi a Como', 'IT', ['como'], 'https://www.oggiacomo.it/prossimi-eventi/', 'it', 'eventi'),
  AG('comune_catania', 'Comune di Catania', 'IT', ['catania'], 'https://www.comune.catania.it/vivere-il-comune/eventi/', 'it', 'eventi'),
  NAZ('sanmarinortv_eventi', 'San Marino RTV eventi', ['SM'], 'https://www.sanmarinortv.sm/eventi', 'it', 'entrambi'),

  // ── FRANCIA, BELGIO, LUSSEMBURGO, MONACO
  AG('sortiraparis', 'Sortir à Paris', 'FR', ['paris', 'parigi'], 'https://www.sortiraparis.com/', 'fr'),
  AG('parismusees', 'Paris Musées', 'FR', ['paris', 'parigi'], 'https://www.parismusees.paris.fr/fr/expositions', 'fr', 'mostre'),
  AG('visiterlyon', 'ONLYLYON', 'FR', ['lyon', 'lione'], 'https://www.visiterlyon.com/sortir/l-agenda/tous-les-evenements', 'fr'),
  AG('explorenice', 'Explore Nice', 'FR', ['nice', 'nizza'], 'https://www.explorenicecotedazur.com/agenda/', 'fr'),
  { id: 'quefaire_be', nome: 'QueFaire.be', paesi: ['BE'], tipo: 'entrambi', url: 'https://www.quefaire.be/{citta_locale}', lingua: 'fr', nomeCitta: 'locale' },
  AG('bruxelles_ville', 'Ville de Bruxelles', 'BE', ['bruxelles', 'brussels', 'brussel', 'bruxelas'], 'https://www.bruxelles.be/agenda', 'fr'),
  AG('visitbruges', 'Visit Bruges', 'BE', ['brugge', 'bruges'], 'https://www.visitbruges.be/en/whats-on/events-calendar', 'en'),
  NAZ('grimaldiforum', 'Grimaldi Forum', ['MC'], 'https://www.grimaldiforum.com/', 'fr', 'entrambi'),

  // ── SPAGNA, PORTOGALLO, ANDORRA
  TM('ES', 'es', 'es'),
  AG('esmadrid', 'esMADRID', 'ES', ['madrid'], 'https://www.esmadrid.com/agenda-madrid', 'es'),
  AG('guia_bcn', 'Guia BCN (Ajuntament)', 'ES', ['barcelona', 'barcellona'], 'https://guia.barcelona.cat/ca/agenda', 'ca'),
  AG('visitvalencia', 'Visit Valencia', 'ES', ['valencia'], 'https://www.visitvalencia.com/en/events-valencia', 'en'),
  AG('malaga_ayto', 'Ayuntamiento de Málaga', 'ES', ['malaga'], 'https://www.malaga.eu/la-ciudad/agenda/', 'es', 'eventi'),
  AG('visitpalma', 'Visit Palma', 'ES', ['palma', 'palma de mallorca', 'palma di maiorca'], 'https://visitpalma.com/en/agenda/', 'en'),
  { id: 'arteinformado', nome: 'Arteinformado', paesi: ['ES'], tipo: 'mostre', url: 'https://www.arteinformado.com/agenda/exposiciones/{citta_locale}', lingua: 'es', nomeCitta: 'locale', rigorosa: true },
  { id: 'bol_pt', nome: 'BOL', paesi: ['PT'], tipo: 'eventi', url: 'https://www.bol.pt/Comprar/Pesquisa?q={citta_raw}', lingua: 'pt' },
  { id: 'viralagenda', nome: 'Viral Agenda', paesi: ['PT'], tipo: 'entrambi', url: 'https://www.viralagenda.com/pt/{citta_locale}', lingua: 'pt', nomeCitta: 'locale' },
  AG('visitlisboa', 'Visit Lisboa', 'PT', ['lisboa', 'lisbon', 'lisbona'], 'https://www.visitlisboa.com/en/events', 'en'),
  AG('agenda_porto', 'Agenda Porto', 'PT', ['porto', 'oporto'], 'https://www.agenda-porto.pt/', 'pt'),
  NAZ('visitandorra', 'Visit Andorra', ['AD'], 'https://www.visitandorra.com/en/events/', 'en', 'entrambi'),

  // ── REGNO UNITO, IRLANDA, ISLANDA
  TM('GB', 'co.uk', 'en'),
  TM('IE', 'ie', 'en'),
  AG('edinburgh_org', 'Forever Edinburgh', 'GB', ['edinburgh', 'edimburgo'], 'https://www.edinburgh.org/events/', 'en'),
  AG('visitmanchester', 'Visit Manchester', 'GB', ['manchester'], 'https://www.visitmanchester.com/whats-on', 'en'),
  AG('dublin_ie', 'Dublin.ie', 'IE', ['dublin', 'dublino', 'baile atha cliath'], 'https://www.dublin.ie/whats-on/', 'en', 'eventi'),
  AG('reykjavik_citylife', 'Reykjavík City', 'IS', ['reykjavik'], 'https://reykjavik.is/en/citylife/events', 'en'),
  NAZ('tix_is', 'Tix.is', ['IS'], 'https://tix.is/is/', 'is'),

  // ── GERMANIA, AUSTRIA, SVIZZERA, LIECHTENSTEIN
  { id: 'meinestadt', nome: 'meinestadt.de', paesi: ['DE'], tipo: 'eventi', url: 'https://veranstaltungen.meinestadt.de/{citta_locale}', lingua: 'de', nomeCitta: 'locale' },
  AG('visitberlin', 'visitBerlin', 'DE', ['berlin', 'berlino'], 'https://www.visitberlin.de/kalender', 'de'),
  AG('indexberlin', 'INDEX Berlin', 'DE', ['berlin', 'berlino'], 'https://www.indexberlin.com/', 'en', 'mostre'),
  AG('muenchen_de', 'muenchen.de', 'DE', ['munchen', 'munich', 'monaco di baviera'], 'https://www.muenchen.de/veranstaltungen', 'de'),
  AG('hamburg_tourism', 'Hamburg Tourismus', 'DE', ['hamburg', 'amburgo'], 'https://www.hamburg-tourism.de/sehen-erleben/veranstaltungen/veranstaltungskalender/', 'de'),
  AG('visitfrankfurt', 'Visit Frankfurt', 'DE', ['frankfurt', 'frankfurt am main', 'francoforte'], 'https://www.visitfrankfurt.travel/Entdecken-und-Erleben/Veranstaltungen', 'de'),
  AG('wien_gv', 'Stadt Wien', 'AT', ['wien', 'vienna'], 'https://www.wien.gv.at/veranstaltungen/', 'de'),
  AG('ganz_wien', 'ganz-wien.at mostre', 'AT', ['wien', 'vienna'], 'https://www.ganz-wien.at/kunst-kultur/ausstellungen.html', 'de', 'mostre'),
  AG('salzburg_info', 'Tourismus Salzburg', 'AT', ['salzburg', 'salisburgo'], 'https://www.salzburg.info/de/veranstaltungen/veranstaltungskalender', 'de', 'eventi'),
  TM('CH', 'ch', 'de'),
  NAZ('vaterland_agenda', 'Vaterland Agenda', ['LI'], 'https://www.vaterland.li/agenda/', 'de', 'entrambi'),

  // ── PAESI BASSI, NORD EUROPA
  { id: 'uitagenda_nl', nome: 'UITagenda', paesi: ['NL'], tipo: 'entrambi', url: 'https://www.uitagenda.nl/{citta_locale}', lingua: 'nl', nomeCitta: 'locale' },
  AG('iamsterdam', 'I amsterdam', 'NL', ['amsterdam'], 'https://www.iamsterdam.com/whats-on', 'en'),
  TM('NO', 'no', 'no'),
  TM('FI', 'fi', 'fi'),
  TM('DK', 'dk', 'da', 'locale'),
  TM('SE', 'se', 'sv', 'locale'),
  { id: 'meteli', nome: 'Meteli.net', paesi: ['FI'], tipo: 'eventi', url: 'https://www.meteli.net/{citta}', lingua: 'fi' },
  NAZ('museot_fi', 'Museot.fi', ['FI'], 'https://www.museot.fi/nayttelyt/', 'fi', 'mostre'),
  AG('kk_visitorservice', 'Københavns Kommune', 'DK', ['kobenhavn', 'copenhagen', 'copenaghen'], 'https://visitorservice.kk.dk/en/events', 'en', 'eventi'),
  NAZ('visitgreenland', 'Visit Greenland', ['GL'], 'https://visitgreenland.com/events/', 'en'),

  // ── EUROPA CENTRALE E ORIENTALE, BALTICO
  { id: 'goout_cz', nome: 'GoOut', paesi: ['CZ', 'SK', 'PL'], tipo: 'entrambi', url: 'https://goout.net/cs/{citta}/akce/', lingua: 'cs' },
  AG('prague_eu', 'Prague.eu', 'CZ', ['praha', 'prague', 'praga'], 'https://prague.eu/en/events', 'en'),
  { id: 'kamdomesta', nome: 'KamDomesta.sk', paesi: ['SK'], tipo: 'entrambi', url: 'https://kamdomesta.sk/{citta_locale}', lingua: 'sk', nomeCitta: 'locale' },
  AG('visit_bratislava', 'Visit Bratislava', 'SK', ['bratislava'], 'https://www.visitbratislava.com/events/', 'en'),
  AG('pik_warszawa', 'PIK Warszawa mostre', 'PL', ['warszawa', 'warsaw', 'varsavia'], 'https://pik.warszawa.pl/art/wystawa/', 'pl', 'mostre'),
  { id: 'jegy_hu', nome: 'Jegy.hu', paesi: ['HU'], tipo: 'entrambi', url: 'https://www.jegy.hu/city/{citta_locale}', lingua: 'hu', nomeCitta: 'locale' },
  { id: 'iabilet_ro', nome: 'iaBilet', paesi: ['RO'], tipo: 'eventi', url: 'https://www.iabilet.ro/bilete-in-{citta_locale}/', lingua: 'ro', nomeCitta: 'locale' },
  { id: 'bilietai_lt', nome: 'Bilietai.lt', paesi: ['LT'], tipo: 'eventi', url: 'https://www.bilietai.lt/renginiai/visi?locations={citta_raw}&sortOrder=date_asc', lingua: 'lt', nomeCitta: 'locale' },
  AG('vilnius_events', 'Go Vilnius', 'LT', ['vilnius'], 'https://www.vilnius-events.lt/en/', 'en', 'eventi'),
  AG('live_riga', 'Live Riga', 'LV', ['riga'], 'https://www.liveriga.com/en/3-events', 'en'),
  NAZ('bilesuserviss', 'Biļešu Serviss', ['LV'], 'https://www.bilesuserviss.lv/eng/', 'en'),
  NAZ('piletilevi_ee', 'Piletilevi', ['EE'], 'https://www.piletilevi.ee/est/piletid/', 'et', 'entrambi'),
  { id: 'concert_ua', nome: 'Concert.ua', paesi: ['UA'], tipo: 'eventi', url: 'https://concert.ua/en/{citta}', lingua: 'en', rigorosa: true },
  { id: 'afisha_msk', nome: 'Afisha (Mosca)', paesi: ['RU'], tipo: 'mostre', url: 'https://www.afisha.ru/msk/exhibitions/', lingua: 'ru', citta: ['moscow', 'mosca', 'москва'] },
  { id: 'afisha_spb', nome: 'Afisha (San Pietroburgo)', paesi: ['RU'], tipo: 'mostre', url: 'https://www.afisha.ru/spb/exhibitions/', lingua: 'ru', citta: ['saint petersburg', 'san pietroburgo', 'санкт-петербург'] },
  AG('mos_afisha', 'Afisha mos.ru', 'RU', ['moscow', 'mosca', 'москва'], 'https://bilet.mos.ru/', 'ru'),
  { id: 'kudago', nome: 'KudaGo', paesi: ['RU'], tipo: 'entrambi', api: true, url: 'https://kudago.com/public-api/v1.4/events/', lingua: 'ru' },

  // ── BALCANI, GRECIA, TURCHIA, CIPRO, CAUCASO
  NAZ('ulaznice_hr', 'Ulaznice.hr', ['HR'], 'https://www.ulaznice.hr/web/events', 'hr'),
  AG('visit_ljubljana', 'Visit Ljubljana', 'SI', ['ljubljana', 'lubiana'], 'https://www.visitljubljana.com/en/visitors/events/', 'en'),
  NAZ('karti_mk', 'Karti.com.mk', ['MK'], 'https://www.karti.com.mk/', 'mk'),
  AG('visit_tirana', 'Visit Tirana', 'AL', ['tirana', 'tirane'], 'https://www.visit-tirana.com/events/', 'en', 'eventi'),
  AG('this_is_athens', 'This is Athens', 'GR', ['athens', 'atene', 'αθήνα', 'athina'], 'https://www.thisisathens.org/events', 'en'),
  NAZ('ticketservices_gr', 'Ticket Services', ['GR'], 'https://www.ticketservices.gr/', 'el'),
  { id: 'biletix_tr', nome: 'Biletix', paesi: ['TR'], tipo: 'eventi', url: 'https://www.biletix.com/anasayfa/TURKIYE/tr', lingua: 'tr', rigorosa: true },
  { id: 'bubilet', nome: 'Bubilet', paesi: ['TR'], tipo: 'eventi', url: 'https://www.bubilet.com.tr/{citta_locale}', lingua: 'tr', nomeCitta: 'locale' },
  NAZ('tomsarkgh', 'Tomsarkgh', ['AM'], 'https://www.tomsarkgh.am/en', 'en'),
  NAZ('showshappening', 'Showshappening', ['MT'], 'https://www.showshappening.com/search?showall=true&sortby=LatestEvents', 'en'),

  // ── STATI UNITI E CANADA
  { id: 'artrabbit_us', nome: 'ArtRabbit', paesi: ['US'], tipo: 'mostre', url: 'https://www.artrabbit.com/all-listings/united-states/{citta}', lingua: 'en' },
  { id: 'artrabbit_ca', nome: 'ArtRabbit', paesi: ['CA'], tipo: 'mostre', url: 'https://www.artrabbit.com/all-listings/canada/{citta}', lingua: 'en' },
  { id: 'ticketweb_us', nome: 'TicketWeb', paesi: ['US'], tipo: 'eventi', url: 'https://www.ticketweb.com/search?q={citta_raw}', lingua: 'en', rigorosa: true },
  { id: 'ticketweb_ca', nome: 'TicketWeb CA', paesi: ['CA'], tipo: 'eventi', url: 'https://www.ticketweb.ca/search?q={citta_raw}', lingua: 'en', rigorosa: true },
  NAZ('akimbo', 'Akimbo', ['CA'], 'https://akimbo.ca/listings/?fwp_listing_type=exhibitions', 'en', 'mostre'),
  AG('nyc_tourism', 'NYC Tourism', 'US', ['new york', 'new york city', 'nyc'], 'https://www.nyctourism.com/events/', 'en', 'eventi'),
  AG('discover_la', 'Discover LA', 'US', ['los angeles'], 'https://www.discoverlosangeles.com/events', 'en', 'eventi'),
  AG('washington_dc', 'Destination DC', 'US', ['washington', 'washington dc', 'washington, d.c.'], 'https://washington.org/find-dc-listings/events', 'en', 'eventi'),
  AG('boston_city', 'City of Boston', 'US', ['boston'], 'https://www.boston.gov/events', 'en', 'eventi'),
  AG('neworleans_cvb', 'New Orleans & Co', 'US', ['new orleans'], 'https://www.neworleans.com/events/', 'en', 'eventi'),
  AG('visit_seattle', 'Visit Seattle', 'US', ['seattle'], 'https://visitseattle.org/events/', 'en', 'eventi'),
  AG('montreal_ville', 'Ville de Montréal', 'CA', ['montreal'], 'https://montreal.ca/evenements', 'fr', 'eventi'),

  // ── AMERICA LATINA E CARAIBI
  TM('MX', 'com.mx', 'es', 'locale'),
  TM('CO', 'co', 'es'),
  TM('CL', 'cl', 'es'),
  TM('PE', 'pe', 'es'),
  AG('timeout_mx_arte', 'Time Out México arte', 'MX', ['mexico city', 'ciudad de mexico', 'citta del messico', 'cdmx'], 'https://www.timeoutmexico.mx/ciudad-de-mexico/arte/exposiciones-en-la-cdmx', 'es', 'mostre'),
  NAZ('tuentrada', 'TuEntrada', ['AR'], 'https://www.tuentrada.com/', 'es', 'entrambi'),
  AG('ba_turismo', 'Turismo Buenos Aires', 'AR', ['buenos aires'], 'https://turismo.buenosaires.gob.ar/es/eventos', 'es', 'eventi'),
  NAZ('arte_online', 'arte-online.net', ['AR'], 'https://www.arte-online.net/Agenda/Exposiciones_Muestras', 'es', 'mostre'),
  NAZ('puntoticket', 'PuntoTicket', ['CL'], 'https://www.puntoticket.com/', 'es'),
  NAZ('teleticket', 'Teleticket', ['PE'], 'https://www.teleticket.com.pe/', 'es'),
  NAZ('tuboleta', 'TuBoleta', ['CO'], 'https://tuboleta.com/', 'es'),
  AG('bogota_agenda', 'Alcaldía de Bogotá', 'CO', ['bogota'], 'https://bogota.gov.co/que-hacer/agenda-cultural', 'es', 'eventi'),
  NAZ('buenplan', 'BuenPlan', ['EC'], 'https://www.buenplan.com.ec/', 'es'),
  NAZ('tickantel', 'Tickantel', ['UY'], 'https://www.tickantel.com.uy/inicio/', 'es', 'entrambi'),
  AG('montevideo_eventos', 'Intendencia de Montevideo', 'UY', ['montevideo'], 'https://eventos.montevideo.gub.uy/', 'es', 'eventi'),
  NAZ('cusica_ve', 'Cusica', ['VE'], 'https://www.cusica.com/', 'es'),
  NAZ('ticketerani', 'TicketeraNI', ['NI'], 'https://ticketerani.com/', 'es'),
  NAZ('smartticket_sv', 'Smart Ticket', ['SV'], 'https://www.smartticket.fun/es', 'es'),
  NAZ('islandetickets', 'Island E-Tickets', ['BB', 'TT', 'BS', 'KN'], 'https://islandetickets.com/', 'en'),
  NAZ('guadeloupe_agenda', 'Guadeloupe Islands', ['GP'], 'https://www.guadeloupe-islands.com/agenda/', 'fr', 'entrambi'),

  // ── ASIA
  { id: 'walkerplus', nome: 'Walkerplus', paesi: ['JP'], tipo: 'entrambi', url: 'https://www.walkerplus.com/event_list/', lingua: 'ja', rigorosa: true },
  AG('go_tokyo', 'GO TOKYO', 'JP', ['tokyo', '東京'], 'https://www.gotokyo.org/en/event/index.html', 'en'),
  AG('kyoto_kankou', '京都府観光連盟', 'JP', ['kyoto', '京都'], 'https://www.kyoto-kankou.or.jp/event', 'ja'),
  { id: 'tokyoartbeat', nome: 'Tokyo Art Beat', paesi: ['JP'], tipo: 'mostre', url: 'https://www.tokyoartbeat.com/events/', lingua: 'ja', citta: ['tokyo', '東京'] },
  { id: 'interpark_kr', nome: 'Interpark', paesi: ['KR'], tipo: 'eventi', url: 'https://tickets.interpark.com/', lingua: 'ko', rigorosa: true },
  AG('visit_beijing', 'Visit Beijing', 'CN', ['beijing', 'pechino', '北京'], 'https://english.visitbeijing.com.cn/events', 'en'),
  AG('thebeijinger', 'The Beijinger', 'CN', ['beijing', 'pechino', '北京'], 'https://www.thebeijinger.com/events', 'en'),
  AG('smartshanghai', 'SmartShanghai', 'CN', ['shanghai', '上海'], 'https://www.smartshanghai.com/events/', 'en'),
  AG('macao_tourism', 'Macao Tourism', 'MO', ['macao', 'macau'], 'https://www.macaotourism.gov.mo/en/events/calendar', 'en', 'eventi'),
  NAZ('indievox', 'iNDIEVOX', ['TW'], 'https://www.indievox.com/activity/list', 'zh'),
  AG('visit_hcmc', 'Visit HCMC', 'VN', ['ho chi minh city', 'ho chi minh', 'saigon', 'thanh pho ho chi minh'], 'https://visithcmc.vn/en/events', 'en'),
  AG('love_bali', 'Love Bali', 'ID', ['bali', 'denpasar', 'ubud'], 'https://lovebali.baliprov.go.id/event', 'en', 'eventi'),
  NAZ('ticketnet_ph', 'TicketNet', ['PH'], 'https://www.ticketnet.com.ph/', 'en'),
  NAZ('incredible_india', 'Incredible India', ['IN'], 'https://www.incredibleindia.gov.in/en/festivals-and-events', 'en'),
  NAZ('srilanka_events', 'Sri Lanka Events', ['LK'], 'https://srilankaevents.lk/', 'en', 'entrambi'),
  NAZ('ntb_nepal', 'Nepal Tourism Board', ['NP'], 'https://ntb.gov.np/en/event-search', 'en'),
  NAZ('visit_maldives_events', 'Visit Maldives', ['MV'], 'https://events.visitmaldives.com/', 'en'),
  { id: 'sxodim', nome: 'Sxodim', paesi: ['KZ'], tipo: 'entrambi', url: 'https://sxodim.com/{citta}', lingua: 'ru' },
  NAZ('ticket_kg', 'Ticket.kg', ['KG'], 'https://ticket.kg/', 'ru'),

  // ── MEDIO ORIENTE E NORD AFRICA
  { id: 'platinumlist', nome: 'Platinumlist', paesi: ['AE', 'SA', 'QA', 'BH', 'OM', 'EG'], tipo: 'eventi', url: 'https://{citta}.platinumlist.net/', lingua: 'en', rigorosa: true }, // era fisso su Dubai per 7 paesi
  TM('AE', 'ae', 'en'),
  AG('visit_abu_dhabi', 'Visit Abu Dhabi', 'AE', ['abu dhabi'], 'https://visitabudhabi.ae/en/events', 'en'),
  AG('visit_qatar', 'Visit Qatar', 'QA', ['doha'], 'https://www.visitqatar.com/intl-en/events-calendar', 'en'),
  AG('experience_oman', 'Experience Oman', 'OM', ['muscat', 'mascate'], 'https://experienceoman.om/events', 'en'),
  NAZ('calendar_jo', 'Jordan Calendar', ['JO'], 'https://calendar.jo/', 'en'),
  NAZ('experience_egypt', 'Experience Egypt', ['EG'], 'https://www.experienceegypt.eg/en/events', 'en'),
  NAZ('ticketsmarche', 'Ticketsmarche', ['EG'], 'https://www.ticketsmarche.com/', 'en'),
  NAZ('teskerti', 'Teskerti', ['TN'], 'https://www.teskerti.tn/', 'fr'),
  AG('visit_casablanca', 'Visit Casablanca', 'MA', ['casablanca'], 'https://visitcasablanca.ma/evenements', 'fr', 'eventi'),
  AG('visit_marrakech', 'Visit Marrakech', 'MA', ['marrakech', 'marrakesh'], 'https://visitmarrakech.com/en/events/', 'en', 'eventi'),

  // ── AFRICA SUBSAHARIANA E OCEANO INDIANO
  TM('ZA', 'co.za', 'en'),
  NAZ('mookh', 'Mookh', ['KE'], 'https://mookh.com/', 'en'),
  NAZ('otayo', 'Otayo', ['MU'], 'https://www.otayo.com/', 'fr'),
  NAZ('monticket_re', 'MonTicket', ['RE'], 'https://www.monticket.re/', 'fr', 'entrambi'),
  NAZ('madatsara', 'Madatsara', ['MG'], 'https://madatsara.com/', 'fr'),
  NAZ('webtickets_bw', 'Webtickets Botswana', ['BW'], 'https://www.webtickets.co.bw/v2/', 'en'),
  NAZ('webtickets_na', 'Webtickets Namibia', ['NA'], 'https://www.webtickets.com.na/v2/', 'en'),
  NAZ('ausenegal_agenda', 'Au-Sénégal agenda', ['SN'], 'https://au-senegal.com/-agenda-144-.html', 'fr', 'entrambi'),
  NAZ('tikerama', 'Tikerama', ['CI', 'BF', 'BJ', 'TG', 'ML', 'CM', 'GA', 'GN'], 'https://tikerama.com/', 'fr'),

  // ── OCEANIA
  TM('AU', 'com.au', 'en'),
  TM('NZ', 'co.nz', 'en'),
  { id: 'concreteplayground', nome: 'Concrete Playground', paesi: ['AU'], tipo: 'entrambi', url: 'https://concreteplayground.com/{citta}/events', lingua: 'en' },
  { id: 'art_almanac', nome: 'Art Almanac', paesi: ['AU'], tipo: 'mostre', url: 'https://www.art-almanac.com.au/whats-on/{citta}/', lingua: 'en', citta: ['sydney', 'melbourne'] },
  AG('sydney_whatson', 'City of Sydney What\'s On', 'AU', ['sydney'], 'https://whatson.cityofsydney.nsw.gov.au/', 'en'),
  AG('melbourne_whatson', 'What\'s On Melbourne', 'AU', ['melbourne'], 'https://whatson.melbourne.vic.gov.au/', 'en'),
  AG('visit_perth', 'Visit Perth', 'AU', ['perth'], 'https://www.visitperth.com/events', 'en', 'eventi'),
  AG('auckland_nz', 'Auckland Unlimited', 'NZ', ['auckland'], 'https://www.aucklandnz.com/events', 'en'),
  NAZ('ticketpacific_pf', 'Ticket Pacific Polynésie', ['PF'], 'https://www.ticket-pacific.pf/index-css5-ticketpacificpf-pg1.html', 'fr'),
  NAZ('ticketpacific_nc', 'Ticket Pacific Nouvelle-Calédonie', ['NC'], 'https://www.ticket-pacific.nc/index-css5-ticketpacificnc-pg1.html', 'fr'),
  // ── STATI UNITI (verificate 25/11/2026) ───────────────────────────────────
  // API e feed
  { id: 'artic_mostre', nome: 'Art Institute of Chicago (API mostre)', paesi: ['US'], tipo: 'mostre', lingua: 'en', citta: ['chicago'], formato: 'json', vicino: { lat: 41.8796, lon: -87.6237, km: 25 },
    url: 'https://api.artic.edu/api/v1/exhibitions/search?query[range][aic_end_at][gte]={oggi}&limit=100&fields=title,aic_start_at,aic_end_at,web_url,gallery_title,short_description',
    campi: { elenco: 'data', titolo: 'title', dal: 'aic_start_at', al: 'aic_end_at', luogo: 'gallery_title', url: 'web_url', descrizione: 'short_description' }, licenza: 'API pubblica AIC, dati CC0' },
  { id: 'artic_eventi', nome: 'Art Institute of Chicago (API eventi)', paesi: ['US'], tipo: 'eventi', lingua: 'en', citta: ['chicago'], formato: 'json', vicino: { lat: 41.8796, lon: -87.6237, km: 25 },
    url: 'https://api.artic.edu/api/v1/events/search?query[range][start_date][gte]={oggi}&limit=100&fields=title,start_date,end_date,location,web_url,short_description',
    campi: { elenco: 'data', titolo: 'title', dal: 'start_date', al: 'end_date', luogo: 'location', url: 'web_url', descrizione: 'short_description' }, licenza: 'API pubblica AIC, dati CC0' },
  { id: 'smithsonian_rss', nome: 'Smithsonian events', paesi: ['US'], tipo: 'entrambi', lingua: 'en', citta: ['washington', 'washington dc', 'washington, d.c.'], formato: 'rss', vicino: { lat: 38.8888, lon: -77.026, km: 30 },
    url: 'https://www.trumba.com/calendars/smithsonian-events.rss' },
  // The Events Calendar
  TRIBE('vermont_tribe', 'Vermont Vacation', 'US', 'www.visitvermont.com', ['burlington', 'stowe', 'montpelier', 'woodstock', 'manchester', 'brattleboro'], 44.0, -72.7, 130, 'entrambi', true),
  TRIBE('laketahoe_tribe', 'Visit Lake Tahoe', 'US', 'www.visitlaketahoe.com', ['south lake tahoe', 'lake tahoe', 'stateline'], 38.94, -119.98, 40),
  TRIBE('mendocino_tribe', 'Visit Mendocino County', 'US', 'www.visitmendocino.com', ['mendocino', 'fort bragg', 'ukiah', 'gualala'], 39.3077, -123.7995, 70, 'entrambi', true),
  TRIBE('downtown_seattle', 'Downtown Seattle Association', 'US', 'downtownseattle.org', ['seattle'], 47.6062, -122.3321, 10),
  TRIBE('centercity_phila', 'Center City District Philadelphia', 'US', 'www.centercityphila.org', ['philadelphia', 'filadelfia'], 39.9526, -75.1652, 10),
  TRIBE('balboa_park', 'Balboa Park', 'US', 'www.balboapark.org', ['san diego'], 32.7341, -117.1446, 15),
  TRIBE('coronado_tribe', 'Coronado Visitor Center', 'US', 'www.coronadovisitorcenter.com', ['coronado'], 32.6859, -117.1831, 8),
  TRIBE('the_bass', 'The Bass Museum', 'US', 'www.thebass.org', ['miami beach', 'miami'], 25.7952, -80.13, 15),
  TRIBE('dali_museum', 'The Dalí Museum', 'US', 'www.thedali.org', ['st. petersburg', 'saint petersburg', 'st petersburg', 'tampa'], 27.766, -82.6312, 25),
  TRIBE('frost_science', 'Frost Science Museum', 'US', 'www.frostscience.org', ['miami'], 25.785, -80.1867, 20),
  TRIBE('mass_moca', 'MASS MoCA', 'US', 'www.massmoca.org', ['north adams', 'williamstown'], 42.7009, -73.1152, 40),
  TRIBE('portland_museum_me', 'Portland Museum of Art', 'US', 'www.portlandmuseum.org', ['portland'], 43.6537, -70.2626, 25), // Portland, Maine: vale solo per posizione
  TRIBE('ogden_museum', 'Ogden Museum of Southern Art', 'US', 'www.ogdenmuseum.org', ['new orleans'], 29.9437, -90.0716, 20),
  TRIBE('chicago_history', 'Chicago History Museum', 'US', 'www.chicagohistory.org', ['chicago'], 41.9119, -87.6315, 20),
  TRIBE('savannah_music', 'Savannah Music Festival', 'US', 'www.savannahmusicfestival.org', ['savannah'], 32.0809, -81.0912, 20, 'eventi'),
  TRIBE('mohai', 'MOHAI Seattle', 'US', 'www.mohai.org', ['seattle'], 47.6276, -122.3366, 15),
  TRIBE('descanso_gardens', 'Descanso Gardens', 'US', 'www.descansogardens.org', ['los angeles', 'pasadena', 'la canada flintridge'], 34.2016, -118.2105, 25),
  TRIBE('griffith_obs', 'Griffith Observatory', 'US', 'www.griffithobservatory.org', ['los angeles', 'hollywood'], 34.1184, -118.3004, 30, 'eventi'),
  TRIBE('flatiron_nomad', 'Flatiron NoMad Partnership', 'US', 'www.flatironnomad.nyc', ['new york', 'new york city', 'nyc'], 40.7411, -73.9897, 8, 'eventi'),
  TRIBE('yosemite_mariposa', 'Yosemite Mariposa County Tourism', 'US', 'www.yosemite.com', ['yosemite', 'mariposa', 'el portal', 'oakhurst'], 37.4849, -119.9663, 60),
  TRIBE('leavenworth_tribe', 'Leavenworth Chamber', 'US', 'www.leavenworth.org', ['leavenworth'], 47.5962, -120.6615, 25),
  TRIBE('olympic_peninsula', 'Olympic Peninsula', 'US', 'www.olympicpeninsula.org', ['port angeles', 'sequim', 'port townsend', 'forks'], 47.95, -123.6, 120, 'entrambi', true),
  TRIBE('pigeon_forge', 'My Pigeon Forge', 'US', 'www.mypigeonforge.com', ['pigeon forge', 'gatlinburg', 'sevierville'], 35.7884, -83.5543, 25),
  TRIBE('st_augustine_oldcity', 'OldCity.com St. Augustine', 'US', 'www.oldcity.com', ['st. augustine', 'saint augustine', 'st augustine'], 29.8946, -81.3145, 25),
  TRIBE('amelia_island', 'Amelia Island CVB', 'US', 'www.ameliaisland.com', ['fernandina beach', 'amelia island'], 30.6697, -81.4626, 25),
  TRIBE('jekyll_island', 'Jekyll Island', 'US', 'www.jekyllisland.com', ['jekyll island', 'brunswick', 'st. simons island'], 31.067, -81.4212, 25),
  TRIBE('salem_ma', 'Destination Salem', 'US', 'www.salem.org', ['salem'], 42.5195, -70.8967, 15), // Salem MA: per posizione (Salem, Oregon è un'altra)
  TRIBE('plymouth_ma', 'See Plymouth', 'US', 'www.seeplymouth.com', ['plymouth'], 41.9584, -70.6673, 25),
  // Calendari comunali CivicPlus (solo eventi pubblici; riunioni e chiusure escluse)
  CIVICPLUS('civicplus_fredericksburg_tx', 'City of Fredericksburg TX', 'www.fbgtx.org', ['fredericksburg'], 30.2752, -98.872),
  CIVICPLUS('civicplus_healdsburg', 'City of Healdsburg', 'www.healdsburg.gov', ['healdsburg'], 38.6105, -122.8692),
  CIVICPLUS('civicplus_durango', 'City of Durango', 'www.durangoco.gov', ['durango'], 37.2753, -107.8801),
  CIVICPLUS('civicplus_annapolis', 'City of Annapolis', 'www.annapolis.gov', ['annapolis'], 38.9784, -76.4922),
  CIVICPLUS('civicplus_natchez', 'City of Natchez', 'www.natchez.ms.us', ['natchez'], 31.5604, -91.4032),
  CIVICPLUS('civicplus_williamsburg', 'City of Williamsburg', 'www.williamsburgva.gov', ['williamsburg'], 37.2707, -76.7075),
  CIVICPLUS('civicplus_beverly_hills', 'City of Beverly Hills', 'www.beverlyhills.org', ['beverly hills', 'los angeles'], 34.0736, -118.4004),
  // Calendari universitari pubblici (Localist): musei universitari, concerti, conferenze aperte
  LOCALIST('localist_utexas', 'UT Austin calendar', 'calendar.utexas.edu', ['austin'], 30.2849, -97.7341),
  LOCALIST('localist_colorado', 'CU Boulder calendar', 'calendar.colorado.edu', ['boulder'], 40.0076, -105.2659),
  LOCALIST('localist_mit', 'MIT calendar', 'calendar.mit.edu', ['cambridge', 'boston'], 42.3601, -71.0942),
  LOCALIST('localist_stanford', 'Stanford events', 'events.stanford.edu', ['stanford', 'palo alto'], 37.4275, -122.1697),
  LOCALIST('localist_umiami', 'University of Miami events', 'events.miami.edu', ['coral gables', 'miami'], 25.7215, -80.2793),
  LOCALIST('localist_lsu', 'LSU calendar', 'calendar.lsu.edu', ['baton rouge'], 30.4133, -91.18),
  // Pagine con schema.org Event (JSON-LD)
  PAG('visit_denver', 'Visit Denver', 'US', ['denver'], 'https://www.denver.org/events/', 39.7392, -104.9903, 25, 'entrambi', 'jsonld'),
  PAG('visit_austin', 'Visit Austin', 'US', ['austin'], 'https://www.austintexas.org/events/', 30.2672, -97.7431, 25, 'entrambi', 'jsonld'),
  // Pagine HTML lette dall'estrattore (≥ 3 eventi futuri senza AI)
  PAG('cl_tampa', 'Creative Loafing Tampa Bay', 'US', ['tampa', 'st. petersburg'], 'https://www.cltampa.com/tampa/EventSearch', 27.9506, -82.4572, 30, 'eventi'),
  PAG('cleveland_scene', 'Cleveland Scene', 'US', ['cleveland'], 'https://www.clevescene.com/cleveland/EventSearch', 41.4993, -81.6944, 30, 'eventi'),
  PAG('wwoz_livewire', 'WWOZ Livewire (musica dal vivo)', 'US', ['new orleans'], 'https://www.wwoz.org/calendar/livewire-music', 29.9511, -90.0715, 25, 'eventi'),
  PAG('explore_charleston', 'Explore Charleston', 'US', ['charleston'], 'https://www.explorecharleston.com/events/', 32.7765, -79.9311, 30),
  PAG('hammer_museum', 'Hammer Museum', 'US', ['los angeles'], 'https://hammer.ucla.edu/exhibitions', 34.0596, -118.4434, 25, 'mostre'),
  PAG('whitney', 'Whitney Museum', 'US', ['new york', 'new york city', 'nyc'], 'https://whitney.org/exhibitions', 40.7396, -74.0089, 15, 'mostre'),
  PAG('mfa_boston', 'Museum of Fine Arts Boston', 'US', ['boston', 'cambridge'], 'https://www.mfa.org/exhibitions', 42.3394, -71.094, 20, 'mostre'),
  PAG('gardner_museum', 'Isabella Stewart Gardner Museum', 'US', ['boston', 'cambridge'], 'https://www.gardnermuseum.org/experience/exhibitions', 42.3382, -71.0991, 20, 'mostre'),
  PAG('sd_museum_art', 'San Diego Museum of Art', 'US', ['san diego'], 'https://www.sdmart.org/exhibitions/', 32.7319, -117.1503, 20, 'mostre'),
  PAG('noma', 'New Orleans Museum of Art', 'US', ['new orleans'], 'https://noma.org/exhibitions/', 29.9865, -90.0934, 20, 'mostre'),
  PAG('denver_art_museum', 'Denver Art Museum', 'US', ['denver'], 'https://www.denverartmuseum.org/en/exhibitions', 39.7372, -104.9893, 25, 'mostre'),
  PAG('orlando_museum_art', 'Orlando Museum of Art', 'US', ['orlando'], 'https://omart.org/exhibitions/', 28.5724, -81.3654, 25, 'mostre'),
  PAG('frist_art', 'Frist Art Museum', 'US', ['nashville'], 'https://fristartmuseum.org/exhibitions/', 36.1579, -86.784, 25, 'mostre'),
  PAG('blanton', 'Blanton Museum of Art', 'US', ['austin'], 'https://blantonmuseum.org/exhibitions/', 30.2808, -97.7375, 25, 'mostre'),
  PAG('lincoln_center', 'Lincoln Center', 'US', ['new york', 'new york city', 'nyc'], 'https://www.lincolncenter.org/calendar', 40.7725, -73.9835, 15, 'eventi'),
  PAG('laist_events', 'LAist events', 'US', ['los angeles'], 'https://laist.com/events', 34.0522, -118.2437, 30, 'eventi'),
  PAG('ryman', 'Ryman Auditorium', 'US', ['nashville'], 'https://www.ryman.com/events', 36.1612, -86.7785, 20, 'eventi'),
  PAG('austin_library', 'Austin Public Library', 'US', ['austin'], 'https://library.austintexas.gov/events', 30.2672, -97.7431, 20, 'eventi'),
  PAG('sandiego_city', 'City of San Diego events', 'US', ['san diego'], 'https://www.sandiego.gov/events', 32.7157, -117.1611, 25, 'eventi'),
  PAG('wharf_dc', 'The Wharf DC', 'US', ['washington', 'washington dc', 'washington, d.c.'], 'https://www.wharfdc.com/upcoming-events/', 38.879, -77.0234, 10, 'eventi'),
  // Solo AI (date future nel testo, l'estrattore senza AI non le separa)
  PAG('lacma', 'LACMA', 'US', ['los angeles'], 'https://www.lacma.org/art/exhibitions/current', 34.0639, -118.3592, 25, 'mostre'),
  PAG('barnes', 'Barnes Foundation', 'US', ['philadelphia', 'filadelfia'], 'https://www.barnesfoundation.org/whats-on', 39.9606, -75.1727, 20),
  PAG('sfpl', 'San Francisco Public Library', 'US', ['san francisco'], 'https://sfpl.org/events', 37.7786, -122.4158, 15, 'eventi'),
  PAG('exploratorium', 'Exploratorium', 'US', ['san francisco'], 'https://www.exploratorium.edu/visit/calendar', 37.8017, -122.3973, 15, 'eventi'),
  PAG('brooklyn_bridge_park', 'Brooklyn Bridge Park', 'US', ['new york', 'new york city', 'nyc', 'brooklyn'], 'https://www.brooklynbridgepark.org/events/', 40.7003, -73.9967, 10, 'eventi'),
  PAG('sf_station', 'SF Station', 'US', ['san francisco'], 'https://www.sfstation.com/calendar', 37.7749, -122.4194, 20, 'eventi'),
  PAG('orlando_city', 'City of Orlando events', 'US', ['orlando'], 'https://www.orlando.gov/Events', 28.5383, -81.3792, 20, 'eventi'),
  PAG('country_music_hof', 'Country Music Hall of Fame', 'US', ['nashville'], 'https://www.countrymusichalloffame.org/calendar', 36.1582, -86.776, 20),
  PAG('high_line', 'The High Line', 'US', ['new york', 'new york city', 'nyc'], 'https://www.thehighline.org/events/', 40.748, -74.0048, 10, 'eventi'),

// ── CANADA (verificate 25/11/2026) ────────────────────────────────────────
  PAG('vancouver_art_gallery', 'Vancouver Art Gallery', 'CA', ['vancouver'], 'https://www.vanartgallery.bc.ca/exhibitions/', 49.2829, -123.1207, 20, 'mostre'),
  PAG('mbam', 'Musée des beaux-arts de Montréal', 'CA', ['montreal', 'montréal'], 'https://www.mbam.qc.ca/en/exhibitions/', 45.4986, -73.5794, 25, 'mostre'),
  PAG('tourism_jasper', 'Tourism Jasper', 'CA', ['jasper'], 'https://www.jasper.travel/events/', 52.8737, -118.0814, 40),
  PAG('tourism_kelowna', 'Tourism Kelowna', 'CA', ['kelowna'], 'https://www.tourismkelowna.com/events/', 49.888, -119.496, 30),
  // solo AI
  PAG('explore_canmore', 'Explore Canmore', 'CA', ['canmore'], 'https://www.explorecanmore.ca/events', 51.0884, -115.3479, 20),
  PAG('niagara_falls_tourism', 'Niagara Falls Tourism', 'CA', ['niagara falls'], 'https://www.niagarafallstourism.com/events/', 43.0896, -79.0849, 20),
  PAG('whistler_events', 'Tourism Whistler', 'CA', ['whistler'], 'https://www.whistler.com/events/', 50.1163, -122.9574, 25),
// ── RESTO DEL MONDO (fuori Europa e USA), ricerca del 25/11/2026: ogni pagina provata con scratch/prova-estrattore-html.mts
  // o col lettore del formato. «solo AI» = l'estrattore HTML dà < 3 schede ma il testo ha eventi futuri con data.
  // CANADA
  { id: 'ca_sit_quebec', nome: 'SIT Québec — événements (open data)', paesi: ['CA'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, formato: 'json',
    citta: ['montreal', 'quebec', 'quebec city', 'sherbrooke', 'gatineau', 'trois-rivieres', 'saguenay', 'laval', 'drummondville', 'granby', 'tadoussac', 'mont-tremblant', 'baie-saint-paul', 'levis', 'rimouski'],
    url: 'https://api-v3.tourinsoft.com/api/syndications/mto.tourinsoft.com/c6ab1c9e-f594-463e-b036-5a029197f3a9?format=json', // 8,6 MB; la versione CSV ha le date gg/mm lette come mm/gg: usare questa
    campi: { elenco: 'value', titolo: 'SyndicObjectName', dal: 'PeriodeOuvertures.0.Datedebut', al: 'PeriodeOuvertures.0.Datefin', luogo: 'Adresses.0.Municipalite', url: 'SiteInternets.0.Coordonnees' }, licenza: 'Données Québec (Ministère du Tourisme)' },
  { ...AG('ca_quebec_cite', 'Québec Cité — événements', 'CA', ['quebec', 'quebec city', 'québec'], 'https://www.quebec-cite.com/fr/evenements', 'fr', 'eventi'), vicino: { lat: 46.8139, lon: -71.208, km: 30 } },
  { ...AG('ca_mccord', 'Musée McCord Stewart', 'CA', ['montreal', 'montréal'], 'https://www.musee-mccord-stewart.ca/en/exhibitions/', 'en', 'mostre'), vicino: { lat: 45.5045, lon: -73.5735, km: 30 } },
  { ...AG('ca_moa_ubc', 'Museum of Anthropology UBC', 'CA', ['vancouver'], 'https://www.moa.ubc.ca/exhibitions/', 'en', 'entrambi'), vicino: { lat: 49.2694, lon: -123.2593, km: 30 } },
  { ...AG('ca_nac', 'National Arts Centre (Ottawa)', 'CA', ['ottawa', 'gatineau'], 'https://nac-cna.ca/en/calendar', 'en', 'eventi'), vicino: { lat: 45.4232, lon: -75.6944, km: 30 } }, // solo AI
  // AUSTRALIA
  { ...AG('au_agnsw', 'Art Gallery of New South Wales', 'AU', ['sydney'], 'https://www.artgallery.nsw.gov.au/whats-on/', 'en', 'mostre'), vicino: { lat: -33.8688, lon: 151.2173, km: 40 } },
  { ...AG('au_visitcanberra', 'VisitCanberra events', 'AU', ['canberra'], 'https://www.visitcanberra.com.au/events', 'en'), vicino: { lat: -35.2809, lon: 149.13, km: 40 } },
  { ...AG('au_acmi', 'ACMI', 'AU', ['melbourne'], 'https://www.acmi.net.au/whats-on/', 'en'), vicino: { lat: -37.818, lon: 144.9691, km: 40 } },
  { ...AG('au_timeout_melbourne', 'Time Out Melbourne', 'AU', ['melbourne'], 'https://www.timeout.com/melbourne/things-to-do/things-to-do-in-melbourne-this-weekend', 'en'), vicino: { lat: -37.8136, lon: 144.9631, km: 40 } },
  { ...AG('au_hota', 'HOTA Home of the Arts', 'AU', ['gold coast', 'surfers paradise'], 'https://www.hota.com.au/whats-on', 'en'), vicino: { lat: -28.0027, lon: 153.418, km: 40 } },
  { ...AG('au_adelaide_fc', 'Adelaide Festival Centre', 'AU', ['adelaide'], 'https://adelaidefestivalcentre.com.au/whats-on/', 'en', 'eventi'), vicino: { lat: -34.918, lon: 138.596, km: 30 } },
  { ...AG('au_agwa', 'Art Gallery of Western Australia', 'AU', ['perth'], 'https://artgallery.wa.gov.au/whats-on', 'en', 'mostre'), vicino: { lat: -31.9497, lon: 115.8605, km: 40 } },
  { ...AG('au_perth_festival', 'Perth Festival', 'AU', ['perth', 'fremantle'], 'https://www.perthfestival.com.au/', 'en', 'eventi'), vicino: { lat: -31.9523, lon: 115.8613, km: 40 } },
  { ...AG('au_wfac', 'Walyalup Fremantle Arts Centre', 'AU', ['fremantle', 'perth'], 'https://www.fac.org.au/whats-on/', 'en'), vicino: { lat: -32.045, lon: 115.752, km: 30 } },
  { ...NAZ('au_westernaustralia', 'Tourism Western Australia — events', ['AU'], 'https://www.westernaustralia.com/au/things-to-do/events', 'en'), citta: ['perth', 'fremantle', 'broome', 'margaret river', 'albany', 'busselton', 'bunbury', 'kalgoorlie', 'rottnest island', 'exmouth'] },
  { ...AG('au_qpac', 'QPAC Queensland Performing Arts Centre', 'AU', ['brisbane'], 'https://www.qpac.com.au/whats-on', 'en', 'eventi'), vicino: { lat: -27.4736, lon: 153.019, km: 40 } },
  { ...AG('au_brisbane_powerhouse', 'Brisbane Powerhouse', 'AU', ['brisbane'], 'https://brisbanepowerhouse.org/whats-on/', 'en', 'eventi'), vicino: { lat: -27.4682, lon: 153.0526, km: 40 } },
  { ...AG('au_museum_brisbane', 'Museum of Brisbane', 'AU', ['brisbane'], 'https://www.museumofbrisbane.com.au/whats-on/', 'en'), vicino: { lat: -27.4689, lon: 153.0235, km: 40 } }, // solo AI
  // NUOVA ZELANDA
  { ...AG('nz_christchurchnz', 'ChristchurchNZ what\'s on', 'NZ', ['christchurch'], 'https://www.christchurchnz.com/visit/whats-on', 'en'), vicino: { lat: -43.5321, lon: 172.6362, km: 40 } },
  { ...AG('nz_christchurch_gallery', 'Christchurch Art Gallery', 'NZ', ['christchurch'], 'https://christchurchartgallery.org.nz/exhibitions/', 'en', 'mostre'), vicino: { lat: -43.5309, lon: 172.6309, km: 40 } },
  { id: 'nz_queenstown', nome: 'Destination Queenstown events', paesi: ['NZ'], tipo: 'eventi', lingua: 'en', citta: ['queenstown', 'arrowtown', 'wanaka'], formato: 'jsonld',
    url: 'https://www.queenstownnz.co.nz/things-to-do/events/', vicino: { lat: -45.0312, lon: 168.6626, km: 50 } },
  { ...AG('nz_auckland_museum', 'Auckland War Memorial Museum', 'NZ', ['auckland'], 'https://www.aucklandmuseum.com/visit/whats-on', 'en'), vicino: { lat: -36.8604, lon: 174.7778, km: 40 } },
  { ...AG('nz_wellingtonnz', 'WellingtonNZ events', 'NZ', ['wellington'], 'https://www.wellingtonnz.com/visit/events', 'en'), vicino: { lat: -41.2865, lon: 174.7762, km: 40 } }, // solo AI
  { ...AG('nz_tepapa', 'Te Papa Tongarewa', 'NZ', ['wellington'], 'https://www.tepapa.govt.nz/visit/exhibitions', 'en', 'mostre'), vicino: { lat: -41.2905, lon: 174.7821, km: 40 } },
  { ...AG('nz_city_gallery', 'City Gallery Wellington', 'NZ', ['wellington'], 'https://citygallery.org.nz/exhibitions/', 'en', 'mostre'), vicino: { lat: -41.2889, lon: 174.7772, km: 40 } },
  // GIAPPONE
  { ...AG('jp_timeout_tokyo', 'Time Out Tokyo', 'JP', ['tokyo', '東京'], 'https://www.timeout.com/tokyo/things-to-do/things-to-do-in-tokyo-this-weekend', 'en'), vicino: { lat: 35.6762, lon: 139.6503, km: 40 } },
  { ...AG('jp_tokyocheapo', 'Tokyo Cheapo events', 'JP', ['tokyo', '東京'], 'https://www.tokyocheapo.com/events/', 'en'), vicino: { lat: 35.6762, lon: 139.6503, km: 40 } },
  { ...AG('jp_tobikan', 'Tokyo Metropolitan Art Museum', 'JP', ['tokyo', '東京'], 'https://www.tobikan.jp/en/exhibition/', 'en', 'mostre'), vicino: { lat: 35.7171, lon: 139.7727, km: 40 } },
  { ...AG('jp_nmwa', 'National Museum of Western Art', 'JP', ['tokyo', '東京'], 'https://www.nmwa.go.jp/en/exhibitions/current.html', 'en', 'mostre'), vicino: { lat: 35.7155, lon: 139.7757, km: 40 } },
  { id: 'jp_bigsight', nome: 'Tokyo Big Sight (open data)', paesi: ['JP'], tipo: 'eventi', lingua: 'ja', formato: 'csv', codifica: 'shift_jis', vicino: { lat: 35.6298, lon: 139.7942, km: 25 },
    url: 'https://www.opendata.metro.tokyo.lg.jp/tokyobigsight/tokyobigsighteventinformation.csv', // fiere e saloni (anche B2B)
    campi: { titolo: '展示会名', dal: '会期(開始)', al: '会期(終了)', luogo: '利用施設', url: 'URL', descrizione: '内容' }, licenza: 'CC BY 4.0 (Tokyo Open Data)' },
  { ...AG('jp_kyohaku', 'Kyoto National Museum', 'JP', ['kyoto', '京都'], 'https://www.kyohaku.go.jp/eng/exhibitions/', 'en', 'mostre'), vicino: { lat: 34.99, lon: 135.7727, km: 30 } },
  { ...AG('jp_fukuoka_now', 'Fukuoka Now events', 'JP', ['fukuoka', '福岡'], 'https://www.fukuoka-now.com/en/event/', 'en'), vicino: { lat: 33.5902, lon: 130.4017, km: 40 } }, // solo AI (date senza anno)
  { ...AG('jp_sapporo_travel', 'Sapporo Travel events', 'JP', ['sapporo', '札幌'], 'https://www.sapporo.travel/en/event/', 'en', 'eventi'), vicino: { lat: 43.0618, lon: 141.3545, km: 40 } }, // solo AI
  { id: 'jp_amami', nome: 'Amami (open data)', paesi: ['JP'], tipo: 'eventi', lingua: 'ja', formato: 'csv', vicino: { lat: 28.3772, lon: 129.4938, km: 30 },
    url: 'https://data.bodik.jp/dataset/6c7175c7-a8c9-43cb-9ee0-5b0db7460996/resource/623c1dad-d102-4fcc-a442-74abb4677bdb/download/amami_events.csv',
    campi: { titolo: 'Event', dal: 'Date', luogo: 'Location' }, licenza: 'open data comunale (BODIK)' },
  NAZ('jp_japan_guide', 'japan-guide.com festivals', ['JP'], 'https://www.japan-guide.com/e/e2063.html', 'en'),
  NAZ('jp_japancheapo', 'Japan Cheapo events', ['JP'], 'https://www.japancheapo.com/events/', 'en'),
  // COREA DEL SUD
  { ...AG('kr_museum_go', '국립중앙박물관 (National Museum of Korea)', 'KR', ['seoul', '서울'], 'https://www.museum.go.kr/site/main/exhiSpecialTheme/list/current', 'ko', 'mostre'), vicino: { lat: 37.524, lon: 126.9803, km: 30 } },
  // HONG KONG, CINA
  { ...AG('hk_mplus', 'M+ museum', 'HK', ['hong kong', '香港'], 'https://www.mplus.org.hk/en/exhibitions/', 'en', 'mostre'), vicino: { lat: 22.3017, lon: 114.1595, km: 40 } }, // solo AI
  { ...AG('hk_cheapo', 'Hong Kong Cheapo events', 'HK', ['hong kong', '香港'], 'https://www.hongkongcheapo.com/events/', 'en'), vicino: { lat: 22.3193, lon: 114.1694, km: 40 } },
  { ...AG('hk_timeout', 'Time Out Hong Kong', 'HK', ['hong kong', '香港'], 'https://www.timeout.com/hong-kong/things-to-do/things-to-do-in-hong-kong-this-weekend', 'en'), vicino: { lat: 22.3193, lon: 114.1694, km: 40 } },
  { ...AG('cn_shanghai_museum', 'Shanghai Museum', 'CN', ['shanghai', '上海'], 'https://www.shanghaimuseum.net/mu/frontend/pg/en/index', 'en', 'mostre'), vicino: { lat: 31.2304, lon: 121.4737, km: 50 } }, // solo AI
  // SINGAPORE, THAILANDIA, INDIA
  { ...AG('sg_timeout', 'Time Out Singapore', 'SG', ['singapore'], 'https://www.timeout.com/singapore/things-to-do/things-to-do-in-singapore-this-weekend', 'en'), vicino: { lat: 1.3521, lon: 103.8198, km: 40 } },
  { ...AG('sg_sam', 'Singapore Art Museum', 'SG', ['singapore'], 'https://www.singaporeartmuseum.sg/art-events', 'en', 'mostre'), vicino: { lat: 1.2903, lon: 103.8519, km: 40 } }, // solo AI
  { ...AG('th_chiangmai_citylife', 'Chiang Mai CityLife', 'TH', ['chiang mai', 'เชียงใหม่'], 'https://www.chiangmaicitylife.com/events/', 'en'), vicino: { lat: 18.7883, lon: 98.9853, km: 40 } }, // solo AI
  { ...AG('th_jim_thompson', 'Jim Thompson Art Center', 'TH', ['bangkok', 'กรุงเทพมหานคร', 'krung thep'], 'https://www.jimthompsonartcenter.org/exhibitions', 'en', 'mostre'), vicino: { lat: 13.7493, lon: 100.5282, km: 40 } }, // solo AI
  { ...AG('in_bic', 'Bangalore International Centre', 'IN', ['bengaluru', 'bangalore'], 'https://www.bangaloreinternationalcentre.org/events/', 'en', 'eventi'), vicino: { lat: 12.961, lon: 77.6387, km: 40 } }, // solo AI
  // QATAR, EMIRATI
  { id: 'qa_marhaba', nome: 'Marhaba Qatar events', paesi: ['QA'], tipo: 'entrambi', lingua: 'en', citta: ['doha', 'lusail', 'al wakrah'], formato: 'jsonld',
    url: 'https://www.marhaba.qa/events/', vicino: { lat: 25.2854, lon: 51.531, km: 50 } },
  { ...AG('qa_museums', 'Qatar Museums calendar', 'QA', ['doha', 'lusail'], 'https://qm.org.qa/en/calendar/', 'en', 'mostre'), vicino: { lat: 25.2854, lon: 51.531, km: 50 } }, // solo AI
  { ...AG('ae_jameel', 'Jameel Arts Centre', 'AE', ['dubai'], 'https://www.jameelartscentre.org/whats-on', 'en'), vicino: { lat: 25.2285, lon: 55.3439, km: 40 } },
  // ISRAELE
  { ...AG('il_jer_cinematheque', 'Jerusalem Cinematheque', 'IL', ['jerusalem', 'gerusalemme', 'ירושלים'], 'https://www.jer-cin.org.il/en', 'en', 'eventi'), vicino: { lat: 31.7685, lon: 35.2276, km: 30 } }, // solo AI
  // SUDAFRICA
  { ...AG('za_zeitz_mocaa', 'Zeitz MOCAA', 'ZA', ['cape town', 'citta del capo', 'kaapstad'], 'https://zeitzmocaa.museum/exhibitions/', 'en'), vicino: { lat: -33.9085, lon: 18.4224, km: 40 } },
  { ...AG('za_norval', 'Norval Foundation', 'ZA', ['cape town', 'citta del capo', 'kaapstad'], 'https://www.norvalfoundation.org/exhibitions', 'en', 'mostre'), vicino: { lat: -34.027, lon: 18.457, km: 40 } }, // solo AI
  // BRASILE
  { ...AG('br_masp', 'MASP', 'BR', ['sao paulo', 'são paulo', 'san paolo'], 'https://masp.org.br/exposicoes', 'pt', 'mostre'), vicino: { lat: -23.5614, lon: -46.6559, km: 40 } },
  { ...AG('br_mis_sp', 'Museu da Imagem e do Som (MIS-SP)', 'BR', ['sao paulo', 'são paulo', 'san paolo'], 'https://www.mis-sp.org.br/programacao', 'pt'), vicino: { lat: -23.5774, lon: -46.6803, km: 40 } },
  { ...AG('br_bienal', 'Fundação Bienal de São Paulo', 'BR', ['sao paulo', 'são paulo', 'san paolo'], 'https://bienal.org.br/agenda/', 'pt'), vicino: { lat: -23.5874, lon: -46.6576, km: 40 } }, // solo AI
  { ...AG('br_ccbb', 'Centro Cultural Banco do Brasil', 'BR', ['sao paulo', 'são paulo', 'san paolo', 'rio de janeiro', 'brasilia', 'brasília', 'belo horizonte'], 'https://www.ccbb.com.br/programacao/', 'pt'), rigorosa: true },
  // MESSICO, CILE
  { ...AG('mx_muac', 'MUAC UNAM', 'MX', ['mexico city', 'ciudad de mexico', 'citta del messico', 'cdmx'], 'https://muac.unam.mx/exposiciones', 'es', 'mostre'), vicino: { lat: 19.3134, lon: -99.1868, km: 40 } },
  { ...AG('mx_cultura_unam', 'Cultura UNAM', 'MX', ['mexico city', 'ciudad de mexico', 'citta del messico', 'cdmx'], 'https://www.cultura.unam.mx/', 'es'), vicino: { lat: 19.4326, lon: -99.1332, km: 40 } }, // solo AI
  { ...AG('mx_timeout_quehacer', 'Time Out México — qué hacer', 'MX', ['mexico city', 'ciudad de mexico', 'citta del messico', 'cdmx'], 'https://www.timeoutmexico.mx/ciudad-de-mexico/que-hacer', 'es'), vicino: { lat: 19.4326, lon: -99.1332, km: 40 } }, // solo AI
  { ...AG('cl_gam', 'Centro Cultural GAM', 'CL', ['santiago', 'santiago de chile'], 'https://gam.cl/calendario/', 'es'), vicino: { lat: -33.4389, lon: -70.6406, km: 40 } }, // solo AI
  { ...AG('cl_mac_uchile', 'Museo de Arte Contemporáneo (U. de Chile)', 'CL', ['santiago', 'santiago de chile'], 'https://mac.uchile.cl/exposiciones/', 'es', 'mostre'), vicino: { lat: -33.4352, lon: -70.6436, km: 40 } }, // solo AI
  NAZ('cl_chile_travel', 'Chile Travel — events', ['CL'], 'https://www.chile.travel/en/events/', 'en'),
  // ── EUROPA, ricerca del 25/11/2026 (pagine provate con l'estrattore HTML o col lettore del formato)
// ── EUROPA (ricerca del 25/11/2026, verificate una per una: eventi futuri letti dall'estrattore o dal lettore del formato)
  // ·· FEED E API (dati strutturati)
  { id: 'de_koeln_tribe', nome: 'koeln.de (Stadtportal)', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['köln', 'koeln', 'cologne', 'colonia'], formato: 'tribe', vicino: { lat: 50.9375, lon: 6.9603, km: 20 },
    url: 'https://www.koeln.de/wp-json/tribe/events/v1/events?per_page=50&start_date=now' },
  { id: 'de_stuttgart_rss', nome: 'Landeshauptstadt Stuttgart', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['stuttgart', 'stoccarda'], formato: 'rss', vicino: { lat: 48.7758, lon: 9.1829, km: 20 },
    url: 'https://www.stuttgart.de/service/veranstaltungen?sp%3Aout=rss', campi: { dal: 'pubDate' } }, // pubDate = ora dell'evento
  { id: 'pl_poznan_rss', nome: 'Miasto Poznań (MIM)', paesi: ['PL'], tipo: 'entrambi', lingua: 'pl', citta: ['poznań', 'poznan', 'posen'], formato: 'rss', vicino: { lat: 52.4064, lon: 16.9252, km: 20 },
    url: 'https://www.poznan.pl/mim/public/feeds/rss.xml?name=events', campi: { dal: 'pubDate' } }, // pubDate = data dell'evento
  { id: 'es_zaragoza_api', nome: 'Ayuntamiento de Zaragoza (API cultura)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['zaragoza', 'saragozza'], formato: 'json', vicino: { lat: 41.6488, lon: -0.8891, km: 20 },
    url: 'https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?rows=100&q=startDate=ge={oggi}T00:00:00Z',
    campi: { elenco: 'result', titolo: 'title', dal: 'startDate', al: 'endDate', luogo: 'location', url: 'url', descrizione: 'description' }, licenza: 'datos abiertos Ayuntamiento de Zaragoza' },

  // ·· REGNO UNITO
  { id: 'gb_visitbelfast', nome: 'Visit Belfast', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['belfast'], vicino: { lat: 54.5973, lon: -5.9301, km: 20 }, url: 'https://visitbelfast.com/whats-on/' },
  { id: 'gb_visitcambridge', nome: 'Visit Cambridge', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['cambridge'], vicino: { lat: 52.2053, lon: 0.1218, km: 15 }, url: 'https://www.visitcambridge.org/whats-on' },
  { id: 'gb_visitbirmingham', nome: 'Visit Birmingham', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['birmingham'], vicino: { lat: 52.4862, lon: -1.8904, km: 20 }, url: 'https://visitbirmingham.com/whats-on/' },
  { id: 'gb_visitbristol', nome: 'Visit Bristol', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['bristol'], vicino: { lat: 51.4545, lon: -2.5879, km: 20 }, url: 'https://visitbristol.co.uk/whats-on' },
  { id: 'gb_cotswolds', nome: 'Cotswolds (ente turismo)', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 51.83, lon: -1.83, km: 40 }, url: 'https://www.cotswolds.com/whats-on' },
  { id: 'gb_bournemouth', nome: 'Bournemouth (ente turismo)', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['bournemouth', 'poole', 'christchurch'], vicino: { lat: 50.7192, lon: -1.8808, km: 20 }, url: 'https://www.bournemouth.co.uk/whats-on' },
  { id: 'gb_visitdorset', nome: 'Visit Dorset', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 50.75, lon: -2.33, km: 50 }, url: 'https://www.visit-dorset.com/whats-on/' },
  { id: 'gb_sheffield', nome: 'Welcome to Sheffield', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['sheffield'], vicino: { lat: 53.3811, lon: -1.4701, km: 20 }, url: 'https://www.welcometosheffield.co.uk/visit/whats-on/' },
  { id: 'gb_nottinghamshire', nome: 'Visit Nottinghamshire', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 53.05, lon: -1.10, km: 35 }, url: 'https://www.visit-nottinghamshire.co.uk/whats-on' },
  { id: 'gb_visitabdn', nome: 'VisitAberdeenshire', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 57.1497, lon: -2.0943, km: 50 }, url: 'https://www.visitabdn.com/whats-on' },
  { id: 'gb_winchester', nome: 'Visit Winchester', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['winchester'], vicino: { lat: 51.0632, lon: -1.3080, km: 15 }, url: 'https://www.visitwinchester.co.uk/whats-on' },
  { id: 'gb_wiltshire', nome: 'Visit Wiltshire', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 51.35, lon: -1.99, km: 40 }, url: 'https://www.visitwiltshire.co.uk/whats-on' },
  { id: 'gb_lincoln', nome: 'Visit Lincoln', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['lincoln'], vicino: { lat: 53.2307, lon: -0.5406, km: 15 }, url: 'https://www.visitlincoln.com/whats-on' },
  { id: 'gb_leicester', nome: 'Visit Leicester', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['leicester'], vicino: { lat: 52.6369, lon: -1.1398, km: 15 }, url: 'https://www.visitleicester.info/whats-on' },
  { id: 'gb_derby', nome: 'Visit Derby', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['derby'], vicino: { lat: 52.9225, lon: -1.4746, km: 15 }, url: 'https://www.visitderby.co.uk/whats-on' },
  { id: 'gb_surrey', nome: 'Visit Surrey', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 51.25, lon: -0.45, km: 35 }, url: 'https://www.visitsurrey.com/whats-on' },
  { id: 'gb_swansea', nome: 'Visit Swansea Bay', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['swansea', 'mumbles'], vicino: { lat: 51.6214, lon: -3.9436, km: 20 }, url: 'https://www.visitswanseabay.com/whats-on' },
  { id: 'gb_eastbourne', nome: 'Visit Eastbourne', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['eastbourne'], vicino: { lat: 50.7684, lon: 0.2905, km: 15 }, url: 'https://www.visiteastbourne.com/whats-on' },
  // solo AI (estrattore 0, date future nel testo)
  { id: 'gb_cardiff', nome: 'Visit Cardiff', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', citta: ['cardiff', 'caerdydd'], vicino: { lat: 51.4816, lon: -3.1791, km: 20 }, url: 'https://www.visitcardiff.com/whats-on/' },
  { id: 'gb_isleofman', nome: 'Visit Isle of Man', paesi: ['IM', 'GB'], tipo: 'entrambi', lingua: 'en', vicino: { lat: 54.2361, lon: -4.5481, km: 40 }, url: 'https://www.visitisleofman.com/whats-on' },
  { id: 'gb_lancashire', nome: 'Visit Lancashire', paesi: ['GB'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 53.80, lon: -2.60, km: 50 }, url: 'https://www.visitlancashire.com/whats-on' },

  // ·· IRLANDA
  { id: 'ie_nationalgallery', nome: 'National Gallery of Ireland', paesi: ['IE'], tipo: 'mostre', lingua: 'en', citta: ['dublin', 'dublino', 'baile átha cliath'], vicino: { lat: 53.3409, lon: -6.2525, km: 20 }, url: 'https://www.nationalgallery.ie/whats-on' },
  { id: 'ie_imma', nome: 'IMMA Irish Museum of Modern Art', paesi: ['IE'], tipo: 'mostre', lingua: 'en', citta: ['dublin', 'dublino', 'baile átha cliath'], vicino: { lat: 53.3434, lon: -6.3009, km: 20 }, url: 'https://imma.ie/whats-on/' },
  { id: 'ie_purecork', nome: 'Pure Cork', paesi: ['IE'], tipo: 'entrambi', lingua: 'en', citta: ['cork', 'corcaigh'], vicino: { lat: 51.8985, lon: -8.4756, km: 25 }, url: 'https://www.purecork.ie/whats-on/' },

  // ·· FRANCIA
  { id: 'fr_toulouse_tourisme', nome: 'Toulouse Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['toulouse', 'tolosa'], vicino: { lat: 43.6047, lon: 1.4442, km: 20 }, url: 'https://www.toulouse-tourisme.com/agenda' },
  { id: 'fr_toulouse_ville', nome: 'Ville de Toulouse', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['toulouse', 'tolosa'], vicino: { lat: 43.6047, lon: 1.4442, km: 15 }, url: 'https://www.toulouse.fr/web/la-mairie/agenda' },
  { id: 'fr_tours', nome: 'Tours Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['tours'], vicino: { lat: 47.3941, lon: 0.6848, km: 20 }, url: 'https://www.tours-tourisme.fr/agenda/' },
  { id: 'fr_grandpalais', nome: 'Grand Palais', paesi: ['FR'], tipo: 'mostre', lingua: 'fr', citta: ['paris', 'parigi'], vicino: { lat: 48.8661, lon: 2.3125, km: 20 }, url: 'https://www.grandpalais.fr/fr/programme' },
  { id: 'fr_louvre', nome: 'Musée du Louvre', paesi: ['FR'], tipo: 'entrambi', lingua: 'en', citta: ['paris', 'parigi'], vicino: { lat: 48.8606, lon: 2.3376, km: 20 }, url: 'https://www.louvre.fr/en/what-s-on' },
  { id: 'fr_aix_ville', nome: "Ville d'Aix-en-Provence", paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['aix-en-provence', 'aix'], vicino: { lat: 43.5297, lon: 5.4474, km: 15 }, url: 'https://www.aixenprovence.fr/Agenda' },
  { id: 'fr_amiens', nome: 'Amiens Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['amiens'], vicino: { lat: 49.8941, lon: 2.2958, km: 20 }, url: 'https://www.amiens-tourisme.com/agenda/' },
  { id: 'fr_bastia', nome: 'Bastia Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['bastia'], vicino: { lat: 42.6977, lon: 9.4508, km: 25 }, url: 'https://www.bastia-tourisme.com/agenda/' },
  { id: 'fr_lille_ville', nome: 'Ville de Lille', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['lille'], vicino: { lat: 50.6292, lon: 3.0573, km: 15 }, url: 'https://www.lille.fr/Evenements' },
  { id: 'fr_lyon_ville', nome: 'Ville de Lyon', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['lyon', 'lione'], vicino: { lat: 45.7640, lon: 4.8357, km: 15 }, url: 'https://www.lyon.fr/agenda' },
  { id: 'fr_bordeaux_metropole', nome: 'Bordeaux Métropole', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['bordeaux'], vicino: { lat: 44.8378, lon: -0.5792, km: 20 }, url: 'https://www.bordeaux-metropole.fr/agenda' },
  // quotidiani EBRA (stessa pagina «/pour-sortir» di L'Alsace e Le Progrès, già nel registro): elencano il dipartimento → rigorose
  { id: 'fr_qd_dna', nome: 'DNA – Dernières Nouvelles d\'Alsace', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 48.5734, lon: 7.7521, km: 40 }, url: 'https://www.dna.fr/pour-sortir' },
  { id: 'fr_qd_estrepublicain', nome: "L'Est Républicain", paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 48.6921, lon: 6.1844, km: 40 }, url: 'https://www.estrepublicain.fr/pour-sortir' },
  { id: 'fr_qd_replorrain', nome: 'Le Républicain Lorrain', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 49.1193, lon: 6.1757, km: 40 }, url: 'https://www.republicain-lorrain.fr/pour-sortir' },
  { id: 'fr_qd_vosgesmatin', nome: 'Vosges Matin', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 48.1724, lon: 6.4493, km: 40 }, url: 'https://www.vosgesmatin.fr/pour-sortir' },
  { id: 'fr_qd_bienpublic', nome: 'Le Bien Public', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 47.3220, lon: 5.0415, km: 40 }, url: 'https://www.bienpublic.com/pour-sortir' },
  { id: 'fr_qd_jsl', nome: 'Le Journal de Saône-et-Loire', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', rigorosa: true, vicino: { lat: 46.7806, lon: 4.8539, km: 50 }, url: 'https://www.lejsl.com/pour-sortir' },
  // solo AI
  { id: 'fr_bordeaux_tourisme', nome: 'Bordeaux Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['bordeaux'], vicino: { lat: 44.8378, lon: -0.5792, km: 25 }, url: 'https://www.bordeaux-tourisme.com/agenda' },
  { id: 'fr_reims', nome: 'Reims Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['reims'], vicino: { lat: 49.2583, lon: 4.0317, km: 20 }, url: 'https://www.reims-tourisme.com/agenda' },
  { id: 'fr_arles', nome: 'Arles Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['arles'], vicino: { lat: 43.6766, lon: 4.6278, km: 20 }, url: 'https://www.arlestourisme.com/fr/agenda.html' },
  { id: 'fr_strasbourg_eu', nome: 'Strasbourg.eu (Ville et Eurométropole)', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['strasbourg', 'strasburgo'], vicino: { lat: 48.5734, lon: 7.7521, km: 20 }, url: 'https://www.strasbourg.eu/agenda' },
  { id: 'fr_voyage_nantes', nome: 'Le Voyage à Nantes', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['nantes'], vicino: { lat: 47.2184, lon: -1.5536, km: 20 }, url: 'https://www.levoyageanantes.fr/agenda/' },
  { id: 'fr_perpignan', nome: 'Perpignan Tourisme', paesi: ['FR'], tipo: 'entrambi', lingua: 'fr', citta: ['perpignan', 'perpignano'], vicino: { lat: 42.6986, lon: 2.8956, km: 20 }, url: 'https://www.perpignantourisme.com/agenda' },

  // ·· SPAGNA
  { id: 'es_reinasofia', nome: 'Museo Reina Sofía', paesi: ['ES'], tipo: 'mostre', lingua: 'es', citta: ['madrid'], vicino: { lat: 40.4080, lon: -3.6943, km: 20 }, url: 'https://www.museoreinasofia.es/exposiciones' },
  { id: 'es_guggenheim_bilbao', nome: 'Museo Guggenheim Bilbao', paesi: ['ES'], tipo: 'mostre', lingua: 'es', citta: ['bilbao', 'bilbo'], vicino: { lat: 43.2687, lon: -2.9340, km: 20 }, url: 'https://www.guggenheim-bilbao.eus/exposiciones' },
  { id: 'es_cccb', nome: 'CCCB Barcelona', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['barcelona', 'barcellona'], vicino: { lat: 41.3836, lon: 2.1668, km: 20 }, url: 'https://www.cccb.org/es/programacion' },
  { id: 'es_alicante', nome: 'Alicante Turismo', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['alicante', 'alacant'], vicino: { lat: 38.3452, lon: -0.4810, km: 20 }, url: 'https://www.alicanteturismo.com/agenda/' },
  { id: 'es_canarias', nome: 'Hola Islas Canarias (Turismo de Canarias)', paesi: ['ES'], tipo: 'eventi', lingua: 'es', rigorosa: true, vicino: { lat: 28.29, lon: -15.63, km: 300 }, url: 'https://www.holaislascanarias.com/eventos/' },
  // solo AI
  { id: 'es_marbella', nome: 'Turismo de Marbella', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['marbella'], vicino: { lat: 36.5101, lon: -4.8825, km: 20 }, url: 'https://turismo.marbella.es/agenda' },
  { id: 'es_sansebastian', nome: 'San Sebastián Turismo (Gipuzkoa)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', rigorosa: true, vicino: { lat: 43.3183, lon: -1.9812, km: 40 }, url: 'https://www.sansebastianturismoa.eus/es/agenda' },
  { id: 'es_salamanca_ayto', nome: 'Ayuntamiento de Salamanca', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', citta: ['salamanca'], vicino: { lat: 40.9701, lon: -5.6635, km: 15 }, url: 'https://www.salamanca.es/es/agenda' },
  { id: 'es_murcia', nome: 'Murcia Turística (Región de Murcia)', paesi: ['ES'], tipo: 'entrambi', lingua: 'es', rigorosa: true, vicino: { lat: 37.99, lon: -1.13, km: 80 }, url: 'https://www.murciaturistica.es/es/agenda/' },

  // ·· PORTOGALLO
  { id: 'pt_agendalx', nome: 'Agenda Cultural de Lisboa', paesi: ['PT'], tipo: 'entrambi', lingua: 'pt', citta: ['lisboa', 'lisbona', 'lisbon'], vicino: { lat: 38.7223, lon: -9.1393, km: 20 }, url: 'https://www.agendalx.pt/' },
  { id: 'pt_ccb', nome: 'Centro Cultural de Belém', paesi: ['PT'], tipo: 'entrambi', lingua: 'pt', citta: ['lisboa', 'lisbona', 'lisbon'], vicino: { lat: 38.6955, lon: -9.2085, km: 20 }, url: 'https://www.ccb.pt/agenda/' },
  // solo AI
  { id: 'pt_evora', nome: 'Câmara Municipal de Évora', paesi: ['PT'], tipo: 'entrambi', lingua: 'pt', citta: ['évora', 'evora'], vicino: { lat: 38.5714, lon: -7.9135, km: 20 }, url: 'https://www.cm-evora.pt/agenda/' },

  // ·· ITALIA
  { id: 'it_feelflorence', nome: 'Feel Florence (Comune di Firenze)', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', citta: ['firenze', 'florence'], vicino: { lat: 43.7696, lon: 11.2558, km: 20 }, url: 'https://www.feelflorence.it/it/eventi' },
  { id: 'it_inlombardia', nome: 'inLombardia (Regione Lombardia)', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 45.62, lon: 9.65, km: 130 }, url: 'https://www.in-lombardia.it/it/eventi' },
  { id: 'it_marche', nome: 'Turismo Marche', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 43.35, lon: 13.20, km: 110 }, url: 'https://www.turismo.marche.it/eventi' },
  { id: 'it_dolomiti', nome: 'Dolomiti.it', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 46.45, lon: 11.80, km: 110 }, url: 'https://www.dolomiti.it/it/eventi/' },
  { id: 'it_fvg', nome: 'PromoTurismoFVG', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 46.07, lon: 13.23, km: 100 }, url: 'https://www.turismofvg.it/eventi' },
  { id: 'it_visitlazio', nome: 'Visit Lazio (Regione Lazio)', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 41.98, lon: 12.77, km: 130 }, url: 'https://www.visitlazio.com/eventi/' },
  { id: 'it_cremona', nome: 'Turismo Cremona', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', citta: ['cremona'], vicino: { lat: 45.1332, lon: 10.0227, km: 20 }, url: 'https://www.turismocremona.it/eventi/' },
  { id: 'it_varese', nome: 'Varese Turismo', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 45.8206, lon: 8.8251, km: 30 }, url: 'https://www.vareseturismo.it/eventi/' },
  { id: 'it_siciliainfesta', nome: 'Sicilia in Festa', paesi: ['IT'], tipo: 'eventi', lingua: 'it', rigorosa: true, vicino: { lat: 37.60, lon: 14.15, km: 200 }, url: 'https://www.siciliainfesta.com/' },
  NAZ('it_sagritaly', 'SagrItaly (sagre e feste)', ['IT'], 'https://www.sagritaly.com/', 'it'),
  // solo AI
  { id: 'it_sardegnaturismo', nome: 'Sardegna Turismo', paesi: ['IT'], tipo: 'entrambi', lingua: 'it', rigorosa: true, vicino: { lat: 40.06, lon: 9.01, km: 200 }, url: 'https://www.sardegnaturismo.it/it/eventi' },
  NAZ('it_eventiesagre', 'Eventi e Sagre', ['IT'], 'https://www.eventiesagre.it/', 'it'),

  // ·· GERMANIA
  { id: 'de_leipzig_travel', nome: 'Leipzig Travel', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['leipzig', 'lipsia'], vicino: { lat: 51.3397, lon: 12.3731, km: 20 }, url: 'https://www.leipzig.travel/veranstaltungen' },
  { id: 'de_leipzig_stadt', nome: 'Stadt Leipzig', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['leipzig', 'lipsia'], vicino: { lat: 51.3397, lon: 12.3731, km: 15 }, url: 'https://www.leipzig.de/freizeit-kultur-und-tourismus/veranstaltungen-und-termine' },
  { id: 'de_potsdam', nome: 'Potsdam Tourismus', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['potsdam'], vicino: { lat: 52.3906, lon: 13.0645, km: 15 }, url: 'https://www.potsdamtourismus.de/veranstaltungen' },
  { id: 'de_augsburg', nome: 'Augsburg Tourismus', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['augsburg', 'augusta'], vicino: { lat: 48.3705, lon: 10.8978, km: 20 }, url: 'https://www.augsburg-tourismus.de/de/veranstaltungen' },
  { id: 'de_smb', nome: 'Staatliche Museen zu Berlin', paesi: ['DE'], tipo: 'mostre', lingua: 'de', citta: ['berlin', 'berlino'], vicino: { lat: 52.5200, lon: 13.4050, km: 25 }, url: 'https://www.smb.museum/ausstellungen/' },
  { id: 'de_staedel', nome: 'Städel Museum', paesi: ['DE'], tipo: 'mostre', lingua: 'de', citta: ['frankfurt', 'frankfurt am main', 'francoforte'], vicino: { lat: 50.1031, lon: 8.6741, km: 20 }, url: 'https://www.staedelmuseum.de/de/ausstellungen' },
  { id: 'de_elbphilharmonie', nome: 'Elbphilharmonie', paesi: ['DE'], tipo: 'eventi', lingua: 'de', citta: ['hamburg', 'amburgo'], vicino: { lat: 53.5413, lon: 9.9841, km: 20 }, url: 'https://www.elbphilharmonie.de/de/programm/' },
  { id: 'de_kunsthalle_hh', nome: 'Hamburger Kunsthalle', paesi: ['DE'], tipo: 'mostre', lingua: 'de', citta: ['hamburg', 'amburgo'], vicino: { lat: 53.5554, lon: 10.0034, km: 20 }, url: 'https://www.hamburger-kunsthalle.de/ausstellungen' },
  { id: 'de_sylt', nome: 'Insel Sylt Tourismus', paesi: ['DE'], tipo: 'entrambi', lingua: 'de', citta: ['sylt', 'westerland', 'list', 'kampen'], vicino: { lat: 54.90, lon: 8.31, km: 25 }, url: 'https://www.sylt.de/veranstaltungen' },

  // ·· SVIZZERA
  { id: 'ch_kunsthaus', nome: 'Kunsthaus Zürich', paesi: ['CH'], tipo: 'mostre', lingua: 'de', citta: ['zurich', 'zürich', 'zurigo', 'zuerich'], vicino: { lat: 47.3703, lon: 8.5481, km: 20 }, url: 'https://www.kunsthaus.ch/besuch-planen/ausstellungen/' },
  { id: 'ch_beyeler', nome: 'Fondation Beyeler', paesi: ['CH'], tipo: 'mostre', lingua: 'en', citta: ['basel', 'basilea', 'bâle', 'riehen'], vicino: { lat: 47.5886, lon: 7.6533, km: 20 }, url: 'https://www.fondationbeyeler.ch/ausstellungen' },
  { id: 'ch_geneve_ville', nome: 'Ville de Genève', paesi: ['CH'], tipo: 'entrambi', lingua: 'fr', citta: ['genève', 'geneve', 'ginevra', 'geneva', 'genf'], vicino: { lat: 46.2044, lon: 6.1432, km: 15 }, url: 'https://www.geneve.ch/agenda' },
  NAZ('ch_myswitzerland', 'MySwitzerland (Svizzera Turismo)', ['CH'], 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/', 'de'),

  // ·· PAESI BASSI E BELGIO
  { id: 'nl_denhaag', nome: 'Den Haag Marketing', paesi: ['NL'], tipo: 'entrambi', lingua: 'nl', citta: ['den haag', "'s-gravenhage", 'the hague', "l'aia", 'aia'], vicino: { lat: 52.0705, lon: 4.3007, km: 15 }, url: 'https://denhaag.com/nl/agenda' },
  { id: 'nl_delft', nome: 'Delft.com', paesi: ['NL'], tipo: 'entrambi', lingua: 'nl', citta: ['delft'], vicino: { lat: 52.0116, lon: 4.3571, km: 10 }, url: 'https://www.delft.com/agenda' },
  { id: 'nl_haarlem', nome: 'Visit Haarlem', paesi: ['NL'], tipo: 'entrambi', lingua: 'nl', citta: ['haarlem'], vicino: { lat: 52.3874, lon: 4.6462, km: 12 }, url: 'https://www.visithaarlem.com/agenda/' },
  { id: 'be_visitbrussels', nome: 'visit.brussels', paesi: ['BE'], tipo: 'entrambi', lingua: 'fr', citta: ['bruxelles', 'brussel', 'brussels'], vicino: { lat: 50.8467, lon: 4.3525, km: 15 }, url: 'https://www.visit.brussels/fr/visiteurs/agenda' },
  { id: 'be_finearts', nome: 'Musées royaux des Beaux-Arts de Belgique', paesi: ['BE'], tipo: 'mostre', lingua: 'fr', citta: ['bruxelles', 'brussel', 'brussels'], vicino: { lat: 50.8418, lon: 4.3579, km: 15 }, url: 'https://fine-arts-museum.be/fr/expositions' },
  { id: 'be_leuven', nome: 'Visit Leuven', paesi: ['BE'], tipo: 'entrambi', lingua: 'nl', citta: ['leuven', 'louvain', 'lovanio'], vicino: { lat: 50.8798, lon: 4.7005, km: 12 }, url: 'https://www.visitleuven.be/agenda' },
  { id: 'be_uitingent', nome: 'UiT in Gent', paesi: ['BE'], tipo: 'entrambi', lingua: 'nl', citta: ['gent', 'gand', 'ghent'], vicino: { lat: 51.0543, lon: 3.7174, km: 15 }, url: 'https://www.uitingent.be/' },

  // ·· NORD, CENTRO-EST, MEDITERRANEO
  { id: 'se_goteborg', nome: 'Göteborg & Co', paesi: ['SE'], tipo: 'entrambi', lingua: 'sv', citta: ['göteborg', 'goteborg', 'gothenburg', 'goteborgo'], vicino: { lat: 57.7089, lon: 11.9746, km: 25 }, url: 'https://www.goteborg.com/evenemang' },
  { id: 'se_nationalmuseum', nome: 'Nationalmuseum', paesi: ['SE'], tipo: 'mostre', lingua: 'sv', citta: ['stockholm', 'stoccolma'], vicino: { lat: 59.3294, lon: 18.0782, km: 20 }, url: 'https://www.nationalmuseum.se/utstallningar' }, // solo AI
  { id: 'hr_zadar', nome: 'TZ Zadar', paesi: ['HR'], tipo: 'entrambi', lingua: 'en', citta: ['zadar', 'zara'], vicino: { lat: 44.1194, lon: 15.2314, km: 20 }, url: 'https://zadar.travel/events/' },
  { id: 'hr_rovinj', nome: 'TZ Rovinj', paesi: ['HR'], tipo: 'entrambi', lingua: 'en', citta: ['rovinj', 'rovigno'], vicino: { lat: 45.0812, lon: 13.6387, km: 15 }, url: 'https://www.rovinj-tourism.com/en/events' },
  { id: 'hr_istra', nome: 'Istra (ente turismo regionale)', paesi: ['HR'], tipo: 'entrambi', lingua: 'en', rigorosa: true, vicino: { lat: 45.24, lon: 13.94, km: 70 }, url: 'https://www.istra.hr/en/events' },
  { id: 'pl_wroclaw', nome: 'Wrocław – GO (Miasto)', paesi: ['PL'], tipo: 'entrambi', lingua: 'pl', citta: ['wrocław', 'wroclaw', 'breslavia', 'breslau'], vicino: { lat: 51.1079, lon: 17.0385, km: 20 }, url: 'https://www.wroclaw.pl/go/wydarzenia' },
  { id: 'hu_pecs', nome: 'Irány Pécs', paesi: ['HU'], tipo: 'entrambi', lingua: 'hu', citta: ['pécs', 'pecs'], vicino: { lat: 46.0727, lon: 18.2323, km: 20 }, url: 'https://www.iranypecs.hu/programok' },
  { id: 'mt_festivals', nome: 'Festivals Malta', paesi: ['MT'], tipo: 'eventi', lingua: 'en', vicino: { lat: 35.8989, lon: 14.5146, km: 40 }, url: 'https://www.festivals.mt/events' },
  // solo AI
  { id: 'mt_whatson', nome: "What's On Malta", paesi: ['MT'], tipo: 'entrambi', lingua: 'en', vicino: { lat: 35.8989, lon: 14.5146, km: 40 }, url: 'https://www.whatson.com.mt/' },
  { id: 'mt_teatrumanoel', nome: 'Teatru Manoel', paesi: ['MT'], tipo: 'eventi', lingua: 'en', citta: ['valletta', 'la valletta'], vicino: { lat: 35.8997, lon: 14.5125, km: 15 }, url: 'https://www.teatrumanoel.mt/whats-on/' },
];

/** Le fonti che valgono per un paese, mondiali comprese. */
export function fontiPer(paese: string, tipo: TipoFonte): FonteEventi[] {
  const p = (paese || '').toUpperCase();
  const vale = (f: FonteEventi) => f.tipo === 'entrambi' || f.tipo === tipo;
  return [
    ...FONTI_PAESE.filter(f => f.paesi.includes(p) && vale(f)),
    ...FONTI_MONDIALI.filter(vale),
  ];
}

/**
 * Pronta all'uso per il lato server: tutte le fonti (eventi E mostre) di un
 * paese, con l'URL gia` costruito per la citta` richiesta. Ordine (25/11/2026): prima le fonti DELLA CITTÀ (agende
 * ufficiali, più precise), poi le nazionali per città, poi le nazionali senza città (rigorose), poi le mondiali (la rete).
 * Duplicati per id esclusi.
 */
export function fontiPerPaese(cc: string, citta = '', cittaLocale = '', lat?: number, lon?: number): Array<FonteEventi & { urlPronto: string }> {
  const paese = (cc || '').toUpperCase();
  const viste = new Set<string>();
  // i dati strutturati (formato) prima di tutto: sono i più precisi e non costano AI
  const locale = (f: FonteEventi) => !!(f.citta?.length || f.vicino);
  const peso = (f: FonteEventi) => (f.formato && locale(f) ? -1 : locale(f) ? 0 : f.paesi.includes('*') ? 3 : /\{citta/.test(f.url) ? 1 : f.formato ? 1.5 : 2);
  // fonti locali per POSIZIONE (vicino) o per nome; le vicine per prime, le più vicine prima delle altre
  const dist = (f: FonteEventi) => (f.vicino && Number.isFinite(lat) && Number.isFinite(lon) ? kmTra(lat as number, lon as number, f.vicino.lat, f.vicino.lon) : 999);
  return [...FONTI_PAESE.filter(f => f.paesi.includes(paese) && valePerLuogo(f, lat, lon, citta, cittaLocale)).sort((a, b) => dist(a) - dist(b)), ...FONTI_MONDIALI]
    .filter(f => { if (viste.has(f.id)) return false; viste.add(f.id); return true; })
    // Le fonti con API (Wikidata, KudaGo) hanno un lettore loro: qui solo pagine.
    .filter(f => !f.api)
    .sort((a, b) => peso(a) - peso(b))
    .map(f => {
      const nome = f.nomeCitta === 'locale' ? (cittaLocale || citta) : citta;
      return { ...f, urlPronto: nome ? costruisciUrl(f, nome, paese, cittaLocale, lat, lon) : f.url };
    })
    // Una fonte che vuole la citta` (o il codice paese, o le coordinate) e non ce l'ha resta con le graffe: fuori.
    .filter(f => !/\{(citta|id_paese|lat|lon)/.test(f.urlPronto));
}

/**
 * LA FONTE PIU' IMPORTANTE PER LE MOSTRE NON E` IN QUESTO ELENCO.
 *
 * Sono i siti dei musei che abbiamo gia` in `shared_pois` con
 * `contact_website`. Le mostre temporanee vivono li`, non su un aggregatore:
 * un museo civico di provincia non finisce su Artsy ne` su Time Out, ma la sua
 * mostra sta sulla sua homepage.
 *
 * E` anche l'unico modo di essere davvero mondiali senza 195 accordi: la
 * copertura diventa quella del nostro catalogo di musei, che e` gia` globale.
 * Il lato server la usa come prima fonte e questi portali come rete.
 */
export const MOSTRE_DA_MUSEI_NOSTRI = true;
