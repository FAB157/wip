//
//  LiveActivityNav.swift
//  App
//
//  IL CRUSCOTTO DEL NAVIGATORE — lato app (28/08/2026).
//
//  Avvia, aggiorna e chiude la Live Activity `WipNavActivity`: il riquadro
//  che resta sulla lock screen e nella Dynamic Island e si aggiorna da solo
//  mentre si cammina. E' l'equivalente iOS della notifica persistente del
//  foreground service Android: stessa API per il JS
//  (`ItaintaBackgroundPoiPlugin.updateNavBanner`), due meccanismi diversi
//  sotto.
//
//  TUTTO E' BEST-EFFORT. Le Live Activities possono non esserci per tre
//  motivi diversi (iOS < 16.1, l'utente le ha disattivate per l'app in
//  Impostazioni → WIP → Attivita in tempo reale, oppure la richiesta fallisce
//  perche' l'app e' in background da troppo): in ognuno di questi casi
//  `avvia`/`aggiorna` rispondono `false` e il chiamante ripiega sulla
//  notifica locale di sempre. Mai lasciare l'utente senza cruscotto.
//
//  Il tipo `WipNavAttributes` sta in ios/App/WipNavActivity/WipNavAttributes.swift
//  e DEVE essere in target membership sia di App sia di WipNavActivity.
//

import Foundation
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

final class LiveActivityNav {

    static let shared = LiveActivityNav()
    private init() {}

    #if canImport(ActivityKit)
    /// L'attivita' in corso. Una sola per volta: un giro, un cruscotto.
    @available(iOS 16.1, *)
    private static var attivita: Activity<WipNavAttributes>? {
        get { _attivitaBox as? Activity<WipNavAttributes> }
        set { _attivitaBox = newValue }
    }
    /// Contenitore non tipizzato: una `static var` con tipo `@available` non
    /// si puo' dichiarare direttamente in una classe senza availability.
    private static var _attivitaBox: Any?
    #endif

    /// Le Live Activities sono disponibili E abilitate dall'utente?
    var disponibili: Bool {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        return false
    }

    /**
     * Avvia il cruscotto, o lo aggiorna se e' gia' in corso: il JS chiama
     * sempre lo stesso metodo, la distinzione la fa qui.
     * - returns: `true` se la Live Activity ha preso in carico il banner.
     */
    @discardableResult
    func avviaOAggiorna(titoloGiro: String, stato: [String: Any]) -> Bool {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return false }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

        LiveActivityNav.ultimoStato = stato
        LiveActivityNav.ultimoTitolo = titoloGiro
        var contenuto = LiveActivityNav.statoDaDizionario(stato)
        // La foto della tappa: se e' gia' su disco entra subito nello stato,
        // altrimenti parte il download e lo stato si aggiorna quando arriva.
        let fotoUrl = (stato["foto"] as? String) ?? ""
        contenuto.fotoPath = LiveActivityNav.fotoPronta(fotoUrl) ?? ""
        if contenuto.fotoPath.isEmpty, !fotoUrl.isEmpty {
            LiveActivityNav.scaricaFoto(fotoUrl)
        }

        if let corrente = LiveActivityNav.attivita {
            Task { await LiveActivityNav.aggiornaAttivita(corrente, contenuto) }
            return true
        }

        do {
            let attributi = WipNavAttributes(titoloGiro: titoloGiro)
            let nuova: Activity<WipNavAttributes>
            if #available(iOS 16.2, *) {
                nuova = try Activity.request(
                    attributes: attributi,
                    content: ActivityContent(state: contenuto, staleDate: nil),
                    pushType: nil
                )
            } else {
                nuova = try Activity.request(
                    attributes: attributi,
                    contentState: contenuto,
                    pushType: nil
                )
            }
            LiveActivityNav.attivita = nuova
            return true
        } catch {
            // Richiesta rifiutata (troppe attivita', app in background da
            // troppo tempo, budget di sistema): si ripiega sulla notifica.
            NSLog("[LiveActivityNav] avvio non riuscito: \(error.localizedDescription)")
            return false
        }
        #else
        return false
        #endif
    }

    /// Chiude il cruscotto: fine del giro, pausa, o stop dell'audioguida.
    func termina() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        guard let corrente = LiveActivityNav.attivita else { return }
        LiveActivityNav.attivita = nil
        Task {
            if #available(iOS 16.2, *) {
                await corrente.end(nil, dismissalPolicy: .immediate)
            } else {
                await corrente.end(dismissalPolicy: .immediate)
            }
        }
        #endif
    }

    /**
     * RIALLINEAMENTO AL RIAVVIO DELL'APP. Una Live Activity sopravvive alla
     * morte del processo: senza questo, dopo un riavvio l'app non avrebbe
     * piu' il riferimento e ne avvierebbe una seconda (o lascerebbe appesa
     * la vecchia per ore). Da chiamare all'avvio, prima di tutto il resto.
     */
    func riaggancia() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        LiveActivityNav.attivita = Activity<WipNavAttributes>.activities.first
        #endif
    }

    // MARK: - Foto della tappa (29/08/2026)

    /// URL dell'ultima foto richiesta: se ne arriva una diversa prima che il
    /// download finisca, la vecchia non deve finire nel cruscotto.
    private static var fotoUrlCorrente = ""
    /// Ultimo stato spedito alla Live Activity: serve per ripubblicarlo con
    /// la foto quando il download finisce, senza aspettare la svolta dopo.
    private static var ultimoStato: [String: Any] = [:]
    private static var ultimoTitolo = ""

    /// Cartella condivisa con l'estensione (App Group). nil = App Group non
    /// configurato in Xcode: si va avanti senza foto.
    private static var cartellaFoto: URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WipNavAppGroup.id) else { return nil }
        let dir = base.appendingPathComponent("wip-nav-foto", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func fileFoto(_ url: String) -> URL? {
        guard let dir = cartellaFoto else { return nil }
        // Nome stabile dall'URL: stessa foto, stesso file, nessun doppione.
        let nome = String(url.hashValue, radix: 16, uppercase: false).replacingOccurrences(of: "-", with: "n")
        return dir.appendingPathComponent("\(nome).jpg")
    }

    /// Il percorso se la foto e' gia' su disco, altrimenti nil.
    private static func fotoPronta(_ url: String) -> String? {
        guard url.hasPrefix("http"), let f = fileFoto(url) else { return nil }
        return FileManager.default.fileExists(atPath: f.path) ? f.path : nil
    }

    /// Scarica, riduce a 256 px e salva nell'App Group; poi ripubblica lo
    /// stato corrente con la foto. Tutto best-effort: un errore = niente foto.
    private static func scaricaFoto(_ url: String) {
        guard url.hasPrefix("http"), let remoto = URL(string: url), let destinazione = fileFoto(url) else { return }
        guard fotoUrlCorrente != url else { return }   // gia' in corso
        fotoUrlCorrente = url
        var richiesta = URLRequest(url: remoto)
        richiesta.timeoutInterval = 10
        URLSession.shared.dataTask(with: richiesta) { dati, risposta, _ in
            guard let dati = dati, (risposta as? HTTPURLResponse)?.statusCode ?? 200 < 300,
                  let img = UIImage(data: dati) else { return }
            // Quadrata e piccola: l'estensione ha poca memoria e la lock
            // screen la mostra a 64 pt.
            let lato = min(img.size.width, img.size.height)
            let ritaglio = CGRect(x: (img.size.width - lato) / 2, y: (img.size.height - lato) / 2, width: lato, height: lato)
            guard let cg = img.cgImage?.cropping(to: ritaglio.applying(CGAffineTransform(scaleX: img.scale, y: img.scale))) else { return }
            let piccola = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256)).image { _ in
                UIImage(cgImage: cg, scale: 1, orientation: img.imageOrientation).draw(in: CGRect(x: 0, y: 0, width: 256, height: 256))
            }
            guard let jpg = piccola.jpegData(compressionQuality: 0.8) else { return }
            do { try jpg.write(to: destinazione, options: .atomic) } catch { return }
            // La tappa e' ancora questa? Allora si ripubblica con la foto.
            DispatchQueue.main.async {
                guard fotoUrlCorrente == url else { return }
                #if canImport(ActivityKit)
                if #available(iOS 16.1, *), let corrente = attivita {
                    var stato = statoDaDizionario(ultimoStato)
                    stato.fotoPath = destinazione.path
                    Task { await aggiornaAttivita(corrente, stato) }
                }
                #endif
            }
        }.resume()
    }

    // MARK: - Interno

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func aggiornaAttivita(
        _ attivita: Activity<WipNavAttributes>,
        _ contenuto: WipNavAttributes.ContentState
    ) async {
        if #available(iOS 16.2, *) {
            await attivita.update(ActivityContent(state: contenuto, staleDate: nil))
        } else {
            await attivita.update(using: contenuto)
        }
    }

    /// Traduce il dizionario che arriva dal JS nello stato tipizzato. Ogni
    /// campo ha un default: una build web piu' vecchia che ne manda meno non
    /// deve far fallire il cruscotto.
    @available(iOS 16.1, *)
    private static func statoDaDizionario(_ d: [String: Any]) -> WipNavAttributes.ContentState {
        func stringa(_ k: String) -> String { (d[k] as? String) ?? "" }
        func numero(_ k: String, _ def: Double) -> Double {
            if let v = d[k] as? Double { return v }
            if let v = d[k] as? Int { return Double(v) }
            if let v = d[k] as? NSNumber { return v.doubleValue }
            return def
        }
        return WipNavAttributes.ContentState(
            nomeTappa: stringa("nomeTappa"),
            indiceTappa: Int(numero("indiceTappa", 1)),
            tappeTotali: max(Int(numero("tappeTotali", 1)), 1),
            metriAllaTappa: numero("metriAllaTappa", -1),
            istruzione: stringa("istruzione"),
            metriAllaSvolta: numero("metriAllaSvolta", -1),
            metriRimanenti: max(numero("metriRimanenti", 0), 0),
            eta: stringa("eta"),
            nomeProssima: stringa("nomeProssima"),
            fotoPath: ""
        )
    }
    #endif
}
