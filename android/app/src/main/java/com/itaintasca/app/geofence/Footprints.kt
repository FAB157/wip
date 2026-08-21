package com.itaintasca.app.geofence

/**
 * PERIMETRI DEGLI EDIFICI — "sono DENTRO?" invece di "quanto dista?"
 *
 * PERCHE'. Il geofence e' sempre stato un cerchio attorno al centroide. Per un
 * edificio compatto va bene; per un palazzo a L, un chiostro, una cinta
 * muraria o un parco il cerchio sbaglia in entrambi i versi: o e' piccolo e
 * non scatta quando sei dentro l'ala lunga, o e' grande e scatta dall'altra
 * parte della strada.
 *
 * Dal 21/08/2026 il database ha i perimetri veri: 402.889 POI, dai poligoni
 * degli edifici di OpenStreetMap (area mediana 915 m², 15 vertici).
 *
 * FORMATO. Non GeoJSON ma una stringa compatta "lon,lat lon,lat ...", con gli
 * anelli separati da ';'. Su un telefono si tengono in cache migliaia di POI e
 * le parentesi del GeoJSON sarebbero il 40% del peso senza dire niente di piu'.
 *
 * PORT ESATTO di src/lib/geofencing/footprints.ts e di PoiFootprints.swift:
 * stesso ray casting, stesso riquadro di scarto rapido, stessa gestione dei
 * cortili interni. Le tre implementazioni devono dare la STESSA risposta sullo
 * stesso punto — se una diverge, l'audioguida parte in tre momenti diversi a
 * seconda del dispositivo.
 */
object Footprints {

    /** Riquadro che contiene il poligono: quattro confronti prima del test vero. */
    private data class Riquadro(
        val minLat: Double, val maxLat: Double,
        val minLon: Double, val maxLon: Double
    )

    private data class Perimetro(val anelli: List<DoubleArray>, val riquadro: Riquadro)

    /**
     * I perimetri gia' analizzati, per id POI. Il parsing di una stringa e' la
     * parte cara: farlo a ogni fix GPS per ogni POI vicino sprecherebbe
     * batteria, che su un servizio in foreground e' la risorsa che conta.
     */
    private val cache = HashMap<String, Perimetro?>()
    private const val MAX_CACHE = 400

    /**
     * Da "lon,lat lon,lat;lon,lat ..." agli anelli.
     * Ogni anello e' un DoubleArray piatto [lon0, lat0, lon1, lat1, ...]:
     * niente oggetti per punto, che su 15 vertici x 400 POI sarebbero
     * seimila allocazioni da far raccogliere al garbage collector.
     */
    private fun analizza(testo: String): Perimetro? {
        try {
            val anelli = ArrayList<DoubleArray>()
            var minLat = 90.0; var maxLat = -90.0
            var minLon = 180.0; var maxLon = -180.0
            for (pezzo in testo.split(';')) {
                val coppie = pezzo.trim().split(' ').filter { it.isNotBlank() }
                if (coppie.size < 4) continue
                val punti = DoubleArray(coppie.size * 2)
                var i = 0
                for (c in coppie) {
                    val v = c.split(',')
                    if (v.size != 2) return null
                    val lon = v[0].toDoubleOrNull() ?: return null
                    val lat = v[1].toDoubleOrNull() ?: return null
                    punti[i++] = lon; punti[i++] = lat
                    if (lat < minLat) minLat = lat
                    if (lat > maxLat) maxLat = lat
                    if (lon < minLon) minLon = lon
                    if (lon > maxLon) maxLon = lon
                }
                anelli.add(punti)
            }
            if (anelli.isEmpty()) return null
            return Perimetro(anelli, Riquadro(minLat, maxLat, minLon, maxLon))
        } catch (e: Exception) {
            return null
        }
    }

    private fun perimetroDi(poiId: String, testo: String?): Perimetro? {
        if (cache.containsKey(poiId)) return cache[poiId]
        val p = if (testo.isNullOrBlank()) null else analizza(testo)
        if (cache.size >= MAX_CACHE) cache.clear() // cache di comodo: si azzera e si ricostruisce
        cache[poiId] = p
        return p
    }

    /**
     * Ray casting: si tira una semiretta orizzontale dal punto e si contano
     * gli attraversamenti dei lati. Dispari = dentro.
     *
     * I cortili interni non hanno bisogno di codice apposta: chi sta nel
     * chiostro attraversa due volte (anello esterno + anello interno) e
     * risulta fuori, che e' la risposta giusta — nel cortile di un palazzo non
     * sei dentro il palazzo.
     */
    private fun dentro(anelli: List<DoubleArray>, lat: Double, lon: Double): Boolean {
        var attraversamenti = 0
        for (p in anelli) {
            val n = p.size / 2
            var j = n - 1
            for (i in 0 until n) {
                val xi = p[i * 2]; val yi = p[i * 2 + 1]
                val xj = p[j * 2]; val yj = p[j * 2 + 1]
                // Il lato deve stare a cavallo della latitudine del punto.
                if ((yi > lat) != (yj > lat)) {
                    val taglio = xi + ((lat - yi) / (yj - yi)) * (xj - xi)
                    if (lon < taglio) attraversamenti++
                }
                j = i
            }
        }
        return attraversamenti % 2 == 1
    }

    /**
     * true se il punto sta dentro il perimetro del POI.
     * false quando il perimetro manca o e' illeggibile: chi chiama continua a
     * ragionare a raggi, esattamente come prima.
     */
    fun dentroPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double): Boolean {
        val p = perimetroDi(poiId, footprint) ?: return false
        val r = p.riquadro
        if (lat < r.minLat || lat > r.maxLat || lon < r.minLon || lon > r.maxLon) return false
        return dentro(p.anelli, lat, lon)
    }

    /** Svuota la cache: serve quando il radar cambia zona. */
    fun svuota() = cache.clear()
}
