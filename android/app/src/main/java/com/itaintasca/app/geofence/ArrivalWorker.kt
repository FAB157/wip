package com.itaintasca.app.geofence

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.service.ItaintaBackgroundPoiService
import com.itaintasca.app.service.SupabaseClient
import org.json.JSONObject

/**
 * (22/08/2026) Lavoro LUNGO dell'arrivo a un POI, spostato fuori dal
 * BroadcastReceiver.
 *
 * GeofenceBroadcastReceiver.handleArrival faceva tutto dentro goAsync(): il
 * recupero del teaser dal server, il get-or-create del testo integrale
 * dell'audioguida (`/api/poi/audioguide`, può impiegare decine di secondi se
 * il server deve generare) e il download dell'MP3. goAsync() concede ~10 s
 * in background (30 s in foreground): oltre quel tempo l'OS chiude il
 * receiver e il processo può essere ucciso a metà download — l'utente
 * sentiva il teaser e poi il silenzio.
 *
 * Ora il receiver fa solo la parte immediata (stato Room, evento al plugin,
 * vibrazione, notifica) e INOLTRA il resto al Foreground Service con
 * ACTION_HANDLE_ARRIVAL: lì non c'è limite di tempo. Se l'inoltro non è
 * possibile (servizio non avviabile), `run` viene eseguito comunque inline
 * dal receiver come prima — mai un arrivo perso.
 *
 * La logica vive QUI una volta sola, chiamata da entrambi i percorsi.
 */
object ArrivalWorker {

    private const val TAG = "ArrivalWorker"
    const val ACTION_HANDLE_ARRIVAL = "com.itaintasca.app.HANDLE_ARRIVAL"

    data class Params(
        val poiId: String,
        val name: String,
        val isGem: Boolean,
        val isItinerary: Boolean,
        val isAutomaticMode: Boolean,
        val priority: Int,
        val lang: String,
        val guideVoice: String,
        val silentMode: Boolean,
        val arrivalMsg: String,
        val fallbackTeaser: String,
        val poiLat: Double,
        val poiLon: Double,
        val poiType: String?
    )

    fun toIntent(context: Context, p: Params): Intent =
        Intent(context, ItaintaBackgroundPoiService::class.java).apply {
            action = ACTION_HANDLE_ARRIVAL
            putExtra("poiId", p.poiId)
            putExtra("name", p.name)
            putExtra("isGem", p.isGem)
            putExtra("isItinerary", p.isItinerary)
            putExtra("isAutomaticMode", p.isAutomaticMode)
            putExtra("priority", p.priority)
            putExtra("lang", p.lang)
            putExtra("guideVoice", p.guideVoice)
            putExtra("silentMode", p.silentMode)
            putExtra("arrivalMsg", p.arrivalMsg)
            putExtra("fallbackTeaser", p.fallbackTeaser)
            putExtra("poiLat", p.poiLat)
            putExtra("poiLon", p.poiLon)
            if (p.poiType != null) putExtra("poiType", p.poiType)
        }

    fun fromIntent(intent: Intent): Params? {
        val poiId = intent.getStringExtra("poiId") ?: return null
        return Params(
            poiId = poiId,
            name = intent.getStringExtra("name") ?: "",
            isGem = intent.getBooleanExtra("isGem", false),
            isItinerary = intent.getBooleanExtra("isItinerary", false),
            isAutomaticMode = intent.getBooleanExtra("isAutomaticMode", true),
            priority = intent.getIntExtra("priority", 1),
            lang = intent.getStringExtra("lang") ?: "it",
            guideVoice = intent.getStringExtra("guideVoice") ?: "nicky",
            silentMode = intent.getBooleanExtra("silentMode", false),
            arrivalMsg = intent.getStringExtra("arrivalMsg") ?: "",
            fallbackTeaser = intent.getStringExtra("fallbackTeaser") ?: "",
            poiLat = intent.getDoubleExtra("poiLat", 0.0),
            poiLon = intent.getDoubleExtra("poiLon", 0.0),
            poiType = intent.getStringExtra("poiType")
        )
    }

    /**
     * Tenta l'inoltro al servizio. Ritorna true se l'intent è partito: da quel
     * momento il lavoro è del servizio. false = il chiamante deve eseguire
     * `run` inline.
     */
    fun dispatchToService(context: Context, p: Params): Boolean {
        return try {
            val intent = toIntent(context, p)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            true
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException / IllegalStateException:
            // si ripiega sull'esecuzione inline nel receiver (come prima).
            Log.w(TAG, "Inoltro arrivo al servizio non riuscito (${e.message}), eseguo inline")
            false
        }
    }

    /**
     * Il lavoro vero e proprio. Stessa sequenza che stava in handleArrival:
     *  1. teaser mancante → recupero dal server (online) e aggiornamento Room;
     *  2. voce del teaser (salvo modalità silenziosa);
     *  3. Day Pass / già acquistato → audioguida completa: MP3 in cache,
     *     MP3 scaricato ora, oppure testo integrale letto dal TTS.
     *
     * `offlineOnly` (AUD-08): true quando si gira INLINE nel receiver perche'
     * il servizio non era avviabile — nessuna chiamata di rete (ne' teaser
     * dal server, ne' testo integrale, ne' download MP3): si usa solo cio'
     * che e' gia' sul telefono, cosi' il lavoro sta nei ~10 s di goAsync().
     */
    suspend fun run(context: Context, p: Params, offlineOnly: Boolean = false) {
        val appContext = context.applicationContext
        val db = PoiDatabase.getInstance(appContext)
        val prefs = appContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        // Se nel frattempo l'utente ha fermato l'audioguida, silenzio.
        if (!prefs.getBoolean("isServiceActive", false)) return
        val online = !offlineOnly && com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)

        try {
            var poi = db.poiDao().getPoiById(p.poiId)

            // 1) Teaser dal server (solo online)
            if (poi?.teaserText.isNullOrBlank() && online) {
                val freshPoi = SupabaseClient(appContext).fetchPoiById(p.poiId, p.lang)
                if (freshPoi != null && !freshPoi.teaserText.isNullOrBlank()) {
                    poi = freshPoi
                    db.poiDao().insertPois(listOf(freshPoi))
                }
            }

            val teaser = poi?.teaserText
            val fullMsg = if (!teaser.isNullOrBlank()) "${p.arrivalMsg} $teaser" else "${p.arrivalMsg} ${p.fallbackTeaser}"

            // 2) Voce del teaser
            if (!p.silentMode) {
                GeofenceBroadcastReceiver.enqueue(
                    appContext,
                    GeofenceBroadcastReceiver.Companion.SpeechItem(fullMsg, p.isGem, p.isItinerary, p.poiId, p.priority, kind = "arrival")
                )
            }

            // 3) Audioguida completa (Day Pass / già acquistato), solo con app
            //    NON in foreground: in foreground se ne occupa il JS.
            if (!p.isAutomaticMode || p.silentMode || isAppInForeground(appContext)) return

            val alreadyPurchased = com.itaintasca.app.service.ListeningHistoryStore
                .isAlreadyPurchased(appContext, p.poiId)
            val passUsed = prefs.getInt("daypass_used", 0)
            val passActive = com.itaintasca.app.offline.BillingLogic.isPassActive(
                System.currentTimeMillis(),
                prefs.getLong("daypass_expires_at", 0L),
                passUsed,
                prefs.getInt("daypass_cap", 0)
            )
            if (!alreadyPurchased && !passActive) return

            // CATENA FALLBACK GUIDA COMPLETA:
            // 1) MP3 prefetchato in cache locale (partenza istantanea)
            // 2) MP3 scaricabile ORA (online; il server è caldo grazie al
            //    prefetch dell'approach → di solito solo un redirect)
            // 3) testo integrale audio_text letto dal TTS di sistema
            var fullText = db.offlineDao().getPoiById(p.poiId)?.audioText
            // Mono-lingua: il testo offline è nella lingua del pacchetto; se
            // non combacia con la lingua utente si scarta e si rifetcha.
            val pkgLang = db.offlineDao().getPoiPackageLanguage(p.poiId)
            var scartatoPerLingua = false
            if (!fullText.isNullOrBlank() && pkgLang != null && !pkgLang.equals(p.lang, ignoreCase = true)) {
                fullText = null
                scartatoPerLingua = true
            }
            var mp3File = com.itaintasca.app.service.AudioPrefetchManager
                .cachedFile(appContext, p.poiId, p.lang, p.guideVoice)
            // (28/08/2026) 402 dal server = l'utente NON ha diritto al testo
            // integrale: `anteprima` porta le prime 2 frasi (anche vuote).
            var anteprima: String? = null
            if (fullText.isNullOrBlank() && mp3File == null && online) {
                val audioguideToken = com.itaintasca.app.service.SecurePrefs.get(appContext)
                    .getString(com.itaintasca.app.service.ListeningHistoryStore.PREF_ACCESS_TOKEN, "")
                // POSSESSO (29/08/2026): qui NON si scrive il mirror
                // `owned_poi_ids_<userId>`. Il servizio non chiede mai
                // l'addebito (`charge:true` non parte da qui): si arriva a
                // questa riga solo con `alreadyPurchased || passActive`,
                // quindi un 200 vuol dire "gia' suo" oppure "Day Pass" — e il
                // pass e' accesso a tempo, non possesso. Segnarlo qui
                // regalerebbe per sempre ogni POI sentito col pass.
                when (val esito = SupabaseClient(appContext).fetchAudioguide(p.poiId, p.lang, p.guideVoice, audioguideToken)) {
                    is SupabaseClient.AudioguideResult.Testo -> fullText = esito.text
                    is SupabaseClient.AudioguideResult.Anteprima -> anteprima = esito.preview
                    SupabaseClient.AudioguideResult.Fallito -> { /* si prosegue: MP3/TTS non disponibili */ }
                }
            }
            if (anteprima != null) {
                // CREDITI RICHIESTI: niente pass consumato, niente storico.
                // L'anteprima si legge come teaser solo se dice qualcosa in
                // piu' del teaser gia' accodato; il JS riceve l'evento per
                // proporre l'acquisto; la notifica invita ad ascoltare
                // (tasto ▶ = deep link nell'app) e spiega che servono crediti.
                val giaNelTeaser = !teaser.isNullOrBlank() && teaser.contains(anteprima)
                if (anteprima.isNotBlank() && !giaNelTeaser && !p.silentMode) {
                    GeofenceBroadcastReceiver.enqueue(
                        appContext,
                        GeofenceBroadcastReceiver.Companion.SpeechItem(anteprima, p.isGem, p.isItinerary, p.poiId, p.priority, kind = "arrival")
                    )
                }
                sendEventToPlugin(appContext, "audioguideCreditsRequired", p.poiId, p.name, p.poiLat, p.poiLon)
                try {
                    GeofenceBroadcastReceiver.showCreditsRequiredNotification(
                        appContext, p.poiId, p.name, p.guideVoice, p.lang, anteprima
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Notifica crediti richiesti non mostrata: ${e.message}")
                }
                return
            }
            if (mp3File == null && !fullText.isNullOrBlank() && online) {
                mp3File = com.itaintasca.app.service.AudioPrefetchManager
                    .downloadNow(appContext, p.poiId, p.lang, p.guideVoice, fullText)
            }
            if (mp3File == null && fullText.isNullOrBlank()) {
                // MAI IL SILENZIO SENZA SPIEGAZIONE (23/08/2026). Qui si
                // arrivava con un `return` muto: l'utente e' davanti al POI, il
                // Day Pass e' attivo, e non succede niente — senza sapere se e'
                // rotta l'app, se manca la rete o se ha sbagliato qualcosa.
                // Il caso piu' frequente e' proprio quello sopra: il pacchetto
                // offline e' in un'altra lingua, il testo c'e' ma e' stato
                // scartato, e senza rete non si puo' rifetchare. Va detto, con
                // le due lingue in chiaro, come fa gia' playOfflineGuide.
                if (scartatoPerLingua && pkgLang != null) {
                    try {
                        GeofenceBroadcastReceiver.notifyPackageLanguage(appContext, pkgLang, p.lang)
                    } catch (e: Exception) {
                        Log.w(TAG, "Avviso lingua pacchetto non mostrato: ${e.message}")
                    }
                }
                return
            }

            // Il pass si consuma solo se il POI NON era già acquistato
            if (!alreadyPurchased) {
                prefs.edit().putInt("daypass_used", passUsed + 1).apply()
            }
            GeofenceBroadcastReceiver.enqueue(
                appContext,
                GeofenceBroadcastReceiver.Companion.SpeechItem(
                    fullText ?: "", p.isGem, p.isItinerary, p.poiId, p.priority,
                    kind = "arrival", audioFile = mp3File?.absolutePath
                )
            )
            if (mp3File == null && !fullText.isNullOrBlank()) {
                // Prefetch/redirect MP3 falliti: l'audioguida intera viene letta
                // dal TTS di sistema. Evento per il JS ("voce di riserva").
                sendEventToPlugin(appContext, "audioQualityDegraded", p.poiId, p.name, p.poiLat, p.poiLon)
            }
            // Info aggiuntive incluse nel pass: la descrizione breve se distinta
            // dal testo guida (stessa guardia lingua della guida).
            val extra = if (pkgLang != null && !pkgLang.equals(p.lang, ignoreCase = true)) null
                        else db.offlineDao().getPoiById(p.poiId)?.descriptionShort
            if (!extra.isNullOrBlank() && extra != fullText && fullText?.contains(extra) != true) {
                GeofenceBroadcastReceiver.enqueue(
                    appContext,
                    GeofenceBroadcastReceiver.Companion.SpeechItem(extra, p.isGem, p.isItinerary, p.poiId, p.priority, kind = "arrival")
                )
            }
            // Ogni ascolto completo in background finisce nello storico.
            com.itaintasca.app.service.ListeningHistoryStore.recordListening(
                appContext, p.poiId, p.name, p.poiType, null
            )
        } catch (e: Exception) {
            Log.w(TAG, "Arrivo ${p.poiId}: lavoro lungo fallito: ${e.message}")
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

    /** Stesso formato di GeofenceBroadcastReceiver.sendEventToPlugin (setPackage incluso). */
    private fun sendEventToPlugin(context: Context, event: String, poiId: String, poiName: String, lat: Double, lon: Double) {
        val jsonData = JSONObject().apply {
            put("poiId", poiId)
            put("poiName", poiName)
            put("lat", lat)
            put("lon", lon)
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
