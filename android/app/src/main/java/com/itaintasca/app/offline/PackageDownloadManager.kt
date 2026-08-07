package com.itaintasca.app.offline

import android.content.Context
import android.content.Intent
import android.util.Log
import com.itaintasca.app.db.OfflinePackageEntity
import com.itaintasca.app.db.OfflinePackagePoiRef
import com.itaintasca.app.db.OfflinePoiEntity
import com.itaintasca.app.db.OfflineRtree
import com.itaintasca.app.db.PoiDatabase
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Download e delta-sync dei pacchetti area offline (solo testi, ~1-3 MB gzip).
 *
 * Il manifest arriva paginato da POST /api/area/bundle (paginazione keyset:
 * ogni pagina porta il cursore della successiva). Ogni pagina viene scritta in
 * Room appena ricevuta con upsert idempotenti: un download interrotto si
 * rilancia da capo senza duplicati. Il delta sync passa `since` = lastSyncAt
 * del pacchetto e riceve solo i POI cambiati + le tombstone dei cancellati.
 */
class PackageDownloadManager(private val context: Context) {

    companion object {
        private const val TAG = "PackageDownloadMgr"
        private const val BUNDLE_URL = "https://itainta.vercel.app/api/area/bundle"
        private const val PAGE_SIZE = 500
        const val EVENT_PROGRESS = "offlinePackageProgress"
    }

    private val db = PoiDatabase.getInstance(context)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun downloadPackage(
        id: String,
        name: String,
        lat: Double,
        lon: Double,
        radiusKm: Double,
        language: String
    ): OfflinePackageEntity {
        db.offlineDao().upsertPackage(
            OfflinePackageEntity(
                id = id, name = name, centerLat = lat, centerLon = lon,
                radiusKm = radiusKm, language = language,
                downloadedAt = System.currentTimeMillis(), status = "downloading"
            )
        )
        return runPages(id, name, lat, lon, radiusKm, language, since = null)
    }

    /** Delta sync: solo POI modificati dopo lastSyncAt + tombstone. */
    suspend fun syncPackage(id: String): OfflinePackageEntity? {
        val pkg = db.offlineDao().getPackage(id) ?: return null
        return runPages(
            pkg.id, pkg.name, pkg.centerLat, pkg.centerLon,
            pkg.radiusKm, pkg.language, since = pkg.lastSyncAt
        )
    }

    suspend fun deletePackage(id: String) {
        db.offlineDao().deleteRefsForPackage(id)
        db.offlineDao().deletePackageRow(id)
        db.offlineDao().deleteOrphanPois()
        vacuumRtree()
    }

    suspend fun listPackages(): List<OfflinePackageEntity> = db.offlineDao().getAllPackages()

    private suspend fun runPages(
        id: String,
        name: String,
        lat: Double,
        lon: Double,
        radiusKm: Double,
        language: String,
        since: String?
    ): OfflinePackageEntity {
        var cursorUpdated: String? = null
        var cursorId: String? = null
        var generatedAt: String? = null
        var total = 0
        var received = 0
        var bytes = 0L

        try {
            do {
                val payload = JSONObject().apply {
                    put("lat", lat)
                    put("lon", lon)
                    put("radiusKm", radiusKm)
                    put("lang", language)
                    put("pageSize", PAGE_SIZE)
                    if (since != null) put("since", since)
                    if (cursorUpdated != null) {
                        put("cursorUpdated", cursorUpdated)
                        put("cursorId", cursorId)
                    }
                }.toString()

                val request = Request.Builder()
                    .url(BUNDLE_URL)
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .addHeader("User-Agent", "Itainta-Android-Native")
                    .build()

                val bodyStr = client.newCall(request).execute().use { resp ->
                    if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
                    resp.body?.string() ?: throw IOException("Empty bundle body")
                }
                bytes += bodyStr.length

                val json = JSONObject(bodyStr)
                val meta = json.getJSONObject("meta")
                if (generatedAt == null) generatedAt = meta.optString("generatedAt", null)
                total = meta.optInt("totalCount", total)

                // Tombstone: POI cancellati sul server → via anche dal locale
                val tombs = json.optJSONArray("tombstones")
                if (tombs != null && tombs.length() > 0) {
                    val deadIds = (0 until tombs.length()).map { tombs.getString(it) }
                    db.offlineDao().deleteRefsByPoiIds(deadIds)
                    db.offlineDao().deletePoisByIds(deadIds)
                }

                val poisArr = json.getJSONArray("pois")
                val pois = ArrayList<OfflinePoiEntity>(poisArr.length())
                for (i in 0 until poisArr.length()) {
                    val p = poisArr.getJSONObject(i)
                    val poiId = p.optString("id", "")
                    if (poiId.isEmpty()) continue
                    pois.add(
                        OfflinePoiEntity(
                            id = poiId,
                            nome = p.optString("nome", "Punto di interesse"),
                            lat = p.optDouble("lat", 0.0),
                            lon = p.optDouble("lon", 0.0),
                            category = p.strOrNull("category"),
                            poiType = p.strOrNull("poi_type"),
                            isGem = p.optBoolean("is_gem", false),
                            alertRadius = p.optInt("alert_radius", 150),
                            arrivalRadius = p.optInt("geofence_radius", 50),
                            teaserText = p.strOrNull("teaser_text"),
                            descriptionShort = p.strOrNull("description_short"),
                            audioText = p.strOrNull("audio_text"),
                            updatedAt = p.strOrNull("updated_at")
                        )
                    )
                }
                if (pois.isNotEmpty()) {
                    db.offlineDao().upsertPois(pois)
                    db.offlineDao().upsertRefs(pois.map { OfflinePackagePoiRef(id, it.id) })
                }
                received += pois.size
                notifyProgress(id, received, total, "downloading")

                val next = json.optJSONObject("nextCursor")
                cursorUpdated = next?.strOrNull("cursorUpdated")
                cursorId = next?.strOrNull("cursorId")
            } while (!cursorUpdated.isNullOrEmpty())

            vacuumRtree()

            val existing = db.offlineDao().getPackage(id)
            val pkg = OfflinePackageEntity(
                id = id,
                name = name,
                centerLat = lat,
                centerLon = lon,
                radiusKm = radiusKm,
                language = language,
                poiCount = db.offlineDao().countPoisForPackage(id),
                sizeBytes = (existing?.sizeBytes ?: 0L).let { if (since == null) bytes else it + bytes },
                downloadedAt = existing?.downloadedAt ?: System.currentTimeMillis(),
                // generatedAt della prima pagina: ciò che è cambiato DURANTE il
                // download verrà ripreso dal prossimo delta, mai perso.
                lastSyncAt = generatedAt ?: since,
                status = "ready"
            )
            db.offlineDao().upsertPackage(pkg)
            notifyProgress(id, received, total, "ready")
            Log.d(TAG, "Package $id ready: ${pkg.poiCount} POIs, ${pkg.sizeBytes} bytes (delta=${since != null})")
            return pkg
        } catch (e: Exception) {
            Log.e(TAG, "Package $id failed: ${e.message}")
            db.offlineDao().getPackage(id)?.let {
                db.offlineDao().upsertPackage(it.copy(status = "error"))
            }
            notifyProgress(id, received, total, "error")
            throw e
        }
    }

    /** Ripulisce le entry R-tree orfane lasciate dagli upsert REPLACE (vedi OfflineRtree). */
    private fun vacuumRtree() {
        try {
            db.openHelper.writableDatabase.execSQL(OfflineRtree.vacuumSql)
        } catch (e: Exception) {
            Log.w(TAG, "Rtree vacuum failed: ${e.message}")
        }
    }

    private fun notifyProgress(packageId: String, done: Int, total: Int, phase: String) {
        val data = JSONObject().apply {
            put("packageId", packageId)
            put("done", done)
            put("total", total)
            put("phase", phase)
        }
        val intent = Intent("com.itaintasca.POI_EVENT").apply {
            setPackage(context.packageName)
            putExtra("event", EVENT_PROGRESS)
            putExtra("data1", data.toString())
        }
        context.sendBroadcast(intent)
    }
}

/** optString di org.json ritorna "" per i null: qui vogliamo un vero null. */
private fun JSONObject.strOrNull(key: String): String? =
    if (isNull(key)) null else optString(key, "").ifEmpty { null }
