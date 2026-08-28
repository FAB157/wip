package com.itaintasca.app.geofence

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.util.Log
import com.itaintasca.app.db.PoiEntity

/**
 * GATE DI BUSSOLA — «non raccontare cio' che ti sei gia' lasciato alle spalle».
 *
 * IL CASO REALE (22/08/2026). Cammini lungo la via, superi la chiesa, e tre
 * passi DOPO la voce attacca: «Alla tua destra, la chiesa di...». Ti giri e non
 * c'e' piu' niente da guardare. Succede perche' il geofence guarda SOLO la
 * distanza: il raggio e' un cerchio e non sa se il POI ce l'hai davanti o
 * dietro. Il gate aggiunge la sola informazione che mancava: la DIREZIONE in
 * cui sei rivolto. Se il POI e' dietro, il racconto non si butta via — si
 * RIMANDA: non si marca lo stato, non si consuma il cooldown, si riprova al
 * fix successivo.
 *
 * PRINCIPIO NON NEGOZIABILE: fail-open. Il gate puo' solo migliorare il
 * tempismo, mai sopprimere un racconto. Sensore assente, fix impreciso, dato
 * mancante, eccezione: tutto finisce in IGNORA_GATE, cioe' si parla come si e'
 * sempre parlato.
 *
 * PORT ESATTO della specifica in coda a src/lib/geofencing/bearingGate.ts:
 * stesse soglie, stessi esiti, stessa isteresi, stessa scadenza. Se una delle
 * tre implementazioni diverge, la guida parte in tre momenti diversi a seconda
 * del dispositivo.
 *
 * Questo oggetto e' PURO nella decisione: non marca stati, non parla, non
 * notifica. L'unica risorsa che possiede e' il sensore di orientamento, che si
 * registra SOLO quando serve davvero (un magnetometro acceso a vuoto e'
 * batteria buttata) e si rilascia con `disattiva()` quando il servizio va a
 * riposo o l'audioguida si spegne.
 */
object BearingGate {

    private const val TAG = "BearingGate"

    // ── Costanti tarate (identiche su web, Android e iOS) ────────────────────

    /** Semi-apertura del cono "davanti a me", in gradi: ±60° = 120° di visuale. */
    const val TOLLERANZA_GRADI = 60.0

    /** Sotto questa velocita' il bearing del GPS e' rumore: si usa la bussola. */
    const val SOGLIA_FERMO_MS = 1f

    /** Fix peggiore di cosi' non permette di fidarsi di nulla → fail-open. */
    const val ACCURATEZZA_MASSIMA_M = 50f

    /** Entro questo raggio sei ARRIVATO: dove guardi non conta piu'. */
    const val RAGGIO_ARRIVO_M = 25f

    /** Dopo tanto in sospeso si parla comunque: tardi e' meglio di mai. */
    const val SCADENZA_RINVIO_MS = 90_000L

    /** Letture "dietro" consecutive richieste quando la direzione e' da bussola. */
    const val LETTURE_DIETRO_RICHIESTE = 2

    /**
     * Chiave in ItaintaPrefs, scritta dal plugin come guideCharacter/language.
     * Default ACCESO: e' il comportamento che l'utente si aspetta
     * ("raccontami quello che vedo").
     */
    const val PREF_BEARING_GATE = "bearingGate"

    /**
     * Una lettura di bussola piu' vecchia di cosi' non descrive piu' dove hai
     * il naso (telefono rimesso in tasca, sensore fermo): vale come assente.
     */
    private const val ETA_MASSIMA_HEADING_MS = 30_000L

    // ── Tipi ────────────────────────────────────────────────────────────────

    /** PASSA = davanti, racconta. RIMANDA = dietro, riprova al prossimo fix. IGNORA_GATE = parla comunque. */
    enum class Esito { PASSA, RIMANDA, IGNORA_GATE }

    /** Da dove viene la direzione: cambia quanto ci si fida di una singola lettura. */
    enum class Fonte { GPS, BUSSOLA }

    data class Direzione(val gradi: Double, val fonte: Fonte)

    // ── Bussola: registrata solo quando serve ───────────────────────────────

    private val lock = Any()
    private var sensorManager: SensorManager? = null
    private var listener: SensorEventListener? = null

    @Volatile private var headingGradi: Double? = null
    @Volatile private var headingAt: Long = 0L

    // Buffer del ramo di riserva (accelerometro + magnetometro): il rotation
    // vector non c'e' su tutti i dispositivi economici.
    private val gravita = FloatArray(3)
    private val campoMagnetico = FloatArray(3)
    @Volatile private var haGravita = false
    @Volatile private var haCampo = false

    // (23/08/2026) Buffer della matrice di rotazione e dell'orientamento.
    // Prima erano allocati DENTRO aggiornaHeading, cioe' due array nuovi per
    // ogni evento del sensore: a SENSOR_DELAY_UI sono ~16 letture al secondo,
    // e col ramo di riserva (accelerometro + magnetometro) il doppio. Vivono
    // qui accanto a `gravita`/`campoMagnetico`, che gia' seguono la stessa
    // regola: sono toccati SOLO dal thread di consegna del sensore, che e'
    // uno solo (unico listener registrato).
    private val matrice = FloatArray(9)
    private val orientamento = FloatArray(3)

    /**
     * Registra il sensore di orientamento (SENSOR_DELAY_UI: qualche lettura al
     * secondo, piu' che sufficiente per un pedone e molto meno costosa di
     * SENSOR_DELAY_GAME). Idempotente.
     */
    fun attiva(context: Context) {
        synchronized(lock) {
            if (listener != null) return
            try {
                val sm = context.applicationContext
                    .getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
                val rotation = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
                val l = object : SensorEventListener {
                    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { }
                    override fun onSensorChanged(event: SensorEvent?) {
                        aggiornaHeading(event)
                    }
                }
                val ok: Boolean = if (rotation != null) {
                    sm.registerListener(l, rotation, SensorManager.SENSOR_DELAY_UI)
                } else {
                    val acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
                    val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
                    if (acc == null || mag == null) false
                    else sm.registerListener(l, acc, SensorManager.SENSOR_DELAY_UI) &&
                        sm.registerListener(l, mag, SensorManager.SENSOR_DELAY_UI)
                }
                if (ok) {
                    sensorManager = sm
                    listener = l
                } else {
                    try { sm.unregisterListener(l) } catch (_: Exception) { }
                }
            } catch (e: Exception) {
                // Nessuna bussola: fail-open, il gate semplicemente non decide.
                Log.w(TAG, "Bussola non disponibile: ${e.message}")
            }
        }
    }

    /**
     * Rilascia il sensore. Da chiamare quando il servizio si spegne o va a
     * riposo: il magnetometro acceso a vuoto e' batteria.
     */
    fun disattiva() {
        synchronized(lock) {
            val l = listener ?: return
            try { sensorManager?.unregisterListener(l) } catch (_: Exception) { }
            listener = null
            sensorManager = null
            headingGradi = null
            headingAt = 0L
            haGravita = false
            haCampo = false
        }
    }

    private fun aggiornaHeading(event: SensorEvent?) {
        try {
            val e = event ?: return
            when (e.sensor?.type) {
                Sensor.TYPE_ROTATION_VECTOR -> {
                    // Su alcuni dispositivi vecchi values ha 5 elementi e
                    // getRotationMatrixFromVector lancia: si passano i primi 4.
                    val v = if (e.values.size > 4) e.values.copyOf(4) else e.values
                    SensorManager.getRotationMatrixFromVector(matrice, v)
                }
                Sensor.TYPE_ACCELEROMETER -> {
                    System.arraycopy(e.values, 0, gravita, 0, 3)
                    haGravita = true
                    if (!haCampo) return
                    if (!SensorManager.getRotationMatrix(matrice, null, gravita, campoMagnetico)) return
                }
                Sensor.TYPE_MAGNETIC_FIELD -> {
                    System.arraycopy(e.values, 0, campoMagnetico, 0, 3)
                    haCampo = true
                    if (!haGravita) return
                    if (!SensorManager.getRotationMatrix(matrice, null, gravita, campoMagnetico)) return
                }
                else -> return
            }
            SensorManager.getOrientation(matrice, orientamento)
            val gradi = normalizza360(Math.toDegrees(orientamento[0].toDouble()))
            headingGradi = gradi
            headingAt = System.currentTimeMillis()
        } catch (_: Exception) {
            // Lettura sporca: si tiene l'ultima buona (o nessuna) → fail-open.
        }
    }

    // (23/08/2026) Memoria della declinazione per POSIZIONE. Il gate viene
    // valutato per ogni POI candidato dello STESSO fix, e ogni valutazione
    // costruiva un GeomagneticField nuovo: e' il modello geomagnetico
    // mondiale, non un'addizione. Con la stessa identica posizione il
    // risultato non puo' che essere lo stesso, quindi si ricalcola solo
    // quando il fix cambia davvero. Nessun arrotondamento: il confronto e'
    // esatto sui tre valori del fix.
    @Volatile private var declLat = Double.NaN
    @Volatile private var declLon = Double.NaN
    @Volatile private var declAlt = Double.NaN
    @Volatile private var declValore = 0f

    private fun declinazione(location: Location): Float {
        if (location.latitude == declLat && location.longitude == declLon &&
            location.altitude == declAlt
        ) {
            return declValore
        }
        val d = try {
            GeomagneticField(
                location.latitude.toFloat(),
                location.longitude.toFloat(),
                location.altitude.toFloat(),
                System.currentTimeMillis()
            ).declination
        } catch (_: Exception) { 0f }
        declValore = d
        declLat = location.latitude
        declLon = location.longitude
        declAlt = location.altitude
        return d
    }

    /**
     * Heading magnetico corrente, o null se assente/stantio.
     * `location` serve solo per la declinazione magnetica: il bearing verso il
     * POI e' geografico (nord vero) e il sensore Android e' magnetico — a
     * declinazioni forti i due non sono confrontabili.
     */
    private fun headingBussola(location: Location?): Double? {
        val g = headingGradi ?: return null
        if (System.currentTimeMillis() - headingAt > ETA_MASSIMA_HEADING_MS) return null
        val decl = if (location == null) 0f else declinazione(location)
        return normalizza360(g + decl)
    }

    // ── Preferenza utente ───────────────────────────────────────────────────

    /** Acceso di default: si spegne solo con un false esplicito nelle prefs. */
    fun abilitato(context: Context): Boolean = try {
        context.applicationContext
            .getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .getBoolean(PREF_BEARING_GATE, true)
    } catch (_: Exception) {
        true
    }

    // ── Direzione dell'utente ───────────────────────────────────────────────

    /**
     * Direzione in cui l'utente e' rivolto, con la fonte da cui arriva.
     *
     * In MOVIMENTO (> 1 m/s) comanda il bearing del fix: chi cammina guarda
     * dove cammina, ed e' un dato stabile, indipendente da come tieni il
     * telefono in mano. DA FERMO il bearing e' rumore puro, quindi si passa
     * alla bussola — che da fermo e' l'unica a dire dove hai il naso.
     *
     * null = nessuna delle due e' utilizzabile → il chiamante va fail-open.
     */
    fun direzioneUtente(location: Location?): Direzione? {
        return try {
            if (location == null) return null
            val haBearing = location.hasBearing()
            if (location.hasSpeed() && location.speed > SOGLIA_FERMO_MS && haBearing) {
                return Direzione(normalizza360(location.bearing.toDouble()), Fonte.GPS)
            }
            val bussola = headingBussola(location)
            if (bussola != null) return Direzione(bussola, Fonte.BUSSOLA)
            // Ultima spiaggia: bearing valido senza velocita' nota (alcuni fix
            // Android danno il bearing e non la speed).
            if (haBearing && !location.hasSpeed()) {
                return Direzione(normalizza360(location.bearing.toDouble()), Fonte.GPS)
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    // ── Geometria del cono ──────────────────────────────────────────────────

    /** Differenza angolare firmata, normalizzata a −180…+180. */
    fun differenzaAngolare(a: Double, b: Double): Double = ((a - b + 540.0) % 360.0) - 180.0

    /**
     * true se il POI sta nel cono davanti all'utente. ±60° di default:
     * abbastanza largo da non tagliare fuori cio' che vedi con la coda
     * dell'occhio o dall'altro lato della strada, abbastanza stretto da
     * escludere cio' che hai davvero alle spalle.
     */
    fun poiDavanti(direzione: Double, bearingVersoPoi: Double, tolleranza: Double = TOLLERANZA_GRADI): Boolean {
        return try {
            if (direzione.isNaN() || bearingVersoPoi.isNaN()) true // fail-open
            else Math.abs(differenzaAngolare(bearingVersoPoi, direzione)) <= tolleranza
        } catch (_: Exception) {
            true
        }
    }

    // ── Stato: isteresi + scadenza del rinvio ───────────────────────────────

    private data class StatoPoi(val primoRinvio: Long, var dietroConsecutivi: Int)

    /** Vive in memoria e per POI: non va persistito (spec, punto 8). */
    private val stato = java.util.concurrent.ConcurrentHashMap<String, StatoPoi>()

    /** Dimentica lo stato di un POI (dopo che ha parlato) o di tutti. */
    fun azzera(poiId: String? = null) {
        if (poiId == null) stato.clear() else stato.remove(poiId)
    }

    // ── La decisione ────────────────────────────────────────────────────────

    /**
     * Decide se questo POI puo' essere raccontato ORA.
     *
     * IGNORA_GATE quando: preferenza spenta; direzione assente; accuratezza
     * oltre 50 m (con quell'errore il bearing e' inventato); utente DENTRO il
     * perimetro dell'edificio; utente entro il raggio d'arrivo stretto (25 m:
     * sei sul posto, da qualunque lato lo guardi); rinvio scaduto (90 s).
     *
     * @param dentroPerimetro true SOLO se il punto e' dentro il poligono del
     *        POI (Footprints.dentroPerimetro), non "vicino al muro": vicino al
     *        muro il gate ha ancora senso, dentro no.
     * @param distanzaM distanza utente-POI gia' calcolata dal chiamante (per un
     *        POI col poligono, la minore fra ingresso e bordo); null = la
     *        calcola qui.
     * @param raggioArrivoM raggio entro cui si e' "arrivati". Di norma NON e'
     *        il raggio di trigger della modalita' (30/50 m): passarlo
     *        renderebbe il gate inerte, perche' l'arrivo scatta proprio a
     *        quella distanza. Resta il 25 m della specifica.
     */
    fun valuta(
        context: Context,
        poi: PoiEntity?,
        location: Location?,
        dentroPerimetro: Boolean,
        distanzaM: Float? = null,
        raggioArrivoM: Float = RAGGIO_ARRIVO_M,
        tolleranza: Double = TOLLERANZA_GRADI
    ): Esito {
        return try {
            if (poi == null || location == null) return Esito.IGNORA_GATE
            if (!abilitato(context)) return Esito.IGNORA_GATE

            val id = poi.id
            val adesso = System.currentTimeMillis()

            // Fix impreciso: il bearing calcolato su un punto sbagliato di 80 m
            // dice il contrario del vero. Non si decide su un dato cosi'.
            if (location.hasAccuracy() && location.accuracy > ACCURATEZZA_MASSIMA_M) {
                stato.remove(id)
                return Esito.IGNORA_GATE
            }

            // Dentro l'edificio: la direzione dello sguardo e' irrilevante.
            if (dentroPerimetro) {
                stato.remove(id)
                return Esito.IGNORA_GATE
            }

            val poiLat = poi.entranceLat ?: poi.lat
            val poiLon = poi.entranceLon ?: poi.lon

            // Arrivato: il POI e' addosso, da qualunque lato lo si guardi.
            val distanza = distanzaM ?: run {
                val loc = Location("").apply { latitude = poiLat; longitude = poiLon }
                location.distanceTo(loc)
            }
            if (!distanza.isNaN() && distanza <= raggioArrivoM) {
                stato.remove(id)
                return Esito.IGNORA_GATE
            }

            // Direzione: senza, il gate non esiste. La bussola si registra qui
            // — e solo qui — perche' e' l'unico momento in cui serve davvero.
            if (!(location.hasSpeed() && location.speed > SOGLIA_FERMO_MS && location.hasBearing())) {
                attiva(context)
            }
            val dir = direzioneUtente(location)
            if (dir == null) {
                stato.remove(id)
                return Esito.IGNORA_GATE
            }

            val bearing = bearingVerso(location.latitude, location.longitude, poiLat, poiLon)
            if (poiDavanti(dir.gradi, bearing, tolleranza)) {
                stato.remove(id) // torna davanti → l'isteresi riparte da zero
                return Esito.PASSA
            }

            // ── E' dietro. Prima di rimandare, due cautele. ──
            val s = stato.getOrPut(id) { StatoPoi(adesso, 0) }
            s.dietroConsecutivi += 1

            // 1) Scadenza: un POI rimandato non puo' restare in sospeso per
            //    sempre. Dopo 90 s si parla comunque — un racconto tardivo vale
            //    piu' del silenzio.
            if (adesso - s.primoRinvio >= SCADENZA_RINVIO_MS) {
                stato.remove(id)
                return Esito.IGNORA_GATE
            }

            // 2) Isteresi, e SOLO per la bussola: da fermo il magnetometro
            //    oscilla di decine di gradi fra una lettura e l'altra. Il
            //    bearing del GPS in movimento e' stabile e vale subito — ed e'
            //    proprio il caso che il gate esiste per risolvere.
            if (dir.fonte == Fonte.BUSSOLA && s.dietroConsecutivi < LETTURE_DIETRO_RICHIESTE) {
                return Esito.IGNORA_GATE
            }

            Esito.RIMANDA
        } catch (e: Exception) {
            Log.w(TAG, "valuta fallita, fail-open: ${e.message}")
            Esito.IGNORA_GATE
        }
    }

    // ── Utilita' ────────────────────────────────────────────────────────────

    /** Bearing geografico (gradi da nord, orario) dal punto 1 al punto 2. */
    fun bearingVerso(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val f1 = Math.toRadians(lat1)
        val f2 = Math.toRadians(lat2)
        val dl = Math.toRadians(lon2 - lon1)
        val y = Math.sin(dl) * Math.cos(f2)
        val x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
        return normalizza360(Math.toDegrees(Math.atan2(y, x)))
    }

    private fun normalizza360(g: Double): Double = ((g % 360.0) + 360.0) % 360.0
}
