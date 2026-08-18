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
 */
object CategoryMap {
    val MAP: Map<String, List<String>> = mapOf(
        // Monumenti: include il patrimonio costruito importato in fase 2
        // (17/08/2026). Tenere allineato a guideSettings.isCategoryAllowed
        // (web) e PoiCategories.map (iOS).
        "monumenti" to listOf("monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti",
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
        "castelli" to listOf("castle", "castelli"),
        "archeo" to listOf("ruins", "archaeological_site", "archeo"),
        "musei" to listOf("museum", "gallery", "musei", "art_museum", "natural_history_museum", "art_gallery", "house_museum"),
        "chiese" to listOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese",
            "baptistery", "bell_tower", "cloister", "crypt", "synagogue", "mosque", "temple"),
        // Panorami e NATURA: le verticali naturali (spiagge, cascate, grotte,
        // vette, sorgenti termali, isole, riserve, fari, funivie) confluiscono
        // qui invece di avere una categoria propria — "panorami" è già cablata
        // ovunque ed è già abilitata all'audioguida. Tenere allineato a
        // guideSettings.isCategoryAllowed (web) e PoiCategories.map (iOS).
        "panorami" to listOf("viewpoint", "park", "panorami",
            "beach", "waterfall", "cave", "peak", "spring", "island", "cliff", "bay", "lake",
            "glacier", "volcano", "nature_reserve", "lighthouse", "aerialway", "natura",
            "trail", "scenic_road", "tree", "desert", "forest", "garden",
            "botanical_garden", "geopark", "via_ferrata", "ski_resort"),
        "locali" to listOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
        // Sync con CategoryChips/MapArea web: esperienze_locali eliminata,
        // i mercati (marketplace) confluiscono in utilita
        "utilita" to listOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"),
        "famiglie" to listOf("playground", "theme_park", "aquarium", "zoo", "famiglie", "water_park"),
        "consigli" to listOf("information", "tourism_information", "office", "consigli"),
        // Gemme: chiave del toggle web (useGeofencing.ts). Nel prodotto sono
        // "sempre attive", ma esposta per parità di mappa.
        "gemme" to listOf("gemme"),
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        "community" to listOf("community")
    )

    /**
     * Default "insieme vuoto" (nessuna categoria selezionata dal setup),
     * allineato al web (useGeofencing.ts): { monumenti, musei, chiese }
     * attivi, panorami OFF.
     */
    val DEFAULT_CULTURAL_CATEGORIES: List<String> = listOf(
        "monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti",
        "museum", "gallery", "musei", "church", "place_of_worship", "cathedral", "chiese"
    )
}
