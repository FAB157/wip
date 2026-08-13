import Foundation

/**
 * Port iOS di service/SupabaseClient.kt. Stessa RPC nearby_pois, stesso
 * parsing/filtri categorie, stessi fallback teaser multilingua.
 * URL e anon key sono le stesse pubbliche del bundle web (src/lib/supabase.ts):
 * su Android arrivano da BuildConfig, qui sono costanti.
 */
final class WipSupabaseClient {

    static let supabaseUrl = "https://qfxxhzkkrkvbuekfknhh.supabase.co"
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs"

    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config)
    }

    private func request(path: String, method: String, body: [String: Any]? = nil, accessToken: String? = nil) -> URLRequest? {
        guard let url = URL(string: "\(Self.supabaseUrl)\(path)") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.addValue(Self.anonKey, forHTTPHeaderField: "apikey")
        // Con token utente le RLS passano; senza, fallback anon (best-effort)
        let bearer = (accessToken?.isEmpty == false) ? accessToken! : Self.anonKey
        req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.addValue("Itainta-iOS-Native", forHTTPHeaderField: "User-Agent")
        if let body = body {
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    func fetchPoisNearby(
        lat: Double, lon: Double, radiusKm: Double,
        uiCategories: [String], lang: String,
        completion: @escaping (Result<[Poi], Error>) -> Void
    ) {
        // limit 120 come Android: la finestra attiva resta più piccola, ma il
        // radar conosce più POI per teaser e notifiche.
        guard let req = request(path: "/rest/v1/rpc/nearby_pois", method: "POST", body: [
            "p_lat": lat, "p_lon": lon,
            "radius_m": Int(radiusKm * 1000),
            "limit_num": 120
        ]) else {
            completion(.failure(URLError(.badURL)))
            return
        }
        session.dataTask(with: req) { data, response, error in
            if let error = error { completion(.failure(error)); return }
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data else {
                completion(.failure(URLError(.badServerResponse)))
                return
            }
            let pois = Self.parsePoiList(data: data, uiCategories: uiCategories, lang: lang)
            completion(.success(pois))
        }.resume()
    }

    func fetchPoiById(_ poiId: String, lang: String, completion: @escaping (Poi?) -> Void) {
        guard let req = request(path: "/rest/v1/shared_pois?id=eq.\(poiId)&select=*", method: "GET") else {
            completion(nil)
            return
        }
        session.dataTask(with: req) { data, response, _ in
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data else {
                completion(nil)
                return
            }
            completion(Self.parsePoiList(data: data, uiCategories: [], lang: lang).first)
        }.resume()
    }

    /// Testo integrale dell'audioguida NELLA LINGUA dell'utente (get-or-create).
    /// Chiama /api/poi/audioguide, che fa cache-check su poi_audioguides per
    /// lingua e — se manca — traduce/rigenera dai campi (spesso italiani) di
    /// shared_pois e salva. Prima il nativo leggeva i campi italiani grezzi:
    /// un utente straniero, in auto col Day Pass, sentiva testo italiano letto
    /// con voce nella sua lingua. Ora il testo è già nella lingua giusta.
    func fetchAudioguideText(poiId: String, lang: String, character: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "https://wip.guide/api/poi/audioguide") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "poiId": poiId, "lang": lang, "character": character
        ])
        session.dataTask(with: req) { data, response, _ in
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data,
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let text = obj["text"] as? String,
                  !text.trimmingCharacters(in: .whitespaces).isEmpty else {
                completion(nil)
                return
            }
            completion(text)
        }.resume()
    }

    /// Testo integrale dai campi grezzi di shared_pois (fallback mono-lingua,
    /// tipicamente italiano). Tenuto come rete di sicurezza offline/di errore.
    func fetchPoiAudioText(_ poiId: String, completion: @escaping (String?) -> Void) {
        let sel = "audio_script,description_long,description_ai,description"
        guard let req = request(path: "/rest/v1/shared_pois?id=eq.\(poiId)&select=\(sel)", method: "GET") else {
            completion(nil)
            return
        }
        session.dataTask(with: req) { data, response, _ in
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data,
                  let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
                  let row = arr.first else {
                completion(nil)
                return
            }
            for key in ["audio_script", "description_long", "description_ai", "description"] {
                if let v = row[key] as? String, !v.trimmingCharacters(in: .whitespaces).isEmpty {
                    completion(v)
                    return
                }
            }
            completion(nil)
        }.resume()
    }

    // MARK: - Storico ascolti (user_listening_history)
    // Un POI già ascoltato è già acquistato: il nativo lo riproduce gratis,
    // allineato al web (dayPassService.authorizeGuidePlayback).

    /// Tutti i poi_id già ascoltati dall'utente. nil = richiesta fallita.
    func fetchListeningHistoryPoiIds(userId: String, accessToken: String?, completion: @escaping ([String]?) -> Void) {
        guard !userId.isEmpty,
              let req = request(
                path: "/rest/v1/user_listening_history?user_id=eq.\(userId)&select=poi_id",
                method: "GET", accessToken: accessToken
              ) else {
            completion(nil)
            return
        }
        session.dataTask(with: req) { data, response, _ in
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data,
                  let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else {
                completion(nil)
                return
            }
            completion(arr.compactMap { row in
                if let s = row["poi_id"] as? String { return s }
                if let n = row["poi_id"] { return String(describing: n) }
                return nil
            })
        }.resume()
    }

    /// Insert/update best-effort della riga di storico, stessa logica del web
    /// (lib/listeningHistory.ts): se esiste aggiorna listened_at, altrimenti insert.
    func recordListeningHistory(
        userId: String, accessToken: String?,
        poiId: String, poiName: String, category: String, imageUrl: String?,
        completion: @escaping (Bool) -> Void
    ) {
        guard !userId.isEmpty, !poiId.isEmpty,
              let checkReq = request(
                path: "/rest/v1/user_listening_history?user_id=eq.\(userId)&poi_id=eq.\(poiId)&select=id",
                method: "GET", accessToken: accessToken
              ) else {
            completion(false)
            return
        }
        session.dataTask(with: checkReq) { [weak self] data, response, _ in
            guard let self = self,
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let data = data,
                  let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else {
                completion(false)
                return
            }
            let nowIso = ISO8601DateFormatter().string(from: Date())
            var maybeReq: URLRequest?
            if let rawId = arr.first?["id"] {
                let existingId = (rawId as? String) ?? String(describing: rawId)
                maybeReq = self.request(
                    path: "/rest/v1/user_listening_history?id=eq.\(existingId)",
                    method: "PATCH",
                    body: ["listened_at": nowIso, "poi_name": poiName],
                    accessToken: accessToken
                )
            } else {
                var body: [String: Any] = [
                    "user_id": userId, "poi_id": poiId, "poi_name": poiName,
                    "category": category, "listened_at": nowIso
                ]
                if let imageUrl = imageUrl, !imageUrl.isEmpty { body["image_url"] = imageUrl }
                maybeReq = self.request(
                    path: "/rest/v1/user_listening_history",
                    method: "POST", body: body, accessToken: accessToken
                )
            }
            guard var req = maybeReq else {
                completion(false)
                return
            }
            req.addValue("return=minimal", forHTTPHeaderField: "Prefer")
            self.session.dataTask(with: req) { _, resp, _ in
                let ok = (resp as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
                completion(ok)
            }.resume()
        }.resume()
    }

    /// Status esclusi dal radar: la RPC nearby_pois non filtra per status, e
    /// nei test in auto un POI 'draft' allucinato dalla Vision ("Pietà
    /// Vaticana… Museo Omero" ad Avenza) è arrivato fino alla notifica di
    /// arrivo. Tenere allineato ad Android e a poiRepository.ts.
    static let hiddenStatuses: Set<String> = ["draft", "needs_revision", "rejected", "hidden"]

    static func parsePoiList(data: Data, uiCategories: [String], lang: String) -> [Poi] {
        guard let anyList = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else {
            return []
        }
        let rawList = anyList.filter { map in
            let status = ((map["status"] as? String) ?? "").lowercased()
            if hiddenStatuses.contains(status) { return false }
            if (map["is_hidden"] as? Bool) == true { return false }
            return true
        }

        var targetDbCategories = Set<String>()
        for uiCat in uiCategories {
            if let cats = PoiCategories.map[uiCat] { targetDbCategories.formUnion(cats) }
        }

        let pois: [Poi] = rawList.map { map in
            let cat = ((map["categoria"] ?? map["category"]) as? String ?? "").lowercased()

            let isGem: Bool
            if let b = map["is_gem"] as? Bool { isGem = b }
            else if let n = map["is_gem"] as? NSNumber { isGem = n.intValue == 1 }
            else if let s = map["is_gem"] as? String { isGem = s.lowercased() == "true" }
            else { isGem = cat == "gemme" || (map["premium"] as? Bool == true) }

            // Prima il teaser nella lingua dell'utente, poi i fallback
            let teaser = (map["teaser_text_\(lang)"] as? String)
                ?? (map["teaser_text_it"] as? String)
                ?? (map["teaser_text_en"] as? String)
                ?? (map["teaser_text"] as? String)

            return Poi(
                id: (map["id"] as? String) ?? String(describing: map["id"] ?? ""),
                nome: (map["nome"] as? String) ?? (map["name"] as? String) ?? "Punto di interesse",
                lat: (map["lat"] as? NSNumber)?.doubleValue ?? 0,
                lon: (map["lon"] as? NSNumber)?.doubleValue ?? 0,
                entranceLat: (map["entrance_lat"] as? NSNumber)?.doubleValue,
                entranceLon: (map["entrance_lon"] as? NSNumber)?.doubleValue,
                poiType: cat,
                guideDefault: (map["guide_default"] as? String) ?? "nicky",
                isGem: isGem,
                isFromItinerary: false,
                teaserText: teaser,
                // Raggi calibrati sul perimetro reale (footprint OSM): usati
                // dal trigger solo se il POI ha un ingresso (entrance_lat/lon),
                // come radiiForTransport lato web. Prima venivano ignorati.
                alertRadius: (map["alert_radius"] as? NSNumber)?.intValue,
                arrivalRadius: (map["geofence_radius"] as? NSNumber)?.intValue
            )
        }

        if uiCategories.isEmpty {
            return pois.filter { $0.isGem || PoiCategories.culturalCats.contains($0.poiType ?? "") }
        }
        return pois.filter { poi in
            let cat = (poi.poiType ?? "").lowercased()
            return poi.isGem || targetDbCategories.contains(cat) || uiCategories.contains(cat)
        }
    }
}

/**
 * Storico ascolti lato nativo: mirror locale (UserDefaults) dei poi_id già
 * ascoltati + registrazione best-effort su user_listening_history.
 *
 * Un POI già nello storico è già "acquistato": il trigger in background lo
 * riproduce GRATIS senza consumare il Day Pass né chiedere pagamento, come il
 * web (dayPassService.authorizeGuidePlayback). Il mirror viene sincronizzato
 * all'avvio del monitoraggio scaricando gli id dal cloud, così il check vale
 * anche offline; gli ascolti registrati offline restano in una coda pending
 * ritentata alla sync successiva. Fail-closed: in dubbio NON è acquistato.
 *
 * Stesse chiavi prefs del port Android (ListeningHistoryStore.kt): allineare.
 */
final class ListeningHistoryStore {
    static let shared = ListeningHistoryStore()
    static let prefListenedIds = "listened_poi_ids"
    static let prefPending = "listened_pending_sync"
    static let prefUserId = "wip_user_id"
    static let prefAccessToken = "wip_supabase_token"

    private let prefs = UserDefaults.standard
    private let client = WipSupabaseClient()
    // Serializza le letture/scritture del mirror (receiver + plugin + sync)
    private let queue = DispatchQueue(label: "com.itaintasca.listeninghistory")

    /// Mirror locale, vale anche offline. In dubbio: NON acquistato.
    func isAlreadyPurchased(_ poiId: String) -> Bool {
        guard !poiId.isEmpty else { return false }
        return queue.sync {
            (prefs.stringArray(forKey: Self.prefListenedIds) ?? []).contains(poiId)
        }
    }

    /// Registra un ascolto completato: mirror subito (vale anche offline),
    /// poi insert cloud best-effort. Se il cloud fallisce la voce resta
    /// pending e viene ritentata alla prossima sync.
    func recordListening(poiId: String, poiName: String?, category: String?, imageUrl: String? = nil) {
        guard !poiId.isEmpty else { return }
        queue.async {
            var ids = Set(self.prefs.stringArray(forKey: Self.prefListenedIds) ?? [])
            ids.insert(poiId)
            self.prefs.set(Array(ids), forKey: Self.prefListenedIds)

            var entry: [String: Any] = [
                "poi_id": poiId,
                "poi_name": (poiName?.isEmpty == false) ? poiName! : "Luogo d'interesse",
                "category": (category?.isEmpty == false) ? category! : "Altro"
            ]
            if let imageUrl = imageUrl, !imageUrl.isEmpty { entry["image_url"] = imageUrl }
            if let data = try? JSONSerialization.data(withJSONObject: entry),
               let raw = String(data: data, encoding: .utf8) {
                var pending = Set(self.prefs.stringArray(forKey: Self.prefPending) ?? [])
                pending.insert(raw)
                self.prefs.set(Array(pending), forKey: Self.prefPending)
            }
            self.flushPending()
        }
    }

    /// All'avvio del servizio (e quando il JS aggiorna l'identità utente):
    /// scarica gli id dal cloud e li UNISCE al mirror (mai sostituire: gli
    /// ascolti offline non sincronizzati non vanno persi), poi ritenta i pending.
    func syncFromCloud() {
        let userId = prefs.string(forKey: Self.prefUserId) ?? ""
        guard !userId.isEmpty else { return }
        let token = prefs.string(forKey: Self.prefAccessToken)
        client.fetchListeningHistoryPoiIds(userId: userId, accessToken: token) { [weak self] cloudIds in
            guard let self = self, let cloudIds = cloudIds else { return }
            self.queue.async {
                var ids = Set(self.prefs.stringArray(forKey: Self.prefListenedIds) ?? [])
                ids.formUnion(cloudIds)
                self.prefs.set(Array(ids), forKey: Self.prefListenedIds)
                self.flushPending()
            }
        }
    }

    /// Da chiamare su `queue`. Ritenta l'insert cloud delle voci pending.
    private func flushPending() {
        let userId = prefs.string(forKey: Self.prefUserId) ?? ""
        guard !userId.isEmpty else { return }
        let token = prefs.string(forKey: Self.prefAccessToken)
        let pending = prefs.stringArray(forKey: Self.prefPending) ?? []
        for raw in pending {
            guard let data = raw.data(using: .utf8),
                  let entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let poiId = entry["poi_id"] as? String else { continue }
            client.recordListeningHistory(
                userId: userId, accessToken: token,
                poiId: poiId,
                poiName: entry["poi_name"] as? String ?? "Luogo d'interesse",
                category: entry["category"] as? String ?? "Altro",
                imageUrl: entry["image_url"] as? String
            ) { [weak self] ok in
                guard ok, let self = self else { return }
                self.queue.async {
                    var rest = Set(self.prefs.stringArray(forKey: Self.prefPending) ?? [])
                    rest.remove(raw)
                    self.prefs.set(Array(rest), forKey: Self.prefPending)
                }
            }
        }
    }
}
