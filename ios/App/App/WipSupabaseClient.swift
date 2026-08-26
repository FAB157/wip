import Foundation
import Security

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
            // I perimetri arrivano da una richiesta a parte: nearby_pois è una
            // funzione SQL con le colonne fissate, e una colonna nuova non ci
            // passerebbe senza riscriverla.
            self.fetchFootprints(poiIds: pois.map { $0.id }) { perimetri in
                guard !perimetri.isEmpty else { completion(.success(pois)); return }
                let arricchiti = pois.map { p -> Poi in
                    guard let fp = perimetri[p.id] else { return p }
                    var copia = p
                    copia.footprint = fp
                    return copia
                }
                completion(.success(arricchiti))
            }
        }.resume()
    }

    /// I perimetri degli edifici (tabella poi_footprints) per i POI indicati,
    /// convertiti nel formato compatto "lon,lat lon,lat;..." che PoiFootprints
    /// sa leggere.
    ///
    /// FAIL-OPEN: qualunque problema restituisce una mappa vuota e il
    /// geofencing continua a lavorare a raggi come prima. Un perimetro che
    /// manca degrada la precisione; un errore propagato fermerebbe
    /// l'aggiornamento dell'intero radar.
    func fetchFootprints(poiIds: [String], completion: @escaping ([String: String]) -> Void) {
        guard !poiIds.isEmpty else { completion([:]); return }
        // A lotti: l'URL di PostgREST ha un limite di lunghezza e 120 id
        // lunghi lo supererebbero.
        let lotti = stride(from: 0, to: poiIds.count, by: 60).map {
            Array(poiIds[$0..<min($0 + 60, poiIds.count)])
        }
        var risultato: [String: String] = [:]
        let gruppo = DispatchGroup()
        let lock = NSLock()

        for lotto in lotti {
            let lista = lotto.map { "\"\($0)\"" }.joined(separator: ",")
            let percorso = "/rest/v1/poi_footprints?poi_id=in.(\(lista))&select=poi_id,geojson"
            guard let codificato = percorso.addingPercentEncoding(
                    withAllowedCharacters: .urlQueryAllowed.union(CharacterSet(charactersIn: "?&=()"))),
                  let req = request(path: codificato, method: "GET") else { continue }
            gruppo.enter()
            session.dataTask(with: req) { data, response, _ in
                defer { gruppo.leave() }
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                      let data = data,
                      let righe = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
                else { return }
                lock.lock(); defer { lock.unlock() }
                for r in righe {
                    guard let id = r["poi_id"] as? String,
                          let gj = r["geojson"] as? String,
                          let compatto = Self.geojsonCompatto(gj) else { continue }
                    risultato[id] = compatto
                }
            }.resume()
        }
        gruppo.notify(queue: .global()) { completion(risultato) }
    }

    /// Da GeoJSON Polygon/MultiPolygon a "lon,lat lon,lat;lon,lat ...".
    /// Non privata: la usa anche WipPackageDownloadManager per il perimetro che
    /// arriva nel bundle offline (stesso formato, una sola conversione).
    static func geojsonCompatto(_ geojson: String) -> String? {
        guard let data = geojson.data(using: .utf8),
              let g = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return geojsonCompatto(g)
    }

    /// Variante per un GeoJSON già deserializzato (il bundle offline lo porta
    /// come oggetto quando PostgREST lo serializza, come testo altrimenti).
    static func geojsonCompatto(_ g: [String: Any]) -> String? {
        guard let tipo = g["type"] as? String else { return nil }
        var anelli: [[[Double]]] = []
        // Polygon: [anello, buco, ...]. MultiPolygon: [[anello, ...], ...],
        // che si appiattisce — per il test dentro/fuori la parità degli
        // attraversamenti gestisce tutti gli anelli insieme.
        if tipo == "Polygon", let c = g["coordinates"] as? [[[Double]]] {
            anelli = c
        } else if tipo == "MultiPolygon", let c = g["coordinates"] as? [[[[Double]]]] {
            anelli = c.flatMap { $0 }
        } else { return nil }
        guard !anelli.isEmpty else { return nil }
        let pezzi = anelli.map { anello in
            anello.compactMap { p -> String? in
                guard p.count >= 2 else { return nil }
                return "\(p[0]),\(p[1])"
            }.joined(separator: " ")
        }.filter { !$0.isEmpty }
        return pezzi.isEmpty ? nil : pezzi.joined(separator: ";")
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
    ///
    /// ROLLOUT ANTI-ABUSO FASE 1 (2026-08-14): questa rotta oggi è aperta
    /// (nessuna auth) perché il chiamante — questo prefetch/trigger in
    /// background — non inviava mai un token utente. Da qui in poi lo invia SE
    /// disponibile (accessToken da SecureSessionStore, passato dai chiamanti in
    /// BackgroundPoiManager), ma la richiesta resta valida anche senza: il
    /// server per ora ACCETTA il token senza richiederlo (nessun 401), per non
    /// rompere l'audioguida automatica sulle installazioni non ancora
    /// aggiornate. La fase 2 (server che rifiuta senza token) va fatta solo
    /// quando questa build sarà diffusa alla maggioranza degli utenti.
    func fetchAudioguideText(poiId: String, lang: String, character: String, accessToken: String? = nil, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "https://wip.guide/api/poi/audioguide") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        // Solo se presente: nessun header quando manca, la richiesta resta
        // identica a quella di oggi (vedi commento fase 1 sopra).
        if let accessToken = accessToken, !accessToken.isEmpty {
            req.addValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
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
 * Wrapper minimale Keychain per le due chiavi di sessione (userId, access
 * token). Prima vivevano in chiaro in UserDefaults.standard — leggibili da
 * un backup non cifrato del device o da un dump del container app. Con
 * kSecAttrAccessibleAfterFirstUnlock restano leggibili anche dal servizio in
 * background a schermo spento (stesso requisito di prima) ma non finiscono
 * più nei backup in chiaro né nel plist delle preferenze.
 *
 * migrateFromUserDefaultsIfNeeded sposta un valore legacy ancora presente in
 * UserDefaults (installazioni aggiornate da una versione precedente) e lo
 * rimuove dal plist: va chiamata una sola volta, qui all'init di
 * ListeningHistoryStore (singleton, quindi si esegue una sola volta a
 * processo).
 */
enum SecureSessionStore {
    private static let service = "com.itaintasca.app.session"

    static func set(_ value: String?, forKey key: String) {
        guard let value = value, !value.isEmpty else {
            delete(key)
            return
        }
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            let update: [String: Any] = [
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
            ]
            SecItemUpdate(query as CFDictionary, update as CFDictionary)
        } else {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// One-shot: se `legacyKey` è ancora in UserDefaults la sposta in
    /// Keychain (senza sovrascrivere un valore Keychain già presente) e la
    /// rimuove dal plist, cosi non resta duplicata in chiaro.
    static func migrateFromUserDefaultsIfNeeded(legacyKey: String, prefs: UserDefaults) {
        guard let legacyValue = prefs.string(forKey: legacyKey), !legacyValue.isEmpty else { return }
        if get(legacyKey) == nil {
            set(legacyValue, forKey: legacyKey)
        }
        prefs.removeObject(forKey: legacyKey)
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
 * userId/accessToken (prefUserId/prefAccessToken) sono in Keychain via
 * SecureSessionStore, non più in UserDefaults — vedi SecureSessionStore sopra.
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

    init() {
        SecureSessionStore.migrateFromUserDefaultsIfNeeded(legacyKey: Self.prefUserId, prefs: prefs)
        SecureSessionStore.migrateFromUserDefaultsIfNeeded(legacyKey: Self.prefAccessToken, prefs: prefs)
    }

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
        let userId = SecureSessionStore.get(Self.prefUserId) ?? ""
        guard !userId.isEmpty else { return }
        let token = SecureSessionStore.get(Self.prefAccessToken)
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
        let userId = SecureSessionStore.get(Self.prefUserId) ?? ""
        guard !userId.isEmpty else { return }
        let token = SecureSessionStore.get(Self.prefAccessToken)
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
