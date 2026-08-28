package com.itaintasca.app.geofence

import android.content.Context

/**
 * (22/08/2026) Testi delle notifiche di avvicinamento/arrivo/tappa, nella
 * lingua scelta dall'utente. Prima erano italiano fisso ("Sei arrivato!",
 * "Tappa completata!") anche per chi usa l'app in EN/FR/ES/DE, mentre la
 * voce era già localizzata: la notifica smentiva il teaser.
 *
 * Mappa in codice invece di res/values-xx/strings.xml: nessuna risorsa da
 * generare, nessun rischio di `R.string` mancante a build rotto, e la lingua
 * viene dalle prefs del plugin ("language"), NON dalla locale di sistema —
 * un utente col telefono in tedesco che ascolta in italiano deve leggere in
 * italiano. Dal 23/08/2026 ci sono tutte e SETTE le lingue dell'app: russo e
 * cinese cadevano sull'inglese.
 */
object NotificationStrings {

    /** Lingua persistita dal plugin (ItaintaBackgroundPoiPlugin → prefs "language"). */
    fun lang(context: Context): String =
        context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .getString("language", "it") ?: "it"

    private val TABLE: Map<String, Map<String, String>> = mapOf(
        "it" to mapOf(
            "checkin_title" to "Tappa completata! ✅",
            "checkin_text" to "Vuoi passare alla prossima destinazione?",
            "approach_title_stop" to "📍 Tappa Itinerario",
            "approach_title_explore" to "Esplorazione",
            "approach_text" to "A circa %1\$sm. Tocca per i dettagli.",
            "arrival_at" to "Arrivo a %1\$s",
            "arrived_title" to "Sei arrivato!",
            "arrived_starting" to "Avvio audioguida di %1\$s",
            "arrived_tap" to "Tocca per ascoltare la storia",
            "voice_missing_title" to "Voce non installata",
            "voice_missing_text" to "La voce per questa lingua non è installata sul telefono: l'audioguida resta muta. Tocca per installarla.",
            "pkg_lang_title" to "Pacchetto in un'altra lingua",
            "pkg_lang_text" to "Questo pacchetto offline è in %1\$s, l'app è in %2\$s. Scarica l'area nella tua lingua, oppure ascolta in %1\$s.",
            // (28/08/2026) 402 dal server: la guida completa richiede crediti.
            "credits_required_title" to "Crediti insufficienti",
            "credits_required_text" to "L'audioguida completa richiede crediti o un Day Pass: apri l'app per sbloccarla."
        ),
        "en" to mapOf(
            "checkin_title" to "Stop completed! ✅",
            "checkin_text" to "Move on to the next destination?",
            "approach_title_stop" to "📍 Itinerary stop",
            "approach_title_explore" to "Exploring",
            "approach_text" to "About %1\$sm away. Tap for details.",
            "arrival_at" to "Arriving at %1\$s",
            "arrived_title" to "You have arrived!",
            "arrived_starting" to "Starting the audio guide for %1\$s",
            "arrived_tap" to "Tap to listen to the story",
            "voice_missing_title" to "Voice not installed",
            "voice_missing_text" to "The voice for this language isn't installed on your phone, so the audio guide stays silent. Tap to install it.",
            "pkg_lang_title" to "Package in another language",
            "pkg_lang_text" to "This offline package is in %1\$s, the app is in %2\$s. Download the area in your language, or listen in %1\$s.",
            "credits_required_title" to "Not enough credits",
            "credits_required_text" to "The full audio guide needs credits or a Day Pass: open the app to unlock it."
        ),
        "fr" to mapOf(
            "checkin_title" to "Étape terminée ! ✅",
            "checkin_text" to "Passer à la prochaine destination ?",
            "approach_title_stop" to "📍 Étape de l'itinéraire",
            "approach_title_explore" to "Exploration",
            "approach_text" to "À environ %1\$s m. Touchez pour les détails.",
            "arrival_at" to "Arrivée à %1\$s",
            "arrived_title" to "Vous êtes arrivé !",
            "arrived_starting" to "Lancement de l'audioguide de %1\$s",
            "arrived_tap" to "Touchez pour écouter l'histoire",
            "voice_missing_title" to "Voix non installée",
            "voice_missing_text" to "La voix de cette langue n'est pas installée sur le téléphone : l'audioguide reste muet. Touchez pour l'installer.",
            "pkg_lang_title" to "Paquet dans une autre langue",
            "pkg_lang_text" to "Ce paquet hors ligne est en %1\$s, l'application en %2\$s. Téléchargez la zone dans votre langue, ou écoutez en %1\$s.",
            "credits_required_title" to "Crédits insuffisants",
            "credits_required_text" to "L'audioguide complet nécessite des crédits ou un Day Pass : ouvrez l'application pour le débloquer."
        ),
        "es" to mapOf(
            "checkin_title" to "¡Parada completada! ✅",
            "checkin_text" to "¿Pasar a la siguiente destinación?",
            "approach_title_stop" to "📍 Parada del itinerario",
            "approach_title_explore" to "Exploración",
            "approach_text" to "A unos %1\$s m. Toca para ver los detalles.",
            "arrival_at" to "Llegada a %1\$s",
            "arrived_title" to "¡Has llegado!",
            "arrived_starting" to "Iniciando la audioguía de %1\$s",
            "arrived_tap" to "Toca para escuchar la historia",
            "voice_missing_title" to "Voz no instalada",
            "voice_missing_text" to "La voz de este idioma no está instalada en el teléfono: la audioguía se queda muda. Toca para instalarla.",
            "pkg_lang_title" to "Paquete en otro idioma",
            "pkg_lang_text" to "Este paquete sin conexión está en %1\$s y la app en %2\$s. Descarga la zona en tu idioma o escucha en %1\$s.",
            "credits_required_title" to "Créditos insuficientes",
            "credits_required_text" to "La audioguía completa requiere créditos o un Day Pass: abre la app para desbloquearla."
        ),
        "de" to mapOf(
            "checkin_title" to "Etappe abgeschlossen! ✅",
            "checkin_text" to "Weiter zum nächsten Ziel?",
            "approach_title_stop" to "📍 Etappe der Route",
            "approach_title_explore" to "Erkundung",
            "approach_text" to "Etwa %1\$s m entfernt. Tippen für Details.",
            "arrival_at" to "Ankunft bei %1\$s",
            "arrived_title" to "Sie sind angekommen!",
            "arrived_starting" to "Audioguide für %1\$s wird gestartet",
            "arrived_tap" to "Tippen, um die Geschichte zu hören",
            "voice_missing_title" to "Stimme nicht installiert",
            "voice_missing_text" to "Die Stimme für diese Sprache ist nicht auf dem Telefon installiert: Der Audioguide bleibt stumm. Zum Installieren tippen.",
            "pkg_lang_title" to "Paket in einer anderen Sprache",
            "pkg_lang_text" to "Dieses Offline-Paket ist auf %1\$s, die App auf %2\$s. Laden Sie das Gebiet in Ihrer Sprache herunter oder hören Sie auf %1\$s.",
            "credits_required_title" to "Nicht genügend Guthaben",
            "credits_required_text" to "Der vollständige Audioguide braucht Guthaben oder einen Day Pass: öffnen Sie die App, um ihn freizuschalten."
        ),
        // (23/08/2026) Russo e cinese: prima cadevano sull'inglese, quindi un
        // utente RU/ZH sentiva il teaser nella sua lingua e leggeva la
        // notifica in inglese — la stessa smentita che questa tabella era
        // nata per togliere. La voce TTS resta col fallback inglese solo se
        // la voce locale non è installata sul telefono: è un limite del
        // sistema, non del testo.
        "ru" to mapOf(
            "checkin_title" to "Этап пройден! ✅",
            "checkin_text" to "Перейти к следующему пункту?",
            "approach_title_stop" to "📍 Этап маршрута",
            "approach_title_explore" to "Исследование",
            "approach_text" to "Примерно %1\$s м. Нажмите для подробностей.",
            "arrival_at" to "Прибытие: %1\$s",
            "arrived_title" to "Вы прибыли!",
            "arrived_starting" to "Запуск аудиогида: %1\$s",
            "arrived_tap" to "Нажмите, чтобы услышать историю",
            "voice_missing_title" to "Голос не установлен",
            "voice_missing_text" to "Голос для этого языка не установлен на телефоне: аудиогид молчит. Нажмите, чтобы установить.",
            "pkg_lang_title" to "Пакет на другом языке",
            "pkg_lang_text" to "Этот офлайн-пакет на языке %1\$s, приложение — на %2\$s. Скачайте область на своём языке или слушайте на %1\$s.",
            "credits_required_title" to "Недостаточно кредитов",
            "credits_required_text" to "Полный аудиогид требует кредитов или Day Pass: откройте приложение, чтобы разблокировать его."
        ),
        "zh" to mapOf(
            "checkin_title" to "行程点已完成！✅",
            "checkin_text" to "前往下一个目的地？",
            "approach_title_stop" to "📍 行程站点",
            "approach_title_explore" to "探索中",
            "approach_text" to "距离约 %1\$s 米。点击查看详情。",
            "arrival_at" to "抵达 %1\$s",
            "arrived_title" to "您已到达！",
            "arrived_starting" to "正在启动 %1\$s 的语音导览",
            "arrived_tap" to "点击收听这里的故事",
            "voice_missing_title" to "未安装语音",
            "voice_missing_text" to "手机上未安装该语言的语音，导览无法朗读。点击安装。",
            "pkg_lang_title" to "离线包语言不同",
            "pkg_lang_text" to "此离线包为%1\$s，应用为%2\$s。请下载你所用语言的区域，或以%1\$s收听。",
            "credits_required_title" to "积分不足",
            "credits_required_text" to "完整语音导览需要积分或 Day Pass：打开应用即可解锁。"
        )
    )

    /**
     * Nome della lingua nella lingua stessa: dire «questo pacchetto è in
     * italiano» a un tedesco funziona solo se «italiano» è scritto in una forma
     * che riconosce. Il codice a due lettere in maiuscolo è il ripiego onesto
     * per una lingua non in elenco.
     */
    fun languageName(code: String): String = when (code.lowercase().take(2)) {
        "it" -> "Italiano"
        "en" -> "English"
        "fr" -> "Français"
        "es" -> "Español"
        "de" -> "Deutsch"
        "ru" -> "Русский"
        "zh" -> "中文"
        else -> code.uppercase()
    }

    /**
     * Stringa localizzata per `key`; `args` sostituiscono i segnaposto %1$s.
     * Mai eccezioni: chiave o lingua sconosciute cadono su inglese → italiano
     * → la chiave stessa, e un formato malformato restituisce il testo grezzo.
     */
    fun get(lang: String, key: String, vararg args: Any): String {
        val normalized = lang.lowercase().take(2)
        val raw = TABLE[normalized]?.get(key)
            ?: TABLE["en"]?.get(key)
            ?: TABLE["it"]?.get(key)
            ?: key
        if (args.isEmpty()) return raw
        return try {
            String.format(raw, *args)
        } catch (_: Exception) {
            raw
        }
    }

    /** Variante comoda: lingua letta dalle prefs. */
    fun get(context: Context, key: String, vararg args: Any): String =
        get(lang(context), key, *args)
}
