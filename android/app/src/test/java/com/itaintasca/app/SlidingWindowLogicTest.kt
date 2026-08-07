package com.itaintasca.app

import com.itaintasca.app.geofence.SlidingWindowLogic
import com.itaintasca.app.geofence.SlidingWindowLogic.WindowPoi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SlidingWindowLogicTest {

    private fun poi(id: String, dist: Float, gem: Boolean = false) = WindowPoi(id, gem, dist)

    // --- selectWindow ---

    @Test
    fun `la finestra e limitata a MAX_POIS`() {
        val pois = (1..100).map { poi("p$it", it.toFloat()) }
        val window = SlidingWindowLogic.selectWindow(pois)
        assertEquals(SlidingWindowLogic.MAX_POIS, window.size)
    }

    @Test
    fun `33 POI per 3 geofence piu la sentinella restano nel cap Android di 100`() {
        assertTrue(SlidingWindowLogic.MAX_POIS * 3 + 1 <= 100)
    }

    @Test
    fun `le gemme hanno priorita sulla distanza`() {
        val pois = (1..40).map { poi("p$it", it.toFloat()) } + poi("gemma", 9999f, gem = true)
        val window = SlidingWindowLogic.selectWindow(pois)
        assertEquals("gemma", window.first())
    }

    @Test
    fun `a parita di tipo vince il piu vicino`() {
        val pois = listOf(poi("lontano", 500f), poi("vicino", 10f), poi("medio", 100f))
        assertEquals(listOf("vicino", "medio", "lontano"), SlidingWindowLogic.selectWindow(pois))
    }

    @Test
    fun `i POI oltre la finestra vengono esclusi in ordine di distanza`() {
        val pois = (1..34).map { poi("p$it", it.toFloat()) }
        val window = SlidingWindowLogic.selectWindow(pois)
        assertTrue("p34" !in window)
        assertTrue("p33" in window)
    }

    // --- computeDiff ---

    @Test
    fun `diff vuoto quando la finestra non cambia`() {
        val ids = setOf("a", "b", "c")
        val diff = SlidingWindowLogic.computeDiff(ids, listOf("a", "b", "c"))
        assertTrue(diff.isEmpty)
    }

    @Test
    fun `il movimento produce solo add e remove marginali, mai il set intero`() {
        // Finestra che scorre: b,c restano, a esce, d entra
        val diff = SlidingWindowLogic.computeDiff(setOf("a", "b", "c"), listOf("b", "c", "d"))
        assertEquals(listOf("d"), diff.toAddIds)
        assertEquals(listOf("a"), diff.toRemoveIds)
    }

    @Test
    fun `primo avvio con set vuoto registra tutto`() {
        val diff = SlidingWindowLogic.computeDiff(emptySet(), listOf("a", "b"))
        assertEquals(listOf("a", "b"), diff.toAddIds)
        assertTrue(diff.toRemoveIds.isEmpty())
    }

    @Test
    fun `uscita da area rimuove tutti i registrati`() {
        val diff = SlidingWindowLogic.computeDiff(setOf("a", "b"), emptyList())
        assertTrue(diff.toAddIds.isEmpty())
        assertEquals(setOf("a", "b"), diff.toRemoveIds.toSet())
    }

    // --- requestIdsFor ---

    @Test
    fun `ogni POI genera i 3 requestId approach arrival exit`() {
        assertEquals(
            listOf("x_approach", "x_arrival", "x_exit"),
            SlidingWindowLogic.requestIdsFor("x")
        )
    }
}
