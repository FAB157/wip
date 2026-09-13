//
//  LiveActivityMuseum.swift
//  App
//
//  IL CRUSCOTTO DELLA VISITA MUSEO — lato app (13/09/2026).
//
//  Avvia, aggiorna e chiude la Live Activity `WipMuseumAttributes`: il
//  riquadro che resta sulla lock screen e nella Dynamic Island con l'opera
//  ascoltata, quella in ascolto e la prossima, aggiornato da
//  MuseumVisitSheet.tsx via WipBackgroundAudioPlugin.updateMuseumBanner.
//  Ricalca LiveActivityNav.swift (stessa struttura), come richiesto dal
//  requisito del 12/09/2026: non e' una riscrittura, e' lo stesso schema
//  applicato a uno stato diverso.
//
//  TUTTO E' BEST-EFFORT, per gli stessi tre motivi di LiveActivityNav (iOS
//  < 16.1, utente che le ha disattivate, richiesta rifiutata dal sistema):
//  in ognuno di questi casi il banner Now Playing (gia' in produzione dal
//  12/09 sera) resta comunque il ripiego con titolo/prossima sulla lock
//  screen, quindi l'utente non perde mai il "cosa sto ascoltando / cosa
//  ascolto dopo".
//
//  Il tipo `WipMuseumAttributes` sta in
//  ios/App/WipNavActivity/WipMuseumAttributes.swift e DEVE essere in target
//  membership sia di App sia di WipNavActivity.
//

import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

final class LiveActivityMuseum {

    static let shared = LiveActivityMuseum()
    private init() {}

    #if canImport(ActivityKit)
    /// Una sola per volta: una visita, un cruscotto.
    @available(iOS 16.1, *)
    private static var attivita: Activity<WipMuseumAttributes>? {
        get { _attivitaBox as? Activity<WipMuseumAttributes> }
        set { _attivitaBox = newValue }
    }
    private static var _attivitaBox: Any?
    #endif

    var disponibili: Bool {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        return false
    }

    /**
     * Avvia il cruscotto, o lo aggiorna se e' gia' in corso.
     * - returns: `true` se la Live Activity ha preso in carico il banner.
     */
    @discardableResult
    func avviaOAggiorna(nomeMuseo: String, stato: [String: Any]) -> Bool {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return false }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

        let contenuto = LiveActivityMuseum.statoDaDizionario(stato)

        if let corrente = LiveActivityMuseum.attivita {
            Task { await LiveActivityMuseum.aggiornaAttivita(corrente, contenuto) }
            return true
        }

        do {
            let attributi = WipMuseumAttributes(nomeMuseo: nomeMuseo)
            let nuova: Activity<WipMuseumAttributes>
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
            LiveActivityMuseum.attivita = nuova
            return true
        } catch {
            NSLog("[LiveActivityMuseum] avvio non riuscito: \(error.localizedDescription)")
            return false
        }
        #else
        return false
        #endif
    }

    /// Chiude il cruscotto: fine della visita, o audioguida spenta.
    func termina() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        guard let corrente = LiveActivityMuseum.attivita else { return }
        LiveActivityMuseum.attivita = nil
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
     * RIALLINEAMENTO AL RIAVVIO DELL'APP, stesso motivo di
     * LiveActivityNav.riaggancia(): una Live Activity sopravvive alla morte
     * del processo, senza questo l'app ne avvierebbe una seconda.
     */
    func riaggancia() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        LiveActivityMuseum.attivita = Activity<WipMuseumAttributes>.activities.first
        #endif
    }

    // MARK: - Interno

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func aggiornaAttivita(
        _ attivita: Activity<WipMuseumAttributes>,
        _ contenuto: WipMuseumAttributes.ContentState
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
    private static func statoDaDizionario(_ d: [String: Any]) -> WipMuseumAttributes.ContentState {
        func stringa(_ k: String) -> String { (d[k] as? String) ?? "" }
        func numero(_ k: String, _ def: Double) -> Double {
            if let v = d[k] as? Double { return v }
            if let v = d[k] as? Int { return Double(v) }
            if let v = d[k] as? NSNumber { return v.doubleValue }
            return def
        }
        func booleano(_ k: String) -> Bool {
            if let v = d[k] as? Bool { return v }
            if let v = d[k] as? NSNumber { return v.boolValue }
            if let v = d[k] as? String { return v == "true" || v == "1" }
            return false
        }
        let progresso = numero("inAscoltoProgresso", -1)
        return WipMuseumAttributes.ContentState(
            ascoltataTitolo: stringa("ascoltataTitolo"),
            ascoltataSala: stringa("ascoltataSala"),
            inAscoltoTitolo: stringa("inAscoltoTitolo"),
            inAscoltoSala: stringa("inAscoltoSala"),
            inAscoltoProgresso: progresso < 0 ? -1 : min(1, max(0, progresso)),
            inPausa: booleano("inPausa"),
            prossimaTitolo: stringa("prossimaTitolo"),
            prossimaSala: stringa("prossimaSala"),
            indiceTappa: Int(numero("indiceTappa", 1)),
            tappeTotali: max(Int(numero("tappeTotali", 1)), 1)
        )
    }
    #endif
}
