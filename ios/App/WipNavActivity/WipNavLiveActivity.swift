//
//  WipNavLiveActivity.swift
//  WipNavActivity (Widget Extension)
//
//  IL CRUSCOTTO DEL NAVIGATORE SULLA LOCK SCREEN (28/08/2026).
//
//  E' la Live Activity del giro: resta sullo schermo bloccato e nella Dynamic
//  Island e si aggiorna da sola mentre si cammina, senza che l'utente debba
//  riaprire l'app. I dati arrivano da LiveActivityNav.swift (dentro l'app),
//  che a sua volta li riceve dal JS via ItaintaBackgroundPoiPlugin.updateNavBanner.
//
//  (03/09/2026) RIDISEGNATA A IMMAGINE DELLA CARD BLU IN APP
//  (src/components/NavigationOverlay.tsx), su richiesta del committente: il
//  cerchio giallo con la freccia della manovra, i metri alla svolta in
//  grande, l'istruzione, il piede con luogo · distanza · minuti · ora
//  d'arrivo, la barra di avanzamento; e sotto gli STESSI TASTI del cruscotto
//  (pausa/riprendi, riascolta, salta, ricalcola, termina): Button con App
//  Intent dal iOS 17, Link con lo schema dell'app sotto (WipNavIntents.swift).
//  Colori del prodotto: blu #1e3a8a, giallo #d4af37 come nella card.
//

import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
import WidgetKit

@available(iOS 16.1, *)
private enum WipNavColori {
    /// #1e3a8a — il blu del prodotto.
    static let blu = Color(red: 30.0 / 255.0, green: 58.0 / 255.0, blue: 138.0 / 255.0)
    /// #d4af37 — il giallo della card (bg-secondary).
    static let giallo = Color(red: 212.0 / 255.0, green: 175.0 / 255.0, blue: 55.0 / 255.0)
    static let testo = Color.white
    static let testoTenue = Color.white.opacity(0.75)
    static let testoSpento = Color.white.opacity(0.55)
    static let tasto = Color.white.opacity(0.14)
    static let terminaFondo = Color.red.opacity(0.28)
    static let terminaIcona = Color(red: 1, green: 0.55, blue: 0.55)
}

// MARK: - Pezzi condivisi fra lock screen e Dynamic Island

/// Il cerchio giallo con la freccia: la manovra a colpo d'occhio.
@available(iOS 16.1, *)
private struct WipNavFreccia: View {
    let stato: WipNavAttributes.ContentState
    var lato: CGFloat = 56
    var body: some View {
        ZStack {
            Circle().fill(stato.eInPausa ? WipNavColori.tasto : WipNavColori.giallo)
            Image(systemName: stato.eInPausa ? "pause.fill" : stato.simboloManovra)
                .font(.system(size: lato * 0.46, weight: .bold))
                .foregroundColor(stato.eInPausa ? WipNavColori.testo : WipNavColori.blu)
        }
        .frame(width: lato, height: lato)
    }
}

/// I metri alla svolta (o alla tappa) in grande, e l'istruzione sotto.
@available(iOS 16.1, *)
private struct WipNavIstruzione: View {
    let stato: WipNavAttributes.ContentState
    var grande: CGFloat = 30
    var righe: Int = 2
    private var metri: Double { stato.metriAllaSvolta >= 0 ? stato.metriAllaSvolta : stato.metriAllaTappa }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if metri >= 0 && !stato.eInPausa {
                Text(WipNavFormat.distanza(metri))
                    .font(.system(size: grande, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(WipNavColori.giallo)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            Text(stato.istruzione)
                .font(.subheadline.weight(.bold))
                .foregroundColor(WipNavColori.testo)
                .lineLimit(righe)
                .minimumScaleFactor(0.85)
        }
    }
}

/// La barra di avanzamento sottile in cima, come nella card.
@available(iOS 16.1, *)
private struct WipNavBarra: View {
    let progresso: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.15))
                Capsule().fill(WipNavColori.giallo)
                    .frame(width: max(0, min(1, progresso)) * g.size.width)
            }
        }
        .frame(height: 4)
    }
}

/// Il piede: luogo · distanza mancante · minuti · ora d'arrivo.
@available(iOS 16.1, *)
private struct WipNavPiede: View {
    let stato: WipNavAttributes.ContentState
    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 4) {
                Image(systemName: "mappin.circle.fill").foregroundColor(WipNavColori.giallo)
                Text(stato.tappeTotali > 1 ? "\(stato.indiceTappa)/\(stato.tappeTotali) · \(stato.nomeTappa)" : stato.nomeTappa)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            HStack(spacing: 4) {
                Image(systemName: "flag.fill").foregroundColor(WipNavColori.giallo)
                Text(WipNavFormat.distanza(stato.metriRimanenti)).monospacedDigit()
            }
            if stato.minutiEffettivi >= 0 || !stato.eta.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "clock.fill").foregroundColor(WipNavColori.giallo)
                    if stato.minutiEffettivi >= 0 { Text(WipNavFormat.minuti(stato.minutiEffettivi)).monospacedDigit() }
                    if !stato.eta.isEmpty {
                        Text("· \(stato.eta)").foregroundColor(WipNavColori.testoSpento).monospacedDigit()
                    }
                }
            }
        }
        .font(.caption.weight(.bold))
        .foregroundColor(WipNavColori.testoTenue)
    }
}

/// Un tasto rotondo del cruscotto. Dal iOS 17 e' un Button con App Intent
/// (il tocco resta sulla lock screen); prima e' un Link con lo schema
/// dell'app, che la apre e le consegna l'azione (AppDelegate).
@available(iOS 16.1, *)
private struct WipNavTasto: View {
    let azione: String
    let simbolo: String
    var lato: CGFloat = 40

    private var faccia: some View {
        ZStack {
            Circle().fill(azione == WipNavAzione.termina ? WipNavColori.terminaFondo : WipNavColori.tasto)
            Image(systemName: simbolo)
                .font(.system(size: lato * 0.4, weight: .bold))
                .foregroundColor(azione == WipNavAzione.termina ? WipNavColori.terminaIcona : WipNavColori.testo)
        }
        .frame(width: lato, height: lato)
    }

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: WipNavAzioneIntent(azione: azione)) { faccia }
                .buttonStyle(.plain)
        } else if let url = WipNavLink.url(azione) {
            Link(destination: url) { faccia }
        } else {
            faccia
        }
    }
}

/// I tasti del cruscotto. Quali, lo dice `modo`:
///  - giro:     pausa · riascolta · salta · ricalcola · termina
///  - percorso: pausa · salta · ricalcola · termina (niente da riascoltare)
///  - singola:  riascolta · ricalcola · termina (una meta sola: niente salta/pausa)
@available(iOS 16.1, *)
private struct WipNavTasti: View {
    let stato: WipNavAttributes.ContentState
    var lato: CGFloat = 40

    private var azioni: [(String, String)] {
        let pausa = (WipNavAzione.pausa, stato.eInPausa ? "play.fill" : "pause.fill")
        let riascolta = (WipNavAzione.riascolta, "arrow.counterclockwise")
        let salta = (WipNavAzione.salta, "forward.end.fill")
        let ricalcola = (WipNavAzione.ricalcola, "arrow.triangle.2.circlepath")
        let termina = (WipNavAzione.termina, "xmark")
        switch stato.modoEffettivo {
        case "singola": return [riascolta, ricalcola, termina]
        case "percorso": return [pausa, salta, ricalcola, termina]
        default: return [pausa, riascolta, salta, ricalcola, termina]
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            ForEach(azioni, id: \.0) { (azione, simbolo) in
                WipNavTasto(azione: azione, simbolo: simbolo, lato: lato)
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Lock screen

@available(iOS 16.1, *)
private struct WipNavVistaBlocco: View {
    let stato: WipNavAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if stato.progressoEffettivo >= 0 { WipNavBarra(progresso: stato.progressoEffettivo) }
            HStack(alignment: .top, spacing: 12) {
                WipNavFreccia(stato: stato, lato: 58)
                WipNavIstruzione(stato: stato, grande: 32, righe: 2)
                Spacer(minLength: 0)
            }
            WipNavPiede(stato: stato)
            WipNavTasti(stato: stato, lato: 38)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 12)
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct WipNavLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WipNavAttributes.self) { context in
            WipNavVistaBlocco(stato: context.state)
                .activityBackgroundTint(WipNavColori.blu.opacity(0.96))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    WipNavFreccia(stato: context.state, lato: 44)
                        .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.tappeTotali > 1 {
                        Text("\(context.state.indiceTappa)/\(context.state.tappeTotali)")
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.white.opacity(0.18)))
                            .foregroundColor(WipNavColori.testo)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    WipNavIstruzione(stato: context.state, grande: 24, righe: 1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        WipNavPiede(stato: context.state)
                        WipNavTasti(stato: context.state, lato: 34)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.eInPausa ? "pause.fill" : ((context.state.manovra ?? "").isEmpty ? "figure.walk" : context.state.simboloManovra))
                    .foregroundColor(WipNavColori.giallo)
            } compactTrailing: {
                // In compatta ci sta un dato solo: i metri alla prossima
                // svolta (o, se non c'e' una svolta, alla tappa).
                Text(WipNavFormat.distanza(
                    context.state.metriAllaSvolta >= 0
                        ? context.state.metriAllaSvolta
                        : context.state.metriAllaTappa
                ))
                .font(.caption2.weight(.bold))
                .monospacedDigit()
                .foregroundColor(WipNavColori.testo)
            } minimal: {
                Image(systemName: context.state.eInPausa ? "pause.fill" : "figure.walk")
                    .foregroundColor(WipNavColori.giallo)
            }
            .keylineTint(WipNavColori.giallo)
        }
    }
}
#endif
