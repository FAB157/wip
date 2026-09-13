//
//  WipMuseumLiveActivity.swift
//  WipNavActivity (Widget Extension)
//
//  IL CRUSCOTTO DELLA VISITA MUSEO SULLA LOCK SCREEN (13/09/2026).
//
//  Requisito del committente (12/09/2026): «l'opera che hai ascoltato,
//  quella che stai ascoltando e la prossima [...] cliccando o con comandi
//  vocali puo' attivare la guida dell'opera successiva senza aprire l'app».
//  Stessi colori del prodotto della card di navigazione (blu #1e3a8a,
//  giallo #d4af37): chi ha gia' visto il cruscotto del navigatore riconosce
//  questo a colpo d'occhio.
//
//  I dati arrivano da LiveActivityMuseum.swift (dentro l'app), che li riceve
//  dal JS via WipBackgroundAudioPlugin.updateMuseumBanner (chiamato da
//  MuseumVisitSheet.tsx a inizio/fine di ogni opera).
//

import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
import WidgetKit

@available(iOS 16.1, *)
private enum WipMuseumColori {
    static let blu = Color(red: 30.0 / 255.0, green: 58.0 / 255.0, blue: 138.0 / 255.0)
    static let giallo = Color(red: 212.0 / 255.0, green: 175.0 / 255.0, blue: 55.0 / 255.0)
    static let testo = Color.white
    static let testoTenue = Color.white.opacity(0.75)
    static let testoSpento = Color.white.opacity(0.55)
    static let tasto = Color.white.opacity(0.14)
}

// MARK: - Pezzi condivisi fra lock screen e Dynamic Island

/// Una riga opera: pallino di stato + titolo + sala, in tre pesi diversi
/// (ascoltata attenuata, in ascolto in grande, prossima normale).
@available(iOS 16.1, *)
private struct WipMuseumRigaOpera: View {
    enum Peso { case ascoltata, inAscolto, prossima }
    let titolo: String
    let sala: String
    let peso: Peso

    private var simbolo: String {
        switch peso {
        case .ascoltata: return "checkmark.circle.fill"
        case .inAscolto: return "waveform"
        case .prossima: return "arrow.right.circle"
        }
    }
    private var coloreIcona: Color {
        switch peso {
        case .ascoltata: return WipMuseumColori.testoSpento
        case .inAscolto: return WipMuseumColori.giallo
        case .prossima: return WipMuseumColori.testoTenue
        }
    }
    private var coloreTesto: Color {
        peso == .ascoltata ? WipMuseumColori.testoSpento : WipMuseumColori.testo
    }
    private var pesoFont: Font.Weight { peso == .inAscolto ? .heavy : .semibold }
    private var dimensione: CGFloat { peso == .inAscolto ? 17 : 13 }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: simbolo)
                .font(.system(size: peso == .inAscolto ? 16 : 12, weight: .bold))
                .foregroundColor(coloreIcona)
            VStack(alignment: .leading, spacing: 1) {
                Text(titolo)
                    .font(.system(size: dimensione, weight: pesoFont, design: .rounded))
                    .foregroundColor(coloreTesto)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if !sala.isEmpty {
                    Text(sala)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(WipMuseumColori.testoSpento)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// La barra di avanzamento dell'opera in ascolto, sottile come nel navigatore.
@available(iOS 16.1, *)
private struct WipMuseumBarra: View {
    let progresso: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.15))
                Capsule().fill(WipMuseumColori.giallo)
                    .frame(width: max(0, min(1, progresso)) * g.size.width)
            }
        }
        .frame(height: 3)
    }
}

/// Il tasto "Prossima": Button con App Intent dal iOS 17 (il tocco resta
/// sulla lock screen), Link con lo schema dell'app prima.
@available(iOS 16.1, *)
private struct WipMuseumTastoProssima: View {
    var lato: CGFloat = 44

    private var faccia: some View {
        ZStack {
            Circle().fill(WipMuseumColori.giallo)
            Image(systemName: "forward.fill")
                .font(.system(size: lato * 0.42, weight: .bold))
                .foregroundColor(WipMuseumColori.blu)
        }
        .frame(width: lato, height: lato)
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: WipMuseumAzioneIntent(azione: WipMuseumAzione.prossima)) { faccia }
                .buttonStyle(.plain)
        } else if let url = WipMuseumLink.url(WipMuseumAzione.prossima) {
            Link(destination: url) { faccia }
        } else {
            faccia
        }
    }
}

// MARK: - Lock screen

@available(iOS 16.1, *)
private struct WipMuseumVistaBlocco: View {
    let museo: String
    let stato: WipMuseumAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(museo)
                    .font(.caption.weight(.bold))
                    .foregroundColor(WipMuseumColori.testoTenue)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if stato.tappeTotali > 1 {
                    Text("\(stato.indiceTappa)/\(stato.tappeTotali)")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundColor(WipMuseumColori.testoSpento)
                }
            }
            if stato.haAscoltata {
                WipMuseumRigaOpera(titolo: stato.ascoltataTitolo, sala: stato.ascoltataSala, peso: .ascoltata)
            }
            // Niente testo hardcoded in una lingua sola: l'estensione non ha
            // l'i18n del JS (7 lingue) e il navigatore fa lo stesso — parlano
            // i simboli (spunta = ascoltata, onda = in ascolto, freccia =
            // prossima) e il tasto giallo. Fra un'opera e l'altra resta solo
            // la riga della prossima, con il tasto accanto.
            if stato.haInAscolto {
                WipMuseumRigaOpera(titolo: stato.inAscoltoTitolo, sala: stato.inAscoltoSala, peso: .inAscolto)
                if stato.progressoEffettivo >= 0 { WipMuseumBarra(progresso: stato.progressoEffettivo) }
            }
            if stato.haProssima {
                HStack(alignment: .center, spacing: 10) {
                    WipMuseumRigaOpera(titolo: stato.prossimaTitolo, sala: stato.prossimaSala, peso: .prossima)
                    WipMuseumTastoProssima(lato: 42)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct WipMuseumLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WipMuseumAttributes.self) { context in
            WipMuseumVistaBlocco(museo: context.attributes.nomeMuseo, stato: context.state)
                .activityBackgroundTint(WipMuseumColori.blu.opacity(0.96))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "building.columns.fill")
                        .foregroundColor(WipMuseumColori.giallo)
                        .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.tappeTotali > 1 {
                        Text("\(context.state.indiceTappa)/\(context.state.tappeTotali)")
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.white.opacity(0.18)))
                            .foregroundColor(WipMuseumColori.testo)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    if context.state.haInAscolto {
                        Text(context.state.inAscoltoTitolo)
                            .font(.system(size: 15, weight: .heavy, design: .rounded))
                            .foregroundColor(WipMuseumColori.testo)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if context.state.haProssima {
                            WipMuseumRigaOpera(titolo: context.state.prossimaTitolo, sala: context.state.prossimaSala, peso: .prossima)
                            WipMuseumTastoProssima(lato: 38)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "building.columns.fill").foregroundColor(WipMuseumColori.giallo)
            } compactTrailing: {
                if context.state.tappeTotali > 1 {
                    Text("\(context.state.indiceTappa)/\(context.state.tappeTotali)")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundColor(WipMuseumColori.testo)
                }
            } minimal: {
                Image(systemName: "building.columns.fill").foregroundColor(WipMuseumColori.giallo)
            }
            .keylineTint(WipMuseumColori.giallo)
        }
    }
}
#endif
