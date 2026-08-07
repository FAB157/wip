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
        "musei" to listOf("museum", "gallery", "musei"),
        "chiese" to listOf("church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"),
        "panorami" to listOf("viewpoint", "park", "panorami"),
        "locali" to listOf("restaurant", "cafe", "bar", "fast_food", "pub", "locali"),
        "utilita" to listOf("pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"),
        "famiglie" to listOf("playground", "theme_park", "aquarium", "zoo", "famiglie"),
        "consigli" to listOf("information", "tourism_information", "office", "consigli")
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

    private fun parsePoiList(body: String, uiCategories: List<String>, lang: String = "it"): List<PoiEntity> {
        val type = object : TypeToken<List<Map<String, Any>>>() {}.type
        val rawList: List<Map<String, Any>> = gson.fromJson(body, type)
        
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
                teaserText = teaser
            )
        }

        return if (uiCategories.isEmpty()) {
            val culturalCats = listOf("monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti", "museum", "gallery", "musei", "church", "place_of_worship", "cathedral", "chiese", "viewpoint", "park", "panorami")
            pois.filter { it.isGem || culturalCats.contains(it.poiType) }
        } else {
            pois.filter { poi -> 
                val poiCat = (poi.poiType ?: "").lowercase()
                poi.isGem || targetDbCategories.contains(poiCat) || uiCategories.contains(poiCat)
            }
        }
    }
}
