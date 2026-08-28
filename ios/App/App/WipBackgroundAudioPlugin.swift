import Foundation
import AVFoundation
import MediaPlayer
import UIKit
import Capacitor

/**
 * Equivalente iOS di WipBackgroundAudioService/WipBackgroundAudioPlugin (Android).
 * Riproduce le audioguide con AVPlayer: con UIBackgroundModes "audio" (già in
 * Info.plist) la riproduzione continua a schermo spento, con i controlli
 * play/pausa/seek in Lock Screen e Control Center via MPRemoteCommandCenter.
 *
 * API ed eventi devono restare identici alla versione Android
 * (src/plugins/WipBackgroundAudio.ts è il contratto condiviso).
 */
@objc(WipBackgroundAudioPlugin)
public class WipBackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WipBackgroundAudioPlugin"
    public let jsName = "WipBackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMegaphone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setupMediaSession", returnType: CAPPluginReturnPromise)
    ]

    /// (28/08/2026, AUD-01) Istanza viva del plugin, per SpeechQueue: la voce
    /// nativa (teaser, annunci) deve sapere se la guida JS sta suonando e
    /// metterla in pausa — `.duckOthers` non agisce su un secondo player
    /// della stessa app, e prima le due voci si sovrapponevano. `weak`: il
    /// plugin vive quanto il bridge Capacitor, non lo si trattiene.
    public private(set) static weak var shared: WipBackgroundAudioPlugin?

    private var player: AVPlayer?
    private var statusObservation: NSKeyValueObservation?
    /// (AUD-12) KVO su `timeControlStatus`: è l'unica fonte di verità su
    /// "sta suonando" — le pause decise dal sistema (route, stall, fine
    /// buffer) non passano da nessun metodo del plugin.
    private var timeControlObservation: NSKeyValueObservation?
    /// Ultimo `isPlaying` mandato al JS: la KVO notifica solo i cambi.
    private var ultimoStatoNotificato: Bool?
    /// (AUD-01) In pausa per far parlare SpeechQueue: si riprende a coda
    /// vuota. Qualunque comando esplicito (pause/resume/stop/play dal JS o
    /// dalla Lock Screen) lo azzera: la volontà dell'utente vince.
    private(set) var isPausedForSpeech = false
    /// L'utente (o il JS) vuole la riproduzione in corso: serve allo stacco
    /// delle cuffie, quando iOS mette in pausa l'AVPlayer da solo e noi
    /// dobbiamo farlo ripartire dall'altoparlante (decisione 28/08/2026).
    private var riproduzioneVoluta = false
    private var progressTimer: Timer?
    /// Velocità scelta dall'utente: va riapplicata a ogni resume perché
    /// AVPlayer riparte sempre a rate 1.0 con play().
    private var desiredRate: Float = 1.0
    private var currentTitle = "Italia in Tasca"
    private var currentSubtitle = "Audioguida"
    private var remoteCommandsConfigured = false
    /// Spegnimento differito della sessione audio quando si resta in pausa
    /// (vedi `programmaSpegnimentoSessione`).
    private var timerSpegnimentoSessione: Timer?
    /// Secondi di pausa dopo i quali la sessione audio si disattiva.
    private static let attesaSpegnimentoSessioneS: TimeInterval = 30

    override public func load() {
        super.load()
        Self.shared = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        // (AUD-12) Cambio di uscita: auricolari sfilati / Bluetooth spento.
        // Il sistema mette in pausa l'AVPlayer da solo ma non lo dice a
        // nessuno: la UI JS restava su "in riproduzione" e la Lock Screen su
        // rate 1. Qui la pausa diventa esplicita e notificata.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        // Il timer di progresso non deve battere a schermo spento: gli eventi
        // attraversano il ponte Capacitor per aggiornare una barra che nessuno
        // sta guardando. Si sospende in background e riparte al ritorno.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appInBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appInPrimoPiano),
            // didBecomeActive e non willEnterForeground: durante il secondo
            // `applicationState` vale ancora `.background`, e la guardia in
            // startProgressTimer rifiuterebbe di far ripartire il timer.
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        statusObservation?.invalidate()
        timeControlObservation?.invalidate()
        progressTimer?.invalidate()
        timerSpegnimentoSessione?.invalidate()
    }

    // MARK: - Coordinamento con la voce nativa (SpeechQueue, AUD-01)

    /// Il player JS sta suonando? Da leggere sul main.
    var isPlaying: Bool { (player?.rate ?? 0) > 0 }

    /// SpeechQueue sta per parlare: pausa, ricordando che è stata nostra.
    /// Sul main (i chiamanti di SpeechQueue già ci stanno; si rientra
    /// comunque in modo sicuro).
    func pauseForSpeech() {
        let esegui = {
            guard let player = self.player, player.rate > 0 else { return }
            player.pause()
            self.isPausedForSpeech = true
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
        }
        if Thread.isMainThread { esegui() } else { DispatchQueue.main.async(execute: esegui) }
    }

    /// SpeechQueue ha finito: si riprende SOLO se la pausa era nostra e
    /// nessuno nel frattempo ha fermato o sostituito il player.
    func resumeAfterSpeechIfNeeded() {
        let esegui = {
            guard self.isPausedForSpeech, let player = self.player else { return }
            self.isPausedForSpeech = false
            self.riproduzioneVoluta = true
            self.annullaSpegnimentoSessione()
            self.activateAudioSession()
            player.playImmediately(atRate: self.desiredRate)
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
        }
        if Thread.isMainThread { esegui() } else { DispatchQueue.main.async(execute: esegui) }
    }

    // MARK: - Metodi plugin

    @objc func play(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), !urlString.isEmpty else {
            call.reject("URL is required")
            return
        }
        currentTitle = call.getString("title") ?? "Italia in Tasca"
        currentSubtitle = call.getString("subtitle") ?? "Audioguida"

        // Filesystem.getUri restituisce file:///…; le tracce remote sono https.
        let url: URL?
        if urlString.hasPrefix("file://") || urlString.hasPrefix("http") {
            url = URL(string: urlString)
        } else {
            url = URL(fileURLWithPath: urlString)
        }
        guard let mediaUrl = url else {
            call.reject("Invalid URL")
            return
        }

        DispatchQueue.main.async {
            // (AUD-01) La guida JS parte: la voce nativa cede (teaser in coda
            // compresi). Mai due voci insieme — e questa è quella che
            // l'utente ha chiesto toccando Ascolta.
            SpeechQueue.shared.stopSpeaking()
            self.teardownPlayer(deactivateSession: false)
            self.activateAudioSession()

            let item = AVPlayerItem(url: mediaUrl)
            let player = AVPlayer(playerItem: item)
            self.player = player

            self.statusObservation = item.observe(\.status) { [weak self] observed, _ in
                guard let self = self else { return }
                if observed.status == .failed {
                    let message = observed.error?.localizedDescription ?? "AVPlayer error"
                    self.notifyListeners("playbackError", data: ["message": message])
                    self.notifyPlaybackState(isPlaying: false)
                    self.teardownPlayer(deactivateSession: true)
                }
            }
            // (AUD-12) Stato reale di riproduzione → JS + Now Playing. La
            // KVO può arrivare da un thread qualsiasi: si torna sul main.
            // `.waitingToPlayAtSpecifiedRate` (buffering) conta come "in
            // riproduzione": è l'intenzione, e la barra non deve lampeggiare.
            self.timeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] osservato, _ in
                DispatchQueue.main.async {
                    guard let self = self, self.player === osservato else { return }
                    let inRiproduzione = osservato.timeControlStatus != .paused
                    guard self.ultimoStatoNotificato != inRiproduzione else { return }
                    self.notifyPlaybackState(isPlaying: inRiproduzione)
                    self.updateNowPlayingInfo()
                }
            }

            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.playerDidFinish(_:)),
                name: .AVPlayerItemDidPlayToEndTime,
                object: item
            )

            self.configureRemoteCommandsIfNeeded()
            self.riproduzioneVoluta = true
            player.playImmediately(atRate: self.desiredRate)
            self.startProgressTimer()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
            call.resolve(["playing": true])
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.isPausedForSpeech = false // pausa voluta: niente ripresa automatica
            self.riproduzioneVoluta = false
            self.player?.pause()
            self.programmaSpegnimentoSessione()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.isPausedForSpeech = false
            self.riproduzioneVoluta = true
            self.annullaSpegnimentoSessione()
            self.activateAudioSession()
            self.player?.playImmediately(atRate: self.desiredRate)
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardownPlayer(deactivateSession: true)
            self.notifyPlaybackState(isPlaying: false)
            call.resolve()
        }
    }

    @objc func setSpeed(_ call: CAPPluginCall) {
        let speed = Float(call.getDouble("speed") ?? 1.0)
        DispatchQueue.main.async {
            self.desiredRate = speed
            if let player = self.player, player.rate > 0 {
                player.rate = speed
            }
            self.updateNowPlayingInfo()
            call.resolve()
        }
    }

    @objc func setMegaphone(_ call: CAPPluginCall) {
        // L'effetto megafono (banda 700–3500Hz) esiste solo su Android
        // (LoudnessEnhancer/EQ) e sul web (grafo WebAudio). Con AVPlayer non
        // c'è un EQ applicabile senza riscrivere il playback su AVAudioEngine:
        // qui è un no-op deliberato, il JS non deve fallire.
        call.resolve()
    }

    @objc func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let player = self.player else {
                call.reject("No media loaded")
                return
            }
            let targetSeconds: Double
            if let position = call.getDouble("position") {
                targetSeconds = position
            } else if let offset = call.getDouble("offset") {
                targetSeconds = player.currentTime().seconds + offset
            } else {
                call.reject("position or offset is required")
                return
            }
            let clamped = max(0, targetSeconds)
            player.seek(to: CMTime(seconds: clamped, preferredTimescale: 1000)) { [weak self] _ in
                self?.updateNowPlayingInfo()
                call.resolve()
            }
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = self.player
            let duration = player?.currentItem?.duration.seconds ?? 0
            call.resolve([
                "isPlaying": (player?.rate ?? 0) > 0,
                "hasMedia": player?.currentItem != nil,
                "position": player?.currentTime().seconds ?? 0,
                "duration": duration.isFinite ? duration : 0
            ])
        }
    }

    @objc func setupMediaSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.configureRemoteCommandsIfNeeded()
            call.resolve()
        }
    }

    // MARK: - Audio session

    /// L'audioguida completa deve duckare la musica di sottofondo, non
    /// metterla in pausa: stesso comportamento di SpeechQueue.activateAudioSession
    /// (teaser/annunci) e allineato al fix gemello lato Android sulla guida
    /// "Elite" — prima qui `options: []` era esclusivo (stop netto di
    /// Spotify/Musica) mentre il resto dell'app abbassa soltanto.
    private func activateAudioSession() {
        annullaSpegnimentoSessione()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true)
        } catch {
            CAPLog.print("[WipBackgroundAudio] AVAudioSession error: \(error)")
        }
    }

    /// IN PAUSA LA SESSIONE VA SPENTA. Una AVAudioSession attiva tiene acceso
    /// il percorso audio e, con `.duckOthers`, tiene la musica dell'utente
    /// abbassata: chi metteva in pausa l'audioguida per ascoltare la guida
    /// vera e propria si ritrovava Spotify a metà volume finché non chiudeva
    /// l'app. Non si spegne all'istante — una pausa dura spesso pochi secondi
    /// e riattivare la sessione a ogni ripresa fa perdere l'attacco della
    /// traccia: si aspettano trenta secondi, e la ripresa annulla l'attesa.
    private func programmaSpegnimentoSessione() {
        timerSpegnimentoSessione?.invalidate()
        timerSpegnimentoSessione = Timer.scheduledTimer(
            withTimeInterval: Self.attesaSpegnimentoSessioneS, repeats: false
        ) { [weak self] _ in
            guard let self = self else { return }
            // Ancora in pausa? (una ripresa avrebbe già annullato il timer,
            // ma il controllo costa nulla ed evita di spegnere sotto i piedi
            // a una riproduzione ripartita da un'altra strada).
            guard (self.player?.rate ?? 0) == 0 else { return }
            self.timerSpegnimentoSessione = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    private func annullaSpegnimentoSessione() {
        timerSpegnimentoSessione?.invalidate()
        timerSpegnimentoSessione = nil
    }

    /// (AUD-12) `.oldDeviceUnavailable` (auricolari sfilati, Bluetooth
    /// spento): pausa esplicita — è la linea guida Apple per un player di
    /// contenuti, e la ragione è pratica: l'audio passerebbe all'altoparlante
    /// a tutto volume in mezzo alla gente. La voce nativa (SpeechQueue) segue
    /// una regola diversa e deliberata — continua — perché è un annuncio
    /// breve; qui sono minuti di racconto. Gli altri motivi non toccano nulla.
    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
              reason == .oldDeviceUnavailable else { return }
        // Cuffie/BT staccati: iOS mette in pausa l'AVPlayer da solo. Decisione
        // di prodotto (28/08/2026, stessa regola della voce nativa del 23/08):
        // la guida CONTINUA dall'altoparlante. Si riparte solo se la
        // riproduzione era voluta e non è una pausa per la voce nativa; se
        // l'utente aveva messo in pausa lui, resta in pausa.
        DispatchQueue.main.async {
            guard let player = self.player, self.riproduzioneVoluta, !self.isPausedForSpeech else {
                self.updateNowPlayingInfo()
                self.notifyPlaybackState(isPlaying: self.isPlaying)
                return
            }
            self.annullaSpegnimentoSessione()
            self.activateAudioSession()
            player.playImmediately(atRate: self.desiredRate)
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
        }
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        if type == .began {
            notifyPlaybackState(isPlaying: false)
        } else if type == .ended {
            let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                DispatchQueue.main.async {
                    self.activateAudioSession()
                    self.player?.playImmediately(atRate: self.desiredRate)
                    self.notifyPlaybackState(isPlaying: true)
                }
            }
        }
    }

    // MARK: - Fine traccia / progresso

    @objc private func playerDidFinish(_ notification: Notification) {
        DispatchQueue.main.async {
            self.notifyListeners("playbackEnded", data: [:])
            self.notifyPlaybackState(isPlaying: false)
            self.teardownPlayer(deactivateSession: true)
        }
    }

    /// Progresso verso il JS. Era a 2 Hz e batteva anche a schermo spento:
    /// due attraversamenti del ponte Capacitor al secondo per aggiornare una
    /// barra che nessuno vedeva. Un secondo è la granularità che serve a un
    /// contatore in minuti e secondi, e in background il timer non parte
    /// proprio (vedi gli observer di ciclo di vita in `load`).
    private func startProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = nil
        // Riproduzione avviata a schermo spento (trigger in background): il
        // timer non parte nemmeno, lo accende il ritorno in primo piano.
        guard UIApplication.shared.applicationState != .background else { return }
        progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, let player = self.player, player.rate > 0 else { return }
            let duration = player.currentItem?.duration.seconds ?? 0
            self.notifyListeners("playbackProgress", data: [
                "position": player.currentTime().seconds,
                "duration": duration.isFinite ? duration : 0
            ])
        }
    }

    @objc private func appInBackground() {
        DispatchQueue.main.async {
            self.progressTimer?.invalidate()
            self.progressTimer = nil
        }
    }

    @objc private func appInPrimoPiano() {
        DispatchQueue.main.async {
            // Solo se c'è davvero qualcosa in riproduzione: un timer acceso
            // su un player fermo è la stessa batteria sprecata di prima.
            guard let player = self.player, player.rate > 0 else { return }
            self.startProgressTimer()
        }
    }

    private func notifyPlaybackState(isPlaying: Bool) {
        ultimoStatoNotificato = isPlaying
        notifyListeners("playbackStatus", data: ["isPlaying": isPlaying])
    }

    private func teardownPlayer(deactivateSession: Bool) {
        annullaSpegnimentoSessione()
        isPausedForSpeech = false
        riproduzioneVoluta = false
        ultimoStatoNotificato = nil
        progressTimer?.invalidate()
        progressTimer = nil
        statusObservation?.invalidate()
        statusObservation = nil
        timeControlObservation?.invalidate()
        timeControlObservation = nil
        if let item = player?.currentItem {
            NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: item)
        }
        player?.pause()
        player = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        if deactivateSession {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    // MARK: - Lock screen / Control Center

    private func updateNowPlayingInfo() {
        guard let player = player else { return }
        let duration = player.currentItem?.duration.seconds ?? 0
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle,
            MPMediaItemPropertyArtist: currentSubtitle,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime().seconds,
            MPNowPlayingInfoPropertyPlaybackRate: player.rate
        ]
        if duration.isFinite && duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /// Non più `private` (AUD-14): SpeechQueue la chiama quando fa partire
    /// l'MP3 della guida completa, così i tasti della Lock Screen esistono
    /// anche se il JS non ha mai riprodotto nulla in questa sessione.
    /// Idempotente: i target si registrano una volta sola.
    func configureRemoteCommandsIfNeeded() {
        guard !remoteCommandsConfigured else { return }
        remoteCommandsConfigured = true
        UIApplication.shared.beginReceivingRemoteControlEvents()

        let center = MPRemoteCommandCenter.shared()

        // (AUD-14) Player JS nil ma MP3 della guida in SpeechQueue: play e
        // pausa agiscono lì. Prima rispondevano .noSuchContent e dalla Lock
        // Screen non si poteva fermare la guida del Day Pass.
        center.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .noSuchContent }
            guard self.player != nil else {
                guard SpeechQueue.shared.hasActiveMp3 else { return .noSuchContent }
                SpeechQueue.shared.continueSpeaking()
                return .success
            }
            self.isPausedForSpeech = false
            self.activateAudioSession()
            self.player?.playImmediately(atRate: self.desiredRate)
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .noSuchContent }
            guard self.player != nil else {
                guard SpeechQueue.shared.hasActiveMp3 else { return .noSuchContent }
                SpeechQueue.shared.pauseSpeaking()
                return .success
            }
            self.isPausedForSpeech = false
            self.player?.pause()
            self.programmaSpegnimentoSessione()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
            return .success
        }
        // Un solo tasto play/pausa (AirPods, tasto cuffie): stessa logica.
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .noSuchContent }
            if let player = self.player {
                self.isPausedForSpeech = false
                if player.rate > 0 {
                    player.pause()
                    self.programmaSpegnimentoSessione()
                    self.notifyPlaybackState(isPlaying: false)
                } else {
                    self.activateAudioSession()
                    player.playImmediately(atRate: self.desiredRate)
                    self.notifyPlaybackState(isPlaying: true)
                }
                self.updateNowPlayingInfo()
                return .success
            }
            guard SpeechQueue.shared.hasActiveMp3 else { return .noSuchContent }
            if SpeechQueue.shared.isMp3Playing {
                SpeechQueue.shared.pauseSpeaking()
            } else {
                SpeechQueue.shared.continueSpeaking()
            }
            return .success
        }
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] _ in
            self?.seekRelative(15)
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.seekRelative(-15)
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let player = self.player,
                  let positionEvent = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            // `[weak self]` anche qui dentro: i target del command center non
            // vengono mai rimossi, e una closure di seek che trattiene il
            // plugin per forte lo tiene in vita oltre la sua WebView.
            player.seek(to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 1000)) { [weak self] _ in
                self?.updateNowPlayingInfo()
            }
            return .success
        }
    }

    private func seekRelative(_ offset: Double) {
        guard let player = player else { return }
        let target = max(0, player.currentTime().seconds + offset)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 1000)) { [weak self] _ in
            self?.updateNowPlayingInfo()
        }
    }
}
