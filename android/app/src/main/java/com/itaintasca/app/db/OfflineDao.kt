package com.itaintasca.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RawQuery
import androidx.room.Transaction
import androidx.sqlite.db.SimpleSQLiteQuery
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteQuery
import kotlin.math.cos

/**
 * Classe astratta e non interfaccia (23/08/2026): due metodi qui dentro hanno
 * un corpo — [upsertPage], che deve girare in UNA transazione, e [getPoiById],
 * che registra l'uso del pacchetto — e i metodi concreti con @Transaction sono
 * supportati da Room in modo pieno e documentato sulle classi astratte. Per il
 * resto è identica a prima: stesse query, stessi nomi, stessi chiamanti.
 */
@Dao
abstract class OfflineDao {

    // --- Pacchetti ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertPackage(pkg: OfflinePackageEntity)

    @Query("SELECT * FROM offline_packages ORDER BY downloadedAt DESC")
    abstract suspend fun getAllPackages(): List<OfflinePackageEntity>

    @Query("SELECT * FROM offline_packages WHERE id = :id")
    abstract suspend fun getPackage(id: String): OfflinePackageEntity?

    @Query("DELETE FROM offline_packages WHERE id = :id")
    abstract suspend fun deletePackageRow(id: String)

    /**
     * Checkpoint di un download PIENO in corso: cursore keyset raggiunto
     * (resume) e byte già ricevuti finora — così un retry riparte da qui invece
     * che da pagina 1 e lo storage cap vede una stima realistica anche a
     * download interrotto.
     *
     * ⚠️ Il delta sync NON scrive checkpoint: vedi il commento su
     * OfflinePackageEntity.pendingCursorUpdated.
     */
    @Query(
        "UPDATE offline_packages SET pendingCursorUpdated = :cursorUpdated, " +
            "pendingCursorId = :cursorId, sizeBytes = :sizeBytes WHERE id = :id"
    )
    abstract suspend fun updateDownloadCheckpoint(
        id: String,
        cursorUpdated: String?,
        cursorId: String?,
        sizeBytes: Long
    )

    /**
     * Apertura di un download PIENO: timbro del run (vedi
     * OfflinePackageEntity.pendingRunStartedAt) e `lastSyncAt` provvisorio.
     *
     * `lastSyncAt` si scrive SUBITO, non alla fine: se il download si
     * interrompe e riprende ore dopo, la base del prossimo delta deve restare
     * l'istante in cui il download è COMINCIATO. Con il generatedAt del
     * troncone finale, ciò che è cambiato durante l'interruzione e che stava
     * sotto il cursore non tornerebbe più né dal download né dal delta. La riga
     * è in stato "downloading", quindi nessuno usa questo valore per un delta
     * finché il download non è completo.
     */
    @Query(
        "UPDATE offline_packages SET pendingRunStartedAt = :runStartedAt, " +
            "lastSyncAt = :generatedAt WHERE id = :id"
    )
    abstract suspend fun startFullDownloadRun(id: String, runStartedAt: Long, generatedAt: String?)

    /** Ultimo utilizzo del pacchetto: chiave dell'eviction LRU. */
    @Query("UPDATE offline_packages SET lastAccessedAt = :ts WHERE id = :id")
    abstract suspend fun touchPackage(id: String, ts: Long)

    /**
     * Come sopra, ma partendo dal POI: usare un POI offline È usare i pacchetti
     * che lo contengono. Prima `lastAccessedAt` si muoveva solo a download
     * fatto, quindi l'eviction LRU poteva buttare il pacchetto della città in
     * cui l'utente cammina tutti i giorni per tenere quello scaricato ieri e
     * mai aperto.
     */
    @Query(
        "UPDATE offline_packages SET lastAccessedAt = :ts WHERE id IN " +
            "(SELECT packageId FROM offline_package_pois WHERE poiId = :poiId)"
    )
    abstract suspend fun touchPackagesForPoi(poiId: String, ts: Long)

    // --- POI ---
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertPois(pois: List<OfflinePoiEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertRefs(refs: List<OfflinePackagePoiRef>)

    /**
     * Una pagina del bundle = UNA transazione. Prima erano due (prima i POI,
     * poi i riferimenti): un crash o un kill del sistema nel mezzo lasciava i
     * POI scritti senza il riferimento al pacchetto, cioè righe che nessun
     * pacchetto rivendica — invisibili al radar e cancellate al primo
     * `deleteOrphanPois`. In più è metà dei commit su disco.
     */
    @Transaction
    open suspend fun upsertPage(pois: List<OfflinePoiEntity>, refs: List<OfflinePackagePoiRef>) {
        upsertPois(pois)
        upsertRefs(refs)
    }

    @Query("DELETE FROM offline_package_pois WHERE packageId = :packageId")
    abstract suspend fun deleteRefsForPackage(packageId: String)

    /**
     * Riferimenti che il download pieno appena concluso NON ha riscritto: i POI
     * che erano nell'area e non ci sono più (cancellati, nascosti, rinominati
     * con un nome generico, o fuori raggio se l'area è stata ri-scaricata più
     * stretta). Vedi OfflinePackagePoiRef.syncedAt.
     */
    @Query("DELETE FROM offline_package_pois WHERE packageId = :packageId AND syncedAt < :runStartedAt")
    abstract suspend fun pruneStaleRefs(packageId: String, runStartedAt: Long)

    /**
     * POI che APPARTENGONO SOLO a questo pacchetto: quelli che una delete del
     * pacchetto renderà orfani. Serve a sapere quali MP3 in cache si possono
     * buttare — un POI condiviso con un'altra area scaricata resta vivo, e il
     * suo audio va lasciato dov'è.
     */
    @Query(
        "SELECT poiId FROM offline_package_pois WHERE packageId = :packageId " +
            "AND poiId NOT IN (SELECT poiId FROM offline_package_pois WHERE packageId <> :packageId)"
    )
    abstract suspend fun exclusivePoiIds(packageId: String): List<String>

    @Query("DELETE FROM offline_package_pois WHERE poiId IN (:ids)")
    abstract suspend fun deleteRefsByPoiIds(ids: List<String>)

    @Query("DELETE FROM offline_pois WHERE id IN (:ids)")
    abstract suspend fun deletePoisByIds(ids: List<String>)

    /** POI non più referenziati da alcun pacchetto (dopo una delete pacchetto). */
    @Query("DELETE FROM offline_pois WHERE id NOT IN (SELECT poiId FROM offline_package_pois)")
    abstract suspend fun deleteOrphanPois()

    @Query("SELECT COUNT(*) FROM offline_package_pois WHERE packageId = :packageId")
    abstract suspend fun countPoisForPackage(packageId: String): Int

    @Query("SELECT COUNT(*) FROM offline_pois")
    abstract suspend fun countPois(): Int

    @Query("SELECT * FROM offline_pois WHERE id = :id")
    abstract suspend fun getPoiRow(id: String): OfflinePoiEntity?

    /**
     * Il POI più la registrazione dell'uso: leggere un POI offline (teaser,
     * audioguida, indirizzo) vuol dire che quel pacchetto SERVE, e l'eviction
     * LRU deve saperlo. Una UPDATE per lettura, e solo sui percorsi di trigger
     * e di arrivo — il loop del radar passa da [queryPoisRaw] e non tocca
     * niente. Deliberatamente NON in @Transaction e con la scrittura protetta:
     * la lettura non deve mai fallire per colpa di un timestamp.
     */
    open suspend fun getPoiById(id: String): OfflinePoiEntity? {
        val poi = getPoiRow(id) ?: return null
        try {
            touchPackagesForPoi(id, System.currentTimeMillis())
        } catch (_: Exception) {
            // best-effort: il peggio che può capitare è una LRU meno informata
        }
        return poi
    }

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
    abstract suspend fun getPoiPackageLanguage(poiId: String): String?

    /**
     * Le query spaziali passano dall'R-tree (tabella virtuale offline_poi_rtree,
     * fuori dallo schema noto a Room): devono essere raw. Costruirle con
     * [OfflineRtree.bboxQuery], mai a mano.
     */
    @RawQuery
    abstract suspend fun queryPoisRaw(query: SupportSQLiteQuery): List<OfflinePoiEntity>

    // --- Registro spese offline (per-listen) ---
    @Insert
    abstract suspend fun insertSpend(entry: OfflineSpendEntity)

    @Query("SELECT COALESCE(SUM(credits), 0) FROM offline_spend_ledger")
    abstract suspend fun pendingSpendCredits(): Int

    @Query("SELECT COUNT(*) FROM offline_spend_ledger")
    abstract suspend fun pendingSpendCount(): Int

    /** Dopo una riconciliazione riuscita (consume_credits lato server). */
    @Query("DELETE FROM offline_spend_ledger")
    abstract suspend fun clearSpendLedger()
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

    private const val TAG = "OfflineRtree"

    /**
     * IL MODULO `rtree` NON C'E' SU TUTTI I TELEFONI (29/08/2026, collaudo su
     * Realme 8: «no such module: rtree»). L'SQLite di sistema e' compilato
     * dal produttore, e alcuni lo compilano senza. Prima il DDL girava nel
     * callback onCreate di Room e l'eccezione ammazzava il processo: il
     * servizio ripartiva (START_STICKY), ripeteva «Posizione acquisita»,
     * «Ricerca POI», e cadeva di nuovo — all'infinito, anche a guida
     * spenta. Ora l'indice e' un'OTTIMIZZAZIONE: se il modulo manca si
     * lavora con il riquadro lat/lon sulla tabella (poche migliaia di righe
     * per pacchetto, millisecondi), e il risultato e' identico.
     * null = mai verificato; true/false dopo la prima apertura del DB.
     */
    @Volatile var disponibile: Boolean? = null
        private set

    /**
     * Crea (se mancano) tabella virtuale e trigger. Idempotente: si chiama in
     * onCreate, onOpen, onDestructiveMigration e nella MIGRATION_4_5. Se
     * l'SQLite del telefono non ha il modulo si segna e si va avanti; se e'
     * un altro errore si segnala e basta — MAI si lascia risalire un'eccezione
     * dal DDL: da qui si arriva a un crash dell'intero processo.
     */
    fun installa(db: SupportSQLiteDatabase): Boolean {
        try {
            for (sql in createSql()) db.execSQL(sql)
            disponibile = true
            return true
        } catch (e: android.database.sqlite.SQLiteException) {
            val moduloAssente = e.message?.contains("no such module", ignoreCase = true) == true
            disponibile = false
            if (moduloAssente) {
                android.util.Log.w(TAG, "SQLite senza modulo rtree: ricerca offline con riquadro lat/lon")
            } else {
                android.util.Log.w(TAG, "Indice R-tree non installato: ${e.message}")
            }
            return false
        } catch (e: Exception) {
            disponibile = false
            android.util.Log.w(TAG, "Indice R-tree non installato: ${e.message}")
            return false
        }
    }

    /** Pulizia orfani: solo se l'indice c'e', mai un'eccezione. */
    fun vacuum(db: SupportSQLiteDatabase) {
        if (disponibile != true) return
        try {
            db.execSQL(vacuumSql)
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Rtree vacuum failed: ${e.message}")
        }
    }

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
        // Senza il modulo rtree (vedi `disponibile`): stesso riquadro, stesse
        // righe, direttamente sulle colonne lat/lon della tabella.
        if (disponibile != true) {
            return SimpleSQLiteQuery(
                "SELECT * FROM offline_pois " +
                    "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? " +
                    "LIMIT ?",
                arrayOf<Any>(lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta, limit)
            )
        }
        return SimpleSQLiteQuery(
            "SELECT p.* FROM offline_pois p " +
                "JOIN offline_poi_rtree r ON p.rowid = r.id " +
                "WHERE r.minLat BETWEEN ? AND ? AND r.minLon BETWEEN ? AND ? " +
                "LIMIT ?",
            arrayOf<Any>(lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta, limit)
        )
    }
}
