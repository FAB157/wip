//
//  WipMuseumAttributes.swift
//  App + WipNavActivity
//
//  IL CRUSCOTTO DELLA VISITA MUSEO — contratto dei dati (13/09/2026).
//
//  REQUISITO del committente (12/09/2026, vedi memoria di sessione
//  requisito-live-activity-visita-museo): «mentre si attiva la guida [...]
//  ci deve essere un live activity sul display [...] con l'opera che hai
//  ascoltato, quella che stai ascoltando e la prossima. L'utente cliccando
//  o con comandi vocali puo' attivare la guida dell'opera successiva senza
//  aprire l'app».
//
//  Ricalca WipNavAttributes.swift (stessa struttura attributi/stato), come
//  richiesto: NON e' un nuovo target Xcode, e' un secondo tipo di Live
//  Activity nella STESSA estensione WipNavActivity (vedi
//  WipNavActivityBundle.swift, che ora elenca entrambi i widget).
//
//  QUESTO FILE VA IN DUE TARGET (App e WipNavActivity), esattamente come
//  WipNavAttributes.swift: in Xcode, ispettore File -> Target Membership,
//  spuntare entrambi. Senza questo passo l'estensione non compila.
//

import Foundation

/// Il canale con cui un tocco sul tasto "Prossima" arriva all'app (vedi
/// WipMuseumIntents.swift): stesso schema di WipNavAzione, namespace diverso
/// per non confondersi con le azioni del navigatore.
enum WipMuseumAzione {
    static let notifica = Notification.Name("wip.museum.azione")
    static let chiavePendente = "wipMuseumAzionePendente"
    static let prossima = "prossima"
}

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct WipMuseumAttributes: ActivityAttributes {

    /// Parte che cambia opera per opera.
    public struct ContentState: Codable, Hashable {
        /// Titolo dell'opera appena conclusa. Vuoto = prima opera del giro,
        /// niente "ascoltata" da mostrare.
        var ascoltataTitolo: String
        /// Sala dell'opera ascoltata. Vuota = sconosciuta/non applicabile.
        var ascoltataSala: String
        /// Titolo dell'opera in ascolto ora. Vuoto = nessuna (fra un'opera
        /// e la prossima, mentre parla il teaser).
        var inAscoltoTitolo: String
        var inAscoltoSala: String
        /// Avanzamento 0...1 dell'opera in ascolto; nil o < 0 = ignoto (niente
        /// barra). Aggiornamento best-effort, non ad ogni secondo.
        var inAscoltoProgresso: Double?
        /// In pausa: il tasto play/pausa cambia faccia.
        var inPausa: Bool?
        /// Titolo dell'opera successiva nel percorso. Vuoto = questa e'
        /// l'ultima tappa del giro.
        var prossimaTitolo: String
        var prossimaSala: String
        /// Indice 1-based e totale tappe, per "3/12" in testa alla card.
        var indiceTappa: Int
        var tappeTotali: Int

        // Letture comode con i default, per le viste (stesso stile di
        // WipNavAttributes.ContentState).
        var eInPausa: Bool { inPausa ?? false }
        var progressoEffettivo: Double { inAscoltoProgresso ?? -1 }
        var haAscoltata: Bool { !ascoltataTitolo.isEmpty }
        var haInAscolto: Bool { !inAscoltoTitolo.isEmpty }
        var haProssima: Bool { !prossimaTitolo.isEmpty }
    }

    /// Parte fissa per tutta la durata della visita: il nome del museo.
    var nomeMuseo: String
}
#endif
