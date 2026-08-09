import Foundation
import AVFoundation
import AudioToolbox
import UIKit

/**
 * Port iOS della coda TTS nativa (companion di GeofenceBroadcastReceiver.kt):
 * coda sequenziale con priorità (itinerario > gemma > normale), stato teaser
 * persistito in UserDefaults con le stesse chiavi di Android, eventi
 * teaserStarted/teaserFinished verso il plugin. La voce è AVSpeechSynthesizer
 * (equivalente del TextToSpeech di sistema) e con la background mode "audio"
 * parla anche a schermo spento.
 */
final class SpeechQueue: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
    static let shared = SpeechQueue()

    // Stesse chiavi prefs di Android (GeofenceBroadcastReceiver.Companion)
    static let prefTeaserSpeaking = "teaser_speaking"
    static let prefTeaserSpeakingPoi = "teaser_speaking_poi"
    static let prefTeaserLastPoi = "teaser_last_poi"
    static let prefTeaserLastFinishedAt = "teaser_last_finished_at"

    struct SpeechItem {
        let text: String
        let isGem: Bool
        var isItinerary: Bool = false
        var poiId: String? = nil
        let priority: Int // 0 = itinerario, 1 = gemma, 2 = normale
        var kind: String = "arrival" // arrival | approach
        // MP3 prefetchato in cache locale (AudioPrefetchManager): se presente
        // e valido si riproduce quello (partenza istantanea, voce neurale)
        // invece del TTS; se fallisce si torna al TTS del campo text.
        var audioFile: String? = nil
    }

    private let synthesizer = AVSpeechSynthesizer()
    /// Player per gli MP3 prefetchati: vive nella stessa coda sequenziale del
    /// TTS, mai due voci insieme.
    private var audioPlayer: AVAudioPlayer?
    private var queue: [SpeechItem] = []
    private var isSpeaking = false
    private var activeItem: SpeechItem?
    private let prefs = UserDefaults.standard

    /// Callback eventi verso il plugin (teaserStarted/teaserFinished), stesso
    /// payload di broadcastTeaserEvent Android: {poiId, kind}.
    var onEvent: ((String, [String: Any]) -> Void)?
    /// Notifica di check-in itinerario a fine lettura (showCheckInNotification).
    var onItineraryFinished: ((String) -> Void)?

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    func enqueue(_ item: SpeechItem) {
        DispatchQueue.main.async {
            self.queue.append(item)
            self.processNext()
        }
    }

    /// Ferma subito la voce e svuota la coda (chiamato dal JS prima
    /// dell'audioguida completa: mai due voci sovrapposte).
    func stopSpeaking() {
        DispatchQueue.main.async {
            self.queue.removeAll()
            if let player = self.audioPlayer {
                // AVAudioPlayer.stop() non chiama il delegate: chiudiamo noi.
                player.stop()
                self.audioPlayer = nil
                self.finishActiveSpeech(notifyJs: true)
                self.deactivateAudioSessionIfIdle()
                return
            }
            if self.synthesizer.isSpeaking {
                self.synthesizer.stopSpeaking(at: .immediate)
                // Il delegate didCancel chiude lo stato; in sua assenza:
                self.finishActiveSpeech(notifyJs: true)
            } else {
                self.finishActiveSpeech(notifyJs: true)
            }
        }
    }

    /// Ferma SOLO la voce del POI indicato (superamento): via i suoi item
    /// dalla coda; se sta parlando proprio lui si interrompe e si prosegue
    /// con la coda. Le voci degli altri POI non si toccano — superare A
    /// mentre suona la guida di B non deve uccidere B. Lo stop globale resta
    /// per il plugin (audioguida completa in partenza dal JS).
    func stopSpeaking(poiId: String) {
        guard !poiId.isEmpty else { return }
        DispatchQueue.main.async {
            self.queue.removeAll { $0.poiId == poiId }
            guard self.activeItem?.poiId == poiId else { return }
            if let player = self.audioPlayer {
                // AVAudioPlayer.stop() non chiama il delegate: chiudiamo noi
                // e facciamo ripartire la coda per gli altri POI.
                player.stop()
                self.audioPlayer = nil
                self.finishActiveSpeech(notifyJs: true)
                self.processNext()
                self.deactivateAudioSessionIfIdle()
                return
            }
            if self.synthesizer.isSpeaking {
                // didCancel → onUtteranceFinished → processNext
                self.synthesizer.stopSpeaking(at: .immediate)
            } else {
                self.finishActiveSpeech(notifyJs: true)
                self.processNext()
                self.deactivateAudioSessionIfIdle()
            }
        }
    }

    private func processNext() {
        guard !isSpeaking else { return }
        guard prefs.bool(forKey: "isServiceActive") else {
            queue.removeAll()
            return
        }
        // Ordina per priorità (itinerario prima) come Android
        queue.sort {
            if $0.priority != $1.priority { return $0.priority < $1.priority }
            return $0.isItinerary && !$1.isItinerary
        }
        guard !queue.isEmpty else { return }
        let next = queue.removeFirst()
        isSpeaking = true
        activeItem = next

        activateAudioSession()

        // Chime di avviso prima della voce (equivalente del ringtone Android)
        AudioServicesPlaySystemSound(1007)

        prefs.set(true, forKey: Self.prefTeaserSpeaking)
        prefs.set(next.poiId ?? "", forKey: Self.prefTeaserSpeakingPoi)
        onEvent?("teaserStarted", ["poiId": next.poiId ?? "", "kind": next.kind])

        // MP3 prefetchato disponibile? Partenza istantanea senza TTS; su
        // qualunque errore si prosegue col TTS del testo qui sotto.
        if let path = next.audioFile,
           FileManager.default.fileExists(atPath: path),
           playMp3(path: path) {
            return
        }

        guard !next.text.isEmpty else {
            // Item solo-MP3 il cui file è fallito: chiudi e passa oltre,
            // mai coda bloccata.
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
            return
        }

        let utterance = AVSpeechUtterance(string: next.text)
        utterance.voice = Self.voiceForLanguage(prefs.string(forKey: "language") ?? "it")
        utterance.volume = 1.0
        synthesizer.speak(utterance)
    }

    /// Avvia la riproduzione dell'MP3 locale; true solo se è davvero partita.
    /// Un file che non parte viene eliminato (probabile download corrotto).
    private func playMp3(path: String) -> Bool {
        do {
            let player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
            player.delegate = self
            player.volume = 1.0
            if player.play() {
                audioPlayer = player
                return true
            }
            try? FileManager.default.removeItem(atPath: path)
            return false
        } catch {
            try? FileManager.default.removeItem(atPath: path)
            return false
        }
    }

    /// Il TTS deve duck-are la musica come un'istruzione di navigazione.
    private func activateAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true)
        } catch { }
    }

    private func deactivateAudioSessionIfIdle() {
        guard queue.isEmpty, !isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func finishActiveSpeech(notifyJs: Bool) {
        let item = activeItem
        activeItem = nil
        isSpeaking = false
        if let player = audioPlayer {
            player.stop()
            audioPlayer = nil
        }

        prefs.set(false, forKey: Self.prefTeaserSpeaking)
        prefs.set("", forKey: Self.prefTeaserSpeakingPoi)
        if let poiId = item?.poiId {
            prefs.set(poiId, forKey: Self.prefTeaserLastPoi)
            prefs.set(nowMs(), forKey: Self.prefTeaserLastFinishedAt)
        }

        if notifyJs, let item = item {
            onEvent?("teaserFinished", ["poiId": item.poiId ?? "", "kind": item.kind])
        }
    }

    private func onUtteranceFinished() {
        let finished = activeItem
        finishActiveSpeech(notifyJs: true)
        if finished?.isItinerary == true, let poiId = finished?.poiId {
            onItineraryFinished?(poiId)
        }
        processNext()
        deactivateAudioSessionIfIdle()
    }

    // MARK: - AVSpeechSynthesizerDelegate

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.onUtteranceFinished() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.onUtteranceFinished() }
    }

    // MARK: - AVAudioPlayerDelegate (MP3 prefetchati)

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            // Riproduzione interrotta a metà (decode error, focus perso):
            // rimetti in coda la versione solo-testo così il TTS fa da rete
            // di sicurezza — mai silenzio senza fallback.
            if !flag, let item = self.activeItem, !item.text.isEmpty {
                var fallback = item
                fallback.audioFile = nil
                self.queue.append(fallback)
            }
            self.onUtteranceFinished()
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async {
            if let item = self.activeItem, !item.text.isEmpty {
                var fallback = item
                fallback.audioFile = nil
                self.queue.append(fallback)
            }
            self.onUtteranceFinished()
        }
    }

    // MARK: - Voci

    /// Stessa mappa lingue di applyTtsConfig Android, con fallback inglese se
    /// la voce locale manca (meno straniante dell'italiano per utenti RU/ZH).
    static func voiceForLanguage(_ lang: String) -> AVSpeechSynthesisVoice? {
        let code: String
        switch lang {
        case "en": code = "en-US"
        case "fr": code = "fr-FR"
        case "es": code = "es-ES"
        case "de": code = "de-DE"
        case "ru": code = "ru-RU"
        case "zh": code = "zh-CN"
        default: code = "it-IT"
        }
        return AVSpeechSynthesisVoice(language: code)
            ?? AVSpeechSynthesisVoice(language: lang == "it" ? "it-IT" : "en-US")
    }

    /// checkOfflineTtsVoice: su iOS le voci AVSpeech sono sempre utilizzabili
    /// offline una volta presenti nel sistema.
    static func isVoiceAvailable(_ lang: String) -> Bool {
        voiceForLanguage(lang) != nil
    }
}
