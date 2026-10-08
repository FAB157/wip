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
        // (03/10/2026, committente dopo la simulazione su 20 luoghi: «non va bene, deve
        // essere a 30 m e 50 in auto, 150 a piedi e 300 in auto») I RAGGI DEL DATABASE
        // NON CONTANO PIÙ. `geofence_radius`/`alert_radius` non sono misure: li scrive
        // il trigger `assign_geofence_radii` alla nascita della riga, per categoria
        // (80/200 monumenti e chiese, 100/200 musei, 120/250 gemme — il 66% dei luoghi
        // ha 80/200, alcuni 300/800). Risultato misurato: guida a 70-120 m dalla porta
        // su 60 percorsi su 60, avviso a 200 m. Valgono SOLO i raggi dell'utente
        // (default 30/150 a piedi, 50/300 in auto); il perimetro vero dell'edificio
        // (30 m dal muro, Footprints) resta l'unica misura che allarga.
        // Uguale in PoiRadii.effettivi (Swift) e radiiForTransport (web).

        // Nessun raggio calibrato: il POI e' un centroide puro, non sappiamo
        // dove sia la porta. Decisione utente 01/09/2026: il raggio non
        // aumenta MAI per incertezza — restare sulla preferenza utente
        // (default 150 m a piedi / 300 m in auto) e' meglio di un cerchio
        // allargato che genera notifiche a centinaia di metri su POI mai
        // avvicinati davvero.
        return Raggi(alert = alertBase, arrivo = arrivoBase)
    }
}

/**
 * ARBITRATO FRA I LUOGHI — quale luogo parla quando piu' d'uno e' pronto
 * (05/10/2026). Port delle regole del motore web del 04–05/10/2026
 * (src/lib/geofencing/foregroundTriggers.ts, la fonte di verita'), trovate col
 * test virtuale a Roma e Milano: davanti al Pantheon parlava una targa, in
 * Piazza Navona un locale, e le dieci righe del Pantheon parlavano una dopo
 * l'altra.
 *
 * Qui vive solo la parte PURA (costanti, peso, nome nudo, punteggio): la usano
 * il giro del servizio (ItaintaBackgroundPoiService.runPredictiveEvaluation) e
 * il ricevitore dei recinti di sistema (GeofenceBroadcastReceiver). Lo stato
 * della voce («sta parlando», «sta per partire») vive nel companion del
 * ricevitore, accanto alla coda che lo conosce.
 *
 * IDENTICO a `enum Arbitrato` in ios/App/App/PoiModels.swift: cambiare un
 * valore qui = cambiarlo la' e in foregroundTriggers.ts.
 */
object Arbitrato {
    /**
     * Una gemma «vale» 50 m nell'arbitrato: sul web sono 30 (gemma) + 20
     * (`premium`, che la RPC get_geofence_pois restituisce uguale a is_gem).
     */
    const val GEMMA_BONUS_M = 50f
    /** Chi ha una voce di Wikipedia/Wikidata alle spalle vale 25 m. */
    const val FONTE_BONUS_M = 25f
    /** Un luogo senza peso cede il passo se uno che pesa sta arrivando entro questi metri di strada. */
    const val ATTESA_IMPORTANTE_M = 100f
    /** Isteresi minima per dire «la distanza sta calando» (come il web). */
    const val AVVICINA_EPS_M = 0.5f
    /** Stesso nome nudo entro questi metri = stesso luogo: tace insieme al vincitore. */
    const val DOPPIONE_M = 150f
    /** Stesso nome raccontato da meno di cosi': silenzio, anche se la riga e' un'altra. */
    const val NOME_APPENA_DETTO_MS = 10 * 60_000L
    /** Silenzio dopo la fine di una guida, prima che parli il luogo successivo. */
    const val PAUSA_DOPO_GUIDA_MS = 20_000L
    /**
     * Quanto si aspetta che la voce di un arrivo appena emesso PARTA prima di
     * considerarla mai partita. Sul web sono 120 s (li' in mezzo c'e' il
     * paywall); qui la voce e' il teaser nativo, che parte da solo: bastano i
     * tempi del recupero del teaser dal server (15 s + 15 s) con un margine.
     */
    const val ATTESA_PARTENZA_MS = 45_000L
    /** Aggancio alla strada che sposta il fix piu' di cosi': si misura anche dal punto non agganciato. */
    const val SNAP_DUBBIO_M = 5f
    /** Fin dove si cerca la strada dal punto NON agganciato: serve solo a confermare un arrivo. */
    fun ricercaLiberaM(isDriving: Boolean): Double = if (isDriving) 150.0 else 100.0
    /** Da fermi il GPS puo' tacere: chi aspetta il suo turno si rivaluta ogni 5 s... */
    const val BATTITO_ATTESA_MS = 5_000L
    /** ...sull'ultima posizione, finche' non e' piu' vecchia di cosi' (come il web). */
    const val FERMI_MAX_ETA_MS = 10 * 60_000L

    fun haFonte(poi: PoiEntity): Boolean = poi.source?.contains("wiki", ignoreCase = true) == true

    /** Gemma, oppure una fonte Wikipedia/Wikidata alle spalle. */
    fun pesa(poi: PoiEntity): Boolean = poi.isGem || haFonte(poi)

    /** Il piu' basso vince: i metri (di strada) meno i bonus d'importanza. */
    fun punteggio(poi: PoiEntity, distM: Float): Float =
        distM - (if (poi.isGem) GEMMA_BONUS_M else 0f) - (if (haFonte(poi)) FONTE_BONUS_M else 0f)

    private val RE_ACCENTI = Regex("[\\u0300-\\u036f]")
    private val RE_PARENTESI = Regex("\\([^)]*\\)")
    private val RE_ARTICOLO = Regex("^(the|il|la|lo|le|i|gli|l')\\s+")
    private val RE_NON_ALFANUM = Regex("[^a-z0-9]+")

    /**
     * Il nome senza parentesi, accenti e articolo: «Pantheon (Roma)» e «The
     * Pantheon» sono lo stesso luogo. Stessi passi, nello stesso ordine, di
     * `nomeNudo` in foregroundTriggers.ts. Un nome in un alfabeto non latino
     * diventa vuoto: per lui le regole sul nome non scattano (come sul web).
     */
    fun nomeNudo(n: String?): String {
        if (n.isNullOrEmpty()) return ""
        val base = java.text.Normalizer.normalize(n.lowercase(java.util.Locale.ROOT), java.text.Normalizer.Form.NFD)
        return base.replace(RE_ACCENTI, "")
            .replace(RE_PARENTESI, " ")
            .replace(RE_ARTICOLO, "")
            .replace(RE_NON_ALFANUM, " ")
            .trim()
    }

    /**
     * Due nomi nudi sono lo stesso luogo: uguali, oppure (entrambi di almeno 6
     * lettere) uno contiene l'altro. Il nome del vincitore deve avere almeno 4
     * lettere, altrimenti la regola non si applica.
     */
    fun stessoLuogo(nudoVincitore: String, nudoAltro: String): Boolean {
        if (nudoVincitore.length < 4 || nudoAltro.isEmpty()) return false
        if (nudoVincitore == nudoAltro) return true
        return nudoVincitore.length >= 6 && nudoAltro.length >= 6 &&
            (nudoVincitore.contains(nudoAltro) || nudoAltro.contains(nudoVincitore))
    }

    // ── I luoghi che pesano e stanno arrivando, visti dall'ultimo giro del
    // servizio. Li scrive runPredictiveEvaluation a ogni fix; li legge anche il
    // ricevitore dei recinti di sistema, che non ha una distanza precedente per
    // sapere chi si avvicina. Oltre 10 s la fotografia non vale piu'. ──
    @Volatile private var importantiIds: Set<String> = emptySet()
    @Volatile private var importantiAt = 0L

    fun pubblicaImportanti(ids: Set<String>) {
        importantiIds = ids
        importantiAt = System.currentTimeMillis()
    }

    /** Un luogo che pesa (diverso da `tranne`) sta arrivando entro 100 m di strada? */
    fun importanteInArrivo(tranne: String): Boolean {
        val eta = System.currentTimeMillis() - importantiAt
        if (eta < 0 || eta > 10_000L) return false
        return importantiIds.any { it != tranne }
    }

    // ── TARGHE E LAPIDI IN SILENZIO SE C'E' UN MONUMENTO VICINO (08/10/2026) ──
    // Port della regola web del 05/10/2026 (committente, prova a Parigi:
    // sull'Île de la Cité le targhe parlavano prima di Notre-Dame), l'ultima
    // che sul nativo mancava. Una targa con un luogo che non e' una targa
    // entro 100 m NON parla e NON entra nel cooldown: lontano dai monumenti
    // parla come prima. Una gemma non e' mai «solo una targa». Identico in
    // PoiModels.swift (`Arbitrato.eTarga`) e in foregroundTriggers.ts.
    const val TARGA_M = 100f
    private val RE_TARGA_CAT = Regex("plaque|targa|lapide|stolperstein")
    private val RE_TARGA_NOME = Regex("\\b(plaque|targa|lapide|stolperstein|gedenktafel|placa conmemorativa)\\b", RegexOption.IGNORE_CASE)

    fun eTarga(poi: PoiEntity): Boolean {
        if (poi.isGem) return false
        if (RE_TARGA_CAT.containsMatchIn((poi.poiType ?: "").lowercase(java.util.Locale.ROOT))) return true
        if (poi.id.startsWith("plaque-")) return true
        return RE_TARGA_NOME.containsMatchIn(poi.nome)
    }

    /**
     * Fra i luoghi dati (quelli che il setup lascia parlare, attorno all'utente)
     * le targhe che hanno entro 100 m un luogo che non e' una targa.
     */
    fun targheConMonumentoVicino(luoghi: List<PoiEntity>): Set<String> {
        val targhe = luoghi.filter { eTarga(it) }
        if (targhe.isEmpty()) return emptySet()
        val altri = luoghi.filter { !eTarga(it) }
        if (altri.isEmpty()) return emptySet()
        val buf = FloatArray(1)
        val mute = HashSet<String>()
        for (t in targhe) {
            for (p in altri) {
                if (Math.abs(p.lat - t.lat) > 0.0012 || Math.abs(p.lon - t.lon) > 0.002) continue
                android.location.Location.distanceBetween(t.lat, t.lon, p.lat, p.lon, buf)
                if (buf[0] <= TARGA_M) { mute.add(t.id); break }
            }
        }
        return mute
    }

    // Le targhe da tenere mute, viste dall'ultimo giro del servizio: le legge
    // anche il ricevitore dei recinti di sistema, che non ha la lista dei
    // luoghi attorno. Stessa scadenza della fotografia degli importanti.
    @Volatile private var targheMuteIds: Set<String> = emptySet()
    @Volatile private var targheMuteAt = 0L

    fun pubblicaTargheMute(ids: Set<String>) {
        targheMuteIds = ids
        targheMuteAt = System.currentTimeMillis()
    }

    fun targaMuta(id: String): Boolean {
        val eta = System.currentTimeMillis() - targheMuteAt
        if (eta < 0 || eta > 10_000L) return false
        return targheMuteIds.contains(id)
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
        // (03/10/2026) Solo per i luoghi senza porta: per un edificio il cerchio
        // d'arrivo resta quello dell'utente attorno al punto d'arrivo.
        if (Footprints.senzaPorta(poi.poiType, poi.nome)) Footprints.raggioCopertura(poi.id, poi.footprint, lat, lon)?.let {
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
