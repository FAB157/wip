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

//  DAL 23/09/2026 i widget della home sono 15 (4 + 11 nuovi): con le 2 Live
//  Activity si supera il massimo di 10 elementi per blocco del
//  WidgetBundleBuilder, quindi stanno in due bundle secondari (A: 10, B: 5)
//  inclusi qui con `.body`. Chi aggiunge un widget lo mette in B finche' ha
//  posto (massimo 10 righe per bundle).
//

import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct WipHomeBundleA: WidgetBundle {
    var body: some Widget {
        WipItinerarioWidget()
        WipVisitaWidget()
        WipCreditiWidget()
        WipViciniWidget()
        WipUltimoAscoltoWidget()
        WipLuogoGiornoWidget()
        WipVisionWidget()
        WipMeteoWidget()
        WipAscoltaWidget()
        WipEventiWidget()
    }
}

@available(iOS 16.1, *)
struct WipHomeBundleB: WidgetBundle {
    var body: some Widget {
        WipGemmaRegioneWidget()
        WipConfrontoWidget()
        WipAltraLinguaWidget()
        WipGuidaStampataWidget()
        WipFotoCommunityWidget()
    }
}

@main
struct WipNavActivityBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            WipNavLiveActivity()
            WipMuseumLiveActivity()
            WipHomeBundleA().body
            WipHomeBundleB().body
        }
    }
}
