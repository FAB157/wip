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

    private var player: AVPlayer?
    private var statusObservation: NSKeyValueObservation?
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
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
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

            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.playerDidFinish(_:)),
                name: .AVPlayerItemDidPlayToEndTime,
                object: item
            )

            self.configureRemoteCommandsIfNeeded()
            player.playImmediately(atRate: self.desiredRate)
            self.startProgressTimer()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
            call.resolve(["playing": true])
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player?.pause()
            self.programmaSpegnimentoSessione()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
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
        notifyListeners("playbackStatus", data: ["isPlaying": isPlaying])
    }

    private func teardownPlayer(deactivateSession: Bool) {
        annullaSpegnimentoSessione()
        progressTimer?.invalidate()
        progressTimer = nil
        statusObservation?.invalidate()
        statusObservation = nil
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

    private func configureRemoteCommandsIfNeeded() {
        guard !remoteCommandsConfigured else { return }
        remoteCommandsConfigured = true
        UIApplication.shared.beginReceivingRemoteControlEvents()

        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            guard let self = self, self.player != nil else { return .noSuchContent }
            self.activateAudioSession()
            self.player?.playImmediately(atRate: self.desiredRate)
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: true)
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.player != nil else { return .noSuchContent }
            self.player?.pause()
            self.programmaSpegnimentoSessione()
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
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
