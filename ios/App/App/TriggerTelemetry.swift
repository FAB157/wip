import Foundation
import CoreLocation

/**
 TriggerTelemetry — banco di misura per tarare il geofencing predittivo.

 PORT di android/.../geofence/TriggerTelemetry.kt (stesso header CSV, così i
 file delle due piattaforme si analizzano con lo stesso foglio di calcolo).

 PERCHÉ ESISTE
 -------------
 `PredictiveTrigger.tLead*` e `corridor*` sono valori di partenza scelti a
 tavolino, non taratura: dipendono dalla latenza reale del fix sul
 dispositivo, dalla densità urbana e dall'andatura dell'utente. Senza misura,
 cambiarli è indovinare — e un annuncio troppo anticipato è percepito come
 falso positivo esattamente come uno in ritardo.

 COME SI LEGGE
 -------------
 Il file sta in Documents, quindi è estraibile senza Xcode:
   - 3uTools → File Manager → app WIP → Documents → wip_trigger_telemetry.csv
   - oppure Finder/iTunes se l'app espone UIFileSharingEnabled
 In tempo reale, con l'app collegata: i print compaiono nella console.

 COME SI TARA
 ------------
   - FIRE sistematicamente troppo vicino  → alzare tLead
   - FIRE su POI di lato / mai visitati   → abbassare corridor
   - molti `fail-open`                    → il collo di bottiglia è
     l'accuratezza GPS, non le costanti: agire sul campionamento.

 Scrittura best-effort: la telemetria non deve mai poter rompere un trigger.
 */
enum TriggerTelemetry {

    private static let fileName = "wip_trigger_telemetry.csv"

    /// Tetto dimensione file: oltre, si riparte da capo.
    private static let maxBytes = 512 * 1024

    private static let header =
        "timestamp,poi_id,poi_name,phase,decision,reason,used_prediction," +
        "t_cpa_s,d_cpa_m,d_now_m,radius_m,fix_age_ms,accuracy_m,speed_ms,bearing_deg,mode\n"

    /// Interruttore: spegnibile da UserDefaults senza ricompilare.
    private static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: "telemetryEnabled") as? Bool ?? true
    }

    private static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static var fileURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
            .first?.appendingPathComponent(fileName)
    }

    static func log(
        poiId: String,
        poiName: String,
        phase: String,
        result: PredictiveTrigger.Result,
        location: CLLocation,
        isDriving: Bool,
        radiusM: Double
    ) {
        let fixAgeMs = max(0, Date().timeIntervalSince1970 * 1000
                              - location.timestamp.timeIntervalSince1970 * 1000)
        let accuracy = location.horizontalAccuracy
        let speed = location.speed
        let course = location.course

        // Console sempre: è il canale utile mentre si cammina col telefono in mano.
        print("[WipTelemetry] \(phase) \(result.decision) \"\(poiName)\" " +
              "t_cpa=\(num(result.tCpaSeconds))s d_cpa=\(num(result.dCpaMeters))m " +
              "d_now=\(Int(result.distanceNowMeters))m r=\(Int(radiusM))m " +
              "age=\(Int(fixAgeMs))ms acc=\(Int(accuracy))m v=\(num(speed))m/s " +
              "brg=\(Int(course))° pred=\(result.usedPrediction) — \(result.reason)")

        guard isEnabled, let url = fileURL else { return }

        let row = [
            isoFormatter.string(from: Date()),
            poiId,
            csv(poiName),
            phase,
            String(describing: result.decision),
            csv(result.reason),
            String(result.usedPrediction),
            num(result.tCpaSeconds),
            num(result.dCpaMeters),
            String(Int(result.distanceNowMeters)),
            String(Int(radiusM)),
            String(Int(fixAgeMs)),
            String(Int(accuracy)),
            num(speed),
            String(Int(course)),
            isDriving ? "driving" : "walking"
        ].joined(separator: ",") + "\n"

        do {
            let fm = FileManager.default
            let size = (try? fm.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            if !fm.fileExists(atPath: url.path) || (size ?? 0) > maxBytes {
                try header.write(to: url, atomically: true, encoding: .utf8)
            }
            if let handle = try? FileHandle(forWritingTo: url) {
                handle.seekToEndOfFile()
                if let data = row.data(using: .utf8) { handle.write(data) }
                try? handle.close()
            }
        } catch {
            // Best-effort: mai far fallire un trigger per la telemetria.
            print("[WipTelemetry] write failed: \(error.localizedDescription)")
        }
    }

    static func clear() {
        guard let url = fileURL else { return }
        try? header.write(to: url, atomically: true, encoding: .utf8)
    }

    private static func num(_ v: Double) -> String {
        if v.isNaN || v.isInfinite || v < -9_000_000 { return "" }
        return String(format: "%.1f", v)
    }

    /// Virgole e virgolette romperebbero il CSV.
    private static func csv(_ s: String) -> String {
        if s.contains(",") || s.contains("\"") {
            return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return s
    }
}
