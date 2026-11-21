// FIREBASE TEST LAB (iPhone VERO) — NAVIGATORE NATIVO iOS SENZA BATTITO DEL JS (21/11/2026).
// Gemello iOS di android/app/src/androidTest/java/com/itaintasca/app/CollaudoSchermoSpentoTest.kt.
// Lanciato da .github/workflows/ios-testlab.yml (solo a mano). L'esito lo legge
// scratch/collaudo-notte/moduli/modulo-testlab.mjs (voce «nativo_ios_testlab»).
//
// COSA FA, sull'iPhone di Test Lab, DENTRO il processo dell'app vera (test di unità ospitato, TEST_HOST = App.app):
//  1. spegne il servizio di sfondo (isServiceActive = false): nessun fix vero del telefono del laboratorio deve
//     arrivare al follower mentre il test consegna i suoi;
//  2. consegna a NavFollower (la classe VERA di BackgroundPoiManager.swift, compilata per arm64) la rotta del banco
//     notturno: Documents/collaudo-in/rotta.json se il lanciatore l'ha mandata con --other-files, altrimenti quella
//     dentro il pacchetto del test (collaudo/rotta.json, copia dell'asset Android: caso nav_spento);
//  3. NESSUN battito del JS: dopo 8 s il follower è al comando, come a schermo spento;
//  4. riproduce la traccia (collaudo/traccia.json, [[lat,lon,acc,tMs,vel]…]) AI TEMPI VERI, con l'orologio monotono
//     vero (NavFollower.orologioMs), e ogni frase che il follower restituisce va nella coda vocale VERA (SpeechQueue,
//     AVSpeechSynthesizer, kind "nav", scadenza 20 s) per la stessa strada di consegnaFixAlNavigatore;
//  5. scrive il registro (righe «NAV FIX … NATIVO DICE[…]: frase», stesso formato del Kotlin) in
//     Documents/collaudo/registro.txt e progress.txt: il lanciatore li scarica con --directories-to-pull.
//
// COSA NON PUÒ FARE (scritto anche nel report):
//  - SCHERMO SPENTO: iOS non offre a un XCTest un modo pubblico di bloccare il telefono o di mandare l'app in
//    sospensione. Il test prova la LOGICA nativa sul telefono vero (CPU arm64, orologio Darwin, sintesi vocale
//    vera) con il JS «morto» (niente battito), non il comportamento del sistema a schermo bloccato (background
//    location, sospensione, sessione audio in background). Quello resta da provare a mano con un iPhone in tasca.
//  - FIX GPS: le posizioni NON passano da CoreLocation (un test di unità non può simulare il GPS del sistema;
//    la «Simulate Location» di Xcode non è disponibile su Test Lab): si consegnano al follower come farebbe
//    consegnaFixAlNavigatore. Filtro età del fix (15 s) e cruscotto Live Activity non sono coinvolti.
//  - BATTERIA: nessuna metrica di energia esiste in XCTest (XCTMetric: clock, CPU, memoria, storage, signpost,
//    launch, hitch — nessuna batteria) e i telefoni di Test Lab sono in carica. Si registrano solo, come
//    INFORMAZIONE e mai come voto: livello e stato della batteria prima/dopo (UIDevice, a scatti grossi e in
//    carica), secondi di CPU del processo (getrusage) e stato termico. È un indicatore, non i mAh.
//  - APP GROUP: il test non lo usa (Test Lab rifirma con il suo profilo e gli app group non esistono lì).
//    Il workflow toglie entitlement ed estensione dalla build di test.
import XCTest
import UIKit
import CoreLocation
@testable import App

final class CollaudoNavigatoreTest: XCTestCase {

    private let fm = FileManager.default
    private var documenti: URL { fm.urls(for: .documentDirectory, in: .userDomainMask)[0] }

    /// Attende `secondi` lasciando girare il main: la coda vocale vive sul main (ogni ingresso è un main.async).
    private func attendi(_ secondi: Double) {
        guard secondi > 0 else { return }
        RunLoop.current.run(until: Date().addingTimeInterval(secondi))
    }

    /// Secondi di CPU (utente + sistema) consumati dal processo fin qui.
    private func cpuSecondi() -> Double {
        var r = rusage()
        getrusage(RUSAGE_SELF, &r)
        let u = Double(r.ru_utime.tv_sec) + Double(r.ru_utime.tv_usec) / 1e6
        let s = Double(r.ru_stime.tv_sec) + Double(r.ru_stime.tv_usec) / 1e6
        return u + s
    }

    private func batteria() -> String {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let livello = UIDevice.current.batteryLevel // -1 = ignoto
        let stato: String
        switch UIDevice.current.batteryState {
        case .charging: stato = "in_carica"
        case .full: stato = "piena"
        case .unplugged: stato = "scollegata"
        default: stato = "ignoto"
        }
        let termico: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: termico = "normale"
        case .fair: termico = "discreto"
        case .serious: termico = "serio"
        case .critical: termico = "critico"
        @unknown default: termico = "?"
        }
        let pct = livello < 0 ? "-" : String(Int((livello * 100).rounded()))
        return "livello=\(pct) stato=\(stato) termico=\(termico) basso_consumo=\(ProcessInfo.processInfo.isLowPowerModeEnabled ? "si" : "no")"
    }

    /// Un file JSON: prima da Documents/collaudo-in (mandato con --other-files), poi dal pacchetto del test.
    private func leggi(_ nome: String) -> (testo: String, fonte: String)? {
        let daDoc = documenti.appendingPathComponent("collaudo-in").appendingPathComponent(nome)
        if let t = try? String(contentsOf: daDoc, encoding: .utf8), !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return (t, "documents")
        }
        let bundle = Bundle(for: CollaudoNavigatoreTest.self)
        let base = (nome as NSString).deletingPathExtension
        if let url = bundle.url(forResource: base, withExtension: "json", subdirectory: "collaudo")
            ?? bundle.url(forResource: base, withExtension: "json"),
           let t = try? String(contentsOf: url, encoding: .utf8) {
            return (t, "pacchetto")
        }
        return nil
    }

    private static func numero(_ v: Any?) -> Double? {
        if let n = v as? NSNumber { return n.doubleValue }
        return nil
    }

    func testNavigatoreNativoSenzaBattito() throws {
        // 1. Niente servizio di sfondo: i fix veri del laboratorio non devono toccare il follower.
        UserDefaults.standard.set(false, forKey: "isServiceActive")
        BackgroundPoiManager.shared.stop()

        let uscita = documenti.appendingPathComponent("collaudo")
        try? fm.removeItem(at: uscita)
        try fm.createDirectory(at: uscita, withIntermediateDirectories: true)

        RegistroCollaudo.shared.svuota()
        RegistroCollaudo.shared.imposta(true)

        // 2. Rotta e traccia: stessa coppia dello stesso caso (mai una dal disco e l'altra dal pacchetto).
        var rotta = leggi("rotta.json")
        var traccia = leggi("traccia.json")
        if rotta?.fonte != traccia?.fonte {
            let b = Bundle(for: CollaudoNavigatoreTest.self)
            func dalPacchetto(_ n: String) -> (String, String)? {
                guard let u = b.url(forResource: n, withExtension: "json", subdirectory: "collaudo") ?? b.url(forResource: n, withExtension: "json"),
                      let t = try? String(contentsOf: u, encoding: .utf8) else { return nil }
                return (t, "pacchetto")
            }
            rotta = dalPacchetto("rotta").map { (testo: $0.0, fonte: $0.1) }
            traccia = dalPacchetto("traccia").map { (testo: $0.0, fonte: $0.1) }
        }
        let rottaJson = try XCTUnwrap(rotta?.testo, "rotta.json assente")
        let tracciaTesto = try XCTUnwrap(traccia?.testo, "traccia.json assente")
        let fix = try XCTUnwrap(
            (try JSONSerialization.jsonObject(with: Data(tracciaTesto.utf8))) as? [[Any]],
            "traccia.json non è [[lat,lon,acc,tMs,vel]…]")
        XCTAssertFalse(fix.isEmpty, "traccia vuota")
        RegistroCollaudo.shared.scrivi("TESTLAB rotta da \(rotta?.fonte ?? "?"): \(fix.count) fix")
        RegistroCollaudo.shared.scrivi("TESTLAB dispositivo \(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)")

        // 3. Consegna al follower vero. Da qui nessun battito: dopo 8 s parla il nativo.
        let follower = NavFollower.shared
        follower.clear()
        XCTAssertTrue(follower.setRoute(json: rottaJson), "rotta rifiutata dal follower")
        RegistroCollaudo.shared.scrivi("TESTLAB rotta consegnata, JS muto (nessun battito); schermo NON spegnibile da XCTest")
        RegistroCollaudo.shared.scrivi("TESTLAB BATT inizio \(batteria())")
        let cpu0 = cpuSecondi()
        let muro0 = Date()

        // 4. La traccia ai tempi veri.
        let t0 = Date()
        let tPrimo = Self.numero(fix[0].count > 3 ? fix[0][3] : nil) ?? 0
        var frasi = 0
        for (i, f) in fix.enumerated() {
            guard f.count >= 2, let lat = Self.numero(f[0]), let lon = Self.numero(f[1]) else {
                RegistroCollaudo.shared.scrivi("TESTLAB fix \(i) malformato")
                continue
            }
            let acc = f.count > 2 ? (Self.numero(f[2]) ?? 6) : 6
            let tMs = f.count > 3 ? (Self.numero(f[3]) ?? 0) : 0
            let vel = f.count > 4 ? (Self.numero(f[4]) ?? .nan) : .nan
            attendi((tMs - tPrimo) / 1000 - Date().timeIntervalSince(t0))

            // Come handleLocation → RegistroCollaudo.posizione (riga POS ogni 4 s, BATT ogni 5 min).
            RegistroCollaudo.shared.posizione(CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                altitude: 0, horizontalAccuracy: acc, verticalAccuracy: -1, timestamp: Date()))
            // Come consegnaFixAlNavigatore: fix al follower, frase nella coda vocale unica.
            if let frase = follower.onFix(lat: lat, lon: lon, accuracy: acc,
                                          nowMs: NavFollower.orologioMs(),
                                          velGpsMs: vel.isFinite && vel >= 0 ? vel : Double.nan) {
                frasi += 1
                SpeechQueue.shared.enqueue(SpeechQueue.SpeechItem(
                    text: frase, isGem: false, isItinerary: false, poiId: nil, priority: 0, kind: "nav",
                    scadenzaMs: Date().timeIntervalSince1970 * 1000 + 20_000))
            }
        }
        attendi(30) // l'arrivo e la coda della voce

        // 5. Consumo (solo informazione) e uscita.
        let cpu = cpuSecondi() - cpu0
        let minuti = max(Date().timeIntervalSince(muro0) / 60, 0.01)
        RegistroCollaudo.shared.scrivi("TESTLAB BATT fine \(batteria())")
        RegistroCollaudo.shared.scrivi(String(format: "TESTLAB CPU secondi=%.2f minuti=%.2f cpu_per_minuto=%.3f",
                                              locale: Locale(identifier: "en_US_POSIX"), cpu, minuti, cpu / minuti))
        RegistroCollaudo.shared.scrivi("TESTLAB fine traccia: \(fix.count) fix, \(frasi) frasi del nativo, schermo=acceso_non_forzabile")

        let righe = RegistroCollaudo.shared.tutte()
        let progresso = follower.progress()
        let progressoTesto = progresso.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: " ")
        try (righe.joined(separator: "\n") + "\n").write(to: uscita.appendingPathComponent("registro.txt"), atomically: true, encoding: .utf8)
        try (progressoTesto + "\n").write(to: uscita.appendingPathComponent("progress.txt"), atomically: true, encoding: .utf8)
        for r in righe { NSLog("CollaudoTestLab %@", r) }
        NSLog("CollaudoTestLab PROGRESS %@", progressoTesto)

        // Anche nell'xcresult, nel caso --directories-to-pull non porti a casa i file.
        let allegato = XCTAttachment(string: righe.joined(separator: "\n"))
        allegato.name = "registro.txt"
        allegato.lifetime = .keepAlways
        add(allegato)

        follower.clear()
        RegistroCollaudo.shared.imposta(false)
        // Il giudizio (svolte, arrivo, ripetizioni) lo dà il collaudo notturno sul registro: qui si fallisce solo se
        // il follower non ha visto nessun fix (test non eseguito davvero).
        XCTAssertTrue(righe.contains { $0.contains("NAV FIX ") }, "il follower non ha registrato nessun fix")
    }
}
