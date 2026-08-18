import Foundation
import CoreMotion

/**
 HealthStats — dati per la card «Salute del viaggio» (profilo).

 Passi, distanza e piani saliti dal chip di movimento via CMPedometer
 (CoreMotion, NIENTE HealthKit: nessun entitlement né capability in più;
 il permesso è lo stesso Motion & Fitness già dichiarato con
 NSMotionUsageDescription per MotionActivityGate).

 Il pedometro tiene 7 giorni di storico on-device: si fa una query per
 giorno (massimo 7, oggi + 6 precedenti) con queryPedometerData(from:to:)
 e si aggregano i risultati in:

   { available: true, days: [{ date: "yyyy-MM-dd", steps, distanceKm, floors }] }

 (stesso formato del bookkeeping StepTracker su Android, dove floors è 0).

 TUTTO FAIL-SAFE: contapassi assente, permesso Motion negato o tutte le
 query in errore → { available: false }, mai un errore al chiamante.
 */
final class HealthStats {
    static let shared = HealthStats()

    private let pedometer = CMPedometer()

    private init() {}

    /// Raccoglie i 7 giorni e chiama `completion` sul main thread.
    func fetch(completion: @escaping ([String: Any]) -> Void) {
        guard CMPedometer.isStepCountingAvailable() else {
            DispatchQueue.main.async { completion(["available": false]) }
            return
        }
        if #available(iOS 11.0, *) {
            let auth = CMPedometer.authorizationStatus()
            // .notDetermined: la prima query mostra il prompt di sistema
            // (NSMotionUsageDescription già in Info.plist) — si procede.
            if auth == .denied || auth == .restricted {
                DispatchQueue.main.async { completion(["available": false]) }
                return
            }
        }

        let cal = Calendar.current
        let now = Date()
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")

        // Risultati indicizzati per "giorni fa" (0 = oggi), protetti da lock:
        // i callback del pedometro arrivano su una coda interna di CoreMotion.
        var results: [Int: [String: Any]] = [:]
        var anySuccess = false
        let lock = NSLock()
        let group = DispatchGroup()

        for daysAgo in 0..<7 {
            guard let dayStart = cal.date(byAdding: .day, value: -daysAgo, to: cal.startOfDay(for: now)) else { continue }
            let nextDay = cal.date(byAdding: .day, value: 1, to: dayStart) ?? now
            let dayEnd = min(now, nextDay)
            let dateKey = fmt.string(from: dayStart)
            group.enter()
            pedometer.queryPedometerData(from: dayStart, to: dayEnd) { data, error in
                lock.lock()
                if let data = data, error == nil {
                    anySuccess = true
                    let steps = data.numberOfSteps.intValue
                    // Distanza reale del pedometro quando c'è; fallback alla
                    // stessa stima di Android (passi × 0,75 m).
                    let meters = data.distance?.doubleValue ?? Double(steps) * 0.75
                    results[daysAgo] = [
                        "date": dateKey,
                        "steps": steps,
                        "distanceKm": meters / 1000.0,
                        "floors": data.floorsAscended?.intValue ?? 0
                    ]
                } else {
                    // Giorno senza dati (o permesso appena negato): 0, mai errore.
                    results[daysAgo] = ["date": dateKey, "steps": 0, "distanceKm": 0.0, "floors": 0]
                }
                lock.unlock()
                group.leave()
            }
        }

        group.notify(queue: .main) {
            guard anySuccess else {
                completion(["available": false])
                return
            }
            // Ordine cronologico: dal più vecchio a oggi (come Android).
            let days = (0..<7).reversed().compactMap { results[$0] }
            completion(["available": true, "days": days])
        }
    }
}
