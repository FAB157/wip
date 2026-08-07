package com.itaintasca.app.service

import android.location.Location
import com.itaintasca.app.db.PoiEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Stato in-memory del radar POI, scritto da ItaintaBackgroundPoiService e
 * osservato dall'interfaccia Android Auto (WipRadarScreen).
 *
 * Vive nello stesso processo del servizio: nessuna serializzazione, nessun IPC.
 * Se il processo muore lo stato riparte vuoto — va bene, perché anche il
 * servizio ripartirà e lo ripopolerà al primo fix GPS.
 */
object RadarState {

    data class Snapshot(
        val serviceActive: Boolean = false,
        val pois: List<PoiEntity> = emptyList(),
        val lastLocation: Location? = null,
        val statusText: String = ""
    )

    private val _snapshot = MutableStateFlow(Snapshot())
    val snapshot: StateFlow<Snapshot> = _snapshot.asStateFlow()

    fun setActive(active: Boolean) {
        _snapshot.value = if (active) _snapshot.value.copy(serviceActive = true) else Snapshot()
    }

    fun updatePois(pois: List<PoiEntity>) {
        _snapshot.value = _snapshot.value.copy(pois = pois)
    }

    fun updateLocation(location: Location) {
        _snapshot.value = _snapshot.value.copy(lastLocation = location)
    }

    fun updateStatus(text: String) {
        _snapshot.value = _snapshot.value.copy(statusText = text)
    }
}