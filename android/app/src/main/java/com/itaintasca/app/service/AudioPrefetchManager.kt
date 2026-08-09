package com.itaintasca.app.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * PREFETCH MP3 AUDIOGUIDE — al PRIMO AVVISO (approach, raggio alert 150m piedi /
 * 300m auto) scarica in background l'MP3 dell'audioguida completa nella cache
 * file locale, così al trigger di arrivo la riproduzione parte ISTANTANEA
 * (e funziona anche se nel frattempo la rete è sparita).
 *
 * L'MP3 arriva dallo STESSO endpoint usato dal player web/JS
 * (POST https://itainta.vercel.app/api/tts/smart {text, voice}): il server è
 * cache-first (bucket audio_cache di Supabase, chiave md5(testo)+voce), quindi
 * per i POI già ascoltati da altri utenti risponde con un redirect immediato
 * all'MP3 già sintetizzato.
 *
 * Regole rigide:
 * - best-effort TOTALE: nessun errore di prefetch deve mai bloccare o
 *   degradare il comportamento attuale (tutto in try/catch, coroutine dedicata);
 * - i file più vecchi di 24h vengono eliminati (cleanup a ogni prefetch e
 *   all'avvio del servizio);
 * - un solo download per (poi, lingua) alla volta.
 */
object AudioPrefetchManager {

    private const val TAG = "AudioPrefetch"
    private const val TTS_ENDPOINT = "https://itainta.vercel.app/api/tts/smart"
    private const val MAX_AGE_MS = 24 * 60 * 60 * 1000L
    // Un MP3 sotto ~1KB è un errore mascherato (il server stesso scarta <500B)
    private const val MIN_VALID_BYTES = 1000L

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val inFlight: MutableSet<String> =
        java.util.Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap())

    // Timeout larghi: se il server deve sintetizzare da zero (Azure) un testo
    // di 2-4 minuti possono servire decine di secondi. Il prefetch gira in
    // background, non blocca nessuno.
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    // Client "rapido" per il gradino sincrono al trigger (downloadNow): se il
    // server deve sintetizzare da zero non teniamo in ostaggio il receiver —
    // scaduto il timeout si passa subito al TTS del testo.
    private val quickClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    private fun cacheDir(context: Context): File =
        File(context.cacheDir, "audio_prefetch").apply { if (!exists()) mkdirs() }

    private fun fileFor(context: Context, poiId: String, lang: String): File {
        val safe = "${poiId}_$lang".replace(Regex("[^A-Za-z0-9_-]"), "_")
        return File(cacheDir(context), "$safe.mp3")
    }

    /**
     * MP3 in cache pronto da riprodurre, oppure null. I file scaduti (>24h)
     * o troppo piccoli per essere audio vero vengono eliminati al volo.
     */
    fun cachedFile(context: Context, poiId: String, lang: String): File? {
        return try {
            val f = fileFor(context, poiId, lang)
            when {
                !f.exists() -> null
                System.currentTimeMillis() - f.lastModified() > MAX_AGE_MS -> {
                    f.delete(); null
                }
                f.length() < MIN_VALID_BYTES -> {
                    f.delete(); null
                }
                else -> f
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Elimina i file più vecchi di 24h (e i .tmp orfani di download interrotti). */
    fun cleanup(context: Context) {
        try {
            val now = System.currentTimeMillis()
            cacheDir(context).listFiles()?.forEach { f ->
                val age = now - f.lastModified()
                if (age > MAX_AGE_MS || (f.name.endsWith(".tmp") && age > 60 * 60 * 1000L)) {
                    try { f.delete() } catch (_: Exception) { }
                }
            }
        } catch (_: Exception) { }
    }

    /**
     * Avvio del prefetch in background (chiamato da handleApproach al primo
     * avviso). Fire-and-forget: mai eccezioni verso il chiamante.
     */
    fun prefetch(context: Context, poiId: String, lang: String, guideCharacter: String?) {
        val appContext = context.applicationContext
        scope.launch {
            try {
                cleanup(appContext)
                if (cachedFile(appContext, poiId, lang) != null) return@launch
                if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return@launch
                val text = resolveAudioText(appContext, poiId, lang, guideCharacter ?: "nicky") ?: return@launch
                downloadBlocking(appContext, poiId, lang, guideCharacter, text)
            } catch (e: Exception) {
                Log.w(TAG, "prefetch failed for $poiId: ${e.message}")
            }
        }
    }

    /**
     * Gradino "MP3 scaricabile" della catena al trigger: tentativo SINCRONO
     * (dal thread IO del chiamante) di scaricare ora l'MP3. Grazie al prefetch
     * dell'approach il server è quasi sempre già caldo e risponde col redirect
     * alla cache. Ritorna il file locale o null; mai eccezioni.
     */
    fun downloadNow(
        context: Context,
        poiId: String,
        lang: String,
        guideCharacter: String?,
        text: String
    ): File? {
        return try {
            cachedFile(context, poiId, lang)
                ?: downloadBlocking(context.applicationContext, poiId, lang, guideCharacter, text, quick = true)
        } catch (e: Exception) {
            Log.w(TAG, "downloadNow failed for $poiId: ${e.message}")
            null
        }
    }

    /**
     * Testo integrale dell'audioguida: prima il pacchetto offline locale
     * (gratis e immediato), poi shared_pois via Supabase (stessa catena
     * audio_script → description_long → description_ai → description del
     * Day Pass in GeofenceBroadcastReceiver).
     */
    private suspend fun resolveAudioText(context: Context, poiId: String, lang: String, character: String): String? {
        return try {
            val local = com.itaintasca.app.db.PoiDatabase.getInstance(context)
                .offlineDao().getPoiById(poiId)?.audioText
            if (!local.isNullOrBlank()) local
            // Testo NELLA LINGUA dell'utente (get-or-create per-lingua): così
            // l'MP3 prefetchato è già tradotto, non italiano.
            else SupabaseClient().fetchAudioguideText(poiId, lang, character)?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    /** Download vero: scrive su .tmp e rinomina solo a download completo. */
    private fun downloadBlocking(
        context: Context,
        poiId: String,
        lang: String,
        guideCharacter: String?,
        text: String,
        quick: Boolean = false
    ): File? {
        val key = "${poiId}_$lang"
        if (!inFlight.add(key)) return null // già in corso da un altro percorso
        try {
            val body = JSONObject().apply {
                put("text", text)
                put("voice", azureVoiceFor(lang, guideCharacter))
            }.toString().toRequestBody("application/json".toMediaType())

            val request = Request.Builder().url(TTS_ENDPOINT).post(body).build()
            (if (quick) quickClient else client).newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "TTS endpoint HTTP ${response.code} for $poiId")
                    return null
                }
                val bytes = response.body?.bytes() ?: return null
                if (bytes.size < MIN_VALID_BYTES) return null

                val dest = fileFor(context, poiId, lang)
                val tmp = File(dest.parentFile, dest.name + ".tmp")
                tmp.writeBytes(bytes)
                if (!tmp.renameTo(dest)) {
                    // rename fallito (raro): fallback copia diretta
                    dest.delete()
                    if (!tmp.renameTo(dest)) {
                        dest.writeBytes(bytes)
                        tmp.delete()
                    }
                }
                Log.d(TAG, "Prefetched MP3 for $poiId (${bytes.size} bytes)")
                return dest
            }
        } catch (e: Exception) {
            Log.w(TAG, "download failed for $poiId: ${e.message}")
            return null
        } finally {
            inFlight.remove(key)
        }
    }

    /**
     * Stessa mappa voce di src/services/ttsService.ts::azureVoiceName —
     * DEVE restare allineata, altrimenti la chiave cache del server
     * (voce+md5 testo) non coincide con quella del player web e il prefetch
     * sintetizza una seconda volta. guideDefault "nicky" = voce femminile.
     */
    fun azureVoiceFor(lang: String, guideCharacter: String?): String {
        val female = (guideCharacter ?: "nicky") == "nicky"
        return when ((lang.ifBlank { "it" }).lowercase()) {
            "en" -> if (female) "en-US-JennyNeural" else "en-US-GuyNeural"
            "fr" -> if (female) "fr-FR-DeniseNeural" else "fr-FR-HenriNeural"
            "es" -> if (female) "es-ES-ElviraNeural" else "es-ES-AlvaroNeural"
            "de" -> if (female) "de-DE-KatjaNeural" else "de-DE-ConradNeural"
            "ru" -> if (female) "ru-RU-SvetlanaNeural" else "ru-RU-DmitryNeural"
            "zh" -> if (female) "zh-CN-XiaoxiaoNeural" else "zh-CN-YunxiNeural"
            else -> if (female) "it-IT-ElsaNeural" else "it-IT-DiegoNeural"
        }
    }
}
