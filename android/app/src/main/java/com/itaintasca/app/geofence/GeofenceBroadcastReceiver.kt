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
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.itaintasca.app.MainActivity
import com.itaintasca.app.R
import com.itaintasca.app.WipBackgroundAudioService
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.db.TriggerState
import com.itaintasca.app.db.TriggerStateEntity
import com.itaintasca.app.db.toPoiEntity
import com.itaintasca.app.service.WipApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
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
        // Listener del focus per API < 26 (prima si passava null: nessun
        // callback, quindi nessuna pausa/ripresa possibile).
        @Volatile
        private var legacyFocusListener: AudioManager.OnAudioFocusChangeListener? = null
        private val safetyHandler = Handler(Looper.getMainLooper())
        private var safetyRunnable: Runnable? = null

        // (AUD-06) Id dell'utterance TTS in corso. I callback del motore
        // (onDone/onError/onStop) arrivano anche in ritardo e per utterance
        // GIA' chiuse: senza confrontare l'id, l'onStop tardivo di A chiudeva
        // B appena partito. null = nessuna utterance TTS attiva.
        @Volatile
        private var activeUtteranceId: String? = null

        // (AUD-05 / AUD-14) L'item attivo e' in PAUSA (perdita transitoria
        // del focus, o tasto Pausa della notifica): resta activeItem, non si
        // passa al successivo, e alla ripresa riparte dal punto (MP3) o da
        // capo (TTS). pausedByUser distingue la pausa esplicita: un GAIN di
        // focus non deve riprendere cio' che l'utente ha fermato.
        @Volatile
        private var speechPaused = false
        @Volatile
        private var pausedByUser = false
        @Volatile
        private var pausedMp3PositionMs = 0

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
            // (AUD-06) Si "disconosce" l'utterance PRIMA dello stop: l'onStop
            // che il motore manda dopo porta l'id vecchio e viene ignorato.
            activeUtteranceId = null
            try { ttsInstance?.stop() } catch (_: Exception) { }
            // Se onStop del TTS non arriva (engine capricciosi), chiudiamo comunque lo stato
            finishActiveSpeech(context.applicationContext, notifyJs = true)
        }

        /** (AUD-14) La voce nativa sta parlando (o e' in pausa)? Per le azioni della notifica. */
        fun isVoiceActive(): Boolean = isSpeaking

        /** (AUD-14) La voce nativa e' in pausa (utente o focus)? */
        fun isVoicePaused(): Boolean = isSpeaking && speechPaused

        /** (AUD-14) Tasto «Pausa» della notifica: ferma SOLO la coda vocale, non il servizio. */
        fun pauseSpeech(context: Context) {
            val appContext = context.applicationContext
            Handler(Looper.getMainLooper()).post {
                if (pauseActiveSpeech(appContext, byUser = true)) notifyVoiceStateChanged()
            }
        }

        /** (AUD-14) Tasto «Riprendi» della notifica. */
        fun resumeSpeech(context: Context) {
            val appContext = context.applicationContext
            Handler(Looper.getMainLooper()).post {
                pausedByUser = false
                if (resumeActiveSpeech(appContext)) notifyVoiceStateChanged()
            }
        }

        /** (AUD-14) Tasto «Salta»: chiude l'item corrente e passa al successivo. */
        fun skipSpeech(context: Context) {
            val appContext = context.applicationContext
            Handler(Looper.getMainLooper()).post {
                if (activeItem == null) return@post
                activeUtteranceId = null
                try { ttsInstance?.stop() } catch (_: Exception) { }
                finishActiveSpeech(appContext, notifyJs = true)
                processNextSpeech(appContext)
            }
        }

        /**
         * Avvisa il servizio in foreground che lo stato della voce e' cambiato,
         * cosi' ricostruisce la notifica con/senza i tasti Pausa/Salta senza
         * aspettare il refresh dei 5 s. Hook in-process: niente intent di
         * avvio, che da background potrebbe essere rifiutato.
         */
        private fun notifyVoiceStateChanged() {
            try {
                com.itaintasca.app.service.ItaintaBackgroundPoiService.onVoiceStateChanged?.invoke()
            } catch (_: Exception) { }
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
            // (AUD-06) Schema coerente con stopSpeaking: si azzera l'id, si
            // ferma il motore, si chiude subito; l'onStop tardivo di questa
            // utterance viene scartato da onUtteranceFinished e NON chiude
            // l'item successivo che processNextSpeech fa partire qui sotto.
            activeUtteranceId = null
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
            CategoryMap.isActive(poi.poiType, poi.isGem, poi.isFromItinerary, selected)

        /**
         * (23/08/2026) Istanza UNICA per i due ponti companion→membro qui
         * sotto (firePredictedApproach / firePerimeterArrival). Prima ogni
         * chiamata faceva `GeofenceBroadcastReceiver()`: un oggetto nuovo solo
         * per invocare un metodo. Il receiver non ha nessuno stato di istanza
         * (tutto vive nel companion) e non trattiene Context, quindi
         * riutilizzarlo e' identico a costruirlo ogni volta.
         */
        private val ponte: GeofenceBroadcastReceiver by lazy { GeofenceBroadcastReceiver() }

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
            ponte.handleApproach(
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
            distanceM: Float,
            // (AUD-04) false = un altro POI dello stesso fix ha gia' la guida
            // completa: questo scrive lo stato e notifica, ma non consuma il
            // pass ne' accoda voce/testo integrale.
            fullGuide: Boolean = true
        ): Boolean {
            return ponte.handleArrival(
                context, poi.id, poi.nome, poi.guideDefault, poi.isGem, poi.isFromItinerary,
                isAutomaticMode, db, distanceM = distanceM, fullGuide = fullGuide
            )
        }

        /**
         * (28/08/2026) Il server ha risposto 402 alla guida completa: la
         * notifica d'arrivo (stesso id di quella gia' mostrata: la
         * sostituisce) dice «Tocca per ascoltare» e, nel testo espanso,
         * l'anteprima e il perche' servono crediti. Nessun addebito.
         */
        fun showCreditsRequiredNotification(
            context: Context,
            poiId: String,
            name: String,
            guideVoice: String,
            lang: String,
            preview: String?
        ) {
            val big = listOfNotNull(
                preview?.takeIf { it.isNotBlank() },
                NotificationStrings.get(lang, "credits_required_text")
            ).joinToString("\n\n")
            ponte.showNotification(
                context.applicationContext,
                NotificationStrings.get(lang, "arrival_at", name),
                NotificationStrings.get(lang, "arrived_tap"),
                poiId, guideVoice, true, bigText = big
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
                // (AUD-01) Se la guida completa del JS (ExoPlayer in
                // WipBackgroundAudioService) sta suonando, la si mette in
                // PAUSA: prima le due voci si sovrapponevano, perche' il
                // focus in MAY_DUCK faceva solo abbassare l'ExoPlayer. Si
                // riprende in finishActiveSpeech a coda vuota, e solo se
                // la pausa l'abbiamo chiesta noi.
                if (WipBackgroundAudioService.pauseForNativeVoice()) {
                    Log.d(TAG, "Guida JS in pausa per la voce nativa (${next.kind})")
                }
                notifyVoiceStateChanged()

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
                    // LA VOCE C'È DAVVERO, QUI E ORA? (23/08/2026). Il controllo
                    // esisteva solo prima del download di un pacchetto: fra
                    // allora e adesso l'utente può aver cambiato lingua,
                    // disinstallato i dati vocali o cambiato motore TTS. Se
                    // manca non si ripiega su un'altra lingua (vedi
                    // applyTtsConfig): si dice la verità e si passa oltre.
                    val muta = missingVoiceLang
                    if (muta != null) {
                        showVoiceMissingNotification(appContext, muta)
                        broadcastTeaserEvent(appContext, "listenFailed", next, "voice_not_installed")
                        finishActiveSpeech(appContext, notifyJs = false)
                        processNextSpeech(appContext)
                        return@initTtsIfNeeded
                    }
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

                    if (!speakTts(appContext, next)) {
                        Log.e(TAG, "tts.speak() returned error, skipping item")
                        finishActiveSpeech(appContext, notifyJs = true)
                        processNextSpeech(appContext)
                        return@initTtsIfNeeded
                    }
                }
            }
        }

        /**
         * Invia l'item al motore TTS con un id NUOVO (AUD-06) e arma il
         * watchdog. Usato all'avvio dell'item e alla ripresa dopo una pausa
         * (il TTS di sistema non sa riprendere: si rilegge da capo).
         * Ritorna false se speak() ha rifiutato.
         */
        private fun speakTts(appContext: Context, item: SpeechItem): Boolean {
            val params = Bundle()
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            val uttId = "GEOFENCE_${item.poiId ?: "x"}_${System.currentTimeMillis()}"
            activeUtteranceId = uttId
            // Via emoji/pittogrammi: il TTS li legge per nome ("💎" →
            // "diamante", "📍" → "puntina"). Port di SpeechQueue.speakableText (iOS).
            val result = ttsInstance?.speak(
                speakableText(item.text),
                TextToSpeech.QUEUE_FLUSH,
                params,
                uttId
            ) ?: TextToSpeech.ERROR
            if (result != TextToSpeech.SUCCESS) {
                activeUtteranceId = null
                return false
            }

            // Watchdog anti-blocco: se onDone non arriva mai (bug di alcuni engine),
            // la coda non deve restare inchiodata su isSpeaking=true.
            // Cap 15 min (non 60s): il tetto di 60s tagliava a metà le
            // audioguide COMPLETE (3-4 min) del Day Pass offline e di
            // ogni fallback TTS senza MP3. Il teaser (~200 char) resta
            // ben sotto e non è toccato.
            val maxMs = (8000L + item.text.length * 120L).coerceAtMost(15 * 60_000L)
            armSpeechWatchdog(appContext, maxMs, "Speech watchdog fired, resetting queue state")
            return true
        }

        /** Watchdog dell'item corrente (TTS o MP3): uno solo alla volta. */
        private fun armSpeechWatchdog(appContext: Context, maxMs: Long, logMsg: String) {
            safetyRunnable?.let { safetyHandler.removeCallbacks(it) }
            val guard = Runnable {
                Log.w(TAG, logMsg)
                // (AUD-06) Solo stop + chiusura esplicita: l'onStop tardivo
                // porta l'id vecchio e viene ignorato.
                activeUtteranceId = null
                try { ttsInstance?.stop() } catch (_: Exception) { }
                finishActiveSpeech(appContext, notifyJs = true)
                processNextSpeech(appContext)
            }
            safetyRunnable = guard
            safetyHandler.postDelayed(guard, maxMs)
        }

        /**
         * (AUD-05 / AUD-14) Mette in pausa l'item attivo senza chiuderlo:
         * MP3 → pause() e posizione memorizzata; TTS → stop() del motore (il
         * TTS di sistema non ha pausa) tenendo l'item come "in pausa", cosi'
         * alla ripresa si rilegge da capo. Il watchdog viene sospeso.
         * Ritorna true se c'era qualcosa da mettere in pausa.
         */
        private fun pauseActiveSpeech(appContext: Context, byUser: Boolean): Boolean {
            val item = activeItem ?: return false
            if (speechPaused) {
                if (byUser) pausedByUser = true
                return true
            }
            speechPaused = true
            if (byUser) pausedByUser = true
            safetyRunnable?.let { safetyHandler.removeCallbacks(it) }
            safetyRunnable = null
            val mp = activeMediaPlayer
            if (mp != null) {
                try {
                    if (mp.isPlaying) {
                        pausedMp3PositionMs = mp.currentPosition
                        mp.pause()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Pausa MP3 fallita: ${e.message}")
                }
            } else {
                // L'onStop che segue porta l'id di questa utterance:
                // onUtteranceFinished lo ignora perche' speechPaused e' true.
                try { ttsInstance?.stop() } catch (_: Exception) { }
            }
            Log.d(TAG, "Voce nativa in pausa (${if (byUser) "utente" else "focus"}) per ${item.poiId}")
            return true
        }

        /**
         * (AUD-05 / AUD-14) Riprende l'item in pausa: MP3 dal punto in cui
         * era, TTS da capo (nuova utterance, nuovo id). Ritorna true se ha
         * ripreso qualcosa.
         */
        private fun resumeActiveSpeech(appContext: Context): Boolean {
            val item = activeItem ?: return false
            if (!speechPaused) return false
            speechPaused = false
            val mp = activeMediaPlayer
            if (mp != null) {
                try {
                    requestFocus(appContext)
                    mp.seekTo(pausedMp3PositionMs)
                    mp.start()
                    val restMs = (mp.duration - pausedMp3PositionMs).toLong() + 15_000L
                    armSpeechWatchdog(appContext, restMs.coerceIn(15_000L, 15 * 60_000L), "MP3 watchdog fired, resetting queue state")
                    Log.d(TAG, "MP3 ripreso da ${pausedMp3PositionMs} ms per ${item.poiId}")
                    return true
                } catch (e: Exception) {
                    Log.w(TAG, "Ripresa MP3 fallita: ${e.message}, passo oltre")
                    finishActiveSpeech(appContext, notifyJs = true)
                    processNextSpeech(appContext)
                    return false
                }
            }
            // TTS: si rilegge da capo (il testo di un teaser e' breve).
            requestFocus(appContext)
            if (ttsInstance == null || !ttsReady || !speakTts(appContext, item)) {
                Log.w(TAG, "Ripresa TTS fallita per ${item.poiId}, passo oltre")
                finishActiveSpeech(appContext, notifyJs = true)
                processNextSpeech(appContext)
                return false
            }
            Log.d(TAG, "TTS ripreso (da capo) per ${item.poiId}")
            return true
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
                // (AUD-14) Guida completa di 3-4 minuti a schermo spento: senza
                // wake lock la CPU puo' addormentarsi a meta' riproduzione.
                // Permesso WAKE_LOCK gia' nel manifest.
                try { mp.setWakeMode(appContext, PowerManager.PARTIAL_WAKE_LOCK) } catch (_: Exception) { }
                mp.setDataSource(file.absolutePath)
                mp.setOnCompletionListener { onUtteranceFinished(appContext, null) }
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
                        armSpeechWatchdog(appContext, maxMs, "MP3 watchdog fired, resetting queue state")
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
                activeUtteranceId = null
                speechPaused = false
                pausedByUser = false
                pausedMp3PositionMs = 0
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

            // (AUD-01) Coda finita: la guida JS che avevamo messo in pausa
            // riprende (no-op se non l'abbiamo fermata noi o se l'utente ha
            // premuto Pausa/Stop nel frattempo).
            if (speechQueue.isEmpty()) {
                WipBackgroundAudioService.resumeAfterNativeVoice()
            }
            if (item != null) notifyVoiceStateChanged()

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

        /**
         * Fine dell'item corrente. `utteranceId` e' quello del callback TTS
         * (null per l'MP3, che non ha utterance).
         * (AUD-06) Un callback con id diverso da quello attivo e' l'eco di
         * un'utterance gia' chiusa (stop esplicito, watchdog, pausa): si
         * ignora, altrimenti chiuderebbe l'item successivo.
         */
        private fun onUtteranceFinished(appContext: Context, utteranceId: String?) {
            if (utteranceId != null) {
                val attesa = activeUtteranceId
                if (attesa == null || utteranceId != attesa) {
                    Log.d(TAG, "Callback TTS ignorato per utterance non attiva ($utteranceId)")
                    return
                }
                // (AUD-05) In pausa il motore e' stato fermato da noi: l'item
                // resta attivo e riparte alla ripresa.
                if (speechPaused) return
            }
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
        /**
         * Lingua dell'utente per cui il telefono NON ha una voce usabile senza
         * rete, aggiornata a ogni applyTtsConfig (cioè a ogni init del TTS e a
         * ogni cambio di configurazione). null = si può parlare.
         * Vive nel companion come tutto il resto dello stato della coda.
         */
        @Volatile
        private var missingVoiceLang: String? = null

        /** Ultima notifica "voce mancante": una ogni 10 minuti, non una per POI. */
        @Volatile
        private var lastVoiceWarningAt: Long = 0L

        /** Come sopra, per "il pacchetto è in un'altra lingua". */
        @Volatile
        private var lastPackageLangWarningAt: Long = 0L

        /**
         * Mappa lingua dell'app → Locale del TTS. Unico punto di verità:
         * la usano applyTtsConfig e il controllo pre-download del plugin
         * (checkOfflineTtsVoice), che devono rispondere sulla stessa voce.
         */
        fun localeForLang(lang: String): Locale = when (lang) {
            "en" -> Locale.ENGLISH
            "fr" -> Locale.FRENCH
            "es" -> Locale("es", "ES")
            "de" -> Locale.GERMAN
            "ru" -> Locale("ru", "RU")
            "zh" -> Locale.SIMPLIFIED_CHINESE
            else -> Locale.ITALIAN
        }

        /**
         * Esiste una voce di questa lingua che il motore sa sintetizzare SENZA
         * RETE? `isNetworkConnectionRequired` è l'unico modo di saperlo prima di
         * provare: una voce di rete, offline, produce silenzio.
         *
         * Conservativo per scelta: se il motore non espone l'elenco delle voci
         * (lista nulla o vuota — succede su alcuni OEM e sugli engine di terze
         * parti) si risponde `true` e si prova a parlare. Meglio tentare che
         * accusare il telefono di una mancanza che non ha.
         */
        fun hasOfflineVoice(tts: TextToSpeech, locale: Locale): Boolean = try {
            val voices = tts.voices
            if (voices.isNullOrEmpty()) true
            else voices.any { v ->
                v.locale?.language == locale.language && !v.isNetworkConnectionRequired
            }
        } catch (_: Exception) {
            true
        }

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
            val locale = localeForLang(lang)
            // (23/08/2026) NIENTE PIÙ RIPIEGO SU UN'ALTRA LINGUA. Prima, se la
            // voce della lingua scelta mancava, si passava a italiano o
            // inglese: un utente tedesco si sentiva leggere in italiano un
            // testo tedesco, con la pronuncia di un'altra lingua. È peggio del
            // silenzio, perché sembra un guasto dell'app e non un dato
            // mancante del telefono. Ora si registra la lingua senza voce e
            // processNextSpeech lo DICE all'utente, con l'azione per
            // installarla.
            missingVoiceLang = try {
                val result = tts.setLanguage(locale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    lang
                } else if (!hasOfflineVoice(tts, locale)) {
                    // La voce c'è ma la fa il server del motore TTS: senza rete
                    // non esce un suono. È esattamente il caso che
                    // checkOfflineTtsVoice verifica PRIMA del download, e che
                    // fino a oggi nessuno ricontrollava al momento di parlare.
                    lang
                } else {
                    null
                }
            } catch (_: Exception) {
                // Un'eccezione qui non è la prova che la voce manchi: si prova
                // comunque a parlare, come si è sempre fatto.
                null
            }

            applyTtsGender(tts, appContext)
        }

        /**
         * Il genere della voce di SISTEMA deve seguire il personaggio scelto,
         * come già fa l'MP3 neurale (AudioPrefetchManager.azureVoiceFor: Nicky
         * = voce femminile, Dante = maschile, in tutte e sette le lingue).
         * Prima qui si impostava solo la lingua e il motore usava la sua voce
         * di default: offline, o quando il server TTS non risponde, Dante
         * parlava con voce di donna in ogni lingua.
         *
         * I nomi delle voci Android hanno la forma `it-it-x-kda#female_1-local`:
         * il marcatore `#female`/`#male` è la fonte affidabile del genere.
         */
        // Non più private (29/08/2026): la usa anche la voce diretta del plugin
        // (ItaintaBackgroundPoiPlugin.speakDirect), stesso genere del personaggio.
        fun applyTtsGender(tts: TextToSpeech, appContext: Context) {
            try {
                // Stessa preferenza letta da resolveGuideVoice (persistita dal
                // plugin): qui non si può chiamare, è nel corpo della classe.
                val character = appContext
                    .getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                    .getString("guideCharacter", null)
                val wantFemale = character != "dante"
                val target = tts.voice?.locale?.language
                    ?: tts.language?.language
                    ?: return
                val candidates = (tts.voices ?: return)
                    .filter { it.locale?.language == target && !it.isNetworkConnectionRequired }
                    .filter { v ->
                        val n = v.name.lowercase()
                        if (wantFemale) n.contains("#female") else n.contains("#male")
                    }
                if (candidates.isEmpty()) return
                // A parità di genere si preferisce la voce di qualità migliore.
                val best = candidates.maxByOrNull { it.quality } ?: return
                tts.setVoice(best)
            } catch (_: Exception) {
                // Nessuna voce con quel genere installata: si tiene quella di
                // default — meglio la voce sbagliata che il silenzio.
            }
        }

        private fun attachProgressListener(appContext: Context) {
            ttsInstance?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) { }
                override fun onDone(utteranceId: String?) { onUtteranceFinished(appContext, utteranceId) }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) { onUtteranceFinished(appContext, utteranceId) }
                override fun onError(utteranceId: String?, errorCode: Int) { onUtteranceFinished(appContext, utteranceId) }
                override fun onStop(utteranceId: String?, interrupted: Boolean) { onUtteranceFinished(appContext, utteranceId) }
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

        // Non più private (29/08/2026): la usa anche la voce diretta del plugin.
        fun speakableText(text: String): String {
            val cleaned = EMOJI_REGEX.replace(text, "").replace(Regex("\\s+"), " ").trim()
            // Mai utterance vuota (item tutto-emoji): la coda resterebbe bloccata.
            return cleaned.ifBlank { text.trim() }
        }

        /**
         * (AUD-05) Cambi di focus audio, uguali su tutte le API:
         *  - LOSS_TRANSIENT (telefonata, prompt del navigatore): PAUSA — l'item
         *    resta attivo e riparte al GAIN (MP3 dal punto, TTS da capo);
         *  - GAIN: ripresa, salvo pausa esplicita dell'utente;
         *  - LOSS definitivo: si chiude l'item e si prova col successivo
         *    (processNextSpeech rinvia da solo di 8 s se c'e' una chiamata).
         * Prima ogni perdita chiudeva l'item e la coda restava ferma per
         * sempre: nessun ramo GAIN, nessun processNextSpeech.
         */
        private fun onAudioFocusChange(appContext: Context, change: Int) {
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                    // CAN_DUCK: siamo gia' voce di navigazione, non ci si
                    // abbassa sotto un'altra voce — pausa breve come per
                    // la perdita transitoria.
                    pauseActiveSpeech(appContext, byUser = false)
                    notifyVoiceStateChanged()
                }
                AudioManager.AUDIOFOCUS_GAIN -> {
                    if (!pausedByUser && resumeActiveSpeech(appContext)) notifyVoiceStateChanged()
                }
                AudioManager.AUDIOFOCUS_LOSS -> {
                    activeUtteranceId = null
                    try { ttsInstance?.stop() } catch (_: Exception) { }
                    finishActiveSpeech(appContext, notifyJs = true)
                    processNextSpeech(appContext)
                }
            }
        }

        private fun requestFocus(appContext: Context) {
            val am = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Richiesta gia' in piedi (ripresa dopo pausa): non se ne
                // crea una seconda, il sistema terrebbe entrambe.
                if (activeFocusRequest != null) return
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener(
                        AudioManager.OnAudioFocusChangeListener { change -> onAudioFocusChange(appContext, change) },
                        safetyHandler
                    )
                    .build()
                activeFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                if (legacyFocusListener != null) return
                val listener = AudioManager.OnAudioFocusChangeListener { change -> onAudioFocusChange(appContext, change) }
                legacyFocusListener = listener
                @Suppress("DEPRECATION")
                am.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
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
                val listener = legacyFocusListener
                legacyFocusListener = null
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(listener)
            }
        }

        private fun broadcastTeaserEvent(
            appContext: Context,
            event: String,
            item: SpeechItem,
            // Motivo del fallimento, solo per l'evento "listenFailed": il JS
            // deve poter distinguere «manca il testo» da «manca la voce», che
            // si risolvono in due modi diversi.
            reason: String? = null
        ) {
            val data = JSONObject().apply {
                put("poiId", item.poiId ?: "")
                put("kind", item.kind)
                if (reason != null) put("reason", reason)
            }
            val intent = Intent("com.itaintasca.POI_EVENT").apply {
                setPackage(appContext.packageName)
                putExtra("event", event)
                putExtra("data1", data.toString())
                item.poiId?.let { putExtra("poiId", it) }
            }
            appContext.sendBroadcast(intent)
        }

        /**
         * LA VERITÀ AL POSTO DEL SILENZIO (23/08/2026). Quando la voce della
         * lingua dell'utente non è installata (o esiste solo come voce di rete)
         * l'audioguida non può parlare: prima si ripiegava su italiano o
         * inglese — un tedesco si sentiva leggere il proprio testo con la
         * pronuncia italiana — e la coda proseguiva come se tutto andasse bene.
         *
         * Ora si notifica, in lingua, e il tocco porta DIRITTO alle impostazioni
         * dati vocali del sistema (ACTION_INSTALL_TTS_DATA, lo stesso intent del
         * plugin): l'unico posto dove il problema si risolve. Se il motore non
         * la espone si ripiega sulle impostazioni TTS e poi sull'app.
         *
         * Una notifica ogni 10 minuti, non una per POI: camminando in centro
         * sarebbero decine, e la ripetizione trasformerebbe un'informazione
         * utile in molestia.
         */
        private fun showVoiceMissingNotification(context: Context, lang: String) {
            val now = System.currentTimeMillis()
            if (now - lastVoiceWarningAt < 10 * 60_000L) return
            lastVoiceWarningAt = now
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val pm = context.packageManager
                val target = listOf(
                    Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA),
                    Intent("com.android.settings.TTS_SETTINGS")
                ).firstOrNull { it.resolveActivity(pm) != null }
                    ?: Intent(context, MainActivity::class.java)
                target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pIntent = PendingIntent.getActivity(
                    context, 9997, target,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
                val builder = NotificationCompat.Builder(context, "geofencing_channel")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(NotificationStrings.get(lang, "voice_missing_title"))
                    .setContentText(NotificationStrings.get(lang, "voice_missing_text"))
                    .setStyle(
                        NotificationCompat.BigTextStyle()
                            .bigText(NotificationStrings.get(lang, "voice_missing_text"))
                    )
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pIntent)
                nm.notify(9997, builder.build())
            } catch (_: Exception) {
                // Notifiche negate o canale assente: non è un motivo per far
                // cadere la coda della voce.
            }
        }

        /**
         * IL PACCHETTO È IN UN'ALTRA LINGUA (23/08/2026). Un pacchetto offline
         * porta una lingua sola, quella scelta al download; chi poi cambia
         * lingua nell'app si ritrova un'area piena di testi che non gli
         * servono. Finora quel caso finiva in silenzio (ArrivalWorker scarta il
         * testo e torna) o in un testo italiano letto con la voce tedesca.
         * Dirlo, con le due lingue scritte per esteso, è l'unica risposta
         * onesta: da lì l'utente sa cosa fare — riscaricare l'area nella sua
         * lingua, o ascoltare in quella del pacchetto.
         *
         * Stesso throttle di 10 minuti della voce mancante, stesso motivo.
         */
        fun notifyPackageLanguage(context: Context, packageLang: String, userLang: String) {
            val now = System.currentTimeMillis()
            if (now - lastPackageLangWarningAt < 10 * 60_000L) return
            lastPackageLangWarningAt = now
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val intent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                val pIntent = PendingIntent.getActivity(
                    context, 9996, intent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
                val text = NotificationStrings.get(
                    userLang, "pkg_lang_text",
                    NotificationStrings.languageName(packageLang),
                    NotificationStrings.languageName(userLang)
                )
                val builder = NotificationCompat.Builder(context, "geofencing_channel")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(NotificationStrings.get(userLang, "pkg_lang_title"))
                    .setContentText(text)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .setContentIntent(pIntent)
                nm.notify(9996, builder.build())
            } catch (_: Exception) { }
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
            // (MAP-04) GEOFENCE_NOT_AVAILABLE (1000): il sistema ha buttato
            // via TUTTI i recinti (posizione spenta e riaccesa, Play Services
            // riavviati). Il GeofenceManager pero' li credeva ancora
            // registrati (registeredPoiIds pieno) e faceva solo diff: la
            // finestra restava vuota per sempre. Si chiede al servizio di
            // azzerare e ri-registrare tutto al prossimo fix.
            if (event.errorCode == GeofenceStatusCodes.GEOFENCE_NOT_AVAILABLE) {
                try {
                    val i = Intent(context, com.itaintasca.app.service.ItaintaBackgroundPoiService::class.java)
                        .setAction(com.itaintasca.app.service.ItaintaBackgroundPoiService.ACTION_REFRESH_GEOFENCES)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(i)
                    } else {
                        context.startService(i)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Richiesta di ri-registrazione geofence non inviata: ${e.message}")
                }
            }
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
        // (AUD-04) Stessa regola per gli ARRIVI: prima ogni arrivo del batch
        // chiamava handleArrival → ArrivalWorker, che scalava il Day Pass e
        // accodava la guida COMPLETA per ciascuno (tre monumenti nella stessa
        // piazza = tre guide consumate e 10 minuti di voce in fila). Ora solo
        // il primo (per priorita' e distanza) ha la guida; gli altri scrivono
        // lo stato e mostrano la notifica «Tocca per ascoltare».
        var arrivalSpokenInBatch = false

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

                // GATE DI BUSSOLA (23/08/2026), SOLO sull'arrivo: se il POI e'
                // ormai alle spalle non si racconta ADESSO — si rimanda, senza
                // marcare lo stato e senza consumare nessun cooldown, e si
                // riprova al fix successivo. L'avviso a 150 m (approach) non e'
                // toccato: serve a preparare teaser e MP3 e deve scattare
                // comunque. Le tappe di un itinerario non passano mai dal gate:
                // le ha scelte l'utente e si raccontano in ogni caso.
                // `dentroPerimetro` qui e' "entro 30 m dal muro": al gate serve
                // il DENTRO stretto, altrimenti sarebbe sempre fail-open.
                val gate = if (info.isItinerary) BearingGate.Esito.IGNORA_GATE else BearingGate.valuta(
                    context, poi, currentLoc,
                    dentroPerimetro = Footprints.dentroPerimetro(
                        info.poiId, poi.footprint, currentLoc.latitude, currentLoc.longitude
                    ),
                    distanzaM = info.realDist
                )

                if (haPerimetro && !dentroPerimetro) {
                    Log.d(TAG, "Arrivo rinviato per ${poi.nome}: dentro il cerchio ma a piu' di ${Footprints.triggerM(isDrivingMode).toInt()} m dal perimetro")
                } else if (gate == BearingGate.Esito.RIMANDA) {
                    Log.d(TAG, "Arrivo rimandato per ${poi.nome}: e' alle spalle (gate di bussola)")
                } else if (!blockedArrival) {
                    // ✅ [ROBUSTEZZA] - Permettiamo l'arrivo anche se l'approccio è stato saltato (es. marcia veloce)
                    val fired = handleArrival(
                        context, info.poiId, poi.nome, poi.guideDefault, poi.isGem, info.isItinerary,
                        isAutomaticMode, db, distanceM = info.realDist, fullGuide = !arrivalSpokenInBatch
                    )
                    if (fired) arrivalSpokenInBatch = true
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

    /**
     * (AUD-08) Fix corrente con TIMEOUT. Prima `getCurrentLocation(...).await()`
     * senza limite dentro goAsync(): indoor o con GPS lento il Task poteva
     * restare appeso oltre i ~10 s del receiver e l'OS lo chiudeva a meta',
     * perdendo l'ENTER. Ora: richiesta con durata massima 3 s (accetta un fix
     * fresco fino a 15 s), token di cancellazione, e comunque un tetto di 4 s
     * attorno all'await; oltre, si ripiega su lastLocation (il chiamante
     * verifica poi accuratezza ed eta').
     */
    private suspend fun getCurrentPreciseLocation(context: Context): Location? {
        val fusedClient = try {
            LocationServices.getFusedLocationProviderClient(context)
        } catch (e: Exception) {
            return null
        }
        val fresh: Location? = try {
            withTimeoutOrNull(4000L) {
                val cts = CancellationTokenSource()
                try {
                    val req = CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                        .setDurationMillis(3000L)
                        .setMaxUpdateAgeMillis(15_000L)
                        .build()
                    fusedClient.getCurrentLocation(req, cts.token).await()
                } finally {
                    // Scaduto il tempo (o finito) si cancella la richiesta:
                    // niente GPS acceso a vuoto dopo che il receiver e' morto.
                    try { cts.cancel() } catch (_: Exception) { }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "getCurrentLocation fallita: ${e.message}")
            null
        }
        if (fresh != null) return fresh
        return try {
            fusedClient.lastLocation.await()
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

    /**
     * Arrivo a un POI. Ritorna true se l'arrivo e' stato EMESSO (stato
     * scritto, evento, notifica), false se scartato (POI assente o gia'
     * ARRIVED_FIRED): il chiamante usa il ritorno per l'anti-spam di batch.
     *
     * `fullGuide` (AUD-04): false per i POI successivi al primo nello stesso
     * fix/batch — stato e notifica «Tocca per ascoltare», ma niente voce,
     * niente ArrivalWorker (che consumerebbe il pass e accoderebbe il testo
     * integrale) e niente launchApp (l'app in foreground farebbe partire la
     * guida da sola).
     */
    private suspend fun handleArrival(
        context: Context, poiId: String, name: String, guide: String, isGem: Boolean, isItinerary: Boolean, isAutomaticMode: Boolean, db: PoiDatabase, distanceM: Float? = null,
        fullGuide: Boolean = true
    ): Boolean = lockForPoi(poiId).withLock {
        var poi = db.poiDao().getPoiById(poiId)
        if (poi == null) {
            // Senza il POI nel DB locale non abbiamo lat/lon reali: prima si
            // procedeva comunque e l'evento "arrivato" partiva verso il JS con
            // 0.0,0.0 (banner/notifica sul punto sbagliato). Meglio scartare
            // l'evento: il prossimo fetch/refresh ripopolerà Room.
            Log.w(TAG, "handleArrival: POI $poiId non trovato nel DB locale, evento poiArrived scartato")
            return false
        }
        // Ri-verifica SOTTO LOCK: stesso motivo di handleApproach — il loop
        // predittivo del servizio e il path broadcast possono decidere
        // l'arrivo quasi insieme per lo stesso POI.
        val stateNow = db.poiDao().getTriggerState(poiId)?.state
        if (stateNow == TriggerState.ARRIVED_FIRED) {
            Log.d(TAG, "handleArrival: $poiId già ARRIVED_FIRED, doppio trigger evitato")
            return false
        }
        db.poiDao().updateTriggerState(TriggerStateEntity(poiId, TriggerState.ARRIVED_FIRED))
        // Il POI ha parlato: il suo contatore di rinvii non serve piu' (spec
        // del gate, punto 7 — si azzera appena torna davanti o appena parla).
        BearingGate.azzera(poiId)
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
        if (fullGuide) {
            val online = com.itaintasca.app.offline.ConnectivityMonitor.isOnline(context)
            val mayNeedFullGuide = isAutomaticMode && !silentMode && !isAppInForeground(context)
            val needsLongWork = online && (teaser.isNullOrBlank() || mayNeedFullGuide)
            val forwarded = needsLongWork && ArrivalWorker.dispatchToService(context, params)
            if (!forwarded) {
                // (AUD-08) Ripiego INLINE nel receiver (il servizio non e'
                // avviabile da background): niente rete — ne' teaser dal
                // server ne' download MP3 — e tetto di 8 s, cosi' goAsync()
                // non viene chiuso a meta' dall'OS. Voce dal teaser locale e,
                // col pass, guida dal pacchetto offline / MP3 gia' in cache.
                // (androidx.work non e' fra le dipendenze: niente WorkManager.)
                val done = withTimeoutOrNull(8000L) {
                    ArrivalWorker.run(context, params, offlineOnly = true)
                    true
                }
                if (done == null) Log.w(TAG, "Arrivo $poiId: lavoro inline oltre gli 8 s, interrotto")
            }
        }

        // (AUD-11) Il testo della notifica dice la verita': «Avvio audioguida»
        // SOLO se la guida partira' davvero da sola (gia' acquistata o Day
        // Pass attivo, ArrivalWorker.run:158-167); altrimenti prima diceva
        // «Avvio audioguida» e restava muta. Senza pass → «Tocca per ascoltare».
        val autoPlay = fullGuide && isAutomaticMode && !silentMode && run {
            val alreadyPurchased = com.itaintasca.app.service.ListeningHistoryStore.isAlreadyPurchased(context, poiId)
            val passActive = com.itaintasca.app.offline.BillingLogic.isPassActive(
                System.currentTimeMillis(),
                prefs.getLong("daypass_expires_at", 0L),
                prefs.getInt("daypass_used", 0),
                prefs.getInt("daypass_cap", 0)
            )
            alreadyPurchased || passActive
        }

        if (silentMode) {
            // Notifica d'arrivo con il TESTO del teaser ben leggibile: è il
            // sostituto della voce. Niente launchApp: aprirebbe l'app che in
            // automatico farebbe partire l'audio.
            // (22/08/2026) Notifiche nella lingua dell'utente (NotificationStrings), non più italiano fisso
            showNotification(context, NotificationStrings.get(lang, "arrival_at", name), teaser ?: fallbackTeaser, poiId, guideVoice, true, bigText = fullMsg)
        } else if (autoPlay) {
            showNotification(context, NotificationStrings.get(lang, "arrived_title"), NotificationStrings.get(lang, "arrived_starting", name), poiId, guideVoice, true)
            launchApp(context, poiId, guideVoice)
        } else if (isAutomaticMode && fullGuide) {
            // Automatico ma senza pass/acquisto: si apre l'app (che propone
            // l'acquisto) e la notifica invita ad ascoltare, senza promettere
            // un avvio che non ci sara'.
            showNotification(context, NotificationStrings.get(lang, "arrival_at", name), NotificationStrings.get(lang, "arrived_tap"), poiId, guideVoice, true)
            launchApp(context, poiId, guideVoice)
        } else {
            showNotification(context, NotificationStrings.get(lang, "arrival_at", name), NotificationStrings.get(lang, "arrived_tap"), poiId, guideVoice, true)
        }
        true
    }

    private fun triggerTeaserGeneration(context: Context, poiId: String, lang: String) {
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // (22/08/2026) Timeout espliciti: il default di OkHttp (10 s
                // connect, 10 s read) tagliava la generazione AI del teaser,
                // che può superare i 10 s; 25 s di read è il tetto ragionevole
                // per un job in background che non blocca nessuno.
                // (23/08/2026) Timeout identici, ma su newBuilder() del client
                // condiviso (WipHttp): niente pool/dispatcher nuovi a ogni
                // avvicinamento.
                val client = com.itaintasca.app.service.WipHttp.client.newBuilder()
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
                    .url(WipApi.BASE + "/api/poi/batch-teaser")
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
                        // (SEC-03) Token scaduto: il JS deve rinnovarlo.
                        if (response.code == 401 && !accessToken.isNullOrBlank()) WipApi.notifyTokenExpired(appContext)
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
