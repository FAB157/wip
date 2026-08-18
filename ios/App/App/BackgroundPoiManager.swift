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

    /// Categoria/azione della notifica di arrivo: il tasto ▶ Ascolta parte in
    /// background (options: []) senza aprire la UI — è il sostituto iOS del
    /// launchApp() Android, che qui la piattaforma vieta.
    static let arrivalCategoryId = "WIP_POI_ARRIVAL"
    static let listenActionId = "WIP_ACTION_LISTEN"

    // Costanti allineate ad Android
    private let fetchRetryBackoffMs: Double = 20_000
    private let arrivalRetriggerTtlMs: Double = 24 * 60 * 60 * 1000
    private let exitArrivalGraceMs: Double = 30 * 60 * 1000
    /// Cooldown prima di RI-annunciare l'avvicinamento a un POI già annunciato
    /// e poi uscito dall'isteresi: il GPS che rimbalza dentro/fuori (pineta,
    /// chiome fitte) non deve rifare banner+notifica ogni pochi metri.
    private let approachRetriggerCooldownMs: Double = 30 * 60 * 1000
    /// Dopo un'uscita recente anche l'ARRIVO aspetta: un rientro immediato nel
    /// cerchio di arrivo è quasi sempre rumore GPS, non una nuova visita.
    private let arrivalAfterExitCooldownMs: Double = 10 * 60 * 1000

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
    // Tiering posizione: chiave "armed-driving" già applicata, per non
    // ri-settare desiredAccuracy a ogni fix. Parte "armed" = alta precisione = sicuro.
    private var appliedTierKey = ""
    private var alertRadiusWalk: Double = 150
    private var arrivalRadiusWalk: Double = 30
    private var alertRadiusCar: Double = 300
    private var arrivalRadiusCar: Double = 50

    /// Modalità «solo vibrazione + testo»: il WebView la scrive col plugin
    /// Preferences di Capacitor, che su iOS persiste in UserDefaults.standard
    /// con il prefisso di gruppo "CapacitorStorage." — stessa chiave di
    /// Android (parità: wip_silent_mode = '1'). Letta a ogni trigger, così un
    /// cambio dalla UI vale subito senza riavviare il servizio.
    private var isSilentMode: Bool {
        prefs.string(forKey: "CapacitorStorage.wip_silent_mode") == "1"
    }

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
        MotionActivityGate.shared.stop()
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
        // Mirror storico ascolti: scarica gli id già ascoltati dal cloud
        // (best-effort). Serve al check "già acquistato = gratis" del trigger,
        // che così funziona anche offline.
        ListeningHistoryStore.shared.syncFromCloud()
        // Igiene cache prefetch MP3: via i file più vecchi di 24h
        DispatchQueue.global(qos: .utility).async { AudioPrefetchManager.cleanup() }
        // Gating sensori anti-teletrasporto GPS (fail-safe, vedi MotionActivityGate)
        MotionActivityGate.shared.start()
        registerNotificationCategories()
        DispatchQueue.main.async {
            // In auto serve la qualità di fix massima: "Best" in macchina
            // produce spesso 50-100 m di accuratezza (vetri, velocità) e i
            // trigger scattano tardi o vengono scartati dal filtro fail-closed.
            // BestForNavigation è il profilo che Apple riserva ai navigatori.
            self.locationManager.desiredAccuracy = self.guideMode == "driving"
                ? kCLLocationAccuracyBestForNavigation : kCLLocationAccuracyBest
            // A piedi il cerchio di arrivo è 30 m: con un filtro di 10 m il
            // trigger può arrivare 7 s dopo l'ingresso (1,4 m/s). 5 m dimezza
            // la latenza; il GPS è comunque acceso di continuo, il filtro
            // regola solo la frequenza dei callback.
            self.locationManager.distanceFilter = self.guideMode == "driving" ? 10 : 5
            // activityType: iOS ottimizza il duty-cycle del GPS in base all'attività
            // (in auto tollera pause in coda, a piedi calibra diversamente).
            self.locationManager.activityType = self.guideMode == "driving" ? .automotiveNavigation : .fitness
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

    /// Revoca del permesso posizione a runtime (Impostazioni → Posizione → Mai):
    /// senza questo handler il manager restava "attivo" ma cieco, con lo stato
    /// nella UI fermo all'ultimo messaggio. Fermiamo gli update e avvisiamo il
    /// JS; se il permesso torna authorized non serve fare nulla qui, il flusso
    /// di start esistente (start / restartFromPrefsIfActive) gestisce la ripartenza.
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        guard status == .denied || status == .restricted, isRunning else { return }
        isRunning = false
        locationManager.stopUpdatingLocation()
        updateStatus("Audioguida in pausa", "⚠️ Permesso posizione revocato: riattivalo dalle Impostazioni per usare l'audioguida")
    }

    private func handleLocation(_ location: CLLocation) {
        // GATING SENSORI (fail-safe): se Motion & Fitness dice che siamo fermi
        // da >5 minuti e questo fix salta di >100 m dall'ultima posizione
        // accettata, è un "teletrasporto GPS" — il fix viene IGNORATO del
        // tutto (niente trigger, niente refresh, niente bonifiche): stato e
        // cooldown restano identici. Senza permesso/sensore il gate è inerte.
        if let jumpM = MotionActivityGate.shared.suppressedJumpMeters(fix: location) {
            TriggerTelemetry.log(
                poiId: "-", poiName: "motion-gate", phase: "gate",
                result: PredictiveTrigger.Result(
                    decision: .reject, tCpaSeconds: Double.nan, dCpaMeters: Double.nan,
                    distanceNowMeters: jumpM, usedPrediction: false,
                    reason: "motion-gate fermo>5min salto=\(Int(jumpM))m"
                ),
                location: location, isDriving: guideMode == "driving", radiusM: 0
            )
            return
        }
        if lastQueryLocation == nil && currentPois.isEmpty {
            updateStatus("Audioguida attiva", "Posizione acquisita. Caricamento radar...")
        }
        maybeSwitchTravelMode(location)
        checkRefreshPois(at: location)
        // SNAP-TO-PATH (conservativo): scarica il tile strade sul cambio area e
        // valuta i trigger sulla posizione snappata sul percorso; senza tile o
        // strada vicina resta il GPS grezzo. Refresh area, tiering e notifica
        // usano la posizione reale.
        if RoadSnap.shared.shouldRefresh(location) { RoadSnap.shared.refresh(location) }
        let evalLoc = RoadSnap.shared.snap(location, isDriving: guideMode == "driving") ?? location
        evaluateTriggers(at: evalLoc)
        applyLocationTierForProximity(location)
        updateDistanceNotification(location)
    }

    // MARK: - Cambio piedi⇄auto autonomo (isteresi, port 1:1)

    private func maybeSwitchTravelMode(_ location: CLLocation) {
        guard transportPref == "auto", location.speed >= 0 else { return }
        // FLAG "FERMO": non fidarsi della velocità se il fix è di bassa qualità
        // (canyon urbano) — evita il falso passaggio ad "auto" da picchi di
        // velocità fantasma quando in realtà sei fermo o a piedi.
        if location.speedAccuracy >= 0 && location.speedAccuracy > 5 { modeSwitchStreak = 0; return }
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
        // La precisione la applica applyLocationTier (in handleLocation), che
        // tiene conto sia della modalità sia della prossimità a un POI.
        appliedTierKey = ""
    }

    // TIERED LOCATION (parità con Android applyLocationRate): GPS ad alta
    // precisione SOLO quando c'è un POI nella finestra di attenzione; altrimenti
    // posizione economica (WiFi/cella) — in città spesso più precisa del GPS
    // (niente multipath) e con batteria/calore molto più bassi. Nel dubbio
    // (POI non ancora caricati) resta ad alta precisione: il caso peggiore è
    // "risparmia meno", mai "manca un trigger".
    private func applyLocationTierForProximity(_ location: CLLocation) {
        let alertRad = guideMode == "driving" ? alertRadiusCar : alertRadiusWalk
        let armWindow = alertRad * 3.0 + 150.0 // margine per ri-armare in tempo
        let armed: Bool
        if lastQueryLocation == nil {
            armed = true                 // POI non ancora noti → sicuro
        } else if currentPois.isEmpty {
            armed = false                // zona senza POI → risparmia
        } else {
            var nearest = Double.greatestFiniteMagnitude
            for p in currentPois {
                let d = location.distance(from: p.coordinate)
                if d < nearest { nearest = d; if nearest <= armWindow { break } }
            }
            armed = nearest <= armWindow
        }
        applyLocationTier(armed: armed)
    }

    private func applyLocationTier(armed: Bool) {
        let isDriving = guideMode == "driving"
        let key = "\(armed)-\(isDriving)"
        guard key != appliedTierKey else { return }
        appliedTierKey = key
        DispatchQueue.main.async {
            self.locationManager.activityType = isDriving ? .automotiveNavigation : .fitness
            if armed {
                self.locationManager.desiredAccuracy = isDriving
                    ? kCLLocationAccuracyBestForNavigation : kCLLocationAccuracyBest
                self.locationManager.distanceFilter = isDriving ? 10 : 5
            } else {
                self.locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
                self.locationManager.distanceFilter = 80
            }
        }
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
            let isDriving = self.guideMode == "driving"
            for id in targetIds {
                guard let poi = byId[id] else { continue }
                // Raggio della regione = alert calibrato sul perimetro del POI
                // (max con la modalità): il footprint di edifici grandi allarga
                // anche l'assicurazione di rilancio. Cresce solo, mai riduce.
                let (regionAlert, _) = self.effectiveRadii(for: poi, isDriving: isDriving)
                let region = CLCircularRegion(
                    center: poi.coordinate.coordinate,
                    radius: regionAlert,
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

    /// Distanza al fix precedente, per POI: serve a rilevare il superamento
    /// (distanza crescente + CPA alle spalle). Port di `lastDistances`
    /// nel servizio Android.
    private var lastDistances: [String: Double] = [:]

    /// Ultimo fix valutato: serve alle notifiche per dichiarare la distanza
    /// REALE invece della stringa fissa "circa 150m".
    private var lastFixLocation: CLLocation?

    /// Raggi operativi per un POI: max(raggio di modalità, raggio da footprint
    /// OSM) SOLO se il POI ha un ingresso reale (entrance). I default 50/150 di
    /// un POI non processato sono indistinguibili da raggi calibrati, quindi il
    /// footprint entra in gioco solo con entranceLat/Lon valorizzati. Oggi sono
    /// valorizzati solo per i POI online: /api/area/bundle (pacchetti offline)
    /// non li restituisce ancora, quindi OfflinePoi.toPoi() li passa nil finché
    /// il server non li aggiunge (vedi commento in PoiModels.swift) — nessuna
    /// modifica qui necessaria per quel giorno, questo gate basta già. Il max
    /// non riduce MAI i default di modalità: una piazza ottiene un raggio
    /// grande, una statua resta stretta. Mirror di radiiForTransport (guideSettings.ts).
    private func effectiveRadii(for poi: Poi, isDriving: Bool) -> (alert: Double, arrival: Double) {
        var alert = isDriving ? alertRadiusCar : alertRadiusWalk
        var arrival = isDriving ? arrivalRadiusCar : arrivalRadiusWalk
        let hasEntrance = poi.entranceLat != nil && poi.entranceLon != nil
        let fpAlert = Double(poi.alertRadius ?? 0)
        let fpArrival = Double(poi.arrivalRadius ?? 0)
        if hasEntrance && (fpAlert > 0 || fpArrival > 0) {
            if fpAlert > 0 { alert = max(alert, fpAlert) }
            if fpArrival > 0 { arrival = max(arrival, fpArrival) }
        }
        return (alert, arrival)
    }

    // Helper senza force-unwrap per il ramo EXITED→pending della finestra
    // predittiva allargata: record nil (mai stato persistito per questo POI)
    // non è un caso anomalo, significa semplicemente "non ancora pronto per
    // un nuovo tentativo" — stesso esito del vecchio `record != nil && ...`.
    private func isExitedRetriggerReady(_ record: TriggerStateRecord?) -> Bool {
        guard let record = record else { return false }
        return (nowMs() - record.updatedAt) > approachRetriggerCooldownMs
    }

    private func evaluateTriggers(at location: CLLocation) {
        lastFixLocation = location
        // Fail-closed: senza fix recente e preciso ogni trigger è sospetto
        let maxAccuracyM: Double = 100
        let maxFixAgeMs: Double = 2 * 60_000
        guard location.horizontalAccuracy > 0,
              location.horizontalAccuracy <= maxAccuracyM,
              nowMs() - location.timestamp.timeIntervalSince1970 * 1000 <= maxFixAgeMs else { return }

        let isDriving = guideMode == "driving"
        // I raggi NON sono più costanti di batch: dal footprint OSM ogni POI può
        // avere raggi calibrati sul suo perimetro reale. Vengono calcolati per
        // POI dentro il loop (effectiveRadii), mirror di radiiForTransport web.

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
            // Raggi calibrati sul perimetro (footprint OSM) del singolo POI,
            // gated sull'ingresso reale — mirror di radiiForTransport
            // (src/lib/guideSettings.ts) e della modifica gemella Android.
            // Senza footprint/ingresso restano i raggi di modalità (identico a prima).
            let (alertRad, arrivalRad) = effectiveRadii(for: c.poi, isDriving: isDriving)
            let exitRad = alertRad * 1.5
            let record = store.getTriggerState(c.poi.id)
            let state = record?.state ?? .pending

            // ── Superamento (PASSED) ──
            // Il CPA è alle spalle e la distanza cresce: la voce che racconta
            // questo monumento non ha più senso. Prima questo caso non
            // esisteva — l'uscita a 1.5× resettava lo stato in silenzio, ma
            // l'audio continuava fino a fine teaser.
            if state == .approachFired || state == .arrivedFired,
               let prev = lastDistances[c.poi.id], c.dist > prev, c.dist > arrivalRad {
                // Allineato ad Android: il predittore usa l'INGRESSO (coordinate
                // = entranceLat/Lon ?? lat/lon), non il centroide grezzo. Se non
                // c'è ingresso, coordinate == lat/lon → comportamento identico.
                let passPred = PredictiveTrigger.evaluate(
                    location: location,
                    poiLat: c.poi.coordinate.coordinate.latitude,
                    poiLon: c.poi.coordinate.coordinate.longitude,
                    radiusM: alertRad, isDriving: isDriving
                )
                if PredictiveTrigger.hasPassed(
                    tCpaSeconds: passPred.tCpaSeconds, distanceNow: c.dist,
                    previousDistance: prev,
                    // Pavimento radiale per modalità: in auto basta uscire dal
                    // cerchio di arrivo (sorpasso netto); a piedi la voce vive
                    // finché resti nel raggio di alert — a 35 m dal centroide
                    // di un duomo sei ancora davanti al duomo.
                    radiusM: isDriving ? arrivalRad : alertRad,
                    speedMs: location.speed
                ) {
                    TriggerTelemetry.log(
                        poiId: c.poi.id, poiName: c.poi.nome, phase: "passed",
                        result: passPred, location: location, isDriving: isDriving, radiusM: alertRad
                    )
                    store.setTriggerState(c.poi.id, .passed)
                    // Silenzio deliberato ma CHIRURGICO: si spegne solo la voce
                    // di QUESTO POI — superare A mentre suona la guida di B
                    // non deve uccidere B.
                    SpeechQueue.shared.stopSpeaking(poiId: c.poi.id)
                    sendPoiEvent("poiPassed", poi: c.poi)
                    lastDistances[c.poi.id] = c.dist
                    continue
                }
            }
            lastDistances[c.poi.id] = c.dist

            // Uscita (isteresi 1.5×): port di handleExitTransitions.
            //
            // ATTENZIONE all'ordine: questo blocco NON deve interrompere i POI
            // ancora .pending, altrimenti la finestra predittiva allargata a
            // 3× più sotto sarebbe codice morto (ogni candidato oltre 1.5×
            // verrebbe scartato qui prima di essere valutato).
            if c.dist > exitRad {
                if state == .approachFired {
                    // Niente cancellazione secca: EXITED col suo timestamp fa
                    // da cooldown — cancellare permetteva un nuovo annuncio al
                    // primo rientro nel raggio (banner ogni pochi metri).
                    store.setTriggerState(c.poi.id, .exited)
                    sendPoiEvent("poiExited", poi: c.poi)
                    continue
                }
                if state == .arrivedFired {
                    if let rec = record, nowMs() - rec.updatedAt > exitArrivalGraceMs {
                        store.setTriggerState(c.poi.id, .exited)
                        sendPoiEvent("poiExited", poi: c.poi)
                    }
                    continue
                }
                if state == .passed {
                    // Fuori dall'isteresi e già superato: EXITED — si libera
                    // per una visita futura ma solo dopo il cooldown (la
                    // cancellazione secca riabilitava subito arrivo/annuncio).
                    store.setTriggerState(c.poi.id, .exited)
                    continue
                }
                if state == .exited { continue }
                // .pending → prosegue verso la valutazione predittiva.
            }

            // Sicurezza distanza (come Android: raggio × 2.5 + accuratezza)
            if c.dist <= arrivalRad {
                // Il TTL 24h ora copre anche PASSED (prima lo bypassava e un
                // POI superato ri-arrivava al primo rientro); EXITED recente
                // blocca il rientro-da-rumore-GPS con un cooldown più corto.
                // record nil è lo stato normale al primo incontro col POI
                // (nessun trigger persistito ancora): age = infinito, cioè
                // "mai bloccato" — niente force-unwrap, stesso risultato.
                let age: Double
                if let record = record {
                    age = nowMs() - record.updatedAt
                } else {
                    age = Double.infinity
                }
                let blockedArrival =
                    ((state == .arrivedFired || state == .passed) && age < arrivalRetriggerTtlMs) ||
                    (state == .exited && age < arrivalAfterExitCooldownMs)
                if !blockedArrival {
                    handleArrival(poi: c.poi)
                }
            // Finestra allargata a 3× il raggio: il predittore deve poter
            // annunciare PRIMA dell'ingresso nel cerchio — è lì che si
            // recupera la latenza. Dentro `evaluate` il vincolo su t_cpa
            // impedisce comunque gli annunci troppo anticipati.
            } else if c.dist <= alertRad * 3 && (state == .pending ||
                (state == .exited && isExitedRetriggerReady(record))) {
                // Predittore CPA al posto del vecchio filtro ±60°: valuta se
                // l'utente è realmente IN ROTTA e se il momento è quello
                // giusto, invece di limitarsi a vetare le direzioni sbagliate.
                // Ingresso invece del centroide (allineato ad Android).
                let pred = PredictiveTrigger.evaluate(
                    location: location,
                    poiLat: c.poi.coordinate.coordinate.latitude,
                    poiLon: c.poi.coordinate.coordinate.longitude,
                    radiusM: alertRad,
                    isDriving: isDriving
                )
                TriggerTelemetry.log(
                    poiId: c.poi.id, poiName: c.poi.nome, phase: "approach",
                    result: pred, location: location, isDriving: isDriving, radiusM: alertRad
                )
                if pred.decision == .fire {
                    handleApproach(poi: c.poi, speak: !approachSpokenInBatch)
                    approachSpokenInBatch = true
                }
            }
        }
    }

    // checkBearingFilter RIMOSSO: sostituito da PredictiveTrigger.evaluate().
    //
    // Il vecchio filtro confrontava il course con ±60° come VETO. Due difetti:
    //   1. poteva solo sopprimere un annuncio, mai anticiparlo — quindi non
    //      toccava il problema del "notifica quando l'ho già superato";
    //   2. si disattivava (`return true`) con horizontalAccuracy > 50 o
    //      speed < 0.3, cioè nei centri storici e col turista che rallenta
    //      avvicinandosi: nella pratica non filtrava quasi nulla.
    // Vedi PredictiveTrigger.swift. `bearing(from:to:)` resta perché serve
    // alla UI direzionale (freccia/bussola).

    static func bearing(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
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

        // ✅ [PREFETCH MP3] - Al primo avviso scarichiamo in background l'MP3
        // dell'audioguida nella cache locale: al trigger di arrivo la
        // riproduzione parte istantanea (best-effort, mai bloccante).
        prefetchAudio(for: poi)

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

        // Prefisso PARLATO: mai emoji qui — AVSpeechSynthesizer le legge per
        // nome ("💎" → "pietra preziosa", "📍" → "puntina"). Solo parole.
        let prefix: String
        if poi.isFromItinerary {
            switch appLanguage {
            case "en": prefix = "Itinerary stop: "
            case "fr": prefix = "Étape de l'itinéraire : "
            case "es": prefix = "Parada del itinerario: "
            case "de": prefix = "Etappe der Route: "
            case "ru": prefix = "Остановка маршрута: "
            case "zh": prefix = "行程站点："
            default: prefix = "Tappa dell'itinerario: "
            }
        } else if poi.isGem {
            switch appLanguage {
            case "en": prefix = "A gem: "
            case "fr": prefix = "Une gemme : "
            case "es": prefix = "Una gema: "
            case "de": prefix = "Ein Juwel: "
            case "ru": prefix = "Жемчужина: "
            case "zh": prefix = "瑰宝："
            default: prefix = "Una gemma: "
            }
        } else {
            prefix = ""
        }
        let priority = poi.isFromItinerary ? 0 : (poi.isGem ? 1 : 2)
        // MODALITÀ «SOLO VIBRAZIONE + TESTO» (wip_silent_mode): niente voce —
        // aptico (solo foreground: in background iOS non consente vibrazioni
        // esplicite, ci pensa la notifica senza suono) + notifica col testo.
        // Stato/cooldown già aggiornati sopra: nessun trigger perso.
        let silent = isSilentMode
        if speak && !silent {
            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                text: "\(prefix)\(approachMsg)", isGem: poi.isGem,
                isItinerary: poi.isFromItinerary, poiId: poi.id,
                priority: priority, kind: "approach"
            ))
        }
        if silent { silentHaptic() } else { vibrate() }
        let notifTitle = poi.isFromItinerary ? "📍 Tappa Itinerario" : "Esplorazione"
        // Distanza REALE, non la stringa fissa "circa 150m": il raggio di
        // alert cambia fra piedi (150 m) e auto (300 m), e l'utente vedeva
        // "150m" anche per un POI a 300 m o già superato.
        let realDist = lastFixLocation.map { Int($0.distance(from: poi.coordinate)) } ?? -1
        let distText = realDist >= 0 ? "A circa \(realDist) m." : ""
        if silent {
            // In silenzioso il testo fa il lavoro della voce: body esteso col
            // messaggio di avvicinamento (già nella lingua dell'utente).
            showNotification(
                title: "\(notifTitle): \(poi.nome)",
                body: "\(approachMsg). \(distText)".trimmingCharacters(in: .whitespaces),
                poiId: poi.id, guide: poi.guideDefault, isArrival: false
            )
        } else {
            showNotification(
                title: "\(notifTitle): \(poi.nome)",
                body: "\(distText) Tocca per ascoltare.".trimmingCharacters(in: .whitespaces),
                poiId: poi.id, guide: poi.guideDefault, isArrival: false
            )
        }
    }

    /// Prefetch dell'MP3 dell'audioguida (port di AudioPrefetchManager Android):
    /// testo dal pacchetto offline se c'è, altrimenti da shared_pois. Tutto
    /// best-effort, nessun errore risale al chiamante.
    private func prefetchAudio(for poi: Poi) {
        guard isOnline else { return }
        let lang = appLanguage
        guard AudioPrefetchManager.cachedFile(poiId: poi.id, lang: lang) == nil else { return }
        // Testo offline SOLO se il pacchetto è nella lingua richiesta
        // (mono-lingua): altrimenti si prende il testo tradotto dal cloud.
        if let localText = store.getOfflineAudioText(poi.id, lang: lang) {
            AudioPrefetchManager.prefetch(poiId: poi.id, lang: lang, character: poi.guideDefault, text: localText)
        } else {
            // Testo NELLA LINGUA dell'utente (get-or-create per-lingua), non i
            // campi italiani grezzi: così l'MP3 prefetchato è già tradotto.
            // Token utente se disponibile (rollout fase 1, vedi WipSupabaseClient
            // .fetchAudioguideText): mai bloccante se assente.
            let audioguideToken = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken)
            supabase.fetchAudioguideText(poiId: poi.id, lang: lang, character: poi.guideDefault, accessToken: audioguideToken) { text in
                AudioPrefetchManager.prefetch(poiId: poi.id, lang: lang, character: poi.guideDefault, text: text)
            }
        }
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
            // teaser nil/vuoto è normale (non tutti i POI hanno un teaser
            // dedicato): fallbackTeaser copre già quel caso, quindi if-let
            // invece del force-unwrap non cambia alcun comportamento.
            let fullMsg: String
            if let teaser = teaser, !teaser.isEmpty {
                fullMsg = "\(arrivalMsg) \(teaser)"
            } else {
                fullMsg = "\(arrivalMsg) \(fallbackTeaser)"
            }

            // MODALITÀ «SOLO VIBRAZIONE + TESTO» (wip_silent_mode): niente
            // SpeechQueue né auto-play (il pass NON si consuma) — aptico se
            // l'app è in foreground e notifica SENZA suono col teaser ben
            // visibile nel body. L'azione ▶ Ascolta resta il modo per sentire
            // la guida. Stato ARRIVED_FIRED e cooldown già scritti sopra:
            // macchina a stati identica, nessun trigger perso.
            if self.isSilentMode {
                self.silentHaptic(arrival: true)
                // Il titolo dice già "sei arrivato": il body è tutto per il
                // teaser (esteso), più l'istruzione per l'azione Ascolta.
                // Niente force-unwrap (stile del file): if-let con fallback.
                let teaserBody: String
                if let t = teaser, !t.isEmpty { teaserBody = t } else { teaserBody = fallbackTeaser }
                self.showNotification(
                    title: "Sei arrivato a \(poi.nome)",
                    body: "\(teaserBody)\n▶ Tieni premuto e scegli Ascolta per la guida audio.",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true,
                    withListenAction: true, muted: true
                )
                return
            }

            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                text: fullMsg, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                poiId: poi.id, priority: priority, kind: "arrival"
            ))
            self.vibrate(arrival: true)

            // DAY PASS hands-free: con pass attivo e app in background, dopo il
            // teaser va in coda l'audioguida COMPLETA — stesso contatore prefs.
            // GIÀ ACQUISTATO: un POI presente nello storico ascolti (mirror
            // locale sincronizzato dal cloud) è riprodotto GRATIS senza
            // consumare il pass — stesso ordine del web
            // (dayPassService.authorizeGuidePlayback).
            let alreadyPurchased = ListeningHistoryStore.shared.isAlreadyPurchased(poi.id)
            let passUsed = self.prefs.integer(forKey: "daypass_used")
            let passActive = BillingLogic.isPassActive(
                nowMs: nowMs(),
                expiresAtMs: self.prefs.double(forKey: "daypass_expires_at"),
                guidesUsed: passUsed,
                cap: self.prefs.integer(forKey: "daypass_cap")
            )
            // Autorizzazione calcolata UNA sola volta: decide sia l'auto-play
            // sia testo e azione della notifica (prima veniva rivalutata due
            // volte e poteva divergere a cavallo del consumo del pass).
            let willAutoPlay = self.isAutomaticMode && !Self.isAppInForeground()
                && (alreadyPurchased || passActive)
            if willAutoPlay {
                // CATENA FALLBACK GUIDA COMPLETA (speculare ad Android):
                // 1) MP3 prefetchato in cache locale (partenza istantanea)
                // 2) MP3 scaricabile ORA (online; server già caldo grazie
                //    al prefetch dell'approach → di solito solo redirect)
                // 3) testo integrale audio_text letto dal TTS di sistema
                // Il teaser (già in coda sopra) e la notifica (sotto) sono
                // i gradini 4 e 5: mai silenzio totale.
                let playFullText: (String?, String?) -> Void = { fullText, mp3Path in
                    let hasText = (fullText?.isEmpty == false)
                    guard hasText || mp3Path != nil else {
                        // Niente da riprodurre: la notifica "in riproduzione"
                        // (già postata sotto) mentirebbe — stessa id, la
                        // sostituisce quella col tasto ▶ Ascolta.
                        self.showNotification(
                            title: "Sei arrivato a \(poi.nome)",
                            body: "Tieni premuto e scegli ▶ Ascolta: la guida parte senza sbloccare il telefono",
                            poiId: poi.id, guide: poi.guideDefault, isArrival: true,
                            withListenAction: true
                        )
                        return
                    }
                    // Il pass si consuma solo se il POI NON era già acquistato
                    if !alreadyPurchased {
                        self.prefs.set(passUsed + 1, forKey: "daypass_used")
                    }
                    SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                        text: fullText ?? "", isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                        poiId: poi.id, priority: priority, kind: "arrival",
                        audioFile: mp3Path
                    ))
                    if let full = fullText,
                       let extra = self.store.getOfflineDescriptionShort(poi.id, lang: self.appLanguage),
                       extra != full, !full.contains(extra) {
                        SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                            text: extra, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                            poiId: poi.id, priority: priority, kind: "arrival"
                        ))
                    }
                    // Ogni ascolto completo in background finisce nello
                    // storico (mirror subito, cloud best-effort): il web lo
                    // vedrà in ProfileScreen e i prossimi trigger sono gratis.
                    ListeningHistoryStore.shared.recordListening(
                        poiId: poi.id, poiName: poi.nome, category: poi.poiType
                    )
                }
                let lang = self.appLanguage
                // Testo offline SOLO se il pacchetto è nella lingua dell'utente:
                // altrimenti nil → più sotto si scarica il testo tradotto dal
                // cloud (fetchAudioguideText). Evita la voce nella lingua giusta
                // che legge testo di un'altra lingua (bug mono-lingua).
                let localText = self.store.getOfflineAudioText(poi.id, lang: lang)
                if let cachedMp3 = AudioPrefetchManager.cachedFile(poiId: poi.id, lang: lang) {
                    playFullText(localText, cachedMp3.path)
                } else if let localText = localText, !localText.isEmpty {
                    if self.isOnline {
                        // Timeout corto: se il server deve sintetizzare da
                        // zero non teniamo l'utente in attesa, TTS del testo.
                        AudioPrefetchManager.download(
                            poiId: poi.id, lang: lang,
                            character: poi.guideDefault, text: localText, timeout: 25
                        ) { file in
                            self.workQueue.async { playFullText(localText, file?.path) }
                        }
                    } else {
                        playFullText(localText, nil)
                    }
                } else if self.isOnline {
                    // Token utente se disponibile (rollout fase 1, vedi
                    // WipSupabaseClient.fetchAudioguideText): mai bloccante se assente.
                    let audioguideToken = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken)
                    self.supabase.fetchAudioguideText(poiId: poi.id, lang: lang, character: poi.guideDefault, accessToken: audioguideToken) { fetched in
                        self.workQueue.async {
                            guard let fetched = fetched, !fetched.isEmpty else {
                                playFullText(nil, nil) // → notifica col tasto Ascolta
                                return
                            }
                            AudioPrefetchManager.download(
                                poiId: poi.id, lang: lang,
                                character: poi.guideDefault, text: fetched, timeout: 25
                            ) { file in
                                self.workQueue.async { playFullText(fetched, file?.path) }
                            }
                        }
                    }
                } else {
                    // Offline e senza testi: niente da riprodurre. Async così
                    // esegue DOPO la notifica "in riproduzione" qui sotto, che
                    // va sostituita (stesso id) da quella col tasto Ascolta.
                    self.workQueue.async { playFullText(nil, nil) }
                }
            }

            // NOTIFICA VERITIERA + AZIONE ▶ ASCOLTA.
            //
            // Ieri diceva sempre "Sei arrivato! Avvio audioguida di X", ma
            // senza pass/acquisto non partiva nulla oltre il teaser. E su iOS,
            // a differenza di Android, il servizio non può lanciare l'app
            // (launchApp) per mostrare il tasto Ascolta: il tasto deve stare
            // SULLA notifica. L'azione ▶ Ascolta esegue in background senza
            // aprire la UI (AppDelegate → playGuideFromNotificationAction) con
            // la stessa catena di pagamento del tasto Ascolta in app.
            if willAutoPlay {
                self.showNotification(
                    title: "Sei arrivato a \(poi.nome)", body: "Audioguida in riproduzione",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true
                )
            } else if Self.isAppInForeground() {
                // App aperta (tipico a piedi): la scheda e l'autoplay li
                // gestisce il JS — "tieni premuto" qui sarebbe un'istruzione
                // per un'altra situazione.
                self.showNotification(
                    title: "Sei arrivato a \(poi.nome)",
                    body: "La scheda del luogo è pronta nell'app",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true
                )
            } else {
                // PREZZO DICHIARATO SULLA NOTIFICA: su lock screen non può
                // esistere un dialogo di conferma (niente UI senza aprire
                // l'app) — il consenso informato sta nel testo, il tap È
                // l'acquisto. Chi ha pass o POI già suo non passa di qui
                // (willAutoPlay) — questo ramo è solo per il per-listen.
                let cost = BillingLogic.defaultGuideCost
                self.showNotification(
                    title: "Sei arrivato a \(poi.nome)",
                    body: "Tieni premuto → ▶ Ascolta: \(cost) crediti e la guida parte senza sbloccare",
                    poiId: poi.id, guide: poi.guideDefault, isArrival: true,
                    withListenAction: true
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
        // Orizzonte utile: il fetch arriva a 5-10 km, ma a piedi un teaser per
        // un POI a 4 km è rumore. 1,2 km ≈ un quarto d'ora di cammino.
        let teaserHorizonM: Double = guideMode == "driving" ? 5000 : 1200

        let candidates = pois
            .filter { $0.teaserText?.isEmpty == false && !notified.contains($0.id) }
            .filter { store.getTriggerState($0.id) == nil }
            .map { ($0, location.distance(from: $0.coordinate)) }
            .filter { $0.1 > alertRad && $0.1 <= teaserHorizonM }
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

    private func showNotification(title: String, body: String, poiId: String, guide: String, isArrival: Bool, withListenAction: Bool = false, muted: Bool = false) {
        postNotification(
            id: "poi_\(poiId)", title: title, body: body,
            poiId: poiId, guide: guide, timeSensitive: isArrival,
            category: withListenAction ? Self.arrivalCategoryId : nil,
            muted: muted
        )
    }

    private func postNotification(id: String, title: String, body: String, poiId: String, guide: String, timeSensitive: Bool, isCheckIn: Bool = false, category: String? = nil, muted: Bool = false) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        // Gerarchia dell'interruzione (port del doppio canale Android).
        // Prima ogni notifica suonava allo stesso modo: un "ti stai
        // avvicinando" interrompeva quanto un arrivo. L'avvicinamento è
        // un'informazione, non un evento: silenzioso e passivo.
        // `muted` (modalità solo vibrazione + testo): resta time-sensitive
        // e ben visibile, ma senza alcun suono.
        content.sound = (timeSensitive && !muted) ? .default : nil
        // Il tap viene gestito in AppDelegate: salva il pending deep link
        // (stesso meccanismo di MainActivity Android con itainta://poi/…)
        content.userInfo = ["poiId": poiId, "guide": guide, "checkin": isCheckIn]
        if let category = category {
            content.categoryIdentifier = category
        }
        if #available(iOS 15.0, *) {
            content.interruptionLevel = timeSensitive ? .timeSensitive : .passive
        }
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    /// Aptico a tre livelli: un tocco leggero in avvicinamento, doppio
    /// all'arrivo, NIENTE al superamento. Il silenzio è informazione: un
    /// suono di "hai superato" sarebbe solo rumore.
    private func vibrate(arrival: Bool = false) {
        if #available(iOS 13.0, *) {
            let generator = UIImpactFeedbackGenerator(style: arrival ? .medium : .light)
            generator.prepare()
            generator.impactOccurred()
            if arrival {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                    generator.impactOccurred()
                }
            }
        } else {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        }
    }

    /// Feedback della modalità «solo vibrazione + testo»: aptico di sistema
    /// (UINotificationFeedbackGenerator) SOLO con app in foreground — in
    /// background iOS non consente vibrazioni esplicite, e a fare da sveglia
    /// è la notifica senza suono. I generator vanno usati sul main thread.
    private func silentHaptic(arrival: Bool = false) {
        guard Self.isAppInForeground() else { return }
        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(arrival ? .success : .warning)
        }
    }

    // MARK: - Azione ▶ Ascolta dalla notifica di arrivo

    /// Registra la categoria con l'azione ▶ Ascolta (idempotente). La UI del
    /// tasto compare tenendo premuta / trascinando la notifica, anche dalla
    /// lock screen.
    private func registerNotificationCategories() {
        let listenTitle: String
        switch appLanguage {
        case "en": listenTitle = "▶ Listen now"
        case "fr": listenTitle = "▶ Écouter"
        case "es": listenTitle = "▶ Escuchar"
        case "de": listenTitle = "▶ Anhören"
        case "ru": listenTitle = "▶ Слушать"
        case "zh": listenTitle = "▶ 立即收听"
        default: listenTitle = "▶ Ascolta ora"
        }
        let listen = UNNotificationAction(
            identifier: Self.listenActionId,
            title: listenTitle,
            options: [] // niente .foreground: esegue in background, schermo bloccato incluso
        )
        let arrival = UNNotificationCategory(
            identifier: Self.arrivalCategoryId,
            actions: [listen],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([arrival])
    }

    /// Tap su ▶ Ascolta: riproduzione nativa SENZA aprire l'app. Stessa catena
    /// di autorizzazione del tasto Ascolta in app (playOfflineGuide): già
    /// acquistato → gratis; Day Pass → contatore pass; altrimenti per-listen a
    /// crediti su snapshot saldo − spese pendenti, annotato nel registro.
    func playGuideFromNotificationAction(poiId: String) {
        workQueue.async { self.playGuideAuthorized(poiId: poiId) }
    }

    private func playGuideAuthorized(poiId: String) {
        // Servizio spento dopo la notifica: SpeechQueue scarterebbe la coda in
        // silenzio. Meglio dirlo che tacere — il tap apre l'app via deep link.
        guard prefs.bool(forKey: "isServiceActive") else {
            notifyListenFailed(poi: store.getPoi(poiId), poiId: poiId, reason: "service_off")
            return
        }
        let poi = currentPois.first(where: { $0.id == poiId })
            ?? store.getPoi(poiId)
            ?? store.getOfflinePoi(poiId)?.toPoi()
        let lang = appLanguage
        let guideCharacter = poi?.guideDefault ?? "nicky"
        let isGem = poi?.isGem ?? false

        let alreadyPurchased = ListeningHistoryStore.shared.isAlreadyPurchased(poiId)
        let passActive = BillingLogic.isPassActive(
            nowMs: nowMs(),
            expiresAtMs: prefs.double(forKey: "daypass_expires_at"),
            guidesUsed: prefs.integer(forKey: "daypass_used"),
            cap: prefs.integer(forKey: "daypass_cap")
        )

        // Addebito SOLO a contenuto pronto: mai pagare il silenzio. Ritorna
        // la modalità di sblocco (per la notifica di conferma) o nil se i
        // crediti non bastano. Stesso ordine di playOfflineGuide.
        let charge: () -> String? = { [weak self] in
            guard let self = self else { return nil }
            if alreadyPurchased { return "purchased" }
            if passActive {
                self.prefs.set(self.prefs.integer(forKey: "daypass_used") + 1, forKey: "daypass_used")
                return "day_pass"
            }
            let snapshot = self.prefs.integer(forKey: "wallet_snapshot_credits")
            let pending = self.store.pendingSpendCredits()
            guard BillingLogic.canSpend(
                snapshotCredits: snapshot, pendingSpendCredits: pending,
                cost: BillingLogic.defaultGuideCost
            ) else { return nil }
            self.store.insertSpend(SpendEntry(
                poiId: poiId, credits: BillingLogic.defaultGuideCost, ts: nowMs()
            ))
            return "per_listen"
        }

        let play: (String?, String?) -> Void = { [weak self] text, mp3Path in
            guard let self = self else { return }
            guard (text?.isEmpty == false) || mp3Path != nil else {
                self.notifyListenFailed(poi: poi, poiId: poiId, reason: "no_text")
                return
            }
            guard let chargeMode = charge() else {
                self.notifyListenFailed(poi: poi, poiId: poiId, reason: "insufficient_credits")
                return
            }
            SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                text: text ?? "", isGem: isGem, isItinerary: false,
                poiId: poiId, priority: 1, kind: "arrival",
                audioFile: mp3Path
            ))
            ListeningHistoryStore.shared.recordListening(
                poiId: poiId, poiName: poi?.nome ?? "", category: poi?.poiType
            )
            // Ricevuta: la notifica col tasto viene sostituita (stesso id) da
            // una passiva che dice cosa è successo davvero — addebito, pass o
            // nessun costo. Il tap la porta alla scheda del POI.
            let receipt: String
            switch chargeMode {
            case "day_pass":
                let used = self.prefs.integer(forKey: "daypass_used")
                let cap = self.prefs.integer(forKey: "daypass_cap")
                receipt = "Audioguida in riproduzione · 🎫 Pass: \(max(0, cap - used))/\(cap) rimaste"
            case "per_listen":
                let remaining = BillingLogic.remainingOffline(
                    snapshotCredits: self.prefs.integer(forKey: "wallet_snapshot_credits"),
                    pendingSpendCredits: self.store.pendingSpendCredits()
                )
                receipt = "Audioguida in riproduzione · \(BillingLogic.defaultGuideCost) crediti usati, saldo \(remaining)"
            default:
                receipt = "Audioguida in riproduzione · già tua, nessun addebito"
            }
            self.postNotification(
                id: "poi_\(poiId)", title: poi?.nome ?? "Audioguida", body: receipt,
                poiId: poiId, guide: poi?.guideDefault ?? "nicky", timeSensitive: false
            )
        }

        // Stessa catena di fallback dell'auto-play: MP3 in cache → testo del
        // pacchetto offline (+MP3 se la rete c'è) → testo da shared_pois. Il
        // testo offline è usato SOLO se il pacchetto è nella lingua dell'utente
        // (mono-lingua): altrimenti nil e si scende alla fetch cloud tradotta.
        let localText = store.getOfflineAudioText(poiId, lang: lang)
        if let cachedMp3 = AudioPrefetchManager.cachedFile(poiId: poiId, lang: lang) {
            play(localText, cachedMp3.path)
        } else if let localText = localText, !localText.isEmpty {
            if isOnline {
                AudioPrefetchManager.download(
                    poiId: poiId, lang: lang,
                    character: guideCharacter, text: localText, timeout: 25
                ) { file in
                    self.workQueue.async { play(localText, file?.path) }
                }
            } else {
                play(localText, nil)
            }
        } else if isOnline {
            // Token utente se disponibile (rollout fase 1, vedi
            // WipSupabaseClient.fetchAudioguideText): mai bloccante se assente.
            let audioguideToken = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken)
            supabase.fetchAudioguideText(poiId: poiId, lang: lang, character: guideCharacter, accessToken: audioguideToken) { fetched in
                self.workQueue.async {
                    guard let fetched = fetched, !fetched.isEmpty else {
                        play(nil, nil) // → notifica "non disponibile"
                        return
                    }
                    AudioPrefetchManager.download(
                        poiId: poiId, lang: lang,
                        character: guideCharacter, text: fetched, timeout: 25
                    ) { file in
                        self.workQueue.async { play(fetched, file?.path) }
                    }
                }
            }
        } else {
            notifyListenFailed(poi: poi, poiId: poiId, reason: "offline_no_text")
        }
    }

    /// L'azione è partita da una notifica: anche il suo esito negativo deve
    /// essere una notifica (l'utente non sta guardando nient'altro).
    private func notifyListenFailed(poi: Poi?, poiId: String, reason: String) {
        let name = poi?.nome ?? "questo luogo"
        let body: String
        switch reason {
        case "insufficient_credits":
            body = "Crediti esauriti: apri l'app per ricaricare e ascoltare \(name)."
        case "offline_no_text":
            body = "Audioguida di \(name) non disponibile offline. Riprova quando torna la rete."
        case "service_off":
            body = "Audioguida disattivata: tocca per aprire l'app e riattivarla."
        default:
            body = "Audioguida di \(name) non ancora pronta. Tocca per aprirla nell'app."
        }
        postNotification(
            id: "listen_fail_\(poiId)", title: "Audioguida non avviata", body: body,
            poiId: poiId, guide: poi?.guideDefault ?? "nicky", timeSensitive: true
        )
    }

    // MARK: - Teaser batch (stesso endpoint del server Vercel)

    private func generateTeasersInBackground(poiIds: [String]) {
        guard let url = URL(string: "https://wip.guide/api/poi/batch-teaser") else { return }
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
        // ts + distanza: il WebView riceve gli eventi trattenuti solo quando
        // si risveglia (sblocco) — senza timestamp mostrava banner "Ascolta"
        // per POI superati da minuti. Il JS scarta gli eventi stantii.
        var json: [String: Any] = [
            "poiId": poi.id, "poiName": poi.nome,
            "lat": poi.lat, "lon": poi.lon, "ts": nowMs()
        ]
        if let fix = lastFixLocation {
            json["distanceM"] = Int(fix.distance(from: poi.coordinate))
        }
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
