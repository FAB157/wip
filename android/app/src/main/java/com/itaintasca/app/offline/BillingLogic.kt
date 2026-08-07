package com.itaintasca.app.offline

/**
 * Logica pura del billing offline, testabile su JVM.
 *
 * Modello freemium: mappe e teaser gratuiti per tutti; l'audioguida completa
 * si paga per-listen (crediti) oppure è coperta dal Day Pass (24h, cap guide).
 * Offline i crediti non sono verificabili sul server: si usa lo snapshot del
 * saldo (salvato in prefs quando la rete c'era) meno la spesa già annotata nel
 * registro locale, riconciliata al ritorno online. Compromesso accettato:
 * su più dispositivi offline lo stesso credito può essere speso due volte.
 */
object BillingLogic {

    const val DEFAULT_GUIDE_COST = 15
    const val DAY_PASS_CAP = 40
    const val DAY_PASS_DURATION_MS = 24 * 60 * 60 * 1000L

    /** Il pass copre l'ascolto se non è scaduto e non ha esaurito il cap. */
    fun isPassActive(nowMs: Long, expiresAtMs: Long, guidesUsed: Int, cap: Int): Boolean =
        expiresAtMs > nowMs && cap > 0 && guidesUsed < cap

    /** Per-listen offline: si può spendere solo dentro lo snapshot del saldo. */
    fun canSpend(snapshotCredits: Int, pendingSpendCredits: Int, cost: Int): Boolean =
        snapshotCredits - pendingSpendCredits >= cost

    /** Crediti residui spendibili offline (mai negativi, per la UI). */
    fun remainingOffline(snapshotCredits: Int, pendingSpendCredits: Int): Int =
        (snapshotCredits - pendingSpendCredits).coerceAtLeast(0)
}
