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

    private func request(path: String, method: String, body: [String: Any]? = nil) -> URLRequest? {
        guard let url = URL(string: "\(Self.supabaseUrl)\(path)") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.addValue(Self.anonKey, forHTTPHeaderField: "apikey")
        req.addValue("Bearer \(Self.anonKey)", forHTTPHeaderField: "Authorization")
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

    /// Testo integrale dell'audioguida (Day Pass online). Stessa catena di
    /// fallback di Android: audio_script → description_long → description_ai → description.
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

    static func parsePoiList(data: Data, uiCategories: [String], lang: String) -> [Poi] {
        guard let rawList = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else {
            return []
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
                teaserText: teaser
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
