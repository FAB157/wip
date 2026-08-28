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

    // (AUD-13) Le tappe dell'itinerario hanno la precedenza, ma NON possono
    // occupare tutta la finestra: un giro di 30 tappe lasciava 3 posti al
    // radar e i monumenti lungo la strada restavano senza recinto. Entrano
    // le tappe entro 5 km o, in ogni caso, le prime 10 in ordine di
    // percorso; al radar restano sempre almeno 10 posti.
    const val ITINERARY_NEAR_M = 5000f
    const val ITINERARY_FIRST_N = 10
    const val MIN_RADAR_SLOTS = 10

    // isItinerary (22/08/2026): le tappe dell'itinerario vanno nella finestra
    // anche se distano chilometri — altrimenti un radar denso le spingeva
    // fuori dai 33 e i loro geofence sparivano. Dal 28/08 con i limiti sopra.
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
    fun selectWindow(pois: List<WindowPoi>, maxPois: Int = MAX_POIS): List<String> {
        // L'ordine di ingresso delle tappe e' l'ordine di percorso
        // (mergeWithItinerary le mette davanti cosi' come arrivano dal JS).
        val stops = pois.filter { it.isItinerary }
        val radar = pois
            .filter { !it.isItinerary }
            .sortedWith(compareByDescending<WindowPoi> { it.isGem }.thenBy { it.distanceM })

        // Tappe ammesse: entro 5 km OPPURE fra le prime 10 del percorso, con
        // un tetto che lascia al radar almeno MIN_RADAR_SLOTS posti.
        val maxStops = (maxPois - MIN_RADAR_SLOTS).coerceAtLeast(0)
        val firstN = stops.take(ITINERARY_FIRST_N).map { it.id }.toSet()
        val eligible = stops.filter { it.distanceM <= ITINERARY_NEAR_M || it.id in firstN }
        // Fra le ammesse, prima le piu' vicine: se il tetto taglia, taglia le lontane.
        val chosenStops = eligible.sortedBy { it.distanceM }.take(maxStops)

        val radarSlots = maxPois - chosenStops.size
        val chosenRadar = radar.take(radarSlots.coerceAtLeast(0))

        // Posti avanzati (radar scarso): tornano alle tappe rimaste fuori.
        val leftover = maxPois - chosenStops.size - chosenRadar.size
        val chosenIds = chosenStops.map { it.id }.toMutableSet()
        val extraStops = if (leftover > 0)
            stops.filter { it.id !in chosenIds }.sortedBy { it.distanceM }.take(leftover)
        else emptyList()

        return (chosenStops + extraStops + chosenRadar).map { it.id }
    }

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
