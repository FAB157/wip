import UIKit
import Capacitor
import CoreLocation
import UserNotifications
import BackgroundTasks

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    /// Refresh opportunistico dei pacchetti offline (WipPackageDownloadManager):
    /// senza questo, i pacchetti restano stantii finché l'utente non apre
    /// l'app e preme "Aggiorna" a mano. L'OS decide QUANDO concederlo (uso
    /// app, batteria, rete) — non è un cron, è un "se capita l'occasione".
    /// Identifier dichiarato anche in Info.plist sotto
    /// BGTaskSchedulerPermittedIdentifiers (obbligatorio, altrimenti il
    /// submit lancia in silenzio senza effetto).
    static let offlineRefreshTaskId = "com.itaintasca.app.offline-refresh"

    /// UN SOLO gestore pacchetti per tutta la vita del processo.
    /// (23/08/2026) Prima ogni risveglio del BGTask ne costruiva uno nuovo, e
    /// ognuno porta con sé una `URLSession` mai invalidata: una URLSession
    /// trattiene sé stessa finché non la si invalida, quindi ogni refresh
    /// lasciava dietro una sessione viva con le sue connessioni e i suoi
    /// thread. Riusarne una sola è più semplice che invalidarla ogni volta —
    /// e non c'è stato da azzerare fra un refresh e l'altro.
    private static let packageManager = WipPackageDownloadManager()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        // La registrazione DEVE avvenire prima che il lancio finisca (requisito
        // BGTaskScheduler): è quello che permette all'OS di risvegliare l'app
        // più avanti. Va fatta una volta sola, ad ogni avvio (non è persistita).
        registerOfflineRefreshTask()
        scheduleOfflineRefresh()

        // Rilancio (anche in background, per un evento location dell'OS):
        // equivalente di BootReceiver/START_STICKY su Android — se il servizio
        // era attivo, il manager riparte dai prefs.
        BackgroundPoiManager.shared.restartFromPrefsIfActive()

        // (28/08/2026) Una Live Activity sopravvive alla morte del processo:
        // senza riagganciare quella eventualmente in corso, dopo un riavvio
        // dell'app il cruscotto del giro ne avvierebbe una seconda e la
        // vecchia resterebbe appesa sulla lock screen. Vedi LiveActivityNav.
        LiveActivityNav.shared.riaggancia()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Il bridge Capacitor (NotificationRouter) si appropria del delegate
        // di UNUserNotificationCenter alla creazione della WebView, DOPO
        // didFinishLaunching: senza questa riassegnazione l'azione ▶ Ascolta
        // e il tap sulla notifica finivano nel plugin LocalNotifications (che
        // nessuno ascolta) e non arrivavano mai qui — niente audio, niente
        // deep link. Insieme a ios.handleApplicationNotifications=false nella
        // config Capacitor garantisce che il delegate resti questo.
        UNUserNotificationCenter.current().delegate = self
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Deep link itainta://poi/{id}?guide=x — stesso salvataggio "pendente"
        // di MainActivity Android: a cold start React non ha ancora i listener,
        // il JS lo recupera con getPendingDeepLink().
        if url.scheme == "itainta", url.host == "poi" {
            let poiId = url.lastPathComponent
            let guide = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "guide" })?.value ?? "nicky"
            savePendingDeepLink(poiId: poiId, guide: guide)
        }
        // (03/09/2026) I tasti della Live Activity su iOS 16 sono Link
        // itainta://nav/<azione> (WipNavIntents.swift): stessa consegna
        // dell'intent iOS 17, il plugin la gira al JS come navBannerAction.
        if let azione = WipNavLink.azione(da: url) {
            WipNavConsegna.consegna(azione)
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Notifiche POI

    /// Le notifiche del manager (arrivo, teaser, gemme) devono comparire anche
    /// con l'app in foreground, come su Android.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    /// Tap sulla notifica → deep link pendente (lettura destruttiva dal JS)
    /// + evento live se la WebView è già sveglia.
    /// Azione ▶ Ascolta → riproduzione nativa in background SENZA aprire la
    /// UI: è il percorso pensato per l'auto a schermo bloccato.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        let poiId = userInfo["poiId"] as? String ?? ""
        let guide = userInfo["guide"] as? String ?? "nicky"

        if response.actionIdentifier == BackgroundPoiManager.listenActionId {
            if !poiId.isEmpty {
                // L'azione può rilanciare l'app da zero: il manager riparte
                // dai prefs prima di cercare il POI nella cache persistita.
                BackgroundPoiManager.shared.restartFromPrefsIfActive()
                BackgroundPoiManager.shared.playGuideFromNotificationAction(poiId: poiId)
            }
            completionHandler()
            return
        }

        if !poiId.isEmpty {
            savePendingDeepLink(poiId: poiId, guide: guide)
            BackgroundPoiManager.shared.sendEvent(
                "deep-link-poi",
                json: ["poiId": poiId, "guide": guide],
                extra: ["poiId": poiId]
            )
        }
        completionHandler()
    }

    private func savePendingDeepLink(poiId: String, guide: String) {
        let prefs = UserDefaults.standard
        prefs.set(poiId, forKey: "pending_deeplink_poi")
        prefs.set(guide, forKey: "pending_deeplink_guide")
        prefs.set(Date().timeIntervalSince1970 * 1000, forKey: "pending_deeplink_ts")
    }

    // MARK: - Refresh pacchetti offline in background

    /// Nessun handler registrato = l'OS non ci sveglierà mai per questo
    /// identifier, in silenzio. Il cast forzato a BGAppRefreshTask è sicuro:
    /// è l'unico identifier che registriamo ed è dichiarato come
    /// BGAppRefreshTaskRequest sotto, mai come BGProcessingTaskRequest.
    private func registerOfflineRefreshTask() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.offlineRefreshTaskId,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handleOfflineRefresh(task: refreshTask)
        }
    }

    /// Richiesta opportunistica, non prima di ~6h da ora: i pacchetti offline
    /// sono testi statici (i POI cambiano di rado), non serve un refresh
    /// aggressivo che consumi batteria — mirror lato client della cadenza
    /// "nightly" del cron server /api/poi/batch-enrich.
    private func scheduleOfflineRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.offlineRefreshTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 60 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Comune in simulatore/debug o se il sistema rifiuta la richiesta
            // (troppe già in coda): non fatale, un prossimo avvio dell'app o
            // l'apertura manuale con "Aggiorna" restano il percorso primario.
            print("[AppDelegate] scheduleOfflineRefresh fallita: \(error.localizedDescription)")
        }
    }

    private func handleOfflineRefresh(task: BGAppRefreshTask) {
        // Ri-schedula SUBITO, non a fine lavoro: se il task scade o l'app
        // viene terminata a metà, il prossimo giro è già in coda — altrimenti
        // il refresh si fermerebbe silenziosamente al primo problema.
        scheduleOfflineRefresh()

        let manager = Self.packageManager
        var finished = false
        // expirationHandler e la completion di syncAllPackages possono
        // arrivare da thread diversi: entrambe toccano `finished` e
        // `task.setTaskCompleted`, quindi vanno serializzate sulla main
        // queue — altrimenti una race potrebbe chiamare setTaskCompleted
        // due volte (l'OS lo logga come errore di programmazione).
        task.expirationHandler = {
            DispatchQueue.main.async {
                // L'OS sta revocando il tempo assegnato: niente da annullare
                // esplicitamente, le richieste di rete in corso verranno
                // semplicemente ignorate al completamento (nessuna scrittura
                // a metà: ogni pagina viene già persistita atomicamente).
                if !finished {
                    finished = true
                    task.setTaskCompleted(success: false)
                }
            }
        }
        manager.syncAllPackages {
            DispatchQueue.main.async {
                if !finished {
                    finished = true
                    task.setTaskCompleted(success: true)
                }
            }
        }
    }
}
