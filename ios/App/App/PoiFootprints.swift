import Foundation

/// PERIMETRI DEGLI EDIFICI — "sono DENTRO?" invece di "quanto dista?"
///
/// PERCHÉ. Il geofence è sempre stato un cerchio attorno al centroide. Per un
/// edificio compatto va bene; per un palazzo a L, un chiostro, una cinta
/// muraria o un parco il cerchio sbaglia in entrambi i versi: o è piccolo e
/// non scatta quando sei dentro l'ala lunga, o è grande e scatta dall'altra
/// parte della strada.
///
/// Dal 21/08/2026 il database ha i perimetri veri: 402.889 POI, dai poligoni
/// degli edifici di OpenStreetMap (area mediana 915 m², 15 vertici).
///
/// PORT ESATTO di `Footprints.kt` (Android) e `footprints.ts` (web): stesso
/// ray casting, stesso riquadro di scarto rapido, stessa gestione dei cortili.
/// Le tre implementazioni devono dare la STESSA risposta sullo stesso punto —
/// se una diverge, l'audioguida parte in tre momenti diversi a seconda del
/// dispositivo, ed è il tipo di disallineamento che nessuno nota finché un
/// utente non se ne lamenta.
enum PoiFootprints {

    /// Riquadro che contiene il poligono: quattro confronti prima del test vero.
    private struct Riquadro {
        let minLat: Double, maxLat: Double, minLon: Double, maxLon: Double
    }

    private struct Perimetro {
        /// Anelli come array piatti [lon0, lat0, lon1, lat1, ...]: niente
        /// struct per punto, che su 15 vertici × 400 POI sarebbero migliaia di
        /// allocazioni a ogni fix GPS.
        let anelli: [[Double]]
        let riquadro: Riquadro
    }

    /// I perimetri già analizzati. Il parsing della stringa è la parte cara:
    /// rifarlo a ogni fix per ogni POI vicino brucerebbe batteria, che in
    /// background è la risorsa che conta.
    ///
    /// Il valore è `Perimetro?`: il `nil` NON è "non ancora calcolato", è
    /// l'informazione "questo POI non ha perimetro, non riprovare ad
    /// analizzarlo" — la stessa distinzione che su Android costa la
    /// sentinella NESSUN_PERIMETRO (ConcurrentHashMap non accetta null).
    /// Qui il dizionario Swift la porta da solo, ma va letta con
    /// `if let voce = cache[poiId]` (doppio Optional), mai con `!= nil`.
    private static var cache: [String: Perimetro?] = [:]
    /// Ordine di inserimento, per lo sfratto FIFO.
    ///
    /// (23/08/2026) Prima, oltre la soglia, si faceva `removeAll()`: appena
    /// superato il tetto si ri-analizzavano TUTTI i poligoni a OGNI fix GPS —
    /// esattamente il lavoro che la cache doveva evitare, e proprio in centro
    /// città dove i POI sono tanti. Ora si toglie una voce alla volta, la più
    /// vecchia. Stessa correzione già applicata a Footprints.kt.
    private static var ordineInserimento: [String] = []
    /// Tetto alzato da 400 a 2.000 (parità con Footprints.kt): un poligono
    /// compatto (15 vertici) sono ~240 byte — 2.000 stanno in mezzo mega,
    /// meno di una singola tile di mappa.
    private static let maxCache = 2000
    private static let lock = NSLock()

    /// Da "lon,lat lon,lat;lon,lat ..." agli anelli.
    private static func analizza(_ testo: String) -> Perimetro? {
        var anelli: [[Double]] = []
        var minLat = 90.0, maxLat = -90.0, minLon = 180.0, maxLon = -180.0
        for pezzo in testo.split(separator: ";") {
            let coppie = pezzo.split(separator: " ")
            if coppie.count < 4 { continue }
            var punti: [Double] = []
            punti.reserveCapacity(coppie.count * 2)
            for c in coppie {
                let v = c.split(separator: ",")
                guard v.count == 2,
                      let lon = Double(v[0]),
                      let lat = Double(v[1]) else { return nil }
                punti.append(lon); punti.append(lat)
                if lat < minLat { minLat = lat }
                if lat > maxLat { maxLat = lat }
                if lon < minLon { minLon = lon }
                if lon > maxLon { maxLon = lon }
            }
            anelli.append(punti)
        }
        guard !anelli.isEmpty else { return nil }
        return Perimetro(
            anelli: anelli,
            riquadro: Riquadro(minLat: minLat, maxLat: maxLat, minLon: minLon, maxLon: maxLon)
        )
    }

    private static func perimetro(_ poiId: String, _ testo: String?) -> Perimetro? {
        lock.lock(); defer { lock.unlock() }
        // Doppio Optional: la voce ESISTE anche quando vale nil ("nessun
        // perimetro"), e in quel caso si esce senza ri-analizzare nulla.
        if let voce = cache[poiId] { return voce }
        let p: Perimetro? = (testo?.isEmpty == false) ? analizza(testo!) : nil
        cache[poiId] = p
        ordineInserimento.append(poiId)
        // Sfratto FIFO una voce alla volta: le altre restano analizzate.
        // La guardia su ordineInserimento evita il ciclo infinito se la coda
        // si svuota prima della cache (chiavi già tolte da svuota()).
        while cache.count > maxCache, !ordineInserimento.isEmpty {
            let vecchio = ordineInserimento.removeFirst()
            cache.removeValue(forKey: vecchio)
        }
        return p
    }

    /// Ray casting: si tira una semiretta orizzontale dal punto e si contano
    /// gli attraversamenti dei lati. Dispari = dentro.
    ///
    /// I cortili interni non hanno bisogno di codice apposta: chi sta nel
    /// chiostro attraversa due volte (anello esterno + anello interno) e
    /// risulta fuori — che è la risposta giusta, nel cortile di un palazzo non
    /// sei dentro il palazzo.
    private static func dentro(_ anelli: [[Double]], _ lat: Double, _ lon: Double) -> Bool {
        var attraversamenti = 0
        for p in anelli {
            let n = p.count / 2
            var j = n - 1
            for i in 0..<n {
                let xi = p[i * 2], yi = p[i * 2 + 1]
                let xj = p[j * 2], yj = p[j * 2 + 1]
                // Il lato deve stare a cavallo della latitudine del punto.
                if (yi > lat) != (yj > lat) {
                    let taglio = xi + ((lat - yi) / (yj - yi)) * (xj - xi)
                    if lon < taglio { attraversamenti += 1 }
                }
                j = i
            }
        }
        return attraversamenti % 2 == 1
    }

    /// true se il punto sta dentro il perimetro del POI.
    /// false quando il perimetro manca o è illeggibile: chi chiama continua a
    /// ragionare a raggi, esattamente come prima.
    static func dentroPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double) -> Bool {
        guard let p = perimetro(poiId, footprint) else { return false }
        let r = p.riquadro
        if lat < r.minLat || lat > r.maxLat || lon < r.minLon || lon > r.maxLon { return false }
        return dentro(p.anelli, lat, lon)
    }

    /// A quanti metri DAL BORDO del perimetro parte la guida (decisione del
    /// 22/08/2026: "a 30 metri dal perimetro, non quando si è dentro").
    /// Stesso valore in foregroundTriggers.ts e Footprints.kt.
    static let triggerM: Double = 30
    /// In auto 30 m sono un secondo a 50 km/h: la frase partirebbe a POI superato.
    static let triggerCarM: Double = 100
    static func triggerM(isDriving: Bool) -> Double { isDriving ? triggerCarM : triggerM }

    /// DISTANZA DAL BORDO del perimetro, in metri: 0 dentro, .infinity senza
    /// perimetro. È la misura che governa la guida quando il POI ha il
    /// poligono: chi cammina lungo la facciata è al POI, da qualunque lato,
    /// anche se l'ingresso sta dall'altra parte. Minimo punto-segmento su
    /// tutti i lati, in un frame equirettangolare locale; il riquadro
    /// allargato di `entro` metri scarta prima i lontani.
    /// Port esatto di footprints.ts::distanzaDalPerimetro.
    static func distanzaDalPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double, entro: Double = 100) -> Double {
        guard let p = perimetro(poiId, footprint) else { return .infinity }
        let r = p.riquadro
        let mLat = 111_320.0
        let mLon = 111_320.0 * cos(lat * .pi / 180)
        let dLat = entro / mLat
        let dLon = entro / (mLon == 0 ? 1 : mLon)
        if lat < r.minLat - dLat || lat > r.maxLat + dLat || lon < r.minLon - dLon || lon > r.maxLon + dLon {
            return .infinity
        }
        if dentro(p.anelli, lat, lon) { return 0 }
        var best = Double.infinity
        for a in p.anelli {
            let n = a.count / 2
            var j = n - 1
            for i in 0..<n {
                let ax = (a[j * 2] - lon) * mLon, ay = (a[j * 2 + 1] - lat) * mLat
                let bx = (a[i * 2] - lon) * mLon, by = (a[i * 2 + 1] - lat) * mLat
                let dx = bx - ax, dy = by - ay
                let len2 = dx * dx + dy * dy
                let t = len2 == 0 ? 0 : min(1, max(0, -(ax * dx + ay * dy) / len2))
                let px = ax + t * dx, py = ay + t * dy
                let d = (px * px + py * py).squareRoot()
                if d < best { best = d }
                j = i
            }
        }
        return best
    }

    /// true se il punto è entro la soglia di modalità dal bordo (o dentro).
    static func alPerimetro(poiId: String, footprint: String?, lat: Double, lon: Double, isDriving: Bool = false) -> Bool {
        distanzaDalPerimetro(poiId: poiId, footprint: footprint, lat: lat, lon: lon, entro: triggerCarM) <= triggerM(isDriving: isDriving)
    }

    /// Svuota la cache: serve quando il radar cambia zona.
    static func svuota() {
        lock.lock(); defer { lock.unlock() }
        cache.removeAll()
        ordineInserimento.removeAll()
    }
}
