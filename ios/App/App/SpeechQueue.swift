import Foundation
import AVFoundation
import AudioToolbox
import UIKit
import UserNotifications

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
    /// True tra un .began e il successivo .ended di un'interruzione audio
    /// (chiamata in arrivo, altra app che ruba la sessione…) mentre un item
    /// era in corso: dice a handleInterruptionEnded se c'è qualcosa da
    /// riprendere.
    private var pausedForInterruption = false
    /// Rete di sicurezza: se isSpeaking resta true oltre il timeout senza
    /// che il delegate di completamento scatti (interruzione gestita male dal
    /// sistema, item anomalo…) sblocchiamo comunque la coda invece di restare
    /// mute per sempre.
    /// (22/08/2026) Non più fisso a 45 s: tagliava a metà le audioguide
    /// COMPLETE (3-4 min) del Day Pass e di ogni fallback TTS senza MP3.
    /// Come Receiver.kt: TTS = 8 s + 120 ms per carattere, MP3 = durata + 15 s,
    /// entrambi col tetto di 15 min. Il teaser (~200 char) resta ben sotto.
    private static let watchdogMaxS: TimeInterval = 15 * 60
    private static func watchdogTimeout(forTextLength length: Int) -> TimeInterval {
        min(8.0 + Double(length) * 0.120, watchdogMaxS)
    }
    private static func watchdogTimeout(forMp3Duration duration: TimeInterval) -> TimeInterval {
        min(max(duration + 15.0, 15.0), watchdogMaxS)
    }
    /// Timeout armato per l'item corrente (per il log del watchdog e per
    /// ri-armare con lo stesso valore dopo un'interruzione).
    private var currentWatchdogS: TimeInterval = 45
    private var watchdogTimer: Timer?

    /// Callback eventi verso il plugin (teaserStarted/teaserFinished), stesso
    /// payload di broadcastTeaserEvent Android: {poiId, kind}.
    var onEvent: ((String, [String: Any]) -> Void)?
    /// Notifica di check-in itinerario a fine lettura (showCheckInNotification).
    var onItineraryFinished: ((String) -> Void)?

    private override init() {
        super.init()
        synthesizer.delegate = self
        // Senza questo observer un'interruzione (chiamata in arrivo, altra app
        // che attiva la sessione audio…) sospende TTS/MP3 a livello di sistema
        // ma AVSpeechSynthesizer/AVAudioPlayer non sparano mai un delegate di
        // completamento: isSpeaking restava bloccato a true per sempre e la
        // coda si fermava. Stesso pattern di WipBackgroundAudioPlugin.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        // Cambio di uscita audio. Serve SOLO a riprendere quando un
        // dispositivo torna disponibile dopo una vera interruzione: staccare
        // gli auricolari NON mette in pausa, si continua dall'altoparlante
        // (decisione dell'utente, 23/08/2026 — vedi handleRouteChange).
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        watchdogTimer?.invalidate()
    }

    /// Tetto della coda. In zona densa — un centro storico, un fix ogni pochi
    /// metri — arrivavano più teaser di quanti se ne potessero leggere, e i
    /// delegate di errore (MP3 che non parte, decode fallito) ne riaccodavano
    /// altri: la coda cresceva senza limite e si finiva per sentire il POI di
    /// venti minuti prima mentre se ne aveva un altro davanti. Otto elementi
    /// sono già più di quanto una persona ascolti prima di essersi spostata.
    private static let maxCoda = 8

    func enqueue(_ item: SpeechItem) {
        DispatchQueue.main.async {
            self.queue.append(item)
            self.potaCoda()
            self.processNext()
        }
    }

    /// Sfratta i MENO prioritari finché la coda rientra nel tetto: prima i
    /// POI normali, poi le gemme, per ultime le tappe dell'itinerario (che
    /// l'utente ha scelto). A parità di priorità esce il più VECCHIO: è
    /// quello che con ogni probabilità si è già lasciato alle spalle.
    private func potaCoda() {
        while queue.count > Self.maxCoda {
            var peggiore = 0
            // Il confronto stretto tiene il primo indice a parità: fra due
            // elementi ugualmente importanti esce quello entrato prima.
            for i in queue.indices where queue[i].priority > queue[peggiore].priority {
                peggiore = i
            }
            queue.remove(at: peggiore)
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
            if self.synthesizer.isSpeaking || self.synthesizer.isPaused {
                // Il delegate didCancel chiude lo stato (finishActiveSpeech +
                // processNext): chiamarla anche qui produceva un doppio
                // teaserFinished e, se nel frattempo partiva un altro item,
                // chiudeva quello sbagliato. Stessa disciplina del watchdog.
                self.synthesizer.stopSpeaking(at: .immediate)
            } else {
                self.finishActiveSpeech(notifyJs: true)
                self.deactivateAudioSessionIfIdle()
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
            // MP3: durata reale + 15 s (tetto 15 min), come Receiver.kt
            armWatchdog(seconds: Self.watchdogTimeout(forMp3Duration: audioPlayer?.duration ?? 0))
            return
        }

        let spokenText = Self.speakableText(next.text)
        guard !spokenText.isEmpty else {
            // Item solo-MP3 il cui file è fallito (o testo solo-emoji):
            // chiudi e passa oltre, mai coda bloccata.
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
            return
        }

        // LA VOCE C'È DAVVERO? (23/08/2026). `voiceForLanguage` ha un ripiego
        // su en-US (o it-IT): senza voce della lingua dell'utente parlava
        // comunque, con la pronuncia sbagliata su un testo in un'altra lingua —
        // e nessuno lo diceva. Prima si verifica per davvero, e se manca si
        // avvisa invece di leggere a caso. Android fa lo stesso in
        // GeofenceBroadcastReceiver.applyTtsConfig/processNextSpeech.
        let userLang = prefs.string(forKey: "language") ?? "it"
        guard let voice = Self.installedVoice(for: userLang) else {
            notifyVoiceMissing(lang: userLang)
            onEvent?("listenFailed", [
                "poiId": next.poiId ?? "",
                "kind": next.kind,
                "reason": "voice_not_installed"
            ])
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
            return
        }

        let utterance = AVSpeechUtterance(string: spokenText)
        // Il timbro (Nicky/Dante) resta scelto da voiceForLanguage; si accetta
        // però solo se è davvero della lingua dell'utente — quella funzione ha
        // dentro un ripiego su en-US che qui non deve più passare.
        let scelta = Self.voiceForLanguage(
            userLang,
            character: prefs.string(forKey: "guideCharacter")
        )
        let prefisso = String(Self.regionalCode(for: userLang).prefix(2))
        utterance.voice = (scelta?.language.hasPrefix(prefisso) == true) ? scelta : voice
        utterance.volume = 1.0
        synthesizer.speak(utterance)
        // TTS: 8 s + 120 ms per carattere (tetto 15 min), come Receiver.kt
        armWatchdog(seconds: Self.watchdogTimeout(forTextLength: spokenText.count))
    }

    /// Toglie emoji e pittogrammi dal testo da leggere: AVSpeechSynthesizer
    /// li pronuncia per nome ("💎" → "pietra preziosa"). Cifre e simboli
    /// ASCII (che Unicode marca comunque isEmoji) restano intatti.
    static func speakableText(_ text: String) -> String {
        let filtered = text.unicodeScalars.filter { s in
            if s.value == 0xFE0F || s.value == 0x200D { return false } // variation selector, ZWJ
            if s.properties.isEmojiPresentation { return false }
            if s.properties.isEmoji && s.value >= 0x1F000 { return false }
            return true
        }
        return String(String.UnicodeScalarView(filtered))
            .trimmingCharacters(in: .whitespaces)
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
        } catch {
            print("[SpeechQueue] attivazione AVAudioSession fallita: \(error.localizedDescription)")
        }
    }

    private func deactivateAudioSessionIfIdle() {
        guard queue.isEmpty, !isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Interruzioni audio (chiamate in arrivo, altra app che ruba la
    // sessione…) e watchdog di sicurezza

    /// Stesso pattern di WipBackgroundAudioPlugin.handleInterruption: .began
    /// mette in pausa in modo pulito (mai isSpeaking bloccato a true), .ended
    /// riprende se il sistema lo consente o chiude l'item e passa oltre.
    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        DispatchQueue.main.async {
            if type == .began {
                self.handleInterruptionBegan()
            } else if type == .ended {
                let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                self.handleInterruptionEnded(shouldResume: options.contains(.shouldResume))
            }
        }
    }

    /// Cambio di uscita audio (auricolari sfilati, Bluetooth spento, dock
    /// tolto). Il sistema dirotta l'audio sullo SPEAKER e non manda nessuna
    /// interruzione.
    ///
    /// DECISIONE DI PRODOTTO (utente, 23/08/2026): **si continua a parlare
    /// dall'altoparlante**, non si mette in pausa. Le linee guida Apple
    /// suggeriscono la pausa — nasce dal lettore musicale, dove l'audio è
    /// privato e continuare in metropolitana e' imbarazzante — ma qui l'audio
    /// E' la funzione: chi cammina davanti a una chiesa col telefono in mano e
    /// senza auricolari deve sentire il racconto, non trovare una guida muta
    /// che aspetta un tocco che nessuno sa di dover dare. Senza cuffie
    /// l'altoparlante e' l'uscita normale, non un ripiego.
    ///
    /// La versione precedente (pausa + watchdog riarmato) e' stata tolta di
    /// proposito: si limita a NON interferire, e la riproduzione prosegue
    /// esattamente dove era. Chi non vuole farsi sentire ha gia' la modalita'
    /// silenziosa, che e' una scelta esplicita e non un effetto collaterale.
    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }

        DispatchQueue.main.async {
            switch reason {
            case .newDeviceAvailable:
                // Gli auricolari (ri)collegati: si riprende solo se eravamo in
                // pausa per una vera interruzione (telefonata, Siri), mai per
                // un cambio di uscita — che ormai non mette piu' in pausa.
                guard self.pausedForInterruption else { return }
                self.handleInterruptionEnded(shouldResume: true)
            default:
                // `.oldDeviceUnavailable` compreso: si prosegue sullo speaker.
                return
            }
        }
    }

    private func handleInterruptionBegan() {
        guard isSpeaking else { return }
        // Niente watchdog durante l'interruzione: una chiamata può durare ben
        // più di watchdogTimeoutS e non è un item bloccato, è in pausa legittima.
        cancelWatchdog()
        if synthesizer.isSpeaking {
            synthesizer.pauseSpeaking(at: .word)
        }
        audioPlayer?.pause()
        pausedForInterruption = true
    }

    private func handleInterruptionEnded(shouldResume: Bool) {
        guard pausedForInterruption else { return }
        pausedForInterruption = false
        guard isSpeaking else { return }
        guard shouldResume else {
            // Il sistema non garantisce la ripresa (es. priorità andata a
            // un'altra app): chiudi l'item corrente in modo pulito e prosegui
            // con la coda, mai bloccata in attesa di un resume che non arriva.
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
            return
        }
        activateAudioSession()
        if synthesizer.isPaused {
            synthesizer.continueSpeaking()
            armWatchdog()
        } else if let player = audioPlayer {
            player.play()
            armWatchdog()
        } else {
            // Nulla da riprendere (concluso nel frattempo): libera la coda.
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
        }
    }

    /// Arma il watchdog; senza `seconds` ri-usa il timeout dell'item corrente
    /// (ripresa dopo un'interruzione).
    private func armWatchdog(seconds: TimeInterval? = nil) {
        if let s = seconds { currentWatchdogS = s }
        let timeout = currentWatchdogS
        watchdogTimer?.invalidate()
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.handleWatchdogTimeout()
        }
    }

    private func cancelWatchdog() {
        watchdogTimer?.invalidate()
        watchdogTimer = nil
    }

    /// Se il delegate di completamento (TTS o MP3) non scatta entro il
    /// timeout dell'item — interruzione gestita male dal sistema, item
    /// anomalo… — sblocca comunque la coda invece di restare mute a
    /// oltranza. Stessa disciplina di stopSpeaking: se il synth sta ancora
    /// "parlando" (o in pausa) lo fermiamo e lasciamo che didCancel chiuda lo
    /// stato, invece di chiamare finishActiveSpeech due volte sull'item
    /// sbagliato.
    private func handleWatchdogTimeout() {
        guard isSpeaking else { return }
        print("[SpeechQueue] watchdog: nessun completamento entro \(Int(currentWatchdogS))s, sblocco la coda")
        pausedForInterruption = false
        if let player = audioPlayer {
            // AVAudioPlayer.stop() non chiama il delegate: chiudiamo noi.
            player.stop()
            audioPlayer = nil
            finishActiveSpeech(notifyJs: true)
            processNext()
            deactivateAudioSessionIfIdle()
            return
        }
        if synthesizer.isSpeaking || synthesizer.isPaused {
            // didCancel chiuderà lo stato e farà ripartire la coda.
            synthesizer.stopSpeaking(at: .immediate)
            return
        }
        // Nessun motore attivo ma isSpeaking risultava true (stato incoerente):
        // sblocca comunque.
        finishActiveSpeech(notifyJs: true)
        processNext()
        deactivateAudioSessionIfIdle()
    }

    private func finishActiveSpeech(notifyJs: Bool) {
        cancelWatchdog()
        pausedForInterruption = false
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
                self.potaCoda()
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
                self.potaCoda()
            }
            self.onUtteranceFinished()
        }
    }

    // MARK: - Voci

    /// Mappa lingua dell'app → codice regionale della voce. Unico punto di
    /// verità: la usano voiceForLanguage e il controllo di disponibilità, che
    /// devono parlare della stessa voce (equivalente di
    /// GeofenceBroadcastReceiver.localeForLang su Android).
    static func regionalCode(for lang: String) -> String {
        switch lang {
        case "en": return "en-US"
        case "fr": return "fr-FR"
        case "es": return "es-ES"
        case "de": return "de-DE"
        case "ru": return "ru-RU"
        case "zh": return "zh-CN"
        default: return "it-IT"
        }
    }

    /// Stessa mappa lingue di applyTtsConfig Android, con fallback inglese se
    /// la voce locale manca (meno straniante dell'italiano per utenti RU/ZH).
    /// ATTENZIONE: quel ripiego è per i casi in cui parlare comunque è meglio
    /// che tacere (una frase di servizio); per l'audioguida passare SEMPRE da
    /// `installedVoice(for:)`, che dice la verità invece di cambiare lingua.
    static func voiceForLanguage(_ lang: String, character: String? = nil) -> AVSpeechSynthesisVoice? {
        let code = regionalCode(for: lang)

        // Il genere della voce di sistema segue il personaggio, come già fa
        // l'MP3 neurale (AudioPrefetchManager.azureVoice: Nicky femminile,
        // Dante maschile in tutte e sette le lingue). Prima si chiedeva solo
        // la lingua e iOS restituiva la sua voce di default (femminile): con
        // Dante scelto, il teaser e il ripiego offline cambiavano sesso.
        if let character = character, character == "nicky" || character == "dante" {
            let wanted: AVSpeechSynthesisVoiceGender = character == "dante" ? .male : .female
            let prefix = String(code.prefix(2))
            let byGender = AVSpeechSynthesisVoice.speechVoices().filter {
                $0.language.hasPrefix(prefix) && $0.gender == wanted
            }
            // Voce della variante regionale esatta se c'è, altrimenti una
            // qualsiasi della stessa lingua col genere giusto.
            if let exact = byGender.first(where: { $0.language == code }) ?? byGender.first {
                return exact
            }
        }

        return AVSpeechSynthesisVoice(language: code)
            ?? AVSpeechSynthesisVoice(language: lang == "it" ? "it-IT" : "en-US")
    }

    /// LA VOCE DI QUESTA LINGUA È INSTALLATA SUL TELEFONO? (23/08/2026)
    ///
    /// `AVSpeechSynthesisVoice(language:)` non basta come controllo, perché il
    /// chiamante storico ci appiccicava dietro un `?? en-US`: rispondeva
    /// sempre di sì, e a un utente tedesco senza voce tedesca l'audioguida
    /// veniva letta in inglese. Qui si guarda l'elenco vero delle voci
    /// installate e si accetta solo un vero corrispondente di lingua (prefisso:
    /// de-AT va benissimo per un utente "de").
    ///
    /// Su iOS non esiste l'equivalente esatto di `isNetworkConnectionRequired`
    /// di Android: le voci elencate da `speechVoices()` sono installate sul
    /// dispositivo e sintetizzano in locale. Le voci "enhanced/premium" e la
    /// Personal Voice si scaricano dalle impostazioni, ma una volta scaricate
    /// compaiono qui e funzionano senza rete. Il controllo di presenza è quindi
    /// il massimo che il sistema consenta — ed è già molto più di quanto si
    /// facesse prima, cioè niente.
    static func installedVoice(for lang: String) -> AVSpeechSynthesisVoice? {
        let prefix = String(regionalCode(for: lang).prefix(2))
        let installate = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(prefix) }
        guard !installate.isEmpty else { return nil }
        // Variante regionale esatta se c'è, altrimenti una qualunque della
        // stessa lingua.
        let code = regionalCode(for: lang)
        return installate.first(where: { $0.language == code }) ?? installate.first
    }

    /// checkOfflineTtsVoice: su iOS le voci AVSpeech sono sempre utilizzabili
    /// offline una volta presenti nel sistema. Ora però la domanda è posta
    /// sull'elenco delle voci installate, non sul costruttore col ripiego.
    static func isVoiceAvailable(_ lang: String) -> Bool {
        installedVoice(for: lang) != nil
    }

    /// Ultima notifica "voce non installata": una ogni 10 minuti, non una per
    /// POI (in centro storico sarebbero decine). Stesso throttle di Android.
    private static var ultimoAvvisoVoce: Date?

    /// La verità al posto del silenzio: l'utente sta camminando e non guarda lo
    /// schermo, quindi l'unico modo di dirglielo è una notifica. Il testo
    /// spiega dove si installano le voci: su iOS non esiste un URL che apra
    /// direttamente Impostazioni ▸ Accessibilità ▸ Contenuto pronunciato, e
    /// mandare l'utente su una schermata sbagliata sarebbe peggio che dargli
    /// il percorso scritto.
    private func notifyVoiceMissing(lang: String) {
        let now = Date()
        if let ultimo = Self.ultimoAvvisoVoce, now.timeIntervalSince(ultimo) < 600 { return }
        Self.ultimoAvvisoVoce = now

        let content = UNMutableNotificationContent()
        content.title = NotificationStrings.listenFailedTitle(lang)
        content.body = NotificationStrings.listenFailedBody(
            lang, reason: "voice_not_installed",
            name: NotificationStrings.thisPlace(lang)
        )
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: "voice_missing_\(lang)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }
}
