import Foundation
import CoreLocation

/// 🧭 GATE DI BUSSOLA — «non raccontare ciò che ti sei già lasciato alle spalle»
///
/// IL CASO REALE (22/08/2026). Cammini lungo la via, superi la chiesa, e tre
/// passi DOPO la voce attacca: «Alla tua destra, la chiesa di…». Ti giri, non
/// c'è più niente da guardare, e il racconto diventa un fastidio. Succede
/// perché il geofence guarda SOLO la distanza: appena entri nel raggio parte,
/// e il raggio è un cerchio — non sa se il POI ce l'hai davanti o dietro.
///
/// Il gate aggiunge la sola informazione che mancava: la DIREZIONE in cui sei
/// rivolto. Se il POI è dietro, il racconto non si butta via — si RIMANDA: non
/// si marca come scattato e si riprova al fix successivo. Se torni indietro, o
/// se lo superi ma poi ti giri a guardarlo, parte allora, al momento giusto.
///
/// PRINCIPIO NON NEGOZIABILE: fail-open. Il gate può solo migliorare il
/// tempismo, mai sopprimere un racconto. Sensore assente, permesso negato, fix
/// impreciso, dato mancante: TUTTO finisce in `.ignoraGate`, cioè si parla come
/// si è sempre parlato. Meglio un racconto in ritardo che nessun racconto (per
/// questo c'è anche la scadenza del rinvio).
///
/// PORT ESATTO di `src/lib/geofencing/bearingGate.ts` (specifica in coda a quel
/// file) e della copia Kotlin: stesse costanti, stessi esiti, stessa isteresi.
/// Se una delle tre diverge, l'audioguida parte in tre momenti diversi a
/// seconda del dispositivo.
///
/// BATTERIA. La bussola (`startUpdatingHeading`) si accende SOLO quando serve
/// davvero — cioè da fermo, quando il `course` del GPS è rumore — e si spegne
/// quando la guida si ferma o quando per un paio di minuti è bastato il GPS.
/// Un magnetometro acceso a vuoto in background è consumo puro.
final class BearingGate: NSObject, CLLocationManagerDelegate {
    static let shared = BearingGate()

    /// `passa` → il POI è davanti: racconta.
    /// `rimanda` → è dietro: NON marcare nulla, si riprova al fix successivo.
    /// `ignoraGate` → il gate non ha titolo per decidere: racconta comunque.
    enum EsitoGate { case passa, rimanda, ignoraGate }

    /// Da dove viene la direzione: cambia quanto ci si fida di una lettura.
    enum FonteDirezione { case gps, bussola }

    // ── Costanti tarate (identiche su web, Android e iOS) ────────────────────

    /// Semi-apertura del cono "davanti a me", in gradi: ±60° = 120° di visuale.
    static let tolleranzaGradi: Double = 60
    /// Sotto questa velocità il `course` del GPS è rumore: si usa la bussola.
    static let sogliaFermoMs: Double = 1
    /// Fix peggiore di così non permette di fidarsi di nulla → fail-open.
    static let accuratezzaMassimaM: Double = 50
    /// Entro questo raggio sei ARRIVATO: dove guardi non conta più.
    static let raggioArrivoM: Double = 25
    /// Dopo tanto in sospeso si parla comunque: tardi è meglio di mai.
    static let scadenzaRinvioMs: Double = 90_000
    /// Letture "dietro" consecutive richieste quando la direzione è da bussola.
    static let lettureDietroRichieste = 2

    /// Preferenza utente in UserDefaults (default: ACCESO). Persistita dal
    /// plugin come `guideCharacter`, stessa chiave su Android.
    static let chiavePreferenza = "bearingGate"

    /// Oltre questo tempo l'ultima lettura della bussola è vecchia e non vale
    /// più: meglio nessuna direzione (fail-open) che una direzione di un minuto fa.
    private static let headingValidoMs: Double = 15_000
    /// Se per tanto tempo è bastato il GPS, la bussola si spegne da sola.
    private static let inattivitaBussolaMs: Double = 120_000

    private let prefs = UserDefaults.standard
    private let lock = NSLock()

    /// Manager DEDICATO alla sola bussola: quello della posizione ha il suo
    /// ciclo di vita (background updates, region monitoring) e non va toccato.
    private var bussolaManager: CLLocationManager?
    private var bussolaAccesa = false
    private var headingGradi: Double?
    private var headingAggiornatoMs: Double = 0
    private var ultimaRichiestaBussolaMs: Double = 0

    /// Stato per POI: isteresi + scadenza del rinvio. Vive in memoria e NON va
    /// persistito (punto 8 della specifica).
    private struct StatoPoi {
        var primoRinvio: Double
        var dietroConsecutivi: Int
    }
    private var stato: [String: StatoPoi] = [:]

    private override init() { super.init() }

    // MARK: - Preferenza utente

    /// Il gate è ACCESO per default: è il comportamento che l'utente si aspetta
    /// ("raccontami quello che vedo"). Si spegne solo con un `false` esplicito,
    /// così una preferenza mai scritta non lo disattiva per sbaglio.
    var abilitato: Bool {
        (prefs.object(forKey: Self.chiavePreferenza) as? Bool) ?? true
    }

    func setAbilitato(_ attivo: Bool) {
        prefs.set(attivo, forKey: Self.chiavePreferenza)
        // Gate spento = bussola inutile: si spegne subito, non al prossimo fix.
        if !attivo { spegni() }
    }

    // MARK: - Bussola (accesa solo quando serve)

    private func accendiBussola() {
        lock.lock()
        ultimaRichiestaBussolaMs = nowMs()
        let giaAccesa = bussolaAccesa
        lock.unlock()
        guard !giaAccesa, CLLocationManager.headingAvailable() else { return }
        lock.lock()
        bussolaAccesa = true
        lock.unlock()
        DispatchQueue.main.async {
            let manager = self.bussolaManager ?? CLLocationManager()
            manager.delegate = self
            manager.headingFilter = 5 // gradi: meno callback, stessa risposta
            self.bussolaManager = manager
            manager.startUpdatingHeading()
        }
    }

    /// Spegne il magnetometro (e dimentica la lettura: alla riaccensione si
    /// riparte da capo invece di decidere su un dato vecchio).
    func spegniBussola() {
        lock.lock()
        guard bussolaAccesa else { lock.unlock(); return }
        bussolaAccesa = false
        headingGradi = nil
        headingAggiornatoMs = 0
        lock.unlock()
        DispatchQueue.main.async { self.bussolaManager?.stopUpdatingHeading() }
    }

    /// Guida spenta / manager a riposo: bussola giù e stato dimenticato.
    func spegni() {
        spegniBussola()
        azzera()
    }

    private func spegniBussolaSeInattiva() {
        lock.lock()
        let accesa = bussolaAccesa
        let ferma = nowMs() - ultimaRichiestaBussolaMs > Self.inattivitaBussolaMs
        lock.unlock()
        if accesa && ferma { spegniBussola() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // `trueHeading` è negativo finché la posizione non è nota o la
        // calibrazione manca: in quel caso vale il magnetico.
        let gradi = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        guard gradi >= 0, gradi.isFinite else { return }
        lock.lock()
        headingGradi = Self.normalizza360(gradi)
        headingAggiornatoMs = nowMs()
        lock.unlock()
    }

    /// Heading della bussola, o nil (sensore assente, nessuna lettura ancora,
    /// lettura vecchia). Accende il sensore alla prima richiesta: finché non
    /// arriva la prima lettura si va fail-open, esattamente come sul web.
    private func headingBussola() -> Double? {
        accendiBussola()
        lock.lock(); defer { lock.unlock() }
        guard let h = headingGradi, nowMs() - headingAggiornatoMs <= Self.headingValidoMs else { return nil }
        return h
    }

    // MARK: - Direzione dell'utente

    /// Direzione in cui l'utente è rivolto, con la fonte da cui arriva.
    ///
    /// In MOVIMENTO (> 1 m/s) comanda il `course` del GPS: chi cammina guarda
    /// dove cammina, ed è un dato stabile, indipendente da come tieni il
    /// telefono in mano (che è ciò che rende inaffidabile la bussola in tasca).
    /// DA FERMO il course è rumore puro, quindi si passa alla bussola — che da
    /// fermo è l'unica a dire davvero dove hai il naso.
    ///
    /// nil = nessuna delle due è utilizzabile → il chiamante va fail-open.
    func direzioneConFonte(_ location: CLLocation?) -> (gradi: Double, fonte: FonteDirezione)? {
        guard let location = location else { return nil }
        let velocita = location.speed
        let course = location.course
        let courseValido = course.isFinite && course >= 0

        if velocita.isFinite && velocita > Self.sogliaFermoMs && courseValido {
            // Il GPS basta: se la bussola è accesa da un pezzo senza servire,
            // si spegne (è il caso di chi ha ripreso a camminare).
            spegniBussolaSeInattiva()
            return (Self.normalizza360(course), .gps)
        }

        if let bussola = headingBussola() { return (bussola, .bussola) }

        // Ultima spiaggia: course valido con velocità NON NOTA (su iOS
        // `speed` < 0 significa "non disponibile", non "fermo").
        if courseValido && velocita < 0 { return (Self.normalizza360(course), .gps) }
        return nil
    }

    /// Come `direzioneConFonte`, ma solo i gradi (o nil).
    func direzioneUtente(_ location: CLLocation?) -> Double? {
        direzioneConFonte(location)?.gradi
    }

    // MARK: - Geometria del cono

    /// Differenza angolare firmata, normalizzata a −180…+180.
    static func differenzaAngolare(_ a: Double, _ b: Double) -> Double {
        ((a - b + 540).truncatingRemainder(dividingBy: 360)) - 180
    }

    /// true se il POI sta nel cono davanti all'utente.
    /// ±60° di default: abbastanza largo da non tagliare fuori ciò che vedi con
    /// la coda dell'occhio o dall'altro lato della strada, abbastanza stretto da
    /// escludere ciò che hai davvero alle spalle.
    static func poiDavanti(_ direzione: Double, _ bearingVersoPoi: Double, tolleranza: Double = BearingGate.tolleranzaGradi) -> Bool {
        guard direzione.isFinite, bearingVersoPoi.isFinite else { return true } // fail-open
        return abs(differenzaAngolare(bearingVersoPoi, direzione)) <= tolleranza
    }

    // MARK: - Stato per POI

    /// Dimentica lo stato di un POI (dopo che ha parlato) o di tutti.
    func azzera(poiId: String? = nil) {
        lock.lock(); defer { lock.unlock() }
        if let poiId = poiId { stato.removeValue(forKey: poiId) } else { stato.removeAll() }
    }

    /// Stato corrente di un POI, per la diagnostica.
    func statoGate(poiId: String) -> (inSospesoDaMs: Double, dietroConsecutivi: Int)? {
        lock.lock(); defer { lock.unlock() }
        guard let s = stato[poiId] else { return nil }
        return (nowMs() - s.primoRinvio, s.dietroConsecutivi)
    }

    // MARK: - La decisione

    /// Decide se questo POI può essere raccontato ORA.
    ///
    /// I casi di `.ignoraGate` non sono ripieghi, sono scelte:
    ///  • preferenza spenta;
    ///  • nessuna direzione affidabile (niente sensori/permessi/velocità);
    ///  • fix impreciso: con ±80 m di errore il bearing è inventato;
    ///  • sei DENTRO il perimetro dell'edificio: dentro il duomo la direzione
    ///    non vuol dire niente, sei arrivato da qualunque parte tu guardi;
    ///  • sei nel raggio di arrivo stretto: idem, sei sul posto;
    ///  • il rinvio è scaduto (90 s): meglio tardi che mai.
    func valuta(
        poi: Poi,
        location: CLLocation,
        dentroPerimetro: Bool,
        distanzaM: Double,
        raggioArrivoM: Double = BearingGate.raggioArrivoM
    ) -> EsitoGate {
        guard abilitato else { return .ignoraGate }

        let id = poi.id
        let lat = location.coordinate.latitude
        let lon = location.coordinate.longitude
        let pLat = poi.coordinate.coordinate.latitude
        let pLon = poi.coordinate.coordinate.longitude
        guard lat.isFinite, lon.isFinite, pLat.isFinite, pLon.isFinite else {
            azzera(poiId: id); return .ignoraGate
        }

        // Fix impreciso (o accuratezza sconosciuta, che su iOS è un valore
        // negativo): il bearing calcolato su un punto sbagliato di 80 m dice il
        // contrario del vero. Non si decide su un dato così.
        let accuratezza = location.horizontalAccuracy
        if !(accuratezza > 0) || accuratezza > Self.accuratezzaMassimaM {
            azzera(poiId: id); return .ignoraGate
        }

        // Dentro l'edificio: la direzione dello sguardo è irrilevante.
        if dentroPerimetro { azzera(poiId: id); return .ignoraGate }

        // Arrivato: il POI è addosso, da qualunque lato lo si guardi.
        if distanzaM.isFinite && distanzaM <= raggioArrivoM {
            azzera(poiId: id); return .ignoraGate
        }

        // Direzione: senza, il gate non esiste.
        guard let dir = direzioneConFonte(location) else {
            azzera(poiId: id); return .ignoraGate
        }

        let bearing = BackgroundPoiManager.bearing(
            from: location.coordinate,
            to: poi.coordinate.coordinate
        )
        if Self.poiDavanti(dir.gradi, bearing) {
            azzera(poiId: id) // torna davanti → l'isteresi riparte da zero
            return .passa
        }

        // ── È dietro. Prima di rimandare, due cautele. ──

        let adesso = nowMs()
        lock.lock()
        var s = stato[id] ?? StatoPoi(primoRinvio: adesso, dietroConsecutivi: 0)
        s.dietroConsecutivi += 1
        stato[id] = s
        lock.unlock()

        // 1) Scadenza. Un POI rimandato non può restare in sospeso per sempre:
        //    se sei entrato nel raggio e ne stai uscendo camminando all'indietro
        //    rispetto al POI, senza scadenza non lo sentiresti MAI. Dopo 90 s si
        //    parla comunque — un racconto tardivo vale più del silenzio.
        if adesso - s.primoRinvio >= Self.scadenzaRinvioMs {
            azzera(poiId: id); return .ignoraGate
        }

        // 2) Isteresi, e SOLO per la bussola. Da fermo il magnetometro oscilla
        //    di decine di gradi fra una lettura e l'altra: una singola lettura
        //    "dietro" non basta a rimandare, ne servono due consecutive. Il
        //    `course` del GPS in movimento è stabile e vale subito — ed è
        //    proprio il caso che il gate esiste per risolvere (cammini, superi
        //    la chiesa: lì si rimanda alla prima lettura, senza esitare).
        if dir.fonte == .bussola && s.dietroConsecutivi < Self.lettureDietroRichieste {
            return .ignoraGate
        }

        return .rimanda
    }

    // MARK: - Utilità

    private static func normalizza360(_ g: Double) -> Double {
        let r = g.truncatingRemainder(dividingBy: 360)
        return r < 0 ? r + 360 : r
    }
}
