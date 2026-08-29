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
    version = 12
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
                OfflineRtree.installa(db)
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

        // 7→8: perimetro dell'edificio sul radar cache. Migration REALE, stesso
        // motivo di tutte le altre: un bump distruttivo si porterebbe via i
        // pacchetti offline scaricati. Colonna nullable senza default → le
        // righe già in cache restano NULL, cioè continuano a lavorare a raggi
        // finché il prossimo fetch non porta il poligono.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO: upgrade reale da un'installazione v7.
        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `footprint` TEXT")
            }
        }

        // 8→9: ingresso, perimetro e indirizzo nei POI dei pacchetti OFFLINE.
        // Senza rete il geofence puntava al centroide e lavorava a cerchi anche
        // per i POI che online hanno la porta e il poligono. Colonne nullable:
        // i pacchetti già scaricati restano com'erano (centroide + raggi) finché
        // il prossimo delta sync non porta i campi nuovi dal server.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO: upgrade reale da un'installazione v8.
        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `entranceLat` REAL")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `entranceLon` REAL")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `footprint` TEXT")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `address` TEXT")
            }
        }

        // 9→10: indirizzo e sua PROVENIENZA sul radar cache. La stringa serve
        // a notifica e voce; `addressSource` è la guardia della scala di
        // fiducia: 'strada_vicina' non è l'indirizzo del luogo ma la strada più
        // vicina, e trattarla come indirizzo sposterebbe il punto altrove.
        // (Nella stessa giornata la stringa ha smesso di fare gradino da sola:
        // il gradino lo fa il PUNTO, aggiunto dalla 10→11 qui sotto.)
        // Colonne nullable senza default → le righe già in cache restano NULL,
        // cioè continuano a comportarsi esattamente come prima finché il
        // prossimo fetch non porta i campi.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO: upgrade reale da un'installazione v9.
        private val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `address` TEXT")
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `addressSource` TEXT")
            }
        }

        // 10→11: IL PUNTO dell'indirizzo sul radar cache (address_point_lat/lon
        // e la sua fonte, migration DB 20260823160000_poi_address_point.sql).
        // Non è la stringa: è la casa più vicina al POI nel dump Nominatim,
        // vicinanza MISURATA a pochi metri. Con quel punto l'indirizzo diventa
        // il PUNTO D'ARRIVO — il trigger scatta a 30 m da lì invece che dal
        // centroide, che su un palazzo può stare sul retro.
        // Migration REALE (mai distruttiva, come tutte le altre): un bump
        // distruttivo cancellerebbe i pacchetti offline scaricati.
        // Colonne nullable senza default → le righe già in cache restano NULL,
        // cioè continuano a comportarsi esattamente come prima finché il
        // prossimo fetch non porta i campi.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO: upgrade reale da un'installazione v10.
        private val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `addressPointLat` REAL")
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `addressPointLon` REAL")
                db.execSQL("ALTER TABLE `poi_cache` ADD COLUMN `addressPointSource` TEXT")
            }
        }

        // 11→12: il PUNTO dell'indirizzo anche nei PACCHETTI OFFLINE, più due
        // colonne di servizio per il download.
        //
        // Perché: dal 23/08 online il punto dell'indirizzo È il punto d'arrivo
        // (RaggiFiducia), e il raggio ci resta stretto. Offline no: il bundle
        // non lo portava, quindi lo STESSO POI con la STESSA app scattava a
        // 30 m online e col raggio raddoppiato senza rete — cioè male proprio a
        // chi si era scaricato l'area per camminare senza rete. La RPC lo
        // restituisce dalla migration 20260823180000_area_bundle_address_point.
        //
        // Le altre due colonne chiudono due buchi del download (vedi i commenti
        // su OfflinePackageEntity):
        //   pendingRunStartedAt → distingue un checkpoint di download PIENO da
        //     uno lasciato da una versione precedente (che poteva venire da un
        //     delta fallito, e ripreso come pieno faceva SALTARE i POI più
        //     vecchi dichiarandosi comunque `ready`);
        //   offline_package_pois.syncedAt → timbro del run, per potare a fine
        //     download i riferimenti ai POI usciti dall'area, che prima
        //     restavano agganciati per sempre e non diventavano mai orfani.
        //
        // Migration REALE (mai distruttiva, come tutte le altre): un bump
        // distruttivo cancellerebbe i pacchetti offline scaricati. Colonne
        // nullable senza default (o NOT NULL DEFAULT 0 dove il tipo è primitivo)
        // → le righe esistenti non cambiano comportamento: i pacchetti già
        // scaricati continuano a lavorare esattamente come prima finché il
        // prossimo sync non porta i campi nuovi.
        // ⚠️ DA VERIFICARE SU DISPOSITIVO: upgrade reale da un'installazione v11
        //    con almeno un pacchetto offline scaricato.
        private val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `addressSource` TEXT")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `addressPointLat` REAL")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `addressPointLon` REAL")
                db.execSQL("ALTER TABLE `offline_pois` ADD COLUMN `addressPointSource` TEXT")
                db.execSQL("ALTER TABLE `offline_packages` ADD COLUMN `pendingRunStartedAt` INTEGER")
                db.execSQL("ALTER TABLE `offline_package_pois` ADD COLUMN `syncedAt` INTEGER NOT NULL DEFAULT 0")
            }
        }

        // L'R-tree non è un'entità Room: va (ri)creato anche sulle installazioni
        // fresche e dopo un'eventuale migration distruttiva pre-4.
        // (29/08/2026) MAI un'eccezione da qui: onCreate gira dentro l'apertura
        // del DB e un errore uccide il processo (successo davvero: modulo rtree
        // assente sul Realme 8, servizio in crash-loop). OfflineRtree.installa
        // assorbe l'errore e mette l'indice in modalita' «assente».
        // onOpen serve per i DB gia' esistenti: e' li' che si scopre, una volta
        // per processo, se l'indice si puo' usare (OfflineRtree.disponibile).
        private val rtreeCallback = object : Callback() {
            override fun onCreate(db: SupportSQLiteDatabase) {
                OfflineRtree.installa(db)
            }

            override fun onOpen(db: SupportSQLiteDatabase) {
                if (OfflineRtree.disponibile == null) OfflineRtree.installa(db)
            }

            override fun onDestructiveMigration(db: SupportSQLiteDatabase) {
                OfflineRtree.installa(db)
            }
        }

        fun getInstance(context: Context): PoiDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context, PoiDatabase::class.java, "itainta_poi.db")
                    .addMigrations(MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12)
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
