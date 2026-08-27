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
  { id: 'virgilio', nome: 'Virgilio Eventi', paesi: ['IT'], tipo: 'entrambi', url: 'https://www.virgilio.it/italia/{citta}/eventi/' },
  { id: 'vivaticket', nome: 'Vivaticket', paesi: ['IT'], tipo: 'entrambi', url: 'https://www.vivaticket.com/it/ricerca?q={citta_raw}' },
  { id: 'sortiraparis', nome: 'Sortir à Paris', paesi: ['FR'], tipo: 'entrambi', url: 'https://www.sortiraparis.com/' },
  { id: 'offi', nome: 'Offi.fr', paesi: ['FR'], tipo: 'mostre', url: 'https://www.offi.fr/expositions.html' },
  { id: 'eventim_de', nome: 'Eventim', paesi: ['DE', 'AT', 'CH'], tipo: 'eventi', url: 'https://www.eventim.de/city/{citta}/' },
  { id: 'museumsportal_berlin', nome: 'Museumsportal Berlin', paesi: ['DE'], tipo: 'mostre', url: 'https://www.museumsportal-berlin.de/en/exhibitions/' },
  { id: 'timeout', nome: 'Time Out', paesi: ['GB', 'US', 'ES', 'PT', 'JP', 'HK', 'SG', 'AU', 'IL', 'GR'], tipo: 'entrambi', url: 'https://www.timeout.com/{citta}/things-to-do' },
  { id: 'esmadrid', nome: 'esMadrid / turismo locale', paesi: ['ES'], tipo: 'entrambi', url: 'https://www.esmadrid.com/en/whats-on' },
  { id: 'uitagenda_nl', nome: 'Uitagenda', paesi: ['NL'], tipo: 'entrambi', url: 'https://www.uitagenda.nl/' },
  { id: 'visitportugal', nome: 'Visit Portugal', paesi: ['PT'], tipo: 'eventi', url: 'https://www.visitportugal.com/en/whats-on' },
  { id: 'kudago', nome: 'KudaGo', paesi: ['RU'], tipo: 'entrambi', api: true, url: 'https://kudago.com/public-api/v1.4/events/' },
  { id: 'visitsweden', nome: 'Visit Sweden', paesi: ['SE', 'NO', 'DK', 'FI'], tipo: 'eventi', url: 'https://visitsweden.com/what-to-do/' },
  { id: 'visitpoland', nome: 'Going / Polonia', paesi: ['PL'], tipo: 'entrambi', url: 'https://goingapp.pl/' },

  // Americhe
  { id: 'sympla', nome: 'Sympla', paesi: ['BR'], tipo: 'eventi', url: 'https://www.sympla.com.br/eventos/{citta}' },
  { id: 'eventful_mx', nome: 'Boletia', paesi: ['MX'], tipo: 'eventi', url: 'https://boletia.com/' },
  { id: 'timeout_ny', nome: 'Time Out New York', paesi: ['US'], tipo: 'mostre', url: 'https://www.timeout.com/newyork/art' },
  { id: 'passline', nome: 'Passline', paesi: ['AR', 'CL', 'UY'], tipo: 'eventi', url: 'https://www.passline.com/' },

  // Asia e Pacifico
  { id: 'walkerplus', nome: 'Walkerplus', paesi: ['JP'], tipo: 'entrambi', url: 'https://www.walkerplus.com/' },
  { id: 'tokyoartbeat', nome: 'Tokyo Art Beat', paesi: ['JP'], tipo: 'mostre', url: 'https://www.tokyoartbeat.com/en/events' },
  { id: 'bookmyshow', nome: 'BookMyShow', paesi: ['IN'], tipo: 'eventi', url: 'https://in.bookmyshow.com/explore/events-{citta}' },
  { id: 'timeout_hk', nome: 'Time Out Hong Kong', paesi: ['HK'], tipo: 'entrambi', url: 'https://www.timeout.com/hong-kong/things-to-do' },
  { id: 'eventfinda', nome: 'Eventfinda', paesi: ['NZ', 'AU'], tipo: 'eventi', url: 'https://www.eventfinda.co.nz/whatson/events/{citta}' },

  // Africa e Medio Oriente
  { id: 'platinumlist', nome: 'Platinumlist', paesi: ['AE', 'SA', 'QA', 'BH', 'KW', 'OM', 'EG'], tipo: 'eventi', url: 'https://dubai.platinumlist.net/' },
  { id: 'howzit', nome: 'Computicket', paesi: ['ZA'], tipo: 'eventi', url: 'https://www.computicket.com/' },
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
export function fontiPerPaese(cc: string, citta = ''): Array<FonteEventi & { urlPronto: string }> {
  const paese = (cc || '').toUpperCase();
  const viste = new Set<string>();
  return [...FONTI_PAESE.filter(f => f.paesi.includes(paese)), ...FONTI_MONDIALI]
    .filter(f => { if (viste.has(f.id)) return false; viste.add(f.id); return true; })
    .map(f => ({ ...f, urlPronto: citta ? costruisciUrl(f, citta, paese) : f.url }));
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
