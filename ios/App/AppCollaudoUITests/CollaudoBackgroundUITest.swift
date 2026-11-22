// FIREBASE TEST LAB (iPhone VERO) — IL NAVIGATORE NATIVO CON L'APP DAVVERO IN BACKGROUND (22/11/2026).
// Committente: «Deve funzionare il nativo e in background. Per Android e Apple».
//
// Test di UI (XCUITest): un processo separato pilota l'app come farebbe una persona.
//  1. Avvia l'app con l'argomento -collaudoNav e, nell'ambiente, rotta e traccia del banco (le stesse del test di unità).
//     L'app, SOLO in build di debug (CollaudoNavDriver in fondo a BackgroundPoiManager.swift, #if DEBUG), accende il
//     servizio di sfondo VERO (CLLocationManager con background updates, come in produzione), consegna la rotta al
//     NavFollower e fa entrare la traccia per la strada vera (handleLocation → follower → coda vocale).
//  2. Accetta i permessi di sistema (posizione, notifiche, movimento) toccando i pulsanti di SpringBoard.
//  3. Preme HOME: l'app va in background. Poi prova a BLOCCARE lo schermo con il selettore privato di XCUIDevice
//     `pressLockButton` (esiste da anni ma non è un'API pubblica: se il dispositivo non lo accetta resta l'home, e il
//     registro lo dice).
//  4. Aspetta tutta la traccia + 60 s senza toccare nulla, poi risveglia il telefono e riporta l'app in primo piano
//     (serve solo a far scrivere al driver le ultime righe se iOS l'aveva sospesa).
// Il registro (righe «CollaudoTestLabBG …») è nel syslog del telefono, che Test Lab scarica sempre: lo legge
// scratch/collaudo-notte/test-lab/lancia-test-lab-ios.sh e lo giudica modulo-testlab-ios.mjs (background / bloccato /
// sospeso). Il test non fallisce per ciò che misura: fallisce solo se l'app non parte.
import XCTest

final class CollaudoBackgroundUITest: XCTestCase {

    private func log(_ s: String) { NSLog("CollaudoTestLabBG TESTLAB UITEST %@", s) }

    private func risorsa(_ nome: String) -> String? {
        let b = Bundle(for: CollaudoBackgroundUITest.self)
        guard let u = b.url(forResource: nome, withExtension: "json", subdirectory: "collaudo") ?? b.url(forResource: nome, withExtension: "json")
        else { return nil }
        return try? String(contentsOf: u, encoding: .utf8)
    }

    /// Tocca i pulsanti di consenso di SpringBoard (it/en): prima «sempre», poi «mentre usi», poi «consenti»/«OK».
    @discardableResult
    private func accettaPermessi(_ sb: XCUIApplication) -> Int {
        var toccati = 0
        let preferiti = [
            "label CONTAINS[c] 'sempre' OR label CONTAINS[c] 'Always'",
            "label CONTAINS[c] 'mentre usi' OR label CONTAINS[c] 'While Using'",
            "label BEGINSWITH 'Consenti' OR label BEGINSWITH 'Allow' OR label == 'OK'",
        ]
        for p in preferiti {
            let b = sb.buttons.matching(NSPredicate(format: p)).firstMatch
            if b.exists {
                log("permesso: tocco «\(b.label)»")
                b.tap()
                toccati += 1
                return toccati
            }
        }
        return toccati
    }

    func testNavigatoreConAppInBackground() throws {
        continueAfterFailure = true
        let rotta = try XCTUnwrap(risorsa("rotta"), "rotta.json assente nel pacchetto del test")
        let traccia = try XCTUnwrap(risorsa("traccia"), "traccia.json assente nel pacchetto del test")
        let fix = (try? JSONSerialization.jsonObject(with: Data(traccia.utf8))) as? [[Any]] ?? []
        let durataS = fix.count > 1
            ? (((fix.last?[3] as? NSNumber)?.doubleValue ?? 0) - ((fix.first?[3] as? NSNumber)?.doubleValue ?? 0)) / 1000
            : 600

        let app = XCUIApplication()
        app.launchArguments = ["-collaudoNav"]
        app.launchEnvironment["COLLAUDO_ROTTA"] = rotta
        app.launchEnvironment["COLLAUDO_TRACCIA"] = traccia
        app.launch()
        log("app avviata, traccia di \(Int(durataS)) s")

        // Permessi: fino a 45 s, finché compaiono finestre di sistema.
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let fine = Date().addingTimeInterval(45)
        var vuoti = 0
        while Date() < fine && vuoti < 8 {
            if accettaPermessi(sb) > 0 { vuoti = 0 } else { vuoti += 1 }
            Thread.sleep(forTimeInterval: 2)
        }

        // In background.
        Thread.sleep(forTimeInterval: 5)
        XCUIDevice.shared.press(.home)
        log("HOME premuto: app in background")
        Thread.sleep(forTimeInterval: 3)

        // Schermo bloccato, se il dispositivo accetta il selettore privato.
        let blocco = NSSelectorFromString("pressLockButton")
        if XCUIDevice.shared.responds(to: blocco) {
            _ = XCUIDevice.shared.perform(blocco)
            log("BLOCCO richiesto (pressLockButton)")
        } else {
            log("BLOCCO non disponibile: resta l'home")
        }

        // La traccia intera senza toccare nulla. Ogni tanto si guarda se una finestra di sistema chiede «Consenti
        // sempre?» (iOS la mostra quando l'app usa la posizione in background): si accetta, come farebbe l'utente.
        let attesa = Date().addingTimeInterval(durataS + 60)
        while Date() < attesa {
            Thread.sleep(forTimeInterval: 20)
            if sb.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'sempre' OR label CONTAINS[c] 'Always'")).firstMatch.exists {
                accettaPermessi(sb)
            }
        }
        log("traccia finita: risveglio e primo piano")

        // Risveglio (iPhone con tasto home: due pressioni) e app in primo piano, per le ultime righe del driver.
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 2)
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 2)
        app.activate()
        Thread.sleep(forTimeInterval: 40)
        log("fine test di UI (stato app \(app.state.rawValue))")
        XCTAssertNotEqual(app.state, .notRunning, "l'app non è in esecuzione a fine test")
    }
}
