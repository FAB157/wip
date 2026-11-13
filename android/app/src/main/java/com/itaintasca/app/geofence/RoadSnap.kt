package com.itaintasca.app.geofence

import android.os.SystemClock
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * SNAP-TO-PATH nativo — port fedele di src/lib/roadSnap.ts.
 *
 * Scarica la geometria strade/marciapiedi di un'area da /api/roads/tile, la
 * indicizza a griglia in RAM e "snappa" la posizione GPS sul segmento
 * percorribile piu' vicino in modo CONSERVATIVO: solo se una strada e' entro
 * la soglia, altrimenti ritorna null e il chiamante usa il GPS grezzo. Al
 * momento dello snap non serve rete (l'indice e' gia' in memoria).
 *
 * NB: NON testato sul campo. Conservativo per costruzione (worst case =
 * comportamento attuale). Il fetch va fatto fuori dal main thread.
 */
object RoadSnap {
    private const val TAG = "RoadSnap"
    private const val CELL = 0.003 // ~300 m
    // (SEC-09) Dominio unico in WipApi.BASE.
    private const val ROADS_URL = com.itaintasca.app.service.WipApi.BASE + "/api/roads/tile"

    private data class Seg(val aLat: Double, val aLon: Double, val bLat: Double, val bLon: Double)

    @Volatile private var carGrid: Map<String, List<Seg>> = emptyMap()
    @Volatile private var footGrid: Map<String, List<Seg>> = emptyMap()
    @Volatile private var haveTile = false
    @Volatile private var lastLat = 0.0
    @Volatile private var lastLon = 0.0

    // Guardia di concorrenza: una sola richiesta in volo. AtomicBoolean e non
    // un @Volatile Boolean perche' il "leggi-e-poi-scrivi" fra due thread IO
    // lascerebbe passare due download simultanei.
    private val fetching = AtomicBoolean(false)

    // Esito dell'ULTIMO tentativo, riuscito o fallito (prima si registrava solo
    // il successo: con la rete giu' si riprovava a ogni fix GPS).
    @Volatile private var lastAttemptAt = 0L      // SystemClock.elapsedRealtime()
    @Volatile private var failStreak = 0          // fallimenti consecutivi
    // Modo di trasporto dell'ultimo snap(): il chiamante non lo passa a
    // shouldRefresh(), quindi lo memorizziamo qui. Default "auto" = soglia piu'
    // stretta, il caso conservativo.
    @Volatile private var lastCar = true

    // Attesa crescente dopo un fallimento (5 s, 15 s, 60 s, 5 min, tetto 15 min).
    private val BACKOFF_MS = longArrayOf(5_000L, 15_000L, 60_000L, 300_000L, 900_000L)
    // Intervallo minimo fra due download riusciti: guardia contro fix GPS che
    // saltano avanti e indietro (a 25 m/s la soglia auto si copre in ~18 s).
    private const val MIN_INTERVAL_MS = 20_000L

    // Soglie di rinfresco per modo di trasporto. Il tile ha raggio 700 m
    // centrato sul punto in cui e' stato scaricato: dopo uno spostamento di d
    // il bordo davanti a noi e' a 700 - d metri, ed e' quel margine che deve
    // bastare a completare il download successivo.
    //  - A piedi (1,4 m/s): soglia 550 m -> margine 150 m = ~107 s di cammino,
    //    e un download ogni 550/1,4 = ~393 s, cioe' ~9 all'ora (prima, con 400 m,
    //    erano ~13/ora). Il raggio 700 m copre comodamente i tempi pedonali.
    //  - In auto (14 m/s in citta'/extraurbano): soglia 450 m -> margine 250 m
    //    = ~18 s a 14 m/s e ~10 s a 25 m/s in autostrada, quindi il download
    //    parte prima di uscire dalla tile; un download ogni 450/14 = ~32 s,
    //    cioe' ~112 all'ora contro i ~126 dei 400 m fissi. Se il margine non
    //    basta lo snap semplicemente non si applica (fail-open, GPS grezzo).
    private const val THRESHOLD_FOOT_M = 550.0
    private const val THRESHOLD_CAR_M = 450.0

    // Persistenza: il tile dell'area visitata online resta disponibile offline
    // dopo un riavvio. Un tile di un'altra area è innocuo (celle non combaciano
    // → nessuno snap, GPS grezzo). Impostare cacheDir a filesDir all'avvio.
    @Volatile var cacheDir: java.io.File? = null
    private const val CACHE_FILE = "road_tile.json"

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private fun cellKey(lat: Double, lon: Double) = "${Math.round(lat / CELL)},${Math.round(lon / CELL)}"

    private fun metersBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(min(1.0, sqrt(a)))
    }

    private class Proj(val lat: Double, val lon: Double, val distM: Double)

    private fun projectToSeg(lat: Double, lon: Double, s: Seg): Proj {
        val cosLat = cos(Math.toRadians(lat)).let { if (it == 0.0) 1.0 else it }
        val px = lon * cosLat; val py = lat
        val ax = s.aLon * cosLat; val ay = s.aLat
        val bx = s.bLon * cosLat; val by = s.bLat
        val dx = bx - ax; val dy = by - ay
        val len2 = dx * dx + dy * dy
        var t = if (len2 == 0.0) 0.0 else ((px - ax) * dx + (py - ay) * dy) / len2
        t = max(0.0, min(1.0, t))
        val snapLat = ay + t * dy
        val snapLon = (ax + t * dx) / cosLat
        return Proj(snapLat, snapLon, metersBetween(lat, lon, snapLat, snapLon))
    }

    /** Snap conservativo. Ritorna (lat,lon) snappati oppure null (usa GPS grezzo). */
    fun snap(lat: Double, lon: Double, accM: Float, isCar: Boolean): Pair<Double, Double>? {
        lastCar = isCar // memorizzato per la soglia di shouldRefresh()
        val grid = if (isCar) carGrid else footGrid
        if (grid.isEmpty()) return null
        val maxSnap = min(40.0, max(20.0, if (accM <= 0f) 20.0 else accM.toDouble()))
        val cLat = Math.round(lat / CELL)
        val cLon = Math.round(lon / CELL)
        var best: Proj? = null
        for (dLa in -1..1) for (dLo in -1..1) {
            val arr = grid["${cLat + dLa},${cLon + dLo}"] ?: continue
            for (s in arr) {
                val p = projectToSeg(lat, lon, s)
                if (best == null || p.distM < best!!.distM) best = p
            }
        }
        val b = best ?: return null
        if (b.distM > maxSnap) return null
        if (metersBetween(lat, lon, b.lat, b.lon) < 3.0) return null
        return Pair(b.lat, b.lon)
    }

    /**
     * Serve un nuovo tile? thresholdM <= 0 (il default, quello che usa il
     * servizio) sceglie la soglia dal modo di trasporto dell'ultimo snap().
     * Durante l'attesa dopo un fallimento ritorna false senza scrivere log: lo
     * snap semplicemente non si applica e si usa il fix grezzo (fail-open).
     */
    fun shouldRefresh(lat: Double, lon: Double, thresholdM: Double = 0.0): Boolean {
        if (fetching.get()) return false // richiesta gia' in volo
        val now = SystemClock.elapsedRealtime()
        if (lastAttemptAt != 0L) {
            val wait = if (failStreak > 0)
                BACKOFF_MS[min(failStreak - 1, BACKOFF_MS.size - 1)]
            else MIN_INTERVAL_MS
            if (now - lastAttemptAt < wait) return false
        }
        if (!haveTile) return true
        val th = if (thresholdM > 0.0) thresholdM
        else if (lastCar) THRESHOLD_CAR_M else THRESHOLD_FOOT_M
        return metersBetween(lat, lon, lastLat, lastLon) > th
    }

    // ── STRADE SCARICATE IN ANTICIPO (03/10/2026, committente: «le tiles devono
    // essere scaricate quando si crea un percorso, con o senza audioguida, e
    // nelle funzioni offline») ───────────────────────────────────────────
    // Fino a oggi esisteva UN solo tile su disco, l'ultimo: senza rete, dopo
    // 500 m le distanze di strada e l'aggancio alla via non avevano piu' dati.
    // Ora ogni tile va in una cartella, un file per chiave (la stessa griglia
    // a 0,01° con cui il server tiene la cache), e `prescarica` la riempie
    // lungo un percorso. `refresh` senza rete ripiega sul file della zona.
    private const val TILE_DIR = "road_tiles"
    private const val TILE_MAX = 400               // file tenuti su disco
    private const val TILE_FRESCO_MS = 30L * 24 * 3600 * 1000
    private const val PRESCARICO_MAX = 150         // chiavi per chiamata

    private fun chiave(lat: Double, lon: Double): String =
        String.format(java.util.Locale.US, "%.2f_%.2f", lat, lon)

    private fun fileTile(lat: Double, lon: Double): java.io.File? {
        val dir = cacheDir ?: return null
        val d = java.io.File(dir, TILE_DIR)
        if (!d.exists()) d.mkdirs()
        return java.io.File(d, chiave(lat, lon) + ".json")
    }

    /** Applica un tile (testo JSON) come indice corrente. false se vuoto o illeggibile. */
    private fun applica(body: String, lat: Double, lon: Double): Boolean {
        val json = JSONObject(body)
        val car = buildGrid(json.optJSONArray("car"))
        val foot = buildGrid(json.optJSONArray("foot"))
        // Un tile vuoto (risposta malformata o senza strade) non deve buttare
        // via l'indice buono che abbiamo gia' in RAM.
        if (car.isEmpty() && foot.isEmpty()) return false
        carGrid = car; footGrid = foot
        tieniPolilinee(json)
        lastLat = lat; lastLon = lon; haveTile = true
        return true
    }

    private fun pota() {
        try {
            val d = java.io.File(cacheDir ?: return, TILE_DIR)
            val f = d.listFiles() ?: return
            if (f.size <= TILE_MAX) return
            f.sortedBy { it.lastModified() }.take(f.size - TILE_MAX).forEach { it.delete() }
        } catch (_: Exception) { /* best-effort */ }
    }

    /**
     * Scarica in anticipo le strade lungo un percorso. BLOCCANTE: chiamare
     * fuori dal main thread. `punti` = [lat, lon] lungo il tracciato (anche
     * fitti: si riducono alle chiavi distinte). Salta le chiavi gia' su disco
     * e fresche. Ritorna quante ne ha scaricate.
     */
    fun prescarica(punti: List<DoubleArray>, radius: Int = 700): Int {
        if (cacheDir == null) return 0
        val chiavi = LinkedHashMap<String, DoubleArray>()
        for (p in punti) {
            if (p.size < 2 || p[0].isNaN() || p[1].isNaN()) continue
            // il centro della chiave, non il punto: la risposta vale per tutta la chiave
            val la = Math.round(p[0] * 100.0) / 100.0
            val lo = Math.round(p[1] * 100.0) / 100.0
            chiavi.putIfAbsent(chiave(la, lo), doubleArrayOf(la, lo))
            if (chiavi.size >= PRESCARICO_MAX) break
        }
        var scaricate = 0
        val ora = System.currentTimeMillis()
        for ((_, c) in chiavi) {
            val f = fileTile(c[0], c[1]) ?: break
            if (f.exists() && f.length() > 50 && ora - f.lastModified() < TILE_FRESCO_MS) continue
            try {
                val url = "$ROADS_URL?lat=${c[0]}&lon=${c[1]}&radius=$radius"
                client.newCall(Request.Builder().url(url).build()).execute().use { resp ->
                    val body = if (resp.isSuccessful) resp.body?.string() else null
                    if (body != null && body.length > 50) { f.writeText(body); scaricate++ }
                }
            } catch (e: Exception) {
                Log.w(TAG, "prescarico strade interrotto: ${e.message}")
                break // rete assente: inutile insistere sulle altre
            }
            try { Thread.sleep(250) } catch (_: InterruptedException) { break }
        }
        pota()
        Log.d(TAG, "Strade pre-scaricate: $scaricate su ${chiavi.size} chiavi")
        return scaricate
    }

    /** Scarica e reindicizza il tile. Best-effort, BLOCCANTE (chiamare su IO). */
    fun refresh(lat: Double, lon: Double, radius: Int = 700) {
        if (!fetching.compareAndSet(false, true)) return // una sola in volo
        var ok = false
        try {
            val url = "$ROADS_URL?lat=$lat&lon=$lon&radius=$radius"
            client.newCall(Request.Builder().url(url).build()).execute().use { resp ->
                val body = if (resp.isSuccessful) resp.body?.string() else null
                if (body != null) {
                    if (applica(body, lat, lon)) {
                        cacheDir?.let { try { java.io.File(it, CACHE_FILE).writeText(body) } catch (_: Exception) {} }
                        try { fileTile(lat, lon)?.writeText(body) } catch (_: Exception) {}
                        Log.d(TAG, "Tile strade caricato: car=${carGrid.size} celle, foot=${footGrid.size} celle")
                        ok = true
                    }
                }
            }
        } catch (e: Exception) {
            // Un solo log per serie di fallimenti: niente log a raffica.
            if (failStreak == 0) Log.w(TAG, "refresh fallito: ${e.message}")
        }
        // SENZA RETE: il tile della zona scaricato in anticipo (o in un passaggio
        // precedente). Vale come riuscito: niente attesa crescente, e al prossimo
        // spostamento si riprova la rete.
        if (!ok) {
            try {
                val f = fileTile(lat, lon)
                if (f != null && f.exists() && applica(f.readText(), lat, lon)) {
                    Log.d(TAG, "Tile strade dal disco (senza rete): ${f.name}")
                    ok = true
                }
            } catch (_: Exception) { /* nessun tile su disco per questa zona */ }
        }
        run {
            // L'esito si registra SEMPRE, non solo in caso di successo.
            lastAttemptAt = SystemClock.elapsedRealtime()
            failStreak = if (ok) 0 else min(failStreak + 1, BACKOFF_MS.size)
            fetching.set(false)
        }
    }

    /** Carica il tile persistito (offline). Da chiamare all'avvio dopo cacheDir. */
    fun loadCached() {
        val dir = cacheDir ?: return
        try {
            val f = java.io.File(dir, CACHE_FILE)
            if (!f.exists()) return
            val json = JSONObject(f.readText())
            carGrid = buildGrid(json.optJSONArray("car"))
            footGrid = buildGrid(json.optJSONArray("foot"))
            tieniPolilinee(json)
            haveTile = true // shouldRefresh riscarica appena online ci si sposta
            Log.d(TAG, "Tile strade ripristinato da disco")
        } catch (_: Exception) { /* nessun tile persistito */ }
    }

    // ── DISTANZA DI STRADA (03/10/2026) ──────────────────────────────────
    // Le stesse polilinee, tenute anche come elenco per costruirci il grafo
    // (RoadGraph). Il grafo si costruisce alla prima richiesta dopo ogni tile
    // nuova, una rete alla volta: a piedi la pedonale, in auto quella delle auto.
    @Volatile private var carPoli: List<DoubleArray> = emptyList()
    @Volatile private var footPoli: List<DoubleArray> = emptyList()
    @Volatile private var carGrafo: RoadGraph? = null
    @Volatile private var footGrafo: RoadGraph? = null
    @Volatile private var carGrafoFatto = false
    @Volatile private var footGrafoFatto = false

    private fun polilinee(polys: JSONArray?): List<DoubleArray> {
        if (polys == null) return emptyList()
        val out = ArrayList<DoubleArray>(polys.length())
        for (i in 0 until polys.length()) {
            val poly = polys.optJSONArray(i) ?: continue
            val a = DoubleArray(poly.length() * 2)
            var n = 0
            for (j in 0 until poly.length()) {
                val p = poly.optJSONArray(j) ?: continue
                a[n++] = p.optDouble(0); a[n++] = p.optDouble(1)
            }
            if (n >= 4) out.add(if (n == a.size) a else a.copyOf(n))
        }
        return out
    }

    private fun tieniPolilinee(json: JSONObject) {
        carPoli = polilinee(json.optJSONArray("car"))
        footPoli = polilinee(json.optJSONArray("foot"))
        carGrafo = null; footGrafo = null
        carGrafoFatto = false; footGrafoFatto = false
    }

    /**
     * Il grafo della rete (auto o pedonale) del tile corrente, o null se non
     * c'e' tile. Costruirlo costa qualche decina di ms: va chiamato fuori dal
     * main thread (il giro dei trigger gira gia' su una coroutine).
     */
    @Synchronized
    fun grafo(isCar: Boolean): RoadGraph? {
        return try {
            if (isCar) {
                if (!carGrafoFatto) { carGrafo = RoadGraph.crea(carPoli); carGrafoFatto = true }
                carGrafo
            } else {
                // A PIEDI la rete e' pedonale + auto: nelle tile pre-estratte la
                // «foot» contiene solo i tratti pedonali e da sola e' a pezzi
                // (misurato a Montecatini: 15 coppie su 25 irraggiungibili).
                if (!footGrafoFatto) { footGrafo = RoadGraph.crea(footPoli + carPoli); footGrafoFatto = true }
                footGrafo
            }
        } catch (e: Exception) {
            Log.w(TAG, "grafo strade non costruito: ${e.message}")
            null
        }
    }

    private fun buildGrid(polys: JSONArray?): Map<String, List<Seg>> {
        val g = HashMap<String, MutableList<Seg>>()
        if (polys == null) return g
        for (i in 0 until polys.length()) {
            val poly = polys.optJSONArray(i) ?: continue
            var j = 0
            while (j + 1 < poly.length()) {
                val p0 = poly.optJSONArray(j)
                val p1 = poly.optJSONArray(j + 1)
                if (p0 != null && p1 != null) {
                    val seg = Seg(p0.optDouble(0), p0.optDouble(1), p1.optDouble(0), p1.optDouble(1))
                    g.getOrPut(cellKey(seg.aLat, seg.aLon)) { mutableListOf() }.add(seg)
                    g.getOrPut(cellKey(seg.bLat, seg.bLon)) { mutableListOf() }.add(seg)
                }
                j++
            }
        }
        return g
    }
}
