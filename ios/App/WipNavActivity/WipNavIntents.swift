//
//  WipNavIntents.swift
//  WipNavActivity + App
//
//  I TASTI DELLA LIVE ACTIVITY (03/09/2026, collaudo del committente: «il
//  banner live dovrebbe essere questo blu con gli stessi tasti del
//  controller sotto»).
//
//  Una Live Activity non ha tocchi liberi: dal iOS 17 puo' avere dei Button
//  legati a un App Intent. Un `LiveActivityIntent` ha una proprieta'
//  preziosa: il suo `perform()` gira NEL PROCESSO DELL'APP (il sistema la
//  sveglia in background se serve), non nell'estensione. Quindi da qui si
//  puo' parlare col plugin Capacitor, che gira il tocco al JS come evento
//  `navBannerAction`; e il JS fa quello che farebbe il tasto del cruscotto
//  (tourService.impostaPausa / riascolta / salta / ricalcolaDaQui / termina).
//
//  QUESTO FILE VA IN DUE TARGET (App e WipNavActivity), come
//  WipNavAttributes.swift: l'estensione lo usa per costruire i Button, l'app
//  per eseguire perform(). Sotto iOS 17 i tasti sono dei Link con lo schema
//  dell'app (itainta://nav/<azione>): il tocco apre l'app e AppDelegate lo
//  traduce nella stessa notifica.
//
//  Due canali per lo stesso tocco, perche' il plugin potrebbe non essere
//  ancora in ascolto quando il sistema ha appena rilanciato l'app:
//  1. NotificationCenter (in-process, immediato) — lo osserva
//     ItaintaBackgroundPoiPlugin.load();
//  2. una chiave nell'App Group (`wipNavAzionePendente`) — la legge lo stesso
//     load() al primo avvio e la cancella chi la consuma.
//
//  AGGIORNAMENTO OTTIMISTICO: pausa/riprendi e termina cambiano la Live
//  Activity SUBITO, dentro perform(), senza aspettare che il JS rimandi lo
//  stato (che arrivera' comunque e confermera'). Un tasto che non reagisce
//  al tocco sembra rotto anche quando sta funzionando.
//

import Foundation

/// Lo schema URL di ripiego (iOS 16): itainta://nav/<azione>.
enum WipNavLink {
    static let prefisso = "itainta://nav/"
    static func url(_ azione: String) -> URL? { URL(string: prefisso + azione) }
    /// L'azione dentro un URL di questo tipo, o nil se non lo e'.
    static func azione(da url: URL) -> String? {
        let s = url.absoluteString
        guard s.hasPrefix(prefisso) else { return nil }
        let a = String(s.dropFirst(prefisso.count)).split(separator: "?").first.map(String.init) ?? ""
        return a.isEmpty ? nil : a
    }
}

/// Consegna dell'azione all'app: chiave pendente + notifica. Usata dal
/// perform() dell'intent (iOS 17) e da AppDelegate per il Link (iOS 16, e
/// «salta»/«ricalcola» anche su iOS 17).
/// (21/09/2026) Con l'azione viaggia `ts`, l'istante del TOCCO (ms dal 1970):
/// nell'App Group accanto alla chiave pendente e nella notifica. Il JS la
/// usa per la regola dei 60 s (un «Termina» vecchio chiede conferma, «Salta»
/// e «Ricalcola» vecchi si scartano), che prima su iOS non valeva mai.
enum WipNavConsegna {
    static func consegna(_ azione: String) {
        let ts = Date().timeIntervalSince1970 * 1000
        let gruppo = UserDefaults(suiteName: WipNavAppGroup.id)
        gruppo?.set(azione, forKey: WipNavAzione.chiavePendente)
        gruppo?.set(ts, forKey: WipNavAzione.chiavePendenteTs)
        NotificationCenter.default.post(name: WipNavAzione.notifica, object: nil, userInfo: ["azione": azione, "ts": ts])
    }
}

#if canImport(AppIntents) && canImport(ActivityKit)
import AppIntents
import ActivityKit

@available(iOS 17.0, *)
struct WipNavAzioneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "WIP Nav"
    static var description = IntentDescription("Comanda il navigatore WIP dalla lock screen")
    /// Non compare in Spotlight/Scorciatoie: e' un tasto, non una funzione.
    static var isDiscoverable: Bool = false

    @Parameter(title: "Azione")
    var azione: String

    init() {}
    init(azione: String) { self.azione = azione }

    func perform() async throws -> some IntentResult {
        let a = azione
        // L'effetto visibile subito, sulla Live Activity stessa.
        if let attivita = Activity<WipNavAttributes>.activities.first {
            if a == WipNavAzione.pausa || a == WipNavAzione.riprendi {
                // (21/09/2026) Lo stato VOLUTO, non l'opposto di quello
                // mostrato: il tasto porta già l'azione giusta.
                var stato = attivita.content.state
                stato.inPausa = (a == WipNavAzione.pausa)
                await attivita.update(ActivityContent(state: stato, staleDate: nil))
            } else if a == WipNavAzione.termina {
                await attivita.end(nil, dismissalPolicy: .immediate)
            }
        }
        await MainActor.run { WipNavConsegna.consegna(a) }
        return .result()
    }
}
#endif
