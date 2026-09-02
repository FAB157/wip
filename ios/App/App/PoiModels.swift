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
    /// Indirizzo leggibile del POI (shared_pois.address) e la sua PROVENIENZA
    /// (shared_pois.address_source). La stringa da sola NON fa gradino nella
    /// scala di fiducia: un testo non si può trasformare in un cerchio. Serve
    /// alla notifica e alla voce; il gradino lo fa il PUNTO qui sotto.
    /// `address_source == "strada_vicina"` è solo la via con nome più vicina —
    /// non l'indirizzo del luogo: scarta anche il punto (vedi puntoIndirizzo).
    /// Default nil: l'init membrowise resta compatibile con i chiamanti
    /// esistenti e i pacchetti offline già scaricati restano decodificabili.
    var address: String? = nil
    var addressSource: String? = nil
    /// IL PUNTO DELL'INDIRIZZO (23/08/2026, migration
    /// 20260823160000_poi_address_point.sql: address_point_lat/lon/source).
    /// NON è una geocodifica testuale: è la casa più vicina al POI nel dump
    /// Nominatim, cioè vicinanza MISURATA a pochi metri. Per questo vale come
    /// punto d'ARRIVO anche senza numero civico — «chi ha indirizzo, quello È
    /// l'arrivo: il trigger a 30 m da lì, e il navigatore punta a
    /// quell'indirizzo» (regola dell'utente).
    /// `addressPointSource` (photon_casa_civico | photon_casa | …) oggi non
    /// cambia il raggio — il punto è misurato in entrambi i casi — ma è
    /// l'unico appiglio se un domani una fonte peggiore scriverà qui.
    /// Parità con PoiEntity.addressPoint* (Android).
    var addressPointLat: Double? = nil
    var addressPointLon: Double? = nil
    var addressPointSource: String? = nil

    /// GUARDIA: oltre questa distanza dal centroide il punto dell'indirizzo non
    /// è l'indirizzo di QUESTO POI ma di qualcos'altro (un abbinamento
    /// sbagliato, una casa dall'altra parte del paese). Meglio il centroide,
    /// che è sicuramente il posto giusto per quanto impreciso, di un punto
    /// preciso nel posto sbagliato. Stesso valore di
    /// RaggiFiducia.MAX_DISTANZA_PUNTO_INDIRIZZO (Android).
    static let maxDistanzaPuntoIndirizzo: Double = 250

    /// Il PUNTO dell'indirizzo, se utilizzabile, altrimenti nil.
    /// Due condizioni, entrambe necessarie: la fonte non è `strada_vicina`, e
    /// il punto sta entro `maxDistanzaPuntoIndirizzo` dal centroide.
    var puntoIndirizzo: CLLocation? {
        guard let pLat = addressPointLat, let pLon = addressPointLon,
              addressSource != "strada_vicina" else { return nil }
        let punto = CLLocation(latitude: pLat, longitude: pLon)
        guard punto.distance(from: CLLocation(latitude: lat, longitude: lon))
                <= Self.maxDistanzaPuntoIndirizzo else { return nil }
        return punto
    }

    /// IL PUNTO D'ARRIVO di questo POI: ingresso → punto dell'indirizzo →
    /// centroide. È lo stesso punto per il trigger e per il navigatore.
    /// Tutti i chiamanti (BackgroundPoiManager, BearingGate, le region
    /// CLLocationManager) leggono da qui: la gerarchia si cambia in un posto
    /// solo. Parità con RaggiFiducia.puntoArrivo (Android).
    var coordinate: CLLocation {
        if let eLat = entranceLat, let eLon = entranceLon {
            return CLLocation(latitude: eLat, longitude: eLon)
        }
        if let punto = puntoIndirizzo { return punto }
        return CLLocation(latitude: lat, longitude: lon)
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

/// RAGGIO IN BASE ALLA FIDUCIA DEL PUNTO.
///
/// Un geofence è un cerchio attorno a un punto, ma non tutti i punti valgono
/// uguale. Sappiamo esattamente dov'è il muro di una chiesa se ne abbiamo il
/// perimetro; sappiamo dov'è la porta se abbiamo l'ingresso OSM; col PUNTO
/// dell'indirizzo sappiamo la casa più vicina misurata a pochi metri; col solo
/// centroide di un poligono grande, o di un POI importato da un registro, il
/// punto può cadere decine di metri fuori dall'edificio. Allargare il cerchio
/// per tutti significa parlare dall'altra parte della strada dove il punto è
/// preciso; non allargarlo mai significa non parlare affatto dove il punto è
/// approssimativo.
///
/// LA SCALA A QUATTRO LIVELLI (identica a web e Android):
///  • `perimetro` — c'è il poligono: la distanza si misura DAL MURO
///    (PoiFootprints), il cerchio non serve e non si allarga di un metro.
///  • `ingresso`  — c'è entrance_lat/lon: è la porta, raggio BASE.
///  • `indirizzo` — c'è il PUNTO dell'indirizzo (address_point_lat/lon)
///    utilizzabile: raggio BASE, stretto, perché quel punto È l'arrivo.
///  • `centroide` — nient'altro: raggio invariato, MAI raddoppiato (vedi sotto).
///
/// Regola (decisione utente, 01/09/2026): IL RAGGIO NON AUMENTA MAI PER
/// INCERTEZZA. Fino a ieri un POI a centroide puro raddoppiava il raggio
/// (fino a un tetto di 250/400 m) — ma la maggioranza dei POI importati da
/// Overture/OSM è a centroide (nessun entrance_lat/lon geocodificato) anche
/// quando è un luogo notissimo con indirizzo (Chiesa Evangelica ADI, Chiesa
/// San Pietro Avenza, Biblioteca della Camera di Commercio...), e il
/// raddoppio produceva notifiche "Esplorazione" a 200-400+ m su POI mai
/// avvicinati davvero.
///
/// Il `geofence_radius`/`alert_radius` calibrati dal DB, quando ci sono
/// (misurati o default di categoria Overture), VINCONO sempre — con o senza
/// entrance geocodificato, perché sono comunque una misura, non una stima —
/// e possono solo allargare la preferenza utente, mai stringerla. Senza
/// raggio calibrato resta la preferenza utente così com'è (default 150 m a
/// piedi / 300 m in auto), nessun moltiplicatore.
enum PoiRadii {
    /// UNICA funzione dei raggi operativi: la usano sia la registrazione delle
    /// region CLLocationManager sia la valutazione predittiva dei trigger. Se
    /// due chiamanti calcolassero raggi diversi, la region di rilancio e il
    /// trigger vero scatterebbero in due punti diversi.
    static func effettivi(
        poi: Poi,
        isDriving: Bool,
        baseAlert: Double,
        baseArrival: Double
    ) -> (alert: Double, arrival: Double) {
        // RAGGIO CALIBRATO DAL DB: vince sempre che sia presente, con o senza
        // entrance geocodificato. In auto può solo ALLARGARE (a 50 km/h un
        // raggio stretto si attraversa fra due fix); a piedi la misura batte
        // sempre la preferenza utente.
        let calAlert = Double(poi.alertRadius ?? 0)
        let calArrival = Double(poi.arrivalRadius ?? 0)
        if calAlert > 0 || calArrival > 0 {
            let alert = calAlert > 0 ? max(baseAlert, calAlert) : baseAlert
            let arrival = calArrival > 0
                ? (isDriving ? max(baseArrival, calArrival) : calArrival)
                : baseArrival
            return (alert, arrival)
        }

        // Nessun raggio calibrato: centroide puro, non sappiamo dove sia la
        // porta. Il raggio resta quello dell'utente, punto — mai allargato.
        return (baseAlert, baseArrival)
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
        // `address` passa anche lui, ma solo come testo per notifica e voce:
        // dal 23/08/2026 il gradino «indirizzo» lo fa il PUNTO
        // (address_point_lat/lon), che /api/area/bundle NON manda ancora. Un
        // POI offline con la sola stringa resta quindi «centroide» (raggio ×2),
        // esattamente com'era prima della migration: conservativo. Quando il
        // bundle porterà anche le due coordinate, vanno aggiunte a OfflinePoi e
        // passate qui, e l'offline tornerà a dare la stessa risposta dell'online.
        Poi(id: id, nome: nome, lat: lat, lon: lon,
            entranceLat: entranceLat, entranceLon: entranceLon,
            poiType: poiType ?? category, guideDefault: "nicky",
            isGem: isGem, isFromItinerary: false, teaserText: teaserText,
            alertRadius: alertRadius, arrivalRadius: arrivalRadius,
            footprint: footprint, address: address)
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
    // (28/08/2026, ITI-06) Campi opzionali con default: il JSON dei pacchetti
    // già salvati (senza queste chiavi) si decodifica ancora, e le chiamate
    // esistenti all'init memberwise restano valide.
    /// Ultimo uso (epoch ms): download, sync o lettura di un testo di un suo
    /// POI. Serve all'eviction LRU del tetto di storage (WipPackageDownloadManager).
    var lastUsedAt: TimeInterval? = nil
    /// Checkpoint del DOWNLOAD PIENO interrotto (cursore keyset dell'ultima
    /// pagina scritta): il prossimo tentativo riparte da qui. Solo il download
    /// pieno lo scrive, mai il delta — vedi PackageDownloadManager.kt.
    var pendingCursorUpdated: String? = nil
    var pendingCursorId: String? = nil
    /// Firma del run che ha scritto il checkpoint (epoch ms): senza firma il
    /// checkpoint non si riprende. È anche il timbro dei riferimenti scritti
    /// da quel run (PoiStore.pruneStaleRefs).
    var pendingRunStartedAt: TimeInterval? = nil

    func toJson() -> [String: Any] {
        [
            "id": id, "name": name, "centerLat": centerLat, "centerLon": centerLon,
            "radiusKm": radiusKm, "language": language, "poiCount": poiCount,
            "sizeBytes": sizeBytes, "downloadedAt": downloadedAt,
            "lastSyncAt": lastSyncAt ?? "", "status": status,
            "lastUsedAt": lastUsedAt ?? downloadedAt,
            "resumable": !(pendingCursorUpdated ?? "").isEmpty && pendingRunStartedAt != nil
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
        // ev_charging (27/08/2026): colonnine EV da OpenChargeMap.
        // marketplace/mercato tolti (29/08/2026): verticale Mercatini, senza audioguida.
        "utilita": ["pharmacy", "hospital", "police", "taxi", "utilita", "drinking_water", "station", "subway_entrance", "toll_booth", "ev_charging"],
        "famiglie": ["playground", "theme_park", "aquarium", "zoo", "famiglie", "water_park"],
        /// Vino e Gusto (20/08/2026): 199.280 luoghi del gusto importati da
        /// OpenStreetMap. Chip OFF di default. Allineato a CategoryMap.kt.
        "enogastronomia": ["enogastronomia",
                           "cantina", "enoteca", "vigneto", "uliveto", "birrificio", "distilleria",
                           "caseificio", "formaggi", "frantoio", "gastronomia", "fattoria",
                           "pasticceria", "cioccolato", "caffe", "te", "miele", "spezie",
                           "museo_gusto", "strada_del_vino",
                           "panificio", "macelleria", "pescheria", "ortofrutta", "dolciumi"],
        /// Turismo dello Shopping (28/08/2026): vie/quartieri dello shopping,
        /// grandi magazzini, mall, gallerie storiche, outlet village,
        /// duty-free, bazaar/souk nella loro dimensione di shopping turistico.
        /// Stesso trattamento di enogastronomia. Allineato a CategoryMap.kt.
        "shopping": ["shopping",
                     "shopping_street", "department_store", "shopping_mall", "historic_arcade",
                     "outlet_village", "souk_bazaar", "duty_free_zone"],
        /// Turismo di Lusso (28/08/2026): hotel/resort top di gamma,
        /// ristoranti stellati, marine per superyacht, treni storici di
        /// lusso, sci di lusso. Stesso trattamento di enogastronomia.
        /// Allineato a CategoryMap.kt.
        "lusso": ["lusso",
                  "palace_hotel", "hotel_5_stelle", "ristorante_stellato", "chiave_michelin",
                  "resort_esclusivo", "marina_yacht", "club_esclusivo", "treno_lusso_storico",
                  "isola_privata", "stazione_sci_lusso", "ryokan_lusso",
                  "noleggio_yacht", "jet_privato", "casino_lusso"],
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
