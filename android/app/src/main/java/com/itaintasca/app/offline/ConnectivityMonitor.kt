package com.itaintasca.app.offline

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Stato di rete "utilizzabile davvero". isOnline() non si accontenta del Wi-Fi
 * agganciato: richiede NET_CAPABILITY_VALIDATED (Android ha verificato l'uscita
 * verso internet, captive portal esclusi). Per la "rete zombie" (validata ma
 * inservibile) c'è probe() con timeout aggressivo, da usare prima di
 * download/sync; il fallback nel service copre comunque il caso in cui il
 * fetch fallisce a rete apparentemente presente.
 */
object ConnectivityMonitor {

    fun isOnline(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Reachability reale del backend con timeout aggressivo (default 1,5 s).
     * Bloccante: chiamare da Dispatchers.IO. Qualunque risposta HTTP conta come
     * "raggiungibile" — anche un 404: il server ha risposto.
     */
    fun probe(timeoutMs: Long = 1500L): Boolean {
        return try {
            // (23/08/2026) newBuilder() sul client condiviso invece di un
            // client nuovo a ogni probe: i timeout aggressivi restano identici,
            // ma pool di connessioni e dispatcher sono gli stessi di
            // SupabaseClient — cosi' questo HEAD verso wip.guide non paga (e
            // non butta via) un handshake TLS tutto suo un istante prima che
            // il fetch dei POI ne apra un altro.
            val client = com.itaintasca.app.service.WipHttp.client.newBuilder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .callTimeout(timeoutMs * 2, TimeUnit.MILLISECONDS)
                .build()
            val req = Request.Builder()
                // (SEC-09) Dominio unico in WipApi.BASE.
                .url(com.itaintasca.app.service.WipApi.BASE + "/api/area/bundle")
                .head()
                .build()
            client.newCall(req).execute().use { it.code in 200..499 }
        } catch (_: Exception) {
            false
        }
    }
}
