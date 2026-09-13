//
//  WipNavActivityBundle.swift
//  WipNavActivity (Widget Extension)
//
//  Punto d'ingresso dell'estensione. L'estensione contiene le Live Activity
//  del navigatore E della visita museo (13/09/2026) e, dal 14/09/2026, i
//  quattro widget della home (WipHomeWidgets.swift: itinerario di oggi,
//  visita museo, crediti e pass, vicino a te).
//
//  NOTA SUL DEPLOYMENT TARGET: impostare l'estensione a iOS 16.1. Con un
//  minimo piu' basso il `@main` su un tipo `@available` non compila, e il
//  `if #available` qui sotto serve appunto a reggere anche quel caso.
//

import SwiftUI
import WidgetKit

@main
struct WipNavActivityBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            WipNavLiveActivity()
            WipMuseumLiveActivity()
            WipItinerarioWidget()
            WipVisitaWidget()
            WipCreditiWidget()
            WipViciniWidget()
        }
    }
}
