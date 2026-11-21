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
    /// LA FONTE della scheda (05/10/2026), per l'ARBITRATO fra luoghi vicini:
    /// la colonna `source` delle RPC nearby_pois / get_geofence_pois
    /// (= coalesce(enrichment_source, 'official')), lo stesso valore che il web
    /// legge in foregroundTriggers.ts. Un luogo con una voce di
    /// Wikipedia/Wikidata alle spalle «pesa» (vedi `Arbitrato.pesa` più sotto):
    /// davanti al Pantheon parlava una targa, in Piazza Navona un locale.
    /// Default nil: tappe d'itinerario, pacchetti offline e POI già salvati non
    /// la portano (restano decodificabili) e sono «senza peso», salvo le gemme.
    /// Parità con PoiEntity.source (Android).
    var source: String? = nil
    /// (25/10/2026) Campi per `NomiAnnunciabili` (port di nomiAnnunciabili.ts):
    /// nome tradotto (`name_translated`), QID Wikidata (`wikidata`), città
    /// (`city`) e il teaser INGLESE (`teaser_text_en`, serve solo a scoprire
    /// una colonna «italiana» che contiene il testo inglese). Tutti nil se la
    /// RPC non li porta: le regole che li usano degradano a quelle di prima.
    /// Default nil: pacchetti e POI già salvati restano decodificabili.
    var nameTranslated: String? = nil
    var wikidata: String? = nil
    var city: String? = nil
    var teaserTextEn: String? = nil

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
        // (03/10/2026, committente dopo la simulazione su 20 luoghi: «non va bene,
        // deve essere a 30 m e 50 in auto, 150 a piedi e 300 in auto») I RAGGI
        // DEL DATABASE NON CONTANO PIÙ. `geofence_radius`/`alert_radius` non
        // sono misure: li scrive il trigger `assign_geofence_radii` alla
        // nascita della riga, per categoria (80/200 monumenti e chiese, 100/200
        // musei, 120/250 gemme; il 66% dei luoghi ha 80/200). Misurato: guida a
        // 70-120 m dalla porta su 60 percorsi su 60, avviso a 200 m. Valgono
        // SOLO i raggi dell'utente (default 30/150 a piedi, 50/300 in auto); il
        // perimetro vero dell'edificio (30 m dal muro) resta l'unica misura.
        // Uguale in RaggiFiducia.calcola (Kotlin) e radiiForTransport (web).

        // Nessun raggio calibrato: centroide puro, non sappiamo dove sia la
        // porta. Il raggio resta quello dell'utente, punto — mai allargato.
        return (baseAlert, baseArrival)
    }
}

/// ARBITRATO FRA I LUOGHI — quale luogo parla quando più d'uno è pronto
/// (05/10/2026). Port delle regole del motore web del 04–05/10/2026
/// (src/lib/geofencing/foregroundTriggers.ts, la fonte di verità), trovate col
/// test virtuale a Roma e Milano: davanti al Pantheon parlava una targa, in
/// Piazza Navona un locale, e le dieci righe del Pantheon parlavano una dopo
/// l'altra.
///
/// Qui vive solo la parte PURA (costanti, peso, nome nudo, punteggio); lo
/// stato (chi aspetta, la voce che parla) è in BackgroundPoiManager.
///
/// IDENTICO a `object Arbitrato` in GeofenceManager.kt (Android): cambiare un
/// valore qui = cambiarlo là e in foregroundTriggers.ts.
enum Arbitrato {
    /// Una gemma «vale» 50 m nell'arbitrato: sul web sono 30 (gemma) + 20
    /// (`premium`, che la RPC get_geofence_pois restituisce uguale a is_gem).
    static let gemmaBonusM: Double = 50
    /// Chi ha una voce di Wikipedia/Wikidata alle spalle vale 25 m.
    static let fonteBonusM: Double = 25
    /// Un luogo senza peso cede il passo se uno che pesa sta arrivando entro questi metri di strada.
    static let attesaImportanteM: Double = 100
    /// Isteresi minima per dire «la distanza sta calando» (come il web).
    static let avvicinaEpsM: Double = 0.5
    /// Stesso nome nudo entro questi metri = stesso luogo: tace insieme al vincitore.
    static let doppioneM: Double = 150
    /// Stesso nome raccontato da meno di così: silenzio, anche se la riga è un'altra.
    static let nomeAppenaDettoMs: Double = 10 * 60_000
    /// Silenzio dopo la fine di una guida, prima che parli il luogo successivo.
    static let pausaDopoGuidaMs: Double = 20_000
    /// Quanto si aspetta che la voce di un arrivo appena emesso PARTA prima di
    /// considerarla mai partita. Sul web sono 120 s (lì in mezzo c'è il
    /// paywall); qui la voce è il teaser nativo, che parte da solo: bastano i
    /// tempi del recupero del teaser dal server con un margine.
    static let attesaPartenzaMs: Double = 45_000
    /// Aggancio alla strada che sposta il fix più di così: si misura anche dal punto non agganciato.
    static let snapDubbioM: Double = 5
    /// Fin dove si cerca la strada dal punto NON agganciato: serve solo a confermare un arrivo.
    static func ricercaLiberaM(isDriving: Bool) -> Double { isDriving ? 150 : 100 }
    /// Da fermi il GPS tace (filtro di spostamento): chi aspetta il suo turno si rivaluta ogni 5 s…
    static let battitoAttesaMs: Double = 5_000
    /// …sull'ultima posizione, finché non è più vecchia di così (come il web).
    static let fermiMaxEtaMs: Double = 10 * 60_000

    static func haFonte(_ poi: Poi) -> Bool {
        (poi.source ?? "").range(of: "wiki", options: .caseInsensitive) != nil
    }

    /// Gemma, oppure una fonte Wikipedia/Wikidata alle spalle.
    static func pesa(_ poi: Poi) -> Bool { poi.isGem || haFonte(poi) }

    /// Il più basso vince: i metri (di strada) meno i bonus d'importanza.
    static func punteggio(_ poi: Poi, distM: Double) -> Double {
        distM - (poi.isGem ? gemmaBonusM : 0) - (haFonte(poi) ? fonteBonusM : 0)
    }

    /// Il nome senza parentesi, accenti e articolo: «Pantheon (Roma)» e «The
    /// Pantheon» sono lo stesso luogo. Stessi passi, nello stesso ordine, di
    /// `nomeNudo` in foregroundTriggers.ts e in GeofenceManager.kt. Un nome in
    /// un alfabeto non latino diventa vuoto: per lui le regole sul nome non
    /// scattano (come sul web).
    static func nomeNudo(_ n: String?) -> String {
        guard let n = n, !n.isEmpty else { return "" }
        // NFD e via i segni diacritici combinanti (U+0300–U+036F).
        var scalari = String.UnicodeScalarView()
        for s in n.lowercased().decomposedStringWithCanonicalMapping.unicodeScalars
        where !(s.value >= 0x0300 && s.value <= 0x036F) {
            scalari.append(s)
        }
        var out = String(scalari)
        out = out.replacingOccurrences(of: "\\([^)]*\\)", with: " ", options: .regularExpression)
        out = out.replacingOccurrences(of: "^(the|il|la|lo|le|i|gli|l')\\s+", with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
        // 21/11/2026 (collaudo notturno): articoli e preposizioni interni non
        // distinguono due righe dello stesso luogo («piazza de' Peruzzi» / «Piazza
        // dei Peruzzi»). Stessa lista di PARTICELLE_NOME in foregroundTriggers.ts.
        out = out.replacingOccurrences(of: "\\b(di|de|dei|degli|del|della|delle|dello|d|l|des|du|of)\\b", with: " ", options: .regularExpression)
        out = out.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Due nomi nudi sono lo stesso luogo: uguali, oppure (entrambi di almeno 6
    /// lettere) uno contiene l'altro. Il nome del vincitore deve avere almeno 4
    /// lettere, altrimenti la regola non si applica.
    static func stessoLuogo(nudoVincitore: String, nudoAltro: String) -> Bool {
        if nudoVincitore.count < 4 || nudoAltro.isEmpty { return false }
        if nudoVincitore == nudoAltro { return true }
        return nudoVincitore.count >= 6 && nudoAltro.count >= 6 &&
            (nudoVincitore.contains(nudoAltro) || nudoAltro.contains(nudoVincitore))
    }

    // ── TARGHE E LAPIDI IN SILENZIO SE C'È UN MONUMENTO VICINO (08/10/2026) ──
    // Port della regola web del 05/10/2026 (committente, prova a Parigi:
    // sull'Île de la Cité le targhe parlavano prima di Notre-Dame), l'ultima
    // che sul nativo mancava. Una targa con un luogo che non è una targa entro
    // 100 m NON parla e NON entra nel cooldown: lontano dai monumenti parla
    // come prima. Una gemma non è mai «solo una targa». Identico a
    // `Arbitrato.eTarga` in GeofenceManager.kt e a foregroundTriggers.ts.
    static let targaM: Double = 100

    static func eTarga(_ poi: Poi) -> Bool {
        if poi.isGem { return false }
        let cat = (poi.poiType ?? "").lowercased()
        if cat.range(of: "plaque|targa|lapide|stolperstein", options: .regularExpression) != nil { return true }
        if poi.id.hasPrefix("plaque-") { return true }
        return poi.nome.range(of: "\\b(plaque|targa|lapide|stolperstein|gedenktafel|placa conmemorativa)\\b",
                              options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func metri(_ la1: Double, _ lo1: Double, _ la2: Double, _ lo2: Double) -> Double {
        let r = 6_371_000.0, k = Double.pi / 180
        let dLa = (la2 - la1) * k, dLo = (lo2 - lo1) * k
        let a = sin(dLa / 2) * sin(dLa / 2) + cos(la1 * k) * cos(la2 * k) * sin(dLo / 2) * sin(dLo / 2)
        return 2 * r * asin(min(1, sqrt(a)))
    }

    /// Fra i luoghi dati (quelli che il setup lascia parlare, attorno
    /// all'utente) le targhe che hanno entro 100 m un luogo che non è una targa.
    static func targheConMonumentoVicino(_ luoghi: [Poi]) -> Set<String> {
        let targhe = luoghi.filter { eTarga($0) }
        if targhe.isEmpty { return [] }
        let altri = luoghi.filter { !eTarga($0) }
        if altri.isEmpty { return [] }
        var mute = Set<String>()
        for t in targhe {
            for p in altri {
                if abs(p.lat - t.lat) > 0.0012 || abs(p.lon - t.lon) > 0.002 { continue }
                if metri(t.lat, t.lon, p.lat, p.lon) <= targaM { mute.insert(t.id); break }
            }
        }
        return mute
    }
}

/// QUALI RIGHE POSSONO PARLARE E QUALI NOMI SI POSSONO ANNUNCIARE (25/10/2026).
/// Port 1:1 di src/lib/geofencing/nomiAnnunciabili.ts (regole del collaudo di
/// 7 città del 23/10/2026): stesse espressioni regolari, stesso ordine dei
/// controlli. Cambiare qui = cambiare là e in Kotlin.
///  1. `rigaNonParla`: città, entità amministrative, metropolitane — mai.
///  2. `nomeDaAnnunciare`: l'avviso dei 150 m dice un NOME, mai un'etichetta
///     grezza (numeri, pietre d'inciampo, targhe, descrizioni inglesi, altro
///     alfabeto) — nil = niente avviso.
///  3. `stessoLuogoAltroAlfabeto`: il gemello in un altro alfabeto (o con lo
///     stesso QID) è lo stesso luogo.
///  4. `teaserLeggibile`: mai il segnaposto, mai l'italiano uguale all'inglese,
///     mai un alfabeto che la voce non legge.
enum NomiAnnunciabili {
    enum Alfabeto: String { case latino, cirillico, greco, arabo, ebraico, cjk, devanagari, thai, altro, nessuno }

    /// L'alfabeto prevalente di un testo (lettere soltanto).
    static func alfabeto(_ testo: String?) -> Alfabeto {
        var conta: [Alfabeto: Int] = [:]
        for s in (testo ?? "").unicodeScalars {
            let c = s.value
            var a: Alfabeto? = nil
            if (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f) || (c >= 0x1e00 && c <= 0x1eff) { a = .latino }
            else if c >= 0x400 && c <= 0x52f { a = .cirillico }
            else if c >= 0x370 && c <= 0x3ff { a = .greco }
            else if c >= 0x600 && c <= 0x6ff { a = .arabo }
            else if c >= 0x590 && c <= 0x5ff { a = .ebraico }
            else if (c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) { a = .cjk }
            else if c >= 0x900 && c <= 0x97f { a = .devanagari }
            else if c >= 0xe00 && c <= 0xe7f { a = .thai }
            else if s.properties.isAlphabetic { a = .altro }
            if let a = a { conta[a, default: 0] += 1 }
        }
        var migliore: Alfabeto = .nessuno, n = 0
        // Ordine fisso (il dizionario non ne ha uno): a parità vince il primo.
        for k in [Alfabeto.latino, .cirillico, .greco, .arabo, .ebraico, .cjk, .devanagari, .thai, .altro] {
            if let v = conta[k], v > n { migliore = k; n = v }
        }
        return migliore
    }

    /// L'alfabeto che la voce della lingua dell'utente sa leggere.
    static func alfabetoDellaLingua(_ lingua: String?) -> Alfabeto {
        let l = String((lingua ?? "it").lowercased().prefix(2))
        if l == "ru" { return .cirillico }
        if l == "zh" { return .cjk }
        return .latino
    }

    private static let categorieAmministrative = "^(city|town|village|hamlet|municipality|comune|citta|città|administrative|admin|region|regione|province|provincia|state|country|county|district|borough|suburb|quarter|neighbourhood|neighborhood|locality|metropolitan_area|subway|subway_station|metro|metro_station|metropolitana)$"
    private static let nomeAmministrativo = "\\b(area metropolitana|citt[aà] metropolitana|metropolitan (area|city|borough|county)|metropolitana di|metro(politana)? line|linea \\d+ della metropolitana|provincia di|province of|regione|r[ée]gion de|comune di|municipality of|municipio de|arrondissement|bezirk|landkreis|okrug|oblast|county of)\\b"
    private static let nomeMetro = "^(metro|metropolitana|subway|u-?bahn|underground|métro)\\b"

    private static func combacia(_ testo: String, _ regex: String) -> Bool {
        testo.range(of: regex, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func pulito(_ s: String?) -> String {
        (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// True se la riga non deve mai parlare come audioguida: città, entità
    /// amministrative, metropolitane. `citta`: il nome della città in cui si è —
    /// una riga che si chiama esattamente così è la città. Una gemma resta
    /// gemma, salvo che sia proprio un'entità amministrativa dichiarata.
    static func rigaNonParla(_ poi: Poi, citta: String? = nil) -> Bool {
        let tipo = pulito(poi.poiType)
        if poi.isGem { return combacia(tipo, categorieAmministrative) }
        if combacia(tipo, categorieAmministrative) { return true }
        let nome = pulito(poi.nome)
        if nome.isEmpty { return false }
        if combacia(nome, nomeAmministrativo) || combacia(nome, nomeMetro) { return true }
        if let c = citta, !pulito(c).isEmpty, nome.lowercased() == pulito(c).lowercased() { return true }
        if let c = poi.city, !pulito(c).isEmpty, nome.lowercased() == pulito(c).lowercased() { return true }
        return false
    }

    private static let soloNumeri = "^[\\s\\d.,:/#№-]+$"
    private static let pietraOTarga = "\\b(stolperstein|pietra d'inciampo|pietre d'inciampo|struikelsteen|pav[ée] de m[ée]moire|plaque|targa|lapide|gedenktafel|placa conmemorativa|memorial plaque|blue plaque)\\b|^plaque\\s*№?"
    private static let descrizioneInglese = "^(a |an |the )?(school|office|residential|apartment|commercial|industrial|public|private|old|former|historic|small|large)?\\s*(building|house|statue|sculpture|monument|bust|fountain|church|chapel|shrine|memorial|tower|gate|wall|bridge|structure|artwork|mural|relief|sign|bench)( of [a-z ]+| building)?$"

    /// Il nome da dire nell'avviso dei 150 m, o nil se il nome è grezzo.
    static func nomeDaAnnunciare(_ poi: Poi, lingua: String?) -> String? {
        var grezzo = pulito(poi.nameTranslated)
        if grezzo.isEmpty { grezzo = pulito(poi.nome) }
        // 21/11/2026 (collaudo notturno): la voce leggeva anche la parentesi
        // («Museo egizio (Il Cairo)», «Mårten Trotzig (1559–1617)»). Stessa
        // pulizia di nomeDaAnnunciare in nomiAnnunciabili.ts e NomiAnnunciabili.kt.
        grezzo = grezzo.replacingOccurrences(of: "\\s*\\([^)]*\\)\\s*", with: " ", options: .regularExpression)
        // (21/11/2026) «Abaj Kunanbajev Szobra, Asztana út, Budapest.»: fino alla prima virgola.
        grezzo = String(grezzo.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false).first ?? Substring(grezzo))
        grezzo = grezzo.replacingOccurrences(of: "[\\s.,;:\\-–]+$", with: "", options: .regularExpression)
        grezzo = grezzo.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        grezzo = grezzo.trimmingCharacters(in: .whitespacesAndNewlines)
        if grezzo.count < 3 { return nil }
        if combacia(grezzo, soloNumeri) { return nil }
        if combacia(grezzo, pietraOTarga) || combacia(poi.poiType ?? "", "stolperstein|plaque|targa") { return nil }
        if poi.id.hasPrefix("plaque-") { return nil }
        if combacia(grezzo, descrizioneInglese) || combacia(grezzo, " - (school|residential|office) building$") { return nil }
        let a = alfabeto(grezzo)
        if a != .nessuno && a != alfabetoDellaLingua(lingua) { return nil }
        return grezzo
    }

    /// QID Wikidata della riga, se lo conosciamo (colonna o id `wd-…Q123`).
    static func qidDi(_ poi: Poi) -> String? {
        let q = pulito(poi.wikidata)
        if q.range(of: "^Q\\d+$", options: .regularExpression) != nil { return q }
        if let r = poi.id.range(of: "(?:^|-)(Q\\d+)$", options: .regularExpression) {
            var m = String(poi.id[r])
            if m.hasPrefix("-") { m.removeFirst() }
            return m
        }
        return nil
    }

    /// Due righe sono lo stesso luogo scritto in due alfabeti (o lo stesso QID)?
    /// `metri`: distanza fra le due.
    static func stessoLuogoAltroAlfabeto(_ a: Poi, _ b: Poi, metri: Double) -> Bool {
        if let qa = qidDi(a), let qb = qidDi(b), qa == qb { return true }
        if !(metri <= 150) { return false }
        let na = alfabeto(a.nome), nb = alfabeto(b.nome)
        return na != .nessuno && nb != .nessuno && na != nb
    }

    /// Il teaser da LEGGERE, o nil. `teaser` è già la colonna della lingua
    /// dell'utente (WipSupabaseClient legge solo quella, regola dell'08/10);
    /// `teaserEn` serve a smascherare una colonna italiana col testo inglese.
    /// `riservaInglese`: vale solo dove il chiamante accettava già l'inglese.
    static func teaserLeggibile(teaser: String?, teaserEn: String?, lingua: String?, riservaInglese: Bool = false) -> String? {
        let l = String((lingua ?? "it").lowercased().prefix(2))
        let en = pulito(teaserEn)
        var t = pulito(teaser)
        if l != "en", !t.isEmpty, !en.isEmpty, t == en { t = "" } // la colonna della lingua contiene il testo inglese
        if t.isEmpty, l != "it", riservaInglese { t = en }
        if t.isEmpty { return nil }
        if combacia(t, "apri l'app per scoprire|open the app to discover|ouvrez l'app|abre la app|öffne die app") { return nil }
        let a = alfabeto(t)
        let attesa = alfabetoDellaLingua(l == "en" && riservaInglese ? "en" : l)
        if a != .nessuno, a != attesa, !(riservaInglese && a == .latino) { return nil }
        return t
    }

    static func teaserLeggibile(_ poi: Poi, lingua: String?, riservaInglese: Bool = false) -> String? {
        teaserLeggibile(teaser: poi.teaserText, teaserEn: poi.teaserTextEn, lingua: lingua, riservaInglese: riservaInglese)
    }
}

/// IL DAY PASS CONTA UNA VOLTA PER LUOGO (25/10/2026), come il server
/// (`/api/day-pass/consume`, regola del 19/10/2026 «il Day Pass conta una volta
/// per luogo»). Prima ogni arrivo, ogni «Ascolta» e ogni consumo dal JS
/// incrementavano `daypass_used` anche per un luogo già contato nello stesso
/// pass. Qui vive l'UNICO punto che incrementa: l'insieme degli id già contati
/// per il pass corrente sta nelle prefs e si azzera quando cambia `expiresAt`.
/// Stesse chiavi prefs di Android (`daypass_*`).
enum DayPassContatore {
    static let prefContati = "daypass_contati"
    static let prefContatiScadenza = "daypass_contati_scadenza"

    private static func contati(_ prefs: UserDefaults) -> Set<String> {
        // Gli id contati valgono solo per il pass con QUESTA scadenza.
        guard prefs.double(forKey: prefContatiScadenza) == prefs.double(forKey: "daypass_expires_at") else { return [] }
        return Set(prefs.stringArray(forKey: prefContati) ?? [])
    }

    private static func scrivi(_ ids: Set<String>, _ prefs: UserDefaults) {
        prefs.set(Array(ids), forKey: prefContati)
        prefs.set(prefs.double(forKey: "daypass_expires_at"), forKey: prefContatiScadenza)
    }

    /// È già stato contato per il pass corrente?
    static func giaContato(_ poiId: String, prefs: UserDefaults) -> Bool {
        !poiId.isEmpty && contati(prefs).contains(poiId)
    }

    /// Conta il luogo: incrementa `daypass_used` SOLO se l'id è nuovo per questo
    /// pass. `poiId` vuoto (chiamante senza id) incrementa come prima. Ritorna
    /// il contatore dopo la chiamata.
    @discardableResult
    static func consuma(poiId: String, prefs: UserDefaults) -> Int {
        let used = prefs.integer(forKey: "daypass_used")
        if poiId.isEmpty {
            prefs.set(used + 1, forKey: "daypass_used")
            return used + 1
        }
        var ids = contati(prefs)
        if ids.contains(poiId) { return used }
        ids.insert(poiId)
        scrivi(ids, prefs)
        prefs.set(used + 1, forKey: "daypass_used")
        return used + 1
    }

    /// `setDayPass` dal JS: stesso pass (stessa scadenza) → il contatore non
    /// scende mai (max fra salvato e ricevuto); pass diverso → si prende il
    /// ricevuto e l'insieme dei contati riparte da zero.
    static func imposta(expiresAt: Double, cap: Int, used: Int, prefs: UserDefaults) {
        let stessoPass = prefs.double(forKey: "daypass_expires_at") == expiresAt
        let usatoPrima = prefs.integer(forKey: "daypass_used")
        prefs.set(expiresAt, forKey: "daypass_expires_at")
        prefs.set(cap, forKey: "daypass_cap")
        if stessoPass {
            prefs.set(max(usatoPrima, used), forKey: "daypass_used")
        } else {
            prefs.set(used, forKey: "daypass_used")
            prefs.removeObject(forKey: prefContati)
            prefs.set(expiresAt, forKey: prefContatiScadenza)
        }
    }

    /// Logout: via tutto.
    static func azzera(prefs: UserDefaults) {
        prefs.removeObject(forKey: prefContati)
        prefs.removeObject(forKey: prefContatiScadenza)
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
                      "square", "bridge", "fountain", "palace",
                      "tower", "skyscraper", "cemetery", "windmill", "aqueduct",
                      "observatory",
                      // Fasi 3-5: nessun chip nuovo, tutto in "monumenti".
                      "birthplace", "house_museum", "necropolis", "catacomb", "fortress",
                      "city_walls", "villa", "harbour", "mine", "chimney", "funicular",
                      "amphitheatre", "roman_baths", "triumphal_arch", "obelisk", "mausoleum",
                      "market_hall", "dam", "watermill", "prison", "museum_ship",
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
        // (05/10/2026) Con le gemme spente una gemma parla lo stesso se è accesa la
        // SUA categoria (la Fontana di Trevi con «Monumenti» acceso): stessa regola
        // di isCategoryAllowed (web) e CategoryMap.isActive (Android).
        if (poi.isGem || cat == "gemme") && areGemsActive(selected: selected) { return true }
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
