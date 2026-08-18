package com.itaintasca.app.geofence

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * Fusione GPS + movimento (versione leggera): registra le transizioni
 * dell'Activity Recognition API di Play Services (STILL / WALKING / ON_FOOT /
 * IN_VEHICLE) e persiste lo stato corrente in "ItaintaPrefs", così è leggibile
 * sia dal servizio che dal GeofenceBroadcastReceiver anche a processo freddo.
 *
 * Usi:
 *  1. GATE ANTI-TELETRASPORTO: se l'utente è STILL da >5 min e la posizione
 *     salta di colpo >100 m, il fix è quasi certamente un teletrasporto GPS
 *     (canyon urbano, indoor) → il servizio lo logga e lo ignora
 *     (ItaintaBackgroundPoiService.isGpsTeleport).
 *  2. CORROBORAZIONE piedi⇄auto: maybeSwitchTravelMode usa lo stato per
 *     abbreviare (sensori d'accordo) o allungare (sensori in disaccordo)
 *     l'isteresi del cambio modalità basato sulla velocità GPS.
 *
 * TUTTO FAIL-SAFE: senza permesso ACTIVITY_RECOGNITION o senza Play Services
 * lo stato resta UNKNOWN (-1) e ogni consumer degrada al comportamento
 * identico a prima (nessun gate, isteresi standard).
 */
object ActivityMonitor {
    private const val TAG = "ActivityMonitor"

    /** Stato attività persistito: tipo DetectedActivity.* e timestamp d'inizio. */
    const val PREF_ACTIVITY_TYPE = "currentActivityType"
    const val PREF_ACTIVITY_SINCE = "currentActivitySince"

    /** Valore sentinella: nessun dato attività (permesso negato / mai partito). */
    const val TYPE_UNKNOWN = -1

    private const val REQUEST_CODE = 7101

    /** Su API < 29 il permesso runtime non esiste (c'è solo quello GMS install-time). */
    fun hasPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context.applicationContext, ActivityTransitionReceiver::class.java)
        // FLAG_MUTABLE: Play Services deve poter riempire l'intent col risultato
        // delle transizioni (con IMMUTABLE il receiver non riceve mai dati).
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getBroadcast(context.applicationContext, REQUEST_CODE, intent, flags)
    }

    /** Registrazione idempotente delle transition (best-effort, mai bloccante). */
    fun start(context: Context) {
        if (!hasPermission(context)) {
            Log.d(TAG, "ACTIVITY_RECOGNITION non concesso: gating sensori disattivato")
            return
        }
        try {
            val transitions = listOf(
                DetectedActivity.STILL,
                DetectedActivity.WALKING,
                DetectedActivity.ON_FOOT,
                DetectedActivity.IN_VEHICLE
            ).map { type ->
                ActivityTransition.Builder()
                    .setActivityType(type)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                    .build()
            }
            ActivityRecognition.getClient(context.applicationContext)
                .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pendingIntent(context))
                .addOnSuccessListener { Log.d(TAG, "Transition updates registrate (STILL/WALKING/ON_FOOT/IN_VEHICLE)") }
                .addOnFailureListener { Log.w(TAG, "Transition updates rifiutate: ${it.message}") }
        } catch (e: Exception) {
            // Play Services assenti/vecchi: si degrada in silenzio.
            Log.w(TAG, "Activity Recognition non disponibile: ${e.message}")
        }
    }

    fun stop(context: Context) {
        try {
            ActivityRecognition.getClient(context.applicationContext)
                .removeActivityTransitionUpdates(pendingIntent(context))
        } catch (e: Exception) {
            Log.w(TAG, "stop fallito: ${e.message}")
        }
        // Lo stato salvato si azzera: a servizio fermo non deve influenzare
        // un futuro riavvio con dati stantii.
        try {
            context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE).edit {
                putInt(PREF_ACTIVITY_TYPE, TYPE_UNKNOWN)
                putLong(PREF_ACTIVITY_SINCE, 0L)
            }
        } catch (_: Exception) { }
    }

    /** Tipo attività corrente (DetectedActivity.*) o TYPE_UNKNOWN. */
    fun currentType(context: Context): Int =
        try {
            context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                .getInt(PREF_ACTIVITY_TYPE, TYPE_UNKNOWN)
        } catch (_: Exception) {
            TYPE_UNKNOWN
        }

    /** Da quanti ms l'utente è fermo (STILL); 0 se non è fermo o non si sa. */
    fun stillForMs(context: Context): Long {
        return try {
            val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            if (prefs.getInt(PREF_ACTIVITY_TYPE, TYPE_UNKNOWN) != DetectedActivity.STILL) return 0L
            val since = prefs.getLong(PREF_ACTIVITY_SINCE, 0L)
            if (since <= 0L) 0L else (System.currentTimeMillis() - since).coerceAtLeast(0L)
        } catch (_: Exception) {
            0L
        }
    }

    internal fun record(context: Context, type: Int) {
        try {
            context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE).edit {
                putInt(PREF_ACTIVITY_TYPE, type)
                putLong(PREF_ACTIVITY_SINCE, System.currentTimeMillis())
            }
            Log.d(TAG, "Attività corrente → ${typeName(type)}")
        } catch (_: Exception) { }
    }

    private fun typeName(type: Int): String = when (type) {
        DetectedActivity.STILL -> "STILL"
        DetectedActivity.WALKING -> "WALKING"
        DetectedActivity.ON_FOOT -> "ON_FOOT"
        DetectedActivity.IN_VEHICLE -> "IN_VEHICLE"
        else -> "UNKNOWN($type)"
    }
}

/**
 * Receiver delle transizioni Activity Recognition (consegnate da Play Services
 * via PendingIntent). Registrato nel manifest, exported=false. Aggiorna solo
 * le prefs: nessun lavoro pesante, nessun goAsync necessario.
 */
class ActivityTransitionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        try {
            if (!ActivityTransitionResult.hasResult(intent)) return
            val result = ActivityTransitionResult.extractResult(intent) ?: return
            // Interessa solo l'ultimo ENTER: è lo stato attuale.
            val last = result.transitionEvents.lastOrNull {
                it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
            } ?: return
            ActivityMonitor.record(context, last.activityType)
        } catch (e: Exception) {
            Log.w("ActivityMonitor", "Transizione non processata: ${e.message}")
        }
    }
}
