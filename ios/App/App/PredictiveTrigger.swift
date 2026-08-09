import Foundation
import CoreLocation

/**
 PredictiveTrigger — nucleo predittivo condiviso del geofencing WIP.

 PORT ESATTO di:
   - android/app/src/main/java/com/itaintasca/app/geofence/PredictiveTrigger.kt
   - src/lib/geofencing/predictive.ts

 Le tre implementazioni devono restare allineate: costanti, soglie e ordine
 dei rami decisionali. Se cambiate un numero qui, cambiatelo in tutte e tre.

 PROBLEMA CHE RISOLVE
 --------------------
 Il vecchio `checkBearingFilter` (±60°) era un veto, non una predizione:
 poteva solo sopprimere un annuncio, mai anticiparlo. E si disattivava
 (`return true`) con `horizontalAccuracy > 50` o `speed < 0.3` — cioè nei
 centri storici e col turista che rallenta avvicinandosi al monumento,
 quindi nella pratica non filtrava quasi nulla.

 SOLUZIONE — punto di massimo avvicinamento (CPA) invece della distanza:
     r     = q - p
     t_cpa = (r · v) / (v · v)
     d_cpa = | r - v * t_cpa |
 Si annuncia quando t_cpa ∈ (0, T_LEAD] AND d_cpa <= CORRIDOR: un corridoio
 orientato nella direzione di marcia, che si allunga da sé con la velocità.
 */
enum PredictiveTrigger {

    // MARK: - Costanti da tarare sul campo
    /// Anticipo desiderato: età fix (~3 s) + TTS (~3 s) + reazione (~5 s) = 11 s minimo.
    static let tLeadWalkingS: Double = 22.0
    static let tLeadDrivingS: Double = 14.0

    /// Semi-larghezza del corridoio: quanto "di lato" può stare il POI.
    static let corridorWalkingM: Double = 35.0
    static let corridorDrivingM: Double = 70.0

    /// Tetto all'estrapolazione: oltre, l'errore supera il beneficio.
    static let maxExtrapolationS: Double = 3.0

    /// Sotto questa velocità il `course` di CoreLocation è rumore.
    static let minSpeedForVectorMS: Double = 0.5

    /// Sopra questa incertezza la predizione non è affidabile: fail-open.
    static let maxAccuracyForPredictionM: Double = 50.0

    /// Oltre questo ritardo il fix è troppo vecchio per estrapolarlo.
    static let maxFixAgeMs: Double = 30_000

    // MARK: - Esito
    enum Decision {
        /// Annuncia adesso.
        case fire
        /// In rotta ma troppo presto: ricontrolla al prossimo fix.
        case hold
        /// Non annunciare: si allontana, oppure passa di lato.
        case reject
    }

    struct Result {
        let decision: Decision
        let tCpaSeconds: Double
        let dCpaMeters: Double
        let distanceNowMeters: Double
        let usedPrediction: Bool
        let reason: String
    }

    /// - Parameters:
    ///   - radiusM: raggio di riferimento della fase (alert o arrival)
    static func evaluate(
        location: CLLocation,
        poiLat: Double,
        poiLon: Double,
        radiusM: Double,
        isDriving: Bool,
        nowMs: Double = Date().timeIntervalSince1970 * 1000
    ) -> Result {
        let tLead = isDriving ? tLeadDrivingS : tLeadWalkingS
        let corridor = isDriving ? corridorDrivingM : corridorWalkingM

        let fixAgeMs = max(0, nowMs - location.timestamp.timeIntervalSince1970 * 1000)
        // horizontalAccuracy negativo = non valido
        let accuracy = location.horizontalAccuracy > 0 ? location.horizontalAccuracy : Double.greatestFiniteMagnitude
        let speed = location.speed >= 0 ? location.speed : 0.0
        let course = location.course >= 0 ? location.course : -1.0

        let canPredict = accuracy <= maxAccuracyForPredictionM
            && speed >= minSpeedForVectorMS
            && course >= 0
            && fixAgeMs <= maxFixAgeMs

        // Compensazione della latenza: il fix è vecchio di secondi ma viene
        // usato come se fosse "adesso". A 1,4 m/s ogni secondo è 1,4 m.
        let extrapolationS = canPredict ? min(fixAgeMs / 1000.0, maxExtrapolationS) : 0.0
        let (userLat, userLon) = extrapolate(
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            bearingDeg: course,
            speedMS: speed,
            seconds: extrapolationS
        )

        let (east, north) = toLocalMeters(userLat: userLat, userLon: userLon, poiLat: poiLat, poiLon: poiLon)
        let distanceNow = (east * east + north * north).squareRoot()

        if !canPredict {
            // FAIL-OPEN: si replica il comportamento radiale attuale invece
            // di irrigidire il punto cieco (sarebbe una regressione).
            var why = "fail-open:"
            if accuracy > maxAccuracyForPredictionM { why += " acc=\(Int(accuracy))m" }
            if speed < minSpeedForVectorMS { why += String(format: " speed=%.1fm/s", speed) }
            if course < 0 { why += " no-course" }
            if fixAgeMs > maxFixAgeMs { why += " age=\(Int(fixAgeMs))ms" }
            return Result(
                decision: distanceNow <= radiusM ? .fire : .hold,
                tCpaSeconds: Double.nan,
                dCpaMeters: Double.nan,
                distanceNowMeters: distanceNow,
                usedPrediction: false,
                reason: why
            )
        }

        let courseRad = course * .pi / 180
        let vEast = speed * sin(courseRad)
        let vNorth = speed * cos(courseRad)
        let vSq = vEast * vEast + vNorth * vNorth

        let tCpa = (east * vEast + north * vNorth) / vSq
        let missEast = east - vEast * tCpa
        let missNorth = north - vNorth * tCpa
        let dCpa = (missEast * missEast + missNorth * missNorth).squareRoot()

        // Già dentro il raggio: la predizione non deve poter negare un arrivo.
        if distanceNow <= radiusM {
            return Result(decision: .fire, tCpaSeconds: tCpa, dCpaMeters: dCpa,
                          distanceNowMeters: distanceNow, usedPrediction: true, reason: "inside-radius")
        }
        // Si allontana: il CPA è alle sue spalle.
        if tCpa <= 0 {
            return Result(decision: .reject, tCpaSeconds: tCpa, dCpaMeters: dCpa,
                          distanceNowMeters: distanceNow, usedPrediction: true, reason: "moving-away")
        }
        // Passerà di lato: via parallela, altro lato della piazza.
        if dCpa > corridor {
            return Result(decision: .reject, tCpaSeconds: tCpa, dCpaMeters: dCpa,
                          distanceNowMeters: distanceNow, usedPrediction: true,
                          reason: "off-corridor d_cpa=\(Int(dCpa))m")
        }
        // In rotta ma non ancora nella finestra di anticipo.
        if tCpa > tLead {
            return Result(decision: .hold, tCpaSeconds: tCpa, dCpaMeters: dCpa,
                          distanceNowMeters: distanceNow, usedPrediction: true,
                          reason: "too-early t_cpa=\(Int(tCpa))s")
        }
        // In rotta e dentro la finestra: è il momento.
        return Result(decision: .fire, tCpaSeconds: tCpa, dCpaMeters: dCpa,
                      distanceNowMeters: distanceNow, usedPrediction: true,
                      reason: "predicted t_cpa=\(Int(tCpa))s")
    }

    /// Metri oltre il CPA perché un POI sia "superato". In DISTANZA, non in
    /// secondi: la vecchia soglia -3 s valeva ~42 m in auto ma ~4 m a piedi,
    /// e il pedone che faceva due passi oltre il monumento (o stava fermo con
    /// il GPS in deriva) si vedeva tagliare l'audioguida. 40 m si scalano da
    /// sé con la velocità, come il corridoio.
    static let passDistanceM: Double = 40.0

    /**
     Rileva il superamento del POI: CPA alle spalle di almeno `passDistanceM`
     metri E distanza oltre il pavimento radiale `radiusM`, in crescita.
     Il chiamante sceglie il pavimento: raggio di ARRIVO in auto (taglio
     rapido dopo il sorpasso), raggio di ALERT a piedi (finché cammini nei
     150 m sei ancora "al" monumento e la voce può finire il racconto).
     */
    static func hasPassed(tCpaSeconds: Double, distanceNow: Double, previousDistance: Double, radiusM: Double, speedMs: Double) -> Bool {
        guard distanceNow > previousDistance else { return false }
        if tCpaSeconds.isNaN {
            return distanceNow > radiusM
        }
        let metersPastCpa = -tCpaSeconds * max(speedMs, 0)
        return metersPastCpa > passDistanceM && distanceNow > radiusM
    }

    // MARK: - Utilità geometriche

    private static func extrapolate(
        lat: Double, lon: Double, bearingDeg: Double, speedMS: Double, seconds: Double
    ) -> (Double, Double) {
        if seconds <= 0 || speedMS <= 0 || bearingDeg < 0 { return (lat, lon) }
        let distance = speedMS * seconds
        let bearingRad = bearingDeg * .pi / 180
        let dNorth = distance * cos(bearingRad)
        let dEast = distance * sin(bearingRad)
        let newLat = lat + dNorth / 111_320.0
        var cosLat = cos(lat * .pi / 180)
        if abs(cosLat) < 1e-6 { cosLat = 1e-6 }
        let newLon = lon + dEast / (111_320.0 * cosLat)
        return (newLat, newLon)
    }

    private static func toLocalMeters(
        userLat: Double, userLon: Double, poiLat: Double, poiLon: Double
    ) -> (Double, Double) {
        var cosLat = cos(userLat * .pi / 180)
        if abs(cosLat) < 1e-6 { cosLat = 1e-6 }
        let east = (poiLon - userLon) * 111_320.0 * cosLat
        let north = (poiLat - userLat) * 111_320.0
        return (east, north)
    }
}
