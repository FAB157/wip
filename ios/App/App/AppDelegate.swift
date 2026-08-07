import UIKit
import Capacitor
import CoreLocation
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        // Rilancio (anche in background, per un evento location dell'OS):
        // equivalente di BootReceiver/START_STICKY su Android — se il servizio
        // era attivo, il manager riparte dai prefs.
        BackgroundPoiManager.shared.restartFromPrefsIfActive()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
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
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let poiId = userInfo["poiId"] as? String, !poiId.isEmpty {
            let guide = userInfo["guide"] as? String ?? "nicky"
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
}
