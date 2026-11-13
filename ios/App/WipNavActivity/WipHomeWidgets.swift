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
//  DAL 23/09/2026 altri undici widget, in fondo al file (ultima audioguida,
//  luogo del giorno, cosa vedo, meteo e garanzia, ascolta ora, eventi, gemma
//  della regione, confronto opere, altra lingua, guida stampata, foto della
//  community). Registrati in WipNavActivityBundle.swift (due bundle secondari).
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
    // Dal 23/09/2026, con default: `WipWidgetProvider(urlDaScaricare:)` dei
    // 4 widget di prima resta identico (l'init memberwise omette i default).
    /// Lato massimo delle miniature in px (160 = le icone; 240 il confronto
    /// opere; 600 le foto a tutto widget).
    var lato: CGFloat = 160
    /// Quante immagini al massimo per giro.
    var massimo: Int = 5
    /// Voci in piu' a mezzanotte e 1 minuto di domani e dopodomani, con gli
    /// stessi dati: il «luogo del giorno» cambia da solo anche ad app chiusa.
    var aMezzanotte: Bool = false

    func placeholder(in context: Context) -> WipWidgetVoce { WipWidgetVoce(date: Date(), dati: nil, immagini: [:]) }

    func getSnapshot(in context: Context, completion: @escaping (WipWidgetVoce) -> Void) {
        completion(WipWidgetVoce(date: Date(), dati: WipWidgetSnapshot.carica(), immagini: [:]))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WipWidgetVoce>) -> Void) {
        let dati = WipWidgetSnapshot.carica()
        let lato = self.lato, massimo = self.massimo, aMezzanotte = self.aMezzanotte
        let urls: [String] = {
            guard let d = dati else { return [] }
            // Deduplica ORDINATA (il Set di prima perdeva l'ordine: con il
            // tetto `massimo` poteva saltare proprio la prima foto).
            var visti = Set<String>()
            return Array(self.urlDaScaricare(d).filter { !$0.isEmpty && visti.insert($0).inserted }.prefix(massimo))
        }()
        Task {
            // Download in parallelo: con 3 foto da 600 px in serie si
            // rischiava di sforare il tempo concesso all'estensione.
            let immagini: [String: UIImage] = await withTaskGroup(of: WipImmagineScaricata.self) { gruppo -> [String: UIImage] in
                for u in urls {
                    gruppo.addTask {
                        let img = await WipWidgetMiniature.carica(u, lato: lato)
                        return WipImmagineScaricata(url: u, immagine: img)
                    }
                }
                var tutte: [String: UIImage] = [:]
                for await r in gruppo {
                    if let img = r.immagine { tutte[r.url] = img }
                }
                return tutte
            }
            WipWidgetProvider.pulisciSeServe()
            let adesso = Date()
            var voci = [WipWidgetVoce(date: adesso, dati: dati, immagini: immagini)]
            if aMezzanotte {
                let cal = Calendar.current
                let oggi = cal.startOfDay(for: adesso)
                for g in 1...2 {
                    if let m = cal.date(byAdding: .day, value: g, to: oggi) {
                        voci.append(WipWidgetVoce(date: m.addingTimeInterval(60), dati: dati, immagini: immagini))
                    }
                }
            }
            // Ridisegno ogni 15 minuti (le ore dell'itinerario e «scade alle»
            // cambiano da sole); l'app forza il refresh a ogni snapshot nuovo.
            let prossimo = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
            completion(Timeline(entries: voci, policy: .after(prossimo)))
        }
    }

    /// Pulizia delle miniature vecchie, al massimo una volta al giorno.
    private static func pulisciSeServe() {
        guard let difese = UserDefaults(suiteName: "group.com.itaintasca.app") else { return }
        let ora = Date().timeIntervalSince1970
        if ora - difese.double(forKey: "wipMiniaturePulite") < 86400 { return }
        difese.set(ora, forKey: "wipMiniaturePulite")
        WipWidgetMiniature.pulisci()
    }
}

/// Risultato di un download nel TaskGroup: UIImage non e' dichiarata Sendable
/// in tutti gli SDK, la scatola evita l'errore sul tipo del gruppo.
struct WipImmagineScaricata: @unchecked Sendable {
    let url: String
    let immagine: UIImage?
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

// MARK: - Widget nuovi (23/09/2026) — pezzi comuni
//
// Undici widget in piu' (specifica «11 nuovi widget home», parte C), tutti
// nello stesso file perche' colori, testata e sfondo sono privati di file.
// Stesse azioni di Android (`itainta://widget/<azione>`), nessuna rete per
// i dati, nessuna generazione: un tocco apre l'app, che applica i suoi gate.
// Niente Button(intent:) ne' ControlWidget: riproduzione e voto passano dal
// deep link, identico su iOS 16 e 17.

/// Foto a tutto widget (luogo del giorno, gemma della regione, community):
/// la foto sta nello SFONDO, cosi' riempie anche i margini di iOS 17 senza
/// `contentMarginsDisabled` (che darebbe un tipo opaco diverso nei due rami).
/// Senza foto resta il blu del prodotto: mai un ripiego da stock.
private struct WipSfondoFoto: ViewModifier {
    let immagine: UIImage?

    private var strati: some View {
        ZStack {
            LinearGradient(colors: [WipColori.blu, WipColori.bluScuro], startPoint: .topLeading, endPoint: .bottomTrailing)
            if let img = immagine {
                Color.clear
                    .overlay(Image(uiImage: img).resizable().scaledToFill())
                    .clipped()
            }
            LinearGradient(colors: [Color.black.opacity(0.35), Color.clear], startPoint: .top, endPoint: .center)
            LinearGradient(colors: [Color.clear, Color.black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
        }
    }

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) { strati }
        } else {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(14)
                .background(strati)
        }
    }
}

/// Sfondo delle famiglie della schermata di blocco (accessory*). `disco:
/// false` per accessoryInline, dove il sistema non disegna sfondi.
private struct WipSfondoAccessorio: ViewModifier {
    var disco: Bool = true
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) {
                if disco { AccessoryWidgetBackground() } else { Color.clear }
            }
        } else {
            // Due rami espliciti invece di `disco ? Vista() : nil`: niente
            // inferenza di un Optional<View> dentro `.background`.
            if disco {
                content.background(AccessoryWidgetBackground())
            } else {
                content
            }
        }
    }
}

/// Come `wipUrl`, ma senza forzare l'optional: un'azione con caratteri
/// strani non fa crashare l'estensione, ripiega su «vicini».
private func wipUrlSicuro(_ azione: String) -> URL {
    URL(string: "itainta://widget/" + azione) ?? URL(string: "itainta://widget/vicini")!
}

/// Id di un POI ammesso nel deep link (regola 0.3 della specifica).
private func wipIdPoiOk(_ id: String) -> Bool {
    id.range(of: "^[A-Za-z0-9_.:-]{1,80}$", options: .regularExpression) != nil
}

/// Chiave corta `k` (FNV-1a 32 bit, 8 esadecimali) di opere, PDF, eventi.
private func wipChiaveOk(_ k: String) -> Bool {
    k.range(of: "^[0-9a-f]{8}$", options: .regularExpression) != nil
}

/// `luogo/<id>` se l'id e' valido, altrimenti l'azione generica.
private func wipUrlLuogo(_ id: String) -> URL {
    wipUrlSicuro(wipIdPoiOk(id) ? "luogo/\(id)" : "vicini")
}

/// Etichetta tradotta, anche senza snapshot.
private func wipT(_ d: WipWidgetSnapshot?, _ k: String, _ def: String) -> String {
    d?.t(k, def) ?? def
}

/// Testo dello stato vuoto: quello del widget se c'e' uno snapshot,
/// l'invito ad aprire WIP se l'app non ha mai scritto.
private func wipTestoVuoto(_ d: WipWidgetSnapshot?, _ k: String, _ def: String) -> String {
    d.map { $0.t(k, def) } ?? WipWidgetEtichette().nessuno
}

/// Parti non vuote unite da « · ».
private func wipRiga(_ parti: [String]) -> String {
    parti.filter { !$0.isEmpty }.joined(separator: " · ")
}

/// Distanza gia' calcolata dal JS o, in mancanza, dall'ultima posizione.
private func wipMetri(_ metri: Double?, _ lat: Double, _ lon: Double, _ pos: WipWidgetPosizione?) -> Double? {
    if let m = metri { return m }
    guard let p = pos, lat != 0 || lon != 0 else { return nil }
    return WipWidgetFormato.metriTra(p.lat, p.lon, lat, lon)
}

private func wipGradi(_ t: Double) -> String { t.isFinite ? "\(Int(t.rounded()))°" : "–" }

private struct WipAttribuzione: View {
    let testo: String
    var body: some View {
        if !testo.isEmpty {
            Text(testo).font(.system(size: 7)).foregroundColor(WipColori.spento).lineLimit(1)
        }
    }
}

private struct WipPillola: View {
    let testo: String
    var simbolo: String = ""
    var piena: Bool = true
    var body: some View {
        HStack(spacing: 4) {
            if !simbolo.isEmpty { Image(systemName: simbolo) }
            Text(testo).lineLimit(1)
        }
        .font(.system(size: 10, weight: .heavy))
        .foregroundColor(piena ? WipColori.blu : WipColori.testo)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Capsule().fill(piena ? WipColori.giallo : WipColori.riga))
    }
}

private struct WipBarra: View {
    let quota: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(WipColori.riga)
                Capsule().fill(WipColori.giallo).frame(width: CGFloat(quota.isFinite ? max(0, min(1, quota)) : 0) * g.size.width)
            }
        }
        .frame(height: 4)
    }
}

/// Un `Link` solo se l'URL c'e' (chiave o id validi); altrimenti il contenuto
/// resta toccabile tramite il widgetURL generico.
private struct WipForseLink<Contenuto: View>: View {
    let url: URL?
    let contenuto: Contenuto
    init(_ url: URL?, @ViewBuilder contenuto: () -> Contenuto) {
        self.url = url
        self.contenuto = contenuto()
    }
    var body: some View {
        if let u = url {
            Link(destination: u) { contenuto }
        } else {
            contenuto
        }
    }
}

/// Testi in basso sopra la foto grande (5, 60, 13).
private struct WipLuogoFoto: View {
    let titolo: String
    let simbolo: String
    let nome: String
    let riga: String
    let attribuzione: String
    var badge: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            WipTestata(titolo: titolo, simbolo: simbolo)
            Spacer(minLength: 0)
            if !badge.isEmpty {
                HStack(spacing: 3) {
                    Image(systemName: "checkmark.seal.fill")
                    Text(badge.uppercased())
                }
                .font(.system(size: 8, weight: .heavy)).foregroundColor(WipColori.blu)
                .padding(.horizontal, 6).padding(.vertical, 2).background(Capsule().fill(WipColori.giallo))
            }
            Text(nome).font(.system(size: 17, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                .lineLimit(2).minimumScaleFactor(0.8)
            if !riga.isEmpty {
                Text(riga).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
            }
            WipAttribuzione(testo: attribuzione)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - 7. Ultima audioguida ascoltata

private struct WipUltimoAscoltoVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "ultimoAscolto", "Ultima audioguida")
        let riascolta = wipT(d, "riascolta", "Riascolta")
        if let u = d?.ultimoAscolto, !u.nome.isEmpty {
            VStack(alignment: .leading, spacing: 7) {
                WipTestata(titolo: titolo, simbolo: "headphones", destra: famiglia == .systemSmall ? "" : u.quando)
                HStack(alignment: .center, spacing: 10) {
                    WipMiniatura(immagine: voce.immagini[u.foto], simbolo: u.tipo == "opera" ? "paintpalette" : "headphones",
                                 lato: famiglia == .systemSmall ? 40 : 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(u.nome).font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                            .lineLimit(2).minimumScaleFactor(0.85)
                        if !u.luogo.isEmpty {
                            Text(u.luogo).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                        } else if famiglia == .systemSmall && !u.quando.isEmpty {
                            Text(u.quando).font(.system(size: 10, weight: .semibold)).foregroundColor(WipColori.spento).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                if u.durSec > 0 { WipBarra(quota: u.posSec / u.durSec) }
                if famiglia == .systemSmall {
                    WipPillola(testo: riascolta, simbolo: "arrow.counterclockwise")
                } else {
                    HStack(spacing: 6) {
                        Link(destination: wipUrlSicuro("riascolta")) {
                            WipPillola(testo: riascolta, simbolo: "arrow.counterclockwise")
                        }
                        if u.riprendibile {
                            Link(destination: wipUrlSicuro("riprendi")) {
                                WipPillola(testo: wipT(d, "riprendi", "Riprendi"), simbolo: "play.fill", piena: false)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                Spacer(minLength: 0)
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("riascolta"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "headphones")
                WipVuoto(testo: wipTestoVuoto(d, "nessunAscolto", "Nessun ascolto ancora"))
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("riascolta"))
        }
    }
}

struct WipUltimoAscoltoWidget: Widget {
    let kind = "WipUltimoAscoltoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.ultimoAscolto?.foto ?? ""] })) { voce in
            WipUltimoAscoltoVista(voce: voce)
        }
        .configurationDisplayName("WIP · Ultima audioguida")
        .description("Riascolta o riprendi l'ultima audioguida.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 5. Luogo del giorno

private struct WipLuogoGiornoVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        // La voce della timeline sceglie il giorno: a mezzanotte passa da sola
        // alla gemma di domani (il provider aggiunge le voci `aMezzanotte`).
        let luogo = d?.luogoDi(voce.date)
        let titolo = wipT(d, "luogoGiorno", "Luogo del giorno")
        let metri: Double? = luogo.flatMap { wipMetri($0.metri, $0.lat, $0.lon, d?.posizione) }
        let distanza = metri.map { WipWidgetFormato.distanza($0) } ?? ""
        let url = wipUrlLuogo(luogo?.id ?? "")
        switch famiglia {
        case .accessoryCircular:
            // Niente foto: in modalita' vibrant uscirebbe grigia.
            VStack(spacing: 1) {
                Image(systemName: "sparkles").font(.system(size: 14, weight: .bold))
                Text(distanza.isEmpty ? "–" : distanza).font(.system(size: 10, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .modifier(WipSfondoAccessorio())
            .widgetURL(url)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles").font(.system(size: 11, weight: .bold))
                    Text(titolo).font(.system(size: 12, weight: .heavy)).lineLimit(1)
                }
                Text(luogo?.nome ?? wipTestoVuoto(d, "nessuno", WipWidgetEtichette().nessuno))
                    .font(.system(size: 13, weight: .bold)).lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .modifier(WipSfondoAccessorio())
            .widgetURL(url)
        default:
            if let l = luogo {
                WipLuogoFoto(titolo: titolo, simbolo: "sparkles", nome: l.nome,
                             riga: wipRiga([l.citta, distanza]), attribuzione: l.attribuzione)
                    .modifier(WipSfondoFoto(immagine: voce.immagini[l.foto]))
                    .widgetURL(url)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    WipTestata(titolo: titolo, simbolo: "sparkles")
                    WipVuoto(testo: (d?.etichette ?? WipWidgetEtichette()).nessuno)
                }
                .wipSfondo()
                .widgetURL(url)
            }
        }
    }
}

struct WipLuogoGiornoWidget: Widget {
    let kind = "WipLuogoGiornoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in d.luogoGiorno.prefix(3).map { $0.foto } },
                                                                    lato: 600, aMezzanotte: true)) { voce in
            WipLuogoGiornoVista(voce: voce)
        }
        .configurationDisplayName("WIP · Luogo del giorno")
        .description("Una gemma vicina, diversa ogni giorno.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - 39. Cosa vedo davanti

private struct WipVisionVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        // Statico: funziona anche senza snapshot (testi di default).
        let cosaVedo = wipT(voce.dati, "cosaVedo", "Cosa vedo?")
        let inquadra = wipT(voce.dati, "inquadra", "Inquadra e scopri")
        switch famiglia {
        case .accessoryCircular:
            Image(systemName: "camera.viewfinder").font(.system(size: 22, weight: .bold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .modifier(WipSfondoAccessorio())
                .widgetURL(wipUrlSicuro("vision"))
        case .accessoryInline:
            Label(cosaVedo, systemImage: "camera.viewfinder")
                .modifier(WipSfondoAccessorio(disco: false))
                .widgetURL(wipUrlSicuro("vision"))
        default:
            VStack(spacing: 6) {
                Spacer(minLength: 0)
                Image(systemName: "camera.viewfinder").font(.system(size: 34, weight: .bold)).foregroundColor(WipColori.giallo)
                Text(cosaVedo).font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
                Text(inquadra).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue)
                    .multilineTextAlignment(.center).lineLimit(2)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .wipSfondo()
            .widgetURL(wipUrlSicuro("vision"))
        }
    }
}

struct WipVisionWidget: Widget {
    let kind = "WipVisionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipVisionVista(voce: voce)
        }
        .configurationDisplayName("WIP · Cosa vedo?")
        .description("Apri la fotocamera e riconosci quello che hai davanti.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

// MARK: - 10. Meteo e garanzia pioggia

/// Simbolo SF dal codice WMO (tutti iOS 13/14).
private func wipSimboloMeteo(_ code: Int) -> String {
    switch code {
    case 0: return "sun.max"
    case 1, 2: return "cloud.sun"
    case 3: return "cloud"
    case 45, 48: return "cloud.fog"
    case 51...63: return "cloud.rain"
    case 64...65: return "cloud.heavyrain"
    case 66...67: return "cloud.sleet"
    case 71...77, 85, 86: return "snowflake"
    case 80...82: return "cloud.sun.rain"
    case 95...99: return "cloud.bolt.rain"
    default: return "cloud.sun"
    }
}

/// Riga «ora migliore» / «tutto il giorno» / «giornata da musei». La
/// finestra si mostra solo se non e' gia' passata; un esito di un altro
/// giorno (snapshot vecchio) non si mostra.
private func wipTestoOraMeteo(_ m: WipWidgetMeteo, _ d: WipWidgetSnapshot?, _ adesso: Date) -> String {
    if m.ts > 0 && !Calendar.current.isDate(Date(timeIntervalSince1970: m.ts / 1000), inSameDayAs: adesso) { return "" }
    switch m.esito {
    case "tuttoIlGiorno": return wipT(d, "tuttoIlGiorno", "Bel tempo tutto il giorno")
    case "musei": return wipT(d, "giornoMusei", "Giornata da musei")
    default:
        guard let f = m.oraMigliore, f.a > adesso.timeIntervalSince1970 * 1000, !f.testo.isEmpty else { return "" }
        return wipT(d, "oraMigliore", "Ora migliore") + " " + f.testo
    }
}

private struct WipMeteoVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "meteo", "Meteo")
        if let m = d?.meteo {
            // Ora attuale come su Android: la prima ora da mezz'ora fa in poi,
            // altrimenti i campi radice.
            let adessoMs = voce.date.timeIntervalSince1970 * 1000
            let future = m.ore.filter { $0.ts >= adessoMs - 30 * 60 * 1000 }
            let temp = future.first?.temp ?? m.temp
            let simbolo = wipSimboloMeteo(future.first?.code ?? m.code)
            let ora = wipTestoOraMeteo(m, d, voce.date)
            let garanzia = d?.garanzia.map { wipRiga([wipT(d, "garanzia", "Garanzia pioggia"), $0.testo]) } ?? ""
            switch famiglia {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: simbolo).font(.system(size: 12, weight: .bold))
                        Text(wipGradi(temp)).font(.system(size: 15, weight: .heavy)).monospacedDigit()
                        Text(m.descr).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                    }
                    Text(ora.isEmpty ? m.luogo : ora).font(.system(size: 11)).lineLimit(2)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .modifier(WipSfondoAccessorio())
                .widgetURL(wipUrlSicuro("meteo"))
            case .systemMedium:
                VStack(alignment: .leading, spacing: 6) {
                    WipTestata(titolo: titolo, simbolo: simbolo, destra: m.luogo)
                    HStack(alignment: .center, spacing: 10) {
                        Image(systemName: simbolo).font(.system(size: 28, weight: .bold)).foregroundColor(WipColori.giallo)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(wipGradi(temp)).font(.system(size: 28, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(WipColori.testo)
                            Text(m.descr).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        HStack(spacing: 8) {
                            ForEach(Array(future.dropFirst().prefix(4)), id: \.self) { o in
                                VStack(spacing: 2) {
                                    Text(o.ora).font(.system(size: 9, weight: .bold)).monospacedDigit().foregroundColor(WipColori.spento)
                                    Image(systemName: wipSimboloMeteo(o.code)).font(.system(size: 12, weight: .bold)).foregroundColor(WipColori.giallo)
                                    Text(wipGradi(o.temp)).font(.system(size: 10, weight: .bold)).monospacedDigit().foregroundColor(WipColori.testo)
                                }
                            }
                        }
                    }
                    if !ora.isEmpty {
                        Text(ora).font(.system(size: 11, weight: .heavy)).foregroundColor(WipColori.giallo).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    HStack(alignment: .bottom, spacing: 6) {
                        if !garanzia.isEmpty {
                            Link(destination: wipUrlSicuro("garanzia")) {
                                WipPillola(testo: garanzia, simbolo: "umbrella.fill")
                            }
                        }
                        Spacer(minLength: 0)
                        WipAttribuzione(testo: m.attribuzione)
                    }
                }
                .wipSfondo()
                .widgetURL(wipUrlSicuro("meteo"))
            default:
                VStack(alignment: .leading, spacing: 3) {
                    WipTestata(titolo: m.luogo.isEmpty ? titolo : m.luogo, simbolo: simbolo)
                    Text(wipGradi(temp)).font(.system(size: 30, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(WipColori.testo)
                    Text(m.descr).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                    if !ora.isEmpty {
                        Text(ora).font(.system(size: 10, weight: .heavy)).foregroundColor(WipColori.giallo).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    if !garanzia.isEmpty {
                        WipPillola(testo: garanzia, simbolo: "umbrella.fill")
                    }
                    WipAttribuzione(testo: m.attribuzione)
                }
                .wipSfondo()
                .widgetURL(wipUrlSicuro("meteo"))
            }
        } else {
            switch famiglia {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: "cloud.sun").font(.system(size: 11, weight: .bold))
                        Text(titolo).font(.system(size: 12, weight: .heavy)).lineLimit(1)
                    }
                    Text((d?.etichette ?? WipWidgetEtichette()).nessuno).font(.system(size: 12)).lineLimit(2)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .modifier(WipSfondoAccessorio())
                .widgetURL(wipUrlSicuro("meteo"))
            default:
                VStack(alignment: .leading, spacing: 6) {
                    WipTestata(titolo: titolo, simbolo: "cloud.sun")
                    WipVuoto(testo: (d?.etichette ?? WipWidgetEtichette()).nessuno)
                }
                .wipSfondo()
                .widgetURL(wipUrlSicuro("meteo"))
            }
        }
    }
}

struct WipMeteoWidget: Widget {
    let kind = "WipMeteoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipMeteoVista(voce: voce)
        }
        .configurationDisplayName("WIP · Meteo")
        .description("Meteo della tappa di oggi, ora migliore, garanzia pioggia.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - 38. Ascolta ora

private struct WipAscoltaVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "ascoltaOra", "Ascolta ora")
        // Mai riprodurre dal widget: il tocco apre la scheda del POI e il gate
        // dei crediti resta quello dell'app.
        let url = wipUrlSicuro(d?.ascoltaOra.map { wipIdPoiOk($0.id) ? "ascolta/\($0.id)" : "vicini" } ?? "vicini")
        switch famiglia {
        case .accessoryCircular:
            Image(systemName: d?.ascoltaOra == nil ? "headphones" : "play.fill").font(.system(size: 20, weight: .bold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .modifier(WipSfondoAccessorio())
                .widgetURL(url)
        default:
            if let a = d?.ascoltaOra, !a.nome.isEmpty {
                VStack(spacing: 5) {
                    WipTestata(titolo: titolo, simbolo: "play.circle.fill",
                               destra: a.metri > 0 ? WipWidgetFormato.distanza(a.metri) : "")
                    Spacer(minLength: 0)
                    ZStack {
                        Circle().fill(WipColori.giallo)
                        Image(systemName: "play.fill").font(.system(size: 26, weight: .heavy)).foregroundColor(WipColori.blu).offset(x: 2)
                    }
                    .frame(width: 64, height: 64)
                    HStack(spacing: 5) {
                        if let img = voce.immagini[a.foto] {
                            Image(uiImage: img).resizable().scaledToFill().frame(width: 18, height: 18).clipShape(Circle())
                        }
                        Text(a.nome).font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo).lineLimit(1)
                    }
                    if !(d?.sessione ?? false) {
                        Text(wipT(d, "accedi", "Accedi per ascoltare")).font(.system(size: 9, weight: .bold)).foregroundColor(WipColori.giallo).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .wipSfondo()
                .widgetURL(url)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    WipTestata(titolo: titolo, simbolo: "play.circle.fill")
                    WipVuoto(testo: wipTestoVuoto(d, "nessunVicino", "Nessuna audioguida qui vicino"))
                }
                .wipSfondo()
                .widgetURL(url)
            }
        }
    }
}

struct WipAscoltaWidget: Widget {
    let kind = "WipAscoltaWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.ascoltaOra?.foto ?? ""] })) { voce in
            WipAscoltaVista(voce: voce)
        }
        .configurationDisplayName("WIP · Ascolta ora")
        .description("Un tocco: l'audioguida del luogo più vicino.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

// MARK: - 6. Eventi e mostre

/// Simbolo per categoria di evento (niente foto: le immagini dei partner non
/// sono foto del luogo, decisione A.6).
private func wipSimboloEvento(_ categoria: String) -> String {
    let c = categoria.lowercased()
    if c.contains("teatr") || c.contains("theat") || c.contains("danza") || c.contains("dance") { return "theatermasks" }
    if c.contains("music") || c.contains("concert") { return "music.note" }
    if c.contains("mostr") || c.contains("exhib") || c.contains("muse") || c.contains("art") { return "photo.artframe" }
    return "ticket"
}

private struct WipRigaEvento: View {
    let evento: WipWidgetEvento
    let biglietti: String
    var body: some View {
        HStack(spacing: 9) {
            WipMiniatura(immagine: nil, simbolo: wipSimboloEvento(evento.categoria), lato: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(evento.titolo).font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo).lineLimit(1)
                Text(wipRiga([evento.quando, evento.luogo, evento.metri.map { WipWidgetFormato.distanza($0) } ?? ""]))
                    .font(.system(size: 10, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
            }
            Spacer(minLength: 0)
            if evento.biglietto {
                Text(biglietti.uppercased()).font(.system(size: 8, weight: .heavy)).foregroundColor(WipColori.blu)
                    .padding(.horizontal, 6).padding(.vertical, 3).background(Capsule().fill(WipColori.giallo))
            }
        }
    }
}

private struct WipEventiVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let lista = Array((d?.eventi ?? []).prefix(famiglia == .systemLarge ? 4 : 2))
        let biglietti = wipT(d, "biglietti", "Biglietti")
        VStack(alignment: .leading, spacing: 8) {
            WipTestata(titolo: wipT(d, "eventi", "Eventi vicino a te"), simbolo: "ticket")
            if lista.isEmpty {
                WipVuoto(testo: wipTestoVuoto(d, "nessunEvento", "Nessun evento nei prossimi giorni"))
            } else {
                ForEach(lista, id: \.self) { ev in
                    WipForseLink(wipChiaveOk(ev.k) ? wipUrlSicuro("evento/\(ev.k)") : nil) {
                        WipRigaEvento(evento: ev, biglietti: biglietti)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .wipSfondo()
        .widgetURL(wipUrlSicuro("eventi"))
    }
}

struct WipEventiWidget: Widget {
    let kind = "WipEventiWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipEventiVista(voce: voce)
        }
        .configurationDisplayName("WIP · Eventi")
        .description("Eventi e mostre dei prossimi giorni.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - 60. Gemma della regione

private struct WipGemmaRegioneVista: View {
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        // «Gemma della regione», mai «la piu' votata»: nel database un voto non c'e'.
        let titolo = wipT(d, "gemmaRegione", "Gemma della regione")
        if let g = d?.gemmaRegione, !g.nome.isEmpty {
            let luogo = g.citta == g.regione ? g.regione : wipRiga([g.citta, g.regione])
            WipLuogoFoto(titolo: titolo, simbolo: "crown", nome: g.nome,
                         riga: wipRiga([luogo, g.metri > 0 ? WipWidgetFormato.distanza(g.metri) : ""]),
                         attribuzione: g.attribuzione)
                .modifier(WipSfondoFoto(immagine: voce.immagini[g.foto]))
                .widgetURL(wipUrlLuogo(g.id))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "crown")
                WipVuoto(testo: (d?.etichette ?? WipWidgetEtichette()).nessuno)
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("vicini"))
        }
    }
}

struct WipGemmaRegioneWidget: Widget {
    let kind = "WipGemmaRegioneWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.gemmaRegione?.foto ?? ""] }, lato: 600)) { voce in
            WipGemmaRegioneVista(voce: voce)
        }
        .configurationDisplayName("WIP · Gemma della regione")
        .description("Una gemma della regione in cui ti trovi.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 33. Confronto opere

private struct WipOperaScelta: View {
    let opera: WipWidgetOpera
    let immagine: UIImage?
    var body: some View {
        HStack(spacing: 7) {
            WipMiniatura(immagine: immagine, simbolo: "paintpalette", lato: 56)
            VStack(alignment: .leading, spacing: 1) {
                Text(opera.nome).font(.system(size: 12, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                    .lineLimit(2).minimumScaleFactor(0.85)
                if !opera.autore.isEmpty {
                    Text(opera.autore).font(.system(size: 10, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(5)
        .background(RoundedRectangle(cornerRadius: 11).fill(WipColori.riga))
    }
}

private struct WipConfrontoVista: View {
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "confronto", "Confronto opere")
        if let c = d?.confronto, !c.a.k.isEmpty, !c.b.k.isEmpty {
            // Il voto passa dal deep link (l'app lo salva e mostra un toast):
            // stesso comportamento su iOS 16 e 17, niente App Intent.
            let valide = wipChiaveOk(c.a.k) && wipChiaveOk(c.b.k)
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "square.split.2x1", destra: c.museo)
                Text(wipT(d, "qualeTiPiace", "Quale ti è piaciuta di più?"))
                    .font(.system(size: 12, weight: .heavy)).foregroundColor(WipColori.testo).lineLimit(1)
                HStack(spacing: 8) {
                    WipForseLink(valide ? wipUrlSicuro("voto/\(c.a.k)/\(c.b.k)") : nil) {
                        WipOperaScelta(opera: c.a, immagine: voce.immagini[c.a.foto])
                    }
                    WipForseLink(valide ? wipUrlSicuro("voto/\(c.b.k)/\(c.a.k)") : nil) {
                        WipOperaScelta(opera: c.b, immagine: voce.immagini[c.b.foto])
                    }
                }
                Spacer(minLength: 0)
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("confronto"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "square.split.2x1")
                WipVuoto(testo: wipTestoVuoto(d, "nessunConfronto", "Ascolta due opere per confrontarle"))
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("confronto"))
        }
    }
}

struct WipConfrontoWidget: Widget {
    let kind = "WipConfrontoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in d.confronto.map { [$0.a.foto, $0.b.foto] } ?? [] }, lato: 240)) { voce in
            WipConfrontoVista(voce: voce)
        }
        .configurationDisplayName("WIP · Confronto opere")
        .description("Due opere ascoltate oggi: quale preferisci?")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - 48. Ripeti in un'altra lingua

private struct WipAltraLinguaVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "ultimoAscolto", "Ultima audioguida")
        if let u = d?.ultimoAscolto, !u.nome.isEmpty {
            // Ripiego sul nome della lingua se il JS non l'ha mandato: la regola
            // e' la stessa del JS (inglese, o italiano se l'app e' in inglese).
            let nomeJs = d?.linguaAlt?.nome ?? ""
            let nomeLingua = nomeJs.isEmpty ? (d?.lingua == "en" ? "Italiano" : "English") : nomeJs
            VStack(alignment: .leading, spacing: 7) {
                WipTestata(titolo: titolo, simbolo: "globe", destra: famiglia == .systemSmall ? "" : u.quando)
                HStack(spacing: 9) {
                    WipMiniatura(immagine: voce.immagini[u.foto], simbolo: u.tipo == "opera" ? "paintpalette" : "headphones", lato: 44)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(u.nome).font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                            .lineLimit(2).minimumScaleFactor(0.85)
                        if famiglia != .systemSmall && !u.luogo.isEmpty {
                            Text(u.luogo).font(.system(size: 11, weight: .semibold)).foregroundColor(WipColori.tenue).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                Spacer(minLength: 0)
                WipPillola(testo: wipT(d, "altraLingua", "Ascolta in") + " " + nomeLingua, simbolo: "globe")
                if d?.linguaAlt?.disponibile == false {
                    Text(wipT(d, "nonDisponibileIn", "Non ancora disponibile in") + " " + nomeLingua)
                        .font(.system(size: 9, weight: .semibold)).foregroundColor(WipColori.spento).lineLimit(2)
                }
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("lingua"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "globe")
                WipVuoto(testo: wipTestoVuoto(d, "nessunAscolto", "Nessun ascolto ancora"))
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("lingua"))
        }
    }
}

struct WipAltraLinguaWidget: Widget {
    let kind = "WipAltraLinguaWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.ultimoAscolto?.foto ?? ""] })) { voce in
            WipAltraLinguaVista(voce: voce)
        }
        .configurationDisplayName("WIP · Altra lingua")
        .description("L'ultima audioguida in un'altra lingua.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 59. Guida stampata

private struct WipGuidaStampataVista: View {
    @Environment(\.widgetFamily) var famiglia
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "guidaStampata", "Guida stampata")
        let riapri = wipT(d, "riapri", "Apri")
        if let g = d?.guidaStampata, wipChiaveOk(g.k) {
            let simbolo = g.tipo == "museo" ? "building.columns" : (g.tipo == "itinerario" ? "map" : "doc.richtext")
            VStack(alignment: .leading, spacing: 7) {
                WipTestata(titolo: titolo, simbolo: "doc.richtext", destra: famiglia == .systemSmall ? "" : g.quando)
                HStack(alignment: .top, spacing: 9) {
                    WipMiniatura(immagine: nil, simbolo: simbolo, lato: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(g.nome).font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(WipColori.testo)
                            .lineLimit(2).minimumScaleFactor(0.85)
                        if famiglia == .systemSmall && !g.quando.isEmpty {
                            Text(g.quando).font(.system(size: 10, weight: .semibold)).foregroundColor(WipColori.spento).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                Spacer(minLength: 0)
                if famiglia == .systemSmall {
                    WipPillola(testo: riapri, simbolo: "doc.fill")
                } else {
                    HStack(spacing: 6) {
                        Link(destination: wipUrlSicuro("pdf/\(g.k)")) {
                            WipPillola(testo: riapri, simbolo: "doc.fill")
                        }
                        Link(destination: wipUrlSicuro("pdf/\(g.k)/condividi")) {
                            WipPillola(testo: wipT(d, "condividi", "Condividi"), simbolo: "square.and.arrow.up", piena: false)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("pdf/\(g.k)"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "doc.richtext")
                WipVuoto(testo: wipTestoVuoto(d, "nessunaGuida", "Nessuna guida stampata"))
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("archivio"))
        }
    }
}

struct WipGuidaStampataWidget: Widget {
    let kind = "WipGuidaStampataWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { _ in [] })) { voce in
            WipGuidaStampataVista(voce: voce)
        }
        .configurationDisplayName("WIP · Guida stampata")
        .description("L'ultima guida PDF, da riaprire o condividere.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 13. Foto dalla community

private struct WipFotoCommunityVista: View {
    let voce: WipWidgetVoce

    var body: some View {
        let d = voce.dati
        let titolo = wipT(d, "fotoCommunity", "Foto dalla community")
        // Solo foto approvate (review_status=approved) su POI visibili: il
        // filtro e' nel JS; qui si mostra e basta.
        if let f = d?.fotoCommunity, !f.foto.isEmpty {
            WipLuogoFoto(titolo: titolo, simbolo: "person.2.crop.square.stack", nome: f.nome,
                         riga: wipRiga([f.citta, f.metri > 0 ? WipWidgetFormato.distanza(f.metri) : "", f.quando]),
                         attribuzione: "", badge: wipT(d, "verificata", "verificata"))
                .modifier(WipSfondoFoto(immagine: voce.immagini[f.foto]))
                .widgetURL(wipUrlLuogo(f.poiId))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                WipTestata(titolo: titolo, simbolo: "person.2.crop.square.stack")
                WipVuoto(testo: wipTestoVuoto(d, "nessunaFoto", "Nessuna foto verificata qui vicino"))
            }
            .wipSfondo()
            .widgetURL(wipUrlSicuro("vicini"))
        }
    }
}

struct WipFotoCommunityWidget: Widget {
    let kind = "WipFotoCommunityWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WipWidgetProvider(urlDaScaricare: { d in [d.fotoCommunity?.foto ?? ""] }, lato: 600)) { voce in
            WipFotoCommunityVista(voce: voce)
        }
        .configurationDisplayName("WIP · Foto dalla community")
        .description("L'ultima foto verificata scattata vicino a te.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
