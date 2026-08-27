import Foundation
import CoreLocation
import UIKit
import SQLite3

/// SQLITE_TRANSIENT non è esposto in Swift (è una macro C): dice a SQLite di
/// COPIARE la stringa passata a sqlite3_bind_text invece di tenerne il
/// puntatore, che in Swift è valido solo per la durata della chiamata. Senza,
/// si legge memoria liberata.
private let wipSqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/**
 * Persistenza nativa iOS: sostituisce SharedPreferences ("ItaintaPrefs") e il
 * Room DB Android (poi_cache, trigger_state, offline_packages, offline_pois,
 * offline_spend_ledger). Le chiavi restano identiche ad Android così i metodi
 * del plugin espongono gli stessi dati al JS.
 *
 * Volumi: la cache radar è ≤120 POI, i pacchetti offline qualche migliaio di
 * POI l'uno. Tutto è JSON su file in Application Support tranne UNA tabella:
 * `offline_pois`, che porta i testi integrali (audioText + descriptionShort,
 * 2-5 KB per POI) ed è passata a SQLite — vedi "POI offline su SQLite" più
 * sotto. Con 5.000 POI il dizionario in RAM valeva 15-25 MB permanenti in un
 * processo che deve sopravvivere in background, dove iOS uccide chi consuma.
 */
final class PoiStore {
    static let shared = PoiStore()

    let prefs = UserDefaults.standard
    private let queue = DispatchQueue(label: "com.itaintasca.poistore")

    private let baseDir: URL
    private let poiCacheFile: URL
    private let triggerFile: URL
    private let packagesFile: URL
    private let offlinePoisFile: URL
    private let offlinePoisDbFile: URL
    private let refsFile: URL
    private let ledgerFile: URL

    // Cache in memoria (caricata pigramente, scritta su disco a ogni mutazione;
    // unica eccezione i riferimenti dei POI offline in fase di download,
    // scritti a batch — vedi upsertOfflinePois/flushOfflinePois)
    private var poiCache: [String: Poi] = [:]
    private var triggerStates: [String: TriggerStateRecord] = [:]
    private var packages: [String: OfflinePackage] = [:]
    /// SOLO percorso di ripiego: resta vuoto quando SQLite è attivo (`sqliteReady`).
    /// È il vecchio dizionario integrale, usato ancora se il DB non si apre o se
    /// la migrazione non è andata a buon fine, così il comportamento è
    /// esattamente quello di prima e nessun pacchetto si perde.
    private var offlinePois: [String: OfflinePoi] = [:]
    /// packageId → set di poiId (offline_package_pois)
    private var packageRefs: [String: Set<String>] = [:]
    private var spendLedger: [SpendEntry] = []
    private var loaded = false

    /// Scrittura differita dei POI offline (vedi `upsertOfflinePois`): quante
    /// pagine di download sono state assorbite in memoria senza aver ancora
    /// riscritto offline_pois.json / offline_refs.json. >0 significa "il disco
    /// è indietro rispetto alla RAM": va fatto un flush.
    private var offlinePendingPages = 0
    /// Ogni quante pagine si tocca il disco. 10 pagine × 500 POI = al più
    /// 5.000 POI da riscaricare se l'app viene uccisa fra due flush, contro un
    /// costo IO diviso per 10 su un'area grande.
    private static let offlineFlushEveryPages = 10

    // MARK: POI offline su SQLite
    //
    // Connessione al DB dei POI offline. `sqliteReady == true` significa: DB
    // aperto, schema creato e migrazione dal JSON confermata → i POI offline
    // NON stanno più in RAM, si leggono on-demand. `false` = si continua col
    // vecchio dizionario JSON, identico a prima.
    private var db: OpaquePointer?
    private var sqliteReady = false
    /// Flag di migrazione una tantum (UserDefaults, non un file: sopravvive a
    /// qualunque quarantena).
    private static let prefOfflineSqliteMigrated = "wip_offline_pois_sqlite_v1"
    /// Le 17 colonne, sempre in QUESTO ordine: gli indici di lettura in
    /// `offlinePoiFromRow` e i segnaposto di `insertOfflineLocked` ci contano.
    private static let offlineColumns = """
    id, nome, lat, lon, category, poi_type, is_gem, alert_radius, arrival_radius, \
    teaser_text, description_short, audio_text, updated_at, entrance_lat, \
    entrance_lon, footprint, address
    """

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        baseDir = support.appendingPathComponent("itainta", isDirectory: true)
        try? FileManager.default.createDirectory(at: baseDir, withIntermediateDirectories: true)
        poiCacheFile = baseDir.appendingPathComponent("poi_cache.json")
        triggerFile = baseDir.appendingPathComponent("trigger_state.json")
        packagesFile = baseDir.appendingPathComponent("offline_packages.json")
        offlinePoisFile = baseDir.appendingPathComponent("offline_pois.json")
        offlinePoisDbFile = baseDir.appendingPathComponent("offline_pois.sqlite")
        refsFile = baseDir.appendingPathComponent("offline_refs.json")
        ledgerFile = baseDir.appendingPathComponent("spend_ledger.json")

        // Rete di sicurezza per la scrittura differita dei POI offline: se
        // l'app passa in background o sta per essere terminata mentre un
        // download è in corso, le pagine accumulate in memoria finiscono su
        // disco invece di essere perse. Nessun effetto se non c'è nulla in
        // sospeso (flushOfflinePois esce subito).
        let flush: (Notification) -> Void = { [weak self] _ in self?.flushOfflinePois() }
        _ = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: nil, using: flush
        )
        _ = NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil, queue: nil, using: flush
        )
    }

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        poiCache = readFile(poiCacheFile) ?? [:]
        triggerStates = readFile(triggerFile) ?? [:]
        packages = readFile(packagesFile) ?? [:]
        packageRefs = readFile(refsFile) ?? [:]
        spendLedger = readFile(ledgerFile) ?? []
        openOfflineDbLocked()
        if !sqliteReady {
            // Ripiego: SQLite non disponibile → si lavora come prima, con
            // l'intero dizionario in RAM. Il JSON non viene mai cancellato
            // proprio perché questo ramo resti sempre percorribile.
            offlinePois = readFile(offlinePoisFile) ?? [:]
        }
    }

    /// Prima un `try?` unico ingoiava qualunque errore (file assente, permessi,
    /// JSON corrotto) azzerando in silenzio l'intera categoria (es. tutti i
    /// pacchetti offline, o tutto il trigger state) senza log né possibilità di
    /// recupero. Ora: file assente = normale (prima esecuzione), nessun log;
    /// qualunque altro errore di lettura viene loggato; un JSON presente ma
    /// corrotto viene messo in quarantena (rinominato) invece di essere perso,
    /// e SOLO quella categoria riparte vuota.
    private func readFile<T: Decodable>(_ url: URL) -> T? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            print("[PoiStore] lettura fallita per \(url.lastPathComponent): \(error.localizedDescription)")
            return nil
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            print("[PoiStore] JSON corrotto in \(url.lastPathComponent) (\(error)): metto in quarantena, riparto vuoto solo per questa categoria.")
            quarantineCorruptedFile(url)
            return nil
        }
    }

    /// Rinomina un file JSON corrotto con suffisso .corrupted-<timestamp>
    /// invece di lasciarlo perdere/sovrascrivere silenziosamente al prossimo
    /// writeFile: resta recuperabile per debug lato supporto.
    private func quarantineCorruptedFile(_ url: URL) {
        let suffix = Int(Date().timeIntervalSince1970)
        let quarantined = url.deletingLastPathComponent()
            .appendingPathComponent("\(url.lastPathComponent).corrupted-\(suffix)")
        do {
            try FileManager.default.moveItem(at: url, to: quarantined)
        } catch {
            print("[PoiStore] impossibile mettere in quarantena \(url.lastPathComponent): \(error.localizedDescription)")
        }
    }

    private func writeFile<T: Encodable>(_ value: T, to url: URL) {
        if let data = try? JSONEncoder().encode(value) {
            try? data.write(to: url, options: .atomic)
        }
    }

    // MARK: - POI offline: apertura DB e migrazione dal JSON
    //
    // Perché SQLite solo qui: gli OfflinePoi portano i testi integrali
    // dell'audioguida e tenerli tutti in RAM costava 15-25 MB permanenti su un
    // pacchetto grande. Ora in memoria non resta nulla: id, coordinate e testi
    // si leggono a richiesta. Niente dipendenze nuove (SQLite3 è di sistema,
    // il Podfile non si tocca), niente file nuovi nel progetto Xcode.
    //
    // GARANZIA SUI DATI ESISTENTI: offline_pois.json NON viene mai cancellato
    // né rinominato. La migrazione lo LEGGE e basta; se il DB non si apre, se
    // lo schema non si crea o se la migrazione non è confermata, `sqliteReady`
    // resta false e tutto continua a funzionare esattamente come prima sul
    // JSON. Un pacchetto già scaricato non va mai riscaricato.

    private func openOfflineDbLocked() {
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(offlinePoisDbFile.path, &handle, flags, nil) == SQLITE_OK,
              let opened = handle else {
            if let handle = handle { sqlite3_close(handle) }
            print("[PoiStore] SQLite non apribile: resto sul JSON dei POI offline.")
            return
        }
        db = opened

        // PROTEZIONE DATI: il DB deve restare leggibile A TELEFONO BLOCCATO
        // (23/08/2026). È il punto in cui questa app si gioca tutto: il
        // servizio di geofencing lavora con lo schermo spento e il telefono in
        // tasca, e se iOS cifra il file rendendolo inaccessibile mentre è
        // bloccato, l'audioguida offline tace proprio quando serve — un guasto
        // che in prova con l'app aperta non si vede MAI.
        // `.completeUntilFirstUserAuthentication` è la classe giusta: il file
        // è cifrato a riposo e diventa leggibile dopo il primo sblocco
        // successivo all'accensione, per sempre, anche a schermo bloccato.
        // Si applica a tutti e tre i file di SQLite: il journal WAL e lo
        // shared-memory ereditano la classe del database solo se creati dopo,
        // quindi si impostano esplicitamente quando esistono.
        let protezione: [FileAttributeKey: Any] = [
            .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
        ]
        for suffisso in ["", "-wal", "-shm"] {
            let percorso = offlinePoisDbFile.path + suffisso
            guard FileManager.default.fileExists(atPath: percorso) else { continue }
            do {
                try FileManager.default.setAttributes(protezione, ofItemAtPath: percorso)
            } catch {
                // Fail-open: se non si può impostare, il DB resta comunque
                // utilizzabile ad app sbloccata. Si annota e si prosegue.
                print("[PoiStore] Protezione dati non impostata su \(suffisso.isEmpty ? "db" : suffisso): \(error.localizedDescription)")
            }
        }

        let schema = """
        CREATE TABLE IF NOT EXISTS offline_pois (
          id TEXT PRIMARY KEY NOT NULL,
          nome TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          category TEXT,
          poi_type TEXT,
          is_gem INTEGER NOT NULL DEFAULT 0,
          alert_radius INTEGER NOT NULL DEFAULT 150,
          arrival_radius INTEGER NOT NULL DEFAULT 50,
          teaser_text TEXT,
          description_short TEXT,
          audio_text TEXT,
          updated_at TEXT,
          entrance_lat REAL,
          entrance_lon REAL,
          footprint TEXT,
          address TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_offline_pois_latlon ON offline_pois (lat, lon);
        """
        guard execLocked(schema) else {
            closeOfflineDbLocked()
            print("[PoiStore] schema SQLite non creato: resto sul JSON dei POI offline.")
            return
        }
        sqliteReady = true
        migrateOfflineJsonIfNeededLocked()
    }

    private func closeOfflineDbLocked() {
        if let db = db { sqlite3_close(db) }
        db = nil
        sqliteReady = false
    }

    /// Migrazione una tantum JSON → SQLite. Il flag sta in UserDefaults, quindi
    /// non può essere perso da una quarantena di file. Se qualcosa va storto si
    /// torna al JSON (`sqliteReady = false`) senza toccare nulla su disco: al
    /// prossimo avvio si riprova, e gli INSERT sono idempotenti (OR REPLACE).
    private func migrateOfflineJsonIfNeededLocked() {
        guard sqliteReady, !prefs.bool(forKey: Self.prefOfflineSqliteMigrated) else { return }
        guard FileManager.default.fileExists(atPath: offlinePoisFile.path) else {
            prefs.set(true, forKey: Self.prefOfflineSqliteMigrated) // installazione nuova: niente da migrare
            return
        }
        guard let legacy: [String: OfflinePoi] = readFile(offlinePoisFile), !legacy.isEmpty else {
            // File assente, illeggibile o vuoto: niente da migrare. Se era
            // corrotto readFile lo ha già messo in quarantena, e comunque non
            // sarebbe stato leggibile nemmeno prima.
            prefs.set(true, forKey: Self.prefOfflineSqliteMigrated)
            return
        }
        let rows = Array(legacy.values)
        guard insertOfflineLocked(rows), countOfflineLocked() >= rows.count else {
            print("[PoiStore] migrazione dei POI offline su SQLite fallita: continuo sul JSON, riprovo al prossimo avvio.")
            closeOfflineDbLocked()
            return
        }
        prefs.set(true, forKey: Self.prefOfflineSqliteMigrated)
        print("[PoiStore] migrati \(rows.count) POI offline su SQLite; offline_pois.json conservato come copia di sicurezza.")
    }

    // MARK: - POI offline: helper SQLite (da chiamare tenendo `queue`)

    @discardableResult
    private func execLocked(_ sql: String) -> Bool {
        guard let db = db else { return false }
        var errMsg: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errMsg) != SQLITE_OK {
            print("[PoiStore] SQL fallito: \(errMsg.map { String(cString: $0) } ?? "errore sconosciuto")")
            sqlite3_free(errMsg)
            return false
        }
        return true
    }

    private func bindText(_ stmt: OpaquePointer?, _ idx: Int32, _ value: String?) {
        if let value = value {
            sqlite3_bind_text(stmt, idx, value, -1, wipSqliteTransient)
        } else {
            sqlite3_bind_null(stmt, idx)
        }
    }

    private func bindDouble(_ stmt: OpaquePointer?, _ idx: Int32, _ value: Double?) {
        if let value = value {
            sqlite3_bind_double(stmt, idx, value)
        } else {
            sqlite3_bind_null(stmt, idx)
        }
    }

    private func columnText(_ stmt: OpaquePointer?, _ idx: Int32) -> String? {
        guard let raw = sqlite3_column_text(stmt, idx) else { return nil }
        return String(cString: raw)
    }

    private func columnDouble(_ stmt: OpaquePointer?, _ idx: Int32) -> Double? {
        guard sqlite3_column_type(stmt, idx) != SQLITE_NULL else { return nil }
        return sqlite3_column_double(stmt, idx)
    }

    /// Ricostruisce un OfflinePoi da una riga letta con l'ordine di
    /// `offlineColumns`. I default (nome, raggi) sono gli stessi del bundle.
    private func offlinePoiFromRow(_ stmt: OpaquePointer?) -> OfflinePoi? {
        guard let id = columnText(stmt, 0), !id.isEmpty else { return nil }
        return OfflinePoi(
            id: id,
            nome: columnText(stmt, 1) ?? "Punto di interesse",
            lat: sqlite3_column_double(stmt, 2),
            lon: sqlite3_column_double(stmt, 3),
            category: columnText(stmt, 4),
            poiType: columnText(stmt, 5),
            isGem: sqlite3_column_int(stmt, 6) != 0,
            alertRadius: Int(sqlite3_column_int(stmt, 7)),
            arrivalRadius: Int(sqlite3_column_int(stmt, 8)),
            teaserText: columnText(stmt, 9),
            descriptionShort: columnText(stmt, 10),
            audioText: columnText(stmt, 11),
            updatedAt: columnText(stmt, 12),
            entranceLat: columnDouble(stmt, 13),
            entranceLon: columnDouble(stmt, 14),
            footprint: columnText(stmt, 15),
            address: columnText(stmt, 16)
        )
    }

    /// INSERT OR REPLACE di una pagina intera in UNA transazione: o entra
    /// tutta o non entra niente. Ritorna false su qualunque errore (il
    /// chiamante lo logga, i dati già presenti restano intatti).
    private func insertOfflineLocked(_ pois: [OfflinePoi]) -> Bool {
        guard let db = db else { return false }
        guard !pois.isEmpty else { return true }
        guard execLocked("BEGIN IMMEDIATE;") else { return false }
        let sql = """
        INSERT OR REPLACE INTO offline_pois (\(Self.offlineColumns))
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17);
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            execLocked("ROLLBACK;")
            return false
        }
        defer { sqlite3_finalize(stmt) }
        for p in pois {
            sqlite3_reset(stmt)
            sqlite3_clear_bindings(stmt)
            bindText(stmt, 1, p.id)
            bindText(stmt, 2, p.nome)
            sqlite3_bind_double(stmt, 3, p.lat)
            sqlite3_bind_double(stmt, 4, p.lon)
            bindText(stmt, 5, p.category)
            bindText(stmt, 6, p.poiType)
            sqlite3_bind_int(stmt, 7, p.isGem ? 1 : 0)
            // `clamping` e non `Int32(...)`: i raggi arrivano da JSON, un
            // valore assurdo non deve far crashare il salvataggio.
            sqlite3_bind_int(stmt, 8, Int32(clamping: p.alertRadius))
            sqlite3_bind_int(stmt, 9, Int32(clamping: p.arrivalRadius))
            bindText(stmt, 10, p.teaserText)
            bindText(stmt, 11, p.descriptionShort)
            bindText(stmt, 12, p.audioText)
            bindText(stmt, 13, p.updatedAt)
            bindDouble(stmt, 14, p.entranceLat)
            bindDouble(stmt, 15, p.entranceLon)
            bindText(stmt, 16, p.footprint)
            bindText(stmt, 17, p.address)
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                print("[PoiStore] insert POI offline fallito per \(p.id)")
                execLocked("ROLLBACK;")
                return false
            }
        }
        return execLocked("COMMIT;")
    }

    @discardableResult
    private func deleteOfflineLocked(ids: [String]) -> Bool {
        guard let db = db else { return false }
        guard !ids.isEmpty else { return true }
        guard execLocked("BEGIN IMMEDIATE;") else { return false }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "DELETE FROM offline_pois WHERE id = ?1;", -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            execLocked("ROLLBACK;")
            return false
        }
        defer { sqlite3_finalize(stmt) }
        for id in ids {
            sqlite3_reset(stmt)
            sqlite3_clear_bindings(stmt)
            bindText(stmt, 1, id)
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                execLocked("ROLLBACK;")
                return false
            }
        }
        return execLocked("COMMIT;")
    }

    private func countOfflineLocked() -> Int {
        guard let db = db else { return 0 }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM offline_pois;", -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            return 0
        }
        defer { sqlite3_finalize(stmt) }
        return sqlite3_step(stmt) == SQLITE_ROW ? Int(sqlite3_column_int64(stmt, 0)) : 0
    }

    private func selectOfflinePoiLocked(id: String) -> OfflinePoi? {
        guard let db = db else { return nil }
        var stmt: OpaquePointer?
        let sql = "SELECT \(Self.offlineColumns) FROM offline_pois WHERE id = ?1 LIMIT 1;"
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            return nil
        }
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return offlinePoiFromRow(stmt)
    }

    /// Legge UNA colonna di testo senza materializzare l'intero POI: è la
    /// ragione per cui i testi non stanno più in RAM. `column` è sempre una
    /// costante interna, mai input esterno.
    private func selectOfflineTextLocked(id: String, column: String) -> String? {
        guard let db = db else { return nil }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT \(column) FROM offline_pois WHERE id = ?1 LIMIT 1;", -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            return nil
        }
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return columnText(stmt, 0)
    }

    /// Finestra offline via riquadro lat/lon (l'indice fa il lavoro), poi
    /// distanza esatta solo sulle poche righe rimaste. Sostituisce lo scan
    /// lineare che allocava un CLLocation per ogni POI a ogni chiamata.
    private func selectOfflineNearLocked(lat: Double, lon: Double, radiusM: Double) -> [OfflinePoi] {
        guard let db = db else { return [] }
        let dLat = radiusM / 111_320.0
        // Vicino ai poli il coseno tende a 0 e il riquadro esploderebbe: sotto
        // una soglia si rinuncia al filtro sulla longitudine (lo fa comunque il
        // controllo esatto dopo).
        let cosLat = cos(lat * .pi / 180)
        let dLon = cosLat > 0.01 ? radiusM / (111_320.0 * cosLat) : 360.0
        let minLon = lon - dLon
        let maxLon = lon + dLon
        // Antimeridiano: se il riquadro esce da [-180,180] il BETWEEN non
        // troverebbe nulla → si filtra solo per latitudine, come prima.
        let lonWraps = minLon < -180 || maxLon > 180
        let sql = lonWraps
            ? "SELECT \(Self.offlineColumns) FROM offline_pois WHERE lat BETWEEN ?1 AND ?2;"
            : "SELECT \(Self.offlineColumns) FROM offline_pois WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            sqlite3_finalize(stmt)
            return []
        }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_double(stmt, 1, lat - dLat)
        sqlite3_bind_double(stmt, 2, lat + dLat)
        if !lonWraps {
            sqlite3_bind_double(stmt, 3, minLon)
            sqlite3_bind_double(stmt, 4, maxLon)
        }
        let center = CLLocation(latitude: lat, longitude: lon)
        var out: [OfflinePoi] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let p = offlinePoiFromRow(stmt) else { continue }
            if CLLocation(latitude: p.lat, longitude: p.lon).distance(from: center) <= radiusM {
                out.append(p)
            }
        }
        return out
    }

    // MARK: - poi_cache (radar online/offline)

    func insertPois(_ pois: [Poi]) {
        queue.sync {
            loadIfNeeded()
            for p in pois { poiCache[p.id] = p }
            writeFile(poiCache, to: poiCacheFile)
        }
    }

    func getPoi(_ id: String) -> Poi? {
        queue.sync { loadIfNeeded(); return poiCache[id] }
    }

    // MARK: - trigger_state

    func getTriggerState(_ poiId: String) -> TriggerStateRecord? {
        queue.sync { loadIfNeeded(); return triggerStates[poiId] }
    }

    func setTriggerState(_ poiId: String, _ state: TriggerState) {
        queue.sync {
            loadIfNeeded()
            triggerStates[poiId] = TriggerStateRecord(state: state, updatedAt: nowMs())
            writeFile(triggerStates, to: triggerFile)
        }
    }

    func deleteTriggerState(_ poiId: String) {
        queue.sync {
            loadIfNeeded()
            triggerStates.removeValue(forKey: poiId)
            writeFile(triggerStates, to: triggerFile)
        }
    }

    func allTriggerStates() -> [String: TriggerStateRecord] {
        queue.sync { loadIfNeeded(); return triggerStates }
    }

    /// Azzera TUTTO lo storico trigger: dopo, ogni POI viene riannunciato come
    /// la prima volta. Port di poiDao().clearTriggerStates() Android, chiamato
    /// dal plugin resetTriggerHistory (ProfileScreen → "Azzera storico").
    func clearTriggerStates() {
        queue.sync {
            loadIfNeeded()
            triggerStates.removeAll()
            writeFile(triggerStates, to: triggerFile)
        }
    }

    // MARK: - Pacchetti offline

    func upsertPackage(_ pkg: OfflinePackage) {
        queue.sync {
            loadIfNeeded()
            packages[pkg.id] = pkg
            writeFile(packages, to: packagesFile)
        }
    }

    func getPackage(_ id: String) -> OfflinePackage? {
        queue.sync { loadIfNeeded(); return packages[id] }
    }

    func allPackages() -> [OfflinePackage] {
        queue.sync { loadIfNeeded(); return Array(packages.values).sorted { $0.downloadedAt > $1.downloadedAt } }
    }

    /// Riscrive su disco i riferimenti pacchetto→POI (e, solo nel ripiego
    /// senza SQLite, anche il dizionario integrale dei POI). Da chiamare SEMPRE
    /// mentre si tiene `queue`. Azzera il contatore delle pagine in sospeso:
    /// dopo, disco e RAM coincidono.
    /// Con SQLite attivo offline_pois.json NON viene mai riscritto: resta la
    /// fotografia pre-migrazione, copia di sicurezza dei pacchetti già
    /// scaricati.
    private func writeOfflineFilesLocked() {
        if !sqliteReady { writeFile(offlinePois, to: offlinePoisFile) }
        writeFile(packageRefs, to: refsFile)
        offlinePendingPages = 0
    }

    /// Scrittura differita: prima ogni pagina scaricata (500 POI) riscriveva
    /// per intero offlinePois + packageRefs (JSON encode + write .atomic
    /// dell'intero dizionario), con costo IO superlineare sul numero di pagine
    /// di un'area grande — 35 MB di dati salvati ne scrivevano ~350.
    /// Ora si accumula in memoria e si tocca il disco ogni
    /// `offlineFlushEveryPages` pagine; la scrittura parte con `queue.async`
    /// sulla STESSA coda seriale, così non blocca il chiamante (il callback di
    /// rete) ma resta ordinata rispetto a tutte le altre letture/scritture:
    /// nessun lettore può vedere uno stato a metà, nessuna scrittura può
    /// sorpassarne un'altra e riportare indietro il file.
    /// La garanzia di resilienza documentata in WipPackageDownloadManager
    /// ("ogni pagina viene scritta subito") resta grazie al flush esplicito in
    /// finish()/fail(): un'uccisione dell'app a metà download fa perdere al
    /// più un batch di pagine, mai l'intero progresso. La scrittura è `.atomic`
    /// (file temporaneo + rename), quindi un'uscita anomala non può lasciare un
    /// JSON troncato: si trova o la versione vecchia o quella nuova, e la
    /// quarantena dei file corrotti resta l'ultima rete di sicurezza.
    func upsertOfflinePois(_ pois: [OfflinePoi], packageId: String) {
        queue.sync {
            loadIfNeeded()
            if sqliteReady {
                // Con SQLite la pagina va su disco SUBITO, in una transazione:
                // costa quanto la pagina, non quanto l'intero pacchetto. A
                // essere differita resta solo la mappa dei riferimenti (JSON).
                if !insertOfflineLocked(pois) {
                    print("[PoiStore] pagina di POI offline non salvata (\(pois.count) POI): il pacchetto resterà incompleto.")
                }
            } else {
                for p in pois { offlinePois[p.id] = p }
            }
            var refs = packageRefs[packageId] ?? []
            refs.formUnion(pois.map { $0.id })
            packageRefs[packageId] = refs
            offlinePendingPages += 1
            guard offlinePendingPages >= Self.offlineFlushEveryPages else { return }
            // Il contatore va azzerato SUBITO (dentro il lock) altrimenti le
            // pagine successive rischierebbero di accodare un secondo flush
            // prima che il primo sia partito.
            offlinePendingPages = 0
            queue.async { [weak self] in
                guard let self = self else { return }
                self.writeOfflineFilesLocked()
            }
        }
    }

    /// Forza la scrittura su disco dei POI offline accumulati in memoria.
    /// Sincrona: quando ritorna, il disco è allineato. Da chiamare a fine
    /// download e su ogni percorso di errore/annullamento
    /// (WipPackageDownloadManager.finish/fail). Se non c'è nulla in sospeso non
    /// tocca il disco.
    func flushOfflinePois() {
        queue.sync {
            guard loaded, offlinePendingPages > 0 else { return }
            writeOfflineFilesLocked()
        }
    }

    func deleteOfflinePois(ids: [String]) {
        queue.sync {
            loadIfNeeded()
            if sqliteReady { deleteOfflineLocked(ids: ids) }
            for id in ids {
                offlinePois.removeValue(forKey: id)
                for (pkgId, var refs) in packageRefs where refs.contains(id) {
                    refs.remove(id)
                    packageRefs[pkgId] = refs
                }
            }
            // Scrittura immediata (non differita): una cancellazione deve
            // essere durevole subito, e allinea anche le pagine in sospeso.
            writeOfflineFilesLocked()
        }
    }

    func deletePackage(_ id: String) {
        queue.sync {
            loadIfNeeded()
            let refs = packageRefs.removeValue(forKey: id) ?? []
            packages.removeValue(forKey: id)
            // deleteOrphanPois: rimuove i POI non più referenziati da alcun pacchetto
            let stillReferenced = Set(packageRefs.values.flatMap { $0 })
            let orphans = refs.filter { !stillReferenced.contains($0) }
            if sqliteReady {
                deleteOfflineLocked(ids: Array(orphans))
            } else {
                for poiId in orphans { offlinePois.removeValue(forKey: poiId) }
            }
            writeFile(packages, to: packagesFile)
            writeOfflineFilesLocked()
        }
    }

    func countPoisForPackage(_ id: String) -> Int {
        queue.sync { loadIfNeeded(); return packageRefs[id]?.count ?? 0 }
    }

    func getOfflinePoi(_ id: String) -> OfflinePoi? {
        queue.sync {
            loadIfNeeded()
            return sqliteReady ? selectOfflinePoiLocked(id: id) : offlinePois[id]
        }
    }

    // MARK: - Testi offline con controllo lingua
    //
    // Gli OfflinePoi non portano un campo lingua PER RIGA: la lingua è quella
    // del PACCHETTO che li contiene (offline_packages.language). Un utente EN
    // che passa accanto a un POI di un pacchetto IT non deve sentire il testo
    // italiano letto con voce inglese: se il pacchetto NON è nella lingua
    // richiesta il chiamante prende il testo giusto dal cloud (get-or-create
    // per-lingua). Mirror del comportamento web/Android.

    /// True SOLO se si conosce con certezza che il POI proviene da pacchetti in
    /// una lingua DIVERSA da `lang`. Se nessun pacchetto lo referenzia (lingua
    /// ignota) → false: non blocca, meglio usare il testo locale che tacere.
    /// Da chiamare mentre si tiene `queue`.
    private func offlineLangConflictsLocked(_ poiId: String, lang: String) -> Bool {
        let target = lang.lowercased()
        var known = false
        for (pkgId, refs) in packageRefs where refs.contains(poiId) {
            if let l = packages[pkgId]?.language.lowercased() {
                if l == target { return false } // almeno un pacchetto è nella lingua giusta
                known = true
            }
        }
        return known // pacchetti trovati ma nessuno nella lingua richiesta
    }

    /// audio_text del pacchetto offline, ma solo se la lingua NON è in conflitto
    /// con `lang`; altrimenti nil → il chiamante recupera il testo nella lingua
    /// giusta da WipSupabaseClient.fetchAudioguideText.
    func getOfflineAudioText(_ poiId: String, lang: String) -> String? {
        queue.sync {
            loadIfNeeded()
            let text = sqliteReady
                ? selectOfflineTextLocked(id: poiId, column: "audio_text")
                : offlinePois[poiId]?.audioText
            guard let t = text, !t.isEmpty else { return nil }
            return offlineLangConflictsLocked(poiId, lang: lang) ? nil : t
        }
    }

    /// description_short del pacchetto offline con lo stesso controllo lingua:
    /// evita di accodare testo di un'altra lingua alla coda dell'audioguida.
    func getOfflineDescriptionShort(_ poiId: String, lang: String) -> String? {
        queue.sync {
            loadIfNeeded()
            let text = sqliteReady
                ? selectOfflineTextLocked(id: poiId, column: "description_short")
                : offlinePois[poiId]?.descriptionShort
            guard let t = text, !t.isEmpty else { return nil }
            return offlineLangConflictsLocked(poiId, lang: lang) ? nil : t
        }
    }

    /// Finestra offline: POI dei pacchetti dentro il raggio dato (equivalente
    /// della query R-tree bbox di OfflineRtree). Con SQLite è un riquadro
    /// lat/lon sull'indice più il controllo esatto sulle poche righe rimaste;
    /// nel ripiego resta lo scan lineare di prima. Stesso risultato.
    func offlinePoisNear(lat: Double, lon: Double, radiusM: Double) -> [OfflinePoi] {
        queue.sync {
            loadIfNeeded()
            if sqliteReady {
                return selectOfflineNearLocked(lat: lat, lon: lon, radiusM: radiusM)
            }
            let center = CLLocation(latitude: lat, longitude: lon)
            return offlinePois.values.filter { p in
                CLLocation(latitude: p.lat, longitude: p.lon).distance(from: center) <= radiusM
            }
        }
    }

    // MARK: - Registro spese offline

    func insertSpend(_ entry: SpendEntry) {
        queue.sync {
            loadIfNeeded()
            spendLedger.append(entry)
            writeFile(spendLedger, to: ledgerFile)
        }
    }

    func pendingSpendCredits() -> Int {
        queue.sync { loadIfNeeded(); return spendLedger.reduce(0) { $0 + $1.credits } }
    }

    func pendingSpendCount() -> Int {
        queue.sync { loadIfNeeded(); return spendLedger.count }
    }

    func clearSpendLedger() {
        queue.sync {
            loadIfNeeded()
            spendLedger.removeAll()
            writeFile(spendLedger, to: ledgerFile)
        }
    }
}
