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
    /// Raggi calibrati sul perimetro reale (footprint OSM) quando il POI è
    /// stato processato: alert_radius / geofence_radius del DB e del pacchetto
    /// offline. nil = non calibrato → si usano i raggi di modalità. Usati SOLO
    /// se c'è un ingresso reale (entrance), come radiiForTransport lato web
    /// (src/lib/guideSettings.ts) e la modifica gemella Android. Default nil
    /// così l'init membrowise resta compatibile con i chiamanti esistenti.
    var alertRadius: Int? = nil
    var arrivalRadius: Int? = nil

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
        if let v = alertRadius { d["alertRadius"] = v }
        if let v = arrivalRadius { d["arrivalRadius"] = v }
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
    /// Uscito dall'isteresi DOPO un annuncio: il timestamp del record fa da
    /// cooldown anti-ripetizione. Prima l'uscita cancellava lo stato e il
    /// primo rientro nel raggio ri-annunciava lo stesso POI: in pineta, col
    /// GPS che balla sotto le chiome, il banner ricompariva ogni pochi metri.
    case exited = "EXITED"
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
        // Preserva i raggi calibrati sul perimetro (footprint) che il pacchetto
        // offline già trasporta: prima venivano scartati e il trigger usava solo
        // i raggi di modalità. L'ingresso reale non è nel bundle offline, quindi
        // di fatto il footprint entra in gioco solo per i POI online (dove
        // entranceLat/Lon sono valorizzati) — vedi effectiveRadii/BackgroundPoiManager.
        Poi(id: id, nome: nome, lat: lat, lon: lon,
            entranceLat: nil, entranceLon: nil,
            poiType: poiType ?? category, guideDefault: "nicky",
            isGem: isGem, isFromItinerary: false, teaserText: teaserText,
            alertRadius: alertRadius, arrivalRadius: arrivalRadius)
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
        // Chiavi dedicate del web (isCategoryAllowed): castelli/archeo seguono
        // "monumenti" nella UI ma, se un giorno arrivano come chiave a sé nella
        // lista `selected`, devono comunque attivare i rispettivi POI.
        "castelli": ["castle", "castelli"],
        "archeo": ["ruins", "archaeological_site", "archeo"],
        "musei": ["museum", "gallery", "musei"],
        "chiese": ["church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese"],
        "panorami": ["viewpoint", "park", "panorami"],
        "locali": ["restaurant", "cafe", "bar", "fast_food", "pub", "locali"],
        "utilita": ["pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"],
        "famiglie": ["playground", "theme_park", "aquarium", "zoo", "famiglie"],
        "consigli": ["information", "tourism_information", "office", "consigli"],
        // Gemme: chiave presente per completezza (passano comunque via isGem).
        "gemme": ["gemme"],
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        "community": ["community"]
    ]

    /// Set "default assoluto" (nessuna categoria selezionata): allineato al
    /// default del setup GeoControl web { monumenti, musei, chiese } — panorami
    /// e consigli sono OFF di default (src/hooks/useGeofencing.ts:393). Prima
    /// includeva viewpoint/park/panorami e i panorami risultavano attivi di
    /// default, divergendo dal web. Tenere allineato ad Android (parsePois).
    static let culturalCats = [
        "monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "monumenti",
        "museum", "gallery", "musei", "church", "place_of_worship", "cathedral",
        "chiese"
    ]

    /// Stessa semantica di isPoiCategoryActive del receiver Android.
    static func isActive(poi: Poi, selected: [String]) -> Bool {
        if poi.isFromItinerary { return true }
        let cat = (poi.poiType ?? "").lowercased()
        // GEMME = "default assoluto, sempre attive a parte" (App.tsx:187 e il
        // filtro radar App.tsx poisUpdated "Gemme Sempre Attive, come nel
        // servizio nativo"), e isCategoryAllowed usa `?? true`. Il modello a
        // lista `selected` non può rappresentare una disattivazione ESPLICITA
        // delle gemme (la lista contiene solo chiavi ON, e il default nativo
        // che parte dal JS — ['monumenti','musei','chiese'] — non include mai
        // 'gemme'): richiederla in lista le spegnerebbe di default = regressione
        // della feature di punta. Restano quindi sempre attive, in parità con
        // Android (isPoiCategoryActive: `if (poi.isGem) return true`). Vedi REPORT.
        if poi.isGem || cat == "gemme" { return true }
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
