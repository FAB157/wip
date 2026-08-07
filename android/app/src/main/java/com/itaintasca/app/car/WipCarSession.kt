package com.itaintasca.app.car

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session

/** Una Session per connessione: restituisce la schermata radar come root. */
class WipCarSession : Session() {

    override fun onCreateScreen(intent: Intent): Screen {
        return WipRadarScreen(carContext)
    }
}
