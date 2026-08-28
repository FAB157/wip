import Foundation

/**
 * Port iOS di AudioPrefetchManager.kt: al PRIMO AVVISO (approach, raggio alert)
 * scarica in background l'MP3 dell'audioguida completa nella cache file locale,
 * così al trigger di arrivo la riproduzione parte istantanea (e resiste alla
 * perdita di rete nel frattempo).
 *
 * L'MP3 arriva dallo STESSO endpoint del player web/JS
 * (POST https://wip.guide/api/tts/smart {text, voice}): il server è
 * cache-first (bucket audio_cache, chiave voce+md5 del testo), quindi per i
 * testi già sintetizzati risponde con un redirect immediato.
 *
 * Regole: best-effort totale (nessun errore deve degradare il comportamento
 * attuale), pulizia dei file più vecchi di 24h, un solo download per
 * (poi, lingua) alla volta.
 */
enum AudioPrefetchManager {

    private static let ttsEndpoint = "\(WipApi.base)/api/tts/smart"
    private static let maxAgeSec: TimeInterval = 24 * 60 * 60
    // Un MP3 sotto ~1KB è un errore mascherato (il server stesso scarta <500B)
    private static let minValidBytes = 1000

    private static let lock = NSLock()
    private static var inFlight = Set<String>()

    private static var cacheDir: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("audio_prefetch", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    /// Personaggio normalizzato per la chiave cache: nicky/dante, altrimenti
    /// nicky (stessa regola di azureVoice: tutto ciò che non è "nicky" è la
    /// voce maschile, ma il nome file deve restare uno solo per voce).
    private static func normChar(_ character: String?) -> String {
        let c = (character ?? "nicky").lowercased()
        return c == "nicky" ? "nicky" : "dante"
    }

    /// (22/08/2026) Il file è {poi}_{lang}_{character}.mp3, come
    /// AudioPrefetchManager.kt: prima era {poi}_{lang} e cambiando
    /// personaggio nel profilo si riproduceva l'MP3 prefetchato con l'ALTRA
    /// voce finché non scadeva (24 h).
    private static func fileFor(poiId: String, lang: String, character: String?) -> URL {
        let raw = "\(poiId)_\(lang)_\(normChar(character))"
        let safe = String(raw.map { c -> Character in
            (c.isLetter || c.isNumber || c == "-" || c == "_") ? c : "_"
        })
        return cacheDir.appendingPathComponent("\(safe).mp3")
    }

    /// MP3 in cache pronto da riprodurre, oppure nil. I file scaduti (>24h)
    /// o troppo piccoli vengono eliminati al volo.
    static func cachedFile(poiId: String, lang: String, character: String? = nil) -> URL? {
        let url = fileFor(poiId: poiId, lang: lang, character: character)
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path) else { return nil }
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let modified = (attrs[.modificationDate] as? Date) ?? Date(timeIntervalSince1970: 0)
        if Date().timeIntervalSince(modified) > maxAgeSec || size < minValidBytes {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return url
    }

    /// Elimina i file più vecchi di 24h.
    static func cleanup() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: nil) else { return }
        for f in files {
            if let attrs = try? fm.attributesOfItem(atPath: f.path),
               let modified = attrs[.modificationDate] as? Date,
               Date().timeIntervalSince(modified) > maxAgeSec {
                try? fm.removeItem(at: f)
            }
        }
    }

    /// Prefetch fire-and-forget (chiamato all'approach): mai errori al chiamante.
    static func prefetch(poiId: String, lang: String, character: String?, text: String?) {
        guard let text = text, !text.isEmpty else { return }
        DispatchQueue.global(qos: .utility).async { cleanup() }
        download(poiId: poiId, lang: lang, character: character, text: text) { _ in }
    }

    /**
     * Download dell'MP3 (gradino "MP3 scaricabile" della catena al trigger,
     * oltre che motore del prefetch). Completion (su thread di URLSession)
     * con l'URL del file locale, o nil su qualunque errore.
     */
    static func download(
        poiId: String,
        lang: String,
        character: String?,
        text: String,
        timeout: TimeInterval = 90,
        completion: @escaping (URL?) -> Void
    ) {
        if let cached = cachedFile(poiId: poiId, lang: lang, character: character) {
            completion(cached)
            return
        }
        let key = "\(poiId)_\(lang)_\(normChar(character))"
        lock.lock()
        if inFlight.contains(key) {
            lock.unlock()
            completion(nil)
            return
        }
        inFlight.insert(key)
        lock.unlock()

        let finish: (URL?) -> Void = { result in
            lock.lock(); inFlight.remove(key); lock.unlock()
            completion(result)
        }

        guard let url = URL(string: ttsEndpoint),
              let body = try? JSONSerialization.data(withJSONObject: [
                  "text": text,
                  "voice": azureVoice(lang: lang, character: character)
              ]) else {
            finish(nil)
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = timeout
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        // TOKEN UTENTE (28/08/2026). Il server esige il Bearer per le SINTESI
        // NUOVE su /api/tts/smart (il colpo di cache resta pubblico): senza,
        // un testo mai sintetizzato risponde 401 e qui si ripiegava sul TTS
        // di sistema senza che nessuno lo volesse. Stesso accessor di
        // WipSupabaseClient.fetchAudioguide; se il token manca la richiesta
        // parte identica a prima (cache pubblica → MP3, altrimenti nil).
        if let token = SecureSessionStore.get(ListeningHistoryStore.prefAccessToken), !token.isEmpty {
            req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = body

        URLSession.shared.dataTask(with: req) { data, response, _ in
            // 401 (token assente/scaduto) e 402 (nessun diritto alla sintesi)
            // degradano IN SILENZIO al TTS di sistema: nil come ogni altro
            // errore, nessun log — al trigger sarebbe uno per POI.
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data = data, data.count >= minValidBytes else {
                finish(nil)
                return
            }
            let dest = fileFor(poiId: poiId, lang: lang, character: character)
            do {
                try data.write(to: dest, options: .atomic)
                finish(dest)
            } catch {
                finish(nil)
            }
        }.resume()
    }

    /**
     * Stessa mappa voce di src/services/ttsService.ts::azureVoiceName (e di
     * AudioPrefetchManager.kt) — DEVE restare allineata, altrimenti la chiave
     * cache del server non coincide con quella del player web.
     * guideDefault "nicky" = voce femminile.
     */
    static func azureVoice(lang: String, character: String?) -> String {
        let female = (character ?? "nicky") == "nicky"
        switch lang.lowercased() {
        case "en": return female ? "en-US-JennyNeural" : "en-US-GuyNeural"
        case "fr": return female ? "fr-FR-DeniseNeural" : "fr-FR-HenriNeural"
        case "es": return female ? "es-ES-ElviraNeural" : "es-ES-AlvaroNeural"
        case "de": return female ? "de-DE-KatjaNeural" : "de-DE-ConradNeural"
        case "ru": return female ? "ru-RU-SvetlanaNeural" : "ru-RU-DmitryNeural"
        case "zh": return female ? "zh-CN-XiaoxiaoNeural" : "zh-CN-YunxiNeural"
        default: return female ? "it-IT-ElsaNeural" : "it-IT-DiegoNeural"
        }
    }
}
