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

    // ─────────────────────────────────────────────────────────────────────
    // CONFINAMENTO DI THREAD (23/08/2026)
    //
    // TUTTO lo stato mutabile qui sotto vive SOLO sulla `workQueue` seriale.
    // Prima `currentPois`, `itineraryPois`, `lastQueryLocation` e `guideMode`
    // venivano scritti anche dal main (start/stop/syncManualSelection, chiamati
    // dal plugin Capacitor) mentre la workQueue li leggeva e riassegnava a ogni
    // fix GPS: un array Swift riassegnato sotto una lettura concorrente non è
    // "un valore stantio", è comportamento indefinito — crash casuali,
    // irriproducibili, quasi sempre in strada.
    //
    // Regola da tenere: i metodi pubblici sono solo un `workQueue.async` verso
    // la controparte `…Confinato`; nessuno tocca questi campi fuori dalla
    // workQueue. Le API UIKit/CoreLocation che pretendono il main (i metodi di
    // CLLocationManager, i feedback aptici) si raggiungono con un
    // `DispatchQueue.main.async` in uscita, MAI con un `sync`: la workQueue non
    // deve mai bloccarsi sul main né viceversa (vedi isAppInForeground).
    // ─────────────────────────────────────────────────────────────────────
    private var lastQueryLocation: CLLocation?
    private var currentPois: [Poi] = []
    /// PUNTI D'ARRIVO dei POI di `currentPois`, stesso ordine e stesso indice.
    ///
    /// (23/08/2026) `Poi.coordinate` è una proprietà CALCOLATA: ogni lettura
    /// costruisce fino a tre CLLocation e, per il punto dell'indirizzo, fa
    /// pure una haversine per la guardia dei 250 m. Veniva letta da quattro
    /// posti diversi per ogni POI a ogni fix GPS — su un radar da 120 POI
    /// sono centinaia di allocazioni al secondo, in background, per
    /// ricalcolare sempre lo stesso punto. Il punto non cambia finché non
    /// cambia il radar: si calcola quando si assegna `currentPois` e basta.
    ///
    /// Si scrivono SEMPRE insieme, con `impostaPoiCorrenti(_:)`: mai assegnare
    /// `currentPois` a mano, o gli indici si disallineano.
    private var puntiArrivo: [CLLocation] = []
    private var isFetching = false
    private var lastFetchFailedAt: Double = 0
    private var isRunning = false

    /// Ultima posizione vista dal manager, copia CONFINATA nella workQueue.
    /// Sostituisce le letture di `locationManager.location` fatte fuori dal
    /// main (CLLocationManager non è thread-safe).
    private var ultimaPosizioneNota: CLLocation?

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
            // `isOnline` è stato del manager: si scrive sulla workQueue come
            // tutto il resto (prima lo scriveva la coda di NWPathMonitor
            // mentre la workQueue lo leggeva a ogni fix).
            guard let self = self else { return }
            let online = path.status == .satisfied
            self.workQueue.async { self.isOnline = online }
        }
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
        SpeechQueue.shared.onEvent = { [weak self] event, data in
            self?.sendEvent(event, json: data)
        }
        SpeechQueue.shared.onItineraryFinished = { [weak self] poiId in
            // showCheckInNotification legge appLanguage: workQueue.
            guard let self = self else { return }
            self.workQueue.async { self.showCheckInNotification(poiId: poiId) }
        }
        Self.installaOsservatoriCicloDiVita()
    }

    // MARK: - Ciclo di vita dell'app (sostituisce il main.sync)

    /// Stato «app in primo piano» mantenuto dagli osservatori di ciclo di vita
    /// e letto senza bloccare. Prima `isAppInForeground()` faceva un
    /// `DispatchQueue.main.sync` dalla workQueue: inversione di priorità
    /// garantita e stallo certo ogni volta che il main stava a sua volta
    /// aspettando la workQueue.
    private static let foregroundLock = NSLock()
    private static var appInForegroundFlag = false

    private static func setAppInForeground(_ valore: Bool) {
        foregroundLock.lock()
        appInForegroundFlag = valore
        foregroundLock.unlock()
    }

    /// Registrata una sola volta (init del singleton). Il valore iniziale si
    /// legge sul main, dove `applicationState` è legale.
    private static func installaOsservatoriCicloDiVita() {
        let centro = NotificationCenter.default
        centro.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { _ in setAppInForeground(true) }
        centro.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { _ in setAppInForeground(false) }
        DispatchQueue.main.async {
            setAppInForeground(UIApplication.shared.applicationState == .active)
        }
    }

    // MARK: - Avvio / arresto (port di onStartCommand / ACTION_STOP)

    /// Ingresso pubblico (main / coda del plugin Capacitor): NON tocca lo
    /// stato, lo consegna alla workQueue.
    func start(options: [String: Any]) {
        workQueue.async { self.startConfinato(options: options) }
    }

    private func startConfinato(options: [String: Any]) {
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

        avviaConControlloPermesso()
    }

    // MARK: - Permesso posizione (MAP-02 / MAP-05 / MAP-08, audit 28/08/2026)
    //
    // Prima `startConfinato` accendeva il GPS alla cieca: `startUpdatingLocation`
    // con il permesso mai chiesto (o negato) non fa nulla e non dice niente, e
    // l'utente vedeva "Acquisizione posizione..." per sempre. Ora lo stato
    // dell'autorizzazione si legge PRIMA di partire, sul main (CLLocationManager
    // non è thread-safe), e ogni esito ha un messaggio suo verso il JS.

    /// Avvio differito: il permesso è stato appena chiesto e si riparte dal
    /// callback `locationManagerDidChangeAuthorization`. Stato confinato.
    private var avvioInAttesaDiPermesso = false
    /// Servizio fermato per permesso negato/revocato: se il permesso torna
    /// (callback di autorizzazione) si riparte da solo. Senza questa bandiera
    /// il callback `.authorizedAlways` — che iOS manda anche a ogni avvio —
    /// farebbe partire il monitoraggio due volte accanto a `start`.
    private var fermatoPerPermesso = false

    /// Evento verso il JS quando il permesso non basta o si degrada
    /// (`permissionDowngraded`, payload {status}): "denied" (negato/limitato
    /// dal sistema), "whenInUse" (manca «Sempre»), "reducedAccuracy" (manca
    /// «Posizione esatta»).
    private func segnalaPermessoDegradato(_ stato: String) {
        sendEvent("permissionDowngraded", json: ["status": stato, "ts": nowMs()], extra: ["status": stato])
    }

    /// Legge lo stato del permesso sul main e prosegue sulla workQueue.
    private func avviaConControlloPermesso() {
        DispatchQueue.main.async {
            let stato = self.locationManager.authorizationStatus
            self.workQueue.async { self.avviaSecondoPermesso(stato) }
        }
    }

    private func avviaSecondoPermesso(_ stato: CLAuthorizationStatus) {
        switch stato {
        case .notDetermined:
            // Si chiede «Sempre» e si riparte quando arriva il callback: il
            // prompt di sistema può restare aperto a lungo, non si aspetta.
            avvioInAttesaDiPermesso = true
            updateStatus("Audioguida in attesa", "Concedi il permesso posizione per avviare l'audioguida")
            DispatchQueue.main.async { self.locationManager.requestAlwaysAuthorization() }
        case .denied, .restricted:
            avvioInAttesaDiPermesso = false
            fermatoPerPermesso = true
            isRunning = false
            updateStatus("Audioguida in pausa", "⚠️ Permesso posizione negato: riattivalo nelle Impostazioni")
            segnalaPermessoDegradato("denied")
        case .authorizedWhenInUse:
            // Funziona con l'app aperta; a schermo spento iOS smette di
            // consegnare i fix. Si parte comunque, ma si dice la verità.
            avvioInAttesaDiPermesso = false
            fermatoPerPermesso = false
            startActiveMonitoring()
            updateStatus("Audioguida limitata", "Serve «Sempre» per parlare a schermo spento")
            segnalaPermessoDegradato("whenInUse")
            verificaPrecisioneRidotta()
        case .authorizedAlways:
            avvioInAttesaDiPermesso = false
            fermatoPerPermesso = false
            startActiveMonitoring()
            verificaPrecisioneRidotta()
        @unknown default:
            avvioInAttesaDiPermesso = false
            fermatoPerPermesso = false
            startActiveMonitoring()
        }
    }

    /// PRECISIONE RIDOTTA (MAP-08). Con «Posizione esatta» spenta iOS consegna
    /// fix a ~3 km: nessun trigger a 30 m può scattare, e il servizio taceva
    /// senza spiegare perché. Si chiede la precisione piena temporanea con la
    /// chiave `Audioguida` di NSLocationTemporaryUsageDescriptionDictionary
    /// (Info.plist); se resta ridotta si avvisa. Va chiamata sul main (API di
    /// CLLocationManager) e lascia gli esiti alla workQueue.
    private func verificaPrecisioneRidotta() {
        DispatchQueue.main.async {
            guard self.locationManager.accuracyAuthorization == .reducedAccuracy else { return }
            self.locationManager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "Audioguida") { _ in
                // Il completion arriva sul main: si rilegge lì e si riferisce
                // alla workQueue.
                DispatchQueue.main.async {
                    let ancoraRidotta = self.locationManager.accuracyAuthorization == .reducedAccuracy
                    guard ancoraRidotta else { return }
                    self.workQueue.async {
                        guard self.isRunning else { return }
                        self.updateStatus("Audioguida limitata", "Attiva «Posizione esatta» nelle Impostazioni per riconoscere i monumenti")
                        self.segnalaPermessoDegradato("reducedAccuracy")
                    }
                }
            }
        }
    }

    /// Permesso negato a runtime (revoca, o `didFailWithError` con .denied):
    /// GPS giù, bussola giù, stato e evento verso il JS. Sulla workQueue.
    private func fermaPerPermessoNegato(_ messaggio: String) {
        avvioInAttesaDiPermesso = false
        fermatoPerPermesso = true
        guard isRunning else {
            updateStatus("Audioguida in pausa", messaggio)
            segnalaPermessoDegradato("denied")
            return
        }
        isRunning = false
        DispatchQueue.main.async { self.locationManager.stopUpdatingLocation() }
        // Manager a riposo: anche la bussola si spegne (vedi BearingGate).
        BearingGate.shared.spegniBussola()
        updateStatus("Audioguida in pausa", messaggio)
        segnalaPermessoDegradato("denied")
    }

    /// Riavvio a freddo (rilancio dell'app da parte dell'OS per un evento
    /// location): equivalente di restoreSettingsFromPrefs + START_STICKY.
    func restartFromPrefsIfActive() {
        workQueue.async { self.restartFromPrefsIfActiveConfinato() }
    }

    private func restartFromPrefsIfActiveConfinato() {
        guard prefs.bool(forKey: "isServiceActive"), !isRunning else { return }
        isAutomaticMode = prefs.object(forKey: "isAutomaticMode") as? Bool ?? true
        guideMode = prefs.string(forKey: "guideMode") ?? "walking"
        transportPref = prefs.string(forKey: "transportPref") ?? "auto"
        appLanguage = prefs.string(forKey: "language") ?? "it"
        selectedCategories = prefs.stringArray(forKey: "selectedCategories") ?? []
        // Clamp anche al restore (parità con restoreSettingsFromPrefs Android):
        // un valore sporco in prefs non deve riaprire raggi fuori range.
        alertRadiusWalk = min(max(prefs.object(forKey: "alertRadiusWalk") as? Double ?? 150, 50), 400)
        arrivalRadiusWalk = min(max(prefs.object(forKey: "arrivalRadiusWalk") as? Double ?? 30, 15), 100)
        alertRadiusCar = min(max(prefs.object(forKey: "alertRadiusCar") as? Double ?? 300, 100), 600)
        arrivalRadiusCar = min(max(prefs.object(forKey: "arrivalRadiusCar") as? Double ?? 50, 20), 150)
        // Anche il rilancio a freddo passa dal controllo del permesso: se nel
        // frattempo è stato revocato, si avvisa invece di restare ciechi.
        avviaConControlloPermesso()
    }

    func stop() {
        // La bandiera va giù SUBITO, non quando la coda arriva al turno:
        // getStatus (plugin) e le guardie "isServiceActive" sparse nel file la
        // leggono da altri thread e non devono vedere un servizio ancora
        // acceso dopo che il JS ha ricevuto il resolve. UserDefaults è
        // thread-safe; il resto dello spegnimento resta confinato.
        prefs.set(false, forKey: "isServiceActive")
        workQueue.async { self.stopConfinato() }
    }

    private func stopConfinato() {
        prefs.set(false, forKey: "isServiceActive")
        // (22/08/2026) radarTeaserNotified cresceva per sempre: senza reset
        // allo stop un POI notificato una volta non tornava mai nei teaser
        // radar, nemmeno in un viaggio successivo mesi dopo (come Service.kt).
        prefs.removeObject(forKey: "radarTeaserNotified")
        MotionActivityGate.shared.stop()
        // Guida spenta: bussola giù (accesa a vuoto è solo batteria) e rinvii
        // dimenticati — al prossimo avvio si riparte puliti.
        BearingGate.shared.spegni()
        SpeechQueue.shared.stopSpeaking()
        isRunning = false
        avvioInAttesaDiPermesso = false
        fermatoPerPermesso = false
        // CLLocationManager si tocca sul main (non è thread-safe e la
        // workQueue non deve bloccarsi ad aspettarlo).
        DispatchQueue.main.async {
            self.locationManager.stopUpdatingLocation()
            self.locationManager.stopMonitoringSignificantLocationChanges()
            for region in self.locationManager.monitoredRegions {
                self.locationManager.stopMonitoring(for: region)
            }
        }
        impostaPoiCorrenti([])
        itineraryPois = []
        lastQueryLocation = nil
        ultimaPosizioneNota = nil
    }

    /// Tappe dell'itinerario manuale, tenute SEPARATE dal radar: prima
    /// finivano in currentPois e il primo refresh del radar (200 m a piedi)
    /// le sovrascriveva con i POI della RPC, facendole sparire dalle region
    /// e dai trigger. Ora vengono sempre unite al radar (mergedPois) e
    /// svuotate solo quando il JS manda una selezione vuota o allo stop.
    private var itineraryPois: [Poi] = []

    /// UNICO punto di scrittura del radar attivo (workQueue, come tutto il
    /// resto dello stato). Tiene allineati i punti d'arrivo e pota le distanze
    /// del fix precedente: `lastDistances` è indicizzato per id POI e prima non
    /// veniva mai ripulito — in un viaggio lungo accumulava una voce per ogni
    /// POI incontrato da quando il servizio era acceso, senza che nessuna
    /// potesse più servire (il superamento si valuta solo sui POI del radar).
    private func impostaPoiCorrenti(_ pois: [Poi]) {
        currentPois = pois
        puntiArrivo = pois.map { $0.coordinate }
        if !lastDistances.isEmpty {
            let idAttivi = Set(pois.map { $0.id })
            lastDistances = lastDistances.filter { idAttivi.contains($0.key) }
        }
    }

    /// Punto d'arrivo del POI all'indice dato. Il ricalcolo è una rete di
    /// sicurezza: se per qualunque motivo i due array divergessero, si torna
    /// al comportamento di prima invece di leggere l'indice sbagliato.
    private func puntoArrivo(_ indice: Int, _ poi: Poi) -> CLLocation {
        indice < puntiArrivo.count ? puntiArrivo[indice] : poi.coordinate
    }

    /// Radar + tappe itinerario, senza duplicati (la tappa vince: porta
    /// isFromItinerary=true e la priorità che ne consegue).
    private func mergedPois(_ radar: [Poi]) -> [Poi] {
        guard !itineraryPois.isEmpty else { return radar }
        let itineraryIds = Set(itineraryPois.map { $0.id })
        return itineraryPois + radar.filter { !itineraryIds.contains($0.id) }
    }

    /// Itinerario manuale: port di syncManualSelection (tappe con priorità).
    func syncManualSelection(poisJson: String) {
        workQueue.async { self.syncManualSelectionConfinato(poisJson: poisJson) }
    }

    private func syncManualSelectionConfinato(poisJson: String) {
        guard let data = poisJson.data(using: .utf8),
              var pois = try? JSONDecoder().decode([Poi].self, from: data) else { return }
        for i in pois.indices { pois[i].isFromItinerary = true }
        store.insertPois(pois)
        // Selezione vuota = clear: le tappe escono e resta il solo radar.
        let radarOnly = currentPois.filter { !$0.isFromItinerary }
        itineraryPois = pois
        impostaPoiCorrenti(mergedPois(radarOnly))
        // Posizione dalla copia confinata, non da locationManager.location
        // (main-only): fuori dal main quella lettura era già una corsa.
        refreshMonitoredRegions(around: ultimaPosizioneNota)
        updateStatus("Audioguida attiva", "\(pois.count) tappe itinerario caricate")
        // initialTrigger: se l'utente parte già dentro il raggio della prima
        // tappa, il teaser parte subito.
        if let loc = ultimaPosizioneNota { evaluateTriggers(at: loc) }
    }

    /// Fine del giro (locationService.unsyncTappeGiroFromNative → plugin
    /// clearManualSelection). Prima non esisteva: `syncManualSelection`
    /// SOSTITUISCE la selezione, ma a fine giro il JS non manda nessuna lista,
    /// quindi le tappe di un itinerario già chiuso restavano monitorate — con
    /// priorità sul radar, dentro le 20 region — fino allo stop del servizio.
    /// Port di ItaintaBackgroundPoiPlugin.kt::clearManualSelection.
    func clearManualSelection() {
        workQueue.async { self.clearManualSelectionConfinato() }
    }

    private func clearManualSelectionConfinato() {
        guard !itineraryPois.isEmpty else { return }
        itineraryPois = []
        // Le tappe escono anche dal set monitorato: resta il solo radar.
        impostaPoiCorrenti(currentPois.filter { !$0.isFromItinerary })
        refreshMonitoredRegions(around: ultimaPosizioneNota)
        updateStatus("Audioguida attiva", "\(currentPois.count) luoghi monitorati")
    }

    /// L'utente ha chiuso il banner di quel POI: per il servizio è come se ne
    /// fosse uscito. Lo stato EXITED porta con sé il cooldown già usato dal
    /// resto della macchina a stati (approachRetriggerCooldownMs, 30 min), che
    /// vale sia per l'avviso sia per l'arrivo: non è un "mai più", passata la
    /// mezz'ora il POI torna annunciabile. Senza questo, al fix successivo il
    /// banner appena chiuso tornava su.
    /// Port di ItaintaBackgroundPoiPlugin.kt::markPoiExited.
    func markPoiExited(poiId: String) {
        let id = poiId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        // CHIUDERE IL BANNER VUOL DIRE «NON MI INTERESSA», NON «RIPETIMELO PIU'
        // TARDI» (23/08/2026, parità con ItaintaBackgroundPoiPlugin.kt): prima
        // di tutto si TACE su questo POI. Lasciar finire la frase quando
        // l'utente ha appena chiuso il banner è il contrario di quello che ha
        // chiesto. `stopSpeaking(poiId:)` è per-POI: toglie dalla coda gli
        // elementi di questo luogo e ferma la voce solo se sta parlando LUI —
        // la guida di un altro POI in riproduzione non viene toccata.
        SpeechQueue.shared.stopSpeaking(poiId: id)
        workQueue.async {
            self.store.setTriggerState(id, .exited)
            // Anche il gate di bussola dimentica i rinvii pendenti del POI:
            // altrimenti un rinvio scaduto potrebbe farlo riparlare.
            BearingGate.shared.azzera(poiId: id)
        }
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
        // guideMode è stato confinato nella workQueue: si fotografa QUI e si
        // passa al main come costante, invece di leggerlo da un'altra coda.
        let isDriving = guideMode == "driving"
        DispatchQueue.main.async {
            // In auto serve la qualità di fix massima: "Best" in macchina
            // produce spesso 50-100 m di accuratezza (vetri, velocità) e i
            // trigger scattano tardi o vengono scartati dal filtro fail-closed.
            // BestForNavigation è il profilo che Apple riserva ai navigatori.
            self.locationManager.desiredAccuracy = isDriving
                ? kCLLocationAccuracyBestForNavigation : kCLLocationAccuracyBest
            // A piedi il cerchio di arrivo è 30 m: con un filtro di 10 m il
            // trigger può arrivare 7 s dopo l'ingresso (1,4 m/s). 5 m dimezza
            // la latenza; il GPS è comunque acceso di continuo, il filtro
            // regola solo la frequenza dei callback.
            self.locationManager.distanceFilter = isDriving ? 10 : 5
            // activityType: iOS ottimizza il duty-cycle del GPS in base all'attività
            // (in auto tollera pause in coda, a piedi calibra diversamente).
            self.locationManager.activityType = isDriving ? .automotiveNavigation : .fitness
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
        // `isRunning` è stato confinato: il controllo e l'eventuale ripartenza
        // avvengono sulla workQueue, che è seriale — quindi il restart precede
        // sempre l'handleLocation di questo stesso fix, come prima.
        workQueue.async {
            if !self.isRunning { self.restartFromPrefsIfActiveConfinato() }
            self.handleLocation(location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        // Sentinella o regione POI: assicurano il rilancio dell'app; la
        // valutazione vera avviene sul fix corrente.
        guard prefs.bool(forKey: "isServiceActive") else { return }
        // manager.location si legge QUI (siamo sul thread del delegate),
        // non dentro la workQueue.
        guard let loc = manager.location else { return }
        workQueue.async {
            if !self.isRunning { self.restartFromPrefsIfActiveConfinato() }
            self.handleLocation(loc)
        }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard prefs.bool(forKey: "isServiceActive") else { return }
        guard let loc = manager.location else { return }
        workQueue.async {
            if !self.isRunning { self.restartFromPrefsIfActiveConfinato() }
            self.handleLocation(loc)
        }
    }

    /// Revoca del permesso posizione a runtime (Impostazioni → Posizione → Mai):
    /// senza questo handler il manager restava "attivo" ma cieco, con lo stato
    /// nella UI fermo all'ultimo messaggio. Fermiamo gli update e avvisiamo il
    /// JS; se il permesso torna authorized non serve fare nulla qui, il flusso
    /// di start esistente (start / restartFromPrefsIfActive) gestisce la ripartenza.
    /// (28/08/2026, MAP-05) Prima reagiva SOLO al passaggio a negato: un
    /// declassamento da «Sempre» a «Mentre usi l'app» (Impostazioni, o il
    /// prompt periodico di iOS "continuare a consentire Sempre?") lasciava il
    /// servizio convinto di parlare a schermo spento mentre iOS aveva smesso di
    /// consegnare i fix in background. Ora ogni esito ha la sua risposta, e un
    /// avvio rimasto in attesa del prompt (`avvioInAttesaDiPermesso`) riparte
    /// da qui.
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        workQueue.async {
            guard self.prefs.bool(forKey: "isServiceActive") else { return }
            switch status {
            case .notDetermined:
                return // prompt ancora aperto
            case .denied, .restricted:
                self.fermaPerPermessoNegato("⚠️ Permesso posizione revocato: riattivalo dalle Impostazioni per usare l'audioguida")
            case .authorizedWhenInUse:
                if self.avvioInAttesaDiPermesso || self.fermatoPerPermesso {
                    self.avviaSecondoPermesso(.authorizedWhenInUse)
                } else if self.isRunning {
                    self.updateStatus("Audioguida limitata", "Serve «Sempre» per parlare a schermo spento")
                    self.segnalaPermessoDegradato("whenInUse")
                }
            case .authorizedAlways:
                if self.avvioInAttesaDiPermesso || self.fermatoPerPermesso {
                    // Permesso arrivato (o tornato) mentre il servizio era
                    // fermo per mancanza di permesso: si riparte.
                    self.avviaSecondoPermesso(.authorizedAlways)
                }
            @unknown default:
                return
            }
        }
    }

    /// (28/08/2026, MAP-02) Mai implementato: un `.denied` da Core Location —
    /// l'utente che nega il prompt, o i Servizi di localizzazione spenti a
    /// livello di sistema — arrivava qui e cadeva nel vuoto, col servizio che
    /// mostrava "Acquisizione posizione..." per sempre. Gli altri errori
    /// (`.locationUnknown`, rete) sono transitori: Core Location continua a
    /// provare, non serve fare nulla.
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let errore = error as? CLError, errore.code == .denied else { return }
        workQueue.async {
            self.fermaPerPermessoNegato("⚠️ Permesso posizione negato: riattivalo nelle Impostazioni")
        }
    }

    /// (28/08/2026, MAP-05) Il monitoraggio di una region può fallire per
    /// permesso insufficiente (serve «Sempre»: con «Mentre usi l'app» iOS
    /// rifiuta `startMonitoring`) o per il tetto delle 20 region. Nel primo
    /// caso si avvisa come per il declassamento — la region è l'assicurazione
    /// di rilancio del servizio, senza di essa a processo ucciso non si
    /// riparte; nel secondo si logga e basta (la finestra scorrevole è già
    /// sotto il tetto, è un caso residuo).
    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        let codice = (error as? CLError)?.code
        NSLog("[WIP] monitoraggio region \(region?.identifier ?? "-") fallito: \(error.localizedDescription)")
        guard codice == .denied || codice == .regionMonitoringDenied else { return }
        workQueue.async {
            guard self.isRunning else { return }
            self.updateStatus("Audioguida limitata", "Serve «Sempre» per parlare a schermo spento")
            self.segnalaPermessoDegradato("whenInUse")
        }
    }

    private func handleLocation(_ location: CLLocation) {
        // (28/08/2026, MAP-09) Fix SIMULATI (app di spoofing GPS, Xcode
        // "Simulate Location"): mai un trigger — un'audioguida "ascoltata" da
        // casa consumerebbe pass e crediti su un luogo mai visitato. iOS 15+
        // lo dichiara in `sourceInformation`; il deployment target è 15.1.
        if location.sourceInformation?.isSimulatedBySoftware == true { return }
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
        // Copia confinata: la usano syncManualSelection/clearManualSelection al
        // posto di locationManager.location (main-only).
        ultimaPosizioneNota = location
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
        // Tiering GPS e distanze in tempo reale: una passata sola, sulla
        // posizione REALE (non quella snappata), come prima.
        aggiornaProssimitaEDistanze(location)
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
    /// UNA SOLA PASSATA sul radar per due cose che chiedevano la stessa
    /// misura: il tiering del GPS (c'è un POI nella finestra di attenzione?)
    /// e le distanze in tempo reale (qual è il più vicino, e chi è in
    /// avvicinamento?). Erano due cicli su `currentPois` uno dietro l'altro,
    /// sullo STESSO fix e sugli STESSI punti — il più vicino veniva calcolato
    /// due volte. Soglie, ordine delle operazioni ed eventi restano identici:
    /// il tier si applica prima, come quando erano due funzioni.
    private func aggiornaProssimitaEDistanze(_ location: CLLocation) {
        let alertRad = guideMode == "driving" ? alertRadiusCar : alertRadiusWalk
        let armWindow = alertRad * 3.0 + 150.0 // margine per ri-armare in tempo

        guard !currentPois.isEmpty else {
            // POI non ancora noti → alta precisione (sicuro); radar già
            // interrogato e zona vuota → posizione economica. Nessuna
            // distanza da dichiarare, come prima.
            applyLocationTier(armed: lastQueryLocation == nil)
            return
        }

        let states = store.allTriggerStates()
        var closestPoi: Poi?
        var closestDist = Double.greatestFiniteMagnitude
        var approaching: [[String: Any]] = []

        for (indice, poi) in currentPois.enumerated() {
            let dist = location.distance(from: puntoArrivo(indice, poi))
            if dist < closestDist { closestDist = dist; closestPoi = poi }
            if states[poi.id]?.state == .approachFired && dist <= alertRad * 2 {
                approaching.append([
                    "poiId": poi.id, "name": poi.nome,
                    "distance": Int(dist.rounded()),
                    "lat": poi.lat, "lon": poi.lon
                ])
            }
        }

        // Nel dubbio (POI non ancora caricati) resta ad alta precisione: il
        // caso peggiore è "risparmia meno", mai "manca un trigger".
        applyLocationTier(armed: lastQueryLocation == nil || closestDist <= armWindow)

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
                    // Le tappe itinerario restano sempre nel set monitorato
                    self.impostaPoiCorrenti(self.mergedPois(pois))
                    self.refreshMonitoredRegions(around: location)

                    // Bonifica stati incoerenti dopo falsi trigger (teleport GPS).
                    // Gli stati si leggono in UNA volta: `getTriggerState` per
                    // POI erano fino a 120 salti sulla coda dello store, uno
                    // per POI, per rispondere sempre dallo stesso dizionario.
                    let cleanupAlertRad = self.guideMode == "driving" ? self.alertRadiusCar : self.alertRadiusWalk
                    let statiPersistiti = self.store.allTriggerStates()
                    if !statiPersistiti.isEmpty {
                        for p in pois where statiPersistiti[p.id] != nil {
                            if location.distance(from: p.coordinate) > cleanupAlertRad * 3 {
                                self.store.deleteTriggerState(p.id)
                            }
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

                    // Al server solo i 10 POI più vicini ANCORA senza teaser:
                    // prima partiva tutto il radar (fino a 1.000 id) a ogni
                    // refresh, quasi tutti già con teaser o mai raggiunti.
                    let missingTeaser = pois
                        .filter { $0.teaserText?.isEmpty != false }
                        .sorted { location.distance(from: $0.coordinate) < location.distance(from: $1.coordinate) }
                        .prefix(10)
                        .map { $0.id }
                    if !missingTeaser.isEmpty {
                        self.generateTeasersInBackground(poiIds: Array(missingTeaser))
                    }
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
        impostaPoiCorrenti(mergedPois(pois))
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
        // Punti d'arrivo dall'array già calcolato (vedi `puntiArrivo`): una
        // sola passata per l'indice e per le distanze della finestra.
        var byId: [String: (poi: Poi, punto: CLLocation)] = [:]
        byId.reserveCapacity(currentPois.count)
        var windowInput: [SlidingWindowLogic.WindowPoi] = []
        windowInput.reserveCapacity(currentPois.count)
        for (indice, poi) in currentPois.enumerated() {
            let punto = puntoArrivo(indice, poi)
            byId[poi.id] = (poi, punto)
            windowInput.append(SlidingWindowLogic.WindowPoi(
                id: poi.id, isGem: poi.isGem,
                distanceM: location.map { $0.distance(from: punto) } ?? 0
            ))
        }
        let targetIds = SlidingWindowLogic.selectWindow(windowInput, maxPois: SlidingWindowLogic.maxMonitoredRegions)
        // guideMode fotografato sulla workQueue (stato confinato): il blocco
        // sul main lavora su una costante.
        let isDriving = guideMode == "driving"
        // Raggio della regione = alert calibrato sul perimetro del POI
        // (max con la modalità): il footprint di edifici grandi allarga
        // anche l'assicurazione di rilancio. Cresce solo, mai riduce.
        // Calcolato QUI: effectiveRadii legge alertRadiusWalk/Car, stato
        // confinato nella workQueue.
        var regioniDaMonitorare: [CLCircularRegion] = []
        for id in targetIds {
            guard let voce = byId[id] else { continue }
            let (regionAlert, _) = effectiveRadii(for: voce.poi, isDriving: isDriving)
            let region = CLCircularRegion(
                center: voce.punto.coordinate,
                radius: regionAlert,
                identifier: voce.poi.id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            regioniDaMonitorare.append(region)
        }

        DispatchQueue.main.async {
            // DIFF, non "tutte giù e tutte su". Ogni start/stopMonitoring è
            // una transazione col daemon di sistema, e la finestra scorrevole
            // in cammino cambia due o tre region su venti: disiscriverle e
            // riscriverle tutte a ogni refresh era venti volte il lavoro
            // necessario, con in mezzo una manciata di secondi in cui i POI
            // rimasti uguali non erano monitorati da nessuno.
            var desiderate: [String: CLCircularRegion] = [:]
            desiderate.reserveCapacity(regioniDaMonitorare.count)
            for r in regioniDaMonitorare { desiderate[r.identifier] = r }
            var giaAttive = Set<String>()
            for region in self.locationManager.monitoredRegions {
                // La sentinella si riscrive comunque qui sotto (il centro
                // segue il fix): fuori dal diff.
                if region.identifier == SlidingWindowLogic.sentinelId { continue }
                guard let voluta = desiderate[region.identifier] else {
                    self.locationManager.stopMonitoring(for: region)
                    continue
                }
                if let circolare = region as? CLCircularRegion,
                   Self.stessaRegione(circolare, voluta) {
                    giaAttive.insert(region.identifier) // invariata: non si tocca
                } else {
                    // Stesso POI, cerchio diverso (raggi di modalità cambiati):
                    // va sostituita.
                    self.locationManager.stopMonitoring(for: region)
                }
            }
            for region in regioniDaMonitorare where !giaAttive.contains(region.identifier) {
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
            } else {
                // Senza posizione non c'è una sentinella da riscrivere: si
                // toglie quella vecchia, com'era prima del diff (la vecchia
                // versione le disiscriveva tutte all'inizio).
                for region in self.locationManager.monitoredRegions
                where region.identifier == SlidingWindowLogic.sentinelId {
                    self.locationManager.stopMonitoring(for: region)
                }
            }
        }
    }

    /// Due region sono la stessa cosa per il daemon? Centro (a ~1 cm),
    /// raggio (a mezzo metro) e le due bandiere di notifica. Serve solo al
    /// diff qui sopra: nel dubbio si risponde "diversa" e la region viene
    /// riscritta, cioè il comportamento di prima.
    private static func stessaRegione(_ a: CLCircularRegion, _ b: CLCircularRegion) -> Bool {
        abs(a.radius - b.radius) < 0.5 &&
        abs(a.center.latitude - b.center.latitude) < 1e-7 &&
        abs(a.center.longitude - b.center.longitude) < 1e-7 &&
        a.notifyOnEntry == b.notifyOnEntry &&
        a.notifyOnExit == b.notifyOnExit
    }

    // MARK: - Trigger (port della macchina a stati del receiver)

    private var approachSpokenInBatch = false
    /// (AUD-04) Arrivo già annunciato in questo fix: gli altri arrivi dello
    /// stesso batch ricevono solo la notifica «Ascolta».
    private var arrivalSpokenInBatch = false

    /// Distanza al fix precedente, per POI: serve a rilevare il superamento
    /// (distanza crescente + CPA alle spalle). Port di `lastDistances`
    /// nel servizio Android.
    private var lastDistances: [String: Double] = [:]

    /// Ultimo fix valutato: serve alle notifiche per dichiarare la distanza
    /// REALE invece della stringa fissa "circa 150m".
    private var lastFixLocation: CLLocation?

    /// Raggi operativi per un POI. I raggi calibrati sul perimetro (footprint
    /// OSM) contano SOLO se il POI ha un ingresso reale (entrance): i default
    /// 50/150 di un POI non processato sono indistinguibili da una misura.
    /// Quando ci sono, VINCONO sul default di modalità (in auto solo
    /// allargando); quando non ci sono, il raggio dipende dalla fiducia nel
    /// punto. Mirror di radiiForTransport (guideSettings.ts).
    /// (23/08/2026) Il calcolo vive ora in PoiRadii.effettivi (PoiModels.swift),
    /// UNA sola funzione condivisa da registrazione delle region e valutazione
    /// predittiva, che oltre ai raggi calibrati applica la SCALA DI FIDUCIA DEL
    /// PUNTO (perimetro / ingresso / indirizzo / centroide). Qui restano solo i
    /// raggi di modalità, che sono la preferenza dell'utente.
    private func effectiveRadii(for poi: Poi, isDriving: Bool) -> (alert: Double, arrival: Double) {
        PoiRadii.effettivi(
            poi: poi,
            isDriving: isDriving,
            baseAlert: isDriving ? alertRadiusCar : alertRadiusWalk,
            baseArrival: isDriving ? arrivalRadiusCar : arrivalRadiusWalk
        )
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
        // (28/08/2026, AUD-09) DUE SOGLIE, come Android e web. Fino a 100 m il
        // fix basta per ARMARE e AGGIORNARE la macchina a stati (superamento,
        // uscita dall'isteresi, distanze); per PARLARE — avviso e arrivo, cioè
        // ciò che scrive uno stato, consuma il pass e fa partire la voce —
        // serve un fix entro 50 m. Con 100 m un canyon urbano poteva far
        // "arrivare" l'utente a un POI a due isolati di distanza. Quando il fix
        // non basta NON si scrive nulla: il fix successivo riprova.
        let fixDaTrigger = location.horizontalAccuracy <= 50
        // I raggi NON sono più costanti di batch: dal footprint OSM ogni POI può
        // avere raggi calibrati sul suo perimetro reale. Vengono calcolati per
        // POI dentro il loop (effectiveRadii), mirror di radiiForTransport web.

        struct Candidate {
            let poi: Poi
            /// Punto d'arrivo del POI, letto UNA volta per fix (vedi
            /// `puntiArrivo`): prima ogni ramo qui sotto rileggeva
            /// `poi.coordinate`, che è una proprietà calcolata.
            let punto: CLLocation
            let dist: Double
        }

        // (22/08/2026) Prima il predittore girava su TUTTO il radar a ogni fix
        // (fino a 1.000 POI, telemetria compresa). Ora: categoria attiva →
        // distanza ≤ 3× il raggio di avviso (la finestra allargata del
        // predittore, oltre la quale nessun ramo sotto può scattare) →
        // i 5 più vicini, come Android. I POI con uno stato già acceso
        // (APPROACH/ARRIVED/PASSED) restano sempre in lista, anche oltre i 5
        // o oltre la finestra: devono poter chiudere la loro macchina a stati
        // (uscita dall'isteresi, superamento).
        //
        // (23/08/2026) PRE-FILTRO A RIQUADRO prima di misurare. La passata
        // costosa non era il predittore ma proprio questa: distanza dal
        // perimetro su TUTTI i POI del radar e poi un ordinamento di mille
        // candidati, per tenerne cinque. Ora si scartano prima, con due
        // sottrazioni in gradi, i POI che non possono in alcun modo
        // rientrare nella finestra; il perimetro e l'ordinamento lavorano
        // sulle poche decine che restano. Il riquadro è DELIBERATAMENTE
        // largo: si prende il limite superiore del raggio di avviso di quel
        // POI (il calibrato dal DB, oppure il doppio del raggio di modalità —
        // il massimo che PoiRadii possa restituire), lo si moltiplica per i
        // 3× della finestra predittiva e si aggiunge un 10%. Chi passa il
        // riquadro viene misurato esattamente come prima, quindi nessun
        // trigger cambia momento.
        //
        // Due eccezioni, entrambe necessarie: i POI CON PERIMETRO non si
        // filtrano (il muro di un parco può essere a 20 m mentre il centroide
        // è a un chilometro) e quelli con la macchina a stati ACCESA nemmeno
        // (devono poter chiudere il loro ciclo, ovunque siano).
        let activeStates = store.allTriggerStates() // una lettura sola, non una per POI
        let baseAlert = isDriving ? alertRadiusCar : alertRadiusWalk
        let latFix = location.coordinate.latitude
        let lonFix = location.coordinate.longitude
        let metriPerGradoLat = 111_320.0
        let metriPerGradoLon = max(1.0, 111_320.0 * cos(latFix * .pi / 180))

        var esaminati: [Candidate] = []
        esaminati.reserveCapacity(32)
        for (indice, poi) in currentPois.enumerated() {
            guard PoiCategories.isActive(poi: poi, selected: selectedCategories) else { continue }
            let statoAcceso: Bool
            if let st = activeStates[poi.id]?.state {
                statoAcceso = (st == .approachFired || st == .arrivedFired || st == .passed)
            } else {
                statoAcceso = false
            }
            let haPerimetro = poi.footprint?.isEmpty == false
            let punto = puntoArrivo(indice, poi)
            if !haPerimetro && !statoAcceso {
                let raggioMassimo = max(baseAlert * 2, Double(poi.alertRadius ?? 0))
                let soglia = raggioMassimo * 3 * 1.1
                if abs(punto.coordinate.latitude - latFix) * metriPerGradoLat > soglia { continue }
                if abs(punto.coordinate.longitude - lonFix) * metriPerGradoLon > soglia { continue }
            }
            // La distanza che ordina è la MINORE fra ingresso e bordo del
            // perimetro: a 30 m dal muro di tre chiese vince quella di cui si
            // sfiora il muro, non quella col portone più vicino (parità Android).
            // Senza perimetro la distanza dal muro è per definizione infinita:
            // non serve chiamare la funzione per farselo dire (sono 4 POI su 5).
            let dIngresso = location.distance(from: punto)
            let dMuro = haPerimetro
                ? PoiFootprints.distanzaDalPerimetro(
                    poiId: poi.id, footprint: poi.footprint,
                    lat: latFix, lon: lonFix,
                    entro: PoiFootprints.triggerCarM)
                : Double.infinity
            esaminati.append(Candidate(poi: poi, punto: punto, dist: min(dIngresso, dMuro)))
        }

        let sortedAll = esaminati
            .sorted {
                if $0.poi.isFromItinerary != $1.poi.isFromItinerary { return $0.poi.isFromItinerary }
                if $0.poi.isGem != $1.poi.isGem { return $0.poi.isGem }
                return $0.dist < $1.dist
            }
        let nearby = sortedAll.filter { c in
            let (alertRad, _) = effectiveRadii(for: c.poi, isDriving: isDriving)
            // ...oppure a 30 m dal perimetro: un parco o una cinta muraria
            // si estendono ben oltre 3× il raggio dall'ingresso (parità Android).
            return c.dist <= alertRad * 3 || c.dist <= PoiFootprints.triggerM(isDriving: isDriving)
        }
        var candidates = Array(nearby.prefix(5))
        let keptIds = Set(candidates.map { $0.poi.id })
        for c in sortedAll where !keptIds.contains(c.poi.id) {
            if let st = activeStates[c.poi.id]?.state,
               st == .approachFired || st == .arrivedFired || st == .passed {
                candidates.append(c)
            }
        }

        approachSpokenInBatch = false
        arrivalSpokenInBatch = false

        for c in candidates {
            // Raggi calibrati sul perimetro (footprint OSM) del singolo POI,
            // gated sull'ingresso reale — mirror di radiiForTransport
            // (src/lib/guideSettings.ts) e della modifica gemella Android.
            // Senza footprint/ingresso restano i raggi di modalità (identico a prima).
            let (alertRad, arrivalRad) = effectiveRadii(for: c.poi, isDriving: isDriving)
            let exitRad = alertRad * 1.5
            let record = store.getTriggerState(c.poi.id)
            let state = record?.state ?? .pending

            // A 30 METRI DAL PERIMETRO dell'edificio (poi_footprints, poligono
            // OSM; 0 m = dentro). Decisione del 22/08/2026: la guida parte a
            // 30 m dal MURO, non quando si è dentro né a 50 m da un ingresso
            // che può stare dall'altra parte. Quando è vero, la distanza dal
            // centroide smette di essere la domanda giusta: lungo la facciata
            // di una basilica di 120 metri ci si allontana dal centro per metà
            // del percorso, e tutta la logica radiale qui sotto lo leggerebbe
            // come "se ne sta andando" — marcando PASSED, poi EXITED, e
            // zittendo la guida proprio mentre l'utente è davanti al portale.
            // Costa quattro confronti sul riquadro quando il POI non ha un
            // perimetro, che sono i 4 POI su 5 del database.
            let dentroPerimetro = PoiFootprints.alPerimetro(
                poiId: c.poi.id, footprint: c.poi.footprint,
                lat: location.coordinate.latitude, lon: location.coordinate.longitude,
                isDriving: isDriving
            )

            // ── Superamento (PASSED) ──
            // Il CPA è alle spalle e la distanza cresce: la voce che racconta
            // questo monumento non ha più senso. Prima questo caso non
            // esisteva — l'uscita a 1.5× resettava lo stato in silenzio, ma
            // l'audio continuava fino a fine teaser.
            // `!dentroPerimetro`: dentro l'edificio non si è mai "superato"
            // il POI, per quanto ci si allontani dal suo centroide.
            if !dentroPerimetro,
               state == .approachFired || state == .arrivedFired,
               let prev = lastDistances[c.poi.id], c.dist > prev, c.dist > arrivalRad {
                // Allineato ad Android: il predittore usa l'INGRESSO (coordinate
                // = entranceLat/Lon ?? lat/lon), non il centroide grezzo. Se non
                // c'è ingresso, coordinate == lat/lon → comportamento identico.
                let passPred = PredictiveTrigger.evaluate(
                    location: location,
                    poiLat: c.punto.coordinate.latitude,
                    poiLon: c.punto.coordinate.longitude,
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
            // Stessa ragione del blocco PASSED: dentro il perimetro non si
            // esce dall'isteresi, qualunque cosa dica la distanza.
            if !dentroPerimetro, c.dist > exitRad {
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
            // Dentro il perimetro l'arrivo è un fatto, non una stima: si è
            // dentro l'edificio, e il raggio d'arrivo — 30 metri a piedi — in
            // un museo di 200 non si raggiunge mai se l'ingresso è su un lato.
            if dentroPerimetro || c.dist <= arrivalRad {
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
                // (22/08/2026, parità con Receiver.kt) PASSED NON blocca più
                // l'arrivo quando la distanza reale è dentro il raggio di
                // arrivo: il predittore marca PASSED già 40 m oltre il CPA
                // dopo un APPROACH, quindi chi cammina svelto, supera di poco
                // il punto e poi si ferma davanti al POI perdeva l'arrivo per
                // 24 ore. Il caso "dentro il perimetro ma fuori dal cerchio"
                // resta bloccato come prima.
                let blockedArrival =
                    (state == .arrivedFired && age < arrivalRetriggerTtlMs) ||
                    (state == .passed && age < arrivalRetriggerTtlMs && c.dist > arrivalRad) ||
                    (state == .exited && age < arrivalAfterExitCooldownMs)
                // `fixDaTrigger` PRIMA del gate di bussola: `valuta` annota i
                // rinvii, e un fix scadente non deve nemmeno contare come
                // tentativo. Niente stato, niente cooldown: si riprova dopo.
                if !blockedArrival && fixDaTrigger {
                    // 🧭 GATE DI BUSSOLA (solo sull'ARRIVO). Se il POI è ormai
                    // alle spalle, il racconto non si butta via: si RIMANDA —
                    // niente stato, niente cooldown, niente evento, si riprova
                    // al fix successivo (e dopo 90 s parla comunque, vedi
                    // BearingGate). L'AVVISO più sotto NON è gated: prepara
                    // teaser e MP3, e deve continuare a scattare.
                    // Le tappe dell'itinerario sono ESCLUSE: le ha scelte
                    // l'utente, e vanno raccontate anche arrivandoci di spalle.
                    let esitoGate: BearingGate.EsitoGate = c.poi.isFromItinerary
                        ? .ignoraGate
                        : BearingGate.shared.valuta(
                            poi: c.poi, location: location,
                            dentroPerimetro: dentroPerimetro, distanzaM: c.dist
                        )
                    if esitoGate != .rimanda {
                        // (28/08/2026, AUD-04) UNA guida completa per fix. I
                        // candidati sono ordinati (itinerario > gemma > più
                        // vicino): il primo che arriva riceve teaser, pass e
                        // audioguida; gli altri dello stesso fix — tre chiese
                        // sulla stessa piazza — scrivono lo stato e ricevono
                        // la sola notifica «Ascolta». Prima ognuno consumava
                        // una guida del pass e accodava minuti di audio che
                        // nessuno avrebbe ascoltato in fila.
                        handleArrival(poi: c.poi, soloNotifica: arrivalSpokenInBatch)
                        arrivalSpokenInBatch = true
                    }
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
                    poiLat: c.punto.coordinate.latitude,
                    poiLon: c.punto.coordinate.longitude,
                    radiusM: alertRad,
                    isDriving: isDriving
                )
                TriggerTelemetry.log(
                    poiId: c.poi.id, poiName: c.poi.nome, phase: "approach",
                    result: pred, location: location, isDriving: isDriving, radiusM: alertRad
                )
                // AUD-09: senza un fix entro 50 m l'avviso non scatta e non
                // scrive lo stato — il predittore rivaluta al fix successivo.
                if pred.decision == .fire && fixDaTrigger {
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

    /// (22/08/2026) Il personaggio scelto nel profilo (nicky/dante) arrivava al
    /// plugin ma non veniva mai letto: prefetch MP3, testo del pass e deep link
    /// `?guide=` usavano sempre il guideDefault del POI, quindi in background
    /// parlava la voce sbagliata. Il plugin persiste `guideCharacter` (stessa
    /// chiave di Android); qui si preferisce quello, col default del POI come
    /// riserva. Port di GeofenceBroadcastReceiver.resolveGuideVoice.
    private func resolveGuideVoice(fallback: String) -> String {
        let chosen = prefs.string(forKey: "guideCharacter")
        if chosen == "nicky" || chosen == "dante" { return chosen ?? fallback }
        return fallback
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
        let lang = appLanguage
        let guideVoice = resolveGuideVoice(fallback: poi.guideDefault)
        let notifTitle = poi.isFromItinerary
            ? NotificationStrings.itineraryStopTitle(lang)
            : NotificationStrings.explorationTitle(lang)
        // Distanza REALE, non la stringa fissa "circa 150m": il raggio di
        // alert cambia fra piedi (150 m) e auto (300 m), e l'utente vedeva
        // "150m" anche per un POI a 300 m o già superato.
        let realDist = lastFixLocation.map { Int($0.distance(from: poi.coordinate)) } ?? -1
        let distText = realDist >= 0 ? NotificationStrings.aboutMeters(lang, meters: realDist) : ""
        // IL NOME DEL LUOGO E' IL TITOLO (28/08/2026, collaudo). Prima il
        // titolo era «Esplorazione: Politeama Giuseppe Verdi» e iOS lo
        // troncava a «Esplorazione: Politeama Ca…»: la parola fissa si
        // mangiava lo spazio e il nome — l'unica cosa che conta sulla lock
        // screen — non si leggeva. L'etichetta scende nel corpo, dove c'è posto.
        if silent {
            // In silenzioso il testo fa il lavoro della voce: body esteso col
            // messaggio di avvicinamento (già nella lingua dell'utente).
            showNotification(
                title: poi.nome,
                body: "\(notifTitle) · \(approachMsg). \(distText)".trimmingCharacters(in: .whitespaces),
                poiId: poi.id, guide: guideVoice, isArrival: false
            )
        } else {
            showNotification(
                title: poi.nome,
                body: "\(notifTitle) · \(distText) \(NotificationStrings.tapToListen(lang))".trimmingCharacters(in: .whitespaces),
                poiId: poi.id, guide: guideVoice, isArrival: false
            )
        }
    }

    /// Prefetch dell'MP3 dell'audioguida (port di AudioPrefetchManager Android):
    /// testo dal pacchetto offline se c'è, altrimenti da shared_pois. Tutto
    /// best-effort, nessun errore risale al chiamante.
    private func prefetchAudio(for poi: Poi) {
        guard isOnline else { return }
        let lang = appLanguage
        let voice = resolveGuideVoice(fallback: poi.guideDefault)
        guard AudioPrefetchManager.cachedFile(poiId: poi.id, lang: lang, character: voice) == nil else { return }
        // Testo offline SOLO se il pacchetto è nella lingua richiesta
        // (mono-lingua): altrimenti si prende il testo tradotto dal cloud.
        if let localText = store.getOfflineAudioText(poi.id, lang: lang) {
            AudioPrefetchManager.prefetch(poiId: poi.id, lang: lang, character: voice, text: localText)
        } else {
            // Testo NELLA LINGUA dell'utente (get-or-create per-lingua), non i
            // campi italiani grezzi: così l'MP3 prefetchato è già tradotto.
            // Token utente se disponibile (rollout fase 1, vedi WipSupabaseClient
            // .fetchAudioguideText): mai bloccante se assente.
            let audioguideToken = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken)
            supabase.fetchAudioguideText(poiId: poi.id, lang: lang, character: voice, accessToken: audioguideToken) { text in
                AudioPrefetchManager.prefetch(poiId: poi.id, lang: lang, character: voice, text: text)
            }
        }
    }

    /// `soloNotifica` (AUD-04): secondo e successivi arrivi dello stesso fix.
    /// Stato ARRIVED_FIRED ed evento come sempre — la macchina a stati non
    /// cambia — ma niente voce, niente pass, niente audioguida in coda: solo
    /// la notifica col tasto ▶ Ascolta, che passa dalla stessa catena di
    /// autorizzazione del tasto in app.
    private func handleArrival(poi initialPoi: Poi, soloNotifica: Bool = false) {
        var poi = initialPoi
        // Il POI ha parlato: il gate dimentica i suoi rinvii (specifica, punto 7).
        BearingGate.shared.azzera(poiId: poi.id)
        store.setTriggerState(poi.id, .arrivedFired)
        sendPoiEvent("poiArrived", poi: poi)

        let priority = poi.isFromItinerary ? 0 : 1
        // Personaggio scelto dall'utente (prefs), default del POI come riserva:
        // vale per MP3, testo del pass e deep link ?guide= della notifica.
        let guideVoice = resolveGuideVoice(fallback: poi.guideDefault)
        let lang = appLanguage

        if soloNotifica {
            showNotification(
                title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                body: NotificationStrings.listenHintNoAutoplay(lang),
                poiId: poi.id, guide: guideVoice, isArrival: true,
                withListenAction: true
            )
            return
        }

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

        // Frase di ripiego quando il teaser manca: NON sempre la stessa. In un
        // giro di dieci luoghi senza teaser l'utente sentiva dieci volte
        // "Apri l'app per scoprire i segreti di questo luogo" (regola utente
        // 22/08/2026: "il piu' possibile variegati"). La variante si sceglie
        // dall'id del POI, cosi' lo stesso luogo dice sempre la stessa cosa e
        // due luoghi vicini dicono cose diverse. Con la RPC nearby_pois che
        // ora porta i teaser e la generazione AI all'avvicinamento, questo
        // ramo dovrebbe restare raro.
        let variantiRipiego: [String]
        switch appLanguage {
        case "en": variantiRipiego = [
            "Open the app to discover the secrets of this place.",
            "The full story is in the app: open it and listen.",
            "Want to know what happened here? The audio guide is one tap away."]
        case "fr": variantiRipiego = [
            "Ouvrez l'application pour découvrir les secrets de ce lieu.",
            "Toute l'histoire est dans l'application : ouvrez-la et écoutez.",
            "Envie de savoir ce qui s'est passé ici ? L'audioguide est à un geste."]
        case "es": variantiRipiego = [
            "Abre la aplicación para descubrir los secretos de este lugar.",
            "La historia completa está en la app: ábrela y escucha.",
            "¿Quieres saber qué pasó aquí? La audioguía está a un toque."]
        case "de": variantiRipiego = [
            "Öffnen Sie die App, um die Geheimnisse dieses Ortes zu entdecken.",
            "Die ganze Geschichte steht in der App: öffnen und zuhören.",
            "Was ist hier passiert? Der Audioguide ist nur einen Tipp entfernt."]
        case "ru": variantiRipiego = [
            "Откройте приложение, чтобы узнать секреты этого места.",
            "Вся история — в приложении: откройте и слушайте.",
            "Хотите узнать, что здесь произошло? Аудиогид в одном касании."]
        case "zh": variantiRipiego = [
            "打开应用，探索这个地方的秘密。",
            "完整的故事都在应用里：打开并聆听。",
            "想知道这里发生过什么？语音导览只需轻点一下。"]
        default: variantiRipiego = [
            "Apri l'app per scoprire i segreti di questo luogo.",
            "La storia completa e' nell'app: aprila e ascolta.",
            "Vuoi sapere cosa e' successo qui? L'audioguida e' a un tocco."]
        }
        // Hash deterministico (hashValue in Swift cambia a ogni avvio).
        let semeRipiego = poi.id.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0x7fffffff }
        let fallbackTeaser = variantiRipiego[semeRipiego % variantiRipiego.count]

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
                    title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                    body: "\(teaserBody)\n\(NotificationStrings.silentArrivalHint(lang))",
                    poiId: poi.id, guide: guideVoice, isArrival: true,
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
                            title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                            body: NotificationStrings.listenHintNoAutoplay(lang),
                            poiId: poi.id, guide: guideVoice, isArrival: true,
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
                    if mp3Path == nil && hasText {
                        // Prefetch/redirect MP3 falliti (rete lenta o server
                        // freddo): l'intera audioguida viene letta dal TTS di
                        // sistema invece della voce AI. Evento per il JS (stesso
                        // canale di poiArrived) così può mostrare "voce di
                        // riserva, rete lenta" invece di degradare in silenzio.
                        // Stesso caso di Receiver.kt (audioQualityDegraded).
                        self.sendPoiEvent("audioQualityDegraded", poi: poi)
                    }
                    if let full = fullText,
                       let extra = self.store.getOfflineDescriptionShort(poi.id, lang: lang),
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
                // Testo offline SOLO se il pacchetto è nella lingua dell'utente:
                // altrimenti nil → più sotto si scarica il testo tradotto dal
                // cloud (fetchAudioguideText). Evita la voce nella lingua giusta
                // che legge testo di un'altra lingua (bug mono-lingua).
                let localText = self.store.getOfflineAudioText(poi.id, lang: lang)
                if let cachedMp3 = AudioPrefetchManager.cachedFile(poiId: poi.id, lang: lang, character: guideVoice) {
                    playFullText(localText, cachedMp3.path)
                } else if let localText = localText, !localText.isEmpty {
                    if self.isOnline {
                        // Timeout corto: se il server deve sintetizzare da
                        // zero non teniamo l'utente in attesa, TTS del testo.
                        AudioPrefetchManager.download(
                            poiId: poi.id, lang: lang,
                            character: guideVoice, text: localText, timeout: 25
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
                    // POSSESSO (29/08/2026): qui NON si scrive il mirror
                    // `owned_poi_ids_<userId>`. L'auto-play non chiede mai
                    // l'addebito (`charge:true` non parte dal nativo) e ci si
                    // arriva solo con `alreadyPurchased || passActive`: un 200
                    // vuol dire "già suo" oppure "Day Pass" — e il pass è
                    // accesso a tempo. Segnarlo qui regalerebbe per sempre
                    // ogni POI sentito col pass.
                    self.supabase.fetchAudioguide(poiId: poi.id, lang: lang, character: guideVoice, accessToken: audioguideToken) { esito in
                        self.workQueue.async {
                            switch esito {
                            case .testo(let fetched):
                                AudioPrefetchManager.download(
                                    poiId: poi.id, lang: lang,
                                    character: guideVoice, text: fetched, timeout: 25
                                ) { file in
                                    self.workQueue.async { playFullText(fetched, file?.path) }
                                }
                            case .anteprima(let preview):
                                // (28/08/2026) 402: il server nega il testo
                                // integrale — il pass/saldo locale è stantio.
                                // NIENTE pass consumato, NIENTE storico: si
                                // legge l'anteprima come teaser (se dice
                                // qualcosa in più del teaser già in coda) e la
                                // notifica torna quella col tasto ▶ Ascolta.
                                // Evento al JS per riallineare pass e saldo.
                                if let preview = preview, !preview.isEmpty,
                                   preview != teaser, !fullMsg.contains(preview) {
                                    SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                                        text: preview, isGem: poi.isGem, isItinerary: poi.isFromItinerary,
                                        poiId: poi.id, priority: priority, kind: "arrival"
                                    ))
                                }
                                self.sendPoiEvent("audioguideCreditsRequired", poi: poi)
                                playFullText(nil, nil) // → notifica col tasto Ascolta
                            case .fallito:
                                playFullText(nil, nil) // → notifica col tasto Ascolta
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
                    title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                    body: NotificationStrings.guidePlaying(lang),
                    poiId: poi.id, guide: guideVoice, isArrival: true
                )
            } else if Self.isAppInForeground() {
                // App aperta (tipico a piedi): la scheda e l'autoplay li
                // gestisce il JS — "tieni premuto" qui sarebbe un'istruzione
                // per un'altra situazione.
                self.showNotification(
                    title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                    body: NotificationStrings.cardReadyInApp(lang),
                    poiId: poi.id, guide: guideVoice, isArrival: true
                )
            } else {
                // PREZZO DICHIARATO SULLA NOTIFICA: su lock screen non può
                // esistere un dialogo di conferma (niente UI senza aprire
                // l'app) — il consenso informato sta nel testo, il tap È
                // l'acquisto. Chi ha pass o POI già suo non passa di qui
                // (willAutoPlay) — questo ramo è solo per il per-listen.
                let cost = BillingLogic.defaultGuideCost
                self.showNotification(
                    title: NotificationStrings.arrivedTitle(lang, name: poi.nome),
                    body: NotificationStrings.listenWithCost(lang, cost: cost),
                    poiId: poi.id, guide: guideVoice, isArrival: true,
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

    // MARK: - Teaser radar e notifiche

    private func showRadarTeaserNotifications(pois: [Poi], location: CLLocation) {
        // (23/08/2026) Lista ORDINATA, non più un Set: serve l'ordine per lo
        // sfratto. Senza tetto questa chiave di UserDefaults cresceva per
        // tutta la durata del viaggio (si azzera solo allo stop del servizio),
        // e viene letta e riscritta a ogni refresh del radar.
        var ordineNotificati = prefs.stringArray(forKey: "radarTeaserNotified") ?? []
        var notified = Set(ordineNotificati)
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
            if notified.insert(poi.id).inserted { ordineNotificati.append(poi.id) }
            showTeaserNotification(poi: poi, distanceM: Int(dist))
        }
        if !candidates.isEmpty {
            // Tetto FIFO: oltre i 500 escono i più vecchi. Un POI notificato
            // 500 luoghi fa può tornare annunciabile, ed è la risposta giusta:
            // a quel punto è un altro viaggio.
            if ordineNotificati.count > 500 {
                ordineNotificati.removeFirst(ordineNotificati.count - 500)
            }
            prefs.set(ordineNotificati, forKey: "radarTeaserNotified")
        }
    }

    private func showTeaserNotification(poi: Poi, distanceM: Int) {
        postNotification(
            id: "teaser_\(poi.id)",
            title: NotificationStrings.teaserTitle(appLanguage, name: poi.nome, meters: distanceM),
            body: poi.teaserText ?? "",
            poiId: poi.id, guide: resolveGuideVoice(fallback: poi.guideDefault), timeSensitive: false
        )
    }

    private func showDiscoveryNotification(poi: Poi) {
        postNotification(
            id: "gem_\(poi.id)",
            title: NotificationStrings.gemTitle(appLanguage),
            body: NotificationStrings.gemBody(appLanguage, name: poi.nome),
            poiId: poi.id, guide: resolveGuideVoice(fallback: poi.guideDefault), timeSensitive: false
        )
    }

    private func showCheckInNotification(poiId: String) {
        postNotification(
            id: "checkin",
            title: NotificationStrings.checkInTitle(appLanguage),
            body: NotificationStrings.checkInBody(appLanguage),
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
        // I feedback generator sono UIKit: vanno costruiti e usati sul main.
        // I chiamanti (handleApproach, speakAndNotify) girano sulla workQueue.
        DispatchQueue.main.async {
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
        // Personaggio scelto dall'utente, default del POI come riserva
        let guideCharacter = resolveGuideVoice(fallback: poi?.guideDefault ?? "nicky")
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
            // ACQUISTO (29/08/2026): «chi paga un'audioguida non la paga mai
            // più». È l'unico ramo in cui l'utente ha chiesto l'addebito a
            // crediti, quindi il POI diventa suo anche nel mirror locale e il
            // prossimo trigger sullo stesso POI non ripaga. Gli altri due rami
            // non ci entrano: "purchased" era già suo, il Day Pass è accesso a
            // tempo.
            ListeningHistoryStore.shared.markOwned(poiId)
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
                receipt = NotificationStrings.receiptDayPass(lang, remaining: max(0, cap - used), cap: cap)
            case "per_listen":
                let remaining = BillingLogic.remainingOffline(
                    snapshotCredits: self.prefs.integer(forKey: "wallet_snapshot_credits"),
                    pendingSpendCredits: self.store.pendingSpendCredits()
                )
                receipt = NotificationStrings.receiptPerListen(lang, cost: BillingLogic.defaultGuideCost, remaining: remaining)
            default:
                receipt = NotificationStrings.receiptPurchased(lang)
            }
            self.postNotification(
                id: "poi_\(poiId)", title: poi?.nome ?? NotificationStrings.audioguideFallbackTitle(lang), body: receipt,
                poiId: poiId, guide: guideCharacter, timeSensitive: false
            )
        }

        // Stessa catena di fallback dell'auto-play: MP3 in cache → testo del
        // pacchetto offline (+MP3 se la rete c'è) → testo da shared_pois. Il
        // testo offline è usato SOLO se il pacchetto è nella lingua dell'utente
        // (mono-lingua): altrimenti nil e si scende alla fetch cloud tradotta.
        let localText = store.getOfflineAudioText(poiId, lang: lang)
        if let cachedMp3 = AudioPrefetchManager.cachedFile(poiId: poiId, lang: lang, character: guideCharacter) {
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
            supabase.fetchAudioguide(poiId: poiId, lang: lang, character: guideCharacter, accessToken: audioguideToken) { esito in
                self.workQueue.async {
                    switch esito {
                    case .testo(let fetched):
                        AudioPrefetchManager.download(
                            poiId: poiId, lang: lang,
                            character: guideCharacter, text: fetched, timeout: 25
                        ) { file in
                            self.workQueue.async { play(fetched, file?.path) }
                        }
                    case .anteprima:
                        // (28/08/2026) 402: il server nega la guida completa.
                        // `charge()` non è ancora passato di qui, quindi
                        // niente pass né registro: la notifica dice che
                        // servono crediti (l'utente ha premuto ▶ Ascolta e
                        // aspetta una risposta, non un'anteprima).
                        self.notifyListenFailed(poi: poi, poiId: poiId, reason: "insufficient_credits")
                    case .fallito:
                        play(nil, nil) // → notifica "non disponibile"
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
        let lang = appLanguage
        let name = poi?.nome ?? NotificationStrings.thisPlace(lang)
        postNotification(
            id: "listen_fail_\(poiId)",
            title: NotificationStrings.listenFailedTitle(lang),
            body: NotificationStrings.listenFailedBody(lang, reason: reason, name: name),
            poiId: poiId, guide: resolveGuideVoice(fallback: poi?.guideDefault ?? "nicky"), timeSensitive: true
        )
    }

    // MARK: - Teaser batch (stesso endpoint del server Vercel)

    private func generateTeasersInBackground(poiIds: [String]) {
        guard let url = URL(string: "\(WipApi.base)/api/poi/batch-teaser") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        // Dall'hardening di agosto 2026 la rotta rifiuta le chiamate anonime
        // (403): senza il token dell'utente questo prefetch non ha mai generato
        // un teaser, e nessuno se ne accorgeva perche' la risposta non veniva
        // letta. Stesso token usato per /api/poi/audioguide.
        if let token = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken), !token.isEmpty {
            req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["poiIds": poiIds, "lang": appLanguage])
        URLSession.shared.dataTask(with: req) { _, response, error in
            if let error = error {
                NSLog("[WIP] batch-teaser: errore di rete \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                NSLog("[WIP] batch-teaser: HTTP \(http.statusCode) per \(poiIds.count) POI (403 = manca il token utente)")
            }
        }.resume()
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

    /// Lettura NON bloccante dello stato di primo piano (vedi
    /// installaOsservatoriCicloDiVita). La versione precedente faceva
    /// `DispatchQueue.main.sync` quando chiamata fuori dal main — cioè sempre,
    /// perché tutti i chiamanti stanno sulla workQueue: inversione di priorità
    /// a ogni trigger e stallo se il main aspettava a sua volta la workQueue.
    static func isAppInForeground() -> Bool {
        foregroundLock.lock()
        defer { foregroundLock.unlock() }
        return appInForegroundFlag
    }
}
