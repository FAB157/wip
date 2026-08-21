// =====================================================================
// I LUOGHI SACRI DEL MONDO — catalogo curato per il turismo religioso
// =====================================================================
//
// PERCHÉ UN CATALOGO SCRITTO A MANO, come per le strade del vino.
// Wikidata ha 711.000 luoghi di culto con coordinate (misurati il 22/08/2026
// via QLever: 420.626 cristiani, 233.591 islamici, 29.493 buddisti, 17.056
// shintoisti, 4.634 ebraici, 4.187 induisti, 1.656 della tradizione cinese,
// 412 gurdwara sikh, 138 templi giainisti, 45 templi del fuoco zoroastriani).
// Quelli sono PUNTI: servono alla mappa, e li importiamo a parte.
//
// Un PELLEGRINAGGIO non è un punto. È un percorso con un ordine, una
// stagione, delle regole di accesso e un significato: il Cammino di Santiago
// non è "la cattedrale di Santiago", e i quattro luoghi del Buddha non hanno
// senso separati. Questa parte non si raccoglie, si scrive.
//
// COME SONO SCELTI. "Partendo dalle più famose" ha bisogno di una misura, e
// la misura è il numero di edizioni di Wikipedia in cui un luogo ha una voce:
// è fatta da migliaia di persone in decine di paesi e non premia l'Europa per
// costruzione. Nella classifica mondiale dei luoghi di culto escono in testa
// Santa Sofia (152 lingue), Angkor Wat (137), il Partenone (136), San Pietro
// (129), Notre-Dame (125), la Sagrada Família (108), la Masjid al-Haram
// (108), al-Aqsa (103), Borobudur (99).
//
// LE REGOLE DI ACCESSO NON SONO UN DETTAGLIO. Sono luoghi di culto vivi,
// non attrazioni: alcuni sono vietati ai non credenti per legge (la Mecca),
// altri agli uomini o alle donne, altri richiedono un permesso rilasciato
// giorni prima (Athos), altri hanno codici di abbigliamento la cui violazione
// significa non entrare. Un itinerario che manda una persona dove non può
// entrare è peggio di nessun itinerario, ed è per questo che ogni voce porta
// il campo `accesso` e ogni brief lo ripete.
//
// I NOMI DEI LUOGHI SI SCRIVONO QUI, i produttori no: al contrario delle
// strade del vino, qui le tappe SONO i luoghi (un santuario non chiude e non
// cambia nome come una cantina). Ma vale la stessa regola d'oro: mai un nome
// di cui non si è certi.
// =====================================================================

export type FamigliaReligiosa =
  | 'cristianesimo' | 'islam' | 'buddismo' | 'induismo'
  | 'ebraismo' | 'shintoismo' | 'sikhismo'
  // Aggiunte dopo la ricerca del 22/08: erano assenti dal primo catalogo e
  // sono tre fedi vive con mete di pellegrinaggio importanti. Il giainismo
  // ha 138 templi censiti su Wikidata ma Palitana da sola ne conta 863 su
  // una collina; lo zoroastrismo ha 45 templi del fuoco al mondo e la sua
  // capitale spirituale è una città sola.
  | 'giainismo' | 'zoroastrismo'
  | 'interreligioso';

export interface TappaSacra {
  /** Giorno consigliato (1-based). Più tappe possono cadere lo stesso giorno. */
  day: number;
  /** Il luogo, col nome con cui lo si trova sul posto. */
  place: string;
  lat: number;
  lon: number;
  /** Cosa si vede e perché conta, in una riga. */
  what: string;
}

export interface PercorsoSacro {
  id: string;
  emoji: string;
  /** Nome con cui il percorso è conosciuto. */
  name: string;
  famiglia: FamigliaReligiosa;
  country: string;
  region: string;
  continent: 'Europa' | 'Asia' | 'Africa' | 'Nord America' | 'Sud America' | 'Oceania';
  days: number;
  transport: 'piedi' | 'auto' | 'treno' | 'navetta' | 'barca' | 'misto';
  coords: { lat: number; lon: number };
  stops: TappaSacra[];
  /**
   * REGOLE DI ACCESSO, obbligatorie e verificate. Vanno nel brief così come
   * sono: chi le ignora resta fuori dalla porta, o peggio.
   */
  accesso: string;
  /** Quando ha senso andarci (feste, stagioni, chiusure). */
  stagione?: string;
  /** Una riga di contesto che entra nel brief del generatore. */
  nota?: string;
}

export const PERCORSI_SACRI: PercorsoSacro[] = [
  // ══════════════════════════ CRISTIANESIMO ══════════════════════════
  {
    id: 'sr-roma-basiliche',
    emoji: '⛪',
    name: 'Le sette chiese di Roma',
    famiglia: 'cristianesimo',
    country: 'Italia', region: 'Lazio', continent: 'Europa',
    days: 2, transport: 'misto',
    coords: { lat: 41.9022, lon: 12.4539 },
    stops: [
      { day: 1, place: 'Basilica di San Pietro in Vaticano', lat: 41.9022, lon: 12.4539, what: 'la più visitata del cristianesimo: la cupola di Michelangelo, la Pietà, le Grotte Vaticane' },
      { day: 1, place: 'Basilica di San Paolo fuori le Mura', lat: 41.8586, lon: 12.4769, what: 'i medaglioni di tutti i papi lungo la navata, e il chiostro cosmatesco' },
      { day: 1, place: 'Basilica di San Sebastiano fuori le Mura', lat: 41.8555, lon: 12.5166, what: 'sopra le catacombe: da qui si scende nella Roma sotterranea' },
      { day: 2, place: 'Basilica di San Giovanni in Laterano', lat: 41.8858, lon: 12.5058, what: 'la cattedrale di Roma, non San Pietro: è questa la chiesa del vescovo della città' },
      { day: 2, place: 'Basilica di Santa Croce in Gerusalemme', lat: 41.8879, lon: 12.5157, what: 'custodisce le reliquie della Passione portate da sant\'Elena' },
      { day: 2, place: 'Basilica di San Lorenzo fuori le Mura', lat: 41.9018, lon: 12.5245, what: 'ricostruita dopo il bombardamento del 1943, accanto al Verano' },
      { day: 2, place: 'Basilica di Santa Maria Maggiore', lat: 41.8976, lon: 12.4986, what: 'i mosaici del V secolo, i più antichi di Roma dedicati alla Vergine' },
    ],
    accesso: 'Ingresso libero in tutte e sette. Spalle e ginocchia coperte: è la regola che ferma più gente all\'ingresso di San Pietro, e vale anche in agosto. In San Pietro il controllo di sicurezza ha code lunghe, la cupola si paga a parte. Durante le celebrazioni la visita turistica si sospende: rispettare il silenzio e non fotografare chi prega.',
    stagione: 'tutto l\'anno; la visita delle sette in giornata è la tradizione di san Filippo Neri, ma in due giorni si vedono davvero',
    nota: 'il pellegrinaggio delle sette chiese nasce nel Cinquecento con Filippo Neri: era una gita di preghiera e merenda fuori porta, non una marcia',
  },
  {
    id: 'sr-terrasanta',
    emoji: '✝️',
    name: 'Terra Santa: Gerusalemme, Betlemme e la Galilea',
    famiglia: 'cristianesimo',
    country: 'Israele', region: 'Gerusalemme e Galilea', continent: 'Asia',
    days: 5, transport: 'misto',
    coords: { lat: 31.7784, lon: 35.2296 },
    stops: [
      { day: 1, place: 'Basilica del Santo Sepolcro', lat: 31.7784, lon: 35.2296, what: 'il luogo della crocifissione e della sepoltura, condiviso da sei confessioni cristiane' },
      { day: 1, place: 'Via Dolorosa', lat: 31.7800, lon: 35.2330, what: 'le quattordici stazioni attraverso il quartiere musulmano della Città Vecchia' },
      { day: 2, place: 'Monte degli Ulivi e Getsemani', lat: 31.7794, lon: 35.2397, what: 'la basilica delle Nazioni, gli ulivi millenari, la vista sulla Città Vecchia all\'alba' },
      { day: 2, place: 'Muro Occidentale', lat: 31.7767, lon: 35.2345, what: 'il luogo più sacro dell\'ebraismo accessibile: lo si visita con rispetto, non come panorama' },
      { day: 3, place: 'Basilica della Natività, Betlemme', lat: 31.7042, lon: 35.2075, what: 'la chiesa cristiana in uso più antica al mondo; si entra dalla Porta dell\'Umiltà, alta un metro e venti' },
      { day: 4, place: 'Nazaret, Basilica dell\'Annunciazione', lat: 32.7020, lon: 35.2978, what: 'la più grande chiesa del Medio Oriente, costruita sopra la casa di Maria' },
      { day: 5, place: 'Cafarnao e il lago di Tiberiade', lat: 32.8808, lon: 35.5750, what: 'la sinagoga del IV secolo e la casa di Pietro; il lago dove si svolge metà del Vangelo' },
    ],
    accesso: 'Betlemme è in Cisgiordania: si attraversa un posto di blocco, serve il passaporto, e le auto a targa israeliana non entrano — ci si va con taxi palestinesi o tour organizzati. Al Muro Occidentale la spianata è divisa fra uomini e donne, capo coperto per gli uomini (le kippah sono all\'ingresso). Il Monte del Tempio / Haram al-Sharif ha orari ristretti per i non musulmani e chiude senza preavviso. Sabato (shabbat) trasporti e servizi si fermano in Israele dal venerdì pomeriggio. VERIFICARE SEMPRE la situazione di sicurezza aggiornata prima di partire.',
    stagione: 'primavera e autunno; a Pasqua e Natale i luoghi santi sono pieni e le celebrazioni bellissime, ma le code diventano ore',
  },
  {
    id: 'sr-santiago-finale',
    emoji: '🐚',
    name: 'Cammino di Santiago: gli ultimi cento chilometri',
    famiglia: 'cristianesimo',
    country: 'Spagna', region: 'Galizia', continent: 'Europa',
    days: 5, transport: 'piedi',
    coords: { lat: 42.8805, lon: -8.5457 },
    stops: [
      { day: 1, place: 'Sarria', lat: 42.7811, lon: -7.4142, what: 'da qui i cento chilometri che danno diritto alla Compostela: si parte dal Camino Francés' },
      { day: 2, place: 'Portomarín', lat: 42.8072, lon: -7.6161, what: 'il paese spostato pietra su pietra quando la valle fu allagata: la chiesa fortezza fu smontata e rimontata' },
      { day: 3, place: 'Palas de Rei', lat: 42.8730, lon: -7.8690, what: 'tappa di bosco e frazioni, con le horreo di granito lungo la strada' },
      { day: 4, place: 'Melide', lat: 42.9142, lon: -8.0139, what: 'dove il Camino Francés incontra il Primitivo; è la capitale del polpo alla galiziana' },
      { day: 5, place: 'Cattedrale di Santiago de Compostela', lat: 42.8805, lon: -8.5457, what: 'il Pórtico da Gloria, l\'abbraccio all\'apostolo, il botafumeiro quando viene fatto volare' },
    ],
    accesso: 'La Compostela si ottiene con la credenziale timbrata almeno due volte al giorno negli ultimi cento chilometri. Gli ostelli (albergues) non si prenotano nella rete pubblica: si arriva e si trova posto, il che d\'estate significa partire presto. Il botafumeiro non vola tutti i giorni: si accende nelle grandi feste o se un gruppo lo fa offrire.',
    stagione: 'aprile-giugno e settembre-ottobre; luglio e agosto sono affollatissimi e caldi, l\'inverno in Galizia è pioggia vera',
    nota: 'non è una gara: la media è 20-25 km al giorno e chi ne fa 35 il primo giorno arriva zoppo al terzo',
  },
  {
    id: 'sr-fatima-lourdes',
    emoji: '🕯️',
    name: 'I grandi santuari mariani d\'Europa',
    famiglia: 'cristianesimo',
    country: 'Francia', region: 'Pirenei e Portogallo', continent: 'Europa',
    days: 4, transport: 'misto',
    coords: { lat: 43.0975, lon: -0.0553 },
    stops: [
      { day: 1, place: 'Grotta di Massabielle, Lourdes', lat: 43.0975, lon: -0.0553, what: 'la grotta delle apparizioni del 1858: la fonte, le piscine, il silenzio davanti alla roccia' },
      { day: 2, place: 'Processione aux flambeaux, Lourdes', lat: 43.0968, lon: -0.0562, what: 'ogni sera alle 21: migliaia di candele e l\'Ave Maria cantata in tutte le lingue dei presenti' },
      { day: 3, place: 'Santuario di Fátima', lat: 39.6317, lon: -8.6722, what: 'la Cappellina delle Apparizioni e la spianata che tiene mezzo milione di persone' },
      { day: 4, place: 'Monastero di Batalha', lat: 39.6594, lon: -8.8256, what: 'a mezz\'ora da Fátima: il gotico manuelino e le Cappelle Incompiute, patrimonio UNESCO' },
    ],
    accesso: 'A Lourdes le piscine hanno orari e file lunghe, e vanno prenotate il mattino stesso; il santuario è pensato per malati e disabili e la precedenza è loro, sempre. A Fátima le grandi date sono il 13 di ogni mese da maggio a ottobre: chi arriva senza prenotare l\'alloggio non trova posto in tutta la regione.',
    stagione: 'da aprile a ottobre; a Fátima il 13 maggio e il 13 ottobre sono i giorni delle grandi celebrazioni',
  },
  {
    id: 'sr-meteora-athos',
    emoji: '🏔️',
    name: 'Monasteri ortodossi: Meteora',
    famiglia: 'cristianesimo',
    country: 'Grecia', region: 'Tessaglia', continent: 'Europa',
    days: 2, transport: 'auto',
    coords: { lat: 39.7217, lon: 21.6306 },
    stops: [
      { day: 1, place: 'Grande Meteora (Metamorfosi)', lat: 39.7247, lon: 21.6322, what: 'il più grande e antico, sulla roccia più alta: il museo, la cucina affumicata, l\'ossario' },
      { day: 1, place: 'Monastero di Varlaam', lat: 39.7239, lon: 21.6289, what: 'la rete e l\'argano con cui salivano uomini e provviste prima delle scale' },
      { day: 2, place: 'Monastero di Rousanou', lat: 39.7192, lon: 21.6253, what: 'il più fotografato, in equilibrio su un pinnacolo stretto; oggi è femminile' },
      { day: 2, place: 'Monastero della Santissima Trinità', lat: 39.7150, lon: 21.6353, what: 'centoquaranta gradini scavati nella roccia, e la vista su Kalambaka' },
    ],
    accesso: 'Codice di abbigliamento rigido e applicato: gonna sotto il ginocchio per le donne (all\'ingresso le prestano), pantaloni lunghi per gli uomini, spalle coperte per tutti. Ogni monastero chiude un giorno diverso della settimana: senza controllare si arriva davanti a un cancello chiuso. Biglietto separato per ciascuno.',
    stagione: 'primavera e autunno; d\'estate la roccia riverbera e le scale sono dure a mezzogiorno',
    nota: 'il Monte Athos, l\'altro grande centro ortodosso, è vietato alle donne da mille anni e per gli uomini richiede il diamonitirion, un permesso da chiedere con mesi di anticipo: non è una gita e non entra in questo itinerario',
  },

  // ══════════════════════════════ ISLAM ══════════════════════════════
  {
    id: 'sr-istanbul-moschee',
    emoji: '🕌',
    name: 'Istanbul delle grandi moschee',
    famiglia: 'islam',
    country: 'Turchia', region: 'Istanbul', continent: 'Europa',
    days: 3, transport: 'piedi',
    coords: { lat: 41.0086, lon: 28.9802 },
    stops: [
      { day: 1, place: 'Santa Sofia (Ayasofya)', lat: 41.0086, lon: 28.9802, what: 'il luogo di culto più famoso del mondo: basilica per novecento anni, poi moschea, poi museo, di nuovo moschea dal 2020' },
      { day: 1, place: 'Moschea Blu (Sultanahmet)', lat: 41.0054, lon: 28.9768, what: 'i ventimila piastrelle di İznik che le danno il nome, e i sei minareti che fecero scandalo' },
      { day: 2, place: 'Moschea di Solimano (Süleymaniye)', lat: 41.0165, lon: 28.9639, what: 'il capolavoro di Sinan: la più armoniosa delle tre, con la vista sul Corno d\'Oro dal giardino' },
      { day: 2, place: 'Moschea di Rüstem Pascià', lat: 41.0175, lon: 28.9700, what: 'piccola e nascosta sopra il bazar: le ceramiche più belle di Istanbul, e quasi nessuno' },
      { day: 3, place: 'Moschea di Eyüp Sultan', lat: 41.0479, lon: 28.9339, what: 'il luogo più venerato della città dai musulmani turchi; qui si è fra fedeli e non fra turisti' },
      { day: 3, place: 'Moschea di Ortaköy', lat: 41.0473, lon: 29.0270, what: 'sul Bosforo sotto il ponte: la cartolina di Istanbul al tramonto' },
    ],
    accesso: 'Sono moschee in funzione, non musei: si tolgono le scarpe, le donne coprono i capelli (i foulard sono all\'ingresso, gratuiti), spalle e ginocchia coperte per tutti. Chiuse ai visitatori durante le cinque preghiere e soprattutto il venerdì a mezzogiorno, che è la preghiera comunitaria: si programma la giornata attorno a quello. Non si fotografa chi prega, non si cammina davanti a chi è in preghiera.',
    stagione: 'aprile-maggio e settembre-ottobre; durante il Ramadan le sere sono bellissime ma tutto si sposta dopo il tramonto',
  },
  {
    id: 'sr-andalusia-islamica',
    emoji: '🕌',
    name: 'Al-Andalus: l\'eredità islamica di Spagna',
    famiglia: 'islam',
    country: 'Spagna', region: 'Andalusia', continent: 'Europa',
    days: 4, transport: 'treno',
    coords: { lat: 37.8790, lon: -4.7794 },
    stops: [
      { day: 1, place: 'Mezquita-Catedral di Cordova', lat: 37.8790, lon: -4.7794, what: 'la foresta di ottocentocinquanta colonne e archi bicromi, con una cattedrale costruita dentro nel Cinquecento' },
      { day: 2, place: 'Medina Azahara', lat: 37.8863, lon: -4.8683, what: 'la città-palazzo califfale a otto chilometri da Cordova, distrutta dopo settant\'anni e riemersa dagli scavi' },
      { day: 3, place: 'Alhambra, Granada', lat: 37.1761, lon: -3.5881, what: 'i palazzi Nasridi, il Generalife, e le iscrizioni che coprono i muri come un tessuto' },
      { day: 4, place: 'Alcázar di Siviglia', lat: 37.3830, lon: -5.9903, what: 'mudéjar costruito da artigiani musulmani per re cristiani: la prova che le due culture lavoravano insieme' },
    ],
    accesso: 'L\'Alhambra si prenota con SETTIMANE di anticipo e il biglietto è nominale: si entra col documento, e l\'ingresso ai Palazzi Nasridi ha un orario stampato che non ammette ritardi. La Mezquita ha un\'ora al mattino a ingresso ridotto o gratuito nei giorni feriali. Nessuno di questi è oggi una moschea in funzione: il culto islamico nella Mezquita non è consentito.',
    stagione: 'marzo-maggio e ottobre; in Andalusia luglio e agosto superano regolarmente i 40 gradi',
  },
  {
    id: 'sr-samarcanda',
    emoji: '🕌',
    name: 'La via delle madrase: Samarcanda e Bukhara',
    famiglia: 'islam',
    country: 'Uzbekistan', region: 'Via della Seta', continent: 'Asia',
    days: 5, transport: 'treno',
    coords: { lat: 39.6547, lon: 66.9758 },
    stops: [
      { day: 1, place: 'Registan, Samarcanda', lat: 39.6547, lon: 66.9758, what: 'tre madrase attorno a una piazza: il monumento più fotografato dell\'Asia centrale, e di sera è illuminato' },
      { day: 2, place: 'Shah-i-Zinda', lat: 39.6631, lon: 66.9881, what: 'una via di mausolei rivestiti di maiolica, uno accanto all\'altro: il posto più bello di Samarcanda' },
      { day: 2, place: 'Moschea di Bibi-Khanym', lat: 39.6603, lon: 66.9800, what: 'costruita da Tamerlano troppo in fretta e troppo grande: crollò quasi subito, ed è imponente lo stesso' },
      { day: 3, place: 'Poi-Kalyan, Bukhara', lat: 39.7756, lon: 64.4142, what: 'il minareto del 1127 che Gengis Khan risparmiò, e la moschea che gli sta accanto' },
      { day: 4, place: 'Mausoleo dei Samanidi, Bukhara', lat: 39.7767, lon: 64.4053, what: 'mattoni intrecciati del X secolo: il più antico monumento islamico dell\'Asia centrale' },
      { day: 5, place: 'Ichan Kala, Khiva', lat: 41.3783, lon: 60.3639, what: 'la città murata intera, patrimonio UNESCO: ci si dorme dentro e la sera si svuota' },
    ],
    accesso: 'Quasi tutti questi luoghi sono monumenti e non moschee in funzione: si entra col biglietto e le regole sono quelle di un museo. Dove il culto è attivo (la moschea di Bolo Hauz a Bukhara) valgono scarpe tolte e capo coperto. Le distanze fra le tre città si fanno col treno veloce Afrosiyob, che si prenota con anticipo perché si riempie.',
    stagione: 'aprile-maggio e settembre-ottobre; d\'estate si superano i 40 gradi e d\'inverno si scende sotto zero',
  },

  // ════════════════════════════ BUDDISMO ════════════════════════════
  {
    id: 'sr-quattro-luoghi-buddha',
    emoji: '☸️',
    name: 'I quattro luoghi della vita del Buddha',
    famiglia: 'buddismo',
    country: 'India', region: 'Bihar, Uttar Pradesh e Nepal', continent: 'Asia',
    days: 7, transport: 'auto',
    coords: { lat: 24.6961, lon: 84.9911 },
    stops: [
      { day: 1, place: 'Lumbini, Nepal', lat: 27.4692, lon: 83.2758, what: 'dove nacque: il tempio di Maya Devi, la colonna di Ashoka del 249 a.C. e i monasteri costruiti da ogni paese buddista' },
      { day: 3, place: 'Tempio della Mahabodhi, Bodh Gaya', lat: 24.6961, lon: 84.9911, what: 'dove raggiunse l\'illuminazione: l\'albero della Bodhi discende da quello originale, ed è il luogo più sacro del buddismo' },
      { day: 5, place: 'Sarnath', lat: 25.3811, lon: 83.0244, what: 'dove tenne il primo discorso: lo stupa di Dhamek e il museo con il capitello dei leoni, simbolo dell\'India' },
      { day: 6, place: 'Kushinagar', lat: 26.7411, lon: 83.8886, what: 'dove morì: il Buddha sdraiato di sei metri nel Parinirvana Temple' },
      { day: 7, place: 'Varanasi', lat: 25.3176, lon: 83.0062, what: 'a dieci chilometri da Sarnath: i ghat sul Gange all\'alba, che sono induisti ma spiegano l\'India in cui il buddismo è nato' },
    ],
    accesso: 'Sono luoghi di preghiera vivi, non siti archeologici: si tolgono le scarpe nelle aree sacre, si gira attorno agli stupa in senso orario, non si dà mai le spalle a una statua del Buddha per una foto. A Bodh Gaya i pellegrini meditano per ore sotto l\'albero: si sta in silenzio e si passa lontano. Le distanze in Bihar sono lente: 150 km possono voler dire quattro ore.',
    stagione: 'ottobre-marzo; da aprile a giugno il caldo in pianura è insostenibile e il monsone arriva a luglio',
    nota: 'il Nepal è un paese diverso dall\'India: fra Lumbini e Bodh Gaya c\'è una frontiera, con visto e tempi da mettere in conto',
  },
  {
    id: 'sr-kumano-kodo',
    emoji: '⛩️',
    name: 'Kumano Kodo: i sentieri sacri del Kii',
    famiglia: 'buddismo',
    country: 'Giappone', region: 'Penisola di Kii', continent: 'Asia',
    days: 4, transport: 'piedi',
    coords: { lat: 33.8390, lon: 135.7736 },
    stops: [
      { day: 1, place: 'Takijiri-oji', lat: 33.7906, lon: 135.4956, what: 'la porta d\'ingresso ai monti sacri: da qui il sentiero entra nel bosco di cedri' },
      { day: 2, place: 'Kumano Hongu Taisha', lat: 33.8390, lon: 135.7736, what: 'il primo dei tre grandi santuari; poco lontano il torii più grande del mondo, sull\'isola di ghiaia dove stava prima dell\'alluvione' },
      { day: 3, place: 'Kumano Hayatama Taisha, Shingu', lat: 33.7333, lon: 135.9889, what: 'accanto alla foce del fiume: il vermiglio contro il verde, e l\'albero di nagi di mille anni' },
      { day: 4, place: 'Kumano Nachi Taisha e cascata di Nachi', lat: 33.6683, lon: 135.8903, what: 'la pagoda rossa con la cascata di 133 metri dietro: l\'immagine del Giappone sacro' },
    ],
    accesso: 'È uno dei due soli pellegrinaggi al mondo patrimonio UNESCO insieme a Santiago, e i due sono gemellati: chi completa entrambi riceve il doppio riconoscimento. I sentieri sono di montagna, con dislivelli veri: scarpe da trekking, non da città. Gli alloggi (minshuku e ryokan) vanno prenotati mesi prima perché sono pochi e piccoli. Nei santuari ci si inchina al torii, ci si lava mani e bocca alla fontana, si batte due volte le mani davanti al kami.',
    stagione: 'aprile-maggio e ottobre-novembre; giugno è la stagione delle piogge e i sentieri diventano fango',
    nota: 'Kumano è il luogo dove buddismo e shintoismo si sono mescolati per secoli: i tre santuari sono shintoisti ma il pellegrinaggio è nato buddista, e nessuno sul posto trova la cosa strana',
  },
  {
    id: 'sr-angkor',
    emoji: '🛕',
    name: 'Angkor: dal tempio induista al Buddha',
    famiglia: 'buddismo',
    country: 'Cambogia', region: 'Siem Reap', continent: 'Asia',
    days: 3, transport: 'misto',
    coords: { lat: 13.4125, lon: 103.8670 },
    stops: [
      { day: 1, place: 'Angkor Wat', lat: 13.4125, lon: 103.8670, what: 'il più grande monumento religioso del mondo: nato induista nel XII secolo, buddista da otto secoli' },
      { day: 1, place: 'Angkor Thom e Bayon', lat: 13.4413, lon: 103.8590, what: 'le duecento facce di pietra che sorridono da ogni torre' },
      { day: 2, place: 'Ta Prohm', lat: 13.4348, lon: 103.8892, what: 'il tempio lasciato agli alberi: le radici dei ficus che spaccano le pietre' },
      { day: 2, place: 'Banteay Srei', lat: 13.5987, lon: 103.9633, what: 'a 25 km: arenaria rosa scolpita come un merletto, il tempio più fine di tutti' },
      { day: 3, place: 'Preah Khan', lat: 13.4622, lon: 103.8725, what: 'grande e poco visitato: si cammina per corridoi crollati quasi da soli' },
    ],
    accesso: 'Il biglietto (Angkor Pass) si compra al centro visitatori, è nominale con foto, e va tenuto addosso: viene controllato a ogni tempio. Codice di abbigliamento applicato davvero: spalle e ginocchia coperte, altrimenti non si sale ai piani alti di Angkor Wat. L\'alba ad Angkor Wat significa arrivare alle 5, e ci sono migliaia di persone: il tramonto da un tempio minore è più bello e più solo.',
    stagione: 'novembre-febbraio, stagione secca e fresca; da marzo a maggio è torrido, da giugno a ottobre piove',
  },
  {
    id: 'sr-kyoto-templi',
    emoji: '🏯',
    name: 'Kyoto: i templi e i giardini',
    famiglia: 'buddismo',
    country: 'Giappone', region: 'Kansai', continent: 'Asia',
    days: 3, transport: 'piedi',
    coords: { lat: 34.9949, lon: 135.7850 },
    stops: [
      { day: 1, place: 'Kiyomizu-dera', lat: 34.9949, lon: 135.7850, what: 'la terrazza di legno su pali senza un chiodo, sospesa sul versante' },
      { day: 1, place: 'Fushimi Inari-taisha', lat: 34.9671, lon: 135.7727, what: 'le migliaia di torii vermigli che salgono sul monte: presto la mattina si è quasi soli' },
      { day: 2, place: 'Kinkaku-ji, il Padiglione d\'Oro', lat: 35.0394, lon: 135.7292, what: 'ricoperto di foglia d\'oro, riflesso nello stagno; ricostruito nel 1955 dopo un incendio doloso' },
      { day: 2, place: 'Ryoan-ji', lat: 35.0345, lon: 135.7182, what: 'quindici pietre su ghiaia rastrellata: da nessun punto si vedono tutte insieme' },
      { day: 3, place: 'Ginkaku-ji e il Sentiero del Filosofo', lat: 35.0270, lon: 135.7982, what: 'il Padiglione d\'Argento, mai argentato, e il canale fra i ciliegi' },
      { day: 3, place: 'Tenryu-ji e il bosco di bambù di Arashiyama', lat: 35.0159, lon: 135.6739, what: 'il giardino del XIV secolo intatto, e il bambuseto dietro' },
    ],
    accesso: 'Ogni tempio ha il suo biglietto e chiude presto, spesso alle 17. Scarpe tolte negli edifici, calze pulite (si nota). A Fushimi Inari il percorso completo sul monte è due-tre ore: la maggior parte arriva al primo belvedere e torna indietro. Nei giardini zen non si cammina sulla ghiaia rastrellata, mai.',
    stagione: 'fine marzo-inizio aprile per i ciliegi, novembre per gli aceri rossi; sono anche i due periodi in cui la città è più piena',
  },
  {
    id: 'sr-lhasa-potala',
    emoji: '🏔️',
    name: 'Lhasa e il buddismo tibetano',
    famiglia: 'buddismo',
    country: 'Cina', region: 'Tibet', continent: 'Asia',
    days: 4, transport: 'misto',
    coords: { lat: 29.6575, lon: 91.1170 },
    stops: [
      { day: 1, place: 'Tempio di Jokhang', lat: 29.6531, lon: 91.1311, what: 'il cuore spirituale del Tibet: attorno gira il Barkhor, il circuito dei pellegrini che si prostrano' },
      { day: 2, place: 'Palazzo del Potala', lat: 29.6575, lon: 91.1170, what: 'mille stanze sulla collina rossa, residenza dei Dalai Lama fino al 1959' },
      { day: 3, place: 'Monastero di Drepung', lat: 29.6764, lon: 91.0503, what: 'era il più grande monastero del mondo, con diecimila monaci' },
      { day: 4, place: 'Monastero di Sera', lat: 29.6939, lon: 91.1339, what: 'i dibattiti nel cortile del pomeriggio: i monaci discutono battendo le mani, ed è uno spettacolo vero' },
    ],
    accesso: 'PER IL TIBET SERVE UN PERMESSO SPECIALE oltre al visto cinese (Tibet Travel Permit), si ottiene solo tramite agenzia con un itinerario approvato, e il viaggio individuale non è consentito: questo va detto prima di ogni altra cosa. Il Potala ha un numero chiuso giornaliero e l\'orario d\'ingresso è assegnato. Lhasa è a 3.650 metri: i primi due giorni si va piano, il mal di montagna è reale. Non si fotografano i monaci senza chiedere, e all\'interno delle cappelle spesso è vietato.',
    stagione: 'aprile-ottobre; d\'inverno fa molto freddo e alcuni passi chiudono',
  },
  {
    id: 'sr-borobudur',
    emoji: '🛕',
    name: 'Giava sacra: Borobudur e Prambanan',
    famiglia: 'buddismo',
    country: 'Indonesia', region: 'Giava centrale', continent: 'Asia',
    days: 2, transport: 'auto',
    coords: { lat: -7.6079, lon: 110.2038 },
    stops: [
      { day: 1, place: 'Borobudur', lat: -7.6079, lon: 110.2038, what: 'il più grande tempio buddista del mondo: si sale girando in senso orario lungo 2.672 rilievi, come una lettura' },
      { day: 1, place: 'Mendut e Pawon', lat: -7.6047, lon: 110.2306, what: 'i due templi minori allineati con Borobudur: insieme formano un percorso unico' },
      { day: 2, place: 'Prambanan', lat: -7.7520, lon: 110.4915, what: 'il grande complesso induista del IX secolo, a mezz\'ora: le torri di Shiva, Vishnu e Brahma' },
      { day: 2, place: 'Kraton di Yogyakarta', lat: -7.8053, lon: 110.3642, what: 'il palazzo del sultano, dove l\'islam giavanese convive con le tradizioni precedenti' },
    ],
    accesso: 'A Borobudur dal 2023 la salita ai livelli superiori è contingentata: numero chiuso giornaliero, biglietto separato, scarpe fornite dal sito per proteggere la pietra, guida obbligatoria. Prenotare online con anticipo. L\'alba dall\'alto è un biglietto a parte e si esaurisce. Spalle e ginocchia coperte in entrambi i siti; il sarong è all\'ingresso.',
    stagione: 'aprile-ottobre, stagione secca; da novembre a marzo piove ogni pomeriggio',
  },

  // ════════════════════════════ INDUISMO ════════════════════════════
  {
    id: 'sr-varanasi-gange',
    emoji: '🪔',
    name: 'Varanasi e il Gange',
    famiglia: 'induismo',
    country: 'India', region: 'Uttar Pradesh', continent: 'Asia',
    days: 3, transport: 'piedi',
    coords: { lat: 25.3176, lon: 83.0062 },
    stops: [
      { day: 1, place: 'Dashashwamedh Ghat', lat: 25.3072, lon: 83.0104, what: 'l\'Aarti del fuoco al tramonto: i sacerdoti con le lampade, e le barche che si fermano a guardare' },
      { day: 2, place: 'Alba in barca sui ghat', lat: 25.3090, lon: 83.0130, what: 'l\'ora in cui la città si lava nel fiume: si parte al buio e si arriva alla luce' },
      { day: 2, place: 'Manikarnika Ghat', lat: 25.3110, lon: 83.0148, what: 'il ghat della cremazione, acceso da secoli senza interruzione' },
      { day: 3, place: 'Tempio di Kashi Vishwanath', lat: 25.3109, lon: 83.0107, what: 'uno dei dodici Jyotirlinga, il tempio più sacro di Shiva' },
      { day: 3, place: 'Sarnath', lat: 25.3811, lon: 83.0244, what: 'a dieci chilometri: dove il Buddha predicò per la prima volta' },
    ],
    accesso: 'A Manikarnika NON SI FOTOGRAFA: sono funerali di persone vere, e chi lo fa viene giustamente allontanato. Si guarda da lontano e in silenzio, senza guide che promettono "l\'accesso speciale" a pagamento (è una truffa nota). Nel tempio di Kashi Vishwanath i non induisti hanno accesso limitato e controlli di sicurezza stretti, telefoni e borse vietati. Scarpe tolte ovunque nei templi.',
    stagione: 'ottobre-marzo; il Dev Deepawali di novembre accende un milione di lampade sui ghat',
    nota: 'è la città più intensa dell\'India e va presa per quello che è: qui si viene a morire, non è un luogo pittoresco',
  },
  {
    id: 'sr-tamil-nadu-templi',
    emoji: '🛕',
    name: 'I grandi templi del Tamil Nadu',
    famiglia: 'induismo',
    country: 'India', region: 'Tamil Nadu', continent: 'Asia',
    days: 5, transport: 'auto',
    coords: { lat: 9.9195, lon: 78.1193 },
    stops: [
      { day: 1, place: 'Tempio di Meenakshi, Madurai', lat: 9.9195, lon: 78.1193, what: 'le quattordici torri coperte di migliaia di figure dipinte: il tempio vivo più impressionante dell\'India' },
      { day: 2, place: 'Tempio di Brihadeeswarar, Thanjavur', lat: 10.7828, lon: 79.1318, what: 'mille anni, granito, e una cupola da ottanta tonnellate issata senza gru: patrimonio UNESCO' },
      { day: 3, place: 'Tempio di Ranganathaswamy, Srirangam', lat: 10.8625, lon: 78.6900, what: 'il più grande complesso templare in funzione del mondo: sette cinte concentriche, e dentro ci vive una città' },
      { day: 4, place: 'Chidambaram Nataraja', lat: 11.3995, lon: 79.6936, what: 'il tempio della danza di Shiva, con il "segreto di Chidambaram" nella cella vuota' },
      { day: 5, place: 'Mahabalipuram', lat: 12.6167, lon: 80.1928, what: 'i templi scavati nella roccia sulla spiaggia, del VII secolo' },
    ],
    accesso: 'MOLTI TEMPLI DEL TAMIL NADU VIETANO L\'INGRESSO AL SANTUARIO INTERNO AI NON INDUISTI: nei cortili esterni si entra, nella cella no, e la regola è affissa. Va detto prima, non scoperto sul posto. Scarpe tolte all\'ingresso del recinto (il pavimento a mezzogiorno scotta: calzini). Uomini a torso coperto ma in alcuni templi si chiede di togliere la maglietta; donne con abito lungo. Telefoni e macchine fotografiche spesso vietati o a pagamento. I templi chiudono a metà giornata, di norma fra le 12 e le 16.',
    stagione: 'novembre-febbraio; il festival di Chithirai a Madurai (aprile-maggio) è straordinario ma con un milione di persone',
  },
  {
    id: 'sr-khajuraho-varanasi',
    emoji: '🛕',
    name: 'Khajuraho e i templi dell\'India centrale',
    famiglia: 'induismo',
    country: 'India', region: 'Madhya Pradesh', continent: 'Asia',
    days: 3, transport: 'auto',
    coords: { lat: 24.8318, lon: 79.9199 },
    stops: [
      { day: 1, place: 'Gruppo occidentale di Khajuraho', lat: 24.8518, lon: 79.9199, what: 'il Kandariya Mahadeva e gli altri: mille anni di sculture, e le famose scene erotiche che sono una parte piccola del tutto' },
      { day: 2, place: 'Gruppo orientale e templi giainisti', lat: 24.8480, lon: 79.9350, what: 'i templi giainisti di Parshvanath e Adinath, meno visitati e altrettanto fini' },
      { day: 3, place: 'Orchha', lat: 25.3520, lon: 78.6413, what: 'a tre ore: cenotafi lungo il fiume Betwa e il tempio di Ram Raja, l\'unico dove Rama è venerato come re' },
    ],
    accesso: 'Khajuraho è un sito archeologico con biglietto, non un tempio in funzione, tranne il Matangeshwar dove il culto continua e valgono le regole dei templi (scarpe tolte, rispetto). A Orchha il Ram Raja è vivo e molto frequentato dai pellegrini indiani.',
    stagione: 'ottobre-marzo; il festival di danza di febbraio si tiene davanti ai templi',
  },

  // ════════════════════════════ EBRAISMO ════════════════════════════
  {
    id: 'sr-praga-ebraica',
    emoji: '✡️',
    name: 'La Praga ebraica',
    famiglia: 'ebraismo',
    country: 'Repubblica Ceca', region: 'Praga', continent: 'Europa',
    days: 2, transport: 'piedi',
    coords: { lat: 50.0903, lon: 14.4180 },
    stops: [
      { day: 1, place: 'Sinagoga Vecchia-Nuova', lat: 50.0903, lon: 14.4180, what: 'la più antica sinagoga d\'Europa ancora in uso, del 1270; nella soffitta, secondo la leggenda, riposa il Golem' },
      { day: 1, place: 'Vecchio cimitero ebraico', lat: 50.0894, lon: 14.4172, what: 'dodici strati di sepolture in uno spazio minuscolo: dodicimila lapidi inclinate una sull\'altra' },
      { day: 2, place: 'Sinagoga Pinkas', lat: 50.0890, lon: 14.4166, what: 'i nomi dei 77.297 ebrei boemi e moravi uccisi nella Shoah, scritti a mano sui muri' },
      { day: 2, place: 'Sinagoga Spagnola', lat: 50.0906, lon: 14.4200, what: 'interni moreschi dorati, i più belli della città' },
    ],
    accesso: 'Il biglietto unico del Museo Ebraico copre quasi tutti i siti; la Sinagoga Vecchia-Nuova ha un biglietto separato perché è ancora in funzione. Chiuso il sabato (shabbat) e nelle feste ebraiche: è l\'errore più comune di chi organizza da solo. Kippah all\'ingresso per gli uomini.',
    stagione: 'tutto l\'anno; il cimitero d\'autunno con le foglie è memorabile',
  },
  {
    id: 'sr-sefarad',
    emoji: '✡️',
    name: 'Sefarad: la Spagna ebraica',
    famiglia: 'ebraismo',
    country: 'Spagna', region: 'Castiglia e Catalogna', continent: 'Europa',
    days: 4, transport: 'treno',
    coords: { lat: 39.8567, lon: -4.0286 },
    stops: [
      { day: 1, place: 'Sinagoga del Tránsito, Toledo', lat: 39.8567, lon: -4.0286, what: 'stucchi mudéjar e iscrizioni ebraiche sullo stesso muro; oggi Museo Sefardita' },
      { day: 1, place: 'Sinagoga di Santa María la Blanca, Toledo', lat: 39.8574, lon: -4.0299, what: 'archi a ferro di cavallo bianchi: costruita da architetti musulmani per una comunità ebraica in un regno cristiano' },
      { day: 2, place: 'Call di Girona', lat: 41.9871, lon: 2.8253, what: 'uno dei quartieri ebraici medievali meglio conservati d\'Europa, e il Museo di Storia degli Ebrei' },
      { day: 3, place: 'Sinagoga di Cordova', lat: 37.8792, lon: -4.7842, what: 'una delle tre sinagoghe medievali sopravvissute in Spagna, piccola e intatta' },
      { day: 4, place: 'Call di Barcellona', lat: 41.3827, lon: 2.1745, what: 'la Sinagoga Major, forse la più antica d\'Europa, ritrovata negli anni Novanta' },
    ],
    accesso: 'Sono quasi tutti musei: nessuna di queste è oggi una sinagoga in funzione, dopo l\'espulsione del 1492. Orari da museo, spesso chiusi il lunedì. La Rete delle Città Sefardite (Red de Juderías) tiene un calendario comune degli eventi.',
    stagione: 'primavera e autunno; a settembre molte città fanno la Giornata Europea della Cultura Ebraica',
  },

  // ═════════════════════════ SHINTOISMO ═════════════════════════════
  {
    id: 'sr-ise-izumo',
    emoji: '⛩️',
    name: 'I grandi santuari shintoisti',
    famiglia: 'shintoismo',
    country: 'Giappone', region: 'Mie e Shimane', continent: 'Asia',
    days: 4, transport: 'treno',
    coords: { lat: 34.4550, lon: 136.7256 },
    stops: [
      { day: 1, place: 'Ise Jingu, Naiku', lat: 34.4550, lon: 136.7256, what: 'il santuario più sacro dello Shinto, dedicato ad Amaterasu: viene ricostruito identico ogni vent\'anni, da 1.300 anni' },
      { day: 1, place: 'Ise Jingu, Geku', lat: 34.4873, lon: 136.7043, what: 'il santuario esterno: la tradizione vuole che si visiti prima di quello interno' },
      { day: 2, place: 'Meoto Iwa, le rocce sposate', lat: 34.5122, lon: 136.7869, what: 'due scogli legati da una corda sacra: all\'alba d\'estate il sole sorge fra i due' },
      { day: 3, place: 'Izumo Taisha', lat: 35.4020, lon: 132.6856, what: 'il santuario del matrimonio, dove a ottobre si riuniscono tutte le divinità del Giappone; qui si battono le mani quattro volte, non due' },
      { day: 4, place: 'Santuario di Itsukushima, Miyajima', lat: 34.2959, lon: 132.3197, what: 'il torii nell\'acqua: con l\'alta marea sembra galleggiare, con la bassa ci si cammina sotto' },
    ],
    accesso: 'A Ise il santuario interno non si fotografa oltre i gradini e gli edifici principali non sono visibili: si viene per il bosco, il fiume e il gesto, non per vedere. Alla fontana (temizuya) si lavano prima la mano sinistra, poi la destra, poi la bocca. Davanti al kami: inchino, due battiti di mani, preghiera, inchino — a Izumo i battiti sono quattro. Non si cammina al centro del vialetto sotto il torii: quello è il passaggio della divinità.',
    stagione: 'tutto l\'anno; a Izumo il mese di ottobre è il Kamiarizuki, "il mese in cui gli dei ci sono"',
  },

  // ═════════════════════════ SIKHISMO ═══════════════════════════════
  {
    id: 'sr-amritsar',
    emoji: '🪯',
    name: 'Amritsar e il Tempio d\'Oro',
    famiglia: 'sikhismo',
    country: 'India', region: 'Punjab', continent: 'Asia',
    days: 2, transport: 'piedi',
    coords: { lat: 31.6200, lon: 74.8765 },
    stops: [
      { day: 1, place: 'Harmandir Sahib, il Tempio d\'Oro', lat: 31.6200, lon: 74.8765, what: 'il santuario sikh più importante, al centro della vasca sacra: aperto a chiunque, di qualsiasi fede' },
      { day: 1, place: 'Langar del Tempio d\'Oro', lat: 31.6197, lon: 74.8760, what: 'la cucina comunitaria che sfama centomila persone al giorno, gratis, tutti seduti sullo stesso pavimento' },
      { day: 2, place: 'Jallianwala Bagh', lat: 31.6206, lon: 74.8802, what: 'il giardino del massacro del 1919, a due passi: i muri hanno ancora i fori dei proiettili' },
      { day: 2, place: 'Cerimonia di Wagah', lat: 31.6047, lon: 74.5733, what: 'al confine con il Pakistan, l\'ammaina bandiera coreografato di ogni tramonto' },
    ],
    accesso: 'Il Tempio d\'Oro accoglie tutti senza distinzione di religione, ed è una delle sue ragioni d\'essere. Obbligatori: capo coperto (i foulard sono all\'ingresso, gratuiti), scarpe lasciate al deposito, piedi lavati nella vasca del passaggio, niente alcol né tabacco addosso. Il langar si può mangiare e si può servire: è normale che un visitatore dia una mano a lavare i piatti. Non si fotografa dentro il santuario centrale.',
    stagione: 'ottobre-marzo; di notte il tempio illuminato riflesso nell\'acqua è il momento migliore',
  },

  // ════════════════════════ INTERRELIGIOSO ══════════════════════════
  {
    id: 'sr-gerusalemme-tre-fedi',
    emoji: '🕊️',
    name: 'Gerusalemme delle tre fedi',
    famiglia: 'interreligioso',
    country: 'Israele', region: 'Città Vecchia', continent: 'Asia',
    days: 3, transport: 'piedi',
    coords: { lat: 31.7767, lon: 35.2345 },
    stops: [
      { day: 1, place: 'Muro Occidentale', lat: 31.7767, lon: 35.2345, what: 'quel che resta del recinto del Secondo Tempio: il luogo di preghiera più importante dell\'ebraismo' },
      { day: 1, place: 'Quartiere ebraico e Cardo', lat: 31.7750, lon: 35.2320, what: 'la strada romana ritrovata sotto il livello attuale, e le sinagoghe ricostruite dopo il 1967' },
      { day: 2, place: 'Cupola della Roccia, Haram al-Sharif', lat: 31.7780, lon: 35.2354, what: 'la cupola dorata sopra la roccia da cui, per l\'islam, Maometto salì al cielo' },
      { day: 2, place: 'Moschea al-Aqsa', lat: 31.7761, lon: 35.2358, what: 'il terzo luogo santo dell\'islam, sulla stessa spianata' },
      { day: 3, place: 'Basilica del Santo Sepolcro', lat: 31.7784, lon: 35.2296, what: 'crocifissione e sepoltura sotto lo stesso tetto, diviso fra sei confessioni cristiane' },
      { day: 3, place: 'Quartiere armeno', lat: 31.7745, lon: 35.2285, what: 'il più piccolo e silenzioso dei quattro, con la cattedrale di San Giacomo' },
    ],
    accesso: 'LA SPIANATA (Monte del Tempio / Haram al-Sharif) ha orari brevissimi per i non musulmani, poche ore al mattino nei giorni feriali, e chiude senza preavviso; l\'ingresso agli interni della Cupola della Roccia e di al-Aqsa è riservato ai musulmani. Al Muro Occidentale spianata divisa per uomini e donne, capo coperto per gli uomini. Al Santo Sepolcro spalle e ginocchia coperte. Il venerdì è il giorno della preghiera musulmana, il sabato lo shabbat ebraico, la domenica le funzioni cristiane: nessun giorno della settimana è "normale" per tutti e tre, e va tenuto conto nel programma. VERIFICARE la situazione di sicurezza aggiornata: gli accessi cambiano.',
    stagione: 'primavera e autunno; nelle grandi feste delle tre religioni la città è piena e tesa',
    nota: 'è un itinerario che chiede rispetto prima che curiosità: si entra in luoghi dove le persone pregano davvero, e in una città dove la religione è anche politica',
  },
  // ═══════════════ AMERICHE, AFRICA, OCEANIA ═══════════════════════
  // Il primo giro di catalogo era tutto fra Europa e Asia, e per un
  // verticale che si chiama mondiale è un difetto grosso: il santuario più
  // visitato del pianeta è a Città del Messico, le chiese scavate nella
  // roccia di Lalibela sono in Etiopia, e il luogo sacro più famoso
  // dell'Oceania è una montagna a cui è vietato salire.
  {
    id: 'sr-guadalupe',
    emoji: '🌹',
    name: 'Guadalupe e il Messico sacro',
    famiglia: 'cristianesimo',
    country: 'Messico', region: 'Città del Messico', continent: 'Nord America',
    days: 3, transport: 'misto',
    coords: { lat: 19.4847, lon: -99.1177 },
    stops: [
      { day: 1, place: 'Basilica di Nostra Signora di Guadalupe', lat: 19.4847, lon: -99.1177, what: 'il santuario cattolico più visitato al mondo: venti milioni di pellegrini l\'anno, e il tapis roulant sotto la tilma perché la fila non si fermi mai' },
      { day: 1, place: 'Colle del Tepeyac', lat: 19.4869, lon: -99.1169, what: 'dove secondo la tradizione avvennero le apparizioni del 1531; dall\'alto si vede la città intera' },
      { day: 2, place: 'Cattedrale metropolitana, Zócalo', lat: 19.4341, lon: -99.1331, what: 'la più grande cattedrale delle Americhe, costruita sopra il recinto sacro azteco e che sprofonda lentamente nel suolo' },
      { day: 2, place: 'Templo Mayor', lat: 19.4344, lon: -99.1314, what: 'accanto alla cattedrale: il tempio azteco riemerso nel 1978 mentre si scavava per l\'elettricità' },
      { day: 3, place: 'Teotihuacán', lat: 19.6925, lon: -98.8438, what: 'a un\'ora: la Piramide del Sole e la Via dei Morti, sacre da prima degli aztechi, che le trovarono già antiche' },
      { day: 3, place: 'Santuario di Nostra Signora dei Rimedi, Cholula', lat: 19.0575, lon: -98.3022, what: 'la chiesa sulla cima della piramide più grande del mondo per volume: la sovrapposizione delle due religioni in un\'immagine sola' },
    ],
    accesso: 'La basilica di Guadalupe è gratuita e aperta a tutti; il 12 dicembre arrivano milioni di persone e la città si blocca — meraviglioso da vedere, impossibile da visitare con calma. A Teotihuacán dal 2021 NON si sale più sulle piramidi: si cammina attorno, e chi promette il contrario mente. Città del Messico è a 2.240 metri: il primo giorno si va piano.',
    stagione: 'tutto l\'anno; l\'11-12 dicembre è la grande festa, marzo-maggio è la stagione secca',
  },
  {
    id: 'sr-lalibela',
    emoji: '⛪',
    name: 'Lalibela: le chiese scavate nella roccia',
    famiglia: 'cristianesimo',
    country: 'Etiopia', region: 'Amhara', continent: 'Africa',
    days: 3, transport: 'piedi',
    coords: { lat: 12.0317, lon: 39.0417 },
    stops: [
      { day: 1, place: 'Bete Medhane Alem', lat: 12.0322, lon: 39.0433, what: 'la più grande chiesa monolitica del mondo: non costruita ma SCAVATA dall\'alto in un unico blocco di roccia' },
      { day: 1, place: 'Bete Maryam', lat: 12.0319, lon: 39.0430, what: 'la più venerata, con gli affreschi e la colonna avvolta nei teli che secondo la tradizione porta scritto il segreto del mondo' },
      { day: 2, place: 'Bete Giyorgis', lat: 12.0308, lon: 39.0413, what: 'la croce greca scavata dodici metri sotto il livello del suolo: l\'immagine simbolo dell\'Etiopia cristiana' },
      { day: 3, place: 'Monastero di Asheton Maryam', lat: 12.0417, lon: 39.0583, what: 'a 3.150 metri sopra Lalibela: due ore di salita a piedi o a dorso di mulo, e la vista sull\'altopiano' },
    ],
    accesso: 'Biglietto unico per tutte le chiese, valido più giorni, e la guida locale è di fatto obbligatoria (i passaggi fra le chiese sono tunnel bui). Scarpe tolte all\'ingresso di ogni chiesa: si cammina su tappeti, e conviene avere calzini. Sono chiese ORTODOSSE ETIOPI in funzione, con funzioni all\'alba che sono la ragione principale per venire. Uomini e donne pregano in aree separate. VERIFICARE la situazione di sicurezza nella regione dell\'Amhara prima di programmare: è cambiata più volte negli ultimi anni.',
    stagione: 'ottobre-marzo; il Natale ortodosso (Genna, 7 gennaio) e il Timkat (19 gennaio) sono le due grandi feste',
    nota: 'la tradizione le attribuisce al re Lalibela nel XII secolo, che avrebbe voluto una "nuova Gerusalemme" quando i pellegrinaggi in Terra Santa divennero impossibili',
  },
  {
    id: 'sr-cairo-tre-fedi',
    emoji: '🕌',
    name: 'Il Cairo delle tre fedi',
    famiglia: 'interreligioso',
    country: 'Egitto', region: 'Il Cairo', continent: 'Africa',
    days: 3, transport: 'misto',
    coords: { lat: 30.0459, lon: 31.2625 },
    stops: [
      { day: 1, place: 'Moschea-università di al-Azhar', lat: 30.0459, lon: 31.2625, what: 'fondata nel 970: la più antica università in funzione del mondo islamico sunnita' },
      { day: 1, place: 'Moschea di Ibn Tulun', lat: 30.0289, lon: 31.2494, what: 'la più antica del Cairo nella sua forma originale, con il minareto a spirale e il cortile enorme e vuoto' },
      { day: 2, place: 'Moschea-madrasa del Sultano Hassan', lat: 30.0322, lon: 31.2560, what: 'architettura mamelucca al suo massimo: le pareti alte che tagliano il rumore della città' },
      { day: 2, place: 'Cittadella e moschea di Muhammad Ali', lat: 30.0287, lon: 31.2599, what: 'la moschea di alabastro sulla collina, e la vista sul Cairo fino alle piramidi nelle giornate limpide' },
      { day: 3, place: 'Chiesa Sospesa (al-Muallaqa)', lat: 30.0053, lon: 31.2300, what: 'copta, costruita sopra una torre romana: il pavimento di vetro mostra il vuoto sotto la navata' },
      { day: 3, place: 'Sinagoga Ben Ezra', lat: 30.0058, lon: 31.2311, what: 'nel Cairo copto: qui fu trovata la Genizah, trecentomila documenti che hanno riscritto la storia del Mediterraneo medievale' },
    ],
    accesso: 'Nelle moschee: scarpe tolte, capo coperto per le donne, spalle e ginocchia coperte per tutti; chiuse ai visitatori il venerdì a mezzogiorno. Ad al-Azhar l\'accesso dei non musulmani è limitato ad alcune aree. Nel Cairo copto i controlli di sicurezza sono stretti e le borse vengono aperte. Le mance (baksheesh) sono la norma per i custodi che aprono le porte: piccoli tagli, sempre.',
    stagione: 'novembre-marzo; d\'estate il Cairo supera i 38 gradi e le moschee di pietra sono l\'unico refrigerio',
  },
  {
    id: 'sr-kairouan',
    emoji: '🕌',
    name: 'Kairouan, la quarta città santa dell\'islam',
    famiglia: 'islam',
    country: 'Tunisia', region: 'Kairouan', continent: 'Africa',
    days: 2, transport: 'auto',
    coords: { lat: 35.6814, lon: 10.1036 },
    stops: [
      { day: 1, place: 'Grande Moschea di Kairouan', lat: 35.6814, lon: 10.1036, what: 'fondata nel 670: il modello da cui discendono le moschee del Maghreb e di al-Andalus' },
      { day: 1, place: 'Bacini degli Aghlabidi', lat: 35.6847, lon: 10.0983, what: 'le cisterne circolari del IX secolo che davano acqua alla città nel deserto' },
      { day: 2, place: 'Zaouia di Sidi Sahab', lat: 35.6842, lon: 10.0919, what: 'la "moschea del barbiere", tutta piastrelle e stucchi, attorno alla tomba di un compagno del Profeta' },
      { day: 2, place: 'Medina di Kairouan', lat: 35.6781, lon: 10.0964, what: 'le mura, i souk dei tappeti annodati a mano, e la calma di una città che vive di pellegrinaggio' },
    ],
    accesso: 'Nella Grande Moschea i non musulmani possono entrare nel CORTILE ma non nella sala di preghiera, e la regola è chiara all\'ingresso. Biglietto unico per i monumenti della città, si compra in un punto solo. Spalle e ginocchia coperte, e per le donne capo coperto nelle zaouia. Chiusura ai visitatori durante le preghiere e il venerdì.',
    stagione: 'marzo-maggio e ottobre-novembre; il Mouled (nascita del Profeta) riempie la città',
  },
  {
    id: 'sr-mecca-medina',
    emoji: '🕋',
    name: 'Hajj e Umrah: la Mecca e Medina',
    famiglia: 'islam',
    country: 'Arabia Saudita', region: 'Hijaz', continent: 'Asia',
    days: 5, transport: 'misto',
    coords: { lat: 21.4225, lon: 39.8262 },
    stops: [
      { day: 1, place: 'Masjid al-Haram e la Kaaba', lat: 21.4225, lon: 39.8262, what: 'la moschea più grande del mondo attorno alla Kaaba: il tawaf, i sette giri in senso antiorario' },
      { day: 2, place: 'Safa e Marwa', lat: 21.4231, lon: 39.8267, what: 'il sa\'i, i sette percorsi fra le due collline oggi dentro la moschea, in memoria della ricerca dell\'acqua di Hagar' },
      { day: 3, place: 'Monte Arafat', lat: 21.3550, lon: 39.9842, what: 'il giorno di Arafat è il cuore dell\'Hajj: senza quella sosta il pellegrinaggio non è valido' },
      { day: 4, place: 'Mina e Muzdalifah', lat: 21.4133, lon: 39.8933, what: 'la lapidazione delle stele e la notte all\'aperto: le tappe che scandiscono i giorni dell\'Hajj' },
      { day: 5, place: 'Moschea del Profeta, Medina', lat: 24.4672, lon: 39.6111, what: 'la seconda moschea più sacra: sotto la cupola verde c\'è la tomba di Maometto' },
    ],
    accesso: 'DA DIRE PRIMA DI OGNI ALTRA COSA: LA MECCA È VIETATA AI NON MUSULMANI PER LEGGE, e la città è chiusa da posti di blocco che lo verificano. A Medina il divieto vale per l\'area della moschea del Profeta. Questo non è un itinerario turistico e non va presentato come tale: è la descrizione di un pellegrinaggio a cui si partecipa solo essendo musulmani. L\'Hajj richiede un visto specifico a quota nazionale, si prenota con largo anticipo tramite operatori autorizzati, e ha date fissate dal calendario lunare; l\'Umrah si può fare quasi tutto l\'anno con visto turistico o dedicato. Chi legge e non è musulmano lo legga per capire, non per programmare.',
    stagione: 'l\'Hajj cade nel mese di Dhu al-Hijja e si sposta di circa 11 giorni l\'anno sul calendario nostro; l\'Umrah tutto l\'anno tranne i giorni dell\'Hajj',
    nota: 'è il più grande raduno religioso annuale del mondo insieme al Kumbh Mela indù: due milioni di persone nello stesso luogo negli stessi giorni',
  },
  {
    id: 'sr-konya-rumi',
    emoji: '🕌',
    name: 'Konya e i dervisci di Rumi',
    famiglia: 'islam',
    country: 'Turchia', region: 'Anatolia centrale', continent: 'Asia',
    days: 2, transport: 'treno',
    coords: { lat: 37.8709, lon: 32.5044 },
    stops: [
      { day: 1, place: 'Mausoleo di Mevlana', lat: 37.8709, lon: 32.5044, what: 'la tomba di Rumi sotto la cupola turchese: il poeta persiano più letto al mondo, e il luogo più visitato della Turchia interna' },
      { day: 1, place: 'Moschea di Alaeddin', lat: 37.8735, lon: 32.4931, what: 'selgiuchide, sulla collina al centro della città, con le tombe dei sultani' },
      { day: 2, place: 'Madrasa Karatay', lat: 37.8745, lon: 32.4925, what: 'la cupola di piastrelle blu con le stelle: oggi museo delle ceramiche selgiuchidi' },
      { day: 2, place: 'Cerimonia dei dervisci rotanti (Sema)', lat: 37.8709, lon: 32.5044, what: 'il sema non è uno spettacolo ma un rito: la rotazione è preghiera, e va guardata in silenzio' },
    ],
    accesso: 'Al mausoleo si entra a piedi scalzi o con copriscarpe forniti; è tomba e luogo di preghiera insieme, e molti visitatori pregano. Il sema autentico si tiene il sabato sera al Centro Culturale Mevlana ed è GRATUITO: le versioni a pagamento nei ristoranti sono spettacoli per turisti, e vale la pena dirlo. La settimana del 7-17 dicembre (Şeb-i Arus, l\'anniversario della morte di Rumi) è la più intensa e la città si riempie.',
    stagione: 'aprile-giugno e settembre-ottobre; dicembre per lo Şeb-i Arus, ma con freddo vero sull\'altopiano',
  },
  {
    id: 'sr-armenia-cristiana',
    emoji: '✝️',
    name: 'Armenia: il primo Stato cristiano',
    famiglia: 'cristianesimo',
    country: 'Armenia', region: 'Ararat e Kotayk', continent: 'Asia',
    days: 3, transport: 'auto',
    coords: { lat: 40.1622, lon: 44.2914 },
    stops: [
      { day: 1, place: 'Cattedrale di Etchmiadzin', lat: 40.1622, lon: 44.2914, what: 'fondata nel 301: la più antica cattedrale del mondo, sede del catholicos di tutti gli armeni' },
      { day: 1, place: 'Rovine di Zvartnots', lat: 40.1608, lon: 44.3364, what: 'la chiesa circolare del VII secolo crollata in un terremoto: restano i colonnati e la pianta' },
      { day: 2, place: 'Monastero di Geghard', lat: 40.1408, lon: 44.8181, what: 'metà costruito e metà scavato nella roccia: le cappelle interne hanno un\'acustica che i canti sfruttano' },
      { day: 2, place: 'Tempio di Garni', lat: 40.1122, lon: 44.7300, what: 'a pochi chilometri: l\'unico tempio greco-romano rimasto in tutta la regione, pre-cristiano' },
      { day: 3, place: 'Monastero di Khor Virap', lat: 39.8781, lon: 44.5772, what: 'la fossa dove fu imprigionato Gregorio l\'Illuminatore, e l\'Ararat che riempie l\'orizzonte' },
    ],
    accesso: 'Ingresso libero in quasi tutte le chiese armene; a Garni si paga perché è sito archeologico. Le donne non devono coprirsi il capo in chiesa armena, a differenza dell\'ortodossia greca e russa: è una differenza che vale la pena spiegare. A Khor Virap la fossa si scende con una scala a pioli verticale, stretta e non per tutti.',
    stagione: 'maggio-ottobre; l\'Ararat si vede limpido soprattutto la mattina presto e in autunno',
  },
  {
    id: 'sr-koyasan',
    emoji: '🏯',
    name: 'Koyasan: dormire in un monastero',
    famiglia: 'buddismo',
    country: 'Giappone', region: 'Wakayama', continent: 'Asia',
    days: 2, transport: 'treno',
    coords: { lat: 34.2131, lon: 135.5844 },
    stops: [
      { day: 1, place: 'Danjo Garan', lat: 34.2131, lon: 135.5844, what: 'il complesso centrale fondato da Kukai nell\'816: la pagoda Konpon Daito, vermiglia contro i cedri' },
      { day: 1, place: 'Kongobu-ji', lat: 34.2144, lon: 135.5847, what: 'il tempio principale, con il giardino di rocce più grande del Giappone e le porte scorrevoli dipinte' },
      { day: 2, place: 'Okunoin', lat: 34.2181, lon: 135.5947, what: 'due chilometri di cimitero nella foresta di cedri, duecentomila tombe, fino al mausoleo di Kukai dove secondo la tradizione medita ancora' },
      { day: 2, place: 'Okunoin di notte', lat: 34.2181, lon: 135.5947, what: 'le lanterne accese fra le tombe: è il momento in cui Koyasan diventa un altro posto' },
    ],
    accesso: 'Si dorme nei templi (shukubo): futon sul tatami, bagno comune, cena vegetariana shojin ryori senza carne né pesce, e la preghiera del mattino alle 6 a cui si è invitati e non obbligati. Si prenota MESI prima. All\'Okunoin, oltre l\'ultimo ponte, è vietato fotografare: è l\'area più sacra. Si arriva in funicolare da Gokurakubashi, e l\'ultima corsa serale è presto.',
    stagione: 'aprile-novembre; d\'inverno nevica e a 800 metri fa molto freddo, ma i templi imbiancati valgono il viaggio',
  },
  {
    id: 'sr-bangkok-templi',
    emoji: '🛕',
    name: 'Bangkok dei grandi wat',
    famiglia: 'buddismo',
    country: 'Thailandia', region: 'Bangkok', continent: 'Asia',
    days: 2, transport: 'barca',
    coords: { lat: 13.7515, lon: 100.4927 },
    stops: [
      { day: 1, place: 'Wat Phra Kaew e Grand Palace', lat: 13.7515, lon: 100.4927, what: 'il Buddha di Smeraldo, alto appena 66 cm e il più venerato del paese: il re gli cambia l\'abito tre volte l\'anno' },
      { day: 1, place: 'Wat Pho', lat: 13.7466, lon: 100.4927, what: 'il Buddha sdraiato di 46 metri, e la scuola di massaggio thai più antica del paese' },
      { day: 2, place: 'Wat Arun', lat: 13.7437, lon: 100.4889, what: 'il prang di porcellana sul fiume: si attraversa in barca per pochi baht ed è il modo giusto di arrivarci' },
      { day: 2, place: 'Wat Saket, il Monte d\'Oro', lat: 13.7539, lon: 100.5064, what: '344 gradini a spirale fino al chedi dorato, e la vista su tutta Bangkok' },
    ],
    accesso: 'Al Grand Palace il codice di abbigliamento è il più severo della Thailandia e viene applicato all\'ingresso: niente spalle scoperte, niente pantaloni sopra il ginocchio, niente vestiti trasparenti; il noleggio all\'ingresso c\'è ma con fila. Scarpe tolte in ogni sala di preghiera. NON si punta MAI la pianta dei piedi verso un\'immagine del Buddha (seduti, si tengono i piedi indietro), e non ci si fotografa in posa accanto alle statue: in Thailandia è un reato oltre che una mancanza. Attenzione alla truffa classica dei tuk-tuk: "il tempio oggi è chiuso, vi porto io altrove" è sempre falsa.',
    stagione: 'novembre-febbraio, la stagione fresca e secca',
  },
  {
    id: 'sr-uluru',
    emoji: '🪨',
    name: 'Uluru: il sacro degli Anangu',
    famiglia: 'interreligioso',
    country: 'Australia', region: 'Territorio del Nord', continent: 'Oceania',
    days: 2, transport: 'auto',
    coords: { lat: -25.3444, lon: 131.0369 },
    stops: [
      { day: 1, place: 'Base Walk di Uluru', lat: -25.3444, lon: 131.0369, what: 'i dieci chilometri attorno alla roccia: da vicino si vedono le grotte, le pitture e le sorgenti che da lontano non esistono' },
      { day: 1, place: 'Centro culturale Anangu', lat: -25.3500, lon: 131.0300, what: 'dove gli Anangu spiegano il Tjukurpa, la legge che lega storie, luoghi e comportamenti: si comincia da qui, non dalla roccia' },
      { day: 2, place: 'Kata Tjuta, Valle dei Venti', lat: -25.3000, lon: 130.7333, what: 'le 36 cupole a cinquanta chilometri, altrettanto sacre e molto meno visitate' },
      { day: 2, place: 'Tramonto su Uluru', lat: -25.3450, lon: 131.0200, what: 'dalle piazzole dedicate: la roccia cambia colore per venti minuti e poi si spegne di colpo' },
    ],
    accesso: 'NON SI SALE SU ULURU: la salita è VIETATA dal 26 ottobre 2019, per volontà degli Anangu che lo chiedevano da decenni. Chi propone il contrario riporta informazioni vecchie. Alcune sezioni della roccia NON si fotografano: sono siti sacri di genere, riservati agli uomini o alle donne, e i cartelli lo indicano — vanno rispettati, la richiesta viene dai proprietari tradizionali del luogo. Il parco è di proprietà Anangu, dato in gestione congiunta: il biglietto è di tre giorni. D\'estate si superano i 45 gradi e i sentieri chiudono alle 11 del mattino.',
    stagione: 'maggio-settembre, l\'inverno australiano; da dicembre a febbraio il caldo è pericoloso',
    nota: 'non è "religione" nel senso delle grandi confessioni ma è un luogo sacro vivo, ed è il modo in cui va raccontato: la cultura Anangu è continua da decine di migliaia di anni',
  },
  {
    id: 'sr-aparecida-rio',
    emoji: '🌹',
    name: 'Il Brasile devoto: Aparecida e il Cristo',
    famiglia: 'cristianesimo',
    country: 'Brasile', region: 'San Paolo e Rio', continent: 'Sud America',
    days: 3, transport: 'auto',
    coords: { lat: -22.8465, lon: -45.2276 },
    stops: [
      { day: 1, place: 'Basilica di Nostra Signora Aparecida', lat: -22.8465, lon: -45.2276, what: 'la più grande basilica mariana del mondo: 45.000 persone dentro, e dodici milioni di pellegrini l\'anno' },
      { day: 2, place: 'Cristo Redentore, Rio de Janeiro', lat: -22.9519, lon: -43.2105, what: 'trenta metri sul Corcovado: statua religiosa e simbolo di un paese nello stesso gesto' },
      { day: 2, place: 'Cattedrale metropolitana di Rio', lat: -22.9107, lon: -43.1804, what: 'il cono di cemento da 75 metri con quattro vetrate dal pavimento al soffitto: brutalismo che funziona' },
      { day: 3, place: 'Mosteiro de São Bento, Rio', lat: -22.8967, lon: -43.1783, what: 'l\'interno barocco più dorato del Brasile, e la messa cantata in gregoriano della domenica mattina' },
    ],
    accesso: 'Aparecida è gratuita; il 12 ottobre, festa nazionale, arrivano centinaia di migliaia di persone. Al Cristo Redentore si sale col trenino del Corcovado o con i van autorizzati, e il biglietto si prende online con fascia oraria: senza, si rischia di non salire. Nel santuario e in cattedrale spalle e ginocchia coperte. A Rio, come ovunque, non si esibiscono macchine fotografiche e telefoni fuori dalle aree turistiche.',
    stagione: 'aprile-ottobre, l\'inverno brasiliano, più asciutto e fresco',
  },
  {
    id: 'sr-cusco-sacro',
    emoji: '🏔️',
    name: 'Cusco e la Valle Sacra degli Inca',
    famiglia: 'interreligioso',
    country: 'Perù', region: 'Cusco', continent: 'Sud America',
    days: 4, transport: 'misto',
    coords: { lat: -13.5203, lon: -71.9754 },
    stops: [
      { day: 1, place: 'Qorikancha', lat: -13.5203, lon: -71.9754, what: 'il tempio del Sole inca con sopra il convento di Santo Domingo: le mura incaiche hanno retto i terremoti che hanno buttato giù quelle spagnole' },
      { day: 2, place: 'Sacsayhuamán', lat: -13.5089, lon: -71.9819, what: 'i blocchi da duecento tonnellate incastrati senza malta, sopra la città' },
      { day: 3, place: 'Ollantaytambo', lat: -13.2586, lon: -72.2650, what: 'il tempio del Sole con i sei monoliti di porfido rosa, e il paese ancora abitato sulla pianta inca' },
      { day: 4, place: 'Machu Picchu', lat: -13.1631, lon: -72.5450, what: 'l\'Intihuatana, la Pietra del Sole, e il Tempio delle Tre Finestre: un santuario oltre che una città' },
    ],
    accesso: 'Machu Picchu ha NUMERO CHIUSO giornaliero con circuiti fissi e fascia oraria: si prenota con settimane o mesi di anticipo, e il biglietto non si compra sul posto. Il treno da Ollantaytambo va prenotato a parte. Cusco è a 3.400 metri: due giorni di acclimatamento prima di qualsiasi camminata, e il mal di montagna non guarda l\'allenamento. La foglia di coca in infuso è la tradizione locale contro il soroche.',
    stagione: 'aprile-ottobre, stagione secca; a febbraio il Cammino Inca chiude per manutenzione',
    nota: 'per gli andini queste non sono rovine ma huacas, luoghi vivi: le offerte alla Pachamama si fanno ancora, e non sono folklore per turisti',
  },
  {
    id: 'sr-haifa-bahai',
    emoji: '🌿',
    name: 'Haifa: i giardini bahai',
    famiglia: 'interreligioso',
    country: 'Israele', region: 'Haifa', continent: 'Asia',
    days: 1, transport: 'piedi',
    coords: { lat: 32.8144, lon: 34.9866 },
    stops: [
      { day: 1, place: 'Terrazze bahai e Santuario del Bab', lat: 32.8144, lon: 34.9866, what: 'diciannove terrazze lungo il monte Carmelo fino alla cupola dorata: patrimonio UNESCO, e il centro mondiale della fede bahai' },
      { day: 1, place: 'Colonia tedesca', lat: 32.8189, lon: 34.9944, what: 'ai piedi delle terrazze: la via dei Templari tedeschi dell\'Ottocento, oggi ristoranti e caffè' },
      { day: 1, place: 'Monastero di Stella Maris', lat: 32.8267, lon: 34.9711, what: 'sul Carmelo, la casa madre dei carmelitani, sopra la grotta di Elia venerata da ebrei, cristiani e musulmani' },
    ],
    accesso: 'I giardini bahai sono GRATUITI ma si visitano solo con la visita guidata a orari fissi, in inglese o ebraico, e la discesa completa delle terrazze non è sempre aperta; il santuario del Bab ha orari ristretti al mattino. Silenzio richiesto in tutta l\'area, abbigliamento coperto. Chiuso nelle festività bahai.',
    stagione: 'tutto l\'anno; la fioritura primaverile sulle terrazze è il momento migliore',
  },
  {
    id: 'sr-assisi',
    emoji: '⛪',
    name: 'Assisi e la valle di Francesco',
    famiglia: 'cristianesimo',
    country: 'Italia', region: 'Umbria', continent: 'Europa',
    days: 2, transport: 'piedi',
    coords: { lat: 43.0748, lon: 12.6055 },
    stops: [
      { day: 1, place: 'Basilica di San Francesco', lat: 43.0748, lon: 12.6055, what: 'le due chiese sovrapposte e il ciclo di Giotto: ventotto scene che hanno cambiato la pittura europea' },
      { day: 1, place: 'Basilica di Santa Chiara', lat: 43.0700, lon: 12.6169, what: 'il crocifisso di San Damiano che secondo la tradizione parlò a Francesco' },
      { day: 2, place: 'Eremo delle Carceri', lat: 43.0664, lon: 12.6353, what: 'a quattro chilometri nel bosco sul Subasio: le grotte dove Francesco si ritirava, e il silenzio che è il motivo per salirci' },
      { day: 2, place: 'Santa Maria degli Angeli e la Porziuncola', lat: 43.0583, lon: 12.5772, what: 'la cappelletta dove tutto cominciò, inglobata dentro una basilica enorme' },
    ],
    accesso: 'Ingresso libero nelle basiliche; nella basilica superiore NON si fotografa (gli affreschi di Giotto sono fragili e la regola è fatta rispettare). Spalle e ginocchia coperte. All\'Eremo delle Carceri si sale a piedi in un\'ora dal centro o in auto con parcheggio limitato; è un luogo di silenzio, e i gruppi rumorosi vengono fermati.',
    stagione: 'primavera e autunno; il 3-4 ottobre, festa di san Francesco, Assisi è piena',
  },
  {
    id: 'sr-mont-saint-michel',
    emoji: '⛪',
    name: 'Mont-Saint-Michel e le maree',
    famiglia: 'cristianesimo',
    country: 'Francia', region: 'Normandia', continent: 'Europa',
    days: 2, transport: 'piedi',
    coords: { lat: 48.6360, lon: -1.5115 },
    stops: [
      { day: 1, place: 'Abbazia di Mont-Saint-Michel', lat: 48.6360, lon: -1.5115, what: 'la Merveille gotica costruita su una roccia in mezzo alla baia: si sale per la Grande Rue e le scale' },
      { day: 1, place: 'Chiostro e refettorio', lat: 48.6362, lon: -1.5112, what: 'il chiostro sospeso sul vuoto con le colonnine sfalsate, e la luce del refettorio che entra da fessure invisibili' },
      { day: 2, place: 'Traversata della baia', lat: 48.6200, lon: -1.5100, what: 'a piedi scalzi sulle sabbie con la guida: l\'unico modo di capire perché il monte è dov\'è' },
      { day: 2, place: 'Grande marea', lat: 48.6360, lon: -1.5115, what: 'poche volte l\'anno il mare circonda il monte per intero: le date sono pubblicate con anni di anticipo' },
    ],
    accesso: 'LA TRAVERSATA DELLA BAIA SI FA SOLO CON GUIDA AUTORIZZATA: le sabbie mobili e la marea che risale più veloce di un uomo che cammina hanno ucciso persone, e non è un modo di dire. L\'abbazia ha biglietto e chiude presto in inverno; le visite serali estive con musica sono un\'esperienza diversa. Il monte si raggiunge con navetta gratuita dal parcheggio, che è a 2,5 km. È il sito più visitato di Francia fuori Parigi: luglio e agosto sono una fila continua sulla Grande Rue.',
    stagione: 'aprile-giugno e settembre-ottobre; le grandi maree sono attorno agli equinozi',
  },
  {
    id: 'sr-czestochowa',
    emoji: '🕯️',
    name: 'Jasna Góra e la Polonia mariana',
    famiglia: 'cristianesimo',
    country: 'Polonia', region: 'Slesia', continent: 'Europa',
    days: 2, transport: 'treno',
    coords: { lat: 50.8129, lon: 19.0966 },
    stops: [
      { day: 1, place: 'Monastero di Jasna Góra, Częstochowa', lat: 50.8129, lon: 19.0966, what: 'la Madonna Nera, l\'icona più venerata della Polonia: il velo si apre con le fanfare e la gente si inginocchia' },
      { day: 1, place: 'Bastioni e Via Crucis del monastero', lat: 50.8125, lon: 19.0955, what: 'le fortificazioni che ressero l\'assedio svedese del 1655, evento fondativo dell\'identità polacca' },
      { day: 2, place: 'Miniera di sale di Wieliczka, cappella di Santa Kinga', lat: 49.9831, lon: 20.0544, what: 'a due ore: una cattedrale intera scavata nel salgemma a 101 metri sotto terra, lampadari di sale compresi' },
    ],
    accesso: 'Jasna Góra è gratuita e aperta a tutti; l\'icona si scopre a orari fissi più volte al giorno e quello è il momento da non perdere. Il 15 agosto e il 26 agosto arrivano pellegrinaggi a piedi da tutta la Polonia e la città si riempie. A Wieliczka si scende solo con visita guidata prenotata: 800 gradini in discesa, ascensore in risalita, 14 gradi costanti tutto l\'anno.',
    stagione: 'maggio-settembre; agosto è il mese dei grandi pellegrinaggi a piedi',
  },
  // ═══════ I BUCHI CHIUSI DOPO LA RICERCA DEL 22/08/2026 ═══════════
  // Interrogando Wikidata per i luoghi CLASSIFICATI come meta di
  // pellegrinaggio (Q15135589 e sottoclassi), ordinati per numero di
  // edizioni Wikipedia, sono usciti nomi che il primo catalogo non aveva e
  // che stanno davanti a molti che aveva: Pushkar (56 lingue), Wieskirche
  // (45), Bom Jesus do Monte (28), Mariazell (28), la Casa della Vergine a
  // Efeso (36), il Pilar di Saragozza (39). E mancavano del tutto tre fedi:
  // il sufismo, il giainismo, lo zoroastrismo.
  {
    id: 'sr-ajmer-sufi',
    emoji: '🕌',
    name: 'Ajmer e l\'India sufi',
    famiglia: 'islam',
    country: 'India', region: 'Rajasthan', continent: 'Asia',
    days: 3, transport: 'auto',
    coords: { lat: 26.4570, lon: 74.6280 },
    stops: [
      { day: 1, place: 'Dargah Sharif di Ajmer', lat: 26.4570, lon: 74.6280, what: 'la tomba di Moinuddin Chishti, il santo sufi più venerato del subcontinente: ci vengono musulmani, indù e sikh insieme' },
      { day: 2, place: 'Adhai Din Ka Jhonpra', lat: 26.4553, lon: 74.6244, what: 'la moschea del XII secolo costruita con le colonne di templi precedenti, a pochi passi dalla dargah' },
      { day: 2, place: 'Lago Ana Sagar', lat: 26.4700, lon: 74.6200, what: 'i padiglioni di marmo di Shah Jahan sulla riva, per il tramonto' },
      { day: 3, place: 'Tempio di Brahma, Pushkar', lat: 26.4870, lon: 74.5510, what: 'a mezz\'ora: uno dei pochissimi templi al mondo dedicati a Brahma, sul lago sacro con i 52 ghat' },
    ],
    accesso: 'Alla dargah si entra a piedi scalzi e col capo coperto — uomini e donne — e i copricapo si comprano all\'ingresso per pochi rupie. È un luogo di devozione intensa e affollato: si tiene tutto addosso e si va con poco. I qawwali, i canti sufi, si tengono la sera nel cortile ed è il momento per cui vale la pena esserci. A Pushkar l\'area del lago è vegetariana e alcolica zero per legge, e le scarpe si tolgono anche sui ghat. Attenzione alla truffa del "puja obbligatorio" con richiesta di donazione: nessuna cerimonia è obbligatoria.',
    stagione: 'ottobre-marzo; l\'Urs di Ajmer (anniversario della morte del santo, data lunare) porta centinaia di migliaia di pellegrini, e la fiera dei cammelli di Pushkar è a novembre',
    nota: 'il sufismo è la dimensione mistica dell\'islam, e in India è anche il punto in cui le religioni si incontrano invece di dividersi: alla dargah la fila è mista, ed è la cosa più notevole del posto',
  },
  {
    id: 'sr-palitana',
    emoji: '🛕',
    name: 'Palitana: la collina dei 863 templi',
    famiglia: 'giainismo',
    country: 'India', region: 'Gujarat', continent: 'Asia',
    days: 2, transport: 'piedi',
    coords: { lat: 21.4859, lon: 71.9047 },
    stops: [
      { day: 1, place: 'Colle di Shatrunjaya, Palitana', lat: 21.4859, lon: 71.9047, what: 'la salita di 3.800 gradini fino a 863 templi di marmo sulla cima: il luogo più sacro del giainismo' },
      { day: 1, place: 'Tempio di Adinatha', lat: 21.4853, lon: 71.9042, what: 'il principale, dedicato al primo tirthankara: marmo bianco intagliato fino all\'ultimo centimetro' },
      { day: 2, place: 'Templi di Girnar, Junagadh', lat: 21.5219, lon: 70.5017, what: 'a tre ore: altri 10.000 gradini su un monte sacro a giainisti e indù insieme' },
    ],
    accesso: 'REGOLE MOLTO STRETTE, e vanno dette prima: sulla collina NON si può dormire (nemmeno i monaci), i templi chiudono al tramonto e tutti devono scendere. VIETATO portare cibo, pelle (cinture, borse, scarpe di cuoio) e oggetti di pelle di qualsiasi tipo. Si sale a piedi — chi non ce la fa può farsi portare in doli, una portantina — e sono 3.800 gradini, due-tre ore in salita: si parte all\'alba per il caldo. Palitana è la prima città al mondo legalmente vegetariana: la carne è vietata per ordinanza. Nei templi non si fotografa.',
    stagione: 'novembre-febbraio; da metà giugno a metà novembre i templi chiudono per il monsone (chaturmas)',
  },
  {
    id: 'sr-yazd-zoroastriana',
    emoji: '🔥',
    name: 'Yazd e il fuoco degli zoroastriani',
    famiglia: 'zoroastrismo',
    country: 'Iran', region: 'Yazd', continent: 'Asia',
    days: 2, transport: 'piedi',
    coords: { lat: 31.8900, lon: 54.3670 },
    stops: [
      { day: 1, place: 'Atash Behram di Yazd', lat: 31.8900, lon: 54.3670, what: 'il tempio del fuoco: la fiamma dietro il vetro arde secondo la tradizione dal 470 d.C., senza mai essersi spenta' },
      { day: 1, place: 'Torri del Silenzio (Dakhma)', lat: 31.8500, lon: 54.3550, what: 'le due torri dove i corpi venivano esposti agli avvoltoi per non contaminare terra, acqua e fuoco; in disuso dagli anni Settanta' },
      { day: 2, place: 'Città vecchia di Yazd', lat: 31.8974, lon: 54.3569, what: 'patrimonio UNESCO: i badgir, le torri del vento che rinfrescano le case da secoli senza elettricità' },
      { day: 2, place: 'Moschea del Venerdì di Yazd', lat: 31.8983, lon: 54.3675, what: 'i minareti più alti dell\'Iran e il portale di piastrelle blu: la città è anche una delle capitali dell\'islam sciita' },
    ],
    accesso: 'Nel tempio del fuoco i non zoroastriani vedono la fiamma attraverso il vetro ma NON entrano nella camera del fuoco: la regola è assoluta e non ammette eccezioni. Sulle Torri del Silenzio si sale liberamente, ma sono un cimitero: si sta in silenzio. In Iran il codice di abbigliamento è di legge, non di cortesia: capelli coperti per le donne ovunque, braccia e gambe coperte per tutti. Verificare la situazione dei visti e delle raccomandazioni di viaggio, che cambiano.',
    stagione: 'marzo-maggio e ottobre-novembre; d\'estate Yazd è nel deserto e supera i 40 gradi',
    nota: 'lo zoroastrismo è una delle religioni più antiche ancora praticate e conta poche decine di migliaia di fedeli fra Iran e India: Yazd è la sua capitale spirituale',
  },
  {
    id: 'sr-braga-bom-jesus',
    emoji: '⛪',
    name: 'Braga e il Bom Jesus do Monte',
    famiglia: 'cristianesimo',
    country: 'Portogallo', region: 'Minho', continent: 'Europa',
    days: 2, transport: 'piedi',
    coords: { lat: 41.5547, lon: -8.3773 },
    stops: [
      { day: 1, place: 'Bom Jesus do Monte', lat: 41.5547, lon: -8.3773, what: 'la scalinata barocca a zig-zag con le fontane dei cinque sensi: patrimonio UNESCO, e i devoti la salgono in ginocchio' },
      { day: 1, place: 'Funicolare ad acqua del Bom Jesus', lat: 41.5539, lon: -8.3800, what: 'del 1882, la più antica al mondo ancora in funzione a contrappeso d\'acqua' },
      { day: 2, place: 'Cattedrale di Braga', lat: 41.5503, lon: -8.4278, what: 'la più antica del Portogallo, sede primaziale: il coro con i due organi barocchi gemelli' },
      { day: 2, place: 'Santuario del Sameiro', lat: 41.5453, lon: -8.3844, what: 'a poca distanza dal Bom Jesus: il secondo santuario mariano del paese dopo Fátima' },
    ],
    accesso: 'Ingresso libero; si sale a piedi per la scalinata (577 gradini), in funicolare o in auto fino in cima. La Semana Santa di Braga è la più solenne del Portogallo e la città si riempie.',
    stagione: 'aprile-ottobre; la Settimana Santa è il momento più intenso',
  },
  {
    id: 'sr-efeso-maria',
    emoji: '⛪',
    name: 'Efeso e la Casa della Vergine',
    famiglia: 'cristianesimo',
    country: 'Turchia', region: 'Egeo', continent: 'Asia',
    days: 2, transport: 'auto',
    coords: { lat: 37.9122, lon: 27.3339 },
    stops: [
      { day: 1, place: 'Casa della Vergine Maria (Meryem Ana)', lat: 37.9122, lon: 27.3339, what: 'la casetta sul monte Bülbül dove secondo la tradizione Maria visse gli ultimi anni: venerata da cristiani E musulmani' },
      { day: 1, place: 'Basilica di San Giovanni, Selçuk', lat: 37.9497, lon: 27.3686, what: 'sulla tomba dell\'evangelista, con la vista sulla fortezza' },
      { day: 2, place: 'Efeso, la Biblioteca di Celso', lat: 37.9395, lon: 27.3417, what: 'la città romana dove Paolo predicò e dove si tenne il Concilio del 431 che proclamò Maria Theotokos' },
      { day: 2, place: 'Tempio di Artemide', lat: 37.9497, lon: 27.3639, what: 'una colonna sola in mezzo a un campo: era una delle sette meraviglie del mondo antico' },
    ],
    accesso: 'La Casa della Vergine ha ingresso a pagamento e silenzio richiesto: è luogo di preghiera per due religioni, e i musulmani ci vengono a pregare Meryem Ana come i cristiani. Il muro dei desideri all\'esterno è tradizione popolare, non rito. A Efeso ci vogliono tre ore buone, non c\'è quasi ombra e d\'estate si va all\'apertura.',
    stagione: 'aprile-giugno e settembre-ottobre; il 15 agosto si celebra l\'Assunzione alla Casa della Vergine',
  },
  {
    id: 'sr-alpi-barocche',
    emoji: '⛪',
    name: 'Santuari barocchi delle Alpi: Wies e Mariazell',
    famiglia: 'cristianesimo',
    country: 'Germania', region: 'Baviera e Stiria', continent: 'Europa',
    days: 3, transport: 'auto',
    coords: { lat: 47.6810, lon: 10.9010 },
    stops: [
      { day: 1, place: 'Wieskirche', lat: 47.6810, lon: 10.9010, what: 'rococò bavarese in mezzo a un prato: patrimonio UNESCO, nata dalle lacrime di una statua nel 1738' },
      { day: 1, place: 'Abbazia di Ettal', lat: 47.5697, lon: 11.0947, what: 'a un\'ora: cupola affrescata e distilleria dei monaci ancora in funzione' },
      { day: 2, place: 'Basilica di Mariazell', lat: 47.7736, lon: 15.3186, what: 'il santuario mariano più importante dell\'Austria e dell\'Europa centrale, meta di ungheresi, cechi e croati da secoli' },
      { day: 3, place: 'Abbazia di Melk', lat: 48.2281, lon: 15.3336, what: 'sul Danubio: la biblioteca barocca e la sala di marmo, e la vista sulla Wachau' },
    ],
    accesso: 'Ingresso libero alla Wieskirche, che però chiude ai visitatori durante le funzioni ed è piccola: nelle ore centrali d\'estate c\'è coda. A Mariazell il santuario è aperto tutto il giorno; la Mariazellerbahn, il trenino a scartamento ridotto da St. Pölten, è un modo bellissimo di arrivarci. Melk ha biglietto e visita guidata.',
    stagione: 'maggio-ottobre; a Mariazell l\'8 settembre e il 15 agosto sono le grandi feste',
  },
  {
    id: 'sr-zaragoza-pilar',
    emoji: '🕯️',
    name: 'Saragozza e la Vergine del Pilar',
    famiglia: 'cristianesimo',
    country: 'Spagna', region: 'Aragona', continent: 'Europa',
    days: 2, transport: 'piedi',
    coords: { lat: 41.6564, lon: -0.8781 },
    stops: [
      { day: 1, place: 'Basilica del Pilar', lat: 41.6564, lon: -0.8781, what: 'la colonna su cui secondo la tradizione apparve la Vergine a Giacomo nel 40 d.C.: la prima apparizione mariana della cristianità' },
      { day: 1, place: 'Cupole del Pilar affrescate da Goya', lat: 41.6566, lon: -0.8785, what: 'due cupole dipinte dal giovane Goya, che era aragonese: si guardano col binocolo o dalla torre' },
      { day: 2, place: 'Cattedrale del Salvador (La Seo)', lat: 41.6556, lon: -0.8758, what: 'a duecento metri: mudéjar, gotico e barocco nello stesso edificio, e il muro esterno di piastrelle' },
      { day: 2, place: 'Palazzo dell\'Aljafería', lat: 41.6564, lon: -0.8964, what: 'il palazzo islamico dell\'XI secolo, il più importante fuori dall\'Andalusia' },
    ],
    accesso: 'Ingresso libero alla basilica; la torre panoramica e il museo si pagano. Spalle e ginocchia coperte. Le Fiestas del Pilar attorno al 12 ottobre sono la festa più grande della Spagna settentrionale: l\'offerta floreale del 12 mattina è impressionante, ma la città è invivibile per chi vuole visitare con calma.',
    stagione: 'primavera e autunno; il 12 ottobre per la festa, sapendo cosa si sceglie',
  },
  {
    id: 'sr-sicilia-arabo-normanna',
    emoji: '🕊️',
    name: 'Sicilia arabo-normanna: tre culture, un\'architettura',
    famiglia: 'interreligioso',
    country: 'Italia', region: 'Sicilia', continent: 'Europa',
    days: 3, transport: 'auto',
    coords: { lat: 38.1113, lon: 13.3542 },
    stops: [
      { day: 1, place: 'Cappella Palatina, Palermo', lat: 38.1113, lon: 13.3542, what: 'mosaici bizantini, soffitto a muqarnas islamico, pianta latina: le tre culture nella stessa stanza' },
      { day: 1, place: 'San Giovanni degli Eremiti', lat: 38.1106, lon: 13.3520, what: 'le cinque cupole rosse e il chiostro: la cartolina della Palermo normanna' },
      { day: 2, place: 'Duomo di Monreale', lat: 38.0817, lon: 13.2919, what: 'seimila metri quadrati di mosaici d\'oro e il chiostro con duecentoventotto colonne tutte diverse' },
      { day: 3, place: 'Duomo di Cefalù', lat: 38.0392, lon: 14.0228, what: 'il Cristo Pantocratore dell\'abside, il più antico dei tre e per molti il più bello' },
    ],
    accesso: 'Il percorso arabo-normanno è patrimonio UNESCO dal 2015 e ha un biglietto cumulativo. La Cappella Palatina chiude quando ci sono cerimonie ufficiali a Palazzo dei Normanni, che è sede dell\'assemblea regionale: controllare il giorno. A Monreale il chiostro ha biglietto separato dal duomo.',
    stagione: 'aprile-giugno e settembre-ottobre',
  },
];

/** Il blocco di contesto che entra nel prompt del generatore. */
export function percorsoSacroContext(r: PercorsoSacro): string {
  const tappe = r.stops.map((s) =>
    `  giorno ${s.day} — ${s.place} (${s.lat}, ${s.lon}): ${s.what}`).join('\n');
  return [
    `PERCORSO REALE: ${r.name} — ${r.region}, ${r.country}. ${r.days} giorni, ci si muove ${
      r.transport === 'piedi' ? 'a piedi' : r.transport === 'auto' ? 'in auto' :
      r.transport === 'treno' ? 'in treno' : r.transport === 'barca' ? 'in barca' :
      r.transport === 'navetta' ? 'con navette' : 'con mezzi diversi'
    }.`,
    'TAPPE DEL PERCORSO (usa QUESTE, nell\'ordine, con queste coordinate: sono verificate):',
    tappe,
    `ACCESSO E REGOLE — vanno dette all'utente, non riassunte: ${r.accesso}`,
    r.stagione ? `QUANDO ANDARCI: ${r.stagione}` : '',
    r.nota ? `DA SAPERE: ${r.nota}` : '',
  ].filter(Boolean).join('\n');
}

/** I percorsi di una famiglia religiosa. */
export function percorsiPerFamiglia(f: FamigliaReligiosa): PercorsoSacro[] {
  return PERCORSI_SACRI.filter((r) => r.famiglia === f);
}

/** Le famiglie presenti nel catalogo, con quanti percorsi ciascuna. */
export function famiglieDisponibili(): Array<{ famiglia: FamigliaReligiosa; quanti: number }> {
  const m = new Map<FamigliaReligiosa, number>();
  for (const r of PERCORSI_SACRI) m.set(r.famiglia, (m.get(r.famiglia) || 0) + 1);
  return [...m].map(([famiglia, quanti]) => ({ famiglia, quanti }))
    .sort((a, b) => b.quanti - a.quanti);
}
