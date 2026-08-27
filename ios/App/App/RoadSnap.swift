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
    private let roadsUrl = "https://wip.guide/api/roads/tile"

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
            guard httpOk, let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.finishAttempt(ok: false); return
            }
            let car = self.buildGrid(json["car"] as? [[[Double]]])
            let foot = self.buildGrid(json["foot"] as? [[[Double]]])
            // Un tile vuoto (risposta malformata o senza strade) non deve buttare
            // via l'indice buono che abbiamo gia' in RAM: meglio tenerlo e
            // trattare il tentativo come fallito.
            if car.isEmpty && foot.isEmpty { self.finishAttempt(ok: false); return }
            self.lock.lock()
            self.carGrid = car; self.footGrid = foot
            self.lastLat = lat; self.lastLon = lon; self.haveTile = true
            self.lock.unlock()
            if let u = self.cacheURL { try? data.write(to: u) } // persisti per l'offline
            self.finishAttempt(ok: true)
        }.resume()
    }

    /// Carica il tile persistito (offline). Chiamato all'init.
    private func loadCached() {
        guard let u = cacheURL, let data = try? Data(contentsOf: u),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let car = buildGrid(json["car"] as? [[[Double]]])
        let foot = buildGrid(json["foot"] as? [[[Double]]])
        lock.lock(); carGrid = car; footGrid = foot; haveTile = true; lock.unlock()
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
}
