package com.itaintasca.app.geofence

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.itaintasca.app.db.PoiEntity

/**
 * RAGGIO IN BASE ALLA FIDUCIA DEL PUNTO (23/08/2026, rivisto 01/09/2026).
 *
 * Un POI non e' un punto: e' un punto di cui sappiamo, caso per caso, quanto
 * fidarci. Il perimetro e' misurato sul muro; l'ingresso e' la porta vera; il
 * PUNTO dell'indirizzo e' la casa piu' vicina al POI nel dump Nominatim, cioe'
 * vicinanza MISURATA a pochi metri; il centroide e' solo il baricentro di
 * quello che sappiamo, e li' non conosciamo ne' la via ne' la porta.
 *
 * Regola (decisione utente, 01/09/2026): IL RAGGIO NON AUMENTA MAI PER
 * INCERTEZZA. Fino a ieri un POI a centroide puro raddoppiava il raggio
 * (fino a un tetto di 250/400 m) per "non perderlo" — ma la maggioranza dei
 * POI importati da Overture/OSM e' a centroide (nessun entrance_lat/lon
 * geocodificato) anche quando e' un luogo notissimo con indirizzo (Chiesa
 * Evangelica ADI, Chiesa San Pietro Avenza, Biblioteca della Camera di
 * Commercio...), e il raddoppio produceva notifiche "Esplorazione" a
 * 200-400+ m su POI mai avvicinati. Ora:
 *   - raggio CALIBRATO in DB (geofence_radius/alert_radius, misurato o
 *     default di categoria Overture) → vince sempre se presente, puo' solo
 *     allargare la preferenza utente, mai stringerla;
 *   - nessun raggio calibrato → resta la preferenza utente cosi' com'e'
 *     (default 150 m a piedi / 300 m in auto), niente moltiplicatore.
 *
 * UNICO punto di verita': lo usano GeofenceManager (recinti di sistema) e
 * ItaintaBackgroundPoiService (valutazione predittiva). Tre copie della stessa
 * scala e' esattamente il difetto che il CLAUDE.md segnala.
 */
object RaggiFiducia {

    data class Raggi(val alert: Float, val arrivo: Float)

    /** Un punto d'arrivo: le coordinate a cui puntare (trigger e navigatore). */
    data class Punto(val lat: Double, val lon: Double)

    /**
     * GUARDIA sul punto dell'indirizzo: oltre questa distanza dal centroide il
     * punto non e' l'indirizzo di QUESTO POI ma di qualcos'altro (un abbinamento
     * sbagliato, una casa dall'altra parte del paese). Meglio il centroide, che
     * e' sicuramente il posto giusto per quanto impreciso, di un punto preciso
     * nel posto sbagliato.
     */
    const val MAX_DISTANZA_PUNTO_INDIRIZZO = 250f

    /**
     * Il PUNTO dell'indirizzo, se utilizzabile, altrimenti null.
     *
     * Due condizioni, entrambe necessarie:
     *  1. `addressSource != "strada_vicina"`. Quella non e' un indirizzo: e'
     *     «la strada con nome piu' vicina», scritta dalla catena Photon per
     *     dire da dove ci si arriva. Una chiesa in mezzo ai campi non sta al
     *     civico di quella via, e puntarci porterebbe altrove.
     *  2. il punto dista meno di MAX_DISTANZA_PUNTO_INDIRIZZO dal centroide
     *     (vedi la costante: guardia contro abbinamenti sballati).
     *
     * Nota: NON si guarda dentro la stringa `address`. Il gradino lo fa il
     * punto; la stringa da sola non si puo' trasformare in un cerchio.
     */
    fun puntoIndirizzo(poi: PoiEntity): Punto? {
        val pLat = poi.addressPointLat ?: return null
        val pLon = poi.addressPointLon ?: return null
        if (poi.addressSource?.trim().equals("strada_vicina", ignoreCase = true)) return null
        val fuori = FloatArray(1)
        Location.distanceBetween(poi.lat, poi.lon, pLat, pLon, fuori)
        if (fuori[0] > MAX_DISTANZA_PUNTO_INDIRIZZO) return null
        return Punto(pLat, pLon)
    }

    /**
     * IL PUNTO D'ARRIVO di questo POI: ingresso → punto dell'indirizzo →
     * centroide. E' lo stesso punto per il trigger e per il navigatore, ed e'
     * la traduzione della regola: «chi ha indirizzo, quello E' l'arrivo».
     */
    fun puntoArrivo(poi: PoiEntity): Punto {
        val eLat = poi.entranceLat
        val eLon = poi.entranceLon
        if (eLat != null && eLon != null) return Punto(eLat, eLon)
        return puntoIndirizzo(poi) ?: Punto(poi.lat, poi.lon)
    }

    /**
     * Raggi effettivi per questo POI, a partire dai raggi base della modalita'
     * (gli slider dell'utente). `alertBase`/`arrivoBase` sono gia' quelli della
     * modalita' corrente (piedi o auto).
     */
    fun calcola(poi: PoiEntity, isDriving: Boolean, alertBase: Float, arrivoBase: Float): Raggi {
        // RAGGIO CALIBRATO DAL DB: vince sempre che sia presente, con o senza
        // punto d'ingresso geocodificato. Fino al 01/09/2026 serviva anche
        // `hasEntrance` (entrance_lat/entrance_lon non nulli): la maggioranza
        // dei POI importati da Overture/OSM porta gia' geofence_radius/
        // alert_radius (spesso un default di categoria, es. 80/200 per le
        // chiese) ma NON un punto d'ingresso geocodificato — il gate scartava
        // una misura buona e faceva cadere il POI nel ramo CENTROIDE qui
        // sotto, raddoppiando il raggio fino a 250-600 m su luoghi noti con
        // indirizzo (Chiesa Evangelica ADI, Chiesa San Pietro Avenza,
        // Biblioteca della Camera di Commercio...). Puo' solo allargare,
        // mai stringere sotto la preferenza utente.
        val calAlert = poi.alertRadius?.takeIf { it > 0 }?.toFloat()
        val calArrivo = poi.geofenceRadius?.takeIf { it > 0 }?.toFloat()
        if (calAlert != null || calArrivo != null) {
            return Raggi(
                alert = if (calAlert != null) maxOf(alertBase, calAlert) else alertBase,
                arrivo = if (calArrivo != null) maxOf(arrivoBase, calArrivo) else arrivoBase
            )
        }

        // Nessun raggio calibrato: il POI e' un centroide puro, non sappiamo
        // dove sia la porta. Decisione utente 01/09/2026: il raggio non
        // aumenta MAI per incertezza — restare sulla preferenza utente
        // (default 150 m a piedi / 300 m in auto) e' meglio di un cerchio
        // allargato che genera notifiche a centinaia di metri su POI mai
        // avvicinati davvero.
        return Raggi(alert = alertBase, arrivo = arrivoBase)
    }
}

class GeofenceManager(private val context: Context) {
    private val geofencingClient = LocationServices.getGeofencingClient(context)
    private val TAG = "GeofenceManager"

    // Sliding window incrementale: id dei POI attualmente registrati + firma
    // della configurazione (modalità/raggi). Vive in memoria: se il processo
    // muore, i geofence restano nell'OS ma il set torna vuoto → il primo
    // register successivo fa un full re-register (remove-by-PendingIntent).
    //
    // (22/08/2026) THREAD-SAFETY: registerGeofencesForPois arriva sia dalla
    // coroutine del fetch radar (checkRefreshGeofences) sia da quella di
    // syncManualSelection, in parallelo su Dispatchers.IO; i callback dei
    // Task di Play Services girano sul main thread. Ogni lettura/scrittura di
    // registeredPoiIds/registrationSignature/sentinelCenter passa da `lock`.
    private val lock = Any()
    private val registeredPoiIds = mutableSetOf<String>()
    private var registrationSignature: String? = null
    private var sentinelCenter: Location? = null

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        // Per Android 12+ (S), FLAG_MUTABLE è necessario per Geofencing
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    @SuppressLint("MissingPermission")
    fun registerGeofencesForPois(
        pois: List<PoiEntity>,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float,
        origin: Location? = null,
        initialTrigger: Boolean = false
    ) {
        if (pois.isEmpty()) return

        // Ordina: tappe itinerario, poi Gemme, poi per distanza REALE
        // dall'utente (logica pura in SlidingWindowLogic, condivisa col
        // percorso offline e coi test).
        // 33 POI × 3 geofence = 99 + 1 sentinella = 100, il cap Android.
        val byId = pois.associateBy { it.id }
        val windowInput = pois.map { poi ->
            SlidingWindowLogic.WindowPoi(
                id = poi.id,
                isGem = poi.isGem,
                distanceM = if (origin == null) 0f else {
                    // Stesso punto d'arrivo del trigger (ingresso → indirizzo →
                    // centroide): la finestra deve ordinare per la distanza dal
                    // punto a cui poi si scattera', non da un altro.
                    val p = RaggiFiducia.puntoArrivo(poi)
                    val loc = Location("").apply {
                        latitude = p.lat
                        longitude = p.lon
                    }
                    origin.distanceTo(loc)
                },
                isItinerary = poi.isFromItinerary
            )
        }
        val targetIds = SlidingWindowLogic.selectWindow(windowInput)
        val sortedPois = targetIds.mapNotNull { byId[it] }

        val signature = "$guideMode|$alertRadiusWalk|$arrivalRadiusWalk|$alertRadiusCar|$arrivalRadiusCar"

        // Tutta la decisione (full vs diff) e l'aggiornamento dello stato in
        // memoria avvengono sotto lock: due chiamate concorrenti non possono
        // calcolare il diff sullo stesso set e scriverlo entrambe.
        val removeIds = mutableListOf<String>()
        val addList = mutableListOf<Geofence>()
        var diffOrNull: SlidingWindowLogic.Diff? = null
        synchronized(lock) {
            // Full re-register quando: prima registrazione del processo, cambio
            // raggi/modalità (i raggi dei geofence esistenti sarebbero sbagliati),
            // o richiesta di initial trigger.
            val needsFullRegister = initialTrigger ||
                registeredPoiIds.isEmpty() ||
                signature != registrationSignature

            if (needsFullRegister) {
                fullRegister(sortedPois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin, initialTrigger, signature)
                return
            }

            // Diff incrementale: niente finestra cieca sui geofence in comune.
            val diff = SlidingWindowLogic.computeDiff(registeredPoiIds, targetIds)
            diffOrNull = diff
            val sentinelMoved = origin != null && sentinelCenter?.let { it.distanceTo(origin) > 1000f } ?: true

            if (diff.isEmpty && !sentinelMoved) return

            diff.toRemoveIds.forEach { removeIds.addAll(SlidingWindowLogic.requestIdsFor(it)) }
            if (sentinelMoved) removeIds.add(SlidingWindowLogic.SENTINEL_ID)

            diff.toAddIds.mapNotNull { byId[it] }.forEach {
                addList.addAll(buildGeofencesForPoi(it, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar))
            }
            if (sentinelMoved && origin != null) {
                addList.add(buildSentinel(origin))
                sentinelCenter = Location(origin)
            }

            registeredPoiIds.removeAll(diff.toRemoveIds.toSet())
            registeredPoiIds.addAll(diff.toAddIds)
        }
        val diff = diffOrNull ?: return

        val doAdd = {
            if (addList.isNotEmpty()) {
                val request = GeofencingRequest.Builder().apply {
                    setInitialTrigger(0)
                    addGeofences(addList)
                }.build()
                geofencingClient.addGeofences(request, geofencePendingIntent).run {
                    addOnSuccessListener {
                        val now = synchronized(lock) { registeredPoiIds.size }
                        Log.d(TAG, "Incremental window: +${diff.toAddIds.size} -${diff.toRemoveIds.size} POIs (now $now)")
                    }
                    addOnFailureListener {
                        // Se l'add fallisce lo stato in memoria non è più affidabile:
                        // forza un full re-register al prossimo giro.
                        Log.e(TAG, "Incremental add failed: ${it.message}")
                        synchronized(lock) { registeredPoiIds.clear() }
                    }
                }
            }
        }
        if (removeIds.isNotEmpty()) {
            geofencingClient.removeGeofences(removeIds).addOnCompleteListener { doAdd() }
        } else {
            doAdd()
        }
    }

    @SuppressLint("MissingPermission")
    private fun fullRegister(
        sortedPois: List<PoiEntity>,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float,
        origin: Location?,
        initialTrigger: Boolean,
        signature: String
    ) {
        val geofenceList = mutableListOf<Geofence>()
        for (poi in sortedPois) {
            geofenceList.addAll(buildGeofencesForPoi(poi, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar))
        }
        // Sentinella di area: EXIT dal raggio della finestra → il receiver
        // rilancia il servizio che ri-registra la window dal DB (rete o pacchetto
        // offline). Copre il caso di update GPS strozzati in Doze profondo.
        if (origin != null) {
            geofenceList.add(buildSentinel(origin))
            synchronized(lock) { sentinelCenter = Location(origin) }
        }

        val request = GeofencingRequest.Builder().apply {
            // INITIAL_TRIGGER_ENTER solo alla PRIMA registrazione dopo l'avvio:
            // chi attiva il tour già davanti al monumento riceve subito il teaser
            // (prima: silenzio totale finché non usciva e rientrava dal raggio).
            // Sui refresh successivi resta disattivato per evitare allarmi a
            // raffica; il dedup su Room filtra comunque i doppioni.
            setInitialTrigger(if (initialTrigger) GeofencingRequest.INITIAL_TRIGGER_ENTER else 0)
            addGeofences(geofenceList)
        }.build()

        // Remove e add sono asincroni sullo stesso PendingIntent: concatenarli
        // evita la race in cui l'add veniva processato prima del remove.
        geofencingClient.removeGeofences(geofencePendingIntent).addOnCompleteListener {
            geofencingClient.addGeofences(request, geofencePendingIntent).run {
                addOnSuccessListener {
                    synchronized(lock) {
                        registeredPoiIds.clear()
                        registeredPoiIds.addAll(sortedPois.map { p -> p.id })
                        registrationSignature = signature
                    }
                    Log.d(TAG, "Geofences registered for ${sortedPois.size} POIs (${sortedPois.count { p -> p.isGem }} gems, ${sortedPois.count { p -> p.isFromItinerary }} tappe, initialTrigger=$initialTrigger)")
                }
                addOnFailureListener {
                    synchronized(lock) {
                        registeredPoiIds.clear()
                        registrationSignature = null
                    }
                    Log.e(TAG, "Failed to register geofences: ${it.message}")
                }
            }
        }
    }

    private fun buildGeofencesForPoi(
        poi: PoiEntity,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float
    ): List<Geofence> {
        // IL CENTRO DEI RECINTI E' IL PUNTO D'ARRIVO: ingresso → punto
        // dell'indirizzo → centroide (RaggiFiducia.puntoArrivo). Chi ha
        // l'indirizzo con un punto lo usa come arrivo, e il cerchio da 30 m sta
        // li' invece che sul baricentro dell'edificio, che puo' cadere sul retro.
        val punto = RaggiFiducia.puntoArrivo(poi)
        val lat = punto.lat
        val lon = punto.lon

        val isDriving = guideMode == "driving"

        // RAGGIO IN BASE ALLA FIDUCIA DEL PUNTO: unica funzione condivisa col
        // servizio (RaggiFiducia.calcola, in cima a questo file). Comprende sia
        // i raggi CALIBRATI dal DB (che vincono, come prima) sia la scala
        // perimetro/ingresso/indirizzo/centroide coi suoi tetti.
        val raggi = RaggiFiducia.calcola(
            poi, isDriving,
            alertBase = if (isDriving) alertRadiusCar else alertRadiusWalk,
            arrivoBase = if (isDriving) arrivalRadiusCar else arrivalRadiusWalk
        )
        var alertRadius = raggi.alert
        var arrivalRadius = raggi.arrivo

        // A 30 M DAL PERIMETRO (22/08/2026). Il sistema conosce solo cerchi:
        // perche' il Receiver possa decidere "sei a 30 m dal muro", l'ENTER
        // deve arrivare da QUALUNQUE lato dell'edificio. Il cerchio d'arrivo
        // copre quindi il vertice piu' lontano del perimetro + 30 m; per
        // un edificio compatto non cambia nulla, per un parco o una cinta
        // muraria e' la differenza fra parlare e tacere sul lato opposto.
        Footprints.raggioCopertura(poi.id, poi.footprint, lat, lon)?.let {
            arrivalRadius = maxOf(arrivalRadius, it.toFloat())
            alertRadius = maxOf(alertRadius, arrivalRadius)
        }

        // Raggio isteresi (uscita silenziosa): 1.5× il raggio di alert
        val exitRadius = alertRadius * 1.5f

        return listOf(
            // Approach Geofence (ENTER only)
            Geofence.Builder()
                .setRequestId("${poi.id}_approach")
                .setCircularRegion(lat, lon, alertRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build(),
            // Arrival Geofence (ENTER only)
            Geofence.Builder()
                .setRequestId("${poi.id}_arrival")
                .setCircularRegion(lat, lon, arrivalRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build(),
            // Exit Geofence — per il reset dello stato (isteresi)
            Geofence.Builder()
                .setRequestId("${poi.id}_exit")
                .setCircularRegion(lat, lon, exitRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
                .build()
        )
    }

    private fun buildSentinel(origin: Location): Geofence =
        Geofence.Builder()
            .setRequestId(SlidingWindowLogic.SENTINEL_ID)
            .setCircularRegion(origin.latitude, origin.longitude, SlidingWindowLogic.SENTINEL_RADIUS_M)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
            .build()

    fun removeAllGeofences() {
        synchronized(lock) {
            registeredPoiIds.clear()
            registrationSignature = null
            sentinelCenter = null
        }
        geofencingClient.removeGeofences(geofencePendingIntent).run {
            addOnSuccessListener {
                Log.d(TAG, "All geofences removed")
            }
            addOnFailureListener {
                Log.e(TAG, "Failed to remove geofences: ${it.message}")
            }
        }
    }
}
