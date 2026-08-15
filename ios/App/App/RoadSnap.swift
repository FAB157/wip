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

    private var carGrid: [String: [Seg]] = [:]
    private var footGrid: [String: [Seg]] = [:]
    private var haveTile = false
    private var lastLat = 0.0
    private var lastLon = 0.0
    private var fetching = false
    private let lock = NSLock()

    private func cellKey(_ lat: Double, _ lon: Double) -> String {
        return "\(Int((lat / cell).rounded())),\(Int((lon / cell).rounded()))"
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
        lock.lock(); let grid = isDriving ? carGrid : footGrid; lock.unlock()
        if grid.isEmpty { return nil }
        let lat = loc.coordinate.latitude, lon = loc.coordinate.longitude
        let acc = loc.horizontalAccuracy
        let maxSnap = min(40.0, max(20.0, acc <= 0 ? 20.0 : acc))
        let cLat = Int((lat / cell).rounded()), cLon = Int((lon / cell).rounded())
        var best: (lat: Double, lon: Double, distM: Double)?
        for dLa in -1...1 {
            for dLo in -1...1 {
                guard let arr = grid["\(cLat + dLa),\(cLon + dLo)"] else { continue }
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

    func shouldRefresh(_ loc: CLLocation, thresholdM: Double = 400) -> Bool {
        lock.lock(); let have = haveTile; let lLat = lastLat; let lLon = lastLon; lock.unlock()
        if !have { return true }
        return metersBetween(loc.coordinate.latitude, loc.coordinate.longitude, lLat, lLon) > thresholdM
    }

    /// Scarica e reindicizza il tile (async, best-effort).
    func refresh(_ loc: CLLocation, radius: Int = 700) {
        lock.lock(); if fetching { lock.unlock(); return }; fetching = true; lock.unlock()
        let lat = loc.coordinate.latitude, lon = loc.coordinate.longitude
        guard let url = URL(string: "\(roadsUrl)?lat=\(lat)&lon=\(lon)&radius=\(radius)") else {
            lock.lock(); fetching = false; lock.unlock(); return
        }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self else { return }
            defer { self.lock.lock(); self.fetching = false; self.lock.unlock() }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            let car = self.buildGrid(json["car"] as? [[[Double]]])
            let foot = self.buildGrid(json["foot"] as? [[[Double]]])
            self.lock.lock()
            self.carGrid = car; self.footGrid = foot
            self.lastLat = lat; self.lastLon = lon; self.haveTile = true
            self.lock.unlock()
            if let u = self.cacheURL { try? data.write(to: u) } // persisti per l'offline
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

    private func buildGrid(_ polys: [[[Double]]]?) -> [String: [Seg]] {
        var g: [String: [Seg]] = [:]
        guard let polys = polys else { return g }
        for poly in polys {
            var j = 0
            while j + 1 < poly.count {
                let p0 = poly[j], p1 = poly[j + 1]
                if p0.count >= 2 && p1.count >= 2 {
                    let seg = Seg(aLat: p0[0], aLon: p0[1], bLat: p1[0], bLon: p1[1])
                    g[cellKey(seg.aLat, seg.aLon), default: []].append(seg)
                    g[cellKey(seg.bLat, seg.bLon), default: []].append(seg)
                }
                j += 1
            }
        }
        return g
    }
}
