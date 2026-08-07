package com.itaintasca.app.geofence

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.itaintasca.app.db.PoiEntity

class GeofenceManager(private val context: Context) {
    private val geofencingClient = LocationServices.getGeofencingClient(context)
    private val TAG = "GeofenceManager"

    // Sliding window incrementale: id dei POI attualmente registrati + firma
    // della configurazione (modalità/raggi). Vive in memoria: se il processo
    // muore, i geofence restano nell'OS ma il set torna vuoto → il primo
    // register successivo fa un full re-register (remove-by-PendingIntent).
    private val registeredPoiIds = mutableSetOf<String>()
    private var registrationSignature: String? = null
    private var sentinelCenter: Location? = null

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        // Per Android 12+ (S), FLAG_MUTABLE è necessario per Geofencing
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    @SuppressLint("MissingPermission")
    fun registerGeofencesForPois(
        pois: List<PoiEntity>,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float,
        origin: Location? = null,
        initialTrigger: Boolean = false
    ) {
        if (pois.isEmpty()) return

        // Ordina: Gemme prima, poi per distanza REALE dall'utente (logica pura
        // in SlidingWindowLogic, condivisa col percorso offline e coi test).
        // 33 POI × 3 geofence = 99 + 1 sentinella = 100, il cap Android.
        val byId = pois.associateBy { it.id }
        val windowInput = pois.map { poi ->
            SlidingWindowLogic.WindowPoi(
                id = poi.id,
                isGem = poi.isGem,
                distanceM = if (origin == null) 0f else {
                    val loc = Location("").apply {
                        latitude = poi.entranceLat ?: poi.lat
                        longitude = poi.entranceLon ?: poi.lon
                    }
                    origin.distanceTo(loc)
                }
            )
        }
        val targetIds = SlidingWindowLogic.selectWindow(windowInput)
        val sortedPois = targetIds.mapNotNull { byId[it] }

        val signature = "$guideMode|$alertRadiusWalk|$arrivalRadiusWalk|$alertRadiusCar|$arrivalRadiusCar"

        // Full re-register quando: prima registrazione del processo, cambio
        // raggi/modalità (i raggi dei geofence esistenti sarebbero sbagliati),
        // o richiesta di initial trigger.
        val needsFullRegister = initialTrigger ||
            registeredPoiIds.isEmpty() ||
            signature != registrationSignature

        if (needsFullRegister) {
            fullRegister(sortedPois, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar, origin, initialTrigger, signature)
            return
        }

        // Diff incrementale: niente finestra cieca sui geofence in comune.
        val diff = SlidingWindowLogic.computeDiff(registeredPoiIds, targetIds)
        val sentinelMoved = origin != null && sentinelCenter?.let { it.distanceTo(origin) > 1000f } ?: true

        if (diff.isEmpty && !sentinelMoved) return

        val removeIds = mutableListOf<String>()
        diff.toRemoveIds.forEach { removeIds.addAll(SlidingWindowLogic.requestIdsFor(it)) }
        if (sentinelMoved) removeIds.add(SlidingWindowLogic.SENTINEL_ID)

        val addList = mutableListOf<Geofence>()
        diff.toAddIds.mapNotNull { byId[it] }.forEach {
            addList.addAll(buildGeofencesForPoi(it, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar))
        }
        if (sentinelMoved && origin != null) {
            addList.add(buildSentinel(origin))
            sentinelCenter = Location(origin)
        }

        registeredPoiIds.removeAll(diff.toRemoveIds.toSet())
        registeredPoiIds.addAll(diff.toAddIds)

        val doAdd = {
            if (addList.isNotEmpty()) {
                val request = GeofencingRequest.Builder().apply {
                    setInitialTrigger(0)
                    addGeofences(addList)
                }.build()
                geofencingClient.addGeofences(request, geofencePendingIntent).run {
                    addOnSuccessListener {
                        Log.d(TAG, "Incremental window: +${diff.toAddIds.size} -${diff.toRemoveIds.size} POIs (now ${registeredPoiIds.size})")
                    }
                    addOnFailureListener {
                        // Se l'add fallisce lo stato in memoria non è più affidabile:
                        // forza un full re-register al prossimo giro.
                        Log.e(TAG, "Incremental add failed: ${it.message}")
                        registeredPoiIds.clear()
                    }
                }
            }
        }
        if (removeIds.isNotEmpty()) {
            geofencingClient.removeGeofences(removeIds).addOnCompleteListener { doAdd() }
        } else {
            doAdd()
        }
    }

    @SuppressLint("MissingPermission")
    private fun fullRegister(
        sortedPois: List<PoiEntity>,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float,
        origin: Location?,
        initialTrigger: Boolean,
        signature: String
    ) {
        val geofenceList = mutableListOf<Geofence>()
        for (poi in sortedPois) {
            geofenceList.addAll(buildGeofencesForPoi(poi, guideMode, alertRadiusWalk, arrivalRadiusWalk, alertRadiusCar, arrivalRadiusCar))
        }
        // Sentinella di area: EXIT dal raggio della finestra → il receiver
        // rilancia il servizio che ri-registra la window dal DB (rete o pacchetto
        // offline). Copre il caso di update GPS strozzati in Doze profondo.
        if (origin != null) {
            geofenceList.add(buildSentinel(origin))
            sentinelCenter = Location(origin)
        }

        val request = GeofencingRequest.Builder().apply {
            // INITIAL_TRIGGER_ENTER solo alla PRIMA registrazione dopo l'avvio:
            // chi attiva il tour già davanti al monumento riceve subito il teaser
            // (prima: silenzio totale finché non usciva e rientrava dal raggio).
            // Sui refresh successivi resta disattivato per evitare allarmi a
            // raffica; il dedup su Room filtra comunque i doppioni.
            setInitialTrigger(if (initialTrigger) GeofencingRequest.INITIAL_TRIGGER_ENTER else 0)
            addGeofences(geofenceList)
        }.build()

        // Remove e add sono asincroni sullo stesso PendingIntent: concatenarli
        // evita la race in cui l'add veniva processato prima del remove.
        geofencingClient.removeGeofences(geofencePendingIntent).addOnCompleteListener {
            geofencingClient.addGeofences(request, geofencePendingIntent).run {
                addOnSuccessListener {
                    registeredPoiIds.clear()
                    registeredPoiIds.addAll(sortedPois.map { p -> p.id })
                    registrationSignature = signature
                    Log.d(TAG, "Geofences registered for ${sortedPois.size} POIs (${sortedPois.count { p -> p.isGem }} gems, initialTrigger=$initialTrigger)")
                }
                addOnFailureListener {
                    registeredPoiIds.clear()
                    registrationSignature = null
                    Log.e(TAG, "Failed to register geofences: ${it.message}")
                }
            }
        }
    }

    private fun buildGeofencesForPoi(
        poi: PoiEntity,
        guideMode: String,
        alertRadiusWalk: Float, arrivalRadiusWalk: Float,
        alertRadiusCar: Float, arrivalRadiusCar: Float
    ): List<Geofence> {
        val lat = poi.entranceLat ?: poi.lat
        val lon = poi.entranceLon ?: poi.lon

        val alertRadius = if (guideMode == "driving") alertRadiusCar else alertRadiusWalk
        val arrivalRadius = if (guideMode == "driving") arrivalRadiusCar else arrivalRadiusWalk
        // Raggio isteresi (uscita silenziosa): 1.5× il raggio di alert
        val exitRadius = alertRadius * 1.5f

        return listOf(
            // Approach Geofence (ENTER only)
            Geofence.Builder()
                .setRequestId("${poi.id}_approach")
                .setCircularRegion(lat, lon, alertRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build(),
            // Arrival Geofence (ENTER only)
            Geofence.Builder()
                .setRequestId("${poi.id}_arrival")
                .setCircularRegion(lat, lon, arrivalRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build(),
            // Exit Geofence — per il reset dello stato (isteresi)
            Geofence.Builder()
                .setRequestId("${poi.id}_exit")
                .setCircularRegion(lat, lon, exitRadius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
                .build()
        )
    }

    private fun buildSentinel(origin: Location): Geofence =
        Geofence.Builder()
            .setRequestId(SlidingWindowLogic.SENTINEL_ID)
            .setCircularRegion(origin.latitude, origin.longitude, SlidingWindowLogic.SENTINEL_RADIUS_M)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
            .build()

    fun removeAllGeofences() {
        registeredPoiIds.clear()
        registrationSignature = null
        sentinelCenter = null
        geofencingClient.removeGeofences(geofencePendingIntent).run {
            addOnSuccessListener {
                Log.d(TAG, "All geofences removed")
            }
            addOnFailureListener {
                Log.e(TAG, "Failed to remove geofences: ${it.message}")
            }
        }
    }
}
