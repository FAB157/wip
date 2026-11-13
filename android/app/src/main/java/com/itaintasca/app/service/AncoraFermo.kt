package com.itaintasca.app.service

import android.location.Location

/**
 * (23/09/2026, REVISIONE 3 — batteria) «Fermo qui da almeno N secondi, entro
 * R metri»: l'unica misura con cui il servizio decide di abbassare il ritmo
 * del GPS da fermo (R-FERMO col percorso attivo, R-SOSTA a luoghi gia'
 * raccontati — docs/nav-nativo-spec.md, REVISIONE 3).
 *
 * L'ANCORA e' il primo fix della sosta. Ogni fix successivo entro `raggioM`
 * dall'ancora allunga la sosta; il PRIMO fix oltre `raggioM` (o una
 * ripartenza dichiarata dal chiamante: velocita', Activity Recognition) mette
 * l'ancora li' e la sosta riparte da zero. Quindi si esce SUBITO al primo
 * movimento e si rientra solo dopo altri `durataMs` da fermi.
 *
 * Il tempo e' quello del FIX (elapsedRealtime del fix, monotono), non quello
 * di consegna: un fix arrivato in un lotto conta per quando e' stato preso.
 * Nessuno stato persistito: a servizio ricreato la sosta si rimisura da capo
 * (cioe' si parte dal ritmo pieno, il lato sicuro).
 */
internal class AncoraFermo(private val raggioM: Float, private val durataMs: Long) {
    private var lat = Double.NaN
    private var lon = Double.NaN
    private var daMs = 0L
    private val buf = FloatArray(1)

    /**
     * Registra un fix. Ritorna true se si e' entro `raggioM` dall'ancora da
     * almeno `durataMs`. `riparti` = movimento certo: nuova ancora qui.
     */
    fun aggiorna(fixLat: Double, fixLon: Double, oraMs: Long, riparti: Boolean = false): Boolean {
        if (lat.isNaN() || riparti) {
            ancora(fixLat, fixLon, oraMs)
            return false
        }
        Location.distanceBetween(lat, lon, fixLat, fixLon, buf)
        if (buf[0] > raggioM) {
            ancora(fixLat, fixLon, oraMs)
            return false
        }
        return oraMs - daMs >= durataMs
    }

    /** Dimentica l'ancora: il prossimo fix ne mette una nuova. */
    fun azzera() {
        lat = Double.NaN
        lon = Double.NaN
        daMs = 0L
    }

    private fun ancora(fixLat: Double, fixLon: Double, oraMs: Long) {
        lat = fixLat
        lon = fixLon
        daMs = oraMs
    }
}
