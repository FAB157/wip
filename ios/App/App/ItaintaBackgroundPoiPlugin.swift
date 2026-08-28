import Foundation
import Capacitor
import CoreLocation
import AVFoundation
import UserNotifications
import UIKit

/**
 * Port iOS di plugin/ItaintaBackgroundPoiPlugin.kt: stessa API e stessi eventi
 * verso il JS. Il "servizio" è BackgroundPoiManager (singleton nel processo
 * dell'app, tenuto vivo dalla background location).
 *
 * Differenze piattaforma, a parità di comportamento percepito:
 * - checkAndRequestPermissions: niente battery optimization su iOS; il flusso
 *   chiede notifiche + posizione "Sempre" e riporta gli stessi status string.
 * - openSystemNavigator: Google Maps se installata, altrimenti Apple Maps.
 * - checkOfflineTtsVoice: le voci AVSpeech sono offline per natura.
 */
@objc(ItaintaBackgroundPoiPlugin)
public class ItaintaBackgroundPoiPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "ItaintaBackgroundPoiPlugin"
    public let jsName = "ItaintaBackgroundPoiPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAndRequestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundPoiService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncManualSelection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearManualSelection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markPoiExited", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetTriggerHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackgroundPoiService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeTeaser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTeaserState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingDeepLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSystemNavigator", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadOfflinePackage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncOfflinePackage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listOfflinePackages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteOfflinePackage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkOfflineTtsVoice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openTtsVoiceInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speakText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setUserContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWalletBalance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSilentMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDayPass", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDayPassState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeDayPassGuide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOfflineSpendState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markSpendReconciled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playOfflineGuide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHealthStats", returnType: CAPPluginReturnPromise),
        // (28/08/2026) Logout e apertura Impostazioni (audit SEC-02 / UX-03)
        CAPPluginMethod(name: "clearUserContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    private let prefs = UserDefaults.standard
    private let store = PoiStore.shared
    private let packageManager = WipPackageDownloadManager()
    private var permissionManager: CLLocationManager?
    private var pendingPermissionCall: CAPPluginCall?

    override public func load() {
        super.load()
        // Ponte eventi nativo → JS, equivalente del BroadcastReceiver Android.
        // retainUntilConsumed=true: se la WebView si sta ancora svegliando,
        // l'evento viene consegnato appena il listener JS si registra.
        BackgroundPoiManager.shared.onEvent = { [weak self] event, data1, extra in
            var data = JSObject()
            if let data1 = data1 {
                data["data"] = data1
                if data1.trimmingCharacters(in: .whitespaces).hasPrefix("{"),
                   let jsonData = data1.data(using: .utf8),
                   let json = (try? JSONSerialization.jsonObject(with: jsonData)) as? [String: Any] {
                    if let poiId = json["poiId"] as? String { data["poiId"] = poiId }
                    if let poiName = json["poiName"] as? String { data["poiName"] = poiName }
                }
            }
            for (k, v) in extra {
                if let s = v as? String { data[k] = s }
            }
            self?.notifyListeners(event, data: data, retainUntilConsumed: true)
        }
        packageManager.onProgress = { [weak self] packageId, done, total, phase in
            self?.notifyListeners(WipPackageDownloadManager.eventProgress, data: [
                "data": self?.jsonString(["packageId": packageId, "done": done, "total": total, "phase": phase]) ?? "",
                "packageId": packageId, "done": done, "total": total, "phase": phase
            ], retainUntilConsumed: true)
        }
    }

    private func jsonString(_ obj: [String: Any]) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: obj),
           let str = String(data: data, encoding: .utf8) {
            return str
        }
        return "{}"
    }

    // MARK: - Permessi

    @objc func checkAndRequestPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            DispatchQueue.main.async { self.requestLocation(call) }
        }
    }

    private func requestLocation(_ call: CAPPluginCall) {
        let manager = permissionManager ?? CLLocationManager()
        manager.delegate = self
        permissionManager = manager

        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) { status = manager.authorizationStatus }
        else { status = CLLocationManager.authorizationStatus() }

        switch status {
        case .authorizedAlways:
            call.resolve(["status": "all_granted", "background": "granted"])
            rilasciaPermissionManager()
        case .authorizedWhenInUse:
            // Upgrade a "Sempre": iOS mostra il prompt una sola volta, poi
            // servono le Impostazioni (stesso messaggio del dialog Android).
            pendingPermissionCall = call
            manager.requestAlwaysAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                if let pending = self.pendingPermissionCall {
                    self.pendingPermissionCall = nil
                    let now: CLAuthorizationStatus
                    if #available(iOS 14.0, *) { now = manager.authorizationStatus }
                    else { now = CLLocationManager.authorizationStatus() }
                    // (28/08/2026, MAP-05) `background` dice la verità sul
                    // permesso in background accanto allo `status` legacy:
                    // "granted" SOLO con «Sempre», "limited" con «Mentre usi
                    // l'app». I valori di `status` non cambiano.
                    if now == .authorizedAlways {
                        pending.resolve(["status": "all_granted", "background": "granted"])
                    } else {
                        pending.resolve(["status": "requesting_background_location", "background": "limited"])
                    }
                    self.rilasciaPermissionManager()
                }
            }
        case .notDetermined:
            pendingPermissionCall = call
            manager.requestAlwaysAuthorization()
        default:
            call.reject("Permesso posizione necessario")
            rilasciaPermissionManager()
        }
    }

    /// Il CLLocationManager qui serve SOLO a chiedere i permessi: risposta
    /// data, si rilascia (prima restava vivo e delegato per tutta la vita del
    /// plugin, accanto a quello vero di BackgroundPoiManager). Da chiamare
    /// solo a chiamata già risolta: mai mentre il prompt di sistema è aperto,
    /// o si perde il callback di autorizzazione.
    private func rilasciaPermissionManager() {
        guard pendingPermissionCall == nil else { return }
        permissionManager?.delegate = nil
        permissionManager = nil
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = pendingPermissionCall else { return }
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) { status = manager.authorizationStatus }
        else { status = CLLocationManager.authorizationStatus() }
        switch status {
        case .authorizedAlways:
            pendingPermissionCall = nil
            call.resolve(["status": "all_granted", "background": "granted"])
        case .authorizedWhenInUse:
            // «Mentre usi l'app» NON è definitivo per noi: a schermo spento
            // iOS smette di consegnare i fix. `background: "limited"`.
            pendingPermissionCall = nil
            call.resolve(["status": "denied_background_location", "background": "limited"])
        case .denied, .restricted:
            pendingPermissionCall = nil
            call.reject("Permesso posizione necessario")
        default:
            break // .notDetermined: prompt ancora aperto
        }
        // Risposta data (o prompt ancora aperto: allora è un no-op, la guardia
        // controlla pendingPermissionCall): il manager dei permessi si rilascia.
        rilasciaPermissionManager()
    }

    // MARK: - Servizio

    @objc func startBackgroundPoiService(_ call: CAPPluginCall) {
        var options: [String: Any] = [
            "isAutomaticMode": call.getBool("isAutomaticMode") ?? true,
            "guideMode": call.getString("guideMode") ?? "walking",
            "transportPref": call.getString("transportPref") ?? "auto",
            "language": call.getString("language") ?? "it",
            "categories": call.getArray("categories", String.self) ?? [],
            "alertRadiusWalk": call.getDouble("alertRadiusWalk") ?? 150,
            "arrivalRadiusWalk": call.getDouble("arrivalRadiusWalk") ?? 30,
            "alertRadiusCar": call.getDouble("alertRadiusCar") ?? 300,
            "arrivalRadiusCar": call.getDouble("arrivalRadiusCar") ?? 50
        ]
        if let lat = call.getDouble("lat"), let lon = call.getDouble("lon") {
            options["lat"] = lat
            options["lon"] = lon
        }
        // (22/08/2026) Il JS mandava guideCharacter (nicky/dante) ma nessuno lo
        // leggeva: il manager in background usava sempre il guideDefault del
        // POI. Si persiste solo se valido (stessa chiave prefs di Android,
        // ItaintaBackgroundPoiPlugin.kt), letta da BackgroundPoiManager
        // .resolveGuideVoice con il default del POI come riserva.
        if let guideCharacter = call.getString("guideCharacter"),
           guideCharacter == "nicky" || guideCharacter == "dante" {
            prefs.set(guideCharacter, forKey: "guideCharacter")
        }
        // 🧭 GATE DI BUSSOLA: preferenza utente, persistita come guideCharacter
        // (stessa chiave su Android). Si scrive SOLO se il JS la manda: assente
        // = si tiene quella salvata, e mai salvata = ACCESO (default in
        // BearingGate.abilitato). Un `false` esplicito spegne anche la bussola
        // subito, senza aspettare il prossimo fix.
        if let bearingGate = call.getBool("bearingGate") {
            BearingGate.shared.setAbilitato(bearingGate)
        }
        BackgroundPoiManager.shared.start(options: options)
        call.resolve()
    }

    @objc func syncManualSelection(_ call: CAPPluginCall) {
        let poisJson = call.getString("poisJson") ?? "[]"
        BackgroundPoiManager.shared.syncManualSelection(poisJson: poisJson)
        call.resolve()
    }

    /**
     * Fine del giro (locationService.unsyncTappeGiroFromNative). Il JS lo
     * chiamava già con guardia `typeof`, ma il metodo non esisteva: le tappe
     * di un itinerario chiuso restavano monitorate — e prioritarie sul radar —
     * fino allo stop del servizio. `syncManualSelection` SOSTITUISCE la
     * selezione (non fonde), ma il JS a fine giro non manda nessuna lista: senza
     * un metodo dedicato non c'era modo di dire «adesso non ce ne sono più».
     * Port di ItaintaBackgroundPoiPlugin.kt::clearManualSelection.
     * Sempre resolve: il JS non deve restare appeso alla fine di un giro.
     */
    @objc func clearManualSelection(_ call: CAPPluginCall) {
        BackgroundPoiManager.shared.clearManualSelection()
        call.resolve()
    }

    /**
     * L'utente ha chiuso il banner di quel POI (ApproachBanner): per il
     * servizio è come se ne fosse uscito, così al fix successivo non viene
     * riannunciato. Lo stato EXITED porta con sé il cooldown della macchina a
     * stati (30 min): non è un "mai più", chi ci ripassa davvero lo risente.
     * Port di ItaintaBackgroundPoiPlugin.kt::markPoiExited — stesso ritorno
     * {ok, reason} e stessa regola: mai un reject, il JS chiama e va avanti.
     */
    @objc func markPoiExited(_ call: CAPPluginCall) {
        let poiId = (call.getString("poiId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !poiId.isEmpty else {
            call.resolve(["ok": false, "reason": "missing_poiId"])
            return
        }
        BackgroundPoiManager.shared.markPoiExited(poiId: poiId)
        call.resolve(["ok": true])
    }

    /// Azzera lo storico dei trigger di geofencing (trigger_state): dopo il
    /// reset ogni POI verrà riannunciato come la prima volta. Chiamato dal JS
    /// (ProfileScreen → "Azzera storico") in parallelo alla cancellazione web
    /// di wip_played_pois. Senza, il servizio in background continuava a saltare
    /// i POI già annunciati anche dopo il reset lato web. Port di
    /// ItaintaBackgroundPoiPlugin.kt::resetTriggerHistory.
    @objc func resetTriggerHistory(_ call: CAPPluginCall) {
        store.clearTriggerStates()
        // (22/08/2026) Anche i teaser radar già notificati ripartono da zero,
        // come Android (Plugin.kt resetTriggerHistory): senza, un POI
        // notificato una volta non tornava mai nei teaser radar.
        prefs.removeObject(forKey: "radarTeaserNotified")
        call.resolve()
    }

    @objc func stopBackgroundPoiService(_ call: CAPPluginCall) {
        BackgroundPoiManager.shared.stop()
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["active": prefs.bool(forKey: "isServiceActive")])
    }

    // MARK: - Teaser / deep link

    @objc func stopNativeTeaser(_ call: CAPPluginCall) {
        SpeechQueue.shared.stopSpeaking()
        call.resolve()
    }

    @objc func getTeaserState(_ call: CAPPluginCall) {
        call.resolve([
            "isSpeaking": prefs.bool(forKey: SpeechQueue.prefTeaserSpeaking),
            "speakingPoiId": prefs.string(forKey: SpeechQueue.prefTeaserSpeakingPoi) ?? "",
            "lastPoiId": prefs.string(forKey: SpeechQueue.prefTeaserLastPoi) ?? "",
            "lastFinishedAt": prefs.double(forKey: SpeechQueue.prefTeaserLastFinishedAt)
        ])
    }

    @objc func getPendingDeepLink(_ call: CAPPluginCall) {
        let data: [String: Any] = [
            "poiId": prefs.string(forKey: "pending_deeplink_poi") ?? "",
            "guide": prefs.string(forKey: "pending_deeplink_guide") ?? "",
            "timestamp": prefs.double(forKey: "pending_deeplink_ts")
        ]
        prefs.removeObject(forKey: "pending_deeplink_poi")
        prefs.removeObject(forKey: "pending_deeplink_guide")
        prefs.removeObject(forKey: "pending_deeplink_ts")
        call.resolve(JSTypes.coerceDictionaryToJSObject(data) ?? [:])
    }

    @objc func openSystemNavigator(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lon = call.getDouble("lon") else {
            call.reject("Missing lat")
            return
        }
        let label = call.getString("name") ?? "Destinazione"
        // `mode`: "driving" o "walking" (default). Prima era SEMPRE a piedi:
        // chi toccava "Naviga in auto" riceveva un percorso pedonale, con ZTL e
        // sensi unici ignorati (verificato il 22/08/2026). Stesso parametro del
        // plugin Android.
        let driving = (call.getString("mode") ?? "walking").lowercased().hasPrefix("driv")
        DispatchQueue.main.async {
            if let gmaps = URL(string: "comgooglemaps://?daddr=\(lat),\(lon)&directionsmode=\(driving ? "driving" : "walking")"),
               UIApplication.shared.canOpenURL(gmaps) {
                UIApplication.shared.open(gmaps)
            } else {
                let encoded = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Destinazione"
                if let apple = URL(string: "https://maps.apple.com/?daddr=\(lat),\(lon)&dirflg=\(driving ? "d" : "w")&q=\(encoded)") {
                    UIApplication.shared.open(apple)
                }
            }
            call.resolve()
        }
    }

    // MARK: - Pacchetti offline

    @objc func downloadOfflinePackage(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lon = call.getDouble("lon") else {
            call.reject("Missing lat")
            return
        }
        let id = call.getString("id") ?? "pkg_\(Int(nowMs()))"
        let name = call.getString("name") ?? "Area"
        let radiusKm = call.getDouble("radiusKm") ?? 50
        let language = call.getString("language") ?? prefs.string(forKey: "language") ?? "it"

        packageManager.downloadPackage(id: id, name: name, lat: lat, lon: lon, radiusKm: radiusKm, language: language) { result in
            switch result {
            case .success(let pkg):
                call.resolve(JSTypes.coerceDictionaryToJSObject(pkg.toJson()) ?? [:])
            case .failure(let error):
                call.reject("Download failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func syncOfflinePackage(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing id")
            return
        }
        packageManager.syncPackage(id: id) { result in
            switch result {
            case .success(let pkg):
                call.resolve(JSTypes.coerceDictionaryToJSObject(pkg.toJson()) ?? [:])
            case .failure(let error):
                call.reject("Sync failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func listOfflinePackages(_ call: CAPPluginCall) {
        let packages = packageManager.listPackages().map { $0.toJson() }
        call.resolve(JSTypes.coerceDictionaryToJSObject(["packages": packages]) ?? [:])
    }

    @objc func deleteOfflinePackage(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing id")
            return
        }
        packageManager.deletePackage(id: id)
        call.resolve()
    }

    @objc func checkOfflineTtsVoice(_ call: CAPPluginCall) {
        let lang = call.getString("language") ?? "it"
        let available = SpeechQueue.isVoiceAvailable(lang)
        // Le voci AVSpeech installate sono utilizzabili offline per natura.
        call.resolve(["available": available, "offlineVoice": available])
    }

    @objc func openTtsVoiceInstall(_ call: CAPPluginCall) {
        // Su iOS le voci si gestiscono da Impostazioni → Accessibilità →
        // Contenuto letto ad alta voce: il meglio che possiamo fare è aprire
        // le impostazioni dell'app.
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    /**
     * Port di speakText Android: pronuncia una frase con AVSpeechSynthesizer
     * accodandola alla stessa coda sequenziale dei teaser. Serve al JS per le
     * indicazioni di navigazione e per l'annuncio d'arrivo — funziona offline
     * e non può sovrapporsi al teaser (unica coda, un item alla volta).
     * Se il servizio non è attivo la coda scarta gli item: si risponde
     * ok=false così il JS ripiega sul TTS di rete invece di restare muto.
     */
    @objc func speakText(_ call: CAPPluginCall) {
        let text = (call.getString("text") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return call.reject("Missing text") }
        guard prefs.bool(forKey: "isServiceActive") else {
            return call.resolve(["ok": false, "reason": "service_inactive"])
        }
        SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
            text: text,
            isGem: false,
            isItinerary: false,
            poiId: call.getString("poiId"),
            priority: call.getInt("priority") ?? 0,
            kind: call.getString("kind") ?? "nav"
        ))
        call.resolve(["ok": true])
    }

    // MARK: - Billing offline (stesse chiavi prefs di Android)

    /**
     * Identità utente per lo storico ascolti nativo: il JS la spinge a ogni
     * sessione online (dayPassService.reconcileOfflineBilling). Il token serve
     * per le RLS su user_listening_history; se scade, insert e sync restano
     * best-effort. Alla ricezione sincronizza subito il mirror.
     */
    @objc func setUserContext(_ call: CAPPluginCall) {
        // userId/accessToken in Keychain (SecureSessionStore), non più in
        // UserDefaults in chiaro: vedi WipSupabaseClient.swift.
        SecureSessionStore.set(call.getString("userId"), forKey: ListeningHistoryStore.prefUserId)
        SecureSessionStore.set(call.getString("accessToken"), forKey: ListeningHistoryStore.prefAccessToken)
        ListeningHistoryStore.shared.syncFromCloud()
        call.resolve()
    }

    /**
     * (28/08/2026, SEC-02) Logout: via userId e token dal Keychain
     * (SecureSessionStore) e via gli specchi del portafoglio e del Day Pass in
     * UserDefaults. Prima il nativo non aveva un modo per dimenticare
     * l'utente: dopo il logout continuava a spendere lo snapshot crediti e il
     * pass di chi se n'era andato, e a registrare ascolti a suo nome. Lo
     * storico ascolti per utente resta (è già isolato per id, vedi
     * ListeningHistoryStore). Mai un reject: il JS chiama e va avanti.
     */
    @objc func clearUserContext(_ call: CAPPluginCall) {
        ListeningHistoryStore.shared.clearSession()
        prefs.removeObject(forKey: "wallet_snapshot_credits")
        prefs.removeObject(forKey: "daypass_expires_at")
        prefs.removeObject(forKey: "daypass_cap")
        prefs.removeObject(forKey: "daypass_used")
        call.resolve()
    }

    /**
     * (28/08/2026, UX-03) Apre la pagina dell'app nelle Impostazioni di iOS
     * (permessi posizione «Sempre», «Posizione esatta», notifiche). Il JS la
     * offre quando il servizio segnala `permissionDowngraded`.
     */
    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["opened": ok])
            }
        }
    }

    @objc func setWalletBalance(_ call: CAPPluginCall) {
        prefs.set(call.getInt("credits") ?? 0, forKey: "wallet_snapshot_credits")
        call.resolve()
    }

    /// Modalità «solo vibrazione + testo»: il WebView non ha
    /// @capacitor/preferences, quindi il toggle passa da qui e scrive la
    /// chiave CapacitorStorage letta da BackgroundPoiManager.isSilentMode.
    @objc func setSilentMode(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        prefs.set(enabled ? "1" : "0", forKey: "CapacitorStorage.wip_silent_mode")
        call.resolve()
    }

    @objc func setDayPass(_ call: CAPPluginCall) {
        prefs.set(call.getDouble("expiresAt") ?? 0, forKey: "daypass_expires_at")
        prefs.set(call.getInt("cap") ?? BillingLogic.dayPassCap, forKey: "daypass_cap")
        prefs.set(call.getInt("used") ?? 0, forKey: "daypass_used")
        call.resolve()
    }

    @objc func getDayPassState(_ call: CAPPluginCall) {
        let expiresAt = prefs.double(forKey: "daypass_expires_at")
        let used = prefs.integer(forKey: "daypass_used")
        let cap = prefs.integer(forKey: "daypass_cap")
        call.resolve([
            "expiresAt": expiresAt,
            "used": used,
            "cap": cap,
            "active": BillingLogic.isPassActive(nowMs: nowMs(), expiresAtMs: expiresAt, guidesUsed: used, cap: cap)
        ])
    }

    @objc func consumeDayPassGuide(_ call: CAPPluginCall) {
        let expiresAt = prefs.double(forKey: "daypass_expires_at")
        let used = prefs.integer(forKey: "daypass_used")
        let cap = prefs.integer(forKey: "daypass_cap")
        if !BillingLogic.isPassActive(nowMs: nowMs(), expiresAtMs: expiresAt, guidesUsed: used, cap: cap) {
            call.resolve(["ok": false])
        } else {
            prefs.set(used + 1, forKey: "daypass_used")
            call.resolve(["ok": true, "used": used + 1, "remaining": max(0, cap - used - 1)])
        }
    }

    @objc func getOfflineSpendState(_ call: CAPPluginCall) {
        call.resolve([
            "pendingCredits": store.pendingSpendCredits(),
            "pendingCount": store.pendingSpendCount()
        ])
    }

    @objc func markSpendReconciled(_ call: CAPPluginCall) {
        store.clearSpendLedger()
        call.resolve()
    }

    /**
     * Ascolto dell'audioguida completa dal pacchetto offline (tasto "Ascolta").
     * Con Day Pass attivo consuma il contatore del pass; altrimenti per-listen
     * con snapshot saldo − spesa pendente, annotata nel registro locale.
     */
    @objc func playOfflineGuide(_ call: CAPPluginCall) {
        guard let poiId = call.getString("poiId") else {
            call.reject("Missing poiId")
            return
        }
        let cost = call.getInt("cost") ?? BillingLogic.defaultGuideCost

        let offlinePoi = store.getOfflinePoi(poiId)
        let lang = prefs.string(forKey: "language") ?? "it"
        // Testo offline SOLO se il pacchetto è nella lingua dell'utente; se il
        // pacchetto è in un'altra lingua si scarta il testo (mono-lingua) e ci
        // si affida all'MP3 prefetchato, già sintetizzato nella lingua giusta.
        let text = store.getOfflineAudioText(poiId, lang: lang)
        // MP3 prefetchato: parte istantaneo e copre anche il caso audio_text
        // assente nel pacchetto (catena fallback offline, come Android).
        // Il file è per personaggio: si cerca quello scelto dall'utente
        // (stessa chiave prefs persistita da startBackgroundPoiService).
        let chosen = prefs.string(forKey: "guideCharacter")
        let character = (chosen == "nicky" || chosen == "dante") ? chosen : nil
        let mp3 = AudioPrefetchManager.cachedFile(poiId: poiId, lang: lang, character: character)
        guard (text?.isEmpty == false) || mp3 != nil else {
            call.resolve(["ok": false, "reason": "no_text"])
            return
        }

        var ret = JSObject()
        let passUsed = prefs.integer(forKey: "daypass_used")
        let passActive = BillingLogic.isPassActive(
            nowMs: nowMs(),
            expiresAtMs: prefs.double(forKey: "daypass_expires_at"),
            guidesUsed: passUsed,
            cap: prefs.integer(forKey: "daypass_cap")
        )
        // Già nello storico ascolti = già acquistato: gratis, non consuma
        // né pass né crediti (come authorizeGuidePlayback web)
        let alreadyPurchased = ListeningHistoryStore.shared.isAlreadyPurchased(poiId)
        if alreadyPurchased {
            ret["mode"] = "purchased"
        } else if passActive {
            prefs.set(passUsed + 1, forKey: "daypass_used")
            ret["mode"] = "day_pass"
        } else {
            let snapshot = prefs.integer(forKey: "wallet_snapshot_credits")
            let pending = store.pendingSpendCredits()
            if !BillingLogic.canSpend(snapshotCredits: snapshot, pendingSpendCredits: pending, cost: cost) {
                call.resolve([
                    "ok": false,
                    "reason": "insufficient_credits",
                    "remaining": BillingLogic.remainingOffline(snapshotCredits: snapshot, pendingSpendCredits: pending)
                ])
                return
            }
            store.insertSpend(SpendEntry(poiId: poiId, credits: cost, ts: nowMs()))
            ret["mode"] = "per_listen"
            ret["charged"] = cost
        }

        SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
            text: text ?? "", isGem: offlinePoi?.isGem ?? false, isItinerary: false,
            poiId: poiId, priority: 1, kind: "arrival",
            audioFile: mp3?.path
        ))
        // Storico ascolti: mirror subito + cloud best-effort
        ListeningHistoryStore.shared.recordListening(
            poiId: poiId, poiName: offlinePoi?.nome ?? "", category: offlinePoi?.poiType
        )
        ret["ok"] = true
        call.resolve(ret)
    }

    /**
     * «Salute del viaggio»: passi/km/piani per giorno (oggi + 6 precedenti)
     * dal contapassi di sistema (CMPedometer, vedi HealthStats.swift).
     * Contapassi assente o Motion negato → {available:false}, mai un reject:
     * la card JS si nasconde e basta. Stesso formato di StepTracker Android.
     */
    @objc func getHealthStats(_ call: CAPPluginCall) {
        HealthStats.shared.fetch { result in
            call.resolve(result)
        }
    }
}
