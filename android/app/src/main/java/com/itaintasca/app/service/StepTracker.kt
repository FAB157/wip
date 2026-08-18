package com.itaintasca.app.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * StepTracker — contapassi per la card «Salute del viaggio» (profilo).
 *
 * TYPE_STEP_COUNTER è CUMULATIVO dal boot (un solo valore monotono, azzerato
 * al riavvio del telefono): per avere i passi PER GIORNO serve bookkeeping.
 * A ogni record() si legge il contatore con un listener one-shot
 * (registra → primo evento → unregister, zero consumo continuo) e si
 * confronta con lo snapshot precedente salvato in ItaintaPrefs:
 *
 *   - snapshot = { health_snap_day: 'yyyy-MM-dd', health_snap_raw: Long }
 *   - delta = raw − snapRaw → accreditato al bucket del giorno corrente
 *     ('health_steps_<yyyy-MM-dd>', Int)
 *   - raw < snapRaw = il telefono è stato RIAVVIATO (il contatore riparte
 *     da 0): i passi tra snapshot e reboot sono persi, si accredita solo
 *     raw (= passi dal boot) e si riparte dal nuovo valore
 *   - snapshot di un giorno diverso da oggi = il gap attraversa la
 *     mezzanotte: non sappiamo spartire il delta tra i due giorni, va
 *     tutto a oggi (approssimazione accettata: i punti vivi del service
 *     chiamano record() ogni pochi secondi, il gap reale è minuscolo)
 *
 * Pulizia: i bucket più vecchi di 14 giorni vengono rimossi a ogni record().
 *
 * Chi chiama record(): ItaintaBackgroundPoiService (onCreate + ogni fix di
 * posizione) e il metodo plugin getHealthStats. Fail-safe totale: senza
 * permesso ACTIVITY_RECOGNITION (API 29+) o senza sensore non fa nulla.
 */
object StepTracker {

    private const val TAG = "StepTracker"
    private const val PREFS = "ItaintaPrefs"
    private const val KEY_SNAP_DAY = "health_snap_day"
    private const val KEY_SNAP_RAW = "health_snap_raw"
    private const val KEY_DAY_PREFIX = "health_steps_"
    private const val RETENTION_DAYS = 14

    /** Lunghezza media del passo: 0,75 m è un'APPROSSIMAZIONE (adulto medio,
     *  camminata urbana). Android non fornisce la distanza reale: km stimati. */
    const val STEP_LENGTH_M = 0.75

    /** Throttle per i punti vivi del service: i fix arrivano ogni ~20 s,
     *  leggere il sensore ogni volta è inutile. Le letture su richiesta
     *  (plugin, onDone != null) non sono mai throttlate. */
    private const val MIN_INTERVAL_MS = 60_000L
    @Volatile private var lastRecordMs = 0L

    /** Timeout del listener one-shot: alcuni device consegnano il primo
     *  evento solo al passo successivo — non si resta appesi. */
    private const val SENSOR_TIMEOUT_MS = 2_000L

    data class DaySteps(val date: String, val steps: Int, val distanceKm: Double)

    /** Permesso (solo API 29+, prima è install-time) + sensore presente. */
    fun isAvailable(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) !=
            PackageManager.PERMISSION_GRANTED
        ) return false
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
        return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    /**
     * Legge il contatore cumulativo con un listener one-shot e aggiorna il
     * bookkeeping per-giorno. Mai bloccante, mai un'eccezione al chiamante.
     * @param onDone invocato (sul main thread) a bookkeeping aggiornato o al
     *               timeout; se null la chiamata è "fire and forget" e viene
     *               throttlata a 1/min.
     */
    @JvmStatic
    @JvmOverloads
    fun record(context: Context, onDone: (() -> Unit)? = null) {
        val app = context.applicationContext
        try {
            if (!isAvailable(app)) {
                onDone?.invoke()
                return
            }
            val now = System.currentTimeMillis()
            if (onDone == null && now - lastRecordMs < MIN_INTERVAL_MS) return
            lastRecordMs = now

            val sm = app.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            if (sensor == null) {
                onDone?.invoke()
                return
            }

            val mainHandler = Handler(Looper.getMainLooper())
            val finished = AtomicBoolean(false)
            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    if (!finished.compareAndSet(false, true)) return
                    sm.unregisterListener(this)
                    try {
                        applyRawCounter(app, event.values[0].toLong())
                    } catch (e: Exception) {
                        Log.w(TAG, "Bookkeeping passi fallito: ${e.message}")
                    }
                    onDone?.invoke()
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { /* no-op */ }
            }
            // Handler esplicito sul main looper: record() può arrivare da
            // thread senza Looper (coroutine del plugin).
            sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, mainHandler)
            mainHandler.postDelayed({
                if (finished.compareAndSet(false, true)) {
                    sm.unregisterListener(listener)
                    onDone?.invoke()
                }
            }, SENSOR_TIMEOUT_MS)
        } catch (e: Exception) {
            // Fail-safe totale: la card semplicemente non mostrerà dati freschi.
            Log.w(TAG, "record() fallita: ${e.message}")
            onDone?.invoke()
        }
    }

    /** Applica una lettura del contatore cumulativo al bucket del giorno. */
    @Synchronized
    private fun applyRawCounter(context: Context, raw: Long) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = dayKey(Date())
        val snapRaw = prefs.getLong(KEY_SNAP_RAW, -1L)

        if (snapRaw < 0L) {
            // Prima lettura in assoluto: nessun delta attribuibile, si fissa
            // solo la baseline.
            prefs.edit()
                .putString(KEY_SNAP_DAY, today)
                .putLong(KEY_SNAP_RAW, raw)
                .apply()
            return
        }

        // Reboot: il contatore riparte da 0, quindi raw < snapshot. I passi
        // fatti tra l'ultimo snapshot e il riavvio sono persi; si accreditano
        // solo quelli dal boot in poi (= raw) e si riparte dal nuovo valore.
        val delta = if (raw < snapRaw) raw else raw - snapRaw

        val editor = prefs.edit()
        if (delta > 0L) {
            // Gap a cavallo della mezzanotte (snapDay != today): tutto il
            // delta va a oggi — approssimazione, vedi doc in testa al file.
            val key = KEY_DAY_PREFIX + today
            val current = prefs.getInt(key, 0)
            editor.putInt(key, (current + delta).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
        }
        editor
            .putString(KEY_SNAP_DAY, today)
            .putLong(KEY_SNAP_RAW, raw)
            .apply()

        cleanupOldBuckets(prefs)
    }

    /** Rimuove i bucket 'health_steps_*' più vecchi di [RETENTION_DAYS]. */
    private fun cleanupOldBuckets(prefs: android.content.SharedPreferences) {
        try {
            val cutoff = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, -RETENTION_DAYS)
            }.time
            val cutoffKey = dayKey(cutoff)
            val stale = prefs.all.keys.filter {
                it.startsWith(KEY_DAY_PREFIX) && it.removePrefix(KEY_DAY_PREFIX) < cutoffKey
            }
            if (stale.isNotEmpty()) {
                val e = prefs.edit()
                stale.forEach { e.remove(it) }
                e.apply()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Pulizia bucket fallita: ${e.message}")
        }
    }

    /** Ultimi [n] giorni (dal più vecchio a oggi) dai bucket in prefs.
     *  Distanza = passi × 0,75 m (stima: Android non misura la distanza). */
    @JvmStatic
    @JvmOverloads
    fun lastDays(context: Context, n: Int = 7): List<DaySteps> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val out = ArrayList<DaySteps>(n)
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -(n - 1))
        repeat(n) {
            val key = dayKey(cal.time)
            val steps = prefs.getInt(KEY_DAY_PREFIX + key, 0)
            out.add(DaySteps(date = key, steps = steps, distanceKm = steps * STEP_LENGTH_M / 1000.0))
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return out
    }

    private fun dayKey(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)
}
