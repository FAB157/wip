import Foundation

/**
 * Port iOS di offline/PackageDownloadManager.kt: download e delta-sync dei
 * pacchetti area (solo testi). Manifest paginato da POST /api/area/bundle con
 * paginazione keyset; ogni pagina viene scritta subito con upsert idempotenti,
 * tombstone per i POI cancellati. Il progresso arriva al JS con l'evento
 * 'offlinePackageProgress' {packageId, done, total, phase}.
 */
final class WipPackageDownloadManager {

    static let bundleUrl = "https://itainta.vercel.app/api/area/bundle"
    static let pageSize = 500
    static let eventProgress = "offlinePackageProgress"

    private let store = PoiStore.shared
    private let session: URLSession

    /// Callback progresso → plugin (stesso payload di notifyProgress Android).
    var onProgress: ((String, Int, Int, String) -> Void)?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        session = URLSession(configuration: config)
    }

    func downloadPackage(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        store.upsertPackage(OfflinePackage(
            id: id, name: name, centerLat: lat, centerLon: lon,
            radiusKm: radiusKm, language: language, poiCount: 0, sizeBytes: 0,
            downloadedAt: nowMs(), lastSyncAt: nil, status: "downloading"
        ))
        runPages(id: id, name: name, lat: lat, lon: lon, radiusKm: radiusKm,
                 language: language, since: nil, completion: completion)
    }

    /// Delta sync: solo POI modificati dopo lastSyncAt + tombstone.
    func syncPackage(id: String, completion: @escaping (Result<OfflinePackage, Error>) -> Void) {
        guard let pkg = store.getPackage(id) else {
            completion(.failure(NSError(domain: "wip", code: 404, userInfo: [NSLocalizedDescriptionKey: "Package not found"])))
            return
        }
        runPages(id: pkg.id, name: pkg.name, lat: pkg.centerLat, lon: pkg.centerLon,
                 radiusKm: pkg.radiusKm, language: pkg.language,
                 since: pkg.lastSyncAt, completion: completion)
    }

    func deletePackage(id: String) {
        store.deletePackage(id)
    }

    func listPackages() -> [OfflinePackage] {
        store.allPackages()
    }

    // MARK: - Paginazione

    private struct PageState {
        var cursorUpdated: String?
        var cursorId: String?
        var generatedAt: String?
        var total = 0
        var received = 0
        var bytes: Int64 = 0
    }

    private func runPages(
        id: String, name: String, lat: Double, lon: Double,
        radiusKm: Double, language: String, since: String?,
        completion: @escaping (Result<OfflinePackage, Error>) -> Void
    ) {
        fetchPage(id: id, name: name, lat: lat, lon: lon, radiusKm: radiusKm,
                  language: language, since: since, state: PageState(), completion: completion)
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

            // Tombstone: POI cancellati sul server → via anche dal locale
            if let tombs = json["tombstones"] as? [String], !tombs.isEmpty {
                self.store.deleteOfflinePois(ids: tombs)
            }

            var pois: [OfflinePoi] = []
            for p in (json["pois"] as? [[String: Any]] ?? []) {
                guard let poiId = p["id"] as? String, !poiId.isEmpty else { continue }
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
                    updatedAt: p["updated_at"] as? String
                ))
            }
            if !pois.isEmpty {
                self.store.upsertOfflinePois(pois, packageId: id)
            }
            newState.received += pois.count
            self.onProgress?(id, newState.received, newState.total, "downloading")

            let next = json["nextCursor"] as? [String: Any]
            newState.cursorUpdated = next?["cursorUpdated"] as? String
            newState.cursorId = next?["cursorId"] as? String

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
        let existing = store.getPackage(id)
        let pkg = OfflinePackage(
            id: id, name: name, centerLat: lat, centerLon: lon,
            radiusKm: radiusKm, language: language,
            poiCount: store.countPoisForPackage(id),
            sizeBytes: since == nil ? state.bytes : (existing?.sizeBytes ?? 0) + state.bytes,
            downloadedAt: existing?.downloadedAt ?? nowMs(),
            // generatedAt della prima pagina: i cambi avvenuti DURANTE il
            // download verranno ripresi dal prossimo delta, mai persi.
            lastSyncAt: state.generatedAt ?? since,
            status: "ready"
        )
        store.upsertPackage(pkg)
        onProgress?(id, state.received, state.total, "ready")
        completion(.success(pkg))
    }

    private func fail(id: String, state: PageState, error: Error, completion: @escaping (Result<OfflinePackage, Error>) -> Void) {
        if var pkg = store.getPackage(id) {
            pkg.status = "error"
            store.upsertPackage(pkg)
        }
        onProgress?(id, state.received, state.total, "error")
        completion(.failure(error))
    }
}
