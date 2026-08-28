//
//  WipNavActivityBundle.swift
//  WipNavActivity (Widget Extension)
//
//  Punto d'ingresso dell'estensione. L'estensione contiene SOLO la Live
//  Activity del navigatore: nessun widget in home screen.
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
        }
    }
}
