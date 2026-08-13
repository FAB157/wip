package com.itaintasca.app.service

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import androidx.core.net.toUri
import com.google.android.gms.location.*
import com.google.gson.Gson
import com.itaintasca.app.MainActivity
import com.itaintasca.app.R
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.db.TriggerState
import com.itaintasca.app.db.TriggerStateEntity
import com.itaintasca.app.db.toPoiEntity
import com.itaintasca.app.geofence.GeofenceBroadcastReceiver
import com.itaintasca.app.geofence.GeofenceManager
import com.itaintasca.app.geofence.PredictiveTrigger
import com.itaintasca.app.geofence.RoadSnap
import com.itaintasca.app.geofence.TriggerTelemetry
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.*

// NOTA: la voce (teaser) è di proprietà ESCLUSIVA di GeofenceBroadcastReceiver:
// questo servizio non parla mai. Il vecchio TTS interno e la catena
// processManualGeofences/triggerHybridAlert erano codice morto (il check manuale
// era disattivato in favore dei Geofence nativi) e sono stati rimossi.
class ItaintaBackgroundPoiService : Service() {

    companion object {
        const val TAG = "ItaintaPoiService"
        const val CHANNEL_ID = "geofencing_channel"
        const val ALERT_CHANNEL_ID = "itainta_alerts_channel"
        const val NOTIF_ID = 4004
        const val ACTION_STOP = "com.itaintasca.app.STOP"
        const val ACTION_SYNC_SELECTION = "com.itaintasca.app.SYNC_SELECTION"
        // Il filtro categorie (CATEGORY_MAP) vive in GeofenceBroadcastReceiver e
        // SupabaseClient: qui non serve più, il servizio non valuta trigger.

        // Dopo un fetch fallito (galleria, zona senza segnale) non riproviamo a
        // ogni update GPS (2-5s) ma al massimo ogni 20s.
        private const val FETCH_RETRY_BACKOFF_MS = 20_000L

        // ── Valutatore predittivo ──
        /** Tetto ai POI valutati per fix: in un centro storico denso
         *  valutarli tutti a 1 Hz costerebbe CPU e batteria senza aggiungere
         *  nulla — i più lontani non possono essere i prossimi. */
        private const val MAX_PREDICTIVE_CANDIDATES = 5

        /** Finestra di attenzione: sotto questo t_cpa si passa ad alta
         *  frequenza (ARMED). Più larga di T_LEAD per avere qualche fix di
         *  margine prima del momento dell'annuncio. */
        private const val ARM_WINDOW_S = 90.0
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var db: PoiDatabase
    private lateinit var geofenceManager: GeofenceManager
    private val supabase = SupabaseClient()
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val gson = Gson()
    
    private var lastQueryLocation: Location? = null
    private var currentPois: List<PoiEntity> = emptyList()

    // Guard anti-sovrapposizione: gli update GPS arrivano ogni 2-5s ma un fetch
    // di rete può durare 15s — senza guard partivano fetch concorrenti che
    // registravano i geofence due volte.
    private val isFetching = java.util.concurrent.atomic.AtomicBoolean(false)
    @Volatile private var lastFetchFailedAt = 0L

    private var locationCallback: LocationCallback? = null
    private var appLanguage = "it"
    
    private var isAutomaticMode = true
    private var guideMode = "walking"
    // Preferenza trasporto dell'utente: 'auto' = rileva dalla velocità GPS,
    // 'walk'/'car' = forzata dal setup. Con 'auto' il servizio cambia guideMode
    // da solo: a schermo spento la WebView è congelata e il rilancio JS al
    // cambio piedi⇄auto non può avvenire.
    private var transportPref = "auto"
    private var modeSwitchStreak = 0
    private var alertRadiusWalk = 150f
    private var arrivalRadiusWalk = 30f
    private var alertRadiusCar = 300f
    private var arrivalRadiusCar = 50f
    private var selectedCategories = emptyList<String>()

    // ── Valutatore predittivo in-process (Blocchi 2 e 3) ──────────────────
    // Distanza al fix precedente, per POI: serve a rilevare il superamento
    // (distanza crescente + CPA alle spalle).
    private val lastDistances = HashMap<String, Float>()
    // Livello corrente del duty cycle: `true` = alta frequenza perché c'è
    // almeno un POI in rotta entro la finestra di attenzione.
    @Volatile private var isArmed = false
    // Guard: un solo giro di valutazione alla volta (i fix possono
    // sovrapporsi alle query su Room).
    private val predictiveBusy = java.util.concurrent.atomic.AtomicBoolean(false)

    override fun onCreate() {
        super.onCreate()
        db = PoiDatabase.getInstance(this)
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        geofenceManager = GeofenceManager(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("ItaintaPrefs", MODE_PRIVATE)
        val isReallyActive = prefs.getBoolean("isServiceActive", false)

        // startForeground SUBITO e per OGNI percorso: il servizio può essere avviato
        // con startForegroundService da plugin/watchdog/boot/sync e ha pochi secondi
        // per promuoversi, pena ForegroundServiceDidNotStartInTimeException.
        val notification = buildNotification("Audioguida attiva", "Acquisizione posizione...")
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIF_ID, notification)
            }
        } catch (e: Exception) {
            // Android 12+: avviare un FGS 'location' DA BACKGROUND (boot, watchdog
            // 15 min, sentinella geofence quando l'app non è "while-in-use") è
            // vietato e lancia ForegroundServiceStartNotAllowedException/
            // SecurityException QUI DENTRO il servizio — il try/catch del chiamante
            // non la prende, e prima era un CRASH (rischio rifiuto Play + riavvio
            // al boot). Ora si degrada: niente promozione → stopSelf pulito, i
            // geofence dell'OS restano la rete di sicurezza.
            Log.w(TAG, "startForeground non consentito (background start): ${e.message}")
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent == null && !isReallyActive) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_STOP) {
            prefs.edit { putBoolean("isServiceActive", false) }
            com.itaintasca.app.geofence.GeofenceBroadcastReceiver.stopSpeaking(this)
            ServiceWatchdog.cancel(this)
            RadarState.setActive(false)
            stopSelf()
            return START_NOT_STICKY
        }
        RadarState.setActive(true)

        if (intent?.action == ACTION_SYNC_SELECTION) {
            // Il sync può arrivare a processo freddo: ripristina raggi/modalità dai prefs
            if (selectedCategories.isEmpty() && currentPois.isEmpty()) restoreSettingsFromPrefs(prefs)
            val jsonPois = intent.getStringExtra("poisJson") ?: "[]"
            syncManualSelection(jsonPois)
            return START_STICKY
        }

        if (intent != null && intent.hasExtra("guideMode")) {
            // Avvio "vero" dal plugin: leggi gli extras e persisti tutto,
            // così i riavvii STICKY/watchdog/boot non perdono le impostazioni.
            isAutomaticMode = intent.getBooleanExtra("isAutomaticMode", true)
            guideMode = intent.getStringExtra("guideMode") ?: "walking"
            transportPref = intent.getStringExtra("transportPref") ?: "auto"
            appLanguage = intent.getStringExtra("language") ?: "it"
            val oldCategories = selectedCategories.toSet()
            selectedCategories = intent.getStringArrayListExtra("categories") ?: emptyList()
            val newCategories = selectedCategories.toSet()

            // Range allineati a DISTANCE_CONFIG in src/lib/guideSettings.ts:
            // il GeoControl del profilo permette questi valori, il servizio
            // non deve restringerli ulteriormente.
            alertRadiusWalk = intent.getFloatExtra("alertRadiusWalk", 150f).coerceIn(50f, 400f)
            arrivalRadiusWalk = intent.getFloatExtra("arrivalRadiusWalk", 30f).coerceIn(15f, 100f)
            alertRadiusCar = intent.getFloatExtra("alertRadiusCar", 300f).coerceIn(100f, 600f)
            arrivalRadiusCar = intent.getFloatExtra("arrivalRadiusCar", 50f).coerceIn(20f, 150f)

            prefs.edit {
                putBoolean("isAutomaticMode", isAutomaticMode)
                putStringSet("selectedCategories", selectedCategories.toSet())
                putString("guideMode", guideMode)
                putString("transportPref", transportPref)
                putString("language", appLanguage)
                putFloat("alertRadiusWalk", alertRadiusWalk)
                putFloat("arrivalRadiusWalk", arrivalRadiusWalk)
                putFloat("alertRadiusCar", alertRadiusCar)
                putFloat("arrivalRadiusCar", arrivalRadiusCar)
            }

            // Se le categorie sono cambiate, forziamo un refresh immediato
            if (oldCategories.isNotEmpty() && oldCategories != newCategories) {
                Log.d(TAG, "Categories changed, forcing POI refresh...")
                lastQueryLocation = null
            }
        } else {
            // Riavvio senza payload (START_STICKY dopo kill, watchdog, boot):
            // senza questo restore il servizio ripartiva con categorie vuote,
            // lingua "it" e raggi di default.
            restoreSettingsFromPrefs(prefs)
        }

        val initialLat = intent?.getDoubleExtra("initialLat", 0.0) ?: 0.0
        val initialLon = intent?.getDoubleExtra("initialLon", 0.0) ?: 0.0

        if (initialLat != 0.0 && initialLon != 0.0) {
            val initialLoc = Location("initial").apply {
                latitude = initialLat
                longitude = initialLon
            }
            Log.d(TAG, "Starting with initial location from UI: $initialLat, $initialLon")
            checkRefreshGeofences(initialLoc)
        }

        // Mirror storico ascolti: scarica gli id già ascoltati dal cloud
        // (best-effort). Serve al check "già acquistato = gratis" del
        // receiver, che così funziona anche offline.
        serviceScope.launch {
            try {
                ListeningHistoryStore.syncFromCloud(this@ItaintaBackgroundPoiService)
            } catch (_: Exception) { /* best-effort */ }
            // Igiene cache prefetch MP3: via i file più vecchi di 24h
            AudioPrefetchManager.cleanup(this@ItaintaBackgroundPoiService)
        }

        startActiveMonitoring()
        return START_STICKY
    }

    /**
     * Passaggio piedi⇄auto autonomo (solo con preferenza 'auto'): a schermo
     * spento il JS non può rilanciare il servizio con la nuova modalità, quindi
     * i raggi restavano quelli dell'avvio (es. 150/30 a piedi anche a 90 km/h).
     * Isteresi: soglie separate (≥12 km/h auto, ≤6 km/h piedi) e 3 fix GPS
     * consecutivi prima di cambiare, per non sfarfallare al semaforo.
     * Al cambio si invalida lastQueryLocation: il prossimo update GPS rifà
     * fetch (raggio radar nuovo) e ri-registra i geofence coi raggi giusti.
     */
    private fun maybeSwitchTravelMode(location: Location) {
        if (transportPref != "auto") return
        if (!location.hasSpeed()) return
        // FLAG "FERMO": non fidarsi della velocità se il fix è di bassa qualità
        // (canyon urbano) — evita il falso passaggio ad "auto" da picchi di
        // velocità fantasma quando in realtà sei fermo o a piedi.
        if (Build.VERSION.SDK_INT >= 26 && location.hasSpeedAccuracy() &&
            location.speedAccuracyMetersPerSecond > 5f) { modeSwitchStreak = 0; return }
        val kmh = location.speed * 3.6f
        val target = when {
            kmh >= 12f -> "driving"
            kmh <= 6f -> "walking"
            else -> { modeSwitchStreak = 0; return }
        }
        if (target == guideMode) { modeSwitchStreak = 0; return }
        modeSwitchStreak++
        if (modeSwitchStreak < 3) return
        modeSwitchStreak = 0
        guideMode = target
        getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).edit { putString("guideMode", guideMode) }
        lastQueryLocation = null
        Log.d(TAG, "Travel mode switched to $guideMode (${kmh.toInt()} km/h)")
    }

    /** Ripristina le impostazioni salvate quando il servizio riparte senza extras. */
    private fun restoreSettingsFromPrefs(prefs: SharedPreferences) {
        isAutomaticMode = prefs.getBoolean("isAutomaticMode", true)
        guideMode = prefs.getString("guideMode", "walking") ?: "walking"
        transportPref = prefs.getString("transportPref", "auto") ?: "auto"
        appLanguage = prefs.getString("language", "it") ?: "it"
        selectedCategories = prefs.getStringSet("selectedCategories", emptySet())?.toList() ?: emptyList()
        alertRadiusWalk = prefs.getFloat("alertRadiusWalk", 150f)
        arrivalRadiusWalk = prefs.getFloat("arrivalRadiusWalk", 30f)
        alertRadiusCar = prefs.getFloat("alertRadiusCar", 300f)
        arrivalRadiusCar = prefs.getFloat("arrivalRadiusCar", 50f)
        Log.d(TAG, "Settings restored from prefs: lang=$appLanguage, cats=${selectedCategories.size}, mode=$guideMode")
    }

    private fun syncManualSelection(json: String) {
        serviceScope.launch {
            try {
                val type = object : com.google.gson.reflect.TypeToken<List<PoiEntity>>() {}.type
                val selectedPois: List<PoiEntity> = gson.fromJson(json, type)
                val prioritizedPois = selectedPois.map { it.copy(isFromItinerary = true) }

                currentPois = prioritizedPois
                RadarState.updatePois(prioritizedPois)

                db.poiDao().insertPois(prioritizedPois)
                // initialTrigger=true: se l'utente avvia l'itinerario già dentro il
                // raggio della prima tappa, il teaser parte subito.
                geofenceManager.registerGeofencesForPois(prioritizedPois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin = null, initialTrigger = true)
                updateNotificationAndStatus("Audioguida attiva", "${prioritizedPois.size} tappe itinerario caricate")
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed: ${e.message}")
            }
        }
    }

    private fun startActiveMonitoring() {
        // Snap-to-path: ripristina il tile strade persistito (offline) e imposta
        // la cartella cache. Best-effort, mai bloccante per l'avvio.
        RoadSnap.cacheDir = filesDir
        RoadSnap.loadCached()
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return

                if (lastQueryLocation == null && currentPois.isEmpty()) {
                    updateNotificationAndStatus("Audioguida attiva", "Posizione acquisita. Caricamento radar...")
                }

                RadarState.updateLocation(location)
                maybeSwitchTravelMode(location)
                // SNAP-TO-PATH (conservativo): raddrizza la posizione sul
                // marciapiede/strada più vicina; senza tile o strada vicina
                // resta il GPS grezzo. Il tile si scarica sullo stesso "cambio
                // area" dei POI, fuori dal main thread.
                if (RoadSnap.shouldRefresh(location.latitude, location.longitude)) {
                    serviceScope.launch(Dispatchers.IO) {
                        RoadSnap.refresh(location.latitude, location.longitude)
                    }
                }
                val evalLoc = RoadSnap.snap(location.latitude, location.longitude, location.accuracy, guideMode == "driving")
                    ?.let { Location(location).apply { latitude = it.first; longitude = it.second } }
                    ?: location
                // I geofence dell'OS restano come rete di sicurezza, ma il
                // trigger tempestivo nasce QUI: il servizio è già sveglio e
                // valuta il CPA a ogni fix, senza attendere che l'OS
                // consegni la transizione ENTER. La valutazione usa la posizione
                // snappata; il refresh area e la notifica usano il GPS grezzo.
                runPredictiveEvaluation(evalLoc)
                checkRefreshGeofences(location)
                updateDistanceNotification(location)
            }
        }

        try {
            // ✅ [OTTIMIZZAZIONE AVVIO] - Otteniamo subito l'ultima posizione nota
            // per far apparire i POI sul radar ISTANTANEAMENTE all'avvio.
            fusedClient.lastLocation.addOnSuccessListener { location ->
                if (location != null && lastQueryLocation == null) {
                    Log.d(TAG, "Instant location fix on start, fetching POIs...")
                    checkRefreshGeofences(location)
                }
            }
            applyLocationRate(armed = false)
        } catch (e: SecurityException) {
            Log.e(TAG, "Permissions missing")
        }
    }

    /**
     * Duty cycle a due livelli (Blocco 3).
     *
     * Prima il servizio campionava sempre a PRIORITY_HIGH_ACCURACY ogni 5 s,
     * anche in mezzo alla campagna senza un POI nel raggio di chilometri.
     * Ora:
     *   - ARMED (almeno un POI in rotta entro la finestra di attenzione):
     *     1 s, alta precisione — è la fase in cui la latenza costa;
     *   - IDLE: 20 s a potenza bilanciata, con batching fino a 60 s, così
     *     il modem GPS resta spento per lunghi tratti.
     *
     * Il cambio è idempotente: si ri-registra solo se il livello cambia
     * davvero, altrimenti a ogni fix si rifarebbe una requestLocationUpdates.
     */
    private fun applyLocationRate(armed: Boolean) {
        val cb = locationCallback ?: return
        val request = if (armed) {
            // Intervallo armato MODE-AWARE: in auto serve reattività (1 s); a piedi
            // 2 s dimezza il carico GNSS/CPU senza perdere trigger (a passo d'uomo
            // 2 s ≈ 3 m). Prima era 1 Hz pieno anche a piedi = il driver di calore #1.
            val armedIntervalMs = if (guideMode == "driving") 1000L else 2000L
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, armedIntervalMs)
                .setMinUpdateIntervalMillis(armedIntervalMs)
                .setWaitForAccurateLocation(true)
                .build()
        } else {
            val idle = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 20_000L)
                .setMinUpdateIntervalMillis(10_000L)
            // BATCHING SOLO A PIEDI: un batch fino a 60 s in auto significa che a
            // 100 km/h (~28 m/s) l'auto percorre ~1,7 km fra un fix e l'altro e
            // può attraversare un'intera zona di alert alla cieca. In "driving"
            // niente batching (i fix arrivano ~ogni 20 s); a piedi 60 s va bene
            // e tiene il modem GPS spento più a lungo.
            if (guideMode != "driving") idle.setMaxUpdateDelayMillis(60_000L)
            idle.build()
        }
        try {
            fusedClient.removeLocationUpdates(cb)
            fusedClient.requestLocationUpdates(request, cb, Looper.getMainLooper())
            Log.d(TAG, "Location rate → ${if (armed) "ARMED (1s, high accuracy)" else "IDLE (20s, balanced)"}")
        } catch (e: SecurityException) {
            Log.e(TAG, "Permissions missing on rate change")
        }
    }

    /**
     * Valutatore predittivo in-process (Blocchi 2 e 3).
     *
     * Fa tre cose che i geofence circolari dell'OS non possono fare:
     *   1. ANNUNCIA IN ANTICIPO — decide sul tempo al punto di massimo
     *      avvicinamento (t_cpa), non sull'attraversamento di un raggio,
     *      quindi non dipende dalla latenza di consegna della transizione;
     *   2. RILEVA IL SUPERAMENTO (PASSED) e ferma l'audio: prima la voce
     *      continuava a raccontare un monumento già alle spalle;
     *   3. REGOLA IL DUTY CYCLE in base a quanto è vicino il prossimo POI.
     */
    private fun runPredictiveEvaluation(location: Location) {
        if (currentPois.isEmpty()) return
        // GATE ACCURATEZZA (fail-closed): senza un fix RECENTE e PRECISO ogni
        // trigger è sospetto. Indoor/seminterrato la posizione di RETE ha
        // incertezza chilometrica e il predittore, valutando comunque, poteva
        // "annunciare" da fermo mezzo radar. Stesso guardiano del receiver
        // (GeofenceBroadcastReceiver.handleEnterTransitions:~596-604) e di iOS
        // (BackgroundPoiManager.swift:493-497).
        val maxAccuracyM = 100f
        val maxFixAgeMs = 2 * 60_000L
        if (!location.hasAccuracy() || location.accuracy <= 0f || location.accuracy > maxAccuracyM ||
            System.currentTimeMillis() - location.time > maxFixAgeMs) {
            return
        }
        if (!predictiveBusy.compareAndSet(false, true)) return

        val isDriving = guideMode == "driving"
        val alertRad = if (isDriving) alertRadiusCar else alertRadiusWalk
        val arrivalRad = if (isDriving) arrivalRadiusCar else arrivalRadiusWalk

        serviceScope.launch {
            try {
                // associateBy (non solo lo stato): serve updatedAt per il
                // cooldown di re-approach post-EXITED.
                val stateMap = db.poiDao().getAllTriggerStates().associateBy { it.poiId }
                var shouldArm = false
                // Anti-spam: in una piazza densa parla solo il primo.
                var spokenInBatch = false

                // Si valutano solo i candidati plausibili: oltre 3× il raggio
                // di alert il CPA non può cadere nella finestra di anticipo.
                val candidates = currentPois
                    .map { poi ->
                        val poiLoc = Location("").apply {
                            latitude = poi.entranceLat ?: poi.lat
                            longitude = poi.entranceLon ?: poi.lon
                        }
                        poi to location.distanceTo(poiLoc)
                    }
                    .filter { (_, d) -> d <= alertRad * 3f }
                    .sortedWith(
                        compareByDescending<Pair<PoiEntity, Float>> { it.first.isFromItinerary }
                            .thenByDescending { it.first.isGem }
                            .thenBy { it.second }
                    )
                    .take(MAX_PREDICTIVE_CANDIDATES)

                for ((poi, _) in candidates) {
                    if (!isPoiCategorySelected(poi)) continue

                    val pred = PredictiveTrigger.evaluate(
                        location = location,
                        poiLat = poi.entranceLat ?: poi.lat,
                        poiLon = poi.entranceLon ?: poi.lon,
                        radiusM = alertRad.toDouble(),
                        isDriving = isDriving
                    )
                    val stateEntity = stateMap[poi.id]
                    val state = stateEntity?.state ?: TriggerState.PENDING
                    val prevDist = lastDistances[poi.id]
                    val distNow = pred.distanceNowMeters.toFloat()

                    // Finestra di attenzione: se un POI è a meno di 90 s, si alza il rate.
                    if (!pred.tCpaSeconds.isNaN() && pred.tCpaSeconds > 0 && pred.tCpaSeconds <= ARM_WINDOW_S) {
                        shouldArm = true
                    } else if (distNow <= alertRad * 1.5f) {
                        shouldArm = true
                    }

                    when (state) {
                        // ── Superamento: si ferma la voce e si libera il POI ──
                        TriggerState.APPROACH_FIRED, TriggerState.ARRIVED_FIRED -> {
                            // Pavimento radiale per modalità: in auto basta
                            // uscire dal cerchio di arrivo (sorpasso netto);
                            // a piedi la voce vive finché resti nel raggio di
                            // alert — a 35 m dal centroide di un duomo sei
                            // ancora davanti al duomo.
                            val passFloor = if (isDriving) arrivalRad else alertRad
                            if (prevDist != null && distNow > arrivalRad &&
                                PredictiveTrigger.hasPassed(
                                    pred.tCpaSeconds, distNow.toDouble(), prevDist.toDouble(),
                                    passFloor.toDouble(),
                                    if (location.hasSpeed()) location.speed.toDouble() else 0.0
                                )
                            ) {
                                handlePassed(poi, pred, location, isDriving, alertRad)
                            }
                        }
                        // ── Approach proattivo: qui si recupera la latenza ──
                        TriggerState.PENDING -> {
                            if (pred.decision == PredictiveTrigger.Decision.FIRE) {
                                TriggerTelemetry.log(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    "approach-predictive", pred, location, isDriving, alertRad
                                )
                                GeofenceBroadcastReceiver.firePredictedApproach(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    poi.guideDefault, poi.isGem, poi.isFromItinerary, db,
                                    speak = !spokenInBatch
                                )
                                spokenInBatch = true
                            }
                        }
                        // ── Ri-approach dopo EXITED: solo passato il cooldown ──
                        // anti-rimbalzo (30 min). Prima l'uscita cancellava lo
                        // stato e il primo rientro ri-annunciava subito; ora
                        // EXITED col suo timestamp fa da cooldown (mirror iOS).
                        TriggerState.EXITED -> {
                            val exitedAge = stateEntity?.let { System.currentTimeMillis() - it.updatedAt } ?: Long.MAX_VALUE
                            if (exitedAge > GeofenceBroadcastReceiver.APPROACH_RETRIGGER_COOLDOWN_MS &&
                                pred.decision == PredictiveTrigger.Decision.FIRE) {
                                TriggerTelemetry.log(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    "approach-predictive", pred, location, isDriving, alertRad
                                )
                                GeofenceBroadcastReceiver.firePredictedApproach(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    poi.guideDefault, poi.isGem, poi.isFromItinerary, db,
                                    speak = !spokenInBatch
                                )
                                spokenInBatch = true
                            }
                        }
                        // Già superato: si attende che l'isteresi lo resetti.
                        TriggerState.PASSED -> { /* no-op */ }
                    }

                    lastDistances[poi.id] = distNow
                }

                if (shouldArm != isArmed) {
                    isArmed = shouldArm
                    withContext(Dispatchers.Main) { applyLocationRate(shouldArm) }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Predictive evaluation failed: ${e.message}")
            } finally {
                predictiveBusy.set(false)
            }
        }
    }

    /**
     * Il POI è stato superato: la voce che lo racconta non ha più senso.
     * Prima questo caso non esisteva — il geofence di uscita a 1.5×
     * resettava lo stato in silenzio, ma l'audio continuava.
     */
    private suspend fun handlePassed(
        poi: PoiEntity,
        pred: PredictiveTrigger.Result,
        location: Location,
        isDriving: Boolean,
        alertRad: Float
    ) {
        TriggerTelemetry.log(
            this, poi.id, poi.nome, "passed", pred, location, isDriving, alertRad
        )
        db.poiDao().updateTriggerState(TriggerStateEntity(poi.id, TriggerState.PASSED))
        // Silenzio chirurgico: si spegne solo la voce di QUESTO POI —
        // superare A mentre suona la guida di B non deve uccidere B.
        GeofenceBroadcastReceiver.stopSpeakingForPoi(this, poi.id)

        val intent = Intent("com.itaintasca.POI_EVENT")
        intent.putExtra("event", "poiPassed")
        intent.putExtra("poiId", poi.id)
        intent.putExtra("name", poi.nome)
        sendBroadcast(intent)
        Log.d(TAG, "PASSED ${poi.nome}: audio fermato, tappa liberata")
    }

    /**
     * Le categorie attive filtrano anche il percorso predittivo.
     * Delega a GeofenceBroadcastReceiver, dove vive CATEGORY_MAP: una
     * seconda copia della mappa qui si sarebbe disallineata al primo
     * cambio di categorie nella UI.
     */
    private fun isPoiCategorySelected(poi: PoiEntity): Boolean =
        GeofenceBroadcastReceiver.isCategoryActive(poi, selectedCategories)

    private fun showDiscoveryNotification(poi: PoiEntity) {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = "itainta://poi/${poi.id}".toUri()
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        val pOpen = PendingIntent.getActivity(this, poi.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        
        val builder = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("💎 Nuova Gemma Scoperta!")
            .setContentText("${poi.nome} è nelle vicinanze. Scoprila ora.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(pOpen)

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(poi.id.hashCode() + 1, builder.build())
    }

    private fun isAppInForeground(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND && appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    /** Invia un evento POI (poiArrived / poiApproaching) al BroadcastReceiver del Plugin Capacitor. */
    private fun sendPoiEvent(eventName: String, poiId: String, poiName: String, lat: Double? = null, lon: Double? = null, teaser: String? = null) {
        val intent = Intent("com.itaintasca.POI_EVENT")
        intent.setPackage(packageName)
        intent.putExtra("event", eventName)
        intent.putExtra("poiId", poiId)
        intent.putExtra("poiName", poiName)
        
        val dataObj = JSONObject()
        dataObj.put("poiId", poiId)
        dataObj.put("poiName", poiName)
        if (lat != null) dataObj.put("lat", lat)
        if (lon != null) dataObj.put("lon", lon)
        if (teaser != null) dataObj.put("teaser", teaser)
        
        intent.putExtra("data1", dataObj.toString())
        sendBroadcast(intent)
    }

    @Volatile private var lastDistanceNotifAt = 0L
    private fun updateDistanceNotification(location: Location) {
        if (currentPois.isEmpty()) return
        // La notifica di distanza è SOLO UI: non serve aggiornarla a 1-2 Hz.
        // Throttle a 5 s → taglia ~80% delle letture DB (getAllTriggerStates) e
        // delle ricostruzioni notifica per fix (driver batteria #2). Il predittore
        // (runPredictiveEvaluation) resta invece a piena frequenza per i trigger.
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastDistanceNotifAt < 5000L) return
        lastDistanceNotifAt = nowMs
        var closestPoi: PoiEntity? = null
        var closestDist = Float.MAX_VALUE
        
        // Cerca i POI in avvicinamento per inviare update di distanza al JS
        val approachingPoisArray = JSONArray()



        // [OTTIMIZZAZIONE] Leggiamo gli stati attivi dal DB per sincronizzarci con il Geofencing nativo
        serviceScope.launch {
            val activeStates = db.poiDao().getAllTriggerStates()
            val stateMap = activeStates.associate { it.poiId to it.state }

            for (poi in currentPois) {
                val poiLoc = Location("").apply { latitude = poi.entranceLat ?: poi.lat; longitude = poi.entranceLon ?: poi.lon }
                val dist = location.distanceTo(poiLoc)
                if (dist < closestDist) { closestDist = dist; closestPoi = poi }
                
                // Se questo POI ha generato un APPROACH_FIRED (da GeofenceReceiver) 
                // e siamo ancora nella zona di alert (con un po' di margine)
                val alertRad = if (guideMode == "driving") alertRadiusCar else alertRadiusWalk
                if (stateMap[poi.id] == TriggerState.APPROACH_FIRED && dist <= alertRad * 2.0f) {
                    val distRounded = Math.round(dist)
                    val poiObj = JSONObject()
                    poiObj.put("poiId", poi.id)
                    poiObj.put("name", poi.nome)
                    poiObj.put("distance", distRounded)
                    poiObj.put("lat", poi.lat)
                    poiObj.put("lon", poi.lon)
                    approachingPoisArray.put(poiObj)
                }
            }
            
            // Invia update distanze multiple al JS per aggiornare i banner in tempo reale
            if (approachingPoisArray.length() > 0) {
                val dataObj = JSONObject()
                dataObj.put("entries", approachingPoisArray)
                val intent = Intent("com.itaintasca.POI_EVENT")
                intent.putExtra("event", "wip-poi-distance-update")
                intent.putExtra("data1", dataObj.toString())
                sendBroadcast(intent)
            }

            closestPoi?.let { poi ->
                val distRounded = Math.round(closestDist / 10f) * 10
                val statusText = if (closestDist < 150) "Prossimo: ${poi.nome} (${distRounded}m)" else "${currentPois.size} luoghi monitorati"
                updateNotificationAndStatus("Audioguida attiva", statusText)
            }
        }
    }

    /**
     * Cuore dell'aggiornamento POI "in movimento": ogni volta che l'utente si
     * sposta oltre la soglia dal punto dell'ultimo caricamento riuscito, il
     * servizio riscarica autonomamente i POI da Supabase e ri-registra i
     * geofence — anche a schermo spento e con la WebView in freeze (Doze),
     * perché gira interamente nel Foreground Service nativo.
     */
    private fun checkRefreshGeofences(location: Location) {
        val last = lastQueryLocation
        // Soglia di refresh e raggio ADATTIVI: a piedi 200m/5km bastano; in auto a
        // 100+ km/h 5km sono ~3 minuti di strada, quindi 1km di soglia e 10km di raggio.
        val isDriving = guideMode == "driving"
        val refreshThreshold = if (isDriving) 1000f else 200f
        val radiusKm = if (isDriving) 10.0 else 5.0
        if (last != null && last.distanceTo(location) <= refreshThreshold) return

        // Un solo fetch alla volta; dopo un errore aspettiamo il backoff prima
        // di riprovare (lastQueryLocation resta invariato, quindi il retry è
        // garantito al prossimo update GPS utile).
        if (System.currentTimeMillis() - lastFetchFailedAt < FETCH_RETRY_BACKOFF_MS) return
        if (!isFetching.compareAndSet(false, true)) return

        updateNotificationAndStatus("Audioguida attiva", "Ricerca POI in corso...")
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Itainta::FetchWL")
        wl.acquire(30000L)
        serviceScope.launch {
                try {
                    // OFFLINE-FIRST: senza rete validata non tentiamo nemmeno il
                    // fetch (timeout inutili), andiamo dritti al pacchetto offline.
                    // Prima di questo fallback il servizio offline restava CONGELATO
                    // all'ultimo fetch riuscito: i geofence non venivano mai
                    // ri-registrati durante lo spostamento.
                    if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(this@ItaintaBackgroundPoiService)) {
                        if (!refreshFromOfflineDb(location)) {
                            lastFetchFailedAt = System.currentTimeMillis()
                        }
                        return@launch
                    }

                    val rawPois = supabase.fetchPoisNearby(location.latitude, location.longitude, radiusKm, selectedCategories, appLanguage)

                    // ✅ [DE-DUPLICAZIONE NATIVA] - Allineamento con App.tsx
                    val seenNames = mutableSetOf<String>()
                    val seenCoords = mutableSetOf<String>()
                    val pois = rawPois.filter { p ->
                        val keyName = p.nome.lowercase().trim()
                        val keyCoord = String.format("%.4f_%.4f", p.lat, p.lon)
                        val isNew = !seenNames.contains(keyName) && !seenCoords.contains(keyCoord)
                        if (isNew) {
                            if (keyName.isNotEmpty()) seenNames.add(keyName)
                            seenCoords.add(keyCoord)
                        }
                        isNew
                    }

                    lastQueryLocation = location
                    lastFetchFailedAt = 0L
                    if (pois.isNotEmpty()) {
                        // Il trigger iniziale (ENTER se già dentro il raggio) va armato solo
                        // alla PRIMA registrazione dopo l'avvio, non a ogni refresh del radar.
                        // E SOLO con un fix affidabile: indoor/seminterrato la posizione di
                        // rete può avere incertezza di km e l'OS dichiarerebbe ENTER su
                        // tutti i geofence del radar in un colpo solo.
                        val isFirstRegistration = currentPois.isEmpty() &&
                            location.hasAccuracy() && location.accuracy <= 100f
                        db.poiDao().insertPois(pois)
                        currentPois = pois
                        RadarState.updatePois(pois)

                        Log.d(TAG, "Fetched ${pois.size} nearby POIs (after deduplication). Selected categories: $selectedCategories")

                        geofenceManager.registerGeofencesForPois(pois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin = location, initialTrigger = isFirstRegistration)

                        // Bonifica stati incoerenti: dopo un falso ENTER (fix
                        // impreciso / teleport GPS) i POI restavano APPROACH o
                        // ARRIVED anche a km di distanza e l'app continuava a
                        // segnalarli come "in visita". Se il POI è molto oltre
                        // il raggio di alert, lo stato torna PENDING.
                        try {
                            val cleanupAlertRad = if (isDriving) alertRadiusCar else alertRadiusWalk
                            for (p in pois) {
                                db.poiDao().getTriggerState(p.id) ?: continue
                                val poiLoc = Location("").apply {
                                    latitude = p.entranceLat ?: p.lat
                                    longitude = p.entranceLon ?: p.lon
                                }
                                if (location.distanceTo(poiLoc) > cleanupAlertRad * 3f) {
                                    db.poiDao().deleteTriggerState(p.id)
                                    Log.d(TAG, "Trigger state resettato per ${p.nome}: distanza reale ${location.distanceTo(poiLoc).toInt()}m")
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Trigger state cleanup failed: ${e.message}")
                        }
                        updateNotificationAndStatus("Audioguida attiva", "${pois.size} luoghi monitorati")
                        sendEventToPlugin("poisDownloaded", gson.toJson(pois))
                        
                        // ✅ [SCOPERTA GEMME] - Se troviamo una gemma vicina mai vista, inviamo notifica specifica
                        val newGems = pois.filter { it.isGem }
                        if (newGems.isNotEmpty() && !isAppInForeground()) {
                            val closestGem = newGems.minByOrNull { 
                                val poiLoc = Location("").apply { latitude = it.lat; longitude = it.lon }
                                location.distanceTo(poiLoc)
                            }
                            if (closestGem != null) {
                                showDiscoveryNotification(closestGem)
                            }
                        }

                        // ✅ [BATCH TEASER] - Richiedi la generazione dei teaser mancanti per i POI scaricati
                        // Questo popola Supabase per i prossimi utenti e prepara il database locale
                        generateTeasersInBackground(pois.map { it.id })

                        // ✅ [TEASER RADAR] - Avvisi teaser per i POI nel radar
                        // che l'utente non ha ancora avvicinato
                        showRadarTeaserNotifications(pois, location)
                    }
                } catch (e: Exception) {
                    // Rete "zombie" (validata ma inservibile) o server giù:
                    // prova comunque il pacchetto offline prima di arrendersi.
                    Log.e(TAG, "Fetch error: ${e.message}")
                    if (!refreshFromOfflineDb(location)) {
                        // lastQueryLocation NON viene aggiornato: al prossimo update
                        // GPS (dopo il backoff) il fetch riparte dallo stesso punto.
                        lastFetchFailedAt = System.currentTimeMillis()
                    }
                } finally {
                    isFetching.set(false)
                    if (wl.isHeld) wl.release()
                }
        }
    }

    /**
     * MODALITÀ OFFLINE: radar e sliding window alimentati dai pacchetti area in
     * Room (query R-tree, mai full scan). Attivazione zero-click: qualunque
     * pacchetto contenga la posizione corrente contribuisce, senza selezione
     * manuale. I POI selezionati vengono copiati in poi_cache così il
     * GeofenceBroadcastReceiver funziona identico al flusso online.
     */
    private suspend fun refreshFromOfflineDb(location: Location): Boolean {
        return try {
            // Raggio finestra: ~2 km attorno alla posizione (requisito sliding
            // window), più largo in auto per non rifare la query in continuazione.
            val windowRadiusM = if (guideMode == "driving") 5000.0 else 2000.0
            val rows = db.offlineDao().queryPoisRaw(
                com.itaintasca.app.db.OfflineRtree.bboxQuery(location.latitude, location.longitude, windowRadiusM)
            )
            if (rows.isEmpty()) return false

            val filtered = rows.filter { isOfflineCategoryActive(it) }
            // Stessa dedup nome+coordinate del percorso online
            val seenNames = mutableSetOf<String>()
            val seenCoords = mutableSetOf<String>()
            val pois = filtered.map { it.toPoiEntity() }.filter { p ->
                val keyName = p.nome.lowercase().trim()
                val keyCoord = String.format("%.4f_%.4f", p.lat, p.lon)
                val isNew = !seenNames.contains(keyName) && !seenCoords.contains(keyCoord)
                if (isNew) {
                    if (keyName.isNotEmpty()) seenNames.add(keyName)
                    seenCoords.add(keyCoord)
                }
                isNew
            }
            if (pois.isEmpty()) return false

            val isFirstRegistration = currentPois.isEmpty() &&
                location.hasAccuracy() && location.accuracy <= 100f
            lastQueryLocation = location
            lastFetchFailedAt = 0L
            db.poiDao().insertPois(pois)
            currentPois = pois
            RadarState.updatePois(pois)

            geofenceManager.registerGeofencesForPois(pois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin = location, initialTrigger = isFirstRegistration)

            updateNotificationAndStatus("Audioguida attiva (offline)", "${pois.size} luoghi dal pacchetto offline")
            sendEventToPlugin("poisDownloaded", gson.toJson(pois))
            Log.d(TAG, "Offline window: ${pois.size} POIs from local packages")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Offline refresh failed: ${e.message}")
            false
        }
    }

    /** Filtro categorie offline: stessa semantica di SupabaseClient.parsePoiList. */
    private fun isOfflineCategoryActive(p: com.itaintasca.app.db.OfflinePoiEntity): Boolean {
        if (p.isGem) return true
        val cat = (p.poiType ?: p.category ?: "").lowercase()
        if (selectedCategories.isEmpty()) {
            // Default "insieme vuoto" allineato al web (useGeofencing.ts):
            // { monumenti, musei, chiese } attivi, panorami OFF. Prima il nativo
            // includeva viewpoint/park/panorami di default (divergenza dal web).
            val culturalCats = listOf(
                "monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti",
                "museum", "gallery", "musei", "church", "place_of_worship", "cathedral",
                "chiese"
            )
            return culturalCats.contains(cat)
        }
        if (selectedCategories.contains(cat)) return true
        return selectedCategories.any {
            com.itaintasca.app.geofence.GeofenceBroadcastReceiver.CATEGORY_MAP[it]?.contains(cat) == true
        }
    }

    /**
     * Teaser per i POI presenti nel radar ma non ancora avvicinati: notifica
     * con il testo del teaser per i 2 POI più vicini oltre il raggio di alert
     * (di quelli dentro il raggio si occupano già i geofence). Ogni POI viene
     * segnalato una sola volta, il set dei notificati è persistito in prefs.
     */
    private fun showRadarTeaserNotifications(pois: List<PoiEntity>, location: Location) {
        serviceScope.launch {
            try {
                val prefs = getSharedPreferences("ItaintaPrefs", MODE_PRIVATE)
                val notified = prefs.getStringSet("radarTeaserNotified", emptySet())?.toMutableSet() ?: mutableSetOf()
                val alertRad = if (guideMode == "driving") alertRadiusCar else alertRadiusWalk
                // Orizzonte utile: il fetch arriva a 5-10 km, ma a piedi un
                // teaser per un POI a 4 km è rumore. 1,2 km ≈ 15 min a piedi.
                val teaserHorizonM = if (guideMode == "driving") 5000f else 1200f
                val candidates = pois
                    .filter { !it.teaserText.isNullOrBlank() && it.id !in notified }
                    .filter { db.poiDao().getTriggerState(it.id) == null }
                    .map { poi ->
                        val poiLoc = Location("").apply {
                            latitude = poi.entranceLat ?: poi.lat
                            longitude = poi.entranceLon ?: poi.lon
                        }
                        poi to location.distanceTo(poiLoc)
                    }
                    .filter { (_, dist) -> dist > alertRad && dist <= teaserHorizonM }
                    .sortedBy { (_, dist) -> dist }
                    .take(2)

                candidates.forEach { (poi, dist) ->
                    notified.add(poi.id)
                    showTeaserNotification(poi, dist.toInt())
                }
                if (candidates.isNotEmpty()) {
                    prefs.edit { putStringSet("radarTeaserNotified", notified) }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Radar teaser notify failed: ${e.message}")
            }
        }
    }

    private fun showTeaserNotification(poi: PoiEntity, distanceM: Int) {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = "itainta://poi/${poi.id}".toUri()
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        val pOpen = PendingIntent.getActivity(this, poi.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val builder = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("📍 ${poi.nome} • ${distanceM}m da te")
            .setContentText(poi.teaserText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(poi.teaserText))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setContentIntent(pOpen)

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify("teaser_${poi.id}".hashCode(), builder.build())
    }

    private fun generateTeasersInBackground(poiIds: List<String>) {
        serviceScope.launch {
            try {
                val client = OkHttpClient()
                val body = JSONObject().apply {
                    put("poiIds", JSONArray(poiIds))
                    put("lang", appLanguage)
                }.toString().toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url("https://wip.guide/api/poi/batch-teaser")
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        Log.d(TAG, "Batch teaser generation requested successfully")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Batch teaser failed: ${e.message}")
            }
        }
    }

    /**
     * Con Day Pass attivo la notifica persistente mostra le guide rimaste
     * (es. "🎫 Pass: 28/40"): la notifica viene già aggiornata a ogni
     * movimento, quindi il contatore resta fresco anche dopo gli ascolti
     * fatti in background a schermo spento.
     */
    private fun dayPassSuffix(): String {
        val prefs = getSharedPreferences("ItaintaPrefs", MODE_PRIVATE)
        val used = prefs.getInt("daypass_used", 0)
        val cap = prefs.getInt("daypass_cap", 0)
        val active = com.itaintasca.app.offline.BillingLogic.isPassActive(
            System.currentTimeMillis(), prefs.getLong("daypass_expires_at", 0L), used, cap
        )
        return if (active) "  ·  🎫 Pass: ${cap - used}/$cap" else ""
    }

    private fun buildNotification(title: String, text: String): Notification {
        val stopIntent = Intent(this, ItaintaBackgroundPoiService::class.java).apply { action = ACTION_STOP }
        val pStop = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE)
        val pOpen = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(text + dayPassSuffix())
            .setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).setContentIntent(pOpen)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", pStop).build()
    }

    private fun updateNotificationAndStatus(title: String, text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(title, text))
        RadarState.updateStatus(text)
        sendEventToPlugin("statusUpdate", text)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            
            val chan = NotificationChannel(CHANNEL_ID, "Audioguida Background", NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(chan)

            val alertChan = NotificationChannel(ALERT_CHANNEL_ID, "Avvisi Arrivo POI", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notifiche quando arrivi vicino a un punto di interesse"
                enableLights(true)
                enableVibration(true)
            }
            nm.createNotificationChannel(alertChan)
        }
    }

    private fun sendEventToPlugin(event: String, data1: String) {
        val intent = Intent("com.itaintasca.POI_EVENT")
        intent.setPackage(packageName)
        intent.putExtra("event", event)
        intent.putExtra("data1", data1)
        sendBroadcast(intent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // Pulizia rigorosa per evitare memory leaks
        serviceScope.cancel()
        locationCallback?.let {
            try {
                fusedClient.removeLocationUpdates(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error removing location updates: ${e.message}")
            }
        }
        locationCallback = null

        geofenceManager.removeAllGeofences()

        // Suggerimento al GC e rilascio risorse pesanti
        currentPois = emptyList()
        RadarState.setActive(false)

        super.onDestroy()
        Log.d(TAG, "Service destroyed and resources cleared")
    }
}
