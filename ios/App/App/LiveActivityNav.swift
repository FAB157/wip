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

        let contenuto = LiveActivityNav.statoDaDizionario(stato)

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
            nomeProssima: stringa("nomeProssima")
        )
    }
    #endif
}
