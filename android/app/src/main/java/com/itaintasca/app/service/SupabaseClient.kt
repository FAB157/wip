package com.itaintasca.app.service

import android.util.Log
import com.itaintasca.app.BuildConfig
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.geofence.CategoryMap
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * CLIENT HTTP UNICO DELL'APP (23/08/2026).
 *
 * Prima ogni punto che parlava con la rete costruiva il PROPRIO OkHttpClient:
 * `SupabaseClient` a ogni istanza (e se ne creava una nuova a ogni sync dello
 * storico ascolti), il probe di rete a ogni refresh del radar, i due job
 * teaser a ogni chiamata. Ogni client porta con se' un connection pool, un
 * dispatcher con il suo thread pool e una cache TLS separati: due client non
 * si riusano MAI la connessione, quindi il probe verso wip.guide faceva un
 * handshake TLS completo un istante prima che un altro client ne aprisse un
 * secondo verso lo stesso host. Con un client solo la connessione resta calda
 * e il secondo giro costa un round-trip invece di quattro.
 *
 * Timeout diversi: `WipHttp.client.newBuilder()` — condivide pool e
 * dispatcher, cambia solo i tempi.
 */
object WipHttp {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}

/**
 * `appContext` (SEC-03, facoltativo): se presente, un 401 su una chiamata
 * AUTENTICATA col token utente emette l'evento `tokenExpired` al plugin
 * (WipApi.notifyTokenExpired). Senza context il comportamento e' quello di
 * sempre (si logga e si torna null/false).
 */
class SupabaseClient(private val appContext: android.content.Context? = null) {
    // Stessi timeout di prima (15 s/15 s), ma pool e dispatcher condivisi.
    private val client = WipHttp.client

    private val gson = Gson()
    private val TAG = "SupabaseClient"

    /** (SEC-03) 401 con token utente presente → evento tokenExpired (throttlato). */
    private fun checkUnauthorized(code: Int, accessToken: String?) {
        if (code != 401 || accessToken.isNullOrBlank()) return
        val ctx = appContext ?: return
        WipApi.notifyTokenExpired(ctx)
    }

    suspend fun fetchPoisNearby(
        lat: Double,
        lon: Double,
        radiusKm: Double,
        uiCategories: List<String> = emptyList(),
        lang: String = "it"
    ): List<PoiEntity> = withContext(Dispatchers.IO) {
        val url = "${BuildConfig.SUPABASE_URL}/rest/v1/rpc/nearby_pois"
        
        val jsonPayload = JSONObject().apply {
            put("p_lat", lat)
            put("p_lon", lon)
            put("radius_m", (radiusKm * 1000).toInt())
            // 120 (era 60): i geofence attivi restano max 30 (GeofenceManager
            // .take(30)), ma il radar conosce più POI per teaser e notifiche.
            put("limit_num", 120)
        }.toString()

        val request = Request.Builder()
            .url(url)
            .post(jsonPayload.toRequestBody("application/json".toMediaType()))
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "Itainta-Android-Native")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val code = response.code
                    val errorBody = response.body?.string() ?: "no body"
                    Log.e(TAG, "Server error: $code - $errorBody")
                    throw IOException("HTTP $code")
                }
                
                val body = response.body?.string() ?: "[]"
                val pois = parsePoiList(body, uiCategories, lang)
                // I perimetri arrivano da una richiesta a parte: nearby_pois è
                // una funzione SQL con le colonne fissate, e una colonna nuova
                // non ci passerebbe comunque senza riscriverla.
                val perimetri = fetchFootprints(pois.map { it.id })
                return@withContext if (perimetri.isEmpty()) pois
                    else pois.map { p -> perimetri[p.id]?.let { p.copy(footprint = it) } ?: p }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}")
            throw e
        }
    }

    /**
     * I perimetri degli edifici (poi_footprints) per i POI indicati.
     *
     * Converte il GeoJSON del database nel formato compatto
     * "lon,lat lon,lat;..." che il servizio tiene in Room: sul telefono ci
     * stanno migliaia di POI e le parentesi del GeoJSON sarebbero il 40% del
     * peso senza dire niente di più.
     *
     * FAIL-OPEN: qualunque problema (rete, tabella assente, JSON strano)
     * restituisce una mappa vuota e il geofencing continua a lavorare a raggi
     * esattamente come prima. Un perimetro che manca degrada la precisione;
     * un'eccezione qui fermerebbe l'intero aggiornamento del radar.
     */
    private suspend fun fetchFootprints(poiIds: List<String>): Map<String, String> = withContext(Dispatchers.IO) {
        if (poiIds.isEmpty()) return@withContext emptyMap()
        val fuori = HashMap<String, String>()
        // A lotti: l'URL di PostgREST ha un limite di lunghezza e 120 id
        // lunghi lo supererebbero.
        for (lotto in poiIds.chunked(60)) {
            try {
                val lista = lotto.joinToString(",") { "\"$it\"" }
                val url = "${BuildConfig.SUPABASE_URL}/rest/v1/poi_footprints" +
                    "?poi_id=in.($lista)&select=poi_id,geojson"
                val req = Request.Builder()
                    .url(url)
                    .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
                    .addHeader("User-Agent", "Itainta-Android-Native")
                    .build()
                client.newCall(req).execute().use { r ->
                    if (!r.isSuccessful) return@use
                    val arr = JSONArray(r.body?.string() ?: "[]")
                    for (i in 0 until arr.length()) {
                        val o = arr.optJSONObject(i) ?: continue
                        val id = o.optString("poi_id", "")
                        val compatto = geojsonCompatto(o.optString("geojson", ""))
                        if (id.isNotBlank() && compatto != null) fuori[id] = compatto
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Footprints non disponibili: ${e.message}")
            }
        }
        return@withContext fuori
    }

    /**
     * Da GeoJSON Polygon/MultiPolygon a "lon,lat lon,lat;lon,lat ...". La
     * conversione vive in Footprints perche' la usa anche il download dei
     * pacchetti offline (PackageDownloadManager).
     */
    private fun geojsonCompatto(geojson: String): String? =
        com.itaintasca.app.geofence.Footprints.geojsonCompatto(geojson)

    suspend fun fetchPoiById(poiId: String, lang: String = "it"): PoiEntity? = withContext(Dispatchers.IO) {
        val url = "${BuildConfig.SUPABASE_URL}/rest/v1/shared_pois?id=eq.$poiId&select=*"
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: "[]"
                val list = parsePoiList(body, emptyList(), lang)
                return@withContext if (list.isNotEmpty()) list[0] else null
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Testo integrale dell'audioguida di un POI (per il Day Pass online quando
     * il POI non è in un pacchetto offline). Stessa catena di fallback della
     * RPC area_bundle_pois.
     */
    /**
     * Testo integrale dell'audioguida NELLA LINGUA dell'utente (get-or-create).
     * Chiama /api/poi/audioguide (cache-first su poi_audioguides per lingua; se
     * manca traduce/rigenera dai campi italiani di shared_pois e salva). Prima
     * il nativo leggeva i campi italiani grezzi: un utente straniero, in auto
     * col Day Pass, sentiva testo italiano con voce nella sua lingua.
     *
     * ROLLOUT ANTI-ABUSO FASE 1 (2026-08-14): questa rotta oggi è aperta
     * (nessuna auth) perché il chiamante — questo prefetch in background — non
     * inviava mai un token utente. Da qui in poi lo invia SE disponibile
     * (accessToken letto da SecurePrefs dai chiamanti), ma la richiesta resta
     * valida anche senza: il server per ora ACCETTA il token senza richiederlo
     * (nessun 401), per non rompere l'audioguida automatica sulle installazioni
     * non ancora aggiornate. La fase 2 (server che rifiuta senza token) va
     * fatta solo quando questa build sarà diffusa alla maggioranza degli utenti.
     */
    /**
     * Esito di /api/poi/audioguide (28/08/2026, server con paywall):
     *  - [Testo]: testo integrale (200);
     *  - [Anteprima]: 402 `{error:'credits_required', preview}` — l'utente
     *    non ha diritto al testo integrale, `preview` sono le prime 2 frasi
     *    (puo' essere vuota). NON e' una guida: chi la riceve non consuma
     *    pass, non registra ascolti e avvisa il JS;
     *  - [Fallito]: 401 senza ripiego, altri errori, rete assente.
     */
    sealed class AudioguideResult {
        data class Testo(val text: String) : AudioguideResult()
        data class Anteprima(val preview: String) : AudioguideResult()
        object Fallito : AudioguideResult()
    }

    suspend fun fetchAudioguide(
        poiId: String,
        lang: String,
        character: String,
        accessToken: String? = null,
        ritenta: Boolean = true
    ): AudioguideResult = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("poiId", poiId)
                put("lang", lang)
                put("character", character)
            }.toString().toRequestBody("application/json".toMediaType())
            val requestBuilder = Request.Builder()
                // (SEC-09) Dominio unico in WipApi.BASE.
                .url(WipApi.BASE + "/api/poi/audioguide")
                .post(body)
                .addHeader("Content-Type", "application/json")
            // Solo se presente: senza token il server risponde 401 (vedi sotto).
            if (!accessToken.isNullOrBlank()) {
                requestBuilder.addHeader("Authorization", "Bearer $accessToken")
            }
            val request = requestBuilder.build()
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> {
                        val text = try { JSONObject(raw.ifBlank { "{}" }).optString("text", "") } catch (_: Exception) { "" }
                        if (text.isNotBlank()) AudioguideResult.Testo(text) else AudioguideResult.Fallito
                    }
                    response.code == 402 -> {
                        // Paywall: anteprima distinta dal testo integrale.
                        val preview = try { JSONObject(raw.ifBlank { "{}" }).optString("preview", "") } catch (_: Exception) { "" }
                        Log.d(TAG, "Audioguida $poiId: crediti richiesti (402), anteprima ${preview.length} caratteri")
                        AudioguideResult.Anteprima(preview.trim())
                    }
                    response.code == 401 -> {
                        checkUnauthorized(response.code, accessToken)
                        // (28/08/2026) Un 401 e' quasi sempre un token SCADUTO: il JS
                        // lo rinnova all'evento tokenExpired e lo rispinge in
                        // SecurePrefs. Si aspettano 2,5 s, si rilegge il token e si
                        // ritenta UNA volta: cosi' anche l'utente straniero sente la
                        // guida nella sua lingua invece di cadere nel ripiego.
                        val ctx = appContext
                        if (ritenta && ctx != null) {
                            kotlinx.coroutines.delay(2500)
                            val nuovo = try {
                                SecurePrefs.get(ctx).getString(ListeningHistoryStore.PREF_ACCESS_TOKEN, "").orEmpty()
                            } catch (_: Exception) { "" }
                            if (nuovo.isNotBlank() && nuovo != accessToken) {
                                Log.d(TAG, "Audioguida $poiId: 401, ritento con il token rinnovato")
                                return@withContext fetchAudioguide(poiId, lang, character, nuovo, ritenta = false)
                            }
                        }
                        // Ripiego sui campi grezzi di shared_pois (fetchPoiAudioText),
                        // che sono in ITALIANO: si usa solo per lang=it, altrimenti
                        // un utente straniero sentirebbe testo italiano con la voce
                        // della sua lingua (regola del 23/08: mai la lingua sbagliata).
                        if (lang.lowercase().startsWith("it")) {
                            fetchPoiAudioText(poiId)?.takeIf { it.isNotBlank() }
                                ?.let { AudioguideResult.Testo(it) } ?: AudioguideResult.Fallito
                        } else {
                            AudioguideResult.Fallito
                        }
                    }
                    else -> {
                        Log.w(TAG, "Audioguida $poiId: HTTP ${response.code}")
                        AudioguideResult.Fallito
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "fetchAudioguide $poiId fallita: ${e.message}")
            AudioguideResult.Fallito
        }
    }

    /**
     * Wrapper compatibile per i chiamanti che vogliono SOLO il testo
     * integrale (prefetch MP3): un'anteprima da 402 qui vale null, perche'
     * sintetizzare due frasi come se fossero la guida sarebbe un inganno.
     */
    suspend fun fetchAudioguideText(
        poiId: String,
        lang: String,
        character: String,
        accessToken: String? = null
    ): String? = (fetchAudioguide(poiId, lang, character, accessToken) as? AudioguideResult.Testo)?.text

    /**
     * Fallback mono-lingua dai campi grezzi di shared_pois (tipicamente
     * italiano). Rete di sicurezza quando l'endpoint per-lingua non risponde.
     */
    suspend fun fetchPoiAudioText(poiId: String): String? = withContext(Dispatchers.IO) {
        val url = "${BuildConfig.SUPABASE_URL}/rest/v1/shared_pois?id=eq.$poiId" +
            "&select=audio_script,description_long,description_ai,description"
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            .build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val arr = JSONArray(response.body?.string() ?: "[]")
                if (arr.length() == 0) return@withContext null
                val row = arr.getJSONObject(0)
                for (key in listOf("audio_script", "description_long", "description_ai", "description")) {
                    if (!row.isNull(key)) {
                        val v = row.optString(key, "")
                        if (v.isNotBlank()) return@withContext v
                    }
                }
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    // ------------------------------------------------------------------
    // STORICO ASCOLTI (user_listening_history) — un POI già ascoltato è già
    // acquistato: il nativo lo riproduce gratis, allineato al web
    // (dayPassService.authorizeGuidePlayback / lib/listeningHistory.ts).
    // ------------------------------------------------------------------

    /** Con token utente le RLS passano; senza, fallback anon (best-effort). */
    private fun bearerFor(accessToken: String?): String =
        "Bearer ${if (accessToken.isNullOrBlank()) BuildConfig.SUPABASE_ANON_KEY else accessToken}"

    /** Tutti i poi_id già ascoltati dall'utente. null = richiesta fallita. */
    suspend fun fetchListeningHistoryPoiIds(
        userId: String,
        accessToken: String?
    ): List<String>? = withContext(Dispatchers.IO) {
        try {
            val url = "${BuildConfig.SUPABASE_URL}/rest/v1/user_listening_history" +
                "?user_id=eq.$userId&select=poi_id"
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", bearerFor(accessToken))
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    checkUnauthorized(response.code, accessToken)
                    return@withContext null
                }
                val arr = JSONArray(response.body?.string() ?: "[]")
                val ids = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val id = arr.optJSONObject(i)?.optString("poi_id")
                    if (!id.isNullOrBlank()) ids.add(id)
                }
                ids
            }
        } catch (e: Exception) {
            Log.w(TAG, "fetchListeningHistoryPoiIds failed: ${e.message}")
            null
        }
    }

    /**
     * Insert/update best-effort della riga di storico, stessa logica del web
     * (lib/listeningHistory.ts): se esiste aggiorna listened_at, altrimenti
     * insert. Ritorna true solo se il server ha accettato.
     */
    suspend fun recordListeningHistory(
        userId: String,
        accessToken: String?,
        poiId: String,
        poiName: String,
        category: String,
        imageUrl: String?
    ): Boolean = withContext(Dispatchers.IO) {
        if (userId.isBlank() || poiId.isBlank()) return@withContext false
        try {
            val base = "${BuildConfig.SUPABASE_URL}/rest/v1/user_listening_history"
            // Niente java.time: minSdk 24 senza desugaring
            val nowIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .format(java.util.Date())

            // 1) Esiste già una riga per (user, poi)?
            val checkReq = Request.Builder()
                .url("$base?user_id=eq.$userId&poi_id=eq.$poiId&select=id")
                .get()
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", bearerFor(accessToken))
                .build()
            val existingId: String? = client.newCall(checkReq).execute().use { resp ->
                if (!resp.isSuccessful) {
                    checkUnauthorized(resp.code, accessToken)
                    return@withContext false
                }
                val arr = JSONArray(resp.body?.string() ?: "[]")
                if (arr.length() > 0) arr.getJSONObject(0).opt("id")?.toString() else null
            }

            val builder: Request.Builder
            if (existingId != null) {
                val patch = JSONObject().apply {
                    put("listened_at", nowIso)
                    put("poi_name", poiName)
                }.toString().toRequestBody("application/json".toMediaType())
                builder = Request.Builder()
                    .url("$base?id=eq.$existingId")
                    .patch(patch)
            } else {
                val insert = JSONObject().apply {
                    put("user_id", userId)
                    put("poi_id", poiId)
                    put("poi_name", poiName)
                    put("category", category)
                    if (!imageUrl.isNullOrBlank()) put("image_url", imageUrl)
                    put("listened_at", nowIso)
                }.toString().toRequestBody("application/json".toMediaType())
                builder = Request.Builder()
                    .url(base)
                    .post(insert)
            }
            val req = builder
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", bearerFor(accessToken))
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=minimal")
                .build()

            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) checkUnauthorized(resp.code, accessToken)
                resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(TAG, "recordListeningHistory failed: ${e.message}")
            false
        }
    }

    private fun parsePoiList(body: String, uiCategories: List<String>, lang: String = "it"): List<PoiEntity> {
        val type = object : TypeToken<List<Map<String, Any>>>() {}.type
        val fullList: List<Map<String, Any>> = gson.fromJson(body, type)

        // La RPC nearby_pois non filtra per status: i POI 'draft'/nascosti
        // (bozze Vision, allucinazioni AI in bonifica) non devono arrivare al
        // radar. Allineato a WipSupabaseClient.swift e poiRepository.ts.
        val hiddenStatuses = setOf("draft", "needs_revision", "rejected", "hidden")
        val rawList = fullList.filter { map ->
            val status = (map["status"] ?: "").toString().lowercase()
            status !in hiddenStatuses && map["is_hidden"] != true
        }

        val pois = rawList.map { map ->
            val catFromDb = (map["categoria"] ?: map["category"] ?: "").toString().lowercase()
            
            val isGemDirect = map["is_gem"]
            val isGem = when {
                isGemDirect is Boolean -> isGemDirect
                isGemDirect is Number -> isGemDirect.toInt() == 1
                isGemDirect is String -> isGemDirect.equals("true", ignoreCase = true)
                else -> catFromDb == "gemme" || map["premium"] == true
            }

            // Prima il teaser nella lingua dell'utente, poi i fallback:
            // prima sceglieva solo it/en anche per utenti FR/ES/DE.
            val teaser = map["teaser_text_$lang"]?.toString()
                ?: map["teaser_text_it"]?.toString()
                ?: map["teaser_text_en"]?.toString()
                ?: map["teaser_text"]?.toString()

            PoiEntity(
                id = map["id"]?.toString() ?: "",
                nome = map["nome"]?.toString() ?: map["name"]?.toString() ?: "Punto di interesse",
                lat = (map["lat"] as? Number)?.toDouble() ?: 0.0,
                lon = (map["lon"] as? Number)?.toDouble() ?: 0.0,
                entranceLat = (map["entrance_lat"] as? Number)?.toDouble(),
                entranceLon = (map["entrance_lon"] as? Number)?.toDouble(),
                poiType = catFromDb,
                guideDefault = map["guide_default"]?.toString() ?: "nicky",
                isGem = isGem,
                teaserText = teaser,
                // Raggi da footprint reale (perimetro OSM). Usati solo se il POI
                // ha un ingresso (entrance_lat/lon) — vedi GeofenceManager.
                alertRadius = (map["alert_radius"] as? Number)?.toInt(),
                geofenceRadius = (map["geofence_radius"] as? Number)?.toInt(),
                // INDIRIZZO (23/08/2026): alimenta la scala di fiducia di
                // RaggiFiducia. Le due RPC li restituiscono dalle migration
                // 20260823090000 e 20260823150000; con una RPC vecchia
                // restano null e il comportamento è quello di prima.
                address = map["address"]?.toString(),
                addressSource = map["address_source"]?.toString(),
                // IL PUNTO dell'indirizzo (migration 20260823160000). E' la
                // casa più vicina al POI nel dump Nominatim — vicinanza
                // misurata, non una geocodifica testuale — quindi è il PUNTO
                // D'ARRIVO: RaggiFiducia.puntoArrivo lo mette fra l'ingresso e
                // il centroide, e il trigger scatta a 30 m da lì.
                // Le RPC vecchie non li restituiscono: restano null e il
                // comportamento è quello di prima (centroide).
                addressPointLat = (map["address_point_lat"] as? Number)?.toDouble(),
                addressPointLon = (map["address_point_lon"] as? Number)?.toDouble(),
                addressPointSource = map["address_point_source"]?.toString()
            )
        }

        // (22/08/2026) Stessa funzione del filtro trigger (receiver) e di
        // quello offline (servizio): CategoryMap.isActive. Insieme vuoto =
        // default culturale { monumenti, musei, chiese }, panorami OFF.
        return pois.filter { CategoryMap.isActive(it.poiType, it.isGem, it.isFromItinerary, uiCategories) }
    }
}
