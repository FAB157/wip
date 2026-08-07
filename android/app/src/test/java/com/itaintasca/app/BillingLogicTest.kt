package com.itaintasca.app

import com.itaintasca.app.offline.BillingLogic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BillingLogicTest {

    private val now = 1_000_000L
    private val in24h = now + BillingLogic.DAY_PASS_DURATION_MS

    // --- Day Pass ---

    @Test
    fun `pass valido entro scadenza e cap`() {
        assertTrue(BillingLogic.isPassActive(now, in24h, 0, 40))
        assertTrue(BillingLogic.isPassActive(now, in24h, 39, 40))
    }

    @Test
    fun `pass scaduto non copre`() {
        assertFalse(BillingLogic.isPassActive(now, now - 1, 0, 40))
        assertFalse(BillingLogic.isPassActive(now, now, 0, 40))
    }

    @Test
    fun `cap esaurito non copre`() {
        assertFalse(BillingLogic.isPassActive(now, in24h, 40, 40))
        assertFalse(BillingLogic.isPassActive(now, in24h, 41, 40))
    }

    @Test
    fun `pass mai attivato (prefs a zero) non copre`() {
        assertFalse(BillingLogic.isPassActive(now, 0L, 0, 0))
    }

    // --- Per-listen offline ---

    @Test
    fun `si puo spendere entro lo snapshot`() {
        assertTrue(BillingLogic.canSpend(100, 0, 15))
        assertTrue(BillingLogic.canSpend(100, 85, 15))
    }

    @Test
    fun `oltre lo snapshot niente ascolto`() {
        assertFalse(BillingLogic.canSpend(100, 86, 15))
        assertFalse(BillingLogic.canSpend(0, 0, 15))
        assertFalse(BillingLogic.canSpend(14, 0, 15))
    }

    @Test
    fun `residuo offline mai negativo`() {
        assertEquals(85, BillingLogic.remainingOffline(100, 15))
        assertEquals(0, BillingLogic.remainingOffline(100, 100))
        assertEquals(0, BillingLogic.remainingOffline(100, 120))
    }

    @Test
    fun `costanti coerenti col listino JS`() {
        // audio_guide=15 e day_pass cap=40 in src/lib/pricing.ts
        assertEquals(15, BillingLogic.DEFAULT_GUIDE_COST)
        assertEquals(40, BillingLogic.DAY_PASS_CAP)
    }
}
