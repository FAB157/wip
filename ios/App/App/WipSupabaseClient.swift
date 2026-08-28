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

        // (23/08/2026) I PERIMETRI GIÀ NOTI NON SI RISCARICANO.
        // Un poligono OSM non cambia: riscaricarlo a ogni refresh del radar
        // (ogni 200 m a piedi, ogni chilometro in auto) significava rifare le
        // stesse due richieste da 60 id in una zona in cui i POI sono per lo
        // più gli stessi. Il registro tiene sia i perimetri trovati sia i POI
        // che risultano SENZA perimetro (stringa vuota): sono 4 su 5, e sono
        // proprio quelli che si richiedevano inutilmente all'infinito.
        // Il negativo si annota SOLO quando il lotto ha risposto bene: un
        // errore di rete non deve marcare "senza perimetro" mezzo radar.
        var giaNoti: [String: String] = [:]
        var daChiedere: [String] = []
        Self.registroLock.lock()
        for id in poiIds {
            if let noto = Self.registroPerimetri[id] {
                if !noto.isEmpty { giaNoti[id] = noto }
            } else {
                daChiedere.append(id)
            }
        }
        Self.registroLock.unlock()

        guard !daChiedere.isEmpty else { completion(giaNoti); return }

        // A lotti: l'URL di PostgREST ha un limite di lunghezza e 120 id
        // lunghi lo supererebbero.
        let lotti = stride(from: 0, to: daChiedere.count, by: 60).map {
            Array(daChiedere[$0..<min($0 + 60, daChiedere.count)])
        }
        var risultato: [String: String] = giaNoti
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
                var trovati: [String: String] = [:]
                for r in righe {
                    guard let id = r["poi_id"] as? String,
                          let gj = r["geojson"] as? String,
                          let compatto = Self.geojsonCompatto(gj) else { continue }
                    trovati[id] = compatto
                }
                lock.lock()
                for (id, compatto) in trovati { risultato[id] = compatto }
                lock.unlock()
                // Lotto risposto bene: si annotano i perimetri trovati E i POI
                // del lotto che non ne hanno (stringa vuota).
                Self.annota(idRichiesti: lotto, trovati: trovati)
            }.resume()
        }
        gruppo.notify(queue: .global()) { completion(risultato) }
    }

    /// Registro dei perimetri già scaricati: `""` = "questo POI non ha
    /// perimetro". Tetto FIFO perché in un viaggio lungo il radar attraversa
    /// molte zone; 4.000 voci sono qualche centinaio di kB.
    private static var registroPerimetri: [String: String] = [:]
    private static var registroOrdine: [String] = []
    private static let registroLock = NSLock()
    private static let registroMax = 4000

    private static func annota(idRichiesti: [String], trovati: [String: String]) {
        registroLock.lock(); defer { registroLock.unlock() }
        for id in idRichiesti {
            let valore = trovati[id] ?? ""
            if registroPerimetri.updateValue(valore, forKey: id) == nil {
                registroOrdine.append(id)
            }
        }
        while registroPerimetri.count > registroMax, !registroOrdine.isEmpty {
            let vecchio = registroOrdine.removeFirst()
            registroPerimetri.removeValue(forKey: vecchio)
        }
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
    /// Esito della richiesta del testo integrale (28/08/2026).
    enum AudioguideEsito {
        /// Testo integrale nella lingua dell'utente: si può riprodurre.
        case testo(String)
        /// 402 `credits_required`: l'utente NON ha diritto al testo integrale
        /// (pass/crediti non validi lato server). `preview` è l'anteprima da
        /// usare come TEASER — mai come guida completa, mai addebitata.
        case anteprima(String?)
        /// Rete, server, JSON vuoto: nulla da riprodurre.
        case fallito
    }

    /// Compatibilità: i chiamanti che vogliono solo "testo o niente". Un 402
    /// qui è nil come un errore — chi deve distinguerlo usa `fetchAudioguide`.
    func fetchAudioguideText(poiId: String, lang: String, character: String, accessToken: String? = nil, completion: @escaping (String?) -> Void) {
        fetchAudioguide(poiId: poiId, lang: lang, character: character, accessToken: accessToken) { esito in
            if case .testo(let t) = esito { completion(t) } else { completion(nil) }
        }
    }

    /// (28/08/2026) Il server ora risponde 402 {error:'credits_required',
    /// preview} quando l'utente non ha diritto al testo integrale: prima
    /// finiva nel `guard` come "testo vuoto" e il trigger passava alla
    /// notifica muta. Ora: 2xx → `.testo`; 402 → `.anteprima(preview)`;
    /// 401 (token assente/scaduto) → ripiego sui campi grezzi di shared_pois
    /// (`fetchPoiAudioText`, rete di sicurezza già prevista); altro → `.fallito`.
    /// Il Bearer parte SEMPRE quando c'è un token: chi chiama con `accessToken`
    /// nil riceve comunque quello del Keychain.
    /// Ultimo evento `tokenExpired` emesso (throttle 5 min, come WipApi.kt).
    private static var ultimoTokenExpiredTs: TimeInterval = 0

    /// (28/08/2026) 401 con token presente → evento `tokenExpired` al JS, che
    /// rinnova la sessione e rispinge il token con setUserContext.
    private func segnalaTokenScaduto(token: String?) {
        guard let token = token, !token.isEmpty else { return }
        let ora = Date().timeIntervalSince1970
        guard ora - WipSupabaseClient.ultimoTokenExpiredTs > 300 else { return }
        WipSupabaseClient.ultimoTokenExpiredTs = ora
        DispatchQueue.main.async {
            BackgroundPoiManager.shared.onEvent?("tokenExpired", nil, [
                "reason": "http_401",
                "ts": Int(ora * 1000)
            ])
        }
    }

    /// Ripiego dopo un 401 definitivo: i campi grezzi di shared_pois sono in
    /// ITALIANO, quindi si usano solo per lang=it (regola del 23/08: mai un
    /// testo nella lingua sbagliata). Stessa regola di SupabaseClient.kt.
    private func ripiegoDopo401(poiId: String, lang: String, completion: @escaping (AudioguideEsito) -> Void) {
        guard lang.lowercased().hasPrefix("it") else { completion(.fallito); return }
        fetchPoiAudioText(poiId) { raw in
            if let raw = raw, !raw.isEmpty { completion(.testo(raw)) } else { completion(.fallito) }
        }
    }

    func fetchAudioguide(poiId: String, lang: String, character: String, accessToken: String? = nil, ritenta: Bool = true, completion: @escaping (AudioguideEsito) -> Void) {
        guard let url = URL(string: "\(WipApi.base)/api/poi/audioguide") else {
            completion(.fallito); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        let token = (accessToken?.isEmpty == false)
            ? accessToken
            : SecureSessionStore.get(ListeningHistoryStore.prefAccessToken)
        if let token = token, !token.isEmpty {
            req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "poiId": poiId, "lang": lang, "character": character
        ])
        session.dataTask(with: req) { [weak self] data, response, _ in
            guard let http = response as? HTTPURLResponse else { completion(.fallito); return }
            let obj = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
            switch http.statusCode {
            case 200..<300:
                if let text = obj?["text"] as? String,
                   !text.trimmingCharacters(in: .whitespaces).isEmpty {
                    completion(.testo(text))
                } else {
                    completion(.fallito)
                }
            case 402:
                let preview = (obj?["preview"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                completion(.anteprima((preview?.isEmpty == false) ? preview : nil))
            case 401:
                // Senza identità valida il server non traduce né genera.
                // (28/08/2026) Quasi sempre è un token SCADUTO: si avvisa il
                // JS (tokenExpired → refresh + setUserContext), si aspettano
                // 2,5 s, si rilegge il token dal Keychain e si ritenta UNA
                // volta. Solo dopo, il ripiego (solo italiano).
                guard let self = self else { completion(.fallito); return }
                self.segnalaTokenScaduto(token: token)
                if ritenta {
                    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2.5) {
                        let nuovo = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken) ?? ""
                        if !nuovo.isEmpty && nuovo != (token ?? "") {
                            self.fetchAudioguide(poiId: poiId, lang: lang, character: character,
                                                 accessToken: nuovo, ritenta: false, completion: completion)
                        } else {
                            self.ripiegoDopo401(poiId: poiId, lang: lang, completion: completion)
                        }
                    }
                    return
                }
                self.ripiegoDopo401(poiId: poiId, lang: lang, completion: completion)
            default:
                completion(.fallito)
            }
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
                arrivalRadius: (map["geofence_radius"] as? NSNumber)?.intValue,
                // INDIRIZZO (23/08/2026). La stringa serve a notifica e voce;
                // `address_source` non e' decorazione: 'strada_vicina' vuol
                // dire "la strada piu' vicina", non l'indirizzo del luogo —
                // una chiesa in mezzo ai campi non sta al civico di quella
                // via, e quel valore scarta anche il punto qui sotto.
                // Le due RPC li restituiscono dalle migration 20260823090000
                // e 20260823150000; con RPC vecchie restano nil e la scala
                // ricade sul comportamento di prima.
                address: map["address"] as? String,
                addressSource: map["address_source"] as? String,
                // IL PUNTO dell'indirizzo (migration 20260823160000). E' la
                // casa piu' vicina al POI nel dump Nominatim — vicinanza
                // MISURATA, non una geocodifica testuale — quindi e' il PUNTO
                // D'ARRIVO: Poi.coordinate lo mette fra l'ingresso e il
                // centroide, e il trigger scatta a 30 m da li'.
                // Finche' la passata dei punti non e' girata (e finche' le RPC
                // non restituiscono le colonne) restano nil: comportamento
                // identico a prima.
                addressPointLat: (map["address_point_lat"] as? NSNumber)?.doubleValue,
                addressPointLon: (map["address_point_lon"] as? NSNumber)?.doubleValue,
                addressPointSource: map["address_point_source"] as? String
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
    /// Prefissi delle chiavi PER UTENTE: la chiave reale è
    /// `listened_poi_ids_<userId>` / `listened_pending_sync_<userId>`.
    /// I nomi senza suffisso sono le vecchie chiavi globali, lette solo per
    /// la migrazione una tantum.
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

    // ─────────────────────────────────────────────────────────────────────
    // (28/08/2026, SEC-02) STORICO PER UTENTE.
    //
    // Prima il mirror degli ascolti e la coda pending stavano in UserDefaults
    // sotto UNA chiave globale, senza utente: sullo stesso telefono, chi
    // faceva login dopo ereditava i POI "già acquistati" del precedente (li
    // ascoltava gratis), la sync li UNIVA al suo storico cloud e il flush dei
    // pending ATTRIBUIVA all'utente corrente ascolti fatti da un altro. Ora
    // ogni chiave porta l'id utente, ogni voce pending porta `user_id` e viene
    // scartata se non coincide, e la vecchia chiave globale viene migrata
    // sotto l'utente corrente alla prima lettura. Senza utente non c'è
    // storico (fail-closed: nessun "già acquistato" anonimo).
    // ─────────────────────────────────────────────────────────────────────

    private func utenteCorrente() -> String {
        SecureSessionStore.get(Self.prefUserId) ?? ""
    }

    private func chiaveAscoltati(_ userId: String) -> String { "\(Self.prefListenedIds)_\(userId)" }
    private func chiavePending(_ userId: String) -> String { "\(Self.prefPending)_\(userId)" }

    /// Migrazione una tantum della chiave globale (installazioni aggiornate):
    /// gli id passano sotto l'utente corrente e ogni voce pending riceve il
    /// suo `user_id`. Da chiamare su `queue`, con userId non vuoto.
    private func migraChiaviGlobaliLocked(userId: String) {
        if let vecchi = prefs.stringArray(forKey: Self.prefListenedIds) {
            var ids = Set(prefs.stringArray(forKey: chiaveAscoltati(userId)) ?? [])
            ids.formUnion(vecchi)
            prefs.set(Array(ids), forKey: chiaveAscoltati(userId))
            prefs.removeObject(forKey: Self.prefListenedIds)
        }
        if let vecchiPending = prefs.stringArray(forKey: Self.prefPending) {
            var pending = Set(prefs.stringArray(forKey: chiavePending(userId)) ?? [])
            for raw in vecchiPending {
                guard let data = raw.data(using: .utf8),
                      var entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
                entry["user_id"] = userId
                if let out = try? JSONSerialization.data(withJSONObject: entry),
                   let s = String(data: out, encoding: .utf8) {
                    pending.insert(s)
                }
            }
            prefs.set(Array(pending), forKey: chiavePending(userId))
            prefs.removeObject(forKey: Self.prefPending)
        }
    }

    /// Ascoltati dell'utente (con migrazione al primo accesso). Su `queue`.
    private func ascoltatiLocked(userId: String) -> Set<String> {
        migraChiaviGlobaliLocked(userId: userId)
        return Set(prefs.stringArray(forKey: chiaveAscoltati(userId)) ?? [])
    }

    /// Mirror locale, vale anche offline. In dubbio: NON acquistato.
    func isAlreadyPurchased(_ poiId: String) -> Bool {
        guard !poiId.isEmpty else { return false }
        let userId = utenteCorrente()
        guard !userId.isEmpty else { return false }
        return queue.sync { ascoltatiLocked(userId: userId).contains(poiId) }
    }

    /// Registra un ascolto completato: mirror subito (vale anche offline),
    /// poi insert cloud best-effort. Se il cloud fallisce la voce resta
    /// pending e viene ritentata alla prossima sync. La voce pending porta
    /// l'utente che ha ascoltato: al flush non può finire nello storico di un
    /// altro.
    func recordListening(poiId: String, poiName: String?, category: String?, imageUrl: String? = nil) {
        guard !poiId.isEmpty else { return }
        let userId = utenteCorrente()
        guard !userId.isEmpty else { return }
        queue.async {
            var ids = self.ascoltatiLocked(userId: userId)
            ids.insert(poiId)
            self.prefs.set(Array(ids), forKey: self.chiaveAscoltati(userId))

            var entry: [String: Any] = [
                "user_id": userId,
                "poi_id": poiId,
                "poi_name": (poiName?.isEmpty == false) ? poiName! : "Luogo d'interesse",
                "category": (category?.isEmpty == false) ? category! : "Altro"
            ]
            if let imageUrl = imageUrl, !imageUrl.isEmpty { entry["image_url"] = imageUrl }
            if let data = try? JSONSerialization.data(withJSONObject: entry),
               let raw = String(data: data, encoding: .utf8) {
                var pending = Set(self.prefs.stringArray(forKey: self.chiavePending(userId)) ?? [])
                pending.insert(raw)
                self.prefs.set(Array(pending), forKey: self.chiavePending(userId))
            }
            self.flushPending()
        }
    }

    /// All'avvio del servizio (e quando il JS aggiorna l'identità utente):
    /// scarica gli id dal cloud e li UNISCE al mirror DELLO STESSO utente
    /// (mai sostituire: gli ascolti offline non sincronizzati non vanno
    /// persi), poi ritenta i pending.
    func syncFromCloud() {
        let userId = utenteCorrente()
        guard !userId.isEmpty else { return }
        let token = SecureSessionStore.get(Self.prefAccessToken)
        client.fetchListeningHistoryPoiIds(userId: userId, accessToken: token) { [weak self] cloudIds in
            guard let self = self, let cloudIds = cloudIds else { return }
            self.queue.async {
                // L'utente può essere cambiato mentre la richiesta era in
                // volo: gli id del cloud vanno sotto l'utente che li ha
                // chiesti, non sotto quello corrente.
                var ids = self.ascoltatiLocked(userId: userId)
                ids.formUnion(cloudIds)
                self.prefs.set(Array(ids), forKey: self.chiaveAscoltati(userId))
                self.flushPending()
            }
        }
    }

    /// Logout (plugin clearUserContext): via userId e token dal Keychain.
    /// Le chiavi per utente in UserDefaults restano: sono già isolate per
    /// id e servono se lo stesso utente rientra; nessun altro le legge.
    func clearSession() {
        SecureSessionStore.delete(Self.prefUserId)
        SecureSessionStore.delete(Self.prefAccessToken)
    }

    /// Da chiamare su `queue`. Ritenta l'insert cloud delle voci pending
    /// dell'utente corrente; una voce senza `user_id` o di un altro utente
    /// viene scartata, mai attribuita a chi è loggato adesso.
    private func flushPending() {
        let userId = utenteCorrente()
        guard !userId.isEmpty else { return }
        let token = SecureSessionStore.get(Self.prefAccessToken)
        migraChiaviGlobaliLocked(userId: userId)
        let chiave = chiavePending(userId)
        let pending = prefs.stringArray(forKey: chiave) ?? []
        var daScartare: [String] = []
        for raw in pending {
            guard let data = raw.data(using: .utf8),
                  let entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let poiId = entry["poi_id"] as? String,
                  let proprietario = entry["user_id"] as? String, proprietario == userId else {
                daScartare.append(raw)
                continue
            }
            client.recordListeningHistory(
                userId: userId, accessToken: token,
                poiId: poiId,
                poiName: entry["poi_name"] as? String ?? "Luogo d'interesse",
                category: entry["category"] as? String ?? "Altro",
                imageUrl: entry["image_url"] as? String
            ) { [weak self] ok in
                guard ok, let self = self else { return }
                self.queue.async {
                    var rest = Set(self.prefs.stringArray(forKey: chiave) ?? [])
                    rest.remove(raw)
                    self.prefs.set(Array(rest), forKey: chiave)
                }
            }
        }
        if !daScartare.isEmpty {
            var rest = Set(pending)
            for raw in daScartare { rest.remove(raw) }
            prefs.set(Array(rest), forKey: chiave)
        }
    }
}
