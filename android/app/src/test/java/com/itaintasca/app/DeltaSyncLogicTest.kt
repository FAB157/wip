package com.itaintasca.app

import com.itaintasca.app.offline.DeltaSyncLogic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeltaSyncLogicTest {

    @Test
    fun `delta vuoto non cambia nulla`() {
        val local = setOf("a", "b")
        assertEquals(local, DeltaSyncLogic.applyDelta(local, emptyList(), emptyList()))
    }

    @Test
    fun `gli upsert aggiungono i POI nuovi e mantengono gli esistenti`() {
        val out = DeltaSyncLogic.applyDelta(setOf("a"), emptyList(), listOf("a", "b"))
        assertEquals(setOf("a", "b"), out)
    }

    @Test
    fun `le tombstone rimuovono i POI cancellati sul server`() {
        val out = DeltaSyncLogic.applyDelta(setOf("a", "b", "c"), listOf("b"), emptyList())
        assertEquals(setOf("a", "c"), out)
    }

    @Test
    fun `POI cancellato e ricreato nello stesso sync resta presente`() {
        // Ordine contrattuale: prima le tombstone, poi gli upsert
        val out = DeltaSyncLogic.applyDelta(setOf("a"), listOf("a"), listOf("a"))
        assertEquals(setOf("a"), out)
    }

    @Test
    fun `tombstone di un POI mai scaricato e innocua`() {
        val out = DeltaSyncLogic.applyDelta(setOf("a"), listOf("z"), emptyList())
        assertEquals(setOf("a"), out)
    }

    @Test
    fun `il sync stamp usa il generatedAt del server quando presente`() {
        assertEquals("2026-08-06T10:00:00Z", DeltaSyncLogic.nextSyncStamp("2026-08-06T10:00:00Z", "2026-08-01T00:00:00Z"))
    }

    @Test
    fun `senza pagine dal server si conserva il timestamp precedente`() {
        assertEquals("2026-08-01T00:00:00Z", DeltaSyncLogic.nextSyncStamp(null, "2026-08-01T00:00:00Z"))
        assertNull(DeltaSyncLogic.nextSyncStamp(null, null))
    }
}
