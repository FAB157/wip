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
import ImageIO

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
    // Widget nuovi (23/09/2026, snapshot `rev: 2`, `v` resta 1): tutti
    // opzionali, uno snapshot vecchio decodifica lo stesso.
    /// Tutte le etichette, per chiave: i widget nuovi non hanno una proprieta'
    /// per chiave in WipWidgetEtichette (che resta per i 4 di prima).
    var testi: [String: String] = [:]
    var sessione: Bool = false
    var ultimoAscolto: WipWidgetUltimoAscolto?
    var linguaAlt: WipWidgetLinguaAlt?
    var luogoGiorno: [WipWidgetLuogo] = []
    var meteo: WipWidgetMeteo?
    var garanzia: WipWidgetGaranzia?
    var ascoltaOra: WipWidgetAscolta?
    var eventi: [WipWidgetEvento] = []
    var gemmaRegione: WipWidgetGemma?
    var confronto: WipWidgetConfronto?
    var guidaStampata: WipWidgetPdf?
    var fotoCommunity: WipWidgetFotoCommunity?
    private enum K: String, CodingKey {
        case v, ts, lingua, etichette, crediti, visita, itinerario, vicini, posizione
        case sessione, ultimoAscolto, linguaAlt, luogoGiorno, meteo, garanzia, ascoltaOra, eventi, gemmaRegione, confronto, guidaStampata, fotoCommunity
    }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        v = c.v(.v, 0); ts = c.v(.ts, 0); lingua = c.v(.lingua, "it"); etichette = c.v(.etichette, WipWidgetEtichette())
        crediti = c.o(.crediti); visita = c.o(.visita); itinerario = c.o(.itinerario)
        vicini = c.v(.vicini, []); posizione = c.o(.posizione)
        testi = c.v(.etichette, [String: String]())
        sessione = c.v(.sessione, false)
        ultimoAscolto = c.o(.ultimoAscolto); linguaAlt = c.o(.linguaAlt); luogoGiorno = c.v(.luogoGiorno, [])
        meteo = c.o(.meteo); garanzia = c.o(.garanzia); ascoltaOra = c.o(.ascoltaOra); eventi = c.v(.eventi, [])
        gemmaRegione = c.o(.gemmaRegione); confronto = c.o(.confronto); guidaStampata = c.o(.guidaStampata)
        fotoCommunity = c.o(.fotoCommunity)
    }

    var data: Date { Date(timeIntervalSince1970: ts / 1000) }

    /// Etichetta tradotta dall'app; vuota o assente = il default italiano.
    func t(_ k: String, _ def: String) -> String {
        let s = testi[k] ?? ""
        return s.isEmpty ? def : s
    }

    /// Il «luogo del giorno» della data data (la voce della timeline: a
    /// mezzanotte il widget passa da solo a quello di domani). La data e'
    /// quella locale AAAA-MM-GG del JS: calendario gregoriano, non
    /// `Calendar.current` (con il calendario giapponese o buddista «yyyy»
    /// darebbe l'anno dell'era e nessuna voce combacerebbe).
    func luogoDi(_ data: Date) -> WipWidgetLuogo? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        let giorno = f.string(from: data)
        return luogoGiorno.first { $0.giorno == giorno }
    }

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

    /// Restituisce la miniatura (lato massimo `lato` px) scaricandola una volta
    /// sola. Tempo massimo per immagine: 4 s; oltre, niente foto (mai un errore).
    /// Il file in cache porta il lato nel nome (tranne 160: le miniature gia'
    /// salvate dai 4 widget di prima restano valide). La riduzione passa da
    /// ImageIO, senza decodificare l'originale intero: l'estensione ha un
    /// tetto di memoria basso e una foto da 4000 px lo sfonderebbe.
    static func carica(_ url: String, lato: CGFloat = 160) async -> UIImage? {
        guard !url.isEmpty, let u = URL(string: url), let dir = cartella else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent(nomeFile(url + (lato == 160 ? "" : "#\(Int(lato))")))
        if let d = try? Data(contentsOf: file), let img = UIImage(data: d) { return img }
        var req = URLRequest(url: u)
        req.timeoutInterval = 4
        req.setValue("WorldInPocket/1.0 (https://wip.guide; support@wip.guide)", forHTTPHeaderField: "User-Agent")
        guard let risposta = try? await URLSession.shared.data(for: req),
              (risposta.1 as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) ?? true,
              let sorgente = CGImageSourceCreateWithData(risposta.0 as CFData, nil) else { return nil }
        let opzioni: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: lato,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(sorgente, 0, opzioni as CFDictionary) else { return nil }
        let piccola = UIImage(cgImage: cg)
        if let jpg = piccola.jpegData(compressionQuality: 0.8) { try? jpg.write(to: file, options: .atomic) }
        return piccola
    }

    /// Cancella le miniature piu' vecchie di 14 giorni (le foto del «luogo del
    /// giorno» cambiano ogni giorno: senza pulizia la cartella crescerebbe
    /// per sempre). Chiamata dal provider al massimo una volta al giorno.
    static func pulisci() {
        guard let dir = cartella,
              let file = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles])
        else { return }
        let limite = Date().addingTimeInterval(-14 * 86400)
        for f in file {
            let modificato = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
            if modificato < limite { try? FileManager.default.removeItem(at: f) }
        }
    }
}

// MARK: - Campi dei widget nuovi (23/09/2026, contratto 0.7 della specifica)
//
// Stesso schema delle struct qui sopra: ogni campo ha un default, una chiave
// assente o di tipo diverso non rompe la decodifica. Date e ore arrivano gia'
// formattate dal JS nella lingua dell'app (campi `quando`, `testo`, `ora`).

struct WipWidgetUltimoAscolto: Decodable {
    var tipo: String = "poi"          // 'poi' | 'opera'
    var id: String = ""               // id del POI, oppure chiave `k` dell'opera
    var nome: String = ""
    var luogo: String = ""            // museo o citta'
    var foto: String = ""
    var ts: Double = 0
    var quando: String = ""
    var posSec: Double = 0
    var durSec: Double = 0
    var lingua: String = "it"
    private enum K: String, CodingKey { case tipo, id, nome, luogo, foto, ts, quando, posSec, durSec, lingua }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        tipo = c.v(.tipo, "poi"); id = c.v(.id, ""); nome = c.v(.nome, ""); luogo = c.v(.luogo, "")
        foto = c.v(.foto, ""); ts = c.v(.ts, 0); quando = c.v(.quando, ""); posSec = c.v(.posSec, 0)
        durSec = c.v(.durSec, 0); lingua = c.v(.lingua, "it")
    }
    /// «Riprendi» ha senso solo su un POI a meta' traccia (per le opere la
    /// posizione non e' registrata: il tasto fa «Riascolta»).
    var riprendibile: Bool { tipo == "poi" && durSec > 0 && posSec > 5 && posSec < durSec - 5 }
}

struct WipWidgetLinguaAlt: Decodable {
    var codice: String = ""
    var nome: String = ""
    var disponibile: Bool?            // nil = non ancora verificato
    private enum K: String, CodingKey { case codice, nome, disponibile }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        codice = c.v(.codice, ""); nome = c.v(.nome, ""); disponibile = c.o(.disponibile)
    }
}

struct WipWidgetLuogo: Decodable, Hashable {
    var giorno: String = ""           // AAAA-MM-GG locale
    var id: String = ""
    var nome: String = ""
    var citta: String = ""
    var foto: String = ""
    var attribuzione: String = ""
    var metri: Double?
    var lat: Double = 0
    var lon: Double = 0
    private enum K: String, CodingKey { case giorno, id, nome, citta, foto, attribuzione, metri, lat, lon }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        giorno = c.v(.giorno, ""); id = c.v(.id, ""); nome = c.v(.nome, ""); citta = c.v(.citta, "")
        foto = c.v(.foto, ""); attribuzione = c.v(.attribuzione, ""); metri = c.o(.metri)
        lat = c.v(.lat, 0); lon = c.v(.lon, 0)
    }
}

struct WipWidgetOraMeteo: Decodable, Hashable {
    var ts: Double = 0
    var ora: String = ""              // HH:MM locale del punto, dal server
    var temp: Double = 0
    var code: Int = 0                 // codice WMO
    var pioggia: Double = 0           // probabilita' %
    private enum K: String, CodingKey { case ts, ora, temp, code, pioggia }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        ts = c.v(.ts, 0); ora = c.v(.ora, ""); temp = c.v(.temp, 0); code = c.v(.code, 0); pioggia = c.v(.pioggia, 0)
    }
}

struct WipWidgetFinestra: Decodable {
    var da: Double = 0
    var a: Double = 0
    var testo: String = ""            // «14:00–16:00»
    private enum K: String, CodingKey { case da, a, testo }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        da = c.v(.da, 0); a = c.v(.a, 0); testo = c.v(.testo, "")
    }
}

struct WipWidgetMeteo: Decodable {
    var luogo: String = ""
    var fonte: String = "posizione"   // 'tappa' | 'posizione'
    var temp: Double = 0
    var code: Int = 0
    var descr: String = ""
    var pioggiaProb: Double = 0
    var ore: [WipWidgetOraMeteo] = []
    var oraMigliore: WipWidgetFinestra?
    var esito: String = ""            // 'finestra' | 'tuttoIlGiorno' | 'musei'
    var attribuzione: String = ""     // obbligatoria per MET Norway
    var ts: Double = 0
    private enum K: String, CodingKey { case luogo, fonte, temp, code, descr, pioggiaProb, ore, oraMigliore, esito, attribuzione, ts }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        luogo = c.v(.luogo, ""); fonte = c.v(.fonte, "posizione"); temp = c.v(.temp, 0); code = c.v(.code, 0)
        descr = c.v(.descr, ""); pioggiaProb = c.v(.pioggiaProb, 0); ore = c.v(.ore, [])
        oraMigliore = c.o(.oraMigliore); esito = c.v(.esito, ""); attribuzione = c.v(.attribuzione, ""); ts = c.v(.ts, 0)
    }
}

struct WipWidgetGaranzia: Decodable {
    var stato: String = "attiva"      // 'attiva' | 'reclamabile'
    var finoAl: Double = 0
    var testo: String = ""
    private enum K: String, CodingKey { case stato, finoAl, testo }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        stato = c.v(.stato, "attiva"); finoAl = c.v(.finoAl, 0); testo = c.v(.testo, "")
    }
}

struct WipWidgetAscolta: Decodable {
    var id: String = ""
    var nome: String = ""
    var metri: Double = 0
    var foto: String = ""
    var categoria: String = ""
    var pronta: Bool = false          // testo gia' in cache nella lingua dell'app
    private enum K: String, CodingKey { case id, nome, metri, foto, categoria, pronta }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = c.v(.id, ""); nome = c.v(.nome, ""); metri = c.v(.metri, 0); foto = c.v(.foto, "")
        categoria = c.v(.categoria, ""); pronta = c.v(.pronta, false)
    }
}

struct WipWidgetEvento: Decodable, Hashable {
    var k: String = ""
    var titolo: String = ""
    var quando: String = ""
    var ts: Double = 0
    var luogo: String = ""
    var metri: Double?
    var biglietto: Bool = false
    var categoria: String = ""
    private enum K: String, CodingKey { case k, titolo, quando, ts, luogo, metri, biglietto, categoria }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        k = c.v(.k, ""); titolo = c.v(.titolo, ""); quando = c.v(.quando, ""); ts = c.v(.ts, 0)
        luogo = c.v(.luogo, ""); metri = c.o(.metri); biglietto = c.v(.biglietto, false); categoria = c.v(.categoria, "")
    }
}

struct WipWidgetGemma: Decodable {
    var id: String = ""
    var nome: String = ""
    var regione: String = ""
    var citta: String = ""
    var foto: String = ""
    var attribuzione: String = ""
    var metri: Double = 0
    private enum K: String, CodingKey { case id, nome, regione, citta, foto, attribuzione, metri }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = c.v(.id, ""); nome = c.v(.nome, ""); regione = c.v(.regione, ""); citta = c.v(.citta, "")
        foto = c.v(.foto, ""); attribuzione = c.v(.attribuzione, ""); metri = c.v(.metri, 0)
    }
}

struct WipWidgetOpera: Decodable {
    var k: String = ""
    var nome: String = ""
    var autore: String = ""
    var foto: String = ""
    private enum K: String, CodingKey { case k, nome, autore, foto }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        k = c.v(.k, ""); nome = c.v(.nome, ""); autore = c.v(.autore, ""); foto = c.v(.foto, "")
    }
}

struct WipWidgetConfronto: Decodable {
    var giorno: String = ""
    var museo: String = ""
    var a = WipWidgetOpera()
    var b = WipWidgetOpera()
    private enum K: String, CodingKey { case giorno, museo, a, b }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        giorno = c.v(.giorno, ""); museo = c.v(.museo, "")
        a = c.v(.a, WipWidgetOpera()); b = c.v(.b, WipWidgetOpera())
    }
}

struct WipWidgetPdf: Decodable {
    var k: String = ""
    var tipo: String = ""             // 'itinerario' | 'guida' | 'museo'
    var nome: String = ""
    var quando: String = ""
    var ts: Double = 0
    private enum K: String, CodingKey { case k, tipo, nome, quando, ts }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        k = c.v(.k, ""); tipo = c.v(.tipo, ""); nome = c.v(.nome, ""); quando = c.v(.quando, ""); ts = c.v(.ts, 0)
    }
}

struct WipWidgetFotoCommunity: Decodable {
    var poiId: String = ""
    var nome: String = ""
    var citta: String = ""
    var foto: String = ""
    var metri: Double = 0
    var quando: String = ""
    private enum K: String, CodingKey { case poiId, nome, citta, foto, metri, quando }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        poiId = c.v(.poiId, ""); nome = c.v(.nome, ""); citta = c.v(.citta, ""); foto = c.v(.foto, "")
        metri = c.v(.metri, 0); quando = c.v(.quando, "")
    }
}
