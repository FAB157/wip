package com.itaintasca.app.service

import android.content.Context
import android.content.SharedPreferences

/**
 * Lettura delle preferenze scritte dal WebView tramite il plugin Capacitor
 * Preferences (@capacitor/preferences): il plugin persiste le coppie
 * chiave/valore nel file SharedPreferences "CapacitorStorage" (valori sempre
 * String), che il nativo può leggere anche a WebView morta.
 *
 * NOTA CONTRATTO: localStorage NON è leggibile dal nativo — il JS deve
 * scrivere queste chiavi via `Preferences.set({ key, value })`. In più c'è
 * un fallback su "ItaintaPrefs" (le prefs del servizio) per le chiavi che
 * un domani il plugin nativo volesse popolare direttamente.
 *
 * Chiavi definite qui (da popolare lato WebView):
 *  - wip_silent_mode        → '1' = modalità «solo vibrazione + testo»
 *  - wip_widget_credits     → saldo crediti (stringa numerica, es. "42")
 *  - wip_widget_next_stop   → nome della prossima tappa dell'itinerario attivo
 *  - wip_widget_nearest_poi → "Nome POI|distanza_in_metri" (o solo il nome)
 */
object WebViewPrefs {
    const val STORE = "CapacitorStorage"

    const val KEY_SILENT_MODE = "wip_silent_mode"
    const val KEY_WIDGET_CREDITS = "wip_widget_credits"
    const val KEY_WIDGET_NEXT_STOP = "wip_widget_next_stop"
    const val KEY_WIDGET_NEAREST_POI = "wip_widget_nearest_poi"

    private fun store(context: Context): SharedPreferences =
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    /** Valore stringa da CapacitorStorage; null se assente o su qualunque errore. */
    fun getString(context: Context, key: String): String? =
        try {
            store(context).getString(key, null)
        } catch (_: Exception) {
            null
        }

    /**
     * Modalità «solo vibrazione + testo»: al trigger di un POI niente TTS né
     * audio, solo vibrazione breve doppia + notifica col testo del teaser.
     * Attiva se wip_silent_mode è '1' (o 'true') in CapacitorStorage oppure
     * in ItaintaPrefs (fallback). Default OFF: comportamento identico a oggi.
     */
    fun isSilentMode(context: Context): Boolean {
        val v = getString(context, KEY_SILENT_MODE)
            ?: try {
                context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                    .getString(KEY_SILENT_MODE, null)
            } catch (_: Exception) {
                null
            }
        return v == "1" || v.equals("true", ignoreCase = true)
    }
}
