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

class SupabaseClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
        
    private val gson = Gson()
    private val TAG = "SupabaseClient"

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
    suspend fun fetchAudioguideText(
        poiId: String,
        lang: String,
        character: String,
        accessToken: String? = null
    ): String? = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("poiId", poiId)
                put("lang", lang)
                put("character", character)
            }.toString().toRequestBody("application/json".toMediaType())
            val requestBuilder = Request.Builder()
                .url("https://wip.guide/api/poi/audioguide")
                .post(body)
                .addHeader("Content-Type", "application/json")
            // Solo se presente: nessun header quando manca, la richiesta resta
            // identica a quella di oggi (vedi commento fase 1 sopra).
            if (!accessToken.isNullOrBlank()) {
                requestBuilder.addHeader("Authorization", "Bearer $accessToken")
            }
            val request = requestBuilder.build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val obj = JSONObject(response.body?.string() ?: "{}")
                val text = obj.optString("text", "")
                if (text.isNotBlank()) text else null
            }
        } catch (e: Exception) {
            null
        }
    }

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
                if (!response.isSuccessful) return@withContext null
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
                if (!resp.isSuccessful) return@withContext false
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

            client.newCall(req).execute().use { resp -> resp.isSuccessful }
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
                geofenceRadius = (map["geofence_radius"] as? Number)?.toInt()
            )
        }

        // (22/08/2026) Stessa funzione del filtro trigger (receiver) e di
        // quello offline (servizio): CategoryMap.isActive. Insieme vuoto =
        // default culturale { monumenti, musei, chiese }, panorami OFF.
        return pois.filter { CategoryMap.isActive(it.poiType, it.isGem, it.isFromItinerary, uiCategories) }
    }
}
