package com.itaintasca.app.service

import android.util.Log
import com.itaintasca.app.BuildConfig
import com.itaintasca.app.db.PoiEntity
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

    // Mappa tra categorie UI (del setup) e categorie DB reali
    // Tenere allineata a isCategoryAllowed (src/hooks/useGeofencing.ts) e a
    // CATEGORY_MAP in GeofenceBroadcastReceiver.kt
    private val categoryMap = mapOf(
        "monumenti" to listOf("monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti"),
        // castelli/archeo: chiavi dedicate del web (useGeofencing.ts) che
        // seguono `monumenti` di default; restano incluse in monumenti sopra,
        // ma esposte a parte per rispettare un eventuale toggle separato.
        "castelli" to listOf("castle", "castelli"),
        "archeo" to listOf("ruins", "archaeological_site", "archeo"),
        "musei" to listOf("museum", "gallery", "musei"),
        "chiese" to listOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"),
        "panorami" to listOf("viewpoint", "park", "panorami"),
        "locali" to listOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
        "utilita" to listOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"),
        "famiglie" to listOf("playground", "theme_park", "aquarium", "zoo", "famiglie"),
        "consigli" to listOf("information", "tourism_information", "office", "consigli"),
        // Gemme: chiave del toggle web (useGeofencing.ts). Nel prodotto sono
        // "sempre attive", ma esposta per parità di mappa.
        "gemme" to listOf("gemme"),
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        "community" to listOf("community")
    )

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
                return@withContext parsePoiList(body, uiCategories, lang)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}")
            throw e
        }
    }

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
     */
    suspend fun fetchAudioguideText(poiId: String, lang: String, character: String): String? = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("poiId", poiId)
                put("lang", lang)
                put("character", character)
            }.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("https://wip.guide/api/poi/audioguide")
                .post(body)
                .addHeader("Content-Type", "application/json")
                .build()
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

        val targetDbCategories = mutableSetOf<String>()
        uiCategories.forEach { uiCat ->
            categoryMap[uiCat]?.let { targetDbCategories.addAll(it) }
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

        return if (uiCategories.isEmpty()) {
            // Default "insieme vuoto" allineato al web (useGeofencing.ts):
            // { monumenti, musei, chiese } attivi; panorami OFF. Prima il nativo
            // includeva viewpoint/park/panorami di default, il web no.
            val culturalCats = listOf("monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti", "museum", "gallery", "musei", "church", "place_of_worship", "cathedral", "chiese")
            pois.filter { it.isGem || culturalCats.contains(it.poiType) }
        } else {
            pois.filter { poi -> 
                val poiCat = (poi.poiType ?: "").lowercase()
                poi.isGem || targetDbCategories.contains(poiCat) || uiCategories.contains(poiCat)
            }
        }
    }
}
