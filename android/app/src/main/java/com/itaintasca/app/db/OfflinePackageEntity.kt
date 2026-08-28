package com.itaintasca.app.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Pacchetto area per la modalità offline "essenziale": solo testi (POI, teaser,
 * audioguida completa), nessun file audio né immagine — la voce è il TTS di
 * sistema e la mappa è la vista radar.
 *
 * PESO REALE (misurato 23/08/2026): ~3,4 KB per POI, di cui il 70% è
 * `audioText`. Col raggio predefinito di 50 km un'area urbana porta decine di
 * migliaia di POI, cioè ~35 MB — un ordine di grandezza sopra "1-3 MB", che era
 * la stima scritta qui prima e non è mai stata vera. Vedi la nota estesa in
 * PackageDownloadManager.
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
     *
     * ⚠️ SOLO IL DOWNLOAD PIENO LI SCRIVE (23/08/2026). Prima li scriveva anche
     * il delta sync, e un delta fallito lasciava qui un cursore "dell'era
     * delta": il download successivo lo riprendeva come se fosse un download
     * pieno, ripartiva da metà catalogo, SALTAVA tutti i POI più vecchi e si
     * dichiarava comunque `ready`. Perdita di dati silenziosa. Un delta
     * interrotto ora riparte semplicemente da capo — costa poco, non perde
     * niente (lastSyncAt si muove solo a delta completato).
     */
    val pendingCursorUpdated: String? = null,
    val pendingCursorId: String? = null,
    /**
     * Millisecondi d'inizio del download PIENO che ha scritto il checkpoint qui
     * sopra. Fa tre lavori insieme:
     *  1. distingue un checkpoint da download pieno (valore != null) da uno
     *     lasciato da una versione precedente, che poteva venire da un delta
     *     (valore null): i checkpoint vecchi non si riprendono mai, si riparte
     *     da pagina 1 — costa banda, non perde POI;
     *  2. timbra le righe di offline_package_pois scritte dal run
     *     (OfflinePackagePoiRef.syncedAt), così a fine download i riferimenti
     *     NON riscritti — i POI usciti dall'area — si possono potare;
     *  3. sopravvive al resume, quindi i due tronconi dello stesso download
     *     portano lo stesso timbro.
     */
    val pendingRunStartedAt: Long? = null
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
    val address: String? = null,
    /**
     * PROVENIENZA della stringa qui sopra (shared_pois.address_source). Non è
     * decorazione: 'strada_vicina' vuol dire «la strada con nome più vicina»,
     * non l'indirizzo del luogo — una chiesa in mezzo ai campi non sta al
     * civico di quella via — e per questo scarta anche il PUNTO qui sotto
     * (RaggiFiducia.puntoIndirizzo).
     */
    val addressSource: String? = null,
    /**
     * IL PUNTO DELL'INDIRIZZO (23/08/2026, RPC area_bundle_pois estesa dalla
     * migration 20260823180000_area_bundle_address_point.sql). È la casa più
     * vicina al POI nel dump Nominatim: vicinanza MISURATA a pochi metri, non
     * una geocodifica del testo. Vale quindi come punto d'ARRIVO fra l'ingresso
     * e il centroide, e il trigger scatta a 30 m da lì invece di raddoppiare il
     * raggio — offline esattamente come online.
     * Nullable: i pacchetti già scaricati non lo portano e restano validi
     * (Room usa il default), col comportamento identico a prima.
     */
    val addressPointLat: Double? = null,
    val addressPointLon: Double? = null,
    /** photon_casa_civico | photon_casa | … : qualità e provenienza del punto. */
    val addressPointSource: String? = null
)

/** Un POI può appartenere a più pacchetti sovrapposti (aree che si intersecano). */
@Entity(
    tableName = "offline_package_pois",
    primaryKeys = ["packageId", "poiId"],
    indices = [Index("poiId")]
)
data class OfflinePackagePoiRef(
    val packageId: String,
    val poiId: String,
    /**
     * Timbro del run che ha (ri)scritto questo riferimento
     * (OfflinePackageEntity.pendingRunStartedAt per il download pieno, l'ora
     * corrente per il delta sync).
     *
     * PERCHE' ESISTE (23/08/2026): ri-scaricare la stessa area non cancellava
     * mai i riferimenti vecchi. Un POI uscito dall'area (cancellato, nascosto,
     * rinominato "Punto di interesse") restava agganciato al pacchetto per
     * sempre, quindi non era mai orfano e `deleteOrphanPois` non lo vedeva:
     * spazio occupato per sempre e un POI fantasma nel radar offline. A
     * download pieno completato si potano i riferimenti con syncedAt più
     * vecchio del timbro del run — cioè quelli che il server non ha ripetuto.
     * Le righe migrate da schema precedente hanno 0 → potate al primo
     * ri-download, che è esattamente il momento in cui vengono riscritte.
     */
    val syncedAt: Long = 0L
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
 * I raggi del POI sono una MISURA e non un default? Lo sono quando il server ha
 * avuto qualcosa di reale su cui misurarli: la porta (entrance_lat/lon) oppure
 * il perimetro OSM. Senza né l'una né l'altro, alert/geofence valgono 150/50
 * perché così li lascia il `coalesce` della RPC, e propagarli come se fossero
 * misurati farebbe scattare i trigger su un cerchio inventato.
 */
private fun OfflinePoiEntity.hasCalibratedRadii(): Boolean =
    (entranceLat != null && entranceLon != null) || !footprint.isNullOrBlank()

/**
 * Adattatore verso la pipeline esistente (radar, geofence, receiver).
 *
 * Porta con sé ingresso, raggi calibrati e perimetro: prima passavano solo
 * nome e centroide, e offline il geofence lavorava a cerchi sul centro
 * dell'edificio anche per i POI che online hanno porta e perimetro.
 *
 * IL NARRATORE resta "nicky" ed è una SCELTA (23/08/2026), non una
 * dimenticanza: il TESTO dell'audioguida è unico, il personaggio scelto
 * dall'utente cambia la VOCE — e offline la voce è la sintesi di sistema, che
 * il timbro se lo prende già dalle prefs "guideCharacter"
 * (GeofenceBroadcastReceiver.applyTtsGender). Non renderlo variabile qui: si
 * scaricherebbe due volte lo stesso testo.
 *
 * I RAGGI (23/08/2026) si conservano con l'ingresso OPPURE col perimetro. Il
 * gate valeva solo per l'ingresso, e un POI con perimetro OSM ma senza porta —
 * un chiostro, un parco recintato — perdeva offline raggi MISURATI sul
 * poligono reale e tornava ai 150/50 di default. Chi non ha né porta né
 * perimetro resta null come prima: lì 150/50 sono davvero un default del
 * server, non una misura, e PoiEntity/GeofenceManager devono poterlo sapere.
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
    // Misurati sul poligono reale (porta o perimetro), non i default del server.
    alertRadius = if (hasCalibratedRadii()) alertRadius else null,
    geofenceRadius = if (hasCalibratedRadii()) arrivalRadius else null,
    footprint = footprint,
    // L'indirizzo, la sua provenienza e il suo PUNTO (23/08/2026): senza questi
    // campi offline la scala di fiducia si fermava all'ingresso, e chi aveva
    // solo l'indirizzo finiva al centroide col raggio raddoppiato — mentre lo
    // stesso POI, online, scattava a 30 m dalla facciata. Null sui pacchetti
    // scaricati prima: comportamento identico a prima.
    address = address,
    addressSource = addressSource,
    addressPointLat = addressPointLat,
    addressPointLon = addressPointLon,
    addressPointSource = addressPointSource
)
