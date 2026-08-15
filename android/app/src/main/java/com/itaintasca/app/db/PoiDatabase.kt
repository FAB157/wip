package com.itaintasca.app.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Dao
interface PoiDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPois(pois: List<PoiEntity>)

    @Query("SELECT * FROM poi_cache")
    suspend fun getAllPois(): List<PoiEntity>

    @Query("DELETE FROM poi_cache")
    suspend fun clearAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun updateTriggerState(state: TriggerStateEntity)

    @Query("SELECT * FROM trigger_state WHERE poiId = :id")
    suspend fun getTriggerState(id: String): TriggerStateEntity?

    @Query("SELECT * FROM poi_cache WHERE id = :id")
    suspend fun getPoiById(id: String): PoiEntity?

    @Query("SELECT * FROM trigger_state")
    suspend fun getAllTriggerStates(): List<TriggerStateEntity>

    @Query("DELETE FROM trigger_state WHERE poiId = :id")
    suspend fun deleteTriggerState(id: String)

    @Query("DELETE FROM trigger_state")
    suspend fun clearTriggerStates()
}

@Database(
    entities = [
        PoiEntity::class,
        TriggerStateEntity::class,
        OfflinePackageEntity::class,
        OfflinePoiEntity::class,
        OfflinePackagePoiRef::class,
        OfflineSpendEntity::class
    ],
    version = 7
)
@TypeConverters(Converters::class)
abstract class PoiDatabase : RoomDatabase() {
    abstract fun poiDao(): PoiDao
    abstract fun offlineDao(): OfflineDao

    companion object {
        @Volatile private var instance: PoiDatabase? = null

        // 4→5: tabelle dei pacchetti offline + R-tree. Migration REALE: i
        // pacchetti scaricati non devono sparire a un aggiornamento app.
        // (Il fallback distruttivo resta solo per i salti pre-4, che erano
        // cache volatile senza dati preziosi.)
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `offline_packages` (" +
                        "`id` TEXT NOT NULL, `name` TEXT NOT NULL, " +
                        "`centerLat` REAL NOT NULL, `centerLon` REAL NOT NULL, " +
                        "`radiusKm` REAL NOT NULL, `language` TEXT NOT NULL, " +
                        "`poiCount` INTEGER NOT NULL, `sizeBytes` INTEGER NOT NULL, " +
                        "`downloadedAt` INTEGER NOT NULL, `lastSyncAt` TEXT, " +
                        "`status` TEXT NOT NULL, PRIMARY KEY(`id`))"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `offline_pois` (" +
                        "`id` TEXT NOT NULL, `nome` TEXT NOT NULL, " +
                        "`lat` REAL NOT NULL, `lon` REAL NOT NULL, " +
                        "`category` TEXT, `poiType` TEXT, `isGem` INTEGER NOT NULL, " +
                        "`alertRadius` INTEGER NOT NULL, `arrivalRadius` INTEGER NOT NULL, " +
                        "`teaserText` TEXT, `descriptionShort` TEXT, `audioText` TEXT, " +
                        "`updatedAt` TEXT, PRIMARY KEY(`id`))"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `offline_package_pois` (" +
                        "`packageId` TEXT NOT NULL, `poiId` TEXT NOT NULL, " +
                        "PRIMARY KEY(`packageId`, `poiId`))"
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_offline_package_pois_poiId` " +
                        "ON `offline_package_pois` (`poiId`)"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `offline_spend_ledger` (" +
                        "`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`poiId` TEXT NOT NULL, `credits` INTEGER NOT NULL, " +
                        "`ts` INTEGER NOT NULL)"
                )
                OfflineRtree.createSql().forEach { db.execSQL(it) }
            }
        }

        // 5→6: raggi da footprint (perimetro reale) sul radar cache. Migration
        // REALE (mai distruttiva): un bump distruttivo cancellerebbe anche i
        // pacchetti offline scaricati. Le colonne sono nullable → nessun
        // default: i POI già in cache restano NULL (= raggi di modalità, come
        // prima) finché il prossimo fetch non le popola.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO / ANDROID STUDIO: schema Room + upgrade
        //    reale da un'installazione con DB v5 (pacchetti offline preservati).
        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `alertRadius` INTEGER")
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `geofenceRadius` INTEGER")
            }
        }

        // 6→7: cap storage pacchetti offline (eviction LRU) + resume download.
        // Migration REALE (mai distruttiva, stesso motivo della 4→5): le colonne
        // sono nullable/con default → nessuna riga esistente viene toccata nel
        // contenuto, solo estesa. lastAccessedAt parte da 0 sulle righe vecchie
        // (trattate come "meno recenti" nell'eviction finché non riscaricate).
        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `offline_packages` ADD COLUMN `lastAccessedAt` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `offline_packages` ADD COLUMN `pendingCursorUpdated` TEXT")
                db.execSQL("ALTER TABLE `offline_packages` ADD COLUMN `pendingCursorId` TEXT")
            }
        }

        // L'R-tree non è un'entità Room: va (ri)creato anche sulle installazioni
        // fresche e dopo un'eventuale migration distruttiva pre-4.
        private val rtreeCallback = object : Callback() {
            override fun onCreate(db: SupportSQLiteDatabase) {
                OfflineRtree.createSql().forEach { db.execSQL(it) }
            }

            override fun onDestructiveMigration(db: SupportSQLiteDatabase) {
                OfflineRtree.createSql().forEach { db.execSQL(it) }
            }
        }

        fun getInstance(context: Context): PoiDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context, PoiDatabase::class.java, "itainta_poi.db")
                    .addMigrations(MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
                    // Distruttivo SOLO dalle versioni volatili pre-4 (cache): un
                    // domani una migration mancante (es. 6→7 dimenticata) o un
                    // downgrade NON deve azzerare offline_packages/pois/ledger.
                    .fallbackToDestructiveMigrationFrom(1, 2, 3)
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .addCallback(rtreeCallback)
                    .build()
                    .also { instance = it }
            }
        }
    }
}
