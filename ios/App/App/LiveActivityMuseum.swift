//
//  LiveActivityMuseum.swift
//  App
//
//  IL CRUSCOTTO DELLA VISITA MUSEO — lato app (13/09/2026).
//
//  Avvia, aggiorna e chiude la Live Activity `WipMuseumAttributes`: il
//  riquadro che resta sulla lock screen e nella Dynamic Island con l'opera
//  ascoltata, quella in ascolto e la prossima, aggiornato da
//  MuseumVisitSheet.tsx via WipBackgroundAudioPlugin.updateMuseumBanner.
//  Ricalca LiveActivityNav.swift (stessa struttura), come richiesto dal
//  requisito del 12/09/2026: non e' una riscrittura, e' lo stesso schema
//  applicato a uno stato diverso.
//
//  LE FOTO DELLE OPERE (14/09/2026, committente: «il player nel display deve
//  mostrare le foto delle opere [...] entrambe con foto, se ci sono»).
//  L'estensione non puo' scaricare nulla: legge solo file nel container
//  dell'App Group. Quindi e' l'app a scaricare la miniatura (Commons, 160 px),
//  a ridurla a un JPEG piccolo e a scriverla nel container; nello stato della
//  Live Activity viaggia solo il percorso del file (lo stato ha un tetto di
//  4 KB, un'immagine non ci starebbe). Se la foto non e' ancora sul disco si
//  manda lo stato senza, e appena scaricata si rimanda lo stesso stato con
//  il percorso: il cruscotto la mostra al secondo aggiornamento.
//
//  TUTTO E' BEST-EFFORT, per gli stessi tre motivi di LiveActivityNav (iOS
//  < 16.1, utente che le ha disattivate, richiesta rifiutata dal sistema):
//  in ognuno di questi casi il banner Now Playing (gia' in produzione dal
//  12/09 sera) resta comunque il ripiego con titolo/prossima sulla lock
//  screen, quindi l'utente non perde mai il "cosa sto ascoltando / cosa
//  ascolto dopo".
//
//  Il tipo `WipMuseumAttributes` sta in
//  ios/App/WipNavActivity/WipMuseumAttributes.swift e DEVE essere in target
//  membership sia di App sia di WipNavActivity.
//

import Foundation
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Le miniature delle opere nel container dell'App Group, per la lock screen.
enum WipMuseumFoto {
    /// Lato massimo del JPEG scritto: 120 px bastano per un tondo da 44 pt
    /// a 2x/3x e tengono il file sotto i 10 KB.
    static let latoMassimo: CGFloat = 120
    private static var inCorso = Set<String>()

    private static func cartella() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WipNavAppGroup.id)?
            .appendingPathComponent("Library/Caches/wip-museo", isDirectory: true)
    }

    private static func nomeFile(_ url: String) -> String {
        // djb2: corto e stabile, lo stesso URL da' sempre lo stesso file.
        var h: UInt32 = 5381
        for b in url.utf8 { h = (h &<< 5) &+ h &+ UInt32(b) }
        return String(h, radix: 36) + ".jpg"
    }

    /// Il percorso della miniatura gia' scaricata, o nil se manca.
    static func pronta(_ url: String?) -> String? {
        guard let url = url, !url.isEmpty, let dir = cartella() else { return nil }
        let file = dir.appendingPathComponent(nomeFile(url))
        return FileManager.default.fileExists(atPath: file.path) ? file.path : nil
    }

    /// Scarica e riduce la miniatura; `poi` viene chiamato sul main thread a
    /// file scritto. Un URL gia' in corso o non valido non fa nulla.
    static func scarica(_ url: String?, poi: @escaping () -> Void) {
        guard let url = url, !url.isEmpty, pronta(url) == nil,
              let remoto = URL(string: url), let dir = cartella() else { return }
        guard !inCorso.contains(url) else { return }
        inCorso.insert(url)
        let dest = dir.appendingPathComponent(nomeFile(url))
        var richiesta = URLRequest(url: remoto, timeoutInterval: 20)
        richiesta.setValue("WIP-App/1.0 (https://wip.guide)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: richiesta) { data, _, _ in
            defer { DispatchQueue.main.async { inCorso.remove(url) } }
            guard let data = data, let immagine = UIImage(data: data) else { return }
            let piccola = ridotta(immagine)
            guard let jpg = piccola.jpegData(compressionQuality: 0.8) else { return }
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try jpg.write(to: dest, options: .atomic)
            } catch {
                NSLog("[LiveActivityMuseum] foto non scritta: \(error.localizedDescription)")
                return
            }
            DispatchQueue.main.async { poi() }
        }.resume()
    }

    private static func ridotta(_ immagine: UIImage) -> UIImage {
        let lato = max(immagine.size.width, immagine.size.height)
        guard lato > latoMassimo, lato > 0 else { return immagine }
        let scala = latoMassimo / lato
        let misura = CGSize(width: immagine.size.width * scala, height: immagine.size.height * scala)
        let formato = UIGraphicsImageRendererFormat.default()
        formato.scale = 1
        return UIGraphicsImageRenderer(size: misura, format: formato).image { _ in
            immagine.draw(in: CGRect(origin: .zero, size: misura))
        }
    }
}

final class LiveActivityMuseum {

    static let shared = LiveActivityMuseum()
    private init() {}

    #if canImport(ActivityKit)
    /// Una sola per volta: una visita, un cruscotto.
    @available(iOS 16.1, *)
    private static var attivita: Activity<WipMuseumAttributes>? {
        get { _attivitaBox as? Activity<WipMuseumAttributes> }
        set { _attivitaBox = newValue }
    }
    private static var _attivitaBox: Any?
    #endif

    /// L'ultimo stato ricevuto dal JS, per rimandarlo quando arriva una foto
    /// o cambia play/pausa senza che il JS abbia mandato nulla di nuovo.
    private var ultimoNome = ""
    private var ultimoStato: [String: Any] = [:]

    var disponibili: Bool {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        return false
    }

    /**
     * Avvia il cruscotto, o lo aggiorna se e' gia' in corso.
     * - returns: `true` se la Live Activity ha preso in carico il banner.
     */
    @discardableResult
    func avviaOAggiorna(nomeMuseo: String, stato: [String: Any]) -> Bool {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return false }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

        ultimoNome = nomeMuseo
        ultimoStato = stato
        // Le foto che mancano si scaricano ora; a file scritto si rimanda lo
        // stato (se nel frattempo il JS non ne ha mandato un altro, e' lo
        // stesso stato con la foto in piu').
        for chiave in ["inAscoltoFotoUrl", "prossimaFotoUrl"] {
            let url = stato[chiave] as? String
            if WipMuseumFoto.pronta(url) == nil {
                WipMuseumFoto.scarica(url) { [weak self] in self?.riapplica() }
            }
        }

        let contenuto = LiveActivityMuseum.statoDaDizionario(stato)

        if let corrente = LiveActivityMuseum.attivita {
            Task { await LiveActivityMuseum.aggiornaAttivita(corrente, contenuto) }
            return true
        }

        do {
            let attributi = WipMuseumAttributes(nomeMuseo: nomeMuseo)
            let nuova: Activity<WipMuseumAttributes>
            if #available(iOS 16.2, *) {
                nuova = try Activity.request(
                    attributes: attributi,
                    content: ActivityContent(state: contenuto, staleDate: nil),
                    pushType: nil
                )
            } else {
                nuova = try Activity.request(
                    attributes: attributi,
                    contentState: contenuto,
                    pushType: nil
                )
            }
            LiveActivityMuseum.attivita = nuova
            return true
        } catch {
            NSLog("[LiveActivityMuseum] avvio non riuscito: \(error.localizedDescription)")
            return false
        }
        #else
        return false
        #endif
    }

    /// Play/pausa cambiato dal player (cruscotto, cuffie, sistema): il tasto
    /// del cruscotto cambia faccia. Solo con un cruscotto in corso e solo se
    /// il valore cambia davvero, per non mandare aggiornamenti a vuoto.
    func segnaPausa(_ inPausa: Bool) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        let esegui = { [weak self] in
            guard let self = self, LiveActivityMuseum.attivita != nil else { return }
            let prima = (self.ultimoStato["inPausa"] as? Bool) ?? false
            guard prima != inPausa else { return }
            self.ultimoStato["inPausa"] = inPausa
            self.riapplica()
        }
        if Thread.isMainThread { esegui() } else { DispatchQueue.main.async(execute: esegui) }
        #endif
    }

    /// Rimanda l'ultimo stato al cruscotto (foto arrivata, pausa cambiata).
    private func riapplica() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *), let corrente = LiveActivityMuseum.attivita else { return }
        let contenuto = LiveActivityMuseum.statoDaDizionario(ultimoStato)
        Task { await LiveActivityMuseum.aggiornaAttivita(corrente, contenuto) }
        #endif
    }

    /// Chiude il cruscotto: fine della visita, o audioguida spenta.
    func termina() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        ultimoStato = [:]
        guard let corrente = LiveActivityMuseum.attivita else { return }
        LiveActivityMuseum.attivita = nil
        Task {
            if #available(iOS 16.2, *) {
                await corrente.end(nil, dismissalPolicy: .immediate)
            } else {
                await corrente.end(dismissalPolicy: .immediate)
            }
        }
        #endif
    }

    /**
     * RIALLINEAMENTO AL RIAVVIO DELL'APP, stesso motivo di
     * LiveActivityNav.riaggancia(): una Live Activity sopravvive alla morte
     * del processo, senza questo l'app ne avvierebbe una seconda.
     */
    func riaggancia() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        LiveActivityMuseum.attivita = Activity<WipMuseumAttributes>.activities.first
        #endif
    }

    // MARK: - Interno

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func aggiornaAttivita(
        _ attivita: Activity<WipMuseumAttributes>,
        _ contenuto: WipMuseumAttributes.ContentState
    ) async {
        if #available(iOS 16.2, *) {
            await attivita.update(ActivityContent(state: contenuto, staleDate: nil))
        } else {
            await attivita.update(using: contenuto)
        }
    }

    /// Traduce il dizionario che arriva dal JS nello stato tipizzato. Ogni
    /// campo ha un default: una build web piu' vecchia che ne manda meno non
    /// deve far fallire il cruscotto. Le foto entrano solo se gia' sul disco.
    @available(iOS 16.1, *)
    private static func statoDaDizionario(_ d: [String: Any]) -> WipMuseumAttributes.ContentState {
        func stringa(_ k: String) -> String { (d[k] as? String) ?? "" }
        func numero(_ k: String, _ def: Double) -> Double {
            if let v = d[k] as? Double { return v }
            if let v = d[k] as? Int { return Double(v) }
            if let v = d[k] as? NSNumber { return v.doubleValue }
            return def
        }
        func booleano(_ k: String) -> Bool {
            if let v = d[k] as? Bool { return v }
            if let v = d[k] as? NSNumber { return v.boolValue }
            if let v = d[k] as? String { return v == "true" || v == "1" }
            return false
        }
        let progresso = numero("inAscoltoProgresso", -1)
        return WipMuseumAttributes.ContentState(
            ascoltataTitolo: stringa("ascoltataTitolo"),
            ascoltataSala: stringa("ascoltataSala"),
            inAscoltoTitolo: stringa("inAscoltoTitolo"),
            inAscoltoSala: stringa("inAscoltoSala"),
            inAscoltoFoto: WipMuseumFoto.pronta(stringa("inAscoltoFotoUrl")),
            inAscoltoProgresso: progresso < 0 ? -1 : min(1, max(0, progresso)),
            inPausa: booleano("inPausa"),
            prossimaTitolo: stringa("prossimaTitolo"),
            prossimaSala: stringa("prossimaSala"),
            prossimaFoto: WipMuseumFoto.pronta(stringa("prossimaFotoUrl")),
            indiceTappa: Int(numero("indiceTappa", 1)),
            tappeTotali: max(Int(numero("tappeTotali", 1)), 1)
        )
    }
    #endif
}
