import Foundation
import CoreMotion
import CoreLocation

/**
 MotionActivityGate — gating leggero dei trigger con i sensori di movimento.

 CMMotionActivityManager (Motion & Fitness) traccia lo stato
 stazionario / camminata / veicolo. Qui serve a una cosa sola: sopprimere i
 falsi trigger da "teletrasporto GPS". Se l'utente è FERMO da più di 5 minuti
 (lo dice il chip di movimento, non il GPS) e arriva un fix che salta di
 oltre 100 m rispetto all'ultima posizione accettata, quel fix è quasi
 certamente rumore (multipath, rimbalzo WiFi/cella, canyon urbano): non va
 valutato per i trigger, che altrimenti annuncerebbero POI mai visitati.

 TUTTO FAIL-SAFE: se il device non ha il coprocessore di movimento, se
 l'utente nega il permesso Motion & Fitness, o se non abbiamo (ancora) dati
 affidabili, la risposta è sempre "non sopprimere" — comportamento IDENTICO
 a prima di questa feature. Nessun errore risale mai al chiamante.

 Parità concettuale con il gating sensori Android; le soglie (5 min / 100 m)
 sono condivise fra le piattaforme.
 */
final class MotionActivityGate {
    static let shared = MotionActivityGate()

    /// Fermo da almeno 5 minuti prima di considerare "sospetti" i salti GPS.
    static let stationaryThresholdMs: Double = 5 * 60 * 1000
    /// Salto minimo (m) dall'ultima posizione accettata per parlare di teletrasporto.
    static let teleportJumpM: Double = 100
    /// Valvola di sfogo: dopo N fix soppressi CONSECUTIVI la nuova posizione
    /// viene accettata comunque — se il GPS insiste, forse ha ragione lui
    /// (es. correzione legittima di un errore precedente). Evita che il gate
    /// resti "incollato" a un'ancora sbagliata.
    static let maxConsecutiveSuppressions = 3

    private let motionManager = CMMotionActivityManager()
    /// Lock unico: gli update di attività arrivano su una OperationQueue
    /// propria, le query dal workQueue del BackgroundPoiManager.
    private let stateLock = NSLock()

    // Stato protetto da stateLock
    private var isTracking = false
    private var stationarySinceMs: Double?
    private var lastAcceptedLocation: CLLocation?
    private var consecutiveSuppressions = 0

    private init() {}

    /// Avvio best-effort, idempotente. Se Motion & Fitness non è disponibile
    /// o è negato, il gate resta spento (= mai soppressioni).
    func start() {
        guard CMMotionActivityManager.isActivityAvailable() else { return }
        if #available(iOS 11.0, *) {
            let auth = CMMotionActivityManager.authorizationStatus()
            // .notDetermined: il primo startActivityUpdates mostra il prompt
            // di sistema (NSMotionUsageDescription). Se l'utente nega, gli
            // update semplicemente non arrivano più → gate inerte, fail-safe.
            guard auth == .authorized || auth == .notDetermined else { return }
        }
        stateLock.lock()
        let alreadyTracking = isTracking
        isTracking = true
        stateLock.unlock()
        guard !alreadyTracking else { return }
        motionManager.startActivityUpdates(to: OperationQueue()) { [weak self] activity in
            self?.handleActivity(activity)
        }
    }

    func stop() {
        stateLock.lock()
        let wasTracking = isTracking
        isTracking = false
        stationarySinceMs = nil
        lastAcceptedLocation = nil
        consecutiveSuppressions = 0
        stateLock.unlock()
        if wasTracking { motionManager.stopActivityUpdates() }
    }

    private func handleActivity(_ activity: CMMotionActivity?) {
        guard let activity = activity else { return }
        // "Fermo" solo se il chip lo dice senza ambiguità e con confidenza
        // almeno media: stazionario in auto (semaforo, coda) NON conta —
        // automotive azzera. Nel dubbio: non stazionario = niente
        // soppressione (fail-safe).
        let reliablyStationary = activity.stationary
            && !activity.walking && !activity.running
            && !activity.automotive && !activity.cycling
            && activity.confidence != .low
        stateLock.lock()
        if reliablyStationary {
            if stationarySinceMs == nil { stationarySinceMs = nowMs() }
        } else {
            stationarySinceMs = nil
        }
        stateLock.unlock()
    }

    /**
     Da chiamare a ogni fix PRIMA della valutazione trigger.

     - Returns: i metri di salto se il fix va IGNORATO (teletrasporto GPS da
       fermo), `nil` se il fix è buono. Quando ritorna `nil` l'ancora interna
       viene aggiornata al fix corrente.
     */
    func suppressedJumpMeters(fix: CLLocation) -> Double? {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard isTracking else { return nil }
        guard let anchor = lastAcceptedLocation else {
            lastAcceptedLocation = fix
            return nil
        }
        let jump = fix.distance(from: anchor)
        let stationaryLongEnough: Bool
        if let since = stationarySinceMs {
            stationaryLongEnough = nowMs() - since > Self.stationaryThresholdMs
        } else {
            stationaryLongEnough = false
        }
        if stationaryLongEnough && jump > Self.teleportJumpM
            && consecutiveSuppressions < Self.maxConsecutiveSuppressions {
            consecutiveSuppressions += 1
            return jump
        }
        lastAcceptedLocation = fix
        consecutiveSuppressions = 0
        return nil
    }
}
