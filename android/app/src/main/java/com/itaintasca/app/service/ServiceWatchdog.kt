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
            Log.d(TAG, "🐕 Il servizio dovrebbe essere attivo. Verifico...")
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
            schedule(context) // ri-arma la catena
        } else {
            Log.d(TAG, "🐕 Servizio non attivo, catena watchdog terminata.")
        }
    }

    companion object {
        private const val TAG = "ServiceWatchdog"
        private const val INTERVAL_MS = 15 * 60 * 1000L

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, ServiceWatchdog::class.java)
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun schedule(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = pendingIntent(context)
            val triggerAt = System.currentTimeMillis() + INTERVAL_MS

            val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                alarmManager.canScheduleExactAlarms()

            try {
                if (canExact) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                }
                Log.d(TAG, "🐕 Watchdog armato tra 15 min (exact=$canExact).")
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
