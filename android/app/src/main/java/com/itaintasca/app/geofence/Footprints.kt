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
     * Da GeoJSON Polygon/MultiPolygon (com'e' in poi_footprints e nel bundle
     * offline) a "lon,lat lon,lat;lon,lat ...". Unica conversione per radar
     * online (SupabaseClient) e pacchetti offline (PackageDownloadManager):
     * due copie divergerebbero. null per qualunque input che non sia un
     * poligono: chi chiama resta ai raggi.
     */
    fun geojsonCompatto(geojson: String?): String? {
        if (geojson.isNullOrBlank()) return null
        return try {
            val g = org.json.JSONObject(geojson)
            val tipo = g.optString("type", "")
            val coord = g.optJSONArray("coordinates") ?: return null
            // Polygon: [anello, buco, ...]. MultiPolygon: [[anello, ...], ...],
            // che si appiattisce — per il test dentro/fuori la parita' degli
            // attraversamenti gestisce tutti gli anelli insieme.
            val anelli = ArrayList<org.json.JSONArray>()
            when (tipo) {
                "Polygon" -> for (i in 0 until coord.length()) coord.optJSONArray(i)?.let { anelli.add(it) }
                "MultiPolygon" -> for (i in 0 until coord.length()) {
                    val poly = coord.optJSONArray(i) ?: continue
                    for (j in 0 until poly.length()) poly.optJSONArray(j)?.let { anelli.add(it) }
                }
                else -> return null
            }
            if (anelli.isEmpty()) return null
            val sb = StringBuilder()
            for ((n, anello) in anelli.withIndex()) {
                if (n > 0) sb.append(';')
                for (k in 0 until anello.length()) {
                    val p = anello.optJSONArray(k) ?: continue
                    if (k > 0) sb.append(' ')
                    sb.append(p.optDouble(0)).append(',').append(p.optDouble(1))
                }
            }
            sb.toString().ifBlank { null }
        } catch (e: Exception) { null }
    }

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

    /**
     * A quanti metri DAL BORDO del perimetro parte la guida (decisione del
     * 22/08/2026: "a 30 metri dal perimetro, non quando si e' dentro").
     * Stesso valore in foregroundTriggers.ts e PoiFootprints.swift.
     */
    const val TRIGGER_M = 30.0
    /** In auto 30 m sono un secondo a 50 km/h: la frase partirebbe a POI superato. */
    const val TRIGGER_CAR_M = 100.0
    fun triggerM(isDriving: Boolean): Double = if (isDriving) TRIGGER_CAR_M else TRIGGER_M

    /**
     * DISTANZA DAL BORDO del perimetro, in metri: 0.0 dentro,
     * Double.POSITIVE_INFINITY senza perimetro. E' la misura che governa la
     * guida quando il POI ha il poligono: chi cammina lungo la facciata e' al
     * POI, da qualunque lato, anche se l'ingresso sta dall'altra parte.
     * Minimo punto-segmento su tutti i lati, in un frame equirettangolare
     * locale; il riquadro allargato di `entro` metri scarta prima i lontani.
     * Port esatto di footprints.ts::distanzaDalPerimetro.
     */
    fun distanzaDalPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double, entro: Double = 100.0): Double {
        val p = perimetroDi(poiId, footprint) ?: return Double.POSITIVE_INFINITY
        val r = p.riquadro
        val mLat = 111_320.0
        val mLon = 111_320.0 * Math.cos(Math.toRadians(lat))
        val dLat = entro / mLat
        val dLon = entro / (if (mLon == 0.0) 1.0 else mLon)
        if (lat < r.minLat - dLat || lat > r.maxLat + dLat || lon < r.minLon - dLon || lon > r.maxLon + dLon) {
            return Double.POSITIVE_INFINITY
        }
        if (dentro(p.anelli, lat, lon)) return 0.0
        var best = Double.POSITIVE_INFINITY
        for (a in p.anelli) {
            val n = a.size / 2
            var j = n - 1
            for (i in 0 until n) {
                val ax = (a[j * 2] - lon) * mLon; val ay = (a[j * 2 + 1] - lat) * mLat
                val bx = (a[i * 2] - lon) * mLon; val by = (a[i * 2 + 1] - lat) * mLat
                val dx = bx - ax; val dy = by - ay
                val len2 = dx * dx + dy * dy
                val t = if (len2 == 0.0) 0.0 else (-(ax * dx + ay * dy) / len2).coerceIn(0.0, 1.0)
                val px = ax + t * dx; val py = ay + t * dy
                val d = Math.sqrt(px * px + py * py)
                if (d < best) best = d
                j = i
            }
        }
        return best
    }

    /**
     * Raggio, dal punto (lat, lon) di registrazione del geofence, che copre
     * TUTTO il perimetro piu' TRIGGER_M: distanza dal vertice piu' lontano
     * + 30 m. null senza perimetro. Serve a GeofenceManager perche' l'ENTER
     * del sistema arrivi da qualunque lato dell'edificio.
     */
    fun raggioCopertura(poiId: String, footprint: String?, lat: Double, lon: Double): Double? {
        val p = perimetroDi(poiId, footprint) ?: return null
        val mLat = 111_320.0
        val mLon = 111_320.0 * Math.cos(Math.toRadians(lat))
        var max = 0.0
        for (a in p.anelli) {
            var i = 0
            while (i + 1 < a.size) {
                val dx = (a[i] - lon) * mLon; val dy = (a[i + 1] - lat) * mLat
                val d = Math.sqrt(dx * dx + dy * dy)
                if (d > max) max = d
                i += 2
            }
        }
        // Sempre la soglia AUTO: il cerchio deve coprire il caso piu' largo,
        // e' il Receiver a decidere poi con la soglia della modalita'.
        return max + TRIGGER_CAR_M
    }

    /** true se il punto e' entro la soglia di modalita' dal bordo (o dentro). */
    fun alPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double, isDriving: Boolean = false): Boolean =
        distanzaDalPerimetro(poiId, footprint, lat, lon, entro = TRIGGER_CAR_M) <= triggerM(isDriving)

    /** Svuota la cache: serve quando il radar cambia zona. */
    fun svuota() = cache.clear()
}
