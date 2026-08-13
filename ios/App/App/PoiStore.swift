import Foundation
import CoreLocation

/**
 * Persistenza nativa iOS: sostituisce SharedPreferences ("ItaintaPrefs") e il
 * Room DB Android (poi_cache, trigger_state, offline_packages, offline_pois,
 * offline_spend_ledger). Le chiavi restano identiche ad Android così i metodi
 * del plugin espongono gli stessi dati al JS.
 *
 * Volumi: la cache radar è ≤120 POI, i pacchetti offline qualche migliaio di
 * POI l'uno — JSON su file in Application Support è sufficiente, niente SQLite.
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
    private let refsFile: URL
    private let ledgerFile: URL

    // Cache in memoria (caricata pigramente, scritta su disco a ogni mutazione)
    private var poiCache: [String: Poi] = [:]
    private var triggerStates: [String: TriggerStateRecord] = [:]
    private var packages: [String: OfflinePackage] = [:]
    private var offlinePois: [String: OfflinePoi] = [:]
    /// packageId → set di poiId (offline_package_pois)
    private var packageRefs: [String: Set<String>] = [:]
    private var spendLedger: [SpendEntry] = []
    private var loaded = false

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        baseDir = support.appendingPathComponent("itainta", isDirectory: true)
        try? FileManager.default.createDirectory(at: baseDir, withIntermediateDirectories: true)
        poiCacheFile = baseDir.appendingPathComponent("poi_cache.json")
        triggerFile = baseDir.appendingPathComponent("trigger_state.json")
        packagesFile = baseDir.appendingPathComponent("offline_packages.json")
        offlinePoisFile = baseDir.appendingPathComponent("offline_pois.json")
        refsFile = baseDir.appendingPathComponent("offline_refs.json")
        ledgerFile = baseDir.appendingPathComponent("spend_ledger.json")
    }

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        poiCache = readFile(poiCacheFile) ?? [:]
        triggerStates = readFile(triggerFile) ?? [:]
        packages = readFile(packagesFile) ?? [:]
        offlinePois = readFile(offlinePoisFile) ?? [:]
        packageRefs = readFile(refsFile) ?? [:]
        spendLedger = readFile(ledgerFile) ?? []
    }

    private func readFile<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func writeFile<T: Encodable>(_ value: T, to url: URL) {
        if let data = try? JSONEncoder().encode(value) {
            try? data.write(to: url, options: .atomic)
        }
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

    func upsertOfflinePois(_ pois: [OfflinePoi], packageId: String) {
        queue.sync {
            loadIfNeeded()
            for p in pois { offlinePois[p.id] = p }
            var refs = packageRefs[packageId] ?? []
            refs.formUnion(pois.map { $0.id })
            packageRefs[packageId] = refs
            writeFile(offlinePois, to: offlinePoisFile)
            writeFile(packageRefs, to: refsFile)
        }
    }

    func deleteOfflinePois(ids: [String]) {
        queue.sync {
            loadIfNeeded()
            for id in ids {
                offlinePois.removeValue(forKey: id)
                for (pkgId, var refs) in packageRefs where refs.contains(id) {
                    refs.remove(id)
                    packageRefs[pkgId] = refs
                }
            }
            writeFile(offlinePois, to: offlinePoisFile)
            writeFile(packageRefs, to: refsFile)
        }
    }

    func deletePackage(_ id: String) {
        queue.sync {
            loadIfNeeded()
            let refs = packageRefs.removeValue(forKey: id) ?? []
            packages.removeValue(forKey: id)
            // deleteOrphanPois: rimuove i POI non più referenziati da alcun pacchetto
            let stillReferenced = Set(packageRefs.values.flatMap { $0 })
            for poiId in refs where !stillReferenced.contains(poiId) {
                offlinePois.removeValue(forKey: poiId)
            }
            writeFile(packages, to: packagesFile)
            writeFile(packageRefs, to: refsFile)
            writeFile(offlinePois, to: offlinePoisFile)
        }
    }

    func countPoisForPackage(_ id: String) -> Int {
        queue.sync { loadIfNeeded(); return packageRefs[id]?.count ?? 0 }
    }

    func getOfflinePoi(_ id: String) -> OfflinePoi? {
        queue.sync { loadIfNeeded(); return offlinePois[id] }
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
            guard let t = offlinePois[poiId]?.audioText, !t.isEmpty else { return nil }
            return offlineLangConflictsLocked(poiId, lang: lang) ? nil : t
        }
    }

    /// description_short del pacchetto offline con lo stesso controllo lingua:
    /// evita di accodare testo di un'altra lingua alla coda dell'audioguida.
    func getOfflineDescriptionShort(_ poiId: String, lang: String) -> String? {
        queue.sync {
            loadIfNeeded()
            guard let t = offlinePois[poiId]?.descriptionShort, !t.isEmpty else { return nil }
            return offlineLangConflictsLocked(poiId, lang: lang) ? nil : t
        }
    }

    /// Finestra offline: POI dei pacchetti dentro il raggio dato (equivalente
    /// della query R-tree bbox di OfflineRtree). Scan lineare: i volumi in
    /// gioco (qualche migliaio di POI) lo rendono più che sufficiente.
    func offlinePoisNear(lat: Double, lon: Double, radiusM: Double) -> [OfflinePoi] {
        queue.sync {
            loadIfNeeded()
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
