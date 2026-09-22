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
    // (21/09/2026, REVISIONE 2) ARRIVO FINALE NEI PARAGGI: entro 60 m
    // ininterrottamente da 45 s — la regola 3 del JS. Solo i 25 m non
    // bastavano: chi entrava da un altro lato, o col GPS in tasca a 30-50 m,
    // non chiudeva mai (GPS al massimo e cruscotto acceso fino all'app).
    const val NEARBY_M = 60.0
    const val NEARBY_MS = 45_000L
    // (21/09/2026, REVISIONE 2) FUORI PERCORSO RIDETTO: se si è ancora fuori
    // 60 s dopo l'ultima volta si ridice, al massimo 2 ripetizioni per uscita.
    // Detto una volta sola, un avviso finito in coda dietro a una guida (e
    // scaduto) non tornava più finché non si rientrava.
    const val OFFROUTE_RIPETI_MS = 60_000L
    const val OFFROUTE_MAX_RIPETIZIONI = 2
    // (21/09/2026, REVISIONE 2) «Nei paraggi» vale solo se ininterrotto: un
    // buco di fix più lungo di così ricomincia il conto dei 45 s.
    const val NEARBY_BUCO_MS = 15_000L
    // (21/09/2026, REVISIONE 2) PROGRESSIONE SUL TRACCIATO: se chi cammina
    // (entro PROGRESS_CROSS_M + accuratezza/2 dalla linea) è già oltre il passo
    // corrente di più di PROGRESS_M lungo il tracciato, i passi rimasti alle
    // spalle si contano in silenzio. È la regola del JS («salto per
    // progressione»): senza, dopo una pausa (GPS a riposo) o un buco di fix
    // il follower restava indietro, muto per il resto del percorso.
    const val PROGRESS_M = 40.0
    const val PROGRESS_PASSATO_M = 25.0
    const val PROGRESS_CROSS_M = 25.0
    const val PROGRESS_FINESTRA_M = 2_000.0
    // (21/09/2026, REVISIONE 2) Partenza da un indirizzo lontano: il «fuori
    // percorso» vale solo dopo essere arrivati entro questa distanza dal
    // tracciato (la stessa regola del JS).
    const val AGGANCIO_M = 60.0
    // (22/09/2026) Il preavviso «Tra N metri» si dice solo AVVICINANDOSI:
    // almeno questi metri in meno rispetto alla distanza di riferimento.
    // Chi ripartiva da una tappa dalla parte sbagliata sentiva «Tra 80
    // metri, gira a sinistra» mentre se ne allontanava.
    const val AVVICINA_M = 3.0

    private const val RAGGIO_TERRA_M = 6_371_000.0

    /** Una manovra consegnata dal JS: il testo è già nella lingua dell'utente. */
    private class Passo(
        val lat: Double, val lon: Double, val testo: String, val tipo: String,
        // (18/09/2026 notte) Campi del CRUSCOTTO, tutti opzionali ("" se
        // assenti): nome della meta della tratta e manovra OSRM grezza.
        val tappa: String = "", val manovraTipo: String = "", val manovraVerso: String = "",
        // (22/09/2026) Metri LUNGO IL PERCORSO fino al passo seguente (OSRM
        // step.distance), opzionale: NaN = assente, si usa la linea d'aria.
        val metriDopo: Double = Double.NaN
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
        val ultimoTestoLontano: String,
        // (21/09/2026, REVISIONE 2) `finito`: l'arrivo finale l'ha chiuso il
        // nativo a schermo spento — al risveglio il JS deve chiudere anche lui,
        // senza ridirlo (prima ricalcolava verso la meta già raggiunta).
        // `terminato`: il follower l'ha svuotato il tasto «Termina» del
        // cruscotto; i campi sopra sono la fotografia presa prima (vedi
        // terminaDalBanner).
        val finito: Boolean = false,
        val terminato: Boolean = false
    )

    // ── Percorso ─────────────────────────────────────────────────────────
    private var passi: List<Passo> = emptyList()
    private var linea: List<DoubleArray> = emptyList() // [lat, lon]
    private var routeId = ""
    private var modelloLontano = ""
    private var fraseFuoriPercorso = ""
    private var finale = true
    // (21/09/2026, REVISIONE 2) All'arrivo finale col nativo al comando il
    // cruscotto si spegne SOLO se true (default). La tappa singola manda
    // false quando c'è un giro/percorso in corso: il cruscotto dopo è del giro.
    private var spegniCruscotto = true
    // (21/09/2026, REVISIONE 2) Metri progressivi lungo il tracciato: dei suoi
    // vertici, e di ogni passo proiettato sul tracciato (NaN se il passo sta
    // a più di 50 m dalla linea: lì la progressione non si usa).
    private var lineaCum = DoubleArray(0)
    private var alongPasso = DoubleArray(0)
    // (21/09/2026, REVISIONE 2) `fuoriSoloDopoAggancio` del routeJson: il
    // «fuori percorso» tace finché non si è arrivati sul tracciato.
    private var fuoriDopoAggancio = false
    private var agganciato = true

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
    // (21/09/2026, REVISIONE 2) Quando il «fuori percorso» è stato detto
    // l'ultima volta e quante volte è stato RIDETTO in questa uscita.
    private var fuoriDettoTs = 0L
    private var fuoriRipetizioni = 0
    // (21/09/2026, REVISIONE 2) Da quando si è entro NEARBY_M dall'arrivo
    // FINALE (0 = non lo si è). Si azzera in ogni reset.
    private var vicinoFinaleDa = 0L
    private var ultimoFixFinaleTs = 0L
    private var ultimoDetto = ""
    private var ultimoDettoTs = 0L
    private var ultimoTestoVicino = ""
    private var ultimoTestoLontano = ""
    // (21/09/2026, REVISIONE 2) Il passo che il JS stava MOSTRANDO: lo
    // impostano setRoute e OGNI battito, lo azzera clear. Serve al cruscotto
    // per sapere se l'istruzione e il nome ricordati dal JS valgono ancora.
    private var idxJs = 0
    // (22/09/2026) AVVICINAMENTO al passo corrente, per il preavviso
    // «lontano»: distanza di riferimento e passo a cui si riferisce (-1 =
    // nessun valore → non si dice ancora). Si aggiorna solo sui fix buoni.
    private var dPrec = 0.0
    private var dPrecIdx = -1
    // (21/09/2026, REVISIONE 2) FOTOGRAFIA di «Termina» dal cruscotto: id,
    // indice e insiemi «davvero» presi un istante prima dello svuotamento.
    // Se al risveglio il JS chiede conferma e l'utente dice «no», riprende
    // prima il progresso fatto a schermo spento, poi riconsegna. La
    // cancellano setRoute, il clear del JS e il load() del plugin.
    private var fotoTerminato: Progress? = null

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
                // (22/09/2026) `metriDopo` vale solo se è un numero finito > 0
                // (assente, null JSON, testo, 0 o negativo = linea d'aria).
                val md = o.optDouble("metriDopo", Double.NaN)
                nuoviPassi.add(
                    Passo(
                        lat, lon, testo, o.optString("tipo", "turn"),
                        tappa = testoOpzionale(o, "tappa"),
                        manovraTipo = testoOpzionale(o, "manovraTipo"),
                        manovraVerso = testoOpzionale(o, "manovraVerso"),
                        metriDopo = if (!md.isNaN() && !md.isInfinite() && md > 0.0) md else Double.NaN
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
            // (22/09/2026) Con `metriDopo` i metri veri lungo il percorso: la
            // linea d'aria fra due manovre di una mulattiera a tornanti dava
            // «350 m, ~5 min, 77%» quando ne mancavano 1,5 km.
            val tratto = if (!a.metriDopo.isNaN()) a.metriDopo else metri(a.lat, a.lon, b.lat, b.lon)
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
        // (21/09/2026, REVISIONE 2) Progressivi per la regola di progressione.
        val cum = DoubleArray(nuovaLinea.size)
        for (k in 1 until nuovaLinea.size) {
            cum[k] = cum[k - 1] + metri(nuovaLinea[k - 1][0], nuovaLinea[k - 1][1], nuovaLinea[k][0], nuovaLinea[k][1])
        }
        lineaCum = cum
        alongPasso = DoubleArray(n) { i -> alongDelPunto(nuoviPassi[i].lat, nuoviPassi[i].lon) }
        routeId = if (root.isNull("id")) "" else root.optString("id", "")
        modelloLontano = if (root.isNull("modelloLontano")) "" else root.optString("modelloLontano", "")
        fraseFuoriPercorso = if (root.isNull("fraseFuoriPercorso")) "" else root.optString("fraseFuoriPercorso", "")
        finale = root.optBoolean("finale", true)
        // (21/09/2026, REVISIONE 2) Campi opzionali: assenti = come prima.
        spegniCruscotto = root.optBoolean("spegniCruscotto", true)
        fuoriDopoAggancio = root.optBoolean("fuoriSoloDopoAggancio", false)
        agganciato = !fuoriDopoAggancio

        idx = root.optInt("indice", 0).coerceIn(0, nuoviPassi.size - 1)
        idxJs = idx
        dPrecIdx = -1
        minDist = Double.POSITIVE_INFINITY
        dettiVicino.clear()
        dettiLontano.clear()
        dettiVicinoDavvero.clear()
        dettiLontanoDavvero.clear()
        finito = false
        // (21/09/2026, REVISIONE 2) Il follower può NASCERE in pausa: in pausa
        // MANUALE il JS non ritira più il percorso (il follower vuoto non
        // poteva obbedire a «Riprendi» dalla lock screen), lo riconsegna con
        // inPausa:true.
        inPausa = root.optBoolean("inPausa", false)
        lastHeartbeat = nowMs
        fuoriDa = 0L
        fuoriDetto = false
        fuoriDettoTs = 0L
        fuoriRipetizioni = 0
        vicinoFinaleDa = 0L
        ultimoFixFinaleTs = 0L
        fotoTerminato = null
        ultimoDetto = ""
        ultimoDettoTs = 0L
        ultimoTestoVicino = ""
        ultimoTestoLontano = ""
        return true
    }

    /**
     * Toglie il percorso. Il servizio, accorgendosene, torna alla cadenza GPS
     * normale. È il clear del JS (clearNavRoute), del load() del plugin e di
     * una consegna rifiutata: butta anche la fotografia di «Termina».
     */
    @Synchronized
    fun clear() {
        azzera()
        fotoTerminato = null
    }

    /**
     * (21/09/2026, REVISIONE 2) Il tasto «Termina» del cruscotto: prima una
     * FOTOGRAFIA di id, indice e insiemi «davvero», poi il follower si svuota
     * come con clear. Finché non arrivano setRoute, il clear del JS o il
     * load() del plugin, getNavProgress restituisce la fotografia con
     * attivo=false e terminato=true: al «Termina» in ritardo seguito da «no»
     * il JS riprende il progresso fatto a schermo spento prima di riconsegnare
     * (prima riconsegnava dall'indice vecchio, verso tappe già visitate).
     * Senza percorso non si fotografa niente (un secondo tocco non cancella
     * la fotografia del primo).
     */
    @Synchronized
    fun terminaDalBanner() {
        val foto = if (passi.isNotEmpty()) Progress(
            attivo = false,
            id = routeId,
            indice = idx,
            dettiVicino = dettiVicinoDavvero.sorted(),
            dettiLontano = dettiLontanoDavvero.sorted(),
            nativoAlComando = false,
            // Lo stato di QUEL momento (come iOS): `finito` conta — la tappa
            // singola chiusa a schermo spento e poi «Termina» non deve farsi
            // ricalcolare al risveglio verso la meta già raggiunta.
            ultimoTestoVicino = ultimoTestoVicino,
            ultimoTestoLontano = ultimoTestoLontano,
            finito = finito,
            terminato = true
        ) else fotoTerminato
        azzera()
        fotoTerminato = foto
    }

    private fun azzera() {
        passi = emptyList()
        linea = emptyList()
        lineaCum = DoubleArray(0)
        alongPasso = DoubleArray(0)
        fuoriDopoAggancio = false
        agganciato = true
        ultimoFixFinaleTs = 0L
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
        spegniCruscotto = true
        idxJs = 0
        dPrecIdx = -1
        fuoriDa = 0L
        fuoriDetto = false
        fuoriDettoTs = 0L
        fuoriRipetizioni = 0
        vicinoFinaleDa = 0L
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
     * (21/09/2026, REVISIONE 2) In pausa MANUALE il JS non ritira più il
     * percorso: lo tiene qui IN PAUSA (routeJson/battito `inPausa`).
     *  - pausa / riprendi: azioni ESPLICITE e idempotenti, mai un'alternanza.
     *    L'interruttore invertiva lo stato del follower e non quello mostrato:
     *    durante la pausa AUTOMATICA del giro (ferma da 3 min, percorso non
     *    ritirato) «Riprendi» metteva in pausa il follower, che taceva;
     *  - riascolta: ridà la manovra corrente, solo se il nativo è al comando.
     */
    private var inPausa = false

    /** Pausa esplicita. true = lo stato è cambiato (il GPS va riadeguato). */
    @Synchronized
    fun impostaPausa(v: Boolean): Boolean {
        if (passi.isEmpty() || inPausa == v) return false
        inPausa = v
        return true
    }

    @Synchronized
    fun ripeti(nowMs: Long): String? {
        if (passi.isEmpty() || finito || inPausa) return null
        if ((nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS) return null // JS vivo: risponde lui
        val p = passi[idx]
        // (21/09/2026, REVISIONE 2) Su un arrivo NON ancora raggiunto il suo
        // testo è «Sei arrivato a X»: detto a 300 m dalla meta inganna chi
        // cammina. Meglio niente (l'azione va al JS, se è vivo).
        if (p.tipo == "arrive" && !dettiVicino.contains(idx)) return null
        return p.testo.ifEmpty { null }
    }

    /**
     * C'è un percorso da seguire? Lo legge il servizio per decidere la cadenza
     * dei fix: a percorso FINITO l'alta frequenza non serve più, quindi vale
     * come "nessun percorso" anche se il JS non ha ancora chiamato clear.
     * (21/09/2026, REVISIONE 2) Nemmeno IN PAUSA: per tutto il pranzo il GPS
     * restava a HIGH_ACCURACY ogni 2 s. In pausa il follower tace; i fix a
     * riposo spesso non bastano a contare, e alla ripresa si rimette in pari
     * per PROGRESSIONE sul tracciato (vedi onFix).
     */
    @Synchronized
    fun haPercorsoAttivo(): Boolean = passi.isNotEmpty() && !finito && !inPausa

    /**
     * Battito del JS: «sono vivo, parlo io, e sono arrivato fin qui».
     * Gli insiemi si UNISCONO (mai sostituiti: quello che il nativo ha già
     * contato resta); l'indice va solo in avanti. Senza percorso: no-op.
     * Ritorna true se la pausa è cambiata (il servizio riadegua il GPS).
     */
    @Synchronized
    fun heartbeat(indice: Int, vicino: List<Int>, lontano: List<Int>, nowMs: Long, pausaJs: Boolean = false): Boolean {
        val n = passi.size
        if (n == 0) return false
        lastHeartbeat = nowMs
        // (21/09/2026, REVISIONE 2) IL BATTITO PORTA LA PAUSA DEL JS (assente
        // = false), al posto di «il battito toglie la pausa» del 18/09: in
        // pausa manuale il percorso ora resta qui e il JS vivo continua a
        // battere, con inPausa:true. Firma azzerata: al prossimo congelamento
        // il primo ridisegno del cruscotto non va saltato perché «uguale a prima».
        val cambiata = inPausa != pausaJs
        inPausa = pausaJs
        ultimaFirmaCruscotto = ""
        // (21/09/2026, REVISIONE 2) Col JS vivo il fuori percorso è compito
        // suo: il conto del nativo riparte da zero al prossimo congelamento
        // (prima una nuova uscita ereditava le ripetizioni di quella vecchia).
        fuoriDa = 0L
        fuoriDetto = false
        fuoriDettoTs = 0L
        fuoriRipetizioni = 0
        // Il passo che il JS sta mostrando, anche se non è avanti al nostro.
        if (indice >= 0) idxJs = min(indice, n - 1)
        // Quello che riferisce il JS è stato detto DAVVERO (da lui).
        for (i in vicino) if (i in 0 until n) { dettiVicino.add(i); dettiVicinoDavvero.add(i) }
        for (i in lontano) if (i in 0 until n) { dettiLontano.add(i); dettiLontanoDavvero.add(i) }
        if (indice > idx) {
            idx = min(indice, n - 1)
            minDist = Double.POSITIVE_INFINITY
        }
        return cambiata
    }

    @Synchronized
    fun progress(nowMs: Long): Progress {
        val attivo = passi.isNotEmpty()
        // (21/09/2026, REVISIONE 2) Svuotato da «Termina» sul cruscotto: la
        // fotografia presa prima, con attivo=false e terminato=true.
        if (!attivo) fotoTerminato?.let { return it }
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
            ultimoTestoLontano = ultimoTestoLontano,
            finito = finito,
            terminato = false
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
        // (21/09/2026, REVISIONE 2) In pausa il cruscotto non si ridisegna a
        // ogni fix: resta quello «In pausa» del JS. Solo il ridisegno immediato
        // di un tasto (pausa/riprendi) passa.
        if (inPausa && !subito) return null
        if (!subito && ultimoCruscottoTs != 0L && nowMs - ultimoCruscottoTs < 3000L) return null
        if (idx >= resto.size || idx >= restoTappa.size) return null

        val p = passi[idx]
        val d = metri(lat, lon, p.lat, p.lon)
        val rimTappa = d + restoTappa[idx]
        val rimTotale = d + resto[idx]

        var nomeTappaPasso = ""
        for (k in idx until n) {
            if (passi[k].tipo == "arrive") { nomeTappaPasso = passi[k].tappa; break }
        }
        // (21/09/2026, REVISIONE 2) L'ultimo stato del JS vale solo per il
        // passo che il JS stava mostrando. Se fra quel passo e il nostro c'è un
        // arrivo, la tappa è un'altra: niente nome né istruzione di ripiego
        // (mostravano una svolta di una tratta prima, o il nome e la foto di
        // una tappa già visitata sulla tratta di rientro). Un'istruzione senza
        // testo più avanti del JS resta vuota: restano metri e nome.
        val arrivoSuperato = (idxJs until idx).any { it in 0 until n && passi[it].tipo == "arrive" }
        var nomeTappa = nomeTappaPasso
        if (nomeTappa.isEmpty() && !arrivoSuperato) nomeTappa = jsNomeTappa
        val istruzione = when {
            p.testo.isNotEmpty() -> p.testo
            idx <= idxJs -> jsIstruzione
            else -> ""
        }

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
            // (21/09/2026, REVISIONE 2) Anche con un arrivo superato, e il
            // confronto sul nome DEL PASSO, prima del ripiego sul JS (dopo il
            // ripiego i due nomi coincidevano sempre).
            tappaCambiata = arrivoSuperato || (nomeTappaPasso.isNotBlank() && jsNomeTappa.isNotBlank() &&
                nomeTappaPasso.trim() != jsNomeTappa.trim())
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
        if (n == 0 || finito) return null
        if (accuracyM > MAX_ACC_M) return null
        // (21/09/2026, REVISIONE 2) IN PAUSA SI TACE MA SI TIENE IL CONTO,
        // come col JS vivo: niente frasi, niente «davvero», niente `finito`,
        // niente fuori percorso. Prima in pausa onFix usciva subito: chi
        // camminava in pausa oltre due svolte, alla ripresa sentiva una svolta
        // già alle spalle e poi più niente (l'indice restava indietro).
        val jsVivo = (nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS || inPausa

        // (21/09/2026, REVISIONE 2) PROGRESSIONE SUL TRACCIATO. Se si è già
        // oltre il passo corrente di più di PROGRESS_M lungo la linea (e sulla
        // linea), i passi alle spalle si contano in silenzio: dopo una pausa
        // col GPS a riposo, o un buco di fix, le regole a linea d'aria qui
        // sotto non li vedono più e il follower restava indietro e muto.
        // Si prende la PRIMA corrispondenza lungo la linea, cominciando 300 m
        // PRIMA del passo (mai la più vicina): su un anello l'arrivo coincide
        // con la partenza, e su un «andata e ritorno» per la stessa strada il
        // ritorno passa di fianco a chi sta ancora andando — in entrambi i
        // casi la corrispondenza più indietro vince e non si salta niente.
        // Mai oltre un arrivo finché si è alla tappa (la visita), mai oltre
        // l'ultimo passo.
        if (linea.size >= 2 && idx < n - 1 && idx < alongPasso.size) {
            val aIdx = alongPasso[idx]
            if (!aIdx.isNaN()) {
                val u = alongUtente(lat, lon, aIdx - 300.0, aIdx + PROGRESS_FINESTRA_M, PROGRESS_CROSS_M + accuracyM / 2.0)
                if (!u.isNaN() && u > aIdx + PROGRESS_M) {
                    while (idx < n - 1) {
                        val a = alongPasso[idx]
                        if (a.isNaN() || a + PROGRESS_PASSATO_M >= u) break
                        val pp = passi[idx]
                        if (pp.tipo == "arrive" && metri(lat, lon, pp.lat, pp.lon) <= LEAVE_STOP_M) break
                        dettiVicino.add(idx)
                        dettiLontano.add(idx)
                        avanza()
                    }
                }
            }
        }

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
            // (22/09/2026) «Salta» guarda il PRIMO passo dopo idx che non sia
            // una partenza: dopo un arrivo c'è sempre la partenza della tratta
            // dopo, negli stessi punti, e il confronto non scattava mai — chi
            // lasciava la tappa verso una svolta a 30 m non la sentiva (l'indice
            // restava sull'arrivo fino a 45 m). Solo lasciando una tappa GIÀ
            // RAGGIUNTA: su un arrivo non ancora contato si guarda il passo
            // subito dopo, come prima. Se la tratta dopo riparte per la stessa
            // strada dell'andata, la sua prima svolta è l'angolo appena girato
            // per arrivarci: guardandola si saltava l'arrivo e si diceva «gira»
            // a chi stava ancora andando verso la tappa.
            var j = idx + 1
            if (p.tipo == "arrive" && dettiVicino.contains(idx)) {
                while (j < n && passi[j].tipo == "depart") j++
            }
            if (j < n) {
                val pn = passi[j]
                val dn = metri(lat, lon, pn.lat, pn.lon)
                if (dn < d && dn < SKIP_NEXT_M) { avanza(); continue }
            }
            minDist = min(minDist, d)

            if (p.tipo == "arrive") {
                // (21/09/2026, REVISIONE 2) Solo per l'ULTIMO arrivo con
                // `finale`, oltre ai 25 m: NEI PARAGGI = entro 60 m
                // ininterrottamente da 45 s (la regola 3 del JS).
                val eFinale = idx == n - 1 && finale
                // Ininterrotto davvero: un buco di fix (pausa, galleria) fa
                // ricominciare il conto, due fix a minuti di distanza non bastano.
                if (vicinoFinaleDa != 0L && nowMs - ultimoFixFinaleTs > NEARBY_BUCO_MS) vicinoFinaleDa = 0L
                ultimoFixFinaleTs = nowMs
                // (22/09/2026) E vicini anche LUNGO IL TRACCIATO (≤ 60 m dalla
                // meta), come il JS: una via sul retro dell'isolato a 40 m dalla
                // porta non è «nei paraggi». Senza tracciato utile si resta alla
                // sola linea d'aria, come prima.
                val lungoOk = if (eFinale && d <= NEARBY_M && idx < alongPasso.size && !alongPasso[idx].isNaN()) {
                    val aFin = alongPasso[idx]
                    val u = alongUtente(lat, lon, aFin - 300.0, aFin + 10.0, NEARBY_M)
                    !u.isNaN() && aFin - u <= NEARBY_M
                } else true
                if (eFinale && d <= NEARBY_M && lungoOk) {
                    if (vicinoFinaleDa == 0L) vicinoFinaleDa = nowMs
                } else {
                    vicinoFinaleDa = 0L
                }
                val neiParaggi = eFinale && vicinoFinaleDa != 0L && nowMs - vicinoFinaleDa >= NEARBY_MS
                // Da dire se mai contato, OPPURE contato in silenzio (JS creduto
                // vivo) e ora il nativo è al comando senza che nessuno l'abbia detto.
                if ((d <= ARRIVE_M || neiParaggi) && (!dettiVicino.contains(idx) || (!jsVivo && !dettiVicinoDavvero.contains(idx)))) {
                    dettiVicino.add(idx)
                    if (!jsVivo) {
                        dettiVicinoDavvero.add(idx)
                        if (p.testo.isNotEmpty()) { out = p.testo; tipoOut = "vicino"; testoOut = p.testo }
                    }
                } else if (eFinale && !dettiVicino.contains(idx) && minDist < 60.0 &&
                    d > minDist + maxOf(MISSED_MARGIN_M, accuracyM)
                ) {
                    // (21/09/2026, REVISIONE 2) ARRIVO FINALE SFIORATO: ci si è
                    // avvicinati (< 60 m) e ora ci si allontana → contato SENZA
                    // dirlo (non va nei «davvero»). Margine mai sotto
                    // l'accuratezza: un salto GPS non chiude prima dell'arrivo.
                    // Senza, chi non entrava nei 25 m teneva il GPS al massimo e
                    // il cruscotto acceso fino all'app, e poi sentiva «fuori
                    // percorso» uscendo dal museo.
                    dettiVicino.add(idx)
                }
                if (dettiVicino.contains(idx) && idx == n - 1 && finale) {
                    // Arrivo finale: si CHIUDE solo col nativo al comando
                    // (cruscotto spento una volta sola, vedi cruscotto()). Col
                    // JS vivo non si chiude qui: arriva lui e ritira il
                    // percorso; se invece si è appena congelato, al primo fix
                    // col battito scaduto l'arrivo lo dice e lo chiude il nativo.
                    // Un'unica strada di chiusura, anche per paraggi e sfiorato.
                    // (21/09/2026, REVISIONE 2) `finito` sempre; il cruscotto si
                    // spegne solo se il JS l'ha chiesto (spegniCruscotto): con un
                    // giro in corso il cruscotto dopo la tappa singola è del giro.
                    if (!jsVivo) { if (spegniCruscotto) spegniDaDire = true; finito = true }
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

            // (22/09/2026) AVVICINAMENTO: c'è solo se la distanza è scesa di
            // almeno AVVICINA_M rispetto al riferimento dello stesso passo
            // (primo fix sul passo = nessun riferimento = non ancora). Il
            // riferimento si sposta solo quando la distanza cambia di almeno
            // AVVICINA_M: a piedi con un fix ogni 2 s si fanno ~2,8 m, e un
            // confronto col solo fix precedente (GPS filtrato, senza rumore)
            // non avrebbe mai visto l'avvicinamento — preavviso perso.
            val avvicina = dPrecIdx == idx && d < dPrec - AVVICINA_M
            if (dPrecIdx != idx || d < dPrec - AVVICINA_M || d > dPrec + AVVICINA_M) {
                dPrec = d
                dPrecIdx = idx
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
            } else if (p.tipo == "turn" && !inPausa && avvicina &&
                (!dettiLontano.contains(idx) || (!jsVivo && !dettiLontanoDavvero.contains(idx))) &&
                d >= FAR_MIN_M && d <= FAR_MAX_M && p.testo.isNotEmpty()
            ) {
                // (21/09/2026, REVISIONE 2) In pausa il preavviso NON si segna.
                // E CONTATO ≠ DETTO anche qui: un preavviso contato in silenzio
                // negli 8 s dopo il congelamento (JS creduto vivo, ma non l'ha
                // detto) lo dice il nativo, se si è ancora fra 50 e 150 m.
                // (22/09/2026) E solo AVVICINANDOSI (vedi `avvicina`).
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

        // (21/09/2026, REVISIONE 2) Partenza da un indirizzo lontano: si è
        // «agganciati» (e il fuori percorso vale) solo arrivati sul tracciato.
        // Conta anche col JS vivo e in pausa.
        if (!agganciato && linea.size >= 2 && distanzaDallaLinea(lat, lon) <= AGGANCIO_M) agganciato = true

        // FUORI PERCORSO — solo se il nativo è al comando e non ha altro da dire.
        if (!jsVivo && agganciato && out == null && linea.size >= 2) {
            val dl = distanzaDallaLinea(lat, lon)
            if (dl > OFFROUTE_M + accuracyM / 2.0) {
                if (fuoriDa == 0L) {
                    fuoriDa = nowMs
                } else if (nowMs - fuoriDa > OFFROUTE_MS && !fuoriDetto) {
                    fuoriDetto = true
                    fuoriDettoTs = nowMs
                    if (fraseFuoriPercorso.isNotBlank()) out = fraseFuoriPercorso
                } else if (fuoriDetto && fuoriRipetizioni < OFFROUTE_MAX_RIPETIZIONI &&
                    nowMs - fuoriDettoTs > OFFROUTE_RIPETI_MS
                ) {
                    // (21/09/2026, REVISIONE 2) Ancora fuori 60 s dopo l'ultima
                    // volta: si ridice (al massimo 2 ripetizioni per uscita).
                    fuoriRipetizioni++
                    fuoriDettoTs = nowMs
                    if (fraseFuoriPercorso.isNotBlank()) out = fraseFuoriPercorso
                }
            } else if (dl < BACK_ON_ROUTE_M) {
                fuoriDa = 0L
                fuoriDetto = false
                // Rientrati: la prossima uscita riparte col suo conto.
                fuoriDettoTs = 0L
                fuoriRipetizioni = 0
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
    /**
     * (21/09/2026, REVISIONE 2) Metri progressivi lungo il tracciato del punto
     * (lat, lon) proiettato sul segmento PIÙ VICINO. Per i passi, alla
     * consegna: NaN se il passo sta a più di 50 m dalla linea (tracciato
     * mancante o diverso: la progressione lì non si usa).
     */
    private fun alongDelPunto(lat: Double, lon: Double): Double {
        if (linea.size < 2 || lineaCum.size != linea.size) return Double.NaN
        val kx = Math.toRadians(1.0) * RAGGIO_TERRA_M * cos(Math.toRadians(lat))
        val ky = Math.toRadians(1.0) * RAGGIO_TERRA_M
        var best = Double.POSITIVE_INFINITY
        var along = Double.NaN
        for (k in 1 until linea.size) {
            val ax = (linea[k - 1][1] - lon) * kx
            val ay = (linea[k - 1][0] - lat) * ky
            val dx = (linea[k][1] - lon) * kx - ax
            val dy = (linea[k][0] - lat) * ky - ay
            val len2 = dx * dx + dy * dy
            val t = if (len2 <= 0.0) 0.0 else (-(ax * dx + ay * dy) / len2).coerceIn(0.0, 1.0)
            val px = ax + t * dx
            val py = ay + t * dy
            val dist = sqrt(px * px + py * py)
            if (dist < best) {
                best = dist
                along = lineaCum[k - 1] + t * (lineaCum[k] - lineaCum[k - 1])
            }
        }
        return if (best <= 50.0) along else Double.NaN
    }

    /**
     * (21/09/2026, REVISIONE 2) Metri progressivi di chi cammina, fra `da` e
     * `a` lungo il tracciato: la PRIMA corrispondenza in avanti entro
     * `maxCross` metri dalla linea (non la più vicina — vedi onFix, l'anello).
     * NaN se non si è sulla linea in quella finestra.
     */
    private fun alongUtente(lat: Double, lon: Double, da: Double, a: Double, maxCross: Double): Double {
        if (linea.size < 2 || lineaCum.size != linea.size) return Double.NaN
        val kx = Math.toRadians(1.0) * RAGGIO_TERRA_M * cos(Math.toRadians(lat))
        val ky = Math.toRadians(1.0) * RAGGIO_TERRA_M
        for (k in 1 until linea.size) {
            if (lineaCum[k] < da) continue
            if (lineaCum[k - 1] > a) break
            val ax = (linea[k - 1][1] - lon) * kx
            val ay = (linea[k - 1][0] - lat) * ky
            val dx = (linea[k][1] - lon) * kx - ax
            val dy = (linea[k][0] - lat) * ky - ay
            val len2 = dx * dx + dy * dy
            val t = if (len2 <= 0.0) 0.0 else (-(ax * dx + ay * dy) / len2).coerceIn(0.0, 1.0)
            val px = ax + t * dx
            val py = ay + t * dy
            if (sqrt(px * px + py * py) <= maxCross) {
                val along = lineaCum[k - 1] + t * (lineaCum[k] - lineaCum[k - 1])
                if (along >= da) return along
            }
        }
        return Double.NaN
    }

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
