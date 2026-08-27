import Foundation

/**
 * Testi delle notifiche native (arrivo, teaser radar, gemme, check-in,
 * esito del tasto ▶ Ascolta) nella lingua persistita dall'utente.
 *
 * (22/08/2026) Prima erano tutte in italiano fisso: un utente inglese
 * sentiva la voce in inglese e leggeva "Sei arrivato a …" sulla lock screen.
 * (23/08/2026) Ci sono tutte e SETTE le lingue dell'app: russo e cinese
 * cadevano sull'inglese, quindi un utente RU/ZH sentiva il teaser nella sua
 * lingua e leggeva la notifica in inglese — la stessa smentita che questa
 * tabella era nata per togliere. Le frasi PARLATE restano in
 * BackgroundPoiManager: qui solo ciò che si legge.
 */
enum NotificationStrings {

    /// Lingua normalizzata: le sette dell'app; tutto il resto → en.
    private static func norm(_ lang: String) -> String {
        switch lang.lowercased() {
        case "it", "en", "fr", "es", "de", "ru", "zh": return lang.lowercased()
        default: return "en"
        }
    }

    private static func pick(_ lang: String, _ table: [String: String]) -> String {
        let l = norm(lang)
        return table[l] ?? table["en"] ?? table["it"] ?? ""
    }

    // MARK: - Arrivo

    /// "Sei arrivato a X"
    static func arrivedTitle(_ lang: String, name: String) -> String {
        pick(lang, [
            "it": "Sei arrivato a \(name)",
            "en": "You arrived at \(name)",
            "fr": "Vous êtes arrivé à \(name)",
            "es": "Has llegado a \(name)",
            "de": "Sie sind bei \(name) angekommen",
            "ru": "Вы прибыли: \(name)",
            "zh": "您已到达\(name)"
        ])
    }

    /// Body in modalità silenziosa: teaser + istruzione per l'azione Ascolta.
    static func silentArrivalHint(_ lang: String) -> String {
        pick(lang, [
            "it": "▶ Tieni premuto e scegli Ascolta per la guida audio.",
            "en": "▶ Press and hold, then choose Listen for the audio guide.",
            "fr": "▶ Maintenez appuyé et choisissez Écouter pour l'audioguide.",
            "es": "▶ Mantén pulsado y elige Escuchar para la audioguía.",
            "de": "▶ Gedrückt halten und Anhören wählen für den Audioguide.",
            "ru": "▶ Нажмите и удерживайте, затем выберите «Слушать» для аудиогида.",
            "zh": "▶ 长按并选择「收听」以播放语音导览。"
        ])
    }

    /// Nulla da riprodurre: invito ad usare l'azione Ascolta.
    static func listenHintNoAutoplay(_ lang: String) -> String {
        pick(lang, [
            "it": "Tieni premuto e scegli ▶ Ascolta: la guida parte senza sbloccare il telefono",
            "en": "Press and hold and choose ▶ Listen: the guide starts without unlocking your phone",
            "fr": "Maintenez appuyé et choisissez ▶ Écouter : le guide démarre sans déverrouiller",
            "es": "Mantén pulsado y elige ▶ Escuchar: la guía empieza sin desbloquear el teléfono",
            "de": "Gedrückt halten und ▶ Anhören wählen: der Guide startet ohne Entsperren",
            "ru": "Нажмите и удерживайте, выберите ▶ «Слушать»: гид начнётся без разблокировки",
            "zh": "长按并选择 ▶「收听」：无需解锁手机即可开始导览"
        ])
    }

    static func guidePlaying(_ lang: String) -> String {
        pick(lang, [
            "it": "Audioguida in riproduzione",
            "en": "Audio guide playing",
            "fr": "Audioguide en cours",
            "es": "Audioguía en reproducción",
            "de": "Audioguide läuft",
            "ru": "Аудиогид воспроизводится",
            "zh": "语音导览播放中"
        ])
    }

    static func cardReadyInApp(_ lang: String) -> String {
        pick(lang, [
            "it": "La scheda del luogo è pronta nell'app",
            "en": "The place card is ready in the app",
            "fr": "La fiche du lieu est prête dans l'application",
            "es": "La ficha del lugar está lista en la app",
            "de": "Die Ortskarte ist in der App bereit",
            "ru": "Карточка места готова в приложении",
            "zh": "地点卡片已在应用中准备好"
        ])
    }

    /// Prezzo dichiarato sulla notifica (per-listen).
    static func listenWithCost(_ lang: String, cost: Int) -> String {
        pick(lang, [
            "it": "Tieni premuto → ▶ Ascolta: \(cost) crediti e la guida parte senza sbloccare",
            "en": "Press and hold → ▶ Listen: \(cost) credits and the guide starts without unlocking",
            "fr": "Maintenez appuyé → ▶ Écouter : \(cost) crédits et le guide démarre sans déverrouiller",
            "es": "Mantén pulsado → ▶ Escuchar: \(cost) créditos y la guía empieza sin desbloquear",
            "de": "Gedrückt halten → ▶ Anhören: \(cost) Credits, der Guide startet ohne Entsperren",
            "ru": "Нажмите и удерживайте → ▶ «Слушать»: \(cost) кредитов, гид начнётся без разблокировки",
            "zh": "长按 → ▶「收听」：\(cost) 点数，无需解锁即可开始"
        ])
    }

    // MARK: - Avvicinamento

    static func itineraryStopTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "📍 Tappa Itinerario",
            "en": "📍 Itinerary stop",
            "fr": "📍 Étape de l'itinéraire",
            "es": "📍 Parada del itinerario",
            "de": "📍 Etappe der Route",
            "ru": "📍 Этап маршрута",
            "zh": "📍 行程站点"
        ])
    }

    static func explorationTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "Esplorazione",
            "en": "Exploring",
            "fr": "Exploration",
            "es": "Exploración",
            "de": "Erkundung",
            "ru": "Исследование",
            "zh": "探索中"
        ])
    }

    /// "A circa N m."
    static func aboutMeters(_ lang: String, meters: Int) -> String {
        pick(lang, [
            "it": "A circa \(meters) m.",
            "en": "About \(meters) m away.",
            "fr": "À environ \(meters) m.",
            "es": "A unos \(meters) m.",
            "de": "Etwa \(meters) m entfernt.",
            "ru": "Примерно \(meters) м.",
            "zh": "距离约 \(meters) 米。"
        ])
    }

    static func tapToListen(_ lang: String) -> String {
        pick(lang, [
            "it": "Tocca per ascoltare.",
            "en": "Tap to listen.",
            "fr": "Touchez pour écouter.",
            "es": "Toca para escuchar.",
            "de": "Tippen zum Anhören.",
            "ru": "Нажмите, чтобы послушать.",
            "zh": "点击收听。"
        ])
    }

    // MARK: - Teaser radar / gemme / check-in

    /// "X • 300m da te"
    static func teaserTitle(_ lang: String, name: String, meters: Int) -> String {
        pick(lang, [
            "it": "📍 \(name) • \(meters)m da te",
            "en": "📍 \(name) • \(meters)m from you",
            "fr": "📍 \(name) • à \(meters)m",
            "es": "📍 \(name) • a \(meters)m",
            "de": "📍 \(name) • \(meters)m entfernt",
            "ru": "📍 \(name) • \(meters) м от вас",
            "zh": "📍 \(name) • 距您 \(meters) 米"
        ])
    }

    static func gemTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "💎 Nuova Gemma Scoperta!",
            "en": "💎 New gem discovered!",
            "fr": "💎 Nouvelle gemme découverte !",
            "es": "💎 ¡Nueva gema descubierta!",
            "de": "💎 Neues Juwel entdeckt!",
            "ru": "💎 Найдена новая жемчужина!",
            "zh": "💎 发现新宝藏！"
        ])
    }

    static func gemBody(_ lang: String, name: String) -> String {
        pick(lang, [
            "it": "\(name) è nelle vicinanze. Scoprila ora.",
            "en": "\(name) is nearby. Discover it now.",
            "fr": "\(name) est tout près. Découvrez-la maintenant.",
            "es": "\(name) está cerca. Descúbrela ahora.",
            "de": "\(name) ist ganz in der Nähe. Jetzt entdecken.",
            "ru": "\(name) совсем рядом. Откройте прямо сейчас.",
            "zh": "\(name) 就在附近，马上去看看。"
        ])
    }

    static func checkInTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "Tappa completata! ✅",
            "en": "Stop completed! ✅",
            "fr": "Étape terminée ! ✅",
            "es": "¡Parada completada! ✅",
            "de": "Etappe geschafft! ✅",
            "ru": "Этап пройден! ✅",
            "zh": "行程点已完成！✅"
        ])
    }

    static func checkInBody(_ lang: String) -> String {
        pick(lang, [
            "it": "Vuoi passare alla prossima destinazione?",
            "en": "Ready for the next destination?",
            "fr": "Passer à la prochaine destination ?",
            "es": "¿Pasamos al siguiente destino?",
            "de": "Weiter zum nächsten Ziel?",
            "ru": "Перейти к следующему пункту?",
            "zh": "前往下一个目的地？"
        ])
    }

    // MARK: - Esito del tasto ▶ Ascolta

    static func audioguideFallbackTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "Audioguida",
            "en": "Audio guide",
            "fr": "Audioguide",
            "es": "Audioguía",
            "de": "Audioguide",
            "ru": "Аудиогид",
            "zh": "语音导览"
        ])
    }

    static func receiptDayPass(_ lang: String, remaining: Int, cap: Int) -> String {
        pick(lang, [
            "it": "Audioguida in riproduzione · 🎫 Pass: \(remaining)/\(cap) rimaste",
            "en": "Audio guide playing · 🎫 Pass: \(remaining)/\(cap) left",
            "fr": "Audioguide en cours · 🎫 Pass : \(remaining)/\(cap) restants",
            "es": "Audioguía en reproducción · 🎫 Pase: \(remaining)/\(cap) restantes",
            "de": "Audioguide läuft · 🎫 Pass: \(remaining)/\(cap) übrig",
            "ru": "Аудиогид воспроизводится · 🎫 Пропуск: осталось \(remaining)/\(cap)",
            "zh": "语音导览播放中 · 🎫 通行证：剩余 \(remaining)/\(cap)"
        ])
    }

    static func receiptPerListen(_ lang: String, cost: Int, remaining: Int) -> String {
        pick(lang, [
            "it": "Audioguida in riproduzione · \(cost) crediti usati, saldo \(remaining)",
            "en": "Audio guide playing · \(cost) credits used, balance \(remaining)",
            "fr": "Audioguide en cours · \(cost) crédits utilisés, solde \(remaining)",
            "es": "Audioguía en reproducción · \(cost) créditos usados, saldo \(remaining)",
            "de": "Audioguide läuft · \(cost) Credits verbraucht, Guthaben \(remaining)",
            "ru": "Аудиогид воспроизводится · списано \(cost) кредитов, баланс \(remaining)",
            "zh": "语音导览播放中 · 已使用 \(cost) 点数，余额 \(remaining)"
        ])
    }

    static func receiptPurchased(_ lang: String) -> String {
        pick(lang, [
            "it": "Audioguida in riproduzione · già tua, nessun addebito",
            "en": "Audio guide playing · already yours, no charge",
            "fr": "Audioguide en cours · déjà à vous, aucun débit",
            "es": "Audioguía en reproducción · ya es tuya, sin cargo",
            "de": "Audioguide läuft · gehört dir schon, keine Abbuchung",
            "ru": "Аудиогид воспроизводится · уже ваш, без списания",
            "zh": "语音导览播放中 · 已购买，不再扣费"
        ])
    }

    static func listenFailedTitle(_ lang: String) -> String {
        pick(lang, [
            "it": "Audioguida non avviata",
            "en": "Audio guide not started",
            "fr": "Audioguide non lancé",
            "es": "Audioguía no iniciada",
            "de": "Audioguide nicht gestartet",
            "ru": "Аудиогид не запущен",
            "zh": "语音导览未启动"
        ])
    }

    /// Nome di riserva quando il POI non è noto ("questo luogo").
    static func thisPlace(_ lang: String) -> String {
        pick(lang, [
            "it": "questo luogo",
            "en": "this place",
            "fr": "ce lieu",
            "es": "este lugar",
            "de": "diesen Ort",
            "ru": "это место",
            "zh": "这个地点"
        ])
    }

    static func listenFailedBody(_ lang: String, reason: String, name: String) -> String {
        switch reason {
        case "insufficient_credits":
            return pick(lang, [
                "it": "Crediti esauriti: apri l'app per ricaricare e ascoltare \(name).",
                "en": "Out of credits: open the app to top up and listen to \(name).",
                "fr": "Crédits épuisés : ouvrez l'application pour recharger et écouter \(name).",
                "es": "Sin créditos: abre la app para recargar y escuchar \(name).",
                "de": "Keine Credits mehr: App öffnen, aufladen und \(name) anhören.",
                "ru": "Кредиты закончились: откройте приложение, пополните счёт и послушайте \(name).",
                "zh": "点数已用完：打开应用充值后即可收听\(name)。"
            ])
        case "offline_no_text":
            return pick(lang, [
                "it": "Audioguida di \(name) non disponibile offline. Riprova quando torna la rete.",
                "en": "The audio guide for \(name) is not available offline. Try again when you're back online.",
                "fr": "Audioguide de \(name) indisponible hors ligne. Réessayez avec le réseau.",
                "es": "Audioguía de \(name) no disponible sin conexión. Inténtalo cuando vuelva la red.",
                "de": "Audioguide für \(name) offline nicht verfügbar. Mit Netz erneut versuchen.",
                "ru": "Аудиогид для \(name) недоступен офлайн. Повторите, когда появится сеть.",
                "zh": "\(name)的语音导览无法离线使用。恢复网络后请重试。"
            ])
        // (23/08/2026) LA VOCE NON C'È. Prima si ripiegava in silenzio su
        // un'altra lingua — l'audioguida tedesca letta in inglese — e l'utente
        // poteva solo concludere che l'app fosse rotta. Il testo dice cosa
        // manca e dove si installa: su iOS non c'è un URL che apra quella
        // schermata, quindi il percorso va scritto.
        case "voice_not_installed":
            return pick(lang, [
                "it": "La voce per questa lingua non è installata sul telefono: l'audioguida resta muta. Impostazioni ▸ Accessibilità ▸ Contenuto pronunciato ▸ Voci.",
                "en": "The voice for this language isn't installed on your phone, so the audio guide stays silent. Settings ▸ Accessibility ▸ Spoken Content ▸ Voices.",
                "fr": "La voix de cette langue n'est pas installée sur le téléphone : l'audioguide reste muet. Réglages ▸ Accessibilité ▸ Contenu énoncé ▸ Voix.",
                "es": "La voz de este idioma no está instalada en el teléfono: la audioguía se queda muda. Ajustes ▸ Accesibilidad ▸ Contenido hablado ▸ Voces.",
                "de": "Die Stimme für diese Sprache ist nicht auf dem Telefon installiert: Der Audioguide bleibt stumm. Einstellungen ▸ Bedienungshilfen ▸ Gesprochene Inhalte ▸ Stimmen.",
                "ru": "Голос для этого языка не установлен на телефоне: аудиогид молчит. Настройки ▸ Универсальный доступ ▸ Устный контент ▸ Голоса.",
                "zh": "手机上未安装该语言的语音，导览无法朗读。设置 ▸ 辅助功能 ▸ 朗读内容 ▸ 声音。"
            ])
        // Il pacchetto offline porta UNA lingua sola, quella scelta al
        // download: se l'utente cambia lingua dopo, il testo che c'è non è il
        // suo. Dirlo, invece di tacere.
        case "lang_mismatch":
            return pick(lang, [
                "it": "Questo pacchetto offline è in un'altra lingua. Scarica l'area nella tua lingua per ascoltare \(name).",
                "en": "This offline package is in another language. Download the area in your language to listen to \(name).",
                "fr": "Ce paquet hors ligne est dans une autre langue. Téléchargez la zone dans votre langue pour écouter \(name).",
                "es": "Este paquete sin conexión está en otro idioma. Descarga la zona en tu idioma para escuchar \(name).",
                "de": "Dieses Offline-Paket ist in einer anderen Sprache. Laden Sie das Gebiet in Ihrer Sprache herunter, um \(name) zu hören.",
                "ru": "Этот офлайн-пакет на другом языке. Скачайте область на своём языке, чтобы послушать \(name).",
                "zh": "此离线包为其他语言。请下载你所用语言的区域后收听\(name)。"
            ])
        case "service_off":
            return pick(lang, [
                "it": "Audioguida disattivata: tocca per aprire l'app e riattivarla.",
                "en": "Audio guide is off: tap to open the app and turn it back on.",
                "fr": "Audioguide désactivé : touchez pour ouvrir l'application et le réactiver.",
                "es": "Audioguía desactivada: toca para abrir la app y reactivarla.",
                "de": "Audioguide ist aus: Tippen, um die App zu öffnen und ihn wieder einzuschalten.",
                "ru": "Аудиогид выключен: нажмите, чтобы открыть приложение и включить его.",
                "zh": "语音导览已关闭：点击打开应用重新启用。"
            ])
        default:
            return pick(lang, [
                "it": "Audioguida di \(name) non ancora pronta. Tocca per aprirla nell'app.",
                "en": "The audio guide for \(name) isn't ready yet. Tap to open it in the app.",
                "fr": "Audioguide de \(name) pas encore prêt. Touchez pour l'ouvrir dans l'application.",
                "es": "Audioguía de \(name) aún no lista. Toca para abrirla en la app.",
                "de": "Audioguide für \(name) noch nicht bereit. Tippen, um ihn in der App zu öffnen.",
                "ru": "Аудиогид для \(name) ещё не готов. Нажмите, чтобы открыть его в приложении.",
                "zh": "\(name)的语音导览尚未准备好。点击在应用中打开。"
            ])
        }
    }
}
