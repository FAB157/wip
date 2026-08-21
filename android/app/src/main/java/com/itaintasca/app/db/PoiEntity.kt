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
    val footprint: String? = null
)
