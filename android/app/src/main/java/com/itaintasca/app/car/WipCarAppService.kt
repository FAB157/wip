package com.itaintasca.app.car

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Entry point Android Auto (esperimentale): l'host (l'unità di testa dell'auto,
 * o il Desktop Head Unit in sviluppo) si connette a questo servizio e riceve
 * i template da renderizzare. Tutta la logica vera resta nel Foreground Service
 * ItaintaBackgroundPoiService: qui c'è solo la proiezione dello stato radar.
 */
class WipCarAppService : CarAppService() {

    // PrivateResource: la libreria marca l'allowlist come privata, ma è la
    // risorsa che la documentazione ufficiale indica per la host validation.
    @SuppressLint("PrivateResource")
    override fun createHostValidator(): HostValidator {
        // In debug accettiamo qualsiasi host (necessario per il Desktop Head Unit);
        // in release solo gli host Google noti (Android Auto ufficiale).
        return if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        } else {
            // hosts_allowlist_sample è l'UNICA allowlist pubblicata dalla
            // libreria androidx.car.app (una "hosts_allowlist" senza suffisso
            // non esiste) ed è quella indicata dalla documentazione ufficiale
            // per la release: nonostante il nome, contiene le firme degli host
            // Android Auto di Google e la validazione è signature-pinned.
            HostValidator.Builder(applicationContext)
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build()
        }
    }

    override fun onCreateSession(): Session = WipCarSession()
}
