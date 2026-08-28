package com.itaintasca.app.geofence

/**
 * Mappa UNICA categorie UI (del setup GeoControl) -> valori categoria DB reali,
 * più il set "insieme vuoto" (nessuna categoria selezionata dall'utente).
 *
 * Prima era duplicata manualmente in 3 punti (categoryMap in SupabaseClient.kt,
 * CATEGORY_MAP in GeofenceBroadcastReceiver.kt, i culturalCats inline in
 * SupabaseClient.parsePoiList e in ItaintaBackgroundPoiService
 * .isOfflineCategoryActive): un cambio categoria richiedeva editare più file
 * a mano, esattamente il difetto che questo object elimina.
 *
 * Tenere allineata a isCategoryAllowed (src/hooks/useGeofencing.ts) e a
 * PoiCategories.map (iOS, PoiModels.swift).
 *
 * NON AGGIUNGERE `beni_culturali` a nessuna lista, per quanto possa sembrare
 * naturale metterlo sotto "monumenti".
 * Sono i beni dei registri nazionali del patrimonio promossi a POI (circa
 * 430.000, decisione del 19/08/2026): hanno scheda e foto, MAI audioguida.
 * Dentro ci sono chiese di campagna e mulini, ma anche case private vincolate
 * e magazzini storici — un turista che passa davanti a casa di qualcuno non
 * deve sentirsi partire un racconto, e su quei numeri l'audioguida
 * diventerebbe rumore continuo invece che un momento.
 * Chi merita l'audioguida ce l'ha lo stesso: se il bene combacia con un POI
 * che abbiamo gia' (una chiesa importata da Wikidata) quello conserva la SUA
 * categoria ed e' gia' in queste liste. Restano muti solo i beni che esistono
 * unicamente come `beni_culturali`.
 * Il cancello lato web e' in guideSettings.isCategoryAllowed, che li esclude
 * esplicitamente; qui l'esclusione e' per omissione, quindi va protetta.
 */
object CategoryMap {
    // (23/08/2026) I valori sono `Set` e non piu' `List`: il contenuto e'
    // IDENTICO, cambia solo il costo della domanda che si fa qui sotto.
    // `isActive` chiede `MAP[chiave]?.contains(cat)` per OGNI chiave
    // selezionata e per OGNI POI a ogni fix GPS: su una lista e' una
    // scansione lineare di ~100 stringhe (monumenti da solo ne ha 90), su un
    // set e' un hash. Con 120 POI e 3 categorie accese si passa da ~20.000
    // confronti di stringa per fix a poche centinaia.
    val MAP: Map<String, Set<String>> = mapOf(
        // Monumenti: include il patrimonio costruito importato in fase 2
        // (17/08/2026). Tenere allineato a guideSettings.isCategoryAllowed
        // (web) e PoiCategories.map (iOS).
        "monumenti" to setOf("monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti",
            "square", "bridge", "fountain", "theatre", "opera_house", "palace",
            "tower", "skyscraper", "cemetery", "library", "windmill", "aqueduct",
            "observatory", "stadium",
            // Fasi 3-5: nessun chip nuovo, tutto confluisce in "monumenti".
            "birthplace", "house_museum", "necropolis", "catacomb", "fortress",
            "city_walls", "villa", "harbour", "mine", "chimney", "funicular",
            "amphitheatre", "roman_baths", "triumphal_arch", "obelisk", "mausoleum",
            "market_hall", "train_station", "dam", "watermill", "prison", "museum_ship",
            "archaeological_park", "memorial", "sculpture", "university", "town_hall",
            "roman_theatre", "roman_circus", "roman_villa", "domus", "city_gate",
            "coastal_tower", "stronghold", "quarry", "saltworks", "racetrack",
            "racecourse", "ski_jump", "war_cemetery", "concentration_camp",
            "rack_railway", "pier", "shipyard", "archive", "radio_telescope", "hydro_plant"),
        // castelli/archeo: chiavi dedicate del web (useGeofencing.ts) che
        // seguono `monumenti` di default; restano incluse in monumenti sopra,
        // ma esposte a parte per rispettare un eventuale toggle separato.
        "castelli" to setOf("castle", "castelli"),
        "archeo" to setOf("ruins", "archaeological_site", "archeo"),
        "musei" to setOf("museum", "gallery", "musei", "art_museum", "natural_history_museum", "art_gallery", "house_museum"),
        "chiese" to setOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese",
            "baptistery", "bell_tower", "cloister", "crypt", "synagogue", "mosque", "temple"),
        // Panorami e NATURA: le verticali naturali (spiagge, cascate, grotte,
        // vette, sorgenti termali, isole, riserve, fari, funivie) confluiscono
        // qui invece di avere una categoria propria — "panorami" è già cablata
        // ovunque ed è già abilitata all'audioguida. Tenere allineato a
        // guideSettings.isCategoryAllowed (web) e PoiCategories.map (iOS).
        "panorami" to setOf("viewpoint", "park", "panorami",
            "beach", "waterfall", "cave", "peak", "spring", "island", "cliff", "bay", "lake",
            "glacier", "volcano", "nature_reserve", "lighthouse", "aerialway", "natura",
            "trail", "scenic_road", "tree", "desert", "forest", "garden",
            "botanical_garden", "geopark", "via_ferrata", "ski_resort"),
        // NATURA DIVISA PER FAMIGLIE (21/08/2026). Sul web «panorami» era un
        // mucchio solo: spiagge, vette, cascate, grotte e parchi insieme, o
        // tutti o nessuno. Ora ognuna ha il suo sotto-filtro, e queste
        // chiavi sono le stesse che il web scrive in
        // `wip_active_subcategories` — senza, accendendo solo «spiagge»
        // l'audioguida nativa non riconoscerebbe piu' niente.
        // La chiave «panorami» sopra RESTA: le installazioni vecchie hanno
        // ancora quella salvata, e va continuata a capire.
        // Allineato a poiTaxonomy.ts (web) e PoiCategories.map (iOS).
        // "natura" (22/08/2026): la macro che raccoglie le cinque famiglie —
        // e' la chiave che le chip mappa e il setup scrivono quando si
        // accende Natura senza toccare le singole famiglie.
        "natura" to setOf("beach", "spiaggia", "spiagge", "bay", "baia", "island", "isola",
            "cliff", "falesia", "coast", "costa", "dune",
            "peak", "vetta", "vette", "volcano", "vulcano", "glacier", "ghiacciaio",
            "mountain_pass", "valico", "ridge", "arete", "saddle",
            "waterfall", "cascata", "cascate", "spring", "sorgente", "hot_spring",
            "lake", "lago", "laghi", "river", "fiume", "gorge", "gola", "canyon",
            "cave", "grotta", "grotte", "cave_entrance", "sinkhole", "abisso",
            "park", "parchi", "parco", "garden", "giardino", "botanical_garden",
            "nature_reserve", "riserva", "geopark", "forest", "foresta", "wood", "bosco",
            "desert", "deserto", "tree", "albero", "national_park"),
        "spiagge" to setOf("beach", "spiaggia", "spiagge", "bay", "baia", "island", "isola",
            "cliff", "falesia", "coast", "costa", "dune"),
        "vette" to setOf("peak", "vetta", "vette", "volcano", "vulcano", "glacier", "ghiacciaio",
            "mountain_pass", "valico", "ridge", "arete", "saddle"),
        "acque" to setOf("waterfall", "cascata", "cascate", "spring", "sorgente", "hot_spring",
            "lake", "lago", "laghi", "river", "fiume", "gorge", "gola", "canyon"),
        "grotte" to setOf("cave", "grotta", "grotte", "cave_entrance", "sinkhole", "abisso"),
        "parchi" to setOf("park", "parchi", "parco", "garden", "giardino", "botanical_garden",
            "nature_reserve", "riserva", "geopark", "forest", "foresta", "wood", "bosco",
            "desert", "deserto", "tree", "albero", "national_park"),
        "locali" to setOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
        // Sync con CategoryChips/MapArea web: esperienze_locali eliminata,
        // i mercati (marketplace) confluiscono in utilita
        // ev_charging (27/08/2026): colonnine EV da OpenChargeMap, nessuna audioguida
        // (e' un'utilita', non un contenuto culturale) ma visibile e filtrabile.
        "utilita" to setOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth", "ev_charging"),
        "famiglie" to setOf("playground", "theme_park", "aquarium", "zoo", "famiglie", "water_park"),
        // Vino e Gusto (20/08/2026): cantine, vigneti, caseifici, frantoi,
        // birrifici, botteghe del gusto e strade del vino, 199.280 nel mondo
        // importati da OpenStreetMap. Chip OFF di default come community e
        // beni_culturali: acceso, l'audioguida racconta la cantina davanti a
        // cui si passa. La categoria DB e' 'enogastronomia', i valori qui
        // sotto sono i poi_type scritti dall'harvest.
        "enogastronomia" to setOf("enogastronomia",
            "cantina", "enoteca", "vigneto", "uliveto", "birrificio", "distilleria",
            "caseificio", "formaggi", "frantoio", "gastronomia", "fattoria",
            "pasticceria", "cioccolato", "caffe", "te", "miele", "spezie",
            "museo_gusto", "strada_del_vino",
            "panificio", "macelleria", "pescheria", "ortofrutta", "dolciumi"),
        // Turismo dello Shopping (28/08/2026): vie/quartieri dello shopping,
        // grandi magazzini storici, mall, gallerie/passage storici, outlet
        // village, duty-free, bazaar/souk nella loro dimensione di shopping
        // turistico (non alimentare, quello resta in "mercati"). Stesso
        // trattamento di enogastronomia: layer a sé, chip OFF di default,
        // audioguida solo se il layer è acceso. Allineato a PoiModels.swift.
        "shopping" to setOf("shopping",
            "shopping_street", "department_store", "shopping_mall", "historic_arcade",
            "outlet_village", "souk_bazaar", "duty_free_zone"),
        // Turismo di Lusso (28/08/2026): hotel/resort di fascia altissima,
        // ristoranti stellati, marine per superyacht, treni storici di lusso,
        // sci di lusso — universo piccolo, popolato per lo piu' dal catalogo
        // curato (src/lib/luxuryCatalog.ts), non da harvest di massa. Stesso
        // trattamento di enogastronomia. Allineato a PoiModels.swift.
        "lusso" to setOf("lusso",
            "palace_hotel", "hotel_5_stelle", "ristorante_stellato", "chiave_michelin",
            "resort_esclusivo", "marina_yacht", "club_esclusivo", "treno_lusso_storico",
            "isola_privata", "stazione_sci_lusso", "ryokan_lusso",
            "noleggio_yacht", "jet_privato", "casino_lusso"),
        "consigli" to setOf("information", "tourism_information", "office", "consigli"),
        // Gemme: chiave del toggle web (useGeofencing.ts). Nel prodotto sono
        // "sempre attive", ma esposta per parità di mappa.
        "gemme" to setOf("gemme"),
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        // È l'ULTIMA categoria con audioguida: vedi la nota qui sotto.
        "community" to setOf("community")
        //
        // ── VERTICALI TEMATICI: NON VANNO IN QUESTA MAPPA ──────────────────
        // terme, cinema, cieli, street_art, mercati, fioriture, memoria, lento.
        // Aggiunti il 21/08/2026 e RIMOSSI il 22/08 per decisione del
        // committente: "le categorie delle audioguide devono fermarsi ai
        // consigli gratuiti, da WIP Community in giù non hanno audioguide".
        // I POI tematici restano visibili sulla mappa, nelle chip, negli
        // itinerari e negli eventi: semplicemente non fanno partire la voce.
        // Come per beni_culturali, l'esclusione è per OMISSIONE e va protetta:
        // NON riaggiungerli qui. Ha senso anche tecnicamente — un murale, una
        // pozza o la fermata di un treno panoramico non sono contenuti da
        // audioguida che parte da sola mentre cammini.
    )

    /**
     * Default "insieme vuoto" (nessuna categoria selezionata dal setup),
     * allineato al web (useGeofencing.ts): { monumenti, musei, chiese }
     * attivi, panorami OFF.
     *
     * (22/08/2026) Derivato dalla MAP invece di una lista scritta a mano:
     * quella aveva 13 valori mentre monumenti+musei+chiese ne contano ~100,
     * quindi con l'insieme vuoto una basilica, un palazzo o un anfiteatro
     * restavano muti anche se le stesse chip li avrebbero accesi.
     */
    val DEFAULT_CULTURAL_CATEGORIES: Set<String> =
        (MAP["monumenti"].orEmpty() + MAP["musei"].orEmpty() + MAP["chiese"].orEmpty()).toSet()

    /**
     * (22/08/2026) FILTRO UNICO categoria → attivo/non attivo, usato da TUTTI
     * e tre i punti che prima lo reimplementavano a mano (fetch online in
     * SupabaseClient.parsePoiList, filtro offline nel servizio, filtro
     * trigger nel receiver). Tre copie = tre modi di divergere: un POI poteva
     * essere scaricato dal fetch e poi rifiutato dal trigger, o viceversa.
     *
     * Regole (invariate rispetto alle copie precedenti):
     * - le tappe dell'itinerario passano sempre;
     * - le gemme passano salvo OFF esplicito (sentinella "gemme:off", vedi
     *   GeofenceBroadcastReceiver.areGemsActive);
     * - insieme vuoto = default culturale (monumenti, musei, chiese);
     * - altrimenti la categoria DB deve stare nella MAP di una chiave UI
     *   selezionata, oppure coincidere direttamente con una chiave selezionata.
     */
    fun isActive(
        dbCategory: String?,
        isGem: Boolean,
        isFromItinerary: Boolean,
        selected: Collection<String>
    ): Boolean {
        if (isFromItinerary) return true
        if (isGem) return !selected.contains("gemme:off")
        val cat = (dbCategory ?: "").lowercase()
        if (selected.isEmpty()) return DEFAULT_CULTURAL_CATEGORIES.contains(cat)
        if (selected.contains(cat)) return true
        return selected.any { MAP[it]?.contains(cat) == true }
    }
}
