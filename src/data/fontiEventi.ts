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
 */

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
   * `{citta_raw}` il nome come si scrive, `{paese}` il codice ISO minuscolo.
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
}

/** Il nome della citta` come lo vogliono quasi tutti i portali. */
export function slugCitta(citta: string): string {
  return citta.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function costruisciUrl(f: FonteEventi, citta: string, paese: string): string {
  return f.url
    .replace('{citta}', slugCitta(citta))
    .replace('{citta_raw}', encodeURIComponent(citta))
    .replace('{paese}', (paese || '').toLowerCase());
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
    id: 'eventbrite', nome: 'Eventbrite',
    paesi: ['*'], tipo: 'eventi',
    url: 'https://www.eventbrite.com/d/{paese}--{citta}/events/',
    licenza: 'pagina pubblica',
  },
  {
    id: 'wikidata_mostre', nome: 'Wikidata',
    paesi: ['*'], tipo: 'mostre', api: true,
    url: 'https://query.wikidata.org/sparql',
    licenza: 'CC0 — nessun vincolo',
  },
];

// ── NAZIONALI E LOCALI ────────────────────────────────────────────────────
// Uno o due per paese, scelti fra quelli che un abitante userebbe davvero.
// L'elenco cresce: aggiungere una riga qui basta a coprire un paese nuovo,
// senza toccare una riga di codice.
export const FONTI_PAESE: FonteEventi[] = [
  // Europa
  { id: 'virgilio', nome: 'Virgilio Eventi', paesi: ['IT'], tipo: 'entrambi', url: 'https://www.virgilio.it/italia/{citta}/eventi/', lingua: 'it' },
  { id: 'vivaticket', nome: 'Vivaticket', paesi: ['IT'], tipo: 'entrambi', url: 'https://www.vivaticket.com/it/ricerca?q={citta_raw}', lingua: 'it' },
  { id: 'sortiraparis', nome: 'Sortir à Paris', paesi: ['FR'], tipo: 'entrambi', url: 'https://www.sortiraparis.com/', lingua: 'fr' },
  { id: 'openagenda', nome: 'OpenAgenda', paesi: ['FR', 'BE', 'CH'], tipo: 'entrambi', url: 'https://openagenda.com/search?q={citta_raw}', lingua: 'fr', licenza: 'agende pubbliche, licenza aperta per agenda' },
  { id: 'offi', nome: 'Offi.fr', paesi: ['FR'], tipo: 'mostre', url: 'https://www.offi.fr/expositions.html', lingua: 'fr' },
  { id: 'eventim_de', nome: 'Eventim', paesi: ['DE', 'AT', 'CH'], tipo: 'eventi', url: 'https://www.eventim.de/city/{citta}/', lingua: 'de' },
  { id: 'museumsportal_berlin', nome: 'Museumsportal Berlin', paesi: ['DE'], tipo: 'mostre', url: 'https://www.museumsportal-berlin.de/en/exhibitions/', lingua: 'en' },
  { id: 'timeout', nome: 'Time Out', paesi: ['GB', 'US', 'ES', 'PT', 'JP', 'HK', 'SG', 'AU', 'IL', 'GR'], tipo: 'entrambi', url: 'https://www.timeout.com/{citta}/things-to-do', lingua: 'en' },
  { id: 'esmadrid', nome: 'esMadrid / turismo locale', paesi: ['ES'], tipo: 'entrambi', url: 'https://www.esmadrid.com/agenda-madrid', lingua: 'es' },
  { id: 'uitagenda_nl', nome: 'Uitagenda', paesi: ['NL'], tipo: 'entrambi', url: 'https://www.uitagenda.nl/', lingua: 'nl' },
  { id: 'visitportugal', nome: 'Visit Portugal', paesi: ['PT'], tipo: 'eventi', url: 'https://www.visitportugal.com/pt-pt/o-que-fazer', lingua: 'pt' },
  { id: 'bol_pt', nome: 'BOL', paesi: ['PT'], tipo: 'eventi', url: 'https://www.bol.pt/Comprar/Pesquisa?q={citta_raw}', lingua: 'pt' },
  { id: 'kudago', nome: 'KudaGo', paesi: ['RU'], tipo: 'entrambi', api: true, url: 'https://kudago.com/public-api/v1.4/events/', lingua: 'ru' },
  { id: 'visitsweden', nome: 'Visit Sweden', paesi: ['SE', 'NO', 'DK', 'FI'], tipo: 'eventi', url: 'https://visitsweden.com/what-to-do/', lingua: 'en' },
  { id: 'going_pl', nome: 'Going', paesi: ['PL'], tipo: 'entrambi', url: 'https://goingapp.pl/wydarzenia/{citta}', lingua: 'pl' },
  { id: 'goout_cz', nome: 'GoOut', paesi: ['CZ', 'SK', 'PL'], tipo: 'entrambi', url: 'https://goout.net/cs/{citta}/akce/', lingua: 'cs' },
  { id: 'viva_gr', nome: 'viva.gr', paesi: ['GR'], tipo: 'eventi', url: 'https://www.viva.gr/tickets/', lingua: 'el' },
  { id: 'biletix_tr', nome: 'Biletix', paesi: ['TR'], tipo: 'eventi', url: 'https://www.biletix.com/anasayfa/TURKIYE/tr', lingua: 'tr' },
  { id: 'wien_info', nome: 'wien.info', paesi: ['AT'], tipo: 'entrambi', url: 'https://www.wien.info/de/jetzt-in-wien/veranstaltungen', lingua: 'de' },
  { id: 'entrada_hr', nome: 'Entrio', paesi: ['HR', 'SI', 'RS', 'BA'], tipo: 'eventi', url: 'https://www.entrio.hr/', lingua: 'hr' },

  // Americhe
  { id: 'sympla', nome: 'Sympla', paesi: ['BR'], tipo: 'eventi', url: 'https://www.sympla.com.br/eventos/{citta}', lingua: 'pt' },
  { id: 'eventful_mx', nome: 'Boletia', paesi: ['MX'], tipo: 'eventi', url: 'https://boletia.com/', lingua: 'es' },
  { id: 'timeout_ny', nome: 'Time Out New York', paesi: ['US'], tipo: 'mostre', url: 'https://www.timeout.com/newyork/art', lingua: 'en' },
  { id: 'passline', nome: 'Passline', paesi: ['AR', 'CL', 'UY'], tipo: 'eventi', url: 'https://www.passline.com/', lingua: 'es' },

  // Asia e Pacifico (portali in lingua locale: il nome della citta` va
  // nell'alfabeto del posto dove il sito lo vuole)
  { id: 'douban', nome: '豆瓣同城', paesi: ['CN'], tipo: 'entrambi', url: 'https://www.douban.com/location/{citta}/events/week-all', lingua: 'zh', nomeCitta: 'en' },
  { id: 'damai_search', nome: '大麦', paesi: ['CN'], tipo: 'eventi', url: 'https://search.damai.cn/search.htm?keyword={citta_raw}', lingua: 'zh', nomeCitta: 'locale' },
  { id: 'walkerplus', nome: 'Walkerplus', paesi: ['JP'], tipo: 'entrambi', url: 'https://www.walkerplus.com/event_list/', lingua: 'ja' },
  { id: 'tokyoartbeat', nome: 'Tokyo Art Beat', paesi: ['JP'], tipo: 'mostre', url: 'https://www.tokyoartbeat.com/events/', lingua: 'ja' },
  { id: 'interpark_kr', nome: 'Interpark', paesi: ['KR'], tipo: 'eventi', url: 'https://tickets.interpark.com/', lingua: 'ko' },
  { id: 'visitkorea', nome: 'VisitKorea festival', paesi: ['KR'], tipo: 'eventi', url: 'https://korean.visitkorea.or.kr/list/festival.do', lingua: 'ko' },
  { id: 'accupass_tw', nome: 'Accupass 活動通', paesi: ['TW'], tipo: 'entrambi', url: 'https://www.accupass.com/search?q={citta_raw}', lingua: 'zh', nomeCitta: 'locale' },
  { id: 'bookmyshow', nome: 'BookMyShow', paesi: ['IN'], tipo: 'eventi', url: 'https://in.bookmyshow.com/explore/events-{citta}', lingua: 'en' },
  { id: 'timeout_hk', nome: 'Time Out Hong Kong', paesi: ['HK'], tipo: 'entrambi', url: 'https://www.timeout.com/hong-kong/things-to-do', lingua: 'en' },
  { id: 'eventpop_th', nome: 'Eventpop', paesi: ['TH'], tipo: 'eventi', url: 'https://www.eventpop.me/events', lingua: 'th' },
  { id: 'ticketbox_vn', nome: 'Ticketbox', paesi: ['VN'], tipo: 'eventi', url: 'https://ticketbox.vn/', lingua: 'vi' },
  { id: 'loket_id', nome: 'Loket', paesi: ['ID'], tipo: 'eventi', url: 'https://www.loket.com/', lingua: 'id' },
  { id: 'eventfinda', nome: 'Eventfinda', paesi: ['NZ', 'AU'], tipo: 'eventi', url: 'https://www.eventfinda.co.nz/whatson/events/{citta}', lingua: 'en' },

  // Africa e Medio Oriente
  { id: 'platinumlist', nome: 'Platinumlist', paesi: ['AE', 'SA', 'QA', 'BH', 'KW', 'OM', 'EG'], tipo: 'eventi', url: 'https://dubai.platinumlist.net/', lingua: 'en' },
  { id: 'howzit', nome: 'Computicket', paesi: ['ZA'], tipo: 'eventi', url: 'https://www.computicket.com/', lingua: 'en' },
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
 * paese, con l'URL gia` costruito per la citta` richiesta. Ordine: prima le
 * nazionali (piu` precise), poi le mondiali (la rete). Duplicati per id esclusi.
 */
export function fontiPerPaese(cc: string, citta = '', cittaLocale = ''): Array<FonteEventi & { urlPronto: string }> {
  const paese = (cc || '').toUpperCase();
  const viste = new Set<string>();
  return [...FONTI_PAESE.filter(f => f.paesi.includes(paese)), ...FONTI_MONDIALI]
    .filter(f => { if (viste.has(f.id)) return false; viste.add(f.id); return true; })
    // Le fonti con API (Wikidata, KudaGo) hanno un lettore loro: qui solo pagine.
    .filter(f => !f.api)
    .map(f => {
      const nome = f.nomeCitta === 'locale' ? (cittaLocale || citta) : citta;
      return { ...f, urlPronto: nome ? costruisciUrl(f, nome, paese) : f.url };
    })
    // Una fonte che vuole la citta` e non ce l'ha resta con le graffe: fuori.
    .filter(f => !/\{citta/.test(f.urlPronto));
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
