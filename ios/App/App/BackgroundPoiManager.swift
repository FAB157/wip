import Foundation
import CoreLocation
import UserNotifications
import AudioToolbox
import UIKit
import Network

/**
 * Port iOS di ItaintaBackgroundPoiService.kt + GeofenceBroadcastReceiver.kt.
 *
 * Differenza architetturale: Android usa i geofence dell'OS (cap 100) con un
 * BroadcastReceiver, perché il servizio può essere Dozato. Su iOS l'app con
 * background mode "location" riceve gli update GPS continui anche a schermo
 * spento, quindi i trigger vengono valutati in-process a ogni fix con la
 * STESSA macchina a stati (PENDING → APPROACH_FIRED → ARRIVED_FIRED, TTL 24h,
 * grazia uscita 30 min, filtri accuratezza e bearing). Il monitoraggio regioni
 * CLLocationManager (cap 20) serve solo da assicurazione di rilancio se l'OS
 * termina il processo.
 */
final class BackgroundPoiManager: NSObject, CLLocationManagerDelegate {
    static let shared = BackgroundPoiManager()

    // Costanti allineate ad Android
    private let fetchRetryBackoffMs: Double = 20_000
    private let arrivalRetriggerTtlMs: Double = 24 * 60 * 60 * 1000
    private let exitArrivalGraceMs: Double = 30 * 60 * 1000

    private let locationManager = CLLocationManager()
    private let store = PoiStore.shared
    private let supabase = WipSupabaseClient()
    private let prefs = UserDefaults.standard
    private let workQueue = DispatchQueue(label: "com.itaintasca.poimanager")

    private var lastQueryLocation: CLLocation?
    private var currentPois: [Poi] = []
    private var isFetching = false
    private var lastFetchFailedAt: Double = 0
    private var isRunning = false

    // Impostazioni (persistite in prefs con le stesse chiavi di Android)
    private var isAutomaticMode = true
    private var guideMode = "walking"
    private var transportPref = "auto"
    private var appLanguage = "it"
    private var selectedCategories: [String] = []
    private var modeSwitchStreak = 0
    private var alertRadiusWalk: Double = 150
    private var arrivalRadiusWalk: Double = 30
    private var alertRadiusCar: Double = 300
    private var arrivalRadiusCar: Double = 50

    // Reachability (equivalente di ConnectivityMonitor.isOnline)
    private let pathMonitor = NWPathMonitor()
    private var isOnline = true

    /// Eventi verso il plugin Capacitor: (event, data1JsonString, extraFields)
    var onEvent: ((String, String?, [String: Any]) -> Void)?

    private override init() {
        super.init()
        locationManager.delegate = self
        pathMonitor.pathUpdateHandler = { [weak self] path in
            self?.isOnline = path.status == .satisfied
        }
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
        SpeechQueue.shared.onEvent = { [weak self] event, data in
            self?.sendEvent(event, json: data)
        }
        SpeechQueue.shared.onItineraryFinished = { [weak self] poiId in
            self?.showCheckInNotification(poiId: poiId)
        }
    }

    // MARK: - Avvio / arresto (port di onStartCommand / ACTION_STOP)

    func start(options: [String: Any]) {
        isAutomaticMode = options["isAutomaticMode"] as? Bool ?? true
        guideMode = options["guideMode"] as? String ?? "walking"
        transportPref = options["transportPref"] as? String ?? "auto"
        appLanguage = options["language"] as? String ?? "it"
        let oldCategories = Set(selectedCategories)
        selectedCategories = options["categories"] as? [String] ?? []

        // Range allineati a DISTANCE_CONFIG in src/lib/guideSettings.ts
        alertRadiusWalk = min(max(options["alertRadiusWalk"] as? Double ?? 150, 50), 400)
        arrivalRadiusWalk = min(max(options["arrivalRadiusWalk"] as? Double ?? 30, 15), 100)
        alertRadiusCar = min(max(options["alertRadiusCar"] as? Double ?? 300, 100), 600)
        arrivalRadiusCar = min(max(options["arrivalRadiusCar"] as? Double ?? 50, 20), 150)

        prefs.set(true, forKey: "isServiceActive")
        prefs.set(isAutomaticMode, forKey: "isAutomaticMode")
        prefs.set(selectedCategories, forKey: "selectedCategories")
        prefs.set(guideMode, forKey: "guideMode")
        prefs.set(transportPref, forKey: "transportPref")
        prefs.set(appLanguage, forKey: "language")
        prefs.set(alertRadiusWalk, forKey: "alertRadiusWalk")
        prefs.set(arrivalRadiusWalk, forKey: "arrivalRadiusWalk")
        prefs.set(alertRadiusCar, forKey: "alertRadiusCar")
        prefs.set(arrivalRadiusCar, forKey: "arrivalRadiusCar")

        if !oldCategories.isEmpty && oldCategories != Set(selectedCategories) {
            lastQueryLocation = nil // forza refresh immediato
        }

        if let lat = options["lat"] as? Double, let lon = options["lon"] as? Double {
            checkRefreshPois(at: CLLocation(latitude: lat, longitude: lon))
        }

        startActiveMonitoring()
    }

    /// Riavvio a freddo (rilancio dell'app da parte dell'OS per un evento
    /// location): equivalente di restoreSettingsFromPrefs + START_STICKY.
    func restartFromPrefsIfActive() {
        guard prefs.bool(forKey: "isServiceActive"), !isRunning else { return }
        isAutomaticMode = prefs.object(forKey: "isAutomaticMode") as? Bool ?? true
        guideMode = prefs.string(forKey: "guideMode") ?? "walking"
        transportPref = prefs.string(forKey: "transportPref") ?? "auto"
        appLanguage = prefs.string(forKey: "language") ?? "it"
        selectedCategories = prefs.stringArray(forKey: "selectedCategories") ?? []
        alertRadiusWalk = prefs.object(forKey: "alertRadiusWalk") as? Double ?? 150
        arrivalRadiusWalk = prefs.object(forKey: "arrivalRadiusWalk") as? Double ?? 30
        alertRadiusCar = prefs.object(forKey: "alertRadiusCar") as? Double ?? 300
        arrivalRadiusCar = prefs.object(forKey: "arrivalRadiusCar") as? Double ?? 50
        startActiveMonitoring()
    }

    func stop() {
        prefs.set(false, forKey: "isServiceActive")
        SpeechQueue.shared.stopSpeaking()
        isRunning = false
        locationManager.stopUpdatingLocation()
        locationManager.stopMonitoringSignificantLocationChanges()
        for region in locationManager.monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
        currentPois = []
        lastQueryLocation = nil
    }

    /// Itinerario manuale: port di syncManualSelection (tappe con priorità).
    func syncManualSelection(poisJson: String) {
        guard let data = poisJson.data(using: .utf8),
              var pois = try? JSONDecoder().decode([Poi].self, from: data) else { return }
        for i in pois.indices { pois[i].isFromItinerary = true }
        store.insertPois(pois)
        currentPois = pois
        refreshMonitoredRegions(around: locationManager.location)
        updateStatus("Audioguida attiva", "\(pois.count) tappe itinerario caricate")
        // initialTrigger: se l'utente parte già dentro il raggio della prima
        // tappa, il teaser parte subito.
        if let loc = locationManager.location { evaluateTriggers(at: loc) }
    }

    private func startActiveMonitoring() {
        isRunning = true
        DispatchQueue.main.async {
            self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
            self.locationManager.distanceFilter = 10
            self.locationManager.allowsBackgroundLocationUpdates = true
            self.locationManager.pausesLocationUpdatesAutomatically = false
            if #available(iOS 11.0, *) {
                self.locationManager.showsBackgroundLocationIndicator = true
            }
            self.locationManager.startUpdatingLocation()
            // Rilancio dell'app se l'OS termina il processo (watchdog iOS)
            self.locationManager.startMonitoringSignificantLocationChanges()

            if let loc = self.locationManager.location {
                self.workQueue.async { self.handleLocation(loc) }
            }
        }
        updateStatus("Audioguida attiva", "Acquisizione posizione...")
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        guard prefs.bool(forKey: "isServiceActive") else { return }
        if !isRunning { restartFromPrefsIfActive() }
        workQueue.async { self.handleLocation(location) }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        // Sentinella o regione POI: assicurano il rilancio dell'app; la
        // valutazione vera avviene sul fix corrente.
        guard prefs.bool(forKey: "isServiceActive") else { return }
        if !isRunning { restartFromPrefsIfActive() }
        if let loc = manager.location { workQueue.async { self.handleLocation(loc) } }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard prefs.bool(forKey: "isServiceActive") else { return }
        if !isRunning { restartFromPrefsIfActive() }
        if let loc = manager.location { workQueue.async { self.handleLocation(loc) } }
    }

    private func handleLocation(_ location: CLLocation) {
        if lastQueryLocation == nil && currentPois.isEmpty {
            updateStatus("Audioguida attiva", "Posizione acquisita. Caricamento radar...")
        }
        maybeSwitchTravelMode(location)
        checkRefreshPois(at: location)
        evaluateTriggers(at: location)
        updateDistanceNotification(location)
    }

    // MARK: - Cambio piedi⇄auto autonomo (isteresi, port 1:1)

    private func maybeSwitchTravelMode(_ location: CLLocation) {
        guard transportPref == "auto", location.speed >= 0 else { return }
        let kmh = location.speed * 3.6
        let target: String
        if kmh >= 12 { target = "driving" }
        else if kmh <= 6 { target = "walking" }
        else { modeSwitchStreak = 0; return }

        if target == guideMode { modeSwitchStreak = 0; return }
        modeSwitchStreak += 1
        guard modeSwitchStreak >= 3 else { return }
        modeSwitchStreak = 0
        guideMode = target
        prefs.set(guideMode, forKey: "guideMode")
        lastQueryLocation = nil // il prossimo fix rifà fetch coi raggi giusti
    }

    // MARK: - Refresh POI (port di checkRefreshGeofences)

    private func checkRefreshPois(at location: CLLocation) {
        let isDriving = guideMode == "driving"
        let refreshThreshold: Double = isDriving ? 1000 : 200
        let radiusKm: Double = isDriving ? 10 : 5

        if let last = lastQueryLocation, last.distance(from: location) <= refreshThreshold { return }
        if nowMs() - lastFetchFailedAt < fetchRetryBackoffMs { return }
        guard !isFetching else { return }
        isFetching = true

        updateStatus("Audioguida attiva", "Ricerca POI in corso...")

        // OFFLINE-FIRST: senza rete niente timeout a vuoto, dritti al pacchetto
        if !isOnline {
            if !refreshFromOfflineDb(at: location) { lastFetchFailedAt = nowMs() }
            isFetching = false
            return
        }

        supabase.fetchPoisNearby(
            lat: location.coordinate.latitude, lon: location.coordinate.longitude,
            radiusKm: radiusKm, uiCategories: selectedCategories, lang: appLanguage
        ) { [weak self] result in
            guard let self = self else { return }
            self.workQueue.async {
                defer { self.isFetching = false }
                switch result {
                case .success(let rawPois):
                    let pois = Self.dedup(rawPois)
                    self.lastQueryLocation = location
                    self.lastFetchFailedAt = 0
                    guard !pois.isEmpty else { return }

                    let isFirstRegistration = self.currentPois.isEmpty &&
                        location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 100
                    self.store.insertPois(pois)
                    self.currentPois = pois
                    self.refreshMonitoredRegions(around: location)

                    // Bonifica stati incoerenti dopo falsi trigger (teleport GPS)
                    let cleanupAlertRad = self.guideMode == "driving" ? self.alertRadiusCar : self.alertRadiusWalk
                    for p in pois where self.store.getTriggerState(p.id) != nil {
                        if location.distance(from: p.coordinate) > cleanupAlertRad * 3 {
                            self.store.deleteTriggerState(p.id)
                        }
                    }

                    self.updateStatus("Audioguida attiva", "\(pois.count) luoghi monitorati")
                    self.sendEvent("poisDownloaded", data1: Self.poisToJsonString(pois))

                    // Scoperta gemme (solo con app in background)
                    let gems = pois.filter { $0.isGem }
                    if !gems.isEmpty && !Self.isAppInForeground() {
                        if let closest = gems.min(by: {
                            location.distance(from: $0.coordinate) < location.distance(from: $1.coordinate)
                        }) {
                            self.showDiscoveryNotification(poi: closest)
                        }
                    }

                    self.generateTeasersInBackground(poiIds: pois.map { $0.id })
                    self.showRadarTeaserNotifications(pois: pois, location: location)

                    if isFirstRegistration {
                        self.evaluateTriggers(at: location)
                    }
                case .failure:
                    // Rete "zombie" o server giù: prova il pacchetto offline
                    if !self.refreshFromOfflineDb(at: location) {
                        self.lastFetchFailedAt = nowMs()
                    }
                }
            }
        }
    }

    /// Radar alimentato dai pacchetti offline (attivazione zero-click).
    @discardableResult
    private func refreshFromOfflineDb(at location: CLLocation) -> Bool {
        let windowRadiusM: Double = guideMode == "driving" ? 5000 : 2000
        let rows = store.offlinePoisNear(
            lat: location.coordinate.latitude, lon: location.coordinate.longitude,
            radiusM: windowRadiusM
        )
        guard !rows.isEmpty else { return false }

        let filtered = rows.map { $0.toPoi() }.filter { PoiCategories.isActive(poi: $0, selected: selectedCategories) }
        let pois = Self.dedup(filtered)
        guard !pois.isEmpty else { return false }

        lastQueryLocation = location
        lastFetchFailedAt = 0
        store.insertPois(pois)
        currentPois = pois
        refreshMonitoredRegions(around: location)
        updateStatus("Audioguida attiva (offline)", "\(pois.count) luoghi dal pacchetto offline")
        sendEvent("poisDownloaded", data1: Self.poisToJsonString(pois))
        return true
    }

    /// Dedup nome+coordinate, identica ad Android/App.tsx.
    private static func dedup(_ rawPois: [Poi]) -> [Poi] {
        var seenNames = Set<String>()
        var seenCoords = Set<String>()
        return rawPois.filter { p in
            let keyName = p.nome.lowercased().trimmingCharacters(in: .whitespaces)
            let keyCoord = String(format: "%.4f_%.4f", p.lat, p.lon)
            if seenNames.contains(keyName) || seenCoords.contains(keyCoord) { return false }
            if !keyName.isEmpty { seenNames.insert(keyName) }
            seenCoords.insert(keyCoord)
            return true
        }
    }

    // MARK: - Regioni monitorate (assicurazione di rilancio)

    private func refreshMonitoredRegions(around location: CLLocation?) {
        let byId = Dictionary(uniqueKeysWithValues: currentPois.map { ($0.id, $0) })
        let windowInput = currentPois.map { poi in
            SlidingWindowLogic.WindowPoi(
                id: poi.id, isGem: poi.isGem,
                distanceM: location.map { $0.distance(from: poi.coordinate) } ?? 0
            )
        }
        let targetIds = SlidingWindowLogic.selectWindow(windowInput, maxPois: SlidingWindowLogic.maxMonitoredRegions)

        DispatchQueue.main.async {
            for region in self.locationManager.monitoredRegions {
                self.locationManager.stopMonitoring(for: region)
            }
            let alertRad = self.guideMode == "driving" ? self.alertRadiusCar : self.alertRadiusWalk
            for id in targetIds {
                guard let poi = byId[id] else { continue }
                let region = CLCircularRegion(
                    center: poi.coordinate.coordinate,
                    radius: alertRad,
                    identifier: poi.id
                )
                region.notifyOnEntry = true
                region.notifyOnExit = true
                self.locationManager.startMonitoring(for: region)
            }
            if let loc = location {
                let sentinel = CLCircularRegion(
                    center: loc.coordinate,
                    radius: SlidingWindowLogic.sentinelRadiusM,
                    identifier: SlidingWindowLogic.sentinelId
                )
                sentinel.notifyOnEntry = false
                sentinel.notifyOnExit = true
                self.locationManager.startMonitoring(for: sentinel)
            }
        }
    }

    // MARK: - Trigger (port della macchina a stati del receiver)

    private var approachSpokenInBatch = false

    private func evaluateTriggers(at location: CLLocation) {
        // Fail-closed: senza fix recente e preciso ogni trigger è sospetto
        let maxAccuracyM: Double = 100
        let maxFixAgeMs: Double = 2 * 60_000
        guard location.horizontalAccuracy > 0,
              location.horizontalAccuracy <= maxAccuracyM,
              nowMs() - location.timestamp.timeIntervalSince1970 * 1000 <= maxFixAgeMs else { return }

        let isDriving = guideMode == "driving"
        let alertRad = isDriving ? alertRadiusCar : alertRadiusWalk
        let arrivalRad = isDriving ? arrivalRadiusCar : arrivalRadiusWalk
        let exitRad = alertRad * 1.5

        struct Candidate {
            let poi: Poi
            let dist: Double
        }

        let candidates = currentPois
            .filter { PoiCategories.isActive(poi: $0, selected: selectedCategories) }
            .map { Candidate(poi: $0, dist: location.distance(from: $0.coordinate)) }
            .sorted {
                if $0.poi.isFromItinerary != $1.poi.isFromItinerary { return $0.poi.isFromItinerary }
                if $0.poi.isGem != $1.poi.isGem { return $0.poi.isGem }
                return $0.dist < $1.dist
            }

        approachSpokenInBatch = false

        for c in candidates {
            let record = store.getTriggerState(c.poi.id)
            let state = record?.state ?? .pending

            // Uscita (isteresi 1.5×): port di handleExitTransitions
            if c.dist > exitRad {
                if state == .approachFired {
                    store.deleteTriggerState(c.poi.id)
                    sendPoiEvent("poiExited", poi: c.poi)
                } else if state == .arrivedFired, let rec = record,
                          nowMs() - rec.updatedAt > exitArrivalGraceMs {
                    store.deleteTriggerState(c.poi.id)
                    sendPoiEvent("poiExited", poi: c.poi)
                }
                continue
            }

            // Sicurezza distanza (come Android: raggio × 2.5 + accuratezza)
            if c.dist <= arrivalRad {
                let arrivedRecently = state == .arrivedFired && record != nil &&
                    (nowMs() - record!.updatedAt) < arrivalRetriggerTtlMs
                if !arrivedRecently {
                    handleArrival(poi: c.poi)
                }
            } else if c.dist <= alertRad && state == .pending {
                if checkBearingFilter(location: location, poiLat: c.poi.lat, poiLon: c.poi.lon) {
                    handleApproach(poi: c.poi, speak: !approachSpokenInBatch)
                    approachSpokenInBatch = true
                }
            }
        }
    }

    private func checkBearingFilter(location: CLLocation, poiLat: Double, poiLon: Double) -> Bool {
        if location.horizontalAccuracy > 50 { return true }
        if location.course < 0 || location.speed < 0.3 { return true }
        let bearingToPoi = Self.bearing(
            from: location.coordinate,
            to: CLLocationCoordinate2D(latitude: poiLat, longitude: poiLon)
        )
        var angleDiff = abs(bearingToPoi - location.course)
        if angleDiff > 180 { angleDiff = 360 - angleDiff }
        return angleDiff <= 60
    }

    private static func bearing(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let lat1 = from.latitude * .pi / 180
        let lat2 = to.latitude * .pi / 180
        let dLon = (to.longitude - from.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        var deg = atan2(y, x) * 180 / .pi
        if deg < 0 { deg += 360 }
        return deg
    }

    private func handleApproach(poi: Poi, speak: Bool) {
        store.setTriggerState(poi.id, .approachFired)
        sendPoiEvent("poiApproaching", poi: poi)

        // Predictive teaser (solo con rete utilizzabile)
        if isOnline { generateTeasersInBackground(poiIds: [poi.id]) }

        let approachMsg: String
        switch appLanguage {
        case "en": approachMsg = "You are approaching \(poi.nome)"
        case "fr": approachMsg = "Vous approchez de \(poi.nome)"
        case "es": approachMsg = "Te estás acercando a \(poi.nome)"
        case "de": approachMsg = "Sie nähern sich \(poi.nome)"
        case "ru": approachMsg = "Вы приближаетесь к \(poi.nome)"
        case "zh": approachMsg = "您正在接近\(poi.nome)"
        default: approachMsg = "Ti stai avvicinando a \(poi.nome)"
        }

        let prefix = poi.isFromItinerary ? "📍 Tappa: " : (poi.isGem ? "💎 " : "")
        let priority = poi.isFromItinerary ? 0 : (poi.isGem ? 1 : 2)
        if speak {
            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                text: "\(prefix)\(approachMsg)", isGem: poi.isGem,
                isItinerary: poi.isFromItinerary, poiId: poi.id,
                priority: priority, kind: "approach"
            ))
        }
        vibrate()
        let notifTitle = poi.isFromItinerary ? "📍 Tappa Itinerario" : "Esplorazione"
        showNotification(
            title: "\(notifTitle): \(poi.nome)",
            body: "Distanza: circa 150m. Tocca per i dettagli.",
            poiId: poi.id, guide: poi.guideDefault, isArrival: false
        )
    }

    private func handleArrival(poi initialPoi: Poi) {
        var poi = initialPoi
        store.setTriggerState(poi.id, .arrivedFired)
        sendPoiEvent("poiArrived", poi: poi)

        let priority = poi.isFromItinerary ? 0 : 1

        let arrivalMsg: String
        switch appLanguage {
        case "en": arrivalMsg = "You arrived at \(poi.nome)."
        case "fr": arrivalMsg = "Vous êtes arrivés a \(poi.nome)."
        case "es": arrivalMsg = "Has llegado a \(poi.nome)."
        case "de": arrivalMsg = "Sie sind in \(poi.nome) angekommen."
        case "ru": arrivalMsg = "Вы прибыли в \(poi.nome)."
        case "zh": arrivalMsg = "您已到达\(poi.nome)。"
        default: arrivalMsg = "Sei arrivato a \(poi.nome)."
        }

        let fallbackTeaser: String
        switch appLanguage {
        case "en": fallbackTeaser = "Open the app to discover the secrets of this place."
        case "fr": fallbackTeaser = "Ouvrez l'application pour découvrir les secrets de ce lieu."
        case "es": fallbackTeaser = "Abre la aplicación para descubrir los secretos de este lugar."
        case "de": fallbackTeaser = "Öffnen Sie die App, um die Geheimnisse dieses Ortes zu entdecken."
        case "ru": fallbackTeaser = "Откройте приложение, чтобы узнать секреты этого места."
        case "zh": fallbackTeaser = "打开应用，探索这个地方的秘密。"
        default: fallbackTeaser = "Apri l'app per scoprire i segreti di questo luogo."
        }

        let speakAndNotify: (Poi) -> Void = { [weak self] poi in
            guard let self = self else { return }
            let teaser = poi.teaserText?.trimmingCharacters(in: .whitespaces)
            let fullMsg = (teaser?.isEmpty == false) ? "\(arrivalMsg) \(teaser!)" : "\(arrivalMsg) \(fallbackTeaser)"

            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                text: fullMsg, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                poiId: poi.id, priority: priority, kind: "arrival"
            ))
            self.vibrate()

            // DAY PASS hands-free: con pass attivo e app in background, dopo il
            // teaser va in coda l'audioguida COMPLETA — stesso contatore prefs.
            if self.isAutomaticMode && !Self.isAppInForeground() {
                let passUsed = self.prefs.integer(forKey: "daypass_used")
                let passActive = BillingLogic.isPassActive(
                    nowMs: nowMs(),
                    expiresAtMs: self.prefs.double(forKey: "daypass_expires_at"),
                    guidesUsed: passUsed,
                    cap: self.prefs.integer(forKey: "daypass_cap")
                )
                if passActive {
                    let playFullText: (String?) -> Void = { fullText in
                        guard let fullText = fullText, !fullText.isEmpty else { return }
                        self.prefs.set(passUsed + 1, forKey: "daypass_used")
                        SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                            text: fullText, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                            poiId: poi.id, priority: priority, kind: "arrival"
                        ))
                        if let extra = self.store.getOfflinePoi(poi.id)?.descriptionShort,
                           !extra.isEmpty, extra != fullText, !fullText.contains(extra) {
                            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                                text: extra, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                                poiId: poi.id, priority: priority, kind: "arrival"
                            ))
                        }
                    }
                    if let localText = self.store.getOfflinePoi(poi.id)?.audioText, !localText.isEmpty {
                        playFullText(localText)
                    } else if self.isOnline {
                        self.supabase.fetchPoiAudioText(poi.id) { playFullText($0) }
                    }
                }
            }

            if self.isAutomaticMode {
                self.showNotification(
                    title: "Sei arrivato!", body: "Avvio audioguida di \(poi.nome)",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true
                )
            } else {
                self.showNotification(
                    title: "Arrivo a \(poi.nome)", body: "Tocca per ascoltare la storia",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true
                )
            }
        }

        // Recovery teaser nullo: prima il pacchetto offline, poi il server
        if poi.teaserText?.isEmpty != false {
            if let offlinePoi = store.getOfflinePoi(poi.id), offlinePoi.teaserText?.isEmpty == false {
                var recovered = offlinePoi.toPoi()
                recovered.isFromItinerary = poi.isFromItinerary
                store.insertPois([recovered])
                speakAndNotify(recovered)
            } else if isOnline {
                supabase.fetchPoiById(poi.id, lang: appLanguage) { [weak self] fresh in
                    self?.workQueue.async {
                        if let fresh = fresh, fresh.teaserText?.isEmpty == false {
                            var updated = fresh
                            updated.isFromItinerary = poi.isFromItinerary
                            self?.store.insertPois([updated])
                            speakAndNotify(updated)
                        } else {
                            speakAndNotify(poi)
                        }
                    }
                }
            } else {
                speakAndNotify(poi)
            }
        } else {
            speakAndNotify(poi)
        }
    }

    // MARK: - Distanze in tempo reale (port di updateDistanceNotification)

    private func updateDistanceNotification(_ location: CLLocation) {
        guard !currentPois.isEmpty else { return }
        var closestPoi: Poi?
        var closestDist = Double.greatestFiniteMagnitude
        var approaching: [[String: Any]] = []

        let states = store.allTriggerStates()
        let alertRad = guideMode == "driving" ? alertRadiusCar : alertRadiusWalk

        for poi in currentPois {
            let dist = location.distance(from: poi.coordinate)
            if dist < closestDist { closestDist = dist; closestPoi = poi }
            if states[poi.id]?.state == .approachFired && dist <= alertRad * 2 {
                approaching.append([
                    "poiId": poi.id, "name": poi.nome,
                    "distance": Int(dist.rounded()),
                    "lat": poi.lat, "lon": poi.lon
                ])
            }
        }

        if !approaching.isEmpty {
            sendEvent("wip-poi-distance-update", json: ["entries": approaching])
        }

        if let poi = closestPoi {
            let distRounded = Int((closestDist / 10).rounded() * 10)
            let statusText = closestDist < 150
                ? "Prossimo: \(poi.nome) (\(distRounded)m)"
                : "\(currentPois.count) luoghi monitorati"
            updateStatus("Audioguida attiva", statusText)
        }
    }

    // MARK: - Teaser radar e notifiche

    private func showRadarTeaserNotifications(pois: [Poi], location: CLLocation) {
        var notified = Set(prefs.stringArray(forKey: "radarTeaserNotified") ?? [])
        let alertRad = guideMode == "driving" ? alertRadiusCar : alertRadiusWalk

        let candidates = pois
            .filter { $0.teaserText?.isEmpty == false && !notified.contains($0.id) }
            .filter { store.getTriggerState($0.id) == nil }
            .map { ($0, location.distance(from: $0.coordinate)) }
            .filter { $0.1 > alertRad }
            .sorted { $0.1 < $1.1 }
            .prefix(2)

        for (poi, dist) in candidates {
            notified.insert(poi.id)
            showTeaserNotification(poi: poi, distanceM: Int(dist))
        }
        if !candidates.isEmpty {
            prefs.set(Array(notified), forKey: "radarTeaserNotified")
        }
    }

    private func showTeaserNotification(poi: Poi, distanceM: Int) {
        postNotification(
            id: "teaser_\(poi.id)",
            title: "📍 \(poi.nome) • \(distanceM)m da te",
            body: poi.teaserText ?? "",
            poiId: poi.id, guide: poi.guideDefault, timeSensitive: false
        )
    }

    private func showDiscoveryNotification(poi: Poi) {
        postNotification(
            id: "gem_\(poi.id)",
            title: "💎 Nuova Gemma Scoperta!",
            body: "\(poi.nome) è nelle vicinanze. Scoprila ora.",
            poiId: poi.id, guide: poi.guideDefault, timeSensitive: false
        )
    }

    private func showCheckInNotification(poiId: String) {
        postNotification(
            id: "checkin",
            title: "Tappa completata! ✅",
            body: "Vuoi passare alla prossima destinazione?",
            poiId: poiId, guide: "", timeSensitive: true, isCheckIn: true
        )
    }

    private func showNotification(title: String, body: String, poiId: String, guide: String, isArrival: Bool) {
        postNotification(
            id: "poi_\(poiId)", title: title, body: body,
            poiId: poiId, guide: guide, timeSensitive: isArrival
        )
    }

    private func postNotification(id: String, title: String, body: String, poiId: String, guide: String, timeSensitive: Bool, isCheckIn: Bool = false) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        // Il tap viene gestito in AppDelegate: salva il pending deep link
        // (stesso meccanismo di MainActivity Android con itainta://poi/…)
        content.userInfo = ["poiId": poiId, "guide": guide, "checkin": isCheckIn]
        if #available(iOS 15.0, *), timeSensitive {
            content.interruptionLevel = .timeSensitive
        }
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    private func vibrate() {
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
    }

    // MARK: - Teaser batch (stesso endpoint del server Vercel)

    private func generateTeasersInBackground(poiIds: [String]) {
        guard let url = URL(string: "https://itainta.vercel.app/api/poi/batch-teaser") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["poiIds": poiIds, "lang": appLanguage])
        URLSession.shared.dataTask(with: req).resume()
    }

    // MARK: - Eventi verso il plugin

    private func updateStatus(_ title: String, _ text: String) {
        sendEvent("statusUpdate", data1: text + dayPassSuffix())
    }

    /// Con Day Pass attivo mostra le guide rimaste, come la notifica Android.
    private func dayPassSuffix() -> String {
        let used = prefs.integer(forKey: "daypass_used")
        let cap = prefs.integer(forKey: "daypass_cap")
        let active = BillingLogic.isPassActive(
            nowMs: nowMs(), expiresAtMs: prefs.double(forKey: "daypass_expires_at"),
            guidesUsed: used, cap: cap
        )
        return active ? "  ·  🎫 Pass: \(cap - used)/\(cap)" : ""
    }

    private func sendPoiEvent(_ event: String, poi: Poi) {
        let json: [String: Any] = ["poiId": poi.id, "poiName": poi.nome, "lat": poi.lat, "lon": poi.lon]
        sendEvent(event, json: json, extra: ["poiId": poi.id, "poiName": poi.nome])
    }

    func sendEvent(_ event: String, json: [String: Any], extra: [String: Any] = [:]) {
        if let data = try? JSONSerialization.data(withJSONObject: json),
           let str = String(data: data, encoding: .utf8) {
            sendEvent(event, data1: str, extra: extra)
        }
    }

    private func sendEvent(_ event: String, data1: String?, extra: [String: Any] = [:]) {
        onEvent?(event, data1, extra)
    }

    private static func poisToJsonString(_ pois: [Poi]) -> String {
        let arr = pois.map { $0.toJson() }
        if let data = try? JSONSerialization.data(withJSONObject: arr),
           let str = String(data: data, encoding: .utf8) {
            return str
        }
        return "[]"
    }

    static func isAppInForeground() -> Bool {
        if Thread.isMainThread {
            return UIApplication.shared.applicationState == .active
        }
        return DispatchQueue.main.sync { UIApplication.shared.applicationState == .active }
    }
}
