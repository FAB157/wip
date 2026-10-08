import Foundation
import CoreLocation

/// SNAP-TO-PATH nativo iOS — port fedele di src/lib/roadSnap.ts e RoadSnap.kt.
///
/// Scarica la geometria strade/marciapiedi di un'area da /api/roads/tile, la
/// indicizza a griglia in RAM e "snappa" la posizione GPS sul segmento
/// percorribile piu' vicino in modo CONSERVATIVO: solo se una strada e' entro
/// la soglia, altrimenti ritorna nil e il chiamante usa il GPS grezzo. Al
/// momento dello snap non serve rete (indice gia' in memoria).
///
/// NB: NON testato sul campo. Conservativo per costruzione (worst case = GPS
/// grezzo). Già nel target Xcode "App" (Sources build phase in
/// project.pbxproj, come TriggerTelemetry.swift) — questo commento diceva
/// il contrario ma era rimasto stantio da quando il file non c'era ancora.
final class RoadSnap {
    static let shared = RoadSnap()
    private init() { loadCached() }

    // Persistenza: il tile dell'area visitata online resta disponibile offline
    // dopo un riavvio. Un tile di un'altra area è innocuo (celle non combaciano).
    private var cacheURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("road_tile.json")
    }

    private let cell = 0.003 // ~300 m
    private let roadsUrl = "\(WipApi.base)/api/roads/tile"

    private struct Seg { let aLat: Double; let aLon: Double; let bLat: Double; let bLon: Double }

    /// Cella della griglia. Era una `String` interpolata ("12345,678"): a ogni
    /// segmento indicizzato e a ogni lookup si costruiva e si hashava una
    /// stringa, cioè un'allocazione — nove per ogni snap, decine di migliaia
    /// alla costruzione dell'indice. Due Int in una struct Hashable fanno lo
    /// stesso lavoro senza toccare l'heap.
    private struct Cell: Hashable { let x: Int; let y: Int }

    private var carGrid: [Cell: [Seg]] = [:]
    private var footGrid: [Cell: [Seg]] = [:]
    private var haveTile = false
    private var lastLat = 0.0
    private var lastLon = 0.0
    // Guardia di concorrenza: una sola richiesta in volo (protetta da lock).
    private var fetching = false
    private let lock = NSLock()

    // Esito dell'ULTIMO tentativo, riuscito o fallito (prima si registrava solo
    // il successo: con la rete giu' si riprovava a ogni fix GPS).
    private var lastAttemptAt: TimeInterval = 0   // ProcessInfo.systemUptime, monotono
    private var failStreak = 0                    // fallimenti consecutivi
    // Modo di trasporto dell'ultimo snap(): il chiamante non lo passa a
    // shouldRefresh(), quindi lo memorizziamo qui. Default "auto" = soglia piu'
    // stretta, il caso conservativo.
    private var lastDriving = true

    // Attesa crescente dopo un fallimento (5 s, 15 s, 60 s, 5 min, tetto 15 min).
    private let backoff: [TimeInterval] = [5, 15, 60, 300, 900]
    // Intervallo minimo fra due download riusciti: guardia contro fix GPS che
    // saltano avanti e indietro (a 25 m/s la soglia auto si copre in ~18 s).
    private let minInterval: TimeInterval = 20

    // Soglie di rinfresco per modo di trasporto. Il tile ha raggio 700 m
    // centrato sul punto in cui e' stato scaricato: dopo uno spostamento di d
    // il bordo davanti a noi e' a 700 - d metri, ed e' quel margine che deve
    // bastare a completare il download successivo.
    //  - A piedi (1,4 m/s): soglia 550 m -> margine 150 m = ~107 s di cammino,
    //    e un download ogni 550/1,4 = ~393 s, cioe' ~9 all'ora (prima, con 400 m,
    //    erano ~13/ora). Il raggio 700 m copre comodamente i tempi pedonali.
    //  - In auto (14 m/s in citta'/extraurbano): soglia 450 m -> margine 250 m
    //    = ~18 s a 14 m/s e ~10 s a 25 m/s in autostrada, quindi il download
    //    parte prima di uscire dalla tile; un download ogni 450/14 = ~32 s,
    //    cioe' ~112 all'ora contro i ~126 dei 400 m fissi. Se il margine non
    //    basta lo snap semplicemente non si applica (fail-open, GPS grezzo).
    private let thresholdFootM = 550.0
    private let thresholdCarM = 450.0

    private func cellKey(_ lat: Double, _ lon: Double) -> Cell {
        return Cell(x: Int((lat / cell).rounded()), y: Int((lon / cell).rounded()))
    }

    private func metersBetween(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
        let r = 6371000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * asin(min(1.0, sqrt(a)))
    }

    private func projectToSeg(_ lat: Double, _ lon: Double, _ s: Seg) -> (lat: Double, lon: Double, distM: Double) {
        var cosLat = cos(lat * .pi / 180); if cosLat == 0 { cosLat = 1 }
        let px = lon * cosLat, py = lat
        let ax = s.aLon * cosLat, ay = s.aLat, bx = s.bLon * cosLat, by = s.bLat
        let dx = bx - ax, dy = by - ay
        let len2 = dx * dx + dy * dy
        var t = len2 == 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
        t = max(0, min(1, t))
        let snapLat = ay + t * dy
        let snapLon = (ax + t * dx) / cosLat
        return (snapLat, snapLon, metersBetween(lat, lon, snapLat, snapLon))
    }

    /// Snap conservativo: ritorna una CLLocation snappata o nil (usa GPS grezzo).
    func snap(_ loc: CLLocation, isDriving: Bool) -> CLLocation? {
        lock.lock()
        lastDriving = isDriving // memorizzato per la soglia di shouldRefresh()
        let grid = isDriving ? carGrid : footGrid
        lock.unlock()
        if grid.isEmpty { return nil }
        let lat = loc.coordinate.latitude, lon = loc.coordinate.longitude
        let acc = loc.horizontalAccuracy
        let maxSnap = min(40.0, max(20.0, acc <= 0 ? 20.0 : acc))
        let cLat = Int((lat / cell).rounded()), cLon = Int((lon / cell).rounded())
        var best: (lat: Double, lon: Double, distM: Double)?
        for dLa in -1...1 {
            for dLo in -1...1 {
                guard let arr = grid[Cell(x: cLat + dLa, y: cLon + dLo)] else { continue }
                for s in arr {
                    let p = projectToSeg(lat, lon, s)
                    if best == nil || p.distM < best!.distM { best = p }
                }
            }
        }
        guard let b = best, b.distM <= maxSnap else { return nil }
        if metersBetween(lat, lon, b.lat, b.lon) < 3.0 { return nil }
        return CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: b.lat, longitude: b.lon),
            altitude: loc.altitude, horizontalAccuracy: loc.horizontalAccuracy,
            verticalAccuracy: loc.verticalAccuracy, course: loc.course,
            speed: loc.speed, timestamp: loc.timestamp
        )
    }

    /// Serve un nuovo tile? thresholdM <= 0 (il default, quello che usa il
    /// manager) sceglie la soglia dal modo di trasporto dell'ultimo snap().
    /// Durante l'attesa dopo un fallimento ritorna false senza scrivere log: lo
    /// snap semplicemente non si applica e si usa il fix grezzo (fail-open).
    func shouldRefresh(_ loc: CLLocation, thresholdM: Double = 0) -> Bool {
        lock.lock()
        let inFlight = fetching
        let have = haveTile, lLat = lastLat, lLon = lastLon
        let attemptAt = lastAttemptAt, streak = failStreak, driving = lastDriving
        lock.unlock()
        if inFlight { return false } // richiesta gia' in volo
        if attemptAt > 0 {
            let wait = streak > 0 ? backoff[min(streak - 1, backoff.count - 1)] : minInterval
            if ProcessInfo.processInfo.systemUptime - attemptAt < wait { return false }
        }
        if !have { return true }
        let th = thresholdM > 0 ? thresholdM : (driving ? thresholdCarM : thresholdFootM)
        return metersBetween(loc.coordinate.latitude, loc.coordinate.longitude, lLat, lLon) > th
    }

    /// Registra SEMPRE l'esito del tentativo (riuscito o fallito) e libera la
    /// guardia di concorrenza. Il contatore dei fallimenti pilota l'attesa
    /// crescente e si azzera al primo successo.
    private func finishAttempt(ok: Bool) {
        lock.lock()
        lastAttemptAt = ProcessInfo.processInfo.systemUptime
        let first = failStreak == 0
        failStreak = ok ? 0 : min(failStreak + 1, backoff.count)
        fetching = false
        lock.unlock()
        // Un solo log per serie di fallimenti: niente log a raffica.
        if !ok && first { NSLog("[RoadSnap] refresh tile strade fallito") }
    }

    /// Scarica e reindicizza il tile (async, best-effort).
    func refresh(_ loc: CLLocation, radius: Int = 700) {
        lock.lock(); if fetching { lock.unlock(); return }; fetching = true; lock.unlock()
        let lat = loc.coordinate.latitude, lon = loc.coordinate.longitude
        guard let url = URL(string: "\(roadsUrl)?lat=\(lat)&lon=\(lon)&radius=\(radius)") else {
            finishAttempt(ok: false); return
        }
        URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let self = self else { return }
            let httpOk = (response as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } ?? true
            if httpOk, let data = data, self.applica(data, lat: lat, lon: lon) {
                if let u = self.cacheURL { try? data.write(to: u) } // persisti per l'offline
                if let f = self.fileTile(lat, lon) { try? data.write(to: f) }
                self.finishAttempt(ok: true)
                return
            }
            // SENZA RETE: il tile della zona scaricato in anticipo (o in un
            // passaggio precedente). Vale come riuscito: niente attesa crescente.
            if let f = self.fileTile(lat, lon), let disco = try? Data(contentsOf: f),
               self.applica(disco, lat: lat, lon: lon) {
                self.finishAttempt(ok: true)
                return
            }
            self.finishAttempt(ok: false)
        }.resume()
    }

    // ── STRADE SCARICATE IN ANTICIPO (03/10/2026, committente: «le tiles devono
    // essere scaricate quando si crea un percorso, con o senza audioguida, e
    // nelle funzioni offline») ───────────────────────────────────────────
    // Fino a oggi esisteva UN solo tile su disco, l'ultimo: senza rete, dopo
    // 500 m le distanze di strada e l'aggancio alla via non avevano più dati.
    // Ora ogni tile va in una cartella, un file per chiave (griglia a 0,01°,
    // come la cache del server), e `prescarica` la riempie lungo un percorso.
    // Parità con RoadSnap.kt.
    private let tileMax = 400
    private let tileFresco: TimeInterval = 30 * 24 * 3600
    private let prescaricoMax = 150
    private let codaPrescarico = DispatchQueue(label: "wip.roadsnap.prescarico", qos: .utility)

    private func chiave(_ lat: Double, _ lon: Double) -> String {
        String(format: "%.2f_%.2f", locale: Locale(identifier: "en_US_POSIX"), lat, lon)
    }

    private func fileTile(_ lat: Double, _ lon: Double) -> URL? {
        guard let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("road_tiles", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir.appendingPathComponent(chiave(lat, lon) + ".json")
    }

    /// Applica un tile come indice corrente. false se vuoto o illeggibile: un
    /// tile vuoto non deve buttare via l'indice buono che abbiamo già in RAM.
    private func applica(_ data: Data, lat: Double, lon: Double) -> Bool {
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return false }
        let car = buildGrid(json["car"] as? [[[Double]]])
        let foot = buildGrid(json["foot"] as? [[[Double]]])
        if car.isEmpty && foot.isEmpty { return false }
        lock.lock()
        carGrid = car; footGrid = foot
        tieniPolilinee(json)
        lastLat = lat; lastLon = lon; haveTile = true
        lock.unlock()
        return true
    }

    private func pota() {
        guard let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let dir = base.appendingPathComponent("road_tiles", isDirectory: true)
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        if files.count <= tileMax { return }
        let ordinati = files.sorted { a, b in
            let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return da < db
        }
        for f in ordinati.prefix(files.count - tileMax) { try? FileManager.default.removeItem(at: f) }
    }

    /// Scarica in anticipo le strade lungo un percorso, in background, una
    /// chiave alla volta. `punti` = (lat, lon) lungo il tracciato (anche fitti:
    /// si riducono alle chiavi distinte). Salta le chiavi già su disco e fresche.
    func prescarica(punti: [(Double, Double)], radius: Int = 700) {
        var viste = Set<String>()
        var centri: [(Double, Double)] = []
        for (la, lo) in punti {
            guard la.isFinite, lo.isFinite else { continue }
            // il centro della chiave, non il punto: la risposta vale per tutta la chiave
            let cLa = (la * 100).rounded() / 100, cLo = (lo * 100).rounded() / 100
            if viste.insert(chiave(cLa, cLo)).inserted { centri.append((cLa, cLo)) }
            if centri.count >= prescaricoMax { break }
        }
        if centri.isEmpty { return }
        codaPrescarico.async { [weak self] in
            guard let self = self else { return }
            for (la, lo) in centri {
                guard let f = self.fileTile(la, lo) else { break }
                if let att = try? FileManager.default.attributesOfItem(atPath: f.path),
                   let quando = att[.modificationDate] as? Date,
                   let peso = att[.size] as? NSNumber, peso.intValue > 50,
                   Date().timeIntervalSince(quando) < self.tileFresco {
                    continue
                }
                guard let url = URL(string: "\(self.roadsUrl)?lat=\(la)&lon=\(lo)&radius=\(radius)") else { continue }
                let semaforo = DispatchSemaphore(value: 0)
                var reteGiu = false
                URLSession.shared.dataTask(with: url) { data, response, errore in
                    defer { semaforo.signal() }
                    if errore != nil { reteGiu = true; return }
                    let httpOk = (response as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } ?? false
                    if httpOk, let data = data, data.count > 50 { try? data.write(to: f) }
                }.resume()
                _ = semaforo.wait(timeout: .now() + 25)
                if reteGiu { break } // rete assente: inutile insistere sulle altre
                Thread.sleep(forTimeInterval: 0.25)
            }
            self.pota()
        }
    }

    /// Carica il tile persistito (offline). Chiamato all'init.
    private func loadCached() {
        guard let u = cacheURL, let data = try? Data(contentsOf: u),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let car = buildGrid(json["car"] as? [[[Double]]])
        let foot = buildGrid(json["foot"] as? [[[Double]]])
        lock.lock(); carGrid = car; footGrid = foot; tieniPolilinee(json); haveTile = true; lock.unlock()
    }

    private func buildGrid(_ polys: [[[Double]]]?) -> [Cell: [Seg]] {
        var g: [Cell: [Seg]] = [:]
        guard let polys = polys else { return g }
        for poly in polys {
            var j = 0
            while j + 1 < poly.count {
                let p0 = poly[j], p1 = poly[j + 1]
                if p0.count >= 2 && p1.count >= 2 {
                    let seg = Seg(aLat: p0[0], aLon: p0[1], bLat: p1[0], bLon: p1[1])
                    // Il segmento va indicizzato SOTTO LE CELLE CHE TOCCA, e
                    // quasi sempre è una sola: la cella è ~300 m, i segmenti
                    // stradali di OSM sono decine di metri. Prima si faceva
                    // comunque un doppio inserimento (entrambi gli estremi),
                    // quindi la stessa lista conteneva due volte lo stesso
                    // segmento e lo snap lo proiettava due volte. La seconda
                    // cella si aggiunge solo se è davvero diversa: la
                    // copertura resta identica, il lavoro si dimezza.
                    let cellaA = cellKey(seg.aLat, seg.aLon)
                    g[cellaA, default: []].append(seg)
                    let cellaB = cellKey(seg.bLat, seg.bLon)
                    if cellaB != cellaA { g[cellaB, default: []].append(seg) }
                }
                j += 1
            }
        }
        return g
    }

    // ── DISTANZA DI STRADA (03/10/2026) ──────────────────────────────────
    // Le stesse polilinee, tenute anche come elenco per costruirci il grafo
    // (RoadGraph, qui sotto). Il grafo si costruisce alla prima richiesta dopo
    // ogni tile nuova, una rete alla volta: a piedi la pedonale, in auto
    // quella delle auto. Parità con RoadSnap.kt::grafo.
    private var carPoli: [[[Double]]] = []
    private var footPoli: [[[Double]]] = []
    private var carGrafo: RoadGraph?
    private var footGrafo: RoadGraph?
    private var carGrafoFatto = false
    private var footGrafoFatto = false

    /// Da chiamare con il lock preso.
    private func tieniPolilinee(_ json: [String: Any]) {
        carPoli = (json["car"] as? [[[Double]]]) ?? []
        footPoli = (json["foot"] as? [[[Double]]]) ?? []
        carGrafo = nil; footGrafo = nil
        carGrafoFatto = false; footGrafoFatto = false
    }

    /// Il grafo della rete (auto o pedonale) del tile corrente, o nil se non
    /// c'è tile. Costruirlo costa qualche decina di ms, una volta per tile.
    func grafo(isDriving: Bool) -> RoadGraph? {
        lock.lock()
        defer { lock.unlock() }
        if isDriving {
            if !carGrafoFatto { carGrafo = RoadGraph(polilinee: carPoli); carGrafoFatto = true }
            return carGrafo
        }
        // A PIEDI la rete è pedonale + auto: nelle tile pre-estratte la «foot»
        // contiene solo i tratti pedonali e da sola è a pezzi (misurato a
        // Montecatini: 15 coppie su 25 irraggiungibili).
        if !footGrafoFatto { footGrafo = RoadGraph(polilinee: footPoli + carPoli); footGrafoFatto = true }
        return footGrafo
    }
}

/// DISTANZA DI STRADA (03/10/2026, committente: «deve essere tutto in strada
/// reale, mai linea d'aria»; modello: Google Maps / Mappe).
///
/// PORT ESATTO di src/lib/geofencing/distanzaStrada.ts (lì il commento per
/// esteso e il collaudo: scratch/collaudo-distanza-strada.mts) e gemello di
/// RoadGraph.kt: stesse costanti, stessi passi. Sta in questo file e non in uno
/// nuovo perché il project.pbxproj è scritto a mano.
///
/// Le polilinee che RoadSnap scarica per agganciare il GPS alla via diventano
/// un grafo; la distanza da un luogo è:
///   (GPS → via più vicina) + (cammino minimo sulla rete) + (via → punto d'arrivo)
/// Gli incroci spariti con la semplificazione del server si ricostruiscono
/// (segmenti che si attraversano, capi che finiscono su un altro segmento).
final class RoadGraph {
    /// «LINEA D'ARIA MAI»: utente e luogo si agganciano alla via più vicina
    /// fino a 120 m, e quei metri si sommano. nil resta solo quando attorno
    /// non c'è NESSUNA strada nota (tile non scaricata).
    static let utenteMaxM = 120.0
    static let luogoMaxM = 120.0
    /// Un capo di polilinea entro questi metri da un altro segmento è un incrocio.
    static let innestoM = 4.0
    /// Entro questi metri dal punto si è arrivati comunque (buco nei dati, piazza).
    static let sicurezzaM = 15.0
    /// Una componente della rete con meno metri di così è un'isola: non ci si aggancia.
    static let isolaM = 150.0
    private static let cellaM = 60.0
    private static let mLat = 111_320.0

    /// Raggio di ricerca sul grafo: deve coprire il raggio d'avviso.
    static func ricercaM(isDriving: Bool) -> Double { isDriving ? 700 : 450 }

    /// LA REGOLA D'USO, una sola per tutti i chiamanti (= distanzaCheDecide):
    /// strada nota → metri di strada; nessuna strada nota attorno → distanza
    /// diretta; entro `sicurezzaM` dal punto si è arrivati comunque.
    static func cheDecide(aria: Double, strada: Double?) -> Double {
        guard let s = strada else { return aria }
        if aria <= sicurezzaM { return min(aria, s) }
        return max(aria, s)
    }

    private struct Segmento {
        let ax: Double, ay: Double, bx: Double, by: Double, len: Double
        /// Punti lungo il segmento ordinati per t: capi e tagli degli incroci.
        var catT: [Double]
        var catN: [Int]
        /// Fa parte di un'isola (componente staccata, meno di `isolaM` metri): non ci si aggancia.
        var isola = false
    }
    private struct Cella: Hashable { let x: Int; let y: Int }
    fileprivate struct Aggancio { let seg: Int; let t: Double; let d: Double }

    private let lat0: Double
    private let lon0: Double
    private let mLon: Double
    private let seg: [Segmento]
    private let griglia: [Cella: [Int]]
    private let archi: [[(Int, Double)]]

    private static func cella(_ v: Double) -> Int { Int((v / cellaM).rounded(.down)) }
    private static func tSu(_ s: Segmento, _ px: Double, _ py: Double) -> Double {
        let dx = s.bx - s.ax, dy = s.by - s.ay
        let l2 = dx * dx + dy * dy
        return l2 == 0 ? 0 : max(0, min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2))
    }

    /// Grafo dalle polilinee `[[lat, lon], ...]` di una rete. nil se vuota.
    init?(polilinee: [[[Double]]]) {
        var origine: [Double]?
        for p in polilinee {
            if let primo = p.first, primo.count >= 2, primo[0].isFinite, primo[1].isFinite { origine = primo; break }
        }
        guard let o = origine else { return nil }
        let lat0 = o[0], lon0 = o[1]
        var mLon = RoadGraph.mLat * cos(lat0 * .pi / 180)
        if mLon == 0 { mLon = 1 }

        // Nodi (vertici, uniti al metro) e segmenti
        var idNodo: [Cella: Int] = [:]
        var nx: [Double] = [], ny: [Double] = []
        func nodo(_ x: Double, _ y: Double) -> Int {
            let k = Cella(x: Int(x.rounded()), y: Int(y.rounded()))
            if let id = idNodo[k] { return id }
            let id = nx.count
            idNodo[k] = id; nx.append(x); ny.append(y)
            return id
        }
        // Coordinate lontanissime (dato corrotto) farebbero traboccare Int(): si scartano.
        func valida(_ v: Double) -> Bool { v.isFinite && abs(v) < 1_000_000 }

        var seg: [Segmento] = []
        var capi: [(nodo: Int, seg: Int)] = [] // capi di polilinea, per gli innesti a T
        for poli in polilinee {
            var primo = -1, ultimo = -1
            var i = 0
            while i + 1 < poli.count {
                let a0 = poli[i], b0 = poli[i + 1]
                i += 1
                if a0.count < 2 || b0.count < 2 { continue }
                let ax = (a0[1] - lon0) * mLon, ay = (a0[0] - lat0) * RoadGraph.mLat
                let bx = (b0[1] - lon0) * mLon, by = (b0[0] - lat0) * RoadGraph.mLat
                if !(valida(ax) && valida(ay) && valida(bx) && valida(by)) { continue }
                let a = nodo(ax, ay), b = nodo(bx, by)
                if a == b { continue }
                let len = hypot(nx[b] - nx[a], ny[b] - ny[a])
                seg.append(Segmento(ax: nx[a], ay: ny[a], bx: nx[b], by: ny[b], len: len, catT: [0, 1], catN: [a, b]))
                if primo < 0 { primo = seg.count - 1 }
                ultimo = seg.count - 1
            }
            if primo >= 0 {
                capi.append((nodo: seg[primo].catN[0], seg: primo))
                capi.append((nodo: seg[ultimo].catN[1], seg: ultimo))
            }
        }
        if seg.isEmpty { return nil }

        // Griglia spaziale dei segmenti
        var g: [Cella: [Int]] = [:]
        for i in seg.indices {
            let s = seg[i]
            let x0 = RoadGraph.cella(min(s.ax, s.bx)), x1 = RoadGraph.cella(max(s.ax, s.bx))
            let y0 = RoadGraph.cella(min(s.ay, s.by)), y1 = RoadGraph.cella(max(s.ay, s.by))
            for cx in x0...x1 {
                for cy in y0...y1 { g[Cella(x: cx, y: cy), default: []].append(i) }
            }
        }

        // 1. Incroci ricostruiti: attraversamenti fra segmenti
        for lista in g.values where lista.count >= 2 {
            for i in 0..<(lista.count - 1) {
                for j in (i + 1)..<lista.count {
                    let ip = lista[i], iq = lista[j]
                    let p = seg[ip], q = seg[iq]
                    let rX = p.bx - p.ax, rY = p.by - p.ay
                    let sX = q.bx - q.ax, sY = q.by - q.ay
                    let den = rX * sY - rY * sX
                    if abs(den) < 1e-9 { continue } // paralleli
                    let t = ((q.ax - p.ax) * sY - (q.ay - p.ay) * sX) / den
                    let u = ((q.ax - p.ax) * rY - (q.ay - p.ay) * rX) / den
                    if t <= 0 || t >= 1 || u <= 0 || u >= 1 { continue } // si toccano ai capi
                    let n = nodo(p.ax + t * rX, p.ay + t * rY)
                    if !seg[ip].catN.contains(n) { seg[ip].catT.append(t); seg[ip].catN.append(n) }
                    if !seg[iq].catN.contains(n) { seg[iq].catT.append(u); seg[iq].catN.append(n) }
                }
            }
        }
        // 1-bis. Innesti a T: un capo di polilinea che finisce su un altro segmento
        var innesti: [(Int, Int, Double)] = [] // (capo, punto sul segmento, metri)
        for capo in capi {
            let px = nx[capo.nodo], py = ny[capo.nodo]
            let cx = RoadGraph.cella(px), cy = RoadGraph.cella(py)
            for dx in -1...1 {
                for dy in -1...1 {
                    guard let lista = g[Cella(x: cx + dx, y: cy + dy)] else { continue }
                    for i in lista where i != capo.seg {
                        if seg[i].catN.contains(capo.nodo) { continue }
                        let s = seg[i]
                        let t = RoadGraph.tSu(s, px, py)
                        let d = hypot(px - (s.ax + t * (s.bx - s.ax)), py - (s.ay + t * (s.by - s.ay)))
                        if d > RoadGraph.innestoM { continue }
                        // Il capo non sta ESATTAMENTE sul segmento: il taglio va
                        // nel punto proiettato e i metri che mancano diventano un
                        // arco a parte, o ogni innesto regalerebbe fino a 4 m.
                        let m = nodo(s.ax + t * (s.bx - s.ax), s.ay + t * (s.by - s.ay))
                        if !seg[i].catN.contains(m) { seg[i].catT.append(t); seg[i].catN.append(m) }
                        if m != capo.nodo { innesti.append((capo.nodo, m, d)) }
                    }
                }
            }
        }

        // 2. Archi: lungo ogni segmento, da un punto della catena al successivo
        var archi = [[(Int, Double)]](repeating: [], count: nx.count)
        for i in seg.indices {
            let ts0 = seg[i].catT, ns0 = seg[i].catN
            let ordine = ts0.indices.sorted { ts0[$0] < ts0[$1] }
            let ts = ordine.map { ts0[$0] }, ns = ordine.map { ns0[$0] }
            seg[i].catT = ts; seg[i].catN = ns
            if ns.count < 2 { continue }
            for k in 0..<(ns.count - 1) {
                let a = ns[k], b = ns[k + 1]
                if a == b { continue }
                let w = max(0, (ts[k + 1] - ts[k]) * seg[i].len)
                archi[a].append((b, w)); archi[b].append((a, w))
            }
        }

        for (a, b, w) in innesti { archi[a].append((b, w)); archi[b].append((a, w)) }

        // 3. ISOLE: pezzetti di rete staccati da tutto (un vialetto in un
        // cortile, un corridoio interno, una banchina). Se il punto d'arrivo o
        // il GPS si agganciano lì, il luogo risulta irraggiungibile pur avendo
        // la strada a dieci metri (Pantheon, 03/10/2026). Le componenti con
        // meno di `isolaM` metri di rete non si usano per l'aggancio.
        var comp = [Int](repeating: -1, count: nx.count)
        var metriComp: [Double] = []
        for n0 in 0..<nx.count where comp[n0] < 0 {
            let c = metriComp.count
            var tot = 0.0
            var pila = [n0]
            comp[n0] = c
            while let n = pila.popLast() {
                for (m, w) in archi[n] {
                    tot += w
                    if comp[m] < 0 { comp[m] = c; pila.append(m) }
                }
            }
            metriComp.append(tot / 2)
        }
        for i in seg.indices { seg[i].isola = metriComp[comp[seg[i].catN[0]]] < RoadGraph.isolaM }

        self.lat0 = lat0; self.lon0 = lon0; self.mLon = mLon
        self.seg = seg; self.griglia = g; self.archi = archi
    }

    private func x(_ lon: Double) -> Double { (lon - lon0) * mLon }
    private func y(_ lat: Double) -> Double { (lat - lat0) * RoadGraph.mLat }

    /// Segmento più vicino a un punto entro `maxM`, con la posizione lungo di esso.
    fileprivate func aggancia(_ px: Double, _ py: Double, _ maxM: Double) -> Aggancio? {
        guard px.isFinite, py.isFinite, abs(px) < 1_000_000, abs(py) < 1_000_000 else { return nil }
        let cx = RoadGraph.cella(px), cy = RoadGraph.cella(py)
        let r = Int((maxM / RoadGraph.cellaM).rounded(.up))
        var best: Aggancio?
        for dx in -r...r {
            for dy in -r...r {
                guard let lista = griglia[Cella(x: cx + dx, y: cy + dy)] else { continue }
                for i in lista {
                    let s = seg[i]
                    if s.isola { continue }
                    let t = RoadGraph.tSu(s, px, py)
                    let d = hypot(px - (s.ax + t * (s.bx - s.ax)), py - (s.ay + t * (s.by - s.ay)))
                    if d <= maxM, best == nil || d < best!.d { best = Aggancio(seg: i, t: t, d: d) }
                }
            }
        }
        return best
    }

    /// I due punti della catena che racchiudono t, con i metri da t a ciascuno.
    fileprivate func vicini(_ iSeg: Int, _ t: Double) -> [(Int, Double)] {
        let s = seg[iSeg]
        var i = 0
        while i + 1 < s.catT.count - 1 && s.catT[i + 1] <= t { i += 1 }
        return [(s.catN[i], abs(t - s.catT[i]) * s.len), (s.catN[i + 1], abs(s.catT[i + 1] - t) * s.len)]
    }

    fileprivate func lunghezza(_ iSeg: Int) -> Double { seg[iSeg].len }
    fileprivate func agganciaLuogo(lat: Double, lon: Double) -> Aggancio? { aggancia(x(lon), y(lat), RoadGraph.luogoMaxM) }

    /// Prepara le distanze da una posizione. nil se attorno non c'è nessuna strada nota.
    func da(lat: Double, lon: Double, maxM: Double) -> Sorgente? {
        guard let partenza = aggancia(x(lon), y(lat), RoadGraph.utenteMaxM) else { return nil }
        var dist: [Int: Double] = [:]
        // Heap binario minimo su (distanza, nodo): Dijkstra senza dipendenze.
        var hd: [Double] = [], hn: [Int] = []
        func metti(_ d: Double, _ n: Int) {
            var i = hd.count
            hd.append(d); hn.append(n)
            while i > 0 {
                let p = (i - 1) / 2
                if hd[p] <= hd[i] { break }
                hd.swapAt(p, i); hn.swapAt(p, i); i = p
            }
        }
        func togli() -> (Double, Int) {
            let d = hd[0], n = hn[0]
            let ld = hd.removeLast(), ln = hn.removeLast()
            if !hd.isEmpty {
                hd[0] = ld; hn[0] = ln
                var i = 0
                while true {
                    let l = 2 * i + 1, r = l + 1
                    var m = i
                    if l < hd.count && hd[l] < hd[m] { m = l }
                    if r < hd.count && hd[r] < hd[m] { m = r }
                    if m == i { break }
                    hd.swapAt(m, i); hn.swapAt(m, i); i = m
                }
            }
            return (d, n)
        }
        for (n, w) in vicini(partenza.seg, partenza.t) {
            let d = partenza.d + w
            if d < (dist[n] ?? .infinity) { dist[n] = d; metti(d, n) }
        }
        while !hd.isEmpty {
            let (d, n) = togli()
            if d > (dist[n] ?? .infinity) { continue }
            if d > maxM { break }
            for (m, w) in archi[n] {
                let nd = d + w
                if nd < (dist[m] ?? .infinity) { dist[m] = nd; metti(nd, m) }
            }
        }
        return Sorgente(grafo: self, partenza: partenza, dist: dist, maxM: maxM)
    }

    /// Le distanze da una posizione, pronte da leggere per ogni luogo.
    final class Sorgente {
        private let grafo: RoadGraph
        private let partenza: Aggancio
        private let dist: [Int: Double]
        private let maxM: Double

        fileprivate init(grafo: RoadGraph, partenza: Aggancio, dist: [Int: Double], maxM: Double) {
            self.grafo = grafo; self.partenza = partenza; self.dist = dist; self.maxM = maxM
        }

        /// Metri di strada; .infinity se oltre il raggio di ricerca; nil se attorno al luogo non c'è nessuna strada nota.
        func verso(lat: Double, lon: Double) -> Double? {
            guard let arrivo = grafo.agganciaLuogo(lat: lat, lon: lon) else { return nil }
            var best = Double.infinity
            // Stesso segmento: ci si arriva camminandoci sopra, senza passare da un nodo.
            if arrivo.seg == partenza.seg {
                best = partenza.d + abs(arrivo.t - partenza.t) * grafo.lunghezza(arrivo.seg)
            }
            for (n, w) in grafo.vicini(arrivo.seg, arrivo.t) {
                if let d = dist[n], d + w < best { best = d + w }
            }
            if best.isInfinite { return .infinity }
            let tot = best + arrivo.d
            return tot > maxM ? .infinity : tot
        }
    }
}
