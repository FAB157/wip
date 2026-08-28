package com.itaintasca.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "poi_cache")
data class PoiEntity(
    @PrimaryKey val id: String,
    val nome: String,
    val lat: Double,
    val lon: Double,
    val entranceLat: Double?,
    val entranceLon: Double?,
    val poiType: String?,
    val guideDefault: String, // nicky | dante
    val isGem: Boolean = false,
    val isFromItinerary: Boolean = false,
    val teaserText: String? = null, // Breve teaser per voce nativa (30m)
    // Raggi calibrati sul PERIMETRO reale del POI (footprint OSM), quando
    // presenti. alertRadius = colonna alert_radius; geofenceRadius = colonna
    // geofence_radius (raggio di trigger/arrivo). Nullable: i POI non
    // processati col footprint restano identici (usano i raggi di modalità).
    // Parità con src/lib/guideSettings.ts::radiiForTransport (gated su hasEntrance).
    val alertRadius: Int? = null,
    val geofenceRadius: Int? = null,
    // PERIMETRO dell'edificio (poi_footprints, poligono OSM), come lista
    // compatta "lon,lat lon,lat ..." e non GeoJSON: nel database del servizio
    // ci stanno migliaia di POI e le parentesi del GeoJSON sarebbero il 40%
    // del peso senza aggiungere niente. Nullable: 402.889 POI su 2,3 milioni
    // ce l'hanno, gli altri restano ai raggi come sempre.
    // Parità con src/lib/geofencing/footprints.ts e PoiFootprints.swift.
    val footprint: String? = null,
    // INDIRIZZO leggibile (23/08/2026), per la notifica e la voce. NON fa da
    // solo gradino nella scala di fiducia: una stringa non si può trasformare
    // in un cerchio, e un POI con l'indirizzo scritto ma senza punto resta al
    // centroide (raggio ×2). Il gradino lo fanno le coordinate qui sotto.
    // `addressSource` non è decorazione: 'strada_vicina' vuol dire «la strada
    // più vicina», non l'indirizzo del luogo — una chiesa in mezzo ai campi
    // non sta al civico di quella via, e usarla porterebbe il punto altrove:
    // per questo scarta anche il PUNTO (vedi RaggiFiducia.puntoIndirizzo).
    // Nullable: i pacchetti offline già scaricati non li portano e restano
    // validi (Room usa il default).
    val address: String? = null,
    val addressSource: String? = null,
    // IL PUNTO DELL'INDIRIZZO (23/08/2026, migration
    // 20260823160000_poi_address_point.sql: address_point_lat/lon/source).
    // NON è una geocodifica testuale: è la casa più vicina al POI nel dump
    // Nominatim, cioè vicinanza MISURATA a pochi metri. Per questo vale come
    // punto d'ARRIVO anche senza numero civico, e non come indizio.
    // Regola dell'utente: «chi ha indirizzo, quello È l'arrivo: il trigger a
    // 30 m da lì, e il navigatore punta a quell'indirizzo».
    // La stringa `address` da sola NON basta più a fare gradino: senza queste
    // due coordinate il POI resta al centroide (vedi RaggiFiducia.livello).
    // Nullable: i pacchetti e le cache già scaricati non li portano e restano
    // validi (Room usa il default), col comportamento identico a prima.
    val addressPointLat: Double? = null,
    val addressPointLon: Double? = null,
    // Provenienza E qualità del punto in un valore solo (photon_casa_civico |
    // photon_casa | …). Oggi non cambia il raggio — il punto è misurato in
    // entrambi i casi — ma è l'unico appiglio se un domani una fonte peggiore
    // scriverà qui: chi legge deve poter decidere dalla qualità, non dalla
    // sola presenza.
    val addressPointSource: String? = null
)
