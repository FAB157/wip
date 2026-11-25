// COMUNI ITALIANI CON UN'AGENDA EVENTI LEGGIBILE (generato il 2026-11-25 da scratch/scopri-eventi-comuni.mjs).
// Elenco dei comuni: Indice PA (AgID, CC BY 4.0, sito istituzionale) + ISTAT (nomi, regioni); coordinate: Wikidata (CC0,
// P635 + P625). Qui solo i comuni la cui fonte ha dato EVENTI FUTURI letti con eventiFeed.eventiDaFeed; i comuni già in
// opencityComuni.ts sono esclusi (stesso host = una fonte). NON modificare a mano: rilanciare lo scopritore.
// host senza schema = https; con «http://» davanti = il sito risponde solo in http.
export type FormatoComune = 'opencity' | 'comunweb' | 'tribe' | 'rss' | 'ical' | 'jsonld' | 'pagina';
/** ComunWeb/OpenContent opendata v2 («classes [event]»): si legge come 'json' con questi percorsi. */
export const CAMPI_COMUNWEB = {"elenco":"searchHits","titolo":"data.ita-IT.event_title","dal":"data.ita-IT.time_interval.input.startDateTime","al":"data.ita-IT.time_interval.input.endDateTime","luogo":"data.ita-IT.virtual_takes_place_in.0.name","descrizione":"data.ita-IT.event_abstract"};
/** Titoli scartati in ogni fonte comunale: atti dell'amministrazione, non eventi (regex, maiuscole indifferenti). */
export const ESCLUDI_ISTITUZIONALI = "\\b(convoca|convocazione|seduta|commission[ei]|consiglio comunale|consiglio di quartiere|giunta|assessorat|assemblea|conferenza dei capigruppo|capigruppo|udienza|bando|avviso|designazion|consiglio di amministrazione|anagrafe|servizio [a-z]|nomina|elezion|ordine del giorno|chiusura uffic|sportello|ricevimento)";
export const COMUNI_EVENTI: Array<[nome: string, host: string, formato: FormatoComune, urlRelativo: string, lat: number, lon: number]> = [
  ["Bolzano", "www.comune.bolzano.bz.it", "comunweb", "/api/opendata/v2/content/search/classes%20%5Bevent%5D%20sort%20%5Bpublished%3D%3Edesc%5D%20limit%2050", 46.4981, 11.3548],
  ["Firenze", "www.comune.firenze.it", "pagina", "/vivere-il-comune/eventi", 43.7714, 11.2542],
  ["Lucca", "www.comune.lucca.it", "pagina", "/vivere-il-comune/eventi/", 43.85, 10.5167],
  ["Napoli", "www.comune.napoli.it", "pagina", "/vivere-il-comune/eventi/", 40.8358, 14.2486],
  ["Taormina", "www.comune.taormina.me.it", "pagina", "/vivere-il-comune/eventi/", 37.8518, 15.2857],
  ["Venezia", "www.comune.venezia.it", "pagina", "/eventi", 45.4397, 12.3319],
  ["Vicenza", "www.comune.vicenza.it", "comunweb", "/api/opendata/v2/content/search/classes%20%5Bevent%5D%20sort%20%5Bpublished%3D%3Edesc%5D%20limit%2050", 45.55, 11.55],
];
