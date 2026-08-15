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
        "monumenti" to listOf("monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti"),
        // castelli/archeo: chiavi dedicate del web (useGeofencing.ts) che
        // seguono `monumenti` di default; restano incluse in monumenti sopra,
        // ma esposte a parte per rispettare un eventuale toggle separato.
        "castelli" to listOf("castle", "castelli"),
        "archeo" to listOf("ruins", "archaeological_site", "archeo"),
        "musei" to listOf("museum", "gallery", "musei"),
        "chiese" to listOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"),
        "panorami" to listOf("viewpoint", "park", "panorami"),
        "locali" to listOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
        // Sync con CategoryChips/MapArea web: esperienze_locali eliminata,
        // i mercati (marketplace) confluiscono in utilita
        "utilita" to listOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"),
        "famiglie" to listOf("playground", "theme_park", "aquarium", "zoo", "famiglie"),
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
