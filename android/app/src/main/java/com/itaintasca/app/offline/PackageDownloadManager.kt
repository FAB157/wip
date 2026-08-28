package com.itaintasca.app.offline

import android.content.Context
import android.content.Intent
import android.util.Log
import com.itaintasca.app.db.OfflinePackageEntity
import com.itaintasca.app.db.OfflinePackagePoiRef
import com.itaintasca.app.db.OfflinePoiEntity
import com.itaintasca.app.db.OfflineRtree
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.geofence.Footprints
import com.itaintasca.app.service.WipApi
import kotlinx.coroutines.delay
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Risposta HTTP non 2xx: distinta dagli errori di rete per decidere se ritentare. */
private class HttpStatusException(val code: Int) : IOException("HTTP $code")

/**
 * Download e delta-sync dei pacchetti area offline (solo testi, nessun binario).
 *
 * QUANTO PESA DAVVERO (misurato il 23/08/2026). Qui c'era scritto "1-3 MB per
 * area": non è mai stato vero, ed era un ordine di grandezza di troppo. Un POI
 * del bundle pesa ~3,4 KB, di cui circa il 70% è `audio_text` (il testo
 * integrale dell'audioguida). Il raggio predefinito è 50 km (il server lo
 * accetta fra 10 e 120, con un buffer del 10% oltre il bordo), e 50 km attorno
 * a una città portano decine di migliaia di POI: **~35 MB per pacchetto**, non
 * 1-3. Il tetto di 2 GB qui sotto regge quindi qualche decina di aree, non
 * "centinaia".
 *
 * Il default di 50 km NON è stato cambiato di proposito: non nasce qui, lo
 * passano il plugin Capacitor (ItaintaBackgroundPoiPlugin.downloadOfflinePackage)
 * e la schermata web, e il server ha il suo `radiusKm = 50`. Abbassarlo si fa
 * là, in un intervento che tocca anche la UI (l'utente deve vedere che sta
 * scaricando meno) — e comunque solo per i NUOVI pacchetti: quelli già
 * scaricati conservano il loro `radiusKm` nella riga di offline_packages e
 * continuano a sincronizzarsi con il raggio con cui sono nati.
 *
 * Il manifest arriva paginato da POST /api/area/bundle (paginazione keyset:
 * ogni pagina porta il cursore della successiva). Ogni pagina viene scritta in
 * Room appena ricevuta, in UNA transazione, con upsert idempotenti: un download
 * interrotto si riprende dal cursore persistito, senza duplicati. Il delta sync
 * passa `since` = lastSyncAt del pacchetto e riceve solo i POI cambiati + le
 * tombstone dei cancellati.
 */
class PackageDownloadManager(private val context: Context) {

    companion object {
        private const val TAG = "PackageDownloadMgr"
        // (SEC-09) Dominio unico in WipApi.BASE.
        private const val BUNDLE_URL = WipApi.BASE + "/api/area/bundle"

        // (ITI-08) Stima di spazio per POI del bundle (~3,4 KB misurati, con
        // margine) e riserva minima oltre la stima: il controllo dei 50 MB
        // all'avvio non sapeva quanto sarebbe stato grande il pacchetto.
        private const val BYTES_PER_POI_ESTIMATE = 3500L
        private const val EXTRA_FREE_BYTES = 20L * 1024 * 1024
        // Tentativi per pagina su errore di rete (backoff 2 s, 4 s).
        private const val PAGE_ATTEMPTS = 3

        /**
         * POI per pagina. Era 500: la pagina viene materializzata tutta in
         * memoria due volte di fila — l'array di byte della risposta e poi
         * l'albero di JSONObject — e con `audioText` e `footprint` dentro il
         * picco arrivava a 6-9 MB su un servizio che gira in background su
         * telefoni modesti. 200 lo riporta a 2-4 MB. Cambia SOLO il numero di
         * richieste (2,5 volte tante, ognuna più corta): il risultato scritto
         * su disco è identico, e la paginazione keyset è già a prova di
         * interruzione. Il server accetta 50-1000.
         */
        private const val PAGE_SIZE = 200
        const val EVENT_PROGRESS = "offlinePackageProgress"

        /**
         * Limite di storage totale per i pacchetti offline, in MB. Con ~35 MB
         * per area da 50 km sono qualche decina di aree prima che scatti
         * l'eviction LRU.
         */
        const val MAX_OFFLINE_STORAGE_MB = 2048L
        private const val MAX_OFFLINE_STORAGE_BYTES = MAX_OFFLINE_STORAGE_MB * 1024 * 1024

        /** Margine minimo di spazio libero sul device sotto cui non si scarica nulla. */
        private const val MIN_FREE_DEVICE_BYTES = 50L * 1024 * 1024

        /**
         * Cartella e regola di nome degli MP3 prefetchati: DEVONO restare
         * identiche a AudioPrefetchManager (cacheDir/audio_prefetch,
         * "{poiId}_{lang}_{character}.mp3" ripulito dei caratteri non sicuri).
         * Se cambiano là, cambiare qui: sono l'unico modo per riconoscere
         * l'audio di un POI dal nome del file.
         */
        private const val AUDIO_CACHE_DIR = "audio_prefetch"
        private val AUDIO_NAME_UNSAFE = Regex("[^A-Za-z0-9_-]")
    }

    private val db = PoiDatabase.getInstance(context)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun downloadPackage(
        id: String,
        name: String,
        lat: Double,
        lon: Double,
        radiusKm: Double,
        language: String
    ): OfflinePackageEntity {
        val existing = db.offlineDao().getPackage(id)

        // Resume: un tentativo precedente interrotto (status "downloading" per
        // crash/kill, o "error" per rete caduta) ha già persistito il cursore
        // keyset raggiunto — si riparte da lì invece che da pagina 1.
        //
        // ⚠️ SERVE ANCHE pendingRunStartedAt (23/08/2026). Prima bastava il
        // cursore, ma il cursore lo scriveva ANCHE il delta sync: un delta
        // fallito lasciava qui un cursore che copriva solo i POI modificati di
        // recente, e il download successivo lo riprendeva come se fosse suo —
        // ripartiva da metà catalogo, saltava tutti i POI più vecchi e si
        // dichiarava comunque `ready`. Perdita di dati silenziosa. Ora il
        // checkpoint lo scrive solo il download pieno, che si firma con
        // pendingRunStartedAt; i checkpoint senza firma (scritti dalle versioni
        // precedenti dell'app) NON si riprendono: si riparte da pagina 1, che
        // costa banda e non perde niente.
        val isResume = existing != null &&
            (existing.status == "downloading" || existing.status == "error") &&
            !existing.pendingCursorUpdated.isNullOrEmpty() &&
            existing.pendingRunStartedAt != null

        // Timbro del run: identifica le righe di offline_package_pois scritte da
        // questo download, e sopravvive al resume (i due tronconi dello stesso
        // download devono portare lo stesso timbro, altrimenti la potatura
        // finale butterebbe la prima metà).
        val runStartedAt = if (isResume) existing!!.pendingRunStartedAt!! else System.currentTimeMillis()

        ensureStorageBudget(id)

        db.offlineDao().upsertPackage(
            (existing ?: OfflinePackageEntity(
                id = id, name = name, centerLat = lat, centerLon = lon,
                radiusKm = radiusKm, language = language,
                downloadedAt = System.currentTimeMillis()
            )).copy(
                status = "downloading",
                lastAccessedAt = System.currentTimeMillis(),
                pendingRunStartedAt = runStartedAt,
                // Fuori dal resume si riparte da pagina 1: qualunque checkpoint
                // vecchio (anche uno lasciato da un delta di una versione
                // precedente) va buttato, non ereditato.
                pendingCursorUpdated = if (isResume) existing?.pendingCursorUpdated else null,
                pendingCursorId = if (isResume) existing?.pendingCursorId else null
            )
        )

        return runPages(
            id, name, lat, lon, radiusKm, language, since = null,
            runStartedAt = runStartedAt,
            resumeCursorUpdated = if (isResume) existing?.pendingCursorUpdated else null,
            resumeCursorId = if (isResume) existing?.pendingCursorId else null,
            resumeSizeBytes = if (isResume) (existing?.sizeBytes ?: 0L) else 0L,
            // Base del prossimo delta: sul resume resta quella del PRIMO
            // troncone (vedi OfflineDao.startFullDownloadRun).
            resumeGeneratedAt = if (isResume) existing?.lastSyncAt else null
        )
    }

    /**
     * Cap di storage: se lo spazio occupato dai pacchetti offline è oltre il
     * limite, libera evictando i meno usati di recente (LRU su lastAccessedAt,
     * fallback downloadedAt per righe migrate senza storico) finché non si
     * scende sotto [MAX_OFFLINE_STORAGE_BYTES] o non resta che il pacchetto in
     * corso — quello non si evict mai, è ciò che l'utente sta chiedendo adesso.
     *
     * (23/08/2026) Tre correzioni:
     *  - l'occupato ora COMPRENDE il pacchetto che si sta (ri)scaricando: prima
     *    lo si escludeva del tutto, e ri-scaricare un'area da 35 MB con il
     *    disco già pieno non liberava niente;
     *  - la lista si ordina UNA volta invece di ricercare il minimo a ogni giro
     *    (era O(n²) su una lista che si rilegge intera ogni volta);
     *  - il vacuum dell'R-tree si fa UNA volta alla fine, non dentro il ciclo:
     *    erano N scansioni consecutive della stessa tabella.
     *
     * Se anche dopo aver evictato tutto il resto lo spazio libero reale sul
     * device è sotto la soglia di sicurezza, fallisce subito invece di lasciare
     * che il download riempia il disco.
     */
    private suspend fun ensureStorageBudget(newPackageId: String) {
        val dao = db.offlineDao()
        val all = dao.getAllPackages()
        var occupied = all.sumOf { it.sizeBytes }

        // Candidati all'eviction, dal meno usato al più usato. Il pacchetto in
        // corso resta fuori dai candidati ma dentro il conto dell'occupato.
        val candidates = all
            .filter { it.id != newPackageId }
            .sortedBy { if (it.lastAccessedAt > 0L) it.lastAccessedAt else it.downloadedAt }

        var evicted = 0
        for (lru in candidates) {
            if (occupied <= MAX_OFFLINE_STORAGE_BYTES) break
            Log.w(
                TAG,
                "Storage cap ${MAX_OFFLINE_STORAGE_MB}MB superato: eviction LRU pacchetto " +
                    "${lru.id} (${lru.sizeBytes} bytes, ultimo uso ${lru.lastAccessedAt})"
            )
            removePackage(lru.id, vacuum = false)
            occupied -= lru.sizeBytes
            evicted++
        }
        if (evicted > 0) vacuumRtree()

        val freeBytes = try {
            context.filesDir.usableSpace
        } catch (e: Exception) {
            Long.MAX_VALUE
        }
        if (freeBytes in 0L until MIN_FREE_DEVICE_BYTES) {
            throw IOException(
                "Spazio insufficiente sul dispositivo per il pacchetto offline " +
                    "(${freeBytes / (1024 * 1024)}MB liberi, anche dopo aver rimosso i pacchetti " +
                    "offline meno usati): libera spazio sul telefono e riprova."
            )
        }
    }

    /**
     * Delta sync: solo POI modificati dopo lastSyncAt + tombstone.
     *
     * Se il pacchetto ha un download pieno interrotto a metà (checkpoint
     * firmato), il delta non ha senso — mancano ancora POI del primo giro: si
     * riprende quel download invece di chiedere un delta su una base
     * incompleta.
     */
    suspend fun syncPackage(id: String): OfflinePackageEntity? {
        val pkg = db.offlineDao().getPackage(id) ?: return null
        if (!pkg.pendingCursorUpdated.isNullOrEmpty() && pkg.pendingRunStartedAt != null) {
            Log.w(TAG, "Package $id ha un download pieno interrotto: lo riprendo invece del delta")
            return downloadPackage(pkg.id, pkg.name, pkg.centerLat, pkg.centerLon, pkg.radiusKm, pkg.language)
        }
        return runPages(
            pkg.id, pkg.name, pkg.centerLat, pkg.centerLon,
            pkg.radiusKm, pkg.language, since = pkg.lastSyncAt,
            runStartedAt = System.currentTimeMillis()
        )
    }

    suspend fun deletePackage(id: String) {
        removePackage(id, vacuum = true)
    }

    /**
     * Rimozione vera del pacchetto. `vacuum = false` serve all'eviction, che ne
     * cancella diversi di fila e passa il vacuum una volta alla fine.
     *
     * Cancella anche gli MP3 dell'audioguida prefetchati per i POI che
     * appartenevano SOLO a questo pacchetto (23/08/2026): prima restavano nella
     * cache file — si autoscadono in 24h, ma un'area appena camminata può
     * lasciare decine di MB di audio che l'utente ha appena chiesto di
     * eliminare. I POI condivisi con un'altra area scaricata non si toccano.
     */
    private suspend fun removePackage(id: String, vacuum: Boolean) {
        // PRIMA di cancellare i riferimenti, altrimenti non si sa più quali POI
        // erano esclusivi di questo pacchetto.
        val orfaniInArrivo: List<String> = try {
            db.offlineDao().exclusivePoiIds(id)
        } catch (e: Exception) {
            Log.w(TAG, "exclusivePoiIds fallita per $id: ${e.message}")
            emptyList<String>()
        }

        db.offlineDao().deleteRefsForPackage(id)
        db.offlineDao().deletePackageRow(id)
        db.offlineDao().deleteOrphanPois()
        deleteCachedAudio(orfaniInArrivo)
        if (vacuum) vacuumRtree()
    }

    suspend fun listPackages(): List<OfflinePackageEntity> = db.offlineDao().getAllPackages()

    private suspend fun runPages(
        id: String,
        name: String,
        lat: Double,
        lon: Double,
        radiusKm: Double,
        language: String,
        since: String?,
        runStartedAt: Long,
        resumeCursorUpdated: String? = null,
        resumeCursorId: String? = null,
        resumeSizeBytes: Long = 0L,
        resumeGeneratedAt: String? = null
    ): OfflinePackageEntity {
        // Resume: riparte dal cursore keyset persistito da un run precedente
        // interrotto, invece che da pagina 1. `bytes` riparte dal totale già
        // accumulato in quel run: rappresenta la size cumulativa, non solo
        // quella di QUESTO giro di pagine.
        var cursorUpdated: String? = resumeCursorUpdated
        var cursorId: String? = resumeCursorId
        val isResuming = !resumeCursorUpdated.isNullOrEmpty()
        // Base del prossimo delta. Sul resume è quella del PRIMO troncone: usare
        // il generatedAt del troncone finale perderebbe per sempre ciò che è
        // cambiato durante l'interruzione sotto il cursore.
        var generatedAt: String? = resumeGeneratedAt
        var runAperto = false
        var total = 0
        var received = 0
        var bytes = resumeSizeBytes
        // (ITI-08) Verifica dello spazio fatta una volta, alla prima pagina
        // (quando `total` diventa noto).
        var spazioVerificato = false

        try {
            do {
                val payload = JSONObject().apply {
                    put("lat", lat)
                    put("lon", lon)
                    put("radiusKm", radiusKm)
                    put("lang", language)
                    put("pageSize", PAGE_SIZE)
                    if (since != null) put("since", since)
                    if (cursorUpdated != null) {
                        put("cursorUpdated", cursorUpdated)
                        put("cursorId", cursorId)
                    }
                }.toString()

                // TOKEN UTENTE (23/08/2026). Dal 23/08 /api/area/bundle lo
                // pretende: la rotta serve nome, descrizione e TESTO INTEGRALE
                // dell'audioguida a pagine, ed era il modo piu' comodo per
                // portarsi via l'intero catalogo. Il token e' lo stesso che il
                // receiver usa per il teaser (SecurePrefs, scritto da
                // setUserContext). Se manca si prova lo stesso: il server
                // risponde 401 e il download fallisce con un messaggio chiaro,
                // invece di scaricare a meta'.
                val accessToken = com.itaintasca.app.service.SecurePrefs.get(context)
                    .getString(com.itaintasca.app.service.ListeningHistoryStore.PREF_ACCESS_TOKEN, "")
                val request = Request.Builder()
                    .url(BUNDLE_URL)
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .addHeader("User-Agent", "Itainta-Android-Native")
                    .apply { if (!accessToken.isNullOrBlank()) addHeader("Authorization", "Bearer $accessToken") }
                    .build()

                // BYTE VERI, non caratteri (23/08/2026). Prima si contava
                // `bodyStr.length`, cioè le unità UTF-16 di una String: per un
                // testo latino è il DOPPIO dei byte effettivi, e sia il tetto
                // dei 2 GB sia l'LRU giravano su una grandezza che non esiste.
                // Qui si misura il corpo decodificato (il transito è più corto
                // se il server comprime, ma quello che conta per lo storage è
                // il testo che finisce in Room).
                // (ITI-08) Tre tentativi per pagina su errore di RETE (timeout,
                // connessione caduta, 5xx) con backoff 2 s / 4 s: prima una
                // singola IOException su un download da 35 MB mandava tutto in
                // "error" e l'utente doveva ripartire a mano. Un 4xx (token
                // scaduto, richiesta rifiutata) non si ritenta: non cambierebbe.
                var rawBody: ByteArray? = null
                var tentativo = 0
                while (rawBody == null) {
                    try {
                        rawBody = client.newCall(request).execute().use { resp ->
                            if (!resp.isSuccessful) throw HttpStatusException(resp.code)
                            resp.body?.bytes() ?: throw IOException("Empty bundle body")
                        }
                    } catch (e: IOException) {
                        val definitivo = e is HttpStatusException && e.code in 400..499
                        tentativo++
                        if (definitivo || tentativo >= PAGE_ATTEMPTS) throw e
                        val attesaMs = 1000L shl tentativo
                        Log.w(TAG, "Pagina del pacchetto $id fallita (${e.message}), tentativo $tentativo/$PAGE_ATTEMPTS fra ${attesaMs} ms")
                        delay(attesaMs)
                    }
                }
                val pageBytes: ByteArray = rawBody ?: throw IOException("Empty bundle body")
                bytes += pageBytes.size.toLong()
                val bodyStr = String(pageBytes, Charsets.UTF_8)

                val json = JSONObject(bodyStr)
                val meta = json.getJSONObject("meta")
                if (generatedAt == null) generatedAt = meta.optString("generatedAt", null)
                total = meta.optInt("totalCount", total)

                // (ITI-08) Ora che il totale e' noto: lo spazio libero deve
                // coprire la stima dell'intero pacchetto piu' una riserva.
                // Prima si controllavano solo 50 MB fissi all'avvio, e un'area
                // da 35 MB su un telefono quasi pieno riempiva il disco a meta'.
                if (!spazioVerificato && total > 0) {
                    spazioVerificato = true
                    val richiesti = total * BYTES_PER_POI_ESTIMATE + EXTRA_FREE_BYTES
                    val liberi = try { context.filesDir.usableSpace } catch (e: Exception) { Long.MAX_VALUE }
                    if (liberi in 0L until richiesti) {
                        throw IOException(
                            "Spazio insufficiente: il pacchetto richiede circa " +
                                "${richiesti / (1024 * 1024)} MB, liberi ${liberi / (1024 * 1024)} MB. " +
                                "Libera spazio sul telefono e riprova."
                        )
                    }
                }

                // Apertura del run pieno: timbro + base del prossimo delta,
                // scritti SUBITO (vedi OfflineDao.startFullDownloadRun).
                if (since == null && !runAperto) {
                    db.offlineDao().startFullDownloadRun(id, runStartedAt, generatedAt)
                    runAperto = true
                }

                // Tombstone: POI cancellati sul server → via anche dal locale
                val tombs = json.optJSONArray("tombstones")
                if (tombs != null && tombs.length() > 0) {
                    val deadIds = (0 until tombs.length()).map { tombs.getString(it) }
                    db.offlineDao().deleteRefsByPoiIds(deadIds)
                    db.offlineDao().deletePoisByIds(deadIds)
                }

                val poisArr = json.getJSONArray("pois")
                val pois = ArrayList<OfflinePoiEntity>(poisArr.length())
                for (i in 0 until poisArr.length()) {
                    val p = poisArr.getJSONObject(i)
                    val poiId = p.optString("id", "")
                    if (poiId.isEmpty()) continue

                    // DIFESA IN PROFONDITÀ (il DB agent li scarta già lato server):
                    // niente bozze/allucinazioni/nascosti nei pacchetti offline.
                    // Stessa lista status di SupabaseClient.parsePoiList.
                    val status = p.optString("status", "").lowercase()
                    if (status == "draft" || status == "needs_revision" ||
                        status == "rejected" || status == "hidden" ||
                        p.optBoolean("is_hidden", false)
                    ) continue

                    // Placeholder generici (nessun nome reale): non devono finire
                    // nel radar offline né essere annunciati.
                    val nome = p.optString("nome", "")
                    if (nome.isBlank() || nome.equals("Punto di interesse", ignoreCase = true)) continue

                    pois.add(
                        OfflinePoiEntity(
                            id = poiId,
                            nome = nome,
                            lat = p.optDouble("lat", 0.0),
                            lon = p.optDouble("lon", 0.0),
                            category = p.strOrNull("category"),
                            poiType = p.strOrNull("poi_type"),
                            isGem = p.optBoolean("is_gem", false),
                            alertRadius = p.optInt("alert_radius", 150),
                            arrivalRadius = p.optInt("geofence_radius", 50),
                            teaserText = p.strOrNull("teaser_text"),
                            descriptionShort = p.strOrNull("description_short"),
                            audioText = p.strOrNull("audio_text"),
                            updatedAt = p.strOrNull("updated_at"),
                            // Porta, perimetro e indirizzo (area_bundle_pois dal
                            // 22/08/2026). Pagine di server vecchi non li hanno:
                            // restano null e il POI lavora al centroide come prima.
                            entranceLat = p.optDouble("entrance_lat").takeIf { !it.isNaN() },
                            entranceLon = p.optDouble("entrance_lon").takeIf { !it.isNaN() },
                            footprint = Footprints.geojsonCompatto(
                                // Il bundle porta il GeoJSON come oggetto o come testo.
                                p.optJSONObject("footprint")?.toString() ?: p.strOrNull("footprint")
                            ),
                            address = p.strOrNull("address"),
                            // IL PUNTO dell'indirizzo e la sua provenienza
                            // (area_bundle_pois dal 23/08/2026, migration
                            // 20260823180000). Con il punto il trigger scatta a
                            // 30 m dalla facciata invece di raddoppiare il
                            // raggio sul centroide: offline come online. Server
                            // o RPC vecchi non li mandano → null, e il
                            // comportamento è identico a prima.
                            addressSource = p.strOrNull("address_source"),
                            addressPointLat = p.optDouble("address_point_lat").takeIf { !it.isNaN() },
                            addressPointLon = p.optDouble("address_point_lon").takeIf { !it.isNaN() },
                            addressPointSource = p.strOrNull("address_point_source")
                        )
                    )
                }
                if (pois.isNotEmpty()) {
                    // Una pagina = una transazione (POI + riferimenti insieme):
                    // prima erano due, e un kill nel mezzo lasciava POI senza
                    // pacchetto che li rivendicasse.
                    // Il timbro: quello del run per il download pieno (serve
                    // alla potatura finale), l'ora corrente per il delta — che
                    // non pota niente e non deve farsi potare.
                    val timbro = if (since == null) runStartedAt else System.currentTimeMillis()
                    db.offlineDao().upsertPage(
                        pois,
                        pois.map { OfflinePackagePoiRef(id, it.id, timbro) }
                    )
                }
                received += pois.size
                notifyProgress(id, received, total, "downloading")

                val next = json.optJSONObject("nextCursor")
                cursorUpdated = next?.strOrNull("cursorUpdated")
                cursorId = next?.strOrNull("cursorId")

                // Checkpoint: persiste il cursore raggiunto ad ogni pagina, così
                // un crash/kill a metà download riprende da qui invece che da
                // pagina 1, e i byte cumulativi alimentano il cap di storage
                // anche a download interrotto.
                // SOLO PER IL DOWNLOAD PIENO: un delta non lascia checkpoint
                // (vedi il commento in OfflinePackageEntity), perché un cursore
                // dell'era delta ripreso da un download pieno faceva saltare in
                // silenzio tutti i POI più vecchi.
                if (since == null) {
                    db.offlineDao().updateDownloadCheckpoint(id, cursorUpdated, cursorId, bytes)
                }
            } while (!cursorUpdated.isNullOrEmpty())

            // Potatura dei riferimenti che questo download pieno non ha
            // riscritto: i POI usciti dall'area. Prima restavano agganciati per
            // sempre, quindi non diventavano mai orfani e `deleteOrphanPois`
            // non li vedeva: spazio occupato per sempre e fantasmi nel radar
            // offline. Solo a download pieno COMPLETATO (qui siamo dopo l'ultima
            // pagina): a metà strada butterebbe POI ancora buoni.
            if (since == null) {
                db.offlineDao().pruneStaleRefs(id, runStartedAt)
                db.offlineDao().deleteOrphanPois()
            }

            vacuumRtree()

            val existing = db.offlineDao().getPackage(id)
            val pkg = OfflinePackageEntity(
                id = id,
                name = name,
                centerLat = lat,
                centerLon = lon,
                radiusKm = radiusKm,
                language = language,
                poiCount = db.offlineDao().countPoisForPackage(id),
                // since != null: delta sync, si somma al totale esistente.
                // since == null: download pieno o resume, `bytes` è già il
                // cumulativo (seedato da resumeSizeBytes in caso di resume).
                sizeBytes = if (since != null) (existing?.sizeBytes ?: 0L) + bytes else bytes,
                downloadedAt = existing?.downloadedAt ?: System.currentTimeMillis(),
                lastAccessedAt = System.currentTimeMillis(),
                // generatedAt della PRIMA pagina del run (e, sul resume, della
                // prima pagina del primo troncone): ciò che è cambiato DURANTE
                // il download verrà ripreso dal prossimo delta, mai perso.
                lastSyncAt = generatedAt ?: since,
                status = "ready",
                // Download completato: nessun checkpoint pendente da riprendere.
                pendingCursorUpdated = null,
                pendingCursorId = null,
                pendingRunStartedAt = null
            )
            db.offlineDao().upsertPackage(pkg)
            notifyProgress(id, received, total, "ready")
            Log.d(
                TAG,
                "Package $id ready: ${pkg.poiCount} POIs, ${pkg.sizeBytes} bytes " +
                    "(delta=${since != null}, resumed=$isResuming)"
            )
            return pkg
        } catch (e: Exception) {
            Log.e(TAG, "Package $id failed: ${e.message}")
            db.offlineDao().getPackage(id)?.let {
                db.offlineDao().upsertPackage(it.copy(status = "error"))
            }
            notifyProgress(id, received, total, "error")
            throw e
        }
    }

    /**
     * MP3 dell'audioguida prefetchati per questi POI (AudioPrefetchManager):
     * best-effort totale, un errore qui non deve mai far fallire una delete.
     * Il nome è "{poiId}_{lang}_{character}.mp3" ripulito dei caratteri non
     * sicuri: si ricostruisce la parte POI togliendo gli ultimi due segmenti,
     * perché anche l'id può contenere un underscore.
     */
    private fun deleteCachedAudio(poiIds: List<String>) {
        if (poiIds.isEmpty()) return
        try {
            val dir = File(context.cacheDir, AUDIO_CACHE_DIR)
            if (!dir.isDirectory) return
            val attesi = poiIds.mapTo(HashSet()) { it.replace(AUDIO_NAME_UNSAFE, "_") }
            var rimossi = 0
            dir.listFiles()?.forEach { f ->
                val nome = f.name
                if (!nome.endsWith(".mp3")) return@forEach
                val parti = nome.removeSuffix(".mp3").split("_")
                if (parti.size < 3) return@forEach
                val partePoi = parti.subList(0, parti.size - 2).joinToString("_")
                if (partePoi in attesi) {
                    try { if (f.delete()) rimossi++ } catch (_: Exception) { }
                }
            }
            if (rimossi > 0) Log.d(TAG, "Rimossi $rimossi MP3 prefetchati dei POI del pacchetto")
        } catch (e: Exception) {
            Log.w(TAG, "Pulizia MP3 fallita: ${e.message}")
        }
    }

    /** Ripulisce le entry R-tree orfane lasciate dagli upsert REPLACE (vedi OfflineRtree). */
    private fun vacuumRtree() {
        try {
            db.openHelper.writableDatabase.execSQL(OfflineRtree.vacuumSql)
        } catch (e: Exception) {
            Log.w(TAG, "Rtree vacuum failed: ${e.message}")
        }
    }

    private fun notifyProgress(packageId: String, done: Int, total: Int, phase: String) {
        val data = JSONObject().apply {
            put("packageId", packageId)
            put("done", done)
            put("total", total)
            put("phase", phase)
        }
        val intent = Intent("com.itaintasca.POI_EVENT").apply {
            setPackage(context.packageName)
            putExtra("event", EVENT_PROGRESS)
            putExtra("data1", data.toString())
        }
        context.sendBroadcast(intent)
    }
}

/** optString di org.json ritorna "" per i null: qui vogliamo un vero null. */
private fun JSONObject.strOrNull(key: String): String? =
    if (isNull(key)) null else optString(key, "").ifEmpty { null }
