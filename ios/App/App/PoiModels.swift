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
    /// PERIMETRO dell'edificio (tabella poi_footprints, poligono OSM) nel
    /// formato compatto "lon,lat lon,lat;..." — anelli separati da ';'.
    /// Non GeoJSON: in memoria ci stanno migliaia di POI e le parentesi
    /// sarebbero il 40% del peso senza dire niente di più.
    /// nil per i POI che non ne hanno (402.889 su 2,3 milioni ce l'hanno):
    /// quelli continuano a ragionare a raggi come sempre.
    /// Parità con PoiEntity.footprint (Android) e footprints.ts (web).
    var footprint: String? = nil

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
        // Il perimetro NON entra nel payload verso il JS: sono centinaia di
        // byte per POI che al lato web non servono (ha il suo modulo che se li
        // scarica da solo), e su un radar da 120 POI sarebbero decine di KB
        // attraversati a ogni aggiornamento del ponte Capacitor.
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
    /// LA PORTA, non il centroide (shared_pois.entrance_lat/lon). Dal
    /// 22/08/2026 /api/area/bundle la manda (migration
    /// 20260822150000_area_bundle_ingresso_perimetro.sql): offline il geofence
    /// punta all'ingresso come online. nil = centroide, come prima; il default
    /// nil mantiene decodificabili i pacchetti scaricati con lo schema vecchio.
    var entranceLat: Double? = nil
    var entranceLon: Double? = nil
    /// PERIMETRO dell'edificio nel formato compatto di Poi.footprint: senza
    /// rete poi_footprints non si può interrogare, quindi viaggia nel pacchetto.
    var footprint: String? = nil
    /// Indirizzo leggibile (via e civico), per la notifica e la voce.
    var address: String? = nil

    func toPoi() -> Poi {
        // Ingresso, raggi calibrati e perimetro passano tutti: il trigger
        // offline deve dare la STESSA risposta di quello online sullo stesso
        // punto. effectiveRadii gestisce già hasEntrance, dentroPerimetro il
        // poligono.
        Poi(id: id, nome: nome, lat: lat, lon: lon,
            entranceLat: entranceLat, entranceLon: entranceLon,
            poiType: poiType ?? category, guideDefault: "nicky",
            isGem: isGem, isFromItinerary: false, teaserText: teaserText,
            alertRadius: alertRadius, arrivalRadius: arrivalRadius,
            footprint: footprint)
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
        // Monumenti: include il patrimonio costruito importato in fase 2
        // (17/08/2026). Allineato a CategoryMap.kt e guideSettings.
        "monumenti": ["monument", "castle", "castelli", "ruins", "archaeological_site", "archeo", "artwork", "attraction", "monumenti",
                      "square", "bridge", "fountain", "theatre", "opera_house", "palace",
                      "tower", "skyscraper", "cemetery", "library", "windmill", "aqueduct",
                      "observatory", "stadium",
                      // Fasi 3-5: nessun chip nuovo, tutto in "monumenti".
                      "birthplace", "house_museum", "necropolis", "catacomb", "fortress",
                      "city_walls", "villa", "harbour", "mine", "chimney", "funicular",
                      "amphitheatre", "roman_baths", "triumphal_arch", "obelisk", "mausoleum",
                      "market_hall", "train_station", "dam", "watermill", "prison", "museum_ship",
                      "archaeological_park", "memorial", "sculpture", "university", "town_hall",
                      "roman_theatre", "roman_circus", "roman_villa", "domus", "city_gate",
                      "coastal_tower", "stronghold", "quarry", "saltworks", "racetrack",
                      "racecourse", "ski_jump", "war_cemetery", "concentration_camp",
                      "rack_railway", "pier", "shipyard", "archive", "radio_telescope", "hydro_plant"],
        // Chiavi dedicate del web (isCategoryAllowed): castelli/archeo seguono
        // "monumenti" nella UI ma, se un giorno arrivano come chiave a sé nella
        // lista `selected`, devono comunque attivare i rispettivi POI.
        "castelli": ["castle", "castelli"],
        "archeo": ["ruins", "archaeological_site", "archeo"],
        "musei": ["museum", "gallery", "musei", "art_museum", "natural_history_museum", "art_gallery", "house_museum"],
        "chiese": ["church", "chiesa", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario", "chiese",
                   "baptistery", "bell_tower", "cloister", "crypt", "synagogue", "mosque", "temple"],
        // Panorami e NATURA: le verticali naturali (spiagge, cascate, grotte,
        // vette, sorgenti termali, isole, riserve, fari, funivie) confluiscono
        // qui invece di avere una categoria propria — "panorami" è già cablata
        // ovunque ed è già abilitata all'audioguida. Tenere allineato a
        // guideSettings.isCategoryAllowed (web) e CategoryMap.kt (Android).
        "panorami": ["viewpoint", "park", "panorami",
                     "beach", "waterfall", "cave", "peak", "spring", "island", "cliff", "bay", "lake",
                     "glacier", "volcano", "nature_reserve", "lighthouse", "aerialway", "natura",
                     "trail", "scenic_road", "tree", "desert", "forest", "garden",
                     "botanical_garden", "geopark", "via_ferrata", "ski_resort"],
        // NATURA DIVISA PER FAMIGLIE (21/08/2026). Sul web «panorami» era un
        // mucchio solo: spiagge, vette, cascate, grotte e parchi insieme, o
        // tutti o nessuno. Ora ognuna ha il suo sotto-filtro, e queste chiavi
        // sono le stesse che il web scrive in `wip_active_subcategories`:
        // senza, accendendo solo «spiagge» l'audioguida nativa non
        // riconoscerebbe piu' niente. La chiave «panorami» sopra RESTA,
        // perche' le installazioni vecchie hanno ancora quella salvata.
        // Allineato a poiTaxonomy.ts (web) e CategoryMap.kt (Android).
        // "natura" (22/08/2026): la macro che raccoglie le cinque famiglie —
        // la chiave scritta da chip mappa e setup quando si accende Natura
        // senza toccare le singole famiglie. Allineata a CategoryMap.kt.
        "natura": ["beach", "spiaggia", "spiagge", "bay", "baia", "island", "isola",
                   "cliff", "falesia", "coast", "costa", "dune",
                   "peak", "vetta", "vette", "volcano", "vulcano", "glacier", "ghiacciaio",
                   "mountain_pass", "valico", "ridge", "arete", "saddle",
                   "waterfall", "cascata", "cascate", "spring", "sorgente", "hot_spring",
                   "lake", "lago", "laghi", "river", "fiume", "gorge", "gola", "canyon",
                   "cave", "grotta", "grotte", "cave_entrance", "sinkhole", "abisso",
                   "park", "parchi", "parco", "garden", "giardino", "botanical_garden",
                   "nature_reserve", "riserva", "geopark", "forest", "foresta", "wood", "bosco",
                   "desert", "deserto", "tree", "albero", "national_park"],
        "spiagge": ["beach", "spiaggia", "spiagge", "bay", "baia", "island", "isola",
                    "cliff", "falesia", "coast", "costa", "dune"],
        "vette": ["peak", "vetta", "vette", "volcano", "vulcano", "glacier", "ghiacciaio",
                  "mountain_pass", "valico", "ridge", "arete", "saddle"],
        "acque": ["waterfall", "cascata", "cascate", "spring", "sorgente", "hot_spring",
                  "lake", "lago", "laghi", "river", "fiume", "gorge", "gola", "canyon"],
        "grotte": ["cave", "grotta", "grotte", "cave_entrance", "sinkhole", "abisso"],
        "parchi": ["park", "parchi", "parco", "garden", "giardino", "botanical_garden",
                   "nature_reserve", "riserva", "geopark", "forest", "foresta", "wood", "bosco",
                   "desert", "deserto", "tree", "albero", "national_park"],
        "locali": ["restaurant", "cafe", "bar", "fast_food", "pub", "locali"],
        "utilita": ["pharmacy", "hospital", "police", "taxi", "utilita", "marketplace", "mercato", "drinking_water", "station", "subway_entrance", "toll_booth"],
        "famiglie": ["playground", "theme_park", "aquarium", "zoo", "famiglie", "water_park"],
        /// Vino e Gusto (20/08/2026): 199.280 luoghi del gusto importati da
        /// OpenStreetMap. Chip OFF di default. Allineato a CategoryMap.kt.
        "enogastronomia": ["enogastronomia",
                           "cantina", "enoteca", "vigneto", "uliveto", "birrificio", "distilleria",
                           "caseificio", "formaggi", "frantoio", "gastronomia", "fattoria",
                           "pasticceria", "cioccolato", "caffe", "te", "miele", "spezie",
                           "museo_gusto", "strada_del_vino",
                           "panificio", "macelleria", "pescheria", "ortofrutta", "dolciumi"],
        "consigli": ["information", "tourism_information", "office", "consigli"],
        // Gemme: chiave presente per completezza (passano comunque via isGem).
        "gemme": ["gemme"],
        // WIP Community (Vision approvate): default OFF, MAI in culturalCats.
        // È l'ULTIMA categoria con audioguida: vedi la nota qui sotto.
        "community": ["community"]
        //
        // ── VERTICALI TEMATICI: NON VANNO IN QUESTA MAPPA ──────────────────
        // terme, cinema, cieli, street_art, mercati, fioriture, memoria, lento.
        // Aggiunti il 21/08/2026 e RIMOSSI il 22/08 per decisione del
        // committente: "le categorie delle audioguide devono fermarsi ai
        // consigli gratuiti, da WIP Community in giù non hanno audioguide".
        // I POI tematici restano visibili sulla mappa, nelle chip, negli
        // itinerari e negli eventi: semplicemente non fanno partire la voce.
        // Come per beni_culturali, l'esclusione è per OMISSIONE e va protetta:
        // NON riaggiungerli qui. Tenere allineato a CategoryMap.kt (Android),
        // dove c'è la stessa nota.
    ]

    /// Set "default assoluto" (nessuna categoria selezionata): allineato al
    /// default del setup GeoControl web { monumenti, musei, chiese } — panorami
    /// e consigli sono OFF di default (src/hooks/useGeofencing.ts:393).
    ///
    /// (22/08/2026) Derivato dalla `map` invece di una lista scritta a mano,
    /// come CategoryMap.DEFAULT_CULTURAL_CATEGORIES su Android: quella aveva
    /// 15 valori mentre monumenti+musei+chiese ne contano ~100, quindi con
    /// l'insieme vuoto una basilica, un palazzo o un anfiteatro restavano
    /// muti anche se le stesse chip li avrebbero accesi.
    static let culturalCats: Set<String> = Set(
        (map["monumenti"] ?? []) + (map["musei"] ?? []) + (map["chiese"] ?? [])
    )

    /// Attivazione delle gemme: attive di DEFAULT (il JS non inoltra mai
    /// "gemme" fra le categorie native, quindi gating su `contains("gemme")`
    /// le spegnerebbe tutte). L'utente può spegnerle SOLO con un OFF
    /// esplicito, rappresentato dalla sentinella "gemme:off" nella lista.
    /// Port di GeofenceBroadcastReceiver.areGemsActive (Android).
    static func areGemsActive(selected: [String]) -> Bool {
        !selected.contains("gemme:off")
    }

    /// Stessa semantica di isPoiCategoryActive del receiver Android.
    static func isActive(poi: Poi, selected: [String]) -> Bool {
        if poi.isFromItinerary { return true }
        let cat = (poi.poiType ?? "").lowercased()
        // GEMME = "default assoluto, sempre attive a parte" (App.tsx:187 e il
        // filtro radar App.tsx poisUpdated "Gemme Sempre Attive, come nel
        // servizio nativo"), e isCategoryAllowed usa `?? true`. Restano attive
        // salvo la sentinella "gemme:off" (vedi areGemsActive), in parità con
        // Android (isPoiCategoryActive: `if (poi.isGem) return areGemsActive`).
        if poi.isGem || cat == "gemme" { return areGemsActive(selected: selected) }
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
