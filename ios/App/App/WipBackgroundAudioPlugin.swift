import Foundation
import AVFoundation
import MediaPlayer
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

    override public func load() {
        super.load()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
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
            self.updateNowPlayingInfo()
            self.notifyPlaybackState(isPlaying: false)
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
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
            player.seek(to: CMTime(seconds: clamped, preferredTimescale: 1000)) { _ in
                self.updateNowPlayingInfo()
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
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true)
        } catch {
            CAPLog.print("[WipBackgroundAudio] AVAudioSession error: \(error)")
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

    private func startProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self, let player = self.player, player.rate > 0 else { return }
            let duration = player.currentItem?.duration.seconds ?? 0
            self.notifyListeners("playbackProgress", data: [
                "position": player.currentTime().seconds,
                "duration": duration.isFinite ? duration : 0
            ])
        }
    }

    private func notifyPlaybackState(isPlaying: Bool) {
        notifyListeners("playbackStatus", data: ["isPlaying": isPlaying])
    }

    private func teardownPlayer(deactivateSession: Bool) {
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
            player.seek(to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 1000)) { _ in
                self.updateNowPlayingInfo()
            }
            return .success
        }
    }

    private func seekRelative(_ offset: Double) {
        guard let player = player else { return }
        let target = max(0, player.currentTime().seconds + offset)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 1000)) { _ in
            self.updateNowPlayingInfo()
        }
    }
}
