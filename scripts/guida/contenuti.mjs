// Contenuti del centro guida /guida (italiano). Ogni affermazione è stata verificata nel codice il 15/11/2026
// (inventario in WIP_GUIDE_IMPLEMENTATION_REPORT.md). Dove una funzione NON esiste c'è un blocco `manca`.
// Per aggiungere una pagina: aggiungi un oggetto a PAGINE e lancia `node scripts/guida/build.mjs`.
// I numeri (`stat`) vengono da public/guida/numeri.json (scratch/guida-numeri.mjs): senza il file la pagina non li mostra.

export const STORE = {
  ios: 'https://apps.apple.com/app/apple-store/id6806769883?pt=129382959&ct=sito&mt=8',
  android: 'https://play.google.com/store/apps/details?id=com.itaintasca.app',
  web: 'https://wip.guide/',
};

export const MACRO = [
  { id: 'mangiare', nome: 'Mangiare e bere', emoji: '🍽️', pagina: 'ristoranti-gastronomia', testo: 'Locali, senza glutine, stellati Michelin, cantine, strade e botteghe del gusto.', stat: ['locali', 'locali_senza_glutine', 'locali_michelin', 'cantine'] },
  { id: 'natura', nome: 'Natura e sport', emoji: '🌿', pagina: 'natura-percorsi', testo: 'Sentieri, ciclovie, laghi, cascate, vette, grotte, parchi e aree protette.', stat: ['natura'] },
  { id: 'mare', nome: 'Mare', emoji: '🏖️', pagina: 'mare-spiagge', testo: 'Spiagge e baie, temperatura del mare, onde e qualità dell\'acqua (Europa).', stat: ['spiagge'] },
  { id: 'meteo', nome: 'Meteo e neve', emoji: '❄️', pagina: 'meteo-neve', testo: 'Meteo sulla mappa, neve e piste, UV, clima mese per mese.', stat: [] },
  { id: 'cultura', nome: 'Cultura', emoji: '🏛️', pagina: 'musei-cultura', testo: 'Musei, monumenti, chiese, castelli, siti archeologici e guide opera per opera.', stat: ['musei', 'monumenti', 'chiese', 'castelli', 'archeologia', 'guide_musei_it'] },
  { id: 'audio', nome: 'Audioguide', emoji: '🎧', pagina: 'audioguide', testo: 'Racconti che partono da soli quando arrivi, in 7 lingue e con due voci.', stat: ['audioguide', 'gemme'] },
  { id: 'viaggi', nome: 'Viaggi e itinerari', emoji: '🧭', pagina: 'itinerari', testo: 'Itinerari generati, libreria di itinerari pronti, guide d\'autore e navigatore.', stat: [] },
  { id: 'eventi', nome: 'Eventi', emoji: '🎪', pagina: 'eventi', testo: 'Eventi, mostre, mercatini, concerti, fioriture e cieli stellati.', stat: [] },
  { id: 'servizi', nome: 'Servizi utili', emoji: '🛠️', pagina: 'servizi-utili', testo: 'Farmacie, ospedali, fontanelle, stazioni, taxi, ricarica EV e altro.', stat: ['servizi'] },
  { id: 'famiglie', nome: 'Famiglie', emoji: '🛝', pagina: 'servizi-utili', testo: 'Parchi giochi, parchi divertimento, acquari e zoo.', stat: ['famiglie'] },
];

export const ETICHETTE_STAT = {
  luoghi_totale: 'luoghi sulla mappa', gemme: 'gemme (luoghi da non perdere)', musei: 'musei e gallerie', monumenti: 'monumenti, piazze e fontane',
  chiese: 'chiese e luoghi di culto', castelli: 'castelli e fortificazioni', archeologia: 'siti archeologici', panorami: 'punti panoramici',
  natura: 'luoghi di natura', spiagge: 'spiagge e baie', cantine: 'cantine e luoghi del vino', terme: 'terme e sorgenti', mercati: 'mercati',
  street_art: 'opere di street art', cinema: 'location di film e serie', famiglie: 'luoghi per famiglie', servizi: 'servizi utili',
  locali: 'locali (ristoranti, bar, pizzerie…)', locali_senza_glutine: 'locali con tag senza glutine', locali_vegetariani: 'locali con tag vegetariano',
  locali_vegani: 'locali con tag vegano', locali_michelin: 'locali con distinzione Michelin', guide_musei_it: 'guide museo in italiano',
  audioguide: 'audioguide già pronte', piante_musei: 'piante di musei con pin',
};

// Obiettivi per «Cosa vuoi fare oggi?» e per «Chiedi a WIP come fare» (ricerca deterministica su parole e sinonimi).
export const OBIETTIVI = [
  { t: 'Voglio mangiare senza glutine', p: 'ristoranti-senza-glutine', k: 'senza glutine celiaco celiachia gluten free gluten-free celiaci glutine' },
  { t: 'Voglio un ristorante stellato', p: 'ristoranti-stellati', k: 'stellato stelle michelin gourmet stellati bib' },
  { t: 'Voglio un percorso a piedi o in bicicletta', p: 'sentieri-e-ciclovie', k: 'sentiero sentieri trekking escursione ciclovia ciclabile bici bicicletta mountain bike mtb cammino camminare percorso piste ciclabili' },
  { t: 'Voglio visitare un museo', p: 'musei-cultura', k: 'museo musei galleria opere quadri mostra visita museo pinacoteca' },
  { t: 'Voglio ascoltare un\'audioguida', p: 'audioguide', k: 'audioguida audioguide ascoltare guida audio voce racconto nicky dante' },
  { t: 'Voglio organizzare una giornata al mare', p: 'mare-spiagge', k: 'mare spiaggia spiagge temperatura acqua onde balneazione costa baia' },
  { t: 'Voglio sapere com\'è il mare', p: 'mare-spiagge', k: 'temperatura mare acqua onde qualità acqua balneazione' },
  { t: 'Voglio conoscere la neve e le piste', p: 'meteo-neve', k: 'neve piste sci impianti sciistici rifugi montagna innevamento' },
  { t: 'Voglio il meteo', p: 'meteo-neve', k: 'meteo previsioni pioggia temperatura sole uv clima quando andare' },
  { t: 'Voglio un itinerario già pronto', p: 'libreria-itinerari-gratuiti', k: 'itinerario pronto libreria gratis gratuito già pronto itinerari' },
  { t: 'Voglio creare un itinerario', p: 'itinerari', k: 'creare itinerario generare programma viaggio giorni pianificare organizzare' },
  { t: 'Voglio fare un tour con amici o un gruppo', p: 'tour-di-gruppo', k: 'gruppo tour live amici classe scuola leader pin insieme follower' },
  { t: 'Voglio usare il navigatore', p: 'navigatore', k: 'navigatore navigare indicazioni svolta voce wipnav giro tappe raggiungere' },
  { t: 'Voglio trovare eventi vicino a me', p: 'eventi', k: 'eventi concerti sagre mostre mercatini festival gratis date vicino' },
  { t: 'Voglio trovare farmacie, fontanelle, servizi', p: 'servizi-utili', k: 'farmacia ospedale fontanella bagni stazione taxi ricarica colonnina servizi utilità parcheggio' },
  { t: 'Voglio sapere cosa è gratis', p: 'gratis-e-crediti', k: 'gratis gratuito costo prezzo crediti day pass quanto costa pagare abbonamento' },
  { t: 'Voglio vino, cantine e prodotti tipici', p: 'vino-e-gusto', k: 'vino cantine cantina enoteca strada del vino dop igp prodotti tipici botteghe gusto olio formaggio' },
  { t: 'Voglio usare WIP su iPhone, Android o web', p: 'web-iphone-android', k: 'iphone android web app installare scaricare schermo spento offline background' },
];

export const TUTORIAL_PRINCIPALI = [
  { n: '1 · Itinerario, podcast e Guida d\'Autore', l: ['itinerari', 'creare-itinerario-tutte-le-modalita', 'libreria-itinerari-gratuiti', 'sosta-breve-porti-aeroporti', 'modificare-itinerario', 'podcast-e-guida-autore'] },
  { n: '2 · Percorso dalla mappa', l: ['percorso-su-misura'] },
  { n: '3 · Audioguida: libera e da percorso', l: ['audioguide', 'audioguida-libera', 'giro-con-audioguida', 'tour-di-gruppo'] },
  { n: '4 · WipNav, il navigatore', l: ['navigatore', 'wipnav-passo-passo'] },
  { n: '5 · Vision: riconoscere luoghi e opere', l: ['vision-riconoscimento'] },
  { n: '6 · Guide dei musei', l: ['visita-museo', 'musei-cultura'] },
  { n: '7 · Mappe tematiche e livelli', l: ['mappe-tematiche', 'livelli-della-mappa', 'catalogo-terme', 'catalogo-cinema', 'catalogo-cieli', 'catalogo-street-art', 'catalogo-mercati', 'catalogo-fioriture', 'catalogo-memoria', 'catalogo-lento', 'tutte-le-categorie', 'beni-culturali', 'mappa-e-ricerca'] },
  { n: '8 · Eventi, mostre e serate', l: ['eventi', 'eventi-passo-passo'] },
  { n: 'Conoscere WIP', l: ['primi-5-minuti', 'interfaccia', 'profilo-e-setup', 'archivio-download-punti', 'come-si-compra', 'glossario', 'problemi-e-soluzioni'] },
];

// Famiglie di categorie per la pagina «Tutte le categorie»: ogni chiave è una `category` di shared_pois
// (src/lib/poiCategories.ts › CATEGORY_LABELS_IT). Le chiavi non elencate finiscono in «Altre categorie».
export const FAMIGLIE_CATEGORIE = [
  { nome: 'Musei e gallerie', emoji: '🏛️', dove: 'Chip Monumenti o Gemme › sotto-filtro «Musei».', audio: 'Sì (categoria «Musei & Gallerie», accesa di base). Molti hanno anche la Visita Museo.', chiavi: ['museum', 'musei', 'art_museum', 'natural_history_museum', 'house_museum', 'art_gallery', 'museum_ship', 'archive'] },
  { nome: 'Monumenti e architettura', emoji: '🗿', dove: 'Chip Monumenti o Gemme › «Monumenti».', audio: 'Sì (categoria «Monumenti & Castelli», accesa di base). Biblioteche, teatri non romani, stazioni e stadi parlano solo se sono gemme.', chiavi: ['monument', 'monumenti', 'memorial', 'sculpture', 'artwork', 'attraction', 'square', 'bridge', 'fountain', 'palace', 'tower', 'skyscraper', 'obelisk', 'triumphal_arch', 'mausoleum', 'villa', 'aqueduct', 'dam', 'town_hall', 'university', 'theatre', 'opera_house', 'stadium', 'library', 'train_station', 'windmill', 'watermill', 'chimney', 'mine', 'quarry', 'saltworks', 'lighthouse', 'pier', 'shipyard', 'city_gate', 'birthplace', 'prison', 'cemetery', 'observatory', 'radio_telescope', 'hydro_plant', 'racetrack', 'racecourse'] },
  { nome: 'Chiese e luoghi di culto', emoji: '⛪', dove: 'Chip Monumenti o Gemme › «Chiese».', audio: 'Sì (categoria «Chiese & Luoghi di Culto», accesa di base).', chiavi: ['church', 'chiese', 'cathedral', 'basilica', 'baptistery', 'bell_tower', 'cloister', 'crypt', 'abbey', 'monastery', 'synagogue', 'mosque', 'temple', 'shrine'] },
  { nome: 'Castelli e fortificazioni', emoji: '🏰', dove: 'Chip Monumenti o Gemme.', audio: 'Sì (con «Monumenti & Castelli»).', chiavi: ['castle', 'fortress', 'stronghold', 'coastal_tower', 'city_walls'] },
  { nome: 'Archeologia', emoji: '🏺', dove: 'Chip Monumenti o Gemme.', audio: 'Sì (con «Monumenti & Castelli»).', chiavi: ['archaeological_site', 'archaeological_park', 'ruins', 'amphitheatre', 'roman_theatre', 'roman_circus', 'roman_villa', 'roman_baths', 'domus', 'necropolis', 'catacomb'] },
  { nome: 'Panorami e trasporti panoramici', emoji: '🌄', dove: 'Chip Monumenti o Gemme › «Panorami».', audio: 'Sì, ma la categoria «Panorami & Belvedere» è spenta di base.', chiavi: ['viewpoint', 'panorami', 'aerialway', 'funicular', 'rack_railway', 'scenic_road', 'ski_jump'] },
  { nome: 'Natura', emoji: '🌿', dove: 'Chip Natura (da ＋ Altro) › Spiagge e isole, Vette e ghiacciai, Cascate e laghi, Grotte, Parchi e riserve.', audio: 'Sì, ma la categoria «Natura» è spenta di base.', chiavi: ['natura', 'beach', 'bay', 'lake', 'island', 'waterfall', 'spring', 'cave', 'peak', 'cliff', 'glacier', 'volcano', 'nature_reserve', 'trail', 'tree', 'desert', 'forest', 'garden', 'botanical_garden', 'geopark', 'via_ferrata', 'ski_resort'] },
  { nome: 'Famiglie', emoji: '🛝', dove: 'Chip Famiglie (da ＋ Altro).', audio: 'No.', chiavi: ['famiglie', 'aquarium', 'water_park'] },
  { nome: 'Vino, gusto, shopping e lusso', emoji: '🍷', dove: 'Livelli «Vino e gusto», «Shopping», «Lusso» (non sono chip).', audio: 'Solo se accesi nel Setup.', chiavi: ['enogastronomia', 'winery', 'shopping', 'lusso', 'market_hall'] },
  { nome: 'Tematici', emoji: '🧭', dove: 'Chip Tematici (da ＋ Altro) e i suoi 8 temi.', audio: 'No: hanno una scheda, non l\'audioguida.', chiavi: ['tematiche', 'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento'] },
  { nome: 'Servizi', emoji: '🛠️', dove: 'Chip Utilità (da ＋ Altro).', audio: 'No.', chiavi: ['utilita'] },
  { nome: 'Memoria dolorosa', emoji: '🕯️', dove: 'Chip Monumenti.', audio: 'Come i monumenti.', chiavi: ['war_cemetery', 'concentration_camp'] },
  { nome: 'Altre categorie', emoji: '✨', dove: 'Gemme (luoghi da non perdere), Eventi, Esperienze, Locali.', audio: 'Le gemme sì, sempre. Locali ed Esperienze no.', chiavi: ['gemme', 'eventi', 'esperienze_locali', 'locali'] },
];

const A = 'https://wip.guide/';

export const PAGINE = [
  /* ───────────────────────── HOME ───────────────────────── */
  {
    slug: '', titolo: 'Scopri tutto quello che puoi fare con WIP', breve: 'Il centro guida di WIP',
    meta: 'Il centro guida di WIP: mappa, audioguide che partono da sole, itinerari, musei, eventi e servizi. Come si usa ogni funzione, cosa è gratis e quanti luoghi ci sono davvero.',
    lead: 'WIP è una guida che ti accompagna mentre cammini o guidi: mostra i luoghi intorno a te su una mappa e, quando arrivi, racconta la loro storia con una voce. Questo centro guida spiega, funzione per funzione, che cosa puoi fare, come si fa e quanto costa.',
    stat: ['luoghi_totale', 'gemme', 'musei', 'locali', 'audioguide', 'guide_musei_it'],
    home: true,
  },
  /* ───────────────────────── MAPPA ───────────────────────── */
  {
    slug: 'mappa-e-ricerca', titolo: 'La mappa di WIP: luoghi, filtri, ricerca e scheda del luogo', breve: 'Mappa e ricerca', macro: 'viaggi',
    meta: 'Come usare la mappa di WIP: chip delle categorie, livelli, ricerca di una città, posizione, meteo e scheda del luogo con foto, descrizione e navigazione.',
    lead: 'La scheda «Esplora» è la mappa su cui si appoggia tutto il resto. Qui sotto trovi cosa significa ogni elemento e come passare da un pin alla scheda completa di un luogo.',
    stat: ['luoghi_totale', 'gemme'],
    sezioni: [
      { h: 'Che cosa trovi', corpo: [
        ['p', 'La mappa mostra i luoghi come pin colorati per categoria. Le categorie si accendono con le **chip** sotto la barra di ricerca: 💎 Gemme, 🏛️ Monumenti, 📸 WIP Community, 🎟 Esperienze e 🎪 Eventi sono sempre in barra.'],
        ['p', 'Con il tasto **＋ Altro** aggiungi alla barra altre categorie: 🌿 Natura, 🏘️ Località, 🍕 Locali, 🛠️ Utilità, 🛝 Famiglie, 🏺 Beni Culturali e 🧭 Tematici. La tua scelta resta salvata sul dispositivo.'],
        ['p', 'Alcune chip aprono una seconda riga di filtri. Per esempio **Natura**: Spiagge e isole, Vette e ghiacciai, Cascate e laghi, Grotte, Parchi e riserve. **Tematici**: Terme e sorgenti, Location di film e serie, Cieli bui e stelle, Street art, Mercati e mercatini, Fioriture, Memoria e case-museo, Viaggio lento.'],
      ] },
      { h: 'Come si usa, passo per passo', corpo: [
        ['passi', [
          'Apri WIP dalla scheda **Esplora** (la prima della barra in basso).',
          'Tocca la **lente 🔍** e scrivi il nome di una città: compaiono i suggerimenti, scegline uno. La ricerca è per **città**, non per singolo luogo.',
          'Tocca il **mirino** per centrare la mappa sulla tua posizione. Tenendolo premuto circa mezzo secondo attivi «Segui me»: la mappa resta agganciata a te mentre cammini.',
          'Accendi una o più chip. I pin cambiano subito; zoomando compaiono i luoghi più piccoli.',
          'Tocca un pin: si apre un riquadro con foto, nome, preferiti e condivisione. Toccando ancora si apre la **scheda completa**.',
          'Nella scheda trovi i pulsanti per navigare, chiedere a WIP, esplorare i dintorni e ascoltare l\'audioguida.',
        ] ],
      ] },
      { h: 'Cosa c\'è nella scheda di un luogo', corpo: [
        ['lista', [
          'Foto con attribuzione e descrizione, anche «Descrizione dettagliata» quando esiste.',
          'Voto e numero di recensioni, **solo** quando sono veri (non viene inventato un punteggio).',
          'Distanza dalla tua posizione e pulsante **Naviga** (vedi la pagina sul navigatore).',
          '**Esplora dintorni**: altri luoghi vicini.',
          'Dati tecnici quando noti: anno, architetto, stile, materiale, altezza, comune.',
          'Per i locali: telefono, sito e segnalazione se sono chiusi definitivamente.',
          'Il lettore dell\'audioguida, se quel tipo di luogo ne ha una.',
          'Il link **«Hai notato un errore in questo luogo? Segnalalo»**: le correzioni dei visitatori servono a tenere la mappa accurata.',
        ] ],
        ['costo', 'Leggere la scheda di un luogo è **gratis**: foto, descrizioni e orari non consumano crediti.'],
      ] },
      { h: 'Meteo e pioggia sulla mappa', corpo: [
        ['p', 'Al centro in basso c\'è un piccolo indicatore con **emoji e temperatura** del punto dove sei. Se la probabilità di pioggia è almeno del 50%, compare un avviso con due scelte: «Al coperto» attenua i pin dei luoghi all\'aperto, «No grazie» lo ignora. I dati meteo arrivano dal servizio meteorologico norvegese MET Norway.'],
      ] },
    ],
    manca: ['La ricerca della mappa cerca **città**, non singoli nomi di luoghi: per trovare un posto preciso zooma sulla città e usa le chip.', 'La mappa è bidimensionale (non c\'è una vista 3D).'],
    correlate: ['categorie', 'ristoranti-gastronomia', 'navigatore'],
    faq: [
      ['Posso usare WIP senza registrarmi?', 'Il sito web si apre e mostra la mappa. Alcune funzioni (crediti, itinerari, acquisti) richiedono un account. Le funzioni gratuite sono elencate nella pagina «Cosa è gratis».'],
      ['Come cerco un luogo preciso?', 'Cerca la città con la lente, poi accendi la categoria giusta con le chip e tocca il pin. La ricerca di singoli luoghi per nome non è disponibile.'],
    ],
  },
  /* ───────────────────────── CATEGORIE ───────────────────────── */
  {
    slug: 'categorie', titolo: 'Esplora tutto quello che puoi trovare su WIP', breve: 'Catalogo delle categorie', macro: 'viaggi',
    meta: 'Il catalogo di tutte le categorie di WIP con il numero di luoghi, la descrizione e il collegamento alla guida: mangiare, natura, mare, cultura, eventi, servizi.',
    lead: 'Il catalogo elenca le categorie che l\'app presenta davvero. Una categoria senza risultati pubblicabili non compare tra le «ricche»: i numeri vengono dal database e mostrano la data dell\'ultimo calcolo.',
    catalogo: true,
    stat: ['luoghi_totale', 'gemme'],
    manca: ['Non sono presentate come categorie WIP: webcam, maree, percorsi con dislivello e difficoltà, prenotazione di hotel, qualità dell\'aria. Non esistono nell\'app.'],
    correlate: ['mappa-e-ricerca', 'tutorial', 'domande-frequenti'],
    faq: [
      ['Perché alcuni numeri dicono «circa»?', 'Per tabelle molto grandi il database fornisce una stima invece del conteggio esatto. Quando succede, il numero è marcato «circa».'],
      ['Cosa sono le Gemme?', 'Sono i luoghi segnalati come particolarmente importanti: parlano sempre con l\'audioguida, anche se la loro categoria è spenta nelle impostazioni.'],
    ],
  },
  /* ───────────────────────── RISTORANTI ───────────────────────── */
  {
    slug: 'ristoranti-gastronomia', titolo: 'Mangiare e bere con WIP: ristoranti, cantine, prodotti tipici', breve: 'Ristoranti e gastronomia', macro: 'mangiare',
    meta: 'Come trovare ristoranti, pizzerie, bar, gelaterie, senza glutine, stellati e cantine con WIP: filtri reali, scheda del locale e come raggiungerlo.',
    lead: 'Tutta la parte «Mangiare e bere» passa da due strade: la chip **Locali** (ristoranti, bar, gelati…) e il livello **Vino e gusto** (cantine, strade del vino, botteghe, zone DOP e IGP).',
    stat: ['locali', 'locali_senza_glutine', 'locali_vegetariani', 'locali_michelin', 'cantine'],
    sezioni: [
      { h: 'I filtri che esistono davvero', corpo: [
        ['p', 'Dopo aver acceso **Locali** (dal pannello ＋ Altro), sotto la barra compare una riga con: Tutti, ⭐ Stellati, Ristoranti, Pizza, Pesce, Carne, 🌾 Gluten-Free, Sushi, Vegetariano, Bar & Caffè, Gelati.'],
        ['p', 'Le scelte di gruppi diversi si sommano; dentro lo stesso gruppo vale l\'una o l\'altra.'],
      ] },
      { h: 'Tutorial: raggiungere un ristorante senza glutine', corpo: [
        ['passi', [
          'Apri WIP e tocca la lente 🔍: scrivi la città e scegli il suggerimento.',
          'Tocca **＋ Altro** e accendi **🍕 Locali**.',
          'Nella riga dei filtri tocca **🌾 Gluten-Free**. Compare una seconda riga: 100% senza glutine, Con menu, Pizzerie, Gelaterie, Forni.',
          'Scegli il livello che ti serve. Tocca **ℹ️ Legenda** per capire cosa significano.',
          'Tocca un pin e poi ancora il riquadro per aprire la scheda: cerca la dicitura **«Senza Glutine Disponibile»**.',
          'Controlla indirizzo, telefono e sito, poi tocca **Naviga** per raggiungerlo a piedi con WipNav oppure con Google Maps.',
        ] ],
        ['nota', 'Il dato «senza glutine» arriva dai tag dichiarati nelle mappe aperte (OpenStreetMap) e dalle schede dei locali. WIP indica che il tag è presente: **non è una certificazione** per celiaci. Per chi ha una celiachia, telefona sempre al locale prima di andare.'],
      ] },
      { h: 'Cosa mostra la scheda di un locale', corpo: [
        ['lista', ['Nome, indirizzo, telefono e sito.', 'Tipo di cucina, quando noto (è un\'informazione sulla scheda, non un filtro).', 'Orari e avviso se è chiuso definitivamente.', 'Per gli stellati: la distinzione Michelin, l\'eventuale Stella Verde e l\'anno, con il collegamento alla scheda ufficiale.', 'Per le sedi con dieta senza glutine: il blocco «Senza Glutine Disponibile».']],
      ] },
      { h: 'Vino e gusto', corpo: [
        ['p', 'Il livello **🍷 Vino e gusto** (pulsante «Livelli della mappa», in basso a sinistra) mostra cantine, strade e botteghe e colora le **zone DOP/IGP** a partire da un certo zoom. Approfondimento nella pagina dedicata.'],
      ] },
    ],
    manca: ['Non esiste un filtro **«vegano»**: c\'è «Vegetariano». Il tag vegano può comparire come informazione sulla scheda del singolo locale.', 'Non esiste un filtro per **tipo di cucina** (italiana, cinese, ecc.): la cucina è una nota sulla scheda.', 'WIP non prenota tavoli.'],
    correlate: ['ristoranti-senza-glutine', 'ristoranti-stellati', 'vino-e-gusto', 'navigatore'],
    faq: [
      ['Posso fidarmi dei ristoranti senza glutine per la celiachia?', 'WIP mostra i locali che dichiarano la dieta. Non verifica certificazioni né procedure di cucina: contatta sempre il locale.'],
      ['Posso filtrare per cucina o per vegano?', 'No. I filtri reali sono quelli elencati sopra. La cucina è un\'informazione nella scheda del locale.'],
      ['Come trovo il bar o la gelateria più vicina?', 'Accendi Locali e scegli «Bar & Caffè» oppure «Gelati»: la mappa mostra solo quelli.'],
    ],
  },
  {
    slug: 'ristoranti-senza-glutine', titolo: 'Come trovare ristoranti senza glutine con WIP', breve: 'Ristoranti senza glutine', macro: 'mangiare', padre: 'ristoranti-gastronomia',
    meta: 'Come trovare ristoranti, pizzerie, gelaterie e forni senza glutine con WIP: i livelli (100% senza glutine, con menu), la legenda e cosa il dato significa davvero.',
    lead: 'WIP ha un filtro dedicato **Gluten-Free** con quattro tipi di locale e due livelli di garanzia dichiarata. Questa pagina spiega come leggerli e dove sta il limite del dato.',
    stat: ['locali_senza_glutine', 'locali'],
    sezioni: [
      { h: 'Come funziona il filtro', corpo: [
        ['lista', ['**Livelli**: «100% senza glutine» (il locale dichiara di essere interamente senza glutine) e «Con menu» (ha un menu senza glutine accanto a quello normale).', '**Targhette sui pin**: «100%» (interamente senza glutine), «Menu» (menu senza glutine, ma la cucina usa anche glutine) e «Opz.» (segnalato dagli utenti, senza menu dedicato: chiedi prima di ordinare). Al centro del pin c\'è il tipo di locale.', '**Tipi**: Pizzerie, Gelaterie, Forni.', 'I livelli e i tipi si **sommano**: 100% + gelaterie ti mostra le gelaterie interamente senza glutine.']],
        ['passi', ['Accendi 🍕 Locali da ＋ Altro.', 'Tocca 🌾 Gluten-Free.', 'Scegli livello e tipo; tocca ℹ️ Legenda per le definizioni.', 'Apri un pin e controlla la scheda: «Senza Glutine Disponibile».']],
      ] },
      { h: 'Che cosa vuol dire, e che cosa no', corpo: [
        ['nota', 'Il filtro è costruito sui **tag dichiarati** (OpenStreetMap e schede dei locali). Significa «il locale risulta senza glutine», non «certificato per celiaci». Menù e procedure cambiano: prima di sederti, telefona (il numero è nella scheda).'],
        ['p', 'Il numero in cima alla pagina conta i locali con il tag; non va letto come elenco di locali verificati uno per uno.'],
      ] },
    ],
    manca: ['WIP non verifica certificazioni AIC né l\'assenza di contaminazione.'],
    correlate: ['ristoranti-gastronomia', 'ristoranti-stellati', 'tutorial'],
    faq: [['Il filtro include gelaterie e forni?', 'Sì: tra i tipi ci sono Pizzerie, Gelaterie e Forni.'], ['Dove leggo la differenza tra 100% e Con menu?', 'Tocca «ℹ️ Legenda» nella riga del filtro Gluten-Free.']],
  },
  {
    slug: 'ristoranti-stellati', titolo: 'Ristoranti stellati con WIP: dove sono e cosa trovi nella scheda', breve: 'Ristoranti stellati', macro: 'mangiare', padre: 'ristoranti-gastronomia',
    meta: 'Come cercare i ristoranti con distinzione Michelin su WIP: il filtro Stellati, la legenda ★ ★★ ★★★ Bib e cosa mostra la scheda.',
    lead: 'Nel filtro **Locali** c\'è la scelta **⭐ Stellati**. Le schede riportano la distinzione Michelin con una presentazione prudente, senza riprodurre recensioni o prezzi della guida.',
    stat: ['locali_michelin'],
    sezioni: [
      { h: 'Come si cerca', corpo: [['passi', ['Accendi 🍕 Locali dal pannello ＋ Altro.', 'Tocca **⭐ Stellati** nella riga dei filtri.', 'Tocca **Legenda** per vedere ★, ★★, ★★★ e Bib. Il **Bib Gourmand** si vede sulla mappa ma non rientra nella chip «Stellati».', 'Apri un pin: la scheda mostra la distinzione, l\'eventuale Stella Verde e l\'anno, con il link alla scheda ufficiale.']]] },
      { h: 'Come sono presentati i dati', corpo: [['p', 'La distinzione è quella registrata nell\'archivio dei locali e riporta l\'anno. WIP non è affiliata a Michelin: la scheda lo dichiara e non include recensioni né fasce di prezzo della guida. Per prenotare e verificare lo stato attuale usa il sito ufficiale linkato.'], ['p', 'Il livello **Lusso** della mappa include anche una voce «Ristoranti stellati».']] },
    ],
    manca: ['Non c\'è prenotazione del tavolo.', 'Il dato è quello salvato nell\'archivio: una nuova stella o una perdita di stella può non essere ancora aggiornata. Controlla l\'anno indicato.'],
    correlate: ['ristoranti-gastronomia', 'ristoranti-senza-glutine'],
    faq: [['Cosa significa Bib?', 'È la distinzione «Bib Gourmand» della guida Michelin. La legenda dell\'app la spiega accanto alle stelle.'], ['WIP mostra i prezzi dei menu?', 'No, per scelta: la scheda rimanda al sito ufficiale.']],
  },
  {
    slug: 'vino-e-gusto', titolo: 'Vino e gusto: cantine, strade del vino e prodotti tipici', breve: 'Vino e gusto', macro: 'mangiare', padre: 'ristoranti-gastronomia',
    meta: 'Il livello «Vino e gusto» di WIP: cantine, botteghe, strade del vino e zone DOP e IGP colorate sulla mappa, con la scheda delle denominazioni.',
    lead: 'Il livello **🍷 Vino e gusto** raccoglie cantine, botteghe e strade del gusto e disegna sulla mappa le **zone di denominazione** (DOP, IGP e simili).',
    stat: ['cantine'],
    sezioni: [
      { h: 'Come si attiva', corpo: [['passi', ['Sulla mappa tocca il pulsante **Livelli** in basso a sinistra («Livelli della mappa»).', 'Nel gruppo «Dove andare» accendi **🍷 Vino e gusto**.', 'Zoomando compaiono prima le zone colorate, poi le cantine e le botteghe: se vedi «avvicinati per vederli», aumenta lo zoom.', 'Tocca una zona: il fumetto indica **che cosa è** (per esempio 🍷 Vino) e il nome della denominazione.', 'Tocca una cantina o una bottega per la scheda; la scheda dei luoghi di gusto ha il riquadro **«Denominazioni della zona»**.']]] },
      { h: 'Come leggere i colori', corpo: [['p', 'Le zone sono colorate per famiglia di prodotto (vino, formaggi, olio, salumi, altri prodotti). Dove si sovrappongono più famiglie, la zona è a strisce diagonali. Le zone più grandi stanno sotto, quelle piccole sopra, così puoi toccarle tutte.']] },
    ],
    manca: ['Per un prodotto senza confine ufficiale affidabile la zona non è disegnata: è preferibile una zona in meno a una zona sbagliata.'],
    correlate: ['ristoranti-gastronomia', 'mappa-e-ricerca'],
    faq: [['Le strade del vino sono tracciate?', 'Il livello mostra strade e botteghe del gusto; il dettaglio dipende dai dati disponibili nell\'area.'], ['Devo zoomare per vedere le cantine?', 'Sì, alcuni elementi compaiono solo da certi livelli di zoom per non appesantire la mappa.']],
  },
  /* ───────────────────────── NATURA ───────────────────────── */
  {
    slug: 'natura-percorsi', titolo: 'Natura e outdoor con WIP: luoghi, parchi, sentieri e ciclovie', breve: 'Natura e percorsi', macro: 'natura',
    meta: 'Come trovare laghi, cascate, vette, grotte, parchi, sentieri e ciclovie con WIP, e quali dati dei percorsi ci sono davvero (e quali no).',
    lead: 'Per la natura WIP usa due strumenti: la chip **Natura** per i luoghi (puntuali) e i **livelli** per i tracciati (sentieri, ciclovie, aree protette).',
    stat: ['natura', 'panorami', 'spiagge'],
    sezioni: [
      { h: 'Luoghi di natura: la chip Natura', corpo: [['p', 'Dal pannello ＋ Altro accendi **🌿 Natura**. Sotto la barra compaiono: Spiagge e isole, Vette e ghiacciai, Cascate e laghi, Grotte, Parchi e riserve. Per i punti panoramici usa **Gemme** o **Monumenti** e il filtro **Panorami**.']] },
      { h: 'Tracciati: i livelli', corpo: [['passi', ['Tocca **Livelli** in basso a sinistra.', 'Nel gruppo «Dove andare» accendi **🥾 Sentieri e cammini** e/o **🚲 Ciclovie e mountain bike**.', 'Accendi **🌿 Aree protette** per vedere parchi e riserve di tutto il mondo e le specie avvistate.', 'I livelli si sommano. Il tasto «Spegni tutti» li azzera.']], ['p', 'Il livello Sentieri include anche ippovie, rifugi, corsa, canoa e itinerari storici. Le ciclovie comprendono le EuroVelo e le reti nazionali. Le fontanelle lungo la strada stanno nel livello «Fontanelle, bagni, panchine».']] },
      { h: 'Prima di partire', corpo: [['p', 'Controlla il meteo con l\'indicatore sulla mappa, il livello **Sole: UV e caldo percepito** e, per la stagione, **Clima: il periodo migliore**. Usa **Utilità** per farmacie e fontanelle vicine.']] },
    ],
    manca: ['I sentieri sono **tracciati sulla mappa**: l\'app non riporta **lunghezza, dislivello, durata o difficoltà** del singolo percorso.', 'Non c\'è **import o export GPX**.', 'Non c\'è una modalità «segui il sentiero» con ricalcolo: la navigazione WipNav è pensata per percorsi stradali a piedi.'],
    correlate: ['sentieri-e-ciclovie', 'meteo-neve', 'servizi-utili'],
    faq: [['Posso scaricare un file GPX?', 'No, non è disponibile.'], ['Trovo dislivello e difficoltà?', 'No: il livello mostra il tracciato, non i dati altimetrici.'], ['Le ciclovie sono solo italiane?', 'Il livello comprende reti europee (EuroVelo) e nazionali.']],
  },
  {
    slug: 'sentieri-e-ciclovie', titolo: 'Sentieri, cammini e ciclovie su WIP: come vederli e usarli', breve: 'Sentieri e ciclovie', macro: 'natura', padre: 'natura-percorsi',
    meta: 'Passo per passo: accendere i livelli Sentieri e Ciclovie su WIP, leggere i tracciati, trovare rifugi e fontanelle vicine, e i limiti reali dei dati.',
    lead: 'I livelli **Sentieri e cammini** e **Ciclovie e mountain bike** disegnano i tracciati sulla mappa. Servono per scegliere dove andare e per vedere cosa c\'è intorno; non sono un navigatore di sentiero.',
    sezioni: [
      { h: 'Tutorial: trovare un percorso e vedere cosa c\'è vicino', corpo: [['passi', ['Cerca la zona con la lente 🔍.', 'Apri **Livelli** e accendi 🥾 Sentieri e cammini (a piedi) oppure 🚲 Ciclovie e mountain bike.', 'Zooma sull\'area: i tracciati compaiono dopo un certo zoom.', 'Tocca un tracciato per vederne il nome e le informazioni disponibili.', 'Accendi in più **🚰 Fontanelle, bagni, panchine** (raggio circa 2 km dal centro mappa) e la chip **Utilità** per farmacie e ricariche.', 'Controlla il meteo dell\'indicatore centrale e il livello Sole/UV prima di partire.']]] },
      { h: 'Cosa leggere dalla mappa', corpo: [['lista', ['Il **disegno del tracciato** e il suo nome.', 'Rifugi, ippovie e percorsi di corsa o canoa nello stesso livello Sentieri.', 'Le **reti ciclabili** europee e nazionali nel livello Ciclovie.']]] },
    ],
    manca: ['Niente lunghezza, dislivello, durata o difficoltà del singolo percorso.', 'Niente GPX.', 'Niente segnalazione di tratti chiusi o condizioni del fondo.'],
    correlate: ['natura-percorsi', 'meteo-neve', 'servizi-utili'],
    faq: [['Posso seguire un sentiero con la voce?', 'WipNav guida a piedi lungo percorsi stradali; per i sentieri il livello serve a vedere il tracciato.']],
  },
  /* ───────────────────────── MARE ───────────────────────── */
  {
    slug: 'mare-spiagge', titolo: 'Mare e spiagge con WIP: temperatura, onde e qualità dell\'acqua', breve: 'Mare e spiagge', macro: 'mare',
    meta: 'Come trovare spiagge e baie con WIP e leggere temperatura del mare, altezza delle onde e qualità dell\'acqua di balneazione in Europa.',
    lead: 'Le spiagge si trovano con la chip **Natura › Spiagge e isole**. Il livello **🏖 Qualità acqua del mare** aggiunge un dato per ogni spiaggia europea: classificazione dell\'acqua, temperatura e onde.',
    stat: ['spiagge'],
    sezioni: [
      { h: 'Tutorial: una giornata al mare', corpo: [['passi', ['Cerca la località con la lente 🔍.', 'Da ＋ Altro accendi **🌿 Natura** e tocca **Spiagge e isole**.', 'Apri **Livelli** e accendi **🏖 Qualità acqua del mare**.', 'Tocca una spiaggia: trovi la classificazione dell\'acqua, la 🌡 temperatura del mare e la 🌊 altezza delle onde.', 'Controlla l\'indicatore meteo al centro e il livello **Sole: UV e caldo percepito**.', 'Tocca **Naviga** per raggiungerla.']]] },
      { h: 'Che tipo di dato è', corpo: [['lista', ['**Classificazione dell\'acqua**: dato periodico dell\'Agenzia europea dell\'ambiente (EEA), solo Europa. Non è una misura di oggi.', '**Temperatura e onde**: dati del modello meteorologico/marino, sono una previsione o stima, non una boa sul posto.', '**Meteo e UV**: previsioni, aggiornate di frequente.']], ['nota', 'Prima di fare il bagno controlla sempre gli avvisi locali e la bandiera sul posto.']] },
    ],
    manca: ['Non ci sono **maree**, **Bandiera Blu**, **stabilimenti con prezzi o disponibilità** né **prenotazione di ombrelloni**.', 'La qualità dell\'acqua è disponibile solo per l\'**Europa**.'],
    correlate: ['meteo-neve', 'natura-percorsi', 'navigatore'],
    faq: [['La temperatura del mare è in tempo reale?', 'È un dato di modello, riferito alla zona: va letto come indicazione.'], ['Ci sono le maree?', 'No, non sono presenti nell\'app.']],
  },
  /* ───────────────────────── METEO ───────────────────────── */
  {
    slug: 'meteo-neve', titolo: 'Meteo, neve, sole e clima con WIP', breve: 'Meteo e neve', macro: 'meteo',
    meta: 'Meteo sulla mappa, avviso pioggia con luoghi al coperto, livello Neve con piste e impianti, UV e clima mese per mese: cosa offre WIP e da dove arrivano i dati.',
    lead: 'WIP non è un\'app meteo, ma usa il meteo per aiutarti a decidere: un indicatore sulla mappa, un avviso quando piove, tre livelli (Neve, Sole, Clima) e la previsione di pioggia dentro gli itinerari.',
    sezioni: [
      { h: 'Meteo sulla mappa', corpo: [['p', 'L\'indicatore al centro in basso mostra emoji e temperatura del punto. Con probabilità di pioggia almeno del 50% compare l\'avviso: **«Al coperto»** attenua i luoghi all\'aperto, **«No grazie»** lo ignora. Fonte: MET Norway.']] },
      { h: 'Neve: piste, impianti e rifugi', corpo: [['passi', ['Tocca **Livelli** in basso a sinistra.', 'Nel gruppo «Com\'è adesso» accendi **❄️ Neve: piste, impianti e rifugi**.', 'Zooma sul comprensorio: compaiono piste, impianti e rifugi.', 'Il livello include anche la copertura nevosa giornaliera da dati NASA.']], ['p', 'Il livello contiene migliaia di piste. Per ogni pista o impianto vale l\'informazione presente sulla mappa; non c\'è un bollettino nivologico né l\'altezza della neve in centimetri per singola stazione.']] },
      { h: 'Sole e clima', corpo: [['lista', ['**☀️ Sole: UV e caldo percepito**: utile per scegliere l\'orario di una gita.', '**📅 Clima: il periodo migliore**: media climatica 2001-2020 (NASA POWER) per decidere **quando** andare.']]] },
      { h: 'Meteo dentro l\'itinerario', corpo: [['p', 'Se imposti la data di partenza, l\'itinerario mostra il badge 🌧 con i mm previsti e un tasto **Piano B** che propone una variante al coperto (musei, chiese, gallerie). Con la **Garanzia pioggia** puoi chiedere indietro i crediti del giorno se è piovuto almeno 6 ore o 20 mm (richiesta entro 7 giorni dal Profilo).']] },
    ],
    manca: ['Non ci sono **webcam**.', 'Non c\'è un **bollettino valanghe** né l\'altezza della neve per singola stazione.', 'Non c\'è la **qualità dell\'aria**.'],
    correlate: ['mare-spiagge', 'itinerari', 'natura-percorsi'],
    faq: [['Posso vedere le webcam delle piste?', 'No, WIP non ha webcam.'], ['Le previsioni sono nell\'itinerario?', 'Sì: con la data impostata, l\'itinerario mostra la pioggia prevista e il Piano B.']],
  },
  /* ───────────────────────── CULTURA ───────────────────────── */
  {
    slug: 'musei-cultura', titolo: 'Musei, monumenti e cultura con WIP', breve: 'Musei e cultura', macro: 'cultura',
    meta: 'Come trovare musei, monumenti, chiese, castelli e siti archeologici con WIP, e come usare la Visita Museo: sala per sala, opera per opera, con la pianta.',
    lead: 'Per i luoghi di cultura WIP offre schede, audioguide e, per i musei più importanti, una **Visita guidata sala per sala**. Ecco dove trovarle e come funzionano.',
    stat: ['musei', 'monumenti', 'chiese', 'castelli', 'archeologia', 'guide_musei_it', 'piante_musei'],
    sezioni: [
      { h: 'Trovare un luogo di cultura', corpo: [['passi', ['Cerca la città con la lente 🔍.', 'Accendi **🏛️ Monumenti** o **💎 Gemme**: sotto la barra scegli **Monumenti, Chiese, Musei, Panorami**.', 'Tocca un pin e apri la scheda: descrizione, foto, dati tecnici e lettore dell\'audioguida.']], ['p', 'Le gemme sono i luoghi più importanti e parlano sempre. Il chip **🏺 Beni Culturali** (da ＋ Altro) è l\'atlante dei beni tutelati: dà la scheda ma **non l\'audioguida**.']] },
      { h: 'La Visita Museo', corpo: [
        ['p', 'Nella scheda **Fotocamera**, sezione **Visite**, per i musei che la offrono trovi la **Visita Museo**: un percorso per sale, ordinato per vicinanza, con la barra «Sei qui / Prossima» e la voce che avvisa a fine sala.'],
        ['lista', ['Per ogni opera: spiegazione, curiosità, foto, confronti e tre domande pronte che funzionano offline.', 'La **pianta del museo** con i pin, dove disponibile: il numero sul pin indica le opere di quella sala.', 'Esportazione in **PDF** con copertina, foto e pianta.', 'Le voci (MP3) si scaricano prima della visita e restano nella cartella «Guide Musei» dei download.']],
        ['costo', 'Visita Museo: **200 crediti** per museo, senza scadenza, con 20 scansioni incluse. Pass Museo: 100 crediti per 40 scansioni in 4 ore. Le guide sono generate da fonti verificate (Wikipedia, sito del museo, archivi aperti).'],
      ] },
      { h: 'Scansionare un\'opera', corpo: [['p', 'Nella Fotocamera, sezione **Scansione AI**, scegli 🖼️ **Opera**, inquadra e ricevi il riconoscimento con spiegazione. Ogni scansione costa **5 crediti**; senza rete le foto vengono riconosciute e addebitate al ritorno online.']] },
      { h: 'Biglietti', corpo: [['p', 'I biglietti per musei e attrazioni si prenotano dai partner (Tiqets, GetYourGuide, Viator) dal chip **Esperienze** o dalla scheda; l\'acquisto avviene sul sito del partner. WIP riceve una commissione senza aumentare il prezzo.']] },
    ],
    manca: ['La pianta con i pin non c\'è per tutti i musei: dove manca, la guida è una lista di opere.', 'Non tutti i musei hanno la Visita guidata.'],
    correlate: ['audioguide', 'mappa-e-ricerca', 'itinerari'],
    faq: [['Le guide museo sono in più lingue?', 'La guida è preparata in italiano e tradotta nelle altre lingue dell\'app dove disponibile.'], ['Funziona al chiuso?', 'Il Pass Museo non dipende dalla posizione, quindi funziona anche dentro il museo; richiede internet.']],
  },
  /* ───────────────────────── AUDIOGUIDE ───────────────────────── */
  {
    slug: 'audioguide', titolo: 'Le audioguide di WIP: scopri i luoghi ascoltando la loro storia', breve: 'Audioguide', macro: 'audio',
    meta: 'Come funzionano le audioguide di WIP: avviso, teaser e guida completa che partono da sole, Nicky e Dante, 7 lingue, controlli del lettore, offline, Day Pass e costi.',
    lead: 'Con WIP non cerchi un\'audioguida: accendi il tasto **Guida** e, mentre cammini o guidi, l\'app ti avvisa quando ti avvicini a un luogo e lo racconta quando arrivi. Puoi anche ascoltare dalla scheda di qualsiasi luogo che ne abbia una.',
    stat: ['audioguide', 'gemme', 'guide_musei_it'],
    sezioni: [
      { h: 'Come parte da sola', corpo: [
        ['passi', ['Metti le cuffie e tocca **Guida** nella barra in basso: accende il radar delle audioguide (il tasto sopra serve a silenziare).', 'Cammina o guida. A circa **150 m a piedi (300 m in auto)** arriva un **avviso** con vibrazione: «Ti stai avvicinando a…».', 'All\'arrivo (circa **30 m a piedi, 50 m in auto**) parte un breve **teaser** vocale, gratuito.', 'Subito dopo parte la **guida completa**.']],
        ['p', 'Le distanze sono tue: in **Profilo › SETUP › GeoControl Avanzato** regoli avviso e inizio guida, a piedi e in auto separatamente. Il mezzo non si sceglie a mano: l\'app lo riconosce dalla velocità (sopra 12 km/h passa a «auto», sotto 6 km/h torna a «a piedi»).'],
        ['p', 'In **Modalità Automatica** la guida completa parte da sola; in **Semi-Automatica** arrivano avviso e teaser e l\'**Ascolta** lo tocchi tu.'],
      ] },
      { h: 'Quali luoghi parlano', corpo: [
        ['p', 'Dipende dalle **Categorie Audioguida** del Setup, non dalle chip della mappa. Di base sono accese Monumenti e Castelli, Musei e Gallerie, Chiese e Luoghi di Culto; spente Panorami, Natura e Consigli. **Le gemme parlano sempre.**'],
        ['p', 'Non hanno audioguida: WIP Community, le categorie tematiche (terme, cinema, cieli, street art, mercati, fioriture, memoria, viaggio lento), Beni Culturali, Locali, Utilità e Famiglie.'],
      ] },
      { h: 'Voci e lingue', corpo: [
        ['lista', ['**Nicky**: voce femminile, stile «Trendy & Fun» (predefinita). **Dante**: voce maschile, «Guida classica». Nella scheda scegli anche **🎭 Duetto**, un dialogo a due voci.', '**7 lingue**: italiano, inglese, francese, spagnolo, tedesco, russo, cinese.', 'I testi sono scritti a partire da fonti sul luogo (Wikipedia, Wikidata, sito ufficiale) e voce sintetica: sono contenuti generati con intelligenza artificiale su materiale verificato.']],
      ] },
      { h: 'I controlli del lettore', corpo: [
        ['lista', ['**Chiedi** 🎤: metti in pausa e fai una domanda a voce o per scritto; risponde il personaggio.', '**Ricomincia**, Play/Pausa, **Avanti 10 s**, **Velocità**, **Sleep** (10, 20 o 30 minuti).', '**Ascolta Approfondimento**: fino a 3 livelli (dettagli storici, curiosità, connessioni con arte e cultura).', '**Riprendi da…**: ricorda dove eri rimasto.', '**Modalità silenziosa** 🤫: vibra e mostra il testo senza parlare.', '**Racconta solo ciò che hai davanti**: usa la bussola del telefono per parlare solo dei luoghi nella direzione in cui guardi.']],
        ['p', 'Un luogo già ascoltato non riparte per 24 ore; «Azzera Storico» nel Setup lo resetta. Dal Profilo › **ARCHIVIO** riascolti le guide che hai.'],
      ] },
      { h: 'Quanto costa', corpo: [
        ['costo', 'Avviso e teaser sono **gratis**. La guida completa costa **15 crediti** per luogo e, una volta pagata, resta tua **per sempre**. Il **Day Pass** (200 crediti, 24 ore, fino a 40 guide) le include tutte, anche offline e a schermo spento. Le guide «Consigli» non consumano crediti.'],
      ] },
      { h: 'Offline e schermo spento', corpo: [['p', 'A **schermo spento** e in **background** l\'audioguida funziona nell\'**app per iPhone e Android**: il servizio nativo continua a seguire la posizione. Sul **web** funziona solo con la pagina aperta in primo piano. Scaricando i **pacchetti area** puoi usarle senza rete.']] },
    ],
    manca: ['Non esiste un lettore dimostrativo sul sito di questa guida: gli audio sono generati per luogo e si ascoltano nell\'app o nella scheda del luogo.', 'Se la guida completa non è già in cache, serve la rete per generarla.'],
    correlate: ['gratis-e-crediti', 'musei-cultura', 'web-iphone-android'],
    faq: [
      ['Posso cambiare voce e lingua?', 'Sì: la voce (Nicky, Dante o Duetto) dal lettore o dal Setup, la lingua dalle impostazioni del Profilo.'],
      ['Il teaser costa qualcosa?', 'No, avviso e teaser sono gratuiti.'],
      ['Funziona offline?', 'Sì, nell\'app, con pacchetti area scaricati e, per le guide complete, Day Pass attivo o guide già acquistate.'],
      ['Perché una guida non parte?', 'Controlla che la categoria sia accesa nel Setup, che il GPS sia preciso (sotto i 50 m) e che il luogo non l\'abbia già raccontata nelle ultime 24 ore.'],
    ],
  },
  /* ───────────────────────── ITINERARI ───────────────────────── */
  {
    slug: 'itinerari', titolo: 'Itinerari con WIP: crearli, leggerli, scaricarli', breve: 'Itinerari', macro: 'viaggi',
    meta: 'Come creare un itinerario con WIP: giorni, budget, ritmo, tappe, tempi, mezzi pubblici, Piano B pioggia, PDF e Guida d\'Autore. Cosa è gratis e cosa costa.',
    lead: 'Nella scheda **Itinerario** puoi farti creare un programma giorno per giorno, scegliere uno già pronto dalla Libreria, comporre un giro con le audioguide o pianificare con altri.',
    sezioni: [
      { h: 'Le strade per arrivare a un itinerario', corpo: [['lista', ['**Modalità Automatica**: scegli destinazione e giorni e l\'AI compone il programma.', '**Libreria itinerari**: centinaia di itinerari già pronti, **gratis**.', '**Dai Miei Preferiti**: parte dai luoghi che hai salvato.', '**Raggio**: scegli una base e un raggio, ottieni 3 alternative.', '**Swip**: scorri le attrazioni e tieni quelle che ti piacciono.', '**Viaggio di gruppo**: ognuno vota con un PIN e WIP fonde le preferenze.', '**Quando andare**: clima mese per mese.', '**Sosta breve: porti e aeroporti**: cosa fare con poche ore.']]] },
      { h: 'Tutorial: creare un itinerario', corpo: [['passi', ['Apri la scheda **Itinerario**.', 'Scegli la destinazione e i **giorni** (da 1 a 30).', 'Facoltativo: periodo o data di partenza (serve per il meteo), **Inizio / Fine giornata**.', 'Nelle opzioni avanzate: «Includi eventi locali», «Includi tour e attività», **«Gratis»** (solo tappe gratuite, pasti esclusi). Con «Mostra opzioni di base» scegli budget (Economico, Standard, Lusso), viaggiatori (Solo, Coppia, Famiglia, Gruppo), ritmo (Rilassato, Standard, Intenso) e guida (Nicky, Dante, Entrambi).', 'Conferma: la creazione costa **10 crediti per giorno** e una finestra te lo dice prima.', 'Leggi il risultato: mappa, info di viaggio, una tabella budget per giorno, **tempi veri tra le tappe** e, per i tratti da 1,5 km in su, un pulsante **Mezzi** che apre Google Maps con il trasporto pubblico.']]] },
      { h: 'Cosa puoi fare sul risultato', corpo: [['lista', ['**Sostituire** una tappa (alcune sostituzioni al giorno sono gratuite, poi 8 crediti) e **Rigenerare** bloccando le tappe che vuoi tenere.', '**Piano B** se è prevista pioggia: una variante al coperto.', '**Scarica per offline** e salva in «I miei download».', '**PDF**: il programma stampabile con mappa e legenda dei numeri delle tappe.', '**Calendario**: esporta in .ics.', '**Guida d\'Autore**: una guida in PDF scritta sul tuo itinerario (20 crediti per giorno): stili Arte e Storia, Famiglia, Shopping e Design, Enogastronomia, Essenziale. Arriva anche per email; con audiolibro, EPUB e podcast tra gli strumenti collegati.']]] },
      { h: 'Tutte le tue cose, in un posto', corpo: [['p', 'La schermata **I miei download** (dal Profilo, da Itinerario › «I Miei Itinerari» e da Offline) ha cinque cartelle: Itinerari, Mappe, Audioguide, Guide Premium e Guide Musei. Ogni voce ha i pulsanti Apri, Naviga, Racconto, PDF ed Elimina.']] },
    ],
    manca: ['I mezzi pubblici sono un link a Google Maps: WIP non ha un planner di trasporto interno.', 'Non c\'è prenotazione di hotel.'],
    correlate: ['libreria-itinerari-gratuiti', 'navigatore', 'gratis-e-crediti'],
    faq: [['Quanto costa un itinerario?', '10 crediti al giorno. La Libreria di itinerari pronti è gratuita.'], ['Posso avere solo cose gratis?', 'Sì: l\'opzione «Gratis» mantiene solo tappe gratuite (pasti esclusi).'], ['Posso condividerlo?', 'Sì: PDF, invio della guida, racconto del viaggio e Viaggio di gruppo con PIN.']],
  },
  {
    slug: 'libreria-itinerari-gratuiti', titolo: 'La Libreria itinerari: percorsi già pronti e gratuiti', breve: 'Libreria itinerari', macro: 'viaggi', padre: 'itinerari',
    meta: 'La Libreria di WIP: itinerari già pronti, gratuiti, da aprire, salvare offline e seguire. Come trovarli e usarli.',
    lead: 'Se non vuoi crearne uno da zero, la **Libreria itinerari** raccoglie programmi già pronti. Aprirli e salvarli non costa crediti.',
    sezioni: [
      { h: 'Che cosa sono gli itinerari della Libreria', corpo: [['lista', ['Itinerari **già generati e controllati**: un motore li scrive e **un secondo li revisiona** con un punteggio ★; le tappe inventate vengono tolte o sostituite e i siti web non più raggiungibili vengono eliminati.', 'La scheda dice «Centinaia di itinerari pronti» (l\'app non mostra il totale esatto). Il badge **«✓ Verificato da N AI»** conta i motori **diversi** usati per il controllo.', 'La qualità è più uniforme di un itinerario generato al momento.', '**Usarli è gratis.**']]] },
      { h: 'Tutorial: trovare e usare un itinerario pronto', corpo: [['passi', [
        'Apri **Itinerario › 📚 Libreria itinerari**. Compare la ricerca **«Cerca città, porto, tema…»**.',
        'Scegli il **primo livello**: Tutti, 🧭 Viaggio & trasporti, 📍 Città, 🍷 Mangiare e bere, 🌊 Natura e stagioni, 🎭 Ispirazioni culturali, 🧭 Tematici, 🌿 Esperienze a tema.',
        'Scegli il **secondo livello** (circa 45 voci). Esempi: Crociera, Scalo, Ciclovie · Strade del gusto, Sagre e fiere, Vino · Mare, Neve, Fioriture, Fauna · Cinema, Libri, Musica, Arte, Storia, Sport, Moda · Terme, Set di film, Cieli bui, Street art, Mercatini, Cammini · Botteghe, Wellness, Musei d\'impresa.',
        'Affina con i filtri: **Ore sosta** (tutte, fino a 4/6/8/10/12 h: conta solo per porti e aeroporti), **Giorni** (tutti, oppure da 1 a 7: corrispondenza esatta) e il chip **📍 città** (si toglie con ✕).',
        'Leggi le card. Quelle pronte mostrano titolo, città, ore o giorni, tema, ☀️ **periodo migliore**, ★ voto e badge «Verificato». Le card tratteggiate **«🪄 1 minuto · Genera»** non sono ancora pronte. **«Scopri di più»** mostra altre 120 card.',
        'Tocca una card pronta per l\'**anteprima**: info di viaggio, tappe con orari, budget e il badge 🎧 sui musei con guida.',
        'Tocca **«Usa questo itinerario (gratis)»**: se ne crea una copia tua (titolo con 📚) che apri e modifichi come gli altri.',
      ]]] },
      { h: 'Unire più itinerari', corpo: [['passi', ['Tocca il **+** su una card pronta (diventa ✓). Con un solo itinerario la barra dice «Scegline un altro».', 'Dal secondo in poi la barra dice **«Unisci (gratis)»** con il totale dei giorni.', 'Il server toglie le tappe doppie e crea un unico itinerario.']], ['p', 'Se cerchi un numero di giorni che non esiste (per esempio 7), WIP propone una **combinazione** di itinerari pronti: «Nessun itinerario da N giorni, ma questi insieme li coprono» → **«Usa questa combinazione»**.'] ] },
      { h: 'Se non trovi quello che cerchi', corpo: [['lista', ['**«Cerca come…»**: con una ricerca di 2+ lettere su un tema culturale, compaiono i pulsanti «· film», «· libro», «· artista o brano», «· opera o artista», «· evento storico», «· luogo sportivo»: i luoghi sono verificati su Wikidata.', '**«🪄 Genera»** su una card tratteggiata prepara l\'itinerario in circa **1 minuto** (serve l\'accesso); non consuma crediti.']]] },
      { h: 'Dopo averlo aperto', corpo: [['lista', ['Si modifica come un itinerario normale (vedi «Modificare un itinerario»).', 'Per seguirlo usa **Naviga** sulle tappe o crea un **giro** con le audioguide.', 'Se ti serve un giorno in più, «Aggiungi un giorno» costa 12 crediti, **la metà se il giorno arriva dalla Libreria**.']]] },
    ],
    manca: ['Il numero totale degli itinerari della Libreria non è mostrato nell\'app: la scheda dice «centinaia».', 'Il badge «controllati da due AI indipendenti» non è sempre vero: in alcuni casi il controllo è dello stesso motore (il badge conta quelli diversi).'],
    correlate: ['itinerari', 'navigatore', 'gratis-e-crediti'],
    faq: [['La Libreria è davvero gratis?', 'Sì, consultare e salvare gli itinerari non costa crediti.']],
  },
  /* ───────────────────────── NAVIGATORE ───────────────────────── */
  {
    slug: 'navigatore', titolo: 'Il navigatore di WIP: WipNav, i giri e le app di mappe', breve: 'Navigatore', macro: 'viaggi',
    meta: 'Come navigare con WIP: WipNav a piedi con voce, giro con audioguide, percorso su misura e apertura in Google Maps o Apple Mappe. Cosa funziona a schermo spento.',
    lead: 'WIP ha tre modi di arrivare dove vuoi: **WipNav** (a piedi, con la voce), il **giro** con le audioguide e il **percorso su misura**. Per l\'auto si passa a Google Maps.',
    sezioni: [
      { h: 'Naviga da un luogo', corpo: [['passi', ['Apri la scheda di un luogo.', 'Tocca **Naviga**.', 'Scegli: **WipNav** (solo a piedi), **Google Maps**, oppure **Apple Mappe** (solo su iPhone).']], ['p', 'WipNav annuncia ogni svolta a circa 150 m e a 30 m con una vibrazione diversa per destra e sinistra. Nell\'app per iPhone e Android la voce continua anche con lo schermo spento.']] },
      { h: 'Giro con le audioguide', corpo: [['passi', ['Accendi il radar con le cuffie (tasto **Guida**).', 'Dal radar o dal giorno di un itinerario scegli **Crea il giro** (fino a 10 tappe; fino a 30 se creato da «Tutto nel raggio»).', 'Tocca **Avvia il giro** e poi **Avvia la navigazione**.', 'A ogni tappa il giro annuncia l\'arrivo e fa partire l\'audioguida; ristoranti e pause sono tappe mute (si sente solo il nome).']], ['costo', 'La navigazione multi-tappa del giro richiede il **Day Pass**.']] },
      { h: 'Percorso su misura', corpo: [['p', 'Dalla mappa, **Componi un percorso**: «Personale» (scegli tu i luoghi), «Gemme intorno a me» o «A tempo» (1 ora, 2 ore, mezza giornata). Costa **30 crediti** con 3 modifiche incluse; non include audioguida.']] },
    ],
    manca: ['WipNav è solo **a piedi**: per auto e bici usa Google Maps.', 'Se a schermo spento sbagli strada, la voce lo segnala ma il **ricalcolo** avviene solo riaprendo l\'app.', 'Non c\'è un planner interno per i mezzi pubblici (c\'è il link «Mezzi» a Google Maps).'],
    correlate: ['itinerari', 'audioguide', 'web-iphone-android'],
    faq: [['WipNav funziona a schermo spento?', 'Nell\'app per iPhone e Android sì; sul web no.'], ['Posso navigare in auto?', 'Usa il pulsante per aprire Google Maps (o Apple Mappe su iPhone).']],
  },
  /* ───────────────────────── EVENTI ───────────────────────── */
  {
    slug: 'eventi', titolo: 'Eventi, mostre e mercatini con WIP', breve: 'Eventi', macro: 'eventi',
    meta: 'Come cercare eventi, mostre in corso, collezioni permanenti, mercatini, fioriture e cieli stellati con WIP: filtri di distanza, data, gratuiti e tipo.',
    lead: 'La scheda **Eventi** ha tre viste — **Eventi**, **Mostre**, **Stagionali** — e una barra di filtri fissa in basso. Consultarla è gratuito.',
    sezioni: [
      { h: 'Le tre viste', corpo: [['lista', ['**🎪 Eventi**: concerti, sagre, mercati, tour e biglietti da portali locali e partner.', '**🖼️ Mostre**: «In corso» (mostre temporanee dai siti dei musei e da altri archivi) e «Permanenti» (le collezioni dei musei della zona).', '**🌸 Stagionali**: cieli stellati, mercatini, fioriture.']]] },
      { h: 'Tutorial: trovare eventi in una data', corpo: [['passi', ['Apri la scheda **Eventi**.', 'La ricerca parte dalla tua posizione; se hai un itinerario recente, puoi usare la sua destinazione con un tocco.', 'In basso scegli la **distanza** (100, 300 o 500 km).', 'Imposta le date «dal … al …» e, se vuoi, **Solo gratis**.', 'Scegli il tipo: Concerti, Sagre, Mercati, Tour, Biglietti.', 'Ordina per **data** o per rilevanza e tocca **Naviga** o il link del partner sulla scheda.']]] },
      { h: 'Come sono costruiti i dati', corpo: [['p', 'Gli eventi arrivano da portali locali e da partner (Ticketmaster, Viator, GetYourGuide, Tiqets, Klook, Trip.com). I biglietti si acquistano sul sito del partner, che riconosce a WIP una commissione. Gli eventi passati non vengono mostrati come futuri.']] },
    ],
    manca: ['Non tutte le città hanno la stessa copertura: nelle zone piccole l\'elenco può essere breve.', 'Non c\'è filtro per «famiglie» come categoria dedicata.'],
    correlate: ['musei-cultura', 'itinerari', 'gratis-e-crediti'],
    faq: [['Gli eventi sono gratuiti?', 'Consultare l\'elenco è gratis; il biglietto dipende dall\'evento. C\'è il filtro «Solo gratis».'], ['Cosa sono gli stagionali?', 'Eventi legati al periodo: cieli stellati, mercatini, fioriture.']],
  },
  /* ───────────────────────── SERVIZI ───────────────────────── */
  {
    slug: 'servizi-utili', titolo: 'Servizi utili e famiglie: farmacie, fontanelle, ricarica, parchi giochi', breve: 'Servizi utili', macro: 'servizi',
    meta: 'Come trovare in fretta farmacie, ospedali, fontanelle, stazioni, taxi, ricariche elettriche e luoghi per famiglie con WIP in una città che non conosci.',
    lead: 'In una città sconosciuta il problema è spesso «dov\'è la farmacia più vicina?». La chip **Utilità** risponde in due tocchi; la chip **Famiglie** raccoglie parchi giochi, zoo e acquari.',
    stat: ['servizi', 'famiglie'],
    sezioni: [
      { h: 'Utilità: cosa puoi cercare', corpo: [['passi', ['Tocca **＋ Altro** e accendi **🛠️ Utilità**.', 'Sotto la barra scegli: **Farmacia, Ospedale, Mercati, Fontanelle, Stazione FS, Metro, Taxi, Autostrada (casello), Ricarica EV**.', 'Tocca il pin più vicino e **Naviga**.']], ['p', 'Il livello **🚰 Fontanelle, bagni, panchine** (da Livelli) mostra i punti d\'acqua, i servizi igienici e le panchine entro circa 2 km dal centro della mappa.']] },
      { h: 'Famiglie', corpo: [['p', 'La chip **🛝 Famiglie** ha: Parco Giochi, Divertimenti, Acquario, Zoo.']] },
    ],
    manca: ['I **parcheggi** non hanno un filtro dedicato.', 'Non ci sono filtri per aeroporti, banche/bancomat, lavanderie, supermercati né servizi per disabili o animali.', 'Il trasporto pubblico non ha un planner: c\'è il link «Mezzi» a Google Maps negli itinerari.'],
    correlate: ['mappa-e-ricerca', 'natura-percorsi', 'navigatore'],
    faq: [['Trovo un parcheggio?', 'Non c\'è una chip dedicata ai parcheggi.'], ['Trovo le colonnine di ricarica?', 'Sì: tra i filtri di Utilità c\'è «Ricarica EV».']],
  },
  /* ───────────────────────── GRATIS ───────────────────────── */
  {
    slug: 'gratis-e-crediti', titolo: 'Cosa è gratis e cosa usa i crediti in WIP', breve: 'Gratis e crediti', macro: 'viaggi',
    meta: 'Cosa è gratuito in WIP e cosa costa crediti: schede dei luoghi, mappa, Libreria itinerari, teaser, WipNav; audioguida completa, itinerari, Day Pass, Visita Museo.',
    lead: 'WIP funziona a **crediti**: quelle che servono ricerca e consultazione sono gratis, quelle che richiedono generazione di contenuti o servizi esterni costano crediti. I crediti non scadono.',
    sezioni: [
      { h: 'Gratis', corpo: [['lista', ['Mappa, livelli e schede dei luoghi (descrizioni, foto, orari).', 'WipNav a piedi.', 'Avvisi di avvicinamento e **teaser** vocali.', 'Libreria itinerari e mappe offline.', 'WIP Community.', 'Eventi e Mostre.', 'Diario e Missioni.', 'Audioguide «Consigli».']]] },
      { h: 'A crediti', corpo: [['tabella', [['Servizio', 'Crediti'], ['Audioguida completa (per luogo, tua per sempre)', '15'], ['Day Pass (24 ore, fino a 40 guide)', '200'], ['Itinerario con AI', '10 al giorno'], ['Sostituire una tappa (dopo la quota gratuita)', '8'], ['Aggiungere un giorno o una tappa vicina', '12'], ['Guida d\'Autore PDF', '20 al giorno'], ['Podcast del viaggio', '15 al giorno'], ['Scansione Vision (foto)', '5'], ['Chat con WIP', '3 ogni 10 messaggi'], ['Pass Museo (40 scansioni in 4 ore)', '100'], ['Visita Museo (per museo, senza scadenza)', '200'], ['Percorso su misura (3 modifiche incluse)', '30']]], ['p', 'Il listino aggiornato è sempre in app: **Profilo › Listino**.']] },
      { h: 'Come si ottengono i crediti', corpo: [['lista', ['Acquisto in **Profilo › Shop** (pacchetti City-Break, Settimana, Tour Operator). Il prezzo in euro è quello mostrato dallo store o dal pagamento; **non è fisso in questa pagina**.', 'Guadagnandoli: **Missioni**, punti esperienza e quiz di caricamento (si consumano prima quelli guadagnati).', 'Con un **coupon** in Profilo › SETUP › «Hai un coupon promozionale?» (non disponibile su iPhone).']], ['p', 'Pagamenti: sull\'app nativa tramite store, sul web con Stripe. Con la **Garanzia pioggia** puoi riavere i crediti di un giorno di itinerario se è piovuto molto.']] },
    ],
    manca: ['Non ci sono abbonamenti: solo pacchetti di crediti e Day Pass.'],
    correlate: ['audioguide', 'itinerari', 'web-iphone-android'],
    faq: [['I crediti scadono?', 'No.'], ['Posso usare WIP senza spendere?', 'Sì: mappa, schede, WipNav a piedi, teaser, Libreria itinerari ed Eventi sono gratis.'], ['Quanto costa un pacchetto?', 'Il prezzo lo mostra lo store (o il pagamento sul web): cambia per Paese.']],
  },
  /* ───────────────────────── PIATTAFORME ───────────────────────── */
  {
    slug: 'web-iphone-android', titolo: 'WIP sul web, su iPhone e su Android', breve: 'Web, iPhone e Android', macro: 'viaggi',
    meta: 'Cosa cambia usando WIP dal browser, da iPhone o da Android: schermo spento, offline, acquisti, apri mappe, link agli store.',
    lead: 'L\'app per iPhone e Android è la stessa di wip.guide, con in più le funzioni che servono con il telefono in tasca: **schermo spento, offline e acquisti nello store**.',
    sezioni: [
      { h: 'Confronto', corpo: [['tabella', [['Funzione', 'Web', 'iPhone / Android'], ['Mappa, livelli, schede', 'Sì', 'Sì'], ['Itinerari, PDF, Libreria', 'Sì', 'Sì'], ['Audioguide automatiche', 'Solo con la pagina aperta', 'Sì, anche a schermo spento'], ['WipNav (voce a piedi)', 'Con la pagina aperta', 'Anche a schermo spento'], ['Pacchetti offline', 'No', 'Sì'], ['Acquisti', 'Stripe', 'Store (RevenueCat)'], ['Apri Mappe (Apple)', 'No', 'Solo iPhone'], ['Sblocco biometrico, widget, notifiche', 'No', 'Sì']]], ['p', 'Su iPhone e Android l\'audioguida **ascolta la posizione** anche con lo schermo spento: per questo serve il permesso di posizione «Sempre».']] },
      { h: 'Scarica l\'app', corpo: [['store']] },
    ],
    manca: ['Gli screenshot sono quelli del sito: non sostituiscono quelli dell\'app nativa.'],
    correlate: ['audioguide', 'navigatore', 'gratis-e-crediti'],
    faq: [['Devo installare qualcosa per provarla?', 'No: wip.guide si apre nel browser.'], ['Perché serve la posizione «Sempre»?', 'Per far partire le audioguide quando arrivi, anche con lo schermo spento.']],
  },
  /* ───────────────────────── TUTORIAL ───────────────────────── */
  {
    slug: 'tutorial', titolo: 'Tutorial e percorsi di apprendimento', breve: 'Tutorial', macro: 'viaggi',
    meta: 'Percorsi brevi per imparare WIP: iniziare, esplorare una città, organizzare un viaggio, scoprire la cultura, outdoor e gastronomia.',
    lead: 'Sei percorsi brevi. Ogni lezione è una pagina della guida: segnala quelle che hai letto, il progresso resta sul tuo dispositivo e non serve registrarsi.',
    percorsi: [
      { n: 'Inizia con WIP', l: ['mappa-e-ricerca', 'gratis-e-crediti', 'web-iphone-android'] },
      { n: 'Esplora una città', l: ['mappa-e-ricerca', 'categorie', 'servizi-utili', 'navigatore'] },
      { n: 'Organizza un viaggio', l: ['itinerari', 'libreria-itinerari-gratuiti', 'navigatore', 'meteo-neve'] },
      { n: 'Scopri la cultura', l: ['musei-cultura', 'audioguide', 'eventi'] },
      { n: 'Outdoor', l: ['natura-percorsi', 'sentieri-e-ciclovie', 'meteo-neve', 'mare-spiagge'] },
      { n: 'Gastronomia', l: ['ristoranti-gastronomia', 'ristoranti-senza-glutine', 'ristoranti-stellati', 'vino-e-gusto'] },
    ],
    tipi: [
      { n: 'Amanti della gastronomia', l: ['ristoranti-gastronomia', 'vino-e-gusto', 'ristoranti-stellati'] },
      { n: 'Chi ama la bicicletta', l: ['sentieri-e-ciclovie', 'servizi-utili'] },
      { n: 'Escursionisti', l: ['natura-percorsi', 'meteo-neve', 'servizi-utili'] },
      { n: 'Famiglie', l: ['servizi-utili', 'eventi', 'mare-spiagge'] },
      { n: 'Appassionati di cultura', l: ['musei-cultura', 'audioguide', 'itinerari'] },
      { n: 'Chi ama il mare', l: ['mare-spiagge', 'meteo-neve'] },
      { n: 'Chi viaggia in auto', l: ['navigatore', 'audioguide', 'servizi-utili'] },
      { n: 'Chi cerca esperienze gratuite', l: ['libreria-itinerari-gratuiti', 'gratis-e-crediti', 'eventi'] },
    ],
    correlate: ['categorie', 'domande-frequenti'],
    faq: [['Devo registrarmi per seguire i tutorial?', 'No. Il progresso è salvato solo nel tuo browser.']],
  },
  /* ───────────────────────── AUDIOGUIDA LIBERA ───────────────────────── */
  {
    slug: 'audioguida-libera', titolo: 'Audioguida libera: avviso, arrivo, scheda e lettore, passo per passo', breve: 'Audioguida libera', macro: 'audio', padre: 'audioguide',
    meta: 'Tutorial dell\'audioguida libera di WIP: il tasto Guida, la card di avvicinamento, cosa succede all\'arrivo, tutti i controlli del lettore e come si paga.',
    lead: '«Libera» significa senza un percorso scelto: accendi la Guida, cammini dove vuoi e WIP ti parla dei luoghi che incontri. Qui è spiegato tutto, dal tasto alla spesa dei crediti.',
    sezioni: [
      { h: 'Il tasto Guida e il silenziatore', corpo: [['passi', ['Nella barra in basso tocca **GUIDA** (cuffie). È un interruttore: spenta è grigia, accesa si colora e ha un **pallino che pulsa**.', 'Quando la accendi l\'app sblocca l\'audio, ti propone di scaricare le audioguide per l\'offline e, sul web, chiede il permesso di posizione.', 'Sopra le cuffie compare un tondo: **🔊** voce attiva, **🔇** silenziata. Il silenziatore zittisce tutta la sintesi vocale, comprese le svolte di WipNav; il testo resta a schermo.', 'Accanto alla mappa compare il pulsante cuffie che apre il **Radar** (vedi la pagina del giro).']], ['nota', 'Sul **web** l\'audioguida funziona solo con la pagina aperta in primo piano (banner giallo «Esperienza Web Limitata»). Se la posizione è negata compare «Posizione non consentita»: consentila dal lucchetto del browser e ricarica. Per lo schermo spento serve l\'app.'] ] },
      { h: 'Cosa succede mentre cammini', corpo: [['tabella', [['Fase', 'Quando', 'Cosa vedi e senti'], ['Avviso', 'Entro la «Distanza Avviso» (150 m a piedi, 300 m in auto, regolabili)', 'Una card in basso con distanza in metri di strada, freccia di direzione e i pulsanti **Ascolta** e **➤ Naviga**; un beep e una vibrazione.'], ['Arrivo', 'Entro la «Distanza Inizio Guida» (30 m a piedi, 50 m in auto, regolabili)', 'Si apre la **scheda del luogo**; due beep e vibrazione. In **Automatica** parte da sola la guida; in **Semi-Automatica** la scheda si apre ma l\'audio parte solo se tocchi Ascolta.']]], ['lista', ['**La card di avviso**: la X la chiude e quel luogo non ricompare per 30 minuti; se è già stato annunciato non si riannuncia per 10 minuti. Al massimo 2 card, poi «+N altri luoghi vicini» con **PULISCI**.', 'Il pulsante dice **«🪙 15 | Ascolta»** se il luogo non è tuo; solo **«🔊 Ascolta»** se hai il Day Pass o l\'hai già pagato.', 'Per non disturbare: al massimo un avviso ogni 20 secondi e mai per nomi «grezzi» (numeri, targhe).', 'I luoghi senza porta (piazze, parchi, ponti, panorami, spiagge) scattano quando **entri** nell\'area.', 'Con precisione GPS peggiore di **50 m** l\'app non decide nulla.', 'Un luogo ascoltato non riparte per **24 ore** («Azzera storico» nel Setup).']] ] },
      { h: 'Il lettore, comando per comando', corpo: [['tabella', [['Comando', 'Cosa fa'], ['Nicky / Dante / 🎭 Duetto', 'Cambia la voce (il Duetto è un dialogo a due voci). Cambiare voce ferma l\'audio e rigenera il testo.'], ['CHIEDI 🎤', 'Metti in pausa e fai una domanda («Es. In che anno è stato costruito?», minimo 3 caratteri), scritta o dettata. La risposta (massimo 120 parole) viene letta a voce; poi tocchi «Riprendi». Serve consenso AI e accesso.'], ['Megafono', 'Effetto voce da megafono; disattivato se il dispositivo non lo supporta.'], ['Ricomincia', 'Torna all\'inizio.'], ['Play / Pausa', 'Il grande tondo (rosso quando suona).'], ['Avanti 10 s', 'Salta 10 secondi.'], ['Velocità', 'Cicla 1× → 1,5× → 2× → 1×.'], ['Sleep', 'Cicla spento → 10 → 20 → 30 minuti; allo scadere l\'audio si ferma.'], ['Riprendi da…', 'Compare se eri rimasto più avanti («eri a …»).'], ['🎧 Audio direzionale', 'In cuffia il suono arriva dalla direzione del luogo; usa la bussola.'], ['🤫 Modalità silenziosa', 'Ai trigger automatici niente voce: vibrazione e testo da leggere. Il play manuale suona sempre.'], ['Ascolta Approfondimento', 'Racconto più ampio (fino a 3 livelli); non resta in cache.'], ['Ferma audio e torna', 'Chiude il lettore.'], ['Trascrizione', 'La frase in ascolto è evidenziata.']]], ['p', 'A fine guida può comparire **«Com\'era il momento dell\'audioguida?»** con «⏱ Momento giusto», «⏰ Troppo presto», «📍 Non ero qui» (al massimo una volta ogni 30 minuti): aiuta a migliorare i trigger. Non c\'è un controllo del volume: si usa quello del telefono.'] ] },
      { h: 'Quanto costa e quando', corpo: [['lista', ['Si valuta in quest\'ordine: guida già ascoltata o posseduta, audio scaricato o gratuito → **nessun costo**; poi **Day Pass attivo** → nessuna finestra, scala un contatore; altrimenti compare **«Conferma Servizio — Stai usando 15 crediti per Audioguida POI»** con saldo e pulsanti **Annulla** / **Conferma**.', 'Il costo viene addebitato **quando la voce parte davvero**. Se non parte dopo il pagamento, la guida è già tua e non la paghi di nuovo.', 'Con crediti insufficienti compare «Crediti Insufficienti» e «Ricarica Crediti».']], ['p', '**Day Pass**: 200 crediti, 24 ore, fino a 40 guide, anche offline e a schermo spento. La card compare nel Profilo, in Mappe offline e negli itinerari: tocca «Acquista ora · 200 crediti» e di nuovo per confermare. Stato attivo: «Attivo — N guide rimaste, scade alle …». Il contatore conta **una volta per luogo**.']] },
      { h: 'Mini-player e offline', corpo: [['lista', ['Una barra sopra la barra in basso mostra il titolo e «In riproduzione» / «In pausa» con Play/Pausa e X.', 'Da **Itinerario** puoi aprire **«Scarica per Offline»**: scarichi i file audio permanenti (15 + 5 = 20 crediti a tappa culturale) oppure, gratis, solo la mappa e le strade.', 'Il Day Pass include le guide delle prossime 24 ore: il bundle serve solo se vuoi i file per sempre.', 'Gli ascolti si ritrovano in **Profilo › ARCHIVIO** e si riascoltano gratis.']]] },
    ],
    manca: ['Non puoi scegliere a mano «a piedi» o «in auto»: lo capisce l\'app dalla velocità.', 'Non c\'è un controllo del volume né un equalizzatore.', 'I registri «Breve» e «Bimbi» non sono più selezionabili.', 'Se la modalità Automatica scala i crediti senza mostrare la conferma a telefono bloccato dipende dall\'app nativa: il Setup lo dichiara, qui non è verificato.'],
    correlate: ['audioguide', 'giro-con-audioguida', 'profilo-e-setup'],
    faq: [['Cosa succede se chiudo la card di avviso?', 'Quel luogo non ricompare per 30 minuti.'], ['Come silenzio tutto?', 'Con il tondo 🔊/🔇 sopra le cuffie: silenzia anche le svolte di WipNav.'], ['Perché la scheda si è aperta ma non parla?', 'Sei in Semi-Automatica (tocca Ascolta) o in modalità silenziosa.']],
  },
  /* ───────────────────────── GIRO CON AUDIOGUIDA ───────────────────────── */
  {
    slug: 'giro-con-audioguida', titolo: 'Il Giro con audioguida: Radar, tappe, cruscotto e Day Pass', breve: 'Giro con audioguida', macro: 'audio', padre: 'audioguide',
    meta: 'Come creare e seguire un Giro con audioguida in WIP: Radar, tempo che hai, arrivo, ordine, Lungo la strada, cruscotto, stati della tappa, pausa, ricalcolo e Day Pass.',
    lead: 'Il **Giro** è l\'audioguida con un percorso: scegli fino a 10 luoghi, WIP li mette in ordine, ti guida con la voce e a ogni tappa parte l\'audioguida. **Crearlo è gratis; per navigare serve il Day Pass.**',
    sezioni: [
      { h: 'In breve', corpo: [['lista', ['Si crea dal **Radar Audioguida** (pulsante cuffie sulla mappa) oppure dal giorno di un itinerario con **«Nel radar (N)»**.', 'Fino a **10 tappe** («Giro pieno: dieci tappe al massimo»).', '**Creare** il giro e vederne l\'anteprima: gratis. **«Avvia la navigazione»**: richiede il **Day Pass** (200 crediti).', 'Per una sola tappa basta **Naviga**, gratis.']]] },
      { h: 'Tutorial: crea il tuo giro', corpo: [['passi', [
        'Accendi **GUIDA** e tocca il pulsante cuffie sulla mappa: si apre il **Radar Audioguida** («N luoghi monitorati»).',
        'Per ogni luogo che vuoi, tocca **+**: diventa il numero d\'ordine (lo stesso del pin). Un tocco sul numero lo toglie. Il cestino toglie il luogo dal radar.',
        'Scegli **«Tempo che hai»**: 30′, 1 h, 1 h 30, 2 h, 3 h, 4 h o Tutto. WIP tiene le tappe che ci stanno (cammino più circa 3 minuti di ascolto a tappa) e dice «Nel tempo che hai ci stanno N tappe su M».',
        'Scegli **«Arrivo»**: 🔁 Torno da dove parto · Torno dove mi trovo · 🏁 Finisco all\'ultima tappa · 🗺️ Solo il giro, dalla 1ª tappa (utile da casa).',
        'Controlla l\'**anteprima** («12,3 km · 45 min a piedi · ad anello da dove sei»). Sopra 8 km compare un avviso sul lungo cammino.',
        'Facoltativo, **ordine**: WIP mette le tappe nell\'ordine che fa camminare meno; trascina ⠿ per cambiarlo, X per togliere, **«Riordina per me»** per tornare all\'ordine automatico.',
        'Facoltativo, **«Lungo la strada · N posti che il giro sfiora»**: tocca il **+** verde per aggiungerli. Gli altri li sentirai passando, se sono a meno di 40 m.',
        'Tocca **«Crea il giro»** (o «Crea il giro (N)»). Stato: **«Pronto a partire»**.',
        'Tocca **«Avvia la navigazione»**. Senza Day Pass si apre la cassa: **«Acquista ora»**. Appena attivato, il giro parte da solo.',
      ]]] },
      { h: 'Dal giorno di un itinerario', corpo: [['p', 'Nell\'intestazione di ogni giorno tocca **«Nel radar (N)»**: porta le tappe del giorno (massimo 10) nel Radar. Ristoranti, pause e trasferimenti restano tappe **mute**: si annuncia solo «Sei arrivato a …», senza audioguida né costi.']] },
      { h: 'Il cruscotto durante il giro', corpo: [['tabella', [['Cosa vedi', 'Significato'], ['TAPPA 2 / 5, nome e metri alla porta', 'Dove sei nel giro; «poi:» la prossima tappa.'], ['N km mancanti · N km in tutto · arrivo ~HH:MM', 'Stima a 4 km/h, senza contare l\'ascolto.'], ['☔ pioggia probabile (n%)', 'Compare dal 50% in su.'], ['🚇 Mezzi', 'Solo per tratte da 1,5 km: apre Google Maps con i mezzi pubblici.'], ['Pausa / Riprendi', 'Metti il giro in pausa.'], ['Riascolta', 'Rilegge la guida della tappa (non c\'è nel percorso su misura).'], ['Salta questa tappa', 'Passa alla successiva.'], ['Ricalcola il percorso da qui', 'Ridisegna dalla tua posizione («Percorso ricalcolato da dove sei»).'], ['Vai alla prossima tappa', 'Compare quando sei in tappa e la guida è finita: segna la tappa fatta.'], ['▼ Riduci il cruscotto', 'Lo nasconde in una barretta (toccala per riaprirlo).'], ['X Termina il giro', 'Due tocchi: il primo arma la X (diventa rossa), il secondo chiude. Le tappe fatte e il percorso vanno persi.']]], ['p', 'La **card blu** in alto dà la svolta con i metri; la X la nasconde per quella tappa ma **non ferma il giro**. Con 🔊 ripeti l\'istruzione, con ↻ ricalcoli.'] ] },
      { h: 'Come il giro capisce a che punto sei', corpo: [['tabella', [['Stato', 'Quando', 'Cosa succede'], ['In arrivo', 'A distanza «Avviso a piedi» (150 m predefiniti, almeno soglia d\'arrivo + 20 m)', 'Teaser breve.'], ['All\'ingresso', 'A «Distanza Inizio Guida» (30 m predefiniti)', 'Parte l\'audioguida e si apre la scheda. Se non si apre, la apre il giro dopo 8 secondi.'], ['In pausa', '180 secondi fermo', 'Pausa vera (non un semaforo).'], ['Deviato', 'Oltre 70 m dal tracciato per 15 secondi', 'Ricalcolo automatico: «Sei fuori percorso: ricalcolo il giro da qui.»'], ['Finito', 'Ultima tappa raggiunta', '«Giro finito»: Salva nei miei itinerari, Condividi, Nuovo giro da qui.']]], ['lista', ['**Tappa sfiorata**: ti sei avvicinato a meno di 60 m e ti allontani di oltre 40 m: risulta fatta.', '**Incontri lungo la strada**: un luogo del radar entro 40 m dal percorso e da te riceve un teaser («Sulla tua strada»), una volta per giro.', '**X sulla mappa**: se togli una tappa, WIP propone un sostituto entro 250 m («Lo metto al suo posto?» Sì/No, scade in 2 minuti).', 'Due tappe a meno di 60 m contano come una sosta.', '**Pre-scarico**: «Preparo le tappe per l\'offline…» scarica testi e audio; «Riprova» se qualcuno manca.']]] },
    ],
    manca: ['Il giro a più tappe non si naviga senza Day Pass (l\'anteprima sì).', 'Le soglie di avviso e di deviazione del giro non si cambiano; si cambiano le distanze di avviso e arrivo in GeoControl.'],
    correlate: ['audioguida-libera', 'percorso-su-misura', 'wipnav-passo-passo', 'tour-di-gruppo'],
    faq: [['Creare il giro costa qualcosa?', 'No. Serve il Day Pass solo per avviare la navigazione del giro a più tappe.'], ['Posso cambiare una tappa mentre cammino?', 'Sì: toglila con la X sulla mappa (WIP propone un sostituto) o usa «Salta questa tappa».'], ['Chiudere la card blu ferma il giro?', 'No: il giro si ferma solo dal cruscotto con la X.']],
  },
  /* ───────────────────────── WIPNAV ───────────────────────── */
  {
    slug: 'wipnav-passo-passo', titolo: 'WipNav: il navigatore a piedi con la voce, passo per passo', breve: 'WipNav passo per passo', macro: 'viaggi', padre: 'navigatore',
    meta: 'Come usare WipNav: avvio da un luogo, punto di partenza, luoghi lungo la strada, card blu, voce e preavvisi, fuori percorso, ricalcolo, arrivo e schermo spento.',
    lead: '**WipNav** è il navigatore a piedi dell\'app: ti guida con la voce e, lungo la strada, fa partire da sole le audioguide dei luoghi che scegli. È **gratuito**.',
    sezioni: [
      { h: 'Come si avvia', corpo: [['passi', [
        'Apri la scheda di un luogo e tocca **Naviga** (oppure la freccia nel Radar, il pulsante verde sulla mappa o **➤ Naviga** sulla card di avviso).',
        'Nel foglio che si apre scegli **🚶 A piedi** («Con WIP Nav: audioguide lungo il percorso»). Se serve, spunta **♿ Evita scale** (passeggini, mobilità ridotta). **🚗 In auto** apre Google Maps (su iPhone anche Mappe).',
        'Nel foglio **WIP Nav** scegli il **punto di partenza**: **«Dalla mia posizione»** oppure **«Indirizzo Personalizzato»** (scrivi almeno 3 lettere e scegli tra 5 suggerimenti).',
        'Vedi **«i luoghi che incontrerai lungo la strada»** (entro 60 m dal percorso): sono tutti spuntati e l\'audioguida parte da sola solo per quelli selezionati. Togli la spunta a quelli che non vuoi.',
        'Tocca **«Inizia navigazione»** (o **Salta** se non vuoi luoghi lungo la strada). Il tracciato si disegna in giallo con la bandierina 🏁.',
      ]], ['nota', 'In modalità itinerario le righe diventano «A piedi, con l\'audioguida» e «In auto, tutto il giorno» (Google Maps con tutte le tappe, massimo 10).'] ] },
      { h: 'La card blu: cosa vedi e cosa tocchi', corpo: [['tabella', [['Elemento', 'Significato'], ['Freccia di manovra e distanza alla svolta', 'Dritto, svolta, rotonda, partenza, ricalcolo, bandierina. Pulsa con la svolta entro 30 m.'], ['Istruzione', 'Due righe di testo.'], ['🔊 Ripeti istruzione', 'Ripete la frase a voce.'], ['↻ Ricalcola il percorso da qui', 'Sempre disponibile, senza soglie.'], ['X', 'Ferma la navigazione.'], ['Piede: luogo, 🏁 metri, 🔀 svolte, 🕐 minuti e orario', 'Distanza e tempi lungo il tracciato, non in linea d\'aria.'], ['Gemma a N m dal percorso: Deviare / Ignora', 'Compare per gemme tra 25 e 120 m dal tracciato; dopo la gemma «Riprendi verso …».'], ['Salta tappa / Vai alla prossima tappa', 'Solo se la tappa fa parte di un itinerario con altre tappe.']]]] },
      { h: 'Voce, lingua e preavvisi', corpo: [['lista', ['La frase segue la **lingua dell\'app** (7 lingue); i nomi delle vie sono letti nella lingua del paese.', 'Preavviso: «**Tra N metri**, …» a circa **150 m** (non sotto 60 m) e «gira adesso» a **30 m**. Agganciato al tracciato, i preavvisi seguono la tua velocità (circa 70 secondi prima della svolta). **Non sono configurabili.**', 'Nessun preavviso per «continua dritto».', '**Vibrazione** (solo app): svolta a **sinistra** = due impulsi, **destra** = uno forte; anche all\'arrivo.', '**Silenziare**: non c\'è un tasto per WipNav da solo; vale il tondo 🔊/🔇 del tasto Guida. Il testo resta a schermo.', '**«Girati»**: all\'inizio, se sei rivolto nella direzione opposta al percorso, WipNav lo dice.']]] },
      { h: 'Fuori percorso, ricalcolo, arrivo', corpo: [['tabella', [['Situazione', 'Cosa fa WipNav'], ['Sei a più di 45 m dal tracciato per 2 rilevazioni di fila', 'Ricalcola da solo e dice «Percorso ricalcolato» (pausa di 20 secondi tra un ricalcolo e l\'altro).'], ['Manca la rete', 'Continua sul vecchio tracciato e riprova dopo 20, 40, 80, 120 secondi.'], ['Arrivi (entro il tuo raggio d\'arrivo, 30 m predefiniti)', 'Dice «Sei arrivato a …», poi il teaser, poi parte l\'audioguida e si apre la scheda.'], ['Tracciato finito e meta a meno di 60 m, oppure 45 secondi entro 60 m', 'Arrivo dichiarato lo stesso.'], ['Tocchi la X', 'Ferma voce e cruscotto e toglie il tracciato.']]], ['p', 'Le rilevazioni GPS peggiori di 80 m non vengono usate.'] ] },
      { h: 'A schermo spento', corpo: [['p', 'Nell\'**app per iPhone e Android** il navigatore continua a dettare le svolte a schermo spento (notifica su Android, Live Activity su iPhone). Nel browser la pagina si ferma. Se a schermo spento sbagli strada, la voce lo segnala ma il ricalcolo avviene riaprendo l\'app. Lo schermo resta acceso mentre navighi, dove il telefono lo permette. Su Android serve la **posizione precisa** («Impostazioni › App › WIP › Posizione»).']] },
      { h: 'Se qualcosa non va', corpo: [['lista', ['**«Attiva il GPS o scegli un indirizzo di partenza»**: manca la posizione.', '**«Impossibile calcolare il percorso. Riprova.»**: nessuna delle fonti di percorso ha risposto, riprova.', 'Con un indirizzo di partenza personalizzato, ricalcolo e arrivo restano sospesi finché non sei sul percorso (entro 60 m).']]] },
    ],
    manca: ['WipNav è solo a piedi.', 'La distanza dei preavvisi (150 m e 30 m) non si cambia.', 'Non c\'è vibrazione sul web.', '«Mezzi» c\'è nel cruscotto del giro per le tratte lunghe, non nella card di WipNav.'],
    correlate: ['navigatore', 'giro-con-audioguida', 'profilo-e-setup'],
    faq: [['WipNav costa crediti?', 'No, è gratuito, anche dentro un giro.'], ['Posso cambiare quando mi avvisa?', 'No: i preavvisi sono automatici. Si cambia la distanza d\'arrivo in GeoControl.'], ['Funziona in auto?', 'No: per l\'auto usa Google Maps (o Mappe su iPhone) dal foglio «Naviga».']],
  },
  /* ───────────────────────── MODALITÀ DI CREAZIONE ITINERARI ───────────────────────── */
  {
    slug: 'creare-itinerario-tutte-le-modalita', titolo: 'Creare un itinerario: tutte le modalità e tutte le opzioni', breve: 'Creare un itinerario', macro: 'viaggi', padre: 'itinerari',
    meta: 'Le 10 voci del Trip Planner di WIP: Parla con WIP, Quando andare, Modalità Automatica, Preferiti, Raggio, Swip, Viaggio di gruppo, Libreria. Ogni campo e ogni opzione spiegati.',
    lead: 'La scheda **Itinerario** («Trip Planner») ha dieci porte d\'ingresso. Qui trovi **tutte**, con i passi, ogni campo del modulo, i valori predefiniti e il costo. Regola generale: la creazione costa **10 crediti per giorno** (1–30 giorni) e prima dell\'addebito compare **sempre** una conferma.',
    sezioni: [
      { h: 'Le dieci voci a colpo d\'occhio', corpo: [['tabella', [['Voce', 'A che serve', 'Costo'], ['Parla con WIP', 'Racconti il viaggio a voce o per iscritto, WIP chiede e compila il modulo.', 'Chat 3 crediti ogni 10 messaggi + 10/giorno'], ['📅 Quando andare', 'Il periodo migliore mese per mese (non crea un itinerario).', 'Gratis'], ['Modalità Automatica', 'Dici dove e per quanti giorni, l\'AI compone il programma.', '10 / giorno'], ['Dai Miei Preferiti', 'Ordina in un percorso i luoghi che hai salvato.', '10 / giorno'], ['Raggio', 'Scegli una base e un raggio: 3 alternative.', 'Alternative gratis; poi 10 / giorno'], ['Swip', 'Scorri le attrazioni e tieni quelle che ti piacciono.', 'Carte gratis; poi 10 / giorno'], ['👥 Viaggio di gruppo', 'Ognuno vota con un PIN, WIP fonde le preferenze.', 'Voti gratis; poi 10 / giorno'], ['📚 Libreria itinerari', 'Itinerari pronti e verificati.', 'Gratis'], ['I Miei Itinerari', 'I viaggi salvati.', 'Gratis'], ['I miei download', 'Quello che funziona senza rete.', 'Gratis']]], ['lista', ['I giorni vanno da **1 a 30**; le destinazioni fino a **5**: con 2 o più città i giorni si ripartiscono e i trasferimenti diventano tappe con km e tempi.', 'Il server accetta al massimo **30 itinerari al giorno** per utente. Serve accesso e connessione.', 'Ogni itinerario generato passa una **verifica automatica** delle tappe: sulle tappe vedi un badge ✓ o ⚠.']]] },
      { h: 'Modalità Automatica: ogni campo', corpo: [['passi', ['Apri **Itinerario › Modalità Automatica**.', 'Facoltativo: tocca un\'**ispirazione di stagione** (carte in orizzontale, 7 per volta, «Scopri di più» per le altre; chip: Tutti, 💎 Nascosti, 🏛 Storia, 🌊 Mare, ⛰ Montagna, 🎭 Cultura, ✨ Unicità). Il tocco **compila solo** destinazione, giorni, interessi e richieste, **senza generare e senza costi**.', 'Compila il modulo (tabella qui sotto).', 'Tocca **«WIP, Genera l\'itinerario»** (attivo con almeno 3 lettere di destinazione e connessione).', 'Compare la conferma dei crediti: **Conferma**. Se la destinazione non si trova, si ferma **prima** di addebitare.', 'L\'itinerario arriva a pezzi sullo schermo e poi si apre la vista del risultato.']], ['tabella', [['Campo', 'Valori e predefinito', 'Cosa cambia'], ['Destinazione', 'Testo, suggerimenti da 3 lettere; «➕ Aggiungi destinazione» fino a 5', 'Con più città il viaggio diventa un roadtrip. Con 3+ lettere compare «📖 I 5 imperdibili di {città}»: mini-guida gratuita con limite giornaliero.'], ['Durata Viaggio', '1–7 o campo «gg» (1–30); **2**', 'Giorni da generare (10 crediti ciascuno).'], ['Periodo / Mese', 'Indifferente (predefinito) o Gennaio…Dicembre; + **Data di partenza** facoltativa (non nel passato)', 'Il mese orienta stagione ed eventi; la data serve per il meteo dei giorni (Piano B, Garanzia pioggia).'], ['Inizio Giornata / Fine Giornata', '**09:00 / 20:00**', 'Finestra oraria di ogni giorno. Se la fine è prima dell\'inizio compare un errore.'], ['I Tuoi Interessi', '🏛️ Arte e Storia · 🍕 Gastronomia · 🌿 Natura e Relax · 🎒 Avventura · 🛍️ Shopping · 📸 Fotografia; nessuno scelto', 'Orientano le tappe; se scegli più voci le mescola.'], ['Dove alloggi (Opzionale)', 'Testo', 'Diventa il punto di partenza del Giorno 1. **Disattiva la cache.**'], ['Richieste Particolari (Opzionale)', 'Testo libero (es. «ristorante vegano, solo musei…»)', 'È un suggerimento all\'AI, non un filtro. **Disattiva la cache.**'], ['🎵 Includi Eventi Locali', 'Spento', 'Aggiunge concerti, sport, fiere vicini al periodo.'], ['🗺️ Includi Tour e Attività', 'Spento', 'Aggiunge esperienze e biglietti dei partner.'], ['🆓 Gratis', 'Spento', 'Solo tappe gratuite; i pasti sono esclusi.'], ['«Mostra Opzioni di Base» (il nome è fuorviante: apre le avanzate)', '—', 'Mostra: Budget, Viaggiatori, Ritmo, Guida.'], ['Budget', 'Economico · **Standard** · Lusso', 'Fascia di prezzo di locali e attività.'], ['Viaggiatori', 'Solo · **Coppia** · Famiglia · Gruppo', 'Adatta tappe e ritmo.'], ['Ritmo', 'Rilassato · **Standard** · Intenso', 'Quante tappe al giorno.'], ['Guida', '**Nicky (Locale)** · Dante (Storico) · Entrambi', 'Il tono dei testi e la voce delle audioguide.']]], ['nota', 'Le scelte vengono ricordate per la volta dopo. Sotto il pulsante c\'è scritto «Se è già nella nostra libreria, lo ricevi subito a metà prezzo»; nell\'app, se l\'itinerario è già in libreria compare «Trovato in biblioteca: nessun credito scalato». In pratica: se esiste già, costa **meno o niente**. La libreria si usa solo se non hai indicato alloggio, richieste particolari o luoghi da reel.'] ] },
      { h: '🧭 Itinerari speciali (sotto il modulo)', corpo: [['lista', ['🛳✈️ **Sosta breve**: porti e scali, il meglio nelle ore che hai (pagina dedicata).', '🥾 **Cammini**: tappe e timbri già pensati.', '🍷 **Strade del vino e del gusto**: cantine, caseifici e frantoi lungo il percorso.', '🧭 **Viaggi tematici**: terme, set di film, stelle, street art, mercatini.', '🎭 **Ispirazioni & temi**: cinema, arte, musica, storia (apre la Libreria filtrata).']]] },
      { h: 'Parla con WIP', corpo: [['passi', ['Tocca **«Parla con WIP»**.', 'Scrivi (esempio: «tre giorni a Lisbona a ottobre, niente musei») e tocca **Invia**, oppure usa il microfono («Ti ascolto…»).', 'WIP fa **una domanda per volta** e legge la risposta ad alta voce (l\'interruttore «WIP parla: attivo/spento» ricorda la tua scelta).', 'Quando ha destinazione e giorni mostra un riepilogo con **«Crea l\'itinerario»** e **«Cambia qualcosa»**.', 'Con «Crea l\'itinerario» i dati entrano nel modulo e parte la generazione normale, con la sua conferma crediti.']], ['lista', ['Raccoglie: destinazione (più città con «e»), giorni, mese, interessi, budget, ritmo, viaggiatori, solo gratis, orari e richieste speciali.', 'Costo: **3 crediti ogni 10 messaggi** (con conferma) più i 10 crediti per giorno dell\'itinerario. Serve il consenso AI. Massimo 20 scambi.']] ] },
      { h: '📅 Quando andare', corpo: [['passi', ['Tocca **«Quando andare»**.', 'Scrivi una città («Scrivi una città…») e tocca **OK**.', 'Si apre la scheda con due viste, **Anno** e **Mese**.']], ['p', 'Sezioni: In numeri, Panoramica, Consigli dal web, Esperienze dei viaggiatori, Mese per mese, Cosa portare, Orari migliori, Avvertenze, Mesi per il bagno, Ultimi anni rispetto alla media, Fonti. Pulsanti **PDF**, **Ascolta**, «Confronta con un\'altra città». Dati: medie NASA POWER 2001–2020. È **gratis**; l\'analisi AI richiede l\'accesso.'] ] },
      { h: 'Dai Miei Preferiti', corpo: [['passi', ['Tocca **«Dai Miei Preferiti»** (se non hai luoghi: «Nessuna gemma salvata» e il pulsante **Esplora la mappa**).', 'Spunta i luoghi (contatore «N Elementi Selezionati»).', 'Scegli periodo e le tre spunte (Eventi, Tour, Gratis) e, se vuoi, le opzioni avanzate.', 'Tocca **«OTTIMIZZA PERCORSO»** (da 1 luogo).']], ['lista', ['**Non scegli i giorni**: sono il numero di luoghi diviso 3, per eccesso (3 luoghi = 1 giorno; 10 luoghi = 4 giorni).', 'Se i luoghi sono a oltre **150 km** dal centro, ti chiede se continuare.']]] },
      { h: 'Raggio: 3 alternative', corpo: [['passi', ['Tocca **«Raggio»**.', 'Scegli il **Punto di Partenza**: città, indirizzo o «Usa la mia posizione».', 'Scegli il **Raggio (km)**: **100 / 300 / 500** o un valore libero (1–5000); predefinito **300**.', 'Scegli gli **interessi**: 🏛️ Arte & Cultura · 👨‍👩‍👧 Famiglie · 🍷 Enogastronomia · 🌊 Mare · ⛰️ Montagna · 🌳 Natura · 💆 Relax · 🧗 Avventura.', 'Imposta durata (1–7 o «gg» fino a 30), periodo, orari e le tre spunte.', 'Tocca **«Trova 3 Alternative»** (gratis).', 'Leggi le tre proposte («Ecco alcune proposte per te»): titolo, descrizione, giorni, tappe. **«Genera altre 3 idee»** è gratis.', 'Tocca la proposta che ti piace: compare la conferma (10 × giorni) e parte la generazione vera.']]] },
      { h: 'Swip: scorri e scegli', corpo: [['passi', ['Tocca **«Swip»**.', 'Compila: destinazione, giorni (1–7), periodo (serve per le carte evento), **Tipo di attrazioni** (🏛️ Musei · 🗿 Monumenti · ⛪ Chiese · 📍 Attrazioni · 🍕 Gastronomia · 🌿 Natura · 🛍️ Shopping; nessuna scelta predefinita).', 'Tocca **«Inizia lo Swip!»** (gratis).', 'Per ogni carta: **❤** o trascina a destra per tenere, **X** o a sinistra per scartare. **Annulla** torna all\'ultima. «Leggi tutto / Leggi meno» espande il testo. In alto il contatore N / totale e il cuore con i selezionati.', 'Con Eventi o Tour accesi compaiono fino a 5 carte **«🎫 Evento reale»** mescolate nel mazzo.', 'Da 1 tappa in su tocca **«Rivedi le Tappe (N)»**: per ciascuna **🔄 Sostituisci** o **✕**.', 'Tocca **«Genera Itinerario con N tappe»**: conferma (10 × giorni) e generazione.']]] },
      { h: 'Viaggio di gruppo', corpo: [['tabella', [['Ruolo', 'Passi'], ['Organizzatore (serve accesso)', '«Crea una stanza» → scegli **Destinazione**, **Giorni** (1–30), **Mese** (facoltativo), **Il tuo nome** → **«Crea la stanza»** → ottieni un **PIN a 6 cifre** → **«Invita il gruppo»** (link wip.guide/?groupplan=PIN) → vedi «Voti arrivati: N» → **«Fusione del gruppo»** → **«Applica al form e genera →»**: il modulo si compila e **generi tu**, pagando il normale costo.'], ['Chi vota (senza account)', '«Ho un PIN» → inserisci il PIN → **«Entra nella stanza»** → nome; **Cosa ti interessa?** (Arte, Gastronomia, Natura, Avventura, Shopping, Fotografia); **Budget**; **Ritmo**; **Da vedere assolutamente** e **Da evitare** (facoltativi, 200 caratteri) → **«Invia le mie preferenze»**; poi «Modifica il mio voto».']]], ['lista', ['**Massimo 12 partecipanti**, stanza aperta **7 giorni**, un voto per dispositivo (si aggiorna, non si duplica).', '**Fusione senza AI**: interessi con almeno 2 voti (o i 3 più votati), budget mediano, ritmo più comune; «da vedere» e «da evitare» vanno nelle richieste speciali. Prima di pagare controlli tutto: la fusione compila solo il modulo.', 'Stanza e voti sono **gratis**; paga solo chi genera.']] ] },
    ],
    manca: ['Non c\'è un tasto «Condividi itinerario» con link pubblico per un singolo itinerario: si condivide con PDF, calendario .ics, racconto o Viaggio di gruppo.', '«Quando andare» non crea un itinerario.', 'In «Dai Miei Preferiti» non si scelgono i giorni.'],
    correlate: ['itinerari', 'libreria-itinerari-gratuiti', 'sosta-breve-porti-aeroporti', 'modificare-itinerario'],
    faq: [['Quale modalità scelgo se non so dove andare?', '«Raggio» (3 alternative gratis) oppure le ispirazioni di stagione nella Modalità Automatica.'], ['Posso provare senza pagare?', 'Sì: Quando andare, le 3 alternative del Raggio, lo Swip, la stanza di gruppo e la Libreria sono gratis fino alla generazione.'], ['Quanti giorni al massimo?', '30; con più città i giorni si ripartiscono tra le città.']],
  },
  /* ───────────────────────── SOSTA BREVE ───────────────────────── */
  {
    slug: 'sosta-breve-porti-aeroporti', titolo: 'Sosta breve: cosa fare con poche ore in un porto o in un aeroporto', breve: 'Sosta breve', macro: 'viaggi', padre: 'itinerari',
    meta: 'Come usare la Sosta breve di WIP: porti e aeroporti con itinerari di poche ore, rientro a bordo o al gate garantito, scelta delle ore e guida generata dall\'AI.',
    lead: 'Hai una crociera con poche ore a terra o uno scalo lungo? La **Sosta breve** propone escursioni **con le ore contate** e calcola sempre il rientro: alla nave o al gate.',
    stat: [],
    sezioni: [
      { h: 'Come si apre', corpo: [['passi', ['Itinerario › **Modalità Automatica** › riquadro **🛳✈️ Sosta breve**.', 'Si apre la schermata **«Sosta breve»**: «Escursioni con le ore contate: rientro alla nave o al gate sempre garantito».', 'Cerca in **«Cerca porto o aeroporto in tutto il mondo…»**; filtra **Tutti / 🛳 Porti / ✈️ Aeroporti**; scegli il paese da **«Tutti i paesi»**.', 'Tocca una voce: vedi «Verso il centro» e, per gli aeroporti, la nota sul deposito bagagli.', 'Scegli le **ore**: **Ore di sosta a terra** (porti) oppure **Ore di scalo** (aeroporti), di solito 4 h / 6 h / 8 h; 🛋 per «resta in aeroporto».', 'Leggi il **banner ambra** con il vincolo di rientro (vedi sotto) e l\'anteprima numerata delle tappe.', 'Tocca **«Usa questo itinerario ✨»**: compila il modulo (1 giorno, Tour acceso, Gratis spento, vincolo di rientro come durata). **Non genera ancora**: tocchi tu «Genera» (10 crediti).', '**«Vedi gli itinerari pronti per questa sosta»** apre la Libreria filtrata sulla città.']]] },
      { h: 'Il vincolo di rientro', corpo: [['tabella', [['Tipo', 'Regola mostrata'], ['Porto', 'Rientro a bordo entro N−1 ore dall\'inizio della sosta (1 ora di margine: la nave non aspetta).'], ['Aeroporto', 'Ritorno in aeroporto entro N−2 ore (2 ore prima del volo).'], ['«Resta in aeroporto»', 'Si resta in aeroporto: al gate 2 ore prima del volo.']]]] },
      { h: 'Cosa c\'è nel catalogo', corpo: [['p', 'Circa **175 voci curate dalla redazione** (badge «✦ Redazione»): 127 porti, circa 48 aeroporti e 27 opzioni «resta in aeroporto». Se il tuo porto o aeroporto non c\'è, compare **«Genera con l\'AI la guida del porto / dell\'aeroporto»** (badge 🤖 AI): serve il consenso AI e l\'accesso. Il costo di questa guida non è indicato nell\'app; la generazione finale dell\'itinerario costa 10 crediti per il giorno.']] },
    ],
    manca: ['I numeri del catalogo sono quelli dichiarati nell\'app (circa), non un conteggio del database.', 'Il costo della guida generata dall\'AI per un porto non in catalogo non è indicato.'],
    correlate: ['creare-itinerario-tutte-le-modalita', 'libreria-itinerari-gratuiti', 'itinerari'],
    faq: [['Se sbaglio e rientro tardi?', 'WIP non può garantire il rientro: calcola il margine ma tu controlla sempre gli orari della nave o del volo.'], ['È gratis?', 'Consultare il catalogo e le anteprime sì; generare l\'itinerario costa come un giorno (10 crediti).']],
  },
  /* ───────────────────────── MODIFICARE ITINERARIO ───────────────────────── */
  {
    slug: 'modificare-itinerario', titolo: 'Modificare un itinerario: sostituire, bloccare, aggiungere un giorno, Piano B', breve: 'Modificare un itinerario', macro: 'viaggi', padre: 'itinerari',
    meta: 'Come modificare un itinerario di WIP: sposta, blocca, sostituisci tappe, aggiungi tappa manuale, Rigenera, Aggiungi un giorno, gita fuori porta e Piano B pioggia, con i costi.',
    lead: 'Dopo la generazione puoi cambiare quasi tutto, tappa per tappa. Ecco ogni pulsante, cosa fa e quanto costa.',
    sezioni: [
      { h: 'I pulsanti in alto', corpo: [['tabella', [['Pulsante', 'Cosa fa', 'Costo'], ['Offline', 'Salva l\'itinerario per l\'uso senza rete.', 'Testo e mappa gratis; bundle audio 20 crediti a tappa'], ['Rigenera', 'Rigenera **tutto** mantenendo le tappe **bloccate**.', '10 × giorni, con conferma'], ['📖 Genera Guida d\'Autore', 'Guida PDF sul tuo itinerario.', '20 per giorno'], ['Calendario', 'Esporta in .ics (chiede la data).', 'Gratis'], ['Stampa / PDF', 'PDF con mappa e legenda.', 'Gratis'], ['↺', 'Azzera e riparte.', 'Gratis']]]] },
      { h: 'Per ogni giorno', corpo: [['lista', ['**Badge «N sostituzioni gratis»**: ogni giorno ne ha **3** gratuite.', '**🌧 Piano B**: il badge «N mm» compare se la previsione è di almeno 1 mm. Il pulsante chiede una **variante al coperto** (musei, chiese, gallerie al posto dell\'aperto); **pranzo e cena restano uguali**. Vedi l\'anteprima e confermi. **Nessun costo**; serve l\'accesso.', '**Nel radar (N)**: porta le tappe nel Radar per il giro con audioguida.', '**Podcast / Riascolta**: il podcast del giorno.', '**Naviga**: apre la navigazione.']]] },
      { h: 'Per ogni tappa', corpo: [['tabella', [['Pulsante', 'Cosa fa'], ['Sposta su / Sposta giù', 'Scambia le tappe. **Non c\'è il trascinamento**, e ogni posizione **mantiene il suo orario**. Salva da solo.'], ['🔒 Blocca tappa', 'La tappa resta quando premi **Rigenera**.'], ['Sostituisci', 'Cambia la tappa con un\'alternativa. **3 gratis al giorno**, poi **8 crediti** con conferma; se fallisce non consuma nulla.'], ['✕ Elimina', 'Toglie la tappa (chiede conferma).'], ['🚇 Mezzi', 'Per le tratte da 1,5 km in su: Google Maps con i mezzi pubblici.'], ['Badge ✓ / ⚠', 'Esito della verifica automatica della tappa.']]]] },
      { h: 'Aggiungere una tappa a mano', corpo: [['passi', ['A fine giorno tocca **«Aggiungi tappa manuale»**.', 'Compila: **ora** e **nome** (obbligatori), tipo (visita, ristorante, pausa, spostamento), durata, descrizione, posizione e consigli.', 'Facoltativo: **«Suggerisci con AI»** (8 crediti).', 'Tocca **Salva**: la tappa si inserisce in ordine di orario.']]] },
      { h: 'Aggiungere un giorno o una gita fuori porta', corpo: [['passi', ['Su un itinerario **salvato**, in fondo tocca **«➕ Aggiungi un giorno»** oppure **«➕ Tappa vicina (gita fuori porta)»**.', 'Per la gita: **«Cerca una città vicina…»**.', 'Scegli il **tema del giorno**: Classica, Gastronomica, Famiglie, Nascosta, Arte e storia, Relax e panorami, oppure ✨ **Sorprendimi**.', 'Tocca **«Genera (12 crediti)»** e conferma.']], ['lista', ['Se il giorno arriva dalla **Libreria**, il server **rimborsa metà** (6 crediti): «Giorno aggiunto (dalla Libreria, metà prezzo)».', 'Oltre 15 km il server aggiunge due tappe di **trasferimento** (andata e rientro) con km e minuti.']] ] },
    ],
    manca: ['Non si può togliere un giorno intero.', 'Non c\'è il trascinamento delle tappe.', 'Il Piano B non cambia pranzo e cena.'],
    correlate: ['itinerari', 'creare-itinerario-tutte-le-modalita', 'podcast-e-guida-autore'],
    faq: [['Quante sostituzioni gratis ho?', '3 per ogni giorno; poi 8 crediti ciascuna.'], ['Se sposto una tappa cambia l\'orario?', 'No: le posizioni mantengono il loro orario.']],
  },
  /* ───────────────────────── TUTTE LE CATEGORIE ───────────────────────── */
  {
    slug: 'tutte-le-categorie', titolo: 'Tutte le categorie di WIP, con numeri e modo d\'uso', breve: 'Tutte le categorie', macro: 'viaggi', padre: 'categorie',
    meta: 'L\'elenco completo delle categorie di luoghi di WIP, raggruppate per famiglia: quanti luoghi ci sono, dove si trovano sulla mappa e se hanno un\'audioguida.',
    lead: 'Ogni luogo della mappa appartiene a una **categoria**. Questa pagina le elenca **tutte**, raggruppate in famiglie. Per ognuna trovi il **numero di luoghi** visibili nell\'app, dove accenderla sulla mappa e se ha un\'audioguida.',
    categorieComplete: true,
    stat: ['luoghi_totale', 'gemme'],
    sezioni: [
      { h: 'Come usare questa pagina', corpo: [['passi', ['Trova la famiglia che ti interessa.', 'Leggi **«Dove la trovi»**: ti dice quale chip o livello accendere sulla mappa.', 'Leggi **«Audioguida»**: se il luogo parla da solo o no.', 'Nella tabella vedi quanti luoghi ci sono per ogni categoria. **«circa»** = stima del database.', 'Apri WIP, accendi la chip e tocca un pin.']], ['nota', 'Una categoria senza numero non ha un conteggio affidabile in questo momento: non lo mostriamo piuttosto che inventarlo. Una stessa categoria può comparire in più modi sulla mappa (per esempio una chiesa può essere anche una gemma).'] ] },
    ],
    manca: ['I numeri contano i luoghi visibili in app per ogni categoria: un luogo conta una sola volta, nella sua categoria principale.'],
    correlate: ['categorie', 'beni-culturali', 'mappe-tematiche'],
    faq: [['Perché la somma non torna col totale?', 'Alcuni luoghi hanno categorie non elencate o più recenti, e i totali grandi sono stime.'], ['Dove trovo una categoria che non vedo in barra?', 'Aggiungila da ＋ Altro, oppure accendi il livello giusto da Livelli.']],
  },
  /* ───────────────────────── BENI CULTURALI ───────────────────────── */
  {
    slug: 'beni-culturali', titolo: 'Beni Culturali: l\'atlante dei luoghi tutelati nel mondo', breve: 'Beni Culturali', macro: 'cultura', padre: 'categorie',
    meta: 'La chip Beni Culturali di WIP: l\'atlante dei beni tutelati e dei luoghi di organizzazioni come UNESCO, con scheda ridotta e senza audioguida. Come trovarli e usarli.',
    lead: 'La chip **🏺 Beni Culturali** mostra l\'**atlante dei beni tutelati** nel mondo: luoghi protetti da registri e organizzazioni del patrimonio. Hanno una **scheda ridotta** e **non hanno audioguida automatica**.',
    stat: [],
    beni: true,
    sezioni: [
      { h: 'In breve', corpo: [['lista', ['**Cos\'è**: un atlante di luoghi tutelati (registri nazionali dei beni, siti di enti del patrimonio), distinto dai luoghi con audioguida.', '**Dove**: chip **🏺 Beni Culturali**, nel pannello **＋ Altro**.', '**Quando compaiono**: solo a **zoom alto**, per non coprire la mappa.', '**Cosa ottieni**: la scheda del bene (nome, tipo, informazioni disponibili). Non c\'è audioguida.', '**Costo**: consultare è gratis.']]] },
      { h: 'Tutorial: trovare i beni tutelati di una città', corpo: [['passi', ['Cerca la città con la lente 🔍.', 'Tocca **＋ Altro** e accendi **🏺 Beni Culturali** (tocca **ⓘ** per leggere cosa contiene).', 'Zooma sulla zona: i beni compaiono solo da un certo zoom in su.', 'Tocca un pin per la scheda.', 'Se vuoi anche il racconto, cerca lo stesso luogo tra i Monumenti o le Gemme: lì l\'audioguida c\'è, se il luogo la prevede.']]] },
      { h: 'Differenza con Monumenti e Gemme', corpo: [['tabella', [['', 'Beni Culturali', 'Monumenti / Gemme'], ['Audioguida', 'No', 'Sì (categorie accese nel Setup; le gemme sempre)'], ['Scheda', 'Ridotta', 'Completa, con foto e descrizione'], ['Visibilità', 'Solo a zoom alto', 'Più livelli di zoom'], ['Serve', 'Per scoprire cosa è tutelato', 'Per visitare e ascoltare']]]] },
    ],
    manca: ['Nessuna audioguida per i beni dell\'atlante.', 'La scheda è ridotta: non tutti i beni hanno foto e testi.'],
    correlate: ['tutte-le-categorie', 'musei-cultura', 'mappe-tematiche'],
    faq: [['Perché non vedo i Beni Culturali?', 'Devi aggiungerli da ＋ Altro e zoomare abbastanza.'], ['Hanno l\'audioguida?', 'No, solo la scheda.']],
  },
  /* ───────────────────────── PERCORSO SU MISURA ───────────────────────── */
  {
    slug: 'percorso-su-misura', titolo: 'Percorso su misura dalla mappa: tutorial passo per passo', breve: 'Percorso su misura', macro: 'viaggi', padre: 'navigatore',
    meta: 'Come comporre un percorso dalla mappa di WIP: le tre vie (Personale, Gemme intorno a me, A tempo), costo di 30 crediti, modifiche incluse e differenze con il Giro.',
    lead: 'Dalla mappa puoi comporre un percorso a piedi che tocca i luoghi che scegli, di qualsiasi categoria. Costa **30 crediti**, include **3 modifiche** e non ha audioguida.',
    sezioni: [
      { h: 'In breve', corpo: [['lista', ['**Cos\'è**: un percorso calcolato da WIP che tocca tutti i luoghi scelti, con il navigatore WipNav.', '**Quanto costa**: 30 crediti, con conferma prima del pagamento.', '**Modifiche**: fino a 3 (aggiungere o togliere luoghi). Poi bisogna terminare e crearne uno nuovo.', '**Audioguida**: non inclusa. Per le audioguide serve il Giro con il Day Pass.']]] },
      { h: 'Le tre vie, spiegate', corpo: [['tabella', [['Via', 'Come funziona', 'Quando usarla'], ['Personale · scelgo io i luoghi', 'Tocchi «+» sui pin della mappa, di qualsiasi categoria. WIP calcola il percorso più corto che li tocca tutti.', 'Sai già cosa vuoi vedere.'], ['Gemme intorno a me', 'WIP cerca le gemme vicino a te e le propone già in ordine di cammino. Puoi togliere quelle che non vuoi.', 'Non conosci la zona.'], ['A tempo · quanto ho?', 'Scegli «1 ora», «2 ore» o «Mezza giornata»: WIP propone le gemme che ci stanno.', 'Hai poco tempo.']]]] },
      { h: 'Tutorial: crea il tuo percorso', corpo: [['passi', [
        'Sulla mappa tocca **«Componi un percorso»**. Si apre il pannello «Percorso su misura» con le tre vie.',
        'Scegli una via. Con **Personale** torna alla mappa e tocca il **+** sui pin che vuoi; il pannello conta «{n} luoghi scelti». Con **Gemme intorno a me** attendi «Cerco le gemme intorno a te…» e poi togli quelle che non ti interessano. Con **A tempo** scegli 1 ora, 2 ore o mezza giornata.',
        'Controlla la riga del prezzo: «30 crediti · fino a 3 modifiche incluse · nessuna audioguida».',
        'Tocca **«Crea e avvia · 30 crediti»**. Se non hai fatto l\'accesso compare «Accedi per creare il percorso».',
        'Compare «Confermi il pagamento?»: legge il numero di tappe, le 3 modifiche e il tuo saldo. Tocca **«Paga 30 crediti e avvia»**.',
        'Il navigatore parte subito. Seguilo come WipNav (vedi la pagina sul navigatore).',
        'Per cambiare idea, aggiungi o togli luoghi dalla mappa: il percorso si **ricalcola da dove sei**. Il contatore dice «Modifiche usate: n/3».',
        'Alla fine tocca **«Termina percorso»** (chiede conferma) oppure **«Nuovo percorso»**. C\'è anche **«Tutte le tappe in Google Maps (auto)»** per farlo in macchina.',
      ]]] },
      { h: 'Le opzioni e i messaggi, uno per uno', corpo: [['tabella', [['Cosa vedi', 'Che cosa significa'], ['Crediti insufficienti: il percorso costa 30 crediti', 'Ricarica dallo Shop (Profilo › Shop).'], ['Hai usato tutte le 3 modifiche', 'Termina e creane uno nuovo per cambiarlo ancora.'], ['Percorso pieno: al massimo n luoghi', 'C\'è un tetto al numero di tappe.'], ['Hai dei luoghi scelti per l\'altra funzione…', 'La selezione del Giro e quella del percorso sono separate: passando di qua si svuota l\'altra. Ti chiede conferma.'], ['Termina percorso', 'I crediti già spesi non vengono restituiti.']]]] },
      { h: 'Percorso su misura o Giro?', corpo: [['tabella', [['', 'Percorso su misura', 'Giro (con audioguida)'], ['Audioguida', 'No', 'Sì'], ['Costo', '30 crediti', 'Day Pass 200 crediti per la navigazione'], ['Tappe', 'Luoghi di qualsiasi categoria', 'Fino a 10 tappe (30 se creato da «Tutto nel raggio»)'], ['Ordine', 'Il più corto che li tocca', 'Tuo, trascinando, oppure «Riordina per me»'], ['Modifiche', '3 incluse', 'Illimitate prima di avviare']]]] },
    ],
    manca: ['Il percorso su misura non ha audioguida.', 'Il limite massimo di luoghi per percorso non è documentato qui: l\'app lo indica quando lo raggiungi.'],
    correlate: ['navigatore', 'audioguide', 'gratis-e-crediti'],
    faq: [['Posso cambiare i luoghi dopo aver pagato?', 'Sì, fino a 3 modifiche; poi devi creare un nuovo percorso.'], ['Se termino il percorso riavrò i crediti?', 'No: i crediti già spesi non vengono restituiti.'], ['Funziona per l\'auto?', 'Il navigatore WIP è a piedi; con il pulsante «Tutte le tappe in Google Maps (auto)» apri le tappe in Google Maps.']],
  },
  /* ───────────────────────── MAPPE TEMATICHE ───────────────────────── */
  {
    slug: 'mappe-tematiche', titolo: 'Mappe tematiche: tutte le categorie e tutti i livelli di WIP', breve: 'Mappe tematiche', macro: 'viaggi', padre: 'mappa-e-ricerca',
    meta: 'Tutte le chip, i sotto-filtri, i temi (terme, cinema, cieli, street art, mercati, fioriture, memoria, viaggio lento) e i livelli della mappa WIP spiegati uno per uno.',
    lead: 'La mappa di WIP ha due strumenti per vedere cose diverse: le **chip**, che mostrano luoghi, e i **livelli**, che disegnano percorsi, zone e dati. Qui trovi ognuno spiegato.',
    stat: ['terme', 'street_art', 'cinema', 'mercati', 'cantine'],
    sezioni: [
      { h: 'Le chip in barra', corpo: [['tabella', [['Chip', 'Che cosa mostra', 'Sotto-filtri'], ['💎 Gemme', 'I luoghi più importanti. Le loro audioguide partono sempre.', 'Tutte, Monumenti, Chiese, Musei, Panorami'], ['🏛️ Monumenti', 'Monumenti, chiese, musei, castelli e altri luoghi di cultura.', 'Tutti, Monumenti, Chiese, Musei, Panorami'], ['📸 WIP Community', 'Le foto dei viaggiatori approvate dalla redazione (pin magenta).', '—'], ['🎟 Esperienze', 'Tour e attività dei partner nella zona che guardi.', 'Viator, GetYourGuide, Tiqets'], ['🎪 Eventi', 'Apre direttamente la scheda Eventi.', '—']]]] },
      { h: 'Le chip aggiungibili con ＋ Altro', corpo: [['p', 'Tocca **＋ Altro**: si apre «Aggiungi alla barra». Ogni riga ha un interruttore e un tasto **ⓘ** che spiega cosa contiene. Accendere una riga la porta in barra e la accende; spegnerla la toglie. La tua scelta resta salvata sul dispositivo. Tutte sono spente all\'inizio.'], ['tabella', [['Chip', 'Contenuto', 'Sotto-filtri'], ['🌿 Natura', 'Luoghi naturali.', 'Spiagge e isole, Vette e ghiacciai, Cascate e laghi, Grotte, Parchi e riserve'], ['🏘️ Località', 'Paesi e località.', '—'], ['🍕 Locali', 'Ristoranti, bar, pizzerie, gelaterie.', 'Stellati, Ristoranti, Pizza, Pesce, Carne, Gluten-Free, Sushi, Vegetariano, Bar & Caffè, Gelati'], ['🛠️ Utilità', 'Servizi utili.', 'Farmacia, Ospedale, Mercati, Fontanelle, Stazione FS, Metro, Taxi, Autostrada, Ricarica EV'], ['🛝 Famiglie', 'Luoghi per bambini.', 'Parco Giochi, Divertimenti, Acquario, Zoo'], ['🏺 Beni Culturali', 'L\'atlante dei beni vincolati nel mondo: scheda ridotta, nessuna audioguida; compare a zoom alto.', '—'], ['🧭 Tematici', 'Gli otto temi qui sotto.', 'Tutti + gli 8 temi']]]] },
      { h: 'Gli otto temi (chip Tematici)', corpo: [['p', 'La riga dei temi compare solo se **Tematici** è in barra **e acceso**. «Tutti» li accende tutti; toccando un tema da «Tutti» resta solo quello. Poi aggiungi o togli un tema alla volta; togliendo l\'ultimo si torna a «Tutti».'], ['tabella', [['Tema', 'Cosa trovi'], ['🛁 Terme e sorgenti', 'Terme e sorgenti termali.'], ['🎬 Location di film e serie', 'Luoghi dove sono stati girati film e serie.'], ['🌌 Cieli bui e stelle', 'Posti adatti a guardare le stelle.'], ['🎨 Street art', 'Opere di street art.'], ['🛍️ Mercati e mercatini', 'Mercati e mercatini.'], ['🌸 Fioriture', 'Luoghi di fioritura stagionale.'], ['🕯️ Memoria e case-museo', 'Luoghi della memoria e case-museo.'], ['🚂 Viaggio lento', 'Luoghi per viaggiare con calma (per esempio treni e tracciati lenti).']]], ['nota', 'I temi non hanno audioguida: hanno una scheda dedicata.']] },
      { h: 'I livelli della mappa', corpo: [['p', 'Il pulsante **Livelli** è il cerchio con l\'icona a strati, **in basso a sinistra**. Se hai livelli accesi mostra un pallino col numero e accanto le loro emoji. I livelli si **sommano**; ogni riga ha una spunta ✓ quando è accesa e un cerchio che gira mentre carica. Se compare **«↗ avvicinati per vederli»** devi zoomare di più. Con due o più livelli accesi c\'è **«Spegni tutti (n)»**.'], ['tabella', [['Gruppo', 'Livello', 'Cosa mostra'], ['Dove andare', '🥾 Sentieri e cammini', 'Sentieri, ippovie, rifugi, corsa, canoa, itinerari storici'], ['Dove andare', '🚲 Ciclovie e mountain bike', 'EuroVelo e reti nazionali'], ['Dove andare', '🍷 Vino e gusto', 'Cantine, strade e botteghe, zone di denominazione'], ['Dove andare', '🚰 Fontanelle, bagni, panchine', 'Punti d\'acqua, servizi igienici, panchine'], ['Dove andare', '🌿 Aree protette', '236.172 parchi, riserve e siti Natura 2000 nel mondo, con confini e specie avvistate'], ['Dove andare', '🏬 Shopping', 'Vie e centri commerciali, grandi magazzini, outlet, souk'], ['Dove andare', '👑 Lusso', 'Hotel 5 stelle, ristoranti stellati, marine, club esclusivi'], ['Com\'è adesso', '❄️ Neve', 'Piste, impianti e rifugi (9.569 piste) più copertura nevosa NASA giornaliera'], ['Com\'è adesso', '☀️ Sole', 'Indice UV, caldo percepito e temperatura reale'], ['Com\'è adesso', '📅 Clima', 'Pioggia e temperature medie 2001-2020 (NASA POWER) con analisi AI: periodo migliore'], ['Com\'è adesso', '🏖 Qualità acqua del mare', 'Classificazione europea; temperatura e onde (solo Europa)'], ['Sfondo', '🛰️ Satellite', 'Foto dall\'alto al posto della mappa']]]] },
      { h: 'Tutorial: scegliere un tema e un livello insieme', corpo: [['passi', ['Tocca **＋ Altro** e accendi **🧭 Tematici**.', 'Nella riga dei temi tocca per esempio **🎨 Street art**.', 'Apri **Livelli** e accendi **☀️ Sole** per scegliere l\'orario della passeggiata.', 'Tocca un pin per la scheda del luogo.', 'Per ripartire da zero tocca **Spegni tutti** nei Livelli e **Tutti** nei temi.']]] },
    ],
    manca: ['Sulla barra in basso della mappa ci sono i pulsanti «Trova vicino» e «Tutto»: il loro funzionamento sarà documentato dopo la verifica.', 'Nessun livello per le webcam, le maree o la Bandiera Blu.', 'Le zone a traffico limitato (ZTL) non sono più disponibili.'],
    correlate: ['mappa-e-ricerca', 'natura-percorsi', 'meteo-neve', 'vino-e-gusto'],
    faq: [['Perché non vedo un livello acceso?', 'Probabilmente sei troppo lontano: compare «avvicinati per vederli». Zooma sulla zona.'], ['Come tolgo tutto?', 'Livelli › «Spegni tutti».'], ['Perché Tematici non mostra la riga dei temi?', 'Deve essere in barra e acceso.']],
  },
  /* ───────────────────────── COME SI COMPRA ───────────────────────── */
  {
    slug: 'come-si-compra', titolo: 'Come si comprano i crediti, i pass e i prezzi', breve: 'Come si compra', macro: 'viaggi', padre: 'gratis-e-crediti',
    meta: 'Come acquistare crediti in WIP da web, iPhone e Android, i pacchetti, il saldo, i pass (Day Pass, Pass Museo, Visita Museo) e la tabella dei prezzi in crediti.',
    lead: 'In WIP si paga con **crediti**. Li compri nello **Shop** in pacchetti; poi li spendi per audioguide, itinerari, guide e pass. I prezzi in euro dei pacchetti li mostra il negozio (o il pagamento) al momento dell\'acquisto.',
    sezioni: [
      { h: 'I pacchetti di crediti', corpo: [['tabella', [['Pacchetto', 'Crediti', 'Bonus', 'Per chi'], ['City-Break', '500', '—', 'Un weekend in città'], ['Vacanza 1 Settimana', '1.100 (1.000 + 100)', '+10%', 'Il più scelto dai viaggiatori'], ['Tour Operator', '2.600 (2.000 + 600)', '+30%', 'Il massimo risparmio per lunghi viaggi']]], ['p', 'Sul **web** (15/11/2026) i prezzi mostrati sono: **City-Break 5,99 €** e **Vacanza 1 Settimana 11,99 €**; il prezzo di Tour Operator lo vedi nello Shop.'], ['nota', 'Su iPhone e Android il prezzo lo decide lo store e può cambiare per Paese: vale sempre quello sul pulsante di acquisto. Se non è disponibile, il pulsante dice «Prezzo non disponibile».']] },
      { h: 'Tutorial: comprare crediti', corpo: [['passi', ['Accedi al tuo account (senza accesso non puoi acquistare).', 'Apri **Profilo › Shop**: in alto vedi il saldo totale.', 'Nella sezione «Pacchetti Crediti» scegli il pacchetto.', '**Su iPhone e Android** paghi con lo store (App Store o Google Play): confermi con il tuo metodo di pagamento. **Sul web** si apre il pagamento sicuro Stripe.', 'Torni nell\'app: compare «Acquisto completato con successo! I crediti verranno aggiornati a breve». Di solito bastano pochi secondi.', 'Se hai cambiato telefono, su iPhone e Android tocca **«Ripristina acquisti»** nello Shop.']], ['nota', 'Il pulsante «Ripristina acquisti» esiste solo nelle app per iPhone e Android; sul web i crediti arrivano direttamente.']] },
      { h: 'Il saldo: crediti acquistati e guadagnati', corpo: [['p', 'Il saldo ha due parti: **acquistati** e **guadagnati** (Missioni, punti esperienza, quiz). Quando spendi, si usano **prima i guadagnati**. I crediti non scadono. Se un servizio fallisce, i crediti tornano; il rimborso va ai crediti acquistati.']] },
      { h: 'Tabella dei prezzi in crediti', corpo: [['tabella', [['Servizio', 'Crediti', 'Note'], ['Audioguida completa', '15', 'Per luogo; resta tua per sempre'], ['Day Pass', '200', '24 ore, fino a 40 guide, anche offline e a schermo spento; mappe offline gratuite'], ['Itinerario con AI', '10', 'Per ogni giorno'], ['Sostituire una tappa', '8', 'Dopo la quota gratuita'], ['Aggiungere un giorno o una tappa vicina', '12', 'Metà rimborsata se il giorno arriva dalla Libreria'], ['Guida d\'Autore PDF', '20', 'Per ogni giorno dell\'itinerario'], ['Podcast', '15', 'Per giorno'], ['Scansione Vision', '5', 'Per foto'], ['Chat con WIP', '3', 'Ogni 10 messaggi'], ['Pass Museo', '100', '40 scansioni in 4 ore, serve internet'], ['Visita Museo', '200', 'Per museo, senza scadenza, 20 scansioni incluse; non in vendita per luoghi con meno di 12 opere'], ['Percorso su misura', '30', '3 modifiche incluse']]], ['p', 'I prezzi possono essere aggiornati dal server senza una nuova versione dell\'app: il listino in **Profilo › Listino** mostra sempre quello in vigore.']] },
      { h: 'Prima di pagare', corpo: [['p', 'Per le azioni a crediti l\'app mostra una **finestra di conferma** con il costo e il saldo. Se i crediti non bastano, ti propone di ricaricare. Il **Day Pass** ha la sua conferma: «Attivare il WIP Day Pass?».']] },
    ],
    manca: ['Non esistono abbonamenti: solo pacchetti di crediti e pass.', 'Il riscatto dei voucher non è più presente nello Shop (requisiti App Store).', 'Fatture e cronologia degli acquisti: da verificare nell\'app prima di descriverli.'],
    correlate: ['gratis-e-crediti', 'audioguide', 'musei-cultura'],
    faq: [['Quanto costa un pacchetto in euro?', 'Lo mostra il negozio al momento dell\'acquisto: dipende dal Paese e può cambiare.'], ['I crediti scadono?', 'No.'], ['Cosa succede se finiscono?', 'Le azioni a pagamento chiedono di ricaricare; le funzioni gratuite continuano a funzionare.']],
  },
  /* ───────────────────────── VISION ───────────────────────── */
  {
    slug: 'vision-riconoscimento', titolo: 'Vision: riconosci luoghi, opere e natura con una foto', breve: 'Vision', macro: 'cultura',
    meta: 'Come usare Vision di WIP: Scansione AI (Luogo, Opera, Natura), Radar AR, costi, foto dalla galleria, candidati, My Vision e WIP Community. Tutte le opzioni spiegate.',
    lead: 'Il tondo con la fotocamera, al centro della barra in basso, apre **«Analizza il Mondo»**: inquadri qualcosa e WIP lo riconosce e te lo racconta come un\'audioguida. Ogni scansione costa **5 crediti**.',
    sezioni: [
      { h: 'In breve', corpo: [['lista', ['Tre schede: **Scansione AI**, **Radar AR**, **Visite** (musei: vedi la pagina dedicata).', 'Tre modi di scansione: **📍 Luogo**, **🖼️ Opera**, **🌿 Natura**.', '**5 crediti** a scansione; con il **Pass Museo** attivo la scansione è inclusa.', 'Se non riconosce nulla, i **crediti tornano** e la foto resta in My Vision.', 'Prima volta: serve il **consenso** all\'uso dell\'intelligenza artificiale.']]] },
      { h: 'I tre modi della Scansione AI', corpo: [['tabella', [['Modo', 'Cosa inquadrare', 'Cosa ottieni'], ['📍 Luogo (predefinito)', 'Un monumento, una chiesa, un edificio, un punto di interesse.', 'La scheda del luogo, salvata in My Vision. Dà 10 XP.'], ['🖼️ Opera', 'Un quadro, una statua, un reperto.', 'Il riconoscimento dell\'opera con racconto da storico dell\'arte. Se sei in un museo parte in sottofondo anche la sua visita guidata.'], ['🌿 Natura', 'Una pianta, un animale, un panorama.', 'Una scheda da naturalista con habitat e curiosità.']]], ['nota', 'Esiste nel codice anche un modo «Screenshot» (da reel a itinerario), ma **nell\'app non è raggiungibile**: non è disponibile.']] },
      { h: 'Tutorial: riconoscere un luogo', corpo: [['passi', [
        'Tocca il **tondo con la fotocamera** nella barra in basso. Si apre «Analizza il Mondo» sulla scheda **Scansione AI**.',
        'Scegli il **modo** (Luogo, Opera o Natura): sotto il titolo una frase spiega cosa fa.',
        'Prima volta: accetta la richiesta di **consenso AI**. Senza consenso la foto non lascia il telefono.',
        'Tocca **«Scatta Foto»** (fotocamera posteriore a schermo pieno: tonda bianca per scattare, X per chiudere) oppure **«Scegli dalla Galleria»**.',
        'Compare il riquadro di conferma con il costo (**5 crediti**) e il tuo saldo: confermalo. Con il Pass Museo attivo non compare.',
        'Durante l\'analisi vedi la foto con la linea di scansione.',
        'Si apre la **scheda** del luogo: nome, descrizione, storia, curiosità. Il tasto tondo **«Ascolta la scheda»** la legge ad alta voce.',
      ]]] },
      { h: 'Foto dalla galleria: dove l\'hai scattata?', corpo: [['lista', ['Se la foto ha già la **posizione** (GPS nei dati della foto) WIP la usa e lo dice: «Posizione e data lette dalla foto».', 'Se non ce l\'ha compare **«Dove hai scattato questa foto?»**: tocca la mappa per mettere il pin e poi **«Conferma posizione»**; oppure **«Usa la mia posizione attuale»**; oppure **«Non lo so»** per analizzare senza coordinate.', 'Una foto dalla galleria **non prende mai** il GPS del tuo telefono di adesso.']]] },
      { h: 'Il risultato, pulsante per pulsante', corpo: [['tabella', [['Elemento', 'A cosa serve'], ['Ascolta la scheda', 'Legge la scheda (e si mette in pausa).'], ['Salva la foto sul dispositivo', 'App: salva in Documenti/WIP Vision.'], ['Condividi la foto', 'Condivide con la scritta «WIP · wip.guide».'], ['Chip (autore, anno, stile, città)', 'Dati sul luogo; «Primo scopritore» se sei il primo.'], ['Versione da museo', 'Per le opere in un museo: racconto più lungo con tecnica, misure, «Da cercare guardando» e «Lo sapevi». Serve il Pass o la Visita.'], ['Chiedi di più', 'Apre la chat con la scheda come contesto.'], ['Vedi sulla mappa', 'Solo se la scheda è già in WIP Community.'], ['Chiudi', 'Torna alla fotocamera.']]]] },
      { h: 'Quando non è sicuro, o non riconosce', corpo: [['lista', ['**«Non sono sicuro: quale di questi è?»**: fino a 3 candidati; scegli quello giusto e la scheda viene **riscritta gratis**. Oppure «Tieni la scheda così».', '**«Non l\'ho riconosciuta… ma di sicuro è speciale!»**: i crediti sono rimborsati e la foto è salvata. Scegli i tag (Panorama speciale, Angolo nascosto, Arte di strada, Tradizione locale, Natura, Ricordo di viaggio) e, se vuoi, scrivi un racconto (fino a 2000 caratteri). **«Salta»** o **«Invia il racconto»**.', 'In una visita museo, per le opere compare «È una di queste?» con le foto delle opere della sala.', 'Se nella foto ci sono volti riconoscibili, se verrà pubblicata saranno sfocati.']]] },
      { h: 'Senza rete e limiti', corpo: [['lista', ['Offline la foto va in **coda** e viene riconosciuta quando torni online; **non paghi** finché non viene elaborata.', 'Coda: massimo **10 foto**, valide **7 giorni**, **3 tentativi** per foto.', 'Se vedi «Troppe foto non riconosciute oggi», è una protezione anti-spam: riprova domani con un soggetto ben inquadrato.']]] },
      { h: 'My Vision e WIP Community', corpo: [['p', 'Ogni scansione crea una scheda in **Profilo › My Vision**, con due viste: «Le mie Vision» e «WIP Community» (chip «Vicino a me», raggio 50 km, e «Più recenti»).'], ['tabella', [['Stato', 'Significato'], ['In revisione', 'La foto è in controllo.'], ['WIP Community', 'Approvata e pubblicata sulla mappa con la tua attribuzione: guadagni crediti.'], ['Non pubblicata', 'Rifiutata; vedi il «Motivo» (luogo già presente, non è un luogo di interesse, qualità insufficiente, persone riconoscibili, contenuto non adatto, altro).'], ['Primo scopritore', 'Sei il primo ad averla trovata.']]], ['p', 'Non c\'è un tasto «Proponi»: una foto riconosciuta entra da sola in revisione. Un controllo automatico scarta persone, schermi, cibo e luoghi già presenti a pochi metri; poi una persona approva. Il benvenuto parla di «fino a +15 crediti»: l\'importo reale per foto non è dichiarato qui. Le foto restano tue.'], ['p', 'Cosa fotografare: edicole votive, murales, fontane, lavatoi, ponti, torri, cippi, chiese minori, punti panoramici. Cosa no: interni privati, persone riconoscibili, opere coperte da copyright come soggetto principale, insegne commerciali.']] },
      { h: 'Radar AR: i luoghi intorno a te, davanti alla fotocamera', corpo: [['lista', ['Mostra i luoghi entro **5 km**, fino a **12 etichette** nel campo visivo, con foto o icona, nome e distanza. Tocca un\'etichetta per aprire la scheda.', '**Radar 2D** («Lista e radar 2D»): raggio 2 km, nord in alto, i 24 più vicini, con l\'elenco «I più vicini». I luoghi con testo pronto riportano «audioguida pronta».', 'Su iPhone compare **«Attiva la Bussola»**: «Consenti» oppure «Salta (mostra tutti i POI)».', 'Se la fotocamera non è permessa il radar funziona lo stesso («Riprova» per ridare il permesso).', 'Non ha costi e **non ci sono opzioni** per cambiare raggio o categorie.']]] },
    ],
    manca: ['La modalità «Screenshot / da reel a itinerario» non è disponibile.', 'Il Radar AR non ha impostazioni.', 'Un costo diverso per «Chiedi di più» nella scheda non è previsto.'],
    correlate: ['visita-museo', 'musei-cultura', 'gratis-e-crediti'],
    faq: [['Quanto costa una scansione?', '5 crediti; se non riconosce nulla, i crediti tornano.'], ['Posso usare una foto già nella galleria?', 'Sì: tocca «Scegli dalla Galleria»; se non ha la posizione ti chiede dove l\'hai scattata.'], ['Funziona senza internet?', 'La foto viene messa in coda e riconosciuta al ritorno online.']],
  },
  /* ───────────────────────── VISITA MUSEO ───────────────────────── */
  {
    slug: 'visita-museo', titolo: 'Guide dei musei: Visita Museo, Pass e piante, passo per passo', breve: 'Guida museo', macro: 'cultura', padre: 'musei-cultura',
    meta: 'Come usare le guide dei musei e delle chiese di WIP: trovare il museo, Pass Museo e Visita Museo, percorso per sale, pianta con pin, opera per opera, MP3, PDF, offline.',
    lead: 'La **Visita Museo** ti accompagna di sala in sala e opera per opera, con audio, curiosità e pianta. Si trova nella scheda **Visite**, dentro la fotocamera della barra in basso.',
    sezioni: [
      { h: 'Gratis, Pass o Visita? A colpo d\'occhio', corpo: [['tabella', [['', 'Guida gratuita', 'Pass Museo', 'Visita Museo'], ['Costo', '0', '100 crediti', '200 crediti'], ['Durata', '—', '4 ore', 'Senza scadenza, per quel museo'], ['Scansioni', '—', '40', '20'], ['Cosa dà', 'Per i luoghi con meno di 8 opere con foto', 'Riconosci ciò che inquadri e ascolti la scheda. Non include il percorso per sale. Serve internet.', 'Percorso per sale, spiegazioni, curiosità, foto, pianta con pin, confronti. Scaricabile e offline.']]], ['lista', ['Dal Pass alla Visita paghi solo la **differenza (+100)**.', 'Sotto le **12 opere** la Visita non si vende: compare «Qui il pass non conviene» e puoi scansionare le opere una a una (5 crediti).', 'La Visita vale per **un museo**: scegli prima il museo.']]] },
      { h: 'Come si trova un museo', corpo: [['lista', ['**Scheda Visite**: «Sei a [luogo]» con «Inizia la visita guidata» (il luogo si riconosce dal GPS entro 200 m).', '**Ricerca**: «Cerca un museo o una chiesa» (da 3 lettere). I suggerimenti dicono «Guida pronta · N opere» oppure «Si genera in 1 minuto».', '**«Qui vicino, da visitare dentro»**: fino a 20 luoghi entro 30 km, con distanza e, dove c\'è, «Biglietto da X €».', '**«Le tue visite»**: quelle già pagate (badge «Tua»), si riaprono gratis e senza rete.', 'Da un **itinerario** o dalla **Libreria**, sulle tappe-museo con il badge «🎧 Guida con audioguide delle opere».', 'Dalla scansione **🖼️ Opera**, riconoscendo un\'opera in un museo.', 'Da **Profilo › I miei download › Musei**.']], ['nota', 'Dalla scheda del luogo sulla mappa non c\'è un tasto che apre la guida del museo: usa una delle vie qui sopra. Mentre la guida si prepara (circa un minuto) c\'è un breve quiz: ogni risposta giusta dà 1 credito.']] },
      { h: 'Tutorial: fare una Visita Museo', corpo: [['passi', [
        'Tocca il tondo con la fotocamera e poi la scheda **Visite**.',
        'Cerca il museo (o tocca «Inizia la visita guidata» se sei già lì).',
        'Se non è tuo, leggi la card «Questa guida si sblocca con la Visita Museo» e prova **«Ascolta 30 secondi gratis»**.',
        'Tocca la **Visita Museo** (200 crediti), conferma nel riquadro dei crediti. La guida parte da sola.',
        'Prima di uscire di casa tocca **«Scarica tutto»**: percorso, foto e voci (MP3) restano sul telefono e funzionano **senza rete**.',
        'In sala, dì a WIP **dove sei**: inquadra il **numero sopra la porta** della sala («Dove sono?»), oppure tocca **«Sono qui»** nell\'intestazione della sala. Non consuma il pass.',
        'La barra mostra **«Sei in: [sala] · Prossima: [opera]»**. Tocca una opera e poi **«Ascolta l\'opera»**.',
        'A fine opera una voce dice cosa fare dopo («In questa sala restano…», «Ora passa a…»). Se non ti muovi per un minuto e mezzo ti ricorda di inquadrare il numero della sala.',
        'Tocca **«Termina la visita»**: «Prima di uscire» mostra le opere mancanti, con «Continuo la visita».',
      ]]] },
      { h: 'La schermata della visita, voce per voce', corpo: [['tabella', [['Elemento', 'Che cosa fa'], ['Card «Prossima»', 'L\'opera consigliata ora, con «Ascolta la prossima». Si sceglie prima nella stessa sala, poi nelle vicine.'], ['Di solito affollata', 'Per le 3 opere più famose dalle 11 alle 15: «Rimandala» la sposta in fondo.'], ['Una alla volta', 'Lettore a schermo pieno su un\'opera, con scorrimento laterale.'], ['Leggi con calma', 'Caratteri grandi, voce più lenta, testo sempre visibile.'], ['Comandi vocali', 'Dove il telefono lo supporta: «prossima», «ripeti», «dov\'è», «pausa», «continua», «basta».'], ['Descrizione prima di ogni opera', 'Accessibilità: descrive ciò che si vede prima del racconto.'], ['Il tuo percorso', 'Solo con più di 6 opere con sala: **Tempo** (Tutto, 30 minuti = 8 opere, 1 ora = 15 opere); **Interessi** (Tutto, Dipinti, Sculture, Altro); **Con bambini** (6 opere raccontate a un bambino di otto anni).'], ['Lista | Mappa', 'Passa dall\'elenco alla pianta (compare solo se il museo ha una pianta).'], ['Preferite, Confronti', 'Le tue opere con il cuore; fino a 3 confronti (stesso autore, soggetto o epoca).'], ['Aggiungi opere', 'Online: aggiunge opere minori documentate.'], ['Scarica tutto / Stampa la guida', 'Offline e PDF.'], ['Inquadra la prossima opera', 'Riconosce l\'opera che hai davanti.']]]] },
      { h: 'Per ogni opera', corpo: [['lista', ['**Ascolta l\'opera**: racconto di 250-350 parole con tecnica e misure, «Da cercare guardando» e «Lo sapevi».', '**Descrivimi l\'opera**: audiodescrizione (serve la foto dell\'opera).', '**Cuore**: aggiunge alle preferite (compaiono nel PDF).', '**«Non la trovo» / «Rimettila»**: salta l\'opera (sala chiusa, in prestito, fila).', '**Tre domande pronte**: «Perché è così famosa?», «Cosa devo guardare per capirla?», «Com\'è arrivata qui?» (1 credito ciascuna, serve rete) e **domande pronte anche senza rete**, gratuite.', '**Domanda libera** («La tua domanda su quest\'opera…», **«Chiedi · 1 credito»**, minimo 3 caratteri).', '**Inquadra il cartellino**: traduce il testo accanto all\'opera e mostra «Sul cartellino» in originale. Non consuma il pass.', '**Foto ricordo**: scatti e WIP mette nome, autore, museo e data.']]] },
      { h: 'La pianta con i pin: come leggerla', corpo: [['lista', ['**Un pin = una sala.** Dentro c\'è il **numero d\'ordine** dell\'opera se in sala ce n\'è una sola, oppure **quante opere** ci sono se sono di più.', '**Blu** = ancora da vedere; **verde** = tutte viste; **anello ambra** = la sala dell\'ultima opera riconosciuta (**«Sei qui»**).', 'Con più opere un tocco apre «{sala}: {n} opere. Scegli da quale partire».', '**Zoom**: tasti − e + (1× a 4×), doppio tocco (1× ↔ 2×), trascina col dito. Più piani: chip per piano.', 'La pianta è sempre quella **ufficiale** del museo. Se mancano i pin: «Le posizioni delle sale arriveranno a breve».']], ['nota', 'Le opere «solo collezione» (il museo le possiede ma non dichiara la sala) vanno in fondo, senza numero, sotto «Anche in collezione», e non compaiono in pianta.'] ] },
      { h: 'Avvisi utili durante la visita', corpo: [['lista', ['**Sale chiuse oggi**: le opere interessate sono tolte dal percorso («Sala chiusa oggi»).', '**Orari e biglietti** («Domani»): apertura, chiusura, ultimo ingresso, intero/ridotto, con data di lettura dal sito ufficiale: verifica prima di partire.', '**Il museo chiude fra N minuti**: ti mostra le opere più vicine che mancano.', '**Seconda visita**: «Sei già stato qui il…»; filtro «Solo le nuove, più le preferite».', '**Biglietti e esperienze** da siti partner: il prezzo per te non cambia.']]] },
      { h: 'Audio, lingua, offline e PDF', corpo: [['lista', ['**Audio**: player fisso; comandi nella schermata di blocco; su iPhone Live Activity; widget «Continua la visita».', '**Lingua**: quella dell\'app; la visita si salva per lingua.', '**Offline**: con la visita scaricata funzionano percorso, testi, foto, pianta e voci. Solo la domanda libera serve internet.', '**PDF** («Stampa la guida»): copertina, foto, testi di tutte le opere, pianta con pin numerati e legenda; salvato in Documenti.']]] },
    ],
    manca: ['Non ci sono QR o beacon per orientarti dentro il museo: si usa il numero della sala sopra la porta.', 'La condivisione della «giornata» è stata tolta.', 'Dalla scheda del luogo sulla mappa non c\'è un pulsante diretto alla guida del museo.'],
    correlate: ['vision-riconoscimento', 'musei-cultura', 'tour-di-gruppo', 'come-si-compra'],
    faq: [['Posso usare la guida senza internet?', 'Sì, se hai toccato «Scarica tutto» prima. Solo la domanda libera richiede la rete.'], ['Cosa succede se la Visita non mi serve in quel museo?', 'Sotto le 12 opere non viene venduta; in quel caso scansioni le opere una a una.'], ['Come dico a WIP in che sala sono?', 'Inquadra il numero sopra la porta («Dove sono?») oppure tocca «Sono qui» nella sala.']],
  },
  /* ───────────────────────── TOUR DI GRUPPO ───────────────────────── */
  {
    slug: 'tour-di-gruppo', titolo: 'Tour di gruppo (Live Tour): una guida, tutto il gruppo ascolta', breve: 'Tour di gruppo', macro: 'audio', padre: 'audioguide',
    meta: 'Come funziona il Tour di gruppo di WIP: il leader crea la sessione e condivide il PIN, gli altri entrano e sentono la stessa audioguida nello stesso momento, gratis. Anche nei musei.',
    lead: 'Con il **Tour di gruppo** una persona fa da guida: ogni audioguida che avvia parte **nello stesso momento** sui telefoni di tutto il gruppo. **Paga solo il leader; chi segue ascolta gratis**, anche senza account.',
    sezioni: [
      { h: 'In breve', corpo: [['tabella', [['', 'Leader (la guida)', 'Chi segue'], ['Cosa fa', 'Crea la sessione, condivide il PIN, sceglie i luoghi e le opere', 'Entra con il PIN e ascolta'], ['Costo', 'Le sue audioguide, come sempre', 'Gratis'], ['Account', 'Serve', 'Non serve (si entra anche come ospite)'], ['Lingua dell\'audio', 'La sua', 'Quella del leader («Audio nella lingua del leader»)']]]] },
      { h: 'Tutorial: creare il tour (leader)', corpo: [['passi', [
        'Apri **Profilo** e tocca la scheda **«Tour di Gruppo»**.',
        'Nel riquadro **«Sei la Guida?»** tocca **«Crea Sessione Live»**.',
        'Compare il **PIN del Gruppo**: dillo ai tuoi amici oppure copia il **link** (si apre su wip.guide ed entra da solo con il PIN).',
        'Sotto vedi chi è entrato: «Nel gruppo», con il tuo nome segnato «Guida». Finché nessuno entra leggi «Solo tu connesso — condividi il PIN!».',
        'Ora usa l\'app come sempre: mappa, giro, audioguida libera, visita museo. Ogni audioguida che avvii arriva a tutto il gruppo.',
        'A fine giro tocca **«Termina Sessione»**: il PIN smette di funzionare.',
      ]]] },
      { h: 'Tutorial: entrare nel tour (chi segue)', corpo: [['passi', [
        'Apri **Profilo › Tour di Gruppo** (oppure il link che ti ha mandato il leader).',
        'Nel riquadro **«Sei un Follower?»** scrivi il **PIN** e conferma.',
        'Compare «Sei connesso al Tour». **Tieni il telefono acceso**: quando il leader avvia un luogo, l\'audio parte da solo.',
        'Se il telefono blocca l\'audio automatico compare **«Il leader ha sbloccato un luogo — Tocca per ascoltare dall\'altoparlante»**: un tocco e parte.',
        'Per uscire tocca **«Abbandona Gruppo»**.',
      ]], ['nota', 'Chi entra come ospite può ascoltare tutto il tour gratis; registrandosi (gratis) riceve **100 crediti in regalo** per i viaggi futuri.']] },
      { h: 'Nei musei', corpo: [['lista', ['Se il leader ha la **Visita Museo**, il gruppo segue la sua visita: sala in cui si trova, opera scelta, racconto.', 'Per chi segue è gratuita **solo l\'opera scelta dal leader**: le altre opere richiedono il proprio pass («Solo l\'opera scelta dal leader è gratuita; le altre richiedono il pass»).']]] },
      { h: 'La voce di chi segue', corpo: [['p', 'Chi segue sente **la stessa audioguida del leader, con la stessa voce** (Nicky, Dante o Duetto) e nella lingua del leader. Se quella voce non è ancora pronta sul server, il suo telefono legge lo stesso testo con la voce del dispositivo: chi segue non paga mai la voce.']] },
      { h: 'Messaggi che puoi vedere', corpo: [['tabella', [['Messaggio', 'Che cosa significa'], ['«Leader non raggiungibile: da più di 30 secondi non è nel gruppo.»', 'Il leader ha perso la rete o ha chiuso l\'app. L\'audio riprende quando torna.'], ['«Tour di gruppo non connesso: il canale è stato rifiutato.»', 'L\'ingresso non è riuscito: riprova a inserire il PIN.'], ['«Audio non inviato al gruppo: controlla la connessione.»', 'Lo vede il leader: quell\'audioguida non è arrivata agli altri.'], ['«Un altro dispositivo è già leader di questo tour.»', 'Lo stesso tour è aperto come leader su due telefoni: usane uno.'], ['«Sessione non chiusa sul server: il PIN potrebbe restare valido.»', 'La chiusura non è riuscita (rete): riprova «Termina Sessione».']]]] },
      { h: 'Sicurezza del gruppo', corpo: [['lista', ['Una sessione si trova **solo conoscendo il PIN**: non esiste un elenco pubblico dei tour.', '**Solo il leader trasmette**: nessun partecipante può mandare audio al gruppo.', 'Il leader vede l\'elenco dei partecipanti connessi.']]] },
    ],
    manca: ['**A schermo spento chi segue non sente l\'audio**: il telefono di chi segue deve restare acceso con WIP aperta.', 'Serve **internet** per tutti, per tutto il tour.', 'Non c\'è una chat né un canale vocale: il leader non parla «dal vivo», il gruppo sente le audioguide.', 'Chi entra come ospite non compare sempre nell\'elenco dei partecipanti del leader.'],
    correlate: ['audioguide', 'visita-museo', 'come-si-compra'],
    faq: [['Quanto costa a chi segue?', 'Niente: paga solo il leader, per le audioguide che avvia.'], ['Devono avere tutti l\'app?', 'Basta il sito wip.guide nel browser o l\'app; chi segue non deve nemmeno registrarsi.']],
  },
  /* ───────────────────────── PODCAST E GUIDA D'AUTORE ───────────────────────── */
  {
    slug: 'podcast-e-guida-autore', titolo: 'Podcast del viaggio, Guida d\'Autore e Intervista impossibile', breve: 'Podcast e Guida d\'Autore', macro: 'viaggi', padre: 'itinerari',
    meta: 'Come generare il podcast di ogni giorno del viaggio, la Guida d\'Autore in PDF, l\'audiolibro, l\'EPUB gratuito, la traduzione e l\'Intervista impossibile: costi e opzioni.',
    lead: 'Dopo aver creato un itinerario puoi trasformarlo in un **podcast** da ascoltare, in una **Guida d\'Autore** in PDF e in un **audiolibro**. Ecco ogni passaggio, con costi e opzioni.',
    sezioni: [
      { h: 'In breve', corpo: [['tabella', [['Prodotto', 'Costo', 'Cosa ottieni'], ['Podcast del giorno', '15 crediti per giorno', 'Un episodio letto dalla voce del dispositivo. Riascolto gratuito.'], ['Guida d\'Autore', '20 crediti per giorno', 'Guida PDF sul tuo itinerario, in 5 stili, per email e nell\'archivio.'], ['EPUB della guida', 'Gratis', 'La guida in formato libro elettronico.'], ['Traduzione della guida', 'Metà prezzo (20 × giorni ÷ 2)', 'La guida in un\'altra lingua. Già tradotta: gratis.'], ['Aggiornare un giorno', 'Gratis', 'Rigenera un solo giorno dopo aver cambiato l\'itinerario.'], ['Intervista impossibile', '15 crediti', 'Nicky intervista un personaggio storico della destinazione.']]]] },
      { h: 'Tutorial: il podcast di un giorno', corpo: [['passi', ['Apri l\'itinerario (Itinerario › I Miei Itinerari, oppure appena creato).', 'Nell\'intestazione di ogni giorno trovi il pulsante ambra **«Podcast»**, accanto a «Nel radar» e «Naviga».', 'Tocca **«Podcast»**. Se il giorno ha già un episodio, il pulsante dice **«Riascolta»** e non chiede nulla.', 'Altrimenti compare la conferma «Podcast AI» con costo (15 crediti) e saldo: **Conferma**.', 'Durante la creazione il pulsante dice **«Genera...»**; poi parte l\'ascolto con un mini-player: **Pausa/Riprendi**, **Stop**, **Riavvia dall\'inizio**.', 'Un secondo tocco su «Podcast» dello stesso giorno ferma l\'ascolto.']], ['lista', ['**Come suona**: il testo viene letto dalla **voce di sistema** del telefono nella lingua dell\'app. Con la Modalità Guida **Nicky** si preferisce una voce femminile, con **Dante** una maschile.', '**Se il dispositivo non ha una voce** compare un avviso e **non paghi**.', '**Se la creazione fallisce** i crediti tornano.', '**Dove si ritrova**: riaprendo l\'itinerario il pulsante diventa «Riascolta».']], ['nota', 'Il podcast del giorno è un testo letto dal dispositivo: **non c\'è un file audio da scaricare né da condividere**, e non puoi scegliere durata o voce.'] ] },
      { h: 'Tutorial: la Guida d\'Autore', corpo: [['passi', ['Sul risultato dell\'itinerario tocca **«📖 Genera Guida d\'Autore»**.', 'Scegli lo **stile narrativo** (vedi la tabella sotto). Il predefinito è **Essenziale**.', 'Facoltativo: **«🎁 Dedica»** (fino a 300 caratteri): finisce in copertina e il costo non cambia.', 'Facoltativo: **«Altri destinatari email»**: fino a 5 indirizzi, separati da virgola, punto e virgola o spazio. Ricevono la guida oltre a te.', 'Conferma il costo (**20 crediti × numero di giorni**) e accetta il consenso AI.', 'La guida va **in coda** sul server (anche 10 minuti). Puoi **chiudere l\'app**: arriva **per email con il PDF** e come notifica, e la trovi in **Profilo › ITINERARI › GUIDE PREMIUM** e in **I miei download › Guide Premium**. Intanto puoi fare un quiz.', 'Se la stessa guida (stesso itinerario, stile e lingua) esiste già, si apre subito **senza addebito**.']], ['tabella', [['Stile', 'Cosa privilegia'], ['🎨 Arte & Storia', 'Analisi critica, architettura e aneddoti storici'], ['👨‍👩‍👧‍👦 Famiglia', 'Attività, giochi e curiosità per bambini di ogni età'], ['🛍️ Shopping & Design', 'Boutique artigiane, design locale e trend'], ['🍷 Enogastronomia', 'Piatti tipici, produttori locali e tradizioni culinarie'], ['⚡ Essenziale (predefinito)', 'Orari, prezzi, accesso e logistica']]]] },
      { h: 'Quando la guida è pronta: i pulsanti', corpo: [['tabella', [['Pulsante', 'Cosa fa'], ['Condividi guida', 'Condivide il link (o lo copia).'], ['🎧 Podcast', 'Il podcast della guida: 15 crediti; riascolto gratis.'], ['📖 EPUB', 'Scarica la guida in formato EPUB, gratis.'], ['Rigenera', 'Torna alla scelta dello stile: è una nuova generazione a pagamento.'], ['Scarica PDF', 'Salva il PDF (nome «WIP_titolo.pdf»).']]]] },
      { h: 'Audiolibro, traduzione e aggiornamento di un giorno', corpo: [['p', 'Aprendo una guida salvata (da Profilo › GUIDE PREMIUM › APRI GUIDA, o dal visualizzatore dell\'itinerario) trovi il pannello **«Audio-libro della guida»**.'], ['lista', ['**Capitoli**: un\'introduzione (storia, cultura, consigli pratici) e uno per giorno («Giorno N · tema»). Ogni capitolo ha play/pausa, la durata stimata («~N min») e Stop.', '**Voce**: per lingua (IT Elsa, EN Jenny, FR Denise, ES Elvira, DE Katja, RU Svetlana, ZH Xiaoxiao); la prima lettura prepara la voce (qualche secondo), poi è immediata.', '**«📖 Scarica EPUB»**: gratuito, il contenuto è già tuo.', '**«🌍 Traduci in…»**: scegli la lingua (escluso quella attuale), tocca «Traduci» e poi «Conferma»: costa **metà prezzo**; se esiste già la traduzione è **gratis** («nessun addebito»).', '**«Hai cambiato l\'itinerario?»**: scegli il **Giorno N** e tocca **«Aggiorna»**: rigenera quel giorno **gratis**.']]] },
      { h: 'Intervista impossibile', corpo: [['p', 'Nel pannello dell\'audiolibro c\'è **«🎙️ Intervista impossibile»**: Nicky intervista un personaggio storico della tua destinazione.'], ['passi', ['Tocca il pulsante ambra col microfono: compare «Costa 15 crediti: premi di nuovo per confermare».', 'Tocca di nuovo: «Cerco l\'ospite e scrivo l\'intervista…».', 'Ascolti le battute («In onda con {ospite} · battuta n/N»); **Stop** per fermare.']], ['p', 'Nicky parla con una voce femminile e l\'ospite con una maschile. Non si può scaricare né condividere.']] },
    ],
    manca: ['Nessun download o condivisione del file audio del podcast e dell\'intervista.', 'Non si sceglie la durata né la voce del podcast giornaliero.', 'Un podcast non ha una cartella nei download.'],
    correlate: ['itinerari', 'come-si-compra', 'archivio-download-punti'],
    faq: [['Il podcast usa una voce vera?', 'Usa la voce di sistema del tuo dispositivo nella lingua dell\'app.'], ['Perdo crediti se la guida non arriva?', 'No: se la generazione fallisce il server rimborsa.'], ['Posso avere la guida in un\'altra lingua?', 'Sì, con «Traduci in…» a metà prezzo.']],
  },
  /* ───────────────────────── PROFILO E SETUP ───────────────────────── */
  {
    slug: 'profilo-e-setup', titolo: 'Profilo e Setup: ogni scheda e ogni opzione spiegata', breve: 'Profilo e Setup', macro: 'viaggi',
    meta: 'Tutte le schede del Profilo e tutte le opzioni del Setup di WIP: mappa iniziale, notifiche, permessi, consumi, sicurezza, lingua, coupon, GeoControl e categorie audioguida.',
    lead: 'Il **Profilo** è l\'ultima voce della barra in basso. La scheda **SETUP** (titolo «Impostazioni App») contiene le opzioni che cambiano il comportamento dell\'app. Qui sono tutte, nell\'ordine in cui le trovi, con i valori predefiniti.',
    sezioni: [
      { h: 'Le schede del Profilo', corpo: [['tabella', [['Scheda', 'A cosa serve'], ['I miei download', 'Tutto ciò che funziona senza rete (vedi la pagina dedicata).'], ['DIARIO', 'Day Pass, statistiche del viaggiatore, passaporto, luoghi salvati.'], ['My Vision', 'Le foto scansionate e il loro stato.'], ['ITINERARI', 'Sotto-schede «ITINERARI AI» e «GUIDE PREMIUM». Per ogni itinerario: Riprendi, Racconto, Calendario, Apri in Maps, Garanzia pioggia.'], ['Missioni', 'Livello, premi, achievement.'], ['Tour di Gruppo', 'Sessioni con PIN per ascoltare insieme.'], ['ARCHIVIO', 'La cronologia degli ascolti: riascolti le guide già acquistate.'], ['SETUP', 'Le impostazioni qui sotto.'], ['Shop', 'Acquisto crediti.'], ['Listino', 'I prezzi in crediti.'], ['Guida', 'Il manuale dell\'app (anche in PDF).'], ['Supporto', 'Assistenza, segnalazione problema con dati diagnostici, manuale, informazioni legali.'], ['Privacy', 'Informativa.']]], ['p', 'In alto: la 🔔 **campanella** apre il Centro notifiche. È un registro **locale** (fino a 100 voci) dei luoghi incontrati e degli avvisi dell\'audioguida, con «Segna tutte come lette»: non sono le notifiche push.']] },
      { h: 'SETUP, opzione per opzione', corpo: [['tabella', [['Sezione', 'Opzioni e valori', 'Predefinito'],
        ['Dove si apre la mappa', '«La mia posizione» · «Dove ero l\'ultima volta» · «Una città a mia scelta» (cerca da 3 lettere)', 'La mia posizione'],
        ['Notifiche', '«Avvisi di servizio» (guida pronta, rimborsi, tour di gruppo) · «Novità e offerte» (al massimo una a settimana)', 'Servizio: acceso · Offerte: spento'],
        ['Permessi (app)', 'Posizione «anche a schermo spento» (serve «Consenti sempre»), Notifiche, «Batteria senza limiti»; tocca «Attiva»', '—'],
        ['Consumi e Costi', 'Crediti consumati per Dettagli POI, Vision AI, Itinerario AI, Audioguida, Guida PDF; chat e podcast «non tracciati»; listino; saldo premi', '—'],
        ['Area Personale', 'Nome mostrato · Foto profilo (emoji, URL o «Sfoglia...», massimo 1 MB)', '—'],
        ['Movimenti crediti', 'Ultimi 50 movimenti; filtri Spese / Ricariche / Rimborsi', '—'],
        ['Importa da Google Maps', 'CSV «Luoghi salvati» di Google Takeout o GeoJSON: ogni luogo cercato entro circa 150 m e messo nei preferiti; report importati / già preferiti / non trovati', '—'],
        ['Internet in viaggio (eSIM)', 'Link affiliati Airalo, Holafly, Saily', '—'],
        ['Sicurezza', '«Sblocco con impronta / volto» · «Blocco app all\'avvio» (solo se il telefono ha la biometria) · «Cambia password» (account email: attuale, nuova di almeno 6 caratteri, conferma)', 'Spenti'],
        ['Lingua di Sistema', 'Italiano, English, Français, Español, Deutsch, Русский, 中文: traduce descrizioni, itinerari e audioguide', 'Quella del dispositivo'],
        ['Posizione Predefinita', 'Cerca una città o «Usa la mia posizione attuale»', '—'],
        ['Coupon promozionale', 'Codice (es. CAV2026) e «Attiva»: ricevi crediti omaggio. **Non c\'è su iPhone**', '—'],
        ['Modalità Guida', '**Nicky** (Trendy & Fun, voce femminile) · **Dante** (Guida Classica, voce maschile)', 'Nicky'],
        ['GeoControl Avanzato', 'Vedi la tabella sotto', 'Vedi sotto'],
        ['Ripristina acquisti', 'Solo app iPhone/Android', '—'],
        ['Esporta i tuoi dati', 'File JSON con profilo, itinerari, preferiti, movimenti crediti e Vision', '—'],
        ['Esci / Elimina Account', 'Elimina chiede di scrivere «elimina»: **irreversibile**, cancella dati, crediti e progressi', '—'],
      ]], ['nota', '«Dove si apre la mappa» e «Posizione Predefinita» sono due impostazioni vicine che riguardano il punto di partenza: in caso di dubbio imposta «Dove si apre la mappa».'] ] },
      { h: 'GeoControl Avanzato: tutte le opzioni', corpo: [['tabella', [['Opzione', 'Cosa cambia', 'Valore predefinito', 'Minimo – massimo'], ['Modalità Attivazione', '**Automatica**: la guida completa parte da sola (15 crediti per nuovo luogo, anche a telefono bloccato, salvo Day Pass). **Semi-Automatica**: avviso e teaser da soli, «Ascolta» lo tocchi tu.', 'Automatica', '—'], ['Distanza Avviso a Piedi', 'Quando parte «Ti stai avvicinando a…»', '150 m (passo 10)', '50 – 400 m'], ['Distanza Avviso in Auto', 'Idem, in auto', '300 m (passo 20)', '100 – 600 m'], ['Distanza Inizio Guida 🚶', 'Quanto vicino al luogo parte la guida, a piedi', '30 m (passo 5)', '15 – 100 m'], ['Distanza Inizio Guida 🚗', 'Idem, in auto', '50 m (passo 5)', '20 – 150 m'], ['Racconta solo ciò che hai davanti', 'Usa la bussola: parla solo dei luoghi nella direzione in cui guardi', '—', 'interruttore'], ['Azzera Storico', 'Cancella la memoria dei luoghi già ascoltati (altrimenti un luogo non riparte per 24 ore)', '—', 'pulsante («Fatto ✓»)'], ['Test Voce Azure', 'Prova le voci Nicky e Dante in tutte le lingue: verde = ok, rosso = errore', '—', 'pulsante «Testa tutte»']]]] },
      { h: 'Categorie Audioguida', corpo: [['p', 'Decidono quali luoghi parlano da soli. Pulsanti «Seleziona Tutti» e «Deseleziona Tutti».'], ['tabella', [['Categoria', 'Predefinito'], ['💎 Gemme esclusive', 'Sempre attive (non si possono spegnere)'], ['Monumenti & Castelli', 'Acceso'], ['Musei & Gallerie', 'Acceso'], ['Chiese & Luoghi di Culto', 'Acceso'], ['Panorami & Belvedere', 'Spento'], ['Natura: spiagge, vette, acque, grotte, parchi', 'Spento'], ['Consigli & Info (gratuiti)', 'Spento — non consumano crediti']]], ['nota', 'WIP Community e i temi (terme, cinema, cieli…) si esplorano dalla mappa e non hanno audioguida automatica. Il testo del Setup dice che l\'ascolto automatico in background «funziona solo su Android»: è probabilmente un testo non aggiornato, perché l\'app per iPhone esiste.'] ] },
    ],
    correlate: ['audioguide', 'come-si-compra', 'archivio-download-punti'],
    faq: [['Come cambio la lingua?', 'Profilo › SETUP › Lingua di Sistema.'], ['Dove inserisco un coupon?', 'Solo in Profilo › SETUP › «Hai un coupon promozionale?» (non su iPhone).'], ['Come elimino il mio account?', 'In fondo al SETUP: «Elimina Account», scrivi «elimina» e conferma. È irreversibile.']],
  },
  /* ───────────────────────── ARCHIVIO, DOWNLOAD, PUNTI ───────────────────────── */
  {
    slug: 'archivio-download-punti', titolo: 'Archivio, I miei download, punti, missioni e quiz', breve: 'Archivio, download e punti', macro: 'viaggi',
    meta: 'Come funzionano Archivio (ascolti), I miei download (5 cartelle), punti XP, livelli, Missioni, quiz di caricamento, Passaporto e Garanzia pioggia in WIP.',
    lead: 'Qui trovi dove ritrovare tutto ciò che hai fatto (Archivio e download) e come si guadagnano punti e crediti (XP, Missioni, quiz).',
    sezioni: [
      { h: 'Archivio: i tuoi ascolti', corpo: [['p', 'La scheda **ARCHIVIO** del Profilo è la **cronologia degli ascolti** delle audioguide, raggruppata per data. Non contiene i download.'], ['lista', ['Ogni scheda mostra foto, categoria, nome e ora.', '**Riascolta (già acquistato)**: riascolti gratis una guida che hai già.', 'Il **cestino** toglie l\'ascolto dalla cronologia (chiede conferma).', '«Non disponibile» se il luogo non esiste più.']] ] ,},
      { h: 'I miei download: le cinque cartelle', corpo: [['p', 'Si apre da **Profilo › I miei download**, da **Itinerario › I Miei Itinerari** e da Itinerario › Offline: è sempre lo stesso archivio. In alto vedi lo «Spazio usato». In ogni cartella puoi ordinare per **Data** o **Nome** e scegliere la vista **elenco** o **griglia**.'], ['tabella', [['Cartella', 'Cosa contiene', 'Pulsanti su ogni riga'], ['Itinerari', 'Itinerari scaricati o sul tuo account. Segnali: Mappa ✓/✗, Navigazione ✓/✗, audioguide fatte/totali, dimensione, PDF.', 'Naviga · Racconto · PDF · Elimina; «Scarica» (se solo sull\'account); «Completa download» (se incompleto)'], ['Mappe', 'Aree scaricate per l\'offline: scegli una città e un raggio (fino a 100 km).', 'Apri sulla mappa · Aggiorna (solo modifiche) · Elimina dal dispositivo'], ['Audioguide', '«Audioguide ascoltate» (porta all\'Archivio) e le guide scaricate.', 'Tocco per aprire'], ['Guide Premium', 'Le Guide d\'Autore.', 'PDF · Scarica'], ['Guide Musei', 'Le visite museo pagate.', 'PDF · Scarica · Elimina']]], ['lista', ['**Badge**: «Pronto offline» (verde), «Incompleto» (ambra), «Nel tuo account» (blu).', '**PDF stampati** compaiono in fondo alla cartella.', 'Riaprire un download **non tocca crediti né pass**.', 'Le mappe offline sono gratis: si paga solo l\'ascolto delle audioguide.']], ['nota', 'I podcast e gli audiolibri non hanno una cartella.'] ] },
      { h: 'Punti XP, livelli e Missioni', corpo: [['tabella', [['Azione', 'Punti'], ['Aprire la scheda di un luogo mai esplorato', '+5 XP («Luogo Esplorato!»)'], ['Ascoltare un\'audioguida', '+10 XP'], ['Scansione di un luogo con Vision', '+10 XP'], ['Risposta corretta a un quiz', '+20 XP e +1 credito']]], ['p', 'La scheda **Missioni** mostra l\'anello del **livello** (XP attuali e mancanti, «Premio livello: +n crediti»), il carosello **«Premi dei Livelli»** e gli **«Achievement Esplorativi»** (per esempio «Visita n luoghi» di una categoria, con barra di avanzamento e crediti in premio). I premi dei livelli **non arrivano da soli**: tocca **«RISCATTA PREMI»**. I crediti guadagnati non scadono e si spendono per primi. Le soglie dei livelli le trovi nell\'app.'] ] },
      { h: 'Il quiz', corpo: [['p', 'Mentre aspetti una generazione (itinerario o Guida d\'Autore) compare un **quiz**: domande a 4 risposte su viaggi e luoghi, con la spiegazione per 4 secondi dopo ogni risposta. Alla fine: «Quiz Completato! … Vinti: crediti e XP». **«Salta»** lo chiude e i punti maturati vengono comunque assegnati. Le domande non sono sulla tua destinazione.']] },
      { h: 'Diario e Passaporto', corpo: [['lista', ['**DIARIO** (Profilo): luoghi ascoltati, città nel passaporto, scatti Vision, ascolti degli ultimi 6 mesi.', '**Salute del viaggio** (solo app): passi, km e piani, ultimi 7 giorni.', '**Il tuo anno in viaggio**: città visitate e il «luogo del cuore»; «Condividi» crea un\'immagine.', '**Passaporto WIP**: un timbro per destinazione, con la data della prima visita; «Condividi il passaporto».']]] },
      { h: 'Garanzia pioggia', corpo: [['passi', ['Apri Profilo › ITINERARI › AI: sugli itinerari creati negli **ultimi 7 giorni** compare **«🌧 È piovuto? Garanzia pioggia»**.', 'Scegli il giorno («Che giorno è piovuto?»).', 'Tocca **«Verifica e richiedi il rimborso»**.']], ['p', 'Se quel giorno ha piovuto **almeno 6 ore o 20 mm** (dati Open-Meteo), ti restituiamo i crediti di quel giorno. È **una volta per giorno** di itinerario, senza scontrini. Se i dati meteo non sono ancora consolidati, riprova tra un paio di giorni.']] },
    ],
    manca: ['Non esistono classifiche.', 'Il catalogo dei badge non è consultabile.', 'Il quiz compare solo durante il caricamento, non mentre esplori la mappa.'],
    correlate: ['profilo-e-setup', 'come-si-compra', 'vision-riconoscimento'],
    faq: [['Come guadagno crediti?', 'Con i quiz (1 credito a risposta giusta), le Missioni e i premi dei livelli, e dalle foto approvate in WIP Community.'], ['Dove ritrovo una guida che ho già ascoltato?', 'In Profilo › ARCHIVIO: «Riascolta (già acquistato)».'], ['Cosa succede se non riscatto un premio?', 'Resta in attesa finché tocchi «RISCATTA PREMI».']],
  },
  /* ───────────────────────── PRIMI 5 MINUTI ───────────────────────── */
  {
    slug: 'primi-5-minuti', titolo: 'I primi 5 minuti con WIP', breve: 'Primi 5 minuti', macro: 'viaggi',
    meta: 'Per chi apre WIP per la prima volta: cinque passi per vedere la mappa, trovare un luogo, ascoltare una guida e capire cosa è gratis.',
    lead: 'Non devi leggere tutta la guida per iniziare. Questi cinque passi bastano per capire a cosa serve WIP.',
    sezioni: [
      { h: 'I cinque passi', corpo: [['passi', [
        '**Apri WIP** da wip.guide o dall\'app. Si apre sulla mappa («Esplora»). Concedi la posizione quando richiesto: serve per mostrarti i luoghi vicini.',
        '**Guarda i pin.** Ogni pin è un luogo; il colore e l\'icona dicono di che tipo. Accendi o spegni le categorie con le chip in alto.',
        '**Tocca un pin.** Si apre un riquadro con foto e nome; tocca ancora per la scheda completa con descrizione e distanza. Leggerla è gratis.',
        '**Ascolta.** Nella scheda, se il luogo ha un\'audioguida, trovi il lettore. In alternativa tocca **Guida** nella barra in basso, metti le cuffie e cammina: l\'audioguida parte da sola quando arrivi.',
        '**Pianifica.** Dalla scheda **Itinerario** puoi aprire un itinerario pronto dalla Libreria (gratis) o crearne uno tuo.',
      ]]] },
      { h: 'Cosa serve e cosa costa', corpo: [['lista', ['Mappa, schede, teaser vocali, WipNav a piedi, Libreria itinerari ed Eventi sono **gratis**.', 'L\'audioguida completa, gli itinerari generati e le guide museo usano **crediti** (vedi «Cosa è gratis»).', 'Per le guide che partono da sole a schermo spento serve l\'**app** per iPhone o Android.']]] },
    ],
    correlate: ['interfaccia', 'tutorial', 'gratis-e-crediti'],
    faq: [['Devo creare un account?', 'Per guardare la mappa e le schede no; crediti, itinerari e acquisti richiedono un account.']],
  },
  /* ───────────────────────── INTERFACCIA ───────────────────────── */
  {
    slug: 'interfaccia', titolo: 'L\'interfaccia di WIP spiegata: barra, chip, pulsanti', breve: 'L\'interfaccia', macro: 'viaggi',
    meta: 'Cosa fa ogni pulsante di WIP: la barra in basso (Esplora, Itinerario, Eventi, fotocamera, WIP AI, Guida, Profilo), le chip delle categorie, i pulsanti della mappa.',
    lead: 'Una guida visiva ai comandi: dove sta ogni cosa e che cosa fa quando la tocchi.',
    sezioni: [
      { h: 'La barra in basso', corpo: [['tabella', [['Voce', 'Che cosa fa'], ['Esplora', 'La mappa con i luoghi e i livelli.'], ['Itinerario', 'Creare, aprire e scaricare itinerari; Libreria; viaggio di gruppo.'], ['Eventi', 'Eventi, mostre e stagionali.'], ['Tondo con la fotocamera', 'Vision: riconosce luoghi, opere, natura; Radar AR; Visite museo.'], ['WIP AI', 'Chat con l\'assistente (3 crediti ogni 10 messaggi).'], ['Guida', 'Accende o spegne il radar delle audioguide; il tasto sopra lo silenzia.'], ['Profilo', 'Impostazioni, crediti, Shop, listino, archivio, manuale, tour di gruppo.']]]] },
      { h: 'In alto sulla mappa', corpo: [['lista', ['**Chip delle categorie**: Gemme, Monumenti, WIP Community, Esperienze, Eventi; con **＋ Altro** aggiungi Natura, Località, Locali, Utilità, Famiglie, Beni Culturali, Tematici.', '**Sotto-chip**: compaiono sotto la barra quando la chip è accesa e affinano la ricerca (per esempio Chiese, Musei, Panorami).']]] },
      { h: 'Sulla mappa', corpo: [['lista', ['**Livelli** (in basso a sinistra): sentieri, ciclovie, vino e gusto, neve, sole, clima, qualità del mare, satellite e altro.', '**Lente 🔍**: cerca una città.', '**Mirino**: centra sulla tua posizione; tenuto premuto, la mappa ti segue.', '**Indicatore meteo** al centro in basso: temperatura e, se piove, l\'avviso.', '**Pin numerati**: più luoghi vicini raggruppati; zoomando si separano.']]] },
    ],
    correlate: ['primi-5-minuti', 'mappa-e-ricerca', 'glossario'],
    faq: [],
  },
  /* ───────────────────────── GLOSSARIO ───────────────────────── */
  {
    slug: 'glossario', titolo: 'Glossario di WIP: le parole dell\'app', breve: 'Glossario', macro: 'viaggi',
    meta: 'Gemme, teaser, Day Pass, crediti, radar, giro, WipNav, GeoControl: il significato di ogni parola usata in WIP.',
    lead: 'Se incontri una parola che non conosci, la trovi qui.',
    sezioni: [
      { h: 'Le parole', corpo: [['lista', [
        '**Gemma**: luogo segnalato come particolarmente importante; la sua audioguida parte sempre.',
        '**Teaser**: breve anticipazione vocale gratuita che parte all\'arrivo.',
        '**Guida completa**: il racconto lungo del luogo, a crediti.',
        '**Crediti**: la moneta dell\'app; non scadono; si comprano o si guadagnano con le Missioni.',
        '**Day Pass**: 24 ore con fino a 40 guide complete incluse, anche offline.',
        '**Radar** (tasto Guida): il controllo che fa partire le audioguide quando arrivi.',
        '**Giro**: sequenza di tappe con audioguida (fino a 10).',
        '**Percorso su misura**: percorso a pagamento (30 crediti) con i luoghi che scegli.',
        '**WipNav**: navigatore a piedi con la voce.',
        '**GeoControl**: le impostazioni delle distanze di avviso e arrivo.',
        '**Vision**: riconoscimento di luoghi, opere e natura da una foto.',
        '**Guida d\'Autore**: guida in PDF scritta sul tuo itinerario.',
        '**Libreria**: itinerari già pronti, gratuiti.',
        '**WIP Community**: luoghi proposti dagli utenti, controllati prima della pubblicazione.',
      ]]] },
    ],
    correlate: ['interfaccia', 'primi-5-minuti'],
    faq: [],
  },
  /* ───────────────────────── PROBLEMI ───────────────────────── */
  {
    slug: 'problemi-e-soluzioni', titolo: 'Problemi e soluzioni: perché non parte, perché non vedo…', breve: 'Problemi e soluzioni', macro: 'viaggi',
    meta: 'Le cause più comuni quando l\'audioguida non parte, il GPS è impreciso, il navigatore tace o non trovi un luogo, e come risolverle.',
    lead: 'Quando qualcosa non funziona, di solito la causa è una di queste.',
    sezioni: [
      { h: 'L\'audioguida non parte', corpo: [['lista', ['La categoria è **spenta** nel Setup (Profilo › SETUP › Categorie Audioguida). Le gemme parlano comunque.', 'La **precisione GPS** è peggiore di 50 m: l\'app non fa partire nulla. Esci all\'aperto.', 'Il luogo l\'hai **già ascoltato nelle ultime 24 ore** («Azzera storico» nel Setup).', 'Sei sul **web** con la pagina chiusa o lo schermo spento: serve l\'app.', 'Non hai crediti né Day Pass per la guida completa: il teaser parte lo stesso.', 'Modalità **Semi-Automatica**: tocca tu «Ascolta».', 'Il luogo appartiene a una categoria **senza audioguida** (Locali, Utilità, Famiglie, Tematici, Community, Beni Culturali).']]] },
      { h: 'Il navigatore o il giro tace', corpo: [['lista', ['Il navigatore multi-tappa del giro richiede il **Day Pass**.', 'WipNav è **solo a piedi**; per l\'auto usa Google Maps.', 'Con lo schermo spento serve l\'**app** con il permesso di posizione «Sempre».', 'Se sbagli strada a schermo spento, il ricalcolo avviene riaprendo l\'app.']]] },
      { h: 'Non trovo un luogo', corpo: [['lista', ['La ricerca trova **città**, non singoli nomi: cerca la città e accendi la chip giusta.', 'Alcune cose compaiono solo con più **zoom** («avvicinati per vederli»).', 'Ti manca la categoria in barra: aggiungila da **＋ Altro**.', 'Hai trovato un errore? Dalla scheda tocca «Hai notato un errore? Segnalalo».']]] },
      { h: 'Offline', corpo: [['p', 'I pacchetti area e il Day Pass offline funzionano nell\'**app**. Scarica prima, con il Wi-Fi, gli itinerari e le zone che ti servono (Profilo › I miei download).']] },
    ],
    correlate: ['audioguide', 'navigatore', 'web-iphone-android'],
    faq: [['Il GPS è sempre impreciso in città?', 'Tra i palazzi alti la precisione peggiora: aspetta qualche secondo all\'aperto.']],
  },
  /* ───────────────────────── FAQ ───────────────────────── */
  {
    slug: 'domande-frequenti', titolo: 'Domande frequenti su WIP', breve: 'Domande frequenti', macro: 'viaggi',
    meta: 'Le risposte alle domande più frequenti su WIP: cosa è gratis, audioguide, offline, itinerari, eventi, dati e limiti.',
    lead: 'Le risposte sono raccolte da tutte le pagine della guida. Usa la ricerca qui sotto per trovare la pagina giusta.',
    faqTutte: true,
    correlate: ['tutorial', 'categorie'],
    faq: [],
  },
];

/* ═══════════ I 12 LIVELLI DELLA MAPPA: una pagina ciascuno + hub (verificato nel codice il 15/11/2026) ═══════════ */
const LIVELLI = [
  { id: 'sentieri', e: '🥾', nome: 'Sentieri e cammini', gruppo: 'Dove andare', sub: 'con ippovie, rifugi, corsa, canoa e itinerari storici',
    disegna: ['**Pin tondi** con un\'emoji, raggruppati in palline verdi col numero. Il pin indica il **punto di partenza** del percorso, non il tracciato.', '**Tracciati puntinati verdi** (la canoa è blu). Zoomando compaiono prima le linee semplici, poi quelle intere e, da zoom 13, le **tappe numerate**.', 'Emoji: 🐴 ippovie · 🏔 Sentiero Italia (CAI) · 🎒 sentieri principali · 🏃 corsa · 🛶 canoa · 🏛 itinerari storici · 🥾 altri. 🏔 «Rifugio alpino» da zoom 12 (fino a 60), solo se il livello Neve è spento.', 'Non c\'è una legenda: si legge dall\'emoji e dal colore.'],
    zoom: 'Compare già a zoom basso. Dal zoom 4 vedi le linee semplificate; da 11 le linee intere; da 13 le tappe. Sotto zoom 10 vedi solo i percorsi principali; da 12 anche quelli locali, ippovie, corsa e canoa.',
    tocco: ['Il pin apre un fumetto: «{emoji} nome», una riga di descrizione e **«Punto di partenza · © contributori OpenStreetMap»**.', 'Il tracciato mostra nome e **km**; un percorso calcolato dice «percorso ricostruito fra le tappe».', 'Una tappa mostra «Tappa N · località» e le note. Non ci sono pulsanti né link.'],
    fonte: 'OpenStreetMap (ODbL), CAI INFOMONT e PDIPR francese (Licence Ouverte 2.0). Le informazioni si aggiornano quando sposti la mappa di oltre 400 m o cambi zoom.',
    limiti: ['**Niente dislivello, difficoltà, durata, GPX né chiusure.**', 'Il pin è la partenza: le tappe sono località.', 'Nelle zone fitte i sentieri locali sono tagliati (massimo 120 pin sotto zoom 12, 200 da 12).'],
    opzioni: 'Nessun filtro o interruttore interno.', combina: 'Si somma a Ciclovie e Vino e gusto. Con Neve acceso i rifugi li disegna la Neve.', correlate: ['sentieri-e-ciclovie', 'natura-percorsi'] },
  { id: 'ciclovie', e: '🚲', nome: 'Ciclovie e mountain bike', gruppo: 'Dove andare', sub: 'EuroVelo e reti nazionali',
    disegna: ['Pin **🚲** (🚵 per la mountain bike) raggruppati in palline arancioni; **tracciati puntinati arancioni**.', 'Le tappe numerate compaiono solo a zoom alto.', 'Senza legenda.'],
    zoom: 'Sotto zoom 12 vedi solo le **reti vere** (per esempio EuroVelo e reti nazionali); da zoom 12 anche le ciclabili locali e la mountain bike.',
    tocco: ['Come i sentieri: fumetto con «Punto di partenza» e la fonte. Il tracciato dà nome e km.'],
    fonte: 'OpenStreetMap (ODbL).', limiti: ['**Niente fondo, difficoltà, dislivello né GPX.**', 'Nessun segnale di tratti chiusi.'],
    opzioni: 'Nessuna.', combina: 'Si può sovrapporre ai Sentieri (colori diversi).', correlate: ['sentieri-e-ciclovie', 'natura-percorsi'] },
  { id: 'vino-gusto', e: '🍷', nome: 'Vino e gusto', gruppo: 'Dove andare', sub: 'cantine, strade e botteghe',
    disegna: ['**Zone di denominazione** (poligoni) colorate per famiglia: 🍷 vino bordeaux, 🧀 formaggi giallo scuro, 🫒 olio verde oliva, 🥓 carni mattone, 🍽️ altri prodotti ambra. Dove più famiglie coincidono la zona è a **strisce diagonali**. Bordo continuo se ufficiale o grande, tratteggiato se derivata.', '**Strade del vino** come tracciati bordeaux puntinati con tappe numerate.', '**Pin**: produttori (cantine, caseifici, frantoi, birrifici, distillerie…) più grandi; **botteghe** più piccole e semitrasparenti.'],
    zoom: 'Le zone compaiono da zoom 4; i produttori a ogni zoom; le **botteghe** da zoom 14. Le palline si aprono da zoom 12.',
    tocco: ['**Zona**: famiglia in cima (es. «🍷 Vino»), nome e tipo (DOP, IGP…), gli altri prodotti sullo stesso confine, area in km², «confine ufficiale» oppure «area indicativa (confini dei comuni), non il disciplinare», link al sito ufficiale.', '**Pin**: nome, descrizione, link «sito ↗», telefono e «Verifica sempre orari e prenotazione».', '**Strada curata**: regione, giorni, prodotti, tappe, stagione.'],
    fonte: 'Luoghi del gusto dall\'archivio WIP (da OpenStreetMap), zone dal registro delle denominazioni (USA: confini ufficiali CC0; UE: derivate dai comuni, dichiarate indicative), tracciati con OSRM su dati OpenStreetMap.',
    limiti: ['**Niente orari, prezzi o prenotazioni**, né elenco dei prodotti di ogni cantina.', 'Le zone derivate sono **approssimative**: non sostituiscono il disciplinare.', 'I vigneti, uliveti e frutteti compaiono solo dallo zoom delle botteghe e con un nome vero.', 'Non attiva l\'audioguida.'],
    opzioni: 'Nessun filtro; le tipologie sono fisse.', combina: 'Si somma a Sentieri e Ciclovie.', correlate: ['vino-e-gusto', 'ristoranti-gastronomia'] },
  { id: 'fontanelle', e: '🚰', nome: 'Fontanelle, bagni, panchine', gruppo: 'Dove andare', sub: '(punti d\'acqua, servizi igienici e panchine)',
    disegna: ['Pin tondi con 💧 fontanella, 🚻 bagni pubblici, 🪑 panchina. Nessun raggruppamento, nessun colore per tipo, nessuna legenda.'],
    zoom: 'Nessuna soglia: il livello legge un raggio di **2 km dal centro della mappa**; si ricarica quando ti sposti di oltre 1,5 km.',
    tocco: ['Un fumetto con il nome (o «Fontanella», «Bagni pubblici», «Panchina») e, se hai la posizione, «📍 N m da te». Nient\'altro.'],
    fonte: 'Archivio WIP da OpenStreetMap; se non risponde, un servizio di ripiego e infine OpenStreetMap diretto. Risultati ricordati 24 ore.',
    limiti: ['**Non dice se la fontanella funziona o l\'acqua è potabile**, né orari o accessibilità.', 'Al massimo 60 punti per tipo: nelle zone dense ne vedi una parte.', 'Se il caricamento fallisce compare un avviso e il livello si spegne.'],
    opzioni: 'Nessun interruttore per tipo.', combina: 'Nessuna regola speciale; utile con Sentieri e Ciclovie.', correlate: ['servizi-utili', 'sentieri-e-ciclovie'] },
  // 16/11/2026 (committente: «le aree protette sono da aggiornare, non solo Europa, e dire le specie presenti»).
  // Numeri letti il 16/11/2026 da aree_protette_cache (scratch/guida-numeri-aree.mjs): 236.172 aree.
  { id: 'natura2000', e: '🌿', nome: 'Aree protette nel mondo e le loro specie', gruppo: 'Dove andare', sub: '236.172 parchi, riserve e siti Natura 2000 in tutto il mondo, con confini e specie avvistate',
    disegna: ['**Poligoni** con bordo sottile e riempimento leggero. In Europa: verde = habitat (SIC/ZSC), verde-azzurro = uccelli (ZPS), ambra = area protetta nazionale. Nel resto del mondo: parchi nazionali, riserve, aree marine e rifugi della fauna. Il tipo si legge nel fumetto: non c\'è legenda.', 'A zoom 11+ compare una fila di **specie avvistate** nella zona, con la foto.', 'Le aree sono disegnate dalla più grande alla più piccola, così puoi toccare anche una riserva piccola dentro un parco grande.'],
    zoom: 'Da zoom 4; i confini diventano più dettagliati da zoom 12; le specie da zoom 11. Alla prima accensione compare un avviso di 12 secondi.',
    tocco: ['Fumetto «🌿 nome» **nella tua lingua** quando la fonte o Wikidata lo hanno (es. «Parco nazionale del Serengeti»), il tipo, la superficie in km², il codice dell\'area, il link «Scheda ufficiale ↗» per i siti Natura 2000 e **la fonte di quel confine** (cambia da Paese a Paese).', '**«Specie avvistate qui»**: le specie osservate davvero nella zona (GBIF: fondo mondiale dei dati sulla biodiversità), con foto. Scorrono tutte; un tocco apre la foto grande, con le frecce per passare alla successiva.', '**Le specie protette e a rischio vengono per prime**, con la riga «🛡️ N specie a rischio qui (Lista Rossa IUCN)» e, sotto ogni foto, il bollino: CR in pericolo critico · EN in pericolo · VU vulnerabile · NT quasi minacciata. Così vedi subito quali specie minacciate vivono in quel parco.'],
    fonte: 'Confini da fonti ufficiali con licenza aperta: Agenzia europea dell\'ambiente (Natura 2000 e aree nazionali, 118.791), Canada CPCAD (21.666), Stati Uniti PAD-US dell\'USGS (13.600), Australia CAPAD (12.058), Nuova Zelanda DOC (6.843), Brasile CNUC (3.121), Argentina IGN (506), Russia (459), Cile SNASPE (124), Taiwan (54), Corea (23), Singapore (7); dove non c\'è una fonte nazionale aperta, OpenStreetMap (58.920: Asia, Africa, America Latina, Medio Oriente). Nomi nelle lingue da Wikidata. Specie e foto da GBIF (solo dati CC0 e CC BY) e, quando la foto dell\'avvistamento non è libera, la foto della specie da Wikimedia Commons. Lista Rossa: IUCN tramite GBIF.',
    limiti: ['**Mostra confine, nome e specie, non regolamenti né divieti**: prima di entrare leggi le regole dell\'ente del parco.', '«Specie avvistate» vuol dire osservate e registrate da qualcuno in quella zona, non un censimento completo: le specie rare o notturne possono mancare.', 'Fuori dall\'Europa molte foto degli avvistamenti non hanno una licenza libera: in quel caso vedi la foto generica della specie, non quella scattata lì.', 'Al massimo 240 aree per vista; le aree piccole sono omesse da lontano.', 'Nelle zone coperte solo da OpenStreetMap (gran parte dell\'Asia e dell\'Africa) qualche area può mancare o avere il nome solo nella lingua locale.'],
    opzioni: 'Nessun filtro; lo stesso interruttore accende anche le specie.', combina: 'Le specie stanno sotto i pin dei luoghi. Con **Sentieri** vedi quali cammini attraversano il parco.', correlate: ['natura-percorsi', 'sentieri-e-ciclovie'] },
  { id: 'shopping', e: '🏬', nome: 'Shopping', gruppo: 'Dove andare', sub: 'vie e centri commerciali, grandi magazzini, outlet, souk',
    disegna: ['Pin tondi con l\'emoji del tipo: 🛍️ vie dello shopping · 🏬 grandi magazzini · 🏢 centri commerciali · 🏷️ outlet · 🕌 souk · ✈️ duty free. Senza raggruppamento né legenda.'],
    zoom: 'Da zoom 2 (allargato dal 26/09/2026); si rilegge a ogni spostamento, massimo 200 punti per vista.',
    tocco: ['Fumetto con nome, descrizione, link «sito ↗» e telefono, più testo e foto brevi caricati all\'apertura.'],
    fonte: 'Archivio WIP dei luoghi di servizio (da dati aperti).', limiti: ['**Niente orari, niente marchi dei negozi: solo la tipologia.**', 'Il tetto di 200 punti taglia le zone dense.'],
    opzioni: 'Nessuna.', combina: 'Non ha una chip: si accende solo da Livelli.', correlate: ['mappe-tematiche', 'tutte-le-categorie'] },
  { id: 'lusso', e: '👑', nome: 'Lusso', gruppo: 'Dove andare', sub: 'hotel 5 stelle, ristoranti stellati, marine, club esclusivi',
    disegna: ['Emoji per tipo: 🏨 hotel di lusso · ⭐ ristoranti stellati · ⛵ marine · 🥂 club esclusivi · 🚂 treni storici · 🎿 sci di lusso · 🛥️ noleggio di lusso.', 'In più i **ristoranti Michelin** come cerchi bianchi con ★, ★★ o ★★★ dorate (le tre stelle sopra).', 'Un «stellato» entro 80 m da un Michelin non viene disegnato due volte.'],
    zoom: 'Da zoom 2; massimo 200 punti più fino a 300 Michelin.',
    tocco: ['Pin lusso: nome, descrizione, sito, telefono.', 'Pin Michelin: nome, distinzione e anno, 🍀 se Stella Verde, indirizzo, sito, telefono, link «Scheda ↗» e il disclaimer che WIP **non è affiliata** a Michelin.'],
    fonte: 'Archivio WIP dei luoghi di servizio e archivio dei locali (distinzione Michelin con anno).', limiti: ['**Niente prezzi.**', 'I marcatori Michelin non hanno una scheda completa.'],
    opzioni: 'Nessuna.', combina: 'Condivide i dati con la chip «Stellati» dei Locali.', correlate: ['ristoranti-stellati', 'mappe-tematiche'] },
  { id: 'neve', e: '❄️', nome: 'Neve: piste, impianti e rifugi', gruppo: 'Com\'è adesso', sub: '9.569 piste disegnate + copertura satellitare NASA (giornaliera)',
    disegna: ['Pin per tipo: ⛷ comprensorio · 🚡 impianto · 🏔 rifugio · 🎿 pista.', '**Piste** come linee azzurre.', '**Copertura nevosa** (satellite NASA MODIS) come velo sulla mappa: dice solo «c\'è neve / non c\'è», a circa 500 m di risoluzione.'],
    zoom: 'Pin da zoom 2; piste da zoom 4. Il velo della neve si accende subito.',
    tocco: ['Fumetto con tipo («Comprensorio sciistico», «Impianto di risalita», «Rifugio alpino», «Pista da sci»), la **temperatura** («N°C · percepiti N°», oppure «condizioni non disponibili») e, in Tirolo, Alto Adige e Trentino, il **pericolo valanghe** (livello 0–5 con link alla fonte; fuori stagione dice «ultimo bollettino della stagione, non aggiornato»).'],
    fonte: 'Archivio WIP (da OpenStreetMap), NASA GIBS (la data del velo è di due giorni prima), temperatura MET Norway, valanghe avalanche.report (CC BY 4.0, solo Euregio).',
    limiti: ['**Niente centimetri di neve, apertura di impianti e piste, difficoltà delle piste.**', 'Il numero «9.569 piste» è scritto nel testo dell\'app.', 'Bollettino valanghe solo per l\'area Euregio.'],
    opzioni: 'Nessuna.', combina: 'Con Neve accesa i rifugi li disegna la Neve e non i Sentieri.', correlate: ['meteo-neve', 'natura-percorsi'] },
  { id: 'sole', e: '☀️', nome: 'Sole: UV e caldo percepito', gruppo: 'Com\'è adesso', sub: '(scheda con indice UV, ore critiche, alba e tramonto)',
    disegna: ['Nessun pin: compare una **scheda** nella colonna dei tasti a sinistra.', 'Mostra: il numero **UV** colorato (Basso, Moderato, Alto, Molto alto, Estremo), «percepiti N° · N° reali», «Sole forte HH–HH», un consiglio, le prossime 6 ore in una barretta, **alba e tramonto**, durata della luce e **«Ora d\'oro dalle HH:MM»**.'],
    zoom: 'Nessuna soglia: vale per il **centro della mappa**.',
    tocco: ['La scheda non è interattiva.'],
    fonte: 'MET Norway per UV e temperatura; caldo percepito calcolato dal server; alba, tramonto e ora d\'oro calcolati sul telefono (funzionano anche offline). Aggiornato ogni 30 minuti o dopo uno spostamento oltre 400 m.',
    limiti: ['**Un solo valore per il centro mappa**, non per ogni punto.', 'Nessuna mappa del calore e nessuna previsione oltre le ore di oggi.'],
    opzioni: 'Nessuna.', combina: 'Nessuna regola speciale.', correlate: ['meteo-neve', 'mare-spiagge'] },
  { id: 'clima', e: '📅', nome: 'Clima: il periodo migliore', gruppo: 'Com\'è adesso', sub: 'Pioggia e temperature medie 2001-2020 (NASA POWER) + analisi AI',
    disegna: ['Nessun pin: una **scheda** a sinistra con «📅 Periodo migliore», «Da evitare», una frase sul mese corrente e, se disponibile, «Questa settimana: ±N° rispetto alla media · ☔ mm di pioggia prevista».', '**12 barrette**, una per mese: più alta = punteggio migliore (verde 75+, lime 60+, giallo 45+, arancio 30+, rosso sotto). Il mese corrente ha il contorno blu; toccandone una vedi minime, massime, pioggia e giudizio (ottimo, buono, discreto, scarso).', 'Mesi più piovoso, più caldo e più freddo; analisi AI («✨ …») o «🔒 Accedi per l\'analisi AI di questa zona».'],
    zoom: 'Nessuna soglia: usa il centro della mappa (cella di 0,5°).',
    tocco: ['Tocca un mese per i valori; **«📋 Report completo»** apre la scheda del clima con le viste Anno e Mese, Panoramica, Consigli dal web, Esperienze dei viaggiatori, Mese per mese, Cosa portare, Orari migliori, Avvertenze, Statistiche, Fonti, **PDF**, **Ascolta** e il confronto con un\'altra città, più i mesi per il bagno (acqua da 22°).', 'Il report può impiegare fino a un minuto («Sto leggendo il web e le statistiche di vent\'anni…»): chi ha un account lo genera, poi resta disponibile per tutti.'],
    fonte: 'NASA POWER (medie 2001–2020); analisi in parole generata con i soli numeri della tabella; il report usa fonti web marcate «fonte affidabile», «blog o sito, non verificato», «forum o recensioni, opinioni personali».',
    limiti: ['**È la media di vent\'anni, uguale per tutta la città**; non è una previsione.', 'L\'analisi in parole non c\'è per gli ospiti.', 'Se NASA non risponde: «Statistiche non disponibili per questo punto».'],
    opzioni: 'Nel report: vista Anno o Mese.', combina: 'La scheda si ritira quando apri il pannello Livelli. Gli stessi dati compaiono negli itinerari («Di solito a {mese}…»).', correlate: ['meteo-neve', 'creare-itinerario-tutte-le-modalita'] },
  { id: 'mare', e: '🏖', nome: 'Qualità acqua del mare', gruppo: 'Com\'è adesso', sub: '(classificazione europea delle acque di balneazione)',
    disegna: ['**Pallini colorati** dentro un cerchio bianco: blu = Eccellente, verde = Buona, giallo = Sufficiente, rosso = Scarsa, grigio = Non classificata. La classe si legge nel fumetto (non c\'è legenda).'],
    zoom: 'Da zoom 2: legge i siti in un riquadro di circa 110 × 160 km attorno al **centro della mappa** (massimo 150 siti). Alla prima accensione un avviso dice «classificazione annuale ufficiale UE (EEA)… Copertura solo europea».',
    tocco: ['Fumetto «🏖 nome», «Qualità {anno}: {classe}», temperatura 🌡 e onde 🌊 se presenti e il richiamo «verifica i divieti temporanei in loco».'],
    fonte: 'Agenzia europea dell\'ambiente (classificazione annuale) conservata nell\'archivio WIP; temperatura del mare e onde dalla griglia NASA JPL MUR e NOAA WaveWatch III (aggiornata ogni ora; temperatura entro 25 km, onde entro 60 km). Nel Mediterraneo le onde possono mancare. Il testo dell\'app che cita Open-Meteo è superato.',
    limiti: ['**Solo Europa.**', '**È la classificazione dell\'anno, non il campionamento di oggi**: non dice divieti temporanei, alghe o meduse.', 'Niente maree, niente Bandiera Blu.'],
    opzioni: 'Nessuna.', combina: 'Nessuna regola speciale.', correlate: ['mare-spiagge', 'meteo-neve'] },
  { id: 'satellite', e: '🛰️', nome: 'Satellite', gruppo: 'Sfondo', sub: 'Foto dall\'alto al posto della mappa',
    disegna: ['Foto aeree **ESRI World Imagery** sopra la mappa di base e, sopra le foto, le sole **etichette** dei nomi. Gli altri livelli restano sopra.'],
    zoom: 'Nessuna soglia; oltre lo zoom 18 la foto viene ingrandita (campagne a zoom molto alto sembrano sgranate).',
    tocco: ['Niente: non è un livello di punti.'],
    fonte: 'ESRI (Maxar, Earthstar Geographics…), scelta dal server tra la chiave a quota e il servizio pubblico; il consumo di tile è contato per restare entro il tetto mensile.',
    limiti: ['**Nessuna data dello scatto.**', 'Non si può cambiare lo stile delle etichette.'],
    opzioni: 'Nessuna.', combina: 'Si somma agli altri livelli; il velo della neve sta in mezzo.', correlate: ['mappa-e-ricerca', 'mappe-tematiche'] },
];

/* ═══════════ OTTO VERTICALI TEMATICI: catalogo vero (numeri ed esempi da public/guida/verticali.json) ═══════════ */
import fsV from 'fs';
let VERT = null;
try { VERT = JSON.parse(fsV.readFileSync('public/guida/verticali.json', 'utf8')); } catch { /* senza file: nessun numero, nessun esempio */ }
const TIPI_IT = {
  hot_spring: 'Sorgente termale', thermal_town: 'Città termale', historic_bath: 'Bagno storico', spa_resort: 'Centro termale', thermal_park: 'Parco termale', onsen: 'Onsen', hammam: 'Hammam', sauna: 'Sauna', mud_spa: 'Fanghi termali', thermal_lake: 'Lago termale',
  film_location: 'Set cinematografico', series_location: 'Set di una serie', studio_tour: 'Studios visitabili', cinema_museum: 'Museo del cinema', festival_venue: 'Sede di un festival',
  dark_sky_park: 'Parco del cielo buio', dark_sky_reserve: 'Riserva del cielo buio', dark_sky_community: 'Comunità del cielo buio', stargazing_spot: 'Punto per osservare le stelle', observatory: 'Osservatorio astronomico', planetarium: 'Planetario', aurora_spot: 'Punto per l\'aurora', astro_village: 'Borgo astronomico',
  mural: 'Murale', street_art_district: 'Quartiere di street art', open_air_museum: 'Museo a cielo aperto', graffiti_hall_of_fame: 'Muro libero dei graffiti', sculpture_trail: 'Percorso di sculture', festival_site: 'Sede del festival', street_art_museum: 'Museo di street art',
  christmas_market: 'Mercatino di Natale', flea_market: 'Mercato delle pulci', antiques_market: 'Mercato dell\'antiquariato', food_market: 'Mercato alimentare', craft_market: 'Mercato dell\'artigianato', night_market: 'Mercato notturno', floating_market: 'Mercato galleggiante', historic_market_hall: 'Mercato coperto storico',
  cherry_blossom: 'Fioritura dei ciliegi', lavender: 'Fioritura della lavanda', tulips: 'Fioritura dei tulipani', wisteria: 'Fioritura del glicine', sunflowers: 'Campi di girasoli', foliage: 'Foliage d\'autunno', almond_blossom: 'Fioritura dei mandorli', rhododendron: 'Fioritura dei rododendri', wildflowers: 'Fiori spontanei', botanical_garden: 'Giardino botanico',
  monumental_cemetery: 'Cimitero monumentale', war_memorial: 'Memoriale di guerra', house_museum: 'Casa-museo', birthplace: 'Casa natale', grave_of_notable: 'Tomba di un personaggio', memorial_site: 'Luogo della memoria', mausoleum: 'Mausoleo',
  scenic_railway: 'Treno panoramico', heritage_railway: 'Ferrovia storica', cable_car: 'Funivia', funicular: 'Funicolare', scenic_ferry: 'Traghetto panoramico', cycle_route: 'Ciclovia', canal_boat: 'Battello sul canale', scenic_road: 'Strada panoramica',
};
const VERTICALI_DEF = [
  { k: 'terme', e: '🛁', nome: 'Terme e sorgenti', cos: 'Sorgenti calde, onsen, hammam, centri termali, bagni storici e città termali di tutto il mondo.',
    leggi: ['Nel catalogo: ♨️ **temperatura dell\'acqua**, 💧 «Sorgente naturale», 🏛 UNESCO, 🆓 «Accesso libero» o 🎟 «Con biglietto», 🚪 «Visitabile».', 'Il testo della scheda indica il **livello** (località termale, sorgente da vedere non balneabile, pozza libera, bagno pubblico, stabilimento, parco termale, spa resort, bagno storico, sito archeologico), la **classe dell\'acqua** (per esempio salsobromoiodica, bicarbonato, ferruginosa) con le indicazioni «tradizionali» e un **avviso medico**, i servizi, come arrivare e le avvertenze.'],
    filtri: 'Nella scheda «Itinerari tematici»: «🆓 Gratis» e «🎟 Con biglietto».', qualita: 'Ogni voce deve avere una prova di «termalità» (legge, temperatura, Wikidata, fonte). Le coordinate incerte ricevono un raggio più largo e sono contrassegnate come approssimative.', extraMancano: [] },
  { k: 'cinema', e: '🎬', nome: 'Location di film e serie', cos: 'I luoghi dove sono stati girati o ambientati film, serie e anime, gli studios visitabili e i musei del cinema.',
    leggi: ['Nella scheda piena compare **«🎬 Qui hanno girato»** (o «Ambientato qui») con locandina, regista, attori e **la scena** (da Wikipedia, CC BY-SA); «Mostra tutte» oltre 8 opere.', 'Nel catalogo fino a 4 opere per luogo: «🎞 titolo (anno) — scena».', 'Badge 🚪 «Visitabile» per i luoghi aperti al pubblico.'],
    filtri: 'Solo la ricerca per nome, città o paese.', qualita: 'Le opere sono collegate ai luoghi tramite Wikidata (licenza CC0); 475 location senza opere sono state verificate una a una e quelle senza riscontro sono state scartate. Non si usano IMDb né atlanti commerciali.', extraMancano: [] },
  { k: 'cieli', e: '🌌', nome: 'Cieli bui e stelle', cos: 'Parchi, riserve e comunità del cielo buio, punti per osservare le stelle, osservatori, planetari, punti per l\'aurora e borghi astronomici.',
    leggi: ['Badge possibili: «Cielo (scala Bortle) N» e 🌌 la designazione (per esempio International Dark Sky), 🆓 «Accesso libero» o 🎟 «Con biglietto».', 'In **Eventi › Stagionali**: **«🌌 Stanotte sotto le stelle»** con la nuvolosità prevista, la **fase lunare** e gli **sciami meteorici** in corso (10 sciami con picco; «attivo» entro 5 giorni dal picco).'],
    filtri: 'Nella scheda «Itinerari tematici»: «🆓 Gratis» e «🎟 Con biglietto».', qualita: 'Il calcolo della Luna è locale; la nuvolosità arriva da MET Norway (NLOD / CC BY 4.0).', extraMancano: ['Nel catalogo attuale **mancano la scala Bortle, la designazione e l\'accesso libero** per tutte le voci: l\'ordinamento «per Bortle» di fatto segue la notorietà e i filtri Gratis / Con biglietto non selezionano nulla di significativo.'] },
  { k: 'street_art', e: '🎨', nome: 'Street art', cos: 'Murales, quartieri di street art, musei a cielo aperto, muri liberi per i graffiti, percorsi di sculture e sedi di festival.',
    leggi: ['Il tipo («Murale», «Quartiere di street art»…), la città e la descrizione. Gli artisti e l\'anno sono campi previsti ma nel catalogo attuale sono vuoti.', 'La mappa mostra anche **migliaia di murales** importati da Wikidata e OpenStreetMap.'],
    filtri: 'Solo la ricerca per nome, città o paese.', qualita: 'Per le singole opere **non ci sono foto** per scelta (libertà di panorama non uniforme). Street Art Cities è escluso per la sua licenza.', extraMancano: [] },
  { k: 'mercati', e: '🛍️', nome: 'Mercati e mercatini', cos: 'Mercatini di Natale, mercati delle pulci e dell\'antiquariato, mercati alimentari e dell\'artigianato, mercati notturni, galleggianti e mercati coperti storici.',
    leggi: ['Il tipo, la città, la descrizione e il **periodo migliore** («best time») in un riquadro ambra.', 'In **Eventi › Stagionali**: **«🛍️ Mercatini aperti ora»**, pensato per i mercatini natalizi (15 novembre – 6 gennaio).'],
    filtri: 'Nella scheda «Itinerari tematici»: «📅 Solo in stagione» (acceso all\'inizio).', qualita: 'I mercati di OpenStreetMap (mercati, mercati coperti, farmers market, pulci) finiscono in questo verticale e non tra le Utilità.', extraMancano: ['Nel catalogo attuale **mancano i mesi di apertura**: «Solo in stagione» non esclude nulla e la sezione «Mercatini aperti ora» può risultare vuota.', 'Non c\'è un calendario di eventi reali dei mercatini.'] },
  { k: 'fioriture', e: '🌸', nome: 'Fioriture', cos: 'Ciliegi, lavanda, tulipani, glicine, girasoli, foliage d\'autunno, mandorli, rododendri, fiori spontanei e giardini botanici.',
    leggi: ['Il tipo, la città, la descrizione e il **periodo migliore** («25 marzo – 15 aprile, prima mattina»).', 'In **Eventi › Stagionali**: **«🌸 Fioriture in corso»** e **«⏳ In arrivo»**.'],
    filtri: 'Nella scheda «Itinerari tematici»: «📅 Solo in stagione».', qualita: 'La fioritura può spostarsi di 10–15 giorni: controlla sempre. Non si entra nei campi coltivati.', extraMancano: ['Nel catalogo attuale **mancano i mesi strutturati**: «In corso» e «In arrivo» possono risultare vuote; il periodo resta nel testo.', 'Non c\'è una fonte live sulla fioritura.'] },
  { k: 'memoria', e: '🕯️', nome: 'Memoria e case-museo', cos: 'Cimiteri monumentali, memoriali di guerra, case-museo, case natali, tombe di personaggi, luoghi della memoria e mausolei.',
    leggi: ['Il tipo, la città e la descrizione; per quasi tutte le voci il **personaggio** e il suo **ruolo** («🕯 persona — ruolo»).'],
    filtri: 'Solo la ricerca per nome, città o paese.', qualita: 'È il verticale più piccolo: le case-museo sono la maggioranza. Nella Libreria il tema ha un chip dedicato, distinto dal vecchio tema «memoria».', extraMancano: [] },
  { k: 'lento', e: '🚂', nome: 'Viaggio lento', cos: 'Treni panoramici e storici, funivie, funicolari, traghetti panoramici, ciclovie, battelli sui canali e strade panoramiche.',
    leggi: ['Il tipo, la città, la descrizione e, per tutte le voci, **l\'operatore**, la **lunghezza in km** e la **durata** («🚉 operatore · 📏 N km · ⏱ durata»).', 'Sulla mappa vedi il **punto di partenza**; i tracciati sono linee a parte.'],
    filtri: 'Solo la ricerca per nome, città o paese.', qualita: 'Le linee dei tracciati arrivano da OpenStreetMap; il brief per l\'itinerario ricorda durata, lato panoramico, prenotazione anticipata e un\'alternativa se il servizio è stagionale.', extraMancano: [] },
];
const nIt = n => n.toLocaleString('it-IT');
for (const v of VERTICALI_DEF) {
  const d = VERT?.verticali?.[v.k];
  const tot = d ? d.totale : null;
  const sez = [];
  sez.push({ h: 'Cos\'è', corpo: [['p', v.cos + (tot ? ` Il catalogo dell'app ne contiene **${nIt(tot)}**, in **${d.nPaesi} paesi**.` : '')]] });
  sez.push({ h: 'Come lo trovi', corpo: [['passi', [
    'Sulla mappa tocca **＋ Altro** e accendi **🧭 Tematici**.',
    `Nella riga dei temi tocca **${v.e} ${v.nome}**. «Tutti» li accende tutti; toccando un tema da «Tutti» resta solo quello.`,
    'Zooma sulla zona e tocca un pin: si apre il riquadro con foto (se c\'è), descrizione e i pulsanti **Guida**, **Naviga** e **Audio** (legge il testo a voce, su tua richiesta).',
    `In alternativa apri **Itinerario › 🧭 Viaggi tematici › ${v.nome}**: elenco con ricerca («Cerca fra N luoghi: nome, città, paese…»), filtri **📍 Vicino a me** (raggio 200 km) e **🌍 Nel mondo**, e per ogni luogo **«Vedi sulla mappa»** e **«✨ Crea l'itinerario»**.`,
    `Per un programma già scritto usa la **Libreria itinerari › Tematici › ${v.nome}**.`,
  ]]] });
  sez.push({ h: 'Cosa leggi nella scheda', corpo: [['lista', v.leggi], ['p', `**Filtri della scheda tematica:** ${v.filtri}`]] });
  if (d) {
    sez.push({ h: 'I tipi di luogo e quanti sono', corpo: [['tabella', [['Tipo', 'Luoghi nel catalogo'], ...d.tipi.map(t => [TIPI_IT[t.tipo] || t.tipo, nIt(t.n)])]]] });
    sez.push({ h: 'Dove sono: i paesi con più luoghi', corpo: [['tabella', [['Paese', 'Luoghi'], ...d.paesi.map(p => [p.paese || p.codice, nIt(p.n)])]], ['p', `Totale: ${d.nPaesi} paesi.`]] });
    sez.push({ h: 'Alcuni luoghi del catalogo', corpo: [['p', 'Una selezione dei più noti, con al massimo tre per paese. L\'elenco completo è nell\'app, in «Itinerari tematici».'], ['tabella', [['Luogo', 'Dove', 'Tipo', 'Perché'], ...d.esempi.map(x => [x.nome, [x.citta, x.paese].filter(Boolean).join(', '), TIPI_IT[x.tipo] || x.tipo, x.sintesi + (x.quando ? ` — Quando: ${x.quando}` : '')])]]] });
  }
  sez.push({ h: 'Audioguida e foto', corpo: [['p', '**Questo tema non ha audioguida automatica** (decisione di prodotto): ha una scheda con descrizione e il pulsante «Audio» che legge il testo a voce quando lo chiedi. Le foto vengono aggiunte dopo l\'importazione e non sono presenti per tutti i luoghi.']] });
  sez.push({ h: 'Come è fatto il catalogo', corpo: [['p', `${v.qualita} Il catalogo è curato dalla redazione e si aggiorna **a mano** (non c'è un aggiornamento automatico): una voce può non essere più aggiornata. Per questo ogni scheda va verificata prima di partire.`]] });
  PAGINE.push({
    slug: 'catalogo-' + v.k.replace('_', '-'), titolo: `${v.e} ${v.nome}: il catalogo di WIP${tot ? ` (${nIt(tot)} luoghi)` : ''}`, breve: v.nome, macro: 'viaggi', padre: 'mappe-tematiche',
    meta: `Il catalogo «${v.nome}» di WIP${tot ? `: ${nIt(tot)} luoghi in ${d.nPaesi} paesi` : ''}. Tipi, paesi, esempi reali, come trovarli sulla mappa e cosa leggi nella scheda.`,
    lead: `**${v.e} ${v.nome}** — ${v.cos}`,
    sezioni: sez,
    manca: ['Nessuna audioguida automatica per questo tema.', ...v.extraMancano, 'Sulla mappa vedi un campione di al massimo 400 luoghi per riquadro: zooma per vederne altri.'],
    correlate: ['mappe-tematiche', 'tutte-le-categorie', 'creare-itinerario-tutte-le-modalita'],
    faq: [[`Quanti luoghi ci sono in «${v.nome}»?`, tot ? `Il catalogo curato ne contiene ${nIt(tot)}. Sulla mappa possono comparirne di più o di meno, perché la mappa legge l'archivio dei luoghi.` : 'Il numero non è disponibile.'], ['Ha un\'audioguida?', 'No: ha una scheda e il pulsante «Audio» che legge il testo.']],
  });
}
PAGINE.find(p => p.slug === 'mappe-tematiche').correlate = ['mappa-e-ricerca', 'livelli-della-mappa', ...VERTICALI_DEF.map(v => 'catalogo-' + v.k.replace('_', '-'))];

/* ═══════════ EVENTI PASSO PER PASSO (screenshot reale iPhone del committente, 15/11/2026) ═══════════ */
PAGINE.push({
  slug: 'eventi-passo-passo', titolo: 'La scheda Eventi passo per passo: viaggio attivo, Serata perfetta, filtri', breve: 'Eventi passo per passo', macro: 'eventi', padre: 'eventi',
  meta: 'Tutorial della scheda Eventi di WIP: centro della ricerca (viaggio attivo, posizione, città), Serata perfetta in un tap, Stasera vicino a te, fonti, distanza, solo gratis, date, mostre e stagionali.',
  lead: 'La scheda **Eventi** (terza voce della barra in basso) raccoglie sagre, mostre, concerti, mercatini e tour intorno a te o alla destinazione del tuo viaggio. Ecco ogni elemento della schermata, dall\'alto in basso.',
  sezioni: [
    { h: 'La schermata, dall\'alto in basso', corpo: [['tabella', [['Elemento', 'Cosa fa'],
      ['Titolo «Eventi: {città}»', 'La città su cui stai cercando, con «Sagre, mostre, concerti e mercatini entro» il raggio scelto.'],
      ['🎪 Eventi · 🖼️ Mostre · 🌸 Stagionali', 'Le tre viste: eventi e biglietti; mostre in corso e collezioni permanenti; cieli stellati, mercatini e fioriture.'],
      ['📍 «Eventi a {città} in N giorni (viaggio attivo)»', 'Compare quando hai un itinerario in corso: cerca nella destinazione del viaggio, per i suoi giorni.'],
      ['🧭 «Posizione attuale»', 'Torna a cercare dove sei adesso.'],
      ['«Cerca città…»', 'Cerca gli eventi di qualsiasi altra città.'],
      ['🍸 «Serata perfetta in un tap»', 'Compone una serata (locali ed eventi reali della zona) — vedi sotto.'],
      ['🌙 «Stasera vicino a te»', 'Gli eventi di stasera più vicini, con ora, distanza e fonte; il tasto ↗ apre il sito del biglietto.'],
      ['«Carico SAGRE & MERCATI…»', 'Le fonti arrivano una per volta: ognuna mostra «Carico…» finché risponde (o «non disponibile»).'],
      ['Card con l\'etichetta della fonte (VIATOR, TOUR & ESPERIENZE…)', 'Ogni evento o esperienza dice da dove arriva. Tocca per i dettagli, «Naviga» o «Prenota».'],
      ['Barra in basso: Distanza 100 / 300 / 500 km · 🆓 Solo gratis · Dal … Al …', 'I filtri, sempre visibili mentre scorri.'],
    ]]] },
    { h: 'Tutorial: trovare cosa fare stasera', corpo: [['passi', [
      'Apri **Eventi** dalla barra in basso.',
      'Scegli **dove**: con un viaggio attivo tocca **«Eventi a {città}… (viaggio attivo)»**; altrimenti **«Posizione attuale»** o **«Cerca città…»**.',
      'Guarda **«🌙 Stasera vicino a te»**: gli eventi di stasera più vicini.',
      'Vuoi un programma intero? Tocca **«🍸 Serata perfetta in un tap»**.',
      'Per altri giorni imposta **DAL** e **AL** in basso (di base: oggi e un mese da oggi).',
      'Allarga la **Distanza** a 300 o 500 km se cerchi qualcosa di più lontano, oppure accendi **🆓 Solo gratis**.',
      'Tocca una card: **Naviga** per andarci, oppure il link del partner per il biglietto.',
    ]]] },
    { h: '🍸 Serata perfetta in un tap', corpo: [['passi', ['Tocca **«Serata perfetta in un tap»**. Serve l\'**accesso** e, la prima volta, il **consenso all\'uso dell\'AI** (la posizione va a un modello esterno).', 'Attendi «Preparo la tua serata…» (fino a 45 secondi).', 'Si apre la proposta: le **tappe** della serata con **budget stimato**, **«Apri in mappa»** e **«Biglietti»** dove ci sono.']], ['lista', ['È composta **solo con locali ed eventi reali della zona**. Se entro 40 km non trova un locale reale dice: «Non trovo nessun locale reale entro 40 km da questo punto: cerca una località qui sopra e riprova.» — non inventa nulla.', 'La proposta vale per la zona: se cambi città, si ricompone.', 'In fondo: «Proposta generata con AI su locali ed eventi reali della zona: verifica orari e disponibilità.»']]] },
    { h: 'Le fonti degli eventi', corpo: [['p', 'Portali locali e Virgilio (Italia), Ticketmaster, Viator, GetYourGuide, Tiqets, Klook, Trip.com, sagre e mercati della zona, mostre dai siti dei musei. I partner vengono mostrati per primi (ordine «per rilevanza»); puoi ordinare **per data**. Prenoti sul sito del partner: il prezzo per te non cambia, WIP riceve una commissione.']] },
    { h: 'Mostre e Stagionali', corpo: [['lista', ['**🖼️ Mostre** › **In corso**: mostre temporanee dai siti dei musei, Wikidata e Tiqets; **Permanenti**: le collezioni dei musei della zona, con «Apri sulla mappa».', '**🌸 Stagionali**: «🌌 Stanotte sotto le stelle» (nuvolosità, fase lunare, sciami meteorici), «🛍️ Mercatini aperti ora», «🌸 Fioriture in corso» e «⏳ In arrivo». Toccando una riga si apre la mappa sul luogo.', 'La **Distanza** vale anche qui: con 500 km vedi mostre, collezioni e stagionali fino a 500 km.']]] },
  ],
  manca: ['Le zone piccole hanno pochi eventi: allarga la distanza.', 'Gli eventi della sezione Stagionali dipendono dai dati di stagione del catalogo, che per mercatini e fioriture sono incompleti.', 'Ticketmaster non copre il Giappone.'],
  correlate: ['eventi', 'musei-cultura', 'catalogo-mercati', 'catalogo-cieli'],
  faq: [['«Serata perfetta» costa crediti?', 'Nell\'app non c\'è una conferma di crediti: serve l\'accesso e il consenso all\'AI.'], ['Perché vedo eventi di un\'altra città?', 'Hai un viaggio attivo: tocca «Posizione attuale» per tornare dove sei.']],
});

/* ═══════════ BORGHI E VILLAGGI (chip Località) ═══════════ */
PAGINE.push({
  slug: 'borghi-e-villaggi', titolo: 'Borghi e villaggi: le mete che valgono il viaggio', breve: 'Borghi e villaggi', macro: 'cultura', padre: 'tutte-le-categorie',
  meta: 'Come trovare borghi e villaggi con WIP (chip Località): foto, descrizione e, per i borghi gemma come Volterra, l\'audioguida che parte quando arrivi.',
  lead: 'Alcuni paesi sono una meta di per sé: Volterra, Riomaggiore, Colonnata. Con la chip **🏘️ Località** li trovi sulla mappa con foto e descrizione; i **borghi gemma** hanno anche l\'**audioguida** che parte quando arrivi.',
  sezioni: [
    { h: 'In breve', corpo: [['lista', ['**Dove**: ＋ Altro › **🏘️ Località**.', 'Sulla mappa ci sono circa **417.000 località** (paesi, villaggi, frazioni e isole con una voce Wikidata, e almeno una foto o una descrizione).', 'Solo i **borghi gemma** hanno l\'audioguida: sono quelli speciali — nelle liste ufficiali (I Borghi più belli d\'Italia, Les Plus Beaux Villages de France…), dentro un sito UNESCO, oppure molto cercati (almeno 1.500 visite al mese su Wikipedia, in italiano e inglese).', 'Le altre località (frazioni, marine, paesi di passaggio) hanno la scheda ma **restano mute**: niente avvisi e niente audioguida, per non interrompere il racconto dei luoghi veri.']]] },
    { h: 'Tutorial: scoprire un borgo', corpo: [['passi', ['Cerca la zona con la lente 🔍.', 'Tocca **＋ Altro** e accendi **🏘️ Località**.', 'Tocca un pin: si apre la scheda con **foto** e **descrizione** (da Wikipedia e Wikidata).', 'Se il borgo è una **gemma** (💎), nella scheda c\'è il lettore dell\'audioguida; e con il tasto **Guida** acceso l\'avviso e il racconto seguono le **tue distanze** (di base 150 m e 30 m a piedi, 300 m e 50 m in auto), misurate dal **punto centrale del paese**: per sentire il racconto devi arrivare in centro.', 'Tocca **Naviga** per arrivarci, oppure aggiungilo a un itinerario.']]] },
    { h: 'Perché un borgo parla e un altro no', corpo: [['p', 'La regola è la stessa delle gemme: **«tutto può essere gemma, ma deve essere speciale»**. Volterra sì; una frazione o una marina di passaggio no. Così la voce in cuffia non annuncia ogni paese che attraversi in auto.'], ['p', 'Le gemme sono sempre **complete**: descrizione breve e dettagliata, foto, teaser e audioguida in italiano e inglese, con le voci Nicky e Dante. I borghi gemma vengono completati poco per volta.']] },
  ],
  manca: ['Le località non gemma non hanno audioguida.', 'Le grandi città non sono «località»: hanno i loro monumenti, musei e chiese.'],
  correlate: ['tutte-le-categorie', 'audioguide', 'mappa-e-ricerca'],
  faq: [['Come capisco se un borgo ha l\'audioguida?', 'Se è una gemma 💎: nella scheda trovi il lettore.'], ['Perché passando da un paese non sento nulla?', 'Solo i borghi gemma parlano; gli altri hanno la scheda, ma restano muti.']],
});

const passiAccendi = id => ['Sulla mappa tocca il **cerchio con le strati** («Livelli della mappa») in basso a sinistra.', 'Cerca il gruppo (**«Dove andare»**, **«Com\'è adesso»** o **«Sfondo»**) e tocca la riga del livello: la riga si colora e compare una ✓ (uno spinner mentre carica).', 'Chiudi il pannello: accanto al tasto restano le **emoji dei livelli accesi** e un pallino col **numero**. Toccale per riaprire.', 'Per spegnerlo tocca di nuovo la riga, oppure **«Spegni tutti (n)»**.'];

PAGINE.push({
  slug: 'livelli-della-mappa', titolo: 'I 12 livelli della mappa WIP: cosa mostrano e come si usano', breve: 'Livelli della mappa', macro: 'viaggi', padre: 'mappa-e-ricerca',
  meta: 'Tutti i 12 livelli della mappa di WIP: sentieri, ciclovie, vino e gusto, fontanelle, aree protette e specie, shopping, lusso, neve, sole, clima, qualità del mare, satellite.',
  lead: 'Il pulsante **Livelli** (in basso a sinistra) accende strati di informazioni sopra la mappa. Sono **12**, in tre gruppi. Ognuno ha una guida con cosa disegna, da che zoom si vede, cosa leggi toccando, da dove arrivano i dati e i suoi limiti.',
  sezioni: [
    { h: 'Come funziona il pannello', corpo: [['passi', passiAccendi('')], ['lista', ['I livelli si **sommano** e la scelta è **ricordata** tra una sessione e l\'altra: un livello acceso riparte da solo alla riapertura.', '**«↗ avvicinati per vederli»**: il livello è acceso ma sei troppo lontano.', 'Se hai un fumetto aperto, il livello non si ricarica finché non lo chiudi.', 'I livelli **non hanno audioguida**: mostrano, non raccontano.']]] },
    { h: 'I dodici livelli', corpo: [['tabella', [['Gruppo', 'Livello', 'In una riga'], ...LIVELLI.map(l => [l.gruppo, `${l.e} ${l.nome}`, l.sub])]]] },
    { h: 'Quando ne servono più insieme', corpo: [['lista', ['**Gita in bicicletta**: 🚲 Ciclovie + 🚰 Fontanelle + ☀️ Sole.', '**Escursione**: 🥾 Sentieri + ☀️ Sole + 📅 Clima + 🌿 Aree protette.', '**Weekend sulla neve**: ❄️ Neve + ☀️ Sole.', '**Giornata di mare**: 🏖 Qualità acqua + ☀️ Sole.', '**Giro del gusto**: 🍷 Vino e gusto + 🚲 Ciclovie.', '**Per vedere dall\'alto**: 🛰️ Satellite sotto a tutti gli altri.']]] },
  ],
  manca: ['Nessun livello ha filtri interni.', 'Webcam, maree e Bandiera Blu non esistono; le ZTL non sono più disponibili.'],
  correlate: ['mappe-tematiche', 'mappa-e-ricerca', ...LIVELLI.slice(0, 3).map(l => 'livello-' + l.id)],
  faq: [['Perché il livello è acceso ma non vedo niente?', 'Probabilmente sei troppo lontano: zooma sulla zona («avvicinati per vederli»).'], ['I livelli restano accesi?', 'Sì: l\'app ricorda quali hai acceso.']],
});
for (const l of LIVELLI) {
  PAGINE.push({
    slug: 'livello-' + l.id, titolo: `${l.e} ${l.nome}: come funziona il livello della mappa`, breve: l.nome, macro: 'viaggi', padre: 'livelli-della-mappa',
    meta: `Il livello «${l.nome}» della mappa WIP: cosa disegna, da che zoom si vede, cosa si legge toccando, fonte dei dati e limiti. ${l.sub.replace(/^\(|\)$/g, '')}.`,
    lead: `**${l.e} ${l.nome}** (gruppo «${l.gruppo}») — ${l.sub.replace(/^\(|\)$/g, '')}.`,
    sezioni: [
      { h: 'Come si accende', corpo: [['passi', passiAccendi(l.id)]] },
      { h: 'Cosa disegna sulla mappa', corpo: [['lista', l.disegna]] },
      { h: 'Da che zoom si vede', corpo: [['p', l.zoom]] },
      { h: 'Cosa si legge toccando', corpo: [['lista', l.tocco]] },
      { h: 'Da dove arrivano i dati', corpo: [['p', l.fonte]] },
      { h: 'Opzioni e combinazioni', corpo: [['p', `**Opzioni:** ${l.opzioni}`], ['p', `**Con gli altri livelli:** ${l.combina}`]] },
    ],
    manca: l.limiti,
    correlate: ['livelli-della-mappa', ...l.correlate],
    faq: [[`Il livello «${l.nome}» ha un filtro?`, l.opzioni], ['Perché non lo vedo?', 'Controlla di aver acceso il livello e di essere abbastanza vicino: se compare «avvicinati per vederli», zooma sulla zona.']],
  });
}
