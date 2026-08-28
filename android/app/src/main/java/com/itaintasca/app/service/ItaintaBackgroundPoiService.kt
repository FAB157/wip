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
import com.itaintasca.app.geofence.ActivityMonitor
import com.itaintasca.app.geofence.ArrivalWorker
import com.itaintasca.app.geofence.BearingGate
import com.itaintasca.app.geofence.CategoryMap
import com.itaintasca.app.geofence.Footprints
import com.itaintasca.app.geofence.GeofenceBroadcastReceiver
import com.itaintasca.app.geofence.GeofenceManager
import com.itaintasca.app.geofence.PredictiveTrigger
import com.itaintasca.app.geofence.RaggiFiducia
import com.itaintasca.app.geofence.RoadSnap
import com.itaintasca.app.geofence.TriggerTelemetry
import com.itaintasca.app.widget.WipWidgetProvider
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
        // (28/08/2026) FINE DEL GIRO: via le tappe d'itinerario, il servizio
        // resta acceso col solo radar. Serve un'azione distinta da
        // ACTION_SYNC_SELECTION con lista vuota perche' quella, se il radar in
        // memoria e' vuoto, non ri-registra niente e i recinti delle tappe
        // restano quelli gia' consegnati al sistema.
        const val ACTION_CLEAR_SELECTION = "com.itaintasca.app.CLEAR_SELECTION"
        // (MAP-04) Dal receiver su GEOFENCE_NOT_AVAILABLE: azzera i recinti
        // in memoria e forza la ri-registrazione completa al prossimo fix.
        const val ACTION_REFRESH_GEOFENCES = "com.itaintasca.app.REFRESH_GEOFENCES"
        // (AUD-14) Azioni della notifica sulla SOLA coda vocale nativa
        // (teaser / guida del Day Pass): non toccano il servizio.
        const val ACTION_SPEECH_PAUSE = "com.itaintasca.app.SPEECH_PAUSE"
        const val ACTION_SPEECH_RESUME = "com.itaintasca.app.SPEECH_RESUME"
        const val ACTION_SPEECH_SKIP = "com.itaintasca.app.SPEECH_SKIP"
        // (28/08/2026) CRUSCOTTO DEL NAVIGATORE sulla notifica persistente:
        // il JS manda titolo/corpo della tappa corrente (gli stessi del
        // cruscotto in app) e la notifica del foreground service — che non si
        // puo' scartare — li mostra al posto del testo del radar. Non nasce
        // MAI una seconda notifica: il banner "fisso" e' questa.
        const val ACTION_NAV_BANNER = "com.itaintasca.app.NAV_BANNER"
        // Notifica normale (non FGS) «permesso posizione negato».
        const val NOTIF_ID_PERMISSION = 4005

        /**
         * (AUD-14) Hook in-process invocato dal GeofenceBroadcastReceiver
         * quando la voce parte/finisce/va in pausa: il servizio ricostruisce
         * la notifica con i tasti Pausa/Riprendi/Salta senza aspettare il
         * refresh periodico. null quando il servizio non e' vivo.
         */
        @Volatile var onVoiceStateChanged: (() -> Unit)? = null
        // Heartbeat letto da ServiceWatchdog: aggiornato a ogni fix GPS
        // processato, così il watchdog riavvia solo un servizio davvero
        // bloccato invece di farlo ciecamente ogni 15 min.
        const val PREF_LAST_HEARTBEAT = "lastHeartbeatAt"
        /**
         * File di preferenze DEDICATO ai tre valori scritti a ogni fix GPS
         * (heartbeat, lastFixLat, lastFixLon).
         *
         * Perche' separato da "ItaintaPrefs" (23/08/2026): SharedPreferences
         * riscrive l'INTERO file a ogni commit, e in ItaintaPrefs stanno anche
         * `listened_poi_ids` (senza limite di crescita) e `itineraryPoisJson`.
         * Tenere l'heartbeat li' voleva dire riscrivere 50-200 KB circa 3.600
         * volte l'ora, sul percorso piu' caldo dell'app.
         *
         * CHI LEGGE deve provare PRIMA questo file e POI ricadere su
         * "ItaintaPrefs" (ServiceWatchdog, WipWidgetProvider): al primo avvio
         * dopo l'aggiornamento i valori vecchi stanno ancora la', e senza
         * ripiego il watchdog vedrebbe heartbeat 0 (riavvio inutile del
         * servizio) e il widget resterebbe cieco fino al primo fix.
         */
        const val PREFS_FIX = "ItaintaFixPrefs"
        // Il filtro categorie (CategoryMap) vive in geofence/CategoryMap.kt,
        // condiviso da GeofenceBroadcastReceiver e SupabaseClient.

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

        // ── Soglie di accuratezza del fix (23/08/2026) ──
        /** «Sono nei paraggi»: soglia larga, usata per armare il GPS, per la
         *  notifica di distanza e per rilevare il superamento. Un errore di
         *  80 m non cambia nessuna di queste risposte. Stessa soglia del
         *  receiver (GeofenceBroadcastReceiver) e di iOS. */
        const val ACCURACY_NEARBY_M = 100f

        /** «Adesso parlo»: soglia stretta, allineata al web (50 m nella catena
         *  geofencing della SPA). Sotto i 50 m l'incertezza del fix diventa
         *  finalmente più piccola del raggio di arrivo che stiamo valutando
         *  (30 m a piedi, 50 m in auto): è la soglia che evita di annunciare il
         *  palazzo di fronte o il lato sbagliato della strada. */
        const val ACCURACY_TRIGGER_M = 50f
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var db: PoiDatabase
    private lateinit var geofenceManager: GeofenceManager
    private val supabase = SupabaseClient()
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val gson = Gson()
    
    private var lastQueryLocation: Location? = null
    private var currentPois: List<PoiEntity> = emptyList()

    // (22/08/2026) Tappe dell'itinerario, SEPARATE dal radar. Prima vivevano
    // solo dentro currentPois, e checkRefreshGeofences faceva
    // `currentPois = pois` (solo radar) + full/diff register sul solo radar:
    // al primo refresh (200 m a piedi) i geofence delle tappe sparivano.
    // Ora ogni registrazione fonde SEMPRE radar + itineraryPois
    // (mergeWithItinerary), in entrambi i percorsi (online e offline).
    // Persistite in prefs (JSON) per sopravvivere ai riavvii STICKY/watchdog;
    // svuotate quando il JS sincronizza una selezione vuota.
    @Volatile private var itineraryPois: List<PoiEntity> = emptyList()
    private val PREF_ITINERARY_POIS = "itineraryPoisJson"

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
    // (23/08/2026) Sotto-livello dell'ARMATO: `true` quando il POI candidato è
    // ormai a portata di mano (entro 2× il raggio di arrivo, cioè ~60 m a piedi
    // e ~100 m in auto). È lì che l'errore di 20-30 m decide fra "il palazzo" e
    // "il palazzo di fronte", quindi solo lì si chiede al fornitore il fix più
    // caro possibile. Non tocca mai lo stato a RIPOSO.
    @Volatile private var isFine = false
    // Guard: un solo giro di valutazione alla volta (i fix possono
    // sovrapporsi alle query su Room).
    private val predictiveBusy = java.util.concurrent.atomic.AtomicBoolean(false)

    // (23/08/2026) Ultima lettura di getAllTriggerStates(), col suo istante.
    // Il valutatore predittivo la legge a ogni fix e la notifica di distanza
    // la rileggeva da capo un istante dopo, per gli stessi POI: due scansioni
    // della stessa tabella nello stesso secondo. La notifica ora riusa questa
    // copia SOLO se e' fresca di meno di 2 s — cioe' quando il predittore ha
    // appena girato (finestra armata, 1-2 s); a riposo, o se il predittore e'
    // uscito prima per fix impreciso, rilegge dal DB esattamente come prima.
    @Volatile private var statiTriggerCache: Map<String, TriggerStateEntity> = emptyMap()
    @Volatile private var statiTriggerCacheAt = 0L
    private val STATI_CACHE_MAX_ETA_MS = 2000L

    // ── Gate anti-teletrasporto GPS (fusione GPS + Activity Recognition) ──
    // Ultimo fix ACCETTATO e fix "sospetto" in attesa di conferma: fermo da
    // >5 min (STILL) + salto >100 m = quasi certamente rumore GPS, non un
    // vero spostamento. Vedi isGpsTeleport().
    private var lastAcceptedFix: Location? = null
    private var suspectFix: Location? = null

    override fun onCreate() {
        super.onCreate()
        db = PoiDatabase.getInstance(this)
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        geofenceManager = GeofenceManager(this)
        createNotificationChannel()
        // Fusione GPS + movimento (fail-safe: senza permesso/Play Services non
        // fa nulla e il comportamento resta identico a prima).
        ActivityMonitor.start(this)
        // «Salute del viaggio»: baseline del contapassi appena il service
        // nasce (fail-safe: senza permesso/sensore non fa nulla).
        StepTracker.record(this)
        // (AUD-14) La voce nativa avvisa qui quando parte/finisce: si
        // ricostruisce la notifica con/senza i tasti della coda vocale.
        onVoiceStateChanged = { refreshNotificationForVoice() }
    }

    /**
     * (MAP-01) Il permesso posizione e' stato REVOCATO (o mai concesso) con
     * l'audioguida "attiva": prima i catch di SecurityException loggavano e
     * basta, isServiceActive restava true (il plugin lo scrive PRIMA
     * dell'avvio) e il watchdog riarmava un servizio che non poteva fare
     * niente, ogni 15 minuti, per sempre. Ora si spegne tutto in modo
     * coerente e si dice all'utente cosa fare, sia nell'app (statusUpdate)
     * sia con una notifica normale (non FGS) che porta alle Impostazioni.
     */
    private fun onLocationPermissionLost() {
        val msg = "⚠️ Permesso posizione negato: riattiva la posizione nelle Impostazioni"
        Log.e(TAG, "Permesso posizione assente: servizio disattivato")
        try {
            getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).edit { putBoolean("isServiceActive", false) }
            ServiceWatchdog.cancel(this)
            RadarState.setActive(false)
            RadarState.updateStatus(msg)
            sendEventToPlugin("statusUpdate", msg)
            showPermissionLostNotification(msg)
        } catch (e: Exception) {
            Log.w(TAG, "Spegnimento per permesso negato: ${e.message}")
        }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) { }
        stopSelf()
    }

    private fun showPermissionLostNotification(msg: String) {
        try {
            val settings = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = "package:$packageName".toUri()
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pOpen = PendingIntent.getActivity(
                this, NOTIF_ID_PERMISSION, settings,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val n = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Audioguida disattivata")
                .setContentText(msg)
                .setStyle(NotificationCompat.BigTextStyle().bigText(msg))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pOpen)
                .build()
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID_PERMISSION, n)
        } catch (e: Exception) {
            Log.w(TAG, "Notifica permesso negato non mostrata: ${e.message}")
        }
    }

    private fun hasPermission(permission: String): Boolean =
        androidx.core.content.ContextCompat.checkSelfPermission(this, permission) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("ItaintaPrefs", MODE_PRIVATE)
        val isReallyActive = prefs.getBoolean("isServiceActive", false)

        // (MAP-01) PRIMA di startForeground: senza NESSUN permesso posizione
        // un FGS di tipo location e' inutile (e da Android 14 startForeground
        // stesso lancia SecurityException). Si degrada subito, senza retry.
        val fineOk = hasPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
        val coarseOk = hasPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
        if (!fineOk && !coarseOk) {
            onLocationPermissionLost()
            return START_NOT_STICKY
        }

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
            // Non ci si arrende in silenzio se l'audioguida dovrebbe essere
            // attiva: si pianifica un retry con backoff esponenziale (30 s,
            // 1, 2, 5, 15 min, max 6 tentativi — vedi
            // ServiceWatchdog.scheduleRetry) su una catena SEPARATA da quella
            // dei 15 min — la restrizione è spesso temporanea (si risolve
            // quando l'utente riapre l'app).
            if (isReallyActive) {
                ServiceWatchdog.scheduleRetry(this)
            }
            stopSelf()
            return START_NOT_STICKY
        }
        // startForeground riuscito: azzera il contatore del backoff e
        // cancella un eventuale retry ancora armato.
        ServiceWatchdog.resetRetry(this)

        // (MAP-08) Solo posizione approssimativa: il servizio gira ma con
        // fix da 1-3 km non puo' distinguere due lati di una piazza. Lo si
        // dice subito, in notifica e nell'app.
        if (coarseOk && !fineOk) {
            updateNotificationAndStatus("Audioguida limitata", "Concedi la posizione precisa nelle Impostazioni")
        }

        if (intent == null && !isReallyActive) {
            stopSelf()
            return START_NOT_STICKY
        }

        // (MAP-03) Sync delle tappe a servizio NON attivo: non lo si tiene
        // acceso per questo. startForeground e' gia' stato chiamato sopra
        // perche' l'avvio puo' essere arrivato con startForegroundService
        // (obbligo di promozione), ma qui si salva solo la selezione, si
        // toglie la notifica e ci si spegne. Il plugin, da parte sua, non
        // avvia piu' il servizio in questo caso: salva le prefs e basta.
        // ACTION_CLEAR_SELECTION arriva senza extra "poisJson": cade su "[]",
        // che qui vuol dire esattamente «togli le tappe dalle prefs».
        if ((intent?.action == ACTION_SYNC_SELECTION || intent?.action == ACTION_CLEAR_SELECTION) && !isReallyActive) {
            val jsonPois = intent.getStringExtra("poisJson") ?: "[]"
            try {
                val type = object : com.google.gson.reflect.TypeToken<List<PoiEntity>>() {}.type
                val selected: List<PoiEntity> = gson.fromJson(jsonPois, type) ?: emptyList()
                prefs.edit {
                    if (selected.isEmpty()) remove(PREF_ITINERARY_POIS)
                    else putString(PREF_ITINERARY_POIS, gson.toJson(selected.map { it.copy(isFromItinerary = true) }))
                }
            } catch (e: Exception) {
                Log.w(TAG, "Salvataggio tappe a servizio inattivo fallito: ${e.message}")
            }
            try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) { }
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_STOP) {
            // (22/08/2026) radarTeaserNotified cresceva per sempre: senza reset
            // allo stop un POI notificato una volta non tornava mai nei teaser
            // radar, nemmeno in un viaggio successivo mesi dopo.
            prefs.edit {
                putBoolean("isServiceActive", false)
                remove("radarTeaserNotified")
                // Le tappe persistite non devono sopravvivere a uno stop
                // esplicito: al prossimo avvio il JS le risincronizza.
                remove(PREF_ITINERARY_POIS)
            }
            itineraryPois = emptyList()
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

        // (MAP-04) Il sistema ha perso i recinti (GEOFENCE_NOT_AVAILABLE):
        // removeAllGeofences azzera registeredPoiIds/firma/sentinella, e con
        // lastQueryLocation = null il prossimo fix rifa' fetch + full register.
        if (intent?.action == ACTION_REFRESH_GEOFENCES) {
            Log.w(TAG, "Geofence non disponibili: azzero e ri-registro al prossimo fix")
            if (selectedCategories.isEmpty() && currentPois.isEmpty()) restoreSettingsFromPrefs(prefs)
            geofenceManager.removeAllGeofences()
            lastQueryLocation = null
            if (locationCallback == null) startActiveMonitoring()
            return START_STICKY
        }

        // (28/08/2026) FINE DEL GIRO «Dieci Tappe»: le tappe escono dal
        // geofencing e il loro posto nella finestra scorrevole (100 recinti in
        // tutto) torna ai POI del radar. Il servizio NON si spegne: l'audioguida
        // puo' benissimo restare accesa dopo la fine del giro.
        // Si azzerano i recinti e lastQueryLocation come in ACTION_REFRESH_GEOFENCES,
        // cosi' il prossimo fix rifa' fetch + registrazione completa dal solo radar:
        // una ri-registrazione "differenziale" col radar in memoria non basterebbe
        // (se currentPois e' vuoto non registrerebbe nulla e i recinti delle tappe
        // resterebbero consegnati al sistema).
        if (intent?.action == ACTION_CLEAR_SELECTION) {
            Log.d(TAG, "Fine giro: tolgo le tappe itinerario dal geofencing")
            // restoreSettingsFromPrefs PRIMA della pulizia: ripristina anche le
            // tappe da prefs (restoreItineraryFromPrefs), che subito dopo
            // vengono buttate insieme a quelle in memoria.
            if (selectedCategories.isEmpty() && currentPois.isEmpty()) restoreSettingsFromPrefs(prefs)
            itineraryPois = emptyList()
            prefs.edit { remove(PREF_ITINERARY_POIS) }
            currentPois = currentPois.filter { !it.isFromItinerary }
            RadarState.updatePois(currentPois)
            geofenceManager.removeAllGeofences()
            lastQueryLocation = null
            if (locationCallback == null) startActiveMonitoring()
            updateNotificationAndStatus("Audioguida attiva", "Giro concluso: resta il radar")
            return START_STICKY
        }

        // (28/08/2026) BANNER DEL NAVIGATORE: aggiorna SOLO il testo della
        // notifica persistente, niente altro. Arriva a ogni cambio di tappa o
        // di svolta (mai a ogni fix GPS: la firma anti-raffica sta nel JS).
        if (intent?.action == ACTION_NAV_BANNER) {
            applicaNavBanner(
                intent.getStringExtra("titolo"),
                intent.getStringExtra("corpo"),
                intent.getBooleanExtra("attivo", false)
            )
            return START_STICKY
        }

        // (AUD-14) Tasti della notifica sulla coda vocale: agiscono SOLO sulla
        // voce (teaser / guida del pass), il servizio resta acceso.
        when (intent?.action) {
            ACTION_SPEECH_PAUSE -> { GeofenceBroadcastReceiver.pauseSpeech(this); return START_STICKY }
            ACTION_SPEECH_RESUME -> { GeofenceBroadcastReceiver.resumeSpeech(this); return START_STICKY }
            ACTION_SPEECH_SKIP -> { GeofenceBroadcastReceiver.skipSpeech(this); return START_STICKY }
        }

        if (intent?.action == ArrivalWorker.ACTION_HANDLE_ARRIVAL) {
            // (22/08/2026) Lavoro lungo dell'arrivo inoltrato dal receiver
            // (teaser dal server, testo integrale, MP3): qui non c'è il limite
            // di ~10 s di goAsync(). Vedi ArrivalWorker.
            val params = ArrivalWorker.fromIntent(intent)
            if (params != null) {
                serviceScope.launch { ArrivalWorker.run(this@ItaintaBackgroundPoiService, params) }
            }
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
            // Avvio a processo freddo con itinerario ancora in corso: le tappe
            // persistite tornano subito nella fusione (il JS le risincronizzerà
            // comunque con ACTION_SYNC_SELECTION).
            restoreItineraryFromPrefs(prefs)
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
        // CORROBORAZIONE ACTIVITY RECOGNITION (leggera, sopra l'isteresi GPS
        // esistente): se i sensori confermano il target il cambio scatta con
        // 2 fix invece di 3 (meno latenza reale in auto); se lo contraddicono
        // si resta prudenti a 4. Senza dato (UNKNOWN) → 3, identico a prima.
        val act = ActivityMonitor.currentType(this)
        val onFoot = act == com.google.android.gms.location.DetectedActivity.WALKING ||
            act == com.google.android.gms.location.DetectedActivity.ON_FOOT
        val inVehicle = act == com.google.android.gms.location.DetectedActivity.IN_VEHICLE
        val requiredStreak = when {
            inVehicle && target == "driving" -> 2
            onFoot && target == "walking" -> 2
            inVehicle && target == "walking" -> 4
            onFoot && target == "driving" -> 4
            else -> 3
        }
        if (modeSwitchStreak < requiredStreak) return
        modeSwitchStreak = 0
        guideMode = target
        getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).edit { putString("guideMode", guideMode) }
        lastQueryLocation = null
        // (22/08/2026) La cadenza GPS è mode-aware (applyLocationRate) ma veniva
        // ricostruita solo quando cambiava lo stato armato: dopo il passaggio
        // piedi→auto la richiesta IDLE restava quella a piedi, con batching
        // fino a 60 s — a 100 km/h sono ~1,7 km percorsi alla cieca. Si rifà
        // subito la richiesta con la modalità nuova, allo stesso livello armato.
        applyLocationRate(isArmed, isFine)
        Log.d(TAG, "Travel mode switched to $guideMode (${kmh.toInt()} km/h)")
    }

    /**
     * Gate anti-teletrasporto: con l'utente FERMO (STILL da >5 min secondo
     * l'Activity Recognition) un salto di posizione >100 m in un solo fix è
     * quasi certamente rumore GPS (canyon urbano, indoor, rimbalzo Wi-Fi) e
     * NON un vero spostamento: valutare quel fix produrrebbe falsi trigger.
     *
     * Anti-blocco: il fix sospetto viene memorizzato; se il fix SUCCESSIVO lo
     * conferma (entro 150 m) lo spostamento era reale e si accetta — così un
     * trasloco vero (es. risveglio del GPS dopo un tunnel) non resta soppresso
     * per sempre. Fail-safe: senza dato attività (permesso negato, niente Play
     * Services) stillForMs è 0 e il gate non scatta mai.
     */
    private fun isGpsTeleport(location: Location): Boolean {
        // (22/08/2026) In auto, o comunque con velocità GPS > 3 m/s, il gate è
        // DISATTIVATO: a 90 km/h un fix ogni 20 s (IDLE) è un salto di 500 m
        // del tutto legittimo, e l'Activity Recognition può dichiarare STILL
        // in autostrada (accelerazioni nulle a velocità costante) — il gate
        // avrebbe scartato fix veri a raffica, ciechi proprio dove serve
        // reattività.
        val moving = location.hasSpeed() && location.speed > 3f
        if (guideMode == "driving" || moving) {
            suspectFix = null
            lastAcceptedFix = location
            return false
        }
        val prev = lastAcceptedFix
        val stillMs = ActivityMonitor.stillForMs(this)
        if (prev != null && stillMs > 5 * 60_000L) {
            val jump = prev.distanceTo(location)
            if (jump > 100f) {
                val suspect = suspectFix
                if (suspect != null && suspect.distanceTo(location) <= 150f) {
                    // Due fix coerenti fra loro: lo spostamento è reale.
                    suspectFix = null
                    lastAcceptedFix = location
                    Log.d(TAG, "Salto GPS confermato dal secondo fix (${jump.toInt()}m): accettato")
                    return false
                }
                suspectFix = location
                Log.w(TAG, "Teletrasporto GPS ignorato: salto ${jump.toInt()}m con utente fermo da ${stillMs / 1000}s")
                return true
            }
        }
        suspectFix = null
        lastAcceptedFix = location
        return false
    }

    /** Ripristina le impostazioni salvate quando il servizio riparte senza extras. */
    private fun restoreSettingsFromPrefs(prefs: SharedPreferences) {
        isAutomaticMode = prefs.getBoolean("isAutomaticMode", true)
        guideMode = prefs.getString("guideMode", "walking") ?: "walking"
        transportPref = prefs.getString("transportPref", "auto") ?: "auto"
        appLanguage = prefs.getString("language", "it") ?: "it"
        selectedCategories = prefs.getStringSet("selectedCategories", emptySet())?.toList() ?: emptyList()
        // (22/08/2026) Stessi clamp di onStartCommand: un valore fuori range
        // scritto da una versione vecchia dell'app (o da prefs corrotte)
        // sopravviveva ai riavvii STICKY/watchdog e dava raggi assurdi.
        alertRadiusWalk = prefs.getFloat("alertRadiusWalk", 150f).coerceIn(50f, 400f)
        arrivalRadiusWalk = prefs.getFloat("arrivalRadiusWalk", 30f).coerceIn(15f, 100f)
        alertRadiusCar = prefs.getFloat("alertRadiusCar", 300f).coerceIn(100f, 600f)
        arrivalRadiusCar = prefs.getFloat("arrivalRadiusCar", 50f).coerceIn(20f, 150f)
        restoreItineraryFromPrefs(prefs)
        Log.d(TAG, "Settings restored from prefs: lang=$appLanguage, cats=${selectedCategories.size}, mode=$guideMode, tappe=${itineraryPois.size}")
    }

    /** Tappe itinerario persistite (vedi itineraryPois): solo se in memoria non ci sono già. */
    private fun restoreItineraryFromPrefs(prefs: SharedPreferences) {
        if (itineraryPois.isNotEmpty()) return
        try {
            val json = prefs.getString(PREF_ITINERARY_POIS, null)
            if (!json.isNullOrBlank()) {
                val type = object : com.google.gson.reflect.TypeToken<List<PoiEntity>>() {}.type
                val restored: List<PoiEntity> = gson.fromJson(json, type) ?: emptyList()
                itineraryPois = restored.map { it.copy(isFromItinerary = true) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Ripristino tappe itinerario fallito: ${e.message}")
        }
    }

    /**
     * Fusione radar + tappe itinerario: tappe davanti (priorità nel
     * predittore e nella finestra geofence), poi il radar senza i doppioni
     * (per id). È l'UNICA lista che va in currentPois e ai geofence.
     */
    private fun mergeWithItinerary(radar: List<PoiEntity>): List<PoiEntity> {
        val stops = itineraryPois
        if (stops.isEmpty()) return radar
        val stopIds = stops.map { it.id }.toSet()
        return stops + radar.filter { it.id !in stopIds }
    }

    private fun syncManualSelection(json: String) {
        serviceScope.launch {
            try {
                val type = object : com.google.gson.reflect.TypeToken<List<PoiEntity>>() {}.type
                val selectedPois: List<PoiEntity> = gson.fromJson(json, type) ?: emptyList()
                val prioritizedPois = selectedPois.map { it.copy(isFromItinerary = true) }
                val prefs = getSharedPreferences("ItaintaPrefs", MODE_PRIVATE)

                // Selezione vuota = l'itinerario è stato chiuso: via le tappe
                // (anche dalle prefs) e si resta col solo radar.
                itineraryPois = prioritizedPois
                if (prioritizedPois.isEmpty()) {
                    prefs.edit { remove(PREF_ITINERARY_POIS) }
                } else {
                    prefs.edit { putString(PREF_ITINERARY_POIS, gson.toJson(prioritizedPois)) }
                }

                // Radar "puro" = currentPois senza le vecchie tappe; poi si
                // rifonde con le tappe nuove. Prima `currentPois = prioritizedPois`
                // SOSTITUIVA il radar con le sole tappe: fino al prossimo fetch
                // i POI lungo la strada sparivano dal predittore e dai banner.
                val radarOnly = currentPois.filter { !it.isFromItinerary }
                val mergedPois = mergeWithItinerary(radarOnly)
                currentPois = mergedPois
                RadarState.updatePois(mergedPois)

                if (prioritizedPois.isNotEmpty()) db.poiDao().insertPois(prioritizedPois)
                if (mergedPois.isNotEmpty()) {
                    // Si registra la lista FUSA (tappe + radar), mai le sole
                    // tappe: il full register rimuove tutti i geofence del
                    // PendingIntent, e con le sole tappe il radar restava senza.
                    // initialTrigger=true: se l'utente avvia l'itinerario già
                    // dentro il raggio della prima tappa, il teaser parte subito.
                    geofenceManager.registerGeofencesForPois(
                        mergedPois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar,
                        origin = lastAcceptedFix ?: lastQueryLocation, initialTrigger = prioritizedPois.isNotEmpty()
                    )
                }
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

                // (MAP-09) Fix SIMULATI (app di mock location): con una
                // posizione finta si "visitano" monumenti dal divano e si
                // consuma il Day Pass. Si scartano e basta, con log.
                val simulato = if (Build.VERSION.SDK_INT >= 31) location.isMock
                    else @Suppress("DEPRECATION") location.isFromMockProvider
                if (simulato) {
                    Log.w(TAG, "Fix simulato (mock provider) ignorato")
                    return
                }

                // Heartbeat per ServiceWatchdog: scritto a OGNI fix processato
                // (IDLE incluso, ~20s/batch 60s a piedi) così il watchdog sa
                // che il servizio è vivo senza doverlo riavviare alla cieca.
                // lastFixLat/Lon: ultima posizione nota per il widget home
                // (WipWidgetProvider calcola il POI più vicino da Room).
                //
                // FILE DEDICATO (23/08/2026), non piu' "ItaintaPrefs".
                // SharedPreferences riscrive l'INTERO file XML a ogni commit, e
                // in ItaintaPrefs vivono anche `listened_poi_ids` (che cresce
                // senza limite: ~180 KB con 5.000 id) e `itineraryPoisJson`
                // (l'itinerario serializzato, perimetri compresi). Scrivere qui
                // dentro tre valori a ogni fix significava riscrivere 50-200 KB
                // ~3.600 volte l'ora sul percorso GPS caldo. Con tre sole
                // chiavi il file pesa poche decine di byte.
                // La cadenza NON cambia: si scrive a ogni fix come prima.
                getSharedPreferences(PREFS_FIX, MODE_PRIVATE).edit {
                    putLong(PREF_LAST_HEARTBEAT, System.currentTimeMillis())
                    putFloat("lastFixLat", location.latitude.toFloat())
                    putFloat("lastFixLon", location.longitude.toFloat())
                }

                // «Salute del viaggio»: aggiorna il bucket passi del giorno
                // (throttle interno 1/min, listener one-shot: costo ~zero).
                StepTracker.record(this@ItaintaBackgroundPoiService)

                // GATE ANTI-TELETRASPORTO (Activity Recognition): fermo da >5
                // min e posizione che salta di colpo >100 m = falso trigger da
                // rumore GPS → il fix si logga e si ignora. Fail-safe: senza
                // stato attività il gate non scatta mai.
                if (isGpsTeleport(location)) return

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
                if (location == null || lastQueryLocation != null) return@addOnSuccessListener
                // (MAP-11) lastLocation puo' essere di ore fa o di rete
                // (chilometri di errore): un radar caricato sul posto
                // sbagliato registra recinti sbagliati. Stessi limiti del
                // valutatore: eta' ≤ 5 min, accuratezza ≤ 500 m.
                if (System.currentTimeMillis() - location.time > 5 * 60_000L ||
                    !location.hasAccuracy() || location.accuracy > 500f
                ) {
                    Log.d(TAG, "lastLocation scartata (eta' ${(System.currentTimeMillis() - location.time) / 1000}s, acc ${location.accuracy}m)")
                    return@addOnSuccessListener
                }
                Log.d(TAG, "Instant location fix on start, fetching POIs...")
                checkRefreshGeofences(location)
            }
            applyLocationRate(armed = false)
        } catch (e: SecurityException) {
            // (MAP-01) Permesso revocato mentre il servizio era acceso.
            onLocationPermissionLost()
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
     * (23/08/2026) L'ARMATO ha ora un sotto-livello, `fine`: granularità fine
     * sempre (armati) e fix anche da fermo negli ultimi metri. Tutto questo
     * vive DENTRO la finestra armata: lo stato a RIPOSO — che è la mitigazione
     * batteria numero uno del progetto — è rimasto identico, byte per byte.
     *
     * Il cambio è idempotente: si ri-registra solo se il livello cambia
     * davvero, altrimenti a ogni fix si rifarebbe una requestLocationUpdates.
     */
    private fun applyLocationRate(armed: Boolean, fine: Boolean = false) {
        // Il sensore di orientamento del gate di bussola segue lo stesso duty
        // cycle: acceso solo quando c'e' un POI in rotta (lo registra il gate
        // stesso, alla prima valutazione che ne ha bisogno), spento appena si
        // torna a IDLE. Un magnetometro acceso in mezzo alla campagna e' solo
        // batteria.
        if (!armed) BearingGate.disattiva()
        val cb = locationCallback ?: return
        val request = if (armed) {
            // Intervallo armato MODE-AWARE: in auto serve reattività (1 s); a piedi
            // 2 s dimezza il carico GNSS/CPU senza perdere trigger (a passo d'uomo
            // 2 s ≈ 3 m). Prima era 1 Hz pieno anche a piedi = il driver di calore #1.
            val armedIntervalMs = if (guideMode == "driving") 1000L else 2000L
            val b = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, armedIntervalMs)
                .setMinUpdateIntervalMillis(armedIntervalMs)
                // Aspetta il fix davvero preciso invece di consegnare subito
                // quello di rete: costa qualche centinaio di ms di latenza e
                // vale decine di metri di errore in meno.
                .setWaitForAccurateLocation(true)
            // GRANULARITÀ FINE (23/08/2026) — SOLO nella finestra armata.
            // Senza dichiararla, su Android 12+ il sistema può consegnare al
            // servizio una posizione volutamente ARROTONDATA (~1-3 km: è la
            // granularità "coarse" che l'utente può concedere dal dialogo dei
            // permessi, e che alcune ROM OEM applicano anche in background per
            // risparmio). Con FINE si chiede esplicitamente la posizione
            // precisa; se l'utente ha concesso solo l'approssimativa il sistema
            // NON solleva eccezioni, degrada e basta — quindi è sicuro.
            // Effetto atteso: elimina il caso patologico "sono a 800 m dal POI
            // secondo il sistema" e, sui fix normali, riporta l'errore urbano
            // dai 30-50 m del fix arrotondato ai 5-15 m del GNSS puro: è
            // esattamente il margine che distingue i due lati della strada.
            // Richiede play-services-location 21.0.0+ (qui 21.3.0).
            b.setGranularity(Granularity.GRANULARITY_FINE)
            if (fine) {
                // ULTIMI METRI: il POI candidato è entro 2× il raggio di arrivo.
                // setMinUpdateDistanceMeters(0) = consegnami i fix ANCHE se non
                // mi sono mosso. È il caso di chi è fermo davanti all'ingresso:
                // con un filtro di spostamento (default del fornitore su alcune
                // ROM) i fix successivi — che sono quelli che convergono, man
                // mano che il ricevitore aggancia più satelliti — verrebbero
                // scartati e resteremmo per sempre sul primo fix, il peggiore.
                // Effetto atteso: la posizione continua a raffinarsi da fermo,
                // tipicamente da ~25 m a ~8 m in una decina di secondi.
                b.setMinUpdateDistanceMeters(0f)
            }
            b.build()
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
            Log.d(TAG, "Location rate → ${if (armed) "ARMED (high accuracy, fine${if (fine) ", ultimi metri" else ""})" else "IDLE (20s, balanced)"}")
        } catch (e: SecurityException) {
            // (MAP-01) Permesso revocato a servizio acceso: non si resta
            // "attivi" senza posizione.
            onLocationPermissionLost()
        }
    }

    /**
     * (22/08/2026) Le uscite anticipate del valutatore (radar vuoto, fix
     * impreciso o stantio) non toccavano isArmed: se il dispositivo era stato
     * armato a 1-2 s HIGH_ACCURACY e poi il GPS degradava (indoor, galleria)
     * restava a quella cadenza all'infinito, perché il disarmo avviene solo a
     * valutazione completata. Torna a IDLE appena la valutazione non può girare.
     */
    private fun disarmIfArmed() {
        if (isArmed) {
            isArmed = false
            isFine = false
            applyLocationRate(false)
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
        if (currentPois.isEmpty()) { disarmIfArmed(); return }
        // GATE ACCURATEZZA (fail-closed): senza un fix RECENTE e PRECISO ogni
        // trigger è sospetto. Indoor/seminterrato la posizione di RETE ha
        // incertezza chilometrica e il predittore, valutando comunque, poteva
        // "annunciare" da fermo mezzo radar. Stesso guardiano del receiver
        // (GeofenceBroadcastReceiver.handleEnterTransitions:~596-604) e di iOS
        // (BackgroundPoiManager.swift:493-497).
        // DUE SOGLIE, DUE USI DIVERSI (23/08/2026):
        //  - PARAGGI (100 m): basta a decidere "c'è qualcosa qui intorno" —
        //    armare il GPS, aggiornare la notifica di distanza, capire che un
        //    POI è stato superato. Un errore di 80 m non cambia queste risposte.
        //  - TRIGGER (50 m): la soglia con cui PARLA il web
        //    (locationService/geofencing lato SPA). Far scattare l'annuncio con
        //    un fix da 90 m significa raccontare il palazzo di fronte, o la
        //    chiesa dall'altro lato della piazza: l'errore del fix è più grande
        //    del raggio di arrivo a piedi (30 m). Sotto i 50 m l'incertezza è
        //    finalmente più piccola del raggio che stiamo valutando.
        // Il gate d'ingresso resta a 100 m: fermare qui i fix a 60 m
        // spegnerebbe anche l'armamento, cioè proprio il meccanismo che serve a
        // ottenere il fix preciso. Il filtro a 50 m sta più in basso, davanti
        // alle sole chiamate che fanno partire la voce.
        val maxFixAgeMs = 2 * 60_000L
        if (!location.hasAccuracy() || location.accuracy <= 0f || location.accuracy > ACCURACY_NEARBY_M ||
            System.currentTimeMillis() - location.time > maxFixAgeMs) {
            disarmIfArmed()
            return
        }
        // Fix abbastanza preciso per far PARLARE l'app. Se è false si continua a
        // valutare tutto (stati, superamenti, duty cycle): si tace e basta, e al
        // fix successivo — che nel frattempo la finestra armata sta rendendo più
        // preciso — l'annuncio parte.
        val fixDaTrigger = location.accuracy <= ACCURACY_TRIGGER_M
        if (!predictiveBusy.compareAndSet(false, true)) return

        val isDriving = guideMode == "driving"
        val alertRad = if (isDriving) alertRadiusCar else alertRadiusWalk
        val arrivalRad = if (isDriving) arrivalRadiusCar else arrivalRadiusWalk

        serviceScope.launch {
            try {
                // associateBy (non solo lo stato): serve updatedAt per il
                // cooldown di re-approach post-EXITED.
                val stateMap = db.poiDao().getAllTriggerStates().associateBy { it.poiId }
                statiTriggerCache = stateMap
                statiTriggerCacheAt = System.currentTimeMillis()
                var shouldArm = false
                // (23/08/2026) Sotto-livello "ultimi metri": vero appena un
                // candidato è entro 2× il raggio di arrivo (o già dentro il
                // perimetro). Vive SOLO dentro l'armato.
                var shouldFine = false
                // Anti-spam: in una piazza densa parla solo il primo.
                var spokenInBatch = false
                // (AUD-04) Stessa regola per gli arrivi decisi qui: nello
                // stesso fix una sola guida completa (pass consumato una
                // volta); gli altri POI scrivono lo stato e notificano.
                var arrivalSpokenInBatch = false

                // Si valutano solo i candidati plausibili: oltre 3× il raggio
                // di alert il CPA non può cadere nella finestra di anticipo.
                // (22/08/2026) ORDINE: filtro categoria → distanza → take(5).
                // Prima il take(5) precedeva il filtro categoria (dentro il
                // for): in una piazza con 5 POI di categorie spente i 5 posti
                // erano occupati da POI muti e il monumento attivo a 80 m non
                // veniva mai valutato.
                // (23/08/2026) Un solo giro, e il perimetro calcolato UNA volta
                // per POI. Prima la catena filter/map/filter/sortedWith
                // costruiva quattro liste intermedie, allocava una
                // `Location("")` per ciascuno dei fino a 120 POI del radar, e
                // poi il loop qui sotto RICALCOLAVA la distanza dal perimetro
                // dello stesso POI nello stesso fix (distanzaDalPerimetro
                // scorre tutti i vertici del poligono). Ora la si porta dietro
                // nel candidato. `Location.distanceBetween` scrive in un
                // FloatArray riusato: stessa formula di `distanceTo`, zero
                // oggetti nuovi.
                val distBuf = FloatArray(1)
                val candidati = ArrayList<Triple<PoiEntity, Float, Double>>()
                val sogliaPerimetro = Footprints.triggerM(isDriving)
                for (poi in currentPois) {
                    if (!isPoiCategorySelected(poi)) continue
                    Location.distanceBetween(
                        location.latitude, location.longitude,
                        poi.entranceLat ?: poi.lat, poi.entranceLon ?: poi.lon,
                        distBuf
                    )
                    val dIngresso = distBuf[0]
                    val dMuro = Footprints.distanzaDalPerimetro(
                        poi.id, poi.footprint, location.latitude, location.longitude,
                        entro = Footprints.TRIGGER_CAR_M
                    )
                    // La distanza che ordina e' la MINORE fra ingresso e
                    // bordo del perimetro: in un centro storico a 30 m dal
                    // muro di tre chiese vince quella di cui si sfiora il
                    // muro, non quella col portone piu' vicino in linea d'aria.
                    val d = minOf(dIngresso, dMuro.toFloat())
                    // ...oppure a 30 m dal perimetro: un parco o una cinta
                    // muraria si estendono ben oltre 3× il raggio dall'ingresso.
                    if (d <= alertRad * 3f || d <= sogliaPerimetro) {
                        candidati.add(Triple(poi, d, dMuro))
                    }
                }
                candidati.sortWith(
                    compareByDescending<Triple<PoiEntity, Float, Double>> { it.first.isFromItinerary }
                        .thenByDescending { it.first.isGem }
                        .thenBy { it.second }
                )
                val candidates = if (candidati.size > MAX_PREDICTIVE_CANDIDATES)
                    candidati.subList(0, MAX_PREDICTIVE_CANDIDATES) else candidati

                for ((poi, _, distPerimetro) in candidates) {
                    // RAGGIO IN BASE ALLA FIDUCIA DEL PUNTO (23/08/2026):
                    // stessa funzione dei recinti di sistema
                    // (RaggiFiducia.calcola, in GeofenceManager.kt). I raggi
                    // di modalita' restano la BASE; un POI col solo centroide
                    // la raddoppia (entro i tetti), uno calibrato dal DB usa la
                    // misura vera.
                    val raggi = RaggiFiducia.calcola(poi, isDriving, alertRad, arrivalRad)
                    val alertPoi = raggi.alert
                    val arrivoPoi = raggi.arrivo

                    val pred = PredictiveTrigger.evaluate(
                        location = location,
                        poiLat = poi.entranceLat ?: poi.lat,
                        poiLon = poi.entranceLon ?: poi.lon,
                        radiusM = alertPoi.toDouble(),
                        isDriving = isDriving
                    )
                    val stateEntity = stateMap[poi.id]
                    val state = stateEntity?.state ?: TriggerState.PENDING
                    val prevDist = lastDistances[poi.id]
                    val distNow = pred.distanceNowMeters.toFloat()

                    // A 30 M DAL PERIMETRO (22/08/2026): la misura che governa
                    // la guida quando il POI ha il poligono. 0 = dentro.
                    // (23/08/2026) Arriva dal candidato: e' esattamente la
                    // stessa chiamata che si faceva qui, fatta una volta sola.
                    val alPerimetro = distPerimetro <= sogliaPerimetro

                    // Finestra di attenzione: se un POI è a meno di 90 s, si alza il rate.
                    if (!pred.tCpaSeconds.isNaN() && pred.tCpaSeconds > 0 && pred.tCpaSeconds <= ARM_WINDOW_S) {
                        shouldArm = true
                    } else if (distNow <= alertPoi * 1.5f || alPerimetro) {
                        shouldArm = true
                    }

                    // ULTIMI METRI: entro 2× il raggio di arrivo (~60 m a piedi,
                    // ~100 m in auto) o già al perimetro. Qui la decisione non è
                    // più "quale POI" ma "sono davanti a QUESTO ingresso": è
                    // l'unico punto in cui vale la pena chiedere anche i fix da
                    // fermo. Fuori da questa fascia il duty cycle resta identico
                    // a prima, e a RIPOSO non cambia assolutamente nulla.
                    if (distNow <= arrivoPoi * 2f || alPerimetro) {
                        shouldFine = true
                    }

                    // ARRIVO DAL PERIMETRO: il sistema emette l'ENTER una volta,
                    // all'ingresso nel cerchio (che col perimetro e' allargato a
                    // coprirlo tutto); i 30 m dal muro si raggiungono dopo, e li
                    // vede solo questo loop. Vale da PENDING, APPROACH_FIRED e da
                    // EXITED dopo il cooldown; handleArrival ri-verifica sotto
                    // lock che non sia gia' ARRIVED_FIRED.
                    // `fixDaTrigger` (≤50 m, come il web): l'arrivo al perimetro
                    // è la decisione più sensibile all'errore di posizione — a
                    // 30 m dal muro, con un fix da 90 m, "dentro" e "dall'altra
                    // parte dell'isolato" sono indistinguibili. Se il fix non è
                    // abbastanza buono NON si scrive stato e NON si consuma il
                    // cooldown: si riprova al fix dopo, che nella finestra
                    // armata/fine arriva entro 1-2 s ed è più preciso.
                    if (alPerimetro && fixDaTrigger &&
                        (state == TriggerState.PENDING || state == TriggerState.APPROACH_FIRED ||
                            (state == TriggerState.EXITED &&
                                (stateEntity?.let { System.currentTimeMillis() - it.updatedAt } ?: Long.MAX_VALUE) >
                                    GeofenceBroadcastReceiver.ARRIVAL_AFTER_EXIT_COOLDOWN_MS))
                    ) {
                        // GATE DI BUSSOLA, solo sull'arrivo: se il POI e' ormai
                        // alle spalle si RIMANDA — niente stato, niente
                        // cooldown, si riprova al fix successivo. Le tappe
                        // dell'itinerario non passano dal gate. `dentroPerimetro`
                        // e' il DENTRO stretto (0 m dal bordo), non alPerimetro:
                        // a 30 m dal muro il gate ha ancora senso.
                        val gate = if (poi.isFromItinerary) BearingGate.Esito.IGNORA_GATE
                            else BearingGate.valuta(
                                this@ItaintaBackgroundPoiService, poi, location,
                                dentroPerimetro = distPerimetro <= 0.0,
                                distanzaM = minOf(distNow, distPerimetro.toFloat())
                            )
                        if (gate == BearingGate.Esito.RIMANDA) {
                            Log.d(TAG, "Arrivo rimandato per ${poi.nome}: e' alle spalle (gate di bussola)")
                            lastDistances[poi.id] = distNow
                            continue
                        }
                        val fired = GeofenceBroadcastReceiver.firePerimeterArrival(
                            this@ItaintaBackgroundPoiService, poi, isAutomaticMode, db,
                            distanceM = distPerimetro.toFloat(), fullGuide = !arrivalSpokenInBatch
                        )
                        if (fired) arrivalSpokenInBatch = true
                        lastDistances[poi.id] = distNow
                        continue
                    }

                    // ARRIVO RADIALE (AUD-03, 28/08/2026). Il ramo sopra vale
                    // solo per i POI col perimetro: per TUTTI GLI ALTRI
                    // l'arrivo in-process non esisteva — da PENDING /
                    // APPROACH_FIRED si sparava solo l'approach e l'arrivo
                    // dipendeva dal SOLO ENTER dell'OS. Ma il receiver scarta
                    // l'intero batch se il fix e' > 100 m o piu' vecchio di 2
                    // min, e l'OS non riemette l'ENTER: il monumento restava
                    // muto per sempre. Qui il servizio ha gia' un fix buono
                    // (≤ 50 m, fixDaTrigger) e decide da solo, con le STESSE
                    // guardie del receiver: blocco per stato (ARRIVED_FIRED,
                    // PASSED fuori raggio, EXITED nel cooldown), gate di
                    // bussola, e handleArrival sotto mutex per-POI che
                    // ri-verifica lo stato — cosi' se l'ENTER dell'OS arriva
                    // anche lui non c'e' doppio trigger.
                    val ageStato = stateEntity?.let { System.currentTimeMillis() - it.updatedAt } ?: Long.MAX_VALUE
                    val arrivoRadialeBloccato =
                        state == TriggerState.ARRIVED_FIRED ||
                            (state == TriggerState.PASSED && distNow > arrivoPoi) ||
                            (state == TriggerState.EXITED && ageStato < GeofenceBroadcastReceiver.ARRIVAL_AFTER_EXIT_COOLDOWN_MS)
                    if (poi.footprint.isNullOrBlank() && fixDaTrigger &&
                        distNow <= arrivoPoi && !arrivoRadialeBloccato
                    ) {
                        val gate = if (poi.isFromItinerary) BearingGate.Esito.IGNORA_GATE
                            else BearingGate.valuta(
                                this@ItaintaBackgroundPoiService, poi, location,
                                dentroPerimetro = false,
                                distanzaM = distNow
                            )
                        if (gate == BearingGate.Esito.RIMANDA) {
                            Log.d(TAG, "Arrivo radiale rimandato per ${poi.nome}: e' alle spalle (gate di bussola)")
                            lastDistances[poi.id] = distNow
                            continue
                        }
                        TriggerTelemetry.log(
                            this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                            "arrival-radial", pred, location, isDriving, arrivoPoi
                        )
                        val fired = GeofenceBroadcastReceiver.firePerimeterArrival(
                            this@ItaintaBackgroundPoiService, poi, isAutomaticMode, db,
                            distanceM = distNow, fullGuide = !arrivalSpokenInBatch
                        )
                        if (fired) arrivalSpokenInBatch = true
                        lastDistances[poi.id] = distNow
                        continue
                    }

                    when (state) {
                        // ── Superamento: si ferma la voce e si libera il POI ──
                        // A 30 m dal muro non si e' mai "superato" il POI, per
                        // quanto ci si allontani dal suo ingresso.
                        TriggerState.APPROACH_FIRED, TriggerState.ARRIVED_FIRED -> if (!alPerimetro) {
                            // Pavimento radiale per modalità: in auto basta
                            // uscire dal cerchio di arrivo (sorpasso netto);
                            // a piedi la voce vive finché resti nel raggio di
                            // alert — a 35 m dal centroide di un duomo sei
                            // ancora davanti al duomo.
                            val passFloor = if (isDriving) arrivoPoi else alertPoi
                            if (prevDist != null && distNow > arrivoPoi &&
                                PredictiveTrigger.hasPassed(
                                    pred.tCpaSeconds, distNow.toDouble(), prevDist.toDouble(),
                                    passFloor.toDouble(),
                                    if (location.hasSpeed()) location.speed.toDouble() else 0.0
                                )
                            ) {
                                handlePassed(poi, pred, location, isDriving, alertPoi)
                            }
                        }
                        // ── Approach proattivo: qui si recupera la latenza ──
                        TriggerState.PENDING -> {
                            // Anche l'approach passa dal gate a 50 m: è un
                            // annuncio, e annunciare col fix sbagliato è il
                            // difetto "palazzo di fronte". Il rinvio costa al
                            // massimo un fix (1-2 s nella finestra armata),
                            // perché l'approach nasce comunque con ~90 s di
                            // anticipo sul punto di massimo avvicinamento.
                            if (fixDaTrigger && pred.decision == PredictiveTrigger.Decision.FIRE) {
                                TriggerTelemetry.log(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    "approach-predictive", pred, location, isDriving, alertPoi
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
                            // Stesso gate a 50 m del ramo PENDING: qui il rinvio
                            // è ancora più innocuo, il cooldown è già passato.
                            if (exitedAge > GeofenceBroadcastReceiver.APPROACH_RETRIGGER_COOLDOWN_MS &&
                                fixDaTrigger && pred.decision == PredictiveTrigger.Decision.FIRE) {
                                TriggerTelemetry.log(
                                    this@ItaintaBackgroundPoiService, poi.id, poi.nome,
                                    "approach-predictive", pred, location, isDriving, alertPoi
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

                // "Fine" esiste solo dentro l'armato: se non si arma, decade.
                val fine = shouldArm && shouldFine
                // Si ri-registra quando cambia il livello armato OPPURE, restando
                // armati, quando si entra/esce dagli "ultimi metri". Resta
                // idempotente: senza cambi non si rifà nessuna
                // requestLocationUpdates, e lo stato a RIPOSO non è toccato.
                if (shouldArm != isArmed || fine != isFine) {
                    isArmed = shouldArm
                    isFine = fine
                    withContext(Dispatchers.Main) { applyLocationRate(shouldArm, fine) }
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
        // (22/08/2026) Broadcast implicito senza setPackage: id e nome del POI
        // superato erano leggibili da qualsiasi app installata.
        intent.setPackage(packageName)
        intent.putExtra("event", "poiPassed")
        intent.putExtra("poiId", poi.id)
        intent.putExtra("name", poi.nome)
        sendBroadcast(intent)
        Log.d(TAG, "PASSED ${poi.nome}: audio fermato, tappa liberata")
    }

    /**
     * Le categorie attive filtrano anche il percorso predittivo.
     * Delega a GeofenceBroadcastReceiver.isCategoryActive, che a sua volta usa
     * la copia unica CategoryMap.MAP: una seconda copia della mappa qui si
     * sarebbe disallineata al primo cambio di categorie nella UI.
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
            // Copia fresca del valutatore predittivo se disponibile (vedi
            // statiTriggerCache), altrimenti lettura dal DB come prima.
            val stateMap = if (nowMs - statiTriggerCacheAt <= STATI_CACHE_MAX_ETA_MS) statiTriggerCache
                else db.poiDao().getAllTriggerStates().associateBy { it.poiId }
            // Una sola Location riusata per tutto il giro invece di una per
            // POI: fino a 120 oggetti buttati via a ogni aggiornamento.
            val distBuf = FloatArray(1)

            for (poi in currentPois) {
                Location.distanceBetween(
                    location.latitude, location.longitude,
                    poi.entranceLat ?: poi.lat, poi.entranceLon ?: poi.lon,
                    distBuf
                )
                val dist = distBuf[0]
                if (dist < closestDist) { closestDist = dist; closestPoi = poi }

                // Se questo POI ha generato un APPROACH_FIRED (da GeofenceReceiver)
                // e siamo ancora nella zona di alert (con un po' di margine)
                val alertRad = if (guideMode == "driving") alertRadiusCar else alertRadiusWalk
                if (stateMap[poi.id]?.state == TriggerState.APPROACH_FIRED && dist <= alertRad * 2.0f) {
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
                // (22/08/2026) Come sendEventToPlugin: senza setPackage le
                // distanze ai POI (= posizione dell'utente) uscivano in chiaro.
                intent.setPackage(packageName)
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
                    //
                    // isOnline() da solo si accontenta di NET_CAPABILITY_VALIDATED:
                    // una rete "zombie" (es. captive portal di un hotel/bar che ha
                    // validato l'uscita ma poi la blocca, o un access point morto)
                    // la supera comunque, e il fetch sotto falliva con un timeout
                    // meno chiaro invece di degradare subito al pacchetto offline.
                    // probe() (HEAD reale al backend, timeout aggressivo) è chiamato
                    // SOLO se isOnline() è già vero, per non pagare un round-trip di
                    // rete quando è ovvio che siamo offline.
                    val hasRealConnectivity = com.itaintasca.app.offline.ConnectivityMonitor
                        .isOnline(this@ItaintaBackgroundPoiService) &&
                        com.itaintasca.app.offline.ConnectivityMonitor.probe()
                    if (!hasRealConnectivity) {
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
                        // (23/08/2026) Qui resta la soglia LARGA (100 m) e non
                        // quella da trigger (50 m): questo flag non fa parlare
                        // nessuno, chiede solo all'OS di valutare subito i
                        // recinti in cui siamo già dentro. L'annuncio vero passa
                        // comunque dal valutatore in-process, che prima di
                        // parlare ri-verifica il fix a 50 m (ACCURACY_TRIGGER_M).
                        // Stringere qui perderebbe l'aggancio iniziale (all'avvio
                        // il primo fix è spesso quello di rete) senza guadagnare
                        // precisione sulla voce.
                        val isFirstRegistration = currentPois.isEmpty() &&
                            location.hasAccuracy() && location.accuracy <= ACCURACY_NEARBY_M
                        db.poiDao().insertPois(pois)
                        // (22/08/2026) SEMPRE radar + tappe itinerario: prima
                        // `currentPois = pois` e il register sul solo radar
                        // facevano sparire i geofence delle tappe al refresh.
                        val merged = mergeWithItinerary(pois)
                        currentPois = merged
                        RadarState.updatePois(merged)

                        Log.d(TAG, "Fetched ${pois.size} nearby POIs (after deduplication, +${itineraryPois.size} tappe). Selected categories: $selectedCategories")

                        geofenceManager.registerGeofencesForPois(merged, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin = location, initialTrigger = isFirstRegistration)

                        // Bonifica stati incoerenti: dopo un falso ENTER (fix
                        // impreciso / teleport GPS) i POI restavano APPROACH o
                        // ARRIVED anche a km di distanza e l'app continuava a
                        // segnalarli come "in visita". Se il POI è molto oltre
                        // il raggio di alert, lo stato torna PENDING.
                        try {
                            val cleanupAlertRad = if (isDriving) alertRadiusCar else alertRadiusWalk
                            // (23/08/2026) UNA lettura sola invece di una query
                            // per POI: prima erano fino a 120 `getTriggerState`
                            // (ognuna una transazione Room) solo per scoprire
                            // che quasi tutti i POI appena scaricati non hanno
                            // ancora nessuno stato. E la distanza si calcola una
                            // volta, in un FloatArray riusato, invece di
                            // allocare una Location per POI e ricalcolarla per
                            // il log.
                            val conStato = db.poiDao().getAllTriggerStates()
                                .mapTo(HashSet()) { it.poiId }
                            if (conStato.isNotEmpty()) {
                                val buf = FloatArray(1)
                                for (p in pois) {
                                    if (p.id !in conStato) continue
                                    Location.distanceBetween(
                                        location.latitude, location.longitude,
                                        p.entranceLat ?: p.lat, p.entranceLon ?: p.lon,
                                        buf
                                    )
                                    val dist = buf[0]
                                    if (dist > cleanupAlertRad * 3f) {
                                        db.poiDao().deleteTriggerState(p.id)
                                        Log.d(TAG, "Trigger state resettato per ${p.nome}: distanza reale ${dist.toInt()}m")
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Trigger state cleanup failed: ${e.message}")
                        }
                        updateNotificationAndStatus("Audioguida attiva", "${pois.size} luoghi monitorati")
                        sendEventToPlugin("poisDownloaded", gson.toJson(pois))
                        // Widget home: dati freschi (POI più vicino) senza
                        // aspettare il refresh periodico dei 30 min.
                        WipWidgetProvider.pushUpdate(this@ItaintaBackgroundPoiService)
                        
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

                        // ✅ [BATCH TEASER] - Richiedi la generazione dei teaser mancanti
                        // (22/08/2026) Solo i 10 POI PIÙ VICINI SENZA teaser, non
                        // tutto il radar: prima si mandavano anche 200-1000 id al
                        // server (che li rigenerava/controllava tutti) a ogni
                        // refresh da 200 m — costo AI e banda per teaser di POI a
                        // 5 km che l'utente non avrebbe mai incontrato.
                        val teaserTargets = pois
                            .filter { it.teaserText.isNullOrBlank() }
                            .map { poi ->
                                val poiLoc = Location("").apply {
                                    latitude = poi.entranceLat ?: poi.lat
                                    longitude = poi.entranceLon ?: poi.lon
                                }
                                poi.id to location.distanceTo(poiLoc)
                            }
                            .sortedBy { it.second }
                            .take(10)
                            .map { it.first }
                        if (teaserTargets.isNotEmpty()) generateTeasersInBackground(teaserTargets)

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

            // Soglia larga anche qui, per lo stesso motivo del percorso online:
            // è un "sono nei paraggi", non un annuncio.
            val isFirstRegistration = currentPois.isEmpty() &&
                location.hasAccuracy() && location.accuracy <= ACCURACY_NEARBY_M
            lastQueryLocation = location
            lastFetchFailedAt = 0L
            db.poiDao().insertPois(pois)
            // Come nel percorso online: radar + tappe itinerario, sempre.
            val merged = mergeWithItinerary(pois)
            currentPois = merged
            RadarState.updatePois(merged)

            geofenceManager.registerGeofencesForPois(merged, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin = location, initialTrigger = isFirstRegistration)

            updateNotificationAndStatus("Audioguida attiva (offline)", "${pois.size} luoghi dal pacchetto offline")
            sendEventToPlugin("poisDownloaded", gson.toJson(pois))
            WipWidgetProvider.pushUpdate(this@ItaintaBackgroundPoiService)
            Log.d(TAG, "Offline window: ${pois.size} POIs from local packages")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Offline refresh failed: ${e.message}")
            false
        }
    }

    /**
     * Filtro categorie offline: (22/08/2026) STESSA funzione del fetch online
     * (SupabaseClient.parsePoiList) e del filtro trigger (receiver):
     * CategoryMap.isActive. Insieme vuoto = { monumenti, musei, chiese }.
     */
    private fun isOfflineCategoryActive(p: com.itaintasca.app.db.OfflinePoiEntity): Boolean =
        CategoryMap.isActive(p.poiType ?: p.category, p.isGem, isFromItinerary = false, selected = selectedCategories)

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
                // (23/08/2026) Gli stati si leggono UNA volta: prima c'era una
                // query Room dentro il `filter{}`, cioe' una transazione per
                // ogni POI del radar (fino a 120) a ogni refresh. Anche la
                // distanza esce da un FloatArray riusato invece che da una
                // `Location` nuova per POI. Stesso ordine, stessi due scelti.
                val idsConStato = db.poiDao().getAllTriggerStates().mapTo(HashSet()) { it.poiId }
                val buf = FloatArray(1)
                val candidates = pois
                    .filter { !it.teaserText.isNullOrBlank() && it.id !in notified && it.id !in idsConStato }
                    .map { poi ->
                        Location.distanceBetween(
                            location.latitude, location.longitude,
                            poi.entranceLat ?: poi.lat, poi.entranceLon ?: poi.lon,
                            buf
                        )
                        poi to buf[0]
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
                // Timeout espliciti (come il receiver): la generazione AI può
                // superare i 10 s del default OkHttp.
                // (23/08/2026) Stessi timeout, ma su newBuilder() del client
                // condiviso (WipHttp): pool e dispatcher sono quelli di
                // SupabaseClient, che ha appena parlato con lo stesso host.
                val client = WipHttp.client.newBuilder()
                    .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(25, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val body = JSONObject().apply {
                    put("poiIds", JSONArray(poiIds))
                    put("lang", appLanguage)
                }.toString().toRequestBody("application/json".toMediaType())

                // (22/08/2026) Il server risponde 403 senza Authorization: la
                // generazione teaser in background non partiva MAI e l'esito
                // non veniva nemmeno loggato. Stesso token utente (SecurePrefs)
                // già usato per /api/poi/audioguide; senza token la richiesta
                // resta com'era (e il warning sotto lo rende visibile).
                val accessToken = SecurePrefs.get(this@ItaintaBackgroundPoiService)
                    .getString(ListeningHistoryStore.PREF_ACCESS_TOKEN, "")
                val requestBuilder = Request.Builder()
                    .url(WipApi.BASE + "/api/poi/batch-teaser")
                    .post(body)
                if (!accessToken.isNullOrBlank()) {
                    requestBuilder.addHeader("Authorization", "Bearer $accessToken")
                }
                val request = requestBuilder.build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        Log.d(TAG, "Batch teaser generation requested successfully (HTTP ${response.code})")
                    } else {
                        Log.w(TAG, "Batch teaser: HTTP ${response.code} (token ${if (accessToken.isNullOrBlank()) "assente" else "presente"})")
                        // (SEC-03) Token scaduto: il JS deve rinnovarlo.
                        if (response.code == 401 && !accessToken.isNullOrBlank()) {
                            WipApi.notifyTokenExpired(this@ItaintaBackgroundPoiService)
                        }
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

    // (23/08/2026) I due PendingIntent della notifica persistente sono SEMPRE
    // gli stessi (stesso requestCode 0, stesso intent, FLAG_IMMUTABLE): prima
    // se ne costruivano due nuovi a ogni ricostruzione, cioe' ogni 5 s, e
    // ognuno e' una chiamata al sistema. Si creano una volta e si riusano.
    private var pStopCache: PendingIntent? = null
    private var pOpenCache: PendingIntent? = null
    // Testo dell'ultima notifica pubblicata: se non e' cambiato non si
    // ripubblica nulla (il contenuto sullo schermo sarebbe identico).
    private var ultimaNotificaKey: String? = null

    private fun buildNotification(title: String, text: String): Notification =
        buildNotification(title, text, dayPassSuffix())

    /**
     * (AUD-14) PendingIntent verso questo servizio per le azioni sulla coda
     * vocale. getForegroundService su O+: il tocco arriva con l'app in
     * background e un getService verrebbe scartato dal sistema.
     */
    private fun speechActionIntent(action: String, requestCode: Int): PendingIntent {
        val i = Intent(this, ItaintaBackgroundPoiService::class.java).setAction(action)
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(this, requestCode, i, flags)
        } else {
            PendingIntent.getService(this, requestCode, i, flags)
        }
    }

    /** Stato della voce nativa, parte della chiave anti-duplicato della notifica. */
    private fun voiceStateKey(): String = when {
        !GeofenceBroadcastReceiver.isVoiceActive() -> "muta"
        GeofenceBroadcastReceiver.isVoicePaused() -> "pausa"
        else -> "parla"
    }

    // ── CRUSCOTTO DEL NAVIGATORE (28/08/2026) ─────────────────────────────
    // Quando il giro e' in corso il JS spinge qui titolo e corpo della tappa
    // corrente. Finche' restano valorizzati PRENDONO IL POSTO del testo del
    // radar in ogni ricostruzione della notifica: cosi' un qualunque altro
    // updateNotificationAndStatus ("N luoghi monitorati", "Ricerca POI in
    // corso...") non cancella il cruscotto dal display spento.
    @Volatile private var navBannerTitolo: String? = null
    @Volatile private var navBannerCorpo: String? = null

    /** Parte della chiave anti-duplicato: senza, cambiando solo il banner la
     *  notifica non verrebbe ripubblicata. */
    private fun navBannerKey(): String = "${navBannerTitolo.orEmpty()}|${navBannerCorpo.orEmpty()}"

    /**
     * Accende/spegne il cruscotto e ripubblica subito la notifica persistente.
     * Con `attivo=false` si torna all'ultimo titolo/testo del radar.
     */
    private fun applicaNavBanner(titolo: String?, corpo: String?, attivo: Boolean) {
        if (attivo) {
            navBannerTitolo = titolo?.trim()?.takeIf { it.isNotEmpty() }
            navBannerCorpo = corpo?.trim()
        } else {
            navBannerTitolo = null
            navBannerCorpo = null
        }
        try {
            val suffix = dayPassSuffix()
            val key = "$ultimoTitolo $ultimoTesto $suffix ${voiceStateKey()} ${navBannerKey()}"
            if (key == ultimaNotificaKey) return
            ultimaNotificaKey = key
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification(ultimoTitolo, ultimoTesto, suffix))
        } catch (e: Exception) {
            Log.w(TAG, "Aggiornamento banner navigazione fallito: ${e.message}")
        }
    }

    private fun buildNotification(title: String, text: String, suffix: String): Notification {
        val pStop = pStopCache ?: PendingIntent.getService(
            this, 0,
            Intent(this, ItaintaBackgroundPoiService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE
        ).also { pStopCache = it }
        val pOpen = pOpenCache ?: PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        ).also { pOpenCache = it }
        // Cruscotto del navigatore attivo: prende il posto di titolo e testo
        // del radar (niente suffisso del Day Pass, che qui sarebbe rumore) e
        // usa BigTextStyle perche' il corpo e' su piu' righe (svolta, metri,
        // ETA, tappa dopo). Nessuna seconda notifica: e' sempre la stessa.
        val bannerTitolo = navBannerTitolo
        val bannerAttivo = !bannerTitolo.isNullOrBlank()
        val titoloFinale = if (bannerAttivo) bannerTitolo!! else title
        val testoFinale = if (bannerAttivo) navBannerCorpo.orEmpty() else (text + suffix)
        val builder = NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(titoloFinale).setContentText(testoFinale)
            .setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).setContentIntent(pOpen)
        if (bannerAttivo) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(testoFinale))
            // Il cruscotto ha senso solo nell'ordine in cui e' arrivato:
            // niente suono/vibrazione, e in cima al gruppo delle "in corso".
            builder.setOnlyAlertOnce(true)
        }
        // (AUD-14) Con la voce nativa in corso (teaser o guida del Day Pass
        // nel MediaPlayer del receiver, senza MediaSession) l'unico comando
        // era «Stop», che spegneva TUTTO il servizio. Pausa/Riprendi e Salta
        // agiscono solo sulla coda vocale.
        if (GeofenceBroadcastReceiver.isVoiceActive()) {
            val inPausa = GeofenceBroadcastReceiver.isVoicePaused()
            builder.addAction(
                if (inPausa) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause,
                if (inPausa) "Riprendi" else "Pausa",
                speechActionIntent(if (inPausa) ACTION_SPEECH_RESUME else ACTION_SPEECH_PAUSE, if (inPausa) 12 else 11)
            )
            builder.addAction(android.R.drawable.ic_media_next, "Salta", speechActionIntent(ACTION_SPEECH_SKIP, 13))
        }
        return builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", pStop).build()
    }

    // Ultimo titolo/testo pubblicati: servono a ricostruire la stessa riga
    // quando cambia solo lo stato della voce (tasti Pausa/Salta).
    @Volatile private var ultimoTitolo = "Audioguida attiva"
    @Volatile private var ultimoTesto = "Acquisizione posizione..."

    /** (AUD-14) Ripubblica la notifica con i tasti della voce aggiornati. */
    private fun refreshNotificationForVoice() {
        try {
            if (!getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).getBoolean("isServiceActive", false)) return
            val suffix = dayPassSuffix()
            val key = "$ultimoTitolo $ultimoTesto $suffix ${voiceStateKey()} ${navBannerKey()}"
            if (key == ultimaNotificaKey) return
            ultimaNotificaKey = key
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification(ultimoTitolo, ultimoTesto, suffix))
        } catch (e: Exception) {
            Log.w(TAG, "Refresh notifica per la voce fallito: ${e.message}")
        }
    }

    private fun updateNotificationAndStatus(title: String, text: String) {
        // RadarState ed evento al JS restano SEMPRE (il web li usa per lo
        // stato del radar): si evita solo la notify quando la riga sullo
        // schermo sarebbe identica a quella gia' visibile.
        val suffix = dayPassSuffix()
        ultimoTitolo = title
        ultimoTesto = text
        val key = "$title $text $suffix ${voiceStateKey()} ${navBannerKey()}"
        if (key != ultimaNotificaKey) {
            ultimaNotificaKey = key
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification(title, text, suffix))
        }
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
        onVoiceStateChanged = null
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
        ActivityMonitor.stop(this)
        // Guida spenta: via anche il sensore di orientamento e i rinvii in
        // sospeso del gate di bussola (vivono in memoria, non si persistono).
        BearingGate.disattiva()
        BearingGate.azzera()

        // Suggerimento al GC e rilascio risorse pesanti
        currentPois = emptyList()
        RadarState.setActive(false)

        super.onDestroy()
        Log.d(TAG, "Service destroyed and resources cleared")
    }
}
