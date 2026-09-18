package com.itaintasca.app.service

import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.atan2

/**
 * NAVIGATORE A SCHERMO SPENTO — il "follower" nativo (18/09/2026).
 *
 * Ordine del committente: «il navigatore, sia nell'audioguida che nei percorsi,
 * deve funzionare anche a schermo spento. È fondamentale».
 *
 * Il perché: le svolte ("fra 100 metri gira a destra", "sei arrivato") le
 * calcola e le dice il JS nella WebView. A schermo spento la WebView viene
 * congelata e il navigatore tace, mentre il foreground service resta vivo e
 * continua a ricevere i fix GPS. Qui vive la parte che segue il percorso dal
 * lato nativo:
 *   - il JS CONSEGNA il percorso già pronto (manovre con testo GIÀ tradotto +
 *     tracciato): il nativo non traduce e non calcola percorsi;
 *   - finché il JS è vivo manda un BATTITO e parla LUI; se il battito manca da
 *     più di 12 s, parla il nativo;
 *   - il nativo tiene SEMPRE il conto delle manovre, anche quando tace: è
 *     quello che al passaggio di consegne evita ripetizioni e salti.
 *
 * Logica PURA: nessuna dipendenza Android (solo org.json), nessun orologio
 * interno — l'istante `nowMs` lo passa sempre chi chiama, e deve essere LO
 * STESSO orologio per plugin e servizio (si usa SystemClock.elapsedRealtime(),
 * monotono: un cambio d'ora o di fuso non fa "scadere" il battito).
 * Chi parla davvero è il servizio: onFix ritorna la frase, non la pronuncia.
 *
 * Lo stato vive in memoria, condiviso fra plugin (thread del bridge) e
 * servizio (main looper): ogni accesso è @Synchronized. Se il processo muore
 * il percorso si perde, va bene così (lo riconsegna il JS).
 *
 * L'algoritmo è IDENTICO a quello Swift (NavFollower in fondo a
 * BackgroundPoiManager.swift) e alla specifica docs/nav-nativo-spec.md:
 * se si tocca una costante qui, va toccata anche là.
 */
object NavFollower {

    // ── Costanti (le stesse della specifica, stessi nomi) ────────────────
    // 8 s e non 12 (dalla revisione): nei secondi fra il congelamento della
    // pagina e la scadenza del battito le svolte non le dice nessuno. Il JS
    // batte ogni 2-4 s: 8 s sono due battiti mancati, abbastanza per non
    // scambiare un ritardo per un congelamento.
    const val HEARTBEAT_STALE_MS = 8_000L
    const val NEAR_M = 30.0
    const val FAR_MIN_M = 50.0
    const val FAR_MAX_M = 150.0
    const val ARRIVE_M = 25.0
    const val LEAVE_STOP_M = 45.0
    const val PASSED_MARGIN_M = 15.0
    const val MISSED_MARGIN_M = 40.0
    const val SKIP_NEXT_M = 40.0
    const val MAX_ACC_M = 60.0
    const val OFFROUTE_M = 70.0
    const val OFFROUTE_MS = 20_000L
    const val BACK_ON_ROUTE_M = 40.0
    const val DEDUPE_MS = 20_000L

    private const val RAGGIO_TERRA_M = 6_371_000.0

    /** Una manovra consegnata dal JS: il testo è già nella lingua dell'utente. */
    private class Passo(
        val lat: Double, val lon: Double, val testo: String, val tipo: String,
        // (18/09/2026 notte) Campi del CRUSCOTTO, tutti opzionali ("" se
        // assenti): nome della meta della tratta e manovra OSRM grezza.
        val tappa: String = "", val manovraTipo: String = "", val manovraVerso: String = ""
    )

    /**
     * (18/09/2026 notte) Un ridisegno del cruscotto deciso dal follower: gli
     * STESSI campi di `updateNavBanner`, ricalcolati sul fix. `spegni=true` =
     * come `updateNavBanner` con `attivo:false` (gli altri campi sono vuoti).
     * Android oggi guarda titolo, corpo e inPausa; gli altri campi ci sono
     * perché la struttura è la stessa di iOS (Live Activity).
     */
    data class Cruscotto(
        val spegni: Boolean,
        val titolo: String = "",
        val corpo: String = "",
        val nomeTappa: String = "",
        val metriAllaTappa: Double = -1.0,
        val istruzione: String = "",
        val metriAllaSvolta: Double = -1.0,
        val metriRimanenti: Double = -1.0,
        val eta: String = "",
        val minutiRimanenti: Double = -1.0,
        val progresso: Double = -1.0,
        val manovraTipo: String = "",
        val manovraVerso: String = "",
        val inPausa: Boolean = false,
        val tappaCambiata: Boolean = false
    )

    /** Fotografia dello stato per getNavProgress (copie, non riferimenti vivi). */
    data class Progress(
        val attivo: Boolean,
        val id: String,
        val indice: Int,
        val dettiVicino: List<Int>,
        val dettiLontano: List<Int>,
        val nativoAlComando: Boolean,
        val ultimoTestoVicino: String,
        val ultimoTestoLontano: String
    )

    // ── Percorso ─────────────────────────────────────────────────────────
    private var passi: List<Passo> = emptyList()
    private var linea: List<DoubleArray> = emptyList() // [lat, lon]
    private var routeId = ""
    private var modelloLontano = ""
    private var fraseFuoriPercorso = ""
    private var finale = true

    // ── Stato del follower ───────────────────────────────────────────────
    private var idx = 0
    private var minDist = Double.POSITIVE_INFINITY
    private val dettiVicino = HashSet<Int>()
    private val dettiLontano = HashSet<Int>()
    // (18/09/2026 notte, dalla revisione) CONTATO ≠ DETTO. Gli insiemi qui
    // sopra sono la CONTABILITÀ: si riempiono anche quando il nativo tace
    // (JS vivo), e servono ad avanzare. Questi due dicono cosa è stato detto
    // DAVVERO — riferito dal battito del JS o pronunciato dal nativo. Senza
    // la distinzione: (a) una svolta raggiunta negli 8 s fra il congelamento
    // della pagina e la scadenza del battito risultava «detta» e non la
    // diceva nessuno; (b) quelle marche silenziose tornavano al JS con
    // getNavProgress e gli facevano saltare un annuncio a schermo ACCESO.
    private val dettiVicinoDavvero = HashSet<Int>()
    private val dettiLontanoDavvero = HashSet<Int>()
    private var finito = false
    private var lastHeartbeat = 0L
    private var fuoriDa = 0L
    private var fuoriDetto = false
    private var ultimoDetto = ""
    private var ultimoDettoTs = 0L
    private var ultimoTestoVicino = ""
    private var ultimoTestoLontano = ""

    // ── Cruscotto a schermo spento (18/09/2026 notte) ────────────────────
    private var resto = DoubleArray(0)
    private var restoTappa = DoubleArray(0)
    private var ultimaFirmaCruscotto = ""
    private var ultimoCruscottoTs = 0L
    /** L'arrivo finale l'ha appena detto il NATIVO: al prossimo `cruscotto` si spegne, una volta sola. */
    private var spegniDaDire = false
    /** Ultimo fix buono visto da onFix: serve al ridisegno immediato del tasto «pausa». */
    private var ultimaLat = Double.NaN
    private var ultimaLon = Double.NaN
    // L'ultimo stato del cruscotto mandato dal JS (updateNavBanner): solo i
    // campi che il follower non sa ricalcolare da solo. NON si azzera a
    // setRoute/clear — il banner del JS può arrivare prima del percorso — ma
    // solo quando il JS spegne il cruscotto (attivo:false).
    private var jsNomeTappa = ""
    private var jsIstruzione = ""
    private var jsMetriRimanenti = -1.0
    private var jsMinutiRimanenti = -1.0
    private var jsMetriTotali = -1.0

    /**
     * Sostituisce il percorso e azzera lo stato. Il battito si considera
     * FRESCO adesso: chi consegna il percorso è per forza un JS vivo.
     * false = JSON non valido o `passi` vuoto. In quel caso il percorso
     * PRECEDENTE si toglie comunque: chi consegna vuole sostituirlo, e un
     * nativo che a schermo spento detta le svolte di un percorso ormai
     * superato è peggio di un nativo che tace.
     */
    @Synchronized
    fun setRoute(routeJson: String, nowMs: Long): Boolean {
        val ok = caricaPercorso(routeJson, nowMs)
        if (!ok) clear()
        return ok
    }

    private fun caricaPercorso(routeJson: String, nowMs: Long): Boolean {
        val nuoviPassi = ArrayList<Passo>()
        val nuovaLinea = ArrayList<DoubleArray>()
        val root = try { JSONObject(routeJson) } catch (_: Exception) { return false }
        try {
            val arr = root.optJSONArray("passi") ?: return false
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: return false
                val lat = o.optDouble("lat", Double.NaN)
                val lon = o.optDouble("lon", Double.NaN)
                // Un passo senza coordinate non si può saltare: gli indici
                // devono restare GLI STESSI del JS (battito e insiemi "detti"
                // parlano per indice). Meglio rifiutare tutto il percorso.
                if (lat.isNaN() || lon.isNaN()) return false
                // isNull prima di optString: su Android un `null` JSON esce
                // da optString come la parola "null", e finirebbe detta a voce.
                val testo = if (o.isNull("testo")) "" else o.optString("testo", "").trim()
                nuoviPassi.add(
                    Passo(
                        lat, lon, testo, o.optString("tipo", "turn"),
                        tappa = testoOpzionale(o, "tappa"),
                        manovraTipo = testoOpzionale(o, "manovraTipo"),
                        manovraVerso = testoOpzionale(o, "manovraVerso")
                    )
                )
            }
            val l = root.optJSONArray("linea")
            if (l != null) {
                for (i in 0 until l.length()) {
                    val pt = l.optJSONArray(i) ?: continue
                    val lat = pt.optDouble(0, Double.NaN)
                    val lon = pt.optDouble(1, Double.NaN)
                    if (!lat.isNaN() && !lon.isNaN()) nuovaLinea.add(doubleArrayOf(lat, lon))
                }
            }
        } catch (_: Exception) {
            return false
        }
        if (nuoviPassi.isEmpty()) return false

        // (18/09/2026 notte) CRUSCOTTO: i metri che restano DOPO ogni passo si
        // contano una volta sola, alla consegna. resto[i] = da i alla fine;
        // restoTappa[i] = da i al primo 'arrive' con indice ≥ i (la meta della
        // tratta). A ogni fix basta aggiungere la distanza dal passo corrente.
        val n = nuoviPassi.size
        val nuovoResto = DoubleArray(n)
        val nuovoRestoTappa = DoubleArray(n)
        for (i in n - 2 downTo 0) {
            val a = nuoviPassi[i]
            val b = nuoviPassi[i + 1]
            val tratto = metri(a.lat, a.lon, b.lat, b.lon)
            nuovoResto[i] = tratto + nuovoResto[i + 1]
            nuovoRestoTappa[i] = if (a.tipo == "arrive") 0.0 else tratto + nuovoRestoTappa[i + 1]
        }
        resto = nuovoResto
        restoTappa = nuovoRestoTappa
        ultimaFirmaCruscotto = ""
        ultimoCruscottoTs = 0L
        spegniDaDire = false

        passi = nuoviPassi
        linea = nuovaLinea
        routeId = if (root.isNull("id")) "" else root.optString("id", "")
        modelloLontano = if (root.isNull("modelloLontano")) "" else root.optString("modelloLontano", "")
        fraseFuoriPercorso = if (root.isNull("fraseFuoriPercorso")) "" else root.optString("fraseFuoriPercorso", "")
        finale = root.optBoolean("finale", true)

        idx = root.optInt("indice", 0).coerceIn(0, nuoviPassi.size - 1)
        minDist = Double.POSITIVE_INFINITY
        dettiVicino.clear()
        dettiLontano.clear()
        dettiVicinoDavvero.clear()
        dettiLontanoDavvero.clear()
        finito = false
        inPausa = false
        lastHeartbeat = nowMs
        fuoriDa = 0L
        fuoriDetto = false
        ultimoDetto = ""
        ultimoDettoTs = 0L
        ultimoTestoVicino = ""
        ultimoTestoLontano = ""
        return true
    }

    /** Toglie il percorso. Il servizio, accorgendosene, torna alla cadenza GPS normale. */
    @Synchronized
    fun clear() {
        passi = emptyList()
        linea = emptyList()
        resto = DoubleArray(0)
        restoTappa = DoubleArray(0)
        ultimaFirmaCruscotto = ""
        ultimoCruscottoTs = 0L
        spegniDaDire = false
        routeId = ""
        idx = 0
        minDist = Double.POSITIVE_INFINITY
        dettiVicino.clear()
        dettiLontano.clear()
        dettiVicinoDavvero.clear()
        dettiLontanoDavvero.clear()
        finito = false
        inPausa = false
        fuoriDa = 0L
        fuoriDetto = false
        ultimoDetto = ""
        ultimoDettoTs = 0L
        ultimoTestoVicino = ""
        ultimoTestoLontano = ""
    }

    /**
     * I TASTI DELLA NOTIFICA A SCHERMO SPENTO (18/09/2026). «Pausa»,
     * «Termina» e «Riascolta» arrivano al servizio, che li inoltra al JS: ma a
     * schermo spento il JS è congelato e li vedrà solo al risveglio. Nel
     * frattempo chi parla è questo follower, quindi deve obbedire da solo.
     * Col JS vivo è innocuo: in pausa il JS ritira il percorso (clear azzera
     * anche la pausa) e alla ripresa lo riconsegna (setRoute la azzera).
     *  - pausa/riprendi: stesso tasto, quindi si alterna;
     *  - riascolta: ridà la manovra corrente, solo se il nativo è al comando.
     */
    private var inPausa = false

    @Synchronized
    fun alternaPausa() { if (passi.isNotEmpty()) inPausa = !inPausa }

    @Synchronized
    fun ripeti(nowMs: Long): String? {
        if (passi.isEmpty() || finito || inPausa) return null
        if ((nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS) return null // JS vivo: risponde lui
        val testo = passi[idx].testo
        return testo.ifEmpty { null }
    }

    /**
     * C'è un percorso da seguire? Lo legge il servizio per decidere la cadenza
     * dei fix: a percorso FINITO l'alta frequenza non serve più, quindi vale
     * come "nessun percorso" anche se il JS non ha ancora chiamato clear.
     */
    @Synchronized
    fun haPercorsoAttivo(): Boolean = passi.isNotEmpty() && !finito

    /**
     * Battito del JS: «sono vivo, parlo io, e sono arrivato fin qui».
     * Gli insiemi si UNISCONO (mai sostituiti: quello che il nativo ha già
     * contato resta); l'indice va solo in avanti. Senza percorso: no-op.
     */
    @Synchronized
    fun heartbeat(indice: Int, vicino: List<Int>, lontano: List<Int>, nowMs: Long) {
        val n = passi.size
        if (n == 0) return
        lastHeartbeat = nowMs
        // (18/09/2026 notte, dalla revisione) SE IL JS BATTE, NON È IN PAUSA:
        // in pausa il JS ritira il percorso e i battiti smettono. Una pausa
        // presa dal tasto a schermo spento può non arrivargli mai (App.tsx
        // scarta le azioni più vecchie di 60 s): senza questa riga restava
        // attiva qui, e al successivo schermo spento il navigatore taceva a
        // giro in corso. Firma azzerata: al prossimo congelamento il primo
        // ridisegno del cruscotto non va saltato perché «uguale a prima».
        inPausa = false
        ultimaFirmaCruscotto = ""
        // Quello che riferisce il JS è stato detto DAVVERO (da lui).
        for (i in vicino) if (i in 0 until n) { dettiVicino.add(i); dettiVicinoDavvero.add(i) }
        for (i in lontano) if (i in 0 until n) { dettiLontano.add(i); dettiLontanoDavvero.add(i) }
        if (indice > idx) {
            idx = min(indice, n - 1)
            minDist = Double.POSITIVE_INFINITY
        }
    }

    @Synchronized
    fun progress(nowMs: Long): Progress {
        val attivo = passi.isNotEmpty()
        return Progress(
            attivo = attivo,
            id = routeId,
            indice = idx,
            // Al JS si riferisce solo il DETTO DAVVERO, mai la contabilità muta.
            dettiVicino = dettiVicinoDavvero.sorted(),
            dettiLontano = dettiLontanoDavvero.sorted(),
            // Senza percorso nessuno è "al comando": false, non un battito scaduto.
            nativoAlComando = attivo && (nowMs - lastHeartbeat) >= HEARTBEAT_STALE_MS,
            ultimoTestoVicino = ultimoTestoVicino,
            ultimoTestoLontano = ultimoTestoLontano
        )
    }

    // ══ IL CRUSCOTTO A SCHERMO SPENTO (18/09/2026 notte) ═════════════════
    // Committente: «anche il monitor, il banner deve funzionare sul display
    // spento». Il cruscotto (notifica del foreground service) lo aggiorna il
    // JS con updateNavBanner: a schermo spento restava fermo all'ultimo stato
    // — «fra 200 m gira a destra» per venti minuti. Quando il nativo è al
    // comando lo ricalcola qui il follower, sul fix; il servizio lo ridisegna
    // per la stessa strada interna di updateNavBanner. Col JS vivo: mai.

    /**
     * Il plugin passa di qui ogni updateNavBanner del JS. Si tengono solo i
     * campi che servono da ripiego (nome tappa, istruzione) e quelli da cui
     * si ricava il passo dell'utente (minuti/metri) e l'avanzamento (totale).
     * In pausa il JS manda come istruzione la scritta «In pausa»: non è una
     * manovra, quindi l'ultima istruzione vera non si sovrascrive.
     */
    @Synchronized
    fun ricordaCruscottoJs(
        attivo: Boolean, inPausa: Boolean, nomeTappa: String, istruzione: String,
        metriRimanenti: Double, minutiRimanenti: Double, metriTotali: Double
    ) {
        if (!attivo) {
            jsNomeTappa = ""
            jsIstruzione = ""
            jsMetriRimanenti = -1.0
            jsMinutiRimanenti = -1.0
            jsMetriTotali = -1.0
            return
        }
        jsNomeTappa = nomeTappa.trim()
        if (!inPausa) jsIstruzione = istruzione.trim()
        jsMetriRimanenti = metriRimanenti
        jsMinutiRimanenti = minutiRimanenti
        jsMetriTotali = metriTotali
    }

    /**
     * Da chiamare SUBITO DOPO onFix, sullo stesso fix. Ritorna il cruscotto da
     * ridisegnare, o null se non c'è niente da fare: JS vivo, nessun percorso,
     * fix impreciso, meno di 3 s dall'ultimo ridisegno, firma invariata.
     * `oraMs` = orologio di muro (System.currentTimeMillis), serve solo a
     * scrivere l'ora d'arrivo; `nowMs` resta l'elapsedRealtime del battito.
     * Se onFix ha appena chiuso il percorso col nativo al comando, ritorna UNA
     * volta un Cruscotto con `spegni=true`.
     */
    @Synchronized
    fun cruscotto(lat: Double, lon: Double, accuracyM: Double, nowMs: Long, oraMs: Long): Cruscotto? {
        if (spegniDaDire) {
            spegniDaDire = false
            return Cruscotto(spegni = true)
        }
        if (accuracyM > MAX_ACC_M) return null
        return calcolaCruscotto(lat, lon, nowMs, oraMs, subito = false)
    }

    /**
     * Tasto «pausa»/«riprendi» a schermo spento: un ridisegno SUBITO con
     * `inPausa` aggiornato, senza aspettare il fix e senza i freni (3 s,
     * firma). Usa l'ultimo fix buono visto da onFix; null se non ce n'è
     * ancora uno, se il JS è vivo (ci pensa lui) o se non c'è percorso.
     */
    @Synchronized
    fun cruscottoSubito(nowMs: Long, oraMs: Long): Cruscotto? {
        if (ultimaLat.isNaN() || ultimaLon.isNaN()) return null
        return calcolaCruscotto(ultimaLat, ultimaLon, nowMs, oraMs, subito = true)
    }

    private fun calcolaCruscotto(lat: Double, lon: Double, nowMs: Long, oraMs: Long, subito: Boolean): Cruscotto? {
        val n = passi.size
        if (n == 0 || finito) return null
        if ((nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS) return null // JS vivo: il cruscotto è suo
        if (!subito && ultimoCruscottoTs != 0L && nowMs - ultimoCruscottoTs < 3000L) return null
        if (idx >= resto.size || idx >= restoTappa.size) return null

        val p = passi[idx]
        val d = metri(lat, lon, p.lat, p.lon)
        val rimTappa = d + restoTappa[idx]
        val rimTotale = d + resto[idx]

        var nomeTappa = ""
        for (k in idx until n) {
            if (passi[k].tipo == "arrive") { nomeTappa = passi[k].tappa; break }
        }
        if (nomeTappa.isEmpty()) nomeTappa = jsNomeTappa
        val istruzione = if (p.testo.isNotEmpty()) p.testo else jsIstruzione

        // Firma anti-raffica, la stessa del JS: sotto i 100 m scatta ogni 10 m.
        val scatto = if (d < 100.0) (d / 10.0).roundToInt() else 100 + (d / 50.0).roundToInt()
        val firma = "$nomeTappa|$istruzione|$scatto|${(rimTotale / 100.0).roundToInt()}|${if (inPausa) "P" else ""}"
        if (!subito && firma == ultimaFirmaCruscotto) return null
        ultimaFirmaCruscotto = firma
        ultimoCruscottoTs = nowMs

        // Il passo dell'utente lo dice l'ultimo stato del JS (minuti/metri);
        // senza, 75 m al minuto (a piedi).
        val passoMin = if (jsMinutiRimanenti > 0.0 && jsMetriRimanenti > 0.0)
            jsMinutiRimanenti / jsMetriRimanenti else 1.0 / 75.0
        val minuti = rimTotale * passoMin
        // Ora LOCALE del telefono, "HH:mm" (Locale.ROOT: cifre sempre 0-9).
        val eta = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT)
            .format(java.util.Date(oraMs + (minuti * 60_000.0).toLong()))
        val progresso = if (jsMetriTotali > 1.0) (1.0 - rimTotale / jsMetriTotali).coerceIn(0.0, 1.0) else -1.0

        val titolo = if (nomeTappa.isEmpty()) distTesto(rimTappa) else "$nomeTappa · ${distTesto(rimTappa)}"
        // Senza istruzione (né dal passo né dal JS) niente " · " orfano in testa.
        val corpo = (if (istruzione.isEmpty()) distTesto(d) else "$istruzione · ${distTesto(d)}") + "\n~$eta"
        return Cruscotto(
            spegni = false,
            titolo = titolo,
            corpo = corpo,
            nomeTappa = nomeTappa,
            metriAllaTappa = rimTappa,
            istruzione = istruzione,
            metriAllaSvolta = d,
            metriRimanenti = rimTotale,
            eta = eta,
            minutiRimanenti = minuti,
            progresso = progresso,
            manovraTipo = p.manovraTipo,
            manovraVerso = p.manovraVerso,
            inPausa = inPausa,
            // (dalla revisione) La tappa è cambiata rispetto all'ultimo stato
            // del JS: la foto che il servizio ricorda è quella della tappa
            // PRECEDENTE. «Nessuna foto è meglio della foto sbagliata».
            tappaCambiata = nomeTappa.isNotBlank() && jsNomeTappa.isNotBlank() &&
                nomeTappa.trim() != jsNomeTappa.trim()
        )
    }

    /** Sotto il km: metri alla decina. Sopra: km con un decimale (punto, come il JS). */
    private fun distTesto(x: Double): String =
        if (x < 1000.0) "${(x / 10.0).roundToInt() * 10} m"
        else String.format(java.util.Locale.ROOT, "%.1f km", x / 1000.0)

    /** Campo stringa opzionale: assente o `null` JSON → "" (mai la parola "null"). */
    private fun testoOpzionale(o: JSONObject, chiave: String): String =
        if (o.isNull(chiave)) "" else o.optString(chiave, "").trim()

    /**
     * Un fix GPS. Ritorna la frase che il servizio deve DIRE, o null.
     * Indice e insiemi si aggiornano SEMPRE, anche col JS vivo (si tace ma si
     * tiene il conto). Al massimo UNA frase per fix.
     */
    @Synchronized
    fun onFix(lat: Double, lon: Double, accuracyM: Double, nowMs: Long): String? {
        val n = passi.size
        // L'ultimo fix buono si ricorda anche in pausa: serve al ridisegno
        // immediato del cruscotto quando si tocca «pausa»/«riprendi».
        if (n > 0 && accuracyM <= MAX_ACC_M) { ultimaLat = lat; ultimaLon = lon }
        if (n == 0 || finito || inPausa) return null
        if (accuracyM > MAX_ACC_M) return null
        val jsVivo = (nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS

        var out: String? = null
        var tipoOut = ""
        var testoOut = "" // il `testo` del passo che ha generato `out`

        var giri = 0
        while (giri < n) {
            giri++
            val p = passi[idx]
            // LA PARTENZA SI SALTA SEMPRE (come tourService.aggiornaPasso, che
            // lo step 0 non lo guarda mai): ha testo vuoto e sta nel punto da
            // cui si e` gia` partiti. Tenerla come «prossima manovra» bloccava
            // l'indice quando si comincia lontani dall'inizio del tracciato, e
            // le prime svolte non venivano preannunciate.
            if (p.tipo == "depart" && idx + 1 < n) {
                dettiVicino.add(idx)
                dettiLontano.add(idx)
                avanza(); continue
            }
            val d = metri(lat, lon, p.lat, p.lon)
            if (idx + 1 < n) {
                val pn = passi[idx + 1]
                val dn = metri(lat, lon, pn.lat, pn.lon)
                if (dn < d && dn < SKIP_NEXT_M) { avanza(); continue }
            }
            minDist = min(minDist, d)

            if (p.tipo == "arrive") {
                // Da dire se mai contato, OPPURE contato in silenzio (JS creduto
                // vivo) e ora il nativo è al comando senza che nessuno l'abbia detto.
                if (d <= ARRIVE_M && (!dettiVicino.contains(idx) || (!jsVivo && !dettiVicinoDavvero.contains(idx)))) {
                    dettiVicino.add(idx)
                    if (!jsVivo) {
                        dettiVicinoDavvero.add(idx)
                        if (p.testo.isNotEmpty()) { out = p.testo; tipoOut = "vicino"; testoOut = p.testo }
                    }
                }
                if (dettiVicino.contains(idx) && idx == n - 1 && finale) {
                    // Arrivo finale: si CHIUDE solo col nativo al comando
                    // (cruscotto spento una volta sola, vedi cruscotto()). Col
                    // JS vivo non si chiude qui: arriva lui e ritira il
                    // percorso; se invece si è appena congelato, al primo fix
                    // col battito scaduto l'arrivo lo dice e lo chiude il nativo.
                    if (!jsVivo) { spegniDaDire = true; finito = true }
                } else if (dettiVicino.contains(idx) && d > LEAVE_STOP_M && idx + 1 < n) {
                    avanza(); continue
                } else if (!dettiVicino.contains(idx) && idx + 1 < n &&
                    minDist < 60.0 && d > minDist + MISSED_MARGIN_M
                ) {
                    // (18/09/2026 notte, dalla revisione) TAPPA SFIORATA. La
                    // guida parte dal geofence a 30-50 m dal perimetro: chi
                    // ascolta da lì e riparte non entra mai nei 25 m del punto
                    // OSRM, e l'indice restava sull'arrivo per tutto il resto
                    // del giro (svolte mute, cruscotto fermo su «Sei arrivato»).
                    // Stessa regola della manovra mancata: ci si è avvicinati
                    // (< 60 m) e ora ci si allontana → tappa fatta, senza dirla.
                    dettiVicino.add(idx)
                    avanza(); continue
                }
                break
            }

            if (d <= NEAR_M && (!dettiVicino.contains(idx) || (!jsVivo && !dettiVicinoDavvero.contains(idx)))) {
                dettiVicino.add(idx)
                dettiLontano.add(idx)
                if (!jsVivo) {
                    dettiVicinoDavvero.add(idx)
                    dettiLontanoDavvero.add(idx)
                    if (p.testo.isNotEmpty()) { out = p.testo; tipoOut = "vicino"; testoOut = p.testo }
                }
            } else if (dettiVicino.contains(idx) && d > minDist + maxOf(PASSED_MARGIN_M, accuracyM)) {
                // Margine non sotto l'accuratezza del fix: da fermi a 25 m
                // dalla svolta il rumore GPS bastava a «superarla» prima di farla.
                avanza(); continue
            } else if (!dettiVicino.contains(idx) && minDist < 60.0 && d > minDist + MISSED_MARGIN_M) {
                avanza(); continue
            } else if (p.tipo == "turn" && !dettiLontano.contains(idx) &&
                d >= FAR_MIN_M && d <= FAR_MAX_M && p.testo.isNotEmpty()
            ) {
                dettiLontano.add(idx)
                if (!jsVivo) {
                    dettiLontanoDavvero.add(idx)
                    out = fraseLontana(d, p.testo)
                    tipoOut = "lontano"
                    testoOut = p.testo
                }
            }
            break
        }

        // FUORI PERCORSO — solo se il nativo è al comando e non ha altro da dire.
        if (!jsVivo && out == null && linea.size >= 2) {
            val dl = distanzaDallaLinea(lat, lon)
            if (dl > OFFROUTE_M + accuracyM / 2.0) {
                if (fuoriDa == 0L) {
                    fuoriDa = nowMs
                } else if (nowMs - fuoriDa > OFFROUTE_MS && !fuoriDetto) {
                    fuoriDetto = true
                    if (fraseFuoriPercorso.isNotBlank()) out = fraseFuoriPercorso
                }
            } else if (dl < BACK_ON_ROUTE_M) {
                fuoriDa = 0L
                fuoriDetto = false
            }
        }

        val frase = out ?: return null
        if (jsVivo) return null
        // Doppione = stessa frase PER LA STESSA manovra: due svolte diverse con
        // lo stesso testo («Gira a destra», poi di nuovo) vanno dette entrambe.
        val chiaveDetto = "$idx|$frase"
        if (chiaveDetto == ultimoDetto && nowMs - ultimoDettoTs <= DEDUPE_MS) return null
        ultimoDetto = chiaveDetto
        ultimoDettoTs = nowMs
        if (tipoOut == "vicino") ultimoTestoVicino = testoOut
        else if (tipoOut == "lontano") ultimoTestoLontano = testoOut
        return frase
    }

    /** Manovra successiva, mai oltre l'ultima. Il minimo riparte da capo. */
    private fun avanza() {
        if (idx < passi.size - 1) idx += 1
        minDist = Double.POSITIVE_INFINITY
    }

    /**
     * "Tra {m} metri, {i}": {m} arrotondato alla decina (minimo 10), {i} = il
     * testo della manovra con la PRIMA lettera minuscola. Il modello arriva
     * già tradotto dal JS; se manca si dice la manovra nuda invece di tacere.
     */
    private fun fraseLontana(d: Double, testo: String): String {
        if (modelloLontano.isBlank()) return testo
        val m = ((d / 10.0).roundToInt() * 10).coerceAtLeast(10)
        val i = testo.substring(0, 1).lowercase() + testo.substring(1)
        return modelloLontano.replace("{m}", m.toString()).replace("{i}", i)
    }

    /** Haversine, in metri. */
    private fun metri(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2) * sin(dLon / 2)
        return RAGGIO_TERRA_M * 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
    }

    /**
     * Distanza minima punto→polilinea, per proiezione sui SEGMENTI (non sui
     * vertici: su un rettilineo lungo i vertici sono lontani anche quando si
     * cammina esattamente sulla linea). Piano locale equirettangolare con
     * l'origine nel punto: a queste scale (decine-centinaia di metri)
     * l'errore è trascurabile. Tracciato ≤ 400 punti: costo irrisorio per fix.
     */
    private fun distanzaDallaLinea(lat: Double, lon: Double): Double {
        val kx = Math.toRadians(1.0) * RAGGIO_TERRA_M * cos(Math.toRadians(lat))
        val ky = Math.toRadians(1.0) * RAGGIO_TERRA_M
        var best = Double.POSITIVE_INFINITY
        var ax = (linea[0][1] - lon) * kx
        var ay = (linea[0][0] - lat) * ky
        for (k in 1 until linea.size) {
            val bx = (linea[k][1] - lon) * kx
            val by = (linea[k][0] - lat) * ky
            val dx = bx - ax
            val dy = by - ay
            val len2 = dx * dx + dy * dy
            // Proiezione dell'origine (il punto) sul segmento A→B, bloccata in [0,1].
            val t = if (len2 <= 0.0) 0.0 else (-(ax * dx + ay * dy) / len2).coerceIn(0.0, 1.0)
            val px = ax + t * dx
            val py = ay + t * dy
            val dist = sqrt(px * px + py * py)
            if (dist < best) best = dist
            ax = bx
            ay = by
        }
        return best
    }
}
