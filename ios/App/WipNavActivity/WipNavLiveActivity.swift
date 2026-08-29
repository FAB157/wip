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
//  Grafica volutamente sobria: blu del prodotto (#1e3a8a) come tinta di
//  sfondo, testo bianco. Sulla lock screen il fondo e' scuro per definizione,
//  quindi si progetta per quello e si evita ogni colore che sparirebbe.
//

import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
import WidgetKit

@available(iOS 16.1, *)
private enum WipNavColori {
    /// #1e3a8a — il blu del prodotto.
    static let blu = Color(red: 30.0 / 255.0, green: 58.0 / 255.0, blue: 138.0 / 255.0)
    static let testo = Color.white
    static let testoTenue = Color.white.opacity(0.72)
}

// MARK: - Lock screen

@available(iOS 16.1, *)
private struct WipNavVistaBlocco: View {
    let stato: WipNavAttributes.ContentState

    /// La foto della tappa, se l'app l'ha gia' messa nell'App Group.
    private var foto: UIImage? {
        guard !stato.fotoPath.isEmpty else { return nil }
        return UIImage(contentsOfFile: stato.fotoPath)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // (29/08/2026) La foto del luogo verso cui si cammina, come i
            // loghi delle squadre nel banner di SofaScore. Senza foto la
            // colonna non c'e' e il testo prende tutta la larghezza.
            if let img = foto {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            testo
        }
        .padding(14)
    }

    private var testo: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Riga 1 — la tappa: n/N e il nome, in grande.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(stato.indiceTappa)/\(stato.tappeTotali)")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.white.opacity(0.18)))
                    .foregroundColor(WipNavColori.testo)
                Text(stato.nomeTappa)
                    .font(.headline)
                    .lineLimit(1)
                    .foregroundColor(WipNavColori.testo)
                Spacer(minLength: 0)
                if stato.metriAllaTappa >= 0 {
                    Text(WipNavFormat.distanza(stato.metriAllaTappa))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(WipNavColori.testo)
                }
            }

            // Riga 2 — la svolta da fare adesso.
            if !stato.istruzione.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.turn.up.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(WipNavColori.testo)
                    Text(stato.istruzione)
                        .font(.subheadline)
                        .lineLimit(2)
                        .foregroundColor(WipNavColori.testo)
                    if stato.metriAllaSvolta >= 0 {
                        Text("· \(WipNavFormat.distanza(stato.metriAllaSvolta))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(WipNavColori.testoTenue)
                    }
                    Spacer(minLength: 0)
                }
            }

            // Riga 3 — quanto manca, a che ora si arriva, e cosa viene dopo.
            HStack(spacing: 6) {
                Image(systemName: "figure.walk")
                    .font(.caption)
                    .foregroundColor(WipNavColori.testoTenue)
                Text(WipNavFormat.distanza(stato.metriRimanenti))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(WipNavColori.testoTenue)
                if !stato.eta.isEmpty {
                    Text("· \(stato.eta)")
                        .font(.caption)
                        .foregroundColor(WipNavColori.testoTenue)
                }
                if !stato.nomeProssima.isEmpty {
                    Text("· \(stato.nomeProssima)")
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundColor(WipNavColori.testoTenue)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct WipNavLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WipNavAttributes.self) { context in
            WipNavVistaBlocco(stato: context.state)
                .activityBackgroundTint(WipNavColori.blu.opacity(0.94))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Espansa: le stesse righe della lock screen.
                DynamicIslandExpandedRegion(.leading) {
                    Text("\(context.state.indiceTappa)/\(context.state.tappeTotali)")
                        .font(.caption.weight(.bold))
                        .foregroundColor(WipNavColori.testo)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.metriAllaTappa >= 0 {
                        Text(WipNavFormat.distanza(context.state.metriAllaTappa))
                            .font(.caption.weight(.semibold))
                            .foregroundColor(WipNavColori.testo)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.nomeTappa)
                        .font(.headline)
                        .lineLimit(1)
                        .foregroundColor(WipNavColori.testo)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        if !context.state.istruzione.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.turn.up.right")
                                    .font(.footnote.weight(.semibold))
                                Text(context.state.istruzione)
                                    .font(.subheadline)
                                    .lineLimit(1)
                                if context.state.metriAllaSvolta >= 0 {
                                    Text("· \(WipNavFormat.distanza(context.state.metriAllaSvolta))")
                                        .font(.subheadline.weight(.semibold))
                                }
                                Spacer(minLength: 0)
                            }
                            .foregroundColor(WipNavColori.testo)
                        }
                        HStack(spacing: 6) {
                            Text(WipNavFormat.distanza(context.state.metriRimanenti))
                                .font(.caption.weight(.semibold))
                            if !context.state.eta.isEmpty {
                                Text("· \(context.state.eta)").font(.caption)
                            }
                            if !context.state.nomeProssima.isEmpty {
                                Text("· \(context.state.nomeProssima)")
                                    .font(.caption)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .foregroundColor(WipNavColori.testoTenue)
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.walk")
                    .foregroundColor(WipNavColori.testo)
            } compactTrailing: {
                // In compatta ci sta un dato solo: i metri alla prossima
                // svolta (o, se non c'e' una svolta, alla tappa).
                Text(WipNavFormat.distanza(
                    context.state.metriAllaSvolta >= 0
                        ? context.state.metriAllaSvolta
                        : context.state.metriAllaTappa
                ))
                .font(.caption2.weight(.semibold))
                .foregroundColor(WipNavColori.testo)
            } minimal: {
                Image(systemName: "figure.walk")
                    .foregroundColor(WipNavColori.testo)
            }
            .keylineTint(WipNavColori.blu)
        }
    }
}
#endif
