//
//  WipHomeWidgets.swift
//  WipNavActivity (Widget Extension)
//
//  I QUATTRO WIDGET DELLA HOME (14/09/2026), scelti dal committente:
//    2. Itinerario di oggi   — prossima tappa, ora, minuti a piedi, poi le seguenti
//    3. Continua la visita   — museo in corso, opere ascoltate/totali, prossima opera
//    5. Crediti e Pass       — saldo, Day Pass con scadenza (anche sulla lock screen)
//    1. Vicino a te          — gemme e luoghi con audioguida vicino all'ultima posizione
//
//  Tutti leggono lo stesso snapshot scritto dall'app (WipWidgetDati.swift):
//  nessuna rete per i dati, solo le miniature dei luoghi (scaricate dal
//  provider, in cache nell'App Group). Stessi colori del prodotto (blu
//  #1e3a8a, giallo #d4af37) delle Live Activity.
//
//  Tocco: `itainta://widget/<azione>` → App.tsx apre la scheda giusta;
//  su un luogo `itainta://widget/poi/<id>` apre il POI con l'audioguida.
//

import SwiftUI
import WidgetKit

// MARK: - Colori e sfondo

private enum WipColori {
    static let blu = Color(red: 30.0 / 255.0, green: 58.0 / 255.0, blue: 138.0 / 255.0)
    static let bluScuro = Color(red: 20.0 / 255.0, green: 40.0 / 255.0, blue: 100.0 / 255.0)
    static let giallo = Color(red: 212.0 / 255.0, green: 175.0 / 255.0, blue: 55.0 / 255.0)
    static let testo = Color.white
    static let tenue = Color.white.opacity(0.72)
    static let spento = Color.white.opacity(0.5)
    static let riga = Color.white.opacity(0.12)
}

private struct WipSfondo: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) {
                LinearGradient(colors: [WipColori.blu, WipColori.bluScuro], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        } else {
            content
                .padding(14)
                .background(LinearGradient(colors: [WipColori.blu, WipColori.bluScuro], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }
}
private extension View { func wipSfondo() -> some View { modifier(WipSfondo()) } }

private func wipUrl(_ azione: String) -> URL { URL(string: "itainta://widget/\(azione)")! }

// MARK: - Provider comune

struct WipWidgetVoce: TimelineEntry {
    let date: Date
    let dati: WipWidgetSnapshot?
    /// Miniature gia' scaricate, per URL.
    let immagini: [String: UIImage]
}

/// Un provider per tutti: cambia solo QUALI miniature scaricare.
struct WipWidgetProvider: TimelineProvider {
    let urlDaScaricare: (WipWidgetSnapshot) -> [String]

    func placeholder(in context: Context) -> WipWidgetVoce { WipWidgetVoce(date: Date(), dati: nil, immagini: [:]) }

    func getSnapshot(in context: Context, completion: @escaping (WipWidgetVoce) -> Void) {
        completion(WipWidgetVoce(date: Date(), dati: WipWidgetSnapshot.carica(), immagini: [:]))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WipWidgetVoce>) -> Void) {
        let dati = WipWidgetSnapshot.carica()
        Task {
            var immagini: [String: UIImage] = [:]
            if let d = dati {
                for u in Array(Set(urlDaScaricare(d))).prefix(5) {
                    if let img = await WipWidgetMiniature.carica(u) { immagini[u] = img }
                }
            }
            let voce = WipWidgetVoce(date: Date(), dati: dati, immagini: immagini)
            // Ridisegno ogni 15 minuti (le ore dell'itinerario e «scade alle»
            // cambiano da sole); l'app forza il refresh a ogni snapshot nuovo.
            let prossimo = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
            completion(Timeline(entries: [voce], policy: .after(prossimo)))
        }
    }
}

// MARK: - Pezzi comuni

private struct WipTestata: View {
    let titolo: String
    let simbolo: String
    var destra: String = ""
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: simbolo).font(.system(size: 11, weight: .bold)).foregroundColor(WipColori.giallo)
            Text(titolo.uppercased()).font(.system(size: 10, weight: .heavy, design: .rounded)).foregroundColor(WipColori.tenue).lineLimit(1)
            Spacer(minLength: 4)
            if !destra.isEmpty {
                Text(destra).font(.system(size: 10, weight: .bold)).monospacedDigit().foregroundColor(WipColori.spento)
            }
        }
    }
}

private struct WipVuoto: View {
    let testo: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "headphones").font(.system(size: 22, weight: .bold)).foregroundColor(WipColori.giallo)
            Text(testo).font(.system(size: 12, weight: .semibold)).foregroundColor(WipColori.tenue).multilineTextAlignment(.center).lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct WipMiniatura: View {
    let immagine: UIImage?
    let simbolo: String
    var lato: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9).fill(WipColori.riga)
            if let img = immagine {
                Image(uiImage: img).resizable().aspectRatio(contentMode: .fill)
                    .frame(width: lato, height: lato).clipShape(RoundedRectangle(cornerRadius: 9))
            } else {
                Image(systemName: simbolo).font(.system(size: lato * 0.42, weight: .bold)).foregroundColor(WipColori.giallo)
            }
        }
        .frame(width: lato, height: lato)
    }
}

// MARK: - 2. Itinerario di oggi

private struct WipItinerarioVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let e = voce.dati?.etichette ?? WipWidgetEtichette()
        if let it = voce.dati?.itinerario, !it.tappe.isEmpty {
            let idx = min(max(it.prossimaIdx, 0), it.tappe.count - 1)
            let prossima = it.tappe[idx]
            let seguenti = Array(it.tappe.dropFirst(idx + 1).prefix(famiglia == .systemLarge ? 6 : 2))
            let metri: Double? = prossima.metri ?? {
                guard let p = voce.dati?.posizione, let la = prossima.lat, let lo = prossima.lon else { return nil }
                return WipWidgetFormato.metriTra(p.lat, p.lon, la, lo)
            }()
            VStack(alignment: .leading, spacing: 8) {
                WipTestata(titolo: it.titolo.isEmpty ? e.itinerario : it.titolo, simbolo: "map.fill",
                           destra: it.totali > 0 ? "\(it.fatte)/\(it.totali) \(e.fatte)" : "")
                HStack(alignment: .top, spacing: 10) {
                    WipMiniatura(immagine: nil, simbolo: WipWidgetFormato.simbolo(prossima.tipo), lato: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.prossima.uppercased()).font(.system(size: 9, weight: .heavy)).foregroundColor(WipColori.giallo)
                        Text(prossima.titolo).font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo).lineLimit(2).minimumScaleFactor(0.85)
                        HStack(spacing: 6) {
                            if !prossima.ora.isEmpty { Text(prossima.ora).monospacedDigit() }
                            if let m = metri { Text("\(WipWidgetFormato.distanza(m)) · \(WipWidgetFormato.minutiAPiedi(m)) min") }
                        }
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                if famiglia != .systemSmall && !seguenti.isEmpty {
                    Divider().overlay(WipColori.riga)
                    ForEach(seguenti, id: \.self) { t in
                        HStack(spacing: 6) {
                            Text(t.ora.isEmpty ? "·" : t.ora).font(.system(size: 10, weight: .bold)).monospacedDigit().foregroundColor(WipColori.spento).frame(width: 34, alignment: .leading)
                            Image(systemName: WipWidgetFormato.simbolo(t.tipo)).font(.system(size: 9, weight: .bold)).foregroundColor(WipColori.giallo)
                            Text(t.titolo).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.testo).lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .widgetURL(wipUrl("itinerario"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: e.itinerario, simbolo: "map.fill")
                WipVuoto(testo: voce.dati == nil ? e.nessuno : e.apri)
            }
            .widgetURL(wipUrl("itinerario"))
        }
    }
}

struct WipItinerarioWidget: Widget {
    let kind = "WipItinerarioWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipItinerarioVista(voce: voce).wipSfondo()
        }
        .configurationDisplayName("WIP · Itinerario")
        .description("La prossima tappa di oggi, con ora e minuti a piedi.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - 3. Continua la visita

private struct WipVisitaVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let e = voce.dati?.etichette ?? WipWidgetEtichette()
        if let v = voce.dati?.visita, !v.museo.isEmpty {
            let quota = v.totale > 0 ? Double(v.ascoltate) / Double(v.totale) : 0
            VStack(alignment: .leading, spacing: 8) {
                WipTestata(titolo: e.visita, simbolo: "building.columns.fill", destra: v.totale > 0 ? "\(v.ascoltate)/\(v.totale)" : "")
                HStack(alignment: .center, spacing: 10) {
                    WipMiniatura(immagine: voce.immagini[v.foto], simbolo: "paintpalette", lato: famiglia == .systemSmall ? 40 : 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.museo).font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo).lineLimit(famiglia == .systemSmall ? 2 : 1)
                        if !v.prossima.isEmpty {
                            Text("\(e.prossimaOpera): \(v.prossima)").font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(2)
                            if !v.sala.isEmpty { Text(v.sala).font(.system(size: 10, weight: .medium)).foregroundColor(WipColori.spento).lineLimit(1) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(WipColori.riga)
                        Capsule().fill(WipColori.giallo).frame(width: max(0, min(1, quota)) * g.size.width)
                    }
                }
                .frame(height: 4)
                HStack {
                    Text("\(v.ascoltate) \(e.ascoltate)").font(.system(size: 10, weight: .bold)).foregroundColor(WipColori.spento)
                    Spacer()
                    HStack(spacing: 4) {
                        Image(systemName: "play.fill"); Text(e.visita)
                    }
                    .font(.system(size: 10, weight: .heavy)).foregroundColor(WipColori.blu)
                    .padding(.horizontal, 9).padding(.vertical, 4).background(Capsule().fill(WipColori.giallo))
                }
                Spacer(minLength: 0)
            }
            .widgetURL(wipUrl("visita"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: e.visita, simbolo: "building.columns.fill")
                WipVuoto(testo: voce.dati == nil ? e.nessuno : e.apri)
            }
            .widgetURL(wipUrl("visita"))
        }
    }
}

struct WipVisitaWidget: Widget {
    let kind = "WipVisitaWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.visita?.foto ?? ""].filter { !$0.isEmpty } })) { voce in
            WipVisitaVista(voce: voce).wipSfondo()
        }
        .configurationDisplayName("WIP · Visita museo")
        .description("Il museo in corso: opere ascoltate e la prossima da ascoltare.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 5. Crediti e Pass

private struct WipCreditiVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let e = voce.dati?.etichette ?? WipWidgetEtichette()
        let c = voce.dati?.crediti
        switch famiglia {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: c?.passAttivo == true ? "ticket.fill" : "headphones").font(.system(size: 12, weight: .bold))
                    Text(c.map { "\($0.totale)" } ?? "–").font(.system(size: 15, weight: .heavy, design: .rounded)).monospacedDigit()
                }
            }
            .widgetURL(wipUrl("crediti"))
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: "headphones").font(.system(size: 11, weight: .bold))
                    Text("WIP").font(.system(size: 12, weight: .heavy))
                }
                Text(c.map { "\($0.totale) \(e.crediti)" } ?? e.apri).font(.system(size: 13, weight: .bold)).monospacedDigit().lineLimit(1)
                if let c = c, c.passAttivo, c.passScade > 0 {
                    Text("\(e.pass) · \(e.scade) \(WipWidgetFormato.ora(c.passScade))").font(.system(size: 11)).lineLimit(1)
                }
            }
            .widgetURL(wipUrl("crediti"))
        default:
            VStack(alignment: .leading, spacing: 8) {
                WipTestata(titolo: "WIP", simbolo: "headphones")
                if let c = c {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(c.totale)").font(.system(size: 34, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(WipColori.testo)
                        Text(e.crediti).font(.system(size: 12, weight: .bold)).foregroundColor(WipColori.tenue)
                    }
                    if c.passAttivo {
                        HStack(spacing: 5) {
                            Image(systemName: "ticket.fill").foregroundColor(WipColori.blu)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(e.pass).font(.system(size: 10, weight: .heavy))
                                if c.passScade > 0 {
                                    Text("\(e.scade) \(WipWidgetFormato.ora(c.passScade))\(c.passCap > 0 ? " · \(c.passUsate)/\(c.passCap) \(e.guide)" : "")").font(.system(size: 9, weight: .semibold))
                                }
                            }
                            .foregroundColor(WipColori.blu)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 8).fill(WipColori.giallo))
                    } else {
                        Text(e.apri).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.spento)
                    }
                } else {
                    WipVuoto(testo: e.nessuno)
                }
                Spacer(minLength: 0)
            }
            .widgetURL(wipUrl("crediti"))
        }
    }
}

struct WipCreditiWidget: Widget {
    let kind = "WipCreditiWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipCreditiVista(voce: voce).wipSfondo()
        }
        .configurationDisplayName("WIP · Crediti e Pass")
        .description("Il saldo crediti e il Day Pass attivo con la scadenza.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - 1. Vicino a te

private struct WipViciniVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let e = voce.dati?.etichette ?? WipWidgetEtichette()
        let lista = Array((voce.dati?.vicini ?? []).prefix(famiglia == .systemLarge ? 5 : famiglia == .systemMedium ? 3 : 1))
        VStack(alignment: .leading, spacing: 8) {
            WipTestata(titolo: e.vicini, simbolo: "location.fill",
                       destra: voce.dati.map { "\(e.aggiornato) \(WipWidgetFormato.ora($0.ts))" } ?? "")
            if lista.isEmpty {
                WipVuoto(testo: e.nessuno)
            } else {
                ForEach(lista, id: \.self) { p in
                    Link(destination: wipUrl("poi/\(p.id)")) {
                        HStack(spacing: 9) {
                            WipMiniatura(immagine: voce.immagini[p.foto], simbolo: WipWidgetFormato.simbolo(p.categoria), lato: famiglia == .systemSmall ? 44 : 38)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.nome).font(.system(size: famiglia == .systemSmall ? 13 : 12, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo).lineLimit(famiglia == .systemSmall ? 2 : 1)
                                HStack(spacing: 4) {
                                    if p.gemma {
                                        Text(e.gemma.uppercased()).font(.system(size: 8, weight: .heavy)).foregroundColor(WipColori.blu)
                                            .padding(.horizontal, 5).padding(.vertical, 1).background(Capsule().fill(WipColori.giallo))
                                    }
                                    Text("\(WipWidgetFormato.distanza(p.metri)) · \(WipWidgetFormato.minutiAPiedi(p.metri)) min").font(.system(size: 10, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                                }
                            }
                            Spacer(minLength: 0)
                            if famiglia != .systemSmall {
                                Image(systemName: "headphones").font(.system(size: 11, weight: .bold)).foregroundColor(WipColori.giallo)
                            }
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .widgetURL(wipUrl("vicini"))
    }
}

struct WipViciniWidget: Widget {
    let kind = "WipViciniWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in d.vicini.prefix(5).map { $0.foto }.filter { !$0.isEmpty } })) { voce in
            WipViciniVista(voce: voce).wipSfondo()
        }
        .configurationDisplayName("WIP · Vicino a te")
        .description("Gemme e luoghi con audioguida vicino a te: un tocco e parte la voce.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
