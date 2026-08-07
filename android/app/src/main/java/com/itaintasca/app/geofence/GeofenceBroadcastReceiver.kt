package com.itaintasca.app.geofence

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.Location
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.LocationServices
import com.itaintasca.app.MainActivity
import com.itaintasca.app.R
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.db.TriggerState
import com.itaintasca.app.db.TriggerStateEntity
import com.itaintasca.app.db.toPoiEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.itaintasca.app.service.SupabaseClient
import org.json.JSONObject
import org.json.JSONArray
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue

class GeofenceBroadcastReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "GeofenceReceiver"

        // Un POI già "arrivato" può ritriggerare: dopo 24h in ogni caso (turista che
        // torna il giorno dopo), oppure quando esce dal raggio dopo almeno 30 min
        // (giro dell'isolato ≠ nuova visita).
        private const val ARRIVAL_RETRIGGER_TTL_MS = 24 * 60 * 60 * 1000L
        private const val EXIT_ARRIVAL_GRACE_MS = 30 * 60 * 1000L

        // Stato teaser condiviso col JS (via prefs + eventi plugin)
        const val PREF_TEASER_SPEAKING = "teaser_speaking"
        const val PREF_TEASER_SPEAKING_POI = "teaser_speaking_poi"
        const val PREF_TEASER_LAST_POI = "teaser_last_poi"
        const val PREF_TEASER_LAST_FINISHED_AT = "teaser_last_finished_at"

        // Singleton TTS per evitare sovrapposizioni
        @Volatile
        private var ttsInstance: TextToSpeech? = null
        @Volatile
        private var ttsReady = false

        // Coda audio sequenziale
        private val speechQueue = ConcurrentLinkedQueue<SpeechItem>()
        @Volatile
        private var isSpeaking = false
        @Volatile
        private var activeItem: SpeechItem? = null
        // AudioFocusRequest (solo O+), tenuto come Any per non referenziare la classe su API < 26
        @Volatile
        private var activeFocusRequest: Any? = null
        private val safetyHandler = Handler(Looper.getMainLooper())
        private var safetyRunnable: Runnable? = null

        data class SpeechItem(
            val text: String,
            val isGem: Boolean,
            val isItinerary: Boolean = false,
            val poiId: String? = null,
            val priority: Int, // 0 = massima (itinerario), 1 = gemma, 2 = normale
            val kind: String = "arrival" // arrival | approach
        )

        // Mappa tra categorie UI (del setup) e categorie DB reali
        // Tenere allineata a isCategoryAllowed (src/hooks/useGeofencing.ts) e a
        // categoryMap in SupabaseClient.kt
        // Pubblica: è la copia canonica, usata anche dal filtro offline del service.
        val CATEGORY_MAP = mapOf(
            "monumenti" to listOf("monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti"),
            "musei" to listOf("museum", "gallery", "musei"),
            "chiese" to listOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"),
            "panorami" to listOf("viewpoint", "park", "panorami"),
            "locali" to listOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
            // Sync con CategoryChips/MapArea web: esperienze_locali eliminata,
            // i mercati (marketplace) confluiscono in utilita
            "utilita" to listOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"),
            "famiglie" to listOf("playground", "theme_park", "aquarium", "zoo", "famiglie")
        )

        /**
         * Ferma subito il teaser nativo e svuota la coda. Chiamato dal JS (plugin)
         * quando l'app sta per avviare l'audioguida completa, per evitare che le
         * due voci si sovrappongano.
         */
        fun stopSpeaking(context: Context) {
            speechQueue.clear()
            try { ttsInstance?.stop() } catch (_: Exception) { }
            // Se onStop del TTS non arriva (engine capricciosi), chiudiamo comunque lo stato
            finishActiveSpeech(context.applicationContext, notifyJs = true)
        }

        fun enqueue(context: Context, item: SpeechItem) {
            speechQueue.add(item)
            processNextSpeech(context.applicationContext)
        }

        private fun processNextSpeech(appContext: Context) {
            val prefs = appContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("isServiceActive", false)) {
                speechQueue.clear()
                isSpeaking = false
                return
            }

            // Durante una telefonata non parliamo sopra la voce: riproviamo tra poco
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (am.mode == AudioManager.MODE_IN_CALL || am.mode == AudioManager.MODE_IN_COMMUNICATION) {
                safetyHandler.postDelayed({ processNextSpeech(appContext) }, 8000L)
                return
            }

            val next: SpeechItem
            synchronized(this) {
                if (isSpeaking) return
                val sorted = speechQueue.toList().sortedWith(compareBy({ it.priority }, { if (it.isItinerary) 0 else 1 }))
                speechQueue.clear()
                sorted.forEach { speechQueue.add(it) }
                next = speechQueue.poll() ?: return
                isSpeaking = true
                activeItem = next
            }

            Handler(Looper.getMainLooper()).post {
                initTtsIfNeeded(appContext) {
                    requestFocus(appContext)

                    // Chime di avviso prima della voce
                    try {
                        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                        RingtoneManager.getRingtone(appContext, uri).play()
                    } catch (_: Exception) { }

                    // Stato "sto parlando" persistito: il JS può interrogarlo anche a cold start
                    prefs.edit()
                        .putBoolean(PREF_TEASER_SPEAKING, true)
                        .putString(PREF_TEASER_SPEAKING_POI, next.poiId ?: "")
                        .apply()
                    broadcastTeaserEvent(appContext, "teaserStarted", next)

                    val params = Bundle()
                    params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
                    val result = ttsInstance?.speak(
                        next.text,
                        TextToSpeech.QUEUE_ADD,
                        params,
                        "GEOFENCE_${next.poiId ?: "x"}_${System.currentTimeMillis()}"
                    ) ?: TextToSpeech.ERROR

                    if (result != TextToSpeech.SUCCESS) {
                        Log.e(TAG, "tts.speak() returned error, skipping item")
                        finishActiveSpeech(appContext, notifyJs = true)
                        processNextSpeech(appContext)
                        return@initTtsIfNeeded
                    }

                    // Watchdog anti-blocco: se onDone non arriva mai (bug di alcuni engine),
                    // la coda non deve restare inchiodata su isSpeaking=true.
                    val maxMs = (8000L + next.text.length * 120L).coerceAtMost(60000L)
                    val guard = Runnable {
                        Log.w(TAG, "Speech watchdog fired, resetting queue state")
                        try { ttsInstance?.stop() } catch (_: Exception) { }
                        finishActiveSpeech(appContext, notifyJs = true)
                        processNextSpeech(appContext)
                    }
                    safetyRunnable = guard
                    safetyHandler.postDelayed(guard, maxMs)
                }
            }
        }

        /** Chiusura idempotente dell'item corrente: focus, prefs, evento JS. */
        private fun finishActiveSpeech(appContext: Context, notifyJs: Boolean) {
            val item: SpeechItem?
            synchronized(this) {
                item = activeItem
                activeItem = null
                isSpeaking = false
                safetyRunnable?.let { safetyHandler.removeCallbacks(it) }
                safetyRunnable = null
            }
            abandonFocus(appContext)

            val ed = appContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE).edit()
            ed.putBoolean(PREF_TEASER_SPEAKING, false)
            ed.putString(PREF_TEASER_SPEAKING_POI, "")
            if (item?.poiId != null) {
                ed.putString(PREF_TEASER_LAST_POI, item.poiId)
                ed.putLong(PREF_TEASER_LAST_FINISHED_AT, System.currentTimeMillis())
            }
            ed.apply()

            if (notifyJs && item != null) broadcastTeaserEvent(appContext, "teaserFinished", item)
        }

        private fun onUtteranceFinished(appContext: Context) {
            val finished = activeItem
            finishActiveSpeech(appContext, notifyJs = true)
            if (finished?.isItinerary == true) showCheckInNotification(appContext, finished.poiId ?: "")
            processNextSpeech(appContext)
        }

        private fun initTtsIfNeeded(context: Context, onReady: () -> Unit) {
            val appContext = context.applicationContext
            if (ttsInstance != null && ttsReady) {
                applyTtsConfig(appContext)
                onReady()
                return
            }
            synchronized(this) {
                if (ttsInstance != null && ttsReady) {
                    applyTtsConfig(appContext)
                    onReady()
                    return
                }
                // Context dell'applicazione per evitare leak del receiver/attività
                ttsInstance = TextToSpeech(appContext) { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        ttsReady = true
                        applyTtsConfig(appContext)
                        attachProgressListener(appContext)
                        onReady()
                    } else {
                        ttsReady = false
                        Log.e(TAG, "TTS Initialization failed")
                        finishActiveSpeech(appContext, notifyJs = true)
                    }
                }
            }
        }

        /**
         * Il TTS deve suonare come "istruzione di navigazione" (stessa classe audio di
         * Google Maps): così duck-a Spotify, esce sulle casse dell'auto via Bluetooth
         * e rispetta il focus richiesto. Senza setAudioAttributes il TTS parla come
         * USAGE_MEDIA e il focus richiesto non corrisponde all'audio riprodotto.
         */
        private fun applyTtsConfig(appContext: Context) {
            val tts = ttsInstance ?: return
            try {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                tts.setAudioAttributes(attrs)
            } catch (_: Exception) { }

            val lang = appContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                .getString("language", "it") ?: "it"
            val locale = when (lang) {
                "en" -> Locale.ENGLISH
                "fr" -> Locale.FRENCH
                "es" -> Locale("es", "ES")
                "de" -> Locale.GERMAN
                "ru" -> Locale("ru", "RU")
                "zh" -> Locale.SIMPLIFIED_CHINESE
                else -> Locale.ITALIAN
            }
            try {
                val result = tts.setLanguage(locale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    // Fallback inglese: per un utente RU/ZH senza voce locale
                    // installata è meno straniante dell'italiano.
                    tts.language = if (lang == "it") Locale.ITALIAN else Locale.ENGLISH
                }
            } catch (_: Exception) { }
        }

        private fun attachProgressListener(appContext: Context) {
            ttsInstance?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) { }
                override fun onDone(utteranceId: String?) { onUtteranceFinished(appContext) }
                override fun onError(utteranceId: String?) { onUtteranceFinished(appContext) }
                override fun onStop(utteranceId: String?, interrupted: Boolean) { onUtteranceFinished(appContext) }
            })
        }

        private fun requestFocus(appContext: Context) {
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener { change ->
                        // Se qualcuno ci porta via il focus (es. chiamata in arrivo,
                        // prompt del navigatore), tacere subito è la scelta pulita.
                        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                            try { ttsInstance?.stop() } catch (_: Exception) { }
                        }
                    }
                    .build()
                activeFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        }

        private fun abandonFocus(appContext: Context) {
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                (activeFocusRequest as? AudioFocusRequest)?.let {
                    try { am.abandonAudioFocusRequest(it) } catch (_: Exception) { }
                }
                activeFocusRequest = null
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(null)
            }
        }

        private fun broadcastTeaserEvent(appContext: Context, event: String, item: SpeechItem) {
            val data = JSONObject().apply {
                put("poiId", item.poiId ?: "")
                put("kind", item.kind)
            }
            val intent = Intent("com.itaintasca.POI_EVENT").apply {
                setPackage(appContext.packageName)
                putExtra("event", event)
                putExtra("data1", data.toString())
                item.poiId?.let { putExtra("poiId", it) }
            }
            appContext.sendBroadcast(intent)
        }

        private fun showCheckInNotification(context: Context, poiId: String) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val intent = Intent(context, MainActivity::class.java).apply {
                action = "ACTION_CHECKIN"
                putExtra("poiId", poiId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pIntent = PendingIntent.getActivity(context, 9999, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val builder = NotificationCompat.Builder(context, "geofencing_channel")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Tappa completata! ✅")
                .setContentText("Vuoi passare alla prossima destinazione?")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setAutoCancel(true)
                .setContentIntent(pIntent)
                .setVibrate(longArrayOf(0, 200, 100, 200))
            nm.notify(9999, builder.build())
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val isReallyActive = prefs.getBoolean("isServiceActive", false)
        if (!isReallyActive) return

        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) {
            Log.e(TAG, "Geofencing error: ${event.errorCode}")
            return
        }

        val transition = event.geofenceTransition
        val triggeringGeofences = event.triggeringGeofences ?: return
        val db = PoiDatabase.getInstance(context)
        val pendingResult = goAsync()

        val isAutomaticMode = prefs.getBoolean("isAutomaticMode", true)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (transition) {
                    Geofence.GEOFENCE_TRANSITION_ENTER -> handleEnterTransitions(
                        context, triggeringGeofences, db, isAutomaticMode
                    )
                    Geofence.GEOFENCE_TRANSITION_EXIT -> handleExitTransitions(
                        context, triggeringGeofences, db
                    )
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private suspend fun handleEnterTransitions(
        context: Context,
        geofences: List<Geofence>,
        db: PoiDatabase,
        isAutomaticMode: Boolean
    ) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val selectedCats = prefs.getStringSet("selectedCategories", emptySet())?.toList() ?: emptyList()

        // Otteniamo la posizione precisa attuale per un check di distanza reale.
        // Fail-closed: senza un fix RECENTE e PRECISO ogni ENTER è sospetto —
        // indoor/seminterrato l'OS lavora su posizioni di rete con incertezza
        // di km e può dichiarare l'ingresso in tutti i geofence del radar.
        // Meglio il silenzio di un'audioguida che "visita" tutto da ferma.
        val maxAccuracyM = 100f
        val maxFixAgeMs = 2 * 60_000L
        val currentLoc = getCurrentPreciseLocation(context)
        if (currentLoc == null ||
            !currentLoc.hasAccuracy() || currentLoc.accuracy > maxAccuracyM ||
            (System.currentTimeMillis() - currentLoc.time) > maxFixAgeMs
        ) {
            Log.w(TAG, "Skipping geofence batch: unreliable fix (acc=${currentLoc?.accuracy}, age=${currentLoc?.let { System.currentTimeMillis() - it.time }}ms)")
            return
        }

        // Raggi REALI configurati (prima erano hardcoded 40/160: in auto un
        // trigger legittimo a 350m veniva scartato come falso)
        val gMode = prefs.getString("guideMode", "walking") ?: "walking"
        val isDrivingMode = gMode == "driving"
        val alertRad = prefs.getFloat(if (isDrivingMode) "alertRadiusCar" else "alertRadiusWalk", if (isDrivingMode) 300f else 150f)
        val arrivalRad = prefs.getFloat(if (isDrivingMode) "arrivalRadiusCar" else "arrivalRadiusWalk", if (isDrivingMode) 50f else 30f)

        data class GeofenceInfo(
            val requestId: String,
            val poiId: String,
            val type: String,
            val isGem: Boolean,
            val isItinerary: Boolean,
            val realDist: Float
        )

        val infos = mutableListOf<GeofenceInfo>()
        for (geofence in geofences) {
            val requestId = geofence.requestId
            val poiId = requestId.substringBeforeLast("_")
            val type = requestId.substringAfterLast("_")
            if (type != "approach" && type != "arrival") continue

            val poi = db.poiDao().getPoiById(poiId) ?: continue

            // Filtro Maniacale Categorie nel Geofencing OS
            if (!isPoiCategoryActive(poi, selectedCats)) continue

            val poiLoc = Location("").apply {
                latitude = poi.entranceLat ?: poi.lat
                longitude = poi.entranceLon ?: poi.lon
            }
            val distance = currentLoc.distanceTo(poiLoc)

            infos.add(GeofenceInfo(requestId, poiId, type, poi.isGem, poi.isFromItinerary, distance))
        }

        // Ordina: Itinerario prima, poi Gemme, poi per distanza reale
        val sorted = infos.sortedWith(
            compareByDescending<GeofenceInfo> { it.isItinerary }
            .thenByDescending { it.isGem }
            .thenBy { it.realDist }
        )

        // Anti-spam: se in un unico batch scattano più "approach" (piazza densa),
        // solo il più prioritario parla; gli altri restano su vibrazione+notifica.
        var approachSpokenInBatch = false

        for (info in sorted) {
            val poi = db.poiDao().getPoiById(info.poiId) ?: continue
            val triggerEntity = db.poiDao().getTriggerState(info.poiId)
            val triggerState = triggerEntity?.state ?: TriggerState.PENDING

            // ✅ [SICUREZZA DISTANZA] - Trigger accettato solo se la distanza
            // reale è compatibile col raggio configurato (+ margine per
            // l'incertezza del fix). Evita i falsi allarmi da GPS jitter.
            val targetRadius = if (info.type == "arrival") arrivalRad else alertRad
            val distLimit = targetRadius * 2.5f + currentLoc.accuracy
            if (info.realDist > distLimit) {
                Log.w(TAG, "Geofence fake trigger for ${poi.nome}: real dist ${info.realDist}m > limit ${distLimit}m")
                continue
            }

            if (info.type == "approach" && triggerState == TriggerState.PENDING) {
                if (checkBearingFilter(currentLoc, poi.lat, poi.lon)) {
                    handleApproach(context, info.poiId, poi.nome, poi.guideDefault, poi.isGem, info.isItinerary, db, speak = !approachSpokenInBatch)
                    approachSpokenInBatch = true
                }
            } else if (info.type == "arrival") {
                // ARRIVED_FIRED scade dopo 24h: un POI rivisitato il giorno dopo
                // torna a triggerare (prima restava muto per sempre).
                val arrivedRecently = triggerState == TriggerState.ARRIVED_FIRED &&
                    triggerEntity != null &&
                    (System.currentTimeMillis() - triggerEntity.updatedAt) < ARRIVAL_RETRIGGER_TTL_MS
                if (!arrivedRecently) {
                    // ✅ [ROBUSTEZZA] - Permettiamo l'arrivo anche se l'approccio è stato saltato (es. marcia veloce)
                    handleArrival(context, info.poiId, poi.nome, poi.guideDefault, poi.isGem, info.isItinerary, isAutomaticMode, db)
                }
            }
        }
    }

    private suspend fun handleExitTransitions(
        context: Context,
        geofences: List<Geofence>,
        db: PoiDatabase
    ) {
        for (geofence in geofences) {
            val requestId = geofence.requestId

            // Sentinella della sliding window: l'utente è uscito dal raggio della
            // finestra registrata → rilancia il servizio, che ri-registra i
            // geofence dal DB (rete o pacchetto offline). Copre il Doze profondo
            // in cui gli update GPS del servizio possono essere strozzati.
            if (requestId == SlidingWindowLogic.SENTINEL_ID) {
                try {
                    val i = Intent(context, com.itaintasca.app.service.ItaintaBackgroundPoiService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(i)
                    } else {
                        context.startService(i)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Sentinel service restart failed: ${e.message}")
                }
                continue
            }

            val poiId = requestId.substringBeforeLast("_")
            val type = requestId.substringAfterLast("_")
            if (type != "exit") continue
            val entity = db.poiDao().getTriggerState(poiId) ?: continue
            when (entity.state) {
                TriggerState.APPROACH_FIRED -> {
                    db.poiDao().deleteTriggerState(poiId)
                    sendEventToPlugin(context, "poiExited", poiId, "")
                }
                TriggerState.ARRIVED_FIRED -> {
                    // Uscita "vera" (visita durata almeno 30 min): il POI torna
                    // disponibile per una futura visita, senza il rimbalzo del
                    // giro dell'isolato.
                    if (System.currentTimeMillis() - entity.updatedAt > EXIT_ARRIVAL_GRACE_MS) {
                        db.poiDao().deleteTriggerState(poiId)
                        sendEventToPlugin(context, "poiExited", poiId, "")
                    }
                }
                else -> { }
            }
        }
    }

    private suspend fun getCurrentPreciseLocation(context: Context): Location? {
        return try {
            val fusedClient = LocationServices.getFusedLocationProviderClient(context)
            // Usiamo il valore più preciso disponibile immediatamente
            val location = fusedClient.getCurrentLocation(
                com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY,
                null
            ).await()
            location ?: fusedClient.lastLocation.await()
        } catch (e: Exception) {
            null
        }
    }

    private fun checkBearingFilter(location: Location, poiLat: Double, poiLon: Double): Boolean {
        // Usa il fix preciso già ottenuto in handleEnterTransitions: la vecchia
        // versione leggeva Task.result in modo sincrono, che lancia eccezione se
        // il task non è completo — il filtro risultava quasi sempre un no-op.
        try {
            // Accuratezza: Se la posizione è troppo imprecisa (> 50m), ignoriamo il bearing filter
            if (location.accuracy > 50) return true

            if (!location.hasBearing() || location.speed < 0.3f) return true
            val bearingToPoi = location.bearingTo(Location("").apply { latitude = poiLat; longitude = poiLon })
            val userBearing = location.bearing
            var angleDiff = Math.abs(bearingToPoi - userBearing)
            if (angleDiff > 180) angleDiff = 360 - angleDiff
            return angleDiff <= 60
        } catch (e: Exception) { return true }
    }

    private suspend fun handleApproach(
        context: Context, poiId: String, name: String, guide: String, isGem: Boolean, isItinerary: Boolean, db: PoiDatabase, speak: Boolean = true
    ) {
        val poi = db.poiDao().getPoiById(poiId) ?: return
        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.APPROACH_FIRED))
        sendEventToPlugin(context, "poiApproaching", poiId, name, poi.lat, poi.lon)

        // ✅ [PREDICTIVE TEASER] - Chiediamo a DeepSeek di preparare il teaser ORA (a 150m)
        // Solo con rete utilizzabile: offline sarebbe un timeout a vuoto.
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val lang = prefs.getString("language", "it") ?: "it"
        if (com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)) {
            triggerTeaserGeneration(poiId, lang)
        }

        // Messaggio localizzato: prima era italiano fisso anche per utenti EN/FR/ES/DE
        val approachMsg = when (lang) {
            "en" -> "You are approaching $name"
            "fr" -> "Vous approchez de $name"
            "es" -> "Te estás acercando a $name"
            "de" -> "Sie nähern sich $name"
            "ru" -> "Вы приближаетесь к $name"
            "zh" -> "您正在接近$name"
            else -> "Ti stai avvicinando a $name"
        }

        val prefix = if (isItinerary) "📍 Tappa: " else if (isGem) "💎 " else ""
        val priority = if (isItinerary) 0 else if (isGem) 1 else 2
        if (speak) {
            enqueue(context, SpeechItem("$prefix$approachMsg", isGem, isItinerary, poiId, priority, kind = "approach"))
        }
        vibrate(context, if (isItinerary || isGem) longArrayOf(0, 300, 100, 500) else longArrayOf(0, 500))
        val notifTitle = if (isItinerary) "📍 Tappa Itinerario" else "Esplorazione"
        showNotification(context, "$notifTitle: $name", "Distanza: circa 150m. Tocca per i dettagli.", poiId, guide, false)
    }

    private suspend fun handleArrival(
        context: Context, poiId: String, name: String, guide: String, isGem: Boolean, isItinerary: Boolean, isAutomaticMode: Boolean, db: PoiDatabase
    ) {
        var poi = db.poiDao().getPoiById(poiId)
        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.ARRIVED_FIRED))
        sendEventToPlugin(context, "poiArrived", poiId, name, poi?.lat ?: 0.0, poi?.lon ?: 0.0)

        val priority = if (poi?.isFromItinerary == true) 0 else 1

        // --- LOGICA TEASER MULTILINGUA ---
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val lang = prefs.getString("language", "it") ?: "it"

        // ✅ [RECOVERY] - Teaser nullo: prima il pacchetto offline locale (gratis
        // e disponibile sempre), poi il server — ma solo con rete utilizzabile
        // (offline il vecchio fetch bloccava il receiver per 15s di timeout).
        if (poi?.teaserText.isNullOrBlank()) {
            val offlinePoi = db.offlineDao().getPoiById(poiId)
            if (offlinePoi != null && !offlinePoi.teaserText.isNullOrBlank()) {
                val recovered = offlinePoi.toPoiEntity()
                poi = recovered
                db.poiDao().insertPois(listOf(recovered))
            } else if (com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)) {
                val freshPoi = SupabaseClient().fetchPoiById(poiId, lang)
                if (freshPoi != null && !freshPoi.teaserText.isNullOrBlank()) {
                    poi = freshPoi
                    db.poiDao().insertPois(listOf(freshPoi)) // Aggiorna cache locale
                }
            }
        }

        val arrivalMsg = when (lang) {
            "en" -> "You arrived at $name."
            "fr" -> "Vous êtes arrivés a $name."
            "es" -> "Has llegado a $name."
            "de" -> "Sie sind in $name angekommen."
            "ru" -> "Вы прибыли в $name."
            "zh" -> "您已到达$name。"
            else -> "Sei arrivato a $name."
        }

        val fallbackTeaser = when (lang) {
            "en" -> "Open the app to discover the secrets of this place."
            "fr" -> "Ouvrez l'application pour découvrir les secrets de ce lieu."
            "es" -> "Abre la aplicación para descubrir los secretos de este lugar."
            "de" -> "Öffnen Sie die App, um die Geheimnisse dieses Ortes zu entdecken."
            "ru" -> "Откройте приложение, чтобы узнать секреты этого места."
            "zh" -> "打开应用，探索这个地方的秘密。"
            else -> "Apri l'app per scoprire i segreti di questo luogo."
        }

        val teaser = poi?.teaserText
        val fullMsg = if (!teaser.isNullOrBlank()) "$arrivalMsg $teaser" else "$arrivalMsg $fallbackTeaser"

        enqueue(context, SpeechItem(fullMsg, isGem, isItinerary, poiId, priority, kind = "arrival"))
        vibrate(context, longArrayOf(0, 400, 200, 400))

        // DAY PASS: con pass attivo WIP fa tutto da solo — dopo il teaser accoda
        // l'audioguida COMPLETA (+ info aggiuntive) in coda TTS, online e
        // offline, senza mai aprire l'app. Il contatore vive in prefs, quindi
        // il cap regge anche a display spento e senza rete.
        // Senza pass il teaser resta gratuito; l'ascolto completo passa dal
        // tasto "Ascolta" (per-listen a crediti, plugin playOfflineGuide).
        // Solo con app NON in foreground: in foreground se ne occupa il JS
        // (mai due voci sovrapposte).
        if (isAutomaticMode && !isAppInForeground(context)) {
            val passUsed = prefs.getInt("daypass_used", 0)
            val passActive = com.itaintasca.app.offline.BillingLogic.isPassActive(
                System.currentTimeMillis(),
                prefs.getLong("daypass_expires_at", 0L),
                passUsed,
                prefs.getInt("daypass_cap", 0)
            )
            if (passActive) {
                var fullText = db.offlineDao().getPoiById(poiId)?.audioText
                if (fullText.isNullOrBlank() &&
                    com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)
                ) {
                    fullText = SupabaseClient().fetchPoiAudioText(poiId)
                }
                if (!fullText.isNullOrBlank()) {
                    prefs.edit().putInt("daypass_used", passUsed + 1).apply()
                    enqueue(context, SpeechItem(fullText, isGem, isItinerary, poiId, priority, kind = "arrival"))
                    // Info aggiuntive incluse nel pass (1 livello): la descrizione
                    // breve se distinta dal testo guida.
                    val extra = db.offlineDao().getPoiById(poiId)?.descriptionShort
                    if (!extra.isNullOrBlank() && extra != fullText && !fullText.contains(extra)) {
                        enqueue(context, SpeechItem(extra, isGem, isItinerary, poiId, priority, kind = "arrival"))
                    }
                }
            }
        }

        if (isAutomaticMode) {
            showNotification(context, "Sei arrivato!", "Avvio audioguida di $name", poiId, guide, true)
            launchApp(context, poiId, guide)
        } else {
            showNotification(context, "Arrivo a $name", "Tocca per ascoltare la storia", poiId, guide, true)
        }
    }

    private fun triggerTeaserGeneration(poiId: String, lang: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val client = OkHttpClient()
                val body = JSONObject().apply {
                    put("poiIds", JSONArray(listOf(poiId)))
                    put("lang", lang)
                }.toString().toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url("https://itainta.vercel.app/api/poi/batch-teaser")
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        Log.d(TAG, "Predictive teaser requested for $poiId")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Teaser trigger failed: ${e.message}")
            }
        }
    }

    private fun isAppInForeground(context: Context): Boolean {
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            am.runningAppProcesses?.any {
                it.processName == context.packageName &&
                    it.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            } ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun isPoiCategoryActive(poi: PoiEntity, selected: List<String>): Boolean {
        if (poi.isFromItinerary) return true
        if (poi.isGem) return true
        val cat = (poi.poiType ?: "").lowercase()
        if (selected.contains(cat)) return true
        for (uiCat in selected) {
            if (CATEGORY_MAP[uiCat]?.contains(cat) == true) return true
        }
        return false
    }

    private fun vibrate(context: Context, pattern: LongArray) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        else { @Suppress("DEPRECATION") vibrator.vibrate(pattern, -1) }
    }

    private fun showNotification(context: Context, title: String, text: String, poiId: String, guide: String, isArrival: Boolean = false) {
        val channelId = "geofencing_channel"
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = if (isArrival) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
            val chan = NotificationChannel(channelId, "Eventi POI", importance)
            nm.createNotificationChannel(chan)
        }
        val uri = Uri.parse("itainta://poi/$poiId?guide=$guide")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setClass(context, MainActivity::class.java)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pIntent = PendingIntent.getActivity(context, poiId.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(if (isArrival) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (isArrival) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(pIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (isArrival) {
            // ✅ SVEGLIA DISPLAY: Forza il popup a comparsa (Heads-up) e permette di accendere lo schermo
            builder.setFullScreenIntent(pIntent, true)
            builder.setVibrate(longArrayOf(0, 500, 200, 500))
        }

        nm.notify(poiId.hashCode(), builder.build())
    }

    private fun launchApp(context: Context, poiId: String, guide: String) {
        try {
            val uri = Uri.parse("itainta://poi/$poiId?guide=$guide")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setClass(context, MainActivity::class.java)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            // Su Android 10+ il background activity start è bloccato: ci pensa la
            // notifica full-screen. Qui non deve mai crashare il receiver.
            Log.w(TAG, "launchApp blocked/failed: ${e.message}")
        }
    }

    private fun sendEventToPlugin(context: Context, event: String, poiId: String, poiName: String, lat: Double = 0.0, lon: Double = 0.0) {
        val jsonData = JSONObject().apply {
            put("poiId", poiId)
            put("poiName", poiName)
            put("lat", lat)
            put("lon", lon)
        }.toString()
        val intent = Intent("com.itaintasca.POI_EVENT").apply {
            setPackage(context.packageName)
            putExtra("event", event)
            putExtra("data1", jsonData)
            putExtra("poiId", poiId)
            putExtra("poiName", poiName)
            putExtra("lat", lat)
            putExtra("lon", lon)
        }
        context.sendBroadcast(intent)
    }
}
