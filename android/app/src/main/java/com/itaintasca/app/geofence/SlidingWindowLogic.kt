package com.itaintasca.app.geofence

/**
 * Logica pura della sliding window dei geofence: selezione dei POI da
 * registrare e diff incrementale rispetto ai già registrati. Nessuna
 * dipendenza Android → testabile su JVM (vedi app/src/test).
 */
object SlidingWindowLogic {

    /** 33 POI × 3 geofence (approach/arrival/exit) = 99 + 1 sentinella = 100 (cap Android). */
    const val MAX_POIS = 33
    const val SENTINEL_ID = "window_sentinel"
    const val SENTINEL_RADIUS_M = 2000f

    // isItinerary (22/08/2026): le tappe dell'itinerario vanno SEMPRE nella
    // finestra, anche se distano chilometri — altrimenti un radar denso le
    // spingeva fuori dai 33 e i loro geofence sparivano.
    data class WindowPoi(val id: String, val isGem: Boolean, val distanceM: Float, val isItinerary: Boolean = false)

    data class Diff(
        val toAddIds: List<String>,
        val toRemoveIds: List<String>
    ) {
        val isEmpty: Boolean get() = toAddIds.isEmpty() && toRemoveIds.isEmpty()
    }

    /**
     * Selezione della finestra: tappe itinerario prima, poi gemme, poi per
     * distanza reale. Stessa priorità del vecchio GeofenceManager, estratta
     * per il riuso (percorso online e offline) e per i test.
     */
    fun selectWindow(pois: List<WindowPoi>, maxPois: Int = MAX_POIS): List<String> =
        pois
            .sortedWith(
                compareByDescending<WindowPoi> { it.isItinerary }
                    .thenByDescending { it.isGem }
                    .thenBy { it.distanceM }
            )
            .take(maxPois)
            .map { it.id }

    /**
     * Diff incrementale: quali POI aggiungere e quali rimuovere rispetto al set
     * registrato. Evita la remove-all + add-all a ogni refresh (finestra cieca
     * e costo IPC inutile sui geofence in comune).
     */
    fun computeDiff(registeredIds: Set<String>, targetIds: Collection<String>): Diff {
        val target = targetIds.toSet()
        return Diff(
            toAddIds = targetIds.filter { it !in registeredIds },
            toRemoveIds = registeredIds.filterNot { it in target }
        )
    }

    /** RequestId dei 3 geofence di un POI. */
    fun requestIdsFor(poiId: String): List<String> =
        listOf("${poiId}_approach", "${poiId}_arrival", "${poiId}_exit")
}
