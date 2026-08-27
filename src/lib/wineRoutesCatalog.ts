// =====================================================================
// LE STRADE DEL VINO E DEL GUSTO DEL MONDO
// =====================================================================
//
// Perché un catalogo curato e non un import.
// L'harvest OpenStreetMap (scratch/importa-enogastronomia.mjs) ha portato
// 199.124 luoghi del gusto in 215 paesi — cantine, vigneti, caseifici,
// frantoi, birrifici — ma solo 156 STRADE mappate come relazione `route`,
// e 126 di quelle stanno fra Germania e Austria. La Route des Grands Crus,
// la Chiantigiana, la Ruta del Vino de La Rioja, il Silverado Trail, la
// Stellenbosch Wine Route: nessuna di queste esiste su OSM come percorso.
// Sono itinerari culturali, non oggetti geografici.
//
// Quindi la stessa scelta fatta per i porti da crociera e per i cammini in
// `transitCatalog.ts`: un catalogo scritto a mano, con tappe reali e
// coordinate verificabili, che alimenta la biblioteca di itinerari.
//
// I PRODUTTORI NON SI SCRIVONO QUI. Le tappe sono paesi, non aziende: i
// nomi delle cantine cambiano, chiudono, cambiano proprietà, e un nome
// inventato in una guida è il difetto peggiore che possiamo avere. I
// produttori reali li mette il generatore pescandoli dal nostro database
// (server.ts::libFetchGusto), che li ha presi da OpenStreetMap.
//
// REGOLA DI SICUREZZA che vale per tutte le voci `kind: 'vino'`: chi
// degusta non guida. Ogni brief generato da qui la ripete.

export type TasteRouteKind =
  | 'vino' | 'olio' | 'formaggio' | 'birra' | 'distillati'
  | 'caffe' | 'te' | 'cacao' | 'gusto';

export interface TasteRouteStop {
  /** Giorno consigliato (1-based). Più tappe possono cadere lo stesso giorno. */
  day: number;
  /** Località della tappa (paese o città, MAI un'azienda). */
  place: string;
  lat: number;
  lon: number;
  /** Cosa si assaggia o si visita qui, in una riga. */
  what: string;
}

export interface TasteRoute {
  id: string;
  emoji: string;
  /** Nome della strada, nella lingua del posto dove ne ha uno ufficiale. */
  name: string;
  kind: TasteRouteKind;
  country: string;
  /** Regione/stato, per i filtri e per il titolo. */
  region: string;
  /** Continente in italiano, come in transitCatalog. */
  continent: 'Europa' | 'Asia' | 'Africa' | 'Nord America' | 'Sud America' | 'Oceania';
  /** Giorni della versione proposta. */
  days: number;
  /** Come ci si muove davvero su questo percorso. */
  transport: 'auto' | 'bici' | 'piedi' | 'treno' | 'navetta' | 'barca';
  /** Coordinate della località di partenza (= prima tappa). */
  coords: { lat: number; lon: number };
  /** Vitigni, denominazioni o prodotti simbolo. */
  products: string;
  /** Finestra migliore, detta onestamente. */
  season: string;
  stops: TasteRouteStop[];
  /** Avvertenze pratiche specifiche di questa strada. */
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────
// ITALIA — regione per regione
// ─────────────────────────────────────────────────────────────────────

const ITALIA: TasteRoute[] = [
  {
    id: 'wr-it-barolo', emoji: '🍷', name: 'Strada del Barolo e grandi vini di Langa',
    kind: 'vino', country: 'Italia', region: 'Piemonte', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.70, lon: 8.04 }, products: 'Barolo e Barbera d\'Alba, nebbiolo, tartufo bianco',
    season: 'Settembre-novembre per vendemmia e tartufo; maggio-giugno per le colline verdi.',
    stops: [
      { day: 1, place: 'Alba', lat: 44.70, lon: 8.04, what: 'la capitale delle Langhe: enoteche in centro e la fiera del tartufo da ottobre' },
      { day: 1, place: 'Grinzane Cavour', lat: 44.65, lon: 7.99, what: 'il castello di Cavour con l\'enoteca regionale, primo assaggio ragionato' },
      { day: 1, place: 'La Morra', lat: 44.63, lon: 7.94, what: 'la terrazza sul mare di vigne: il punto panoramico che spiega il Barolo meglio di un libro' },
      { day: 2, place: 'Barolo', lat: 44.61, lon: 7.94, what: 'il paese che dà il nome al vino, col museo WiMu nel castello Falletti' },
      { day: 2, place: 'Serralunga d\'Alba', lat: 44.61, lon: 8.00, what: 'il castello più verticale delle Langhe e i cru più austeri' },
      { day: 2, place: 'Monforte d\'Alba', lat: 44.58, lon: 7.97, what: 'borgo a gradoni, anfiteatro all\'aperto e Barolo di lunga sosta' },
    ],
    notes: 'Le colline UNESCO Langhe-Roero-Monferrato. Le visite in cantina qui sono quasi sempre SOLO su appuntamento, spesso con giorni di anticipo in autunno. Strade strette e a tornanti: chi guida non degusta, o si prende un autista.',
  },
  {
    id: 'wr-it-barbaresco', emoji: '🍷', name: 'Barbaresco e Roero',
    kind: 'vino', country: 'Italia', region: 'Piemonte', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 44.72, lon: 8.08 }, products: 'Barbaresco, Roero Arneis, nebbiolo',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Barbaresco', lat: 44.72, lon: 8.08, what: 'la torre medievale e l\'enoteca regionale nell\'ex chiesa di San Donato' },
      { day: 1, place: 'Neive', lat: 44.72, lon: 8.11, what: 'uno dei borghi più belli d\'Italia, con le cantine sotto le case' },
      { day: 1, place: 'Treiso', lat: 44.68, lon: 8.07, what: 'il balcone sulle Langhe, meno battuto di La Morra' },
      { day: 1, place: 'Canale', lat: 44.79, lon: 7.99, what: 'il Roero di là dal Tanaro: Arneis, pesche e rocche di sabbia' },
    ],
    notes: 'Il Roero è la faccia meno conosciuta e più economica della stessa collina: ottimo se le cantine del Barbaresco sono al completo.',
  },
  {
    id: 'wr-it-monferrato', emoji: '🍷', name: 'Strada del Moscato e del Monferrato',
    kind: 'vino', country: 'Italia', region: 'Piemonte', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.72, lon: 8.29 }, products: 'Moscato d\'Asti, Asti spumante, Barbera d\'Asti, Ruché',
    season: 'Settembre per la vendemmia del moscato; giugno per le colline.',
    stops: [
      { day: 1, place: 'Canelli', lat: 44.72, lon: 8.29, what: 'le Cattedrali Sotterranee UNESCO: chilometri di cantine scavate nel tufo' },
      { day: 1, place: 'Santo Stefano Belbo', lat: 44.71, lon: 8.23, what: 'il paese di Cesare Pavese fra le vigne di moscato' },
      { day: 2, place: 'Nizza Monferrato', lat: 44.77, lon: 8.35, what: 'la capitale della Barbera più strutturata' },
      { day: 2, place: 'Casale Monferrato', lat: 45.13, lon: 8.45, what: 'gli infernot UNESCO, stanzette scavate nella pietra da cantoni' },
    ],
    notes: 'Le Cattedrali Sotterranee di Canelli si visitano su prenotazione, con orari fissi. Gli infernot del Monferrato aprono spesso solo nei fine settimana.',
  },
  {
    id: 'wr-it-valledaosta', emoji: '🍷', name: 'Strada dei vini della Valle d\'Aosta',
    kind: 'vino', country: 'Italia', region: 'Valle d\'Aosta', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 45.74, lon: 7.32 }, products: 'Petite Arvine, Fumin, Blanc de Morgex (viti a 1.200 m)',
    season: 'Giugno-ottobre; d\'inverno molte cantine chiudono.',
    stops: [
      { day: 1, place: 'Donnas', lat: 45.60, lon: 7.77, what: 'terrazzamenti e nebbiolo di montagna all\'ingresso della valle' },
      { day: 1, place: 'Chambave', lat: 45.74, lon: 7.55, what: 'moscato e vigne fra i castelli della media valle' },
      { day: 1, place: 'Aymavilles', lat: 45.70, lon: 7.24, what: 'il castello a quattro torri e le cantine cooperative valdostane' },
      { day: 1, place: 'Morgex', lat: 45.76, lon: 7.04, what: 'il Blanc de Morgex: fra i vigneti più alti d\'Europa, ai piedi del Monte Bianco' },
    ],
    notes: 'La viticoltura eroica: pendenze estreme, vendemmia a mano. Le distanze sono brevi ma la statale 26 è lenta.',
  },
  {
    id: 'wr-it-franciacorta', emoji: '🥂', name: 'Strada del Franciacorta',
    kind: 'vino', country: 'Italia', region: 'Lombardia', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 45.60, lon: 9.97 }, products: 'Franciacorta metodo classico (chardonnay, pinot nero)',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Erbusco', lat: 45.60, lon: 9.97, what: 'il cuore della denominazione, cantine con visita alle pupitres' },
      { day: 1, place: 'Rovato', lat: 45.56, lon: 10.00, what: 'il mercato storico del bestiame e il "manzo all\'olio" da provare' },
      { day: 1, place: 'Iseo', lat: 45.66, lon: 10.05, what: 'il lago: passeggiata sul lungolago e traghetto per Monte Isola' },
      { day: 1, place: 'Cazzago San Martino', lat: 45.58, lon: 10.03, what: 'colline moreniche e pievi romaniche fra le vigne' },
    ],
    notes: 'Un\'ora da Milano: la gita in giornata più facile d\'Italia per le bollicine. Chiudi con Monte Isola, che si gira solo a piedi o in bici.',
  },
  {
    id: 'wr-it-valtellina', emoji: '🍷', name: 'Strada del Vino di Valtellina',
    kind: 'vino', country: 'Italia', region: 'Lombardia', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 46.17, lon: 9.87 }, products: 'Nebbiolo delle Alpi (Sassella, Grumello, Inferno), Sforzato',
    season: 'Settembre-ottobre per la vendemmia sui terrazzamenti; maggio-giugno.',
    stops: [
      { day: 1, place: 'Sondrio', lat: 46.17, lon: 9.87, what: 'base del viaggio, con le cantine storiche scavate sotto la città' },
      { day: 1, place: 'Chiuro', lat: 46.17, lon: 9.94, what: 'il cuore del Grumello e dell\'Inferno, fra 2.500 km di muretti a secco' },
      { day: 2, place: 'Teglio', lat: 46.17, lon: 10.07, what: 'palazzo Besta e i pizzoccheri, che qui sono nati' },
      { day: 2, place: 'Tirano', lat: 46.22, lon: 10.17, what: 'capolinea del Trenino Rosso del Bernina, UNESCO: si arriva in treno e si beve' },
    ],
    notes: 'L\'unica strada del vino italiana che si fa comodamente in TRENO (linea Milano-Tirano): la soluzione più elegante al problema di chi guida.',
  },
  {
    id: 'wr-it-oltrepo', emoji: '🍷', name: 'Strada del Vino dell\'Oltrepò Pavese',
    kind: 'vino', country: 'Italia', region: 'Lombardia', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 45.01, lon: 9.12 }, products: 'Pinot nero (base spumante), Bonarda, Buttafuoco',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Casteggio', lat: 45.01, lon: 9.12, what: 'porta dell\'Oltrepò, museo archeologico e prime colline' },
      { day: 1, place: 'Broni', lat: 45.06, lon: 9.26, what: 'la zona del Buttafuoco, rosso vivace e territoriale' },
      { day: 1, place: 'Santa Maria della Versa', lat: 44.98, lon: 9.29, what: 'il pinot nero che diventa metodo classico' },
      { day: 1, place: 'Montalto Pavese', lat: 44.98, lon: 9.15, what: 'castello e panorama sulle valli, salame di Varzi a poca strada' },
    ],
    notes: 'La terza zona d\'Europa per pinot nero coltivato, e quasi nessuno lo sa: rapporto qualità-prezzo fra i migliori d\'Italia.',
  },
  {
    id: 'wr-it-sudtirol', emoji: '🍷', name: 'Südtiroler Weinstraße — Strada del Vino dell\'Alto Adige',
    kind: 'vino', country: 'Italia', region: 'Alto Adige', continent: 'Europa', days: 2, transport: 'bici',
    coords: { lat: 46.50, lon: 11.35 }, products: 'Lagrein, Schiava, Gewürztraminer (nato a Termeno), Pinot bianco',
    season: 'Aprile-giugno e settembre-ottobre (Törggelen da fine settembre).',
    stops: [
      { day: 1, place: 'Bolzano', lat: 46.50, lon: 11.35, what: 'partenza: Santa Maddalena e Lagrein si fanno dentro i confini della città' },
      { day: 1, place: 'Appiano', lat: 46.46, lon: 11.26, what: 'i masi e le residenze gotiche di Missiano e Cornaiano fra i vigneti' },
      { day: 1, place: 'Caldaro', lat: 46.41, lon: 11.24, what: 'il lago balneabile più caldo delle Alpi, con le vigne fin sulla riva' },
      { day: 2, place: 'Termeno', lat: 46.34, lon: 11.24, what: 'il paese che ha dato il nome al Gewürztraminer' },
      { day: 2, place: 'Cortaccia', lat: 46.31, lon: 11.22, what: 'il sentiero del vino fra i pergolati, quasi sempre in piano' },
      { day: 2, place: 'Magrè', lat: 46.27, lon: 11.21, what: 'vicoli medievali e la vite più vecchia d\'Europa ancora produttiva' },
    ],
    notes: 'L\'unica strada del vino italiana con una ciclabile dedicata quasi tutta in piano e un servizio di treni regionali parallelo: si fa senza auto. Il Törggelen autunnale (vino nuovo, castagne, speck nei masi) è l\'esperienza da non perdere.',
  },
  {
    id: 'wr-it-trentino', emoji: '🍷', name: 'Strada del Vino e dei Sapori del Trentino',
    kind: 'vino', country: 'Italia', region: 'Trentino', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 46.07, lon: 11.12 }, products: 'Trentodoc metodo classico, Teroldego Rotaliano, Nosiola e Vino Santo',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Trento', lat: 46.07, lon: 11.12, what: 'la città del Concilio e la capitale del Trentodoc' },
      { day: 1, place: 'Lavis', lat: 46.14, lon: 11.11, what: 'la porta della Piana Rotaliana' },
      { day: 2, place: 'Mezzocorona', lat: 46.21, lon: 11.12, what: 'il Campo Rotaliano: il Teroldego cresce su un fazzoletto di ghiaie' },
      { day: 2, place: 'Rovereto', lat: 45.89, lon: 11.04, what: 'Marzemino (quello del Don Giovanni di Mozart) e il MART' },
    ],
    notes: 'Il Trentodoc si visita in cantine grandi e organizzate: qui la visita senza appuntamento è più facile che altrove.',
  },
  {
    id: 'wr-it-valpolicella', emoji: '🍷', name: 'Strada del Vino Valpolicella',
    kind: 'vino', country: 'Italia', region: 'Veneto', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.44, lon: 10.99 }, products: 'Amarone, Ripasso, Recioto, Valpolicella Classico',
    season: 'Ottobre-gennaio per vedere i fruttai dell\'appassimento; aprile-giugno.',
    stops: [
      { day: 1, place: 'Verona', lat: 45.44, lon: 10.99, what: 'partenza dall\'Arena: la Valpolicella comincia a venti minuti' },
      { day: 1, place: 'San Pietro in Cariano', lat: 45.52, lon: 10.90, what: 'ville venete e il cuore della zona Classica' },
      { day: 1, place: 'Negrar', lat: 45.53, lon: 10.94, what: 'la valle più stretta e i fruttai dove l\'uva appassisce fino a gennaio' },
      { day: 2, place: 'Fumane', lat: 45.54, lon: 10.88, what: 'la pieve di San Giorgio e la grotta preistorica, fra i vigneti' },
      { day: 2, place: 'Sant\'Ambrogio di Valpolicella', lat: 45.52, lon: 10.83, what: 'le cave di marmo rosso e la vista sul lago di Garda' },
    ],
    notes: 'Chiedi di vedere il FRUTTAIO, non solo la barricaia: l\'appassimento è ciò che rende unico l\'Amarone, e da novembre a gennaio è visibile. L\'Amarone è 15-16 gradi: due assaggi e la giornata è finita.',
  },
  {
    id: 'wr-it-prosecco', emoji: '🥂', name: 'Strada del Prosecco Conegliano-Valdobbiadene',
    kind: 'vino', country: 'Italia', region: 'Veneto', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.89, lon: 12.30 }, products: 'Prosecco Superiore DOCG, Cartizze, Col Fondo',
    season: 'Marzo-maggio (primavera sulle rive) e settembre.',
    stops: [
      { day: 1, place: 'Conegliano', lat: 45.89, lon: 12.30, what: 'la prima Scuola Enologica d\'Italia (1876) e il castello' },
      { day: 1, place: 'Refrontolo', lat: 45.92, lon: 12.19, what: 'il molinetto della Croda e il Marzemino passito' },
      { day: 2, place: 'Farra di Soligo', lat: 45.88, lon: 12.12, what: 'le "rive": colline così ripide che si vendemmia solo a mano' },
      { day: 2, place: 'Valdobbiadene', lat: 45.90, lon: 12.00, what: 'il Cartizze, 107 ettari fra i terreni agricoli più cari d\'Italia' },
    ],
    notes: 'Colline del Prosecco UNESCO dal 2019. Attenzione all\'equivoco: il Prosecco DOC di pianura e il Superiore DOCG di queste rive sono due mondi diversi, e la differenza si sente. La strada delle rive è stretta e panoramica: guida piano.',
  },
  {
    id: 'wr-it-soave', emoji: '🍷', name: 'Strada del Vino Soave',
    kind: 'vino', country: 'Italia', region: 'Veneto', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 45.42, lon: 11.25 }, products: 'Soave Classico (garganega), Recioto di Soave',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Soave', lat: 45.42, lon: 11.25, what: 'il borgo murato col castello scaligero, uno dei più integri d\'Italia' },
      { day: 1, place: 'Monteforte d\'Alpone', lat: 45.42, lon: 11.28, what: 'i suoli vulcanici che danno al Soave la spina dorsale minerale' },
      { day: 1, place: 'Illasi', lat: 45.47, lon: 11.18, what: 'le valli d\'Illasi fra ville venete e ciliegi' },
    ],
    notes: 'Il Soave è stato a lungo il vino bianco italiano più svenduto: cercare i Classico di collina è tutta un\'altra bevuta, e costa poco.',
  },
  {
    id: 'wr-it-collio', emoji: '🍷', name: 'Strada del Vino e delle Ciliegie del Collio',
    kind: 'vino', country: 'Italia', region: 'Friuli Venezia Giulia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.96, lon: 13.47 }, products: 'Friulano, Ribolla Gialla, Malvasia, vini macerati (orange wine)',
    season: 'Settembre-ottobre per la vendemmia; maggio per le ciliegie.',
    stops: [
      { day: 1, place: 'Cormons', lat: 45.96, lon: 13.47, what: 'la capitale del Collio, con l\'Enoteca di Cormons e le osterie' },
      { day: 1, place: 'San Floriano del Collio', lat: 45.98, lon: 13.58, what: 'vigne che scavalcano il confine sloveno senza accorgersene' },
      { day: 2, place: 'Oslavia', lat: 45.96, lon: 13.60, what: 'la patria della Ribolla macerata in anfora, e il sacrario della Grande Guerra' },
      { day: 2, place: 'Cividale del Friuli', lat: 46.09, lon: 13.43, what: 'il Tempietto longobardo UNESCO e i Colli Orientali' },
    ],
    notes: 'Qui sono nati i vini bianchi macerati che hanno cambiato il gusto mondiale. Il confine con la Slovenia è invisibile: la Brda slovena è la stessa collina, con prezzi più bassi.',
  },
  {
    id: 'wr-it-cinqueterre', emoji: '🍷', name: 'Le vigne verticali delle Cinque Terre',
    kind: 'vino', country: 'Italia', region: 'Liguria', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 44.10, lon: 9.74 }, products: 'Cinque Terre bianco (bosco, albarola), Sciacchetrà passito',
    season: 'Aprile-giugno e settembre-ottobre (in agosto è invivibile).',
    stops: [
      { day: 1, place: 'Riomaggiore', lat: 44.10, lon: 9.74, what: 'i terrazzamenti a strapiombo e la cantina sociale sopra il paese' },
      { day: 1, place: 'Manarola', lat: 44.11, lon: 9.73, what: 'il vigneto-simbolo e la trenino monorotaia che porta l\'uva a valle' },
      { day: 2, place: 'Vernazza', lat: 44.13, lon: 9.68, what: 'il porticciolo e i sentieri fra i muretti a secco' },
      { day: 2, place: 'Monterosso al Mare', lat: 44.15, lon: 9.65, what: 'la zona più ampia, dove lo Sciacchetrà si assaggia davvero' },
    ],
    notes: 'Viticoltura eroica su 6.700 km di muretti a secco. Si gira SOLO in treno (Cinque Terre Express) o a piedi: l\'auto qui è un problema, non una soluzione. Lo Sciacchetrà è raro e caro: dividere una bottiglia in quattro è la mossa giusta.',
  },
  {
    id: 'wr-it-lambrusco', emoji: '🍷', name: 'Strada dei Vini e dei Sapori · Lambrusco e Balsamico',
    kind: 'gusto', country: 'Italia', region: 'Emilia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.65, lon: 10.93 }, products: 'Lambrusco di Sorbara e Grasparossa, aceto balsamico tradizionale',
    season: 'Tutto l\'anno; giugno per il Lambrusco in fresca, autunno per le acetaie.',
    stops: [
      { day: 1, place: 'Modena', lat: 44.65, lon: 10.93, what: 'il Duomo UNESCO, il mercato Albinelli e le acetaie nei sottotetti di città' },
      { day: 1, place: 'Spilamberto', lat: 44.53, lon: 11.02, what: 'il Museo del Balsamico Tradizionale e la Consorteria che lo giudica' },
      { day: 2, place: 'Castelvetro di Modena', lat: 44.51, lon: 11.00, what: 'il Grasparossa sulle colline, borgo a scacchiera e gnocco fritto' },
      { day: 2, place: 'Sorbara', lat: 44.75, lon: 11.02, what: 'la pianura del Lambrusco più chiaro e teso, quello che sembra rosé' },
    ],
    notes: 'Il balsamico TRADIZIONALE (bottiglietta da 100 ml, 12 o 25 anni, sigillo del consorzio) e la "glassa" da supermercato non sono lo stesso prodotto: qui si impara a leggere l\'etichetta. Le acetaie familiari si visitano su appuntamento, spesso gratis.',
  },
  {
    id: 'wr-it-romagna', emoji: '🍷', name: 'Strada dei Vini e dei Sapori dei Colli di Romagna',
    kind: 'vino', country: 'Italia', region: 'Emilia-Romagna', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.15, lon: 12.13 }, products: 'Sangiovese di Romagna, Albana (prima DOCG bianca d\'Italia)',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Bertinoro', lat: 44.15, lon: 12.13, what: 'il "balcone di Romagna" e la Colonna dell\'Ospitalità' },
      { day: 1, place: 'Predappio', lat: 44.10, lon: 11.98, what: 'sangiovese di collina e una storia del Novecento da raccontare con onestà' },
      { day: 2, place: 'Brisighella', lat: 44.22, lon: 11.77, what: 'la via degli Asini, tre pinnacoli e un olio DOP fra i migliori d\'Italia' },
      { day: 2, place: 'Faenza', lat: 44.29, lon: 11.88, what: 'la ceramica che ha dato il nome alla faïence, e la piadina giusta' },
    ],
    notes: 'La Romagna è la regione col miglior rapporto prezzo-qualità d\'Italia sul sangiovese, e con l\'accoglienza più semplice: qui si entra in cantina anche senza appuntamento.',
  },
  {
    id: 'wr-it-chianti', emoji: '🍷', name: 'La Chiantigiana — Strada del Chianti Classico',
    kind: 'vino', country: 'Italia', region: 'Toscana', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 43.77, lon: 11.26 }, products: 'Chianti Classico Gallo Nero, sangiovese, Vin Santo',
    season: 'Maggio-giugno e settembre-ottobre; luglio-agosto caldissimi e pieni.',
    stops: [
      { day: 1, place: 'Firenze', lat: 43.77, lon: 11.26, what: 'partenza da porta Romana sulla SR222, la Chiantigiana' },
      { day: 1, place: 'Greve in Chianti', lat: 43.58, lon: 11.32, what: 'la piazza a triangolo con le botteghe e il mercato del vino' },
      { day: 1, place: 'Panzano in Chianti', lat: 43.55, lon: 11.31, what: 'la Conca d\'Oro, l\'anfiteatro di vigne più fotografato del Chianti' },
      { day: 2, place: 'Radda in Chianti', lat: 43.48, lon: 11.37, what: 'il borgo murato al centro della Lega del Chianti' },
      { day: 2, place: 'Castellina in Chianti', lat: 43.47, lon: 11.28, what: 'la via delle Volte, camminamento medievale coperto' },
      { day: 2, place: 'Siena', lat: 43.32, lon: 11.33, what: 'arrivo in piazza del Campo: la strada finisce qui' },
    ],
    notes: 'Il Gallo Nero sul collo della bottiglia è il consorzio del Classico: il "Chianti" senza gallo è un\'altra denominazione, molto più larga. La SR222 è splendida ma piena di curve e ciclisti.',
  },
  {
    id: 'wr-it-montalcino', emoji: '🍷', name: 'Strada del Brunello di Montalcino',
    kind: 'vino', country: 'Italia', region: 'Toscana', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 43.06, lon: 11.49 }, products: 'Brunello di Montalcino, Rosso di Montalcino, Moscadello',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Montalcino', lat: 43.06, lon: 11.49, what: 'la fortezza trecentesca con l\'enoteca dentro le mura' },
      { day: 1, place: 'Torrenieri', lat: 43.09, lon: 11.61, what: 'il versante nord, Brunello più fine e la Via Francigena che passa di qui' },
      { day: 2, place: 'Sant\'Antimo', lat: 43.00, lon: 11.53, what: 'l\'abbazia romanica in mezzo agli ulivi: canto gregoriano agli orari fissi' },
      { day: 2, place: 'Buonconvento', lat: 43.13, lon: 11.48, what: 'borgo murato di pianura e il museo della mezzadria' },
    ],
    notes: 'Il Rosso di Montalcino è lo stesso sangiovese con meno invecchiamento: costa un terzo e in trattoria è la scelta giusta. Il Brunello esce sul mercato al quinto anno.',
  },
  {
    id: 'wr-it-montepulciano', emoji: '🍷', name: 'Nobile di Montepulciano e Val d\'Orcia',
    kind: 'vino', country: 'Italia', region: 'Toscana', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 43.10, lon: 11.78 }, products: 'Vino Nobile di Montepulciano (prugnolo gentile), pecorino di Pienza',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Montepulciano', lat: 43.10, lon: 11.78, what: 'le cantine storiche scavate sotto i palazzi rinascimentali del corso' },
      { day: 1, place: 'Pienza', lat: 43.08, lon: 11.68, what: 'la città ideale di Pio II e il pecorino: caseifici tutt\'intorno' },
      { day: 2, place: 'San Quirico d\'Orcia', lat: 43.06, lon: 11.60, what: 'gli Horti Leonini e la Val d\'Orcia UNESCO tutta attorno' },
      { day: 2, place: 'Bagno Vignoni', lat: 43.03, lon: 11.62, what: 'la piazza che è una vasca termale: chiusura della giornata in acqua calda' },
    ],
    notes: 'Attenzione all\'equivoco più comune del vino italiano: il "Nobile di MONTEPULCIANO" (Toscana, sangiovese) non c\'entra nulla col "MONTEPULCIANO d\'Abruzzo" (un vitigno diverso, altra regione).',
  },
  {
    id: 'wr-it-bolgheri', emoji: '🍷', name: 'Strada del Vino Costa degli Etruschi — Bolgheri',
    kind: 'vino', country: 'Italia', region: 'Toscana', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 43.23, lon: 10.60 }, products: 'Bolgheri Superiore, Sassicaia, cabernet e merlot sul mare',
    season: 'Maggio-giugno e settembre.',
    stops: [
      { day: 1, place: 'Bolgheri', lat: 43.23, lon: 10.60, what: 'il viale dei cipressi di Carducci, 5 km dritti fino al borgo' },
      { day: 1, place: 'Castagneto Carducci', lat: 43.16, lon: 10.61, what: 'il paese sul crinale con vista mare e le enoteche' },
      { day: 1, place: 'Suvereto', lat: 43.08, lon: 10.68, what: 'borgo medievale e la denominazione meno cara del comprensorio' },
      { day: 1, place: 'San Vincenzo', lat: 43.10, lon: 10.54, what: 'la spiaggia: qui si beve rosso importante e si finisce in acqua' },
    ],
    notes: 'La zona dei "Supertuscan": bottiglie che possono costare centinaia di euro. Le denominazioni vicine (Val di Cornia, Suvereto) fanno gli stessi vitigni sullo stesso mare a un quinto del prezzo.',
  },
  {
    id: 'wr-it-verdicchio', emoji: '🍷', name: 'Strada del Verdicchio dei Castelli di Jesi',
    kind: 'vino', country: 'Italia', region: 'Marche', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 43.52, lon: 13.24 }, products: 'Verdicchio dei Castelli di Jesi, Verdicchio di Matelica',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Jesi', lat: 43.52, lon: 13.24, what: 'città murata di Federico II, porta della denominazione' },
      { day: 1, place: 'Cupramontana', lat: 43.45, lon: 13.12, what: 'la "capitale del Verdicchio" e il museo dell\'etichetta' },
      { day: 1, place: 'Staffolo', lat: 43.42, lon: 13.18, what: 'il balcone della vallesina, fra i castelli che danno il nome al vino' },
    ],
    notes: 'Il Verdicchio invecchia benissimo, contro ogni luogo comune sui bianchi italiani: chiedi in cantina una bottiglia di dieci anni fa.',
  },
  {
    id: 'wr-it-montefalco', emoji: '🍷', name: 'Strada del Sagrantino',
    kind: 'vino', country: 'Italia', region: 'Umbria', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 42.89, lon: 12.65 }, products: 'Sagrantino di Montefalco (secco e passito), Grechetto',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Montefalco', lat: 42.89, lon: 12.65, what: 'la "ringhiera dell\'Umbria" e gli affreschi di Benozzo Gozzoli' },
      { day: 1, place: 'Bevagna', lat: 42.93, lon: 12.61, what: 'le botteghe medievali del Mercato delle Gaite, piazza romanica perfetta' },
      { day: 2, place: 'Spello', lat: 42.99, lon: 12.67, what: 'i vicoli fioriti e la cappella Baglioni del Pinturicchio' },
      { day: 2, place: 'Torgiano', lat: 43.02, lon: 12.43, what: 'il Museo del Vino, fra i migliori d\'Europa, e quello dell\'Olivo' },
    ],
    notes: 'Il Sagrantino è il vino più tannico d\'Italia: due bicchieri sono già molti. La versione passito, dolce, era l\'originale.',
  },
  {
    id: 'wr-it-castelliromani', emoji: '🍷', name: 'Strada dei Vini dei Castelli Romani',
    kind: 'vino', country: 'Italia', region: 'Lazio', continent: 'Europa', days: 1, transport: 'treno',
    coords: { lat: 41.81, lon: 12.68 }, products: 'Frascati, Marino, Cesanese (dal vicino Piglio)',
    season: 'Tutto l\'anno; ottobre per le sagre dell\'uva.',
    stops: [
      { day: 1, place: 'Frascati', lat: 41.81, lon: 12.68, what: 'le ville tuscolane e le "fraschette", cantine dove si porta il cibo da casa' },
      { day: 1, place: 'Grottaferrata', lat: 41.79, lon: 12.67, what: 'l\'abbazia greca di San Nilo, monastero bizantino ancora attivo' },
      { day: 1, place: 'Marino', lat: 41.77, lon: 12.66, what: 'la Sagra dell\'Uva di ottobre, quando dalle fontane esce vino' },
      { day: 1, place: 'Genzano di Roma', lat: 41.69, lon: 12.69, what: 'il pane DOP a lievito madre e il lago di Nemi sotto' },
    ],
    notes: 'Trenta minuti di treno da Roma Termini: la gita fuori porta dei romani da sempre. Le fraschette sono l\'esperienza vera, altro che ristorante.',
  },
  {
    id: 'wr-it-abruzzo', emoji: '🍷', name: 'Strada del Vino e dell\'Olio d\'Abruzzo',
    kind: 'vino', country: 'Italia', region: 'Abruzzo', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 42.43, lon: 13.99 }, products: 'Montepulciano d\'Abruzzo, Trebbiano, Cerasuolo, olio dop',
    season: 'Aprile-giugno e settembre-novembre (novembre per i frantoi).',
    stops: [
      { day: 1, place: 'Loreto Aprutino', lat: 42.43, lon: 13.99, what: 'olio extravergine dop Aprutino Pescarese e il museo dell\'olio' },
      { day: 1, place: 'Chieti', lat: 42.35, lon: 14.17, what: 'il Guerriero di Capestrano al museo archeologico, fra le vigne e il mare' },
      { day: 2, place: 'Tocco da Casauria', lat: 42.21, lon: 13.92, what: 'ai piedi della Majella: cantine storiche e l\'abbazia di San Clemente' },
      { day: 2, place: 'Ortona', lat: 42.36, lon: 14.40, what: 'la Costa dei Trabocchi: si beve Montepulciano su una palafitta di pesca' },
    ],
    notes: 'Il Cerasuolo d\'Abruzzo è un rosato con una denominazione tutta sua, non un ripiego: d\'estate col pesce dei trabocchi è la combinazione giusta.',
  },
  {
    id: 'wr-it-irpinia', emoji: '🍷', name: 'Strada dei Vini d\'Irpinia',
    kind: 'vino', country: 'Italia', region: 'Campania', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 40.91, lon: 14.79 }, products: 'Taurasi, Fiano di Avellino, Greco di Tufo — tre DOCG',
    season: 'Settembre-ottobre (qui si vendemmia tardissimo, anche a novembre).',
    stops: [
      { day: 1, place: 'Avellino', lat: 40.91, lon: 14.79, what: 'base e capitale del Fiano, il bianco campano che invecchia' },
      { day: 1, place: 'Tufo', lat: 41.01, lon: 14.83, what: 'le miniere di zolfo sotto i vigneti: da lì il nome e il carattere del Greco' },
      { day: 2, place: 'Taurasi', lat: 41.01, lon: 14.96, what: 'l\'aglianico più longevo del sud, e un castello con enoteca' },
      { day: 2, place: 'Lapio', lat: 40.98, lon: 14.91, what: 'il cru storico del Fiano, a 600 metri sopra il mare' },
    ],
    notes: 'Tre DOCG in trenta chilometri: densità unica nel sud Italia. Si sale in quota, le sere sono fresche anche d\'estate.',
  },
  {
    id: 'wr-it-vesuvio', emoji: '🍷', name: 'Lacryma Christi — le vigne del Vesuvio',
    kind: 'vino', country: 'Italia', region: 'Campania', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 40.78, lon: 14.46 }, products: 'Lacryma Christi del Vesuvio, caprettone, piedirosso',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Boscotrecase', lat: 40.78, lon: 14.46, what: 'vigne su lava dentro il Parco Nazionale del Vesuvio' },
      { day: 1, place: 'Pompei', lat: 40.75, lon: 14.49, what: 'gli scavi, dove i vigneti sono stati ripiantati sui filari romani veri' },
      { day: 1, place: 'Ercolano', lat: 40.81, lon: 14.35, what: 'la città sepolta meglio conservata e le Ville Vesuviane del Miglio d\'Oro' },
    ],
    notes: 'La combinazione più forte d\'Italia fra archeologia e vino: nei Giardini di Pompei si vendemmia dentro il sito, sulle tracce delle radici originali.',
  },
  {
    id: 'wr-it-valleitria', emoji: '🍷', name: 'Primitivo e Valle d\'Itria',
    kind: 'vino', country: 'Italia', region: 'Puglia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 40.40, lon: 17.63 }, products: 'Primitivo di Manduria, Verdeca e Bianco d\'Alessano, Gioia del Colle',
    season: 'Aprile-giugno e settembre (agosto rovente).',
    stops: [
      { day: 1, place: 'Manduria', lat: 40.40, lon: 17.63, what: 'il museo della civiltà del vino primitivo, ricavato in un palmento' },
      { day: 1, place: 'Gioia del Colle', lat: 40.80, lon: 16.92, what: 'il primitivo d\'altura, più fine e meno alcolico di quello di Manduria' },
      { day: 2, place: 'Locorotondo', lat: 40.75, lon: 17.33, what: 'il centro bianco a cummerse e il bianco secco della valle' },
      { day: 2, place: 'Martina Franca', lat: 40.70, lon: 17.34, what: 'barocco, capocollo presidio Slow Food e i trulli tutt\'intorno' },
    ],
    notes: 'Il Primitivo è geneticamente lo Zinfandel californiano: stessa uva, due continenti. Gradazioni alte (14-15°): mangia mentre bevi.',
  },
  {
    id: 'wr-it-salento', emoji: '🍷', name: 'Strada del Vino del Salento',
    kind: 'vino', country: 'Italia', region: 'Puglia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 40.35, lon: 18.17 }, products: 'Negroamaro, Salice Salentino, rosati storici',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Lecce', lat: 40.35, lon: 18.17, what: 'il barocco in pietra leccese e le enoteche di piazzetta' },
      { day: 1, place: 'Salice Salentino', lat: 40.38, lon: 17.97, what: 'la DOC che ha fatto conoscere il negroamaro nel mondo' },
      { day: 2, place: 'Copertino', lat: 40.27, lon: 18.05, what: 'il castello angioino e le cantine cooperative storiche' },
      { day: 2, place: 'Otranto', lat: 40.15, lon: 18.49, what: 'il mosaico dell\'Albero della Vita e il mare più a est d\'Italia' },
    ],
    notes: 'Il Salento ha inventato il rosato italiano moderno (Five Roses, 1943, il primo imbottigliato d\'Italia): non è un vino di ripiego, è la tradizione locale.',
  },
  {
    id: 'wr-it-vulture', emoji: '🍷', name: 'Strada dell\'Aglianico del Vulture',
    kind: 'vino', country: 'Italia', region: 'Basilicata', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 40.92, lon: 15.67 }, products: 'Aglianico del Vulture DOCG, uve su suolo vulcanico',
    season: 'Ottobre-novembre (vendemmia tardiva) e maggio-giugno.',
    stops: [
      { day: 1, place: 'Rionero in Vulture', lat: 40.92, lon: 15.67, what: 'base della denominazione, ai piedi del vulcano spento' },
      { day: 1, place: 'Barile', lat: 40.94, lon: 15.68, what: 'gli "sheshë": cantine scavate nel tufo lungo un\'intera via, comunità arbëreshë' },
      { day: 1, place: 'Venosa', lat: 40.96, lon: 15.82, what: 'la città di Orazio, l\'Incompiuta e il parco archeologico' },
      { day: 1, place: 'Melfi', lat: 41.00, lon: 15.65, what: 'il castello di Federico II e i laghi di Monticchio nel cratere' },
    ],
    notes: 'Uno dei grandi rossi italiani ancora a prezzi onesti. Le cantine nel tufo di Barile sono l\'immagine che ci si porta a casa.',
  },
  {
    id: 'wr-it-ciro', emoji: '🍷', name: 'Cirò — la strada del vino più antica d\'Italia',
    kind: 'vino', country: 'Italia', region: 'Calabria', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 39.38, lon: 17.06 }, products: 'Cirò (gaglioppo), il vino degli atleti di Crotone',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Cirò', lat: 39.38, lon: 17.06, what: 'il borgo alto e le cantine familiari fra ulivi e vigne' },
      { day: 1, place: 'Cirò Marina', lat: 39.37, lon: 17.13, what: 'il mare e le cantine grandi; il Cirò rosato è la sorpresa' },
      { day: 1, place: 'Crotone', lat: 39.08, lon: 17.13, what: 'Capo Colonna e il museo: qui il vino si beve da 2.700 anni' },
    ],
    notes: 'La leggenda vuole che il Cirò fosse il "krimisa" offerto agli atleti olimpici della Magna Grecia. Denominazione tra le più antiche e tra le meno care d\'Italia.',
  },
  {
    id: 'wr-it-etna', emoji: '🌋', name: 'Strada del Vino dell\'Etna',
    kind: 'vino', country: 'Italia', region: 'Sicilia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 37.88, lon: 14.95 }, products: 'Etna Rosso (nerello mascalese), Etna Bianco (carricante)',
    season: 'Maggio-giugno e settembre-ottobre; d\'inverno può nevicare sulle vigne.',
    stops: [
      { day: 1, place: 'Randazzo', lat: 37.88, lon: 14.95, what: 'la città di pietra lavica sul versante nord, il migliore per il rosso' },
      { day: 1, place: 'Castiglione di Sicilia', lat: 37.88, lon: 15.12, what: 'le contrade di Solicchiata e Passopisciaro, i "cru" dell\'Etna' },
      { day: 2, place: 'Linguaglossa', lat: 37.84, lon: 15.14, what: 'i palmenti storici e i vigneti a piede franco, mai toccati dalla fillossera' },
      { day: 2, place: 'Milo', lat: 37.72, lon: 15.12, what: 'il versante est: l\'unico dove nasce l\'Etna Bianco Superiore' },
    ],
    notes: 'Si beve a 700-1.000 metri di quota su un vulcano attivo: le contrade qui contano come i cru di Borgogna. Vigne prefillosseriche vecchie di 150 anni.',
  },
  {
    id: 'wr-it-marsala', emoji: '🍷', name: 'Marsala e la Sicilia occidentale',
    kind: 'vino', country: 'Italia', region: 'Sicilia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 37.80, lon: 12.44 }, products: 'Marsala (vergine e superiore), grillo, zibibbo, sale marino',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Marsala', lat: 37.80, lon: 12.44, what: 'i "bagli" storici degli inglesi Woodhouse e Whitaker, dove nacque il vino' },
      { day: 1, place: 'Trapani', lat: 38.02, lon: 12.53, what: 'le saline coi mulini a vento fra le vasche rosa' },
      { day: 2, place: 'Mazara del Vallo', lat: 37.65, lon: 12.59, what: 'la casbah e il Satiro danzante, con il grillo di pianura' },
      { day: 2, place: 'Pantelleria', lat: 36.83, lon: 11.94, what: 'lo zibibbo ad alberello, patrimonio immateriale UNESCO (in aereo o traghetto)' },
    ],
    notes: 'Il Marsala vero — vergine, secco — non ha nulla a che vedere con quello da cucina: è un vino fortificato da meditazione, come uno sherry.',
  },
  {
    id: 'wr-it-sardegna', emoji: '🍷', name: 'Cannonau e Vermentino di Sardegna',
    kind: 'vino', country: 'Italia', region: 'Sardegna', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 40.27, lon: 9.40 }, products: 'Cannonau, Vermentino di Gallura DOCG, Carignano del Sulcis',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Oliena', lat: 40.27, lon: 9.40, what: 'il Cannonau del Supramonte e la sorgente di Su Gologone' },
      { day: 1, place: 'Mamoiada', lat: 40.21, lon: 9.35, what: 'i Mamuthones, il museo delle maschere e cannonau di vigne vecchie' },
      { day: 2, place: 'Jerzu', lat: 39.79, lon: 9.52, what: 'la "città del vino" ogliastrina, sotto i tacchi calcarei' },
      { day: 3, place: 'Berchidda', lat: 40.79, lon: 9.17, what: 'la Gallura del Vermentino DOCG e il museo del vino' },
      { day: 3, place: 'Tempio Pausania', lat: 40.90, lon: 9.10, what: 'granito, sughero e il vermentino più minerale' },
    ],
    notes: 'La Barbagia del Cannonau è una delle cinque "zone blu" della longevità del mondo. Le distanze in Sardegna ingannano: strade belle ma lente.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// FRANCIA — les routes des vins
// ─────────────────────────────────────────────────────────────────────

const FRANCIA: TasteRoute[] = [
  {
    id: 'wr-fr-alsace', emoji: '🍷', name: 'Route des Vins d\'Alsace',
    kind: 'vino', country: 'Francia', region: 'Alsazia', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 48.62, lon: 7.49 }, products: 'Riesling, Gewurztraminer, Pinot gris, Crémant d\'Alsace',
    season: 'Settembre-ottobre per la vendemmia; dicembre per i mercatini fra le vigne.',
    stops: [
      { day: 1, place: 'Marlenheim', lat: 48.62, lon: 7.49, what: 'la porta nord: qui la route comincia ufficialmente (170 km in tutto)' },
      { day: 1, place: 'Ribeauvillé', lat: 48.20, lon: 7.32, what: 'tre castelli sopra il paese e i grand cru Geisberg e Osterberg' },
      { day: 2, place: 'Riquewihr', lat: 48.17, lon: 7.30, what: 'il villaggio a graticcio più famoso d\'Alsazia, dentro le mura del Cinquecento' },
      { day: 2, place: 'Colmar', lat: 48.08, lon: 7.36, what: 'la Petite Venise e il Museo Unterlinden: base ideale per dormire' },
      { day: 3, place: 'Eguisheim', lat: 48.04, lon: 7.31, what: 'il borgo circolare concentrico, culla della viticoltura alsaziana' },
      { day: 3, place: 'Thann', lat: 47.81, lon: 7.10, what: 'la fine della route e il Rangen, grand cru vulcanico più ripido d\'Alsazia' },
    ],
    notes: 'La route des vins più antica di Francia (1953) e la più segnalata: si segue senza navigatore. In Alsazia il vitigno è scritto in etichetta, cosa rarissima in Francia. Molte cantine fanno degustazione libera senza appuntamento.',
  },
  {
    id: 'wr-fr-bourgogne', emoji: '🍷', name: 'Route des Grands Crus de Bourgogne',
    kind: 'vino', country: 'Francia', region: 'Borgogna', continent: 'Europa', days: 3, transport: 'bici',
    coords: { lat: 47.32, lon: 5.04 }, products: 'Pinot noir e Chardonnay dei climat UNESCO',
    season: 'Maggio-giugno e settembre; terza domenica di novembre per l\'asta degli Hospices.',
    stops: [
      { day: 1, place: 'Digione', lat: 47.32, lon: 5.04, what: 'partenza: la Cité de la Gastronomie et du Vin e la senape vera' },
      { day: 1, place: 'Gevrey-Chambertin', lat: 47.22, lon: 4.97, what: 'nove grand cru in un solo comune, il primato della Côte de Nuits' },
      { day: 2, place: 'Vougeot', lat: 47.18, lon: 4.95, what: 'il Clos de Vougeot dei monaci cistercensi, 50 ettari murati dal Medioevo' },
      { day: 2, place: 'Nuits-Saint-Georges', lat: 47.13, lon: 4.95, what: 'il centro dei négociants e le cave sotto la città' },
      { day: 3, place: 'Beaune', lat: 47.02, lon: 4.84, what: 'gli Hospices col tetto di tegole smaltate: la capitale del vino di Borgogna' },
      { day: 3, place: 'Meursault', lat: 46.98, lon: 4.77, what: 'i grandi chardonnay della Côte de Beaune' },
      { day: 3, place: 'Puligny-Montrachet', lat: 46.94, lon: 4.75, what: 'il bianco più caro del mondo nasce in questi pochi ettari' },
    ],
    notes: 'I "climat" di Borgogna sono patrimonio UNESCO: 1.247 parcelle riconosciute una per una. La Voie des Vignes è una ciclabile che affianca la strada per 20 km: qui la bici è meglio dell\'auto. I domaine piccoli ricevono SOLO su appuntamento scritto.',
  },
  {
    id: 'wr-fr-champagne', emoji: '🥂', name: 'Route Touristique du Champagne',
    kind: 'vino', country: 'Francia', region: 'Champagne', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 49.26, lon: 4.03 }, products: 'Champagne: pinot noir, meunier, chardonnay',
    season: 'Aprile-ottobre; settembre per la vendemmia (tutta a mano, per legge).',
    stops: [
      { day: 1, place: 'Reims', lat: 49.26, lon: 4.03, what: 'la cattedrale dei re di Francia e le crayères, cave romane di gesso' },
      { day: 1, place: 'Hautvillers', lat: 49.08, lon: 3.95, what: 'l\'abbazia dove è sepolto Dom Pérignon: qui nasce il mito' },
      { day: 2, place: 'Aÿ', lat: 49.05, lon: 4.01, what: 'grand cru di pinot noir e il museo Pressoria sulla vinificazione' },
      { day: 2, place: 'Épernay', lat: 49.04, lon: 3.96, what: 'l\'Avenue de Champagne: 110 km di gallerie sotto i piedi' },
      { day: 2, place: 'Avize', lat: 48.97, lon: 4.01, what: 'la Côte des Blancs: chardonnay puro, i blanc de blancs' },
    ],
    notes: 'Le grandi maison si visitano tutti i giorni con biglietto (spesso online, con degustazione inclusa); i "récoltants-manipulants" — i vignaioli che fanno il proprio champagne — costano metà e ricevono su appuntamento. Coteaux, Maisons et Caves de Champagne sono UNESCO.',
  },
  {
    id: 'wr-fr-medoc', emoji: '🍷', name: 'Route des Châteaux du Médoc (D2)',
    kind: 'vino', country: 'Francia', region: 'Bordeaux', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.84, lon: -0.58 }, products: 'Cabernet sauvignon, i cru classés del 1855',
    season: 'Maggio-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Bordeaux', lat: 44.84, lon: -0.58, what: 'partenza dalla Cité du Vin e dal Port de la Lune UNESCO' },
      { day: 1, place: 'Margaux', lat: 45.04, lon: -0.68, what: 'la prima grande appellation lungo la D2, château come palazzi' },
      { day: 2, place: 'Saint-Julien-Beychevelle', lat: 45.16, lon: -0.74, what: 'la maggior concentrazione di cru classés per ettaro del Médoc' },
      { day: 2, place: 'Pauillac', lat: 45.20, lon: -0.75, what: 'tre premier cru in un solo comune: Lafite, Latour, Mouton' },
      { day: 2, place: 'Saint-Estèphe', lat: 45.26, lon: -0.77, what: 'la punta nord, vini più austeri e prezzi più umani' },
    ],
    notes: 'La D2 è chiamata "route des châteaux": si guida fra le facciate più fotografate del vino mondiale. I grandi nomi ricevono SOLO su appuntamento e spesso a pagamento; i cru bourgeois accanto fanno lo stesso terroir a un decimo. Bordeaux dista 40 minuti: si dorme in città.',
  },
  {
    id: 'wr-fr-saintemilion', emoji: '🍷', name: 'Saint-Émilion e il Libournais',
    kind: 'vino', country: 'Francia', region: 'Bordeaux', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 44.89, lon: -0.16 }, products: 'Merlot, cabernet franc; Pomerol e Saint-Émilion',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Saint-Émilion', lat: 44.89, lon: -0.16, what: 'la chiesa monolitica scavata nella roccia e il borgo UNESCO' },
      { day: 1, place: 'Pomerol', lat: 44.93, lon: -0.19, what: 'nessun castello scenografico, solo le vigne più care di Francia' },
      { day: 1, place: 'Libourne', lat: 44.91, lon: -0.24, what: 'la bastide sul fiume, il mercato e i négociants storici' },
    ],
    notes: 'La riva destra è merlot: vini più morbidi e pronti prima di quelli del Médoc. Saint-Émilion è patrimonio UNESCO come paesaggio vitivinicolo, il primo al mondo a esserlo.',
  },
  {
    id: 'wr-fr-loire', emoji: '🍷', name: 'Route des Vins de la Vallée de la Loire',
    kind: 'vino', country: 'Francia', region: 'Valle della Loira', continent: 'Europa', days: 3, transport: 'bici',
    coords: { lat: 47.33, lon: 2.84 }, products: 'Sauvignon blanc, chenin, cabernet franc; Sancerre, Vouvray, Chinon',
    season: 'Maggio-giugno e settembre.',
    stops: [
      { day: 1, place: 'Sancerre', lat: 47.33, lon: 2.84, what: 'il borgo su una collina isolata e il sauvignon che ha fatto scuola nel mondo' },
      { day: 2, place: 'Vouvray', lat: 47.41, lon: 0.80, what: 'chenin blanc e cantine scavate nel tufo, dal secco al liquoroso' },
      { day: 2, place: 'Chinon', lat: 47.17, lon: 0.24, what: 'la fortezza dei Plantageneti e il cabernet franc più elegante' },
      { day: 3, place: 'Saumur', lat: 47.26, lon: -0.08, what: 'le bollicine metodo tradizionale e le case trogloditiche di tufo' },
      { day: 3, place: 'Angers', lat: 47.47, lon: -0.55, what: 'l\'Arazzo dell\'Apocalisse e i vini d\'Anjou' },
    ],
    notes: 'La Loire à Vélo è una ciclabile di 900 km che collega quasi tutte le tappe passando dai castelli: è il modo giusto di fare questa strada. La valle della Loira è UNESCO da Sully a Chalonnes.',
  },
  {
    id: 'wr-fr-rhone', emoji: '🍷', name: 'Route des Vins de la Vallée du Rhône',
    kind: 'vino', country: 'Francia', region: 'Rodano', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.49, lon: 4.81 }, products: 'Syrah al nord, grenache al sud; Côte-Rôtie, Hermitage, Châteauneuf-du-Pape',
    season: 'Aprile-giugno e settembre-ottobre. Attenzione al mistral.',
    stops: [
      { day: 1, place: 'Ampuis', lat: 45.49, lon: 4.81, what: 'la Côte-Rôtie: terrazze a picco sul fiume, syrah puro' },
      { day: 1, place: 'Tain-l\'Hermitage', lat: 45.07, lon: 4.85, what: 'la collina dell\'Hermitage e la fabbrica di cioccolato Valrhona accanto' },
      { day: 2, place: 'Gigondas', lat: 44.19, lon: 5.00, what: 'sotto le Dentelles de Montmirail, il grenache più roccioso' },
      { day: 2, place: 'Châteauneuf-du-Pape', lat: 44.06, lon: 4.83, what: 'i ciottoli grandi come pugni e le rovine del castello dei papi' },
    ],
    notes: 'Due Rodani in uno: il nord fa syrah in purezza su pendii impossibili, il sud assemblaggi di tredici uve su ciottoli. Fra i due passano cento chilometri di autostrada.',
  },
  {
    id: 'wr-fr-provence', emoji: '🌸', name: 'Route des Vins de Provence',
    kind: 'vino', country: 'Francia', region: 'Provenza', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 43.53, lon: 5.45 }, products: 'Rosé di Provenza, Bandol (mourvèdre), Cassis bianco',
    season: 'Aprile-giugno e settembre (luglio-agosto pienissimi); giugno-luglio per la lavanda.',
    stops: [
      { day: 1, place: 'Aix-en-Provence', lat: 43.53, lon: 5.45, what: 'base elegante, il corso Mirabeau e la montagna Sainte-Victoire di Cézanne' },
      { day: 1, place: 'Lorgues', lat: 43.49, lon: 6.36, what: 'il cuore delle Côtes de Provence, fra ulivi e domaine aperti' },
      { day: 2, place: 'Bandol', lat: 43.14, lon: 5.75, what: 'i terrazzamenti a "restanques" sul mare e il rosso che invecchia vent\'anni' },
      { day: 2, place: 'Cassis', lat: 43.21, lon: 5.54, what: 'le calanques e un bianco secco che si beve solo lì' },
    ],
    notes: 'La Provenza produce quasi metà del rosé AOC francese, ma il Bandol ROSSO è il vino serio della zona e quasi nessun turista lo assaggia. Da Cassis parte l\'escursione in barca alle calanques.',
  },
  {
    id: 'wr-fr-jura', emoji: '🍷', name: 'Route des Vins du Jura',
    kind: 'vino', country: 'Francia', region: 'Giura', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 46.90, lon: 5.77 }, products: 'Vin jaune (savagnin sotto velo), Crémant du Jura, Comté',
    season: 'Maggio-ottobre; primo weekend di febbraio per la Percée du Vin Jaune.',
    stops: [
      { day: 1, place: 'Arbois', lat: 46.90, lon: 5.77, what: 'la casa di Pasteur, che qui studiò la fermentazione, e le cantine del paese' },
      { day: 1, place: 'Poligny', lat: 46.84, lon: 5.71, what: 'la capitale del Comté: la Maison du Comté spiega tutto il ciclo' },
      { day: 2, place: 'Château-Chalon', lat: 46.75, lon: 5.63, what: 'il vin jaune per eccellenza, dal belvedere sul reculée' },
      { day: 2, place: 'L\'Étoile', lat: 46.71, lon: 5.53, what: 'chardonnay giurassiani e i fossili a forma di stella nel terreno' },
    ],
    notes: 'Il vin jaune matura sei anni e tre mesi in botte scolma, sotto un velo di lieviti come uno sherry, e si imbottiglia nel clavelin da 62 cl — l\'unico formato del genere in Europa. Comté e vin jaune sono l\'abbinamento della zona: qui vino e formaggio fanno la stessa strada.',
  },
  {
    id: 'wr-fr-beaujolais', emoji: '🍷', name: 'Route des Vins du Beaujolais',
    kind: 'vino', country: 'Francia', region: 'Beaujolais', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 45.99, lon: 4.72 }, products: 'Gamay: i dieci cru, dal Fleurie al Morgon',
    season: 'Maggio-ottobre; terzo giovedì di novembre per il novello (che è la parte meno interessante).',
    stops: [
      { day: 1, place: 'Villefranche-sur-Saône', lat: 45.99, lon: 4.72, what: 'la capitale storica, porta d\'ingresso a mezz\'ora da Lione' },
      { day: 1, place: 'Oingt', lat: 45.93, lon: 4.58, what: 'la "terra delle pietre dorate": borghi color miele fra le vigne' },
      { day: 1, place: 'Fleurie', lat: 46.19, lon: 4.70, what: 'il cru più floreale, con la cappella della Madonna sopra i filari' },
      { day: 1, place: 'Villié-Morgon', lat: 46.16, lon: 4.68, what: 'il Morgon, il cru che invecchia e smentisce la fama del Beaujolais' },
    ],
    notes: 'Il Beaujolais Nouveau ha rovinato la reputazione di una zona che fa dieci cru seri e a buon mercato. Da Lione ci si arriva in quaranta minuti: è la gita fuori porta dei lionesi.',
  },
  {
    id: 'wr-fr-sudouest', emoji: '🍷', name: 'Vignobles du Sud-Ouest — Cahors, Gaillac, Jurançon',
    kind: 'vino', country: 'Francia', region: 'Sud-Ovest', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 44.45, lon: 1.44 }, products: 'Malbec di Cahors, Gaillac, Madiran (tannat), Jurançon dolce',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Cahors', lat: 44.45, lon: 1.44, what: 'il ponte Valentré e il "vin noir": il malbec è nato qui, prima dell\'Argentina' },
      { day: 2, place: 'Gaillac', lat: 43.90, lon: 1.90, what: 'uno dei vigneti più antichi di Francia, vitigni locali introvabili altrove' },
      { day: 3, place: 'Madiran', lat: 43.55, lon: -0.06, what: 'il tannat, il rosso più tannico d\'Europa, e il paradosso francese della longevità' },
      { day: 3, place: 'Jurançon', lat: 43.29, lon: -0.38, what: 'il bianco dolce dei Pirenei con cui fu battezzato Enrico IV' },
    ],
    notes: 'Il Sud-Ovest è il serbatoio di vitigni autoctoni della Francia: qui si assaggiano uve che non esistono da nessun\'altra parte. Prezzi molto più bassi di Bordeaux, a due ore di strada.',
  },
  {
    id: 'wr-fr-languedoc', emoji: '🍷', name: 'Route des Vins du Languedoc et Roussillon',
    kind: 'vino', country: 'Francia', region: 'Occitania', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 43.18, lon: 3.00 }, products: 'Corbières, Minervois, Faugères, Banyuls (vin doux naturel)',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Narbonne', lat: 43.18, lon: 3.00, what: 'la cattedrale incompiuta e il Canal de la Robine UNESCO' },
      { day: 1, place: 'Minerve', lat: 43.35, lon: 2.75, what: 'il borgo cataro sospeso su due gole, capitale del Minervois' },
      { day: 2, place: 'Faugères', lat: 43.55, lon: 3.18, what: 'lo scisto che dà ai rossi un profilo minerale, fra i mulini a vento' },
      { day: 2, place: 'Banyuls-sur-Mer', lat: 42.48, lon: 3.13, what: 'terrazze a picco sul Mediterraneo e il vin doux naturel col cioccolato' },
      { day: 2, place: 'Collioure', lat: 42.53, lon: 3.08, what: 'il porto dei fauve: stesse vigne di Banyuls, ma il vino secco' },
    ],
    notes: 'Il vigneto più esteso del mondo per superficie continua. Trent\'anni fa faceva vino sfuso, oggi è la zona più dinamica di Francia sul rapporto qualità-prezzo.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// PENISOLA IBERICA
// ─────────────────────────────────────────────────────────────────────

const IBERIA: TasteRoute[] = [
  {
    id: 'wr-es-rioja', emoji: '🍷', name: 'Ruta del Vino de Rioja Alta',
    kind: 'vino', country: 'Spagna', region: 'La Rioja', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 42.58, lon: -2.85 }, products: 'Tempranillo; Crianza, Reserva, Gran Reserva',
    season: 'Aprile-giugno e settembre-ottobre; 29 giugno per la Batalla del Vino di Haro.',
    stops: [
      { day: 1, place: 'Haro', lat: 42.58, lon: -2.85, what: 'il Barrio de la Estación: sette bodegas storiche in cinque minuti a piedi' },
      { day: 1, place: 'Briones', lat: 42.54, lon: -2.78, what: 'borgo sulla rupe e il museo Vivanco della cultura del vino, il migliore di Spagna' },
      { day: 2, place: 'Elciego', lat: 42.51, lon: -2.62, what: 'il titanio ondulato di Frank Gehry appoggiato su una bodega dell\'Ottocento' },
      { day: 2, place: 'Laguardia', lat: 42.55, lon: -2.58, what: 'il paese murato con trecento calados, cantine medievali sotto le case' },
      { day: 2, place: 'Logroño', lat: 42.47, lon: -2.44, what: 'calle Laurel: cinquanta bar di pinchos in due vicoli' },
    ],
    notes: 'Il Barrio de la Estación di Haro è la maggior concentrazione di bodegas centenarie al mondo, e si gira a piedi: il posto giusto per chi non vuole guidare. Laguardia è tecnicamente Rioja Alavesa, Paese Basco.',
  },
  {
    id: 'wr-es-ribera', emoji: '🍷', name: 'Ruta del Vino Ribera del Duero',
    kind: 'vino', country: 'Spagna', region: 'Castiglia e León', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 41.60, lon: -4.12 }, products: 'Tinta del País (tempranillo) a 800 metri di quota',
    season: 'Maggio-giugno e settembre-ottobre; inverni molto rigidi.',
    stops: [
      { day: 1, place: 'Peñafiel', lat: 41.60, lon: -4.12, what: 'il castello a forma di nave con dentro il museo del vino' },
      { day: 1, place: 'Valbuena de Duero', lat: 41.64, lon: -4.28, what: 'il monastero di Santa María de Valbuena e le bodegas d\'autore' },
      { day: 2, place: 'Roa', lat: 41.69, lon: -3.92, what: 'le bodegas sotterranee scavate sotto il paese, ancora in uso' },
      { day: 2, place: 'Aranda de Duero', lat: 41.67, lon: -3.69, what: 'sette chilometri di gallerie sotto il centro e il lechazo al forno a legna' },
    ],
    notes: 'La Ribera è più alta, più fredda e più concentrata della Rioja. Il piatto obbligatorio è il lechazo (agnello da latte) nel forno di mattoni: si prenota la mattina per il pranzo.',
  },
  {
    id: 'wr-es-priorat', emoji: '🍷', name: 'Ruta del Vi del Priorat',
    kind: 'vino', country: 'Spagna', region: 'Catalogna', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 41.14, lon: 0.82 }, products: 'Garnacha e cariñena su llicorella (ardesia)',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Falset', lat: 41.14, lon: 0.82, what: 'la capitale della comarca, con la cooperativa modernista "cattedrale del vino"' },
      { day: 1, place: 'Gratallops', lat: 41.20, lon: 0.75, what: 'il paese dove negli anni Ottanta cinque vignaioli hanno rifondato il Priorat' },
      { day: 1, place: 'Scala Dei', lat: 41.27, lon: 0.82, what: 'la certosa che portò la vite qui nel XII secolo, ai piedi del Montsant' },
    ],
    notes: 'Pendenze fino al 60% su ardesia nera: rese bassissime e prezzi alti di conseguenza. Le cooperative modeniste di Falset e Gandesa, firmate da un allievo di Gaudí, valgono il viaggio da sole.',
  },
  {
    id: 'wr-es-penedes', emoji: '🥂', name: 'Ruta del Cava — Penedès',
    kind: 'vino', country: 'Spagna', region: 'Catalogna', continent: 'Europa', days: 1, transport: 'treno',
    coords: { lat: 41.43, lon: 1.78 }, products: 'Cava metodo tradizionale: macabeo, xarel·lo, parellada',
    season: 'Tutto l\'anno.',
    stops: [
      { day: 1, place: 'Sant Sadurní d\'Anoia', lat: 41.43, lon: 1.78, what: 'la capitale del cava: chilometri di cave sotterranee visitabili col trenino' },
      { day: 1, place: 'Vilafranca del Penedès', lat: 41.35, lon: 1.70, what: 'il VINSEUM, museo delle culture del vino, e i castellers' },
      { day: 1, place: 'Sitges', lat: 41.24, lon: 1.81, what: 'chiusura sul mare, a venti minuti: spiaggia e cena' },
    ],
    notes: 'Quaranta minuti di treno da Barcellona Sants, con le cantine a piedi dalla stazione: una delle rare strade del vino che si fa senza auto e senza compromessi.',
  },
  {
    id: 'wr-es-jerez', emoji: '🍷', name: 'Ruta del Vino y Brandy del Marco de Jerez',
    kind: 'vino', country: 'Spagna', region: 'Andalusia', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 36.69, lon: -6.14 }, products: 'Fino, Manzanilla, Amontillado, Oloroso, Pedro Ximénez',
    season: 'Marzo-giugno e settembre-ottobre; maggio per la Feria del Caballo.',
    stops: [
      { day: 1, place: 'Jerez de la Frontera', lat: 36.69, lon: -6.14, what: 'le bodegas-cattedrale, la scuola equestre e il flamenco dei barrios' },
      { day: 2, place: 'Sanlúcar de Barrameda', lat: 36.78, lon: -6.35, what: 'la manzanilla, che è lo stesso vino ma sa di mare, e le tapas di Bajo de Guía' },
      { day: 2, place: 'El Puerto de Santa María', lat: 36.60, lon: -6.23, what: 'il terzo vertice del "triangolo dello sherry", con le bodegas sul fiume' },
    ],
    notes: 'Il sistema delle solera — botti sovrapposte dove il vino nuovo rinfresca il vecchio — non esiste in nessun\'altra regione. Le tre città sono collegate da treno e autobus: qui il problema di chi guida non si pone.',
  },
  {
    id: 'wr-es-riasbaixas', emoji: '🍷', name: 'Ruta do Viño Rías Baixas',
    kind: 'vino', country: 'Spagna', region: 'Galizia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 42.51, lon: -8.81 }, products: 'Albariño sui pergolati di granito, davanti all\'Atlantico',
    season: 'Giugno-settembre; prima domenica di agosto la Festa do Albariño a Cambados.',
    stops: [
      { day: 1, place: 'Cambados', lat: 42.51, lon: -8.81, what: 'la capitale dell\'albariño, il pazo de Fefiñáns e le ostriche del mercato' },
      { day: 1, place: 'O Grove', lat: 42.49, lon: -8.87, what: 'le bateas nella ria: si esce in barca a raccogliere le cozze e si beve a bordo' },
      { day: 2, place: 'Pontevedra', lat: 42.43, lon: -8.64, what: 'il centro storico pedonale più riuscito di Spagna, e le tapas' },
    ],
    notes: 'L\'albariño si beve con i frutti di mare della ria, che sono i migliori d\'Europa: qui l\'abbinamento non è una teoria, è una constatazione. I pergolati alti servono a far girare l\'aria: piove molto.',
  },
  {
    id: 'wr-pt-douro', emoji: '🍷', name: 'Rota do Vinho do Porto — Alto Douro',
    kind: 'vino', country: 'Portogallo', region: 'Douro', continent: 'Europa', days: 3, transport: 'treno',
    coords: { lat: 41.15, lon: -8.61 }, products: 'Porto (Tawny, Ruby, Vintage) e Douro DOC secco',
    season: 'Settembre-ottobre per la vendemmia (in alcune quintas ancora coi piedi nei lagares).',
    stops: [
      { day: 1, place: 'Vila Nova de Gaia', lat: 41.13, lon: -8.61, what: 'le cave del Porto affacciate sul Douro, di fronte alla Ribeira' },
      { day: 2, place: 'Peso da Régua', lat: 41.16, lon: -7.79, what: 'il Museu do Douro e l\'inizio del paesaggio terrazzato UNESCO' },
      { day: 2, place: 'Pinhão', lat: 41.19, lon: -7.55, what: 'la stazione con gli azulejos e le quintas storiche tutt\'intorno' },
      { day: 3, place: 'Lamego', lat: 41.10, lon: -7.81, what: 'la scalinata barocca dei Remédios e lo spumante del Douro' },
    ],
    notes: 'La linea ferroviaria del Douro da Porto a Pocinho corre sull\'acqua per gli ultimi 70 km: è uno dei viaggi in treno più belli d\'Europa e risolve il problema di chi beve. La regione demarcata del Douro (1756) è la più antica del mondo.',
  },
  {
    id: 'wr-pt-alentejo', emoji: '🍷', name: 'Rota dos Vinhos do Alentejo',
    kind: 'vino', country: 'Portogallo', region: 'Alentejo', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 38.57, lon: -7.91 }, products: 'Alicante Bouschet, Antão Vaz; vini di talha (anfora)',
    season: 'Marzo-giugno e settembre-ottobre; novembre-dicembre per il vino di talha nuovo.',
    stops: [
      { day: 1, place: 'Évora', lat: 38.57, lon: -7.91, what: 'il tempio romano, la cappella delle ossa e le enoteche del centro UNESCO' },
      { day: 1, place: 'Reguengos de Monsaraz', lat: 38.42, lon: -7.53, what: 'la patria del vinho de talha, fermentato in anfore di terracotta come i romani' },
      { day: 2, place: 'Estremoz', lat: 38.84, lon: -7.59, what: 'il marmo bianco, il mercato del sabato e le cantine di pianura' },
      { day: 2, place: 'Borba', lat: 38.80, lon: -7.46, what: 'cave di marmo azzurrino e cooperative storiche' },
    ],
    notes: 'Il vinho de talha si beve nelle tavernas da San Martino (11 novembre) attingendo direttamente dall\'anfora: è la tradizione vinicola continua più antica d\'Europa, e non si trova in bottiglia.',
  },
  {
    id: 'wr-pt-vinhoverde', emoji: '🍷', name: 'Rota dos Vinhos Verdes',
    kind: 'vino', country: 'Portogallo', region: 'Minho', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 41.77, lon: -8.58 }, products: 'Alvarinho e Loureiro; bianchi leggeri e frizzanti',
    season: 'Giugno-settembre.',
    stops: [
      { day: 1, place: 'Ponte de Lima', lat: 41.77, lon: -8.58, what: 'il borgo più antico del Portogallo, col ponte romano e le quintas attorno' },
      { day: 1, place: 'Monção', lat: 42.08, lon: -8.48, what: 'l\'alvarinho migliore, sulla riva portoghese del Minho' },
      { day: 2, place: 'Guimarães', lat: 41.44, lon: -8.29, what: 'dove è nato il Portogallo: castello e centro UNESCO' },
      { day: 2, place: 'Braga', lat: 41.55, lon: -8.42, what: 'il Bom Jesus con la scalinata barocca e i ristoranti di bacalhau' },
    ],
    notes: 'Verde non è il colore: è il vino "giovane", da bere entro l\'anno. L\'alvarinho di Monção è la stessa uva dell\'albariño galiziano, dall\'altra parte del fiume.',
  },
  {
    id: 'wr-pt-madeira', emoji: '🍷', name: 'Madeira — il vino che viaggia',
    kind: 'vino', country: 'Portogallo', region: 'Madeira', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 32.65, lon: -16.91 }, products: 'Sercial, Verdelho, Bual, Malmsey; vino cotto ed eterno',
    season: 'Tutto l\'anno (clima mite); settembre per la Festa do Vinho.',
    stops: [
      { day: 1, place: 'Funchal', lat: 32.65, lon: -16.91, what: 'le lodges storiche con botti del XIX secolo ancora in vendita' },
      { day: 1, place: 'Câmara de Lobos', lat: 32.65, lon: -16.98, what: 'il porticciolo dipinto da Churchill e la poncha coi pescatori' },
      { day: 1, place: 'Estreito de Câmara de Lobos', lat: 32.68, lon: -17.00, what: 'i terrazzamenti aggrappati alla montagna dove nasce il verdelho' },
    ],
    notes: 'Il Madeira è l\'unico vino che si può lasciare aperto per mesi senza rovinarsi: è già stato cotto e ossidato apposta. Bottiglie del 1900 sono ancora in commercio e si assaggiano al bicchiere.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// EUROPA CENTRALE E ORIENTALE, MEDITERRANEO, CAUCASO
// ─────────────────────────────────────────────────────────────────────

const EUROPA_ALTRO: TasteRoute[] = [
  {
    id: 'wr-de-weinstrasse', emoji: '🍷', name: 'Deutsche Weinstraße — Palatinato',
    kind: 'vino', country: 'Germania', region: 'Pfalz', continent: 'Europa', days: 2, transport: 'bici',
    coords: { lat: 49.62, lon: 8.19 }, products: 'Riesling, Dornfelder; la zona più calda della Germania',
    season: 'Maggio-ottobre; settembre per le Weinfeste in ogni paese.',
    stops: [
      { day: 1, place: 'Bockenheim an der Weinstraße', lat: 49.62, lon: 8.19, what: 'la Haus der Deutschen Weinstraße: qui la strada comincia (85 km)' },
      { day: 1, place: 'Bad Dürkheim', lat: 49.46, lon: 8.17, what: 'la botte più grande del mondo (1,7 milioni di litri, dentro c\'è un ristorante)' },
      { day: 2, place: 'Deidesheim', lat: 49.41, lon: 8.19, what: 'il paese più elegante della strada, riesling di prima categoria' },
      { day: 2, place: 'Neustadt an der Weinstraße', lat: 49.35, lon: 8.14, what: 'la capitale del vino tedesco e il castello di Hambach' },
      { day: 2, place: 'Schweigen-Rechtenbach', lat: 49.03, lon: 7.94, what: 'la Deutsches Weintor, porta sud della strada, sul confine francese' },
    ],
    notes: 'La prima strada del vino turistica del mondo (1935). Qui crescono fichi e limoni: il Palatinato è la regione più mite della Germania. La ciclabile affianca tutto il percorso.',
  },
  {
    id: 'wr-de-mosel', emoji: '🍷', name: 'Moselweinstraße — la valle della Mosella',
    kind: 'vino', country: 'Germania', region: 'Mosella', continent: 'Europa', days: 2, transport: 'bici',
    coords: { lat: 49.76, lon: 6.64 }, products: 'Riesling su ardesia, dai secchi ai Trockenbeerenauslese',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Treviri', lat: 49.76, lon: 6.64, what: 'la Porta Nigra e le terme romane: qui il vino si fa da duemila anni' },
      { day: 1, place: 'Piesport', lat: 49.88, lon: 6.93, what: 'l\'ansa più fotografata del fiume e un torchio romano ritrovato intatto' },
      { day: 2, place: 'Bernkastel-Kues', lat: 49.92, lon: 7.07, what: 'la piazza a graticcio e il Doctorberg, il vigneto più ripido della zona' },
      { day: 2, place: 'Traben-Trarbach', lat: 49.95, lon: 7.11, what: 'le ville liberty e le cantine sotterranee dell\'era dei mercanti' },
      { day: 2, place: 'Cochem', lat: 50.15, lon: 7.17, what: 'il castello sopra l\'ansa e il Calmont, il vigneto più ripido d\'Europa (68%)' },
    ],
    notes: 'La ciclabile Mosel-Radweg segue il fiume in piano per 250 km: si pedala fra le vigne e si torna in battello o in treno. I riesling della Mosella hanno alcol bassissimo (7-9%): si degusta senza rovinarsi la giornata.',
  },
  {
    id: 'wr-de-rheingau', emoji: '🍷', name: 'Rheingauer Riesling Route',
    kind: 'vino', country: 'Germania', region: 'Rheingau', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 50.03, lon: 8.12 }, products: 'Riesling e Spätburgunder (pinot nero) sul Reno',
    season: 'Maggio-ottobre; la valle del Reno è UNESCO poco più a valle.',
    stops: [
      { day: 1, place: 'Eltville am Rhein', lat: 50.03, lon: 8.12, what: 'rose, riesling e il castello elettorale sul fiume' },
      { day: 1, place: 'Johannisberg', lat: 50.00, lon: 7.98, what: 'lo Schloss dove nel 1775 si scoprì per caso la vendemmia tardiva' },
      { day: 1, place: 'Rüdesheim am Rhein', lat: 49.98, lon: 7.92, what: 'la Drosselgasse (turistica ma inevitabile) e la funivia al Niederwalddenkmal' },
      { day: 1, place: 'Assmannshausen', lat: 49.98, lon: 7.86, what: 'l\'eccezione rossa del Rheingau: pinot nero su ardesia rossa' },
    ],
    notes: 'Il monastero di Eberbach, dove è stato girato "Il nome della rosa", è la cantina statale più antica del mondo ancora in attività.',
  },
  {
    id: 'wr-at-wachau', emoji: '🍷', name: 'Wachau — la valle del Danubio',
    kind: 'vino', country: 'Austria', region: 'Bassa Austria', continent: 'Europa', days: 2, transport: 'bici',
    coords: { lat: 48.41, lon: 15.61 }, products: 'Grüner Veltliner e Riesling (Steinfeder, Federspiel, Smaragd)',
    season: 'Aprile-ottobre; aprile per i meli in fiore, ottobre per la vendemmia.',
    stops: [
      { day: 1, place: 'Krems an der Donau', lat: 48.41, lon: 15.61, what: 'la porta est della valle, con la Sandgrube e le Heurigen del centro' },
      { day: 1, place: 'Dürnstein', lat: 48.40, lon: 15.52, what: 'la torre azzurra e la rovina dove fu prigioniero Riccardo Cuor di Leone' },
      { day: 2, place: 'Weissenkirchen', lat: 48.40, lon: 15.46, what: 'i terrazzamenti dell\'Achleiten e il museo della Wachau' },
      { day: 2, place: 'Spitz an der Donau', lat: 48.36, lon: 15.42, what: 'la "collina dei mille secchi" e le albicocche Marille' },
      { day: 2, place: 'Melk', lat: 48.23, lon: 15.33, what: 'l\'abbazia barocca sul fiume, fine del percorso' },
    ],
    notes: 'La Wachau è UNESCO. La ciclabile del Danubio la attraversa tutta in piano, e i battelli caricano le bici: andata in barca, ritorno in bicicletta. Le Heurigen sono le osterie dei vignaioli, aperte a turno.',
  },
  {
    id: 'wr-at-suedsteiermark', emoji: '🍷', name: 'Südsteirische Weinstraße',
    kind: 'vino', country: 'Austria', region: 'Stiria', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 46.78, lon: 15.54 }, products: 'Sauvignon Blanc, Welschriesling, Schilcher; olio di semi di zucca',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Leibnitz', lat: 46.78, lon: 15.54, what: 'base della "Toscana austriaca", fra colline strettissime' },
      { day: 1, place: 'Gamlitz', lat: 46.72, lon: 15.51, what: 'il paese con più aziende vinicole d\'Austria e le Buschenschank' },
      { day: 2, place: 'Ehrenhausen', lat: 46.72, lon: 15.58, what: 'il mausoleo sulla collina e la strada panoramica verso la Slovenia' },
      { day: 2, place: 'Kitzeck im Sausal', lat: 46.75, lon: 15.42, what: 'il paese vitivinicolo più alto d\'Europa, coi klapotetz che girano al vento' },
    ],
    notes: 'Le Buschenschank sono osterie contadine che possono servire solo prodotti propri: taglieri e vino, niente cucina calda. L\'olio di semi di zucca stiriano si versa sul gelato alla vaniglia — provaci.',
  },
  {
    id: 'wr-at-burgenland', emoji: '🍷', name: 'Neusiedlersee — i vini del lago',
    kind: 'vino', country: 'Austria', region: 'Burgenland', continent: 'Europa', days: 1, transport: 'bici',
    coords: { lat: 47.80, lon: 16.67 }, products: 'Blaufränkisch, Zweigelt, Ausbruch di Rust (muffa nobile)',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Rust', lat: 47.80, lon: 16.67, what: 'le cicogne sui camini e l\'Ausbruch, dolce da muffa nobile dal Seicento' },
      { day: 1, place: 'Gols', lat: 47.90, lon: 16.91, what: 'il comune con più vignaioli d\'Austria, sulla sponda est' },
      { day: 1, place: 'Illmitz', lat: 47.77, lon: 16.80, what: 'il parco nazionale Seewinkel, saline e uccelli acquatici fra le vigne' },
    ],
    notes: 'Il lago di Neusiedl è profondo un metro e mezzo e crea le nebbie che portano la muffa nobile: senza quel microclima il dolce di Rust non esisterebbe. Ciclabile completa attorno al lago, 125 km in piano, con sconfinamento in Ungheria.',
  },
  {
    id: 'wr-ch-lavaux', emoji: '🍷', name: 'Lavaux — i terrazzamenti UNESCO',
    kind: 'vino', country: 'Svizzera', region: 'Vaud', continent: 'Europa', days: 1, transport: 'treno',
    coords: { lat: 46.52, lon: 6.63 }, products: 'Chasselas sul Lemano, Dézaley e Calamin grand cru',
    season: 'Aprile-ottobre; le cantine comunali aprono a turno nei fine settimana.',
    stops: [
      { day: 1, place: 'Losanna', lat: 46.52, lon: 6.63, what: 'partenza: treno regionale lungo il lago, o battello CGN' },
      { day: 1, place: 'Rivaz', lat: 46.47, lon: 6.78, what: 'il punto in cui i terrazzamenti cadono direttamente nel lago' },
      { day: 1, place: 'Saint-Saphorin', lat: 46.47, lon: 6.79, what: 'il villaggio di pietra fra i filari, con la chiesa su fondamenta romane' },
      { day: 1, place: 'Chexbres', lat: 46.48, lon: 6.78, what: 'il "balcone del Lemano": vista su lago e Alpi di Savoia' },
      { day: 1, place: 'Vevey', lat: 46.46, lon: 6.84, what: 'la Fête des Vignerons (una volta ogni vent\'anni) e il museo dell\'alimentazione' },
    ],
    notes: '830 ettari di terrazze costruite dai monaci nell\'XI secolo, patrimonio UNESCO. Il sentiero dei terrazzamenti collega i villaggi in 11 km quasi tutti in discesa, con le stazioni ferroviarie a ogni tappa: si cammina e si beve senza guidare.',
  },
  {
    id: 'wr-ch-valais', emoji: '🍷', name: 'Chemin du Vignoble — Vallese',
    kind: 'vino', country: 'Svizzera', region: 'Vallese', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 46.23, lon: 7.36 }, products: 'Fendant, Petite Arvine, Cornalin, Humagne; vitigni alpini unici',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Sion', lat: 46.23, lon: 7.36, what: 'i due colli con castello e basilica, e il vigneto dentro la città' },
      { day: 1, place: 'Salgesch', lat: 46.31, lon: 7.57, what: 'il museo del vino e il sentiero didattico fino a Sierre, 6 km fra i filari' },
      { day: 2, place: 'Visperterminen', lat: 46.26, lon: 7.90, what: 'il "Heidenwein" a 1.150 metri: fra i vigneti più alti d\'Europa' },
      { day: 2, place: 'Martigny', lat: 46.10, lon: 7.07, what: 'l\'anfiteatro romano e la fondazione Gianadda' },
    ],
    notes: 'Il Vallese ha una cinquantina di vitigni, molti dei quali non esistono altrove al mondo. La Svizzera esporta pochissimo vino: questi si assaggiano quasi solo qui.',
  },
  {
    id: 'wr-hu-tokaj', emoji: '🍷', name: 'Tokaj — il vino dei re',
    kind: 'vino', country: 'Ungheria', region: 'Tokaj-Hegyalja', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 48.12, lon: 21.41 }, products: 'Tokaji Aszú (muffa nobile), Szamorodni, Furmint secco',
    season: 'Settembre-novembre per la raccolta degli acini botritizzati, uno a uno.',
    stops: [
      { day: 1, place: 'Tokaj', lat: 48.12, lon: 21.41, what: 'la confluenza dei fiumi e le cantine di città con le muffe nobili sui muri' },
      { day: 1, place: 'Tarcal', lat: 48.12, lon: 21.35, what: 'ai piedi del monte Tokaj, con le cantine cooperative storiche' },
      { day: 2, place: 'Mád', lat: 48.20, lon: 21.28, what: 'la Rákóczi-pince, cantina del Cinquecento scavata nel tufo per 1,5 km' },
      { day: 2, place: 'Sárospatak', lat: 48.32, lon: 21.57, what: 'il castello sul Bodrog e la cantina dei principi Rákóczi' },
    ],
    notes: 'La prima zona vinicola classificata al mondo (1737, prima di Bordeaux). Il muro delle cantine è coperto da un fungo nero, Cladosporium cellare, che regola l\'umidità: non è sporcizia, è parte del metodo. Il Furmint secco è la scoperta recente della zona.',
  },
  {
    id: 'wr-hu-eger-villany', emoji: '🍷', name: 'Eger e Villány — i rossi ungheresi',
    kind: 'vino', country: 'Ungheria', region: 'Eger e Villány', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 47.90, lon: 20.37 }, products: 'Egri Bikavér ("sangue di toro"), cabernet franc di Villány',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Eger', lat: 47.90, lon: 20.37, what: 'la Valle delle Belle Donne: duecento cantine scavate in un semicerchio' },
      { day: 1, place: 'Szépasszony-völgy', lat: 47.89, lon: 20.35, what: 'si passa di cantina in cantina a piedi, col bicchiere in mano' },
      { day: 2, place: 'Villány', lat: 45.87, lon: 18.45, what: 'la prima strada del vino ungherese (1994), cabernet franc di livello mondiale' },
      { day: 2, place: 'Pécs', lat: 46.07, lon: 18.23, what: 'la necropoli paleocristiana UNESCO e la moschea trasformata in chiesa' },
    ],
    notes: 'La Valle delle Belle Donne di Eger è l\'unico posto d\'Europa dove si gira a piedi fra duecento cantine in un raggio di trecento metri: il rischio è di esagerare, non di annoiarsi.',
  },
  {
    id: 'wr-si-brda', emoji: '🍷', name: 'Goriška Brda e Vipavska — la Slovenia del vino',
    kind: 'vino', country: 'Slovenia', region: 'Primorska', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.99, lon: 13.53 }, products: 'Rebula (ribolla), Zelen, Pinela; vini macerati in anfora',
    season: 'Aprile-giugno e settembre-ottobre; maggio per le ciliegie di Brda.',
    stops: [
      { day: 1, place: 'Dobrovo', lat: 45.99, lon: 13.53, what: 'il castello rinascimentale con l\'enoteca regionale della Brda' },
      { day: 1, place: 'Šmartno', lat: 45.99, lon: 13.55, what: 'il borgo fortificato medievale in cima alla collina, restaurato intero' },
      { day: 2, place: 'Vipava', lat: 45.85, lon: 13.96, what: 'la valle della bora e i vitigni autoctoni Zelen e Pinela' },
      { day: 2, place: 'Ptuj', lat: 46.42, lon: 15.87, what: 'la città più antica di Slovenia e la cantina in attività dal 1239' },
    ],
    notes: 'La Brda slovena e il Collio italiano sono la stessa collina divisa da un confine: stessi vitigni, stesse famiglie, prezzi diversi. Maribor ha la vite più vecchia del mondo ancora produttiva (oltre 400 anni), documentata.',
  },
  {
    id: 'wr-hr-istria-peljesac', emoji: '🍷', name: 'Istria e Pelješac — la Croazia del vino',
    kind: 'vino', country: 'Croazia', region: 'Istria e Dalmazia', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 45.34, lon: 13.83 }, products: 'Malvazija istriana, Teran, Plavac Mali (Dingač, Postup)',
    season: 'Maggio-giugno e settembre-ottobre; ottobre-novembre per il tartufo istriano.',
    stops: [
      { day: 1, place: 'Motovun', lat: 45.34, lon: 13.83, what: 'il borgo murato sulla collina e la foresta dei tartufi bianchi sotto' },
      { day: 1, place: 'Buje', lat: 45.41, lon: 13.66, what: 'malvasia istriana e olio extravergine premiato in tutto il mondo' },
      { day: 2, place: 'Ston', lat: 42.84, lon: 17.70, what: 'le mura più lunghe d\'Europa dopo la Muraglia, le saline e le ostriche di Mali Ston' },
      { day: 3, place: 'Potomje', lat: 42.92, lon: 17.42, what: 'il tunnel scavato a mano che porta ai vigneti di Dingač, a picco sul mare' },
      { day: 3, place: 'Korčula', lat: 42.96, lon: 17.14, what: 'la città a lisca di pesce e il bianco Pošip dell\'isola' },
    ],
    notes: 'Il Plavac Mali è geneticamente imparentato con lo Zinfandel/Primitivo, la cui origine croata (crljenak kaštelanski) è stata dimostrata col DNA nel 2001. I vigneti di Dingač hanno pendenze da corda.',
  },
  {
    id: 'wr-gr-santorini', emoji: '🌋', name: 'Santorini — le viti a canestro',
    kind: 'vino', country: 'Grecia', region: 'Cicladi', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 36.42, lon: 25.43 }, products: 'Assyrtiko, Vinsanto; viti allevate a kouloura',
    season: 'Aprile-giugno e settembre-ottobre; qui si vendemmia già ad agosto.',
    stops: [
      { day: 1, place: 'Fira', lat: 36.42, lon: 25.43, what: 'base sul bordo della caldera, con le enoteche affacciate sul vulcano' },
      { day: 1, place: 'Megalochori', lat: 36.36, lon: 25.44, what: 'le canave, cantine tradizionali scavate nella pomice' },
      { day: 1, place: 'Pyrgos', lat: 36.38, lon: 25.44, what: 'il paese più alto dell\'isola e il tramonto senza la calca di Oia' },
      { day: 1, place: 'Akrotiri', lat: 36.35, lon: 25.40, what: 'la Pompei dell\'Egeo, sepolta dall\'eruzione del 1600 a.C.' },
    ],
    notes: 'Non piove quasi mai: le viti sono intrecciate a cesto per terra per raccogliere la rugiada e ripararsi dal vento, e non sono mai state toccate dalla fillossera — alcune hanno centinaia di anni. Il vigneto si sta riducendo per la pressione del turismo: i prezzi sono alti per un motivo.',
  },
  {
    id: 'wr-gr-nemea-naoussa', emoji: '🍷', name: 'Nemea e Naoussa — i rossi greci',
    kind: 'vino', country: 'Grecia', region: 'Peloponneso e Macedonia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 37.82, lon: 22.66 }, products: 'Agiorgitiko a Nemea, Xinomavro a Naoussa',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Nemea', lat: 37.82, lon: 22.66, what: 'il "sangue di Ercole": agiorgitiko e il sito archeologico dei giochi nemei' },
      { day: 1, place: 'Micene', lat: 37.73, lon: 22.75, what: 'la Porta dei Leoni a venti minuti dalle cantine' },
      { day: 2, place: 'Naoussa', lat: 40.63, lon: 22.07, what: 'lo Xinomavro, il "nebbiolo greco", ai piedi del monte Vermio' },
      { day: 2, place: 'Vergina', lat: 40.48, lon: 22.32, what: 'la tomba di Filippo II, padre di Alessandro, a mezz\'ora dai vigneti' },
    ],
    notes: 'Lo Xinomavro invecchia come un Barolo e costa un quarto. La Grecia continentale è la parte del paese che nessun turista visita, e ha le cantine più serie.',
  },
  {
    id: 'wr-ge-kakheti', emoji: '🏺', name: 'Kakheti — ottomila anni di qvevri',
    kind: 'vino', country: 'Georgia', region: 'Kakheti', continent: 'Asia', days: 3, transport: 'auto',
    coords: { lat: 41.92, lon: 45.47 }, products: 'Saperavi, Rkatsiteli; vinificazione in anfora interrata',
    season: 'Settembre-ottobre per la rtveli, la vendemmia collettiva.',
    stops: [
      { day: 1, place: 'Telavi', lat: 41.92, lon: 45.47, what: 'la capitale della Kakheti, il platano millenario e il palazzo di Eraclio II' },
      { day: 1, place: 'Tsinandali', lat: 41.89, lon: 45.57, what: 'la tenuta del principe Chavchavadze, prima cantina europea della Georgia (1886)' },
      { day: 2, place: 'Sighnaghi', lat: 41.62, lon: 45.92, what: 'la "città dell\'amore" murata, con vista sul Caucaso innevato' },
      { day: 3, place: 'Kvareli', lat: 41.95, lon: 45.81, what: 'i tunnel scavati nella roccia e le famiglie che vinificano in qvevri in cortile' },
    ],
    notes: 'Il metodo qvevri — anfora di terracotta interrata, con bucce e raspi per mesi — è patrimonio immateriale UNESCO ed è la tradizione vinicola continua più antica del mondo (8.000 anni). La supra, il banchetto col tamada che guida i brindisi, è parte dell\'esperienza: si mangia e si beve per ore.',
  },
  {
    id: 'wr-am-areni', emoji: '🍷', name: 'Areni e Vayots Dzor — Armenia',
    kind: 'vino', country: 'Armenia', region: 'Vayots Dzor', continent: 'Asia', days: 1, transport: 'auto',
    coords: { lat: 39.72, lon: 45.19 }, products: 'Areni noir, vitigno autoctono ad alta quota',
    season: 'Maggio-ottobre; primo weekend di ottobre per la festa del vino di Areni.',
    stops: [
      { day: 1, place: 'Areni', lat: 39.72, lon: 45.19, what: 'la grotta di Areni-1: la cantina più antica del mondo conosciuta, 6.100 anni' },
      { day: 1, place: 'Noravank', lat: 39.68, lon: 45.23, what: 'il monastero del XIII secolo in una gola di roccia rossa' },
      { day: 1, place: 'Yeghegnadzor', lat: 39.76, lon: 45.33, what: 'le cantine familiari della valle e il caravanserraglio di Orbelian' },
    ],
    notes: 'Ad Areni-1 sono stati trovati un torchio, tini e semi d\'uva del 4.100 a.C.: è la più antica struttura per fare vino mai scavata. L\'Armenia sta ricostruendo la sua viticoltura da vent\'anni, con vitigni che non esistono altrove.',
  },
  {
    id: 'wr-md-cricova', emoji: '🍷', name: 'Cricova e Purcari — le cantine della Moldavia',
    kind: 'vino', country: 'Moldavia', region: 'Codru e Ștefan Vodă', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 47.09, lon: 28.86 }, products: 'Fetească, Rara Neagră, Negru de Purcari',
    season: 'Maggio-ottobre; primo weekend di ottobre per la Festa Nazionale del Vino.',
    stops: [
      { day: 1, place: 'Cricova', lat: 47.09, lon: 28.86, what: '120 km di gallerie sotterranee che si visitano in auto elettrica' },
      { day: 1, place: 'Mileștii Mici', lat: 46.90, lon: 28.84, what: 'la collezione di vini più grande del mondo secondo il Guinness: 2 milioni di bottiglie' },
      { day: 2, place: 'Purcari', lat: 46.55, lon: 29.85, what: 'la tenuta del 1827 il cui rosso finiva alla corte degli zar e della regina Vittoria' },
      { day: 2, place: 'Chișinău', lat: 47.01, lon: 28.86, what: 'la capitale, con il mercato centrale e i ristoranti di cucina moldava' },
    ],
    notes: 'Le gallerie di Cricova e Mileștii Mici sono ex cave di calcare trasformate in città sotterranee: si visitano in navetta, non a piedi. La Moldavia ha la densità di vigneto per abitante più alta del mondo.',
  },
  {
    id: 'wr-ro-dealumare', emoji: '🍷', name: 'Dealu Mare e Cotnari — Romania',
    kind: 'vino', country: 'Romania', region: 'Muntenia e Moldova', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.99, lon: 26.23 }, products: 'Fetească Neagră, Grasă de Cotnari (dolce da muffa nobile)',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Urlați', lat: 44.99, lon: 26.23, what: 'il cuore di Dealu Mare, "la grande collina", fra Ploiești e i Carpazi' },
      { day: 1, place: 'Sinaia', lat: 45.35, lon: 25.55, what: 'il castello di Peleș a un\'ora dalle cantine: la coppia perfetta' },
      { day: 2, place: 'Cotnari', lat: 47.35, lon: 26.90, what: 'il dolce che nel Cinquecento era servito alle corti d\'Europa' },
      { day: 2, place: 'Iași', lat: 47.16, lon: 27.59, what: 'la capitale culturale della Moldavia romena e i monasteri dipinti a nord' },
    ],
    notes: 'La Romania è il sesto produttore d\'Europa e quasi nessuno lo sa: il vino resta quasi tutto in patria. La Fetească Neagră è un rosso autoctono di carattere, introvabile fuori dai confini.',
  },
  {
    id: 'wr-uk-sussex', emoji: '🥂', name: 'English Sparkling — le colline del Sussex',
    kind: 'vino', country: 'Regno Unito', region: 'Sussex e Kent', continent: 'Europa', days: 1, transport: 'treno',
    coords: { lat: 50.87, lon: 0.01 }, products: 'Metodo tradizionale su gesso, gli stessi suoli della Champagne',
    season: 'Maggio-ottobre.',
    stops: [
      { day: 1, place: 'Lewes', lat: 50.87, lon: 0.01, what: 'base nel Sussex, un\'ora da Londra Victoria' },
      { day: 1, place: 'South Downs', lat: 50.85, lon: -0.30, what: 'il parco nazionale coi vigneti sulle colline gessose' },
      { day: 1, place: 'Brighton', lat: 50.82, lon: -0.14, what: 'il Royal Pavilion e i ristoranti sul mare per chiudere' },
    ],
    notes: 'Il gesso del Sussex è geologicamente lo stesso della Champagne, e il riscaldamento del clima ha reso possibile quello che vent\'anni fa era una scommessa: oggi gli spumanti inglesi battono i francesi alle degustazioni alla cieca.',
  },
  {
    id: 'wr-tr-cappadocia', emoji: '🍷', name: 'Cappadocia — vigne fra i camini delle fate',
    kind: 'vino', country: 'Turchia', region: 'Cappadocia', continent: 'Asia', days: 1, transport: 'auto',
    coords: { lat: 38.63, lon: 34.91 }, products: 'Emir (bianco autoctono), Öküzgözü, Boğazkere',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Ürgüp', lat: 38.63, lon: 34.91, what: 'le cantine scavate nel tufo, con le sale di degustazione sotterranee' },
      { day: 1, place: 'Göreme', lat: 38.64, lon: 34.83, what: 'il museo all\'aperto UNESCO e la mongolfiera all\'alba' },
      { day: 1, place: 'Uçhisar', lat: 38.63, lon: 34.81, what: 'la rocca che domina la valle, con le vigne dell\'Emir attorno' },
    ],
    notes: 'La Turchia è fra i primi produttori mondiali di uva e fra gli ultimi di vino: quasi tutta finisce in uva da tavola e sultanina. Le cantine cappadoci vinificano in grotta da secoli.',
  },
  {
    id: 'wr-lb-bekaa', emoji: '🍷', name: 'Valle della Beqaa — Libano',
    kind: 'vino', country: 'Libano', region: 'Beqaa', continent: 'Asia', days: 1, transport: 'auto',
    coords: { lat: 33.85, lon: 35.90 }, products: 'Cinsault, cabernet, carignan; arak all\'anice',
    season: 'Settembre-ottobre.',
    stops: [
      { day: 1, place: 'Zahlé', lat: 33.85, lon: 35.90, what: 'la capitale della valle, coi ristoranti sul fiume Berdawni' },
      { day: 1, place: 'Ksara', lat: 33.82, lon: 35.88, what: 'le grotte romane usate come cantina dai gesuiti dal 1857' },
      { day: 1, place: 'Baalbek', lat: 34.01, lon: 36.21, what: 'il tempio di Bacco, il meglio conservato del mondo romano' },
    ],
    notes: 'Si fa vino nella Beqaa da cinquemila anni e non si è mai smesso, nemmeno durante la guerra civile. Verificare sempre le raccomandazioni di viaggio aggiornate prima di programmare.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// AMERICHE
//
// Qui il formato dominante non è la "strada" ma il TRAIL tematico col
// passaporto da timbrare: bourbon, formaggi, sidro. Ogni trail ha un ente
// che pubblica le tappe, il che li rende verificabili quanto le strade
// italiane riconosciute per legge.
// ─────────────────────────────────────────────────────────────────────

const AMERICHE: TasteRoute[] = [
  {
    id: 'wr-us-napa', emoji: '🍷', name: 'Napa Valley — Silverado Trail e Highway 29',
    kind: 'vino', country: 'Stati Uniti', region: 'California', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 38.30, lon: -122.29 }, products: 'Cabernet sauvignon, chardonnay; 16 sotto-AVA',
    season: 'Marzo-maggio e settembre-ottobre (crush season); agosto affollatissimo.',
    stops: [
      { day: 1, place: 'Napa', lat: 38.30, lon: -122.29, what: 'la città, l\'Oxbow Public Market e il capolinea del Wine Train' },
      { day: 1, place: 'Yountville', lat: 38.40, lon: -122.36, what: 'la maggior densità di ristoranti stellati degli Stati Uniti' },
      { day: 1, place: 'Oakville', lat: 38.44, lon: -122.40, what: 'il cuore del cabernet, con le AVA più quotate' },
      { day: 2, place: 'Rutherford', lat: 38.46, lon: -122.42, what: 'il "Rutherford dust", il terroir più discusso della valle' },
      { day: 2, place: 'St. Helena', lat: 38.51, lon: -122.47, what: 'il Culinary Institute of America nell\'ex Greystone Cellars' },
      { day: 2, place: 'Calistoga', lat: 38.58, lon: -122.58, what: 'i fanghi vulcanici e le terme in chiusura di giornata' },
    ],
    notes: 'La Silverado Trail corre parallela alla Highway 29 sul lato est: meno traffico e più bella. Quasi tutte le cantine fanno pagare la degustazione (30-80 $) e molte richiedono prenotazione. Il Napa Valley Wine Train risolve il problema di chi guida.',
  },
  {
    id: 'wr-us-sonoma', emoji: '🍷', name: 'Sonoma County — dalle Russian River al Pacifico',
    kind: 'vino', country: 'Stati Uniti', region: 'California', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 38.61, lon: -122.87 }, products: 'Pinot noir, chardonnay, zinfandel di vigne vecchie',
    season: 'Aprile-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Healdsburg', lat: 38.61, lon: -122.87, what: 'la piazza con le tasting room a piedi: tre AVA si incontrano qui' },
      { day: 1, place: 'Russian River Valley', lat: 38.49, lon: -122.87, what: 'nebbia dal Pacifico e pinot noir fra le sequoie' },
      { day: 2, place: 'Sonoma', lat: 38.29, lon: -122.46, what: 'la missione spagnola e la piazza storica dove nacque la California' },
      { day: 2, place: 'Dry Creek Valley', lat: 38.69, lon: -122.94, what: 'zinfandel da viti di ottant\'anni e una strada da percorrere in bici' },
    ],
    notes: 'Sonoma è tre volte Napa per estensione e un terzo per prezzi: cantine familiari, degustazioni più informali, spesso senza appuntamento. Healdsburg si gira a piedi.',
  },
  {
    id: 'wr-us-willamette', emoji: '🍷', name: 'Willamette Valley — Oregon',
    kind: 'vino', country: 'Stati Uniti', region: 'Oregon', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 45.21, lon: -123.20 }, products: 'Pinot noir, pinot gris, chardonnay',
    season: 'Maggio-ottobre; Memorial Day e Thanksgiving weekend con cantine tutte aperte.',
    stops: [
      { day: 1, place: 'McMinnville', lat: 45.21, lon: -123.20, what: 'la Third Street storica e il museo dell\'aviazione con lo Spruce Goose' },
      { day: 1, place: 'Dundee Hills', lat: 45.28, lon: -123.01, what: 'la terra rossa "Jory" da cui nascono i pinot più fini d\'America' },
      { day: 2, place: 'Newberg', lat: 45.30, lon: -122.97, what: 'la porta della valle, a 40 minuti da Portland' },
      { day: 2, place: 'Eola-Amity Hills', lat: 44.97, lon: -123.15, what: 'i venti del Van Duzer Corridor e i pinot più tesi' },
    ],
    notes: 'Stessa latitudine della Borgogna, e si vede. Le cantine sono piccole e i produttori spesso versano di persona: l\'opposto dell\'esperienza Napa.',
  },
  {
    id: 'wr-us-fingerlakes', emoji: '🍷', name: 'Finger Lakes — Seneca e Cayuga Wine Trail',
    kind: 'vino', country: 'Stati Uniti', region: 'New York', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 42.38, lon: -76.87 }, products: 'Riesling, cabernet franc; laghi glaciali profondissimi',
    season: 'Giugno-ottobre; d\'inverno molte cantine riducono gli orari.',
    stops: [
      { day: 1, place: 'Watkins Glen', lat: 42.38, lon: -76.87, what: 'la gola con diciannove cascate e la punta sud del lago Seneca' },
      { day: 1, place: 'Hector', lat: 42.50, lon: -76.87, what: 'la Seneca Lake Wine Trail: riesling sulla sponda est' },
      { day: 2, place: 'Hammondsport', lat: 42.41, lon: -77.22, what: 'il lago Keuka e la cantina più antica degli Stati Uniti in attività' },
      { day: 2, place: 'Geneva', lat: 42.87, lon: -76.98, what: 'la stazione sperimentale della Cornell e i ristoranti del lungolago' },
    ],
    notes: 'I laghi sono così profondi da non gelare mai del tutto e mitigano un clima altrimenti impossibile. Il riesling dei Finger Lakes compete con quelli tedeschi alle degustazioni cieche.',
  },
  {
    id: 'wr-us-santabarbara', emoji: '🍷', name: 'Santa Ynez Valley e Paso Robles',
    kind: 'vino', country: 'Stati Uniti', region: 'California', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 34.60, lon: -120.14 }, products: 'Pinot noir, syrah, blend rodaniani',
    season: 'Tutto l\'anno; ottobre è il mese migliore.',
    stops: [
      { day: 1, place: 'Solvang', lat: 34.60, lon: -120.14, what: 'il paese danese con i mulini a vento, base della valle' },
      { day: 1, place: 'Los Olivos', lat: 34.67, lon: -120.11, what: 'quattro isolati con trenta tasting room: si gira a piedi' },
      { day: 2, place: 'Paso Robles', lat: 35.63, lon: -120.69, what: 'oltre duecento cantine e le sorgenti termali del centro' },
      { day: 2, place: 'Santa Maria Valley', lat: 34.95, lon: -120.44, what: 'il Santa Maria style barbecue, con la carne sul legno di quercia rossa' },
    ],
    notes: 'La valle del film "Sideways": da allora il pinot noir locale è diventato di culto e il merlot ha faticato per vent\'anni. Los Olivos è la soluzione per chi non vuole guidare.',
  },
  {
    id: 'wr-us-bourbon', emoji: '🥃', name: 'Kentucky Bourbon Trail',
    kind: 'distillati', country: 'Stati Uniti', region: 'Kentucky', continent: 'Nord America', days: 3, transport: 'auto',
    coords: { lat: 38.25, lon: -85.76 }, products: 'Bourbon whiskey: mais, botti nuove di quercia tostata',
    season: 'Aprile-giugno e settembre-novembre; settembre per il Bourbon Festival di Bardstown.',
    stops: [
      { day: 1, place: 'Louisville', lat: 38.25, lon: -85.76, what: 'la Whiskey Row e le distillerie urbane, partenza col passaporto in mano' },
      { day: 2, place: 'Bardstown', lat: 37.81, lon: -85.47, what: 'la "capitale mondiale del bourbon": rickhouse a perdita d\'occhio' },
      { day: 2, place: 'Loretto', lat: 37.64, lon: -85.40, what: 'la sigillatura a mano nella cera rossa, si prova di persona' },
      { day: 3, place: 'Frankfort', lat: 38.20, lon: -84.87, what: 'la distilleria sul Kentucky River in attività dal 1812' },
      { day: 3, place: 'Lexington', lat: 38.04, lon: -84.50, what: 'le horse farm del bluegrass, chiusura fra cavalli e alambicchi' },
    ],
    notes: 'Nato nel 1999 con sette distillerie, oggi ne conta oltre quaranta col programma passaporto: si timbra a ogni tappa e si ritira il premio finale. La "angel\'s share" — l\'evaporazione nei rickhouse — è ciò che dà l\'odore all\'aria di tutta la contea.',
  },
  {
    id: 'wr-ca-okanagan', emoji: '🍷', name: 'Okanagan Valley — Canada',
    kind: 'vino', country: 'Canada', region: 'British Columbia', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 49.89, lon: -119.50 }, products: 'Pinot gris, riesling, merlot; icewine',
    season: 'Giugno-ottobre; gennaio per la vendemmia dell\'icewine, a -8 °C.',
    stops: [
      { day: 1, place: 'Kelowna', lat: 49.89, lon: -119.50, what: 'il lago, la spiaggia e le prime cantine sul Naramata Bench' },
      { day: 1, place: 'Penticton', lat: 49.50, lon: -119.59, what: 'fra due laghi, con la ciclabile del Kettle Valley Rail Trail' },
      { day: 2, place: 'Oliver', lat: 49.18, lon: -119.55, what: 'la "capitale del vino del Canada", nel semi-deserto della valle sud' },
      { day: 2, place: 'Osoyoos', lat: 49.03, lon: -119.47, what: 'il lago più caldo del Canada e il centro culturale della nazione Osoyoos' },
    ],
    notes: 'L\'unico deserto del Canada: escursione termica enorme fra giorno e notte. L\'icewine si vendemmia di notte, con l\'uva gelata sulla pianta: alcune cantine fanno partecipare.',
  },
  {
    id: 'wr-ca-niagara', emoji: '🍷', name: 'Niagara Peninsula — la strada dell\'icewine',
    kind: 'vino', country: 'Canada', region: 'Ontario', continent: 'Nord America', days: 1, transport: 'auto',
    coords: { lat: 43.26, lon: -79.07 }, products: 'Icewine di vidal e riesling, cabernet franc',
    season: 'Giugno-ottobre; gennaio per il Niagara Icewine Festival.',
    stops: [
      { day: 1, place: 'Niagara-on-the-Lake', lat: 43.26, lon: -79.07, what: 'il paese vittoriano perfetto e le cantine sull\'escarpment' },
      { day: 1, place: 'Jordan', lat: 43.16, lon: -79.37, what: 'il Twenty Valley, la parte meno turistica della penisola' },
      { day: 1, place: 'Cascate del Niagara', lat: 43.08, lon: -79.07, what: 'a venti minuti: si abbina il fragore alla degustazione' },
    ],
    notes: 'Il Canada è il primo produttore mondiale di icewine, e questa è la sua zona principale. Serve che la temperatura scenda a -8 °C con l\'uva ancora sulla pianta: ecco perché costa.',
  },
  {
    id: 'wr-mx-tequila', emoji: '🥃', name: 'Ruta del Tequila — Jalisco',
    kind: 'distillati', country: 'Messico', region: 'Jalisco', continent: 'Nord America', days: 2, transport: 'treno',
    coords: { lat: 20.88, lon: -103.84 }, products: 'Tequila da agave azul; il paesaggio agavero è UNESCO',
    season: 'Ottobre-maggio (stagione secca).',
    stops: [
      { day: 1, place: 'Tequila', lat: 20.88, lon: -103.84, what: 'il pueblo mágico che dà il nome al distillato, con le distillerie in centro' },
      { day: 1, place: 'Amatitán', lat: 20.83, lon: -103.72, what: 'la valle degli agave blu a perdita d\'occhio e le haciendas storiche' },
      { day: 2, place: 'El Arenal', lat: 20.78, lon: -103.69, what: 'i tahona, le macine di pietra ancora usate dai produttori artigiani' },
      { day: 2, place: 'Guadalajara', lat: 20.67, lon: -103.35, what: 'il mariachi in plaza de los Mariachis e i murales di Orozco' },
    ],
    notes: 'Il "Paesaggio Agavero e le antiche strutture industriali di Tequila" sono patrimonio UNESCO dal 2006. Il treno José Cuervo Express parte da Guadalajara e risolve il problema del ritorno. Tequila 100% agave: leggi l\'etichetta, il resto è mixto.',
  },
  {
    id: 'wr-mx-mezcal', emoji: '🥃', name: 'Ruta del Mezcal — valli di Oaxaca',
    kind: 'distillati', country: 'Messico', region: 'Oaxaca', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 17.07, lon: -96.73 }, products: 'Mezcal artigianale da agave espadín, tobalá, tepeztate',
    season: 'Ottobre-maggio; fine ottobre-inizio novembre per il Día de Muertos.',
    stops: [
      { day: 1, place: 'Oaxaca de Juárez', lat: 17.07, lon: -96.73, what: 'le mezcalerías del centro e il mercato 20 de Noviembre' },
      { day: 1, place: 'Santa María del Tule', lat: 17.05, lon: -96.64, what: 'l\'albero col tronco più largo del mondo, sulla strada dei palenques' },
      { day: 2, place: 'Santiago Matatlán', lat: 16.86, lon: -96.38, what: 'la "capitale mondiale del mezcal": palenques familiari uno dietro l\'altro' },
      { day: 2, place: 'Hierve el Agua', lat: 16.87, lon: -96.28, what: 'le cascate pietrificate, chiusura del giro fra le montagne' },
    ],
    notes: 'Il palenque è la distilleria artigianale: forno interrato, macina trainata da un cavallo, alambicchi di rame. Il mezcal si beve a piccoli sorsi, mai a shot: qui è una cosa seria.',
  },
  {
    id: 'wr-ar-mendoza', emoji: '🍷', name: 'Caminos del Vino — Mendoza',
    kind: 'vino', country: 'Argentina', region: 'Mendoza', continent: 'Sud America', days: 3, transport: 'auto',
    coords: { lat: -32.89, lon: -68.85 }, products: 'Malbec d\'altura, cabernet franc, torrontés',
    season: 'Marzo-aprile per la vendemmia e la Fiesta de la Vendimia; ottobre-novembre in fiore.',
    stops: [
      { day: 1, place: 'Mendoza', lat: -32.89, lon: -68.85, what: 'base sotto i platani, con le Ande sullo sfondo e i wine bar del centro' },
      { day: 1, place: 'Maipú', lat: -32.98, lon: -68.79, what: 'le bodegas storiche a venti minuti: si gira in bicicletta' },
      { day: 2, place: 'Luján de Cuyo', lat: -33.04, lon: -68.88, what: 'la "cuna del malbec", prima DOC dell\'Argentina' },
      { day: 3, place: 'Tupungato', lat: -33.37, lon: -69.15, what: 'il Valle de Uco a 1.200 metri: i malbec più tesi e le lodge fra le vigne' },
    ],
    notes: 'La Ruta del Vino argentina copre circa 2.000 chilometri e il paese conta circa duemila cantine. A Maipú il giro in bici fra le bodegas è un\'istituzione — con la stessa avvertenza di sempre sulla guida.',
  },
  {
    id: 'wr-ar-cafayate', emoji: '🍷', name: 'Ruta del Vino de Salta — Cafayate',
    kind: 'vino', country: 'Argentina', region: 'Salta', continent: 'Sud America', days: 2, transport: 'auto',
    coords: { lat: -26.07, lon: -65.98 }, products: 'Torrontés e malbec a 1.700-3.000 metri',
    season: 'Marzo-maggio e settembre-novembre.',
    stops: [
      { day: 1, place: 'Salta', lat: -24.79, lon: -65.41, what: 'partenza: la città coloniale e il museo di archeologia di alta montagna' },
      { day: 1, place: 'Quebrada de las Conchas', lat: -25.75, lon: -65.85, what: 'la strada nel canyon rosso: l\'Anfiteatro e la Garganta del Diablo' },
      { day: 2, place: 'Cafayate', lat: -26.07, lon: -65.98, what: 'il torrontés aromatico, il gelato al vino e le empanadas salteñas' },
      { day: 2, place: 'Molinos', lat: -25.44, lon: -66.32, what: 'sulla via a Colomé, fra i vigneti coltivati più alti del mondo (3.100 m)' },
    ],
    notes: 'Qui si beve a quota himalayana: l\'alcol fa più effetto e il sole brucia. La Ruta 40 fra Cafayate e Cachi è in parte sterrata: informarsi sulle condizioni.',
  },
  {
    id: 'wr-cl-colchagua', emoji: '🍷', name: 'Ruta del Vino de Colchagua e Casablanca',
    kind: 'vino', country: 'Cile', region: 'Valle Central', continent: 'Sud America', days: 2, transport: 'treno',
    coords: { lat: -34.64, lon: -71.37 }, products: 'Carmenère, cabernet sauvignon; sauvignon blanc a Casablanca',
    season: 'Marzo-aprile per la vendemmia; ottobre-dicembre in primavera.',
    stops: [
      { day: 1, place: 'Santa Cruz', lat: -34.64, lon: -71.37, what: 'il centro della valle di Colchagua e il museo con la collezione precolombiana' },
      { day: 1, place: 'Apalta', lat: -34.65, lon: -71.28, what: 'l\'anfiteatro naturale coi cabernet più quotati del Cile' },
      { day: 2, place: 'Casablanca', lat: -33.32, lon: -71.41, what: 'la valle fresca vicino al Pacifico: sauvignon blanc e chardonnay' },
      { day: 2, place: 'Valparaíso', lat: -33.05, lon: -71.62, what: 'i cerros colorati e gli ascensori UNESCO, a mezz\'ora dalle vigne' },
    ],
    notes: 'Il carmenère era considerato estinto dopo la fillossera: nel 1994 si scoprì che in Cile lo si coltivava da 150 anni scambiandolo per merlot. Il Tren del Vino di Colchagua è a vapore e va prenotato.',
  },
  {
    id: 'wr-uy-canelones', emoji: '🍷', name: 'Caminos del Vino dell\'Uruguay',
    kind: 'vino', country: 'Uruguay', region: 'Canelones e Colonia', continent: 'Sud America', days: 2, transport: 'auto',
    coords: { lat: -34.52, lon: -56.28 }, products: 'Tannat, il vitigno nazionale, e albariño atlantico',
    season: 'Febbraio-aprile per la vendemmia; novembre-dicembre.',
    stops: [
      { day: 1, place: 'Canelones', lat: -34.52, lon: -56.28, what: 'la zona con l\'80% delle cantine del paese, a mezz\'ora da Montevideo' },
      { day: 1, place: 'Montevideo', lat: -34.90, lon: -56.16, what: 'il Mercado del Puerto: parrilla e tannat, l\'abbinamento nazionale' },
      { day: 2, place: 'Carmelo', lat: -34.00, lon: -58.28, what: 'le bodegas boutique sul Río de la Plata e le spiagge fluviali' },
      { day: 2, place: 'Colonia del Sacramento', lat: -34.47, lon: -57.84, what: 'il barrio histórico portoghese UNESCO, un\'ora di traghetto da Buenos Aires' },
    ],
    notes: 'Il tannat viene dal Sud-Ovest francese (Madiran) portato dai baschi nell\'Ottocento: qui è diventato più morbido e ha trovato la sua patria. Le cantine sono familiari e ricevono su appuntamento.',
  },
  {
    id: 'wr-br-valedosvinhedos', emoji: '🍷', name: 'Vale dos Vinhedos — Brasile',
    kind: 'vino', country: 'Brasile', region: 'Rio Grande do Sul', continent: 'Sud America', days: 2, transport: 'treno',
    coords: { lat: -29.17, lon: -51.52 }, products: 'Spumante metodo tradizionale, merlot; prima DO brasiliana',
    season: 'Gennaio-marzo per la vendemmia; giugno-luglio per la Fenachamp.',
    stops: [
      { day: 1, place: 'Bento Gonçalves', lat: -29.17, lon: -51.52, what: 'la capitale del vino brasiliano, fondata da immigrati veneti' },
      { day: 1, place: 'Vale dos Vinhedos', lat: -29.17, lon: -51.58, what: 'la valle con le cantine di famiglie italiane alla quarta generazione' },
      { day: 2, place: 'Garibaldi', lat: -29.26, lon: -51.53, what: 'la capitale dello spumante brasiliano e il treno Maria Fumaça' },
      { day: 2, place: 'Gramado', lat: -29.38, lon: -50.87, what: 'la cittadina alpina kitsch e il cioccolato, a un\'ora' },
    ],
    notes: 'Qui si parla ancora il talian, dialetto veneto-brasiliano: molte cantine si chiamano come i paesi del Veneto. Lo spumante brasiliano è la vera sorpresa, non i rossi.',
  },
  {
    id: 'wr-pe-pisco', emoji: '🥃', name: 'Ruta del Pisco — Ica',
    kind: 'distillati', country: 'Perù', region: 'Ica', continent: 'Sud America', days: 2, transport: 'auto',
    coords: { lat: -14.07, lon: -75.73 }, products: 'Pisco puro, acholado e mosto verde da uve quebranta e italia',
    season: 'Tutto l\'anno; marzo per la Vendimia di Ica.',
    stops: [
      { day: 1, place: 'Ica', lat: -14.07, lon: -75.73, what: 'le bodegas coloniali e le tinajas di terracotta ancora in uso' },
      { day: 1, place: 'Huacachina', lat: -14.09, lon: -75.76, what: 'l\'oasi fra le dune, con il pisco sour al tramonto' },
      { day: 2, place: 'Pisco', lat: -13.71, lon: -76.20, what: 'il porto che ha dato il nome al distillato' },
      { day: 2, place: 'Paracas', lat: -13.83, lon: -76.25, what: 'la riserva e le isole Ballestas coi leoni marini' },
    ],
    notes: 'Il pisco peruviano non è invecchiato in legno e non si diluisce: è puro distillato di mosto d\'uva. La disputa con il Cile sul nome è vecchia di un secolo — non prendere posizione al bar.',
  },
  {
    id: 'wr-co-cafetero', emoji: '☕', name: 'Eje Cafetero — il paesaggio culturale del caffè',
    kind: 'caffe', country: 'Colombia', region: 'Quindío, Caldas, Risaralda', continent: 'Sud America', days: 3, transport: 'auto',
    coords: { lat: 4.64, lon: -75.57 }, products: 'Arabica lavato, fincas cafeteras, palma de cera',
    season: 'Dicembre-marzo e luglio-agosto (raccolta principale ottobre-dicembre).',
    stops: [
      { day: 1, place: 'Salento', lat: 4.64, lon: -75.57, what: 'il paese di legno colorato e le fincas che aprono alla raccolta' },
      { day: 1, place: 'Valle de Cocora', lat: 4.64, lon: -75.49, what: 'le palme da cera alte sessanta metri, l\'albero nazionale' },
      { day: 2, place: 'Filandia', lat: 4.67, lon: -75.66, what: 'il mirador e i balconi colorati, meno affollato di Salento' },
      { day: 3, place: 'Manizales', lat: 5.07, lon: -75.52, what: 'la città sulla cresta e il Parque Nacional del Café' },
    ],
    notes: 'Il Paesaggio Culturale del Caffè è patrimonio UNESCO. Nelle fincas si raccoglie, si spolpa, si tosta e si assaggia nello stesso giorno: è la filiera più corta che si possa vedere.',
  },
  {
    id: 'wr-gt-antigua', emoji: '☕', name: 'Caffè e cacao di Antigua Guatemala',
    kind: 'caffe', country: 'Guatemala', region: 'Sacatepéquez', continent: 'Nord America', days: 1, transport: 'auto',
    coords: { lat: 14.56, lon: -90.73 }, products: 'Arabica d\'altura fra i vulcani, cacao criollo',
    season: 'Novembre-aprile (stagione secca); raccolta da dicembre a marzo.',
    stops: [
      { day: 1, place: 'Antigua Guatemala', lat: 14.56, lon: -90.73, what: 'la città coloniale UNESCO fra tre vulcani, coi laboratori di cacao' },
      { day: 1, place: 'Finca Filadelfia', lat: 14.58, lon: -90.73, what: 'le piantagioni sulle pendici dell\'Acatenango' },
      { day: 1, place: 'Ciudad Vieja', lat: 14.52, lon: -90.76, what: 'i beneficios dove il caffè viene lavato e messo a essiccare al sole' },
    ],
    notes: 'Il cacao qui è una tradizione maya, non un souvenir: nei laboratori si tosta la fava e si macina sul metate come tremila anni fa.',
  },
  {
    id: 'wr-cu-vinales', emoji: '🚬', name: 'Valle de Viñales — la strada del tabacco',
    kind: 'gusto', country: 'Cuba', region: 'Pinar del Río', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 22.62, lon: -83.71 }, products: 'Tabacco per sigari, rum, caffè di montagna',
    season: 'Novembre-aprile; gennaio-marzo per la raccolta delle foglie.',
    stops: [
      { day: 1, place: 'Viñales', lat: 22.62, lon: -83.71, what: 'i mogotes calcarei e le case da tè coi cavalli davanti' },
      { day: 1, place: 'Vega de tabacco', lat: 22.60, lon: -83.73, what: 'i secaderos di palma dove le foglie asciugano appese per mesi' },
      { day: 2, place: 'Pinar del Río', lat: 22.42, lon: -83.70, what: 'la fabbrica di sigari e la casa del rum Guayabita' },
    ],
    notes: 'Il Valle de Viñales è patrimonio UNESCO come paesaggio culturale. Il tabacco si coltiva ancora coi buoi, per legge e per convinzione.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// AFRICA, ASIA, OCEANIA
//
// Fuori dalla Georgia, in Asia la "strada del vino" come ente non esiste:
// ci sono itinerari storici del cibo (Tea Horse Road), food trail regionali
// e CLUSTER produttivi senza percorso (Ningxia, Nashik, i distretti del
// sake). Per questi ultimi il tracciato lo costruiamo noi, e va detto.
// ─────────────────────────────────────────────────────────────────────

const RESTO_DEL_MONDO: TasteRoute[] = [
  {
    id: 'wr-za-stellenbosch', emoji: '🍷', name: 'Stellenbosch Wine Routes',
    kind: 'vino', country: 'Sudafrica', region: 'Western Cape', continent: 'Africa', days: 3, transport: 'auto',
    coords: { lat: -33.93, lon: 18.86 }, products: 'Cabernet sauvignon, chenin blanc, pinotage',
    season: 'Ottobre-aprile (estate australe); febbraio-marzo per la vendemmia.',
    stops: [
      { day: 1, place: 'Stellenbosch', lat: -33.93, lon: 18.86, what: 'l\'architettura Cape Dutch, la città universitaria e cinque sotto-rotte attorno' },
      { day: 1, place: 'Bottelary Hills', lat: -33.89, lon: 18.75, what: 'le colline a nordovest, la sotto-rotta meno battuta' },
      { day: 2, place: 'Franschhoek', lat: -33.91, lon: 19.12, what: 'la valle degli ugonotti francesi e il Wine Tram a cerchio, senza guidare' },
      { day: 3, place: 'Paarl', lat: -33.73, lon: 18.96, what: 'la roccia di granito, il monumento alla lingua afrikaans e i vini strutturati' },
      { day: 3, place: 'Constantia', lat: -34.03, lon: 18.42, what: 'la culla del vino sudafricano (1685), dentro Città del Capo' },
    ],
    notes: 'La rotta più antica del continente (anni Settanta), oltre duecento produttori e circa 148 wine farm, divisa in cinque sotto-rotte: Greater Simonsberg, Stellenbosch Berg, Helderberg, Stellenbosch Valley, Bottelary Hills. Il Franschhoek Wine Tram è la risposta locale al problema di chi guida: si sale e si scende a piacere.',
  },
  {
    id: 'wr-za-route62', emoji: '🍷', name: 'Route 62 — la strada del vino più lunga del mondo',
    kind: 'vino', country: 'Sudafrica', region: 'Western Cape', continent: 'Africa', days: 3, transport: 'auto',
    coords: { lat: -33.80, lon: 19.88 }, products: 'Chardonnay, shiraz, moscato; brandy di Worcester',
    season: 'Settembre-aprile.',
    stops: [
      { day: 1, place: 'Robertson', lat: -33.80, lon: 19.88, what: 'la "valle del vino e delle rose", coi cavalli da corsa fra i filari' },
      { day: 2, place: 'Montagu', lat: -33.79, lon: 20.12, what: 'le sorgenti termali e il passo di Cogmanskloof scavato nella roccia' },
      { day: 2, place: 'Barrydale', lat: -33.91, lon: 20.72, what: 'il Klein Karoo: distillerie di brandy e paesaggio semidesertico' },
      { day: 3, place: 'Oudtshoorn', lat: -33.60, lon: 22.20, what: 'gli struzzi e le grotte di Cango, chiusura del Klein Karoo' },
    ],
    notes: 'Rivendica il titolo di strada del vino più lunga del mondo: alternativa panoramica alla N2 fra Città del Capo e Port Elizabeth. Distanze lunghe e paesi piccoli: fai benzina quando puoi.',
  },
  {
    id: 'wr-ma-meknes', emoji: '🫒', name: 'Meknès — vino e olivo del Marocco',
    kind: 'gusto', country: 'Marocco', region: 'Meknès-Fès', continent: 'Africa', days: 2, transport: 'auto',
    coords: { lat: 33.89, lon: -5.55 }, products: 'Vino marocchino (gris de Boulaouane), olio d\'oliva, olive di Meknès',
    season: 'Marzo-maggio e settembre-novembre.',
    stops: [
      { day: 1, place: 'Meknès', lat: 33.89, lon: -5.55, what: 'la città imperiale UNESCO, Bab Mansour e il souk delle olive' },
      { day: 1, place: 'Volubilis', lat: 34.07, lon: -5.55, what: 'i mosaici romani e i frantoi antichi scavati nel sito' },
      { day: 2, place: 'Moulay Idriss', lat: 34.05, lon: -5.52, what: 'la città santa sulla collina, con gli uliveti tutt\'intorno' },
      { day: 2, place: 'Fès', lat: 34.03, lon: -5.00, what: 'la medina più grande del mondo, a un\'ora: cucina e artigianato' },
    ],
    notes: 'Il Marocco è il maggior produttore di vino del mondo arabo, eredità del protettorato francese. Le Routes of the Olive Tree del Consiglio d\'Europa arrivano fino a qui: l\'olivo è il filo che unisce le due sponde.',
  },
  {
    id: 'wr-et-yirgacheffe', emoji: '☕', name: 'Yirgacheffe e Sidamo — la patria del caffè',
    kind: 'caffe', country: 'Etiopia', region: 'Sidama e Gedeo', continent: 'Africa', days: 3, transport: 'auto',
    coords: { lat: 6.16, lon: 38.20 }, products: 'Arabica lavato e naturale; il caffè è nato qui',
    season: 'Ottobre-febbraio (raccolta); evitare la stagione delle piogge.',
    stops: [
      { day: 1, place: 'Addis Abeba', lat: 9.01, lon: 38.76, what: 'partenza e le caffetterie storiche di Piassa, eredità italiana' },
      { day: 2, place: 'Yirgacheffe', lat: 6.16, lon: 38.20, what: 'le washing station e i letti rialzati dove il caffè essicca al sole' },
      { day: 3, place: 'Awassa', lat: 7.06, lon: 38.48, what: 'il lago, il mercato del pesce all\'alba e le cooperative di caffè' },
    ],
    notes: 'Il caffè arabica è originario di queste foreste e cresce ancora spontaneo. La cerimonia del caffè — tostatura, macinatura e tre giri di tazze — dura un\'ora ed è un rito sociale, non una degustazione. Verifica sempre le raccomandazioni di viaggio aggiornate.',
  },
  {
    id: 'wr-au-barossa', emoji: '🍷', name: 'Barossa Valley e Eden Valley',
    kind: 'vino', country: 'Australia', region: 'Australia Meridionale', continent: 'Oceania', days: 2, transport: 'auto',
    coords: { lat: -34.52, lon: 138.96 }, products: 'Shiraz da viti ultracentenarie, riesling di Eden Valley',
    season: 'Settembre-novembre e marzo-maggio; febbraio-aprile per la vendemmia.',
    stops: [
      { day: 1, place: 'Tanunda', lat: -34.52, lon: 138.96, what: 'l\'eredità dei coloni tedeschi luterani e il Butcher Baker Winemaker trail' },
      { day: 1, place: 'Nuriootpa', lat: -34.47, lon: 138.99, what: 'le cantine grandi e il centro commerciale della valle' },
      { day: 2, place: 'Angaston', lat: -34.50, lon: 139.05, what: 'la Barossa Farmers Market del sabato e i formaggi locali' },
      { day: 2, place: 'Eden Valley', lat: -34.64, lon: 139.10, what: 'in quota: riesling secchi e taglienti, un altro mondo dal shiraz sotto' },
    ],
    notes: 'Qui ci sono le viti di shiraz più vecchie del pianeta ancora produttive — alcune piantate prima del 1850, mai colpite dalla fillossera, che in Australia Meridionale non è mai arrivata. Un\'ora da Adelaide.',
  },
  {
    id: 'wr-au-yarra-margaret', emoji: '🍷', name: 'Yarra Valley e Margaret River',
    kind: 'vino', country: 'Australia', region: 'Victoria e Australia Occidentale', continent: 'Oceania', days: 3, transport: 'auto',
    coords: { lat: -37.65, lon: 145.52 }, products: 'Pinot noir e chardonnay in Yarra; cabernet a Margaret River',
    season: 'Ottobre-aprile.',
    stops: [
      { day: 1, place: 'Healesville', lat: -37.65, lon: 145.52, what: 'la Yarra Valley a un\'ora da Melbourne, con il santuario della fauna' },
      { day: 1, place: 'Yarra Glen', lat: -37.66, lon: 145.38, what: 'le mongolfiere all\'alba sopra i vigneti' },
      { day: 2, place: 'Margaret River', lat: -33.95, lon: 115.07, what: 'cabernet di livello mondiale e le onde da surf a dieci minuti' },
      { day: 3, place: 'Dunsborough', lat: -33.61, lon: 115.10, what: 'le grotte, i canguri sulla spiaggia e le cantine della costa nord' },
    ],
    notes: 'Due regioni agli antipodi del continente (3.400 km): si scelgono, non si sommano. Margaret River fa il 3% del vino australiano e il 20% del segmento premium.',
  },
  {
    id: 'wr-nz-marlborough', emoji: '🍷', name: 'Marlborough — la patria del sauvignon blanc',
    kind: 'vino', country: 'Nuova Zelanda', region: 'Isola del Sud', continent: 'Oceania', days: 2, transport: 'bici',
    coords: { lat: -41.51, lon: 173.96 }, products: 'Sauvignon blanc, pinot noir, metodo tradizionale',
    season: 'Novembre-aprile; febbraio per il Marlborough Wine & Food Festival.',
    stops: [
      { day: 1, place: 'Blenheim', lat: -41.51, lon: 173.96, what: 'base della regione e il museo dell\'aviazione di Peter Jackson' },
      { day: 1, place: 'Renwick', lat: -41.51, lon: 173.83, what: 'venti cantine in un raggio di pochi chilometri: si gira in bicicletta' },
      { day: 2, place: 'Marlborough Sounds', lat: -41.25, lon: 173.95, what: 'i fiordi, il Queen Charlotte Track e le cozze verdi di Havelock' },
    ],
    notes: 'Il sauvignon blanc di Marlborough ha cambiato il gusto mondiale a partire dal 1985. Renwick è il posto giusto: cantine a distanza di pedalata, noleggio bici in paese, nessuna auto.',
  },
  {
    id: 'wr-nz-otago', emoji: '🍷', name: 'Central Otago — il vigneto più a sud del mondo',
    kind: 'vino', country: 'Nuova Zelanda', region: 'Isola del Sud', continent: 'Oceania', days: 2, transport: 'bici',
    coords: { lat: -45.04, lon: 169.20 }, products: 'Pinot noir su schisto, riesling, pinot gris',
    season: 'Novembre-aprile; aprile per il foliage dorato dei pioppi.',
    stops: [
      { day: 1, place: 'Cromwell', lat: -45.04, lon: 169.20, what: 'il lago artificiale e il Bannockburn, cuore del pinot di Otago' },
      { day: 1, place: 'Bannockburn', lat: -45.08, lon: 169.17, what: 'i "sluicings", il paesaggio scavato dai cercatori d\'oro fra le vigne' },
      { day: 2, place: 'Gibbston Valley', lat: -45.00, lon: 168.83, what: 'il Central Otago Wine Trail in bici e il bungy jumping del Kawarau' },
      { day: 2, place: 'Queenstown', lat: -45.03, lon: 168.66, what: 'la base turistica, con i battelli sul Wakatipu' },
    ],
    notes: 'Il vigneto commerciale più meridionale del pianeta, su un altopiano semidesertico con escursioni termiche enormi. La ciclabile Queenstown Trail passa da cantina a cantina.',
  },
  {
    id: 'wr-jp-yamanashi', emoji: '🍷', name: 'Katsunuma e Yamanashi — il vino giapponese',
    kind: 'vino', country: 'Giappone', region: 'Yamanashi', continent: 'Asia', days: 1, transport: 'treno',
    coords: { lat: 35.66, lon: 138.73 }, products: 'Koshu, vitigno autoctono giapponese; muscat bailey A',
    season: 'Settembre-novembre per la vendemmia e le foglie rosse; aprile per i peschi in fiore.',
    stops: [
      { day: 1, place: 'Katsunuma', lat: 35.66, lon: 138.73, what: 'oltre trenta cantine attorno alla stazione, molte con degustazione a monete' },
      { day: 1, place: 'Fuefuki', lat: 35.65, lon: 138.64, what: 'le colline di peschi e vigneti con il Fuji sullo sfondo' },
      { day: 1, place: 'Kōfu', lat: 35.66, lon: 138.57, what: 'la città, il castello e gli onsen di Yumura per chiudere' },
    ],
    notes: 'Il koshu è un\'uva arrivata dalla Cina lungo la via della seta e coltivata qui da oltre mille anni: bianco delicatissimo, l\'unico che regge il sashimi. Novanta minuti di treno da Shinjuku, stazione Katsunuma-budōkyō: si va e si torna senza auto.',
  },
  {
    id: 'wr-jp-sake', emoji: '🍶', name: 'Nada e Fushimi — i distretti del sake',
    kind: 'distillati', country: 'Giappone', region: 'Kansai', continent: 'Asia', days: 2, transport: 'treno',
    coords: { lat: 34.72, lon: 135.24 }, products: 'Sake junmai e daiginjo; acqua miyamizu di Nada',
    season: 'Ottobre-marzo, la stagione della produzione; gennaio-febbraio per vedere i kura al lavoro.',
    stops: [
      { day: 1, place: 'Nada (Kobe)', lat: 34.72, lon: 135.24, what: 'il distretto che fa un quarto del sake giapponese: musei-kura visitabili a piedi' },
      { day: 1, place: 'Kobe', lat: 34.69, lon: 135.20, what: 'il porto, la carne di Kobe e la vista dal Nunobiki' },
      { day: 2, place: 'Fushimi (Kyoto)', lat: 34.93, lon: 135.76, what: 'il secondo distretto del Giappone, coi canali e le case di legno' },
      { day: 2, place: 'Fushimi Inari', lat: 34.97, lon: 135.77, what: 'i diecimila torii, a due fermate dai kura' },
    ],
    notes: 'Non esiste una "strada del sake" segnalata: questo è un percorso che costruiamo noi collegando i due grandi distretti, entrambi raggiungibili in metropolitana. Molti kura offrono degustazione a pagamento con bicchierino ricordo.',
  },
  {
    id: 'wr-jp-uji', emoji: '🍵', name: 'Uji e Wazuka — la via del tè',
    kind: 'te', country: 'Giappone', region: 'Kyoto', continent: 'Asia', days: 1, transport: 'treno',
    coords: { lat: 34.89, lon: 135.80 }, products: 'Matcha, gyokuro, sencha; il tè più pregiato del Giappone',
    season: 'Aprile-maggio per la prima raccolta (ichibancha); ottobre-novembre per il foliage.',
    stops: [
      { day: 1, place: 'Uji', lat: 34.89, lon: 135.80, what: 'il Byōdō-in UNESCO, le botteghe di tè millenarie e i mulini a pietra' },
      { day: 1, place: 'Wazuka', lat: 34.77, lon: 135.93, what: 'le colline coltivate a tè a strisce, il paesaggio del "tè di Uji"' },
      { day: 1, place: 'Fushimi', lat: 34.93, lon: 135.76, what: 'sulla via del ritorno a Kyoto, se resta tempo' },
    ],
    notes: 'A Uji si macina il matcha nel mulino di pietra davanti a te: servono quaranta minuti per fare trenta grammi, ed è il motivo del prezzo. Trenta minuti di treno da Kyoto.',
  },
  {
    id: 'wr-cn-ningxia', emoji: '🍷', name: 'Ningxia — le vigne ai piedi dell\'Helan',
    kind: 'vino', country: 'Cina', region: 'Ningxia', continent: 'Asia', days: 2, transport: 'auto',
    coords: { lat: 38.49, lon: 106.23 }, products: 'Cabernet sauvignon e blend bordolesi ai margini del deserto',
    season: 'Maggio-ottobre; d\'inverno le viti vengono interrate per sopravvivere al gelo.',
    stops: [
      { day: 1, place: 'Yinchuan', lat: 38.49, lon: 106.23, what: 'la capitale, il museo del vino e le tombe imperiali Xixia nel deserto' },
      { day: 1, place: 'Helan', lat: 38.55, lon: 106.06, what: 'le cantine monumentali ai piedi della catena, molte firmate da architetti' },
      { day: 2, place: 'Petroglifi di Helanshan', lat: 38.71, lon: 105.94, what: 'le incisioni rupestri preistoriche sopra i vigneti' },
    ],
    notes: 'Nessuna strada del vino formalizzata: questo percorso lo costruiamo noi collegando le cantine. Ogni autunno le viti vengono sepolte sotto la terra e riesumate in primavera: un lavoro che non si fa in nessun\'altra regione al mondo.',
  },
  {
    id: 'wr-in-nashik', emoji: '🍷', name: 'Nashik — la valle del vino indiana',
    kind: 'vino', country: 'India', region: 'Maharashtra', continent: 'Asia', days: 1, transport: 'auto',
    coords: { lat: 19.99, lon: 73.79 }, products: 'Sauvignon blanc, shiraz, spumante metodo tradizionale',
    season: 'Novembre-febbraio (vendemmia in gennaio-marzo); evitare il monsone.',
    stops: [
      { day: 1, place: 'Nashik', lat: 19.99, lon: 73.79, what: 'la città sacra sul Godavari e i ghat, base del giro' },
      { day: 1, place: 'Gangapur', lat: 20.03, lon: 73.72, what: 'le cantine sul lago, con amphitheatre e degustazioni organizzate' },
      { day: 1, place: 'Dindori', lat: 20.20, lon: 73.83, what: 'i vigneti d\'altura a nord, la zona più fresca della valle' },
    ],
    notes: 'Quattro ore da Mumbai. Nashik è anche una delle quattro città del Kumbh Mela: il contrasto fra pellegrinaggio induista e degustazione è parte del viaggio. Non c\'è un percorso segnalato: il tracciato lo proponiamo noi.',
  },
  {
    id: 'wr-lk-ceylon', emoji: '🍵', name: 'Ceylon Tea Trail — l\'altopiano di Sri Lanka',
    kind: 'te', country: 'Sri Lanka', region: 'Central Province', continent: 'Asia', days: 3, transport: 'treno',
    coords: { lat: 6.97, lon: 80.77 }, products: 'Tè nero d\'altura, high grown di Nuwara Eliya e Uva',
    season: 'Gennaio-marzo e luglio-settembre (monsoni diversi sui due versanti).',
    stops: [
      { day: 1, place: 'Kandy', lat: 7.29, lon: 80.63, what: 'il Tempio del Dente e il giardino botanico, partenza della ferrovia' },
      { day: 2, place: 'Nuwara Eliya', lat: 6.97, lon: 80.77, what: 'la "piccola Inghilterra" a 1.900 metri e le fabbriche coloniali di tè' },
      { day: 3, place: 'Ella', lat: 6.87, lon: 81.05, what: 'il Nine Arch Bridge e l\'Ella Gap, fra le piantagioni' },
      { day: 3, place: 'Haputale', lat: 6.77, lon: 80.95, what: 'il Lipton\'s Seat: il punto da cui Thomas Lipton guardava il suo impero' },
    ],
    notes: 'Il treno da Kandy a Ella è considerato uno dei più panoramici del mondo: sette ore fra le piantagioni, biglietti di seconda classe da prenotare con settimane di anticipo. Nelle fabbriche si segue tutto il ciclo, dall\'appassimento alla degustazione.',
  },
  {
    id: 'wr-cn-teahorse', emoji: '🍵', name: 'Tea Horse Road — Yunnan',
    kind: 'te', country: 'Cina', region: 'Yunnan', continent: 'Asia', days: 3, transport: 'auto',
    coords: { lat: 25.61, lon: 100.27 }, products: 'Pu-erh compresso, tè fermentato; la via carovaniera del tè',
    season: 'Marzo-maggio e settembre-novembre.',
    stops: [
      { day: 1, place: 'Dali', lat: 25.61, lon: 100.27, what: 'la città murata Bai sul lago Erhai, prima stazione della via' },
      { day: 2, place: 'Shaxi', lat: 26.31, lon: 99.86, what: 'l\'unica stazione di posta della via del tè conservata intatta, col mercato' },
      { day: 3, place: 'Lijiang', lat: 26.87, lon: 100.23, what: 'la città vecchia Naxi UNESCO, coi canali e le case di legno' },
    ],
    notes: 'Per mille anni il tè pu-erh dello Yunnan viaggiava a dorso di mulo fino al Tibet, scambiato con cavalli. Tratti di selciato originale sono ancora visibili attorno a Shaxi. Il pu-erh si invecchia come il vino, e i vecchi mattoni si vendono a peso d\'oro.',
  },
  {
    id: 'wr-kr-gyeongbuk', emoji: '🍶', name: 'Gyeongbuk Food Trail — Corea del Sud',
    kind: 'gusto', country: 'Corea del Sud', region: 'Gyeongsangbuk-do', continent: 'Asia', days: 2, transport: 'auto',
    coords: { lat: 36.57, lon: 128.73 }, products: 'Soju tradizionale e makgeolli, jerk beef di Andong, ganjang invecchiato',
    season: 'Aprile-giugno e settembre-novembre.',
    stops: [
      { day: 1, place: 'Andong', lat: 36.57, lon: 128.73, what: 'il soju di Andong (45 gradi, tradizione di famiglia) e il jjimdak' },
      { day: 1, place: 'Hahoe', lat: 36.54, lon: 128.52, what: 'il villaggio clanico UNESCO con le maschere e le case hanok' },
      { day: 2, place: 'Gyeongju', lat: 35.86, lon: 129.22, what: 'la capitale di Silla, i tumuli reali e il pane di Hwangnam' },
    ],
    notes: 'Il food trail coreano è in stile occidentale, con tappe elencate: raro in Asia. Ad Andong si assaggia il soju distillato tradizionale, che con quello industriale in bottiglia verde non c\'entra nulla.',
  },
  {
    id: 'wr-th-khaoyai', emoji: '🍷', name: 'Khao Yai — il vino della "nuova latitudine"',
    kind: 'vino', country: 'Thailandia', region: 'Nakhon Ratchasima', continent: 'Asia', days: 1, transport: 'auto',
    coords: { lat: 14.71, lon: 101.42 }, products: 'Syrah, chenin blanc e viognier a 14° di latitudine',
    season: 'Novembre-febbraio (stagione secca e vendemmia).',
    stops: [
      { day: 1, place: 'Pak Chong', lat: 14.71, lon: 101.42, what: 'la porta della valle, con le cantine sull\'altopiano' },
      { day: 1, place: 'Parco nazionale Khao Yai', lat: 14.44, lon: 101.37, what: 'foresta pluviale UNESCO, elefanti selvatici e cascate' },
    ],
    notes: 'Viticoltura di "nuova latitudine": qui la vite non va mai in dormienza e si vendemmia in inverno. Due ore e mezza da Bangkok, meta del weekend dei thailandesi.',
  },
  {
    id: 'wr-il-galilea', emoji: '🍷', name: 'Alta Galilea e colline di Giudea — Israele',
    kind: 'vino', country: 'Israele', region: 'Galilea', continent: 'Asia', days: 2, transport: 'auto',
    coords: { lat: 32.97, lon: 35.54 }, products: 'Cabernet, syrah in quota; vitigni biblici recuperati',
    season: 'Marzo-maggio e settembre-novembre.',
    stops: [
      { day: 1, place: 'Rosh Pina', lat: 32.97, lon: 35.54, what: 'il borgo di pietra restaurato e le cantine dell\'Alta Galilea' },
      { day: 1, place: 'Alture del Golan', lat: 33.00, lon: 35.70, what: 'suoli vulcanici e quota: i vini più strutturati del paese' },
      { day: 2, place: 'Zichron Ya\'akov', lat: 32.57, lon: 34.95, what: 'la colonia fondata dai Rothschild nel 1882, con la cantina storica' },
    ],
    notes: 'Vitigni antichi come il marawi sono stati recuperati dal DNA di semi archeologici. Verifica sempre le raccomandazioni di viaggio aggiornate prima di programmare.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// LE STRADE DEL GUSTO NON-VINO
//
// La legge italiana 268/1999 estende la disciplina delle strade del vino
// all'olio e ai prodotti tipici: il gastronomico è dentro la stessa norma
// e ha lo stesso schema dati. Fuori d'Italia il modello è il "trail"
// tematico — formaggio, whisky, birra, sidro — con le tappe pubblicate
// dall'ente che lo gestisce.
// ─────────────────────────────────────────────────────────────────────

const GUSTO: TasteRoute[] = [
  {
    id: 'fr-it-parmigiano', emoji: '🧀', name: 'Strada del Parmigiano Reggiano',
    kind: 'formaggio', country: 'Italia', region: 'Emilia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 44.80, lon: 10.33 }, products: 'Parmigiano Reggiano DOP, Prosciutto di Parma, culatello',
    season: 'Tutto l\'anno. I caseifici lavorano dalle 7 alle 11: la visita è all\'alba.',
    stops: [
      { day: 1, place: 'Parma', lat: 44.80, lon: 10.33, what: 'città creativa UNESCO per la gastronomia, il Battistero e le salumerie' },
      { day: 1, place: 'Langhirano', lat: 44.61, lon: 10.27, what: 'i prosciuttifici con le finestre aperte al vento della Val Parma' },
      { day: 2, place: 'Bibbiano', lat: 44.66, lon: 10.47, what: 'dove secondo la tradizione è nato il Parmigiano: caseifici visitabili' },
      { day: 2, place: 'Polesine Parmense', lat: 45.00, lon: 10.09, what: 'le cantine del culatello nella nebbia della Bassa' },
    ],
    notes: 'Il caseificio si visita all\'alba perché il latte arriva la sera e la mattina presto: chi prenota per le dieci trova tutto finito. Il Consorzio organizza visite guidate con degustazione di tre stagionature — 12, 24 e 36 mesi — che è il modo giusto per capire il prodotto.',
  },
  {
    id: 'fr-it-olio-puglia', emoji: '🫒', name: 'Strada dell\'Olio Extravergine di Puglia',
    kind: 'olio', country: 'Italia', region: 'Puglia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 40.73, lon: 17.58 }, products: 'Olio DOP Collina di Brindisi e Terra di Bari, ulivi monumentali',
    season: 'Ottobre-dicembre per la molitura; primavera per il paesaggio.',
    stops: [
      { day: 1, place: 'Ostuni', lat: 40.73, lon: 17.58, what: 'la città bianca sopra la piana degli ulivi monumentali' },
      { day: 1, place: 'Fasano', lat: 40.83, lon: 17.36, what: 'le masserie olearie e i frantoi IPOGEI, scavati sotto terra' },
      { day: 2, place: 'Bitonto', lat: 41.11, lon: 16.69, what: 'la cattedrale romanica e il museo dell\'olio' },
      { day: 2, place: 'Andria', lat: 41.23, lon: 16.29, what: 'Castel del Monte a poca strada, fra gli oliveti della Murgia' },
    ],
    notes: 'I frantoi ipogei sono scavati nella roccia a temperatura costante: erano l\'industria del Sei-Settecento e alcuni si visitano. La Xylella ha colpito duramente il Salento: parte del paesaggio che si legge nelle guide non esiste più, e vale la pena raccontarlo con onestà.',
  },
  {
    id: 'fr-it-cioccolato', emoji: '🍫', name: 'Le vie del cioccolato italiano',
    kind: 'cacao', country: 'Italia', region: 'Sicilia e Piemonte', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 36.86, lon: 14.76 }, products: 'Cioccolato di Modica IGP a freddo, gianduia di Torino',
    season: 'Ottobre-aprile (d\'estate il cioccolato soffre); dicembre a Torino per CioccolaTò.',
    stops: [
      { day: 1, place: 'Modica', lat: 36.86, lon: 14.76, what: 'la lavorazione a freddo di eredità azteca, coi cristalli di zucchero interi' },
      { day: 1, place: 'Ragusa Ibla', lat: 36.93, lon: 14.74, what: 'il barocco UNESCO a pochi chilometri' },
      { day: 2, place: 'Torino', lat: 45.07, lon: 7.69, what: 'il gianduiotto, il bicerin e i caffè storici di piazza' },
      { day: 2, place: 'Perugia', lat: 43.11, lon: 12.39, what: 'la Casa del Cioccolato e l\'Eurochocolate di ottobre' },
    ],
    notes: 'Il cioccolato di Modica non viene mai concato: si lavora sotto i 45 gradi e lo zucchero resta in cristalli, che è il motivo della consistenza granulosa. Il gianduia nasce a Torino dal blocco napoleonico, quando il cacao scarseggiava e si allungò con le nocciole delle Langhe.',
  },
  {
    id: 'fr-ch-gruyere', emoji: '🧀', name: 'La route du Gruyère e del cioccolato',
    kind: 'formaggio', country: 'Svizzera', region: 'Friburgo', continent: 'Europa', days: 1, transport: 'treno',
    coords: { lat: 46.58, lon: 7.08 }, products: 'Gruyère AOP, doppia panna della Gruyère, cioccolato',
    season: 'Tutto l\'anno; maggio-settembre per le malghe d\'alpeggio.',
    stops: [
      { day: 1, place: 'Gruyères', lat: 46.58, lon: 7.08, what: 'il borgo medievale sul cocuzzolo e la Maison du Gruyère ai suoi piedi' },
      { day: 1, place: 'Broc', lat: 46.60, lon: 7.10, what: 'la fabbrica di cioccolato con la visita e la degustazione libera' },
      { day: 1, place: 'Bulle', lat: 46.62, lon: 7.06, what: 'il museo gruérien e il mercato del giovedì' },
    ],
    notes: 'Il "Train du Chocolat" da Montreux collega in giornata formaggio e cioccolato in carrozze Belle Époque: si prenota, ed è la soluzione più bella. La doppia panna della Gruyère col meringue è la cosa più calorica della Svizzera.',
  },
  {
    id: 'fr-fr-comte', emoji: '🧀', name: 'Route du Comté',
    kind: 'formaggio', country: 'Francia', region: 'Franca Contea', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 46.84, lon: 5.71 }, products: 'Comté AOP, Morbier, Mont d\'Or; vin jaune del Jura',
    season: 'Maggio-ottobre; settembre-marzo per il Mont d\'Or.',
    stops: [
      { day: 1, place: 'Poligny', lat: 46.84, lon: 5.71, what: 'la "capitale del Comté": la Maison du Comté spiega tutta la filiera' },
      { day: 1, place: 'Arbois', lat: 46.90, lon: 5.77, what: 'le fruitières (caseifici cooperativi) e le cantine del vin jaune' },
      { day: 2, place: 'Morbier', lat: 46.53, lon: 6.05, what: 'il formaggio con la riga di cenere nel mezzo, e la sua storia' },
      { day: 2, place: 'Fort des Rousses', lat: 46.48, lon: 6.06, what: 'l\'ex fortezza militare trasformata nella più grande cave d\'affinage d\'Europa' },
    ],
    notes: 'La "fruitière" è la cooperativa dei contadini che mettono insieme il latte: un\'istituzione dal XIII secolo, ancora viva. Il Comté cambia sapore a seconda dell\'alpeggio e della stagione, e le cave d\'affinage lo classificano una forma alla volta.',
  },
  {
    id: 'fr-nl-kaas', emoji: '🧀', name: 'Kaasroute — i mercati del formaggio olandesi',
    kind: 'formaggio', country: 'Paesi Bassi', region: 'Olanda Meridionale e Settentrionale', continent: 'Europa', days: 2, transport: 'bici',
    coords: { lat: 52.01, lon: 4.71 }, products: 'Gouda, Edam, boerenkaas di fattoria',
    season: 'Aprile-settembre (i mercati storici si tengono d\'estate, di giovedì o venerdì mattina).',
    stops: [
      { day: 1, place: 'Gouda', lat: 52.01, lon: 4.71, what: 'il mercato del formaggio davanti al municipio gotico, il giovedì mattina' },
      { day: 1, place: 'Bodegraven', lat: 52.08, lon: 4.75, what: 'le fattorie del polder dove il boerenkaas si fa ancora col latte crudo' },
      { day: 2, place: 'Edam', lat: 52.51, lon: 5.05, what: 'il mercato storico del mercoledì mattina, con i portatori in costume' },
      { day: 2, place: 'Alkmaar', lat: 52.63, lon: 4.75, what: 'il più famoso: le squadre coi cappelli colorati e le barelle di legno' },
    ],
    notes: 'I mercati sono ricostruzioni storiche a beneficio dei turisti, e va detto: il formaggio vero si compra nelle fattorie del polder, raggiungibili in bicicletta su piste perfette. Chiedi il boerenkaas a latte crudo, non il Gouda industriale.',
  },
  {
    id: 'fr-uk-speyside', emoji: '🥃', name: 'Malt Whisky Trail — Speyside',
    kind: 'distillati', country: 'Regno Unito', region: 'Scozia', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 57.44, lon: -3.12 }, products: 'Single malt di Speyside; oltre metà delle distillerie scozzesi',
    season: 'Maggio-settembre; fine aprile-inizio maggio per lo Spirit of Speyside Festival.',
    stops: [
      { day: 1, place: 'Dufftown', lat: 57.44, lon: -3.12, what: 'la "capitale del malto": sette distillerie in un paese di 1.600 abitanti' },
      { day: 1, place: 'Craigellachie', lat: 57.48, lon: -3.18, what: 'la Speyside Cooperage: si vedono fare le botti a mano' },
      { day: 2, place: 'Aberlour', lat: 57.47, lon: -3.22, what: 'sul fiume Spey, con la passeggiata lungo l\'ex ferrovia' },
      { day: 2, place: 'Rothes', lat: 57.53, lon: -3.20, what: 'quattro distillerie e la fonderia di alambicchi in rame' },
      { day: 3, place: 'Elgin', lat: 57.65, lon: -3.32, what: 'la cattedrale in rovina e la base per la costa del Moray' },
    ],
    notes: 'Il Malt Whisky Trail è l\'unico itinerario del malto al mondo con segnaletica ufficiale. La Speyside Cooperage è la tappa che nessuno si aspetta e che tutti ricordano. Le distillerie danno un "driver\'s dram" da portare via a chi guida: chiedilo.',
  },
  {
    id: 'fr-uk-islay', emoji: '🥃', name: 'Islay — l\'isola del whisky torbato',
    kind: 'distillati', country: 'Regno Unito', region: 'Ebridi', continent: 'Europa', days: 3, transport: 'barca',
    coords: { lat: 55.76, lon: -6.29 }, products: 'Single malt torbato, torba delle Ebridi',
    season: 'Maggio-settembre; fine maggio per il Fèis Ìle.',
    stops: [
      { day: 1, place: 'Port Ellen', lat: 55.63, lon: -6.19, what: 'sbarco del traghetto e le tre distillerie della costa sud, a piedi una dall\'altra' },
      { day: 2, place: 'Bowmore', lat: 55.76, lon: -6.29, what: 'la chiesa rotonda (perché il diavolo non trovi angoli) e il malting a mano' },
      { day: 3, place: 'Port Askaig', lat: 55.85, lon: -6.11, what: 'lo stretto verso Jura e le distillerie del nord' },
      { day: 3, place: 'Portnahaven', lat: 55.68, lon: -6.51, what: 'le foche sugli scogli e il Rhinns, il lato selvaggio dell\'isola' },
    ],
    notes: 'Sull\'isola vivono tremila persone e ci sono nove distillerie in attività. Le tre della costa sud — Laphroaig, Lagavulin, Ardbeg — si raggiungono a piedi lungo la strada in un\'unica camminata di cinque chilometri: il modo giusto per farlo. Traghetto da Kennacraig, da prenotare in anticipo con l\'auto.',
  },
  {
    id: 'fr-ie-whiskey', emoji: '🥃', name: 'Irish Whiskey Trail',
    kind: 'distillati', country: 'Irlanda', region: 'Isola d\'Irlanda', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 53.35, lon: -6.26 }, products: 'Single pot still irlandese, triplo distillato',
    season: 'Maggio-settembre.',
    stops: [
      { day: 1, place: 'Dublino', lat: 53.35, lon: -6.26, what: 'le distillerie urbane delle Liberties, dove il whiskey è tornato dopo un secolo' },
      { day: 2, place: 'Midleton', lat: 51.92, lon: -8.17, what: 'la distilleria storica con l\'alambicco di rame più grande del mondo' },
      { day: 3, place: 'Bushmills', lat: 55.20, lon: -6.52, what: 'la licenza di distillazione più antica del mondo (1608), accanto al Giant\'s Causeway' },
    ],
    notes: 'Il pot still irlandese usa orzo maltato e non maltato insieme: è una categoria che esiste solo qui, nata per aggirare una tassa britannica sul malto. Il whiskey irlandese si distilla tre volte, lo scozzese due.',
  },
  {
    id: 'fr-be-trappiste', emoji: '🍺', name: 'Le birre trappiste del Belgio',
    kind: 'birra', country: 'Belgio', region: 'Vallonia e Fiandre', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 50.85, lon: 4.35 }, products: 'Trappiste, lambic a fermentazione spontanea, gueuze',
    season: 'Tutto l\'anno.',
    stops: [
      { day: 1, place: 'Bruxelles', lat: 50.85, lon: 4.35, what: 'la Cantillon, birreria-museo del lambic ancora in funzione dal 1900' },
      { day: 1, place: 'Valle della Senne', lat: 50.78, lon: 4.20, what: 'le uniche birre al mondo fermentate dai lieviti selvatici dell\'aria' },
      { day: 2, place: 'Chimay', lat: 50.05, lon: 4.32, what: 'l\'abbazia di Scourmont e l\'Espace Chimay con degustazione e formaggio' },
      { day: 3, place: 'Orval', lat: 49.64, lon: 5.35, what: 'le rovine dell\'abbazia cistercense e la birra col brettanomyces' },
      { day: 3, place: 'Westvleteren', lat: 50.92, lon: 2.72, what: 'la più difficile da comprare al mondo: si prenota per telefono, poche casse a testa' },
    ],
    notes: 'La cultura birraria belga è patrimonio immateriale UNESCO. Le trappiste vere sono poche e devono essere prodotte dentro un monastero, sotto il controllo dei monaci, con i profitti in beneficenza: il logo esagonale "Authentic Trappist Product" lo certifica. Il lambic di Cantillon è acido e spiazzante: preparati.',
  },
  {
    id: 'fr-de-bamberga', emoji: '🍺', name: 'Bierstraße della Franconia — Bamberga',
    kind: 'birra', country: 'Germania', region: 'Baviera', continent: 'Europa', days: 2, transport: 'piedi',
    coords: { lat: 49.89, lon: 10.89 }, products: 'Rauchbier affumicata, Kellerbier, birre di monastero',
    season: 'Maggio-ottobre per i Bierkeller all\'aperto; tutto l\'anno in città.',
    stops: [
      { day: 1, place: 'Bamberga', lat: 49.89, lon: 10.89, what: 'centro UNESCO, nove birrifici in città e la Rauchbier di Schlenkerla' },
      { day: 2, place: 'Aufseß', lat: 49.88, lon: 11.24, what: 'il record mondiale Guinness: quattro birrifici per 1.500 abitanti' },
      { day: 2, place: 'Svizzera Francone', lat: 49.80, lon: 11.30, what: 'il Bierwanderweg: si cammina di birrificio in birrificio fra i villaggi' },
    ],
    notes: 'La Franconia ha la maggiore densità di birrifici al mondo: oltre duecento in un\'area piccola. Il Bierwanderweg di Aufseß è un anello di 14 km che tocca quattro birrifici: si cammina, non si guida, ed è esattamente il punto.',
  },
  {
    id: 'fr-cz-birra', emoji: '🍺', name: 'La via della pilsner — Boemia',
    kind: 'birra', country: 'Cechia', region: 'Boemia', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 49.75, lon: 13.38 }, products: 'Pilsner originale, lager di Budweis, luppolo di Žatec',
    season: 'Tutto l\'anno.',
    stops: [
      { day: 1, place: 'Plzeň', lat: 49.75, lon: 13.38, what: 'dove nel 1842 è nata la pilsner: le cantine sotterranee e la birra non filtrata dalla botte' },
      { day: 1, place: 'Žatec', lat: 50.33, lon: 13.55, what: 'la città del luppolo Saaz, con i magazzini e il museo' },
      { day: 2, place: 'České Budějovice', lat: 48.97, lon: 14.47, what: 'la Budweis originale e la piazza quadrata più grande d\'Europa' },
      { day: 2, place: 'Praga', lat: 50.09, lon: 14.42, what: 'ritorno: le birrerie storiche e il consumo pro capite più alto del mondo' },
    ],
    notes: 'Tutte le "pils" del mondo discendono da una sola birra fatta a Plzeň nel 1842. Nelle cantine di Pilsner Urquell si assaggia la birra non filtrata e non pastorizzata direttamente dalla botte di legno: non è in commercio da nessun\'altra parte.',
  },
  {
    id: 'fr-es-jamon', emoji: '🍖', name: 'Ruta del Jabugo — il prosciutto iberico',
    kind: 'gusto', country: 'Spagna', region: 'Andalusia ed Estremadura', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 37.92, lon: -6.73 }, products: 'Jamón ibérico de bellota, dehesa di lecci',
    season: 'Ottobre-marzo per la montanera (i maiali a ghiande); primavera per la dehesa fiorita.',
    stops: [
      { day: 1, place: 'Jabugo', lat: 37.92, lon: -6.73, what: 'le cantine di stagionatura e i secaderos nella sierra di Aracena' },
      { day: 1, place: 'Aracena', lat: 37.89, lon: -6.56, what: 'la Gruta de las Maravillas sotto il castello e il mercato' },
      { day: 2, place: 'Dehesa', lat: 37.95, lon: -6.60, what: 'il bosco-pascolo di lecci dove i maiali mangiano ghiande da ottobre' },
      { day: 2, place: 'Guijuelo', lat: 40.55, lon: -5.67, what: 'l\'altra grande DOP, sull\'altopiano di Salamanca (per chi risale a nord)' },
    ],
    notes: 'La dehesa è un ecosistema costruito dall\'uomo in mille anni e riconosciuto per la sua biodiversità: il prosciutto è il suo prodotto, non il contrario. L\'etichetta nera è "100% ibérico de bellota", tutto il resto è un altro prodotto.',
  },
  {
    id: 'fr-es-jaen', emoji: '🫒', name: 'Il mare di ulivi di Jaén',
    kind: 'olio', country: 'Spagna', region: 'Andalusia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 38.01, lon: -3.37 }, products: 'Olio picual DOP; la maggior concentrazione di ulivi del pianeta',
    season: 'Novembre-gennaio per la raccolta e i frantoi in funzione.',
    stops: [
      { day: 1, place: 'Úbeda', lat: 38.01, lon: -3.37, what: 'il rinascimento andaluso UNESCO e i frantoi della campagna' },
      { day: 1, place: 'Baeza', lat: 37.99, lon: -3.47, what: 'la gemella di Úbeda, a nove chilometri: due città UNESCO in una giornata' },
      { day: 2, place: 'Jaén', lat: 37.77, lon: -3.79, what: 'il castello di Santa Catalina e i bagni arabi sotto il palazzo' },
      { day: 2, place: 'Sierra de Cazorla', lat: 37.91, lon: -2.97, what: 'il parco naturale più grande di Spagna, sopra il mare di ulivi' },
    ],
    notes: 'Jaén ha oltre sessanta milioni di ulivi: dal castello si vedono fino all\'orizzonte in ogni direzione. La picual è un\'oliva amara e piccante, e va assaggiata a freddo sul pane per capirla.',
  },
  {
    id: 'fr-gr-olivo', emoji: '🫒', name: 'Routes of the Olive Tree — Messenia',
    kind: 'olio', country: 'Grecia', region: 'Peloponneso', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 37.04, lon: 22.11 }, products: 'Olio koroneiki, olive di Kalamata',
    season: 'Ottobre-dicembre per la raccolta; aprile-giugno per il paesaggio.',
    stops: [
      { day: 1, place: 'Kalamata', lat: 37.04, lon: 22.11, what: 'la città che dà il nome all\'oliva più famosa del mondo, e il suo mercato' },
      { day: 1, place: 'Messene antica', lat: 37.18, lon: 21.92, what: 'il sito archeologico fra gli uliveti, uno dei più belli e vuoti di Grecia' },
      { day: 2, place: 'Koroni', lat: 36.79, lon: 21.95, what: 'il paese che ha dato il nome alla cultivar koroneiki, col castello sul mare' },
      { day: 2, place: 'Pylos', lat: 36.91, lon: 21.70, what: 'la baia di Navarino e il palazzo di Nestore, con le tavolette dell\'olio miceneo' },
    ],
    notes: 'A Pylos sono state trovate tavolette in lineare B che registrano forniture di olio: la contabilità dell\'olio è vecchia di 3.300 anni. Le Routes of the Olive Tree sono un itinerario culturale certificato dal Consiglio d\'Europa dal 2005.',
  },
  {
    id: 'fr-ca-cidre', emoji: '🍎', name: 'Route des cidres — Montérégie',
    kind: 'gusto', country: 'Canada', region: 'Québec', continent: 'Nord America', days: 1, transport: 'auto',
    coords: { lat: 45.42, lon: -73.16 }, products: 'Sidro di ghiaccio, sidro effervescente, mele del Mont Saint-Hilaire',
    season: 'Settembre-ottobre per la raccolta; gennaio per il sidro di ghiaccio.',
    stops: [
      { day: 1, place: 'Mont Saint-Hilaire', lat: 45.56, lon: -73.17, what: 'i frutteti sul monte e le cidreries con degustazione' },
      { day: 1, place: 'Rougemont', lat: 45.43, lon: -73.05, what: 'la capitale della mela del Québec, con l\'autocueillette' },
      { day: 1, place: 'Mont Saint-Grégoire', lat: 45.34, lon: -73.16, what: 'le cabanes à sucre e i frutteti, chiusura del circuito' },
    ],
    notes: 'Il sidro di ghiaccio è un\'invenzione quebecchese degli anni Novanta: le mele restano sull\'albero fino a dicembre e gelano. Il percorso è di circa 140 km in Montérégie, un\'ora da Montréal.',
  },
  {
    id: 'fr-us-cheesetrail', emoji: '🧀', name: 'California Cheese Trail',
    kind: 'formaggio', country: 'Stati Uniti', region: 'California', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 38.24, lon: -122.63 }, products: 'Formaggi artigianali di capra, pecora e vacca; latte di pascolo costiero',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Petaluma', lat: 38.24, lon: -122.63, what: 'la capitale lattiera di Sonoma, con le fattorie aperte alla visita' },
      { day: 1, place: 'Point Reyes', lat: 38.07, lon: -122.81, what: 'i pascoli sull\'oceano e i caseifici della penisola' },
      { day: 2, place: 'Sonoma', lat: 38.29, lon: -122.46, what: 'la piazza storica: formaggi e vino nella stessa mattinata' },
      { day: 2, place: 'Marin French Cheese', lat: 38.17, lon: -122.70, what: 'il caseificio in attività dal 1865, il più antico degli Stati Uniti' },
    ],
    notes: 'Nove anelli da 11 a 200 chilometri e 77 caseifici mappati dall\'associazione. È la controparte casearia delle wine route accanto, e si combina con Sonoma nello stesso weekend.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// IL CATALOGO E GLI STRUMENTI PER USARLO
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// SECONDO GIRO — quello che si trova solo cercando nella lingua del posto
//
// Il primo catalogo era costruito su fonti in inglese, francese, italiano e
// spagnolo, e si vedeva: mancavano i `borút` ungheresi, le `vinařské
// stezky` morave (1.200 km di ciclabili fra le vigne), i `Δρόμοι του
// Κρασιού` greci, la `Malokarpatská vinná cesta`. Cercare "wine route"
// in Ungheria non dà niente; cercare "borút" dà una rete intera.
// ─────────────────────────────────────────────────────────────────────

const AGGIUNTE: TasteRoute[] = [
  {
    id: 'wr-cz-morava', emoji: '🚲', name: 'Moravské vinařské stezky — le ciclabili del vino moravo',
    kind: 'vino', country: 'Cechia', region: 'Moravia meridionale', continent: 'Europa', days: 3, transport: 'bici',
    coords: { lat: 48.81, lon: 16.05 }, products: 'Veltlínské zelené, Ryzlink, Pálava; vini di vigneti terrazzati',
    season: 'Maggio-ottobre; settembre per le vinobraní, le feste della vendemmia.',
    stops: [
      { day: 1, place: 'Znojmo', lat: 48.86, lon: 16.05, what: 'partenza della dorsale: cantine sotterranee lunghe chilometri sotto la città' },
      { day: 1, place: 'Mikulov', lat: 48.81, lon: 16.64, what: 'il castello sulla rupe, la Santa Collina e la botte da 1.000 ettolitri' },
      { day: 2, place: 'Valtice', lat: 48.74, lon: 16.75, what: 'il Salon vín, l\'enoteca nazionale ceca nelle cantine del castello (UNESCO Lednice-Valtice)' },
      { day: 2, place: 'Velké Pavlovice', lat: 48.90, lon: 16.82, what: 'il mare di vigne terrazzate e i sentieri fra i vinné sklepy' },
      { day: 3, place: 'Uherské Hradiště', lat: 49.07, lon: 17.46, what: 'arrivo nella Slovácko, fra costumi tradizionali e slivovice' },
    ],
    notes: 'Rete di 1.200 km e undici anelli, con la dorsale Moravská vinná stezka di 295 km da Znojmo a Uherské Hradiště: è pensata per la BICICLETTA, ed è la ragione per cui funziona. I "sklepy" sono file di cantine scavate fuori dal paese, con la porta sulla strada: si passa e si assaggia.',
  },
  {
    id: 'wr-sk-malokarpatska', emoji: '🍷', name: 'Malokarpatská vinná cesta',
    kind: 'vino', country: 'Slovacchia', region: 'Piccoli Carpazi', continent: 'Europa', days: 2, transport: 'treno',
    coords: { lat: 48.28, lon: 17.27 }, products: 'Frankovka modrá, Veltlínske zelené, Devín',
    season: 'Maggio-ottobre; novembre per il Deň otvorených pivníc (cantine aperte).',
    stops: [
      { day: 1, place: 'Pezinok', lat: 48.29, lon: 17.27, what: 'il museo del vino slovacco e le cantine del centro, a mezz\'ora da Bratislava' },
      { day: 1, place: 'Modra', lat: 48.33, lon: 17.31, what: 'la ceramica dipinta e le cantine familiari sotto i Carpazi' },
      { day: 2, place: 'Svätý Jur', lat: 48.25, lon: 17.21, what: 'il borgo vinicolo medievale con le case-cantina e la riserva naturale' },
      { day: 2, place: 'Bratislava', lat: 48.15, lon: 17.11, what: 'chiusura in città, con i wine bar della Città Vecchia' },
    ],
    notes: 'Tutte le tappe sono sulla linea ferroviaria da Bratislava: venti minuti fra una e l\'altra, nessuna auto. Due volte l\'anno (maggio e novembre) le cantine aprono tutte insieme con un unico biglietto.',
  },
  {
    id: 'wr-hu-villany-borut', emoji: '🍷', name: 'Villány-Siklósi borút — la prima strada del vino ungherese',
    kind: 'vino', country: 'Ungheria', region: 'Villány', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.87, lon: 18.45 }, products: 'Cabernet franc, Portugieser, Kékfrankos; il rosso ungherese moderno',
    season: 'Maggio-ottobre; ottobre per la Vörösbor Fesztivál.',
    stops: [
      { day: 1, place: 'Villány', lat: 45.87, lon: 18.45, what: 'la via delle cantine di Baross Gábor utca: una accanto all\'altra, a piedi' },
      { day: 1, place: 'Villánykövesd', lat: 45.89, lon: 18.42, what: 'le file di case-cantina bianche scavate nella collina, immagine simbolo della zona' },
      { day: 2, place: 'Siklós', lat: 45.85, lon: 18.30, what: 'il castello medievale meglio conservato d\'Ungheria e le terme di Harkány accanto' },
      { day: 2, place: 'Pécs', lat: 46.07, lon: 18.23, what: 'la necropoli paleocristiana UNESCO e la moschea diventata chiesa' },
    ],
    notes: 'Fondata nel 1994, è la prima borút ufficiale d\'Ungheria e il modello di tutte le altre. Il cabernet franc di Villány è considerato il migliore d\'Europa centrale: la parola locale è "villányi franc".',
  },
  {
    id: 'wr-hu-balaton-borut', emoji: '🌋', name: 'Balaton-felvidéki borút — i vulcani del lago',
    kind: 'vino', country: 'Ungheria', region: 'Altopiano del Balaton', continent: 'Europa', days: 2, transport: 'barca',
    coords: { lat: 46.79, lon: 17.50 }, products: 'Olaszrizling, Kéknyelű, Szürkebarát su basalto',
    season: 'Giugno-settembre; agosto per il Rosé Fesztivál.',
    stops: [
      { day: 1, place: 'Badacsony', lat: 46.79, lon: 17.50, what: 'il cono basaltico a picco sul lago, con le cantine sui terrazzamenti' },
      { day: 1, place: 'Szigliget', lat: 46.80, lon: 17.44, what: 'la rocca sulla collina e la vista su tutto il Balaton' },
      { day: 2, place: 'Tihany', lat: 46.91, lon: 17.89, what: 'l\'abbazia benedettina sulla penisola e i campi di lavanda a giugno' },
      { day: 2, place: 'Balatonfüred', lat: 46.96, lon: 17.89, what: 'la promenade termale e il porto: si arriva e si riparte in traghetto' },
    ],
    notes: 'Il Kéknyelű ("gambo blu") cresce solo qui e non altrove al mondo: è un\'uva che ha bisogno di un\'altra varietà per impollinarsi. I traghetti collegano le due rive: la gita si fa senza auto.',
  },
  {
    id: 'wr-at-weinviertel', emoji: '🍷', name: 'Weinviertel — le Kellergassen',
    kind: 'vino', country: 'Austria', region: 'Bassa Austria', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 48.53, lon: 16.36 }, products: 'Grüner Veltliner Weinviertel DAC, il "Pfefferl" pepato',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Poysdorf', lat: 48.67, lon: 16.63, what: 'la capitale del Veltliner e il museo del vino nelle cantine' },
      { day: 1, place: 'Falkenstein', lat: 48.71, lon: 16.61, what: 'la rovina del castello e una delle Kellergassen più fotografate' },
      { day: 2, place: 'Wolkersdorf', lat: 48.38, lon: 16.52, what: 'la porta sud della regione, a mezz\'ora da Vienna' },
      { day: 2, place: 'Retz', lat: 48.76, lon: 15.95, what: 'la città con 20 km di cantine scavate SOTTO le case, visitabili' },
    ],
    notes: 'Le Kellergassen sono "vie di cantine": file di casette-cantina fuori dal paese, senza abitanti, dove i vignaioli lavoravano e ricevevano. Ce ne sono oltre mille nel Weinviertel, ed è un paesaggio che non esiste altrove.',
  },
  {
    id: 'wr-gr-nordgreece', emoji: '🍷', name: 'Δρόμοι του Κρασιού — le Strade del Vino della Grecia del Nord',
    kind: 'vino', country: 'Grecia', region: 'Macedonia, Tracia, Epiro', continent: 'Europa', days: 3, transport: 'auto',
    coords: { lat: 40.63, lon: 22.07 }, products: 'Xinomavro, Assyrtiko, Malagousia, Limnio (il vitigno di Aristotele)',
    season: 'Maggio-giugno e settembre-ottobre.',
    stops: [
      { day: 1, place: 'Naoussa', lat: 40.63, lon: 22.07, what: 'lo Xinomavro sui pendii del Vermio: il "nebbiolo greco"' },
      { day: 1, place: 'Amyntaio', lat: 40.69, lon: 21.68, what: 'in quota fra i laghi, dove nasce lo Xinomavro spumante' },
      { day: 2, place: 'Drama', lat: 41.15, lon: 24.15, what: 'le cantine moderne della Tracia, fra le più premiate del paese' },
      { day: 3, place: 'Monte Athos (Ouranoupoli)', lat: 40.33, lon: 23.98, what: 'i vigneti dei monasteri e il Limnio, coltivato da 2.500 anni' },
      { day: 3, place: 'Salonicco', lat: 40.64, lon: 22.94, what: 'base e chiusura: mercati Modiano e Kapani, e le mezedopolia' },
    ],
    notes: 'Rete fondata nel 1993 come Wine Roads of Macedonia, oggi otto itinerari segnalati con 29 cantine socie e circa 90.000 visitatori l\'anno. Include monasteri, musei e taverne, non solo cantine: è la rete meglio organizzata dell\'Europa sud-orientale.',
  },
  {
    id: 'wr-es-ribeirasacra', emoji: '⛰', name: 'Ruta do Viño da Ribeira Sacra — la viticoltura eroica dei canyon',
    kind: 'vino', country: 'Spagna', region: 'Galizia', continent: 'Europa', days: 2, transport: 'barca',
    coords: { lat: 42.40, lon: -7.70 }, products: 'Mencía su terrazze a picco sul Sil e sul Miño',
    season: 'Maggio-ottobre; settembre per la vendemmia, che qui si fa in barca.',
    stops: [
      { day: 1, place: 'Monforte de Lemos', lat: 42.52, lon: -7.51, what: 'base della comarca, col monastero e il collegio "Escorial gallego"' },
      { day: 1, place: 'Canyon del Sil', lat: 42.40, lon: -7.70, what: 'i catamarani turistici sotto le terrazze verticali: il modo giusto di vederle' },
      { day: 2, place: 'Doade', lat: 42.44, lon: -7.62, what: 'il mirador sui socalcos, i terrazzamenti costruiti dai romani' },
      { day: 2, place: 'Santo Estevo de Ribas de Sil', lat: 42.42, lon: -7.68, what: 'il monastero romanico diventato parador, sospeso sulla gola' },
    ],
    notes: 'Pendenze fino all\'85%: si vendemmia con le ceste in spalla o calando l\'uva con le funi, e in certi punti l\'uva arriva alla cantina in barca. È candidata a patrimonio UNESCO. La Mencía qui è tesa e leggera, l\'opposto dei rossi spagnoli da manuale.',
  },
  {
    id: 'wr-pt-bairrada-dao', emoji: '🍷', name: 'Rota da Bairrada e do Dão',
    kind: 'vino', country: 'Portogallo', region: 'Beiras', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 40.42, lon: -8.44 }, products: 'Baga della Bairrada, Touriga Nacional e Encruzado del Dão',
    season: 'Aprile-ottobre.',
    stops: [
      { day: 1, place: 'Anadia', lat: 40.44, lon: -8.43, what: 'il museo del vino della Bairrada e le cave dello spumante' },
      { day: 1, place: 'Mealhada', lat: 40.38, lon: -8.45, what: 'il leitão à Bairrada, maialino da latte al forno: l\'abbinamento con la Baga' },
      { day: 2, place: 'Viseu', lat: 40.66, lon: -7.91, what: 'la capitale del Dão, la Sé e il museo Grão Vasco' },
      { day: 2, place: 'Nelas', lat: 40.53, lon: -7.85, what: 'le quintas del Dão fra pinete e granito, a 500 metri di quota' },
    ],
    notes: 'La Bairrada è la patria dello spumante portoghese e del maialino arrosto; il Dão, appena più a est, fa rossi eleganti d\'altura. Trenta minuti separano due mondi diversi, e quasi nessun turista li visita.',
  },
  {
    id: 'wr-fr-cassis', emoji: '🫐', name: 'Route du Cassis — il ribes nero di Borgogna',
    kind: 'gusto', country: 'Francia', region: 'Borgogna', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 47.32, lon: 5.04 }, products: 'Crème de cassis de Dijon, ribes nero Noir de Bourgogne',
    season: 'Giugno-luglio per la raccolta; tutto l\'anno per le distillerie.',
    stops: [
      { day: 1, place: 'Digione', lat: 47.32, lon: 5.04, what: 'dove nasce il kir: cassis e aligoté, inventato dal canonico Kir' },
      { day: 1, place: 'Nuits-Saint-Georges', lat: 47.13, lon: 4.95, what: 'le liquoreria storiche accanto alle cantine dei grand cru' },
      { day: 1, place: 'Arcenant', lat: 47.13, lon: 4.85, what: 'i campi di ribes sulle Hautes-Côtes, sopra i vigneti' },
    ],
    notes: 'Un percorso di 55 km che quasi nessuno conosce, dentro una delle zone del vino più visitate del mondo. Il Noir de Bourgogne è una varietà specifica, molto più aromatica del ribes da marmellata.',
  },
  {
    id: 'wr-fr-savoie-fromage', emoji: '🧀', name: 'Route des Fromages de Savoie',
    kind: 'formaggio', country: 'Francia', region: 'Savoia', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 45.57, lon: 6.53 }, products: 'Beaufort, Reblochon, Tomme de Savoie, Abondance',
    season: 'Giugno-settembre per gli alpeggi; tutto l\'anno per le cooperative di valle.',
    stops: [
      { day: 1, place: 'Beaufort', lat: 45.72, lon: 6.57, what: 'la cooperativa che fa il "principe dei gruyère": si vede la caldaia di rame' },
      { day: 1, place: 'Le Grand-Bornand', lat: 45.94, lon: 6.43, what: 'il Reblochon di alpeggio e i chalet della Chaîne des Aravis' },
      { day: 2, place: 'Abondance', lat: 46.28, lon: 6.72, what: 'l\'abbazia col chiostro affrescato e il formaggio che porta il suo nome' },
      { day: 2, place: 'Annecy', lat: 45.90, lon: 6.13, what: 'il lago e il mercato del martedì e domenica nella città vecchia' },
    ],
    notes: 'Il Beaufort d\'alpage si fa solo d\'estate col latte delle vacche in quota, e la forma ha il bordo concavo perché lo stampo è di legno di faggio. In estate molte cooperative aprono la lavorazione delle 6 del mattino.',
  },
  {
    id: 'wr-it-dolomiti-formaggi', emoji: '🧀', name: 'La via dei formaggi delle Dolomiti',
    kind: 'formaggio', country: 'Italia', region: 'Trentino e Bellunese', continent: 'Europa', days: 2, transport: 'auto',
    coords: { lat: 46.30, lon: 11.63 }, products: 'Puzzone di Moena, Piave, Schiz, burro di malga',
    season: 'Giugno-settembre per le malghe in alpeggio; ottobre per la Desmontegada.',
    stops: [
      { day: 1, place: 'Moena', lat: 46.37, lon: 11.66, what: 'il Puzzone di Moena DOP, a crosta lavata: il caseificio si visita' },
      { day: 1, place: 'Predazzo', lat: 46.31, lon: 11.60, what: 'il caseificio sociale della Val di Fiemme e il museo geologico' },
      { day: 2, place: 'Primiero', lat: 46.17, lon: 11.83, what: 'le malghe delle Pale di San Martino e il Botìro di primiero' },
      { day: 2, place: 'Belluno', lat: 46.14, lon: 12.22, what: 'il Piave DOP e la Schiz da mangiare in padella con la panna' },
    ],
    notes: 'La Desmontegada, a fine settembre, è il giorno in cui le mandrie scendono dall\'alpeggio in paese addobbate di fiori: è la festa più bella e meno turistica delle Dolomiti. Le malghe si raggiungono a piedi in mezz\'ora-un\'ora dalla strada.',
  },
  {
    id: 'wr-it-riso-vercelli', emoji: '🍚', name: 'La strada del riso vercellese',
    kind: 'gusto', country: 'Italia', region: 'Piemonte', continent: 'Europa', days: 1, transport: 'bici',
    coords: { lat: 45.32, lon: 8.42 }, products: 'Carnaroli, Baraggia Biellese e Vercellese DOP',
    season: 'Aprile-maggio per le risaie allagate (il "mare a quadretti"); settembre-ottobre per la trebbiatura.',
    stops: [
      { day: 1, place: 'Vercelli', lat: 45.32, lon: 8.42, what: 'la basilica di Sant\'Andrea e la Borsa del riso, che qui fa il prezzo' },
      { day: 1, place: 'Grange di Lucedio', lat: 45.24, lon: 8.28, what: 'l\'abbazia cistercense che ha introdotto il riso in Piemonte nel Quattrocento' },
      { day: 1, place: 'Livorno Ferraris', lat: 45.29, lon: 8.08, what: 'le cascine con la vendita diretta e le strade fra le risaie' },
    ],
    notes: 'Ad aprile e maggio le risaie allagate riflettono le Alpi: è un fenomeno di poche settimane e vale il viaggio da solo. Il riso si compra in cascina, sfuso e appena lavorato, a metà del prezzo del supermercato.',
  },
  {
    id: 'wr-it-bufala', emoji: '🐃', name: 'La strada della mozzarella di bufala campana',
    kind: 'formaggio', country: 'Italia', region: 'Campania', continent: 'Europa', days: 1, transport: 'auto',
    coords: { lat: 40.42, lon: 15.01 }, products: 'Mozzarella di bufala campana DOP, ricotta di bufala, provola',
    season: 'Tutto l\'anno; la visita è la mattina presto, quando si fila.',
    stops: [
      { day: 1, place: 'Paestum', lat: 40.42, lon: 15.01, what: 'i tre templi greci e i caseifici della piana del Sele tutt\'intorno' },
      { day: 1, place: 'Capaccio', lat: 40.42, lon: 15.08, what: 'gli allevamenti con la visita alle bufale e la degustazione appena filata' },
      { day: 1, place: 'Caserta', lat: 41.07, lon: 14.33, what: 'l\'altra DOP, con la Reggia UNESCO e il borgo di San Leucio' },
    ],
    notes: 'La mozzarella si mangia il giorno stesso, a temperatura ambiente, mai fredda di frigo: nei caseifici te la danno ancora tiepida ed è un\'altra cosa. La visita si prenota per le 8-9 del mattino, quando si fila davvero.',
  },
  {
    id: 'wr-mx-guadalupe', emoji: '🍷', name: 'Ruta del Vino del Valle de Guadalupe',
    kind: 'vino', country: 'Messico', region: 'Bassa California', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 32.09, lon: -116.58 }, products: 'Nebbiolo, Tempranillo, blend mediterranei a due passi dal Pacifico',
    season: 'Marzo-maggio e settembre-novembre; agosto per le Fiestas de la Vendimia.',
    stops: [
      { day: 1, place: 'Valle de Guadalupe', lat: 32.09, lon: -116.58, what: 'oltre 150 cantine, molte con architettura d\'autore e cucina campestre' },
      { day: 1, place: 'Francisco Zarco', lat: 32.09, lon: -116.60, what: 'il museo della vite e del vino e la comunità dei molokani russi' },
      { day: 2, place: 'Ensenada', lat: 31.87, lon: -116.60, what: 'il mercato del pesce, i tacos de pescado e la Bufadora' },
    ],
    notes: 'Il 90% del vino messicano nasce qui. La cucina "Baja Med" — pesce del Pacifico, chili, tecnica mediterranea — è nata in queste cantine ed è il vero motivo del viaggio. Due ore da San Diego.',
  },
  {
    id: 'wr-us-fingerlakes-trails', emoji: '🍷', name: 'Cayuga e Seneca Lake Wine Trails',
    kind: 'vino', country: 'Stati Uniti', region: 'New York', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 42.68, lon: -76.70 }, products: 'Riesling, cabernet franc, ghiaccio e laghi profondi',
    season: 'Giugno-ottobre.',
    stops: [
      { day: 1, place: 'Ithaca', lat: 42.44, lon: -76.50, what: 'base sul lago Cayuga, con le gole e le cascate della Cornell' },
      { day: 1, place: 'Cayuga Lake Wine Trail', lat: 42.68, lon: -76.70, what: 'il PRIMO wine trail d\'America (1988): una quindicina di cantine sulla riva est' },
      { day: 2, place: 'Seneca Lake Wine Trail', lat: 42.60, lon: -76.90, what: 'il più grande, oltre trenta cantine attorno al lago' },
      { day: 2, place: 'Watkins Glen', lat: 42.38, lon: -76.87, what: 'la gola con diciannove cascate, chiusura del giro' },
    ],
    notes: 'Il Cayuga Lake Wine Trail ha inventato il formato "wine trail" nel 1988, e da lì è nato tutto il modello americano. I laghi sono profondi fino a 200 metri e non gelano: senza di loro qui non crescerebbe la vite.',
  },
  {
    id: 'wr-us-texashill', emoji: '🤠', name: 'Texas Hill Country Wine Trail',
    kind: 'vino', country: 'Stati Uniti', region: 'Texas', continent: 'Nord America', days: 2, transport: 'auto',
    coords: { lat: 30.27, lon: -98.87 }, products: 'Tempranillo, Viognier, Mourvèdre: vitigni mediterranei nel caldo',
    season: 'Marzo-maggio (fioritura dei bluebonnet) e ottobre-novembre.',
    stops: [
      { day: 1, place: 'Fredericksburg', lat: 30.27, lon: -98.87, what: 'il paese fondato dai tedeschi nel 1846: Main Street, birrerie e cantine' },
      { day: 1, place: 'Stonewall', lat: 30.24, lon: -98.66, what: 'le pesche della Hill Country e le cantine sulla US-290' },
      { day: 2, place: 'Johnson City', lat: 30.28, lon: -98.41, what: 'il ranch di Lyndon Johnson e le cantine di granito' },
      { day: 2, place: 'Enchanted Rock', lat: 30.51, lon: -98.82, what: 'il domo di granito rosa: si sale in un\'ora, all\'alba' },
    ],
    notes: 'La seconda destinazione enoturistica degli Stati Uniti per visitatori dopo Napa, e quasi sconosciuta fuori dal Texas. Le distanze sono americane: si guida molto, quindi l\'autista designato qui non è un consiglio.',
  },
  {
    id: 'wr-jp-niigata', emoji: '🍶', name: 'Niigata — il sake della neve',
    kind: 'distillati', country: 'Giappone', region: 'Niigata', continent: 'Asia', days: 2, transport: 'treno',
    coords: { lat: 37.92, lon: 139.04 }, products: 'Sake tanrei karakuchi (secco e pulito), riso Gohyakumangoku',
    season: 'Dicembre-marzo, quando i kura lavorano; febbraio per il Niigata Sake no Jin.',
    stops: [
      { day: 1, place: 'Niigata', lat: 37.92, lon: 139.04, what: 'il Ponshukan in stazione: 100 sake di 90 kura, cinque monete per assaggio' },
      { day: 1, place: 'Imayotsukasa', lat: 37.91, lon: 139.05, what: 'il kura storico dentro la città, con la visita guidata gratuita' },
      { day: 2, place: 'Echigo-Yuzawa', lat: 36.94, lon: 138.81, what: 'il paese del "Paese delle nevi" di Kawabata, e il bagno al sake' },
      { day: 2, place: 'Nagaoka', lat: 37.45, lon: 138.85, what: 'i kura fra le risaie: qui il riso da sake è una coltura a sé' },
    ],
    notes: 'Niigata ha quasi novanta kura, più di ogni altra prefettura, perché ha il riso e l\'acqua di neve fusa. Il Ponshukan della stazione di Niigata è il posto più efficiente al mondo per capire il sake in un\'ora. Tutto raggiungibile in Shinkansen da Tokyo.',
  },
  {
    id: 'wr-jp-hokkaido', emoji: '🍇', name: 'Hokkaido — vino e whisky del nord',
    kind: 'vino', country: 'Giappone', region: 'Hokkaido', continent: 'Asia', days: 2, transport: 'treno',
    coords: { lat: 43.20, lon: 140.79 }, products: 'Pinot noir e Kerner del nord, whisky di Yoichi',
    season: 'Giugno-ottobre; settembre-ottobre per la vendemmia e il foliage.',
    stops: [
      { day: 1, place: 'Yoichi', lat: 43.20, lon: 140.79, what: 'la distilleria fondata nel 1934 da Masataka Taketsuru, con gli alambicchi a carbone' },
      { day: 1, place: 'Otaru', lat: 43.19, lon: 140.99, what: 'il canale, i magazzini di pietra e il sushi del mercato' },
      { day: 2, place: 'Yoichi (vigneti)', lat: 43.17, lon: 140.77, what: 'le cantine di pinot noir sulle colline: il clima di Hokkaido ricorda la Borgogna' },
      { day: 2, place: 'Furano', lat: 43.34, lon: 142.38, what: 'la lavanda a luglio, i formaggi e il vino comunale di Furano' },
    ],
    notes: 'Il whisky giapponese è nato a Yoichi perché Taketsuru cercava un clima scozzese, e lo trovò qui. Le visite alla distilleria vanno prenotate online con settimane di anticipo.',
  },
  {
    id: 'wr-in-darjeeling', emoji: '🍵', name: 'Darjeeling — i tea garden dell\'Himalaya',
    kind: 'te', country: 'India', region: 'Bengala Occidentale', continent: 'Asia', days: 3, transport: 'treno',
    coords: { lat: 27.04, lon: 88.26 }, products: 'Darjeeling first flush e second flush, "lo champagne dei tè"',
    season: 'Marzo-aprile per il first flush; maggio-giugno per il second flush. Evitare il monsone.',
    stops: [
      { day: 1, place: 'Darjeeling', lat: 27.04, lon: 88.26, what: 'il Toy Train UNESCO, il Tiger Hill all\'alba sul Kangchenjunga' },
      { day: 2, place: 'Happy Valley', lat: 27.05, lon: 88.25, what: 'il tea estate a piedi dal centro: raccolta, appassimento, arrotolatura' },
      { day: 3, place: 'Kurseong', lat: 26.88, lon: 88.28, what: 'i giardini storici sulla ferrovia, meno affollati e più autentici' },
    ],
    notes: 'Solo 87 giardini possono chiamarsi Darjeeling, e producono meno tè di quanto se ne venda col loro nome nel mondo: comprare in loco è l\'unico modo di essere sicuri. Il first flush di marzo è chiaro e floreale, il second flush di giugno ha il celebre gusto "muscatel".',
  },
  {
    id: 'wr-vn-caffe', emoji: '☕', name: 'Buon Ma Thuot e Da Lat — il caffè vietnamita',
    kind: 'caffe', country: 'Vietnam', region: 'Altopiani centrali', continent: 'Asia', days: 2, transport: 'auto',
    coords: { lat: 12.67, lon: 108.05 }, products: 'Robusta degli altopiani, arabica di Da Lat, cà phê sữa đá',
    season: 'Novembre-marzo (stagione secca, raccolta da ottobre).',
    stops: [
      { day: 1, place: 'Buon Ma Thuot', lat: 12.67, lon: 108.05, what: 'la capitale del caffè vietnamita: piantagioni, museo e villaggi Ede' },
      { day: 1, place: 'Lago Lak', lat: 12.42, lon: 108.19, what: 'le case lunghe M\'nong e le colline di robusta attorno' },
      { day: 2, place: 'Da Lat', lat: 11.94, lon: 108.44, what: 'l\'arabica d\'altura, le serre di fiori e il clima fresco dei francesi' },
    ],
    notes: 'Il Vietnam è il secondo produttore mondiale di caffè e il primo di robusta, ma quasi nessuno ci va per quello. Il cà phê trứng (caffè all\'uovo) e il cà phê muối (al sale) sono invenzioni locali che non si trovano altrove.',
  },
  {
    id: 'wr-id-bali', emoji: '🌾', name: 'Bali — subak, risaie e caffè',
    kind: 'caffe', country: 'Indonesia', region: 'Bali', continent: 'Asia', days: 2, transport: 'auto',
    coords: { lat: -8.37, lon: 115.15 }, products: 'Caffè arabica di Kintamani, riso dei subak UNESCO, cacao',
    season: 'Aprile-ottobre (stagione secca).',
    stops: [
      { day: 1, place: 'Jatiluwih', lat: -8.37, lon: 115.15, what: 'le risaie a terrazze del sistema subak, patrimonio UNESCO dal 2012' },
      { day: 1, place: 'Tegallalang', lat: -8.43, lon: 115.28, what: 'le terrazze più fotografate dell\'isola, e le piantagioni di caffè attorno' },
      { day: 2, place: 'Kintamani', lat: -8.25, lon: 115.36, what: 'l\'arabica sulle pendici del Batur, con note di agrumi dal terreno vulcanico' },
      { day: 2, place: 'Ubud', lat: -8.51, lon: 115.26, what: 'il mercato, i laboratori di cacao e le cucine balinesi' },
    ],
    notes: 'Il subak è un sistema di irrigazione cooperativo gestito dai templi dal IX secolo: è patrimonio UNESCO come paesaggio culturale, non come panorama. Sul kopi luwak: molte "piantagioni" tengono gli zibetti in gabbia — è maltrattamento, e va detto.',
  },
  {
    id: 'wr-ke-kericho', emoji: '🍵', name: 'Kericho e le Highlands — il tè del Kenya',
    kind: 'te', country: 'Kenya', region: 'Rift Valley', continent: 'Africa', days: 2, transport: 'auto',
    coords: { lat: -0.37, lon: 35.28 }, products: 'Tè nero CTC keniano, il più esportato al mondo',
    season: 'Tutto l\'anno; gennaio-marzo e luglio-ottobre le stagioni secche.',
    stops: [
      { day: 1, place: 'Kericho', lat: -0.37, lon: 35.28, what: 'colline verdi a perdita d\'occhio e le fabbriche coloniali visitabili' },
      { day: 2, place: 'Nandi Hills', lat: 0.10, lon: 35.18, what: 'le piantagioni sull\'altopiano dove nascono anche i mezzofondisti' },
      { day: 2, place: 'Lago Nakuru', lat: -0.36, lon: 36.08, what: 'i fenicotteri e i rinoceronti, a due ore dalle piantagioni' },
    ],
    notes: 'Il Kenya è il primo esportatore mondiale di tè nero. La raccolta è a mano, due foglie e una gemma, ogni 7-14 giorni tutto l\'anno: si può partecipare in molte fabbriche. Verifica sempre le raccomandazioni di viaggio aggiornate.',
  },
  {
    id: 'wr-au-clare', emoji: '🚲', name: 'Clare Valley Riesling Trail',
    kind: 'vino', country: 'Australia', region: 'Australia Meridionale', continent: 'Oceania', days: 1, transport: 'bici',
    coords: { lat: -33.83, lon: 138.61 }, products: 'Riesling secco australiano, il più longevo del paese',
    season: 'Settembre-novembre e marzo-maggio.',
    stops: [
      { day: 1, place: 'Auburn', lat: -34.03, lon: 138.68, what: 'partenza del Riesling Trail, ex ferrovia trasformata in ciclabile' },
      { day: 1, place: 'Watervale', lat: -33.98, lon: 138.63, what: 'i cru storici del riesling e le cantine a bordo pista' },
      { day: 1, place: 'Sevenhill', lat: -33.89, lon: 138.63, what: 'la cantina dei gesuiti del 1851, la più antica della valle' },
      { day: 1, place: 'Clare', lat: -33.83, lon: 138.61, what: 'arrivo in paese dopo 35 km quasi tutti in piano' },
    ],
    notes: 'Trentacinque chilometri di ex ferrovia con le cantine a pochi metri dalla pista: è probabilmente la strada del vino meglio progettata al mondo per non guidare. Noleggio bici alle due estremità e servizio di recupero.',
  },
  {
    id: 'wr-nz-hawkesbay', emoji: '🍷', name: 'Hawke\'s Bay — la più antica regione vinicola neozelandese',
    kind: 'vino', country: 'Nuova Zelanda', region: 'Isola del Nord', continent: 'Oceania', days: 2, transport: 'bici',
    coords: { lat: -39.49, lon: 176.92 }, products: 'Syrah, blend bordolesi, chardonnay; Gimblett Gravels',
    season: 'Novembre-aprile; febbraio per il F.A.W.C. food and wine classic.',
    stops: [
      { day: 1, place: 'Napier', lat: -39.49, lon: 176.92, what: 'la città art déco ricostruita dopo il terremoto del 1931' },
      { day: 1, place: 'Gimblett Gravels', lat: -39.60, lon: 176.75, what: 'l\'antico letto del fiume: ottocento ettari di ghiaia che fanno i migliori syrah del paese' },
      { day: 2, place: 'Havelock North', lat: -39.67, lon: 176.88, what: 'il Te Mata Peak e le cantine ai suoi piedi' },
      { day: 2, place: 'Hastings', lat: -39.64, lon: 176.85, what: 'i farmers market del domenica e i frutteti di mele' },
    ],
    notes: 'Vino dal 1851, la più antica della Nuova Zelanda. Le piste ciclabili Hawke\'s Bay Trails collegano cantine, città e mare per 200 km quasi tutti in piano: qui la bici è la norma, non l\'eccezione.',
  },
];

/** Tutte le strade del vino e del gusto del catalogo curato. */
export const TASTE_ROUTES: TasteRoute[] = [
  ...ITALIA, ...FRANCIA, ...IBERIA, ...EUROPA_ALTRO,
  ...AMERICHE, ...RESTO_DEL_MONDO, ...GUSTO, ...AGGIUNTE,
];

/** Etichette italiane dei generi, per le chip e i titoli. */
export const TASTE_KIND_LABELS: Record<TasteRouteKind, { label: string; emoji: string }> = {
  vino: { label: 'Vino', emoji: '🍷' },
  olio: { label: 'Olio', emoji: '🫒' },
  formaggio: { label: 'Formaggi', emoji: '🧀' },
  birra: { label: 'Birra', emoji: '🍺' },
  distillati: { label: 'Distillati', emoji: '🥃' },
  caffe: { label: 'Caffè', emoji: '☕' },
  te: { label: 'Tè', emoji: '🍵' },
  cacao: { label: 'Cacao', emoji: '🍫' },
  gusto: { label: 'Sapori', emoji: '🍴' },
};

const R = 6371; // km
function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Le strade entro `km` da un punto, dalla più vicina. Guarda TUTTE le tappe:
 *  una strada lunga cento chilometri può passare accanto pur partendo lontano. */
export function tasteRoutesNear(lat: number, lon: number, km = 120): Array<TasteRoute & { distanceKm: number }> {
  return TASTE_ROUTES
    .map((r) => {
      const d = Math.min(
        haversine(lat, lon, r.coords.lat, r.coords.lon),
        ...r.stops.map((s) => haversine(lat, lon, s.lat, s.lon)),
      );
      return { ...r, distanceKm: Math.round(d) };
    })
    .filter((r) => r.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Le strade dentro un riquadro della mappa (per il layer 🍷). */
export function tasteRoutesInBounds(south: number, west: number, north: number, east: number): TasteRoute[] {
  return TASTE_ROUTES.filter((r) =>
    r.coords.lat >= south && r.coords.lat <= north && r.coords.lon >= west && r.coords.lon <= east
    || r.stops.some((s) => s.lat >= south && s.lat <= north && s.lon >= west && s.lon <= east));
}

/** Raggruppate per paese, per le schede a elenco. */
export function tasteRoutesByCountry(): Record<string, TasteRoute[]> {
  const out: Record<string, TasteRoute[]> = {};
  for (const r of TASTE_ROUTES) (out[r.country] ||= []).push(r);
  return out;
}

/**
 * Pre-compilazione del planner da una strada del gusto: le tappe diventano
 * legs con le loro coordinate, come per i cammini (buildPilgrimPrefill).
 *
 * Le tappe si deduplicano per località: molte strade toccano lo stesso
 * paese in due giorni diversi, e nel planner una tappa ripetuta diventa un
 * andirivieni assurdo.
 */
export function buildTastePrefill(r: TasteRoute): {
  legs: Array<{ city: string; lat?: number; lon?: number }>;
  days: number;
  interests: string[];
  specialRequests: string;
  label: string;
} {
  const viste = new Set<string>();
  const legs = r.stops
    .filter((s) => !viste.has(s.place) && viste.add(s.place))
    .map((s) => ({ city: s.place, lat: s.lat, lon: s.lon }));

  const beve = r.kind === 'vino' || r.kind === 'birra' || r.kind === 'distillati';
  const specialRequests = [
    `Strada del gusto: ${r.name} (${r.region}, ${r.country}). Genere: ${TASTE_KIND_LABELS[r.kind].label}. Prodotti: ${r.products}.`,
    'Le tappe indicate sono il percorso ufficiale: rispettale nell\'ordine, una per giorno dove la durata lo consente, senza aggiungerne di lontane.',
    ...r.stops.map((s) => `· ${s.place}: ${s.what}`),
    `Stagione: ${r.season}`,
    `Note: ${r.notes}`,
    beve
      ? 'REGOLA NON NEGOZIABILE: chi degusta non guida. Indica esplicitamente come si risolve (autista designato, navetta, taxi, treno, tour organizzato, o assaggio con sputacchiera), e privilegia le soluzioni senza auto quando esistono.'
      : '',
    'Non inventare nomi di aziende: indica il tipo di produttore e la zona, e usa solo i nomi reali che ti vengono forniti nel materiale.',
  ].filter(Boolean).join('\n');

  return {
    legs,
    days: r.days,
    interests: r.kind === 'vino' ? ['enogastronomia', 'panorami'] : ['enogastronomia', 'tradizioni'],
    specialRequests,
    label: `${r.emoji} ${r.name}`,
  };
}

/**
 * Il contesto da passare al generatore di itinerari: tappe reali con
 * coordinate, così il modello non se le inventa. Stessa forma dei
 * `pilgrimContext` di transitCatalog.
 */
export function tasteRouteContext(r: TasteRoute): string {
  const righe = r.stops.map((s) =>
    `  · Giorno ${s.day} — ${s.place} (${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}): ${s.what}`);
  return [
    `CONTESTO STRADA DEL GUSTO — ${r.name} (${r.region}, ${r.country})`,
    `Genere: ${TASTE_KIND_LABELS[r.kind].label}. Prodotti: ${r.products}.`,
    `Durata proposta: ${r.days} ${r.days === 1 ? 'giorno' : 'giorni'}. Spostamenti: ${r.transport}.`,
    `Stagione: ${r.season}`,
    'TAPPE REALI (rispettale ESATTAMENTE, una per una, con queste coordinate):',
    ...righe,
    `Avvertenze da riportare: ${r.notes}`,
  ].join('\n');
}

