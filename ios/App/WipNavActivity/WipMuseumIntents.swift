//
//  WipMuseumIntents.swift
//  WipNavActivity + App
//
//  IL TASTO "PROSSIMA" DELLA LIVE ACTIVITY VISITA MUSEO (13/09/2026).
//
//  Stesso meccanismo di WipNavIntents.swift: un `LiveActivityIntent` gira
//  NEL PROCESSO DELL'APP (il sistema lo sveglia in background se serve), mai
//  nell'estensione. Da qui si consegna l'azione con lo stesso canale a due
//  vie del navigatore (notifica in-process + chiave pendente nell'App
//  Group), cosi' funziona anche se l'app e' stata appena rilanciata dal
//  sistema e il plugin non e' ancora in ascolto.
//
//  SCELTA DELIBERATA: l'azione "prossima" non inventa un evento JS nuovo.
//  WipBackgroundAudioPlugin la traduce nello STESSO evento 'remoteNext' gia'
//  usato dal tasto "successiva" della schermata di blocco (vedi
//  WipBackgroundAudioPlugin.swift, load()): MuseumVisitSheet.tsx ascolta gia'
//  quell'evento e sa passare all'opera dopo. Un solo punto d'ingresso lato
//  JS per "avanza", non due da mantenere allineati.
//
//  QUESTO FILE VA IN DUE TARGET (App e WipNavActivity), come
//  WipMuseumAttributes.swift.
//

import Foundation

/// Schema URL di ripiego per iOS 16 (niente App Intent nei Button):
/// itainta://museo/prossima. L'app lo apre e AppDelegate lo traduce nella
/// stessa consegna (stesso trattamento di WipNavLink).
enum WipMuseumLink {
    static let prefisso = "itainta://museo/"
    static func url(_ azione: String) -> URL? { URL(string: prefisso + azione) }
    static func azione(da url: URL) -> String? {
        let s = url.absoluteString
        guard s.hasPrefix(prefisso) else { return nil }
        let a = String(s.dropFirst(prefisso.count)).split(separator: "?").first.map(String.init) ?? ""
        return a.isEmpty ? nil : a
    }
}

enum WipMuseumConsegna {
    static func consegna(_ azione: String) {
        UserDefaults(suiteName: WipNavAppGroup.id)?.set(azione, forKey: WipMuseumAzione.chiavePendente)
        NotificationCenter.default.post(name: WipMuseumAzione.notifica, object: nil, userInfo: ["azione": azione])
    }
}

#if canImport(AppIntents) && canImport(ActivityKit)
import AppIntents
import ActivityKit

@available(iOS 17.0, *)
struct WipMuseumAzioneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "WIP Museo"
    static var description = IntentDescription("Passa all'opera successiva della visita museo dalla lock screen")
    /// Non compare in Spotlight/Scorciatoie: e' un tasto, non una funzione.
    static var isDiscoverable: Bool = false

    @Parameter(title: "Azione")
    var azione: String

    init() {}
    init(azione: String) { self.azione = azione }

    func perform() async throws -> some IntentResult {
        await MainActor.run { WipMuseumConsegna.consegna(azione) }
        return .result()
    }
}
#endif
