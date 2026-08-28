package com.itaintasca.app.geofence

import android.location.Location
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sqrt

/**
 * PredictiveTrigger — nucleo predittivo condiviso del geofencing WIP.
 *
 * PROBLEMA CHE RISOLVE
 * --------------------
 * Il geofence circolare non sa da dove arrivi l'utente. Per far scattare
 * l'avviso abbastanza presto lungo l'asse di marcia bisogna allargare il
 * raggio, ma allargandolo scatta anche per chi passa nella via parallela.
 * Con i cerchi il compromesso è insolubile.
 *
 * Il vecchio filtro (checkBearingFilter, ±60°) provava a mitigarlo ma:
 *   1. era un VETO, non una predizione: poteva solo sopprimere, mai anticipare;
 *   2. si disattivava (`return true`) con accuracy > 50 m o speed < 0.3 m/s —
 *      cioè esattamente nei centri storici e col turista che rallenta,
 *      quindi nella pratica non filtrava quasi nulla.
 *
 * SOLUZIONE
 * ---------
 * Si ragiona sul punto di massimo avvicinamento (CPA, Closest Point of
 * Approach) invece che sulla distanza radiale. Con p = posizione utente,
 * v = vettore velocità, q = POI:
 *
 *     r     = q - p
 *     t_cpa = (r · v) / (v · v)      secondi al massimo avvicinamento
 *     d_cpa = | r - v * t_cpa |      distanza minima che l'utente raggiungerà
 *
 * Si annuncia quando  t_cpa ∈ (0, T_LEAD]  AND  d_cpa <= CORRIDOR.
 *
 * Il luogo dei punti che soddisfa le due condizioni È il buffer orientato
 * nella direzione di marcia: un corridoio di semi-larghezza CORRIDOR e
 * lunghezza |v| * T_LEAD davanti all'utente. Meglio di un'ellisse perché
 * nella direzione di marcia si scala da sé con la velocità — nessuna soglia
 * separata da tarare per piedi/auto.
 *
 * Conseguenze dirette:
 *   - via parallela      → d_cpa grande        → non scatta (prima scattava)
 *   - utente che si allontana → t_cpa < 0      → non scatta
 *   - utente in arrivo   → scatta T_LEAD secondi PRIMA, non a X metri
 *
 * FAIL-OPEN DELIBERATO
 * --------------------
 * Quando i dati non permettono una predizione (fix impreciso, fermo, senza
 * bearing) NON si irrigidisce: si ricade sul comportamento radiale di oggi.
 * Peggiorare il punto cieco sarebbe una regressione; qui l'obiettivo è
 * migliorare dove si può e non toccare il resto.
 *
 * ⚠️ Le costanti sono valori di PARTENZA, non tarati sul campo.
 *    Vanno misurate camminando (vedi TriggerTelemetry) e poi corrette.
 *    Devono restare identiche in:
 *      - ios/App/App/PredictiveTrigger.swift
 *      - src/lib/geofencing/predictive.ts
 */
object PredictiveTrigger {

    // ─── Costanti da tarare sul campo ────────────────────────────────────
    /**
     * Anticipo desiderato sull'annuncio, in secondi.
     *
     * Deve coprire: età del fix (~3 s) + durata del TTS (~3 s) + tempo di
     * reazione dell'utente (~5 s) = 11 s minimo teorico. 22 s a piedi
     * corrisponde a ~30 m a 1,4 m/s.
     */
    const val T_LEAD_WALKING_S = 22.0
    const val T_LEAD_DRIVING_S = 14.0

    /** Semi-larghezza del corridoio: quanto "di lato" può stare il POI. */
    const val CORRIDOR_WALKING_M = 35.0
    const val CORRIDOR_DRIVING_M = 70.0

    /** Tetto all'estrapolazione della posizione: oltre, l'errore supera il beneficio. */
    const val MAX_EXTRAPOLATION_S = 3.0

    /** Sotto questa velocità il `bearing` del GPS è rumore: predizione non affidabile. */
    const val MIN_SPEED_FOR_VECTOR_MS = 0.5

    /** Sopra questa incertezza la predizione non è affidabile: fail-open. */
    const val MAX_ACCURACY_FOR_PREDICTION_M = 50.0

    /** Oltre questo ritardo il fix è troppo vecchio per estrapolarlo. */
    const val MAX_FIX_AGE_MS = 30_000L

    // ─── Esito ───────────────────────────────────────────────────────────
    enum class Decision {
        /** Annuncia adesso. */
        FIRE,
        /** In rotta ma troppo presto: ricontrolla al prossimo fix. */
        HOLD,
        /** Non annunciare: si allontana, oppure passa di lato. */
        REJECT
    }

    /**
     * Esito completo, con i numeri che servono alla telemetria per la
     * taratura: senza `dCpa`/`tCpa` loggati non si possono correggere le
     * costanti in modo informato.
     */
    data class Result(
        val decision: Decision,
        val tCpaSeconds: Double,
        val dCpaMeters: Double,
        val distanceNowMeters: Double,
        val usedPrediction: Boolean,
        val reason: String
    )

    /**
     * @param location fix corrente (con speed/bearing/accuracy/tempo)
     * @param poiLat   latitudine del POI (usare entranceLat se disponibile)
     * @param poiLon   longitudine del POI
     * @param radiusM  raggio di riferimento della fase (alert o arrival)
     * @param isDriving modalità corrente
     * @param nowMs    orologio iniettabile (test)
     */
    fun evaluate(
        location: Location,
        poiLat: Double,
        poiLon: Double,
        radiusM: Double,
        isDriving: Boolean,
        nowMs: Long = System.currentTimeMillis()
    ): Result {
        val tLead = if (isDriving) T_LEAD_DRIVING_S else T_LEAD_WALKING_S
        val corridor = if (isDriving) CORRIDOR_DRIVING_M else CORRIDOR_WALKING_M

        val fixAgeMs = (nowMs - location.time).coerceAtLeast(0L)
        val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else Double.MAX_VALUE
        val speed = if (location.hasSpeed()) location.speed.toDouble() else 0.0
        val bearing = if (location.hasBearing()) location.bearing.toDouble() else -1.0

        // Distanza radiale attuale, calcolata sul fix compensato quando possibile.
        val canPredict = accuracy <= MAX_ACCURACY_FOR_PREDICTION_M &&
            speed >= MIN_SPEED_FOR_VECTOR_MS &&
            bearing >= 0.0 &&
            fixAgeMs <= MAX_FIX_AGE_MS

        // ── Compensazione della latenza ──
        // Il fix viene usato come se fosse "adesso", ma è vecchio di secondi.
        // A 1,4 m/s ogni secondo di ritardo è 1,4 m di errore: a 30 m di
        // raggio di arrivo sono errori che spostano l'annuncio oltre il
        // monumento. Si proietta in avanti lungo la rotta nota.
        // (23/08/2026) I due helper scrivevano il risultato in un
        // `Pair<Double, Double>`: un Pair piu' DUE Double incapsulati, sei
        // oggetti per valutazione. `evaluate` gira per ogni POI candidato a
        // ogni fix (fino a 5 volte al secondo nella finestra armata, piu' il
        // percorso del receiver): erano migliaia di oggetti al minuto da far
        // raccogliere al GC mentre si cammina. Ora scrivono in un array di due
        // primitivi, locale alla chiamata — quindi ancora rientrante e sicuro
        // fra thread. La matematica e' identica, riga per riga.
        val extrapolationS = if (canPredict) min(fixAgeMs / 1000.0, MAX_EXTRAPOLATION_S) else 0.0
        val fuori = DoubleArray(2)
        extrapolate(location.latitude, location.longitude, bearing, speed, extrapolationS, fuori)
        val userLat = fuori[0]
        val userLon = fuori[1]

        // Frame metrico locale (equirettangolare): alle distanze in gioco
        // (< 2 km) l'errore è trascurabile e costa due moltiplicazioni.
        toLocalMeters(userLat, userLon, poiLat, poiLon, fuori)
        val east = fuori[0]
        val north = fuori[1]
        val distanceNow = sqrt(east * east + north * north)

        if (!canPredict) {
            // FAIL-OPEN: si replica il comportamento radiale attuale.
            return Result(
                decision = if (distanceNow <= radiusM) Decision.FIRE else Decision.HOLD,
                tCpaSeconds = Double.NaN,
                dCpaMeters = Double.NaN,
                distanceNowMeters = distanceNow,
                usedPrediction = false,
                // (23/08/2026) Via `String.format`: e' il ramo piu' frequente
                // in citta' (fix impreciso, utente fermo) e ogni chiamata
                // costruiva un Formatter, un StringBuilder interno e faceva la
                // ricerca del Locale. Un arrotondamento a un decimale fa lo
                // stesso lavoro. In piu' il decimale ora e' sempre il punto:
                // "%.1f".format() usava il Locale di SISTEMA e su un telefono
                // italiano scriveva "0,3" — una virgola dentro un CSV.
                reason = buildString {
                    append("fail-open:")
                    if (accuracy > MAX_ACCURACY_FOR_PREDICTION_M) append(" acc=${accuracy.toInt()}m")
                    if (speed < MIN_SPEED_FOR_VECTOR_MS) append(" speed=${Math.round(speed * 10.0) / 10.0}m/s")
                    if (bearing < 0) append(" no-bearing")
                    if (fixAgeMs > MAX_FIX_AGE_MS) append(" age=${fixAgeMs}ms")
                }
            )
        }

        // Vettore velocità in metri/secondo nel frame locale.
        val bearingRad = Math.toRadians(bearing)
        val vEast = speed * Math.sin(bearingRad)
        val vNorth = speed * Math.cos(bearingRad)
        val vSq = vEast * vEast + vNorth * vNorth

        // t_cpa = (r · v) / (v · v)
        val tCpa = (east * vEast + north * vNorth) / vSq
        // d_cpa = | r - v * t_cpa |
        val missEast = east - vEast * tCpa
        val missNorth = north - vNorth * tCpa
        val dCpa = sqrt(missEast * missEast + missNorth * missNorth)

        return when {
            // Già dentro il raggio: si annuncia comunque, la predizione non
            // deve poter negare un arrivo effettivo.
            distanceNow <= radiusM ->
                Result(Decision.FIRE, tCpa, dCpa, distanceNow, true, "inside-radius")

            // Si sta allontanando (il CPA è dietro di lui).
            tCpa <= 0.0 ->
                Result(Decision.REJECT, tCpa, dCpa, distanceNow, true, "moving-away")

            // Passerà di lato: via parallela, altro lato della piazza.
            dCpa > corridor ->
                Result(Decision.REJECT, tCpa, dCpa, distanceNow, true, "off-corridor d_cpa=${dCpa.toInt()}m")

            // In rotta, ma non ancora nella finestra di anticipo.
            tCpa > tLead ->
                Result(Decision.HOLD, tCpa, dCpa, distanceNow, true, "too-early t_cpa=${tCpa.toInt()}s")

            // In rotta e dentro la finestra: è il momento.
            else ->
                Result(Decision.FIRE, tCpa, dCpa, distanceNow, true, "predicted t_cpa=${tCpa.toInt()}s")
        }
    }

    /**
     * Metri oltre il CPA perché un POI sia "superato". In DISTANZA, non in
     * secondi: la vecchia soglia -3 s valeva ~42 m in auto ma ~4 m a piedi,
     * e il pedone che faceva due passi oltre il monumento (o stava fermo con
     * il GPS in deriva) si vedeva tagliare l'audioguida. 40 m si scalano da
     * sé con la velocità, come il corridoio.
     */
    const val PASS_DISTANCE_M = 40.0

    /**
     * Rileva il superamento del POI: CPA alle spalle di almeno PASS_DISTANCE_M
     * metri E distanza oltre il pavimento radiale `radiusM`, in crescita.
     * Il chiamante sceglie il pavimento: raggio di ARRIVO in auto (taglio
     * rapido dopo il sorpasso), raggio di ALERT a piedi (finché cammini nei
     * 150 m sei ancora "al" monumento e la voce può finire il racconto).
     */
    fun hasPassed(
        tCpaSeconds: Double,
        distanceNow: Double,
        previousDistance: Double,
        radiusM: Double,
        speedMs: Double
    ): Boolean {
        if (distanceNow <= previousDistance) return false
        if (tCpaSeconds.isNaN()) return distanceNow > radiusM
        val metersPastCpa = -tCpaSeconds * speedMs.coerceAtLeast(0.0)
        return metersPastCpa > PASS_DISTANCE_M && distanceNow > radiusM
    }

    // ─── Utilità geometriche ─────────────────────────────────────────────

    /**
     * Proietta una posizione in avanti lungo una rotta, per `seconds`.
     * Scrive in `fuori`: [0] = latitudine, [1] = longitudine.
     */
    private fun extrapolate(
        lat: Double, lon: Double, bearingDeg: Double, speedMs: Double, seconds: Double,
        fuori: DoubleArray
    ) {
        if (seconds <= 0.0 || speedMs <= 0.0 || bearingDeg < 0.0) {
            fuori[0] = lat
            fuori[1] = lon
            return
        }
        val distance = speedMs * seconds
        val bearingRad = Math.toRadians(bearingDeg)
        val dNorth = distance * Math.cos(bearingRad)
        val dEast = distance * Math.sin(bearingRad)
        val cosLat = cos(Math.toRadians(lat)).let { if (abs(it) < 1e-6) 1e-6 else it }
        fuori[0] = lat + dNorth / 111_320.0
        fuori[1] = lon + dEast / (111_320.0 * cosLat)
    }

    /**
     * Offset dal punto utente al POI, in metri.
     * Scrive in `fuori`: [0] = est, [1] = nord.
     */
    private fun toLocalMeters(
        userLat: Double, userLon: Double, poiLat: Double, poiLon: Double,
        fuori: DoubleArray
    ) {
        val cosLat = cos(Math.toRadians(userLat)).let { if (abs(it) < 1e-6) 1e-6 else it }
        fuori[0] = (poiLon - userLon) * 111_320.0 * cosLat
        fuori[1] = (poiLat - userLat) * 111_320.0
    }
}
