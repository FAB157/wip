import Foundation
import UIKit

/**
 * Port iOS di offline/PackageDownloadManager.kt: download e delta-sync dei
 * pacchetti area (solo testi). Manifest paginato da POST /api/area/bundle con
 * paginazione keyset; le pagine sono upsert idempotenti, persistite a batch
 * (ogni 10 pagine, vedi PoiStore.upsertOfflinePois) con flush esplicito a fine
 * download e su errore; tombstone per i POI cancellati. Il progresso arriva al JS con l'evento
 * 'offlinePackageProgress' {packageId, done, total, phase}.
 *
 * (28/08/2026, ITI-06) Allineato ad Android su quattro punti che qui
 * mancavano del tutto:
 *  1. CHECKPOINT: il download pieno persiste il cursore keyset a ogni pagina
 *     (OfflinePackage.pendingCursorUpdated, pendingCursorId,
 *     pendingRunStartedAt) e il tentativo
 *     successivo riparte da lì invece che da pagina 1. Solo il download pieno,
 *     mai il delta: un cursore dell'era delta ripreso da un download pieno
 *     saltava in silenzio tutti i POI più vecchi.
 *  2. TEMPO IN BACKGROUND: il download è avvolto in un
 *     UIApplication.beginBackgroundTask, così chi preme "Scarica" e mette il
 *     telefono in tasca non trova il pacchetto "error" al ritorno.
 *  3. BUDGET DI STORAGE: 50 MB liberi minimi sul dispositivo e tetto di 2 GB
 *     per i pacchetti, con eviction LRU (lastUsedAt) del meno usato.
 *  4. POTATURA: a download pieno completato i POI usciti dall'area perdono il
 *     riferimento (PoiStore.pruneStaleRefs) e, se orfani, il posto su disco.
 */
final class WipPackageDownloadManager {

    static let bundleUrl = "\(WipApi.base)/api/area/bundle"
    static let pageSize = 500
    static let eventProgress = "offlinePackageProgress"
    /// Tetto complessivo dei pacchetti offline (Android: MAX_OFFLINE_STORAGE_MB).
    static let maxOfflineStorageBytes: Int64 = 2048 * 1024 * 1024
    /// Spazio libero minimo sul dispositivo prima di iniziare (Android:
    /// MIN_FREE_DEVICE_BYTES).
    static let minFreeDeviceBytes: Int64 = 50 * 1024 * 1024

    /// Placeholder generici del vecchio import CSV/OSM (nessun contenuto reale):
    /// mirror ESATTO dell'IN-list di public.is_generic_poi_name (migration
    /// 20260812150000). Guardia difensiva client: il server già li scarta, ma un
    /// bundle vecchio o un delta potrebbe ancora portarli. Tenere allineato ad
    /// Android e a poiRepository.ts. Il regex "parcheggio pubblico…" del DB non
    /// è replicato qui per non rischiare falsi positivi su POI reali: resta al
    /// server, questa lista copre le frasi esatte (incluso "Punto di interesse",
    /// il blocco più grosso di spazzatura).
    static let genericPoiNames: Set<String> = [
        "parcheggio", "parco", "giardino", "giardinetti", "giardinetto", "villa", "parking",
        "park", "garden", "playground", "posteggio", "sosta", "stazionamento",
        "luogo d'interesse", "luogo d interesse", "area camper", "area sosta",
        "area di sosta", "sito", "punto",
        "punto di interesse", "punto d'interesse", "punto d interesse",
        "luogo di interesse", "point of interest", "points of interest"
    ]

    /// True se il nome è vuoto/troppo corto o è una frase-placeholder generica.
    static func isGenericPoiName(_ name: String?) -> Bool {
        let n = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if n.count < 2 { return true }
        return genericPoiNames.contains(n)
    }

    /// Il perimetro del bundle nel formato compatto di Poi.footprint. Il campo
    /// può arrivare come oggetto GeoJSON o come testo; qualunque altra cosa
    /// (nil, NSNull) → nil, e il POI resta ai raggi.
    static func footprintCompatto(_ raw: Any?) -> String? {
        if let o = raw as? [String: Any] { return WipSupabaseClient.geojsonCompatto(o) }
        if let s = raw as? String { return WipSupabaseClient.geojsonCompatto(s) }
        return nil
    }

    private let store = PoiStore.shared
    private let session: URLSession

    /// Callback progresso → plugin (stesso payload di notifyProgress Android).
    var onProgress: ((String, Int, Int, String) -> Void)?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        session = URLSession(configuration: config)
    }

    // MARK: - Tempo di esecuzione in background

    /// Un beginBackgroundTask per download, chiuso UNA sola volta (fine,
    /// errore o scadenza concessa dall'OS: qualunque arrivi prima). Non serve
    /// una URLSession background: le pagine sono piccole e sequenziali, e il
    /// checkpoint per pagina copre il caso in cui l'OS revochi il tempo.
    private final class BackgroundTaskHandle {
        /// Stato toccato SOLO sul main: begin/end sono serializzati lì, così
        /// non serve un lock e `UIApplication.shared` resta sul suo thread.
        private var id: UIBackgroundTaskIdentifier = .invalid
        private var chiuso = false

        init(name: String) {
            DispatchQueue.main.async {
                guard !self.chiuso else { return }
                // Alla scadenza si chiude e basta: le richieste in corso
                // verranno ignorate al completamento, e la pagina già scritta
                // resta (checkpoint).
                self.id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
                    self?.end()
                }
            }
        }

        func end() {
            DispatchQueue.main.async {
                self.chiuso = true
                guard self.id != .invalid else { return }
                UIApplication.shared.endBackgroundTask(self.id)
                self.id = .invalid
            }
        }
    }

    // MARK: - API

    func downloadPackage(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        let existing = store.getPackage(id)

        // Resume: un tentativo precedente interrotto (status "downloading" per
        // crash/kill, o "error" per rete caduta) ha già persistito il cursore
        // keyset raggiunto — si riparte da lì invece che da pagina 1. Serve
        // ANCHE la firma del run (pendingRunStartedAt): un checkpoint senza
        // firma non si riprende, si riparte da pagina 1, che costa banda e non
        // perde niente. Mirror di PackageDownloadManager.kt::downloadPackage.
        let isResume: Bool
        if let e = existing {
            isResume = (e.status == "downloading" || e.status == "error")
                && !(e.pendingCursorUpdated ?? "").isEmpty
                && e.pendingRunStartedAt != nil
        } else {
            isResume = false
        }
        // Timbro del run: i due tronconi dello stesso download devono portare
        // lo stesso timbro, altrimenti la potatura finale butterebbe la prima
        // metà.
        let timbroCheckpoint: TimeInterval? = isResume ? existing?.pendingRunStartedAt : nil
        let runStartedAt: TimeInterval = timbroCheckpoint ?? nowMs()

        if let errore = ensureStorageBudget(newPackageId: id) {
            // Lo stato del pacchetto (se esisteva) resta com'era: non si è
            // toccato nulla.
            onProgress?(id, 0, 0, "error")
            completion(.failure(errore))
            return
        }

        var pkg = existing ?? OfflinePackage(
            id: id, name: name, centerLat: lat, centerLon: lon,
            radiusKm: radiusKm, language: language, poiCount: 0, sizeBytes: 0,
            downloadedAt: nowMs(), lastSyncAt: nil, status: "downloading"
        )
        pkg.name = name
        pkg.centerLat = lat
        pkg.centerLon = lon
        pkg.radiusKm = radiusKm
        pkg.language = language
        pkg.status = "downloading"
        pkg.lastUsedAt = nowMs()
        pkg.pendingRunStartedAt = runStartedAt
        if !isResume {
            // Fuori dal resume si riparte da pagina 1: qualunque checkpoint
            // vecchio va buttato, non ereditato; i byte ripartono da zero.
            pkg.pendingCursorUpdated = nil
            pkg.pendingCursorId = nil
            pkg.sizeBytes = 0
        }
        store.upsertPackage(pkg)

        var state = PageState(runStartedAt: runStartedAt)
        if isResume, let e = existing {
            state.cursorUpdated = e.pendingCursorUpdated
            state.cursorId = e.pendingCursorId
            // I byte ripartono dal cumulativo del troncone precedente.
            state.bytes = e.sizeBytes
            // Base del prossimo delta: quella del PRIMO troncone. Usare il
            // generatedAt del troncone finale perderebbe per sempre ciò che è
            // cambiato durante l'interruzione sotto il cursore.
            state.generatedAt = e.lastSyncAt
        }
        runPages(id: id, name: name, lat: lat, lon: lon, radiusKm: radiusKm,
                 language: language, since: nil, state: state, completion: completion)
    }

    /// Delta sync: solo POI modificati dopo lastSyncAt + tombstone.
    ///
    /// Se il pacchetto ha un download pieno interrotto a metà (checkpoint
    /// firmato), il delta non ha senso — mancano ancora POI del primo giro:
    /// si riprende quel download invece di chiedere un delta su una base
    /// incompleta.
    func syncPackage(id: String, completion: @escaping (Result<OfflinePackage, Error>) -> Void) {
        guard let pkg = store.getPackage(id) else {
            completion(.failure(NSError(domain: "wip", code: 404, userInfo: [NSLocalizedDescriptionKey: "Package not found"])))
            return
        }
        if !(pkg.pendingCursorUpdated ?? "").isEmpty, pkg.pendingRunStartedAt != nil {
            NSLog("[WIP] pacchetto \(id): download pieno interrotto, lo riprendo invece del delta")
            downloadPackage(id: pkg.id, name: pkg.name, lat: pkg.centerLat, lon: pkg.centerLon,
                            radiusKm: pkg.radiusKm, language: pkg.language, completion: completion)
            return
        }
        var aggiornato = pkg
        aggiornato.lastUsedAt = nowMs()
        store.upsertPackage(aggiornato)
        runPages(id: pkg.id, name: pkg.name, lat: pkg.centerLat, lon: pkg.centerLon,
                 radiusKm: pkg.radiusKm, language: pkg.language,
                 since: pkg.lastSyncAt, state: PageState(runStartedAt: nowMs()),
                 completion: completion)
    }

    func deletePackage(id: String) {
        store.deletePackage(id)
    }

    func listPackages() -> [OfflinePackage] {
        store.allPackages()
    }

    /// Sync incrementale di TUTTI i pacchetti "ready", uno alla volta (stessa
    /// prudenza del refresh manuale: niente raffiche di download paralleli).
    /// Pacchetti "downloading" (già in corso altrove) o "error" (serve un
    /// nuovo tentativo esplicito dell'utente) sono saltati. Riusa syncPackage
    /// così com'è — nessuna logica di delta duplicata qui, solo l'iterazione.
    /// Chiamato dal refresh opportunistico in background (BGAppRefreshTask,
    /// vedi AppDelegate.swift) per evitare pacchetti offline stantii finché
    /// l'utente non apre l'app e preme "Aggiorna".
    func syncAllPackages(completion: @escaping () -> Void) {
        let ids = listPackages().filter { $0.status == "ready" }.map { $0.id }
        syncNext(ids: ids, index: 0, completion: completion)
    }

    private func syncNext(ids: [String], index: Int, completion: @escaping () -> Void) {
        guard index < ids.count else {
            completion()
            return
        }
        syncPackage(id: ids[index]) { [weak self] _ in
            // Un pacchetto fallito (rete assente, server giù) non deve
            // bloccare gli altri: l'errore è già persistito su status="error"
            // da fail(), qui si prosegue e basta.
            self?.syncNext(ids: ids, index: index + 1, completion: completion)
        }
    }

    // MARK: - Budget di storage (port di ensureStorageBudget Android)

    /// Se lo spazio occupato dai pacchetti supera il tetto, libera evictando i
    /// meno usati di recente (LRU su lastUsedAt, fallback downloadedAt per i
    /// pacchetti salvati prima di questo campo) finché non si scende sotto il
    /// tetto o non resta che il pacchetto in corso — quello non si evict mai,
    /// è ciò che l'utente sta chiedendo adesso. L'occupato COMPRENDE il
    /// pacchetto che si sta (ri)scaricando. Poi, se lo spazio libero reale sul
    /// dispositivo è sotto la soglia, restituisce l'errore invece di lasciare
    /// che il download riempia il disco.
    private func ensureStorageBudget(newPackageId: String) -> Error? {
        let tutti = store.allPackages()
        var occupati = tutti.reduce(Int64(0)) { $0 + $1.sizeBytes }
        let candidati = tutti
            .filter { $0.id != newPackageId }
            .sorted { ($0.lastUsedAt ?? $0.downloadedAt) < ($1.lastUsedAt ?? $1.downloadedAt) }
        for lru in candidati {
            if occupati <= Self.maxOfflineStorageBytes { break }
            NSLog("[WIP] tetto pacchetti offline superato: eviction LRU di \(lru.id) (\(lru.sizeBytes) byte, ultimo uso \(lru.lastUsedAt ?? lru.downloadedAt))")
            store.deletePackage(lru.id)
            occupati -= lru.sizeBytes
        }

        if let liberi = Self.spazioLiberoBytes(), liberi < Self.minFreeDeviceBytes {
            let mb = liberi / (1024 * 1024)
            return NSError(domain: "wip", code: 507, userInfo: [
                NSLocalizedDescriptionKey: "Spazio insufficiente sul dispositivo per il pacchetto offline (\(mb) MB liberi, anche dopo aver rimosso i pacchetti meno usati): libera spazio sul telefono e riprova."
            ])
        }
        return nil
    }

    /// Spazio che iOS è disposto a concedere a dati importanti per l'utente
    /// (comprende ciò che il sistema può liberare da solo, cache comprese).
    /// nil se la lettura fallisce: nel dubbio non si blocca il download.
    private static func spazioLiberoBytes() -> Int64? {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        guard let valori = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]) else {
            return nil
        }
        return valori.volumeAvailableCapacityForImportantUsage
    }

    // MARK: - Paginazione

    private struct PageState {
        /// Timbro del run (epoch ms): firma del checkpoint e dei riferimenti
        /// scritti da questo download pieno.
        let runStartedAt: TimeInterval
        var cursorUpdated: String?
        var cursorId: String?
        var generatedAt: String?
        var total = 0
        var received = 0
        var bytes: Int64 = 0
        /// Il run pieno è stato "aperto" (firma + base delta scritte alla
        /// prima pagina, come OfflineDao.startFullDownloadRun).
        var runAperto = false
        var bgTask: BackgroundTaskHandle?

        init(runStartedAt: TimeInterval) {
            self.runStartedAt = runStartedAt
        }
    }

    private func runPages(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String, since: String?,
        state: PageState,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        var iniziale = state
        iniziale.bgTask = BackgroundTaskHandle(name: "wip-offline-\(id)")
        fetchPage(id: id, name: name, lat: lat, lon: lon, radiusKm: radiusKm,
                  language: language, since: since, state: iniziale, completion: completion)
    }

    private func fetchPage(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String, since: String?,
        state: PageState,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        guard let url = URL(string: Self.bundleUrl) else {
            fail(id: id, state: state, error: URLError(.badURL), completion: completion)
            return
        }
        var payload: [String: Any] = [
            "lat": lat, "lon": lon, "radiusKm": radiusKm,
            "lang": language, "pageSize": Self.pageSize
        ]
        if let since = since { payload["since"] = since }
        if let cu = state.cursorUpdated {
            payload["cursorUpdated"] = cu
            payload["cursorId"] = state.cursorId ?? ""
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.addValue("Itainta-iOS-Native", forHTTPHeaderField: "User-Agent")
        // TOKEN UTENTE (23/08/2026). Dal 23/08 /api/area/bundle lo pretende:
        // la rotta serve nome, descrizione e TESTO INTEGRALE dell'audioguida a
        // pagine da 500, ed era il modo piu' comodo per portarsi via l'intero
        // catalogo. Stesso token del prefetch audio (SecureSessionStore,
        // scritto da setUserContext). Se manca si prova lo stesso: il server
        // risponde 401 e il download fallisce subito con un errore chiaro,
        // invece di scaricare a meta'.
        if let token = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken), !token.isEmpty {
            req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        session.dataTask(with: req) { [weak self] data, response, error in
            guard let self = self else { return }
            if let error = error {
                self.fail(id: id, state: state, error: error, completion: completion)
                return
            }
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data,
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let meta = json["meta"] as? [String: Any] else {
                self.fail(id: id, state: state, error: URLError(.badServerResponse), completion: completion)
                return
            }

            var newState = state
            newState.bytes += Int64(data.count)
            if newState.generatedAt == nil { newState.generatedAt = meta["generatedAt"] as? String }
            newState.total = meta["totalCount"] as? Int ?? newState.total

            // Apertura del run pieno: firma + base del prossimo delta, scritte
            // SUBITO alla prima pagina (come OfflineDao.startFullDownloadRun).
            // Sul resume `generatedAt` è già quello del primo troncone.
            if since == nil && !newState.runAperto {
                newState.runAperto = true
                if var pkg = self.store.getPackage(id) {
                    pkg.pendingRunStartedAt = newState.runStartedAt
                    pkg.lastSyncAt = newState.generatedAt ?? pkg.lastSyncAt
                    self.store.upsertPackage(pkg)
                }
            }

            // Tombstone: POI cancellati sul server → via anche dal locale
            if let tombs = json["tombstones"] as? [String], !tombs.isEmpty {
                self.store.deleteOfflinePois(ids: tombs)
            }

            var pois: [OfflinePoi] = []
            for p in (json["pois"] as? [[String: Any]] ?? []) {
                guard let poiId = p["id"] as? String, !poiId.isEmpty else { continue }
                // GUARDIA DIFENSIVA (allineata ad Android e a poiRepository.ts):
                // mai ingerire nel pacchetto offline POI draft/da-revisionare/
                // rifiutati/nascosti o con nome placeholder generico. Il server
                // già li scarta, ma un bundle vecchio o un delta potrebbe ancora
                // portarne uno (in auto un draft allucinato è arrivato fino alla
                // notifica di arrivo). Il campo `status` lo aggiunge il bundle.
                let status = ((p["status"] as? String) ?? "").lowercased()
                if WipSupabaseClient.hiddenStatuses.contains(status) { continue }
                if (p["is_hidden"] as? Bool) == true { continue }
                if Self.isGenericPoiName(p["nome"] as? String) { continue }
                pois.append(OfflinePoi(
                    id: poiId,
                    nome: p["nome"] as? String ?? "Punto di interesse",
                    lat: (p["lat"] as? NSNumber)?.doubleValue ?? 0,
                    lon: (p["lon"] as? NSNumber)?.doubleValue ?? 0,
                    category: p["category"] as? String,
                    poiType: p["poi_type"] as? String,
                    isGem: p["is_gem"] as? Bool ?? false,
                    alertRadius: p["alert_radius"] as? Int ?? 150,
                    arrivalRadius: p["geofence_radius"] as? Int ?? 50,
                    teaserText: p["teaser_text"] as? String,
                    descriptionShort: p["description_short"] as? String,
                    audioText: p["audio_text"] as? String,
                    updatedAt: p["updated_at"] as? String,
                    // Porta, perimetro e indirizzo (area_bundle_pois dal
                    // 22/08/2026). Pagine di server vecchi non li hanno: restano
                    // nil e il POI lavora al centroide come prima.
                    entranceLat: (p["entrance_lat"] as? NSNumber)?.doubleValue,
                    entranceLon: (p["entrance_lon"] as? NSNumber)?.doubleValue,
                    footprint: Self.footprintCompatto(p["footprint"]),
                    address: p["address"] as? String
                ))
            }
            if !pois.isEmpty {
                // Il timbro: quello del run per il download pieno (serve alla
                // potatura finale), l'ora corrente per il delta — che non
                // pota niente e non deve farsi potare.
                let timbro = since == nil ? newState.runStartedAt : nowMs()
                self.store.upsertOfflinePois(pois, packageId: id, runStamp: timbro)
            }
            newState.received += pois.count
            self.onProgress?(id, newState.received, newState.total, "downloading")

            let next = json["nextCursor"] as? [String: Any]
            newState.cursorUpdated = next?["cursorUpdated"] as? String
            newState.cursorId = next?["cursorId"] as? String

            // CHECKPOINT (solo download pieno): il cursore raggiunto e i byte
            // cumulativi vanno su disco a ogni pagina, così un kill a metà
            // riprende da qui e il tetto di storage vede anche i pacchetti
            // interrotti.
            if since == nil, var pkg = self.store.getPackage(id) {
                pkg.pendingCursorUpdated = newState.cursorUpdated
                pkg.pendingCursorId = newState.cursorId
                pkg.pendingRunStartedAt = newState.runStartedAt
                pkg.sizeBytes = newState.bytes
                self.store.upsertPackage(pkg)
            }

            if let cu = newState.cursorUpdated, !cu.isEmpty {
                self.fetchPage(id: id, name: name, lat: lat, lon: lon,
                               radiusKm: radiusKm, language: language, since: since,
                               state: newState, completion: completion)
            } else {
                self.finish(id: id, name: name, lat: lat, lon: lon,
                            radiusKm: radiusKm, language: language, since: since,
                            state: newState, completion: completion)
            }
        }.resume()
    }

    private func finish(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String, since: String?,
        state: PageState,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        // Flush esplicito PRIMA di leggere il conteggio e di marcare "ready":
        // upsertOfflinePois accumula in memoria e tocca il disco ogni 10
        // pagine, qui si garantisce che l'ultimo batch sia persistito.
        store.flushOfflinePois()
        // Potatura dei riferimenti che questo download pieno non ha
        // riscritto: i POI usciti dall'area. Solo a download pieno
        // COMPLETATO (qui siamo dopo l'ultima pagina).
        if since == nil {
            store.pruneStaleRefs(packageId: id, runStartedAt: state.runStartedAt)
        }
        let existing = store.getPackage(id)
        var pkg = OfflinePackage(
            id: id, name: name, centerLat: lat, centerLon: lon,
            radiusKm: radiusKm, language: language,
            poiCount: store.countPoisForPackage(id),
            // Delta: si somma al totale esistente. Download pieno o resume:
            // `bytes` è già il cumulativo (seminato dal checkpoint).
            sizeBytes: since == nil ? state.bytes : (existing?.sizeBytes ?? 0) + state.bytes,
            downloadedAt: existing?.downloadedAt ?? nowMs(),
            // generatedAt della prima pagina: i cambi avvenuti DURANTE il
            // download verranno ripresi dal prossimo delta, mai persi.
            lastSyncAt: state.generatedAt ?? since,
            status: "ready"
        )
        pkg.lastUsedAt = nowMs()
        // Download completato: nessun checkpoint pendente da riprendere.
        pkg.pendingCursorUpdated = nil
        pkg.pendingCursorId = nil
        pkg.pendingRunStartedAt = nil
        store.upsertPackage(pkg)
        onProgress?(id, state.received, state.total, "ready")
        state.bgTask?.end()
        completion(.success(pkg))
    }

    private func fail(id: String, state: PageState, error: Error, completion: @escaping (Result<OfflinePackage, Error>) -> Void) {
        // Anche su errore/annullamento le pagine già scaricate non si buttano:
        // si scrivono su disco, così il prossimo tentativo riparte da lì
        // invece di rifare tutto (il checkpoint per pagina è già persistito).
        store.flushOfflinePois()
        if var pkg = store.getPackage(id) {
            pkg.status = "error"
            store.upsertPackage(pkg)
        }
        onProgress?(id, state.received, state.total, "error")
        state.bgTask?.end()
        completion(.failure(error))
    }
}
