package com.itaintasca.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RawQuery
import androidx.sqlite.db.SimpleSQLiteQuery
import androidx.sqlite.db.SupportSQLiteQuery
import kotlin.math.cos

@Dao
interface OfflineDao {

    // --- Pacchetti ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPackage(pkg: OfflinePackageEntity)

    @Query("SELECT * FROM offline_packages ORDER BY downloadedAt DESC")
    suspend fun getAllPackages(): List<OfflinePackageEntity>

    @Query("SELECT * FROM offline_packages WHERE id = :id")
    suspend fun getPackage(id: String): OfflinePackageEntity?

    @Query("DELETE FROM offline_packages WHERE id = :id")
    suspend fun deletePackageRow(id: String)

    /**
     * Checkpoint di un download in corso: cursore keyset raggiunto (resume) e,
     * per il download pieno (non delta sync), i byte già ricevuti finora — così
     * un retry riparte da qui invece che da pagina 1 e lo storage cap vede una
     * stima realistica anche a download interrotto.
     */
    @Query(
        "UPDATE offline_packages SET pendingCursorUpdated = :cursorUpdated, " +
            "pendingCursorId = :cursorId, sizeBytes = :sizeBytes WHERE id = :id"
    )
    suspend fun updateDownloadCheckpoint(id: String, cursorUpdated: String?, cursorId: String?, sizeBytes: Long)

    /** Come [updateDownloadCheckpoint] ma senza toccare sizeBytes (delta sync). */
    @Query(
        "UPDATE offline_packages SET pendingCursorUpdated = :cursorUpdated, " +
            "pendingCursorId = :cursorId WHERE id = :id"
    )
    suspend fun updateDownloadCursor(id: String, cursorUpdated: String?, cursorId: String?)

    // --- POI ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPois(pois: List<OfflinePoiEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRefs(refs: List<OfflinePackagePoiRef>)

    @Query("DELETE FROM offline_package_pois WHERE packageId = :packageId")
    suspend fun deleteRefsForPackage(packageId: String)

    @Query("DELETE FROM offline_package_pois WHERE poiId IN (:ids)")
    suspend fun deleteRefsByPoiIds(ids: List<String>)

    @Query("DELETE FROM offline_pois WHERE id IN (:ids)")
    suspend fun deletePoisByIds(ids: List<String>)

    /** POI non più referenziati da alcun pacchetto (dopo una delete pacchetto). */
    @Query("DELETE FROM offline_pois WHERE id NOT IN (SELECT poiId FROM offline_package_pois)")
    suspend fun deleteOrphanPois()

    @Query("SELECT COUNT(*) FROM offline_package_pois WHERE packageId = :packageId")
    suspend fun countPoisForPackage(packageId: String): Int

    @Query("SELECT COUNT(*) FROM offline_pois")
    suspend fun countPois(): Int

    @Query("SELECT * FROM offline_pois WHERE id = :id")
    suspend fun getPoiById(id: String): OfflinePoiEntity?

    /**
     * Lingua del pacchetto che contiene questo POI: il testo audioguida offline
     * è nella lingua del pacchetto che l'ha scritto, quindi serve per non
     * riprodurre testo IT a un utente EN (un POI può stare in più pacchetti:
     * basta che ne esista uno nella lingua richiesta).
     */
    @Query(
        "SELECT p.language FROM offline_packages p " +
            "JOIN offline_package_pois r ON p.id = r.packageId " +
            "WHERE r.poiId = :poiId LIMIT 1"
    )
    suspend fun getPoiPackageLanguage(poiId: String): String?

    /**
     * Le query spaziali passano dall'R-tree (tabella virtuale offline_poi_rtree,
     * fuori dallo schema noto a Room): devono essere raw. Costruirle con
     * [OfflineRtree.bboxQuery], mai a mano.
     */
    @RawQuery
    suspend fun queryPoisRaw(query: SupportSQLiteQuery): List<OfflinePoiEntity>

    // --- Registro spese offline (per-listen) ---
    @Insert
    suspend fun insertSpend(entry: OfflineSpendEntity)

    @Query("SELECT COALESCE(SUM(credits), 0) FROM offline_spend_ledger")
    suspend fun pendingSpendCredits(): Int

    @Query("SELECT COUNT(*) FROM offline_spend_ledger")
    suspend fun pendingSpendCount(): Int

    /** Dopo una riconciliazione riuscita (consume_credits lato server). */
    @Query("DELETE FROM offline_spend_ledger")
    suspend fun clearSpendLedger()
}

/**
 * Indice spaziale R-tree (modulo SQLite `rtree`, abilitato nell'SQLite di
 * Android). Room non sa dichiarare virtual table, quindi la tabella e i trigger
 * di sincronizzazione con offline_pois sono DDL raw, eseguiti in onCreate,
 * onDestructiveMigration e nella MIGRATION_4_5.
 *
 * Nota: l'id dell'R-tree DEVE essere un intero → usiamo il rowid implicito di
 * offline_pois. Con OnConflictStrategy.REPLACE la riga sostituita cambia rowid
 * e il trigger di DELETE non scatta (recursive_triggers è off): le entry
 * orfane restano nell'R-tree ma sono innocue in lettura (la JOIN le scarta);
 * [vacuumSql] le ripulisce dopo ogni download/sync.
 */
object OfflineRtree {

    fun createSql(): List<String> = listOf(
        "CREATE VIRTUAL TABLE IF NOT EXISTS offline_poi_rtree USING rtree(id, minLat, maxLat, minLon, maxLon)",
        "CREATE TRIGGER IF NOT EXISTS offline_pois_rtree_ins AFTER INSERT ON offline_pois BEGIN " +
            "INSERT OR REPLACE INTO offline_poi_rtree(id, minLat, maxLat, minLon, maxLon) " +
            "VALUES (new.rowid, new.lat, new.lat, new.lon, new.lon); END",
        "CREATE TRIGGER IF NOT EXISTS offline_pois_rtree_upd AFTER UPDATE OF lat, lon ON offline_pois BEGIN " +
            "INSERT OR REPLACE INTO offline_poi_rtree(id, minLat, maxLat, minLon, maxLon) " +
            "VALUES (new.rowid, new.lat, new.lat, new.lon, new.lon); END",
        "CREATE TRIGGER IF NOT EXISTS offline_pois_rtree_del AFTER DELETE ON offline_pois BEGIN " +
            "DELETE FROM offline_poi_rtree WHERE id = old.rowid; END"
    )

    const val vacuumSql =
        "DELETE FROM offline_poi_rtree WHERE id NOT IN (SELECT rowid FROM offline_pois)"

    /**
     * Bounding box attorno a (lat, lon) per raggio in metri. I POI sono punti
     * (min=max), quindi basta il BETWEEN sulle colonne min: l'R-tree usa
     * l'indice, mai scan lineare della tabella POI.
     */
    fun bboxQuery(lat: Double, lon: Double, radiusM: Double, limit: Int = 400): SimpleSQLiteQuery {
        val latDelta = radiusM / 111_000.0
        val lonDelta = radiusM / (111_320.0 * cos(Math.toRadians(lat)).coerceAtLeast(0.01))
        return SimpleSQLiteQuery(
            "SELECT p.* FROM offline_pois p " +
                "JOIN offline_poi_rtree r ON p.rowid = r.id " +
                "WHERE r.minLat BETWEEN ? AND ? AND r.minLon BETWEEN ? AND ? " +
                "LIMIT ?",
            arrayOf<Any>(lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta, limit)
        )
    }
}
