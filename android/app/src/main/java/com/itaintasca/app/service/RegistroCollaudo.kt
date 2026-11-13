package com.itaintasca.app.service

import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * REGISTRO DI COLLAUDO (04/10/2026, committente: «fai queste 3 implementazioni»).
 *
 * Una riga per ogni cosa che il servizio decide camminando: dove il navigatore
 * ha agganciato la posizione e cosa ha detto (righe scritte da NavFollower), e
 * a quanti metri DI STRADA sono scattati l'avviso e la guida di ogni luogo
 * (righe «GUIDA …» scritte dal giro dei trigger e dal ricevitore dei recinti).
 * Serve a rispondere, dopo una passeggiata, a «perché qui ha sbagliato?».
 *
 * Fino al 03/10 viveva solo in memoria, dentro NavFollower: chiusa l'app, il
 * registro era perso, e i trigger dell'audioguida non c'erano. Ora:
 *  - sta su DISCO (filesDir/collaudo.log), sopravvive alla chiusura;
 *  - lo scrivono navigatore E audioguida;
 *  - si legge col metodo `getNavLog` del plugin, che l'admin puo' anche
 *    inviare al server (POST /api/collaudo/registro).
 *
 * Gemello di `RegistroCollaudo` in fondo a ios/App/App/BackgroundPoiManager.swift:
 * stesso formato di riga («MM-dd HH:mm:ss testo»), stessi tetti.
 * Non contiene dati personali oltre alle posizioni del collaudo; resta sul
 * telefono finche' l'admin non lo invia.
 */
object RegistroCollaudo {
    private const val TAG = "RegistroCollaudo"
    private const val FILE = "collaudo.log"
    private const val MAX_RIGHE = 4000
    /** Oltre questo peso il file si riscrive con le sole ultime MAX_RIGHE. */
    private const val MAX_BYTE = 700_000L

    /** filesDir dell'app: lo imposta il servizio all'avvio (e il plugin, se il servizio non e' partito). */
    @Volatile var dir: File? = null

    private val righe = ArrayDeque<String>()
    private var caricato = false
    private val formato = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US)

    private fun file(): File? = dir?.let { File(it, FILE) }

    private fun carica() {
        if (caricato) return
        caricato = true
        try {
            val f = file() ?: return
            if (!f.exists()) return
            f.readLines().takeLast(MAX_RIGHE).forEach { if (it.isNotBlank()) righe.addLast(it) }
        } catch (e: Exception) {
            Log.w(TAG, "registro non letto: ${e.message}")
        }
    }

    /** Aggiunge una riga, con data e ora del telefono, in memoria e su disco. Non lancia mai. */
    @Synchronized
    fun scrivi(riga: String) {
        try {
            carica()
            val completa = "${formato.format(Date())} $riga"
            righe.addLast(completa)
            while (righe.size > MAX_RIGHE) righe.removeFirst()
            val f = file() ?: return
            if (f.exists() && f.length() > MAX_BYTE) {
                f.writeText(righe.joinToString("\n", postfix = "\n"))
            } else {
                f.appendText(completa + "\n")
            }
        } catch (e: Exception) {
            Log.w(TAG, "riga non scritta: ${e.message}")
        }
    }

    // ── MODALITA' COLLAUDO (04/10/2026) ──────────────────────────────────
    // Le righe NAV e GUIDA si scrivono sempre: sono poche e servono a capire un
    // difetto anche a posteriori. La TRACCIA (una riga «POS» ogni 4 secondi) si
    // scrive solo con la modalita' collaudo accesa dall'admin: serve a
    // disegnare la passeggiata sulla mappa, e non ha senso tenerla per tutti.
    private const val FILE_ACCESO = "collaudo.on"
    private const val POS_OGNI_MS = 4000L
    @Volatile private var acceso: Boolean? = null
    @Volatile private var ultimaPosMs = 0L

    fun attivo(): Boolean {
        acceso?.let { return it }
        val v = try { dir?.let { File(it, FILE_ACCESO).exists() } ?: false } catch (_: Exception) { false }
        if (dir != null) acceso = v
        return v
    }

    fun imposta(on: Boolean) {
        acceso = on
        try {
            val f = File(dir ?: return, FILE_ACCESO)
            if (on) f.writeText("1") else f.delete()
        } catch (_: Exception) { }
        scrivi(if (on) "COLLAUDO acceso" else "COLLAUDO spento")
    }

    // CONSUMO (04/10/2026): ogni 5 minuti di collaudo una riga «BATT» con il
    // livello della batteria, se il telefono e' in carica e quante posizioni
    // GPS sono arrivate nel frattempo. La pagella ne ricava «meno N% in M
    // minuti», cosi' la batteria si misura insieme al resto.
    private const val BATT_OGNI_MS = 5 * 60 * 1000L
    /** applicationContext: lo imposta il servizio all'avvio (serve solo a leggere la batteria). */
    @Volatile var contesto: android.content.Context? = null
    @Volatile private var ultimaBattMs = 0L
    @Volatile private var fixContati = 0

    private fun batteria(oraMs: Long) {
        if (ultimaBattMs != 0L && oraMs - ultimaBattMs < BATT_OGNI_MS) return
        val primo = ultimaBattMs == 0L
        ultimaBattMs = oraMs
        try {
            val bm = contesto?.getSystemService(android.content.Context.BATTERY_SERVICE) as? android.os.BatteryManager ?: return
            val livello = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
            val inCarica = if (android.os.Build.VERSION.SDK_INT >= 23) bm.isCharging else false
            scrivi("BATT livello=$livello carica=${if (inCarica) "si" else "no"} fix=${if (primo) 0 else fixContati}")
            fixContati = 0
        } catch (_: Exception) { /* la batteria non si legge: si salta la riga */ }
    }

    /** La traccia: una posizione ogni 4 secondi, solo in modalita' collaudo. */
    fun posizione(lat: Double, lon: Double, accM: Float) {
        if (!attivo()) return
        val ora = android.os.SystemClock.elapsedRealtime()
        fixContati++
        batteria(ora)
        if (ora - ultimaPosMs < POS_OGNI_MS) return
        ultimaPosMs = ora
        scrivi(String.format(Locale.US, "POS %.5f,%.5f acc=%d", lat, lon, accM.toInt()))
    }

    /** Il segno di chi collauda («qui ha sbagliato»), con la posizione se nota. */
    fun segno(testo: String, lat: Double?, lon: Double?) {
        val pulito = testo.replace('"', '\'').replace('\n', ' ').take(200)
        val dove = if (lat != null && lon != null && !lat.isNaN() && !lon.isNaN())
            String.format(Locale.US, " %.5f,%.5f", lat, lon) else ""
        scrivi("SEGNO \"$pulito\"$dove")
    }

    /** Tutto il registro (copia), dal piu' vecchio al piu' recente. */
    @Synchronized
    fun tutte(): List<String> {
        carica()
        return righe.toList()
    }

    /** Svuota memoria e disco (dopo un invio riuscito, o a mano dall'admin). */
    @Synchronized
    fun svuota() {
        righe.clear()
        caricato = true
        try { file()?.delete() } catch (_: Exception) { }
    }
}
