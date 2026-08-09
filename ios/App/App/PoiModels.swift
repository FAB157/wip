import Foundation
import CoreLocation

// Port iOS dei modelli nativi Android (db/PoiEntity.kt, TriggerStateEntity.kt,
// OfflinePackageEntity.kt) e della logica pura (BillingLogic.kt,
// SlidingWindowLogic.kt). Tenere i nomi dei campi JSON identici ad Android:
// il JS riceve gli stessi payload su entrambe le piattaforme.

struct Poi: Codable {
    let id: String
    var nome: String
    var lat: Double
    var lon: Double
    var entranceLat: Double?
    var entranceLon: Double?
    var poiType: String?
    var guideDefault: String
    var isGem: Bool
    var isFromItinerary: Bool
    var teaserText: String?

    var coordinate: CLLocation {
        CLLocation(latitude: entranceLat ?? lat, longitude: entranceLon ?? lon)
    }

    func toJson() -> [String: Any] {
        var d: [String: Any] = [
            "id": id, "nome": nome, "lat": lat, "lon": lon,
            "guideDefault": guideDefault, "isGem": isGem,
            "isFromItinerary": isFromItinerary
        ]
        if let v = entranceLat { d["entranceLat"] = v }
        if let v = entranceLon { d["entranceLon"] = v }
        if let v = poiType { d["poiType"] = v }
        if let v = teaserText { d["teaserText"] = v }
        return d
    }
}

enum TriggerState: String, Codable {
    case pending = "PENDING"
    case approachFired = "APPROACH_FIRED"
    case arrivedFired = "ARRIVED_FIRED"
    /// Superato: il CPA è alle spalle e la distanza cresce. Aggiunto col
    /// geofencing predittivo — prima l'uscita a 1.5× resettava lo stato ma
    /// non fermava l'audio, e la voce continuava a raccontare un monumento
    /// già alle spalle. Stringa allineata a TriggerState.PASSED su Android.
    case passed = "PASSED"
}

struct TriggerStateRecord: Codable {
    var state: TriggerState
    var updatedAt: TimeInterval // epoch ms, come Android
}

/// POI persistente dei pacchetti offline (solo testi).
struct OfflinePoi: Codable {
    let id: String
    var nome: String
    var lat: Double
    var lon: Double
    var category: String?
    var poiType: String?
    var isGem: Bool
    var alertRadius: Int
    var arrivalRadius: Int
    var teaserText: String?
    var descriptionShort: String?
    var audioText: String?
    var updatedAt: String?

    func toPoi() -> Poi {
        Poi(id: id, nome: nome, lat: lat, lon: lon,
            entranceLat: nil, entranceLon: nil,
            poiType: poiType ?? category, guideDefault: "nicky",
            isGem: isGem, isFromItinerary: false, teaserText: teaserText)
    }
}

struct OfflinePackage: Codable {
    let id: String
    var name: String
    var centerLat: Double
    var centerLon: Double
    var radiusKm: Double
    var language: String
    var poiCount: Int
    var sizeBytes: Int64
    var downloadedAt: TimeInterval // epoch ms
    var lastSyncAt: String?
    var status: String // downloading | ready | error

    func toJson() -> [String: Any] {
        [
            "id": id, "name": name, "centerLat": centerLat, "centerLon": centerLon,
            "radiusKm": radiusKm, "language": language, "poiCount": poiCount,
            "sizeBytes": sizeBytes, "downloadedAt": downloadedAt,
            "lastSyncAt": lastSyncAt ?? "", "status": status
        ]
    }
}

/// Registro spese offline per-listen, riconciliato online (offline_spend_ledger).
struct SpendEntry: Codable {
    let poiId: String
    let credits: Int
    let ts: TimeInterval
}

/// Port 1:1 di offline/BillingLogic.kt.
enum BillingLogic {
    static let defaultGuideCost = 15
    static let dayPassCap = 40
    static let dayPassDurationMs: Double = 24 * 60 * 60 * 1000

    static func isPassActive(nowMs: Double, expiresAtMs: Double, guidesUsed: Int, cap: Int) -> Bool {
        expiresAtMs > nowMs && cap > 0 && guidesUsed < cap
    }

    static func canSpend(snapshotCredits: Int, pendingSpendCredits: Int, cost: Int) -> Bool {
        snapshotCredits - pendingSpendCredits >= cost
    }

    static func remainingOffline(snapshotCredits: Int, pendingSpendCredits: Int) -> Int {
        max(0, snapshotCredits - pendingSpendCredits)
    }
}

/// Mappa categorie UI → categorie DB. Copia canonica Android:
/// GeofenceBroadcastReceiver.CATEGORY_MAP / SupabaseClient.categoryMap.
/// Tenere allineata a isCategoryAllowed (src/hooks/useGeofencing.ts).
enum PoiCategories {
    static let map: [String: [String]] = [
        "monumenti": ["monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti"],
        "musei": ["museum", "gallery", "musei"],
        "chiese": ["church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"],
        "panorami": ["viewpoint", "park", "panorami"],
        "locali": ["restaurant", "cafe", "bar", "fast_food", "pub", "locali"],
        "utilita": ["pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"],
        "famiglie": ["playground", "theme_park", "aquarium", "zoo", "famiglie"],
        "consigli": ["information", "tourism_information", "office", "consigli"],
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        "community": ["community"]
    ]

    static let culturalCats = [
        "monument", "castle", "ruins", "archaeological_site", "artwork", "monumenti",
        "museum", "gallery", "musei", "church", "place_of_worship", "cathedral",
        "chiese", "viewpoint", "park", "panorami"
    ]

    /// Stessa semantica di isPoiCategoryActive del receiver Android.
    static func isActive(poi: Poi, selected: [String]) -> Bool {
        if poi.isFromItinerary || poi.isGem { return true }
        let cat = (poi.poiType ?? "").lowercased()
        if selected.isEmpty { return culturalCats.contains(cat) }
        if selected.contains(cat) { return true }
        return selected.contains { map[$0]?.contains(cat) == true }
    }
}

/// Port di SlidingWindowLogic.kt: selezione dei POI monitorati (gemme prima,
/// poi distanza reale). Su iOS il cap regioni OS è 20: le regioni servono solo
/// da assicurazione di rilancio, i trigger veri sono valutati in-process.
enum SlidingWindowLogic {
    /// Cap Android (33 POI) mantenuto per la finestra logica in-process.
    static let maxPois = 33
    /// Cap iOS per il monitoraggio regioni CLLocationManager (20 totali, 1 sentinella).
    static let maxMonitoredRegions = 19
    static let sentinelId = "window_sentinel"
    static let sentinelRadiusM: Double = 2000

    struct WindowPoi {
        let id: String
        let isGem: Bool
        let distanceM: Double
    }

    static func selectWindow(_ pois: [WindowPoi], maxPois: Int = SlidingWindowLogic.maxPois) -> [String] {
        pois.sorted {
            if $0.isGem != $1.isGem { return $0.isGem }
            return $0.distanceM < $1.distanceM
        }
        .prefix(maxPois)
        .map { $0.id }
    }
}

func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
