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
            // (03/09/2026) I tasti del cruscotto sulla notifica del navigatore.
            "nav_pausa" to "Pausa", "nav_riprendi" to "Riprendi", "nav_riascolta" to "Riascolta",
            "nav_salta" to "Salta tappa", "nav_ricalcola" to "Ricalcola", "nav_termina" to "Termina",
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
            "credits_required_text" to "L'audioguida completa richiede crediti o un Day Pass: apri l'app per sbloccarla.",
            // (28/08/2026) Prominent disclosure Play sulla posizione in background:
            // era italiano fisso nel plugin, mostrato a tutto il mondo.
            "bg_disclosure_title" to "Posizione in background",
            "bg_disclosure_text" to "WIP raccoglie i dati della tua posizione in background per riprodurre automaticamente le audioguide quando ti avvicini a un punto di interesse, anche quando l'app è chiusa o non in uso (schermo spento o telefono in tasca). La posizione non viene usata per pubblicità. Per attivare la funzione vai su Impostazioni → Permessi → Posizione e scegli 'Consenti sempre'.",
            "bg_disclosure_settings" to "Vai alle Impostazioni",
            "bg_disclosure_later" to "Non ora",
            // (29/08/2026) Notifiche bloccate dall'interruttore di sistema
            // (Realme «Gestisci notifiche: Rifiuta»): senza, niente cruscotto
            // sulla lock screen e niente avvisi di arrivo.
            "notif_blocked_title" to "Notifiche disattivate",
            "notif_blocked_text" to "Il telefono blocca le notifiche di WIP: senza, il cruscotto del navigatore non compare a schermo spento e non ricevi gli avvisi di arrivo. Nella pagina che si apre attiva «Consenti notifiche».",
        ),
        "en" to mapOf(
            "checkin_title" to "Stop completed! ✅",
            "nav_pausa" to "Pause", "nav_riprendi" to "Resume", "nav_riascolta" to "Replay",
            "nav_salta" to "Skip stop", "nav_ricalcola" to "Recalculate", "nav_termina" to "End",
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
            "credits_required_text" to "The full audio guide needs credits or a Day Pass: open the app to unlock it.",
            "bg_disclosure_title" to "Background location",
            "bg_disclosure_text" to "WIP collects your location data in the background to play audio guides automatically when you get close to a point of interest, even when the app is closed or not in use (screen off or phone in your pocket). Your location is never used for advertising. To turn the feature on, go to Settings → Permissions → Location and choose 'Allow all the time'.",
            "bg_disclosure_settings" to "Open Settings",
            "bg_disclosure_later" to "Not now",
            "notif_blocked_title" to "Notifications turned off",
            "notif_blocked_text" to "Your phone is blocking WIP's notifications: without them the navigator dashboard can't appear on the lock screen and you won't get arrival alerts. On the page that opens, turn on 'Allow notifications'.",
        ),
        "fr" to mapOf(
            "checkin_title" to "Étape terminée ! ✅",
            "nav_pausa" to "Pause", "nav_riprendi" to "Reprendre", "nav_riascolta" to "Réécouter",
            "nav_salta" to "Passer l'étape", "nav_ricalcola" to "Recalculer", "nav_termina" to "Terminer",
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
            "credits_required_text" to "L'audioguide complet nécessite des crédits ou un Day Pass : ouvrez l'application pour le débloquer.",
            "bg_disclosure_title" to "Position en arrière-plan",
            "bg_disclosure_text" to "WIP collecte les données de votre position en arrière-plan pour lancer automatiquement les audioguides lorsque vous approchez d'un point d'intérêt, même quand l'application est fermée ou inutilisée (écran éteint ou téléphone dans la poche). Votre position n'est jamais utilisée à des fins publicitaires. Pour activer la fonction, allez dans Paramètres → Autorisations → Localisation et choisissez « Toujours autoriser ».",
            "bg_disclosure_settings" to "Ouvrir les paramètres",
            "bg_disclosure_later" to "Pas maintenant",
            "notif_blocked_title" to "Notifications désactivées",
            "notif_blocked_text" to "Votre téléphone bloque les notifications de WIP : sans elles, le tableau de bord du navigateur n'apparaît pas sur l'écran verrouillé et vous ne recevez pas les alertes d'arrivée. Dans la page qui s'ouvre, activez « Autoriser les notifications ».",
        ),
        "es" to mapOf(
            "checkin_title" to "¡Parada completada! ✅",
            "nav_pausa" to "Pausa", "nav_riprendi" to "Reanudar", "nav_riascolta" to "Repetir",
            "nav_salta" to "Saltar parada", "nav_ricalcola" to "Recalcular", "nav_termina" to "Terminar",
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
            "credits_required_text" to "La audioguía completa requiere créditos o un Day Pass: abre la app para desbloquearla.",
            "bg_disclosure_title" to "Ubicación en segundo plano",
            "bg_disclosure_text" to "WIP recopila los datos de tu ubicación en segundo plano para reproducir automáticamente las audioguías cuando te acercas a un punto de interés, incluso con la app cerrada o sin usar (pantalla apagada o teléfono en el bolsillo). La ubicación nunca se usa con fines publicitarios. Para activar la función ve a Ajustes → Permisos → Ubicación y elige «Permitir siempre».",
            "bg_disclosure_settings" to "Ir a Ajustes",
            "bg_disclosure_later" to "Ahora no",
            "notif_blocked_title" to "Notificaciones desactivadas",
            "notif_blocked_text" to "El teléfono bloquea las notificaciones de WIP: sin ellas, el panel del navegador no aparece con la pantalla bloqueada y no recibes los avisos de llegada. En la página que se abre, activa «Permitir notificaciones».",
        ),
        "de" to mapOf(
            "checkin_title" to "Etappe abgeschlossen! ✅",
            "nav_pausa" to "Pause", "nav_riprendi" to "Fortsetzen", "nav_riascolta" to "Nochmal",
            "nav_salta" to "Station überspringen", "nav_ricalcola" to "Neu berechnen", "nav_termina" to "Beenden",
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
            "credits_required_text" to "Der vollständige Audioguide braucht Guthaben oder einen Day Pass: öffnen Sie die App, um ihn freizuschalten.",
            "bg_disclosure_title" to "Standort im Hintergrund",
            "bg_disclosure_text" to "WIP erfasst Ihre Standortdaten im Hintergrund, um Audioguides automatisch abzuspielen, wenn Sie sich einem interessanten Ort nähern – auch wenn die App geschlossen oder nicht in Gebrauch ist (Bildschirm aus oder Telefon in der Tasche). Der Standort wird nie für Werbung verwendet. Um die Funktion zu aktivieren, gehen Sie zu Einstellungen → Berechtigungen → Standort und wählen Sie „Immer zulassen“.",
            "bg_disclosure_settings" to "Zu den Einstellungen",
            "bg_disclosure_later" to "Jetzt nicht",
            "notif_blocked_title" to "Benachrichtigungen deaktiviert",
            "notif_blocked_text" to "Ihr Telefon blockiert die Benachrichtigungen von WIP: ohne sie erscheint das Navigations-Cockpit nicht auf dem Sperrbildschirm und Sie erhalten keine Ankunftshinweise. Aktivieren Sie auf der Seite, die sich öffnet, „Benachrichtigungen zulassen“.",
        ),
        // (23/08/2026) Russo e cinese: prima cadevano sull'inglese, quindi un
        // utente RU/ZH sentiva il teaser nella sua lingua e leggeva la
        // notifica in inglese — la stessa smentita che questa tabella era
        // nata per togliere. La voce TTS resta col fallback inglese solo se
        // la voce locale non è installata sul telefono: è un limite del
        // sistema, non del testo.
        "ru" to mapOf(
            "checkin_title" to "Этап пройден! ✅",
            "nav_pausa" to "Пауза", "nav_riprendi" to "Продолжить", "nav_riascolta" to "Повторить",
            "nav_salta" to "Пропустить", "nav_ricalcola" to "Пересчитать", "nav_termina" to "Завершить",
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
            "credits_required_text" to "Полный аудиогид требует кредитов или Day Pass: откройте приложение, чтобы разблокировать его.",
            "bg_disclosure_title" to "Геолокация в фоновом режиме",
            "bg_disclosure_text" to "WIP собирает данные о вашем местоположении в фоновом режиме, чтобы автоматически включать аудиогид, когда вы приближаетесь к интересному месту, — даже если приложение закрыто или не используется (экран выключен или телефон в кармане). Местоположение никогда не используется для рекламы. Чтобы включить функцию, откройте Настройки → Разрешения → Местоположение и выберите «Разрешать всегда».",
            "bg_disclosure_settings" to "Открыть настройки",
            "bg_disclosure_later" to "Не сейчас",
            "notif_blocked_title" to "Уведомления отключены",
            "notif_blocked_text" to "Телефон блокирует уведомления WIP: без них панель навигатора не появится на экране блокировки, и вы не получите оповещения о прибытии. На открывшейся странице включите «Разрешить уведомления».",
        ),
        "zh" to mapOf(
            "checkin_title" to "行程点已完成！✅",
            "nav_pausa" to "暂停", "nav_riprendi" to "继续", "nav_riascolta" to "重听",
            "nav_salta" to "跳过", "nav_ricalcola" to "重新计算", "nav_termina" to "结束",
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
            "credits_required_text" to "完整语音导览需要积分或 Day Pass：打开应用即可解锁。",
            "bg_disclosure_title" to "后台定位",
            "bg_disclosure_text" to "WIP 会在后台收集你的位置数据，以便你靠近兴趣点时自动播放语音导览，即使应用已关闭或未在使用（息屏或手机放在口袋里）也一样。位置数据绝不会用于广告。要开启该功能，请前往 设置 → 权限 → 位置信息，选择「始终允许」。",
            "bg_disclosure_settings" to "前往设置",
            "bg_disclosure_later" to "暂不",
            "notif_blocked_title" to "通知已关闭",
            "notif_blocked_text" to "手机屏蔽了 WIP 的通知：没有通知，导航面板无法在锁屏上显示，也收不到到达提醒。请在打开的页面中启用「允许通知」。",
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
