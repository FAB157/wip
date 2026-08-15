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
        private const val BUNDLE_URL = "https://wip.guide/api/area/bundle"
        private const val PAGE_SIZE = 500
        const val EVENT_PROGRESS = "offlinePackageProgress"

        /**
         * Limite di storage totale per i pacchetti offline, in MB. Regolabile:
         * i pacchetti sono solo testo (1-3 MB ciascuno), quindi 2GB coprono
         * centinaia di aree prima che scatti l'eviction LRU.
         */
        const val MAX_OFFLINE_STORAGE_MB = 2048L
        private const val MAX_OFFLINE_STORAGE_BYTES = MAX_OFFLINE_STORAGE_MB * 1024 * 1024

        /** Margine minimo di spazio libero sul device sotto cui non si scarica nulla. */
        private const val MIN_FREE_DEVICE_BYTES = 50L * 1024 * 1024
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
        ensureStorageBudget(id)

        // Resume: un tentativo precedente interrotto (status "downloading" per
        // crash/kill, o "error" per rete caduta) ha già persistito il cursore
        // keyset raggiunto — si riparte da lì invece che da pagina 1 (v. runPages).
        val existing = db.offlineDao().getPackage(id)
        val isResume = existing != null &&
            (existing.status == "downloading" || existing.status == "error") &&
            !existing.pendingCursorUpdated.isNullOrEmpty()

        db.offlineDao().upsertPackage(
            (existing ?: OfflinePackageEntity(
                id = id, name = name, centerLat = lat, centerLon = lon,
                radiusKm = radiusKm, language = language,
                downloadedAt = System.currentTimeMillis()
            )).copy(status = "downloading", lastAccessedAt = System.currentTimeMillis())
        )

        return runPages(
            id, name, lat, lon, radiusKm, language, since = null,
            resumeCursorUpdated = if (isResume) existing?.pendingCursorUpdated else null,
            resumeCursorId = if (isResume) existing?.pendingCursorId else null,
            resumeSizeBytes = if (isResume) (existing?.sizeBytes ?: 0L) else 0L
        )
    }

    /**
     * Cap di storage (punto 1): se lo spazio già occupato dai pacchetti offline
     * esistenti (esclusa l'entry che stiamo per (ri)scaricare) è al limite,
     * libera spazio evictando i pacchetti meno usati di recente (LRU su
     * lastAccessedAt, fallback downloadedAt per righe migrate senza storico)
     * finché non si scende sotto [MAX_OFFLINE_STORAGE_BYTES] o non ne resta
     * nessuno. Se anche dopo aver evictato TUTTI i pacchetti lo spazio libero
     * reale sul device è sotto la soglia di sicurezza, fallisce subito invece
     * di lasciare che il download riempia il disco.
     */
    private suspend fun ensureStorageBudget(newPackageId: String) {
        val dao = db.offlineDao()
        var others = dao.getAllPackages().filter { it.id != newPackageId }
        var occupied = others.sumOf { it.sizeBytes }

        while (occupied > MAX_OFFLINE_STORAGE_BYTES && others.isNotEmpty()) {
            val lru = others.minByOrNull { pkg ->
                if (pkg.lastAccessedAt > 0L) pkg.lastAccessedAt else pkg.downloadedAt
            } ?: break
            Log.w(
                TAG,
                "Storage cap ${MAX_OFFLINE_STORAGE_MB}MB superato: eviction LRU pacchetto " +
                    "${lru.id} (${lru.sizeBytes} bytes, ultimo uso ${lru.lastAccessedAt})"
            )
            deletePackage(lru.id)
            others = others.filter { it.id != lru.id }
            occupied = others.sumOf { it.sizeBytes }
        }

        val freeBytes = try {
            context.filesDir.usableSpace
        } catch (e: Exception) {
            Long.MAX_VALUE
        }
        if (freeBytes in 0L until MIN_FREE_DEVICE_BYTES) {
            throw IOException(
                "Spazio insufficiente sul dispositivo per il pacchetto offline " +
                    "(${freeBytes / (1024 * 1024)}MB liberi, anche dopo aver rimosso i pacchetti " +
                    "offline meno usati): libera spazio sul telefono e riprova."
            )
        }
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
        since: String?,
        resumeCursorUpdated: String? = null,
        resumeCursorId: String? = null,
        resumeSizeBytes: Long = 0L
    ): OfflinePackageEntity {
        // Resume (punto 2): riparte dal cursore keyset persistito da un run
        // precedente interrotto, invece che da pagina 1. bytes riparte dal
        // totale già accumulato in quel run: rappresenta già la size cumulativa,
        // non solo quella di QUESTO giro di pagine.
        var cursorUpdated: String? = resumeCursorUpdated
        var cursorId: String? = resumeCursorId
        val isResuming = !resumeCursorUpdated.isNullOrEmpty()
        var generatedAt: String? = null
        var total = 0
        var received = 0
        var bytes = resumeSizeBytes

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

                    // DIFESA IN PROFONDITÀ (il DB agent li scarta già lato server):
                    // niente bozze/allucinazioni/nascosti nei pacchetti offline.
                    // Stessa lista status di SupabaseClient.parsePoiList.
                    val status = p.optString("status", "").lowercase()
                    if (status == "draft" || status == "needs_revision" ||
                        status == "rejected" || status == "hidden" ||
                        p.optBoolean("is_hidden", false)
                    ) continue

                    // Placeholder generici (nessun nome reale): non devono finire
                    // nel radar offline né essere annunciati.
                    val nome = p.optString("nome", "")
                    if (nome.isBlank() || nome.equals("Punto di interesse", ignoreCase = true)) continue

                    pois.add(
                        OfflinePoiEntity(
                            id = poiId,
                            nome = nome,
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

                // Checkpoint (punto 2): persiste il cursore raggiunto ad ogni pagina,
                // così un crash/kill a metà download riprende da qui invece che da
                // pagina 1. Per il download pieno (since == null) salva anche i byte
                // cumulativi, che alimentano il cap di storage (punto 1) anche a
                // download interrotto; per il delta sync lascia sizeBytes intatto,
                // lo aggiorna solo il calcolo finale sotto.
                if (since == null) {
                    db.offlineDao().updateDownloadCheckpoint(id, cursorUpdated, cursorId, bytes)
                } else {
                    db.offlineDao().updateDownloadCursor(id, cursorUpdated, cursorId)
                }
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
                // since != null: delta sync, si somma al totale esistente.
                // since == null: download pieno o resume, `bytes` è già il
                // cumulativo (seedato da resumeSizeBytes in caso di resume).
                sizeBytes = if (since != null) (existing?.sizeBytes ?: 0L) + bytes else bytes,
                downloadedAt = existing?.downloadedAt ?: System.currentTimeMillis(),
                lastAccessedAt = System.currentTimeMillis(),
                // generatedAt della prima pagina: ciò che è cambiato DURANTE il
                // download verrà ripreso dal prossimo delta, mai perso.
                lastSyncAt = generatedAt ?: since,
                status = "ready",
                // Download completato: nessun checkpoint pendente da riprendere.
                pendingCursorUpdated = null,
                pendingCursorId = null
            )
            db.offlineDao().upsertPackage(pkg)
            notifyProgress(id, received, total, "ready")
            Log.d(
                TAG,
                "Package $id ready: ${pkg.poiCount} POIs, ${pkg.sizeBytes} bytes " +
                    "(delta=${since != null}, resumed=$isResuming)"
            )
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
