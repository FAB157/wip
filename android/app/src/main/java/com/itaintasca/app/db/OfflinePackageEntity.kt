package com.itaintasca.app.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Pacchetto area per la modalità offline "essenziale": solo testi (POI, teaser,
 * audioguida completa), nessun file audio né immagine — la voce è il TTS di
 * sistema e la mappa è la vista radar. 1-3 MB per area da 50-100 km.
 */
@Entity(tableName = "offline_packages")
data class OfflinePackageEntity(
    @PrimaryKey val id: String,
    val name: String,
    val centerLat: Double,
    val centerLon: Double,
    val radiusKm: Double,
    val language: String,
    val poiCount: Int = 0,
    val sizeBytes: Long = 0L,
    val downloadedAt: Long = 0L,
    /** ISO-8601 (meta.generatedAt del server): base del prossimo delta sync */
    val lastSyncAt: String? = null,
    val status: String = "downloading", // downloading | ready | error
    /**
     * Ultimo utilizzo (download/resync completato): chiave della eviction LRU
     * quando lo storage offline supera MAX_OFFLINE_STORAGE_MB. Righe migrate da
     * schema precedente hanno 0 → trattate come "più vecchie" nell'eviction.
     */
    val lastAccessedAt: Long = 0L,
    /**
     * Checkpoint della paginazione keyset (vedi PackageDownloadManager.runPages):
     * un download interrotto riparte da qui invece che da pagina 1. Azzerati a
     * download completato.
     */
    val pendingCursorUpdated: String? = null,
    val pendingCursorId: String? = null
)

/**
 * POI persistente dei pacchetti offline. Tabella separata da poi_cache, che
 * resta la cache volatile del radar online e viene sovrascritta a ogni fetch.
 */
@Entity(tableName = "offline_pois")
data class OfflinePoiEntity(
    @PrimaryKey val id: String,
    val nome: String,
    val lat: Double,
    val lon: Double,
    val category: String?,
    val poiType: String?,
    val isGem: Boolean = false,
    val alertRadius: Int = 150,
    val arrivalRadius: Int = 50,
    val teaserText: String? = null,
    val descriptionShort: String? = null,
    /** Testo integrale dell'audioguida, letto dal TTS nativo quando offline */
    val audioText: String? = null,
    val updatedAt: String? = null,
    /**
     * LA PORTA, non il centroide (shared_pois.entrance_lat/lon, 277.363 POI al
     * 22/08/2026). Senza rete il geofence puntava al centro dell'edificio: per
     * un palazzo a L o un parco si arrivava sul retro. Nullable: chi non ha un
     * ingresso resta al centroide, identico a prima.
     */
    val entranceLat: Double? = null,
    val entranceLon: Double? = null,
    /**
     * PERIMETRO dell'edificio nel formato compatto "lon,lat lon,lat;..." di
     * PoiEntity.footprint: offline la domanda "sono dentro?" deve funzionare
     * come online, e senza rete poi_footprints non si può interrogare.
     */
    val footprint: String? = null,
    /** Indirizzo leggibile (via e civico), per la notifica e la voce. */
    val address: String? = null
)

/** Un POI può appartenere a più pacchetti sovrapposti (aree che si intersecano). */
@Entity(
    tableName = "offline_package_pois",
    primaryKeys = ["packageId", "poiId"],
    indices = [Index("poiId")]
)
data class OfflinePackagePoiRef(
    val packageId: String,
    val poiId: String
)

/**
 * Registro delle spese offline (per-listen): ogni ascolto a crediti senza rete
 * viene annotato qui e riconciliato con la RPC consume_credits al ritorno
 * online. Il tetto di spesa è lo snapshot del saldo salvato in prefs
 * dall'ultima sessione online (vedi BillingLogic).
 */
@Entity(tableName = "offline_spend_ledger")
data class OfflineSpendEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val poiId: String,
    val credits: Int,
    val ts: Long
)

/**
 * Adattatore verso la pipeline esistente (radar, geofence, receiver).
 *
 * Porta con sé ingresso, raggi calibrati e perimetro: prima passavano solo
 * nome e centroide, e offline il geofence lavorava a cerchi sul centro
 * dell'edificio anche per i POI che online hanno porta e perimetro.
 * I raggi vanno in PoiEntity SOLO con l'ingresso (stesso gate hasEntrance di
 * GeofenceManager): senza ingresso, 150/50 sono i default del server e non
 * una misura sul perimetro.
 */
fun OfflinePoiEntity.toPoiEntity() = PoiEntity(
    id = id,
    nome = nome,
    lat = lat,
    lon = lon,
    entranceLat = entranceLat,
    entranceLon = entranceLon,
    poiType = poiType ?: category,
    guideDefault = "nicky",
    isGem = isGem,
    isFromItinerary = false,
    teaserText = teaserText,
    alertRadius = if (entranceLat != null && entranceLon != null) alertRadius else null,
    geofenceRadius = if (entranceLat != null && entranceLon != null) arrivalRadius else null,
    footprint = footprint
)
