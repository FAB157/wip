// AGENDE DEI QUOTIDIANI con eventi futuri (generato il 2026-11-25 da scratch/scopri-eventi-quotidiani.mjs).
// Elenco dei giornali da Wikidata (CC0: sito P856, luogo di pubblicazione P291 con coordinate P625, lingua P407); la pagina
// agenda è stata trovata sul sito della testata e VALE perché risponde 200, non blocca i robot, ha eventi futuri (JSON-LD
// Event o ≥ 5 date future) e non è un elenco di articoli. Ogni voce diventa una fonte `rigorosa` valida entro 40 km dal
// luogo di pubblicazione (src/data/fontiEventi.ts). NON modificare a mano: rilanciare lo script.
export const QUOTIDIANI_EVENTI: Array<[nome: string, paese: string, url: string, lingua: string, lat: number, lon: number]> = [
  ["Obersteirische Rundschau", "AT", "https://www.rundschau-medien.at/dasistlos/", "de", 47.4106, 15.2686],
  ["Salzburger Nachrichten", "AT", "https://www.sn.at/veranstaltungen/", "de", 47.8, 13.045],
  ["The Canberra Times", "AU", "https://www.canberratimes.com.au/notice-board/whats-on/", "en", -35.2931, 149.1269],
  ["Yass Tribune", "AU", "https://www.yasstribune.com.au/notice-board/whats-on/", "en", -34.8203, 148.9136],
  ["Die Weltwoche", "CH", "https://weltwoche.ch/events/", "de", 47.3422, 8.5783],
  ["Zuger Woche", "CH", "https://www.zugerwoche.ch/veranstaltungen", "de", 47.1681, 8.5169],
  ["Freie Presse", "DE", "https://www.freiepresse.de/wohin/veranstaltungen", "de", 50.8324, 12.9189],
  ["Diario de León", "ES", "https://www.diariodeleon.es/ocio/agenda-de-leon/", "es", 42.5989, -5.5669],
  ["Diario de Pontevedra", "ES", "https://www.diariodepontevedra.es/events/", "es", 42.4336, -8.6475],
  ["La Vanguardia", "ES", "https://www.lavanguardia.com/calendario/", "es", 41.3927, 2.1458],
  ["L'Alsace", "FR", "https://www.lalsace.fr/pour-sortir", "fr", 47.7486, 7.3392],
  ["L’Opinion", "FR", "https://www.lopinion.fr/evenements", "fr", 48.8567, 2.3522],
  ["Le Progrès", "FR", "https://www.leprogres.fr/pour-sortir", "fr", 45.7675, 4.835],
  ["Asahi Shimbun", "JP", "https://www.asahi.com/culture/events/", "ja", 34.6938, 135.5021],
  ["Tokyo Shimbun", "JP", "https://www.tokyo-np.co.jp/event", "ja", 35.6894, 139.6917],
  ["MONU – magazine on urbanism", "NL", "https://www.monu.org/category/events", "en", 51.92, 4.48],
];
