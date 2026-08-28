// =====================================================================
// WIP · Template stagionali curati (ondata 6, esteso)
// Itinerari pre-curati dalla redazione: un tap pre-compila il form
// (destinazione, giorni, interessi, richieste) e cavalca i picchi di
// ricerca stagionali. La generazione resta all'utente.
// Regole redazionali: eventi e stagionalità REALI e verificabili, mai
// date puntuali inventate (si ragiona per mese/stagione).
// =====================================================================

export type SeasonalTheme = 'storia' | 'mare' | 'montagna' | 'cultura' | 'unicita';

export interface SeasonalTemplate {
  id: string;
  emoji: string;
  title: string;
  destination: string;
  /** Mesi (1-12) in cui proporre il template. */
  months: number[];
  days: number;
  interests: string[];
  specialRequests: string;
  /** Tema per i filtri a chips (opzionale sui vecchi dati, valorizzato sui curati). */
  theme?: SeasonalTheme;
  /** Gemma nascosta: mete poco note, fuori dai circuiti ovvi. */
  hiddenGem?: boolean;
  /** Paese in italiano (es. 'Italia', 'Giappone'). */
  country?: string;
}

/** Etichette ed emoji dei temi, per le chips di filtro (UI). */
export const SEASONAL_THEMES: Array<{ id: SeasonalTheme; label: string; emoji: string }> = [
  { id: 'storia', label: 'Storia', emoji: '🏛' },
  { id: 'mare', label: 'Mare', emoji: '🌊' },
  { id: 'montagna', label: 'Montagna', emoji: '⛰' },
  { id: 'cultura', label: 'Cultura', emoji: '🎭' },
  { id: 'unicita', label: 'Unicità', emoji: '✨' },
];

export const SEASONAL_TEMPLATES: SeasonalTemplate[] = [
  // ── Italia · classici stagionali ─────────────────────────────────────
  {
    id: 'natale-roma', emoji: '🎄', title: 'Natale a Roma', destination: 'Roma',
    months: [11, 12], days: 3, interests: ['arte', 'tradizioni'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Atmosfera natalizia: presepi storici (piazza San Pietro, Sant\'Andrea della Valle), luminarie di via del Corso, mercatino di piazza Navona, messa o visita in basilica.',
  },
  {
    id: 'venezia-carnevale', emoji: '🎭', title: 'Venezia in Carnevale', destination: 'Venezia',
    months: [1, 2], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Periodo di Carnevale: maschere e sfilate in piazza San Marco, atelier di costumi, tramonto fotogenico sui canali; suggerisci orari per evitare la calca dei ponti.',
  },
  {
    id: 'presepi-napoli', emoji: '⭐', title: 'Presepi a Napoli', destination: 'Napoli',
    months: [11, 12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'San Gregorio Armeno e l\'arte presepiale, centro storico UNESCO, sfogliatella e pizza fritta: il Natale napoletano autentico.',
  },
  {
    id: 'firenze-agosto', emoji: '🖼️', title: 'Firenze senza code', destination: 'Firenze',
    months: [7, 8], days: 2, interests: ['arte', 'musei'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Agosto intelligente: ingressi alle prime ore o serali (Uffizi il martedì sera se disponibile), chiese fresche a mezzogiorno, tramonto da San Miniato invece di piazzale Michelangelo.',
  },
  {
    id: 'palio-siena', emoji: '🐎', title: 'Siena e il Palio', destination: 'Siena',
    months: [6, 7, 8], days: 2, interests: ['tradizioni', 'storia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'La Siena delle contrade: musei di contrada, piazza del Campo e la logica della corsa, cena in contrada se possibile; se non è il giorno del Palio racconta comunque la sua cultura.',
  },
  {
    id: 'laghi-agosto', emoji: '🏞️', title: 'Lago di Como d\'estate', destination: 'Como',
    months: [6, 7, 8], days: 2, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'Battelli tra i borghi (Bellagio, Varenna), ville con giardini, bagni al lago la mattina presto; evita le ore di punta della navigazione.',
  },
  {
    id: 'vendemmia-chianti', emoji: '🍇', title: 'Vendemmia nel Chianti', destination: 'Greve in Chianti',
    months: [9, 10], days: 2, interests: ['enogastronomia', 'panorami'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'Periodo di vendemmia: cantine visitabili con degustazione, borghi (Montefioralle, Panzano), macelleria storica a Panzano, strade bianche panoramiche.',
  },
  {
    id: 'tartufo-alba', emoji: '🍄', title: 'Alba e il tartufo', destination: 'Alba',
    months: [10, 11], days: 2, interests: ['enogastronomia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'Fiera del Tartufo Bianco: mercato del tartufo, degustazioni di Barolo e Barbaresco nelle Langhe, torri medievali di Alba.',
  },
  {
    id: 'sicilia-primavera', emoji: '🌸', title: 'Sicilia barocca', destination: 'Noto',
    months: [3, 4, 5], days: 3, interests: ['arte', 'panorami'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Primavera nel Val di Noto: Noto, Modica e Ragusa Ibla, infiorata se nel periodo, cioccolato di Modica, temperature ideali per camminare.',
  },
  {
    id: 'mercatini-bolzano', emoji: '🎅', title: 'Mercatini di Bolzano', destination: 'Bolzano',
    months: [11, 12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'Mercatini di Natale di piazza Walther, vin brulé e strudel, museo di Ötzi, funivia del Renon per i panorami invernali.',
  },
  {
    id: 'costiera-maggio', emoji: '🍋', title: 'Costiera a maggio', destination: 'Amalfi',
    months: [4, 5, 6], days: 3, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'Prima della calca estiva: Sentiero degli Dei al mattino, limoneti e sfusato amalfitano, Ravello e Villa Rufolo, spostamenti via mare quando possibile.',
  },
  {
    id: 'ravenna-mosaici', emoji: '✨', title: 'Ravenna bizantina', destination: 'Ravenna',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], days: 2, interests: ['arte', 'storia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'I mosaici UNESCO in sequenza intelligente (biglietto cumulativo): San Vitale, Galla Placidia, Sant\'Apollinare Nuovo, la tomba di Dante e la Ravenna meno nota.',
  },
  {
    id: 'carnevale-viareggio', emoji: '🎪', title: 'Carnevale di Viareggio', destination: 'Viareggio',
    months: [1, 2], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'I corsi mascherati sui viali a mare: carri allegorici giganti, la Cittadella del Carnevale per vedere come nascono, passeggiata liberty e pesce fresco in darsena.',
  },
  {
    id: 'terme-inverno', emoji: '♨️', title: 'Terme d\'inverno in Toscana', destination: 'Saturnia',
    months: [1, 2, 3], days: 2, interests: ['relax', 'panorami'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'Cascate del Mulino all\'alba (gratuite, vapore e luce migliore), borghi della Maremma (Pitigliano, Sovana), cucina di cinghiale e vini locali: il caldo termale col freddo fuori.',
  },
  {
    id: 'mandorli-agrigento', emoji: '🌸', title: 'Mandorli in fiore', destination: 'Agrigento',
    months: [2, 3], days: 2, interests: ['storia', 'fotografia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'La Valle dei Templi tra i mandorli fioriti: tempio della Concordia al tramonto, la Sagra del Mandorlo se nel periodo, dolci alle mandorle e la Scala dei Turchi.',
  },
  {
    id: 'settimana-bianca', emoji: '⛷️', title: 'Dolomiti sulla neve', destination: 'Ortisei',
    months: [12, 1, 2, 3], days: 3, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'Val Gardena d\'inverno: piste per tutti i livelli, Alpe di Siusi con le baite gastronomiche, passeggiate invernali per chi non scia, tramonto rosa sul Sassolungo (enrosadira).',
  },
  {
    id: 'pasqua-firenze', emoji: '🕊️', title: 'Pasqua a Firenze', destination: 'Firenze',
    months: [3, 4], days: 3, interests: ['tradizioni', 'arte'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Lo Scoppio del Carro in piazza Duomo la mattina di Pasqua, riti della Settimana Santa, giardini in fiore (Boboli, Bardini col glicine ad aprile) e musei senza la calca estiva.',
  },
  {
    id: 'cinqueterre-primavera', emoji: '🌊', title: 'Cinque Terre a piedi', destination: 'Monterosso al Mare',
    months: [4, 5], days: 2, interests: ['panorami', 'enogastronomia'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'Sentieri aperti e temperature perfette: via dell\'Amore o sentiero azzurro a tratti, i cinque borghi in treno, acciughe di Monterosso e Sciacchetrà, tramonto da Vernazza.',
  },
  {
    id: 'camogli-pesce', emoji: '🐟', title: 'Golfo Paradiso e sagre', destination: 'Camogli',
    months: [5], days: 2, interests: ['enogastronomia', 'panorami'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'La Sagra del Pesce di maggio col padellone gigante, battello per San Fruttuoso e il Cristo degli Abissi, focaccia col formaggio a Recco, Portofino fuori stagione.',
  },
  {
    id: 'infiorata-spello', emoji: '💐', title: 'Infiorate umbre', destination: 'Spello',
    months: [5, 6], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'I tappeti di fiori del Corpus Domini (notte della preparazione compresa, se possibile), vicoli fioriti di Spello, Assisi a mezz\'ora, olio e vini del Subasio.',
  },
  {
    id: 'luminara-pisa', emoji: '🕯️', title: 'Luminara di San Ranieri', destination: 'Pisa',
    months: [6], days: 2, interests: ['tradizioni', 'storia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'Il 16 giugno i lungarni si accendono di centomila lumini: posti migliori per la Luminara e i fuochi, piazza dei Miracoli la mattina presto, il Gioco del Ponte se nel periodo.',
  },
  {
    id: 'umbriajazz-perugia', emoji: '🎷', title: 'Umbria Jazz', destination: 'Perugia',
    months: [7], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Il festival jazz di luglio: concerti gratuiti in centro e main stage all\'arena, centro storico medievale, cioccolato e torta al testo tra un set e l\'altro.',
  },
  {
    id: 'dolomiti-estate', emoji: '🏔️', title: 'Dolomiti d\'estate', destination: 'Cortina d\'Ampezzo',
    months: [7, 8], days: 3, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'Rifugi e laghi alpini: Tre Cime di Lavaredo all\'alba, lago di Sorapis o Braies evitando le ore di punta, funivie panoramiche, canederli e strudel in rifugio.',
  },
  {
    id: 'taranta-salento', emoji: '🪘', title: 'Notte della Taranta', destination: 'Melpignano',
    months: [8], days: 3, interests: ['tradizioni', 'relax'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Il festival di pizzica di fine agosto: il Concertone di Melpignano, borghi barocchi del Salento (Lecce, Galatina), mare di Porto Selvaggio al mattino, friselle e pasticciotto.',
  },
  {
    id: 'regata-venezia', emoji: '🚣', title: 'Regata Storica di Venezia', destination: 'Venezia',
    months: [9], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'La prima domenica di settembre il Canal Grande si riempie di gondole storiche: corteo e regate, punti di vista dai ponti minori, Venezia senza la calca di agosto.',
  },
  {
    id: 'barcolana-trieste', emoji: '⛵', title: 'Barcolana a Trieste', destination: 'Trieste',
    months: [10], days: 2, interests: ['panorami', 'tradizioni'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'La seconda domenica di ottobre la più grande regata del mondo: golfo pieno di vele visto da piazza Unità o dal Carso, caffè storici, castello di Miramare.',
  },
  {
    id: 'eurochocolate-perugia', emoji: '🍫', title: 'Eurochocolate', destination: 'Perugia',
    months: [10, 11], days: 2, interests: ['enogastronomia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'Il festival del cioccolato: stand e sculture di cacao in centro, la Casa del Cioccolato Perugina, Rocca Paolina e i sotterranei, vin brulé se fa freddo.',
  },
  {
    id: 'foliage-valdorcia', emoji: '🍂', title: 'Foliage in Val d\'Orcia', destination: 'Pienza',
    months: [10, 11], days: 2, interests: ['panorami', 'enogastronomia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'I colori d\'autunno sulle crete: cipressi di San Quirico all\'alba, Pienza e il pecorino, Montalcino e il Brunello, strade bianche fotogeniche con la luce bassa.',
  },
  {
    id: 'presepe-matera', emoji: '🌟', title: 'Presepe vivente a Matera', destination: 'Matera',
    months: [12], days: 2, interests: ['tradizioni', 'storia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'Il presepe vivente nei Sassi (biglietti in anticipo), chiese rupestri, punti panoramici notturni con le luci dei Sassi, pane di Matera e peperoni cruschi.',
  },
  {
    id: 'capodanno-napoli', emoji: '🎆', title: 'Capodanno a Napoli', destination: 'Napoli',
    months: [12, 1], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Fuochi sul lungomare e concerto in piazza del Plebiscito, cenone con struffoli, il rito lento del caffè sospeso, Spaccanapoli e cartolina dal Vomero il primo dell\'anno.',
  },

  // ── Grandi mete estere stagionali ────────────────────────────────────
  {
    id: 'kyoto-ciliegi', emoji: '🌸', title: 'Ciliegi in fiore a Kyoto', destination: 'Kyoto',
    months: [3, 4], days: 4, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Giappone',
    specialRequests: 'La stagione dell\'hanami: Cammino del Filosofo sotto i ciliegi, Maruyama-koen di sera, templi di Kiyomizu-dera e Fushimi Inari all\'alba per evitare la folla, cena in una izakaya di Pontocho. Le fioriture variano di anno in anno: prevedi alternative al coperto.',
  },
  {
    id: 'monaco-oktoberfest', emoji: '🍺', title: 'Oktoberfest a Monaco', destination: 'Monaco di Baviera',
    months: [9, 10], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Germania',
    specialRequests: 'Il Theresienwiese tra fine settembre e inizio ottobre: tendoni storici al mattino nei giorni feriali (senza prenotazione), brezel e stinco, poi Marienplatz, il Viktualienmarkt e l\'Englischer Garten per smaltire.',
  },
  {
    id: 'newengland-foliage', emoji: '🍁', title: 'Foliage in New England', destination: 'Boston',
    months: [9, 10], days: 5, interests: ['panorami', 'fotografia'],
    theme: 'unicita', country: 'Stati Uniti',
    specialRequests: 'I colori d\'ottobre: Freedom Trail a Boston, poi strade panoramiche verso i villaggi del Vermont e del New Hampshire (White Mountains), sidro e cider donuts nelle farm, ponti coperti fotogenici.',
  },
  {
    id: 'tromso-aurora', emoji: '🌌', title: 'Aurora boreale a Tromsø', destination: 'Tromsø',
    months: [11, 12, 1, 2], days: 3, interests: ['panorami', 'fotografia'],
    theme: 'unicita', country: 'Norvegia',
    specialRequests: 'La notte polare artica: caccia all\'aurora lontano dalle luci (tour serale o funivia Fjellheisen), Cattedrale Artica, zuppa di pesce al porto, slitta con husky o renne di giorno. L\'aurora non è garantita: prevedi più serate di tentativo.',
  },
  {
    id: 'marrakech-inverno', emoji: '🕌', title: 'Marrakech d\'inverno', destination: 'Marrakech',
    months: [11, 12, 1, 2], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Marocco',
    specialRequests: 'Il clima mite d\'inverno: la medina e i souk al mattino, piazza Jemaa el-Fna al tramonto con le bancarelle di cibo, giardino Majorelle presto per evitare la fila, hammam tradizionale, tajine e tè alla menta su una terrazza.',
  },
  {
    id: 'lisbona-santos', emoji: '🎉', title: 'Lisbona e i Santos Populares', destination: 'Lisbona',
    months: [6], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Portogallo',
    specialRequests: 'Giugno di festa: le sardine alla brace e gli addobbi dei quartieri per i Santos Populares (Alfama in testa), tram 28 al mattino presto, miradouros al tramonto, fado in una casa tipica, pastéis de nata a Belém.',
  },
  {
    id: 'provenza-lavanda', emoji: '💜', title: 'Lavanda in Provenza', destination: 'Valensole',
    months: [6, 7], days: 2, interests: ['panorami', 'fotografia'],
    theme: 'unicita', country: 'Francia',
    specialRequests: 'La fioritura della lavanda tra fine giugno e luglio: altopiano di Valensole all\'alba o al tramonto (luce e niente pullman), abbazia di Sénanque, mercati provenzali, gole del Verdon a mezz\'ora. Prima della raccolta di fine luglio.',
  },
  {
    id: 'islanda-mezzanotte', emoji: '🌋', title: 'Islanda e il sole di mezzanotte', destination: 'Reykjavík',
    months: [6, 7], days: 4, interests: ['panorami', 'relax'],
    theme: 'unicita', country: 'Islanda',
    specialRequests: 'Giornate senza notte: Circolo d\'Oro (Þingvellir, Geysir, Gullfoss), cascate della costa sud (Seljalandsfoss, Skógafoss) con luce radente a tarda sera, laguna termale, zuppa d\'agnello; guida con calma, le distanze ingannano.',
  },
  {
    id: 'newyork-natale', emoji: '🗽', title: 'New York a Natale', destination: 'New York',
    months: [11, 12], days: 4, interests: ['fotografia', 'musei'],
    theme: 'cultura', country: 'Stati Uniti',
    specialRequests: 'L\'albero al Rockefeller Center e le vetrine addobbate della Fifth Avenue, pattinaggio a Central Park o Bryant Park, mercatini invernali (Union Square), un musical a Broadway, skyline al tramonto da un rooftop o dal ponte di Brooklyn.',
  },
  {
    id: 'vienna-avvento', emoji: '🎻', title: 'Vienna: concerti e mercatini', destination: 'Vienna',
    months: [11, 12], days: 3, interests: ['musica', 'tradizioni'],
    theme: 'cultura', country: 'Austria',
    specialRequests: 'L\'Avvento viennese: mercatini al Rathausplatz e a Schönbrunn, un concerto di musica classica (chiese o sale storiche), Sachertorte in un caffè storico, il Belvedere per il Bacio di Klimt, punch caldo tra le luminarie.',
  },
  {
    id: 'oaxaca-muertos', emoji: '💀', title: 'Día de los Muertos a Oaxaca', destination: 'Oaxaca',
    months: [10, 11], days: 4, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Messico',
    specialRequests: 'La festa dei morti tra fine ottobre e inizio novembre: altari e cempasúchil per le strade, veglie nei cimiteri (con rispetto: è un rito, non uno spettacolo), mole e tlayudas al mercato, sito zapoteco di Monte Albán.',
  },
  {
    id: 'santorini-fuoristagione', emoji: '🏛️', title: 'Santorini fuori stagione', destination: 'Santorini',
    months: [5, 9, 10], days: 3, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Grecia',
    specialRequests: 'La caldera senza la calca di agosto: sentiero Fira-Oia a piedi (2-3 ore, luce del mattino), tramonto da Oia o più tranquillo da Imerovigli, sito di Akrotiri, vini Assyrtiko in cantina, bagno alle spiagge vulcaniche.',
  },
  {
    id: 'petra-primavera', emoji: '🏜️', title: 'Petra in primavera', destination: 'Petra',
    months: [3, 4], days: 3, interests: ['storia', 'panorami'],
    theme: 'storia', country: 'Giordania',
    specialRequests: 'Temperature ideali per camminare: il Siq e il Tesoro alla prima luce, salita al Monastero nel pomeriggio, punto panoramico sul Tesoro dall\'alto, notte nel Wadi Rum in campo beduino se i giorni lo permettono.',
  },
  {
    id: 'highlands-scozia', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', title: 'Highlands scozzesi', destination: 'Inverness',
    months: [5, 6], days: 4, interests: ['panorami', 'storia'],
    theme: 'montagna', country: 'Regno Unito',
    specialRequests: 'Tarda primavera, giornate lunghe e meno moscerini: Loch Ness e castello di Urquhart, Glen Coe e Glenfinnan, una distilleria di whisky, Isola di Skye se i giorni bastano; meteo mutevole, prevedi alternative.',
  },
  {
    id: 'budapest-terme', emoji: '♨️', title: 'Terme di Budapest d\'inverno', destination: 'Budapest',
    months: [12, 1, 2], days: 3, interests: ['relax', 'storia'],
    theme: 'cultura', country: 'Ungheria',
    specialRequests: 'Il vapore delle vasche all\'aperto col freddo fuori: terme Széchenyi al mattino, Gellért in stile liberty, Parlamento e Bastione dei Pescatori, gulasch e kürtőskalács, ruin bar nel quartiere ebraico la sera.',
  },
  {
    id: 'siviglia-azahar', emoji: '💃', title: 'Siviglia: Feria e azahar', destination: 'Siviglia',
    months: [4, 5], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Spagna',
    specialRequests: 'La primavera dell\'azahar (fiori d\'arancio): Alcázar e Cattedrale con la Giralda prenotati presto, quartiere di Santa Cruz, tapas e flamenco a Triana; se capita la Feria de Abril racconta le casetas e i cavalli, altrimenti la sua cultura.',
  },
  {
    id: 'croazia-isole', emoji: '⛵', title: 'Isole croate a giugno', destination: 'Spalato',
    months: [6], days: 4, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Croazia',
    specialRequests: 'Mare già caldo e traghetti senza calca: palazzo di Diocleziano a Spalato, poi isole (Hvar, Brač con Zlatni Rat, o Vis più tranquilla), calette raggiungibili in barca, pesce alla griglia e vino locale nelle konobe.',
  },
  {
    id: 'cappadocia-mongolfiere', emoji: '🎈', title: 'Mongolfiere in Cappadocia', destination: 'Göreme',
    months: [4, 5, 9, 10], days: 3, interests: ['panorami', 'fotografia'],
    theme: 'unicita', country: 'Turchia',
    specialRequests: 'Volo in mongolfiera all\'alba sui camini delle fate (dipende dal vento: metti il volo il primo giorno per avere riserve), chiese rupestri di Göreme, valli a piedi (Rose Valley al tramonto), città sotterranee, notte in hotel di roccia.',
  },
  {
    id: 'praga-autunno', emoji: '🍂', title: 'Praga d\'autunno', destination: 'Praga',
    months: [10, 11], days: 3, interests: ['storia', 'fotografia'],
    theme: 'storia', country: 'Repubblica Ceca',
    specialRequests: 'Foliage sui parchi di Petřín e Letná, Ponte Carlo all\'alba con la nebbiolina, il Castello e il vicolo d\'Oro, orologio astronomico senza la calca estiva, birrerie storiche e goulash; luce bassa perfetta per le foto.',
  },
  {
    id: 'norvegia-fiordi', emoji: '🚢', title: 'Fiordi norvegesi', destination: 'Bergen',
    months: [6, 7, 8], days: 4, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Norvegia',
    specialRequests: 'L\'estate dei fiordi: il mercato del pesce e le case di Bryggen a Bergen, funicolare Fløibanen, crociera breve sul Nærøyfjord (UNESCO) o sul Sognefjord, treno panoramico della Flåmsbana, cascate ovunque con giornate lunghissime.',
  },

  // ── Gemme nascoste (Italia profonda ed estero non ovvio) ─────────────
  {
    id: 'civita-bagnoregio', emoji: '🏰', title: 'Civita di Bagnoregio', destination: 'Civita di Bagnoregio',
    months: [3, 4, 5, 10, 11], days: 1, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'La "città che muore" sul ponte pedonale: arriva alla prima luce quando i calanchi escono dalla foschia, belvedere di Lubriano dall\'altro lato della valle, pranzo lento nel borgo, Orvieto a mezz\'ora per completare la giornata.',
  },
  {
    id: 'castelluccio-fiorita', emoji: '🌼', title: 'La Fiorita di Castelluccio', destination: 'Castelluccio di Norcia',
    months: [6, 7], days: 2, interests: ['panorami', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'La fioritura del Pian Grande tra fine giugno e luglio: lenticchie, papaveri e fiordalisi a perdita d\'occhio, arrivo all\'alba per la luce e i parcheggi, lenticchia di Castelluccio nei ristori, Norcia e i suoi salumi a valle.',
  },
  {
    id: 'procida-fuoristagione', emoji: '🎨', title: 'Procida fuori stagione', destination: 'Procida',
    months: [4, 5, 10], days: 2, interests: ['panorami', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'isola più autentica del golfo senza folla: Marina Corricella al tramonto dai belvedere di Terra Murata, limoni e insalata di limone, Chiaiolella e il ponte per Vivara, aliscafo da Napoli o Pozzuoli; tutto si gira a piedi.',
  },
  {
    id: 'craco-matera', emoji: '👻', title: 'Craco, la città fantasma', destination: 'Craco',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo fantasma sui calanchi lucani: visita guidata con casco al paese abbandonato (solo su prenotazione), luce del tardo pomeriggio sui calanchi, abbinalo a Matera o ai borghi della val d\'Agri, cucina contadina lucana.',
  },
  {
    id: 'bussana-vecchia', emoji: '🎭', title: 'Bussana Vecchia degli artisti', destination: 'Bussana Vecchia',
    months: [4, 5, 6, 9], days: 1, interests: ['arte', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo terremotato rinato come colonia di artisti sopra Sanremo: atelier e gallerie tra i ruderi, chiesa a cielo aperto, aperitivo nei giardini nascosti, poi discesa a Sanremo o alla pista ciclabile del Ponente per il tramonto.',
  },
  {
    id: 'eolie-maggio', emoji: '🌋', title: 'Eolie a maggio', destination: 'Lipari',
    months: [5, 6, 9], days: 4, interests: ['panorami', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Le isole prima (o dopo) l\'estate: Lipari come base, Salina per la malvasia e i capperi, Stromboli al tramonto per la sciara del fuoco vista dal mare, Vulcano e i fanghi, granita e pane cunzato; aliscafi da Milazzo.',
  },
  {
    id: 'valdivara-borghi', emoji: '🐝', title: 'Val di Vara, la valle bio', destination: 'Varese Ligure',
    months: [5, 6, 7, 8, 9], days: 2, interests: ['enogastronomia', 'relax'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'entroterra ligure che nessuno conosce: il Borgo Rotondo di Varese Ligure, la valle del biologico (formaggi, miele, croxetti), borghi di pietra (Brugnato, Calice al Cornoviglio), ponti medievali e pozze del fiume Vara per un bagno estivo.',
  },
  {
    id: 'rocca-calascio', emoji: '🏯', title: 'Rocca Calascio e la Baronia', destination: 'Santo Stefano di Sessanio',
    months: [5, 6, 9, 10], days: 2, interests: ['storia', 'panorami'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'Abruzzo dei set cinematografici: salita a piedi alla rocca più alta dell\'Appennino per il tramonto, borgo restaurato di Santo Stefano di Sessanio, piana di Campo Imperatore, lenticchie di Santo Stefano e arrosticini veri.',
  },
  {
    id: 'gubbio-albero', emoji: '🎄', title: 'Gubbio e l\'albero più grande', destination: 'Gubbio',
    months: [12, 1], days: 2, interests: ['tradizioni', 'storia'],
    theme: 'cultura', hiddenGem: true, country: 'Italia',
    specialRequests: 'Nel periodo natalizio il monte Ingino si accende: l\'albero di Natale "più grande del mondo" disegnato dalle luci sul versante, vista migliore dal viale al tramonto, palazzo dei Consoli, funivia panoramica se aperta, crescia e tartufo eugubino.',
  },
  {
    id: 'erice-inverno', emoji: '🌫️', title: 'Erice tra le nuvole', destination: 'Erice',
    months: [11, 12, 1, 2], days: 2, interests: ['storia', 'enogastronomia'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo medievale a 750 metri sul mare, d\'inverno spesso avvolto dalla nebbia che lo rende irreale: castello di Venere a picco, genovesi calde della pasticceria storica, funivia da Trapani se in funzione, saline di Trapani al tramonto.',
  },
  {
    id: 'albarracin', emoji: '🧱', title: 'Albarracín, borgo rosa', destination: 'Albarracín',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Spagna',
    specialRequests: 'Uno dei borghi più belli di Spagna, di gesso rosa sopra un\'ansa del fiume: mura al tramonto, case sospese sul vicolo, pitture rupestri del Rodeno tra i pini, jamón e ternasco aragonese; l\'Aragona rurale senza turismo di massa.',
  },
  {
    id: 'hallstatt-inverno', emoji: '❄️', title: 'Hallstatt d\'inverno feriale', destination: 'Hallstatt',
    months: [11, 12, 1, 2], days: 2, interests: ['panorami', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Austria',
    specialRequests: 'Il villaggio sul lago innevato scegliendo giorni FERIALI (nei weekend è preso d\'assalto): punto panoramico classico all\'alba prima dei pullman, miniera di sale se aperta, skywalk sopra i tetti, trota affumicata del lago.',
  },
  {
    id: 'kotor-bocche', emoji: '⛰️', title: 'Kotor e le Bocche', destination: 'Kotor',
    months: [5, 6, 9], days: 3, interests: ['storia', 'panorami'],
    theme: 'mare', hiddenGem: true, country: 'Montenegro',
    specialRequests: 'Il fiordo dell\'Adriatico: salita alle mura di San Giovanni la mattina presto (1350 gradini, vista sulle Bocche), città vecchia UNESCO, Perasto e l\'isola della Madonna dello Scarpello in barca, controlla il calendario crociere per evitare i giorni pieni.',
  },
  {
    id: 'colmar-mercatini', emoji: '🏘️', title: 'Colmar e l\'Avvento alsaziano', destination: 'Colmar',
    months: [11, 12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', hiddenGem: true, country: 'Francia',
    specialRequests: 'I mercatini diffusi nelle piazzette a graticcio: Petite Venise illuminata la sera, vin chaud e bredele, retablo di Issenheim a Unterlinden, villaggi della strada dei vini a mezz\'ora (Eguisheim, Riquewihr) nei giorni feriali.',
  },
  {
    id: 'sintra-feriale', emoji: '🏰', title: 'Sintra in un giorno feriale', destination: 'Sintra',
    months: [3, 4, 5, 10], days: 2, interests: ['storia', 'panorami'],
    theme: 'unicita', hiddenGem: true, country: 'Portogallo',
    specialRequests: 'I palazzi tra i boschi evitando i weekend: Pena alla prima fascia oraria prenotata, Quinta da Regaleira col pozzo iniziatico, castello dei Mori nella foschia, travesseiros della pasticceria storica, Cabo da Roca al tramonto.',
  },
  {
    id: 'ronda-tajo', emoji: '🌉', title: 'Ronda sul precipizio', destination: 'Ronda',
    months: [3, 4, 5, 10, 11], days: 2, interests: ['storia', 'panorami'],
    theme: 'storia', hiddenGem: true, country: 'Spagna',
    specialRequests: 'La città spaccata dal Tajo: Puente Nuevo dal basso (sentiero nella gola per la foto vera), plaza de toros tra le più antiche di Spagna, bagni arabi, vini della Serranía, pueblos blancos vicini (Setenil de las Bodegas sotto la roccia).',
  },
  {
    id: 'piran-sale', emoji: '🌊', title: 'Piran, la Venezia slovena', destination: 'Pirano',
    months: [5, 6, 9], days: 2, interests: ['panorami', 'enogastronomia'],
    theme: 'mare', hiddenGem: true, country: 'Slovenia',
    specialRequests: 'Il borgo veneziano sull\'Adriatico sloveno: piazza Tartini e le mura al tramonto, branzino e malvasia istriana sul lungomare, saline di Sicciole in bici (sale fiorato ancora raccolto a mano), bagno dai moli come i locali.',
  },
  {
    id: 'ohrid-lago', emoji: '⛪', title: 'Ohrid e il suo lago', destination: 'Ohrid',
    months: [6, 7, 8, 9], days: 3, interests: ['storia', 'relax'],
    theme: 'cultura', hiddenGem: true, country: 'Macedonia del Nord',
    specialRequests: 'Il lago balcanico patrimonio UNESCO: chiesa di San Giovanni a Kaneo dal sentiero a picco, teatro antico e fortezza di Samuele, barca al monastero di San Naum e alle sorgenti, trota e perle di Ohrid, tramonti lunghissimi sul lungolago.',
  },
  {
    id: 'ksamil-riviera', emoji: '🏖️', title: 'Ksamil e la riviera albanese', destination: 'Ksamil',
    months: [5, 6, 9], days: 3, interests: ['relax', 'storia'],
    theme: 'mare', hiddenGem: true, country: 'Albania',
    specialRequests: 'Acque caraibiche senza i prezzi (evitando luglio-agosto): isolotti di Ksamil a nuoto o in pedalò, sito archeologico di Butrinto nel parco a dieci minuti, Occhio Blu nell\'entroterra, frutti di mare a prezzi onesti, tramonto da Saranda.',
  },
  {
    id: 'azzorre-saomiguel', emoji: '🐋', title: 'Azzorre, isola verde', destination: 'Ponta Delgada',
    months: [6, 7, 8, 9], days: 5, interests: ['panorami', 'relax'],
    theme: 'montagna', hiddenGem: true, country: 'Portogallo',
    specialRequests: 'São Miguel d\'estate: caldeira di Sete Cidades (laghi verde e blu) con meteo mutevole — vai appena è limpido, piscine termali tra le felci a Furnas col cozido cotto nel vulcano, avvistamento cetacei, tè di Gorreana, ananas locale.',
  },
  {
    id: 'faroe-estate', emoji: '🐑', title: 'Isole Faroe d\'estate', destination: 'Tórshavn',
    months: [6, 7], days: 4, interests: ['panorami', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Danimarca',
    specialRequests: 'Giornate infinite e prati verticali: lago Sørvágsvatn sospeso sull\'oceano, cascata di Múlafossur a Gásadalur, villaggi di case col tetto d\'erba (Saksun, Tjørnuvík), pulcinelle di mare a Mykines se il traghetto opera; meteo che cambia in un\'ora, piani flessibili.',
  },
  {
    id: 'cesky-krumlov-inverno', emoji: '🏰', title: 'Český Krumlov d\'inverno', destination: 'Český Krumlov',
    months: [11, 12, 1, 2], days: 2, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Repubblica Ceca',
    specialRequests: 'Il borgo boemo sotto la neve, senza le folle estive: ansa della Moldava dalla torre del castello, vicoli medievali con le luci basse del pomeriggio, birra della boemia del sud e gulasch nelle taverne a volta, mercatino d\'Avvento se nel periodo.',
  },
  {
    id: 'chefchaouen-blu', emoji: '🔵', title: 'Chefchaouen, la città blu', destination: 'Chefchaouen',
    months: [3, 4, 10, 11], days: 2, interests: ['fotografia', 'tradizioni'],
    theme: 'unicita', hiddenGem: true, country: 'Marocco',
    specialRequests: 'La medina blu del Rif nelle mezze stagioni (d\'estate scotta): vicoli tinti d\'indaco alla prima luce, moschea spagnola al tramonto per la vista sulla città, tajine di capra e formaggio del Rif, cascate di Akchour per una mezza giornata.',
  },

  // ── Estensione catalogo · Italia sud e isole ─────────────────────────
  {
    id: 'bari-vecchia', emoji: '⛪', title: 'Bari vecchia e San Nicola', destination: 'Bari',
    months: [3, 4, 5, 10], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Il dedalo di Bari vecchia nelle mezze stagioni: basilica di San Nicola, le signore che fanno le orecchiette in strada ad Arco Basso, lungomare al tramonto, focaccia barese e crudo di mare al molo di San Nicola.',
  },
  {
    id: 'alberobello-trulli', emoji: '🛖', title: 'Alberobello e la Valle d\'Itria', destination: 'Alberobello',
    months: [4, 5, 10, 11], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'I trulli evitando le ore dei pullman: rione Aia Piccola all\'alba (più autentico di Monti), trullo Sovrano, poi la Valle d\'Itria a corolla (Locorotondo, Cisternino), capocollo di Martina Franca e bombette alla brace.',
  },
  {
    id: 'vieste-gargano', emoji: '🏖️', title: 'Vieste e il Gargano', destination: 'Vieste',
    months: [6, 7, 9], days: 3, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'Il Gargano tra mare e bosco: spiaggia del Pizzomunno al mattino, grotte marine in barca, Foresta Umbra per il fresco del pomeriggio, paranza e caciocavallo podolico; a settembre mare ancora caldo e borgo tranquillo.',
  },
  {
    id: 'tremiti-arcipelago', emoji: '⚓', title: 'Isole Tremiti', destination: 'Isole Tremiti',
    months: [5, 6, 9], days: 2, interests: ['relax', 'panorami'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Le isole dell\'Adriatico senza folla: traghetto da Termoli, giro in barca delle grotte di San Domino, abbazia fortificata di Santa Maria a Mare su San Nicola, snorkeling nell\'area marina protetta, tramonto dal faro.',
  },
  {
    id: 'otranto-alba', emoji: '🌅', title: 'Otranto, alba d\'Italia', destination: 'Otranto',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'panorami'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'Il punto più a est d\'Italia: alba dal faro di Punta Palascìa, mosaico dell\'Albero della Vita in cattedrale, castello aragonese, cava di bauxite dai colori irreali, pesce crudo salentino nel borgo murato.',
  },
  {
    id: 'ostuni-bianca', emoji: '🤍', title: 'Ostuni, la città bianca', destination: 'Ostuni',
    months: [5, 6, 9], days: 2, interests: ['fotografia', 'enogastronomia'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'La città bianca fuori dai picchi: vicoli calcinati alla prima luce, terrazze sulla piana degli ulivi secolari, masserie con olio dop da assaggiare, riserva di Torre Guaceto a un quarto d\'ora per il bagno.',
  },
  {
    id: 'tropea-fuoristagione', emoji: '🌶️', title: 'Tropea fuori stagione', destination: 'Tropea',
    months: [5, 6, 9, 10], days: 2, interests: ['panorami', 'enogastronomia'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'La perla tirrenica prima e dopo l\'estate: Santa Maria dell\'Isola sul mare turchese, affaccio dal corso al tramonto, cipolla rossa e \'nduja, Capo Vaticano per lo snorkeling; a ottobre l\'acqua è ancora tiepida e il paese torna ai residenti.',
  },
  {
    id: 'scilla-chianalea', emoji: '🐙', title: 'Scilla e Chianalea', destination: 'Scilla',
    months: [5, 6, 9], days: 2, interests: ['tradizioni', 'panorami'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Chianalea, il borgo dei pescatori con le case sull\'acqua: cena sulle palafitte, castello Ruffo affacciato sullo Stretto, il mito di Scilla e Cariddi, pesce spada nella stagione della pesca tradizionale, Reggio e i Bronzi a mezz\'ora.',
  },
  {
    id: 'sila-foliage', emoji: '🌲', title: 'Autunno in Sila', destination: 'Camigliatello Silano',
    months: [9, 10, 11], days: 2, interests: ['natura', 'enogastronomia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'altopiano calabrese coi colori d\'autunno: i Giganti di Fallistro (pini larici secolari), laghi Cecita e Arvo con la nebbiolina del mattino, funghi porcini e caciocavallo silano, trenino a vapore della Sila se in funzione.',
  },
  {
    id: 'gerace-borgo', emoji: '🦅', title: 'Gerace normanna', destination: 'Gerace',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'panorami'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo normanno sospeso sopra la costa dei Gelsomini: la cattedrale più grande della Calabria, botteghe di ceramica nei vicoli, affacci sullo Ionio, Locri Epizefiri e il suo museo ai piedi della rupe.',
  },
  {
    id: 'termoli-trabucchi', emoji: '🎣', title: 'Termoli e i trabucchi', destination: 'Termoli',
    months: [5, 6, 9], days: 2, interests: ['tradizioni', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo antico murato sul mare del Molise: passeggiata sulle mura, cattedrale romanica, brodetto alla termolese, trabucco al tramonto per capire la pesca d\'altri tempi, traghetto per le Tremiti come gita in giornata.',
  },
  {
    id: 'agnone-ndocciata', emoji: '🔥', title: 'Agnone e la \'Ndocciata', destination: 'Agnone',
    months: [12], days: 2, interests: ['tradizioni', 'enogastronomia'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'A dicembre la \'Ndocciata infiamma il paese: la sfilata delle grandi torce di abete, la pontificia fonderia di campane Marinelli (tra le più antiche d\'Europa), caciocavallo di Agnone e alto Molise innevato.',
  },
  {
    id: 'sulmona-giostra', emoji: '🍬', title: 'Sulmona dei confetti', destination: 'Sulmona',
    months: [6, 7], days: 2, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'La città di Ovidio e dei confetti: a luglio la Giostra Cavalleresca in piazza Maggiore, acquedotto medievale, botteghe storiche dei confetti, eremo di Sant\'Onofrio al Morrone per la vista sulla valle Peligna.',
  },
  {
    id: 'cagliari-santefisio', emoji: '🌺', title: 'Cagliari in primavera', destination: 'Cagliari',
    months: [4, 5], days: 3, interests: ['tradizioni', 'panorami'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'La primavera cagliaritana: quartiere Castello e bastione di Saint Remy, a inizio maggio la festa di Sant\'Efisio coi costumi di tutta l\'isola, fenicotteri a Molentargius, primo bagno al Poetto, fregola e bottarga.',
  },
  {
    id: 'alghero-corallo', emoji: '🪸', title: 'Alghero e la riviera del corallo', destination: 'Alghero',
    months: [5, 6, 9], days: 3, interests: ['panorami', 'enogastronomia'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'La città catalana di Sardegna: bastioni al tramonto, grotta di Nettuno via mare o dalla scalinata del Cabirol, spiagge della riviera del corallo (Le Bombarde), aragosta alla catalana e vermentino.',
  },
  {
    id: 'bosa-colorata', emoji: '🎨', title: 'Bosa sul fiume', destination: 'Bosa',
    months: [4, 5, 9, 10], days: 2, interests: ['fotografia', 'enogastronomia'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'Le case pastello sul fiume Temo: castello dei Malaspina dall\'alto, ex concerie lungo il fiume, malvasia di Bosa nelle cantine del borgo, spiaggia di Bosa Marina, tramonto dal ponte vecchio coi riflessi colorati.',
  },
  {
    id: 'carloforte-girotonno', emoji: '🐟', title: 'Carloforte tabarchina', destination: 'Carloforte',
    months: [5, 6, 9], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'isola dove si parla ancora ligure: carruggi di Carloforte, a giugno il Girotonno e la cucina del tonno di corsa, saline coi fenicotteri, colonne basaltiche e calette dell\'isola di San Pietro, cascà tabarchino.',
  },
  {
    id: 'supramonte-gorropu', emoji: '🧗', title: 'Supramonte e Gorropu', destination: 'Dorgali',
    months: [5, 6, 9, 10], days: 3, interests: ['natura', 'panorami'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il cuore selvaggio della Sardegna: gola di Gorropu (uno dei canyon più profondi d\'Europa, scarpe serie e acqua), murales di Orgosolo, pranzo coi pastori se prenotabile, nuraghi e maialetto arrosto.',
  },
  {
    id: 'ponza-fuoristagione', emoji: '🚤', title: 'Ponza senza folla', destination: 'Ponza',
    months: [5, 6, 9], days: 3, interests: ['relax', 'panorami'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'L\'isola dei romani lontano dai weekend d\'agosto: giro in barca con bagno sotto Chiaia di Luna (la falesia si ammira dal mare), piscine naturali, faraglioni di Lucia Rosa al tramonto, cisterne romane, coniglio alla ponzese.',
  },
  {
    id: 'favignana-egadi', emoji: '🚲', title: 'Favignana in bicicletta', destination: 'Favignana',
    months: [5, 6, 9], days: 3, interests: ['relax', 'fotografia'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'La farfalla delle Egadi pedalando: cala Rossa e Bue Marino tra le antiche cave di tufo, ex stabilimento Florio per la storia delle tonnare, granite al gelsomino, traghetto veloce da Trapani; a maggio l\'acqua è già turchese.',
  },
  {
    id: 'pantelleria-dammusi', emoji: '🏝️', title: 'Pantelleria, figlia del vento', destination: 'Pantelleria',
    months: [5, 6, 9, 10], days: 3, interests: ['relax', 'enogastronomia'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Dammusi e giardini panteschi: laghetto di Venere con le acque termali, Balata dei Turchi, passito e capperi nelle aziende agricole, tramonto dall\'arco dell\'Elefante; noleggia un mezzo, l\'isola è grande.',
  },
  {
    id: 'sperlonga-borgo', emoji: '🐚', title: 'Sperlonga bianca', destination: 'Sperlonga',
    months: [4, 5, 6, 9], days: 2, interests: ['storia', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il borgo bianco a metà strada tra Roma e Napoli: vicoli a scalinate sopra il mare, villa e grotta di Tiberio col museo archeologico, spiaggia di Levante nelle mezze stagioni feriali, tiella di Gaeta a due passi.',
  },
  {
    id: 'scicli-barocca', emoji: '🎬', title: 'Scicli, barocco intimo', destination: 'Scicli',
    months: [3, 4, 10, 11], days: 2, interests: ['arte', 'fotografia'],
    theme: 'cultura', hiddenGem: true, country: 'Italia',
    specialRequests: 'La più intima delle città barocche del Val di Noto: via Francesco Mormino Penna, San Bartolomeo incastonata nella cava, i luoghi del commissario più famoso della tv (municipio compreso), ricotta calda e cassatelle.',
  },

  // ── Estensione catalogo · Italia centro-nord e laghi ─────────────────
  {
    id: 'urbino-rinascimento', emoji: '🖌️', title: 'Urbino, città ideale', destination: 'Urbino',
    months: [3, 4, 5, 10, 11], days: 2, interests: ['arte', 'storia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'La capitale del Rinascimento marchigiano: palazzo Ducale con la Galleria Nazionale (Piero della Francesca), casa natale di Raffaello, salita alla fortezza Albornoz per il tramonto sui tetti, crescia sfogliata e casciotta d\'Urbino.',
  },
  {
    id: 'conero-riviera', emoji: '⛱️', title: 'Riviera del Conero', destination: 'Sirolo',
    months: [5, 6, 9], days: 2, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'Il monte a picco sull\'Adriatico: spiaggia delle Due Sorelle in barca da Numana, sentieri del parco tra i lecci, terrazza di Sirolo al tramonto, moscioli di Portonovo (le cozze selvatiche) e Rosso Conero.',
  },
  {
    id: 'frasassi-grotte', emoji: '🕳️', title: 'Grotte di Frasassi', destination: 'Genga',
    months: [11, 12, 1, 2, 3], days: 2, interests: ['natura', 'storia'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'Il ventre della montagna quando fuori fa freddo: grotte di Frasassi a temperatura costante con l\'abisso Ancona, tempietto del Valadier incastonato nella roccia, abbazia di San Vittore alle Chiuse, Fabriano e la carta a mano.',
  },
  {
    id: 'ascoli-quintana', emoji: '⚔️', title: 'Ascoli e la Quintana', destination: 'Ascoli Piceno',
    months: [7, 8], days: 2, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'La città di travertino nelle sere d\'estate: piazza del Popolo col rito dell\'anisetta al caffè storico, la Quintana con sbandieratori e giostra tra luglio e agosto, olive all\'ascolana fatte a mano, ponte romano di Solestà.',
  },
  {
    id: 'comacchio-anguille', emoji: '🛶', title: 'Comacchio e le valli', destination: 'Comacchio',
    months: [10, 11], days: 2, interests: ['tradizioni', 'natura'],
    theme: 'unicita', hiddenGem: true, country: 'Italia',
    specialRequests: 'La piccola Venezia lagunare nella stagione delle anguille: Trepponti e canali, Manifattura dei Marinati per capire la tradizione, sagra dell\'anguilla a ottobre, barca nelle valli tra i casoni da pesca, fenicotteri nelle saline.',
  },
  {
    id: 'elba-settembre', emoji: '⛏️', title: 'Elba a settembre', destination: 'Portoferraio',
    months: [9, 10], days: 3, interests: ['relax', 'storia'],
    theme: 'mare', country: 'Italia',
    specialRequests: 'L\'isola dopo la calca: mare di settembre a Sansone e Fetovaia, villa napoleonica di San Martino, cabinovia del Monte Capanne, miniere di Rio per la storia del ferro, aleatico e schiaccia briaca.',
  },
  {
    id: 'cividale-longobardi', emoji: '👑', title: 'Cividale longobarda', destination: 'Cividale del Friuli',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'enogastronomia'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'La capitale longobarda UNESCO: tempietto affacciato sul Natisone, ponte del Diavolo, museo cristiano col battistero di Callisto, gubana e frico nelle osterie, santuario di Castelmonte per la vista sulle valli.',
  },
  {
    id: 'palmanova-fortezza', emoji: '🛡️', title: 'Palmanova, città stellata', destination: 'Palmanova',
    months: [3, 4, 5, 10], days: 2, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Italia',
    specialRequests: 'La fortezza veneziana a stella perfetta: giro dei bastioni a piedi o in bici per capire la geometria, piazza Grande al centro della stella, porte monumentali e gallerie; abbinala ad Aquileia romana a un quarto d\'ora.',
  },
  {
    id: 'collio-vendemmia', emoji: '🥂', title: 'Vendemmia nel Collio', destination: 'Cormons',
    months: [9, 10], days: 2, interests: ['enogastronomia', 'panorami'],
    theme: 'unicita', country: 'Italia',
    specialRequests: 'I bianchi di confine nel periodo della vendemmia: colline del Collio tra Cormons e San Floriano, cantine di ribolla e friulano vista vigneti, salumi e formaggi di frontiera nelle osterie, Gorizia e Nova Gorica in un salto.',
  },
  {
    id: 'fusine-inverno', emoji: '🧊', title: 'Laghi di Fusine ghiacciati', destination: 'Tarvisio',
    months: [12, 1, 2], days: 2, interests: ['natura', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'I laghi gemelli ai piedi del Mangart, d\'inverno specchi ghiacciati: sentiero tra i due laghi (ciaspole se la neve è fresca), foresta di Tarvisio, il punto dove si toccano tre confini, frico e strudel nelle malghe basse; luce migliore al mattino.',
  },
  {
    id: 'sappada-carnevale', emoji: '👹', title: 'Carnevale di Sappada', destination: 'Sappada',
    months: [1, 2], days: 2, interests: ['tradizioni', 'panorami'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il carnevale del Rollate: le maschere lignee e il personaggio col pelliccione che apre le sfilate, borgate antiche di case in legno dell\'isola linguistica germanofona, sci di fondo in Val Sesis, ricotta affumicata e ravioli locali.',
  },
  {
    id: 'bergamo-alta', emoji: '🚠', title: 'Bergamo Alta d\'autunno', destination: 'Bergamo',
    months: [9, 10, 11], days: 2, interests: ['storia', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'Città Alta con la luce d\'autunno: funicolare storica, piazza Vecchia e cappella Colleoni, giro delle mura venete UNESCO al tramonto, polenta e osei (anche in versione dolce), San Vigilio con la nebbia in pianura.',
  },
  {
    id: 'mantova-gonzaga', emoji: '🦢', title: 'Mantova dei Gonzaga', destination: 'Mantova',
    months: [4, 5, 9, 10], days: 2, interests: ['arte', 'enogastronomia'],
    theme: 'storia', country: 'Italia',
    specialRequests: 'La capitale dei Gonzaga tra i laghi del Mincio: Camera degli Sposi prenotata, palazzo Te coi giganti di Giulio Romano, tramonto dai laghi coi riflessi della città, tortelli di zucca e sbrisolona; motonave tra le ninfee in tarda primavera.',
  },
  {
    id: 'cremona-liuteria', emoji: '🎻', title: 'Cremona dei liutai', destination: 'Cremona',
    months: [2, 3, 10, 11], days: 2, interests: ['musica', 'tradizioni'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'La capitale mondiale della liuteria: museo del Violino con l\'audizione degli strumenti storici se in calendario, botteghe dei liutai a porte aperte (prenota), Torrazzo e battistero, torrone e mostarda nelle stagioni fresche.',
  },
  {
    id: 'bernina-inverno', emoji: '🚂', title: 'Trenino rosso del Bernina', destination: 'Tirano',
    months: [12, 1, 2, 3], days: 2, interests: ['panorami', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il trenino rosso nella neve: tratta Tirano-Alp Grüm o St. Moritz col viadotto elicoidale di Brusio, carrozze panoramiche prenotate, pizzoccheri e bresaola a Tirano; siediti sul lato destro salendo per i ghiacciai.',
  },
  {
    id: 'montisola-iseo', emoji: '🛥️', title: 'Monte Isola sul lago d\'Iseo', destination: 'Monte Isola',
    months: [4, 5, 6, 9], days: 2, interests: ['relax', 'enogastronomia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'Una delle più grandi isole lacustri d\'Europa, senza auto: traghetto da Sulzano, giro in bici tra i borghi di pescatori (Peschiera Maraglio), sardine essiccate al sole e olio del Sebino, salita al santuario della Ceriola per la vista sul lago.',
  },
  {
    id: 'isole-borromee', emoji: '🦚', title: 'Isole Borromee', destination: 'Stresa',
    months: [4, 5, 6, 9], days: 2, interests: ['panorami', 'arte'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'Il golfo Borromeo quando i giardini sono al massimo: palazzo e terrazze di Isola Bella coi pavoni bianchi, Isola Madre botanica, pranzo all\'Isola dei Pescatori, lungolago liberty di Stresa; battelli frequenti, evita i festivi.',
  },
  {
    id: 'orta-san-giulio', emoji: '🧘', title: 'Orta, il lago del silenzio', destination: 'Orta San Giulio',
    months: [5, 6, 9, 10], days: 2, interests: ['relax', 'fotografia'],
    theme: 'montagna', hiddenGem: true, country: 'Italia',
    specialRequests: 'Il più raccolto dei laghi del nord: piazza Motta e i vicoli di Orta San Giulio, barca per l\'isola di San Giulio con la via del silenzio, Sacro Monte UNESCO tra le cappelle affrescate, tramonto dal lungolago; in un giorno feriale è un\'altra cosa.',
  },
  {
    id: 'garda-limone', emoji: '🚡', title: 'Alto Garda attivo', destination: 'Limone sul Garda',
    months: [4, 5, 6, 9, 10], days: 3, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'L\'alto Garda tra limonaie e pareti: limonaia del Castèl a Limone, ciclopista a sbalzo sul lago, funivia rotante del monte Baldo da Malcesine, il vento dei velisti tra Riva e Torbole, carne salada e olio del Garda.',
  },
  {
    id: 'genova-rolli', emoji: '🗝️', title: 'Genova e i Rolli', destination: 'Genova',
    months: [5, 10], days: 2, interests: ['storia', 'arte'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'I palazzi dei Rolli quando aprono le porte (Rolli Days a maggio e ottobre): via Garibaldi e le dimore UNESCO, carruggi e botteghe storiche, focaccia e pesto al mortaio, belvedere di Castelletto in ascensore liberty.',
  },
  {
    id: 'torino-luci', emoji: '💡', title: 'Torino d\'inverno', destination: 'Torino',
    months: [11, 12, 1], days: 3, interests: ['arte', 'enogastronomia'],
    theme: 'cultura', country: 'Italia',
    specialRequests: 'L\'inverno elegante: Luci d\'Artista per le vie del centro, museo Egizio prenotato, bicerin nei caffè storici, Mole Antonelliana e museo del Cinema, cioccolaterie storiche, mercato di Porta Palazzo per il lato popolare.',
  },
  {
    id: 'aosta-santorso', emoji: '🐂', title: 'Aosta e la Fiera di Sant\'Orso', destination: 'Aosta',
    months: [1], days: 2, interests: ['tradizioni', 'storia'],
    theme: 'montagna', country: 'Italia',
    specialRequests: 'A fine gennaio la Fiera di Sant\'Orso riempie il centro di intagliatori: sculture in legno e artigianato alpino tra i banchi, teatro e arco romani, fontina e vin brulé, castello di Fénis come tappa; copriti, è pieno inverno alpino.',
  },

  // ── Estensione catalogo · Europa occidentale e alpina ────────────────
  {
    id: 'porto-douro', emoji: '🍷', title: 'Porto e il Douro', destination: 'Porto',
    months: [9, 10], days: 3, interests: ['enogastronomia', 'panorami'],
    theme: 'unicita', country: 'Portogallo',
    specialRequests: 'La stagione della vendemmia sul Douro: cantine di Vila Nova de Gaia per il porto, Ribeira e ponte Dom Luís al tramonto, libreria Lello presto per evitare la fila, treno o barca nella valle del Douro tra i vigneti a terrazze, francesinha per i coraggiosi.',
  },
  {
    id: 'madeira-levadas', emoji: '🥾', title: 'Madeira e le levadas', destination: 'Funchal',
    months: [3, 4, 5, 10, 11], days: 4, interests: ['natura', 'panorami'],
    theme: 'montagna', country: 'Portogallo',
    specialRequests: 'L\'isola dell\'eterna primavera: camminate lungo le levadas (canali d\'acqua tra le felci, PR8 o 25 Fontes), alba dal Pico do Arieiro sopra le nuvole, mercato dos Lavradores, poncha e espetada; il meteo cambia per versante, tieni piani alternativi.',
  },
  {
    id: 'granada-alhambra', emoji: '🕌', title: 'Granada e l\'Alhambra', destination: 'Granada',
    months: [3, 4, 5, 10, 11], days: 3, interests: ['storia', 'arte'],
    theme: 'storia', country: 'Spagna',
    specialRequests: 'L\'Alhambra nelle mezze stagioni (biglietti con largo anticipo, Nasridi nella prima fascia): Generalife e i giardini, Albaicín coi carmen, tramonto dal mirador de San Nicolás con la Sierra Nevada dietro, tapas che arrivano gratis con la bevuta.',
  },
  {
    id: 'sansebastian-pintxos', emoji: '🍢', title: 'San Sebastián e i pintxos', destination: 'San Sebastián',
    months: [6, 9], days: 2, interests: ['enogastronomia', 'panorami'],
    theme: 'mare', country: 'Spagna',
    specialRequests: 'La baia della Concha senza il picco d\'agosto: giro di pintxos nella parte vieja (un bar, un pezzo, si gira), funicolare del monte Igueldo per la vista, surf o passeggiata alla Zurriola, sidrerie basche nei dintorni.',
  },
  {
    id: 'minorca-cale', emoji: '🐴', title: 'Minorca delle calette', destination: 'Minorca',
    months: [5, 6, 9], days: 4, interests: ['relax', 'natura'],
    theme: 'mare', hiddenGem: true, country: 'Spagna',
    specialRequests: 'La Baleare tranquilla: cale del sud (Macarella, Turqueta) raggiunte a piedi dal Camí de Cavalls presto al mattino, Ciutadella e il porto vecchio, formaggio di Maó e gin locale, tramonto dalla Cova d\'en Xoroi; a giugno o settembre il mare è perfetto.',
  },
  {
    id: 'saintmalo-maree', emoji: '🌊', title: 'Saint-Malo e le maree', destination: 'Saint-Malo',
    months: [5, 6, 9], days: 2, interests: ['storia', 'panorami'],
    theme: 'mare', country: 'Francia',
    specialRequests: 'La città corsara dentro le mura: giro dei bastioni con le maree tra le più ampie d\'Europa (controlla gli orari per raggiungere a piedi il Grand Bé), ostriche di Cancale a mezz\'ora, galette e sidro, Mont-Saint-Michel come gita evitando il mezzogiorno.',
  },
  {
    id: 'bonifacio-falesie', emoji: '⛵', title: 'Bonifacio sulle falesie', destination: 'Bonifacio',
    months: [5, 6, 9], days: 3, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Francia',
    specialRequests: 'La Corsica del sud fuori dai picchi: città alta sulle falesie bianche, scala del Re d\'Aragona, barca alle isole Lavezzi per lo snorkeling, tramonto dai bastioni, salumi e brocciu; a settembre acqua calda e porti tranquilli.',
  },
  {
    id: 'parigi-musei-inverno', emoji: '🖼️', title: 'Parigi dei musei d\'inverno', destination: 'Parigi',
    months: [11, 1, 2, 3], days: 4, interests: ['arte', 'musei'],
    theme: 'cultura', country: 'Francia',
    specialRequests: 'La Parigi delle sale calde e delle code corte: Louvre in nocturne se disponibile, Orsay e Orangerie con calma, caffè e onion soup nei bistrot, passages couverts sotto la pioggia, Marais e librerie; luce bassa perfetta sulla Senna.',
  },
  {
    id: 'loira-castelli', emoji: '🏰', title: 'Castelli della Loira', destination: 'Amboise',
    months: [4, 5, 6, 9], days: 3, interests: ['storia', 'panorami'],
    theme: 'storia', country: 'Francia',
    specialRequests: 'La valle dei re: Chambord all\'apertura, Chenonceau sul fiume (il più fotogenico, vai presto), Amboise e la tomba di Leonardo al Clos Lucé, vini di Vouvray in cantina scavata nel tufo, giardini di Villandry in stagione.',
  },
  {
    id: 'chamonix-montebianco', emoji: '🗻', title: 'Chamonix e il Monte Bianco', destination: 'Chamonix',
    months: [7, 8], days: 3, interests: ['panorami', 'natura'],
    theme: 'montagna', country: 'Francia',
    specialRequests: 'L\'alta montagna accessibile: Aiguille du Midi presto al mattino (prenota, e sali solo col sereno), Mer de Glace col trenino del Montenvers, balcons con vista sulle Drus, fonduta e génépi; quota alta, sali gradualmente.',
  },
  {
    id: 'londra-avvento', emoji: '🎡', title: 'Londra sotto le feste', destination: 'Londra',
    months: [11, 12], days: 4, interests: ['musei', 'fotografia'],
    theme: 'cultura', country: 'Regno Unito',
    specialRequests: 'Le luminarie di Regent e Oxford Street, mercatini sul South Bank, musei gratuiti per scaldarsi (British, National Gallery), pattinaggio nei cortili storici, pub con camino e sunday roast, vetrine dei grandi magazzini addobbate.',
  },
  {
    id: 'cornovaglia-estate', emoji: '🧜', title: 'Cornovaglia d\'estate', destination: 'St Ives',
    months: [6, 7, 9], days: 4, interests: ['panorami', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Regno Unito',
    specialRequests: 'La costa celtica: St Ives con la luce dei pittori e la Tate, St Michael\'s Mount con la marea giusta, sentiero costiero verso Land\'s End, Minack Theatre scavato nella scogliera, pasty e cream tea (prima la panna o la marmellata? scegli con cautela).',
  },
  {
    id: 'dublino-sanpatrizio', emoji: '☘️', title: 'Dublino per San Patrizio', destination: 'Dublino',
    months: [3], days: 3, interests: ['tradizioni', 'musica'],
    theme: 'cultura', country: 'Irlanda',
    specialRequests: 'La settimana di San Patrizio a metà marzo: parata e città vestita di verde, Trinity College col Book of Kells prenotato, pub di Temple Bar ma anche quelli veri fuori dal circuito, musica dal vivo, Guinness Storehouse con pinta panoramica.',
  },
  {
    id: 'kerry-irlanda', emoji: '🐑', title: 'Ring of Kerry', destination: 'Killarney',
    months: [5, 6, 9], days: 3, interests: ['panorami', 'natura'],
    theme: 'montagna', country: 'Irlanda',
    specialRequests: 'L\'Irlanda verde delle penisole: Ring of Kerry in senso orario per evitare i pullman, parco di Killarney coi laghi e Muckross House, Gap of Dunloe a piedi o in calesse, scogliere di Kerry, pub con musica la sera; meteo mutevole, piani flessibili.',
  },
  {
    id: 'olanda-tulipani', emoji: '🌷', title: 'Tulipani d\'Olanda', destination: 'Amsterdam',
    months: [4, 5], days: 3, interests: ['fotografia', 'arte'],
    theme: 'unicita', country: 'Paesi Bassi',
    specialRequests: 'La fioritura tra aprile e inizio maggio: Keukenhof nei giorni feriali alla prima ora, campi colorati in bici tra Lisse e la costa, canali di Amsterdam, Rijksmuseum e Van Gogh prenotati, aringa e stroopwafel dai chioschi.',
  },
  {
    id: 'bruges-inverno', emoji: '🧵', title: 'Bruges d\'inverno', destination: 'Bruges',
    months: [11, 12, 1, 2], days: 2, interests: ['storia', 'enogastronomia'],
    theme: 'cultura', country: 'Belgio',
    specialRequests: 'La città medievale con la nebbiolina sui canali: Markt e beffroi, Madonna di Michelangelo in chiesa, birrerie trappiste e cioccolatieri artigiani, giro dei canali se operativo, beghinaggio in silenzio; le luci del tardo pomeriggio sono il momento migliore.',
  },
  {
    id: 'berlino-muro', emoji: '🧩', title: 'Berlino e la memoria', destination: 'Berlino',
    months: [5, 6, 9, 10], days: 3, interests: ['storia', 'musei'],
    theme: 'storia', country: 'Germania',
    specialRequests: 'La città della storia del Novecento: East Side Gallery e memoriale del Muro a Bernauer Straße, isola dei Musei prenotata, memoriale dell\'Olocausto, quartieri di Kreuzberg e Prenzlauer Berg, currywurst e birrerie all\'aperto in stagione.',
  },
  {
    id: 'foresta-nera', emoji: '🕰️', title: 'Foresta Nera', destination: 'Friburgo in Brisgovia',
    months: [6, 7, 9, 10], days: 3, interests: ['natura', 'tradizioni'],
    theme: 'montagna', country: 'Germania',
    specialRequests: 'Boschi e orologi a cucù: Friburgo coi ruscelli nei vicoli (Bächle), cascate di Triberg, lago Titisee, strada panoramica della Schwarzwaldhochstrasse, torta della Foresta Nera dove è nata; d\'autunno i boschi si accendono.',
  },
  {
    id: 'lauterbrunnen-cascate', emoji: '💦', title: 'Lauterbrunnen e le 72 cascate', destination: 'Lauterbrunnen',
    months: [6, 7, 8], days: 3, interests: ['panorami', 'natura'],
    theme: 'montagna', hiddenGem: true, country: 'Svizzera',
    specialRequests: 'La valle delle cascate: Staubbach che si polverizza dalla parete, cascate del Trümmelbach dentro la montagna, trenino per Wengen o Mürren (villaggi senza auto), prati con l\'Eiger e la Jungfrau dietro; costi svizzeri, picnic dai supermercati.',
  },
  {
    id: 'zermatt-cervino', emoji: '⛷️', title: 'Zermatt e il Cervino', destination: 'Zermatt',
    months: [12, 1, 2, 3], days: 3, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Svizzera',
    specialRequests: 'Il paese senza auto ai piedi del Cervino: trenino del Gornergrat all\'alba per la piramide perfetta, piste larghe e soleggiate, fonduta e rösti in baita, passeggiate invernali battute per chi non scia; il Cervino si nasconde spesso, tieni una mattina di riserva.',
  },

  // ── Estensione catalogo · Europa nord, est e Balcani ─────────────────
  {
    id: 'copenaghen-hygge', emoji: '🕯️', title: 'Copenaghen hygge', destination: 'Copenaghen',
    months: [11, 12], days: 3, interests: ['relax', 'fotografia'],
    theme: 'cultura', country: 'Danimarca',
    specialRequests: 'L\'inverno accogliente dei danesi: Nyhavn con le luci sui canali, Tivoli addobbato per le feste, caffè a lume di candela e cannella (kanelsnegle), smørrebrød a pranzo, quartiere di Christianshavn; tutto in bici o a piedi anche col freddo.',
  },
  {
    id: 'stoccolma-arcipelago', emoji: '🛳️', title: 'Stoccolma e l\'arcipelago', destination: 'Stoccolma',
    months: [6, 7, 8], days: 4, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Svezia',
    specialRequests: 'L\'estate delle giornate infinite: Gamla Stan presto, museo Vasa (il galeone recuperato intero), battello verso le isole dell\'arcipelago (Vaxholm o più lontano), bagni dai pontili come i locali, cena all\'aperto con la luce che non finisce.',
  },
  {
    id: 'rovaniemi-lapponia', emoji: '🦌', title: 'Lapponia finlandese', destination: 'Rovaniemi',
    months: [12, 1, 2], days: 3, interests: ['natura', 'fotografia'],
    theme: 'unicita', country: 'Finlandia',
    specialRequests: 'L\'inverno artico: safari in motoslitta o slitta coi husky, notte a caccia di aurora lontano dalle luci, sauna finlandese con tuffo nella neve, villaggio di Babbo Natale sul circolo polare (turistico ma irresistibile coi bambini); vestiti a strati seri.',
  },
  {
    id: 'tallinn-medievale', emoji: '🏯', title: 'Tallinn medievale', destination: 'Tallinn',
    months: [11, 12, 1, 2], days: 2, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Estonia',
    specialRequests: 'La città anseatica sotto la neve: mura e torri della città vecchia UNESCO, piazza del Municipio col mercatino d\'Avvento se nel periodo, passaggio di Santa Caterina, vin brulé speziato e cucina medievale a tema, vista dai belvedere di Toompea.',
  },
  {
    id: 'riga-liberty', emoji: '🏢', title: 'Riga art nouveau', destination: 'Riga',
    months: [5, 6, 9], days: 2, interests: ['arte', 'fotografia'],
    theme: 'cultura', hiddenGem: true, country: 'Lettonia',
    specialRequests: 'La capitale del liberty europeo: facciate di Alberta iela col naso all\'insù, città vecchia e casa delle Teste Nere, mercato centrale negli hangar per zeppelin (pane nero e pesce affumicato), spiaggia di Jūrmala a mezz\'ora di treno.',
  },
  {
    id: 'danzica-baltico', emoji: '🟡', title: 'Danzica e l\'ambra', destination: 'Danzica',
    months: [6, 7, 8], days: 2, interests: ['storia', 'panorami'],
    theme: 'storia', hiddenGem: true, country: 'Polonia',
    specialRequests: 'La città anseatica rinata: via Lunga e le facciate mercantili, gru medievale sul fiume, botteghe dell\'ambra, museo della Seconda Guerra Mondiale (qui è iniziata), spiaggia e molo di Sopot in tram; pierogi e pesce del Baltico.',
  },
  {
    id: 'cracovia-inverno', emoji: '🐉', title: 'Cracovia d\'inverno', destination: 'Cracovia',
    months: [11, 12, 1, 2], days: 3, interests: ['storia', 'musei'],
    theme: 'storia', country: 'Polonia',
    specialRequests: 'La piazza medievale col mercatino e la neve: Rynek e Sukiennice, castello del Wawel col drago, quartiere ebraico di Kazimierz coi locali nei sotterranei, pierogi e zurek per scaldarsi, miniere di sale di Wieliczka; Auschwitz come giornata di memoria, con rispetto.',
  },
  {
    id: 'brasov-transilvania', emoji: '🧛', title: 'Transilvania d\'autunno', destination: 'Brasov',
    months: [9, 10], days: 3, interests: ['storia', 'panorami'],
    theme: 'storia', hiddenGem: true, country: 'Romania',
    specialRequests: 'I Carpazi coi colori d\'autunno: Brasov e la Chiesa Nera, castello di Bran (il "castello di Dracula", vai presto), Sighisoara medievale patria di Vlad, chiese fortificate sassoni (Viscri), zuppe nel pane e vin fiert; orsi veri nei boschi, escursioni solo con guide.',
  },
  {
    id: 'rila-sofia', emoji: '⛪', title: 'Sofia e il monastero di Rila', destination: 'Sofia',
    months: [5, 6, 9], days: 3, interests: ['storia', 'natura'],
    theme: 'cultura', hiddenGem: true, country: 'Bulgaria',
    specialRequests: 'La capitale ai piedi del Vitosha e il gioiello dei Balcani: cattedrale Aleksandr Nevskij, rovine romane di Serdica sotto la città, gita al monastero di Rila tra le montagne (affreschi e silenzio, evita la fascia dei pullman), banitsa e yogurt bulgaro.',
  },
  {
    id: 'atene-inverno', emoji: '🏺', title: 'Atene fuori stagione', destination: 'Atene',
    months: [11, 12, 1, 2, 3], days: 3, interests: ['storia', 'musei'],
    theme: 'storia', country: 'Grecia',
    specialRequests: 'L\'Acropoli senza calca né caldo: Partenone alla prima ora con la luce d\'inverno, museo dell\'Acropoli e Archeologico Nazionale, Plaka e Anafiotika (l\'isola cicladica sotto la rocca), taverne con moussaka e vino sfuso, tramonto dal Licabetto.',
  },
  {
    id: 'creta-autunno', emoji: '🫒', title: 'Creta a fine stagione', destination: 'Chania',
    months: [9, 10], days: 4, interests: ['relax', 'storia'],
    theme: 'mare', country: 'Grecia',
    specialRequests: 'L\'isola grande quando i più se ne vanno: porto veneziano di Chania, mare ancora caldo a Elafonissi e Balos (strada sterrata, vai presto), palazzo di Cnosso, taverne di montagna con dakos e formaggi, olio nuovo se la raccolta è iniziata.',
  },
  {
    id: 'naxos-cicladi', emoji: '🏛️', title: 'Naxos autentica', destination: 'Naxos',
    months: [5, 6, 9], days: 3, interests: ['relax', 'tradizioni'],
    theme: 'mare', hiddenGem: true, country: 'Grecia',
    specialRequests: 'La ciclade dei greci: Portara al tramonto, spiagge lunghe di Agios Prokopios e Plaka senza i prezzi di Mykonos, villaggi di montagna (Halki, Apiranthos) con le distillerie di cedro, patate e graviera locali, kouros incompiuti nelle cave antiche.',
  },
  {
    id: 'malta-inverno', emoji: '🛕', title: 'Malta d\'inverno', destination: 'La Valletta',
    months: [11, 12, 1, 2], days: 3, interests: ['storia', 'panorami'],
    theme: 'storia', country: 'Malta',
    specialRequests: 'L\'isola dei Cavalieri col clima mite: La Valletta e la concattedrale con i Caravaggio, Tre Città in barca tradizionale, Mdina silenziosa la sera, templi megalitici più antichi delle piramidi, pastizzi e ftira; il mare d\'inverno si guarda, non si fa il bagno.',
  },
  {
    id: 'cipro-primavera', emoji: '🌼', title: 'Cipro in primavera', destination: 'Pafos',
    months: [3, 4], days: 3, interests: ['storia', 'natura'],
    theme: 'mare', country: 'Cipro',
    specialRequests: 'L\'isola di Afrodite fiorita: mosaici romani di Pafos, roccia di Afrodite al tramonto, monti Troodos con le chiese bizantine affrescate UNESCO, halloumi alla griglia e meze infiniti; a marzo-aprile si cammina bene, il mare è ancora fresco.',
  },
  {
    id: 'meteora-monasteri', emoji: '🪨', title: 'Meteora, monasteri nel cielo', destination: 'Kalambaka',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Grecia',
    specialRequests: 'I monasteri sui pilastri di roccia: apertura scaglionata (controlla i giorni di chiusura di ciascuno), tramonto dai punti panoramici sulla strada alta, sentieri monastici a piedi tra i torrioni, dress code per entrare (spalle e gambe coperte), taverne di Kastraki.',
  },
  {
    id: 'berat-finestre', emoji: '🪟', title: 'Berat dalle mille finestre', destination: 'Berat',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Albania',
    specialRequests: 'La città ottomana UNESCO: quartieri di Mangalem e Gorica con le finestre a cascata sulla collina, castello ancora abitato con le chiese bizantine, museo delle icone di Onufri, byrek e vino di Berat; ponte sull\'Osum al tramonto per la foto classica.',
  },
  {
    id: 'mostar-ponte', emoji: '🌉', title: 'Mostar e il suo ponte', destination: 'Mostar',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Bosnia ed Erzegovina',
    specialRequests: 'Lo Stari Most ricostruito: la mattina presto prima dei pullman da Dubrovnik, i tuffatori dal ponte (tradizione vera), bazar di Kujundziluk, cevapi e caffè bosniaco col rituale, cascate di Kravice e tekija di Blagaj come gite brevi.',
  },
  {
    id: 'gjirokaster-pietra', emoji: '🪦', title: 'Gjirokastër di pietra', destination: 'Gjirokastër',
    months: [4, 5, 9, 10], days: 2, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Albania',
    specialRequests: 'La città di pietra UNESCO: tetti in lastre di ardesia, castello con la vista sulla valle del Drino, case-torri ottomane visitabili, bazar restaurato, qifqi (polpette di riso) che si trovano solo qui; abbinala al sito archeologico di Antigonea.',
  },
  {
    id: 'plitvice-laghi', emoji: '💧', title: 'Laghi di Plitvice', destination: 'Plitvice',
    months: [5, 6, 9, 10], days: 2, interests: ['natura', 'fotografia'],
    theme: 'montagna', country: 'Croazia',
    specialRequests: 'I sedici laghi a terrazze: ingresso alla prima ora con biglietto orario prenotato, percorsi che salgono dai laghi inferiori (cascata grande) ai superiori, passerelle sull\'acqua turchese, trota alla griglia; a ottobre foliage e meno gente, niente bagno: è vietato.',
  },
  {
    id: 'bled-lago', emoji: '🔔', title: 'Bled e la campana dei desideri', destination: 'Bled',
    months: [5, 6, 9], days: 2, interests: ['panorami', 'relax'],
    theme: 'montagna', country: 'Slovenia',
    specialRequests: 'Il lago alpino con l\'isola: pletna (la barca tradizionale) per suonare la campana della chiesetta, castello sulla rupe, giro del lago a piedi al mattino, cremeschnitte (la fetta di crema storica), gola di Vintgar a due passi con le passerelle sul torrente.',
  },

  // ── Estensione catalogo · Asia e Medio Oriente ───────────────────────
  {
    id: 'tokyo-momiji', emoji: '🍁', title: 'Tokyo dei momiji', destination: 'Tokyo',
    months: [11, 12], days: 4, interests: ['fotografia', 'tradizioni'],
    theme: 'cultura', country: 'Giappone',
    specialRequests: 'Gli aceri rossi di fine autunno: giardini di Rikugien e Koishikawa (illuminazioni serali se in calendario), Meiji-jingu coi ginkgo dorati, Shibuya e Shinjuku per il contrasto, ramen fumante e depachika; le punte di colore variano di anno in anno, tieni alternative.',
  },
  {
    id: 'shirakawa-go-inverno', emoji: '🏡', title: 'Shirakawa-go sotto la neve', destination: 'Shirakawa-go',
    months: [12, 1, 2], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Giappone',
    specialRequests: 'Il villaggio gassho-zukuri UNESCO imbiancato: tetti di paglia ripidi carichi di neve, punto panoramico di Ogimachi, notte in una casa tradizionale col kotatsu se prenotabile con largo anticipo, hida-gyu e sake caldo; abbinalo a Takayama.',
  },
  {
    id: 'jiufen-lanterne', emoji: '🏮', title: 'Jiufen tra le lanterne', destination: 'Jiufen',
    months: [10, 11], days: 2, interests: ['tradizioni', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Taiwan',
    specialRequests: 'Il vecchio villaggio minerario sopra l\'oceano: vicolo Shuqi con le case da tè e le lanterne rosse accese al crepuscolo (resta dopo che i gruppi ripartono), taro balls e street food della old street, treno storico della valle di Pingxi come gita.',
  },
  {
    id: 'seoul-autunno', emoji: '🍂', title: 'Seoul d\'autunno', destination: 'Seoul',
    months: [10, 11], days: 4, interests: ['storia', 'enogastronomia'],
    theme: 'cultura', country: 'Corea del Sud',
    specialRequests: 'La stagione più bella della Corea: palazzo Gyeongbokgung col cambio della guardia (hanbok a noleggio per entrare gratis), villaggio hanok di Bukchon presto al mattino, ginkgo dorati lungo lo stream di Cheonggyecheon, barbecue coreano e mercato di Gwangjang.',
  },
  {
    id: 'pechino-muraglia', emoji: '🐲', title: 'Pechino e la Muraglia', destination: 'Pechino',
    months: [9, 10], days: 4, interests: ['storia', 'panorami'],
    theme: 'storia', country: 'Cina',
    specialRequests: 'L\'autunno secco e terso: Città Proibita prenotata in anticipo, Muraglia a Mutianyu invece di Badaling (meno folla, foliage sulle creste), hutong in risciò o in bici, anatra laccata, Tempio del Cielo all\'alba coi pechinesi che fanno tai chi.',
  },
  {
    id: 'vietnam-nord-risaie', emoji: '🌾', title: 'Vietnam del nord', destination: 'Hanoi',
    months: [10, 11], days: 5, interests: ['natura', 'tradizioni'],
    theme: 'montagna', country: 'Vietnam',
    specialRequests: 'La finestra secca d\'autunno: vecchio quartiere di Hanoi e pho da marciapiede, baia di Halong o la più tranquilla Lan Ha con notte in giunca, risaie a terrazze verso Sapa o Mu Cang Chai (il raccolto colora d\'oro tra settembre e ottobre), egg coffee.',
  },
  {
    id: 'hoi-an-lanterne', emoji: '🎐', title: 'Hoi An delle lanterne', destination: 'Hoi An',
    months: [2, 3, 4], days: 3, interests: ['tradizioni', 'enogastronomia'],
    theme: 'unicita', hiddenGem: true, country: 'Vietnam',
    specialRequests: 'La città vecchia UNESCO nella stagione secca: lanterne accese sul fiume Thu Bon (la sera di luna piena le luci elettriche si spengono), sarti su misura in 24 ore, cao lau e white rose, ponte giapponese all\'alba, risaie e spiaggia di An Bang in bici.',
  },
  {
    id: 'luang-prabang-alba', emoji: '🧡', title: 'Luang Prabang sacra', destination: 'Luang Prabang',
    months: [11, 12, 1, 2], days: 3, interests: ['tradizioni', 'relax'],
    theme: 'cultura', hiddenGem: true, country: 'Laos',
    specialRequests: 'La stagione fresca sul Mekong: questua dei monaci all\'alba (osserva in silenzio, a distanza), templi dorati e Wat Xieng Thong, cascate turchesi di Kuang Si, tramonto dal Phousi o da una barca sul Mekong, mercato notturno e khao soi lao.',
  },
  {
    id: 'angkor-templi', emoji: '🛕', title: 'Angkor nella stagione secca', destination: 'Siem Reap',
    months: [11, 12, 1, 2], days: 3, interests: ['storia', 'fotografia'],
    theme: 'storia', country: 'Cambogia',
    specialRequests: 'La città dei templi khmer: alba ad Angkor Wat (arriva molto presto, poi vai controcorrente), volti del Bayon, radici di Ta Prohm, templi lontani in tuk tuk per ore senza folla, amok di pesce; pause lunghe a mezzogiorno, il caldo picchia anche d\'inverno.',
  },
  {
    id: 'chiang-mai-lanterne', emoji: '🪔', title: 'Chiang Mai e il nord thai', destination: 'Chiang Mai',
    months: [11, 12, 1], days: 4, interests: ['tradizioni', 'natura'],
    theme: 'cultura', country: 'Thailandia',
    specialRequests: 'La stagione fresca del nord: templi della città vecchia e Doi Suthep all\'alba, a novembre le feste delle lanterne riempiono cielo e fiume (Loy Krathong), santuari etici degli elefanti (senza cavalcarli), khao soi e mercati notturni, corso di cucina thai.',
  },
  {
    id: 'bali-verde', emoji: '🌴', title: 'Bali nella stagione secca', destination: 'Ubud',
    months: [5, 6, 7, 8, 9], days: 5, interests: ['natura', 'relax'],
    theme: 'cultura', country: 'Indonesia',
    specialRequests: 'L\'isola degli dèi tra maggio e settembre: risaie a terrazze di Tegallalang o Jatiluwih presto al mattino, templi di Tirta Empul e Uluwatu col kecak al tramonto, cerimonie quotidiane con le offerte, warung con nasi campur, alba sul vulcano Batur per i mattinieri.',
  },
  {
    id: 'jaipur-rajasthan', emoji: '🐪', title: 'Rajasthan d\'inverno', destination: 'Jaipur',
    months: [11, 12, 1, 2], days: 5, interests: ['storia', 'fotografia'],
    theme: 'storia', country: 'India',
    specialRequests: 'La stagione giusta per il deserto dei maharaja: città rosa di Jaipur (Hawa Mahal all\'alba, forte Amber presto), Jodhpur blu dal forte di Mehrangarh, notte a Udaipur sui laghi, thali e lassi, bazar delle spezie; contratta con sorriso, ovunque.',
  },
  {
    id: 'kerala-backwaters', emoji: '🛖', title: 'Kerala e le backwaters', destination: 'Alleppey',
    months: [12, 1, 2], days: 4, interests: ['relax', 'natura'],
    theme: 'unicita', country: 'India',
    specialRequests: 'Il sud tropicale nella stagione secca: notte in houseboat tra i canali delle backwaters, villaggi sull\'acqua e risaie sotto il livello del mare, curry di pesce su foglia di banano, spettacolo di kathakali a Kochi, piantagioni di tè di Munnar se allunghi.',
  },
  {
    id: 'kandy-colline', emoji: '🍵', title: 'Kandy e le colline del tè', destination: 'Kandy',
    months: [1, 2, 3], days: 4, interests: ['natura', 'tradizioni'],
    theme: 'cultura', hiddenGem: true, country: 'Sri Lanka',
    specialRequests: 'Il cuore verde di Ceylon nella stagione secca: tempio del Sacro Dente e il lago, treno panoramico verso Nuwara Eliya o Ella tra le piantagioni (siediti a destra, finestrini aperti), fabbriche del tè visitabili, rice and curry, Sigiriya come tappa sulla via.',
  },
  {
    id: 'gokarna-spiagge', emoji: '🌄', title: 'Gokarna, la Goa che non c\'è più', destination: 'Gokarna',
    months: [11, 12, 1, 2], days: 4, interests: ['relax', 'panorami'],
    theme: 'mare', hiddenGem: true, country: 'India',
    specialRequests: 'Il villaggio sacro coi templi e le spiagge selvagge: trekking costiero da Kudle a Om Beach fino a Half Moon e Paradise, capanne sulla sabbia, tramonti lunghi sull\'Arabico, thali vegetariano nel bazar dei pellegrini; niente vita notturna, è il suo bello.',
  },
  {
    id: 'kathmandu-himalaya', emoji: '🏔️', title: 'Kathmandu e le vette', destination: 'Kathmandu',
    months: [10, 11], days: 5, interests: ['storia', 'natura'],
    theme: 'montagna', country: 'Nepal',
    specialRequests: 'Il post-monsone con l\'aria tersa: stupa di Boudhanath al tramonto coi pellegrini, Durbar Square e Swayambhunath, alba sull\'Himalaya da Nagarkot, momo e dal bhat, voli panoramici sull\'Everest se il budget lo consente; l\'aria di ottobre regala le vette limpide.',
  },
  {
    id: 'samarcanda-via-seta', emoji: '🕋', title: 'Samarcanda e la via della seta', destination: 'Samarcanda',
    months: [4, 5, 9, 10], days: 4, interests: ['storia', 'fotografia'],
    theme: 'storia', hiddenGem: true, country: 'Uzbekistan',
    specialRequests: 'Le cupole turchesi nelle mezze stagioni (l\'estate brucia): Registan al tramonto e di nuovo all\'alba, necropoli di Shah-i-Zinda con le maioliche, mausoleo di Tamerlano, plov e pane di Samarcanda, treno veloce per Bukhara se aggiungi giorni.',
  },
  {
    id: 'caucaso-georgia', emoji: '🍇', title: 'Georgia, vino e Caucaso', destination: 'Tbilisi',
    months: [6, 7, 9], days: 4, interests: ['enogastronomia', 'panorami'],
    theme: 'montagna', hiddenGem: true, country: 'Georgia',
    specialRequests: 'Il paese dove il vino è nato: città vecchia di Tbilisi e bagni sulfurei, chiesa della Trinità di Gergeti col Kazbek dietro (strada militare georgiana), vino in anfora qvevri in Kakheti, khinkali e khachapuri, supra (il banchetto) se capita l\'invito.',
  },
  {
    id: 'oman-forti', emoji: '🏜️', title: 'Oman d\'inverno', destination: 'Mascate',
    months: [11, 12, 1, 2], days: 4, interests: ['storia', 'natura'],
    theme: 'cultura', country: 'Oman',
    specialRequests: 'L\'Arabia gentile col clima perfetto: Grande Moschea del Sultano al mattino, souq di Mutrah, forti di Nizwa e Bahla, wadi con le piscine smeraldo (Wadi Shab), notte nel deserto di Wahiba tra le dune, datteri e caffè al cardamomo ovunque.',
  },
  {
    id: 'istanbul-tulipani', emoji: '🌷', title: 'Istanbul in primavera', destination: 'Istanbul',
    months: [4, 5], days: 4, interests: ['storia', 'enogastronomia'],
    theme: 'cultura', country: 'Turchia',
    specialRequests: 'La città dei due continenti coi tulipani nei parchi (ad aprile fioriscono a milioni, il tulipano è nato qui): Santa Sofia e Moschea Blu presto, cisterna Basilica, traghetto sul Bosforo al tramonto, Gran Bazar e bazar delle spezie, balik ekmek e baklava.',
  },
  {
    id: 'song-kol-yurte', emoji: '⛺', title: 'Song-Kol, il lago delle yurte', destination: 'Song-Kol',
    months: [6, 7, 8], days: 4, interests: ['natura', 'panorami'],
    theme: 'montagna', hiddenGem: true, country: 'Kirghizistan',
    specialRequests: 'L\'altopiano nomade a 3000 metri, solo d\'estate: notte in yurta coi pastori kirghisi, cavalli e giochi equestri, cieli stellati senza una luce elettrica, kumis (latte di giumenta fermentato) per i coraggiosi, notti fredde anche in agosto: sacco a pelo serio.',
  },

  // ── Estensione catalogo · Africa, Americhe e Oceania ─────────────────
  {
    id: 'cairo-piramidi', emoji: '🐫', title: 'Il Cairo e le piramidi', destination: 'Il Cairo',
    months: [10, 11, 12, 1, 2, 3], days: 4, interests: ['storia', 'musei'],
    theme: 'storia', country: 'Egitto',
    specialRequests: 'L\'Egitto nella stagione fresca: piana di Giza all\'apertura (la Sfinge con la prima luce), museo con i tesori di Tutankhamon, Cairo islamico e bazar di Khan el-Khalili, felucca sul Nilo al tramonto, koshari da bancone; contratta tutto, con pazienza.',
  },
  {
    id: 'namibia-sossusvlei', emoji: '🏵️', title: 'Namibia, dune rosse', destination: 'Sossusvlei',
    months: [5, 6, 7, 8, 9], days: 5, interests: ['natura', 'fotografia'],
    theme: 'unicita', country: 'Namibia',
    specialRequests: 'L\'inverno australe secco e fresco: dune di Sossusvlei all\'alba (Big Daddy e Dune 45 con le creste nette), alberi morti di Deadvlei sul bianco dell\'argilla, canyon del Sesriem, cieli notturni tra i più bui del pianeta; distanze enormi, pianifica i pieni.',
  },
  {
    id: 'capetown-estate', emoji: '🐧', title: 'Città del Capo d\'estate', destination: 'Città del Capo',
    months: [11, 12, 1, 2, 3], days: 5, interests: ['panorami', 'enogastronomia'],
    theme: 'mare', country: 'Sudafrica',
    specialRequests: 'L\'estate australe ai piedi della Table Mountain: funivia appena il "tovagliolo" di nuvole si alza, pinguini di Boulders Beach, Capo di Buona Speranza lungo la Chapman\'s Peak Drive, vigneti di Stellenbosch e Franschhoek, tramonto da Signal Hill.',
  },
  {
    id: 'serengeti-migrazione', emoji: '🦁', title: 'Serengeti, la grande migrazione', destination: 'Serengeti',
    months: [6, 7, 8, 9], days: 5, interests: ['natura', 'fotografia'],
    theme: 'unicita', country: 'Tanzania',
    specialRequests: 'La stagione secca dei grandi branchi: game drive all\'alba e al tramonto (a mezzogiorno la savana dorme), cratere di Ngorongoro come eden concentrato, gli attraversamenti dei fiumi dipendono dalle piogge — nessuna garanzia, è natura; scegli operatori etici.',
  },
  {
    id: 'stone-town-zanzibar', emoji: '🚪', title: 'Stone Town e le spezie', destination: 'Zanzibar',
    months: [6, 7, 8, 9], days: 4, interests: ['storia', 'relax'],
    theme: 'mare', hiddenGem: true, country: 'Tanzania',
    specialRequests: 'La stagione secca sull\'isola delle spezie: vicoli e porte intagliate di Stone Town UNESCO, tour delle spezie nelle piantagioni, mercato notturno ai giardini Forodhani, marea che disegna le spiagge di Nungwi o Paje, dhow al tramonto; rispetta l\'abbigliamento locale in città.',
  },
  {
    id: 'essaouira-alisei', emoji: '🪁', title: 'Essaouira degli alisei', destination: 'Essaouira',
    months: [4, 5, 6, 9, 10], days: 3, interests: ['relax', 'tradizioni'],
    theme: 'mare', hiddenGem: true, country: 'Marocco',
    specialRequests: 'La città bianca e blu sull\'Atlantico: medina UNESCO senza la pressione di Marrakech, porto coi gabbiani e le barche blu, sardine grigliate al molo, botteghe di legno di tuia, kitesurf con l\'aliseo che soffia sempre, tramonto dai bastioni della Skala.',
  },
  {
    id: 'lalibela-chiese', emoji: '✝️', title: 'Lalibela scavata nella roccia', destination: 'Lalibela',
    months: [10, 11, 12, 1], days: 3, interests: ['storia', 'tradizioni'],
    theme: 'storia', hiddenGem: true, country: 'Etiopia',
    specialRequests: 'Le chiese monolitiche scavate nel tufo: Bete Giyorgis a croce perfetta vista dall\'alto, i due gruppi di chiese coi tunnel e i pellegrini in bianco, celebrazioni all\'alba (a gennaio le grandi feste copte riempiono il sito), injera e caffè con la cerimonia; quota 2600 metri, prendila con calma.',
  },
  {
    id: 'morondava-baobab', emoji: '🌳', title: 'Madagascar e i baobab', destination: 'Morondava',
    months: [5, 6, 7, 8, 9], days: 4, interests: ['natura', 'fotografia'],
    theme: 'unicita', hiddenGem: true, country: 'Madagascar',
    specialRequests: 'La stagione secca malgascia: viale dei Baobab al tramonto e di nuovo all\'alba (le sagome giganti con la luce radente), foresta di Kirindy coi lemuri e i fossa, piroghe dei pescatori vezo, riso e zebù; strade lente, i tempi si allungano sempre.',
  },
  {
    id: 'patagonia-elchalten', emoji: '🧭', title: 'Patagonia, capitale del trekking', destination: 'El Chaltén',
    months: [11, 12, 1, 2, 3], days: 5, interests: ['natura', 'panorami'],
    theme: 'montagna', country: 'Argentina',
    specialRequests: 'L\'estate australe ai piedi del Fitz Roy: sentiero alla Laguna de los Tres partendo all\'alba, Cerro Torre dalla Laguna Torre, ghiacciaio Perito Moreno da El Calafate coi crolli di ghiaccio, asado e vino; il vento patagonico comanda, tieni giorni di riserva.',
  },
  {
    id: 'salta-quebradas', emoji: '🌵', title: 'Salta e le quebradas', destination: 'Salta',
    months: [5, 6, 7, 8, 9], days: 4, interests: ['panorami', 'tradizioni'],
    theme: 'montagna', hiddenGem: true, country: 'Argentina',
    specialRequests: 'Il nord andino nella stagione secca: quebrada de Humahuaca coi cerri a strisce (collina dei sette colori a Purmamarca all\'alba), salinas Grandes, vigneti d\'altura di Cafayate coi torrontés, empanadas salteñe e peñas con musica folclorica la sera.',
  },
  {
    id: 'cusco-machupicchu', emoji: '🦙', title: 'Cusco e Machu Picchu', destination: 'Cusco',
    months: [5, 6, 7, 8, 9], days: 5, interests: ['storia', 'panorami'],
    theme: 'storia', country: 'Perù',
    specialRequests: 'La stagione secca andina: due giorni a Cusco per acclimatarti (quartiere di San Blas, mercato di San Pedro, mate de coca), valle Sacra con Pisac e Ollantaytambo, Machu Picchu col primo turno prenotato mesi prima, ceviche e causa; l\'altitudine non si negozia.',
  },
  {
    id: 'uyuni-specchio', emoji: '🪞', title: 'Salar de Uyuni, effetto specchio', destination: 'Uyuni',
    months: [1, 2, 3], days: 3, interests: ['fotografia', 'natura'],
    theme: 'unicita', hiddenGem: true, country: 'Bolivia',
    specialRequests: 'La stagione delle piogge trasforma il salar in uno specchio infinito: alba e tramonto sull\'acqua che riflette il cielo (le foto prospettiche si fanno dove è asciutto), isola Incahuasi coi cactus se raggiungibile, cimitero dei treni, notti gelide a 3700 metri.',
  },
  {
    id: 'chiloe-palafitte', emoji: '🌈', title: 'Chiloé, isola di leggende', destination: 'Castro',
    months: [12, 1, 2], days: 3, interests: ['tradizioni', 'natura'],
    theme: 'unicita', hiddenGem: true, country: 'Cile',
    specialRequests: 'L\'estate australe sull\'isola dei miti: palafitos colorati di Castro, chiese di legno UNESCO dei carpentieri chiloti, curanto cotto sotto terra, pinguini di Puñihuil in barca, mercati con papas nativas e cochayuyo; pioggia possibile anche d\'estate, è il suo clima.',
  },
  {
    id: 'atacama-stelle', emoji: '🔭', title: 'Atacama, deserto di stelle', destination: 'San Pedro de Atacama',
    months: [3, 4, 5, 9, 10, 11], days: 4, interests: ['natura', 'fotografia'],
    theme: 'montagna', country: 'Cile',
    specialRequests: 'Il deserto più arido del mondo nelle mezze stagioni: valle della Luna al tramonto, geyser del Tatio all\'alba (si parte al buio, fa gelo), lagune altiplaniche coi fenicotteri, tour astronomico con la luna nuova — i cieli sono tra i migliori del pianeta.',
  },
  {
    id: 'ilha-grande-sentieri', emoji: '🦜', title: 'Ilha Grande senza auto', destination: 'Ilha Grande',
    months: [4, 5, 6, 9], days: 3, interests: ['relax', 'natura'],
    theme: 'mare', hiddenGem: true, country: 'Brasile',
    specialRequests: 'L\'isola carioca senza strade nei mesi più asciutti: barca da Angra dos Reis, sentiero nella mata atlantica per Lopes Mendes (tra le spiagge più belle del Brasile), snorkeling alla Lagoa Azul, açaí e pesce alla griglia a Vila do Abraão, scimmie e tucani in colonna sonora.',
  },
  {
    id: 'rio-carnevale', emoji: '🥁', title: 'Rio de Janeiro in Carnevale', destination: 'Rio de Janeiro',
    months: [2], days: 4, interests: ['tradizioni', 'fotografia'],
    theme: 'cultura', country: 'Brasile',
    specialRequests: 'La festa più grande del mondo: sfilate delle scuole di samba al Sambodromo (biglietti con largo anticipo), blocos di strada gratuiti di giorno, Cristo Redentore e Pan di Zucchero appena apre per battere folla e foschia, caipirinha con giudizio e occhio agli oggetti di valore.',
  },
  {
    id: 'cartagena-caraibi', emoji: '🏴‍☠️', title: 'Cartagena coloniale', destination: 'Cartagena',
    months: [12, 1, 2, 3], days: 3, interests: ['storia', 'relax'],
    theme: 'mare', country: 'Colombia',
    specialRequests: 'La stagione secca caraibica: città murata con i balconi fioriti e le palenqueras, quartiere di Getsemaní con la street art e la vita vera, mura al tramonto con la brezza, isole del Rosario in barca per il bagno, ceviche e arepa de huevo; il caldo umido chiede pause.',
  },
  {
    id: 'yucatan-cenotes', emoji: '💎', title: 'Yucatán e i cenotes', destination: 'Mérida',
    months: [11, 12, 1, 2, 3], days: 5, interests: ['storia', 'natura'],
    theme: 'mare', country: 'Messico',
    specialRequests: 'La stagione secca maya: Chichén Itzá all\'apertura (o Uxmal, più tranquilla), bagno nei cenotes a cielo aperto e in grotta, città gialla di Izamal, cochinita pibil al mercato, fenicotteri di Celestún, Valladolid come base lenta; l\'acqua dolce dei cenotes è il vero lusso.',
  },
  {
    id: 'costarica-arenal', emoji: '🐸', title: 'Costa Rica, pura vida', destination: 'La Fortuna',
    months: [12, 1, 2, 3, 4], days: 5, interests: ['natura', 'relax'],
    theme: 'montagna', country: 'Costa Rica',
    specialRequests: 'La stagione secca del versante pacifico: vulcano Arenal coi sentieri di lava e le terme naturali, ponti sospesi nella foresta nebulosa di Monteverde, bradipi e tucani con una guida (li vede solo chi sa dove guardare), gallo pinto a colazione, spiagge di Guanacaste per chiudere.',
  },
  {
    id: 'banff-rockies', emoji: '🐻', title: 'Montagne Rocciose canadesi', destination: 'Banff',
    months: [6, 7, 8, 9], days: 5, interests: ['natura', 'panorami'],
    theme: 'montagna', country: 'Canada',
    specialRequests: 'L\'estate delle Rockies: lago Moraine e Lake Louise all\'alba (accessi regolamentati, prenota le navette), Icefields Parkway verso il ghiacciaio Athabasca, canyon Johnston, alci e orsi a distanza di sicurezza; a fine settembre i larici si accendono d\'oro.',
  },
  {
    id: 'quebec-inverno', emoji: '⛄', title: 'Québec sotto la neve', destination: 'Québec City',
    months: [12, 1, 2], days: 3, interests: ['storia', 'tradizioni'],
    theme: 'cultura', country: 'Canada',
    specialRequests: 'L\'inverno francofono del Nordamerica: Vieux-Québec innevato con lo Château Frontenac, a febbraio il Carnevale d\'inverno con le sculture di ghiaccio, scivolata sulla terrasse Dufferin, poutine e sciroppo d\'acero sulla neve (tire d\'érable), cascate Montmorency ghiacciate.',
  },
  {
    id: 'avana-vintage', emoji: '🚗', title: 'L\'Avana nella stagione secca', destination: 'L\'Avana',
    months: [12, 1, 2, 3], days: 4, interests: ['storia', 'musica'],
    theme: 'cultura', country: 'Cuba',
    specialRequests: 'La capitale sospesa nel tempo: Habana Vieja e le sue piazze restaurate, malecón al tramonto coi pescatori, auto d\'epoca e casas particulares per dormire dai cubani, son e salsa dal vivo, ropa vieja e mojito; porta contanti e pazienza, i servizi vanno a rilento.',
  },
  {
    id: 'sydney-estate', emoji: '🏄', title: 'Sydney d\'estate', destination: 'Sydney',
    months: [12, 1, 2], days: 5, interests: ['panorami', 'relax'],
    theme: 'mare', country: 'Australia',
    specialRequests: 'L\'estate australe sulla baia: Opera House e Harbour Bridge dal traghetto per Manly (il miglior punto di vista costa un biglietto di traghetto), coastal walk da Bondi a Coogee al mattino, bagni oceanici scavati nella roccia, Blue Mountains come gita, brunch e flat white.',
  },
  {
    id: 'queenstown-fiordi', emoji: '🥝', title: 'Nuova Zelanda del sud', destination: 'Queenstown',
    months: [11, 12, 1, 2, 3], days: 5, interests: ['natura', 'panorami'],
    theme: 'montagna', country: 'Nuova Zelanda',
    specialRequests: 'L\'estate australe dell\'isola del sud: crociera nel Milford Sound tra cascate e foche (la strada per arrivarci è metà del viaggio), lago Wakatipu e le Remarkables, sentieri panoramici o adrenalina (qui è nato il bungy), vini pinot noir di Central Otago, fish and chips al lago.',
  },
];

/**
 * Template proposti ora: finestra di 3 mesi (corrente + 2 successivi).
 * Ordine: mese corrente < prossimo < terzo < sempreverdi (12 mesi).
 * Nessun tetto qui: il taglio (7 alla volta) lo fa la UI.
 * Filtri opzionali: `theme` (chips) e `soloNascosti` (gemme nascoste).
 */
export function templatesForNow(
  now = new Date(),
  opts?: { theme?: SeasonalTheme; soloNascosti?: boolean }
): SeasonalTemplate[] {
  const m = now.getMonth() + 1;
  const m2 = (m % 12) + 1;
  const m3 = (m2 % 12) + 1;
  const rank = (t: SeasonalTemplate) => {
    if (t.months.length >= 12) return 3;      // sempreverde
    if (t.months.includes(m)) return 0;       // questo mese
    if (t.months.includes(m2)) return 1;      // il prossimo
    return 2;                                 // il terzo
  };
  let list = SEASONAL_TEMPLATES
    .filter(t => t.months.includes(m) || t.months.includes(m2) || t.months.includes(m3));
  if (list.length === 0 && !opts?.theme && !opts?.soloNascosti) {
    // Rete di sicurezza: mai una sezione vuota senza filtri attivi.
    list = SEASONAL_TEMPLATES.slice(0, 4);
  }
  if (opts?.soloNascosti) list = list.filter(t => t.hiddenGem === true);
  if (opts?.theme) list = list.filter(t => t.theme === opts.theme);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

// ── Traduzioni dei template curati (UI non italiana) ─────────────────
/** Mappa id → { title, specialRequests } tradotti. */
export type TemplateI18nMap = Record<string, { title: string; specialRequests: string }>;

const TPL_I18N_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni

/**
 * Traduzioni di title + specialRequests dei template curati per la lingua
 * UI. Con lingua 'it' non fa NULLA (mappa vuota, zero chiamate). Cache
 * localStorage `wip_tpl_i18n_<lang>` 7 giorni; chiede al server solo gli
 * id mancanti; qualunque fallimento → fallback silenzioso all'italiano
 * (mappa parziale o vuota).
 */
export async function loadTemplateTranslations(
  lang: string,
  templates: SeasonalTemplate[]
): Promise<TemplateI18nMap> {
  const l = String(lang || 'IT').toLowerCase().slice(0, 2);
  if (l === 'it') return {};
  const cacheKey = `wip_tpl_i18n_${l}`;

  let cachedMap: TemplateI18nMap = {};
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.map && typeof c.map === 'object' && Date.now() - (c.ts || 0) < TPL_I18N_TTL_MS) {
        cachedMap = c.map;
      }
    }
  } catch { /* cache corrotta: si rigenera */ }

  const missing = [...new Set(templates.map(t => t.id))].filter(id => !cachedMap[id]);
  if (missing.length === 0) return cachedMap;

  try {
    const { getApiUrl, apiFetch } = await import('./api');
    // apiFetch: Bearer automatico (all'anonimo la rotta risponde degradata).
    const res = await apiFetch(getApiUrl('/api/seasonal-catalog/translate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: missing, lang: l }),
    }, 60000);
    if (!res.ok) return cachedMap;
    const data = await res.json().catch(() => null);
    const nuove = (data && typeof data.translations === 'object' && data.translations) || {};
    const merged: TemplateI18nMap = { ...cachedMap, ...nuove };
    if (Object.keys(nuove).length > 0) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), map: merged })); } catch { /* quota piena */ }
    }
    return merged;
  } catch {
    return cachedMap; // rete giù: si resta in italiano senza rumore
  }
}
