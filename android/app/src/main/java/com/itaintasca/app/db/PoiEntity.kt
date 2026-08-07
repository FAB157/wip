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
    val teaserText: String? = null // Breve teaser per voce nativa (30m)
)
