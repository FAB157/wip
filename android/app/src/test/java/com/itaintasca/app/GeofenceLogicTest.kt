package com.itaintasca.app

import com.itaintasca.app.db.PoiEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeofenceLogicTest {

    // Simulazione della logica di filtraggio categorie per test unitario
    private val CATEGORY_MAP = mapOf(
        "monumenti" to listOf("monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti"),
        "chiese" to listOf("church", "place_of_worship", "cathedral", "chiese")
    )

    private fun isPoiCategoryActive(poi: PoiEntity, selected: List<String>): Boolean {
        if (poi.isFromItinerary) return true
        if (poi.isGem) return true
        val cat = (poi.poiType ?: "").lowercase()
        if (selected.contains(cat)) return true
        for (uiCat in selected) {
            if (CATEGORY_MAP[uiCat]?.contains(cat) == true) return true
        }
        return false
    }

    @Test
    fun testCategoryFiltering() {
        val poiChurch = PoiEntity("1", "Duomo", 0.0, 0.0, null, null, "church", "nicky")
        val selectedOnlyMonuments = listOf("monumenti")
        
        // Deve essere FALSE perché la chiesa non è un monumento nel filtro
        assertFalse("La chiesa dovrebbe essere filtrata se non selezionata", 
            isPoiCategoryActive(poiChurch, selectedOnlyMonuments))
            
        // Deve essere TRUE se aggiungiamo chiese
        assertTrue("La chiesa dovrebbe essere attiva se selezionata", 
            isPoiCategoryActive(poiChurch, listOf("chiese")))
    }

    @Test
    fun testGemAlwaysActive() {
        val gemPoi = PoiEntity("2", "Gemma Nascosta", 0.0, 0.0, null, null, "any", "nicky", isGem = true)
        // Deve essere TRUE anche con lista vuota
        assertTrue("Le gemme devono essere sempre attive", isPoiCategoryActive(gemPoi, emptyList()))
    }
}
