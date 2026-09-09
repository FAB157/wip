// Le categorie che entrano nelle pagine pubbliche, in ordine di priorità.
//
// Sta in un file suo perché la usano DUE script — costruisci-sitemap.mjs e
// costruisci-vicini.mjs — e devono vedere esattamente gli stessi luoghi: se
// divergessero, la sitemap elencherebbe pagine senza vicini, o i vicini
// punterebbero a pagine che non esistono.
//
// ── La colonna `category` ha due generazioni di valori (09/09/2026) ───────
//
// Accanto alle macro storiche («musei», «monumenti», «chiese», «panorami»)
// convivono i valori a grana fine scritti dagli harvest: `beach` da solo vale
// 170.133 righe, `peak` 121.708, `waterfall` 43.729, `viewpoint` 38.204,
// `castle` 33.933. La lista di prima ne conosceva dieci e lasciava fuori
// milioni di luoghi — non per scelta, per omissione.
// Qui c'è l'UNIONE di tutto: le macro, i poi_type di CategoryMap.kt (con le
// varianti italiane), i verticali tematici e le famiglie naturali. Le voci che
// nel database non esistono costano una domanda vuota a testa (risposta
// immediata), quindi è meglio abbondare che indovinare.
//
// ── Perché si cammina per categoria ──────────────────────────────────────
//
// Sull'intera tabella la resa è dell'1%: per 50.000 pagine servirebbe leggere
// 5 milioni di righe. Filtrando per categoria, che è indicizzata, «musei»
// risponde in 409 ms con l'8% di ammessi: venti volte meglio.
//
// ── L'ordine è priorità ──────────────────────────────────────────────────
//
// Prima il patrimonio con le schede più curate, che è anche quello che la
// gente cerca. Il lavoro dura giorni, e chi arriva prima viene indicizzato
// prima.
export const CATEGORIE = [
  // ── Patrimonio curato: le macro storiche ──
  'musei', 'monumenti', 'chiese', 'castelli', 'archeo', 'beni_culturali',
  'localita', 'panorami', 'natura', 'cinema',

  // ── Musei a grana fine ──
  'museum', 'gallery', 'art_museum', 'art_gallery', 'natural_history_museum',
  'house_museum', 'museum_ship',

  // ── Monumenti e patrimonio costruito a grana fine ──
  'monument', 'castle', 'ruins', 'archaeological_site', 'archaeological_park',
  'artwork', 'attraction', 'square', 'bridge', 'fountain', 'theatre',
  'opera_house', 'palace', 'tower', 'skyscraper', 'cemetery', 'library',
  'windmill', 'watermill', 'aqueduct', 'observatory', 'stadium', 'birthplace',
  'necropolis', 'catacomb', 'fortress', 'stronghold', 'city_walls', 'city_gate',
  'villa', 'domus', 'harbour', 'pier', 'shipyard', 'mine', 'quarry', 'saltworks',
  'chimney', 'funicular', 'rack_railway', 'amphitheatre', 'roman_baths',
  'roman_theatre', 'roman_circus', 'roman_villa', 'triumphal_arch', 'obelisk',
  'mausoleum', 'market_hall', 'train_station', 'dam', 'prison', 'memorial',
  'sculpture', 'university', 'town_hall', 'coastal_tower', 'racetrack',
  'racecourse', 'ski_jump', 'war_cemetery', 'concentration_camp', 'archive',
  'radio_telescope', 'hydro_plant',

  // ── Luoghi di culto a grana fine ──
  'church', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale', 'chapel',
  'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
  'shrine', 'santuario', 'baptistery', 'bell_tower', 'cloister', 'crypt',
  'synagogue', 'mosque', 'temple',

  // ── Natura e panorami: famiglie e grana fine, con le varianti italiane ──
  'viewpoint', 'lighthouse', 'scenic_road', 'aerialway', 'via_ferrata',
  'ski_resort', 'geopark', 'national_park',
  'spiagge', 'beach', 'spiaggia', 'bay', 'baia', 'island', 'isola',
  'cliff', 'falesia', 'coast', 'costa', 'dune',
  'vette', 'peak', 'vetta', 'volcano', 'vulcano', 'glacier', 'ghiacciaio',
  'mountain_pass', 'valico', 'ridge', 'arete', 'saddle',
  'acque', 'waterfall', 'cascata', 'cascate', 'spring', 'sorgente', 'hot_spring',
  'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'gola', 'canyon',
  'grotte', 'cave', 'grotta', 'cave_entrance', 'sinkhole', 'abisso',
  'parchi', 'park', 'parco', 'garden', 'giardino', 'botanical_garden',
  'nature_reserve', 'riserva', 'forest', 'foresta', 'wood', 'bosco',
  'desert', 'deserto', 'tree', 'albero',

  // ── Verticali tematici e layer a sé ──
  'enogastronomia', 'cantina', 'enoteca', 'vigneto', 'uliveto', 'birrificio',
  'distilleria', 'caseificio', 'formaggi', 'frantoio', 'gastronomia', 'fattoria',
  'pasticceria', 'cioccolato', 'caffe', 'te', 'miele', 'spezie', 'museo_gusto',
  'strada_del_vino', 'panificio', 'macelleria', 'pescheria', 'ortofrutta',
  'dolciumi',
  'shopping', 'shopping_street', 'department_store', 'shopping_mall',
  'historic_arcade', 'outlet_village', 'souk_bazaar', 'duty_free_zone',
  'lusso', 'palace_hotel', 'hotel_5_stelle', 'ristorante_stellato',
  'chiave_michelin', 'resort_esclusivo', 'marina_yacht', 'club_esclusivo',
  'treno_lusso_storico', 'isola_privata', 'stazione_sci_lusso', 'ryokan_lusso',
  'noleggio_yacht', 'jet_privato', 'casino_lusso',
  'street_art', 'terme', 'sentieri', 'trail', 'gemme', 'mercati', 'cieli',
  'fioriture', 'memoria', 'lento',

  // ── Coda: contenuto più magro, ma se ha una descrizione vera merita la pagina ──
  'famiglie', 'playground', 'theme_park', 'aquarium', 'zoo', 'water_park',
  'locali', 'restaurant', 'cafe', 'bar', 'pub', 'fast_food',
  'consigli', 'information', 'tourism_information', 'community', 'utilita',
];
