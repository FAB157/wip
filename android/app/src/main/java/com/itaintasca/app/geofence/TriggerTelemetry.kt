package com.itaintasca.app.geofence

import android.content.Context
import android.location.Location
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * TriggerTelemetry — banco di misura per tarare il geofencing predittivo.
 *
 * PERCHÉ ESISTE
 * -------------
 * `PredictiveTrigger.T_LEAD_*` e `CORRIDOR_*` sono valori di partenza scelti
 * a tavolino. Non sono taratura: dipendono dalla latenza reale del fix sul
 * dispositivo, dalla densità urbana e dall'andatura dell'utente.
 *
 * Senza misura, cambiare quelle costanti è indovinare — e un annuncio troppo
 * anticipato è percepito come falso positivo esattamente come uno in ritardo.
 *
 * COSA REGISTRA
 * -------------
 * Una riga CSV per ogni valutazione: età del fix, accuratezza, velocità,
 * t_cpa e d_cpa previsti, distanza al momento della decisione, esito.
 *
 * COME SI LEGGE (senza root, da PC):
 *   adb shell run-as com.itaintasca.app cat files/wip_trigger_telemetry.csv > telemetria.csv
 * oppure via logcat in tempo reale mentre si cammina:
 *   adb logcat -s WipTelemetry
 *
 * COME SI TARA
 * ------------
 * Dopo alcune camminate, per ogni POI confrontare `d_now` al momento del FIRE
 * con la distanza minima realmente raggiunta poi (`d_cpa` è la previsione).
 *   - FIRE sistematicamente troppo vicino → alzare T_LEAD
 *   - FIRE su POI mai visitati / di lato → abbassare CORRIDOR
 *   - molti `fail-open` → il collo di bottiglia è l'accuratezza GPS,
 *     non le costanti: intervenire sul campionamento, non sulle soglie.
 *
 * Scrittura best-effort: qualunque errore di I/O viene ignorato. La
 * telemetria non deve mai poter rompere un trigger.
 */
object TriggerTelemetry {

    private const val TAG = "WipTelemetry"
    private const val FILE_NAME = "wip_trigger_telemetry.csv"

    /** Tetto dimensione file: oltre, si riparte da capo (nessuna rotazione multipla). */
    private const val MAX_BYTES = 512 * 1024

    private const val HEADER =
        "timestamp,poi_id,poi_name,phase,decision,reason,used_prediction," +
        "t_cpa_s,d_cpa_m,d_now_m,radius_m,fix_age_ms,accuracy_m,speed_ms,bearing_deg,mode\n"

    private val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US)

    /** Interruttore: si può spegnere da SharedPreferences senza ricompilare. */
    private fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .getBoolean("telemetryEnabled", true)

    fun log(
        context: Context,
        poiId: String,
        poiName: String,
        phase: String,
        result: PredictiveTrigger.Result,
        location: Location,
        isDriving: Boolean,
        radiusM: Float
    ) {
        val fixAgeMs = (System.currentTimeMillis() - location.time).coerceAtLeast(0L)
        val accuracy = if (location.hasAccuracy()) location.accuracy else -1f
        val speed = if (location.hasSpeed()) location.speed else -1f
        val bearing = if (location.hasBearing()) location.bearing else -1f

        // Logcat sempre: è il canale utile mentre si cammina col telefono in mano.
        Log.i(
            TAG,
            "$phase ${result.decision} \"$poiName\" " +
                "t_cpa=${fmtNum(result.tCpaSeconds)}s d_cpa=${fmtNum(result.dCpaMeters)}m " +
                "d_now=${result.distanceNowMeters.toInt()}m r=${radiusM.toInt()}m " +
                "age=${fixAgeMs}ms acc=${accuracy.toInt()}m v=${fmtNum(speed.toDouble())}m/s " +
                "brg=${bearing.toInt()}° pred=${result.usedPrediction} — ${result.reason}"
        )

        if (!isEnabled(context)) return

        try {
            val file = File(context.filesDir, FILE_NAME)
            if (!file.exists() || file.length() > MAX_BYTES) {
                file.writeText(HEADER)
            }
            file.appendText(
                listOf(
                    fmt.format(Date()),
                    poiId,
                    csv(poiName),
                    phase,
                    result.decision.name,
                    csv(result.reason),
                    result.usedPrediction.toString(),
                    fmtNum(result.tCpaSeconds),
                    fmtNum(result.dCpaMeters),
                    result.distanceNowMeters.toInt().toString(),
                    radiusM.toInt().toString(),
                    fixAgeMs.toString(),
                    accuracy.toInt().toString(),
                    fmtNum(speed.toDouble()),
                    bearing.toInt().toString(),
                    if (isDriving) "driving" else "walking"
                ).joinToString(",") + "\n"
            )
        } catch (e: Exception) {
            // Best-effort: la telemetria non deve mai rompere un trigger.
            Log.w(TAG, "Telemetry write failed: ${e.message}")
        }
    }

    /** Percorso del file, per esporlo al plugin Capacitor / condivisione. */
    fun fileFor(context: Context): File = File(context.filesDir, FILE_NAME)

    fun clear(context: Context) {
        try { fileFor(context).writeText(HEADER) } catch (_: Exception) {}
    }

    private fun fmtNum(v: Double): String =
        if (v.isNaN() || v.isInfinite()) "" else String.format(Locale.US, "%.1f", v)

    /** Virgole e virgolette romperebbero il CSV. */
    private fun csv(s: String): String =
        if (s.contains(',') || s.contains('"')) "\"" + s.replace("\"", "\"\"") + "\"" else s
}
