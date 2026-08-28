package com.itaintasca.app.service

import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * (SEC-09, 28/08/2026) UNICO punto in cui vive l'indirizzo del backend.
 *
 * Prima `https://wip.guide` era cablato in sette file diversi (SupabaseClient,
 * PackageDownloadManager, GeofenceBroadcastReceiver, AudioPrefetchManager,
 * RoadSnap, ConnectivityMonitor, ItaintaBackgroundPoiService): un cambio di
 * dominio andava cercato a mano e uno dimenticato restava a puntare al posto
 * sbagliato. `www.wip.guide` e' il PROD_URL del web (vedi src/lib/api.ts);
 * `itainta.vercel.app` resta vivo come dominio secondario dello stesso
 * progetto Vercel per le build gia' installate.
 *
 * Costante di compilazione: le `const val` che la concatenano (es.
 * `WipApi.BASE + "/api/area/bundle"`) restano costanti a loro volta.
 */
object WipApi {
    const val BASE = "https://www.wip.guide"

    private const val TAG = "WipApi"
    // Un solo avviso ogni 5 minuti: il receiver e il servizio possono fare
    // decine di chiamate autenticate in un giro di isolato.
    private const val TOKEN_EXPIRED_THROTTLE_MS = 5 * 60_000L
    @Volatile private var lastTokenExpiredAt = 0L

    /**
     * (SEC-03) Una chiamata AUTENTICATA ha risposto 401: il token Supabase
     * salvato in SecurePrefs e' scaduto. Si avvisa il JS con l'evento
     * `tokenExpired` (via il receiver di ItaintaBackgroundPoiPlugin, che lo
     * inoltra con retainUntilConsumed: se la WebView dorme lo riceve al
     * risveglio) cosi' rinnova la sessione e richiama setUserContext.
     */
    fun notifyTokenExpired(context: Context) {
        val now = System.currentTimeMillis()
        if (now - lastTokenExpiredAt < TOKEN_EXPIRED_THROTTLE_MS) return
        lastTokenExpiredAt = now
        try {
            val appContext = context.applicationContext
            val intent = Intent("com.itaintasca.POI_EVENT").apply {
                setPackage(appContext.packageName)
                putExtra("event", "tokenExpired")
                putExtra("data1", "{\"reason\":\"http_401\",\"ts\":$now}")
            }
            appContext.sendBroadcast(intent)
            Log.w(TAG, "Token utente scaduto (401): evento tokenExpired inviato al plugin")
        } catch (e: Exception) {
            Log.w(TAG, "Evento tokenExpired non inviato: ${e.message}")
        }
    }
}
