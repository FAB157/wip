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
    version = 5
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
                    .addMigrations(MIGRATION_4_5)
                    .fallbackToDestructiveMigration()
                    .addCallback(rtreeCallback)
                    .build()
                    .also { instance = it }
            }
        }
    }
}
