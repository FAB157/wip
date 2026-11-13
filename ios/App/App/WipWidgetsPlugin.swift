//
//  WipWidgetsPlugin.swift
//  App
//
//  I WIDGET DELLA HOME — lato app (14/09/2026).
//
//  Il JS (src/lib/widgetDati.ts) compone uno snapshot JSON con crediti e
//  pass, visita museo in corso, itinerario di oggi e luoghi vicini, e lo
//  consegna qui. Questo plugin lo scrive nell'App Group condiviso con
//  l'estensione WipNavActivity (dove vivono i widget, vedi
//  WipHomeWidgets.swift) e chiede a WidgetKit di ridisegnare. Nient'altro:
//  niente rete, niente logica — il widget legge e mostra.
//
//  Contratto condiviso con Android (WipWidgetsPlugin.kt): stesso nome JS
//  «WipWidgets», stesso metodo «aggiorna», stesso JSON.
//

import Foundation
import Capacitor
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Dove lo snapshot viene scritto e letto (stessa chiave in WipWidgetDati.swift).
enum WipWidgetDeposito {
    static let chiave = "wipWidgetDati"
}

@objc(WipWidgetsPlugin)
public class WipWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WipWidgetsPlugin"
    public let jsName = "WipWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "aggiorna", returnType: CAPPluginReturnPromise)
    ]

    @objc func aggiorna(_ call: CAPPluginCall) {
        guard let dati = call.getString("dati"), !dati.isEmpty else {
            call.reject("dati mancanti")
            return
        }
        guard let difese = UserDefaults(suiteName: WipNavAppGroup.id) else {
            // App Group non abilitato in questa build: nessun widget, nessun errore.
            call.resolve()
            return
        }
        difese.set(dati, forKey: WipWidgetDeposito.chiave)
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
        call.resolve()
    }
}
