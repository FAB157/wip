//
//  WipWidgetDati.swift
//  WipNavActivity (Widget Extension)
//
//  LO SNAPSHOT DEI WIDGET — contratto dei dati (14/09/2026).
//
//  E' la lettura tipizzata del JSON che l'app scrive nell'App Group
//  (WipWidgetsPlugin.swift, chiave `wipWidgetDati`), composto da
//  src/lib/widgetDati.ts. Ogni campo ha un default: uno snapshot di una
//  build web piu' vecchia, con meno campi, non deve rompere il widget.
//  Le etichette arrivano gia' tradotte dall'app: qui non c'e' i18n.
//

import Foundation
import UIKit

struct WipWidgetEtichette: Decodable {
    var itinerario = "Itinerario di oggi"
    var prossima = "Prossima tappa"
    var poi = "Poi"
    var visita = "Continua la visita"
    var ascoltate = "ascoltate"
    var prossimaOpera = "Prossima opera"
    var crediti = "crediti"
    var pass = "Day Pass attivo"
    var passMuseo = "Pass Museo"
    var scade = "scade alle"
    var guide = "guide"
    var vicini = "Vicino a te"
    var gemma = "Gemma"
    var nessuno = "Apri WIP per aggiornare"
    var apri = "Apri WIP"
    var aggiornato = "agg."
    var fatte = "fatte"

    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Chiavi.self)
        func s(_ k: Chiavi, _ def: String) -> String { (try? c.decodeIfPresent(String.self, forKey: k)) ?? def }
        itinerario = s(.itinerario, itinerario); prossima = s(.prossima, prossima); poi = s(.poi, poi)
        visita = s(.visita, visita); ascoltate = s(.ascoltate, ascoltate); prossimaOpera = s(.prossimaOpera, prossimaOpera)
        crediti = s(.crediti, crediti); pass = s(.pass, pass); passMuseo = s(.passMuseo, passMuseo); scade = s(.scade, scade)
        guide = s(.guide, guide); vicini = s(.vicini, vicini); gemma = s(.gemma, gemma); nessuno = s(.nessuno, nessuno)
        apri = s(.apri, apri); aggiornato = s(.aggiornato, aggiornato); fatte = s(.fatte, fatte)
    }
    private enum Chiavi: String, CodingKey { case itinerario, prossima, poi, visita, ascoltate, prossimaOpera, crediti, pass, passMuseo, scade, guide, vicini, gemma, nessuno, apri, aggiornato, fatte }
}

/// Decodifica «tollerante»: una chiave assente vale il default, mai un errore
/// (il Decodable sintetizzato pretende tutte le chiavi anche con i default).
private extension KeyedDecodingContainer {
    func v<T: Decodable>(_ k: Key, _ def: T) -> T { (try? decodeIfPresent(T.self, forKey: k)) ?? def }
    func o<T: Decodable>(_ k: Key) -> T? { try? decodeIfPresent(T.self, forKey: k) }
}

struct WipWidgetCrediti: Decodable {
    var totale: Int = 0
    var passAttivo: Bool = false
    var passScade: Double = 0
    var passUsate: Int = 0
    var passCap: Int = 0
    private enum K: String, CodingKey { case totale, passAttivo, passScade, passUsate, passCap }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        totale = c.v(.totale, 0); passAttivo = c.v(.passAttivo, false); passScade = c.v(.passScade, 0)
        passUsate = c.v(.passUsate, 0); passCap = c.v(.passCap, 0)
    }
}

struct WipWidgetVisita: Decodable {
    var museo: String = ""
    var ascoltate: Int = 0
    var totale: Int = 0
    var prossima: String = ""
    var sala: String = ""
    var foto: String = ""
    private enum K: String, CodingKey { case museo, ascoltate, totale, prossima, sala, foto }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        museo = c.v(.museo, ""); ascoltate = c.v(.ascoltate, 0); totale = c.v(.totale, 0)
        prossima = c.v(.prossima, ""); sala = c.v(.sala, ""); foto = c.v(.foto, "")
    }
}

struct WipWidgetTappa: Decodable, Hashable {
    var ora: String = ""
    var titolo: String = ""
    var tipo: String = ""
    var lat: Double?
    var lon: Double?
    var metri: Double?
    private enum K: String, CodingKey { case ora, titolo, tipo, lat, lon, metri }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        ora = c.v(.ora, ""); titolo = c.v(.titolo, ""); tipo = c.v(.tipo, "")
        lat = c.o(.lat); lon = c.o(.lon); metri = c.o(.metri)
    }
}

struct WipWidgetItinerario: Decodable {
    var titolo: String = ""
    var fonte: String = "piano"
    var fatte: Int = 0
    var totali: Int = 0
    var prossimaIdx: Int = 0
    var tappe: [WipWidgetTappa] = []
    private enum K: String, CodingKey { case titolo, fonte, fatte, totali, prossimaIdx, tappe }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        titolo = c.v(.titolo, ""); fonte = c.v(.fonte, "piano"); fatte = c.v(.fatte, 0)
        totali = c.v(.totali, 0); prossimaIdx = c.v(.prossimaIdx, 0); tappe = c.v(.tappe, [])
    }
}

struct WipWidgetVicino: Decodable, Hashable {
    var id: String = ""
    var nome: String = ""
    var metri: Double = 0
    var categoria: String = ""
    var gemma: Bool = false
    var foto: String = ""
    var lat: Double = 0
    var lon: Double = 0
    private enum K: String, CodingKey { case id, nome, metri, categoria, gemma, foto, lat, lon }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = c.v(.id, ""); nome = c.v(.nome, ""); metri = c.v(.metri, 0); categoria = c.v(.categoria, "")
        gemma = c.v(.gemma, false); foto = c.v(.foto, ""); lat = c.v(.lat, 0); lon = c.v(.lon, 0)
    }
}

struct WipWidgetPosizione: Decodable {
    var lat: Double = 0
    var lon: Double = 0
    var ts: Double = 0
    private enum K: String, CodingKey { case lat, lon, ts }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        lat = c.v(.lat, 0); lon = c.v(.lon, 0); ts = c.v(.ts, 0)
    }
}

struct WipWidgetSnapshot: Decodable {
    var v: Int = 0
    var ts: Double = 0
    var lingua: String = "it"
    var etichette = WipWidgetEtichette()
    var crediti: WipWidgetCrediti?
    var visita: WipWidgetVisita?
    var itinerario: WipWidgetItinerario?
    var vicini: [WipWidgetVicino] = []
    var posizione: WipWidgetPosizione?
    private enum K: String, CodingKey { case v, ts, lingua, etichette, crediti, visita, itinerario, vicini, posizione }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        v = c.v(.v, 0); ts = c.v(.ts, 0); lingua = c.v(.lingua, "it"); etichette = c.v(.etichette, WipWidgetEtichette())
        crediti = c.o(.crediti); visita = c.o(.visita); itinerario = c.o(.itinerario)
        vicini = c.v(.vicini, []); posizione = c.o(.posizione)
    }

    var data: Date { Date(timeIntervalSince1970: ts / 1000) }

    /// Legge lo snapshot dall'App Group. `nil` = l'app non ha mai scritto
    /// (primo avvio, App Group assente): il widget mostra l'invito ad aprire WIP.
    static func carica() -> WipWidgetSnapshot? {
        guard let difese = UserDefaults(suiteName: "group.com.itaintasca.app"),
              let raw = difese.string(forKey: "wipWidgetDati"),
              let dati = raw.data(using: .utf8) else { return nil }
        let dec = JSONDecoder()
        guard let s = try? dec.decode(WipWidgetSnapshot.self, from: dati), s.v == 1 else { return nil }
        return s
    }
}

// MARK: - Aiuti comuni

enum WipWidgetFormato {
    static func distanza(_ metri: Double) -> String {
        if metri < 1000 { return "\(Int(metri.rounded())) m" }
        return String(format: "%.1f km", metri / 1000).replacingOccurrences(of: ".0 km", with: " km")
    }

    /// Minuti a piedi: linea d'aria x 1,3 a 4 km/h.
    static func minutiAPiedi(_ metri: Double) -> Int { max(1, Int((metri * 1.3 / 4000 * 60).rounded())) }

    static func ora(_ epochMs: Double) -> String {
        let f = DateFormatter(); f.dateStyle = .none; f.timeStyle = .short
        return f.string(from: Date(timeIntervalSince1970: epochMs / 1000))
    }

    static func metriTra(_ aLat: Double, _ aLon: Double, _ bLat: Double, _ bLon: Double) -> Double {
        let r = Double.pi / 180, R = 6371000.0
        let dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r
        let x = pow(sin(dLat / 2), 2) + cos(aLat * r) * cos(bLat * r) * pow(sin(dLon / 2), 2)
        return 2 * R * asin(sqrt(x))
    }

    /// Simbolo SF per la categoria del POI/tappa (solo un'icona: la foto vera
    /// resta la regola quando c'e').
    static func simbolo(_ categoria: String) -> String {
        let c = categoria.lowercased()
        if c.contains("chies") || c.contains("church") || c.contains("relig") { return "building.columns" }
        if c.contains("muse") || c.contains("galler") || c.contains("art") { return "paintpalette" }
        if c.contains("castel") || c.contains("fort") || c.contains("castle") { return "shield" }
        if c.contains("parc") || c.contains("giardin") || c.contains("natur") || c.contains("park") { return "leaf" }
        if c.contains("pranzo") || c.contains("cena") || c.contains("colazione") || c.contains("ristor") || c.contains("food") { return "fork.knife" }
        if c.contains("panoram") || c.contains("belved") || c.contains("view") { return "binoculars" }
        if c.contains("piazz") || c.contains("square") { return "mappin.and.ellipse" }
        return "mappin"
    }
}

// MARK: - Miniature (scaricate dal provider, mai dalla vista)

enum WipWidgetMiniature {
    private static var cartella: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.itaintasca.app")?
            .appendingPathComponent("widget-miniature", isDirectory: true)
    }

    private static func nomeFile(_ url: String) -> String {
        var h: UInt64 = 1469598103934665603
        for b in url.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return String(h, radix: 16) + ".jpg"
    }

    /// Restituisce la miniatura (max ~160 px) scaricandola una volta sola.
    /// Tempo massimo per immagine: 4 s; oltre, niente foto (mai un errore).
    static func carica(_ url: String, lato: CGFloat = 160) async -> UIImage? {
        guard !url.isEmpty, let u = URL(string: url), let dir = cartella else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent(nomeFile(url))
        if let d = try? Data(contentsOf: file), let img = UIImage(data: d) { return img }
        var req = URLRequest(url: u)
        req.timeoutInterval = 4
        req.setValue("WIPWorldInPocket/1.0 (widget)", forHTTPHeaderField: "User-Agent")
        guard let risposta = try? await URLSession.shared.data(for: req),
              (risposta.1 as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) ?? true,
              let img = UIImage(data: risposta.0) else { return nil }
        let scala = min(1, lato / max(img.size.width, img.size.height))
        let misura = CGSize(width: img.size.width * scala, height: img.size.height * scala)
        let piccola = UIGraphicsImageRenderer(size: misura).image { _ in img.draw(in: CGRect(origin: .zero, size: misura)) }
        if let jpg = piccola.jpegData(compressionQuality: 0.8) { try? jpg.write(to: file) }
        return piccola
    }
}
