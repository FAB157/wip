package com.itaintasca.app.widget

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * I WIDGET DELLA HOME — lato app (14/09/2026).
 *
 * Il JS (src/lib/widgetDati.ts) consegna uno snapshot JSON con crediti e
 * pass, visita museo in corso, itinerario di oggi e luoghi vicini. Qui si
 * scrive in SharedPreferences (leggibili dai widget anche ad app chiusa) e
 * si chiede ai quattro provider di ridisegnarsi. Contratto identico a iOS
 * (WipWidgetsPlugin.swift): stesso nome JS «WipWidgets», stesso metodo.
 */
@CapacitorPlugin(name = "WipWidgets")
class WipWidgetsPlugin : Plugin() {

    @PluginMethod
    fun aggiorna(call: PluginCall) {
        val dati = call.getString("dati")
        if (dati.isNullOrEmpty()) {
            call.reject("dati mancanti")
            return
        }
        try {
            WipWidgetDati.salva(context, dati)
            WipHomeWidgets.aggiornaTutti(context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("snapshot non salvato: ${e.message}")
        }
    }

    companion object {
        const val STORE = "WipWidgets"
        const val CHIAVE = "dati"
        fun prefs(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    }
}
