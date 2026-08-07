package com.itaintasca.app.car

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.location.Location
import android.os.IBinder
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.itaintasca.app.WipBackgroundAudioService
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.geofence.GeofenceBroadcastReceiver
import com.itaintasca.app.service.RadarState
import kotlinx.coroutines.launch

/**
 * Schermata "Magic Walk" per Android Auto: radar dei POI vicini con distanza
 * live, POI più vicino in evidenza e controlli Play/Pausa dell'audioguida.
 *
 * Lo stato arriva da RadarState (scritto dal Foreground Service, stesso
 * processo); l'audio è controllato via bind locale a WipBackgroundAudioService.
 * La schermata non fa MAI partire il tracking da sola: se il servizio è spento
 * mostra solo l'invito ad avviare la Magic Walk dal telefono.
 */
class WipRadarScreen(carContext: CarContext) : Screen(carContext) {

    private var audioService: WipBackgroundAudioService? = null
    private var audioBound = false

    private val audioConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            audioService = (binder as WipBackgroundAudioService.LocalBinder).service
            invalidate()
        }

        override fun onServiceDisconnected(name: ComponentName) {
            audioService = null
        }
    }

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) {
                try {
                    audioBound = carContext.bindService(
                        Intent(carContext, WipBackgroundAudioService::class.java),
                        audioConnection,
                        Context.BIND_AUTO_CREATE
                    )
                } catch (_: Exception) { }

                // Ogni cambiamento del radar (nuova posizione, nuovi POI dopo un
                // refresh in movimento, stop del servizio) ridisegna il template.
                owner.lifecycleScope.launch {
                    RadarState.snapshot.collect { invalidate() }
                }
            }

            override fun onDestroy(owner: LifecycleOwner) {
                if (audioBound) {
                    try { carContext.unbindService(audioConnection) } catch (_: Exception) { }
                    audioBound = false
                }
                audioService = null
            }
        })
    }

    override fun onGetTemplate(): Template {
        val snapshot = RadarState.snapshot.value

        if (!snapshot.serviceActive) {
            return ListTemplate.Builder()
                .setTitle("WIP — Magic Walk")
                .setHeaderAction(Action.APP_ICON)
                .setSingleList(
                    ItemList.Builder()
                        .setNoItemsMessage("Avvia la Magic Walk dal telefono per vedere il radar qui.")
                        .build()
                )
                .build()
        }

        val location = snapshot.lastLocation
        val sorted = snapshot.pois
            .map { it to distanceTo(it, location) }
            .sortedBy { it.second ?: Float.MAX_VALUE }

        val maxRows = try {
            carContext.getCarService(ConstraintManager::class.java)
                .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST)
        } catch (_: Exception) { 6 }

        val listBuilder = ItemList.Builder()
        if (sorted.isEmpty()) {
            listBuilder.setNoItemsMessage(
                if (snapshot.statusText.isNotBlank()) snapshot.statusText
                else "Nessun POI nelle vicinanze. Il radar si aggiorna mentre guidi."
            )
        } else {
            sorted.take(maxRows).forEach { (poi, dist) ->
                listBuilder.addItem(buildPoiRow(poi, dist))
            }
        }

        val closest = sorted.firstOrNull()
        val title = when {
            closest?.second != null -> "Radar — ${closest.first.nome} a ${formatDistance(closest.second!!)}"
            else -> "WIP — Magic Walk"
        }

        return ListTemplate.Builder()
            .setTitle(title)
            .setHeaderAction(Action.APP_ICON)
            .setSingleList(listBuilder.build())
            .setActionStrip(buildAudioActionStrip())
            .build()
    }

    private fun buildPoiRow(poi: PoiEntity, dist: Float?): Row {
        val prefix = when {
            poi.isFromItinerary -> "📍 "
            poi.isGem -> "💎 "
            else -> ""
        }
        val secondLine = buildString {
            if (dist != null) append(formatDistance(dist))
            poi.poiType?.takeIf { it.isNotBlank() }?.let {
                if (isNotEmpty()) append(" · ")
                append(it.replaceFirstChar { c -> c.uppercase() })
            }
        }
        return Row.Builder()
            .setTitle("$prefix${poi.nome}")
            .addText(if (secondLine.isNotBlank()) secondLine else "—")
            .build()
    }

    /**
     * Play/Pausa: se sta parlando il teaser nativo (TTS) lo fermiamo; altrimenti
     * mettiamo in pausa/riprendiamo l'audioguida ExoPlayer. Un solo pulsante,
     * comportamento coerente con "voglio silenzio adesso / riprendi".
     */
    private fun buildAudioActionStrip(): ActionStrip {
        val svc = audioService
        val teaserSpeaking = carContext
            .getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .getBoolean(GeofenceBroadcastReceiver.PREF_TEASER_SPEAKING, false)
        val playing = teaserSpeaking || (svc?.isPlaying == true)

        val toggle = Action.Builder()
            .setTitle(if (playing) "⏸ Pausa" else "▶ Play")
            .setOnClickListener {
                when {
                    teaserSpeaking -> {
                        GeofenceBroadcastReceiver.stopSpeaking(carContext)
                        CarToast.makeText(carContext, "Voce fermata", CarToast.LENGTH_SHORT).show()
                    }
                    svc == null || !svc.hasMedia() ->
                        CarToast.makeText(carContext, "Nessuna audioguida in corso", CarToast.LENGTH_SHORT).show()
                    svc.isPlaying -> svc.pause()
                    else -> svc.resume()
                }
                invalidate()
            }
            .build()

        return ActionStrip.Builder().addAction(toggle).build()
    }

    private fun distanceTo(poi: PoiEntity, location: Location?): Float? {
        if (location == null) return null
        val poiLoc = Location("").apply {
            latitude = poi.entranceLat ?: poi.lat
            longitude = poi.entranceLon ?: poi.lon
        }
        return location.distanceTo(poiLoc)
    }

    private fun formatDistance(meters: Float): String {
        return if (meters >= 1000f) String.format("%.1f km", meters / 1000f)
        else "${(Math.round(meters / 10f) * 10)} m"
    }
}
