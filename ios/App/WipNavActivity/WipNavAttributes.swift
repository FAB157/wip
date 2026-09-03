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
//  (03/09/2026, collaudo del committente: «il banner live dovrebbe essere
//  questo blu con gli stessi tasti del controller sotto».) Lo stato porta
//  anche la MANOVRA (per la freccia grande), l'AVANZAMENTO (per la barra),
//  la PAUSA (per l'icona play/pause) e il MODO (per decidere quali tasti
//  mostrare). I tasti sono in WipNavIntents.swift.
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

/// Il canale con cui un tocco sui tasti della Live Activity arriva all'app
/// (vedi WipNavIntents.swift): un nome di notifica e una chiave nell'App
/// Group per il caso in cui il plugin non sia ancora in ascolto.
enum WipNavAzione {
    static let notifica = Notification.Name("wip.nav.azione")
    static let chiavePendente = "wipNavAzionePendente"
    static let pausa = "pausa"
    static let riascolta = "riascolta"
    static let salta = "salta"
    static let ricalcola = "ricalcola"
    static let termina = "termina"
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
        // ── Campi del 03/09/2026, TUTTI OPZIONALI: una Live Activity gia'
        //    viva, creata dalla build precedente, viene ripresa al riavvio
        //    (riaggancia) decodificando lo stato salvato dal sistema; un
        //    campo obbligatorio in piu' farebbe fallire la decodifica e
        //    lascerebbe il vecchio cruscotto appeso per ore. ──
        /// SF Symbol della manovra corrente, gia' risolto dall'app
        /// (WipNavManovra.simbolo): la freccia grande della card.
        var manovra: String?
        /// Avanzamento 0...1 sul percorso; nil o < 0 = ignoto (barra nascosta).
        var progresso: Double?
        /// Metri totali del percorso (per il piede «1.5 km in tutto»).
        var metriTotali: Double?
        /// In pausa: il tasto mostra «riprendi» e la freccia si spegne.
        var inPausa: Bool?
        /// "giro" (audioguida), "percorso" (su misura), "singola" (una tappa):
        /// decide quali tasti hanno senso. nil/vuoto = "giro".
        var modo: String?
        /// Minuti stimati all'arrivo (per «10 min · 19:02»); nil o < 0 = ignoto.
        var minutiRimanenti: Double?

        // Letture comode con i default, per le viste.
        var simboloManovra: String { let m = manovra ?? ""; return m.isEmpty ? "location.north.fill" : m }
        var eInPausa: Bool { inPausa ?? false }
        var modoEffettivo: String { let m = modo ?? ""; return m.isEmpty ? "giro" : m }
        var progressoEffettivo: Double { progresso ?? -1 }
        var minutiEffettivi: Double { minutiRimanenti ?? -1 }
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
    static func minuti(_ m: Double) -> String {
        if m < 0 { return "" }
        if m < 1 { return "<1 min" }
        return "\(Int(m.rounded())) min"
    }
}

/**
 * Tipo + verso della manovra OSRM → SF Symbol. Stessa tabella di
 * NavigationOverlay.tsx (maneuverIcon), che disegna la card blu in app:
 * la freccia sulla lock screen deve essere la stessa che si vede aprendo
 * l'app. Si risolve nell'APP (LiveActivityNav.statoDaDizionario), cosi'
 * l'estensione riceve un nome di simbolo e non deve conoscere OSRM.
 */
enum WipNavManovra {
    static func simbolo(tipo: String, verso: String) -> String {
        let t = tipo.lowercased()
        let m = verso.lowercased()
        if t == "arrive" { return "flag.checkered" }
        if t == "depart" { return "figure.walk" }
        if t == "reroute" { return "arrow.triangle.2.circlepath" }
        if t == "roundabout" || t == "rotary" { return m.contains("left") ? "arrow.counterclockwise" : "arrow.clockwise" }
        if m == "uturn" { return "arrow.uturn.left" }
        if m == "sharp left" { return "arrow.left" }
        if m == "sharp right" { return "arrow.right" }
        if m == "slight left" { return "arrow.up.left" }
        if m == "slight right" { return "arrow.up.right" }
        if m == "left" { return "arrow.turn.up.left" }
        if m == "right" { return "arrow.turn.up.right" }
        if m == "straight" || t == "continue" || t == "new name" { return "arrow.up" }
        return "location.north.fill"
    }
}
#endif
