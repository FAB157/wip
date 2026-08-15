package com.itaintasca.app.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * 🐕 Watchdog: Si assicura che il servizio ItaintaBackgroundPoiService rimanga attivo.
 * Se il sistema lo killa per risparmio energetico, l'AlarmManager lo riavvia.
 *
 * Usa una catena di allarmi ESATTI "allow while idle": setInexactRepeating veniva
 * differito indefinitamente in Doze, quindi il servizio killato di notte non
 * ripartiva mai. Ogni scatto ri-programma il successivo; se l'utente ha fermato
 * l'audioguida la catena si spegne da sola.
 */
class ServiceWatchdog : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val isServiceActive = prefs.getBoolean("isServiceActive", false)

        if (isServiceActive) {
            // Heartbeat vero: ItaintaBackgroundPoiService scrive questo
            // timestamp a ogni fix GPS processato (anche in IDLE, ogni ~20s,
            // batching a piedi fino a 60s). Prima si riavviava ciecamente ogni
            // 15 min solo perché il flag "isServiceActive" era true — churn
            // (remove+add dei location callback) anche a servizio sano.
            // Ora si riavvia SOLO se l'heartbeat è assente o troppo vecchio.
            val lastHeartbeat = prefs.getLong(ItaintaBackgroundPoiService.PREF_LAST_HEARTBEAT, 0L)
            val gapMs = System.currentTimeMillis() - lastHeartbeat
            val heartbeatOk = lastHeartbeat > 0L && gapMs < HEARTBEAT_STALE_MS
            if (heartbeatOk) {
                Log.d(TAG, "🐕 Heartbeat recente (${gapMs / 1000}s fa), servizio sano: nessun riavvio.")
            } else {
                val ageDesc = if (lastHeartbeat == 0L) "mai ricevuto" else "${gapMs / 1000}s fa"
                Log.d(TAG, "🐕 Heartbeat assente/stantio ($ageDesc), riavvio il servizio...")
                try {
                    val serviceIntent = Intent(context, ItaintaBackgroundPoiService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                } catch (e: Exception) {
                    // ForegroundServiceStartNotAllowedException se manca l'esenzione
                    // batteria: non deve far crashare il receiver.
                    Log.w(TAG, "Watchdog restart blocked: ${e.message}")
                }
            }
            schedule(context) // ri-arma la catena comunque, sano o no
        } else {
            Log.d(TAG, "🐕 Servizio non attivo, catena watchdog terminata.")
        }
    }

    companion object {
        private const val TAG = "ServiceWatchdog"
        private const val INTERVAL_MS = 15 * 60 * 1000L

        // Retry ravvicinato dopo un rifiuto di startForeground (Android 12+:
        // ForegroundServiceStartNotAllowedException quando il servizio viene
        // avviato da background — boot, sentinella exit geofence, ecc.). Non
        // ha senso aspettare i 15 min della catena normale: la restrizione
        // spesso si risolve appena l'utente riapre l'app o poco dopo.
        private const val RETRY_DELAY_MS = 30 * 1000L

        // Soglia di "heartbeat stantio": in IDLE il batching arriva a 60s a
        // piedi (20s in auto); 2x + margine per deferimenti Doze ≈ 3 min. Un
        // servizio sano scrive l'heartbeat molto più spesso di così.
        private const val HEARTBEAT_STALE_MS = 3 * 60 * 1000L

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, ServiceWatchdog::class.java)
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun schedule(context: Context) = scheduleAt(context, INTERVAL_MS)

        /**
         * Retry ravvicinato dopo un fallimento di startForeground. Stessa
         * PendingIntent del watchdog periodico (FLAG_UPDATE_CURRENT sovrascrive
         * l'allarme già armato, niente doppie catene), solo con un ritardo
         * molto più corto della catena normale.
         */
        fun scheduleRetry(context: Context) = scheduleAt(context, RETRY_DELAY_MS)

        private fun scheduleAt(context: Context, delayMs: Long) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = pendingIntent(context)
            val triggerAt = System.currentTimeMillis() + delayMs

            val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                alarmManager.canScheduleExactAlarms()

            try {
                if (canExact) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                }
                Log.d(TAG, "🐕 Watchdog armato tra ${delayMs / 1000}s (exact=$canExact).")
            } catch (e: Exception) {
                Log.w(TAG, "Watchdog scheduling failed: ${e.message}")
            }
        }

        fun cancel(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                alarmManager.cancel(pendingIntent(context))
                Log.d(TAG, "🐕 Watchdog cancellato.")
            } catch (e: Exception) {
                Log.w(TAG, "Watchdog cancel failed: ${e.message}")
            }
        }
    }
}
