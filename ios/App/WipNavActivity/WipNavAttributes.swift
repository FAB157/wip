//
//  WipNavAttributes.swift
//  WipNavActivity
//
//  CRUSCOTTO DEL NAVIGATORE — contratto dei dati (28/08/2026)
//
//  QUESTO FILE VA IN DUE TARGET: l'app (App) e l'estensione widget
//  (WipNavActivity). E' il tipo condiviso fra chi la Live Activity la avvia
//  (LiveActivityNav.swift, dentro l'app) e chi la disegna
//  (WipNavLiveActivity.swift, dentro l'estensione). Se sta in un target solo,
//  l'altro non compila: in Xcode, ispettore File → Target Membership, entrambe
//  le spunte.
//
//  I campi NON sono inventati: sono esattamente quelli che App.tsx compone
//  gia' oggi per il banner (src/App.tsx, effect del banner di navigazione) e
//  che il plugin riceve in `updateNavBanner`.
//

import Foundation

/// L'App Group che app ed estensione condividono: e' l'unico posto dove
/// l'app puo' scrivere la foto della tappa e il widget leggerla. Va
/// abilitato in Xcode (Signing & Capabilities → App Groups) su ENTRAMBI i
/// target; finche' non c'e', `containerURL` risponde nil e il cruscotto
/// resta senza foto — mai un errore. Fuori dall'#if: lo usa anche l'app
/// dove ActivityKit potrebbe non esserci.
enum WipNavAppGroup {
    static let id = "group.com.itaintasca.app"
}

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct WipNavAttributes: ActivityAttributes {

    /// Parte che cambia a ogni svolta / cambio di tappa.
    public struct ContentState: Codable, Hashable {
        /// Nome della tappa corrente ("Duomo di Carrara").
        var nomeTappa: String
        /// Indice della tappa corrente, 1-based.
        var indiceTappa: Int
        /// Numero totale di tappe del giro.
        var tappeTotali: Int
        /// Metri alla porta della tappa. < 0 = sconosciuto (non si mostra).
        var metriAllaTappa: Double
        /// Istruzione di svolta ("Gira a destra in Via Roma"). Vuota = nessuna.
        var istruzione: String
        /// Metri alla svolta. < 0 = sconosciuto.
        var metriAllaSvolta: Double
        /// Metri che restano fino alla fine del giro.
        var metriRimanenti: Double
        /// Ora d'arrivo stimata gia' formattata dal JS ("14:35"). Vuota = ignota.
        var eta: String
        /// Nome della tappa successiva. Vuoto = questa e' l'ultima.
        var nomeProssima: String
        /// (29/08/2026) Percorso su disco della foto della tappa, gia'
        /// scaricata dall'app nel contenitore dell'App Group (l'estensione
        /// non puo' fare rete e lo stato ha un tetto di 4 KB: niente URL
        /// remoti, niente byte). Vuoto = nessuna foto.
        var fotoPath: String
    }

    /// Parte fissa per tutta la durata del giro: il titolo del giro, se c'e'.
    var titoloGiro: String
}

// Formattazione condivisa fra app ed estensione: i metri si scrivono in un
// modo solo. Sotto il chilometro metri interi, sopra un decimale di km.
@available(iOS 16.1, *)
enum WipNavFormat {
    static func distanza(_ metri: Double) -> String {
        if metri < 0 { return "" }
        if metri >= 1000 { return String(format: "%.1f km", metri / 1000) }
        return "\(Int(metri.rounded())) m"
    }
}
#endif
