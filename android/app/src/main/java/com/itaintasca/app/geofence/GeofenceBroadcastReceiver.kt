package com.itaintasca.app.geofence

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
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

        // Cooldown anti-rimbalzo dopo un'uscita (stato EXITED), port di
        // BackgroundPoiManager.swift:36,39. Pubblici: anche il valutatore
        // predittivo del servizio li usa per il re-approach post-EXITED.
        // - avvicinamento: 30 min prima di RI-annunciare un POI già uscito
        //   dall'isteresi (GPS che rimbalza fra le chiome ≠ nuova visita);
        // - arrivo: 10 min prima di riaccettare un arrivo dopo un'uscita
        //   (un rientro immediato nel cerchio è quasi sempre rumore GPS).
        const val APPROACH_RETRIGGER_COOLDOWN_MS = 30 * 60 * 1000L
        const val ARRIVAL_AFTER_EXIT_COOLDOWN_MS = 10 * 60 * 1000L

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
            val kind: String = "arrival", // arrival | approach
            // MP3 prefetchato in cache locale (AudioPrefetchManager): se
            // presente e valido si riproduce quello (partenza istantanea,
            // voce neurale) invece del TTS di sistema; se la riproduzione
            // fallisce si torna al TTS del campo text.
            val audioFile: String? = null
        )

        // Player per gli MP3 prefetchati: vive accanto al TTS nella stessa coda
        // sequenziale, mai due voci insieme.
        @Volatile
        private var activeMediaPlayer: android.media.MediaPlayer? = null

        // Mappa tra categorie UI (del setup) e categorie DB reali.
        // Copia unica in CategoryMap.kt (usata anche da SupabaseClient.kt e dal
        // filtro offline del service): qui resta solo un alias per non rompere
        // i riferimenti esistenti a GeofenceBroadcastReceiver.CATEGORY_MAP.
        val CATEGORY_MAP = CategoryMap.MAP

        // Sincronizzazione tra il loop predittivo in-process del servizio
        // (firePredictedApproach) e il path broadcast dell'OS
        // (handleEnterTransitions → handleApproach/handleArrival): entrambi
        // possono valutare e "sparare" lo stesso trigger per lo stesso POI
        // quasi simultaneamente, e la sola lettura-poi-scrittura su Room
        // (TriggerState) non è una transazione atomica. Un Mutex per-POI
        // (coroutine-friendly: tutto questo file gira già su coroutines)
        // serializza "leggi stato → decidi → scrivi" così i due path non
        // possono processare due volte lo stesso arrivo/avvicinamento.
        private val triggerLocks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()

        private fun lockForPoi(poiId: String): Mutex =
            triggerLocks.getOrPut(poiId) { Mutex() }

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

        /**
         * Ferma SOLO la voce del POI indicato (superamento): via i suoi item
         * dalla coda; se la voce attiva è la sua si interrompe e si prosegue
         * con la coda. Le voci degli altri POI non si toccano — superare A
         * mentre suona la guida di B non deve uccidere B. Lo stop globale
         * resta per il plugin (audioguida completa in partenza dal JS).
         */
        fun stopSpeakingForPoi(context: Context, poiId: String) {
            if (poiId.isBlank()) return
            speechQueue.removeAll { it.poiId == poiId }
            if (activeItem?.poiId != poiId) return
            try { ttsInstance?.stop() } catch (_: Exception) { }
            // finishActiveSpeech rilascia anche l'eventuale MediaPlayer attivo
            finishActiveSpeech(context.applicationContext, notifyJs = true)
            processNextSpeech(context.applicationContext)
        }

        fun enqueue(context: Context, item: SpeechItem) {
            speechQueue.add(item)
            processNextSpeech(context.applicationContext)
        }

        /**
         * Avvio dell'approach dal PREDITTORE, non dal geofence dell'OS.
         *
         * È il punto in cui si recupera davvero la latenza: il servizio in
         * foreground valuta il CPA a ogni fix e può annunciare PRIMA che
         * l'OS consegni la transizione ENTER (che può arrivare con secondi
         * di ritardo, e su alcuni OEM molti di più in Doze).
         *
         * Delega alla stessa `handleApproach` del percorso geofence: unico
         * punto di verità per teaser, prefetch MP3, TTS e notifica. Room
         * (stato PENDING → APPROACH_FIRED) impedisce il doppio annuncio se
         * poi arriva anche la transizione dell'OS.
         */
        /**
         * Filtro categorie riusabile dal valutatore predittivo del servizio.
         * Unico punto di verità: CATEGORY_MAP vive qui, e duplicarla altrove
         * è esattamente il difetto che il CLAUDE.md del progetto segnala.
         */
        fun isCategoryActive(poi: PoiEntity, selected: List<String>): Boolean =
            GeofenceBroadcastReceiver().isPoiCategoryActive(poi, selected)

        suspend fun firePredictedApproach(
            context: Context,
            poiId: String,
            name: String,
            guide: String,
            isGem: Boolean,
            isItinerary: Boolean,
            db: PoiDatabase,
            speak: Boolean
        ) {
            // Il companion può accedere ai membri privati della propria classe.
            GeofenceBroadcastReceiver().handleApproach(
                context, poiId, name, guide, isGem, isItinerary, db, speak
            )
        }

        /**
         * ARRIVO A 30 M DAL PERIMETRO, deciso dal servizio a ogni fix (22/08/2026).
         * Il sistema emette l'ENTER una volta sola, quando si entra nel
         * cerchio: per un edificio grande quel momento puo' essere a 80 m dal
         * muro, e i 30 m dal perimetro si raggiungono DOPO, senza nessun altro
         * evento. Il servizio li vede nel suo loop e arriva da qui.
         */
        suspend fun firePerimeterArrival(
            context: Context,
            poi: PoiEntity,
            isAutomaticMode: Boolean,
            db: PoiDatabase,
            distanceM: Float
        ) {
            GeofenceBroadcastReceiver().handleArrival(
                context, poi.id, poi.nome, poi.guideDefault, poi.isGem, poi.isFromItinerary,
                isAutomaticMode, db, distanceM = distanceM
            )
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
                // MP3 prefetchato disponibile? Partenza istantanea senza TTS.
                val mp3 = next.audioFile?.let { path ->
                    try {
                        java.io.File(path).takeIf { it.exists() && it.length() > 0 }
                    } catch (_: Exception) { null }
                }
                if (mp3 != null) {
                    startMp3Playback(appContext, next, mp3, prefs)
                    return@post
                }

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
                    // Via emoji/pittogrammi: il TTS li legge per nome ("💎" →
                    // "diamante", "📍" → "puntina"). Port di SpeechQueue.speakableText (iOS).
                    val result = ttsInstance?.speak(
                        speakableText(next.text),
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
                    // Cap 15 min (non 60s): il tetto di 60s tagliava a metà le
                    // audioguide COMPLETE (3-4 min) del Day Pass offline e di
                    // ogni fallback TTS senza MP3. Il teaser (~200 char) resta
                    // ben sotto e non è toccato.
                    val maxMs = (8000L + next.text.length * 120L).coerceAtMost(15 * 60_000L)
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

        /**
         * Riproduzione dell'MP3 prefetchato al posto del TTS. Stessa liturgia
         * del ramo TTS (focus, chime, prefs teaser, eventi JS, watchdog); su
         * QUALUNQUE errore il file viene scartato e l'item torna in coda in
         * versione solo-testo, così il fallback resta il TTS di sistema.
         */
        private fun startMp3Playback(
            appContext: Context,
            item: SpeechItem,
            file: java.io.File,
            prefs: SharedPreferences
        ) {
            requestFocus(appContext)

            try {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                RingtoneManager.getRingtone(appContext, uri).play()
            } catch (_: Exception) { }

            prefs.edit()
                .putBoolean(PREF_TEASER_SPEAKING, true)
                .putString(PREF_TEASER_SPEAKING_POI, item.poiId ?: "")
                .apply()
            broadcastTeaserEvent(appContext, "teaserStarted", item)

            val fallbackToTts = {
                try { file.delete() } catch (_: Exception) { }
                if (item.text.isNotBlank()) speechQueue.add(item.copy(audioFile = null))
                finishActiveSpeech(appContext, notifyJs = true)
                processNextSpeech(appContext)
            }

            try {
                val mp = android.media.MediaPlayer()
                activeMediaPlayer = mp
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                mp.setDataSource(file.absolutePath)
                mp.setOnCompletionListener { onUtteranceFinished(appContext) }
                mp.setOnErrorListener { _, what, extra ->
                    Log.w(TAG, "MP3 playback error ($what/$extra), fallback TTS")
                    fallbackToTts()
                    true
                }
                mp.setOnPreparedListener { player ->
                    try {
                        player.start()
                        // Watchdog come per il TTS: se onCompletion non arriva
                        // mai, la coda non deve restare bloccata.
                        val maxMs = (player.duration.toLong() + 15_000L)
                            .coerceIn(15_000L, 15 * 60_000L)
                        val guard = Runnable {
                            Log.w(TAG, "MP3 watchdog fired, resetting queue state")
                            finishActiveSpeech(appContext, notifyJs = true)
                            processNextSpeech(appContext)
                        }
                        safetyRunnable = guard
                        safetyHandler.postDelayed(guard, maxMs)
                    } catch (e: Exception) {
                        Log.w(TAG, "MP3 start failed: ${e.message}")
                        fallbackToTts()
                    }
                }
                mp.prepareAsync()
            } catch (e: Exception) {
                Log.w(TAG, "MP3 setup failed: ${e.message}")
                fallbackToTts()
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
            // Rilascio del player MP3 (idempotente: null se era un item TTS)
            activeMediaPlayer?.let { mp ->
                activeMediaPlayer = null
                try { mp.stop() } catch (_: Exception) { }
                try { mp.release() } catch (_: Exception) { }
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

        /**
         * Toglie emoji e pittogrammi dal testo da leggere: il TTS di sistema li
         * pronuncia per nome ("💎" → "diamante", "📍" → "puntina", "🎫" →
         * "biglietto"). Port di SpeechQueue.speakableText (SpeechQueue.swift:166-178).
         * Cifre e simboli ASCII (metri, ×) restano intatti.
         */
        private val EMOJI_REGEX = Regex(
            "[\\x{1F000}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{2B00}-\\x{2BFF}\\x{2190}-\\x{21FF}\\x{FE00}-\\x{FE0F}\\x{200D}\\x{20E3}\\x{2122}\\x{2139}\\x{00A9}\\x{00AE}]"
        )

        private fun speakableText(text: String): String {
            val cleaned = EMOJI_REGEX.replace(text, "").replace(Regex("\\s+"), " ").trim()
            // Mai utterance vuota (item tutto-emoji): la coda resterebbe bloccata.
            return cleaned.ifBlank { text.trim() }
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
                        // Prima si fermava SOLO il TTS: l'MP3 prefetchato continuava
                        // a suonare sopra la telefonata. Ora si chiude anche il
                        // MediaPlayer e lo stato "sto parlando" (finishActiveSpeech
                        // rilascia il player, abbandona il focus, avvisa il JS).
                        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                            try { ttsInstance?.stop() } catch (_: Exception) { }
                            try { activeMediaPlayer?.pause() } catch (_: Exception) { }
                            finishActiveSpeech(appContext, notifyJs = true)
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
                // (22/08/2026) Localizzate sulla lingua delle prefs, non più italiano fisso
                .setContentTitle(NotificationStrings.get(context, "checkin_title"))
                .setContentText(NotificationStrings.get(context, "checkin_text"))
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
            // A 30 METRI DAL PERIMETRO (22/08/2026): se il POI ha il poligono,
            // la misura che conta e' la distanza dal MURO (0 dentro), non
            // quella dall'ingresso. Lungo la facciata di una basilica di 120
            // metri o accanto a una cinta muraria si e' spesso oltre il
            // distLimit pur essendo esattamente dove si deve essere, e il
            // controllo qui sotto scarterebbe un trigger giusto.
            val dentroPerimetro = Footprints.alPerimetro(
                info.poiId, poi.footprint,
                currentLoc.latitude, currentLoc.longitude,
                isDriving = isDrivingMode
            )

            val targetRadius = if (info.type == "arrival") arrivalRad else alertRad
            val distLimit = targetRadius * 2.5f + currentLoc.accuracy
            if (!dentroPerimetro && info.realDist > distLimit) {
                Log.w(TAG, "Geofence fake trigger for ${poi.nome}: real dist ${info.realDist}m > limit ${distLimit}m")
                continue
            }

            // Ri-avvicinamento consentito da PENDING oppure da EXITED dopo il
            // cooldown anti-rimbalzo (30 min): il rientro immediato nell'isteresi
            // fra le chiome non deve rifare banner+annuncio. Port iOS (stato
            // .exited + approachRetriggerCooldownMs).
            val canApproach = triggerState == TriggerState.PENDING ||
                (triggerState == TriggerState.EXITED && triggerEntity != null &&
                    System.currentTimeMillis() - triggerEntity.updatedAt > APPROACH_RETRIGGER_COOLDOWN_MS)
            if (info.type == "approach" && canApproach) {
                // Predittore CPA al posto del vecchio filtro ±60°: valuta se
                // l'utente è realmente IN ROTTA verso il POI e se il momento
                // è quello giusto (t_cpa dentro la finestra di anticipo),
                // invece di limitarsi a vetare le direzioni sbagliate.
                // Fail-open interno: con fix impreciso o utente fermo ricade
                // sul comportamento radiale di prima.
                val pred = PredictiveTrigger.evaluate(
                    location = currentLoc,
                    poiLat = poi.entranceLat ?: poi.lat,
                    poiLon = poi.entranceLon ?: poi.lon,
                    radiusM = alertRad.toDouble(),
                    isDriving = isDrivingMode
                )
                TriggerTelemetry.log(
                    context, poiId = info.poiId, poiName = poi.nome,
                    phase = "approach", result = pred, location = currentLoc,
                    isDriving = isDrivingMode, radiusM = alertRad
                )
                // Dentro il perimetro il predittore CPA non ha senso: valuta
                // se sei IN ROTTA verso un punto, ma se sei gia' dentro
                // l'edificio non c'e' piu' nessuna rotta da valutare — e
                // attraversandolo ti stai allontanando dal centroide, che il
                // predittore legge come "sta andando via".
                if (dentroPerimetro || pred.decision == PredictiveTrigger.Decision.FIRE) {
                    handleApproach(context, info.poiId, poi.nome, poi.guideDefault, poi.isGem, info.isItinerary, db, speak = !approachSpokenInBatch, distanceM = info.realDist)
                    approachSpokenInBatch = true
                } else {
                    Log.d(TAG, "Approach non emesso per ${poi.nome}: ${pred.decision} (${pred.reason})")
                }
            } else if (info.type == "arrival") {
                // Blocco arrivo (port iOS blockedArrival): il TTL 24h copre
                // ARRIVED_FIRED. EXITED recente blocca il rientro-da-rumore-GPS
                // con un cooldown più corto (10 min).
                // (22/08/2026) PASSED NON blocca più l'arrivo quando la distanza
                // reale è dentro il raggio di arrivo: il predittore marca PASSED
                // già 40 m oltre il CPA dopo un APPROACH, quindi chi cammina
                // svelto, supera di poco il punto e poi si ferma davanti al POI
                // perdeva l'arrivo per 24 ore. Il rientro da lontano (realDist
                // fuori raggio) resta bloccato come prima.
                val age = if (triggerEntity != null) System.currentTimeMillis() - triggerEntity.updatedAt else Long.MAX_VALUE
                val blockedArrival =
                    (triggerState == TriggerState.ARRIVED_FIRED && age < ARRIVAL_RETRIGGER_TTL_MS) ||
                    (triggerState == TriggerState.PASSED && age < ARRIVAL_RETRIGGER_TTL_MS && info.realDist > targetRadius) ||
                    (triggerState == TriggerState.EXITED && age < ARRIVAL_AFTER_EXIT_COOLDOWN_MS)
                // Col perimetro il cerchio d'arrivo e' allargato a coprirlo
                // tutto (GeofenceManager): l'ENTER puo' arrivare a 80 m dal
                // muro. Se non si e' ancora a 30 m, non e' un arrivo: ci
                // pensera' il loop del servizio (firePerimeterArrival) al
                // fix in cui lo si diventa.
                val haPerimetro = !poi.footprint.isNullOrBlank()
                if (haPerimetro && !dentroPerimetro) {
                    Log.d(TAG, "Arrivo rinviato per ${poi.nome}: dentro il cerchio ma a piu' di ${Footprints.triggerM(isDrivingMode).toInt()} m dal perimetro")
                } else if (!blockedArrival) {
                    // ✅ [ROBUSTEZZA] - Permettiamo l'arrivo anche se l'approccio è stato saltato (es. marcia veloce)
                    handleArrival(context, info.poiId, poi.nome, poi.guideDefault, poi.isGem, info.isItinerary, isAutomaticMode, db, distanceM = info.realDist)
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
            // Niente più cancellazione secca: si passa a EXITED e il suo
            // timestamp fa da cooldown anti-rimbalzo (approach 30 min, arrivo
            // 10 min in handleEnterTransitions). Cancellare permetteva un nuovo
            // annuncio al primo rientro nel raggio (banner ogni pochi metri).
            // Port di BackgroundPoiManager.swift (stato .exited).
            when (entity.state) {
                TriggerState.APPROACH_FIRED -> {
                    db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.EXITED))
                    sendEventToPlugin(context, "poiExited", poiId, "")
                }
                TriggerState.ARRIVED_FIRED -> {
                    // Uscita "vera" (visita durata almeno 30 min): il POI torna
                    // disponibile per una futura visita, senza il rimbalzo del
                    // giro dell'isolato.
                    if (System.currentTimeMillis() - entity.updatedAt > EXIT_ARRIVAL_GRACE_MS) {
                        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.EXITED))
                        sendEventToPlugin(context, "poiExited", poiId, "")
                    }
                }
                TriggerState.PASSED -> {
                    // Prima cadeva nel ramo else: chi superava il monumento e
                    // tornava indietro non lo risentiva finché non usciva da
                    // 3× il raggio + nuovo fetch. iOS resettava già all'uscita:
                    // ora anche Android libera lo stato PASSED → EXITED (col
                    // cooldown, non un reset immediato).
                    db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.EXITED))
                    sendEventToPlugin(context, "poiExited", poiId, "")
                }
                // Già EXITED (o PENDING): niente da fare.
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

    // checkBearingFilter RIMOSSO: sostituito da PredictiveTrigger.evaluate().
    //
    // Il vecchio filtro confrontava il bearing con ±60° come VETO. Due difetti:
    //   1. poteva solo sopprimere un annuncio, mai anticiparlo — quindi non
    //      toccava il problema del "notifica quando l'ho già superato";
    //   2. si disattivava (`return true`) con accuracy > 50 m o speed < 0.3 m/s,
    //      cioè nei centri storici e col turista che rallenta avvicinandosi:
    //      nella pratica non filtrava quasi nulla.
    // Il predittore CPA copre entrambi i casi e mantiene lo stesso fail-open
    // dove i dati non consentono una predizione. Vedi PredictiveTrigger.kt.

    private suspend fun handleApproach(
        context: Context, poiId: String, name: String, guide: String, isGem: Boolean, isItinerary: Boolean, db: PoiDatabase, speak: Boolean = true, distanceM: Float? = null
    ): Unit = lockForPoi(poiId).withLock {
        val poi = db.poiDao().getPoiById(poiId) ?: return
        // Ri-verifica SOTTO LOCK: il loop predittivo del servizio e questo
        // path broadcast possono arrivare qui quasi insieme per lo stesso
        // POI. Se nel frattempo (fuori lock) l'altro path ha già sparato
        // l'approach o l'arrivo, non ripetiamo voce+notifica.
        val stateNow = db.poiDao().getTriggerState(poiId)?.state ?: TriggerState.PENDING
        if (stateNow == TriggerState.APPROACH_FIRED || stateNow == TriggerState.ARRIVED_FIRED) {
            Log.d(TAG, "handleApproach: $poiId già $stateNow, doppio trigger evitato")
            return
        }
        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.APPROACH_FIRED))
        sendEventToPlugin(context, "poiApproaching", poiId, name, poi.lat, poi.lon, distanceM)

        // ✅ [PREDICTIVE TEASER] - Chiediamo a DeepSeek di preparare il teaser ORA (a 150m)
        // Solo con rete utilizzabile: offline sarebbe un timeout a vuoto.
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val lang = prefs.getString("language", "it") ?: "it"
        val guideVoice = resolveGuideVoice(prefs, guide)
        if (com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)) {
            triggerTeaserGeneration(context, poiId, lang)
        }

        // ✅ [PREFETCH MP3] - Al primo avviso scarichiamo in background l'MP3
        // dell'audioguida nella cache locale: al trigger di arrivo la
        // riproduzione parte istantanea (best-effort, mai bloccante).
        com.itaintasca.app.service.AudioPrefetchManager.prefetch(context, poiId, lang, guideVoice)

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
        // MODALITÀ «SOLO VIBRAZIONE + TESTO» (wip_silent_mode='1' in
        // CapacitorStorage): niente voce, vibrazione breve doppia e teaser
        // leggibile nella notifica. Stato/eventi/prefetch restano identici:
        // nessun trigger perso.
        val silentMode = com.itaintasca.app.service.WebViewPrefs.isSilentMode(context)
        if (speak && !silentMode) {
            enqueue(context, SpeechItem("$prefix$approachMsg", isGem, isItinerary, poiId, priority, kind = "approach"))
        }
        if (silentMode) {
            vibrate(context, longArrayOf(0, 150, 100, 150))
        } else {
            vibrate(context, if (isItinerary || isGem) longArrayOf(0, 300, 100, 500) else longArrayOf(0, 500))
        }
        // (22/08/2026) Titolo/testo notifica nella lingua dell'utente (NotificationStrings)
        val notifTitle = NotificationStrings.get(lang, if (isItinerary) "approach_title_stop" else "approach_title_explore")
        // Raggio reale della modalità corrente, non "150m" fisso: in auto
        // l'alert scatta a 300 m e la notifica mentiva (stesso fix di iOS).
        val guideModeNow = prefs.getString("guideMode", "walking") ?: "walking"
        val alertRadNow = if (guideModeNow == "driving") prefs.getFloat("alertRadiusCar", 300f)
                          else prefs.getFloat("alertRadiusWalk", 150f)
        // In modalità silenziosa il teaser (se già disponibile) va nella
        // notifica in versione espandibile: è l'unico canale di contenuto.
        val approachBigText = if (silentMode && !poi.teaserText.isNullOrBlank()) {
            "$approachMsg\n\n${poi.teaserText}"
        } else null
        showNotification(context, "$notifTitle: $name", NotificationStrings.get(lang, "approach_text", alertRadNow.toInt().toString()), poiId, guideVoice, false, bigText = approachBigText)
    }

    private suspend fun handleArrival(
        context: Context, poiId: String, name: String, guide: String, isGem: Boolean, isItinerary: Boolean, isAutomaticMode: Boolean, db: PoiDatabase, distanceM: Float? = null
    ): Unit = lockForPoi(poiId).withLock {
        var poi = db.poiDao().getPoiById(poiId)
        if (poi == null) {
            // Senza il POI nel DB locale non abbiamo lat/lon reali: prima si
            // procedeva comunque e l'evento "arrivato" partiva verso il JS con
            // 0.0,0.0 (banner/notifica sul punto sbagliato). Meglio scartare
            // l'evento: il prossimo fetch/refresh ripopolerà Room.
            Log.w(TAG, "handleArrival: POI $poiId non trovato nel DB locale, evento poiArrived scartato")
            return
        }
        // Ri-verifica SOTTO LOCK: stesso motivo di handleApproach — il loop
        // predittivo del servizio e il path broadcast possono decidere
        // l'arrivo quasi insieme per lo stesso POI.
        val stateNow = db.poiDao().getTriggerState(poiId)?.state
        if (stateNow == TriggerState.ARRIVED_FIRED) {
            Log.d(TAG, "handleArrival: $poiId già ARRIVED_FIRED, doppio trigger evitato")
            return
        }
        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.ARRIVED_FIRED))
        sendEventToPlugin(context, "poiArrived", poiId, name, poi?.lat ?: 0.0, poi?.lon ?: 0.0, distanceM)

        val priority = if (poi?.isFromItinerary == true) 0 else 1

        // --- LOGICA TEASER MULTILINGUA ---
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val lang = prefs.getString("language", "it") ?: "it"
        // (22/08/2026) Voce scelta dall'utente (nicky/dante) anche in background,
        // non il guideDefault del POI: vedi resolveGuideVoice.
        val guideVoice = resolveGuideVoice(prefs, guide)

        // ✅ [RECOVERY] - Teaser nullo: qui SOLO il pacchetto offline locale
        // (gratis e immediato). Il recupero dal server è lavoro di rete e va
        // nel servizio (ArrivalWorker), non dentro goAsync().
        if (poi?.teaserText.isNullOrBlank()) {
            val offlinePoi = db.offlineDao().getPoiById(poiId)
            if (offlinePoi != null && !offlinePoi.teaserText.isNullOrBlank()) {
                val recovered = offlinePoi.toPoiEntity()
                poi = recovered
                db.poiDao().insertPois(listOf(recovered))
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

        // Frase di ripiego quando il teaser manca: NON sempre la stessa. In un
        // giro di dieci luoghi senza teaser l'utente sentiva dieci volte "Apri
        // l'app per scoprire i segreti di questo luogo" (regola del committente
        // 22/08/2026: "il piu' possibile variegati"). La variante si sceglie da
        // un hash deterministico dell'id: lo stesso luogo dice sempre la stessa
        // cosa, due luoghi vicini dicono cose diverse. Allineato a
        // BackgroundPoiManager.swift (stesse tre frasi per lingua).
        val variantiRipiego = when (lang) {
            "en" -> listOf(
                "Open the app to discover the secrets of this place.",
                "The full story is in the app: open it and listen.",
                "Want to know what happened here? The audio guide is one tap away.")
            "fr" -> listOf(
                "Ouvrez l'application pour découvrir les secrets de ce lieu.",
                "Toute l'histoire est dans l'application : ouvrez-la et écoutez.",
                "Envie de savoir ce qui s'est passé ici ? L'audioguide est à un geste.")
            "es" -> listOf(
                "Abre la aplicación para descubrir los secretos de este lugar.",
                "La historia completa está en la app: ábrela y escucha.",
                "¿Quieres saber qué pasó aquí? La audioguía está a un toque.")
            "de" -> listOf(
                "Öffnen Sie die App, um die Geheimnisse dieses Ortes zu entdecken.",
                "Die ganze Geschichte steht in der App: öffnen und zuhören.",
                "Was ist hier passiert? Der Audioguide ist nur einen Tipp entfernt.")
            "ru" -> listOf(
                "Откройте приложение, чтобы узнать секреты этого места.",
                "Вся история — в приложении: откройте и слушайте.",
                "Хотите узнать, что здесь произошло? Аудиогид в одном касании.")
            "zh" -> listOf(
                "打开应用，探索这个地方的秘密。",
                "完整的故事都在应用里：打开并聆听。",
                "想知道这里发生过什么？语音导览只需轻点一下。")
            else -> listOf(
                "Apri l'app per scoprire i segreti di questo luogo.",
                "La storia completa è nell'app: aprila e ascolta.",
                "Vuoi sapere cosa è successo qui? L'audioguida è a un tocco.")
        }
        // hashCode() di String e' stabile in Kotlin/JVM, ma lo si ricalcola a
        // mano per restare identici allo Swift (stesso seme, stessa frase).
        val semeRipiego = poiId.fold(0) { acc, c -> (acc * 31 + c.code) and 0x7fffffff }
        val fallbackTeaser = variantiRipiego[semeRipiego % variantiRipiego.size]

        val teaser = poi?.teaserText
        val fullMsg = if (!teaser.isNullOrBlank()) "$arrivalMsg $teaser" else "$arrivalMsg $fallbackTeaser"

        // MODALITÀ «SOLO VIBRAZIONE + TESTO» (wip_silent_mode='1'): niente TTS
        // né audio — vibrazione breve doppia e teaser per intero nella notifica
        // (BigTextStyle, sotto). Stato Room, eventi al plugin e recovery teaser
        // restano identici: il trigger non va perso e il contenuto resta
        // disponibile nell'app.
        val silentMode = com.itaintasca.app.service.WebViewPrefs.isSilentMode(context)
        if (!silentMode) {
            vibrate(context, longArrayOf(0, 400, 200, 400))
        } else {
            vibrate(context, longArrayOf(0, 150, 100, 150))
        }

        // (22/08/2026) LAVORO LUNGO FUORI DAL RECEIVER. Voce del teaser
        // (con eventuale recupero dal server), DAY PASS / già acquistato
        // (testo integrale + MP3) vivono in ArrivalWorker.run: se serve rete
        // si inoltra al Foreground Service (ACTION_HANDLE_ARRIVAL), che non ha
        // il limite di ~10 s di goAsync(); altrimenti, o se l'inoltro fallisce,
        // si esegue inline come prima. Regole invariate: il pass si consuma
        // solo se non già acquistato, in modalità silenziosa la catena non
        // parte, con app in foreground se ne occupa il JS.
        val params = ArrivalWorker.Params(
            poiId = poiId, name = name, isGem = isGem, isItinerary = isItinerary,
            isAutomaticMode = isAutomaticMode, priority = priority, lang = lang,
            guideVoice = guideVoice, silentMode = silentMode, arrivalMsg = arrivalMsg,
            fallbackTeaser = fallbackTeaser, poiLat = poi?.lat ?: 0.0, poiLon = poi?.lon ?: 0.0,
            poiType = poi?.poiType
        )
        val online = com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)
        val mayNeedFullGuide = isAutomaticMode && !silentMode && !isAppInForeground(context)
        val needsLongWork = online && (teaser.isNullOrBlank() || mayNeedFullGuide)
        val forwarded = needsLongWork && ArrivalWorker.dispatchToService(context, params)
        if (!forwarded) {
            ArrivalWorker.run(context, params)
        }

        if (silentMode) {
            // Notifica d'arrivo con il TESTO del teaser ben leggibile: è il
            // sostituto della voce. Niente launchApp: aprirebbe l'app che in
            // automatico farebbe partire l'audio.
            // (22/08/2026) Notifiche nella lingua dell'utente (NotificationStrings), non più italiano fisso
            showNotification(context, NotificationStrings.get(lang, "arrival_at", name), teaser ?: fallbackTeaser, poiId, guideVoice, true, bigText = fullMsg)
        } else if (isAutomaticMode) {
            showNotification(context, NotificationStrings.get(lang, "arrived_title"), NotificationStrings.get(lang, "arrived_starting", name), poiId, guideVoice, true)
            launchApp(context, poiId, guideVoice)
        } else {
            showNotification(context, NotificationStrings.get(lang, "arrival_at", name), NotificationStrings.get(lang, "arrived_tap"), poiId, guideVoice, true)
        }
    }

    private fun triggerTeaserGeneration(context: Context, poiId: String, lang: String) {
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // (22/08/2026) Timeout espliciti: il default di OkHttp (10 s
                // connect, 10 s read) tagliava la generazione AI del teaser,
                // che può superare i 10 s; 25 s di read è il tetto ragionevole
                // per un job in background che non blocca nessuno.
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(25, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val body = JSONObject().apply {
                    put("poiIds", JSONArray(listOf(poiId)))
                    put("lang", lang)
                }.toString().toRequestBody("application/json".toMediaType())

                // (22/08/2026) Senza Authorization il server risponde 403 e il
                // teaser predittivo non veniva mai generato, senza traccia nei
                // log. Stesso token utente di /api/poi/audioguide (SecurePrefs).
                val accessToken = com.itaintasca.app.service.SecurePrefs.get(appContext)
                    .getString(com.itaintasca.app.service.ListeningHistoryStore.PREF_ACCESS_TOKEN, "")
                val requestBuilder = Request.Builder()
                    .url("https://wip.guide/api/poi/batch-teaser")
                    .post(body)
                if (!accessToken.isNullOrBlank()) {
                    requestBuilder.addHeader("Authorization", "Bearer $accessToken")
                }
                val request = requestBuilder.build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        Log.d(TAG, "Predictive teaser requested for $poiId (HTTP ${response.code})")
                    } else {
                        Log.w(TAG, "Predictive teaser $poiId: HTTP ${response.code} (token ${if (accessToken.isNullOrBlank()) "assente" else "presente"})")
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

    /**
     * (22/08/2026) Il personaggio scelto nel profilo (nicky/dante) arrivava al
     * plugin ma non veniva mai letto: prefetch MP3, testo del pass e deep link
     * `?guide=` usavano sempre il guideDefault del POI, quindi in background
     * parlava la voce sbagliata. Il plugin ora persiste `guideCharacter`; qui si
     * preferisce quello, con il default del POI come riserva.
     */
    private fun resolveGuideVoice(prefs: SharedPreferences, fallback: String): String {
        val chosen = prefs.getString("guideCharacter", null)
        return if (chosen == "nicky" || chosen == "dante") chosen else fallback
    }

    /**
     * (22/08/2026) Delega a CategoryMap.isActive: la STESSA funzione usata dal
     * fetch (SupabaseClient.parsePoiList) e dal filtro offline del servizio.
     * Prima erano tre copie a mano: un POI poteva essere scaricato dal fetch
     * e rifiutato qui al trigger (o viceversa). Regole: tappe sempre attive,
     * gemme attive salvo "gemme:off" (vedi areGemsActive), insieme vuoto =
     * default culturale.
     */
    private fun isPoiCategoryActive(poi: PoiEntity, selected: List<String>): Boolean =
        CategoryMap.isActive(poi.poiType, poi.isGem, poi.isFromItinerary, selected)

    /**
     * Attivazione delle gemme (parità con useGeofencing.ts `activeSubcats.gemme
     * ?? true`: attive di DEFAULT, spegnibili dall'utente).
     *
     * ⚠️ Nel prodotto attuale le gemme sono "sempre attive" (checkbox disabilitata
     *    nel setup, App.tsx: "gemme sempre attive a parte") e locationService NON
     *    inoltra mai "gemme" tra le categorie native: in produzione il set è
     *    tipicamente ['monumenti','musei','chiese']. Gating su
     *    `selected.contains("gemme")` spegnerebbe TUTTE le gemme (regressione).
     *    Quindi il default resta ON; l'utente può spegnerle SOLO con un OFF
     *    esplicito, rappresentato dalla sentinella "gemme:off" nella lista
     *    (nessuno la invia oggi → comportamento invariato). Onorare un toggle
     *    utente vero richiede che il JS inoltri lo stato gemme al nativo (fuori
     *    dallo scope Android — vedi report).
     */
    private fun areGemsActive(selected: List<String>): Boolean =
        !selected.contains("gemme:off")

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

    private fun showNotification(context: Context, title: String, text: String, poiId: String, guide: String, isArrival: Boolean = false, bigText: String? = null) {
        // DUE CANALI DISTINTI, non uno con importanza variabile.
        //
        // Prima si usava lo stesso id "geofencing_channel" ricreandolo con
        // importanza diversa a seconda di isArrival: Android IGNORA i cambi
        // di importanza su un canale già esistente (solo l'utente può
        // abbassarla), quindi vinceva la primissima creazione e da lì in poi
        // avvicinamento e arrivo avevano lo stesso peso — di solito
        // l'avvicinamento urlava come un arrivo.
        //
        // Gerarchia voluta:
        //   avvicinamento → silenzioso, senza heads-up (è un'informazione)
        //   arrivo        → sonoro e in primo piano (è l'evento)
        val channelId = if (isArrival) "wip_poi_arrival" else "wip_poi_approach"
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan = if (isArrival) {
                NotificationChannel(channelId, "Arrivo al luogo", NotificationManager.IMPORTANCE_HIGH)
            } else {
                NotificationChannel(channelId, "Luogo in avvicinamento", NotificationManager.IMPORTANCE_LOW).apply {
                    setSound(null, null)
                    enableVibration(false)
                }
            }
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
            // PRIORITY_HIGH sull'avvicinamento produceva un heads-up che
            // copre lo schermo per un semplice "ci stai arrivando".
            .setPriority(if (isArrival) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_LOW)
            .setSilent(!isArrival)
            // CATEGORY_ALARM + full-screen intent rimossi (policy Play ago 2026):
            // dal targetSdk 34 il full-screen è riservato a sveglie/chiamate.
            // L'heads-up sonoro arriva comunque dal canale IMPORTANCE_HIGH.
            .setCategory(if (isArrival) NotificationCompat.CATEGORY_EVENT else NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(pIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        // Modalità «solo vibrazione + testo»: il teaser sostituisce la voce,
        // quindi deve essere leggibile per intero (BigTextStyle espandibile).
        if (!bigText.isNullOrBlank()) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(bigText))
        }

        if (isArrival) {
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

    private fun sendEventToPlugin(context: Context, event: String, poiId: String, poiName: String, lat: Double = 0.0, lon: Double = 0.0, distanceM: Float? = null) {
        val jsonData = JSONObject().apply {
            put("poiId", poiId)
            put("poiName", poiName)
            put("lat", lat)
            put("lon", lon)
            // distanceM: distanza REALE dal fix, così il banner JS mostra la
            // distanza vera invece di stimarla (parità iOS sendPoiEvent).
            if (distanceM != null) put("distanceM", distanceM.toInt())
            // ts: il WebView può ricevere l'evento in ritardo (risveglio dopo
            // sblocco) — il JS scarta i banner stantii. Allineato a iOS.
            put("ts", System.currentTimeMillis())
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
