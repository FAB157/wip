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

        // (22/08/2026) Allarme di RETRY (catena separata, vedi scheduleRetry):
        // si tenta il riavvio e basta. Il prossimo tentativo, se serve, lo
        // pianifica il servizio stesso quando startForeground fallisce di
        // nuovo; la catena dei 15 min non viene toccata.
        if (intent.getBooleanExtra(EXTRA_RETRY, false)) {
            if (!isServiceActive) {
                Log.d(TAG, "🐕 Retry: servizio non attivo, fine.")
                return
            }
            Log.d(TAG, "🐕 Retry startForeground (tentativo ${prefs.getInt(PREF_RETRY_ATTEMPTS, 0)}).")
            try {
                val serviceIntent = Intent(context, ItaintaBackgroundPoiService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } catch (e: Exception) {
                // Rifiuto sincrono (Android 12+): si riprova col backoff.
                Log.w(TAG, "Watchdog retry blocked: ${e.message}")
                scheduleRetry(context)
            }
            return
        }

        if (isServiceActive) {
            // Heartbeat vero: ItaintaBackgroundPoiService scrive questo
            // timestamp a ogni fix GPS processato (anche in IDLE, ogni ~20s,
            // batching a piedi fino a 60s). Prima si riavviava ciecamente ogni
            // 15 min solo perché il flag "isServiceActive" era true — churn
            // (remove+add dei location callback) anche a servizio sano.
            // Ora si riavvia SOLO se l'heartbeat è assente o troppo vecchio.
            // Dal 23/08/2026 l'heartbeat sta in un file di preferenze DEDICATO
            // (PREFS_FIX): scritto a ogni fix, non deve trascinarsi dietro la
            // riscrittura di tutto ItaintaPrefs. Ripiego sul file vecchio per il
            // primo avvio dopo l'aggiornamento: senza, il watchdog leggerebbe 0
            // e riavvierebbe un servizio perfettamente sano.
            val prefsFix = context.getSharedPreferences(
                ItaintaBackgroundPoiService.PREFS_FIX, Context.MODE_PRIVATE
            )
            val lastHeartbeat = prefsFix.getLong(ItaintaBackgroundPoiService.PREF_LAST_HEARTBEAT, 0L)
                .takeIf { it > 0L }
                ?: prefs.getLong(ItaintaBackgroundPoiService.PREF_LAST_HEARTBEAT, 0L)
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

        // Retry dopo un rifiuto di startForeground (Android 12+:
        // ForegroundServiceStartNotAllowedException quando il servizio viene
        // avviato da background — boot, sentinella exit geofence, ecc.).
        // (22/08/2026) BACKOFF ESPONENZIALE invece di un retry fisso a 30 s:
        // 30 s, 1, 2, 5, 15 min, e dopo 6 tentativi ci si ferma (resta la
        // catena normale dei 15 min). Prima scheduleRetry usava la STESSA
        // PendingIntent del watchdog periodico (requestCode 0 +
        // FLAG_UPDATE_CURRENT), quindi ogni retry SOVRASCRIVEVA l'allarme dei
        // 15 min: se anche il retry falliva, la catena era morta. Ora il retry
        // ha il suo requestCode (1) e un extra che lo distingue.
        private val RETRY_BACKOFF_MS = longArrayOf(
            30 * 1000L,
            1 * 60 * 1000L,
            2 * 60 * 1000L,
            5 * 60 * 1000L,
            15 * 60 * 1000L
        )
        private const val MAX_RETRY_ATTEMPTS = 6
        private const val PREF_RETRY_ATTEMPTS = "fgsRetryAttempts"
        private const val EXTRA_RETRY = "wip_fgs_retry"
        private const val REQUEST_CODE_CHAIN = 0
        private const val REQUEST_CODE_RETRY = 1

        // Soglia di "heartbeat stantio": in IDLE il batching arriva a 60s a
        // piedi (20s in auto); 2x + margine per deferimenti Doze ≈ 3 min. Un
        // servizio sano scrive l'heartbeat molto più spesso di così.
        private const val HEARTBEAT_STALE_MS = 3 * 60 * 1000L

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, ServiceWatchdog::class.java)
            return PendingIntent.getBroadcast(
                context,
                REQUEST_CODE_CHAIN,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun retryPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, ServiceWatchdog::class.java).putExtra(EXTRA_RETRY, true)
            return PendingIntent.getBroadcast(
                context,
                REQUEST_CODE_RETRY,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun schedule(context: Context) = scheduleAt(context, INTERVAL_MS, pendingIntent(context))

        /**
         * Retry dopo un fallimento di startForeground, con backoff
         * esponenziale e tetto di MAX_RETRY_ATTEMPTS. Catena SEPARATA da
         * quella dei 15 min (requestCode diverso): non la sovrascrive mai.
         */
        fun scheduleRetry(context: Context) {
            val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            val attempts = prefs.getInt(PREF_RETRY_ATTEMPTS, 0)
            if (attempts >= MAX_RETRY_ATTEMPTS) {
                Log.w(TAG, "🐕 Retry startForeground: raggiunti $MAX_RETRY_ATTEMPTS tentativi, mi fermo (resta la catena dei 15 min).")
                return
            }
            val delayMs = RETRY_BACKOFF_MS[attempts.coerceIn(0, RETRY_BACKOFF_MS.size - 1)]
            prefs.edit().putInt(PREF_RETRY_ATTEMPTS, attempts + 1).apply()
            scheduleAt(context, delayMs, retryPendingIntent(context))
        }

        /**
         * Da chiamare quando startForeground RIESCE: azzera il contatore dei
         * tentativi e cancella un eventuale retry ancora armato.
         */
        fun resetRetry(context: Context) {
            try {
                val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                if (prefs.getInt(PREF_RETRY_ATTEMPTS, 0) != 0) {
                    prefs.edit().remove(PREF_RETRY_ATTEMPTS).apply()
                }
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                alarmManager.cancel(retryPendingIntent(context))
            } catch (e: Exception) {
                Log.w(TAG, "Watchdog resetRetry failed: ${e.message}")
            }
        }

        private fun scheduleAt(context: Context, delayMs: Long, pi: PendingIntent) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
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
                // Anche la catena di retry e il suo contatore
                alarmManager.cancel(retryPendingIntent(context))
                context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                    .edit().remove(PREF_RETRY_ATTEMPTS).apply()
                Log.d(TAG, "🐕 Watchdog cancellato.")
            } catch (e: Exception) {
                Log.w(TAG, "Watchdog cancel failed: ${e.message}")
            }
        }
    }
}
