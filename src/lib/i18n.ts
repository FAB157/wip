export type Language = "IT" | "EN" | "FR" | "ES" | "DE" | "RU" | "ZH";

export const LANGUAGES: Partial<Record<Language, { label: string; flag: string }>> = {
  IT: { label: "Italiano", flag: "🇮🇹" },
  EN: { label: "English", flag: "🇬🇧" },
  FR: { label: "Français", flag: "🇫🇷" },
  ES: { label: "Español", flag: "🇪🇸" },
  DE: { label: "Deutsch", flag: "🇩🇪" },
  RU: { label: "Русский", flag: "🇷🇺" },
  ZH: { label: "中文 (Zhōngwén)", flag: "🇨🇳" },
};

// Il tedesco (DE) è la 7ª lingua UI, con traduzione completa di tutte le
// stringhe di questo dizionario (residuo storico rimosso il 14/08/2026).
// Il CONTENUTO generato (audioguide, dettagli, teaser) è invece in tedesco
// vero, perché prodotto dall'AI nella lingua richiesta.
export const TRANSLATIONS: Record<string, Partial<Record<Language, string>>> = {
  // ── 🧭 Gate di bussola (22/08/2026): non raccontare ciò che hai alle spalle ──
  bearing_gate_label: { IT: "Racconta solo ciò che hai davanti", EN: "Only tell me what's in front of me", FR: "Ne raconter que ce qui est devant moi", ES: "Cuenta solo lo que tienes delante", DE: "Nur erzählen, was vor dir liegt", RU: "Рассказывать только о том, что впереди", ZH: "只讲述你前方的地点" },
  bearing_gate_desc: { IT: "Se hai già superato un luogo, l'audioguida aspetta invece di partire quando ce l'hai alle spalle: riparte se torni indietro o ti giri a guardarlo. Se dopo un po' non ti sei girato, la racconta comunque.", EN: "If you've already walked past a place, the audio guide waits instead of starting when it's behind you: it starts if you turn back or turn to look at it. If you haven't turned after a while, it tells you anyway.", FR: "Si tu as déjà dépassé un lieu, l'audioguide attend au lieu de démarrer quand tu l'as dans le dos : il démarre si tu reviens ou si tu te retournes pour le regarder. Si tu ne t'es pas retourné au bout d'un moment, il le raconte quand même.", ES: "Si ya has pasado un lugar, la audioguía espera en vez de arrancar cuando lo tienes a tu espalda: arranca si vuelves atrás o te giras a mirarlo. Si al cabo de un rato no te has girado, te lo cuenta igualmente.", DE: "Wenn du einen Ort schon passiert hast, wartet der Audioguide, statt loszulegen, wenn du ihn im Rücken hast: Er startet, sobald du umkehrst oder dich danach umdrehst. Drehst du dich eine Weile nicht um, erzählt er ihn trotzdem.", RU: "Если вы уже прошли мимо места, аудиогид подождёт, а не начнёт рассказ, когда объект у вас за спиной: он включится, если вы вернётесь или обернётесь. Если вы так и не обернулись, через некоторое время он расскажет всё равно.", ZH: "如果你已经走过某个地点，语音导览会先等待，而不是在它已在你身后时才开口：当你折返或转身望向它时才会播放。若过一会儿你仍未转身，它也会照常讲述。" },
  // ── Vision / WIP Community v2 (21/08/2026) ──
  // CameraScreen
  vis_tab_scan: { IT: "Scansione AI", EN: "AI Scan", FR: "Scan IA", ES: "Escaneo IA", DE: "KI-Scan", RU: "ИИ-сканирование", ZH: "AI 扫描" },
  vis_tab_ar: { IT: "Radar AR", EN: "AR Radar", FR: "Radar RA", ES: "Radar RA", DE: "AR-Radar", RU: "AR-радар", ZH: "AR 雷达" },
  vis_title: { IT: "Analizza il Mondo", EN: "Analyze the World", FR: "Analyse le monde", ES: "Analiza el mundo", DE: "Analysiere die Welt", RU: "Исследуйте мир", ZH: "分析世界" },
  vis_hint_place: { IT: "Scansiona per riconoscere il punto di interesse: la scheda finisce in My Vision e sblocchi 10 XP.", EN: "Scan to recognize the point of interest: the card goes to My Vision and you unlock 10 XP.", FR: "Scanne pour reconnaître le point d'intérêt : la fiche arrive dans My Vision et tu débloques 10 XP.", ES: "Escanea para reconocer el punto de interés: la ficha va a My Vision y desbloqueas 10 XP.", DE: "Scanne, um den Ort zu erkennen: Die Karte landet in My Vision und du schaltest 10 XP frei.", RU: "Отсканируйте, чтобы распознать достопримечательность: карточка попадёт в My Vision, и вы получите 10 XP.", ZH: "扫描以识别兴趣点：卡片会保存到 My Vision，并解锁 10 XP。" },
  vis_hint_artwork: { IT: "Inquadra un quadro, una statua o un reperto: WIP riconosce l'opera e te la racconta come un'audioguida.", EN: "Frame a painting, a statue or an artifact: WIP recognizes the work and tells you about it like an audio guide.", FR: "Cadre un tableau, une statue ou un objet : WIP reconnaît l'œuvre et te la raconte comme un audioguide.", ES: "Enfoca un cuadro, una estatua o una pieza: WIP reconoce la obra y te la cuenta como una audioguía.", DE: "Richte die Kamera auf ein Gemälde, eine Statue oder ein Exponat: WIP erkennt das Werk und erzählt es dir wie ein Audioguide.", RU: "Наведите камеру на картину, статую или экспонат: WIP распознает произведение и расскажет о нём как аудиогид.", ZH: "对准一幅画、一座雕像或一件文物：WIP 会识别作品，并像语音导览一样为你讲解。" },
  vis_hint_nature: { IT: "Inquadra una pianta, un animale o un panorama: WIP li riconosce e ti racconta habitat e curiosità da naturalista.", EN: "Frame a plant, an animal or a landscape: WIP recognizes them and tells you about habitat and naturalist curiosities.", FR: "Cadre une plante, un animal ou un paysage : WIP les reconnaît et te raconte habitat et anecdotes de naturaliste.", ES: "Enfoca una planta, un animal o un paisaje: WIP los reconoce y te cuenta su hábitat y curiosidades de naturalista.", DE: "Richte die Kamera auf eine Pflanze, ein Tier oder eine Landschaft: WIP erkennt sie und erzählt dir von Lebensraum und Naturkunde.", RU: "Наведите камеру на растение, животное или пейзаж: WIP распознает их и расскажет о среде обитания и интересных фактах.", ZH: "对准一株植物、一只动物或一处风景：WIP 会识别它们，并以博物学家的视角讲述栖息地和趣闻。" },
  vis_hint_screenshot: { IT: "Carica lo screenshot di un reel o di un articolo (\"5 posti da vedere a…\"): WIP estrae i luoghi citati e li trasforma in preferiti o in un itinerario.", EN: "Upload a screenshot of a reel or an article (\"5 places to see in…\"): WIP extracts the places mentioned and turns them into favorites or an itinerary.", FR: "Charge la capture d'écran d'un reel ou d'un article (« 5 lieux à voir à… ») : WIP extrait les lieux cités et les transforme en favoris ou en itinéraire.", ES: "Sube la captura de un reel o de un artículo (\"5 lugares que ver en…\"): WIP extrae los lugares citados y los convierte en favoritos o en un itinerario.", DE: "Lade den Screenshot eines Reels oder Artikels hoch („5 Orte, die du in … sehen musst“): WIP extrahiert die genannten Orte und macht daraus Favoriten oder eine Route.", RU: "Загрузите скриншот рилса или статьи («5 мест, которые стоит увидеть в…»): WIP извлечёт упомянутые места и превратит их в избранное или маршрут.", ZH: "上传短视频或文章的截图（“……必看的 5 个地方”）：WIP 会提取其中提到的地点，并将其加入收藏或生成行程。" },
  vis_mode_place: { IT: "📍 Luogo", EN: "📍 Place", FR: "📍 Lieu", ES: "📍 Lugar", DE: "📍 Ort", RU: "📍 Место", ZH: "📍 地点" },
  vis_mode_artwork: { IT: "🖼️ Opera", EN: "🖼️ Artwork", FR: "🖼️ Œuvre", ES: "🖼️ Obra", DE: "🖼️ Kunstwerk", RU: "🖼️ Искусство", ZH: "🖼️ 艺术品" },
  vis_mode_nature: { IT: "🌿 Natura", EN: "🌿 Nature", FR: "🌿 Nature", ES: "🌿 Naturaleza", DE: "🌿 Natur", RU: "🌿 Природа", ZH: "🌿 自然" },
  vis_mode_screenshot: { IT: "📱 Screenshot", EN: "📱 Screenshot", FR: "📱 Capture", ES: "📱 Captura", DE: "📱 Screenshot", RU: "📱 Скриншот", ZH: "📱 截图" },
  vis_take_photo: { IT: "Scatta Foto", EN: "Take Photo", FR: "Prendre une photo", ES: "Hacer foto", DE: "Foto aufnehmen", RU: "Сделать фото", ZH: "拍照" },
  vis_pick_gallery: { IT: "Scegli dalla Galleria", EN: "Choose from Gallery", FR: "Choisir dans la galerie", ES: "Elegir de la galería", DE: "Aus Galerie wählen", RU: "Выбрать из галереи", ZH: "从相册选择" },
  vis_upload_screenshot: { IT: "Carica screenshot", EN: "Upload screenshot", FR: "Charger une capture", ES: "Subir captura", DE: "Screenshot hochladen", RU: "Загрузить скриншот", ZH: "上传截图" },
  vis_queue_processing: { IT: "⏳ Riconoscimento di {n} foto in coda…", EN: "⏳ Recognizing {n} queued photos…", FR: "⏳ Reconnaissance de {n} photos en attente…", ES: "⏳ Reconociendo {n} fotos en cola…", DE: "⏳ {n} Fotos in der Warteschlange werden erkannt…", RU: "⏳ Распознавание {n} фото из очереди…", ZH: "⏳ 正在识别队列中的 {n} 张照片…" },
  vis_queue_waiting: { IT: "📶 {n} foto in coda — verranno riconosciute appena torni online", EN: "📶 {n} photos queued — they'll be recognized as soon as you're back online", FR: "📶 {n} photos en attente — elles seront reconnues dès que tu seras de nouveau en ligne", ES: "📶 {n} fotos en cola — se reconocerán en cuanto vuelvas a estar en línea", DE: "📶 {n} Fotos in der Warteschlange — sie werden erkannt, sobald du wieder online bist", RU: "📶 {n} фото в очереди — они будут распознаны, как только появится сеть", ZH: "📶 {n} 张照片排队中 — 恢复联网后将自动识别" },
  vis_queue_full: { IT: "Coda offline piena ({n} foto): torna online per svuotarla prima di scattare ancora.", EN: "Offline queue full ({n} photos): go back online to clear it before taking more.", FR: "File hors ligne pleine ({n} photos) : reviens en ligne pour la vider avant de photographier encore.", ES: "Cola sin conexión llena ({n} fotos): vuelve a conectarte para vaciarla antes de hacer más fotos.", DE: "Offline-Warteschlange voll ({n} Fotos): Geh wieder online, um sie zu leeren, bevor du weiter fotografierst.", RU: "Офлайн-очередь заполнена ({n} фото): подключитесь к сети, чтобы очистить её, прежде чем снимать дальше.", ZH: "离线队列已满（{n} 张照片）：请先联网清空队列，再继续拍摄。" },
  vis_offline_saved: { IT: "📶 Sei offline: foto salvata in coda, verrà riconosciuta appena torni online.", EN: "📶 You're offline: photo saved to the queue, it'll be recognized as soon as you're back online.", FR: "📶 Tu es hors ligne : photo mise en attente, elle sera reconnue dès que tu seras de nouveau en ligne.", ES: "📶 Estás sin conexión: foto guardada en cola, se reconocerá en cuanto vuelvas a estar en línea.", DE: "📶 Du bist offline: Foto in die Warteschlange gelegt, es wird erkannt, sobald du wieder online bist.", RU: "📶 Вы офлайн: фото добавлено в очередь и будет распознано, как только появится сеть.", ZH: "📶 你已离线：照片已加入队列，恢复联网后将自动识别。" },
  vis_offline_fail: { IT: "Sei offline e la foto non può essere salvata in coda. Riprova quando torni in rete.", EN: "You're offline and the photo can't be queued. Try again when you're back online.", FR: "Tu es hors ligne et la photo ne peut pas être mise en attente. Réessaie quand tu seras de nouveau en ligne.", ES: "Estás sin conexión y la foto no se puede guardar en cola. Inténtalo de nuevo cuando vuelvas a tener red.", DE: "Du bist offline und das Foto kann nicht in die Warteschlange gelegt werden. Versuch es erneut, sobald du wieder online bist.", RU: "Вы офлайн, и фото не удалось добавить в очередь. Повторите попытку, когда появится сеть.", ZH: "你已离线，照片无法加入队列。请在恢复联网后重试。" },
  vis_login_required: { IT: "Accedi con il tuo account per usare la Visione AI.", EN: "Sign in with your account to use AI Vision.", FR: "Connecte-toi avec ton compte pour utiliser la Vision IA.", ES: "Inicia sesión con tu cuenta para usar la Visión IA.", DE: "Melde dich mit deinem Konto an, um KI-Vision zu nutzen.", RU: "Войдите в аккаунт, чтобы использовать ИИ-зрение.", ZH: "请登录账号以使用 AI 视觉。" },
  vis_no_credits: { IT: "Crediti insufficienti. Visita lo store per ricaricare.", EN: "Not enough credits. Visit the store to top up.", FR: "Crédits insuffisants. Passe par la boutique pour recharger.", ES: "Créditos insuficientes. Visita la tienda para recargar.", DE: "Nicht genug Guthaben. Lade im Store nach.", RU: "Недостаточно кредитов. Пополните баланс в магазине.", ZH: "积分不足。请前往商店充值。" },
  vis_resize_error: { IT: "Errore durante l'elaborazione dell'immagine. Riprova.", EN: "Error while processing the image. Try again.", FR: "Erreur lors du traitement de l'image. Réessaie.", ES: "Error al procesar la imagen. Inténtalo de nuevo.", DE: "Fehler bei der Bildverarbeitung. Versuch es erneut.", RU: "Ошибка при обработке изображения. Попробуйте ещё раз.", ZH: "处理图片时出错，请重试。" },
  vis_generic_error: { IT: "Errore durante l'analisi", EN: "Error during analysis", FR: "Erreur pendant l'analyse", ES: "Error durante el análisis", DE: "Fehler bei der Analyse", RU: "Ошибка при анализе", ZH: "分析时出错" },
  vis_too_many_unrecognized: { IT: "Troppe foto non riconosciute oggi: riprova domani con un luogo, un'opera o un panorama ben inquadrati.", EN: "Too many unrecognized photos today: try again tomorrow with a well-framed place, artwork or landscape.", FR: "Trop de photos non reconnues aujourd'hui : réessaie demain avec un lieu, une œuvre ou un paysage bien cadrés.", ES: "Demasiadas fotos no reconocidas hoy: inténtalo mañana con un lugar, una obra o un paisaje bien encuadrados.", DE: "Heute zu viele nicht erkannte Fotos: Versuch es morgen wieder mit einem gut fotografierten Ort, Kunstwerk oder Panorama.", RU: "Сегодня слишком много нераспознанных фото: попробуйте завтра с хорошо снятым местом, произведением или пейзажем.", ZH: "今天未识别的照片太多：请明天再试，并确保地点、艺术品或风景取景清晰。" },
  vis_first_title: { IT: "📸 La tua prima scoperta", EN: "📸 Your first discovery", FR: "📸 Ta première découverte", ES: "📸 Tu primer descubrimiento", DE: "📸 Deine erste Entdeckung", RU: "📸 Ваше первое открытие", ZH: "📸 你的第一个发现" },
  vis_first_step1: { IT: "Inquadra un monumento, una chiesa o uno scorcio che ti colpisce: il mirino AI lo riconosce da solo.", EN: "Frame a monument, a church or a view that catches your eye: the AI viewfinder recognizes it on its own.", FR: "Cadre un monument, une église ou un coin qui te plaît : le viseur IA le reconnaît tout seul.", ES: "Enfoca un monumento, una iglesia o un rincón que te llame la atención: el visor IA lo reconoce solo.", DE: "Richte die Kamera auf ein Denkmal, eine Kirche oder einen Blickwinkel, der dich anspricht: Der KI-Sucher erkennt ihn von selbst.", RU: "Наведите камеру на памятник, церковь или вид, который вас впечатлил: ИИ-видоискатель распознает его сам.", ZH: "对准一座纪念碑、一座教堂或一处打动你的景致：AI 取景器会自动识别。" },
  vis_first_step2: { IT: "Scatta: ottieni subito la scheda del luogo con l'audioguida da ascoltare.", EN: "Shoot: you instantly get the place card with an audio guide to listen to.", FR: "Photographie : tu obtiens aussitôt la fiche du lieu avec l'audioguide à écouter.", ES: "Dispara: obtienes al instante la ficha del lugar con la audioguía para escuchar.", DE: "Fotografiere: Du bekommst sofort die Karte des Ortes mit dem Audioguide zum Anhören.", RU: "Снимите: вы сразу получите карточку места с аудиогидом.", ZH: "拍摄：立即获得该地点的卡片和可收听的语音导览。" },
  vis_first_step3: { IT: "Guadagna crediti: se la tua foto viene pubblicata nella WIP Community ricevi fino a +15 crediti da spendere nell'app.", EN: "Earn credits: if your photo is published in the WIP Community you get up to +15 credits to spend in the app.", FR: "Gagne des crédits : si ta photo est publiée dans la WIP Community, tu reçois jusqu'à +15 crédits à dépenser dans l'app.", ES: "Gana créditos: si tu foto se publica en la WIP Community recibes hasta +15 créditos para gastar en la app.", DE: "Verdiene Guthaben: Wird dein Foto in der WIP Community veröffentlicht, bekommst du bis zu +15 Credits für die App.", RU: "Зарабатывайте кредиты: если ваше фото опубликуют в WIP Community, вы получите до +15 кредитов для использования в приложении.", ZH: "赚取积分：如果你的照片发布到 WIP Community，最多可获得 +15 积分在应用内使用。" },
  vis_first_nearby: { IT: "Vicino a te, da provare subito", EN: "Near you, try it now", FR: "Près de toi, à essayer tout de suite", ES: "Cerca de ti, para probar ahora", DE: "In deiner Nähe, gleich ausprobieren", RU: "Рядом с вами — попробуйте прямо сейчас", ZH: "就在附近，马上试试" },
  vis_first_cta: { IT: "Iniziamo!", EN: "Let's go!", FR: "C'est parti !", ES: "¡Empecemos!", DE: "Los geht's!", RU: "Начнём!", ZH: "开始吧！" },
  vis_where_title: { IT: "Dove hai scattato questa foto?", EN: "Where did you take this photo?", FR: "Où as-tu pris cette photo ?", ES: "¿Dónde hiciste esta foto?", DE: "Wo hast du dieses Foto gemacht?", RU: "Где сделано это фото?", ZH: "这张照片是在哪里拍的？" },
  vis_where_desc: { IT: "La foto viene dalla galleria e non ha coordinate: tocca la mappa per indicare il luogo, così la scheda e la community avranno la posizione giusta.", EN: "The photo comes from the gallery and has no coordinates: tap the map to mark the place, so the card and the community get the right location.", FR: "La photo vient de la galerie et n'a pas de coordonnées : touche la carte pour indiquer le lieu, ainsi la fiche et la communauté auront la bonne position.", ES: "La foto viene de la galería y no tiene coordenadas: toca el mapa para indicar el lugar, así la ficha y la comunidad tendrán la posición correcta.", DE: "Das Foto stammt aus der Galerie und hat keine Koordinaten: Tippe auf die Karte, um den Ort anzugeben, damit Karte und Community die richtige Position haben.", RU: "Фото из галереи без координат: коснитесь карты, чтобы указать место, — тогда у карточки и сообщества будет верное расположение.", ZH: "这张照片来自相册，没有坐标：点击地图标记地点，这样卡片和社区就能获得正确的位置。" },
  vis_where_use_here: { IT: "Usa la mia posizione attuale", EN: "Use my current location", FR: "Utiliser ma position actuelle", ES: "Usar mi ubicación actual", DE: "Meinen aktuellen Standort verwenden", RU: "Использовать моё текущее местоположение", ZH: "使用我的当前位置" },
  vis_where_confirm: { IT: "Conferma posizione", EN: "Confirm location", FR: "Confirmer la position", ES: "Confirmar ubicación", DE: "Standort bestätigen", RU: "Подтвердить место", ZH: "确认位置" },
  vis_where_skip: { IT: "Non lo so", EN: "I don't know", FR: "Je ne sais pas", ES: "No lo sé", DE: "Weiß ich nicht", RU: "Не знаю", ZH: "不知道" },
  vis_exif_found: { IT: "Posizione e data lette dalla foto", EN: "Location and date read from the photo", FR: "Position et date lues depuis la photo", ES: "Ubicación y fecha leídas de la foto", DE: "Standort und Datum aus dem Foto gelesen", RU: "Место и дата считаны из фото", ZH: "已从照片读取位置和日期" },
  vis_cand_title: { IT: "Non sono sicuro: quale di questi è?", EN: "I'm not sure: which one is it?", FR: "Je ne suis pas sûr : lequel est-ce ?", ES: "No estoy seguro: ¿cuál de estos es?", DE: "Ich bin nicht sicher: Welches ist es?", RU: "Не уверен: что из этого?", ZH: "不太确定：是下面哪一个？" },
  vis_cand_desc: { IT: "Scegli il soggetto giusto e la scheda verrà riscritta su di lui, gratis.", EN: "Pick the right subject and the card will be rewritten for it, free of charge.", FR: "Choisis le bon sujet et la fiche sera réécrite pour lui, gratuitement.", ES: "Elige el sujeto correcto y la ficha se reescribirá sobre él, gratis.", DE: "Wähle das richtige Motiv und die Karte wird kostenlos dafür neu geschrieben.", RU: "Выберите верный объект — карточка будет переписана под него бесплатно.", ZH: "选择正确的对象，卡片将免费为它重新生成。" },
  vis_cand_keep: { IT: "Tieni la scheda così", EN: "Keep the card as is", FR: "Garder la fiche telle quelle", ES: "Dejar la ficha así", DE: "Karte so lassen", RU: "Оставить карточку как есть", ZH: "保留当前卡片" },
  vis_cand_rewriting: { IT: "Riscrivo la scheda…", EN: "Rewriting the card…", FR: "Je réécris la fiche…", ES: "Reescribiendo la ficha…", DE: "Karte wird neu geschrieben…", RU: "Переписываю карточку…", ZH: "正在重新生成卡片…" },
  vis_reel_title: { IT: "📱 Luoghi trovati", EN: "📱 Places found", FR: "📱 Lieux trouvés", ES: "📱 Lugares encontrados", DE: "📱 Gefundene Orte", RU: "📱 Найденные места", ZH: "📱 找到的地点" },
  vis_reel_desc: { IT: "Spunta i luoghi che ti interessano, poi salvali o trasformali in un itinerario.", EN: "Tick the places you're interested in, then save them or turn them into an itinerary.", FR: "Coche les lieux qui t'intéressent, puis enregistre-les ou transforme-les en itinéraire.", ES: "Marca los lugares que te interesan y luego guárdalos o conviértelos en un itinerario.", DE: "Hake die Orte ab, die dich interessieren, und speichere sie oder mach daraus eine Route.", RU: "Отметьте интересующие места, затем сохраните их или превратите в маршрут.", ZH: "勾选你感兴趣的地点，然后保存或生成行程。" },
  vis_reel_found: { IT: "✓ trovato sulla mappa", EN: "✓ found on the map", FR: "✓ trouvé sur la carte", ES: "✓ encontrado en el mapa", DE: "✓ auf der Karte gefunden", RU: "✓ найдено на карте", ZH: "✓ 已在地图上找到" },
  vis_reel_not_found: { IT: "⚠ non trovato", EN: "⚠ not found", FR: "⚠ introuvable", ES: "⚠ no encontrado", DE: "⚠ nicht gefunden", RU: "⚠ не найдено", ZH: "⚠ 未找到" },
  vis_reel_save: { IT: "Salva nei preferiti", EN: "Save to favorites", FR: "Enregistrer dans les favoris", ES: "Guardar en favoritos", DE: "In Favoriten speichern", RU: "Сохранить в избранное", ZH: "保存到收藏" },
  vis_reel_create: { IT: "✨ Crea itinerario con questi luoghi", EN: "✨ Create an itinerary with these places", FR: "✨ Créer un itinéraire avec ces lieux", ES: "✨ Crear itinerario con estos lugares", DE: "✨ Route mit diesen Orten erstellen", RU: "✨ Создать маршрут из этих мест", ZH: "✨ 用这些地点创建行程" },
  vis_reel_none: { IT: "Nessun luogo trovato nello screenshot. Prova con un'immagine dove i nomi dei posti si leggono chiaramente.", EN: "No places found in the screenshot. Try an image where the place names are clearly readable.", FR: "Aucun lieu trouvé dans la capture. Essaie avec une image où les noms des lieux se lisent clairement.", ES: "No se encontró ningún lugar en la captura. Prueba con una imagen donde los nombres de los sitios se lean bien.", DE: "Keine Orte im Screenshot gefunden. Versuch es mit einem Bild, auf dem die Ortsnamen gut lesbar sind.", RU: "На скриншоте не найдено мест. Попробуйте изображение, где названия мест хорошо читаются.", ZH: "截图中未找到任何地点。请换一张地名清晰可读的图片。" },
  vis_reel_select_one: { IT: "Seleziona almeno un luogo.", EN: "Select at least one place.", FR: "Sélectionne au moins un lieu.", ES: "Selecciona al menos un lugar.", DE: "Wähle mindestens einen Ort.", RU: "Выберите хотя бы одно место.", ZH: "请至少选择一个地点。" },
  vis_reel_saved: { IT: "💛 Salvati: {n}.", EN: "💛 Saved: {n}.", FR: "💛 Enregistrés : {n}.", ES: "💛 Guardados: {n}.", DE: "💛 Gespeichert: {n}.", RU: "💛 Сохранено: {n}.", ZH: "💛 已保存：{n}。" },
  vis_reel_in_favorites: { IT: "{n} nei preferiti", EN: "{n} in favorites", FR: "{n} dans les favoris", ES: "{n} en favoritos", DE: "{n} in den Favoriten", RU: "{n} в избранном", ZH: "{n} 个已收藏" },
  vis_reel_in_wishlist: { IT: "{n} nella wishlist (non ancora sulla mappa WIP)", EN: "{n} in the wishlist (not on the WIP map yet)", FR: "{n} dans la wishlist (pas encore sur la carte WIP)", ES: "{n} en la wishlist (aún no están en el mapa WIP)", DE: "{n} auf der Wunschliste (noch nicht auf der WIP-Karte)", RU: "{n} в списке желаний (пока нет на карте WIP)", ZH: "{n} 个在心愿单中（尚未出现在 WIP 地图上）" },
  vis_reel_offline: { IT: "Per estrarre i luoghi da uno screenshot serve la connessione: lo screenshot resta in galleria, riprova quando torni online.", EN: "Extracting places from a screenshot needs a connection: the screenshot stays in your gallery, try again when you're back online.", FR: "Extraire les lieux d'une capture demande une connexion : la capture reste dans la galerie, réessaie quand tu seras de nouveau en ligne.", ES: "Para extraer los lugares de una captura hace falta conexión: la captura se queda en la galería, inténtalo de nuevo cuando vuelvas a estar en línea.", DE: "Um Orte aus einem Screenshot zu extrahieren, brauchst du eine Verbindung: Der Screenshot bleibt in der Galerie, versuch es erneut, sobald du wieder online bist.", RU: "Для извлечения мест из скриншота нужна сеть: скриншот останется в галерее, повторите попытку, когда появится подключение.", ZH: "从截图中提取地点需要联网：截图会保留在相册中，请在恢复联网后重试。" },
  vis_service_name: { IT: "Visione AI", EN: "AI Vision", FR: "Vision IA", ES: "Visión IA", DE: "KI-Vision", RU: "ИИ-зрение", ZH: "AI 视觉" },
  vis_service_artwork: { IT: "Visione AI — Opera d'arte", EN: "AI Vision — Artwork", FR: "Vision IA — Œuvre d'art", ES: "Visión IA — Obra de arte", DE: "KI-Vision — Kunstwerk", RU: "ИИ-зрение — Произведение искусства", ZH: "AI 视觉 — 艺术品" },
  vis_service_nature: { IT: "Visione AI — Natura", EN: "AI Vision — Nature", FR: "Vision IA — Nature", ES: "Visión IA — Naturaleza", DE: "KI-Vision — Natur", RU: "ИИ-зрение — Природа", ZH: "AI 视觉 — 自然" },
  vis_service_reel: { IT: "Da reel a itinerario", EN: "From reel to itinerary", FR: "Du reel à l'itinéraire", ES: "De reel a itinerario", DE: "Vom Reel zur Route", RU: "Из рилса в маршрут", ZH: "从短视频到行程" },
  vis_queue_recognized: { IT: "✅ Foto in coda riconosciuta: {name}", EN: "✅ Queued photo recognized: {name}", FR: "✅ Photo en attente reconnue : {name}", ES: "✅ Foto en cola reconocida: {name}", DE: "✅ Foto aus der Warteschlange erkannt: {name}", RU: "✅ Фото из очереди распознано: {name}", ZH: "✅ 队列中的照片已识别：{name}" },
  vis_queue_not_recognized: { IT: "Foto in coda non riconosciuta: crediti rimborsati, la trovi in My Vision.", EN: "Queued photo not recognized: credits refunded, you'll find it in My Vision.", FR: "Photo en attente non reconnue : crédits remboursés, tu la retrouves dans My Vision.", ES: "Foto en cola no reconocida: créditos reembolsados, la encuentras en My Vision.", DE: "Foto aus der Warteschlange nicht erkannt: Guthaben erstattet, du findest es in My Vision.", RU: "Фото из очереди не распознано: кредиты возвращены, оно сохранено в My Vision.", ZH: "队列中的照片未识别：积分已退还，可在 My Vision 中查看。" },
  vis_pass_login: { IT: "Accedi con il tuo account per attivare il Pass Museo.", EN: "Sign in with your account to activate the Museum Pass.", FR: "Connecte-toi avec ton compte pour activer le Pass Musée.", ES: "Inicia sesión con tu cuenta para activar el Pase Museo.", DE: "Melde dich mit deinem Konto an, um den Museumspass zu aktivieren.", RU: "Войдите в аккаунт, чтобы активировать Музейный пасс.", ZH: "请登录账号以激活博物馆通票。" },
  vis_privacy_people: { IT: "Nella foto ci sono persone riconoscibili: se verrà pubblicata, i volti saranno sfocati.", EN: "There are recognizable people in the photo: if it gets published, faces will be blurred.", FR: "Il y a des personnes reconnaissables sur la photo : si elle est publiée, les visages seront floutés.", ES: "En la foto hay personas reconocibles: si se publica, las caras se difuminarán.", DE: "Auf dem Foto sind erkennbare Personen: Wird es veröffentlicht, werden die Gesichter unkenntlich gemacht.", RU: "На фото есть узнаваемые люди: в случае публикации лица будут размыты.", ZH: "照片中有可辨认的人物：如果发布，面部将被模糊处理。" },
  // MyVisionTab
  vis_my_title: { IT: "My Vision", EN: "My Vision", FR: "My Vision", ES: "My Vision", DE: "My Vision", RU: "My Vision", ZH: "My Vision" },
  vis_shot_one: { IT: "scatto", EN: "shot", FR: "photo", ES: "foto", DE: "Aufnahme", RU: "снимок", ZH: "张照片" },
  vis_shot_many: { IT: "scatti", EN: "shots", FR: "photos", ES: "fotos", DE: "Aufnahmen", RU: "снимков", ZH: "张照片" },
  vis_my_sub: { IT: "Ogni foto approvata diventa un luogo WIP Community e ti premia in crediti.", EN: "Every approved photo becomes a WIP Community place and rewards you with credits.", FR: "Chaque photo approuvée devient un lieu WIP Community et te rapporte des crédits.", ES: "Cada foto aprobada se convierte en un lugar WIP Community y te premia con créditos.", DE: "Jedes freigegebene Foto wird zu einem Ort der WIP Community und bringt dir Credits.", RU: "Каждое одобренное фото становится местом WIP Community и приносит вам кредиты.", ZH: "每张通过审核的照片都会成为 WIP Community 地点，并为你赢得积分。" },
  vis_tab_mine: { IT: "Le mie Vision", EN: "My Visions", FR: "Mes Visions", ES: "Mis Visions", DE: "Meine Visions", RU: "Мои Vision", ZH: "我的 Vision" },
  vis_tab_community: { IT: "WIP Community", EN: "WIP Community", FR: "WIP Community", ES: "WIP Community", DE: "WIP Community", RU: "WIP Community", ZH: "WIP Community" },
  vis_badge_published: { IT: "WIP Community", EN: "WIP Community", FR: "WIP Community", ES: "WIP Community", DE: "WIP Community", RU: "WIP Community", ZH: "WIP Community" },
  vis_badge_memory: { IT: "Ricordo", EN: "Memory", FR: "Souvenir", ES: "Recuerdo", DE: "Erinnerung", RU: "Воспоминание", ZH: "回忆" },
  vis_badge_pending: { IT: "In revisione", EN: "Under review", FR: "En révision", ES: "En revisión", DE: "In Prüfung", RU: "На проверке", ZH: "审核中" },
  vis_badge_rejected: { IT: "Non pubblicata", EN: "Not published", FR: "Non publiée", ES: "No publicada", DE: "Nicht veröffentlicht", RU: "Не опубликовано", ZH: "未发布" },
  vis_badge_first: { IT: "Primo scopritore", EN: "First discoverer", FR: "Premier découvreur", ES: "Primer descubridor", DE: "Erstentdecker", RU: "Первооткрыватель", ZH: "首位发现者" },
  vis_loading: { IT: "Caricamento delle tue Vision…", EN: "Loading your Visions…", FR: "Chargement de tes Visions…", ES: "Cargando tus Visions…", DE: "Deine Visions werden geladen…", RU: "Загрузка ваших Vision…", ZH: "正在加载你的 Vision…" },
  vis_loading_community: { IT: "Caricamento WIP Community…", EN: "Loading WIP Community…", FR: "Chargement de la WIP Community…", ES: "Cargando WIP Community…", DE: "WIP Community wird geladen…", RU: "Загрузка WIP Community…", ZH: "正在加载 WIP Community…" },
  vis_empty_title: { IT: "Nessuna Vision", EN: "No Visions", FR: "Aucune Vision", ES: "Ninguna Vision", DE: "Keine Visions", RU: "Пока нет Vision", ZH: "暂无 Vision" },
  vis_empty_desc: { IT: "Scatta una foto a un monumento, un panorama o un'opera d'arte dalla fotocamera: l'AI la riconosce e la scheda arriva qui.", EN: "Take a photo of a monument, a landscape or an artwork from the camera: the AI recognizes it and the card lands here.", FR: "Prends en photo un monument, un paysage ou une œuvre d'art depuis l'appareil : l'IA la reconnaît et la fiche arrive ici.", ES: "Haz una foto a un monumento, un paisaje o una obra de arte desde la cámara: la IA la reconoce y la ficha llega aquí.", DE: "Fotografiere mit der Kamera ein Denkmal, eine Landschaft oder ein Kunstwerk: Die KI erkennt es und die Karte landet hier.", RU: "Сфотографируйте памятник, пейзаж или произведение искусства через камеру: ИИ распознает его, и карточка появится здесь.", ZH: "用相机拍摄一座纪念碑、一处风景或一件艺术品：AI 会识别它，卡片就会出现在这里。" },
  vis_comm_empty_title: { IT: "Ancora nessuna Vision pubblicata", EN: "No Visions published yet", FR: "Aucune Vision publiée pour l'instant", ES: "Aún no hay Visions publicadas", DE: "Noch keine Visions veröffentlicht", RU: "Пока нет опубликованных Vision", ZH: "还没有发布的 Vision" },
  vis_comm_empty_desc: { IT: "Qui compaiono le foto approvate dei viaggiatori WIP. La prossima potrebbe essere la tua!", EN: "Approved photos from WIP travelers show up here. The next one could be yours!", FR: "Ici apparaissent les photos approuvées des voyageurs WIP. La prochaine pourrait être la tienne !", ES: "Aquí aparecen las fotos aprobadas de los viajeros WIP. ¡La próxima podría ser la tuya!", DE: "Hier erscheinen die freigegebenen Fotos der WIP-Reisenden. Das nächste könnte deins sein!", RU: "Здесь появляются одобренные фото путешественников WIP. Следующим может быть ваше!", ZH: "这里展示 WIP 旅行者通过审核的照片。下一张可能就是你的！" },
  vis_delete_confirm: { IT: "Cancellare \"{name}\" dal tuo album? L'operazione non si può annullare.", EN: "Delete \"{name}\" from your album? This can't be undone.", FR: "Supprimer « {name} » de ton album ? Cette action est irréversible.", ES: "¿Eliminar \"{name}\" de tu álbum? Esta acción no se puede deshacer.", DE: "„{name}“ aus deinem Album löschen? Das lässt sich nicht rückgängig machen.", RU: "Удалить «{name}» из вашего альбома? Это действие нельзя отменить.", ZH: "要从相册中删除“{name}”吗？此操作无法撤销。" },
  vis_delete_retract: { IT: "Questa foto è pubblicata nella WIP Community: verrà ritirata anche da lì.", EN: "This photo is published in the WIP Community: it will be removed from there too.", FR: "Cette photo est publiée dans la WIP Community : elle en sera retirée aussi.", ES: "Esta foto está publicada en la WIP Community: también se retirará de allí.", DE: "Dieses Foto ist in der WIP Community veröffentlicht: Es wird auch dort entfernt.", RU: "Это фото опубликовано в WIP Community: оно будет удалено и оттуда.", ZH: "这张照片已发布到 WIP Community：也会从那里撤回。" },
  vis_deleted: { IT: "Scatto cancellato dal tuo album.", EN: "Shot deleted from your album.", FR: "Photo supprimée de ton album.", ES: "Foto eliminada de tu álbum.", DE: "Aufnahme aus deinem Album gelöscht.", RU: "Снимок удалён из вашего альбома.", ZH: "照片已从相册中删除。" },
  vis_delete_failed: { IT: "Cancellazione non riuscita: riprova.", EN: "Deletion failed: try again.", FR: "Suppression échouée : réessaie.", ES: "No se pudo eliminar: inténtalo de nuevo.", DE: "Löschen fehlgeschlagen: Versuch es erneut.", RU: "Не удалось удалить: попробуйте ещё раз.", ZH: "删除失败，请重试。" },
  vis_feed_near: { IT: "Vicino a me", EN: "Near me", FR: "Près de moi", ES: "Cerca de mí", DE: "In meiner Nähe", RU: "Рядом со мной", ZH: "附近" },
  vis_feed_recent: { IT: "Più recenti", EN: "Most recent", FR: "Plus récentes", ES: "Más recientes", DE: "Neueste", RU: "Новые", ZH: "最新" },
  vis_load_more: { IT: "Carica altri", EN: "Load more", FR: "Charger plus", ES: "Cargar más", DE: "Mehr laden", RU: "Загрузить ещё", ZH: "加载更多" },
  vis_today: { IT: "Oggi", EN: "Today", FR: "Aujourd'hui", ES: "Hoy", DE: "Heute", RU: "Сегодня", ZH: "今天" },
  vis_updates_approved: { IT: "{n} foto pubblicate nella WIP Community (+{credits} crediti)", EN: "{n} photos published in the WIP Community (+{credits} credits)", FR: "{n} photos publiées dans la WIP Community (+{credits} crédits)", ES: "{n} fotos publicadas en la WIP Community (+{credits} créditos)", DE: "{n} Fotos in der WIP Community veröffentlicht (+{credits} Credits)", RU: "{n} фото опубликовано в WIP Community (+{credits} кредитов)", ZH: "{n} 张照片已发布到 WIP Community（+{credits} 积分）" },
  vis_updates_rejected: { IT: "{n} foto non pubblicate", EN: "{n} photos not published", FR: "{n} photos non publiées", ES: "{n} fotos no publicadas", DE: "{n} Fotos nicht veröffentlicht", RU: "{n} фото не опубликовано", ZH: "{n} 张照片未发布" },
  vis_updates_dismiss: { IT: "Ok", EN: "OK", FR: "Ok", ES: "Ok", DE: "Ok", RU: "Ок", ZH: "好的" },
  vis_reason_duplicate: { IT: "Luogo già presente sulla mappa", EN: "Place already on the map", FR: "Lieu déjà présent sur la carte", ES: "Lugar ya presente en el mapa", DE: "Ort bereits auf der Karte", RU: "Место уже есть на карте", ZH: "地图上已有该地点" },
  vis_reason_not_a_place: { IT: "Non è un luogo di interesse", EN: "Not a place of interest", FR: "Ce n'est pas un lieu d'intérêt", ES: "No es un lugar de interés", DE: "Kein Ort von Interesse", RU: "Не является достопримечательностью", ZH: "不是兴趣点" },
  vis_reason_photo_quality: { IT: "Qualità della foto insufficiente", EN: "Insufficient photo quality", FR: "Qualité de la photo insuffisante", ES: "Calidad de la foto insuficiente", DE: "Unzureichende Fotoqualität", RU: "Недостаточное качество фото", ZH: "照片质量不足" },
  vis_reason_people: { IT: "Persone riconoscibili nella foto", EN: "Recognizable people in the photo", FR: "Personnes reconnaissables sur la photo", ES: "Personas reconocibles en la foto", DE: "Erkennbare Personen auf dem Foto", RU: "На фото узнаваемые люди", ZH: "照片中有可辨认的人物" },
  vis_reason_inappropriate: { IT: "Contenuto non adatto", EN: "Inappropriate content", FR: "Contenu inapproprié", ES: "Contenido no adecuado", DE: "Unangemessener Inhalt", RU: "Неприемлемое содержание", ZH: "内容不适宜" },
  vis_reason_other: { IT: "Altro", EN: "Other", FR: "Autre", ES: "Otro", DE: "Sonstiges", RU: "Другое", ZH: "其他" },
  vis_reason_label: { IT: "Motivo", EN: "Reason", FR: "Motif", ES: "Motivo", DE: "Grund", RU: "Причина", ZH: "原因" },
  vis_published_label: { IT: "Pubblicata", EN: "Published", FR: "Publiée", ES: "Publicada", DE: "Veröffentlicht", RU: "Опубликовано", ZH: "已发布" },
  vis_community_label: { IT: "Community", EN: "Community", FR: "Communauté", ES: "Comunidad", DE: "Community", RU: "Сообщество", ZH: "社区" },
  // VisionCardSheet
  vis_section_desc: { IT: "Descrizione", EN: "Description", FR: "Description", ES: "Descripción", DE: "Beschreibung", RU: "Описание", ZH: "描述" },
  vis_section_history: { IT: "Storia", EN: "History", FR: "Histoire", ES: "Historia", DE: "Geschichte", RU: "История", ZH: "历史" },
  vis_section_curiosity: { IT: "Curiosità", EN: "Fun facts", FR: "Anecdotes", ES: "Curiosidades", DE: "Wissenswertes", RU: "Интересные факты", ZH: "趣闻" },
  vis_ai_disclaimer: { IT: "Scheda generata dall'AI e salvata nella tua collezione.", EN: "Card generated by AI and saved to your collection.", FR: "Fiche générée par l'IA et enregistrée dans ta collection.", ES: "Ficha generada por la IA y guardada en tu colección.", DE: "Von der KI erstellte Karte, in deiner Sammlung gespeichert.", RU: "Карточка создана ИИ и сохранена в вашей коллекции.", ZH: "卡片由 AI 生成，已保存到你的收藏。" },
  vis_close: { IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", DE: "Schließen", RU: "Закрыть", ZH: "关闭" },
  vis_ask_more: { IT: "Chiedi di più", EN: "Ask for more", FR: "En savoir plus", ES: "Pregunta más", DE: "Mehr erfahren", RU: "Узнать больше", ZH: "了解更多" },
  vis_ask_more_context: { IT: "Sto guardando la scheda Vision \"{name}\". Raccontami altri dettagli e rispondi alle mie domande su questo luogo.", EN: "I'm looking at the Vision card \"{name}\". Tell me more details and answer my questions about this place.", FR: "Je regarde la fiche Vision « {name} ». Donne-moi plus de détails et réponds à mes questions sur ce lieu.", ES: "Estoy viendo la ficha Vision \"{name}\". Cuéntame más detalles y responde a mis preguntas sobre este lugar.", DE: "Ich sehe mir die Vision-Karte „{name}“ an. Erzähl mir mehr Details und beantworte meine Fragen zu diesem Ort.", RU: "Я смотрю карточку Vision «{name}». Расскажите подробнее и ответьте на мои вопросы об этом месте.", ZH: "我正在查看 Vision 卡片“{name}”。请告诉我更多细节，并回答我关于这个地点的问题。" },
  vis_save_photo: { IT: "Salva la foto sul dispositivo", EN: "Save photo to device", FR: "Enregistrer la photo sur l'appareil", ES: "Guardar la foto en el dispositivo", DE: "Foto auf dem Gerät speichern", RU: "Сохранить фото на устройство", ZH: "保存照片到设备" },
  vis_share_photo: { IT: "Condividi la foto", EN: "Share photo", FR: "Partager la photo", ES: "Compartir la foto", DE: "Foto teilen", RU: "Поделиться фото", ZH: "分享照片" },
  vis_listen: { IT: "Ascolta la scheda", EN: "Listen to the card", FR: "Écouter la fiche", ES: "Escuchar la ficha", DE: "Karte anhören", RU: "Прослушать карточку", ZH: "收听卡片" },
  vis_pause: { IT: "Metti in pausa", EN: "Pause", FR: "Mettre en pause", ES: "Pausar", DE: "Pausieren", RU: "Пауза", ZH: "暂停" },
  vis_saved_docs: { IT: "Foto salvata in Documenti/WIP Vision.", EN: "Photo saved to Documents/WIP Vision.", FR: "Photo enregistrée dans Documents/WIP Vision.", ES: "Foto guardada en Documentos/WIP Vision.", DE: "Foto in Dokumente/WIP Vision gespeichert.", RU: "Фото сохранено в Документы/WIP Vision.", ZH: "照片已保存到 文档/WIP Vision。" },
  vis_photo_unavailable: { IT: "Foto non disponibile per il download.", EN: "Photo not available for download.", FR: "Photo non disponible au téléchargement.", ES: "Foto no disponible para descargar.", DE: "Foto nicht zum Download verfügbar.", RU: "Фото недоступно для скачивания.", ZH: "照片无法下载。" },
  vis_save_failed: { IT: "Salvataggio non riuscito, riprova.", EN: "Saving failed, try again.", FR: "Enregistrement échoué, réessaie.", ES: "No se pudo guardar, inténtalo de nuevo.", DE: "Speichern fehlgeschlagen, versuch es erneut.", RU: "Не удалось сохранить, попробуйте ещё раз.", ZH: "保存失败，请重试。" },
  vis_share_fallback: { IT: "Condivisione non disponibile: foto salvata in locale.", EN: "Sharing not available: photo saved locally.", FR: "Partage indisponible : photo enregistrée en local.", ES: "Compartir no disponible: foto guardada en local.", DE: "Teilen nicht verfügbar: Foto lokal gespeichert.", RU: "Поделиться нельзя: фото сохранено локально.", ZH: "无法分享：照片已保存到本地。" },
  vis_share_text: { IT: "Scoperto con WIP Vision · wip.guide", EN: "Discovered with WIP Vision · wip.guide", FR: "Découvert avec WIP Vision · wip.guide", ES: "Descubierto con WIP Vision · wip.guide", DE: "Entdeckt mit WIP Vision · wip.guide", RU: "Открыто с WIP Vision · wip.guide", ZH: "由 WIP Vision 发现 · wip.guide" },
  vis_open_on_map: { IT: "Vedi sulla mappa", EN: "See on map", FR: "Voir sur la carte", ES: "Ver en el mapa", DE: "Auf der Karte ansehen", RU: "Показать на карте", ZH: "在地图上查看" },
  // VisionCommentModal
  vis_comment_title: { IT: "Non l'ho riconosciuta… ma di sicuro è speciale!", EN: "I didn't recognize it… but it's surely special!", FR: "Je ne l'ai pas reconnu… mais c'est sûrement spécial !", ES: "No la he reconocido… ¡pero seguro que es especial!", DE: "Ich habe es nicht erkannt… aber es ist bestimmt etwas Besonderes!", RU: "Не удалось распознать… но это наверняка что-то особенное!", ZH: "没能认出来……但它一定很特别！" },
  vis_comment_refunded: { IT: "I tuoi crediti sono stati rimborsati e la foto è salvata in My Vision.", EN: "Your credits have been refunded and the photo is saved in My Vision.", FR: "Tes crédits ont été remboursés et la photo est enregistrée dans My Vision.", ES: "Tus créditos se han reembolsado y la foto está guardada en My Vision.", DE: "Dein Guthaben wurde erstattet und das Foto ist in My Vision gespeichert.", RU: "Кредиты возвращены, а фото сохранено в My Vision.", ZH: "你的积分已退还，照片已保存到 My Vision。" },
  vis_comment_saved: { IT: "La foto è salvata in My Vision.", EN: "The photo is saved in My Vision.", FR: "La photo est enregistrée dans My Vision.", ES: "La foto está guardada en My Vision.", DE: "Das Foto ist in My Vision gespeichert.", RU: "Фото сохранено в My Vision.", ZH: "照片已保存到 My Vision。" },
  vis_comment_ask: { IT: "Raccontaci perché questo posto è speciale: il tuo racconto aiuterà la revisione per WIP Community.", EN: "Tell us why this place is special: your story will help the WIP Community review.", FR: "Raconte-nous pourquoi ce lieu est spécial : ton récit aidera la révision pour la WIP Community.", ES: "Cuéntanos por qué este lugar es especial: tu relato ayudará en la revisión para WIP Community.", DE: "Erzähl uns, warum dieser Ort besonders ist: Deine Geschichte hilft bei der Prüfung für die WIP Community.", RU: "Расскажите, чем особенно это место: ваш рассказ поможет при проверке для WIP Community.", ZH: "告诉我们这个地方为什么特别：你的讲述将有助于 WIP Community 的审核。" },
  vis_comment_placeholder: { IT: "Scrivi qualcosa su questo posto… (facoltativo)", EN: "Write something about this place… (optional)", FR: "Écris quelque chose sur ce lieu… (facultatif)", ES: "Escribe algo sobre este lugar… (opcional)", DE: "Schreib etwas über diesen Ort… (optional)", RU: "Напишите что-нибудь об этом месте… (необязательно)", ZH: "写点关于这个地方的内容……（可选）" },
  vis_comment_skip: { IT: "Salta", EN: "Skip", FR: "Passer", ES: "Omitir", DE: "Überspringen", RU: "Пропустить", ZH: "跳过" },
  vis_comment_send: { IT: "Invia il racconto", EN: "Send your story", FR: "Envoyer le récit", ES: "Enviar el relato", DE: "Geschichte senden", RU: "Отправить рассказ", ZH: "发送讲述" },
  vis_comment_footer: { IT: "Se la foto verrà approvata diventerà un luogo WIP Community", EN: "If the photo is approved it will become a WIP Community place", FR: "Si la photo est approuvée, elle deviendra un lieu WIP Community", ES: "Si la foto se aprueba, se convertirá en un lugar WIP Community", DE: "Wird das Foto freigegeben, wird es zu einem Ort der WIP Community", RU: "Если фото одобрят, оно станет местом WIP Community", ZH: "如果照片通过审核，将成为 WIP Community 地点" },
  vis_comment_thanks: { IT: "Grazie! Il tuo racconto aiuterà la revisione della foto.", EN: "Thanks! Your story will help with the photo review.", FR: "Merci ! Ton récit aidera la révision de la photo.", ES: "¡Gracias! Tu relato ayudará en la revisión de la foto.", DE: "Danke! Deine Geschichte hilft bei der Prüfung des Fotos.", RU: "Спасибо! Ваш рассказ поможет при проверке фото.", ZH: "谢谢！你的讲述将有助于照片审核。" },
  vis_comment_failed: { IT: "Invio non riuscito: la foto resta comunque salvata in My Vision.", EN: "Sending failed: the photo is still saved in My Vision.", FR: "Envoi échoué : la photo reste quand même enregistrée dans My Vision.", ES: "No se pudo enviar: la foto sigue guardada en My Vision.", DE: "Senden fehlgeschlagen: Das Foto bleibt trotzdem in My Vision gespeichert.", RU: "Не удалось отправить: фото всё равно сохранено в My Vision.", ZH: "发送失败：照片仍已保存在 My Vision 中。" },
  vis_saved_in_myvision: { IT: "Salvata in My Vision", EN: "Saved in My Vision", FR: "Enregistrée dans My Vision", ES: "Guardada en My Vision", DE: "In My Vision gespeichert", RU: "Сохранено в My Vision", ZH: "已保存到 My Vision" },
  vis_tag_view: { IT: "Panorama speciale", EN: "Special view", FR: "Panorama spécial", ES: "Vista especial", DE: "Besondere Aussicht", RU: "Особенный вид", ZH: "特别风景" },
  vis_tag_hidden: { IT: "Angolo nascosto", EN: "Hidden corner", FR: "Coin caché", ES: "Rincón escondido", DE: "Verstecktes Plätzchen", RU: "Укромный уголок", ZH: "隐秘角落" },
  vis_tag_street_art: { IT: "Arte di strada", EN: "Street art", FR: "Street art", ES: "Arte urbano", DE: "Street Art", RU: "Стрит-арт", ZH: "街头艺术" },
  vis_tag_tradition: { IT: "Tradizione locale", EN: "Local tradition", FR: "Tradition locale", ES: "Tradición local", DE: "Lokale Tradition", RU: "Местная традиция", ZH: "当地传统" },
  vis_tag_nature: { IT: "Natura", EN: "Nature", FR: "Nature", ES: "Naturaleza", DE: "Natur", RU: "Природа", ZH: "自然" },
  vis_tag_memory: { IT: "Ricordo di viaggio", EN: "Travel memory", FR: "Souvenir de voyage", ES: "Recuerdo de viaje", DE: "Reiseerinnerung", RU: "Воспоминание о поездке", ZH: "旅行回忆" },
  // PlanScreen
  vis_reel_banner: { IT: "Itinerario dal reel: {n} luoghi da includere", EN: "Itinerary from the reel: {n} places to include", FR: "Itinéraire depuis le reel : {n} lieux à inclure", ES: "Itinerario desde el reel: {n} lugares a incluir", DE: "Route aus dem Reel: {n} Orte zum Aufnehmen", RU: "Маршрут из рилса: {n} мест для включения", ZH: "来自短视频的行程：包含 {n} 个地点" },
  vis_reel_banner_cancel: { IT: "Annulla", EN: "Cancel", FR: "Annuler", ES: "Cancelar", DE: "Abbrechen", RU: "Отмена", ZH: "取消" },
  // ── Tematici (21/08/2026) ──
  // La macro-chip 🧭 e i suoi otto verticali. Le chiavi sono nude (terme,
  // cinema, cieli…) perché sono le stesse in shared_pois.category, nei chip,
  // in GeoControl e qui: una chiave sola per tutta la catena.
  tematiche: { IT: "Tematici", EN: "Themes", FR: "Thématiques", ES: "Temáticos", DE: "Themen", RU: "Тематики", ZH: "主题" },
  terme: { IT: "Terme e sorgenti", EN: "Hot springs & spas", FR: "Thermes et sources", ES: "Termas y manantiales", DE: "Thermen & Quellen", RU: "Термы и источники", ZH: "温泉与浴场" },
  cinema: { IT: "Location di film e serie", EN: "Film & series locations", FR: "Lieux de tournage", ES: "Localizaciones de cine y series", DE: "Film- & Seriendrehorte", RU: "Локации фильмов и сериалов", ZH: "影视取景地" },
  cieli: { IT: "Cieli bui e stelle", EN: "Dark skies & stargazing", FR: "Ciels étoilés", ES: "Cielos oscuros y estrellas", DE: "Dunkler Himmel & Sterne", RU: "Тёмное небо и звёзды", ZH: "暗夜星空" },
  street_art: { IT: "Street art", EN: "Street art", FR: "Street art", ES: "Arte urbano", DE: "Street Art", RU: "Стрит-арт", ZH: "街头艺术" },
  mercati: { IT: "Mercati e mercatini", EN: "Markets & fairs", FR: "Marchés et brocantes", ES: "Mercados y mercadillos", DE: "Märkte & Trödelmärkte", RU: "Рынки и ярмарки", ZH: "市集与市场" },
  fioriture: { IT: "Fioriture", EN: "Blossoms & blooms", FR: "Floraisons", ES: "Floraciones", DE: "Blütezeiten", RU: "Цветение", ZH: "花期" },
  memoria: { IT: "Memoria e case-museo", EN: "Memory & house museums", FR: "Mémoire et maisons-musées", ES: "Memoria y casas museo", DE: "Erinnerung & Hausmuseen", RU: "Память и дома-музеи", ZH: "纪念地与故居博物馆" },
  lento: { IT: "Viaggio lento", EN: "Slow travel", FR: "Voyage lent", ES: "Viaje lento", DE: "Langsames Reisen", RU: "Медленные путешествия", ZH: "慢旅行" },
  tem_sheet_title: { IT: "Itinerari tematici", EN: "Themed itineraries", FR: "Itinéraires thématiques", ES: "Itinerarios temáticos", DE: "Themenrouten", RU: "Тематические маршруты", ZH: "主题行程" },
  tem_sheet_desc: { IT: "Terme, set cinematografici, cieli stellati, murales, mercatini, fioriture, luoghi della memoria e viaggi lenti: scegli un tema e un luogo, WIP compone il giro.", EN: "Hot springs, film sets, starry skies, murals, markets, blossoms, places of memory and slow journeys: pick a theme and a place, WIP builds the tour.", FR: "Thermes, lieux de tournage, ciels étoilés, fresques, marchés, floraisons, lieux de mémoire et voyages lents : choisis un thème et un lieu, WIP compose la balade.", ES: "Termas, sets de rodaje, cielos estrellados, murales, mercadillos, floraciones, lugares de memoria y viajes lentos: elige un tema y un lugar, WIP compone la ruta.", DE: "Thermen, Filmkulissen, Sternenhimmel, Wandbilder, Märkte, Blütezeiten, Erinnerungsorte und langsames Reisen: Wähle ein Thema und einen Ort, WIP stellt die Tour zusammen.", RU: "Термы, съёмочные площадки, звёздное небо, муралы, рынки, цветение, места памяти и медленные путешествия: выберите тему и место — WIP составит маршрут.", ZH: "温泉、影视取景地、星空、壁画、市集、花期、纪念地与慢旅行：选一个主题和一个地点，WIP 为你编排行程。" },
  tem_near_me: { IT: "Vicino a me", EN: "Near me", FR: "Près de moi", ES: "Cerca de mí", DE: "In meiner Nähe", RU: "Рядом со мной", ZH: "我的附近" },
  tem_all_world: { IT: "Nel mondo", EN: "Worldwide", FR: "Dans le monde", ES: "En el mundo", DE: "Weltweit", RU: "По всему миру", ZH: "全球" },
  tem_free: { IT: "Gratis", EN: "Free", FR: "Gratuit", ES: "Gratis", DE: "Kostenlos", RU: "Бесплатно", ZH: "免费" },
  tem_paid: { IT: "Con biglietto", EN: "With ticket", FR: "Avec billet", ES: "Con entrada", DE: "Mit Ticket", RU: "По билету", ZH: "需购票" },
  tem_use_plan: { IT: "Crea l'itinerario", EN: "Create the itinerary", FR: "Créer l'itinéraire", ES: "Crear el itinerario", DE: "Route erstellen", RU: "Создать маршрут", ZH: "生成行程" },
  tem_stagionali: { IT: "Stagionali", EN: "Seasonal", FR: "Saisonniers", ES: "De temporada", DE: "Saisonal", RU: "Сезонные", ZH: "季节性" },
  tem_stelle_tonight: { IT: "Stanotte sotto le stelle", EN: "Tonight under the stars", FR: "Cette nuit sous les étoiles", ES: "Esta noche bajo las estrellas", DE: "Heute Nacht unter den Sternen", RU: "Сегодня ночью под звёздами", ZH: "今夜观星" },
  tem_stelle_clouds: { IT: "Nuvolosità prevista", EN: "Expected cloud cover", FR: "Nébulosité prévue", ES: "Nubosidad prevista", DE: "Erwartete Bewölkung", RU: "Ожидаемая облачность", ZH: "预计云量" },
  tem_stelle_moon: { IT: "Luna", EN: "Moon", FR: "Lune", ES: "Luna", DE: "Mond", RU: "Луна", ZH: "月相" },
  tem_stelle_meteor: { IT: "Sciame meteorico", EN: "Meteor shower", FR: "Pluie d'étoiles filantes", ES: "Lluvia de meteoros", DE: "Meteorschauer", RU: "Метеорный поток", ZH: "流星雨" },
  tem_mercatini_open: { IT: "Mercatini aperti ora", EN: "Markets open now", FR: "Marchés ouverts maintenant", ES: "Mercadillos abiertos ahora", DE: "Jetzt geöffnete Märkte", RU: "Рынки открыты сейчас", ZH: "此刻开放的市集" },
  tem_fioriture_now: { IT: "Fioriture in corso", EN: "Blooming now", FR: "Floraisons en cours", ES: "Floraciones en curso", DE: "Blüht gerade", RU: "Цветёт сейчас", ZH: "正在花期" },
  tem_fioriture_soon: { IT: "In arrivo", EN: "Coming soon", FR: "Bientôt", ES: "Próximamente", DE: "Demnächst", RU: "Скоро", ZH: "即将开放" },
  tem_no_data: { IT: "Nessun dato per questa zona", EN: "No data for this area", FR: "Aucune donnée pour cette zone", ES: "No hay datos para esta zona", DE: "Keine Daten für dieses Gebiet", RU: "Нет данных по этой зоне", ZH: "该区域暂无数据" },
  tem_bortle: { IT: "Cielo (scala Bortle)", EN: "Sky (Bortle scale)", FR: "Ciel (échelle de Bortle)", ES: "Cielo (escala Bortle)", DE: "Himmel (Bortle-Skala)", RU: "Небо (шкала Бортля)", ZH: "夜空（波特尔等级）" },
  tem_free_access: { IT: "Accesso libero", EN: "Free access", FR: "Accès libre", ES: "Acceso libre", DE: "Freier Zugang", RU: "Свободный доступ", ZH: "自由进入" },
  // Navigazione a piedi (NavigationOverlay) — prima erano hardcoded in IT
  nav_calculating: { IT: "Calcolo del percorso…", EN: "Calculating route…", FR: "Calcul de l'itinéraire…", ES: "Calculando la ruta…", DE: "Route wird berechnet…", RU: "Расчёт маршрута…", ZH: "正在计算路线…" },
  nav_proceed: { IT: "Prosegui", EN: "Continue", FR: "Continuez", ES: "Continúa", DE: "Weiter", RU: "Продолжайте", ZH: "继续前行" },
  nav_in: { IT: "tra", EN: "in", FR: "dans", ES: "en", DE: "in", RU: "через", ZH: "还有" },
  nav_arrived: { IT: "Sei arrivato!", EN: "You've arrived!", FR: "Vous êtes arrivé !", ES: "¡Has llegado!", DE: "Sie sind angekommen!", RU: "Вы прибыли!", ZH: "您已到达！" },
  nav_arrived_at: { IT: "Sei arrivato a", EN: "You arrived at", FR: "Vous êtes arrivé à", ES: "Has llegado a", DE: "Sie sind angekommen in", RU: "Вы прибыли в", ZH: "您已到达" },
  nav_next_stop: { IT: "Vai alla prossima tappa", EN: "Go to next stop", FR: "Aller à l'étape suivante", ES: "Ir a la siguiente parada", DE: "Zum nächsten Halt", RU: "К следующей точке", ZH: "前往下一站" },
  nav_repeat: { IT: "Ripeti istruzione", EN: "Repeat instruction", FR: "Répéter l'instruction", ES: "Repetir instrucción", DE: "Anweisung wiederholen", RU: "Повторить указание", ZH: "重复指令" },
  nav_stop: { IT: "Ferma navigazione", EN: "Stop navigation", FR: "Arrêter la navigation", ES: "Detener navegación", DE: "Navigation beenden", RU: "Остановить навигацию", ZH: "停止导航" },
  // Itinerari offline (lista) — prima hardcoded in IT
  offline_itineraries_title: { IT: "Itinerari Offline", EN: "Offline Itineraries", FR: "Itinéraires hors ligne", ES: "Itinerarios sin conexión", DE: "Offline-Reiserouten", RU: "Офлайн-маршруты", ZH: "离线行程" },
  offline_saved_count: { IT: "salvati", EN: "saved", FR: "enregistrés", ES: "guardados", DE: "gespeichert", RU: "сохранено", ZH: "已保存" },
  offline_none: { IT: "Nessun itinerario scaricato", EN: "No downloaded itineraries", FR: "Aucun itinéraire téléchargé", ES: "Ningún itinerario descargado", DE: "Keine heruntergeladenen Reiserouten", RU: "Нет загруженных маршрутов", ZH: "没有已下载的行程" },
  offline_none_hint: { IT: "Usa il bottone 'Offline' dentro un itinerario generato", EN: "Use the 'Offline' button inside a generated itinerary", FR: "Utilisez le bouton « Hors ligne » dans un itinéraire généré", ES: "Usa el botón 'Sin conexión' dentro de un itinerario generado", DE: "Nutze die Schaltfläche „Offline“ in einer erstellten Reiseroute", RU: "Нажмите «Офлайн» внутри созданного маршрута", ZH: "在已生成的行程中使用“离线”按钮" },
  offline_saved_on: { IT: "Salvato il:", EN: "Saved on:", FR: "Enregistré le :", ES: "Guardado el:", DE: "Gespeichert am:", RU: "Сохранено:", ZH: "保存于：" },
  offline_open: { IT: "Apri Offline", EN: "Open Offline", FR: "Ouvrir hors ligne", ES: "Abrir sin conexión", DE: "Offline öffnen", RU: "Открыть офлайн", ZH: "离线打开" },
  // Contatti POI (bottoni scheda)
  contact_call: { IT: "Chiama", EN: "Call", FR: "Appeler", ES: "Llamar", DE: "Anrufen", RU: "Позвонить", ZH: "拨打电话" },
  contact_site: { IT: "Sito web", EN: "Website", FR: "Site web", ES: "Sitio web", DE: "Webseite", RU: "Сайт", ZH: "网站" },
  contact_hours: { IT: "Orari", EN: "Hours", FR: "Horaires", ES: "Horario", DE: "Öffnungszeiten", RU: "Часы работы", ZH: "营业时间" },
  // Navigation & Core Tabs
  explore: {
    IT: "Esplora",
    EN: "Explore",
    FR: "Explorer",
    ES: "Explorar",
    RU: "Исследовать",
    ZH: "探索"
  , DE: "Entdecken"},
  itinerary: {
    IT: "Itinerario",
    EN: "Itinerary",
    FR: "Itinéraire",
    ES: "Itinerario",
    RU: "Маршрут",
    ZH: "行程"
  , DE: "Reiseroute"},
  guide: {
    IT: "Guida",
    EN: "Guide",
    FR: "Guide",
    ES: "Guía",
    RU: "Путеводитель",
    ZH: "导览"
  , DE: "Guide"},
  profile: {
    IT: "Profilo",
    EN: "Profile",
    FR: "Profil",
    ES: "Perfil",
    RU: "Профиль",
    ZH: "个人"
  , DE: "Profil"},
  
  // Category Chips
  beni_culturali: { IT: "Beni Culturali", EN: "Cultural Heritage", FR: "Patrimoine culturel", ES: "Patrimonio cultural", DE: "Kulturgüter", RU: "Культурное наследие", ZH: "文化遗产" },
  beni_culturali_tutelato: { IT: "Bene culturale tutelato", EN: "Protected heritage site", FR: "Bien culturel protégé", ES: "Bien cultural protegido", DE: "Geschütztes Kulturgut", RU: "Охраняемый объект наследия", ZH: "受保护文化遗产" },
  beni_culturali_no_guida: { IT: "Scheda informativa: questo bene non ha audioguida", EN: "Information only: this site has no audio guide", FR: "Fiche d'information : ce bien n'a pas d'audioguide", ES: "Ficha informativa: este bien no tiene audioguía", DE: "Nur Information: zu diesem Kulturgut gibt es keinen Audioguide", RU: "Только справка: у этого объекта нет аудиогида", ZH: "仅供参考：此地点没有语音导览" },
  beni_culturali_scheda_ufficiale: { IT: "Scheda ufficiale del catalogo", EN: "Official catalogue record", FR: "Fiche officielle du catalogue", ES: "Ficha oficial del catálogo", DE: "Offizieller Katalogeintrag", RU: "Официальная карточка каталога", ZH: "官方目录条目" },
  indirizzo_vicino_a: { IT: "Vicino a", EN: "Near", FR: "Près de", ES: "Cerca de", DE: "In der Nähe von", RU: "Рядом с", ZH: "靠近" },
  beni_culturali_posizione_approssimata: { IT: "Posizione approssimata: il catalogo non dà le coordinate, il punto è il centro del comune", EN: "Approximate location: the register gives no coordinates, this point is the town centre", FR: "Position approximative : le registre ne donne pas de coordonnées, ce point est le centre de la commune", ES: "Ubicación aproximada: el catálogo no da coordenadas, el punto es el centro del municipio", DE: "Ungefähre Lage: Das Register nennt keine Koordinaten, dieser Punkt ist der Ortsmittelpunkt", RU: "Приблизительное расположение: в реестре нет координат, точка — центр населённого пункта", ZH: "位置为近似值：登记册未提供坐标，此点为该市镇中心" },
  monumenti: {
    IT: "Monumenti",
    EN: "Monuments",
    FR: "Monuments",
    ES: "Monumentos",
    RU: "Памятники",
    ZH: "历史遗迹"
  , DE: "Denkmäler"},
  chiese: {
    IT: "Chiese",
    EN: "Churches",
    FR: "Églises",
    ES: "Iglesias",
    RU: "Церкви",
    ZH: "教堂"
  , DE: "Kirchen"},
  musei: {
    IT: "Musei",
    EN: "Museums",
    FR: "Musées",
    ES: "Museos",
    RU: "Музеи",
    ZH: "博物馆"
  , DE: "Museen"},
  panorami: {
    IT: "Panorami",
    EN: "Views",
    FR: "Panoramas",
    ES: "Vistas",
    RU: "Панорамы",
    ZH: "全景"
  , DE: "Aussichten"},
  localita: { IT: "Località", EN: "Villages & towns", FR: "Villages et bourgs", ES: "Pueblos y localidades", DE: "Orte & Dörfer", RU: "Городки и деревни", ZH: "小镇村落" },
  natura: {
    IT: "Natura",
    EN: "Nature",
    FR: "Nature",
    ES: "Naturaleza",
    RU: "Природа",
    ZH: "自然"
  , DE: "Natur"},
  gemme: {
    IT: "Gemme",
    EN: "Gems",
    FR: "Gemmes",
    ES: "Gemas",
    RU: "Жемчужины",
    ZH: "隐藏瑰宝"
  , DE: "Perlen"},
  locali: {
    IT: "Locali",
    EN: "Food & Drinks",
    FR: "Gastronomie",
    ES: "Gastronomía",
    RU: "Заведения",
    ZH: "美食与餐饮"
  , DE: "Essen & Trinken"},
  utilita: {
    IT: "Utilità",
    EN: "Utilities",
    FR: "Utilités",
    ES: "Utilidades",
    RU: "Услуги",
    ZH: "实用设施"
  , DE: "Nützliches"},
  famiglie: {
    IT: "Famiglie",
    EN: "Families",
    FR: "Familles",
    ES: "Familias",
    RU: "Семья",
    ZH: "亲子家庭"
  , DE: "Familien"},
  // Chip del patrimonio del gusto: cantine, vigneti, caseifici, frantoi,
  // birrifici e strade del vino. Distinta da "locali" (dove ci si siede).
  enogastronomia: {
    IT: "Vino e Gusto",
    EN: "Wine & Food",
    FR: "Vin & Terroir",
    ES: "Vino y Sabor",
    RU: "Вино и вкус",
    ZH: "美酒与风味"
  , DE: "Wein & Genuss"},
  // Layer del turismo dello shopping: vie/quartieri, grandi magazzini, mall,
  // outlet, souk/bazaar. Stesso schema di enogastronomia (28/08/2026).
  shopping: {
    IT: "Turismo dello Shopping",
    EN: "Shopping Tourism",
    FR: "Tourisme de Shopping",
    ES: "Turismo de Compras",
    RU: "Шопинг-туризм",
    ZH: "购物旅游"
  , DE: "Shopping-Tourismus"},
  // Layer del turismo di lusso: hotel/resort top di gamma, ristoranti
  // stellati, marine per yacht, treni storici, sci di lusso (28/08/2026).
  lusso: {
    IT: "Turismo di Lusso",
    EN: "Luxury Tourism",
    FR: "Tourisme de Luxe",
    ES: "Turismo de Lujo",
    RU: "Люкс-туризм",
    ZH: "奢华旅游"
  , DE: "Luxustourismus"},
  eventi: {
    IT: "Eventi",
    EN: "Events",
    FR: "Événements",
    ES: "Eventos",
    RU: "События",
    ZH: "精彩活动"
  , DE: "Veranstaltungen"},
  esperienze_locali: {
    IT: "Esperienze Locali",
    EN: "Local Experiences",
    FR: "Expériences Locales",
    ES: "Experiencias Locales",
    RU: "Местный опыт",
    ZH: "当地深度体验"
  , DE: "Lokale Erlebnisse"},
  
  // Subcategories
  monumento: {
    IT: "Monumento",
    EN: "Monument",
    FR: "Monument",
    ES: "Monumento",
    RU: "Памятник",
    ZH: "纪念碑"
  , DE: "Denkmal"},
  chiesa: {
    IT: "Chiesa",
    EN: "Church",
    FR: "Église",
    ES: "Iglesia",
    RU: "Церковь",
    ZH: "教堂"
  , DE: "Kirche"},
  museo: {
    IT: "Museo",
    EN: "Museum",
    FR: "Musée",
    ES: "Museo",
    RU: "Музей",
    ZH: "博物馆"
  , DE: "Museum"},
  panorama: {
    IT: "Panorama",
    EN: "Viewpoint",
    FR: "Panorama",
    ES: "Panorama",
    RU: "Панорама",
    ZH: "观景点/全景"
  , DE: "Aussichtspunkt"},
  piazza: {
    IT: "Piazza",
    EN: "Square",
    FR: "Place",
    ES: "Plaza",
    RU: "Площадь",
    ZH: "广场"
  , DE: "Platz"},
  arte: {
    IT: "Arte",
    EN: "Art",
    FR: "Art",
    ES: "Arte",
    RU: "Искусство",
    ZH: "艺术品"
  , DE: "Kunst"},
  ristorante: {
    IT: "Ristorante",
    EN: "Restaurant",
    FR: "Restaurant",
    ES: "Restaurante",
    RU: "Ресторан",
    ZH: "餐厅"
  , DE: "Restaurant"},
  pizza: {
    IT: "Pizzeria",
    EN: "Pizza",
    FR: "Pizzeria",
    ES: "Pizzería",
    RU: "Пиццерия",
    ZH: "比萨店"
  , DE: "Pizzeria"},
  pesce: {
    IT: "Ristorante di Pesce",
    EN: "Seafood Restaurant",
    FR: "Restaurant de Poisson",
    ES: "Restaurante de Pescado",
    RU: "Рыбный ресторан",
    ZH: "海鲜餐厅"
  , DE: "Fischrestaurant"},
  carne: {
    IT: "Braceria / Carne",
    EN: "Steakhouse",
    FR: "Steakhouse",
    ES: "Asador",
    RU: "Мясной ресторан",
    ZH: "牛排馆/烤肉"
  , DE: "Steakhaus"},
  sushi: {
    IT: "Sushi",
    EN: "Sushi",
    FR: "Sushi",
    ES: "Sushi",
    RU: "Суши",
    ZH: "寿司"
  , DE: "Sushi"},
  vegetariano: {
    IT: "Vegetariano",
    EN: "Vegetarian",
    FR: "Végétarien",
    ES: "Vegetariano",
    RU: "Вегетарианское",
    ZH: "素食/有机"
  , DE: "Vegetarisch"},
  bar_caffe: {
    IT: "Bar & Caffè",
    EN: "Bar & Café",
    FR: "Bar & Café",
    ES: "Bar y Café",
    RU: "Бар и кафе",
    ZH: "咖啡酒吧"
  , DE: "Bar & Café"},
  gelati: {
    IT: "Gelateria",
    EN: "Gelato Shop",
    FR: "Glacier",
    ES: "Heladería",
    RU: "Магазин мороженого",
    ZH: "冰淇淋店"
  , DE: "Eisdiele"},
  gluten_free_only: {
    IT: "Solo Senza Glutine",
    EN: "Strictly Gluten-Free",
    FR: "Uniquement Sans Gluten",
    ES: "Solo Sin Gluten",
    RU: "Только без глютена",
    ZH: "纯无麸质"
  , DE: "Ausschließlich glutenfrei"},
  gluten_free_options: {
    IT: "Opzioni Senza Glutine",
    EN: "Gluten-Free Options",
    FR: "Options Sans Gluten",
    ES: "Opciones Sin Gluten",
    RU: "Есть безглютеновое меню",
    ZH: "有无麸质餐食"
  , DE: "Glutenfreie Optionen"},
  fontanella: {
    IT: "Fontanella",
    EN: "Drinking Water",
    FR: "Eau Potable",
    ES: "Agua Potable",
    RU: "Питьевой фонтанчик",
    ZH: "饮用水/喷泉"
  , DE: "Trinkwasserbrunnen"},
  bagni: {
    IT: "Bagni Pubblici",
    EN: "Public Restrooms",
    FR: "Toilettes Publiques",
    ES: "Aseos Públicos",
    RU: "Общественный туалет",
    ZH: "公共卫生间"
  , DE: "Öffentliche Toiletten"},
  farmacia: {
    IT: "Farmacia",
    EN: "Pharmacy",
    FR: "Pharmacie",
    ES: "Farmacia",
    RU: "Аптека",
    ZH: "药店"
  , DE: "Apotheke"},
  ospedale: {
    IT: "Ospedale / Pronto Soccorso",
    EN: "Hospital / Emergency",
    FR: "Hôpital / Urgences",
    ES: "Hospital / Urgencias",
    RU: "Больница / Скорая помощь",
    ZH: "医院/急诊"
  , DE: "Krankenhaus / Notaufnahme"},
  taxi: {
    IT: "Stazionamento Taxi",
    EN: "Taxi Stand",
    FR: "Station de Taxi",
    ES: "Parada de Taxi",
    RU: "Стоянка такси",
    ZH: "出租车乘车点"
  , DE: "Taxistand"},
  stazione_fs: {
    IT: "Stazione Ferroviaria",
    EN: "Train Station",
    FR: "Gare ferroviaire",
    ES: "Estación de Tren",
    RU: "Железнодорожный вокзал",
    ZH: "火车站"
  , DE: "Bahnhof"},
  metro: {
    IT: "Metropolitana",
    EN: "Subway Station",
    FR: "Station de Métro",
    ES: "Estación de Metro",
    RU: "Станция метро",
    ZH: "地铁站"
  , DE: "U-Bahn-Station"},
  aeroporto: {
    IT: "Aeroporto",
    EN: "Airport",
    FR: "Aéroport",
    ES: "Aeropuerto",
    RU: "Аэропорт",
    ZH: "机场"
  , DE: "Flughafen"},
  autostrada: {
    IT: "Autostrada",
    EN: "Highway",
    FR: "Autoroute",
    ES: "Autopista",
    RU: "Автомагистраль",
    ZH: "高速公路"
  , DE: "Autobahn"},
  parco_giochi: {
    IT: "Parco Giochi",
    EN: "Playground",
    FR: "Aire de jeux",
    ES: "Parque Infantil",
    RU: "Детская площадка",
    ZH: "儿童游乐场"
  , DE: "Spielplatz"},
  divertimento: {
    IT: "Parco Divertimenti",
    EN: "Amusement Park",
    FR: "Parc d'attractions",
    ES: "Parque de Atracciones",
    RU: "Пак развлечений",
    ZH: "主题游乐园"
  , DE: "Freizeitpark"},
  acquario: {
    IT: "Acquario",
    EN: "Aquarium",
    FR: "Aquarium",
    ES: "Acuario",
    RU: "Аквариум",
    ZH: "水族馆"
  , DE: "Aquarium"},
  zoo: {
    IT: "Zoo",
    EN: "Zoo",
    FR: "Zoo",
    ES: "Zoológico",
    RU: "Зоопарк",
    ZH: "动物园"
  , DE: "Zoo"},
  artigianato: {
    IT: "Bottega Artigiana",
    EN: "Artisan Workshop",
    FR: "Atelier d'artisan",
    ES: "Taller Artesano",
    RU: "Ремесленная мастерская",
    ZH: "手工艺工作坊"
  , DE: "Handwerksatelier"},
  mercato: {
    IT: "Mercato Locale",
    EN: "Local Market",
    FR: "Marché Local",
    ES: "Mercado Local",
    RU: "Местный рынок",
    ZH: "当地集市"
  , DE: "Lokaler Markt"},
  gastronomia: {
    IT: "Gastronomia / Delicatessen",
    EN: "Delicatessen",
    FR: "Épicerie fine",
    ES: "Gastronomía / Delicatessen",
    RU: "Гастрономия",
    ZH: "特色美食/熟食店"
  , DE: "Feinkost"},

  // Planner Screen
  planner_title: {
    IT: "Trip Planner",
    EN: "Trip Planner",
    FR: "Trip Planner",
    ES: "Planificatore",
    RU: "Планировщик",
    ZH: "智能行程规划"
  , DE: "Trip Planner"},
  planner_desc: {
    IT: "Crea il tuo viaggio perfetto con WIP l'esperto di viaggi",
    EN: "Create your perfect trip with WIP, the travel expert",
    FR: "Créez votre voyage parfait avec WIP, l'expert voyage",
    ES: "Crea tu viaje perfecto con WIP, el experto en viajes",
    RU: "Создайте идеальное путешествие с WIP, экспертом по поездкам",
    ZH: "与智能旅行专家 WIP 一起规划您的完美旅程"
  , DE: "Erstelle deine perfekte Reise mit WIP, dem Reiseexperten"},
  auto_mode: {
    IT: "Modalità Automatica",
    EN: "Automatic Mode",
    FR: "Mode Automatique",
    ES: "Modo Automático",
    RU: "Автоматический режим",
    ZH: "自动规划模式"
  , DE: "Automatischer Modus"},
  auto_mode_desc: {
    IT: "Dimmi dove vuoi andare e per quanto tempo. L'AI farà il resto.",
    EN: "Tell me where you want to go and for how long. The AI does the rest.",
    FR: "Dites-moi où vous voulez aller et pour combien de temps. L'IA s'occupe du reste.",
    ES: "Dime a dónde quieres ir y por cuánto tiempo. La IA hará el resto.",
    RU: "Скажите, куда вы хотите поехать и на сколько. ИИ сделает все остальное.",
    ZH: "告诉我您的目的地和天数，AI 将为您打理一切。"
  , DE: "Sag mir, wohin du willst und für wie lange. Die KI erledigt den Rest."},
  favorites_mode: {
    IT: "Dai Miei Preferiti",
    EN: "From My Favorites",
    FR: "Depuis Mes Favoris",
    ES: "De Mis Favoritos",
    RU: "Из избранного",
    ZH: "从我的收藏生成"
  , DE: "Aus meinen Favoriten"},
  favorites_mode_desc: {
    IT: "Crea un percorso ottimizzato partendo dai luoghi che hai salvato nel Diario.",
    EN: "Create an optimized path starting from the places saved in your Diary.",
    FR: "Créez un parcours optimisé à partir des lieux enregistrés dans votre Journal.",
    ES: "Crea un recorrido optimizado a partir de los lugares guardados en tu Diario.",
    RU: "Создайте оптимизированный маршрут на основе мест, сохраненных в вашем дневнике.",
    ZH: "根据您在旅行日记中收藏的地点生成最优化路线。"
  , DE: "Erstelle eine optimierte Route ausgehend von den in deinem Tagebuch gespeicherten Orten."},
  offline_mode: {
    IT: "Itinerari Scaricati",
    EN: "Downloaded Itineraries",
    FR: "Itinéraires Téléchargés",
    ES: "Itinerarios Descargados",
    RU: "Скачанные маршруты",
    ZH: "已下载的离线行程"
  , DE: "Heruntergeladene Routen"},
  offline_mode_desc: {
    IT: "Consulta offline gli itinerari salvati. Nessun consumo dati.",
    EN: "Consult saved itineraries offline. Zero data usage.",
    FR: "Consultez vos itinéraires enregistrés hors ligne. Zéro data.",
    ES: "Consulta tus itinerarios guardados sin conexión. Cero consumo.",
    RU: "Просматривайте сохраненные маршруты офлайн. Без расхода данных.",
    ZH: "离线查看保存的行程，无需消耗任何流量。"
  , DE: "Sieh dir gespeicherte Routen offline an. Kein Datenverbrauch."},
  destination: {
    IT: "Destinazione",
    EN: "Destination",
    FR: "Destination",
    ES: "Destino",
    RU: "Направление",
    ZH: "目的地"
  , DE: "Reiseziel"},
  duration: {
    IT: "Durata Viaggio",
    EN: "Trip Duration",
    FR: "Durée du Voyage",
    ES: "Duración del Viaje",
    RU: "Длительность поездки",
    ZH: "旅程天数"
  , DE: "Reisedauer"},
  giorno: {
    IT: "giorno",
    EN: "day",
    FR: "jour",
    ES: "día",
    RU: "день",
    ZH: "天"
  , DE: "Tag"},
  giorni: {
    IT: "giorni",
    EN: "days",
    FR: "jours",
    ES: "días",
    RU: "дней",
    ZH: "天"
  , DE: "Tage"},
  day: {
    IT: "Giorno",
    EN: "Day",
    FR: "Jour",
    ES: "Día",
    RU: "День",
    ZH: "第"
  , DE: "Tag"},
  start_time: {
    IT: "Inizio Giornata",
    EN: "Start Time",
    FR: "Début de Journée",
    ES: "Inicio del Día",
    RU: "Начало дня",
    ZH: "出发时间"
  , DE: "Beginn des Tages"},
  end_time: {
    IT: "Fine Giornata",
    EN: "End Time",
    FR: "Fin de Journée",
    ES: "Fin del Día",
    RU: "Конец дня",
    ZH: "结束时间"
  , DE: "Ende des Tages"},
  interests: {
    IT: "I Tuoi Interessi",
    EN: "Your Interests",
    FR: "Vos Intérêts",
    ES: "Tus Intereses",
    RU: "Ваши интересы",
    ZH: "旅行偏好"
  , DE: "Deine Interessen"},
  special_requests: {
    IT: "Richieste Particolari (Opzionale)",
    EN: "Special Requests (Optional)",
    FR: "Demandes Spéciales (Optionnel)",
    ES: "Peticiones Especiales (Opcional)",
    RU: "Особые пожелания (Опционально)",
    ZH: "个性化需求（选填）"
  , DE: "Besondere Wünsche (optional)"},
  accommodation_label: {
    IT: "Dove alloggi (Opzionale)",
    EN: "Where you're staying (Optional)",
    FR: "Où vous logez (Optionnel)",
    ES: "Dónde te alojas (Opcional)",
    RU: "Где вы остановитесь (Опционально)",
    ZH: "住宿地点（选填）",
    DE: "Wo Sie übernachten (optional)"
  },
  accommodation_placeholder: {
    IT: "Es. Hotel Roma, via Nazionale 12",
    EN: "E.g. Hotel Roma, Via Nazionale 12",
    FR: "Ex. Hôtel Roma, via Nazionale 12",
    ES: "Ej. Hotel Roma, via Nazionale 12",
    RU: "Напр. Hotel Roma, via Nazionale 12",
    ZH: "例如：Hotel Roma, via Nazionale 12",
    DE: "Z. B. Hotel Roma, Via Nazionale 12"
  },
  btn_generate: {
    IT: "GENERA ITINERARIO",
    EN: "GENERATE ITINERARY",
    FR: "GÉNÉRER L'ITINÉRAIRE",
    ES: "GENERAR ITINERARIO",
    RU: "СОЗДАТЬ МАРШРУТ",
    ZH: "一键生成智能行程"
  , DE: "ROUTE GENERIEREN"},
  btn_optimize: {
    IT: "OTTIMIZZA PERCORSO",
    EN: "OPTIMIZE ROUTE",
    FR: "OPTIMISER LE PARCOURS",
    ES: "OPTIMIZAR RUTA",
    RU: "ОПТИМИЗИРОВАТЬ ПУТЬ",
    ZH: "优化旅行路线"
  , DE: "ROUTE OPTIMIEREN"},
  regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Перегенерировать",
    ZH: "重新生成"
  , DE: "Neu generieren"},
  offline_btn: {
    IT: "Offline",
    EN: "Offline",
    FR: "Hors ligne",
    ES: "Sin conexión",
    RU: "Офлайн",
    ZH: "离线保存"
  , DE: "Offline"},
  navigate: {
    IT: "Naviga",
    EN: "Navigate",
    FR: "Naviguer",
    ES: "Navegar",
    RU: "Навигация",
    ZH: "导航导览"
  , DE: "Navigieren"},
  // Le due scelte del tasto Naviga. A piedi resta dentro l'app perche' e'
  // l'unico modo di far scattare le audioguide lungo la strada; in auto va al
  // navigatore di sistema, che ha il traffico.
  nav_a_piedi: {
    IT: "A piedi", EN: "On foot", FR: "À pied", ES: "A pie",
    DE: "Zu Fuß", RU: "Пешком", ZH: "步行"
  },
  nav_a_piedi_sub: {
    IT: "Con WIP Nav: audioguide lungo il percorso",
    EN: "With WIP Nav: audio guides along the way",
    FR: "Avec WIP Nav : audioguides en chemin",
    ES: "Con WIP Nav: audioguías por el camino",
    DE: "Mit WIP Nav: Audioguides unterwegs",
    RU: "С WIP Nav: аудиогиды по пути",
    ZH: "使用 WIP Nav：沿途语音导览"
  },
  nav_in_auto: {
    IT: "In auto", EN: "By car", FR: "En voiture", ES: "En coche",
    DE: "Mit dem Auto", RU: "На машине", ZH: "驾车"
  },
  nav_in_auto_sub: {
    IT: "Apre Google Maps o Mappe",
    EN: "Opens Google Maps or Maps",
    FR: "Ouvre Google Maps ou Plans",
    ES: "Abre Google Maps o Mapas",
    DE: "Öffnet Google Maps oder Karten",
    RU: "Откроет Google Карты или Карты",
    ZH: "打开谷歌地图或地图"
  },
  // Dieci Tappe: il banner di controllo del giro.
  tour_tappa: { IT: "Tappa", EN: "Stop", FR: "Étape", ES: "Parada", DE: "Station", RU: "Точка", ZH: "站点" },
  tour_mancanti: { IT: "mancanti", EN: "left", FR: "restants", ES: "restantes", DE: "verbleibend", RU: "осталось", ZH: "剩余" },
  tour_totali: { IT: "in tutto", EN: "total", FR: "au total", ES: "en total", DE: "insgesamt", RU: "всего", ZH: "总计" },
  tour_in_pausa: { IT: "Giro in pausa", EN: "Tour paused", FR: "Parcours en pause", ES: "Recorrido en pausa", DE: "Tour pausiert", RU: "Маршрут на паузе", ZH: "行程已暂停" },
  tour_pausa: { IT: "Metti in pausa", EN: "Pause", FR: "Mettre en pause", ES: "Pausar", DE: "Pausieren", RU: "Пауза", ZH: "暂停" },
  tour_riprendi: { IT: "Riprendi", EN: "Resume", FR: "Reprendre", ES: "Reanudar", DE: "Fortsetzen", RU: "Продолжить", ZH: "继续" },
  tour_riascolta: { IT: "Riascolta", EN: "Play again", FR: "Réécouter", ES: "Volver a escuchar", DE: "Nochmal hören", RU: "Прослушать снова", ZH: "重听" },
  tour_salta: { IT: "Salta questa tappa", EN: "Skip this stop", FR: "Passer cette étape", ES: "Saltar esta parada", DE: "Station überspringen", RU: "Пропустить точку", ZH: "跳过此站" },
  tour_termina: { IT: "Termina il giro", EN: "End tour", FR: "Terminer le parcours", ES: "Terminar el recorrido", DE: "Tour beenden", RU: "Завершить маршрут", ZH: "结束行程" },
  tour_problemi: { IT: "tappe senza percorso pedonale", EN: "stops with no walking route", FR: "étapes sans itinéraire piéton", ES: "paradas sin ruta peatonal", DE: "Stationen ohne Fußweg", RU: "точек без пешего маршрута", ZH: "个站点没有步行路线" },
  // Dieci Tappe: la scelta delle tappe dalla scheda POI sulla mappa.
  tour_aggiungi: { IT: "Aggiungi al giro", EN: "Add to tour", FR: "Ajouter au parcours", ES: "Añadir al recorrido", DE: "Zur Tour hinzufügen", RU: "Добавить в маршрут", ZH: "加入行程" },
  tour_togli: { IT: "Togli dal giro", EN: "Remove from tour", FR: "Retirer du parcours", ES: "Quitar del recorrido", DE: "Aus Tour entfernen", RU: "Убрать из маршрута", ZH: "从行程移除" },
  tour_pieno: { IT: "Giro pieno: dieci tappe", EN: "Tour is full: ten stops", FR: "Parcours complet : dix étapes", ES: "Recorrido completo: diez paradas", DE: "Tour voll: zehn Stationen", RU: "Маршрут полон: десять точек", ZH: "行程已满：十站" },
  // Dieci Tappe: incontri lungo la strada, sostituta, fine giro.
  tour_incontro: { IT: "Sulla tua strada", EN: "On your way", FR: "Sur ton chemin", ES: "En tu camino", DE: "Auf deinem Weg", RU: "По пути", ZH: "沿途" },
  tour_al_posto_di: { IT: "al posto di", EN: "instead of", FR: "à la place de", ES: "en lugar de", DE: "anstelle von", RU: "вместо", ZH: "代替" },
  tour_sostituisci: { IT: "Lo metto al suo posto?", EN: "Put it in its place?", FR: "Je le mets à sa place ?", ES: "¿Lo pongo en su lugar?", DE: "An seine Stelle setzen?", RU: "Поставить вместо неё?", ZH: "替换它吗？" },
  tour_si: { IT: "Sì", EN: "Yes", FR: "Oui", ES: "Sí", DE: "Ja", RU: "Да", ZH: "是" },
  tour_no: { IT: "No", EN: "No", FR: "Non", ES: "No", DE: "Nein", RU: "Нет", ZH: "否" },
  tour_finito: { IT: "Giro finito", EN: "Tour complete", FR: "Parcours terminé", ES: "Recorrido terminado", DE: "Tour beendet", RU: "Маршрут завершён", ZH: "行程结束" },
  tour_salva: { IT: "Salva nei miei itinerari", EN: "Save to my itineraries", FR: "Enregistrer dans mes itinéraires", ES: "Guardar en mis itinerarios", DE: "In meinen Reiseplänen speichern", RU: "Сохранить в мои маршруты", ZH: "保存到我的行程" },
  tour_condividi: { IT: "Condividi", EN: "Share", FR: "Partager", ES: "Compartir", DE: "Teilen", RU: "Поделиться", ZH: "分享" },
  tour_salvato: { IT: "Salvato", EN: "Saved", FR: "Enregistré", ES: "Guardado", DE: "Gespeichert", RU: "Сохранено", ZH: "已保存" },
  tour_link_copiato: { IT: "Link copiato", EN: "Link copied", FR: "Lien copié", ES: "Enlace copiado", DE: "Link kopiert", RU: "Ссылка скопирована", ZH: "链接已复制" },
  tour_chiudi: { IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", DE: "Schließen", RU: "Закрыть", ZH: "关闭" },
  // Dieci Tappe: pre-scaricamento (testi + audio per l'offline) nel banner.
  tour_prescarico_in_corso: { IT: "Preparo le tappe per l'offline…", EN: "Preparing stops for offline…", FR: "Préparation des étapes hors ligne…", ES: "Preparando paradas sin conexión…", DE: "Stationen für offline vorbereiten…", RU: "Готовлю точки для офлайна…", ZH: "正在准备离线站点…" },
  tour_prescarico_testi: { IT: "testi", EN: "texts", FR: "textes", ES: "textos", DE: "Texte", RU: "текстов", ZH: "段文字" },
  tour_prescarico_audio: { IT: "audio", EN: "audio", FR: "audio", ES: "audios", DE: "Audio", RU: "аудио", ZH: "段音频" },
  tour_prescarico_mancanti: { IT: "mancanti", EN: "missing", FR: "manquants", ES: "faltan", DE: "fehlen", RU: "не хватает", ZH: "缺失" },
  tour_prescarico_riprova: { IT: "Riprova", EN: "Retry", FR: "Réessayer", ES: "Reintentar", DE: "Erneut", RU: "Повторить", ZH: "重试" },
  tour_prescarico_pronto: { IT: "Tutto pronto anche offline", EN: "All set, even offline", FR: "Tout est prêt, même hors ligne", ES: "Todo listo, incluso sin conexión", DE: "Alles bereit, auch offline", RU: "Всё готово, даже офлайн", ZH: "已就绪，离线也可用" },
  // Dieci Tappe: il giro salvato come itinerario e le istruzioni vocali.
  tour_giro_a_piedi: { IT: "Giro a piedi", EN: "Walking tour", FR: "Parcours à pied", ES: "Recorrido a pie", DE: "Rundgang zu Fuß", RU: "Пешая прогулка", ZH: "步行路线" },
  tour_tappe: { IT: "tappe", EN: "stops", FR: "étapes", ES: "paradas", DE: "Stationen", RU: "точек", ZH: "站" },
  tour_tappa_descrizione: { IT: "Tappa del giro a piedi con audioguida WIP.", EN: "Stop of the walking tour with the WIP audio guide.", FR: "Étape du parcours à pied avec l'audioguide WIP.", ES: "Parada del recorrido a pie con la audioguía WIP.", DE: "Station des Rundgangs mit dem WIP-Audioguide.", RU: "Точка пешей прогулки с аудиогидом WIP.", ZH: "WIP 语音导览步行路线的站点。" },
  tour_suggerimento_percorso: { IT: "Percorso {anello}di {km} km: circa {min} minuti a piedi, più l'ascolto delle audioguide.", EN: "{anello}route of {km} km: about {min} minutes on foot, plus the audio guides.", FR: "Parcours {anello}de {km} km : environ {min} minutes à pied, plus l'écoute des audioguides.", ES: "Recorrido {anello}de {km} km: unos {min} minutos a pie, más la escucha de las audioguías.", DE: "{anello}Route von {km} km: etwa {min} Minuten zu Fuß, plus die Audioguides.", RU: "{anello}маршрут {km} км: около {min} минут пешком плюс прослушивание аудиогидов.", ZH: "{anello}路线 {km} 公里：步行约 {min} 分钟，另加语音导览时间。" },
  tour_ad_anello: { IT: "ad anello ", EN: "Loop ", FR: "en boucle ", ES: "circular ", DE: "Rund", RU: "Кольцевой ", ZH: "环形" },
  tour_fra_metri: { IT: "Fra {n} metri,", EN: "In {n} meters,", FR: "Dans {n} mètres,", ES: "En {n} metros,", DE: "In {n} Metern", RU: "Через {n} метров", ZH: "{n}米后，" },
  tour_togli_tappa: { IT: "Togli questa tappa dal giro", EN: "Remove this stop from the tour", FR: "Retirer cette étape du parcours", ES: "Quitar esta parada del recorrido", DE: "Diese Station aus der Tour entfernen", RU: "Убрать эту точку из маршрута", ZH: "从行程中移除此站" },
  // Audioguida: stati e avvisi del player.
  poi_generico: { IT: "Punto di interesse", EN: "Point of interest", FR: "Point d'intérêt", ES: "Punto de interés", DE: "Sehenswürdigkeit", RU: "Точка интереса", ZH: "兴趣点" },
  audioguida_label: { IT: "Audioguida", EN: "Audio guide", FR: "Audioguide", ES: "Audioguía", DE: "Audioguide", RU: "Аудиогид", ZH: "语音导览" },
  narrazione_in_corso: { IT: "Narrazione in corso...", EN: "Narration in progress...", FR: "Narration en cours...", ES: "Narración en curso...", DE: "Erzählung läuft...", RU: "Идёт рассказ...", ZH: "正在讲解..." },
  silenziosa_leggi_testo: { IT: "{poi}: modalità silenziosa — leggi il testo nella scheda o premi ▶ per ascoltare", EN: "{poi}: silent mode — read the text in the sheet or press ▶ to listen", FR: "{poi} : mode silencieux — lisez le texte dans la fiche ou appuyez sur ▶ pour écouter", ES: "{poi}: modo silencioso — lee el texto en la ficha o pulsa ▶ para escuchar", DE: "{poi}: Stummmodus — lies den Text in der Karte oder drücke ▶ zum Anhören", RU: "{poi}: тихий режим — прочитайте текст в карточке или нажмите ▶, чтобы послушать", ZH: "{poi}：静音模式 — 请在卡片中阅读文字，或按 ▶ 收听" },
  silenziosa_pronta: { IT: "{poi} pronta: modalità silenziosa", EN: "{poi} ready: silent mode", FR: "{poi} prête : mode silencieux", ES: "{poi} lista: modo silencioso", DE: "{poi} bereit: Stummmodus", RU: "{poi} готов: тихий режим", ZH: "{poi} 已就绪：静音模式" },
  nav_indicazione: { IT: "Indicazione stradale", EN: "Turn-by-turn", FR: "Indication routière", ES: "Indicación de ruta", DE: "Wegweisung", RU: "Подсказка маршрута", ZH: "路线指引" },
  riproduzione_fallita: { IT: "Riproduzione non riuscita. Riprova.", EN: "Playback failed. Please try again.", FR: "Lecture impossible. Réessayez.", ES: "No se pudo reproducir. Inténtalo de nuevo.", DE: "Wiedergabe fehlgeschlagen. Bitte erneut versuchen.", RU: "Не удалось воспроизвести. Попробуйте снова.", ZH: "播放失败，请重试。" },
  contenuti_in_caricamento: { IT: "Contenuti in caricamento, riprova tra un attimo.", EN: "Content still loading, try again in a moment.", FR: "Contenu en cours de chargement, réessayez dans un instant.", ES: "Contenido cargando, inténtalo en un momento.", DE: "Inhalte werden geladen, gleich noch einmal versuchen.", RU: "Контент загружается, попробуйте через мгновение.", ZH: "内容加载中，请稍后再试。" },
  offline_crediti_insufficienti: { IT: "Crediti insufficienti per l'ascolto offline", EN: "Not enough credits for offline listening", FR: "Crédits insuffisants pour l'écoute hors ligne", ES: "Créditos insuficientes para la escucha sin conexión", DE: "Nicht genug Guthaben zum Offline-Hören", RU: "Недостаточно кредитов для офлайн-прослушивания", ZH: "离线收听的积分不足" },
  offline_crediti_disponibili: { IT: "(disponibili: {n})", EN: "(available: {n})", FR: "(disponibles : {n})", ES: "(disponibles: {n})", DE: "(verfügbar: {n})", RU: "(доступно: {n})", ZH: "（可用：{n}）" },
  offline_ricarica_suggerimento: { IT: ". Ricarica quando torni online, o attiva il Day Pass prima di partire.", EN: ". Top up when you are back online, or activate the Day Pass before leaving.", FR: ". Rechargez en revenant en ligne, ou activez le Day Pass avant de partir.", ES: ". Recarga cuando vuelvas a estar en línea, o activa el Day Pass antes de salir.", DE: ". Lade auf, sobald du wieder online bist, oder aktiviere den Day Pass vor dem Start.", RU: ". Пополните счёт, когда снова будете онлайн, или активируйте Day Pass заранее.", ZH: "。恢复在线后充值，或出发前激活 Day Pass。" },
  offline_guida_non_disponibile: { IT: "Audioguida non disponibile offline per questo luogo. Scarica il pacchetto della zona dalla tab Mappe Offline.", EN: "Audio guide not available offline for this place. Download the area package from the Offline Maps tab.", FR: "Audioguide non disponible hors ligne pour ce lieu. Téléchargez le pack de la zone depuis l'onglet Cartes hors ligne.", ES: "Audioguía no disponible sin conexión para este lugar. Descarga el paquete de la zona desde la pestaña Mapas sin conexión.", DE: "Audioguide für diesen Ort offline nicht verfügbar. Lade das Gebietspaket im Tab Offline-Karten herunter.", RU: "Аудиогид для этого места недоступен офлайн. Скачайте пакет района во вкладке Офлайн-карты.", ZH: "此地点的语音导览离线不可用。请在离线地图标签中下载该区域包。" },
  web_limitata_titolo: { IT: "Esperienza Web Limitata", EN: "Limited Web Experience", FR: "Expérience web limitée", ES: "Experiencia web limitada", DE: "Eingeschränkte Web-Erfahrung", RU: "Ограниченная веб-версия", ZH: "网页版功能受限" },
  web_limitata_testo: { IT: "Su browser l'audio si interrompe se spegni lo schermo. Scarica l'App per il tour automatico!", EN: "Audio stops if the screen turns off in the browser. Download the App for the automatic tour!", FR: "Dans le navigateur, l'audio s'arrête si l'écran s'éteint. Téléchargez l'app pour le tour automatique !", ES: "En el navegador el audio se detiene si apagas la pantalla. ¡Descarga la App para el tour automático!", DE: "Im Browser stoppt der Ton, wenn der Bildschirm ausgeht. Lade die App für die automatische Tour!", RU: "В браузере звук останавливается при выключении экрана. Скачайте приложение для автоматического тура!", ZH: "在浏览器中关闭屏幕会中断音频。下载应用以使用自动导览！" },
  altri_luoghi_vicini: { IT: "altri luoghi vicini", EN: "other nearby places", FR: "autres lieux à proximité", ES: "otros lugares cercanos", DE: "weitere Orte in der Nähe", RU: "других мест рядом", ZH: "个附近的其他地点" },
  pulisci: { IT: "PULISCI", EN: "CLEAR", FR: "EFFACER", ES: "LIMPIAR", DE: "LEEREN", RU: "ОЧИСТИТЬ", ZH: "清除" },
  // Posizione negata sul web: non deve essere un silenzio.
  posizione_negata_titolo: { IT: "Posizione non consentita", EN: "Location not allowed", FR: "Position refusée", ES: "Ubicación no permitida", DE: "Standort nicht erlaubt", RU: "Доступ к геопозиции запрещён", ZH: "未允许获取位置" },
  posizione_negata_testo: { IT: "Senza la posizione l'audioguida non sa dove sei. Consenti la posizione a questo sito dalle impostazioni del browser (icona del lucchetto accanto all'indirizzo) e ricarica la pagina.", EN: "Without your location the audio guide cannot know where you are. Allow location for this site in the browser settings (the lock icon next to the address) and reload the page.", FR: "Sans la position, l'audioguide ne sait pas où vous êtes. Autorisez la position pour ce site dans les réglages du navigateur (icône cadenas à côté de l'adresse) et rechargez la page.", ES: "Sin la ubicación la audioguía no sabe dónde estás. Permite la ubicación para este sitio en los ajustes del navegador (icono del candado junto a la dirección) y recarga la página.", DE: "Ohne Standort weiß der Audioguide nicht, wo du bist. Erlaube den Standort für diese Seite in den Browser-Einstellungen (Schloss-Symbol neben der Adresse) und lade die Seite neu.", RU: "Без геопозиции аудиогид не знает, где вы. Разрешите доступ к геопозиции для этого сайта в настройках браузера (значок замка рядом с адресом) и перезагрузите страницу.", ZH: "没有位置信息，语音导览无法知道您在哪里。请在浏览器设置中（地址栏旁的锁形图标）允许此网站获取位置，然后刷新页面。" },
  posizione_negata_stato: { IT: "GPS negato: l'audioguida non può sapere dove sei", EN: "GPS denied: the audio guide cannot know where you are", FR: "GPS refusé : l'audioguide ne peut pas savoir où vous êtes", ES: "GPS denegado: la audioguía no puede saber dónde estás", DE: "GPS verweigert: der Audioguide weiß nicht, wo du bist", RU: "GPS запрещён: аудиогид не знает, где вы", ZH: "GPS 被拒绝：语音导览无法知道您的位置" },
  // ── Audit pre-release 28/08/2026: stringhe prima cablate in IT/EN ──
  loc_denied_banner: { IT: "Posizione disattivata: le audioguide automatiche non partono.", EN: "Location off: automatic audio guides are disabled.", FR: "Position désactivée : les audioguides automatiques ne démarrent pas.", ES: "Ubicación desactivada: las audioguías automáticas no arrancan.", DE: "Standort aus: automatische Audioguides starten nicht.", RU: "Геопозиция выключена: автоматические аудиогиды не запускаются.", ZH: "位置已关闭：自动语音导览无法启动。" },
  loc_denied_dismiss: { IT: "Chiudi", EN: "Dismiss", FR: "Fermer", ES: "Cerrar", DE: "Schließen", RU: "Закрыть", ZH: "关闭" },
  nav_sottotitolo: { IT: "Navigazione", EN: "Navigation", FR: "Navigation", ES: "Navegación", DE: "Navigation", RU: "Навигация", ZH: "导航" },
  audio_titolo_default: { IT: "Audioguida", EN: "Audio guide", FR: "Audioguide", ES: "Audioguía", DE: "Audioguide", RU: "Аудиогид", ZH: "语音导览" },
  nav_skip_stop: { IT: "Salta tappa", EN: "Skip stop", FR: "Passer l'étape", ES: "Saltar parada", DE: "Halt überspringen", RU: "Пропустить точку", ZH: "跳过此站" },
  sk_riprova: { IT: "Riprova", EN: "Retry", FR: "Réessayer", ES: "Reintentar", DE: "Erneut versuchen", RU: "Повторить", ZH: "重试" },
  sk_rete_lenta: { IT: "Rete lenta: la scheda ci sta mettendo più del solito.", EN: "Slow network: this card is taking longer than usual.", FR: "Réseau lent : la fiche met plus de temps que d'habitude.", ES: "Red lenta: la ficha está tardando más de lo normal.", DE: "Langsames Netz: die Karte braucht länger als sonst.", RU: "Медленная сеть: карточка загружается дольше обычного.", ZH: "网络较慢：此卡片加载时间比平时更长。" },
  offl_incompleta: { IT: "Incompleta ({n} tile mancanti)", EN: "Incomplete ({n} tiles missing)", FR: "Incomplète ({n} tuiles manquantes)", ES: "Incompleta (faltan {n} teselas)", DE: "Unvollständig ({n} Kacheln fehlen)", RU: "Не завершено (не хватает {n} тайлов)", ZH: "未完成（缺少 {n} 个图块）" },
  offl_completa_download: { IT: "Completa download", EN: "Complete download", FR: "Terminer le téléchargement", ES: "Completar descarga", DE: "Download abschließen", RU: "Завершить загрузку", ZH: "完成下载" },
  offl_completato: { IT: "Sfondo mappa completato: {n} tile scaricate.", EN: "Map background completed: {n} tiles downloaded.", FR: "Fond de carte terminé : {n} tuiles téléchargées.", ES: "Fondo de mapa completado: {n} teselas descargadas.", DE: "Kartenhintergrund vervollständigt: {n} Kacheln geladen.", RU: "Фон карты дозагружен: {n} тайлов.", ZH: "地图底图已完成：已下载 {n} 个图块。" },
  giro_ricalcolo_senza_rete: { IT: "Rete assente: segui la linea sulla mappa.", EN: "No network: follow the line on the map.", FR: "Pas de réseau : suivez la ligne sur la carte.", ES: "Sin red: sigue la línea en el mapa.", DE: "Kein Netz: folge der Linie auf der Karte.", RU: "Нет сети: следуйте линии на карте.", ZH: "没有网络：请沿地图上的路线前进。" },
  auth_richiesta: { IT: "Sessione scaduta: accedi di nuovo per continuare.", EN: "Session expired: sign in again to continue.", FR: "Session expirée : reconnectez-vous pour continuer.", ES: "Sesión caducada: inicia sesión de nuevo para continuar.", DE: "Sitzung abgelaufen: melde dich erneut an, um fortzufahren.", RU: "Сессия истекла: войдите снова, чтобы продолжить.", ZH: "会话已过期：请重新登录以继续。" },
  audio_crediti_necessari_per: { IT: "Crediti o pass necessari per «{name}»", EN: "Credits or a pass are needed for \"{name}\"", FR: "Crédits ou pass nécessaires pour « {name} »", ES: "Se necesitan créditos o un pase para «{name}»", DE: "Für „{name}“ sind Credits oder ein Pass nötig", RU: "Для «{name}» нужны кредиты или пасс", ZH: "收听“{name}”需要积分或通行证" },
  audio_anteprima_label: { IT: "Anteprima", EN: "Preview", FR: "Aperçu", ES: "Vista previa", DE: "Vorschau", RU: "Превью", ZH: "预览" },
  audio_ascolta_per_crediti: { IT: "Ascolta per {n} crediti", EN: "Listen for {n} credits", FR: "Écouter pour {n} crédits", ES: "Escuchar por {n} créditos", DE: "Für {n} Credits anhören", RU: "Слушать за {n} кредитов", ZH: "花 {n} 积分收听" },
  // Un'audioguida acquistata resta dell'utente per sempre (29/08/2026).
  audio_gia_tua: { IT: "Audioguida già tua", EN: "Audio guide already yours", FR: "Audioguide déjà à vous", ES: "Audioguía ya tuya", DE: "Audioguide gehört bereits dir", RU: "Аудиогид уже ваш", ZH: "语音导览已属于你" },
  perm_downgraded_msg: { IT: "Permesso posizione ridotto: l'audioguida a schermo spento non funziona più. Riporta la posizione su «Sempre» nelle impostazioni.", EN: "Location permission reduced: the audio guide no longer works with the screen off. Set location back to \"Always\" in Settings.", FR: "Autorisation de position réduite : l'audioguide ne fonctionne plus écran éteint. Remettez la position sur « Toujours » dans les réglages.", ES: "Permiso de ubicación reducido: la audioguía ya no funciona con la pantalla apagada. Vuelve a poner la ubicación en «Siempre» en Ajustes.", DE: "Standortberechtigung eingeschränkt: der Audioguide funktioniert bei ausgeschaltetem Bildschirm nicht mehr. Stelle den Standort in den Einstellungen wieder auf „Immer“.", RU: "Доступ к геопозиции ограничен: аудиогид больше не работает при выключенном экране. Верните «Всегда» в настройках.", ZH: "位置权限已降低：熄屏时语音导览无法工作。请在设置中将位置改回“始终”。" },
  gps_active: {
    IT: "Audio GPS",
    EN: "GPS Audio",
    FR: "GPS Audio",
    ES: "Audio GPS",
    RU: "Аудио GPS",
    ZH: "GPS语音"
  , DE: "GPS-Audio"},
  time_expected: {
    IT: "Tempo previsto",
    EN: "Estimated time",
    FR: "Temps prévu",
    ES: "Tiempo estimado",
    RU: "Ожидаемое время",
    ZH: "预计游览时长"
  , DE: "Voraussichtliche Zeit"},
  movement: {
    IT: "Spostamento",
    EN: "Travel",
    FR: "Déplacement",
    ES: "Desplazamiento",
    RU: "Перемещение",
    ZH: "交通方式"
  , DE: "Fortbewegung"},
  details_offline: {
    IT: "Dettagli & Salva Offline",
    EN: "Details & Save Offline",
    FR: "Détails & Hors ligne",
    ES: "Detalles y Sin conexión",
    RU: "Детали и Офлайн",
    ZH: "详情与离线保存"
  , DE: "Details & offline speichern"},

  // POI Detail Sheet
  show_basic_options: {
    IT: "Mostra Opzioni di Base",
    EN: "Show Basic Options",
    FR: "Afficher les Options de Base",
    ES: "Mostrar Opciones Básicas",
    RU: "Показать основные параметры",
    ZH: "显示基本选项"
  , DE: "Grundoptionen anzeigen"},
  hide_basic_options: {
    IT: "Nascondi Opzioni di Base",
    EN: "Hide Basic Options",
    FR: "Masquer les Options de Base",
    ES: "Ocultar Opciones Básicas",
    RU: "Скрыть основные параметры",
    ZH: "隐藏基本选项"
  , DE: "Grundoptionen ausblenden"},
  reviews: {
    IT: "recensioni",
    EN: "reviews",
    FR: "avis",
    ES: "reseñas",
    RU: "отзывов",
    ZH: "条评价"
  , DE: "Bewertungen"},
  from_you: {
    IT: "da te",
    EN: "from you",
    FR: "de vous",
    ES: "de ti",
    RU: "от вас",
    ZH: "距您"
  , DE: "von dir entfernt"},
  save_plan: {
    IT: "Salva nel piano",
    EN: "Save to plan",
    FR: "Ajouter au plan",
    ES: "Guardar en plan",
    RU: "Добавить в план",
    ZH: "保存至行程"
  , DE: "Zum Plan hinzufügen"},
  remove_plan: {
    IT: "Rimuovi dal piano",
    EN: "Remove from plan",
    FR: "Retirer du plan",
    ES: "Quitar del plan",
    RU: "Убрать из плана",
    ZH: "移出行程"
  , DE: "Vom Plan entfernen"},
  remove_favorites: {
    IT: "Rimuovi dai preferiti",
    EN: "Remove from favorites",
    FR: "Retirer des favoris",
    ES: "Quitar de favoritos",
    RU: "Удалить из избранного",
    ZH: "取消收藏"
  , DE: "Aus Favoriten entfernen"},
  period_month: {
    IT: "Periodo / Mese",
    EN: "Period / Month",
    FR: "Période / Mois",
    ES: "Período / Mes",
    RU: "Период / Месяц",
    ZH: "期间/月份"
  , DE: "Zeitraum / Monat"},
  generic_any: {
    IT: "Qualsiasi",
    EN: "Any",
    FR: "N'importe quel",
    ES: "Cualquiera",
    RU: "Любой",
    ZH: "任何"
  , DE: "Beliebig"},
  website: {
    IT: "Sito Web",
    EN: "Website",
    FR: "Site Web",
    ES: "Sitio Web",
    RU: "Веб-сайт",
    ZH: "官方网站"
  , DE: "Webseite"},
  call: {
    IT: "Chiama",
    EN: "Call",
    FR: "Appeler",
    ES: "Llamar",
    RU: "Позвонить",
    ZH: "联系电话"
  , DE: "Anrufen"},
  explore_nearby: {
    IT: "Esplora Dintorni",
    EN: "Explore Nearby",
    FR: "Explorer les Alentours",
    ES: "Explorar Alrededores",
    RU: "Исследовать окрестности",
    ZH: "探索周边景点"
  , DE: "Umgebung erkunden"},
  other_attractions: {
    IT: "altre attrazioni entro 1000m",
    EN: "other attractions within 1000m",
    FR: "autres attractions à moins de 1000m",
    ES: "otras atracciones a menos de 1000m",
    RU: "других мест в радиусе 1000м",
    ZH: "千米以内的周边景点"
  , DE: "weitere Attraktionen innerhalb von 1000m"},
  detailed_description: {
    IT: "Descrizione Dettagliata",
    EN: "Detailed Description",
    FR: "Description Détaillée",
    ES: "Descripción Detallada",
    RU: "Подробное описание",
    ZH: "详细介绍"
  , DE: "Ausführliche Beschreibung"},
  artwork_details: {
    IT: "Dettagli dell'Opera",
    EN: "Artwork Details",
    FR: "Détails de l'Œuvre",
    ES: "Detalles de la Obra",
    RU: "Детали объекта",
    ZH: "艺术与历史细节"
  , DE: "Details zum Werk"},
  author: {
    IT: "Autore / Artista",
    EN: "Author / Artist",
    FR: "Auteur / Artiste",
    ES: "Autor / Artista",
    RU: "Автор / Художник",
    ZH: "创作者/艺术家"
  , DE: "Autor / Künstler"},
  period: {
    IT: "Periodo Storico",
    EN: "Historical Period",
    FR: "Période Historique",
    ES: "Periodo Histórico",
    RU: "Исторический период",
    ZH: "历史时期"
  , DE: "Historische Epoche"},
  curiosity: {
    IT: "Curiosità",
    EN: "Fun Fact",
    FR: "Anecdote",
    ES: "Curiosidades",
    RU: "Интересный факт",
    ZH: "趣味小常识"
  , DE: "Wissenswertes"},
  premium_exclusive: {
    IT: "ESCLUSIVA PREMIUM",
    EN: "PREMIUM EXCLUSIVE",
    FR: "EXCLUSIVITÉ PREMIUM",
    ES: "EXCLUSIVA PREMIUM",
    RU: "ПРЕМИУМ ЭКСКЛЮЗИВ",
    ZH: "PREMIUM 会员专属"
  , DE: "PREMIUM EXKLUSIV"},
  megaphone: {
    IT: "MEGAFONO",
    EN: "MEGAPHONE",
    FR: "MÉGAPHONE",
    ES: "MEGÁFONO",
    RU: "МЕГАФОН",
    ZH: "扩音模式"
  , DE: "MEGAFON"},
  more_info: {
    IT: "Richiedi più informazioni",
    EN: "Ask for more details",
    FR: "Demander plus de détails",
    ES: "Solicitar más detalles",
    RU: "Узнать больше подробностей",
    ZH: "获取更详细的语音解说"
  , DE: "Mehr Details anfordern"},
  save_audio: {
    IT: "Salva Audio Offline",
    EN: "Save Audio Offline",
    FR: "Enregistrer l'audio",
    ES: "Guardar Audio Offline",
    RU: "Скачать аудио офлайн",
    ZH: "保存离线语音导览"
  , DE: "Audio offline speichern"},
  audio_hint: {
    IT: "💡 Ascolta prima l'audio (premi Play) per abilitare il salvataggio offline.",
    EN: "💡 Listen to the audio first (press Play) to enable offline saving.",
    FR: "💡 Écoutez d'abord l'audio (appuyez sur Play) per l'enregistrer hors ligne.",
    ES: "💡 Escucha primero il audio (pulsa Play) para habilitar el guardado offline.",
    RU: "💡 Сначала прослушайте аудио (нажмите Play), чтобы скачать его.",
    ZH: "💡 友情提示：请先点击播放（Play）试听语音，即可解锁离线保存功能。"
  , DE: "💡 Höre dir das Audio zuerst an (Play drücken), um das Offline-Speichern zu aktivieren."},

  // Profile / Settings Panel
  my_discoveries: {
    IT: "Le Mie Scoperte",
    EN: "My Discoveries",
    FR: "Mes Découvertes",
    ES: "Mis Descubrimientos",
    RU: "Мои открытия",
    ZH: "我的足迹与发现"
  , DE: "Meine Entdeckungen"},
  places: {
    IT: "Luoghi",
    EN: "Places",
    FR: "Lieux",
    ES: "Lugares",
    RU: "Мест",
    ZH: "个地点"
  , DE: "Orte"},
  no_gems: {
    IT: "Nessuna gemma salvata",
    EN: "No saved gems yet",
    FR: "Aucune gemme enregistrée",
    ES: "Ninguna gema guardada",
    RU: "Нет сохраненных жемчужин",
    ZH: "旅行日记空空如也"
  , DE: "Noch keine Perle gespeichert"},
  no_gems_desc: {
    IT: "Esplora la mappa e salva i tuoi luoghi preferiti per trovarli qui!",
    EN: "Explore the map and save your favorite places to find them here!",
    FR: "Explorez la carte et enregistrez vos lieux favoris pour les retrouver ici!",
    ES: "¡Explora el mapa y guarda tus lugares favoritos para encontrarlos aquí!",
    RU: "Исследуйте карту и сохраняйте любимые места, чтобы они появились здесь!",
    ZH: "快去探索周边的地图，收藏您心仪的地方吧！"
  , DE: "Erkunde die Karte und speichere deine Lieblingsorte, um sie hier wiederzufinden!"},
  diary: {
    IT: "DIARIO",
    EN: "DIARY",
    FR: "JOURNAL",
    ES: "DIARIO",
    RU: "ДНЕВНИК",
    ZH: "旅行日记"
  , DE: "TAGEBUCH"},
  itinerari_tab: {
    IT: "ITINERARI",
    EN: "ITINERARIES",
    FR: "ITINÉRAIRES",
    ES: "ITINERARIOS",
    RU: "МАРШРУТЫ",
    ZH: "行程规划"
  , DE: "ROUTEN"},
  history_tab: {
    IT: "ARCHIVIO",
    EN: "ARCHIVE",
    FR: "ARCHIVE",
    ES: "ARCHIVO",
    RU: "АРХИВ",
    ZH: "存档"
  , DE: "ARCHIV"},
  setup_tab: {
    IT: "SETUP",
    EN: "SETUP",
    FR: "CONFIG",
    ES: "AJUSTES",
    RU: "НАСТРОЙКИ",
    ZH: "应用设置"
  , DE: "SETUP"},
  premium_tab: {
    IT: "PREMIUM",
    EN: "PREMIUM",
    FR: "PREMIUM",
    ES: "PREMIUM",
    RU: "ПРЕМИУМ",
    ZH: "WIP 会员"
  , DE: "PREMIUM"},
  hotel_tab: {
    IT: "HOTEL",
    EN: "HOTELS",
    FR: "HÔTELS",
    ES: "HOTELES",
    RU: "ОТЕЛИ",
    ZH: "酒店合作"
  , DE: "HOTELS"},
  app_settings: {
    IT: "Impostazioni App",
    EN: "App Settings",
    FR: "Paramètres de l'App",
    ES: "Ajustes de la Aplicación",
    RU: "Настройки приложения",
    ZH: "系统与个性化设置"
  , DE: "App-Einstellungen"},
  // Dove si apre la mappa (22/08/2026)
  map_start_title: { IT: "Dove si apre la mappa", EN: "Where the map opens", FR: "Où s'ouvre la carte", ES: "Dónde se abre el mapa", DE: "Wo die Karte startet", RU: "Где открывается карта", ZH: "地图打开位置" },
  map_start_subtitle: { IT: "Scegli da dove parte la mappa ogni volta che apri l'app.", EN: "Choose where the map starts each time you open the app.", FR: "Choisissez d'où part la carte à chaque ouverture.", ES: "Elige desde dónde parte el mapa cada vez que abres la app.", DE: "Wähle, wo die Karte bei jedem Start beginnt.", RU: "Выберите, откуда начинается карта при каждом запуске.", ZH: "选择每次打开应用时地图的起始位置。" },
  map_start_gps: { IT: "La mia posizione", EN: "My location", FR: "Ma position", ES: "Mi ubicación", DE: "Mein Standort", RU: "Моё местоположение", ZH: "我的位置" },
  map_start_gps_hint: { IT: "Appena il GPS trova dove sei, la mappa vola lì.", EN: "As soon as GPS finds you, the map flies there.", FR: "Dès que le GPS vous trouve, la carte s'y déplace.", ES: "En cuanto el GPS te encuentra, el mapa vuela allí.", DE: "Sobald GPS dich findet, springt die Karte dorthin.", RU: "Как только GPS найдёт вас, карта переместится туда.", ZH: "GPS 定位后地图会飞到你的位置。" },
  map_start_last: { IT: "Dove ero l'ultima volta", EN: "Where I was last time", FR: "Là où j'étais la dernière fois", ES: "Donde estaba la última vez", DE: "Wo ich zuletzt war", RU: "Где я был в прошлый раз", ZH: "上次所在位置" },
  map_start_last_hint: { IT: "Riapre la mappa sull'ultima zona che stavi guardando.", EN: "Reopens the map on the last area you were looking at.", FR: "Rouvre la carte sur la dernière zone consultée.", ES: "Reabre el mapa en la última zona que mirabas.", DE: "Öffnet die Karte auf dem zuletzt betrachteten Gebiet.", RU: "Открывает карту на последней просмотренной области.", ZH: "在上次查看的区域重新打开地图。" },
  map_start_city: { IT: "Una città a mia scelta", EN: "A city of my choice", FR: "Une ville de mon choix", ES: "Una ciudad a mi elección", DE: "Eine Stadt meiner Wahl", RU: "Город по моему выбору", ZH: "我选择的城市" },
  map_start_city_hint: { IT: "Utile se stai pianificando un viaggio altrove.", EN: "Handy when you're planning a trip elsewhere.", FR: "Pratique si vous préparez un voyage ailleurs.", ES: "Útil si estás planeando un viaje a otro lugar.", DE: "Praktisch, wenn du eine Reise woanders planst.", RU: "Удобно, если вы планируете поездку в другое место.", ZH: "计划去别处旅行时很有用。" },
  map_start_city_placeholder: { IT: "Cerca una città…", EN: "Search a city…", FR: "Rechercher une ville…", ES: "Buscar una ciudad…", DE: "Stadt suchen…", RU: "Найти город…", ZH: "搜索城市…" },
  map_start_city_help: { IT: "Scrivi almeno tre lettere.", EN: "Type at least three letters.", FR: "Saisissez au moins trois lettres.", ES: "Escribe al menos tres letras.", DE: "Mindestens drei Buchstaben eingeben.", RU: "Введите не менее трёх букв.", ZH: "至少输入三个字母。" },
  map_start_search_error: { IT: "Ricerca non disponibile, riprova tra poco.", EN: "Search unavailable, try again shortly.", FR: "Recherche indisponible, réessayez bientôt.", ES: "Búsqueda no disponible, inténtalo en breve.", DE: "Suche nicht verfügbar, bitte gleich erneut versuchen.", RU: "Поиск недоступен, попробуйте позже.", ZH: "搜索不可用，请稍后再试。" },
  personal_area: {
    IT: "Area Personale",
    EN: "Personal Profile",
    FR: "Profil Personnel",
    ES: "Perfil Personal",
    RU: "Личный профиль",
    ZH: "个人资料"
  , DE: "Persönliches Profil"},
  personal_desc: {
    IT: "Personalizza nome e foto profilo",
    EN: "Customize your name and profile photo",
    FR: "Personnalisez votre nom et photo de profil",
    ES: "Personaliza tu nombre y foto de perfil",
    RU: "Настройте имя и аватар профиля",
    ZH: "设置您的专属昵称与头像"
  , DE: "Passe deinen Namen und dein Profilbild an"},
  display_name: {
    IT: "Nome Mostrato",
    EN: "Display Name",
    FR: "Nom d'Affichage",
    ES: "Nombre a Mostrar",
    RU: "Отображаемое имя",
    ZH: "昵称"
  , DE: "Anzeigename"},
  profile_photo: {
    IT: "Foto Profilo (Emoji o Carica)",
    EN: "Profile Photo (Emoji or Upload)",
    FR: "Photo de Profil (Emoji ou Fichier)",
    ES: "Foto de Perfil (Emoji o Cargar)",
    RU: "Аватар (Эмодзи или Файл)",
    ZH: "上传头像或选择Emoji"
  , DE: "Profilbild (Emoji oder Upload)"},
  browse: {
    IT: "Sfoglia...",
    EN: "Browse...",
    FR: "Parcourir...",
    ES: "Buscar...",
    RU: "Обзор...",
    ZH: "选择本地图片..."
  , DE: "Durchsuchen..."},
  default_location: {
    IT: "Posizione Predefinita",
    EN: "Default Location",
    FR: "Position par Défaut",
    ES: "Ubicación Predeterminada",
    RU: "Начальное местоположение",
    ZH: "常用初始位置"
  , DE: "Standardstandort"},
  default_location_desc: {
    IT: "Salva la tua posizione iniziale per la mappa",
    EN: "Save your starting location for the map",
    FR: "Enregistrez votre position de départ sur la carte",
    ES: "Guarda tu posición inicial para el mapa",
    RU: "Сохраните начальную точку для открытия карты",
    ZH: "自定义每次打开地图时的定位点"
  , DE: "Speichere deinen Startort für die Karte"},
  search_city: {
    IT: "Cerca una città...",
    EN: "Search a city...",
    FR: "Rechercher une ville...",
    ES: "Buscar una ciudad...",
    RU: "Поиск города...",
    ZH: "查找城市并设为中心点..."
  , DE: "Stadt suchen..."},
  search_btn: {
    IT: "Cerca",
    EN: "Search",
    FR: "Rechercher",
    ES: "Buscar",
    RU: "Поиск",
    ZH: "定位"
  , DE: "Suchen"},
  use_current_location: {
    IT: "Usa la mia posizione attuale",
    EN: "Use my current location",
    FR: "Utiliser ma position actuelle",
    ES: "Usar mi ubicación actual",
    RU: "Использовать текущую геопозицию",
    ZH: "使用我当前的 GPS 定位"
  , DE: "Meinen aktuellen Standort verwenden"},
  default_location_hint: {
    IT: "La mappa si aprirà sempre da questa posizione se convalidata.",
    EN: "The map will always open at this location once validated.",
    FR: "La carte s'ouvrira toujours sur cette position une fois validée.",
    ES: "El mapa se abrirá siempre en esta ubicación una vez validada.",
    RU: "Карта всегда будет открываться на этой точке.",
    ZH: "验证通过后，每次进入应用时地图默认显示此区域。"
  , DE: "Die Karte öffnet sich nach der Bestätigung immer an diesem Ort."},
  have_coupon: {
    IT: "Hai un codice partner?",
    EN: "Do you have a partner code?",
    FR: "Avez-vous un code partenaire?",
    ES: "¿Tienes un código de socio?",
    RU: "Есть партнерский код?",
    ZH: "您拥有酒店合作兑换码吗？"
  , DE: "Hast du einen Partnercode?"},
  redeem_coupon_desc: {
    IT: "Attiva i vantaggi Premium offerti dal tuo Hotel",
    EN: "Activate the Premium benefits offered by your Hotel",
    FR: "Activez les avantages Premium offerts par votre Hôtel",
    ES: "Activa las ventajas Premium que ofrece tu Hotel",
    RU: "Активируйте Премиум-доступ от вашего отеля",
    ZH: "激活您的合作酒店免费赠送的 Premium 会员权益"
  , DE: "Aktiviere die Premium-Vorteile deines Hotels"},
  redeem_btn: {
    IT: "Attiva",
    EN: "Activate",
    FR: "Activer",
    ES: "Activar",
    RU: "Активировать",
    ZH: "兑换"
  , DE: "Aktivieren"},
  redeem_verifying: {
    IT: "Verifica...",
    EN: "Verifying...",
    FR: "Vérification...",
    ES: "Verificando...",
    RU: "Проверка...",
    ZH: "验证中..."
  , DE: "Wird geprüft..."},
  redeem_success: {
    IT: "Coupon attivato! Extra Premium abilitato.",
    EN: "Coupon activated! Extra Premium enabled.",
    FR: "Code activé! Extra Premium activé.",
    ES: "¡Cupón activado! Beneficios Premium disponibles.",
    RU: "Код активирован! Премиум включен.",
    ZH: "兑换成功！您的Premium会员特权已激活。"
  , DE: "Gutschein aktiviert! Zusätzliches Premium freigeschaltet."},
  guide_mode: {
    IT: "Modalità Guida",
    EN: "Guide Mode",
    FR: "Mode Guide",
    ES: "Modo Guía",
    RU: "Режим гида",
    ZH: "语音导览讲解员"
  , DE: "Guide-Modus"},
  guide_mode_desc: {
    IT: "Scegli la voce narrante",
    EN: "Choose the narrator voice",
    FR: "Choisissez la voix du narrateur",
    ES: "Elige la voz del narrador",
    RU: "Выберите голос рассказчика",
    ZH: "轻触切换您喜欢的语音助手"
  , DE: "Wähle die Erzählerstimme"},
  signout: {
    IT: "Esci dall'Account",
    EN: "Sign Out of Account",
    FR: "Se Déconnecter",
    ES: "Cerrar Sesión",
    RU: "Выйти из аккаунта",
    ZH: "退出登录"
  , DE: "Vom Konto abmelden"},
  language_title: {
    IT: "Lingua di Sistema",
    EN: "System Language",
    FR: "Langue du Système",
    ES: "Idioma del Sistema",
    RU: "Язык системы",
    ZH: "应用语言 (Language)"
  , DE: "Systemsprache"},
  language_desc: {
    IT: "Traduci istantaneamente descrizioni, itinerari ed audioguide",
    EN: "Instantly translate descriptions, itineraries, and audio guides",
    FR: "Traduisez instantanément descriptions, itinéraires et guides audio",
    ES: "Traduce al instante descripciones, itinerarios y audioguías",
    RU: "Мгновенный перевод описаний, маршрутов и аудиогидов",
    ZH: "一键切换中文、英文等多语种，音频与文字秒速翻译"
  , DE: "Übersetze Beschreibungen, Routen und Audioguides sofort"},
  loading_audio_nicky: {
    IT: 'Generando nuova "vibe" da Nicky...',
    EN: 'Generating new "vibe" by Nicky...',
    FR: 'Génération de la "vibe" de Nicky...',
    ES: 'Generando nueva "vibe" de Nicky...',
    RU: 'Создание новой «атмосферы» от Ники...',
    ZH: 'Nicky 正在为您定制个性化旅行氛围...'
  , DE: "Nicky erstellt eine neue \"Vibe\"..."},
  loading_audio_dante: {
    IT: "Dante sta elaborando la descrizione storica...",
    EN: "Dante is crafting the historical narrative...",
    FR: "Dante élabore le récit historique...",
    ES: "Dante está elaborando la narración histórica...",
    RU: "Данте готовит историческое повествование...",
    ZH: "但丁正在撰写历史典故..."
  , DE: "Dante verfasst die historische Erzählung..."},
  
  // Premium Tab (Pricing.tsx)
  premium_title: {
    IT: "Sblocca il Premium",
    EN: "Unlock Premium",
    FR: "Débloquez Premium",
    ES: "Desbloquee Premium",
    RU: "Разблокировать Премиум",
    ZH: "升级 WIP Premium"
  , DE: "Premium freischalten"},
  premium_desc: {
    IT: "Costruisci itinerari senza limiti e goditi ogni dettaglio con le audioguide. Scegli il piano più adatto a te.",
    EN: "Build unlimited itineraries and enjoy every detail with audio guides. Choose the plan that suits you best.",
    FR: "Créez des itinéraires illimités et profitez de chaque détail grâce aux guides audio. Choisissez le forfait idéal.",
    ES: "Cree itinerarios ilimitados y disfrute de cada detalle con las audioguías. Elija el plan que mejor se adapte a usted.",
    RU: "Планируйте поездки без ограничений и слушайте аудиогиды без лимитов. Выберите наиболее подходящий тариф.",
    ZH: "解锁无限次智能行程规划与语音导游功能。即刻开启前所未有的深度旅行体验。"
  , DE: "Erstelle unbegrenzt viele Routen und genieße jedes Detail mit Audioguides. Wähle den Plan, der am besten zu dir passt."},
  premium_popular: {
    IT: "Più Popolare",
    EN: "Most Popular",
    FR: "Le Plus Populaire",
    ES: "Más Popular",
    RU: "Популярный выбор",
    ZH: "最具性价比"
  , DE: "Am beliebtesten"},
  premium_select: {
    IT: "Seleziona",
    EN: "Select",
    FR: "Sélectionner",
    ES: "Seleccionar",
    RU: "Выбрать",
    ZH: "立即订阅"
  , DE: "Auswählen"},
  premium_loading: {
    IT: "Caricamento...",
    EN: "Loading...",
    FR: "Chargement...",
    ES: "Cargando...",
    RU: "Загрузка...",
    ZH: "跳转支付中..."
  , DE: "Wird geladen..."},
  premium_alert_login: {
    IT: "Devi effettuare l'accesso per abbonarti.",
    EN: "You must log in to subscribe.",
    FR: "Vous devez vous connecter pour vous abonner.",
    ES: "Debe iniciar sesión para suscribirse.",
    RU: "Вам необходимо войти в систему для оформления подписки.",
    ZH: "请先登录您的 WIP 账户，即可继续订阅。"
  , DE: "Du musst dich anmelden, um zu abonnieren."},
  premium_plan_weekly: {
    IT: "Settimanale",
    EN: "Weekly",
    FR: "Hebdomadaire",
    ES: "Semanal",
    RU: "Недельный",
    ZH: "周度会员"
  , DE: "Wöchentlich"},
  premium_plan_monthly: {
    IT: "Mensile",
    EN: "Monthly",
    FR: "Mensuel",
    ES: "Mensual",
    RU: "Месячный",
    ZH: "月度会员"
  , DE: "Monatlich"},
  premium_plan_yearly: {
    IT: "Annuale",
    EN: "Yearly",
    FR: "Annuel",
    ES: "Anual",
    RU: "Годовой",
    ZH: "年度会员"
  , DE: "Jährlich"},
  premium_period_week: {
    IT: "/ settimana",
    EN: "/ week",
    FR: "/ semaine",
    ES: "/ semana",
    RU: "/ неделю",
    ZH: "/ 周"
  , DE: "/ Woche"},
  premium_period_month: {
    IT: "/ mese",
    EN: "/ month",
    FR: "/ mois",
    ES: "/ mes",
    RU: "/ месяц",
    ZH: "/ 月"
  , DE: "/ Monat"},
  premium_period_year: {
    IT: "/ anno",
    EN: "/ year",
    FR: "/ an",
    ES: "/ año",
    RU: "/ год",
    ZH: "/ 年"
  , DE: "/ Jahr"},
  premium_feature_itineraries: {
    IT: "5 Itinerari al giorno",
    EN: "5 Itineraries per day",
    FR: "5 Itinéraires par jour",
    ES: "5 Itinerarios por día",
    RU: "5 маршрутов в день",
    ZH: "每日上限 5 个智能行程"
  , DE: "5 Routen pro Tag"},
  premium_feature_audioguides: {
    IT: "15 Audioguide al giorno",
    EN: "15 Audio guides per day",
    FR: "15 Guides audio par jour",
    ES: "15 Audioguías por día",
    RU: "15 аудиогидов в день",
    ZH: "每日上限 15 次语音解说"
  , DE: "15 Audioguides pro Tag"},
  premium_feature_ads: {
    IT: "Nessuna pubblicità",
    EN: "No ads",
    FR: "Sans publicité",
    ES: "Sin publicidad",
    RU: "Без рекламы",
    ZH: "纯净体验，无任何广告"
  , DE: "Keine Werbung"},
  premium_feature_support: {
    IT: "Assistenza prioritaria",
    EN: "Priority support",
    FR: "Support prioritaire",
    ES: "Soporte prioritario",
    RU: "Приоритетная поддержка",
    ZH: "专属高级客服与技术支持"
  , DE: "Bevorzugter Support"},
  premium_feature_savings: {
    IT: "Risparmio di 60€",
    EN: "Save 60€",
    FR: "Économisez 60€",
    ES: "Ahorre 60€",
    RU: "Скидка 60€",
    ZH: "超值特惠（立省 60 欧元）"
  , DE: "Spare 60 €"},

  // Hotel Tab (B2BPartner.tsx)
  b2b_title: {
    IT: "Portale Strutture Ricettive",
    EN: "Hospitality Portal",
    FR: "Portail Hébergement",
    ES: "Portal de Alojamiento",
    RU: "Портал для отелей",
    ZH: "合作酒店服务管理中心"
  , DE: "Portal für Unterkünfte"},
  b2b_desc: {
    IT: "Acquista pacchetti di coupon prepagati per offrire l'accesso Premium ai tuoi clienti durante il loro soggiorno.",
    EN: "Purchase prepaid coupon packages to offer Premium access to your guests during their stay.",
    FR: "Achetez des packs de coupons prépayés pour offrir un accès Premium à vos clients pendant leur séjour.",
    ES: "Adquiera paquetes de cupones prepagados para ofrecer acceso Premium a sus huéspedes durante su estancia.",
    RU: "Приобретайте пакеты предоплаченных купонов, чтобы предоставить вашим гостям Премиум-доступ на время их проживания.",
    ZH: "在此购买酒店客户专属优惠礼券包，让您的客人在入住期间免费享受 WIP 智能导览与行程规划服务。"
  , DE: "Kaufe Pakete mit Prepaid-Gutscheinen, um deinen Gästen während ihres Aufenthalts Premium-Zugang zu bieten."},
  b2b_success_title: {
    IT: "Acquisto Completato!",
    EN: "Purchase Completed!",
    FR: "Achat Terminé!",
    ES: "¡Compra Completada!",
    RU: "Покупка успешно совершена!",
    ZH: "支付成功，礼券已到账！"
  , DE: "Kauf abgeschlossen!"},
  b2b_success_desc: {
    IT: "I tuoi coupon sono stati generati. Cerca il nome della tua struttura per visualizzarli.",
    EN: "Your coupons have been generated. Search for your accommodation name to view them.",
    FR: "Vos coupons ont été générés. Recherchez le nom de votre établissement pour les afficher.",
    ES: "Sus cupones han sido generados. Busque el nombre de su establecimiento para verlos.",
    RU: "Ваши купоны были успешно созданы. Введите название отеля для их отображения.",
    ZH: "您的兑换券已生成完毕。请输入您的酒店名称进行查询与分配。"
  , DE: "Deine Gutscheine wurden erstellt. Suche den Namen deiner Unterkunft, um sie anzuzeigen."},
  b2b_structure_title: {
    IT: "La tua Struttura",
    EN: "Your Accommodation",
    FR: "Votre Établissement",
    ES: "Su Establecimiento",
    RU: "Ваш отель",
    ZH: "酒店基本信息"
  , DE: "Deine Unterkunft"},
  b2b_structure_placeholder: {
    IT: "Nome dell'Hotel / Residence",
    EN: "Hotel / Residence Name",
    FR: "Nom de l'Hôtel / Résidence",
    ES: "Nombre del Hotel / Residencia",
    RU: "Название отеля или апартаментов",
    ZH: "请输入酒店或公寓名称..."
  , DE: "Name des Hotels / der Residence"},
  b2b_search: {
    IT: "Cerca",
    EN: "Search",
    FR: "Rechercher",
    ES: "Buscar",
    RU: "Найти",
    ZH: "查询"
  , DE: "Suchen"},
  b2b_price_validity: {
    IT: "Validità 7 giorni/cad.",
    EN: "7-day validity each",
    FR: "Validité 7 jours chacun",
    ES: "Validez de 7 días cada uno",
    RU: "Срок действия: 7 дней каждый",
    ZH: "每张券有效期为7天"
  , DE: "Je 7 Tage gültig"},
  b2b_price_codes: {
    IT: "Codici",
    EN: "Codes",
    FR: "Codes",
    ES: "Códigos",
    RU: "кодов",
    ZH: "个兑换码"
  , DE: "Codes"},
  b2b_purchase: {
    IT: "Acquista",
    EN: "Buy",
    FR: "Acheter",
    ES: "Comprar",
    RU: "Купить",
    ZH: "立即购买"
  , DE: "Kaufen"},
  b2b_best_seller: {
    IT: "PIÙ VENDUTO",
    EN: "BEST SELLER",
    FR: "MEILLEURE VENTE",
    ES: "MÁS VENDIDO",
    RU: "ХИТ ПРОДАЖ",
    ZH: "精选热销"
  , DE: "BESTSELLER"},
  b2b_coupons_title: {
    IT: "I Tuoi Coupon",
    EN: "Your Coupons",
    FR: "Vos Coupons",
    ES: "Sus Cupones",
    RU: "Ваши купоны",
    ZH: "已购礼券列表"
  , DE: "Deine Gutscheine"},
  b2b_coupons_desc: {
    IT: "Codici generati per",
    EN: "Codes generated for",
    FR: "Codes générés pour",
    ES: "Códigos generados para",
    RU: "Коды, созданные для",
    ZH: "已为您成功生成激活码，归属单位："
  , DE: "Codes erstellt für"},
  b2b_download_csv: {
    IT: "Scarica CSV",
    EN: "Download CSV",
    FR: "Télécharger CSV",
    ES: "Descargar CSV",
    RU: "Скачать CSV",
    ZH: "导出 CSV 电子表格"
  , DE: "CSV herunterladen"},
  b2b_used: {
    IT: "Utilizzato",
    EN: "Used",
    FR: "Utilisé",
    ES: "Utilizado",
    RU: "Использован",
    ZH: "已激活使用"
  , DE: "Verwendet"},
  b2b_available: {
    IT: "Disponibile",
    EN: "Available",
    FR: "Disponible",
    ES: "Disponible",
    RU: "Свободен",
    ZH: "未使用 (待分配)"
  , DE: "Verfügbar"},
  b2b_alert_fill_name: {
    IT: "Inserisci il nome della tua struttura prima di procedere",
    EN: "Please enter your accommodation name before proceeding",
    FR: "Veuillez saisir le nom de votre établissement avant de continuer",
    ES: "Por favor, introduzca el nombre de su establecimiento antes de continuar",
    RU: "Пожалуйста, введите название отеля перед продолжением",
    ZH: "在继续购买前，请先输入您的酒店名称以进行绑定登记"
  , DE: "Bitte gib den Namen deiner Unterkunft ein, bevor du fortfährst"},
  b2b_csv_header_code: {
    IT: "Codice",
    EN: "Code",
    FR: "Code",
    ES: "Código",
    RU: "Код",
    ZH: "兑换码"
  , DE: "Code"},
  b2b_csv_header_status: {
    IT: "Stato",
    EN: "Status",
    FR: "Statut",
    ES: "Estado",
    RU: "Статус",
    ZH: "使用状态"
  , DE: "Status"},
  b2b_csv_header_expiry: {
    IT: "Scadenza",
    EN: "Expiry",
    FR: "Expiration",
    ES: "Expiración",
    RU: "Истечение срока",
    ZH: "有效天数"
  , DE: "Ablauf"},
  b2b_csv_days: {
    IT: "giorni",
    EN: "days",
    FR: "jours",
    ES: "días",
    RU: "дней",
    ZH: "天"
  , DE: "Tage"},

  // AI Camera Screen (CameraScreen.tsx)
  camera_unavailable: {
    IT: "Fotocamera non disponibile",
    EN: "Camera not available",
    FR: "Appareil photo non disponible",
    ES: "Cámara no disponible",
    RU: "Камера недоступна",
    ZH: "未检测到或无法开启摄像头"
  , DE: "Kamera nicht verfügbar"},
  camera_unavailable_desc: {
    IT: "Carica una foto dalla tua galleria per identificare il monumento.",
    EN: "Upload a photo from your gallery to identify the monument.",
    FR: "Téléchargez une photo de votre galerie pour identifier le monument.",
    ES: "Cargue una foto de su galería para identificar el monumento.",
    RU: "Загрузите фотографию из галереи, чтобы распознать памятник.",
    ZH: "您可以从手机相册中上传一张照片，让我们帮您识别出这个历史建筑。"
  , DE: "Lade ein Foto aus deiner Galerie hoch, um das Denkmal zu erkennen."},
  camera_upload_photo: {
    IT: "CARICA FOTO",
    EN: "UPLOAD PHOTO",
    FR: "CHARGER LA PHOTO",
    ES: "CARGAR FOTO",
    RU: "ЗАГРУЗИТЬ ФОТО",
    ZH: "从相册上传"
  , DE: "FOTO HOCHLADEN"},
  camera_viewfinder_hint: {
    IT: "Inquadra un monumento",
    EN: "Frame a monument",
    FR: "Cadrez un monument",
    ES: "Encuadre un monumento",
    RU: "Направьте камеру на памятник",
    ZH: "请将镜头对准历史建筑或雕像"
  , DE: "Richte die Kamera auf ein Denkmal"},
  camera_scanning: {
    IT: "Analisi in corso",
    EN: "Analyzing...",
    FR: "Analyse en cours...",
    ES: "Analizando...",
    RU: "Распознавание...",
    ZH: "正在利用 AI 进行智能识别..."
  , DE: "Analyse läuft..."},
  camera_scanning_desc: {
    IT: "Interrogando la guida AI...",
    EN: "Querying AI guide...",
    FR: "Interrogation du guide IA...",
    ES: "Consultando la guía IA...",
    RU: "Запрос к ИИ-путеводителю...",
    ZH: "正在检索 WIP 云端数据库与AI导游..."
  , DE: "KI-Guide wird befragt..."},
  museum_pass_title: {
    IT: "Pass Museo",
    EN: "Museum Pass",
    FR: "Pass Musée",
    ES: "Pase Museo",
    DE: "Museumspass",
    RU: "Музейный пасс",
    ZH: "博物馆通票"
  },
  museum_pass_desc: {
    IT: "Riconoscimenti illimitati per 4 ore: inquadra le opere, WIP te le racconta.",
    EN: "Unlimited recognitions for 4 hours: frame the artworks, WIP tells their story.",
    FR: "Reconnaissances illimitées pendant 4 heures : cadrez les œuvres, WIP les raconte.",
    ES: "Reconocimientos ilimitados durante 4 horas: encuadra las obras y WIP te las cuenta.",
    DE: "Unbegrenzte Erkennungen für 4 Stunden: Kunstwerke anvisieren, WIP erzählt.",
    RU: "Безлимитное распознавание на 4 часа: наведите камеру на экспонат — WIP расскажет.",
    ZH: "4小时内无限识别：对准展品，WIP 为你讲解。"
  },
  museum_pass_active: {
    IT: "Pass Museo attivo",
    EN: "Museum Pass active",
    FR: "Pass Musée actif",
    ES: "Pase Museo activo",
    DE: "Museumspass aktiv",
    RU: "Музейный пасс активен",
    ZH: "博物馆通票已激活"
  },
  museum_pass_unlimited: {
    IT: "Scansioni illimitate incluse",
    EN: "Unlimited scans included",
    FR: "Scans illimités inclus",
    ES: "Escaneos ilimitados incluidos",
    DE: "Unbegrenzte Scans inklusive",
    RU: "Безлимитные сканирования включены",
    ZH: "已含无限次扫描"
  },
  museum_pass_remaining: {
    IT: "Scade tra",
    EN: "Expires in",
    FR: "Expire dans",
    ES: "Caduca en",
    DE: "Läuft ab in",
    RU: "Истекает через",
    ZH: "剩余时间"
  },
  museum_pass_cta: {
    IT: "Attiva per 4 ore",
    EN: "Activate for 4 hours",
    FR: "Activer pour 4 heures",
    ES: "Activar por 4 horas",
    DE: "Für 4 Stunden aktivieren",
    RU: "Активировать на 4 часа",
    ZH: "激活4小时"
  },
  museum_pass_bought: {
    IT: "Pass Museo attivato! Inquadra le opere e lasciati raccontare.",
    EN: "Museum Pass activated! Frame the artworks and enjoy the stories.",
    FR: "Pass Musée activé ! Cadrez les œuvres et laissez-vous raconter.",
    ES: "¡Pase Museo activado! Encuadra las obras y déjate contar.",
    DE: "Museumspass aktiviert! Kunstwerke anvisieren und zuhören.",
    RU: "Музейный пасс активирован! Наводите камеру на экспонаты.",
    ZH: "博物馆通票已激活！对准展品，聆听讲解。"
  },
  museum_pass_error: {
    IT: "Attivazione non riuscita, riprova.",
    EN: "Activation failed, please try again.",
    FR: "Activation échouée, réessayez.",
    ES: "Activación fallida, inténtalo de nuevo.",
    DE: "Aktivierung fehlgeschlagen, bitte erneut versuchen.",
    RU: "Не удалось активировать, попробуйте ещё раз.",
    ZH: "激活失败，请重试。"
  },
  credits_word: {
    IT: "crediti",
    EN: "credits",
    FR: "crédits",
    ES: "créditos",
    DE: "Credits",
    RU: "кредитов",
    ZH: "积分"
  },
  poi_tickets_book: {
    IT: "Prenota",
    EN: "Book",
    FR: "Réserver",
    ES: "Reservar",
    DE: "Buchen",
    RU: "Купить",
    ZH: "预订"
  },
  camera_error_title: {
    IT: "Ops!",
    EN: "Oops!",
    FR: "Oups!",
    ES: "¡Ops!",
    RU: "Ой!",
    ZH: "提示"
  , DE: "Hoppla!"},
  camera_error_not_recognized: {
    IT: "Scusa, non riesco a riconoscere questo monumento. Potrebbe non essere in Italia o l'immagine non è chiara.",
    EN: "Sorry, I can't recognize this monument. It might not be in Italy or the image is not clear.",
    FR: "Désolé, je ne parviens pas à reconnaître ce monument. Il se peut qu'il ne soit pas en Italie ou que l'image ne soit pas claire.",
    ES: "Lo siento, no puedo reconocer este monumento. Puede que no esté en Italia o que la imagen no sea clara.",
    RU: "Извините, не удалось распознать этот памятник. Возможно, он находится не в Италии или фото нечеткое.",
    ZH: "很抱歉，我们无法准确识别此建筑。建议拍摄更清晰的角度，或者它可能不在我们的收录范围内。"
  , DE: "Entschuldigung, ich kann dieses Denkmal nicht erkennen. Es befindet sich vielleicht nicht in Italien, oder das Bild ist nicht klar genug."},
  camera_error_quota: {
    IT: "Hai superato il limite di richieste gratuite dell'API. Riprova più tardi (tra qualche minuto).",
    EN: "You have exceeded the free API request limit. Try again later (in a few minutes).",
    FR: "Vous avez dépassé la limite de requêtes API gratuites. Réessayez plus tard (dans quelques minutes).",
    ES: "Ha superado el límite de solicitudes de API gratuitas. Inténtelo de nuevo más tarde (en unos minutos).",
    RU: "Вы превысили лимит бесплатных запросов к API. Попробуйте еще раз через несколько минут.",
    ZH: "您今天免费识别的次数已达上限。请几分钟后再次尝试。"
  , DE: "Du hast das Limit für kostenlose API-Anfragen überschritten. Versuche es später erneut (in ein paar Minuten)."},
  camera_error_failed: {
    IT: "ERRORE: Impossibile completare il riconoscimento.",
    EN: "ERROR: Unable to complete recognition.",
    FR: "ERREUR : Impossible de terminer la reconnaissance.",
    ES: "ERROR: No se pudo completar el riconoscimento.",
    RU: "ОШИБКА: Не удалось выполнить распознавание.",
    ZH: "识别失败，请检查您的网络连接后重试。"
  , DE: "FEHLER: Erkennung konnte nicht abgeschlossen werden."},
  camera_retry: {
    IT: "RIPROVA",
    EN: "RETRY",
    FR: "RÉESSAYER",
    ES: "REINTENTAR",
    RU: "ПОВТОРИТЬ",
    ZH: "重新尝试"
  , DE: "ERNEUT VERSUCHEN"},
  camera_access_denied: {
    IT: "Accesso alla fotocamera negato o non disponibile.",
    EN: "Camera access denied or unavailable.",
    FR: "Accès à l'appareil photo refusé ou non disponible.",
    ES: "Acceso a la cámara denegado o no disponible.",
    RU: "Доступ к камере запрещен или недоступен.",
    ZH: "未能获得摄像头调用权限，请在系统设置中允许 WIP 访问您的相机。"
  , DE: "Zugriff auf die Kamera verweigert oder nicht verfügbar."},

  // Events Explorer Screen (EventsScreen.tsx)
  events_title: {
    IT: "Eventi",
    EN: "Events",
    FR: "Événements",
    ES: "Eventos",
    RU: "События",
    ZH: "精彩活动"
  , DE: "Veranstaltungen"},
  events_subtitle: {
    IT: "Sagre, mostre, concerti e mercatini entro",
    EN: "Festivals, exhibitions, concerts, and markets within",
    FR: "Festivals, expositions, concerts et marchés dans un rayon de",
    ES: "Festivales, exposiciones, conciertos y mercados a menos de",
    RU: "Фестивали, выставки, концерты и ярмарки в радиусе",
    ZH: "为您网罗周边的艺术展、美食节、音乐会与集市，范围："
  , DE: "Feste, Ausstellungen, Konzerte und Märkte im Umkreis von"},
  events_view_exhibitions: {
    IT: "Mostre",
    EN: "Exhibitions",
    FR: "Expositions",
    ES: "Exposiciones",
    DE: "Ausstellungen",
    RU: "Выставки",
    ZH: "展览"
  },
  events_exhibitions_subtitle: {
    IT: "Mostre temporanee nei musei della zona, lette dai loro siti",
    EN: "Temporary exhibitions in nearby museums, read from their websites",
    FR: "Expositions temporaires des musées voisins, lues sur leurs sites",
    ES: "Exposiciones temporales en los museos de la zona, leídas de sus webs",
    DE: "Wechselausstellungen der Museen in der Nähe, von ihren Websites gelesen",
    RU: "Временные выставки музеев поблизости, с их сайтов",
    ZH: "周边博物馆的临时展览，来自各馆官网"
  },
  events_exhibitions_none: {
    IT: "Nessuna mostra trovata",
    EN: "No exhibitions found",
    FR: "Aucune exposition trouvée",
    ES: "No se encontraron exposiciones",
    DE: "Keine Ausstellungen gefunden",
    RU: "Выставки не найдены",
    ZH: "未找到展览"
  },
  events_exhibitions_none_desc: {
    IT: "Prova ad allargare il raggio o le date: leggiamo i siti dei musei entro il raggio scelto.",
    EN: "Try a wider radius or other dates: we read the websites of the museums within the chosen radius.",
    FR: "Essayez un rayon plus large ou d'autres dates : nous lisons les sites des musées dans le rayon choisi.",
    ES: "Prueba un radio mayor u otras fechas: leemos las webs de los museos dentro del radio elegido.",
    DE: "Versuchen Sie einen größeren Radius oder andere Daten: wir lesen die Websites der Museen im gewählten Umkreis.",
    RU: "Попробуйте расширить радиус или изменить даты: мы читаем сайты музеев в выбранном радиусе.",
    ZH: "请尝试扩大范围或更改日期：我们会读取所选范围内博物馆的官网。"
  },
  events_exhibitions_note: {
    IT: "Date e titoli letti dai siti dei musei e da Wikidata: verifica sul sito prima di andare.",
    EN: "Dates and titles read from museum websites and Wikidata: check the website before you go.",
    FR: "Dates et titres lus sur les sites des musées et Wikidata : vérifiez avant de partir.",
    ES: "Fechas y títulos leídos de las webs de los museos y Wikidata: compruébalo antes de ir.",
    DE: "Daten und Titel von Museums-Websites und Wikidata: vor dem Besuch prüfen.",
    RU: "Даты и названия взяты с сайтов музеев и Wikidata: проверьте перед визитом.",
    ZH: "日期与标题来自博物馆官网和维基数据，出发前请在官网核实。"
  },
  events_exh_current: {
    IT: "In corso",
    EN: "On now",
    FR: "En cours",
    ES: "En curso",
    DE: "Aktuell",
    RU: "Сейчас",
    ZH: "正在展出"
  },
  events_permanent_none: {
    IT: "Nessun museo in questa zona",
    EN: "No museums in this area",
    FR: "Aucun musée dans cette zone",
    ES: "Ningún museo en esta zona",
    DE: "Keine Museen in dieser Gegend",
    RU: "Музеев поблизости нет",
    ZH: "该区域没有博物馆"
  },
  events_permanent_none_desc: {
    IT: "Allarga il raggio: le collezioni permanenti sono i musei del nostro catalogo entro la distanza scelta.",
    EN: "Widen the radius: permanent collections are the museums in our catalogue within the chosen distance.",
    FR: "Élargissez le rayon : les collections permanentes sont les musées de notre catalogue dans la distance choisie.",
    ES: "Amplía el radio: las colecciones permanentes son los museos de nuestro catálogo dentro de la distancia elegida.",
    DE: "Radius vergrößern: Dauerausstellungen sind die Museen unseres Katalogs im gewählten Umkreis.",
    RU: "Расширьте радиус: постоянные экспозиции — это музеи из нашего каталога в выбранном радиусе.",
    ZH: "请扩大范围：常设展览即我们目录中所选距离内的博物馆。"
  },
  events_exh_permanent: {
    IT: "Collezioni permanenti",
    EN: "Permanent collections",
    FR: "Collections permanentes",
    ES: "Colecciones permanentes",
    DE: "Dauerausstellungen",
    RU: "Постоянные экспозиции",
    ZH: "常设展览"
  },
  events_permanent_label: {
    IT: "Collezione permanente",
    EN: "Permanent collection",
    FR: "Collection permanente",
    ES: "Colección permanente",
    DE: "Dauerausstellung",
    RU: "Постоянная экспозиция",
    ZH: "常设展"
  },
  events_open_on_map: {
    IT: "Vedi sulla mappa",
    EN: "See on map",
    FR: "Voir sur la carte",
    ES: "Ver en el mapa",
    DE: "Auf der Karte",
    RU: "На карте",
    ZH: "在地图上查看"
  },
  events_exhibition_site: {
    IT: "Sito del museo",
    EN: "Museum website",
    FR: "Site du musée",
    ES: "Web del museo",
    DE: "Website des Museums",
    RU: "Сайт музея",
    ZH: "博物馆官网"
  },
  events_last_days: {
    IT: "Ultimi giorni",
    EN: "Last days",
    FR: "Derniers jours",
    ES: "Últimos días",
    DE: "Letzte Tage",
    RU: "Последние дни",
    ZH: "即将结束"
  },
  events_opens_on: {
    IT: "apre il",
    EN: "opens on",
    FR: "ouvre le",
    ES: "abre el",
    DE: "öffnet am",
    RU: "открытие",
    ZH: "开幕"
  },
  events_until: {
    IT: "fino al",
    EN: "until",
    FR: "jusqu'au",
    ES: "hasta el",
    DE: "bis",
    RU: "до",
    ZH: "截至"
  },
  events_from: {
    IT: "Dal",
    EN: "From",
    FR: "Du",
    ES: "Desde",
    RU: "С",
    ZH: "开始日期"
  , DE: "Von"},
  events_to: {
    IT: "Al",
    EN: "To",
    FR: "Au",
    ES: "Hasta",
    RU: "По",
    ZH: "结束日期"
  , DE: "Bis"},
  events_distance: {
    IT: "Distanza:",
    EN: "Distance:",
    FR: "Distance:",
    ES: "Distancia:",
    RU: "Дистанция:",
    ZH: "搜索范围:"
  , DE: "Entfernung:"},
  events_sort: {
    IT: "Ordina:",
    EN: "Sort by:",
    FR: "Trier par:",
    ES: "Ordenar por:",
    RU: "Сортировка:",
    ZH: "排序规则:"
  , DE: "Sortieren nach:"},
  events_sort_date: {
    IT: "Data",
    EN: "Date",
    FR: "Date",
    ES: "Fecha",
    RU: "Дате",
    ZH: "按日期"
  , DE: "Datum"},
  events_sort_relevance: {
    IT: "Pertinenza",
    EN: "Relevance",
    FR: "Pertinence",
    ES: "Relevancia",
    RU: "Популярности",
    ZH: "按推荐度"
  , DE: "Relevanz"},
  events_loading: {
    IT: "Ricerca eventi in corso...",
    EN: "Searching events...",
    FR: "Recherche d'événements...",
    ES: "Buscando eventos...",
    RU: "Поиск событий...",
    ZH: "正在为您搜罗周边好玩的活动..."
  , DE: "Veranstaltungen werden gesucht..."},
  events_retry: {
    IT: "Riprova tutto",
    EN: "Retry all",
    FR: "Réessayer tout",
    ES: "Reintentar todo",
    RU: "Повторить всё",
    ZH: "重新加载"
  , DE: "Alles erneut versuchen"},
  events_not_found: {
    IT: "Nessun evento trovato",
    EN: "No events found",
    FR: "Aucun événement trouvé",
    ES: "No se encontraron eventos",
    RU: "Событий не найдено",
    ZH: "该时段及区域暂无活动信息"
  , DE: "Keine Veranstaltungen gefunden"},
  events_not_found_desc: {
    IT: "Prova a cambiare le date o i filtri di ricerca.",
    EN: "Try changing dates or search filters.",
    FR: "Essayez de changer les dates ou les filtres de recherche.",
    ES: "Intente cambiar las fechas o los filtros de búsqueda.",
    RU: "Попробуйте изменить даты или фильтры поиска.",
    ZH: "您可以尝试更改日期区间或扩大搜索范围再试试看。"
  , DE: "Versuche, die Daten oder Suchfilter zu ändern."},
  events_source_errors: {
    IT: "Alcune sorgenti hanno riportato errori",
    EN: "Some sources reported errors",
    FR: "Certaines sources ont signalé des erreurs",
    ES: "Algunas fuentes informaron de errores",
    RU: "Некоторые источники сообщили об ошибках",
    ZH: "部分活动数据接口出现临时性网络故障"
  , DE: "Einige Quellen meldeten Fehler"},
  events_date_unconfirmed: {
    IT: "Data non confermata",
    EN: "Date unconfirmed",
    FR: "Date non confirmée",
    ES: "Fecha no confirmada",
    RU: "Дата не подтверждена",
    ZH: "活动时间待定"
  , DE: "Datum unbestätigt"},
  events_km_from_you: {
    IT: "da te",
    EN: "from you",
    FR: "de vous",
    ES: "de ti",
    RU: "от вас",
    ZH: "距离您"
  , DE: "von dir"},
  events_km_from_map: {
    IT: "dalla mappa",
    EN: "from map center",
    FR: "du centre",
    ES: "del centro",
    RU: "от центра карты",
    ZH: "距离地图中心"
  , DE: "vom Kartenzentrum"},
  events_navigate: {
    IT: "Naviga",
    EN: "Navigate",
    FR: "S'y rendre",
    ES: "Navegar",
    RU: "Маршрут",
    ZH: "一键导航"
  , DE: "Navigieren"},
  events_info_tickets: {
    IT: "Info & Ticket",
    EN: "Info & Tickets",
    FR: "Infos & Billets",
    ES: "Info y Entradas",
    RU: "Билеты и инфо",
    ZH: "详情与购票"
  , DE: "Infos & Tickets"},
  events_info_unavailable: {
    IT: "Info Non Disp.",
    EN: "Info Unavail.",
    FR: "Info Non Dispo",
    ES: "Info No Disp.",
    RU: "Нет информации",
    ZH: "暂无票务详情"
  , DE: "Info n. verf."},
  events_error_nav: {
    IT: "Coordinate e indirizzo non disponibili per questo evento.",
    EN: "Coordinates and address not available for this event.",
    FR: "Coordonnées et adresse non disponibles pour cet événement.",
    ES: "Coordenadas y dirección no disponibles para este evento.",
    RU: "Координаты и адрес недоступны для этого события.",
    ZH: "抱歉，该活动未提供具体定位坐标或物理地址。"
  , DE: "Koordinaten und Adresse für diese Veranstaltung nicht verfügbar."},
  events_error_load: {
    IT: "Impossibile caricare gli eventi principali.",
    EN: "Unable to load main events.",
    FR: "Impossible de charger les événements principaux.",
    ES: "No se pudieron cargar los eventos principaux.",
    RU: "Не удалось загрузить основные события.",
    ZH: "由于网络异常，未能成功加载活动信息。"
  , DE: "Die Hauptveranstaltungen konnten nicht geladen werden."},

  // User Profile Header
  profile_one_moment: {
    IT: "Un momento...",
    EN: "One moment...",
    FR: "Un moment...",
    ES: "Un momento...",
    RU: "Секунду...",
    ZH: "正在加载..."
  , DE: "Einen Moment..."},
  profile_forever_premium: {
    IT: "Sempre Premium",
    EN: "Always Premium",
    FR: "Premium à vie",
    ES: "Sempre Premium",
    RU: "Премиум навсегда",
    ZH: "终身 Premium 会员"
  , DE: "Für immer Premium"},
  profile_partner_premium: {
    IT: "Partner Premium",
    EN: "Premium Partner",
    FR: "Partenaire Premium",
    ES: "Socio Premium",
    RU: "Премиум-партнер",
    ZH: "酒店专属 Premium 特权"
  , DE: "Premium-Partner"},
  profile_active_until: {
    IT: "Attivo fino al",
    EN: "Active until",
    FR: "Actif jusqu'au",
    ES: "Activo hasta el",
    RU: "Активен до",
    ZH: "特权有效期至"
  , DE: "Aktiv bis"},
  profile_free_tier: {
    IT: "Free Tier",
    EN: "Free Tier",
    FR: "Version Gratuite",
    ES: "Versión Gratuita",
    RU: "Бесплатный тариф",
    ZH: "普通免费用户"
  , DE: "Kostenlose Version"},
  // Map Screen Bottom Bar and Warnings
  find_near: {
    IT: "TROVA VICINO",
    EN: "FIND NEARBY",
    FR: "TROUVER PROCHE",
    ES: "BUSCAR CERCA",
    RU: "НАЙТИ РЯДОМ",
    ZH: "搜寻周边"
  , DE: "IN DER NÄHE FINDEN"},
  search_city_placeholder: {
    IT: "Cerca città...",
    EN: "Search city...",
    FR: "Rechercher une ville...",
    ES: "Buscar città...",
    RU: "Поиск города...",
    ZH: "搜索城市..."
  , DE: "Stadt suchen..."},
  near_you: {
    IT: "Vicino a te",
    EN: "Near you",
    FR: "Proche de vous",
    ES: "Cerca de ti",
    RU: "Рядом с вами",
    ZH: "您附近的景点"
  , DE: "In deiner Nähe"},
  within_1000m: {
    IT: "Entro 1000 metri",
    EN: "Within 1000 meters",
    FR: "À moins de 1000 mètres",
    ES: "A menos de 1000 metros",
    RU: "В радиусе 1000 метров",
    ZH: "1000米以内"
  , DE: "Im Umkreis von 1000 Metern"},
  no_pois_found_within_1000m: {
    IT: "Nessun punto di interesse trovato nel raggio di 1000m.",
    EN: "No points of interest found within 1000m.",
    FR: "Aucun point d'intérêt trouvé à moins de 1000m.",
    ES: "No se encontraron puntos de interés a menos de 1000m.",
    RU: "В радиусе 1000м не найдено интересных мест.",
    ZH: "在1000米范围内未找到任何景点。"
  , DE: "Keine Sehenswürdigkeiten im Umkreis von 1000m gefunden."},
  my_position: {
    IT: "La mia posizione",
    EN: "My location",
    FR: "Ma position",
    ES: "Mi ubicación",
    RU: "Мое местоположение",
    ZH: "我的位置"
  , DE: "Mein Standort"},
  retry_btn: {
    IT: "Riprova",
    EN: "Retry",
    FR: "Réessayer",
    ES: "Reintentar",
    RU: "Повторить",
    ZH: "重试"
  , DE: "Erneut versuchen"},
  error_map_places: {
    IT: "Mappe & Luoghi",
    EN: "Maps & Places",
    FR: "Cartes & Lieux",
    ES: "Mapas y Lugares",
    RU: "Карты и Места",
    ZH: "地图与景点"
  , DE: "Karten & Orte"},
  error_position: {
    IT: "Posizione",
    EN: "Location",
    FR: "Position",
    ES: "Ubicación",
    RU: "Местоположение",
    ZH: "定位"
  , DE: "Standort"},
  geolocation_error_denied: {
    IT: "Permesso di geolocalizzazione negato dal browser.",
    EN: "Geolocation permission denied by the browser.",
    FR: "Autorisation de géolocalisation refusée par le navigateur.",
    ES: "Permiso de geolocalización denegado por el navegador.",
    RU: "Разрешение на геолокацию отклонено браузером.",
    ZH: "定位失败，浏览器拒绝对本应用的GPS定位授权。"
  , DE: "Standortfreigabe wurde vom Browser verweigert."},
  geolocation_error_unavailable: {
    IT: "Impossibile ottenere la tua posizione. Verifica i permessi di localizzazione.",
    EN: "Unable to get your location. Please check location permissions.",
    FR: "Impossible d'obtenir votre position. Veuillez vérifier les autorisations.",
    ES: "No se pudo obtener su ubicación. Verifique los permisos de ubicación.",
    RU: "Не удалось получить ваше местоположение. Проверьте разрешения.",
    ZH: "无法获取您的当前位置，请检查设备的GPS或定位服务权限。"
  , DE: "Dein Standort konnte nicht ermittelt werden. Bitte überprüfe die Standortberechtigungen."},
  geolocation_error_unsupported: {
    IT: "Il tuo browser non supporta la geolocalizzazione.",
    EN: "Your browser does not support geolocation.",
    FR: "Votre navigateur ne prend pas en charge la géolocalisation.",
    ES: "Su navegador no admite la geolocalizzazione.",
    RU: "Ваш браузер не поддерживает геолокацию.",
    ZH: "抱歉，您当前使用的浏览器不支持网页定位服务。"
  , DE: "Dein Browser unterstützt keine Standortbestimmung."},
  entrance_label: {
    IT: "Ingresso",
    EN: "Entrance",
    FR: "Entrée",
    ES: "Entrada",
    DE: "Eingang",
    RU: "Вход",
    ZH: "入口"
  },
  geocontrol_title: {
    IT: "GeoControl Avanzato",
    EN: "Advanced GeoControl",
    FR: "GéoContrôle Avancé",
    ES: "GeoControl Avanzado",
    RU: "Расширенный геоконтроль",
    ZH: "高级 GPS 属性设定"
  , DE: "Erweiterte GeoControl"},
  geocontrol_desc: {
    IT: "Configura distanze di tracciamento GPS, trigger di avviso e categorie attive per il geofencing",
    EN: "Configure GPS tracking distances, alert triggers, and active category tree for geofencing",
    FR: "Configurez les distances GPS, les déclencheurs d'alerte et l'arborescence des catégories pour le géofencing",
    ES: "Configure las distancias GPS, los activadores de alerta y las categorías para el geofencing",
    RU: "Настройте дистанцию отслеживания, триггеры оповещений и дерево активных категорий",
    ZH: "设定定位触发半径、播报触发距离及参与自动语音播报的景点分类"
  , DE: "Konfiguriere GPS-Trackingdistanzen, Warnauslöser und die aktiven Kategorien für das Geofencing"},
  activation_mode: {
    IT: "Modalità Attivazione",
    EN: "Activation Mode",
    FR: "Mode d'activation",
    ES: "Modo de Activación",
    RU: "Режим активации",
    ZH: "导览播放模式"
  , DE: "Aktivierungsmodus"},
  activation_auto: {
    IT: "Automatica",
    EN: "Automatic",
    FR: "Automatique",
    ES: "Automática",
    RU: "Автоматический",
    ZH: "全自动（即时播放）"
  , DE: "Automatisch"},
  activation_semi: {
    IT: "Semi-Automatica",
    EN: "Semi-Automatic",
    FR: "Semi-Automatique",
    ES: "Semi-Automática",
    RU: "Полуавтомат",
    ZH: "半自动（点选通知）"
  , DE: "Halbautomatisch"},
  dist_walk_label: {
    IT: "Distanza Avviso a Piedi",
    EN: "Walking Alert Distance",
    FR: "Distance d'alerte à pied",
    ES: "Distancia Aviso a Pie",
    RU: "Дистанция оповещения пешком",
    ZH: "步行警示距离"
  , DE: "Warndistanz zu Fuß"},
  dist_car_label: {
    IT: "Distanza Avviso in Auto",
    EN: "Driving Alert Distance",
    FR: "Distance d'alerte en voiture",
    ES: "Distancia Aviso en Auto",
    RU: "Дистанция оповещения в авто",
    ZH: "行车警示距离 (CarPlay)"
  , DE: "Warndistanz im Auto"},
  dist_start_label: {
    IT: "Distanza Inizio Guida",
    EN: "Guidance Start Distance",
    FR: "Distance début de guide",
    ES: "Distancia Inicios Guía",
    RU: "Дистанция начала рассказа",
    ZH: "语音播报起始半径"
  , DE: "Startdistanz der Erzählung"},
  category_tree_title: {
    IT: "Albero delle Categorie Geofence",
    EN: "Geofence Categories Tree",
    FR: "Arbre des catégories de géofencing",
    ES: "Árbol de Categorías de Geofencing",
    RU: "Дерево категорий геозон",
    ZH: "导览围栏景点分类树"
  , DE: "Kategorienbaum für Geofencing"},
  category_gems_only: {
    IT: "Default Assoluto: Gemme (Sempre Attivo)",
    EN: "Absolute Default: Gems (Always Active)",
    FR: "Défaut absolu: Gemmes (Toujours actif)",
    ES: "Predeterminado: Gemas (Siempre activo)",
    RU: "По умолчанию: Жемчужины (Всегда активно)",
    ZH: "系统预设：隐藏瑰宝（永远保持激活）"
  , DE: "Absoluter Standard: Perlen (immer aktiv)"},
  geofence_alert_title: {
    IT: "Attrazione Vicina",
    EN: "Attraction Nearby",
    FR: "Attraction à Proximité",
    ES: "Atracción Cercana",
    RU: "Достопримечательность рядом",
    ZH: "附近有推荐景点"
  , DE: "Sehenswürdigkeit in der Nähe"},
  geofence_alert_ascolta: {
    IT: "Ascolta Guida",
    EN: "Listen to Guide",
    FR: "Écouter le Guide",
    ES: "Escuchar Guía",
    RU: "Слушать гид",
    ZH: "语音导览播报"
  , DE: "Guide anhören"},
  geofence_alert_close: {
    IT: "Chiudi",
    EN: "Close",
    FR: "Fermer",
    ES: "Cerrar",
    RU: "Закрыть",
    ZH: "关闭"
  , DE: "Schließen"},
  geofence_approaching: {
    IT: "Attenzione, stai arrivando a ",
    EN: "Attention, you are approaching ",
    FR: "Attention, vous approchez de ",
    ES: "Atención, te estás acercando a ",
    RU: "Внимание, вы приближаетесь к ",
    ZH: "注意，您即将到达 "
  , DE: "Achtung, du näherst dich "},
  geofence_arrived_play: {
    IT: "Sei arrivato a [NAME], premi play nella scheda per ascoltare l'audioguida.",
    EN: "You have arrived at [NAME], press play in the card to listen to the audioguide.",
    FR: "Vous êtes arrivé à [NAME], appuyez sur play dans la fiche pour écouter le guide audio.",
    ES: "Has llegado a [NAME], presiona play en la tarjeta para escuchar la audioguía.",
    RU: "Вы прибыли к [NAME], нажмите play в карточке, чтобы прослушать аудиогид.",
    ZH: "您已到达 [NAME]，请在卡片中点击播放以收听语音导览。"
  , DE: "Du bist bei [NAME] angekommen, drücke Play in der Karte, um die Audioguide anzuhören."},
  loading_card: {
    IT: "Carico la scheda…",
    EN: "Loading card…",
    FR: "Chargement de la carte…",
    ES: "Cargando tarjeta…",
    RU: "Загрузка карточки…",
    ZH: "加载卡片中…"
  , DE: "Karte wird geladen…"},
  poi_close: {
    IT: "Chiudi",
    EN: "Close",
    FR: "Fermer",
    ES: "Cerrar",
    RU: "Закрыть",
    ZH: "关闭"
  , DE: "Schließen"},
  poi_monument: {
    IT: "Monumento",
    EN: "Monument",
    FR: "Monument",
    ES: "Monumento",
    RU: "Памятник",
    ZH: "纪念碑"
  , DE: "Denkmal"},
  audioguide_ai: {
    IT: "Audioguida",
    EN: "Audioguide",
    FR: "Audioguide",
    ES: "Audioguía",
    RU: "Аудиогид",
    ZH: "语音导览"
  , DE: "Audioguide"},
  voice_nicky: {
    IT: "Voce: Nicky",
    EN: "Voice: Nicky",
    FR: "Voix: Nicky",
    ES: "Voz: Nicky",
    RU: "Голос: Nicky",
    ZH: "声音: Nicky"
  , DE: "Stimme: Nicky"},
  poi_website: {
    IT: "Sito web",
    EN: "Website",
    FR: "Site web",
    ES: "Sitio web",
    RU: "Веб-сайт",
    ZH: "网站"
  , DE: "Webseite"},
  poi_phone: {
    IT: "Telefono",
    EN: "Phone",
    FR: "Téléphone",
    ES: "Teléfono",
    RU: "Телефон",
    ZH: "电话"
  , DE: "Telefon"},
  poi_maps: {
    IT: "Maps",
    EN: "Maps",
    FR: "Cartes",
    ES: "Mapas",
    RU: "Карты",
    ZH: "地图"
  , DE: "Karten"},
  poi_tickets: {
    IT: "Biglietti",
    EN: "Tickets",
    FR: "Billets",
    ES: "Entradas",
    RU: "Билеты",
    ZH: "门票"
  , DE: "Tickets"},
  poi_regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Регенерировать",
    ZH: "重新生成"
  , DE: "Neu generieren"},
  poi_historical_data: {
    IT: "Dati storici",
    EN: "Historical data",
    FR: "Données historiques",
    ES: "Datos históricos",
    RU: "Исторические данные",
    ZH: "历史数据"
  , DE: "Historische Daten"},
  poi_built: {
    IT: "Costruito:",
    EN: "Built:",
    FR: "Construit:",
    ES: "Construido:",
    RU: "Построено:",
    ZH: "建造于:"
  , DE: "Erbaut:"},
  poi_architect: {
    IT: "Architetto:",
    EN: "Architect:",
    FR: "Architecte:",
    ES: "Arquitecto:",
    RU: "Архитектор:",
    ZH: "建筑师:"
  , DE: "Architekt:"},
  poi_style: {
    IT: "Stile:",
    EN: "Style:",
    FR: "Style:",
    ES: "Estilo:",
    RU: "Стиль:",
    ZH: "风格:"
  , DE: "Stil:"},
  poi_practical_info: {
    IT: "Info pratiche",
    EN: "Practical info",
    FR: "Infos pratiques",
    ES: "Información práctica",
    RU: "Практическая информация",
    ZH: "实用信息"
  , DE: "Praktische Infos"},
  poi_read_wikipedia: {
    IT: "Leggi su Wikipedia",
    EN: "Read on Wikipedia",
    FR: "Lire sur Wikipedia",
    ES: "Leer en Wikipedia",
    RU: "Читать в Википедии",
    ZH: "在维基百科阅读"
  , DE: "Auf Wikipedia lesen"},
  poi_no_barriers: {
    IT: "♿ No Barriere",
    EN: "♿ No Barriers",
    FR: "♿ Sans barrières",
    ES: "♿ Sin barreras",
    RU: "♿ Без барьеров",
    ZH: "♿ 无障碍设施"
  , DE: "♿ Barrierefrei"},
  poi_gem: {
    IT: "💎 Gemma",
    EN: "💎 Gem",
    FR: "💎 Gemme",
    ES: "💎 Gema",
    RU: "💎 Жемчужина",
    ZH: "💎 瑰宝"
  , DE: "💎 Perle"},
  poi_audio: {
    IT: "Audio",
    EN: "Audio",
    FR: "Audio",
    ES: "Audio",
    RU: "Аудио",
    ZH: "音频"
  , DE: "Audio"},
  poi_listen_card: {
    IT: "Ascolta la scheda",
    EN: "Listen to the card",
    FR: "Écouter la fiche",
    ES: "Escuchar la ficha",
    RU: "Прослушать карточку",
    ZH: "收听卡片"
  , DE: "Karte anhören"},
  poi_share: {
    IT: "Condividi",
    EN: "Share",
    FR: "Partager",
    ES: "Compartir",
    RU: "Поделиться",
    ZH: "分享"
  , DE: "Teilen"},
  gluten_free_available: {
    IT: "Senza Glutine Disponibile",
    EN: "Gluten-Free Available",
    FR: "Sans gluten disponible",
    ES: "Sin gluten disponible",
    RU: "Доступно без глютена",
    ZH: "提供无麸质选项"
  , DE: "Glutenfrei verfügbar"},
  gluten_free_detected: {
    IT: "Abbiamo rilevato che questo locale offre opzioni per celiaci.",
    EN: "We detected that this place offers gluten-free options.",
    FR: "Nous avons détecté que ce lieu propose des options sans gluten.",
    ES: "Hemos detectado que este lugar ofrece opciones sin gluten.",
    RU: "Мы обнаружили, что это заведение предлагает варианты без глютена.",
    ZH: "我们发现该餐厅提供无麸质餐点。"
  , DE: "Wir haben festgestellt, dass dieser Ort glutenfreie Optionen anbietet."},
  explore_by_type: {
    IT: "Esplora per tipo",
    EN: "Explore by type",
    FR: "Explorer par type",
    ES: "Explorar por tipo",
    RU: "Искать по типу",
    ZH: "按类型探索"
  , DE: "Nach Typ erkunden"},
  availability_status: {
    IT: "Stato Disponibilità",
    EN: "Availability Status",
    FR: "Statut de disponibilité",
    ES: "Estado de disponibilidad",
    RU: "Статус доступности",
    ZH: "可用状态"
  , DE: "Verfügbarkeitsstatus"},
  fare: {
    IT: "Tariffa",
    EN: "Fare",
    FR: "Tarif",
    ES: "Tarifa",
    RU: "Тариф",
    ZH: "费用"
  , DE: "Preis"},
  type: {
    IT: "Tipo",
    EN: "Type",
    FR: "Type",
    ES: "Tipo",
    RU: "Тип",
    ZH: "类型"
  , DE: "Typ"},
  use_headphones: {
    IT: "Per un'esperienza ottimale, si consiglia l'uso di cuffie",
    EN: "For an optimal experience, headphones are recommended",
    FR: "Pour une expérience optimale, l'utilisation d'écouteurs est recommandée",
    ES: "Para una experiencia óptima, se recomienda el uso de auriculares",
    RU: "Для оптимального опыта рекомендуется использовать наушники",
    ZH: "为了获得最佳体验，建议使用耳机"
  , DE: "Für ein optimales Erlebnis werden Kopfhörer empfohlen"},

  attractions_nearby: {
    IT: "Attrazioni nei dintorni",
    EN: "Attractions nearby",
    FR: "Attractions à proximité",
    ES: "Atracciones cercanas",
    RU: "Достопримечательности рядом",
    ZH: "附近景点"
  , DE: "Sehenswürdigkeiten in der Nähe"},
  my_itineraries: {
    IT: "I Miei Itinerari",
    EN: "My Itineraries",
    FR: "Mes Itinéraires",
    ES: "Mis Itinerarios",
    RU: "Мои маршруты",
    ZH: "我的行程"
  , DE: "Meine Routen"},
  no_offline_plans: {
    IT: "Nessun itinerario scaricato",
    EN: "No downloaded itineraries",
    FR: "Aucun itinéraire téléchargé",
    ES: "Ningún itinerario descargado",
    RU: "Нет скачанных маршрутов",
    ZH: "没有已下载的行程"
  , DE: "Keine heruntergeladenen Routen"},
  use_offline_button: {
    IT: "Usa il bottone 'Offline' dentro un itinerario generato",
    EN: "Use the 'Offline' button inside a generated itinerary",
    FR: "Utilisez le bouton 'Hors ligne' dans un itinéraire généré",
    ES: "Usa el botón 'Offline' dentro de un itinerario generado",
    RU: "Используйте кнопку «Офлайн» внутри созданного маршрута",
    ZH: "在生成的行程中使用“离线”按钮"
  , DE: "Verwende die Schaltfläche „Offline“ innerhalb einer erstellten Route"},
  open_offline: {
    IT: "Apri Offline",
    EN: "Open Offline",
    FR: "Ouvrir hors ligne",
    ES: "Abrir Offline",
    RU: "Открыть офлайн",
    ZH: "离线打开"
  , DE: "Offline öffnen"},
  open_maps: {
    IT: "Apri in Maps",
    EN: "Open in Maps",
    FR: "Ouvrir dans Maps",
    ES: "Abrir en Maps",
    RU: "Открыть в Картах",
    ZH: "在地图中打开"
  , DE: "In Maps öffnen"},
  add_stop: {
    IT: "Aggiungi Tappa",
    EN: "Add Stop",
    FR: "Ajouter une étape",
    ES: "Añadir Parada",
    RU: "Добавить остановку",
    ZH: "添加站点"
  , DE: "Station hinzufügen"},
  action_visit: {
    IT: "Azione/Visita",
    EN: "Action/Visit",
    FR: "Action/Visite",
    ES: "Acción/Visita",
    RU: "Действие/Визит",
    ZH: "活动/游览"
  , DE: "Aktion/Besuch"},
  action_restaurant: {
    IT: "Ristorante",
    EN: "Restaurant",
    FR: "Restaurant",
    ES: "Restaurante",
    RU: "Ресторан",
    ZH: "餐厅"
  , DE: "Restaurant"},
  action_break: {
    IT: "Pausa",
    EN: "Break",
    FR: "Pause",
    ES: "Pausa",
    RU: "Перерыв",
    ZH: "休息"
  , DE: "Pause"},
  action_travel: {
    IT: "Spostamento",
    EN: "Travel",
    FR: "Déplacement",
    ES: "Desplazamiento",
    RU: "Перемещение",
    ZH: "交通"
  , DE: "Fortbewegung"},
  cancel: {
    IT: "Annulla",
    EN: "Cancel",
    FR: "Annuler",
    ES: "Cancelar",
    RU: "Отмена",
    ZH: "取消"
  , DE: "Abbrechen"},
  save: {
    IT: "Salva",
    EN: "Save",
    FR: "Enregistrer",
    ES: "Guardar",
    RU: "Сохранить",
    ZH: "保存"
  , DE: "Speichern"},
  add_manual_stop: {
    IT: "Aggiungi una tappa manuale...",
    EN: "Add a manual stop...",
    FR: "Ajouter une étape manuelle...",
    ES: "Añadir una parada manual...",
    RU: "Добавить остановку вручную...",
    ZH: "手动添加站点..."
  , DE: "Manuelle Station hinzufügen..."},
  daily_budget: {
    IT: "Budget della Giornata",
    EN: "Daily Budget",
    FR: "Budget du jour",
    ES: "Presupuesto del Día",
    RU: "Бюджет на день",
    ZH: "每日预算"
  , DE: "Tagesbudget"},
  attractions: {
    IT: "Attrazioni",
    EN: "Attractions",
    FR: "Attractions",
    ES: "Atracciones",
    RU: "Достопримечательности",
    ZH: "景点"
  , DE: "Attraktionen"},
  transport: {
    IT: "Trasporti",
    EN: "Transport",
    FR: "Transports",
    ES: "Transporte",
    RU: "Транспорт",
    ZH: "交通"
  , DE: "Verkehrsmittel"},
  breakfast: {
    IT: "Colazione",
    EN: "Breakfast",
    FR: "Petit-déjeuner",
    ES: "Desayuno",
    RU: "Завтрак",
    ZH: "早餐"
  , DE: "Frühstück"},
  lunch: {
    IT: "Pranzo",
    EN: "Lunch",
    FR: "Déjeuner",
    ES: "Almuerzo",
    RU: "Обед",
    ZH: "午餐"
  , DE: "Mittagessen"},
  dinner: {
    IT: "Cena",
    EN: "Dinner",
    FR: "Dîner",
    ES: "Cena",
    RU: "Ужин",
    ZH: "晚餐"
  , DE: "Abendessen"},
  total_day: {
    IT: "TOTALE GIORNO",
    EN: "DAY TOTAL",
    FR: "TOTAL DU JOUR",
    ES: "TOTAL DEL DÍA",
    RU: "ИТОГО ЗА ДЕНЬ",
    ZH: "单日总计"
  , DE: "TAGESGESAMT"},
  itinerary_map: {
    IT: "Mappa Itinerario",
    EN: "Itinerary Map",
    FR: "Carte de l'itinéraire",
    ES: "Mapa del Itinerario",
    RU: "Карта маршрута",
    ZH: "行程地图"
  , DE: "Routenkarte"},
  map_all_days: {
    IT: "Tutti",
    EN: "All",
    FR: "Tous",
    ES: "Todos",
    RU: "Все",
    ZH: "全部"
  , DE: "Alle"},
  // ── "Tutto nel raggio" (27/08/2026): pannello nearby_everything ──────────
  everything_nearby_title: {
    IT: "Tutto nel raggio", EN: "Everything nearby", FR: "Tout dans le rayon",
    ES: "Todo en el radio", DE: "Alles im Umkreis", RU: "Всё поблизости", ZH: "周边全部",
  },
  everything_nearby_button: {
    IT: "TUTTO", EN: "ALL", FR: "TOUT", ES: "TODO", DE: "ALLES", RU: "ВСЁ", ZH: "全部",
  },
  everything_show_all: {
    IT: "mostra tutti", EN: "show all", FR: "tout afficher", ES: "mostrar todos", DE: "alle anzeigen", RU: "показать все", ZH: "显示全部",
  },
  everything_pinned_clear: {
    IT: "Togli i luoghi segnati dalla mappa", EN: "Remove pinned places from the map", FR: "Retirer les lieux épinglés de la carte",
    ES: "Quitar los lugares marcados del mapa", DE: "Markierte Orte von der Karte entfernen", RU: "Убрать отмеченные места с карты", ZH: "从地图移除已标记的地点",
  },
  everything_nearby_empty: {
    IT: "Niente entro questo raggio", EN: "Nothing within this radius", FR: "Rien dans ce rayon",
    ES: "Nada en este radio", DE: "Nichts in diesem Umkreis", RU: "Ничего в этом радиусе", ZH: "此范围内没有内容",
  },
  everything_group_neve: {
    IT: "Neve", EN: "Snow", FR: "Neige", ES: "Nieve", DE: "Schnee", RU: "Снег", ZH: "雪",
  },
  everything_group_fontanelle: {
    IT: "Fontanelle", EN: "Water fountains", FR: "Fontaines", ES: "Fuentes", DE: "Trinkbrunnen", RU: "Питьевые фонтаны", ZH: "饮水点",
  },
  everything_group_percorsi_cai: {
    IT: "Sentieri CAI", EN: "CAI trails", FR: "Sentiers CAI", ES: "Senderos CAI", DE: "CAI-Wanderwege", RU: "Тропы CAI", ZH: "CAI步道",
  },
  everything_group_percorsi_osm: {
    IT: "Sentieri", EN: "Trails", FR: "Sentiers", ES: "Senderos", DE: "Wanderwege", RU: "Тропы", ZH: "步道",
  },
  everything_group_percorsi_pdipr: {
    IT: "Cammini", EN: "Walking routes", FR: "Chemins", ES: "Caminos", DE: "Pilgerwege", RU: "Маршруты", ZH: "朝圣路线",
  },
  everything_group_percorsi_gusto: {
    IT: "Strade del Gusto", EN: "Food & Wine routes", FR: "Routes gourmandes", ES: "Rutas gastronómicas",
    DE: "Genussstraßen", RU: "Гастрономические маршруты", ZH: "美食美酒之路",
  },
  total_estimated_trip: {
    IT: "Totale Stimato Viaggio",
    EN: "Total Estimated Trip",
    FR: "Total Estimé du Voyage",
    ES: "Total Estimado del Viaje",
    RU: "Общая смета поездки",
    ZH: "行程预估总计"
  , DE: "Geschätzte Gesamtkosten der Reise"},
  wip_working: {
    IT: "WIP l'esperto di viaggi sta lavorando...",
    EN: "WIP the travel expert is working...",
    FR: "WIP l'expert en voyages travaille...",
    ES: "WIP el experto en viajes está trabajando...",
    RU: "WIP, эксперт по путешествиям, работает...",
    ZH: "智能旅行专家 WIP 正在为您规划..."
  , DE: "WIP, der Reiseexperte, arbeitet..."},
  optimizing_stops: {
    IT: "Stiamo ottimizzando le tappe del tuo viaggio per minimizzare i tempi di spostamento e massimizzare il divertimento.",
    EN: "We are optimizing your trip stops to minimize travel time and maximize fun.",
    FR: "Nous optimisons les étapes de votre voyage pour minimiser les temps de trajet et maximiser le plaisir.",
    ES: "Estamos optimizando las paradas de tu viaje para minimizar el tiempo de desplazamiento y maximizar la diversión.",
    RU: "Мы оптимизируем остановки вашей поездки, чтобы свести к минимуму время в пути и получить максимум удовольствия.",
    ZH: "我们正在优化您的行程站点，以最大程度地减少旅行时间并增加乐趣。"
  , DE: "Wir optimieren die Stationen deiner Reise, um die Fahrzeit zu minimieren und den Spaß zu maximieren."},
  placeholder_interests: {
    IT: "Es: Ristorante vegano, solo musei, ritmo lento...",
    EN: "Ex: Vegan restaurant, only museums, slow pace...",
    FR: "Ex: Restaurant végétalien, que des musées, rythme lent...",
    ES: "Ej: Restaurante vegano, solo museos, ritmo lento...",
    RU: "Например: веганский ресторан, только музеи, медленный темп...",
    ZH: "例如：素食餐厅，只看博物馆，慢节奏..."
  , DE: "Z. B.: Veganes Restaurant, nur Museen, langsames Tempo..."},
  placeholder_time: {
    IT: "Ora (es: 10:00)",
    EN: "Time (e.g. 10:00)",
    FR: "Heure (ex: 10:00)",
    ES: "Hora (ej: 10:00)",
    RU: "Время (напр. 10:00)",
    ZH: "时间（例如：10:00）"
  , DE: "Uhrzeit (z. B. 10:00)"},
  placeholder_stop_name: {
    IT: "Nome della Tappa",
    EN: "Stop Name",
    FR: "Nom de l'étape",
    ES: "Nombre de la Parada",
    RU: "Название остановки",
    ZH: "站点名称"
  , DE: "Name der Station"},
  placeholder_duration: {
    IT: "Tempo necessario (es. 2 ore)",
    EN: "Time needed (e.g. 2 hours)",
    FR: "Temps nécessaire (ex: 2 heures)",
    ES: "Tiempo necesario (ej. 2 horas)",
    RU: "Необходимое время (напр. 2 часа)",
    ZH: "所需时间（例如：2小时）"
  , DE: "Benötigte Zeit (z. B. 2 Stunden)"},
  placeholder_activity: {
    IT: "Attività / Descrizione",
    EN: "Activity / Description",
    FR: "Activité / Description",
    ES: "Actividad / Descripción",
    RU: "Действие / Описание",
    ZH: "活动 / 描述"
  , DE: "Aktivität / Beschreibung"},
  placeholder_lat: {
    IT: "Latitudine (Opzionale)",
    EN: "Latitude (Optional)",
    FR: "Latitude (Optionnel)",
    ES: "Latitud (Opcional)",
    RU: "Широта (Опционально)",
    ZH: "纬度（选填）"
  , DE: "Breitengrad (optional)"},
  placeholder_lon: {
    IT: "Longitudine (Opzionale)",
    EN: "Longitude (Optional)",
    FR: "Longitude (Optionnel)",
    ES: "Longitud (Opcional)",
    RU: "Долгота (Опционально)",
    ZH: "经度（选填）"
  , DE: "Längengrad (optional)"},
  placeholder_notes: {
    IT: "Consigli/Note aggiuntive",
    EN: "Tips/Additional notes",
    FR: "Conseils/Notes supplémentaires",
    ES: "Consejos/Notas adicionales",
    RU: "Советы/Дополнительные примечания",
    ZH: "提示/补充说明"
  , DE: "Tipps/Zusätzliche Notizen"},
  suggested_itineraries: {
    IT: "Itinerari Suggeriti",
    EN: "Suggested Itineraries",
    FR: "Itinéraires Suggérés",
    ES: "Itinerarios Sugeridos",
    RU: "Предлагаемые маршруты",
    ZH: "推荐行程"
  , DE: "Vorgeschlagene Routen"},
  suggested_itineraries_desc: {
    IT: "Qui appariranno i percorsi personalizzati creati per te dalla nostra Guida AI.",
    EN: "Here will appear the custom routes created for you by our AI Guide.",
    FR: "Ici apparaîtront les parcours personnalisés créés pour vous par notre Guide IA.",
    ES: "Aquí aparecerán las rutas personalizadas creadas para ti por nuestra Guía IA.",
    RU: "Здесь появятся индивидуальные маршруты, созданные для вас нашим ИИ-гидом.",
    ZH: "这里将显示由我们的 AI 导游为您创建的个性化路线。"
  , DE: "Hier erscheinen die individuellen Routen, die unser KI-Guide für dich erstellt hat."},
  open_map_caps: {
    IT: "APRI MAPPA",
    EN: "OPEN MAP",
    FR: "OUVRIR LA CARTE",
    ES: "ABRIR MAPA",
    RU: "ОТКРЫТЬ КАРТУ",
    ZH: "打开地图"
  , DE: "KARTE ÖFFNEN"},
  working_on_memories: {
    IT: "LAVORANDO AI TUOI RICORDI...",
    EN: "WORKING ON YOUR MEMORIES...",
    FR: "TRAVAIL SUR VOS SOUVENIRS...",
    ES: "TRABAJANDO EN TUS RECUERDOS...",
    RU: "ОБРАБАТЫВАЕМ ВАШИ ВОСПОМИНАНИЯ...",
    ZH: "正在处理您的旅行回忆..."
  , DE: "DEINE ERINNERUNGEN WERDEN VERARBEITET..."},
  daily_limits_counter: {
    IT: "Contatore Limiti Giornalieri",
    EN: "Daily Limits Counter",
    FR: "Compteur de limites quotidiennes",
    ES: "Contador de Límites Diarios",
    RU: "Счетчик дневных лимитов",
    ZH: "每日额度计数器"
  , DE: "Zähler für Tageslimits"},
  daily_limits_desc: {
    IT: "Monitora i crediti consumati in tempo reale (in base al tuo piano).",
    EN: "Monitor consumed credits in real time (based on your plan).",
    FR: "Surveillez les crédits consommés en temps réel (selon votre forfait).",
    ES: "Supervisa los créditos consumidos en tiempo real (según tu plan).",
    RU: "Отслеживайте использованные кредиты в реальном времени (согласно вашему тарифу).",
    ZH: "实时监控已使用的额度（根据您的订阅计划）。"
  , DE: "Überwache verbrauchte Credits in Echtzeit (je nach deinem Plan)."},
  lbl_history_culture: {
    IT: "🏛️ STORIA E CULTURA",
    EN: "🏛️ HISTORY & CULTURE",
    FR: "🏛️ HISTOIRE & CULTURE",
    ES: "🏛️ HISTORIA Y CULTURA",
    RU: "🏛️ ИСТОРИЯ И КУЛЬТУРА",
    ZH: "🏛️ 历史与文化"
  , DE: "🏛️ GESCHICHTE & KULTUR"},
  lbl_nature: {
    IT: "🌲 PAESAGGIO E NATURA",
    EN: "🌲 LANDSCAPE & NATURE",
    FR: "🌲 PAYSAGE & NATURE",
    ES: "🌲 PAISAJE Y NATURALEZA",
    RU: "🌲 ПЕЙЗАЖ И ПРИРОДА",
    ZH: "🌲 自然与景观"
  , DE: "🌲 LANDSCHAFT & NATUR"},
  lbl_food: {
    IT: "🍕 FOOD & OSPITALITÀ",
    EN: "🍕 FOOD & HOSPITALITY",
    FR: "🍕 GASTRONOMIE & ACCUEIL",
    ES: "🍕 COMIDA Y HOSPITALIDAD",
    RU: "🍕 ЕДА И ГОСТЕПРИИМСТВО",
    ZH: "🍕 美食与住宿"
  , DE: "🍕 ESSEN & GASTFREUNDSCHAFT"},
  lbl_services: {
    IT: "🛒 SERVIZI",
    EN: "🛒 SERVICES",
    FR: "🛒 SERVICES",
    ES: "🛒 SERVICIOS",
    RU: "🛒 УСЛУГИ",
    ZH: "🛒 实用设施"
  , DE: "🛒 SERVICE"},

  // ─── Premium Guide Module ────────────────────────────────────
  premium_guide_btn: {
    IT: "📖 Genera Guida d'Autore",
    EN: "📖 Generate Author's Guide",
    FR: "📖 Générer le Guide d'Auteur",
    ES: "📖 Generar Guía de Autor",
    RU: "📖 Создать Авторский Гид",
    ZH: "📖 生成精品导览"
  , DE: "📖 Autorenguide erstellen"},
  premium_guide_title: {
    IT: "Guida d'Autore WIP",
    EN: "WIP Author's Guide",
    FR: "Guide d'Auteur WIP",
    ES: "Guía de Autor WIP",
    RU: "Авторский Гид WIP",
    ZH: "WIP 精品导览"
  , DE: "WIP Autorenguide"},
  premium_guide_subtitle: {
    IT: "Scegli il tuo stile narrativo",
    EN: "Choose your narrative style",
    FR: "Choisissez votre style narratif",
    ES: "Elige tu estilo narrativo",
    RU: "Выберите стиль повествования",
    ZH: "选择您的叙述风格"
  , DE: "Wähle deinen Erzählstil"},
  premium_guide_style_art: {
    IT: "Arte & Storia",
    EN: "Art & History",
    FR: "Art & Histoire",
    ES: "Arte e Historia",
    RU: "Искусство и история",
    ZH: "艺术与历史"
  , DE: "Kunst & Geschichte"},
  premium_guide_style_art_desc: {
    IT: "Analisi critica, architettura e aneddoti storici esclusivi",
    EN: "Critical analysis, architecture & exclusive historical anecdotes",
    FR: "Analyse critique, architecture et anecdotes historiques",
    ES: "Análisis crítico, arquitectura y anécdotas históricas",
    RU: "Критический анализ, архитектура и исторические анекдоты",
    ZH: "批判性分析、建筑与独家历史故事"
  , DE: "Kritische Analyse, Architektur und exklusive historische Anekdoten"},
  premium_guide_style_family: {
    IT: "Famiglia",
    EN: "Family",
    FR: "Famille",
    ES: "Familia",
    RU: "Семья",
    ZH: "亲子家庭"
  , DE: "Familie"},
  premium_guide_style_family_desc: {
    IT: "Attività, giochi e curiosità per bambini di ogni età",
    EN: "Activities, games & facts for kids of all ages",
    FR: "Activités, jeux et curiosités pour enfants de tous âges",
    ES: "Actividades, juegos y curiosidades para niños de todas las edades",
    RU: "Мероприятия, игры и факты для детей всех возрастов",
    ZH: "适合各年龄段儿童的活动、游戏与趣味知识"
  , DE: "Aktivitäten, Spiele und Wissenswertes für Kinder jeden Alters"},
  premium_guide_style_shopping: {
    IT: "Shopping & Design",
    EN: "Shopping & Design",
    FR: "Shopping & Design",
    ES: "Shopping y Diseño",
    RU: "Шопинг и дизайн",
    ZH: "购物与设计"
  , DE: "Shopping & Design"},
  premium_guide_style_shopping_desc: {
    IT: "Boutique artigiane, design locale e trend del momento",
    EN: "Artisan boutiques, local design & current trends",
    FR: "Boutiques artisanales, design local et tendances actuelles",
    ES: "Boutiques artesanales, diseño local y tendencias actuales",
    RU: "Ремесленные бутики, местный дизайн и актуальные тренды",
    ZH: "手工精品店、本地设计与当下潮流"
  , DE: "Handwerksboutiquen, lokales Design und aktuelle Trends"},
  premium_guide_style_food: {
    IT: "Enogastronomia",
    EN: "Food & Wine",
    FR: "Gastronomie & Vins",
    ES: "Gastronomía & Vinos",
    RU: "Гастрономия и вино",
    ZH: "美食与佳酿"
  , DE: "Essen & Wein"},
  premium_guide_style_food_desc: {
    IT: "Piatti tipici, produttori locali e tradizioni culinarie",
    EN: "Local dishes, producers & culinary traditions",
    FR: "Plats typiques, producteurs locaux et traditions culinaires",
    ES: "Platos típicos, productores locales y tradiciones culinarias",
    RU: "Местные блюда, производители и кулинарные традиции",
    ZH: "地方特色美食、本地生产商与烹饪传统"
  , DE: "Lokale Gerichte, Erzeuger und kulinarische Traditionen"},
  premium_guide_style_essential: {
    IT: "Essenziale",
    EN: "Essential",
    FR: "Essentiel",
    ES: "Esencial",
    RU: "Основное",
    ZH: "精简实用"
  , DE: "Das Wesentliche"},
  premium_guide_style_essential_desc: {
    IT: "Orari, prezzi, accesso e logistica ottimizzata",
    EN: "Hours, prices, access & optimised logistics",
    FR: "Horaires, prix, accès et logistique optimisée",
    ES: "Horarios, precios, acceso y logística optimizada",
    RU: "Часы работы, цены, доступ и оптимизированная логистика",
    ZH: "开放时间、价格、交通与优化行程"
  , DE: "Öffnungszeiten, Preise, Zugang und optimierte Logistik"},
  premium_guide_generating: {
    IT: "Sto assemblando la tua guida d'autore...",
    EN: "Assembling your author's guide...",
    FR: "J'assemble votre guide d'auteur...",
    ES: "Ensamblando tu guía de autor...",
    RU: "Собираю ваш авторский гид...",
    ZH: "正在为您打造精品导览..."
  , DE: "Dein Autorenguide wird zusammengestellt..."},
  premium_guide_step1: {
    IT: "Analisi narrativa dei tuoi luoghi...",
    EN: "Narrative analysis of your places...",
    FR: "Analyse narrative de vos lieux...",
    ES: "Análisis narrativo de tus lugares...",
    RU: "Нарративный анализ ваших мест...",
    ZH: "正在分析您的目的地..."
  , DE: "Erzählerische Analyse deiner Orte..."},
  premium_guide_step2: {
    IT: "Ricerca immagini editoriali...",
    EN: "Searching editorial images...",
    FR: "Recherche d'images éditoriales...",
    ES: "Buscando imágenes editoriales...",
    RU: "Поиск редакционных изображений...",
    ZH: "正在检索精选图片..."
  , DE: "Redaktionelle Bilder werden gesucht..."},
  premium_guide_step3: {
    IT: "Composizione del layout premium...",
    EN: "Composing the premium layout...",
    FR: "Composition de la mise en page premium...",
    ES: "Componiendo el diseño premium...",
    RU: "Создание премиум-макета...",
    ZH: "正在生成精品排版..."
  , DE: "Das Premium-Layout wird erstellt..."},
  premium_guide_ready: {
    IT: "La tua guida è pronta!",
    EN: "Your guide is ready!",
    FR: "Votre guide est prêt!",
    ES: "¡Tu guía está lista!",
    RU: "Ваш гид готов!",
    ZH: "您的导览已准备好！"
  , DE: "Dein Guide ist fertig!"},
  premium_guide_download: {
    IT: "Scarica PDF",
    EN: "Download PDF",
    FR: "Télécharger PDF",
    ES: "Descargar PDF",
    RU: "Скачать PDF",
    ZH: "下载 PDF"
  , DE: "PDF herunterladen"},
  premium_guide_regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Перегенерировать",
    ZH: "重新生成"
  , DE: "Neu generieren"},
  premium_guide_quota_exceeded: {
    IT: "Hai raggiunto il limite mensile di guide premium. Aggiorna il piano per continuare.",
    EN: "You've reached your monthly premium guide limit. Upgrade your plan to continue.",
    FR: "Vous avez atteint votre limite mensuelle de guides premium. Mettez à niveau votre plan.",
    ES: "Has alcanzado tu límite mensual de guías premium. Actualiza tu plan para continuar.",
    RU: "Вы достигли месячного лимита премиум-гидов. Обновите план для продолжения.",
    ZH: "您已达到本月精品导览上限，请升级您的订阅套餐。"
  , DE: "Du hast dein monatliches Limit an Premium-Guides erreicht. Upgrade deinen Plan, um fortzufahren."},
  premium_guide_only_premium: {
    IT: "La Guida d'Autore è una funzione esclusiva WIP Premium.",
    EN: "The Author's Guide is an exclusive WIP Premium feature.",
    FR: "Le Guide d'Auteur est une fonctionnalité exclusive WIP Premium.",
    ES: "La Guía de Autor es una función exclusiva de WIP Premium.",
    RU: "Авторский Гид — эксклюзивная функция WIP Premium.",
    ZH: "精品导览是 WIP Premium 专属功能。"
  , DE: "Der Autorenguide ist eine exklusive WIP-Premium-Funktion."},
  premium_guide_error: {
    IT: "Errore nella generazione della guida. Riprova tra qualche momento.",
    EN: "Error generating the guide. Please try again in a moment.",
    FR: "Erreur lors de la génération du guide. Veuillez réessayer.",
    ES: "Error al generar la guía. Por favor, inténtalo de nuevo.",
    RU: "Ошибка при генерации гида. Попробуйте снова.",
    ZH: "导览生成出错，请稍后重试。"
  , DE: "Fehler beim Erstellen des Guides. Bitte versuche es gleich noch einmal."},
  premium_guide_narrative: {
    IT: "Narrazione",
    EN: "Narrative",
    FR: "Narration",
    ES: "Narración",
    RU: "Повествование",
    ZH: "叙事"
  , DE: "Erzählung"},
  premium_guide_technical: {
    IT: "Approfondimento",
    EN: "In-Depth",
    FR: "Approfondissement",
    ES: "Análisis en profundidad",
    RU: "Подробный анализ",
    ZH: "深度解析"
  , DE: "Vertiefung"},
  premium_guide_insider: {
    IT: "Consiglio da Insider",
    EN: "Insider Tip",
    FR: "Conseil d'Initié",
    ES: "Consejo Insider",
    RU: "Совет инсайдера",
    ZH: "达人秘笈"
  , DE: "Insider-Tipp"},
  premium_guide_useful_info: {
    IT: "Info Pratiche",
    EN: "Practical Info",
    FR: "Infos Pratiques",
    ES: "Info Práctica",
    RU: "Практическая информация",
    ZH: "实用信息"
  , DE: "Praktische Infos"},
  premium_guide_credits_left: {
    IT: "guide rimanenti questo mese",
    EN: "guides remaining this month",
    FR: "guides restants ce mois-ci",
    ES: "guías restantes este mes",
    RU: "гидов осталось в этом месяце",
    ZH: "本月剩余导览次数"
  , DE: "Guides diesen Monat übrig"},
  b2b_error: {
    IT: "Errore B2B",
    EN: "B2B Error",
    FR: "Erreur B2B",
    ES: "Error B2B",
    RU: "Ошибка B2B",
    ZH: "B2B 错误"
  , DE: "B2B-Fehler"},
  selected_items: {
    IT: "Elementi Selezionati",
    EN: "Selected Items",
    FR: "Éléments Sélectionnés",
    ES: "Elementos Seleccionados",
    RU: "Выбранные элементы",
    ZH: "已选项目"
  , DE: "Ausgewählte Elemente"},
  starting_point: {
    IT: "Punto di Partenza",
    EN: "Starting Point",
    FR: "Point de Départ",
    ES: "Punto de Partida",
    RU: "Точка отправления",
    ZH: "起点"
  , DE: "Startpunkt"},
  starting_point_placeholder: {
    IT: "Es. Indirizzo o città",
    EN: "E.g. Address or city",
    FR: "Ex. Adresse ou ville",
    ES: "Ej. Dirección o ciudad",
    RU: "Напр. Адрес или город",
    ZH: "例如 地址或城市"
  , DE: "Z. B. Adresse oder Stadt"},
  use_my_location: {
    IT: "Usa la mia posizione",
    EN: "Use my location",
    FR: "Utiliser ma position",
    ES: "Usar mi ubicación",
    RU: "Использовать мое местоположение",
    ZH: "使用我的位置"
  , DE: "Meinen Standort verwenden"},
  radius_km: {
    IT: "Raggio (km)",
    EN: "Radius (km)",
    FR: "Rayon (km)",
    ES: "Radio (km)",
    RU: "Радиус (км)",
    ZH: "半径 (公里)"
  , DE: "Radius (km)"},
  find_3_alts: {
    IT: "Trova 3 Alternative",
    EN: "Find 3 Alternatives",
    FR: "Trouver 3 Alternatives",
    ES: "Buscar 3 Alternativas",
    RU: "Найти 3 альтернативы",
    ZH: "寻找3个替代方案"
  , DE: "3 Alternativen finden"},
  choose_trip: {
    IT: "Scegli il tuo Viaggio",
    EN: "Choose your Trip",
    FR: "Choisissez votre Voyage",
    ES: "Elige tu Viaje",
    RU: "Выберите ваше путешествие",
    ZH: "选择你的旅行"
  , DE: "Wähle deine Reise"},
  here_are_proposals: {
    IT: "Ecco alcune proposte per te",
    EN: "Here are some proposals for you",
    FR: "Voici quelques propositions",
    ES: "Aquí hay algunas propuestas",
    RU: "Вот несколько предложений",
    ZH: "这里有一些建议"
  , DE: "Hier sind ein paar Vorschläge für dich"},
  days_count: {
    IT: "Giorni",
    EN: "Days",
    FR: "Jours",
    ES: "Días",
    RU: "Дни",
    ZH: "天"
  , DE: "Tage"},
  stops_count: {
    IT: "Tappe",
    EN: "Stops",
    FR: "Arrêts",
    ES: "Paradas",
    RU: "Остановки",
    ZH: "停留点"
  , DE: "Stationen"},
  go_back: {
    IT: "Torna Indietro",
    EN: "Go Back",
    FR: "Retour",
    ES: "Volver",
    RU: "Назад",
    ZH: "返回"
  , DE: "Zurück"},
  saved_count: {
    IT: "Salvati",
    EN: "Saved",
    FR: "Enregistrés",
    ES: "Guardados",
    RU: "Сохранено",
    ZH: "已保存"
  , DE: "Gespeichert"},
  ai_itineraries: {
    IT: "Itinerari AI",
    EN: "AI Itineraries",
    FR: "Itinéraires IA",
    ES: "Itinerarios de IA",
    RU: "Маршруты ИИ",
    ZH: "AI 行程"
  , DE: "KI-Routen"},
  premium_guides_tab: {
    IT: "Guide Premium",
    EN: "Premium Guides",
    FR: "Guides Premium",
    ES: "Guías Premium",
    RU: "Премиум гиды",
    ZH: "高级导游"
  , DE: "Premium-Guides"},
  no_saved_itineraries: {
    IT: "Nessun itinerario salvato",
    EN: "No saved itineraries",
    FR: "Aucun itinéraire enregistré",
    ES: "No hay itinerarios guardados",
    RU: "Нет сохраненных маршрутов",
    ZH: "没有保存的行程"
  , DE: "Keine gespeicherten Routen"},
  generate_first: {
    IT: "Genera il tuo primo itinerario!",
    EN: "Generate your first itinerary!",
    FR: "Générez votre premier itinéraire!",
    ES: "¡Genera tu primer itinerario!",
    RU: "Создайте свой первый маршрут!",
    ZH: "生成你的第一个行程！"
  , DE: "Erstelle deine erste Route!"},
  resume_btn: {
    IT: "Riprendi",
    EN: "Resume",
    FR: "Reprendre",
    ES: "Reanudar",
    RU: "Продолжить",
    ZH: "恢复"
  , DE: "Fortsetzen"},
  no_pdf_generated: {
    IT: "Nessun PDF generato",
    EN: "No PDF generated",
    FR: "Aucun PDF généré",
    ES: "Ningún PDF generado",
    RU: "PDF не сгенерирован",
    ZH: "未生成 PDF"
  , DE: "Kein PDF erstellt"},
  download_pdf_btn: {
    IT: "Scarica PDF",
    EN: "Download PDF",
    FR: "Télécharger PDF",
    ES: "Descargar PDF",
    RU: "Скачать PDF",
    ZH: "下载 PDF"
  , DE: "PDF herunterladen"},
  from_my_location: {
    IT: "Dalla mia posizione",
    EN: "From my location",
    FR: "De ma position",
    ES: "Desde mi ubicación",
    RU: "От моего местоположения",
    ZH: "从我的位置"
  , DE: "Von meinem Standort"},
  acquiring_gps: {
    IT: "Acquisizione GPS...",
    EN: "Acquiring GPS...",
    FR: "Acquisition GPS...",
    ES: "Adquiriendo GPS...",
    RU: "Получение GPS...",
    ZH: "获取 GPS 中..."
  , DE: "GPS wird ermittelt..."},
  custom_address: {
    IT: "Indirizzo Personalizzato",
    EN: "Custom Address",
    FR: "Adresse Personnalisée",
    ES: "Dirección Personalizada",
    RU: "Свой адрес",
    ZH: "自定义地址"
  , DE: "Benutzerdefinierte Adresse"},
  custom_address_placeholder: {
    IT: "Inserisci un indirizzo",
    EN: "Enter an address",
    FR: "Entrez une adresse",
    ES: "Ingresa una dirección",
    RU: "Введите адрес",
    ZH: "输入地址"
  , DE: "Adresse eingeben"},
  internal_nav_beta: {
    IT: "Navigatore Interno (Beta)",
    EN: "Internal Navigator (Beta)",
    FR: "Navigateur Interne (Bêta)",
    ES: "Navegador Interno (Beta)",
    RU: "Внутренний навигатор (Бета)",
    ZH: "内部导航器（Beta）"
  , DE: "Interner Navigator (Beta)"},
  open_gmaps: {
    IT: "Apri Google Maps",
    EN: "Open Google Maps",
    FR: "Ouvrir Google Maps",
    ES: "Abrir Google Maps",
    RU: "Открыть Google Maps",
    ZH: "打开谷歌地图"
  , DE: "Google Maps öffnen"},
  areas_to_avoid: {
    IT: "Zone da Evitare",
    EN: "Areas to Avoid",
    FR: "Zones à Éviter",
    ES: "Zonas a Evitar",
    RU: "Зоны, которых следует избегать",
    ZH: "避开区域"
  , DE: "Zu meidende Gebiete"},
  precautions: {
    IT: "Precauzioni",
    EN: "Precautions",
    FR: "Précautions",
    ES: "Precauciones",
    RU: "Меры предосторожности",
    ZH: "预防措施"
  , DE: "Vorsichtsmaßnahmen"},
  recommendations: {
    IT: "Raccomandazioni",
    EN: "Recommendations",
    FR: "Recommandations",
    ES: "Recomendaciones",
    RU: "Рекомендации",
    ZH: "建议"
  , DE: "Empfehlungen"},
  tips: {
    IT: "Consigli",
    EN: "Tips",
    FR: "Conseils",
    ES: "Consejos",
    RU: "Советы",
    ZH: "提示"
  , DE: "Tipps"},
  travel_info: {
    IT: "Info di Viaggio",
    EN: "Travel Info",
    FR: "Infos de Voyage",
    ES: "Info de Viaje",
    RU: "Информация о поездке",
    ZH: "旅行信息"
  , DE: "Reiseinfos"},
  travel_info_desc: {
    IT: "Informazioni importanti per il tuo viaggio",
    EN: "Important information for your trip",
    FR: "Informations importantes",
    ES: "Información importante",
    RU: "Важная информация",
    ZH: "重要旅行信息"
  , DE: "Wichtige Informationen für deine Reise"},
  sections_count: {
    IT: "Sezioni",
    EN: "Sections",
    FR: "Sections",
    ES: "Secciones",
    RU: "Разделы",
    ZH: "章节"
  , DE: "Abschnitte"},
  exact_address: {
    IT: "Indirizzo Esatto",
    EN: "Exact Address",
    FR: "Adresse Exacte",
    ES: "Dirección Exacta",
    RU: "Точный адрес",
    ZH: "详细地址"
  , DE: "Genaue Adresse"},
  calc_distance: {
    IT: "Calcola Distanza",
    EN: "Calculate Distance",
    FR: "Calculer Distance",
    ES: "Calcular Distancia",
    RU: "Рассчитать расстояние",
    ZH: "计算距离"
  , DE: "Entfernung berechnen"},
  tickets_experiences: {
    IT: "Biglietti ed Esperienze",
    EN: "Tickets and Experiences",
    FR: "Billets et Expériences",
    ES: "Entradas y Experiencias",
    RU: "Билеты и Впечатления",
    ZH: "门票与体验"
  , DE: "Tickets und Erlebnisse"},
  skip_line: {
    IT: "Salta la Coda",
    EN: "Skip the Line",
    FR: "Coupe-file",
    ES: "Saltar la Cola",
    RU: "Без очереди",
    ZH: "免排队"
  , DE: "Ohne Anstehen"},
  search_gyg: {
    IT: "Cerca su GetYourGuide",
    EN: "Search on GetYourGuide",
    FR: "Chercher sur GetYourGuide",
    ES: "Buscar en GetYourGuide",
    RU: "Поиск на GetYourGuide",
    ZH: "在 GetYourGuide 上搜索"
  , DE: "Auf GetYourGuide suchen"},
  there_are: {
    IT: "Ci sono",
    EN: "There are",
    FR: "Il y a",
    ES: "Hay",
    RU: "Там есть",
    ZH: "有"
  , DE: "Es gibt"},
  premium_error: {
    IT: "Errore Premium",
    EN: "Premium Error",
    FR: "Erreur Premium",
    ES: "Error Premium",
    RU: "Ошибка Premium",
    ZH: "高级错误"
  , DE: "Premium-Fehler"},
  updating: {
    IT: "Aggiornamento...",
    EN: "Updating...",
    FR: "Mise à jour...",
    ES: "Actualizando...",
    RU: "Обновление...",
    ZH: "更新中..."
  , DE: "Aktualisierung..."},
  loading_db: {
    IT: "Caricamento database...",
    EN: "Loading database...",
    FR: "Chargement de la base...",
    ES: "Cargando base de datos...",
    RU: "Загрузка базы данных...",
    ZH: "加载数据库..."
  , DE: "Datenbank wird geladen..."},
  conn_error: {
    IT: "Errore di connessione",
    EN: "Connection error",
    FR: "Erreur de connexion",
    ES: "Error de conexión",
    RU: "Ошибка подключения",
    ZH: "连接错误"
  , DE: "Verbindungsfehler"},
  loading_history: {
    IT: "Caricamento cronologia...",
    EN: "Loading history...",
    FR: "Chargement de l'historique...",
    ES: "Cargando historial...",
    RU: "Загрузка истории...",
    ZH: "加载历史记录..."
  , DE: "Verlauf wird geladen..."},
  no_history: {
    IT: "Nessun Ascolto",
    EN: "No Listening History",
    FR: "Aucune écoute",
    ES: "No hay historial",
    RU: "Нет истории прослушиваний",
    ZH: "没有收听记录"
  , DE: "Kein Hörverlauf"},
  audio_history_desc: {
    IT: "Gli audio che ascolti appariranno qui",
    EN: "The audios you listen to will appear here",
    FR: "Les audios écoutés apparaîtront ici",
    ES: "Los audios que escuches aparecerán aquí",
    RU: "Прослушанные аудио появятся здесь",
    ZH: "你收听的音频将显示在这里"
  , DE: "Die Audios, die du anhörst, erscheinen hier"},
  today_at: {
    IT: "Oggi alle ",
    EN: "Today at ",
    FR: "Aujourd'hui à ",
    ES: "Hoy a las ",
    RU: "Сегодня в ",
    ZH: "今天 "
  , DE: "Heute um "},
  loc_updated: {
    IT: "Posizione aggiornata",
    EN: "Location updated",
    FR: "Position mise à jour",
    ES: "Ubicación actualizada",
    RU: "Местоположение обновлено",
    ZH: "位置已更新"
  , DE: "Standort aktualisiert"},
  loc_error: {
    IT: "Errore posizione",
    EN: "Location error",
    FR: "Erreur de position",
    ES: "Error de ubicación",
    RU: "Ошибка местоположения",
    ZH: "位置错误"
  , DE: "Standortfehler"},
  loc_unsupported: {
    IT: "Posizione non supportata",
    EN: "Location unsupported",
    FR: "Position non supportée",
    ES: "Ubicación no soportada",
    RU: "Местоположение не поддерживается",
    ZH: "不支持的位置"
  , DE: "Standort nicht unterstützt"},
  score: {
    IT: "Punteggio",
    EN: "Score",
    FR: "Score",
    ES: "Puntuación",
    RU: "Счет",
    ZH: "得分"
  , DE: "Punktzahl"},
  explored_places: {
    IT: "Luoghi Esplorati",
    EN: "Explored Places",
    FR: "Lieux Explorés",
    ES: "Lugares Explorados",
    RU: "Исследованные места",
    ZH: "探索过的地方"
  , DE: "Erkundete Orte"},
  explored_empty: {
    IT: "Nessun luogo esplorato",
    EN: "No explored places",
    FR: "Aucun lieu exploré",
    ES: "Ningún lugar explorado",
    RU: "Нет исследованных мест",
    ZH: "没有探索过的地方"
  , DE: "Keine erkundeten Orte"},
  poi_play: {
    IT: "Ascolta",
    EN: "Listen",
    FR: "Écouter",
    ES: "Escuchar",
    RU: "Слушать",
    ZH: "收听"
  , DE: "Anhören"},
  show_more: {
    IT: "Scopri di più",
    EN: "Show more",
    FR: "En savoir plus",
    ES: "Ver más",
    RU: "Подробнее",
    ZH: "更多"
  , DE: "Mehr erfahren"},
  show_less: {
    IT: "Meno",
    EN: "Show less",
    FR: "Moins",
    ES: "Ver menos",
    RU: "Меньше",
    ZH: "收起"
  , DE: "Weniger"},
  built_in: {
    IT: "Costruito:",
    EN: "Built:",
    FR: "Construit:",
    ES: "Construido:",
    RU: "Построено:",
    ZH: "建造于:"
  , DE: "Erbaut:"},
  architect_label: {
    IT: "Architetto:",
    EN: "Architect:",
    FR: "Architecte:",
    ES: "Arquitecto:",
    RU: "Архитектор:",
    ZH: "建筑师:"
  , DE: "Architekt:"},
  style_label: {
    IT: "Stile:",
    EN: "Style:",
    FR: "Style:",
    ES: "Estilo:",
    RU: "Стиль:",
    ZH: "风格:"
  , DE: "Stil:"},
  read_on_wikipedia: {
    IT: "Leggi su Wikipedia",
    EN: "Read on Wikipedia",
    FR: "Lire sur Wikipédia",
    ES: "Leer en Wikipedia",
    RU: "Читать в Википедии",
    ZH: "在维基百科阅读"
  , DE: "Auf Wikipedia lesen"},
  stop_audio: {
    IT: "Ferma audio e torna",
    EN: "Stop audio and return",
    FR: "Arrêter l'audio et revenir",
    ES: "Detener audio e volver",
    RU: "Остановить audio и вернуться",
    ZH: "停止音频并返回"
  , DE: "Audio stoppen und zurück"},
  add_to_favorites: {
    IT: "Aggiungi ai preferiti",
    EN: "Add to favorites",
    FR: "Ajouter aux favoris",
    ES: "Añadir a favoritos",
    RU: "Добавить в избранное",
    ZH: "加入收藏"
  , DE: "Zu Favoriten hinzufügen"},
  removed_from_favorites: {
    IT: "Rimosso dai preferiti ✓",
    EN: "Removed from favorites ✓",
    FR: "Retiré des favoris ✓",
    ES: "Eliminado de favoritos ✓",
    RU: "Удалено из избранного ✓",
    ZH: "已从收藏中移除 ✓"
  , DE: "Aus Favoriten entfernt ✓"},
  no_description: {
    IT: "Nessuna descrizione disponibile.",
    EN: "No description available.",
    FR: "Aucune descrizione disponible.",
    ES: "No hay descrizione disponibile.",
    RU: "Описание отсутствует.",
    ZH: "暂无描述。"
  , DE: "Keine Beschreibung verfügbar."},
  listen_deep: {
    IT: "Ascolta Approfondimento",
    EN: "Listen to Deep Dive",
    FR: "Écouter l'analyse",
    ES: "Escuchar Análisis",
    RU: "Слушать подробнее",
    ZH: "收听深度解析"
  , DE: "Vertiefung anhören"},
  ai_content_notice: {
    IT: "Contenuti generati con intelligenza artificiale",
    EN: "AI-generated content",
    FR: "Contenus générés par intelligence artificielle",
    ES: "Contenido generado con inteligencia artificial",
    RU: "Контент создан искусственным интеллектом",
    ZH: "内容由人工智能生成"
  , DE: "KI-generierte Inhalte"},
  regenerating_label: {
    IT: "Rigenerazione in corso...",
    EN: "Regenerating...",
    FR: "Régénération en cours...",
    ES: "Regenerando...",
    RU: "Регенерация...",
    ZH: "正在重新生成..."
  , DE: "Wird neu generiert..."},
  loading_dots: {
    IT: "Caricamento in corso...",
    EN: "Loading...",
    FR: "Chargement...",
    ES: "Cargando...",
    RU: "Загрузка...",
    ZH: "正在加载..."
  , DE: "Wird geladen..."},
  restart_btn: {
    IT: "Ricomincia",
    EN: "Restart",
    FR: "Redémarrer",
    ES: "Reiniciar",
    RU: "Начать сначала",
    ZH: "重播"
  , DE: "Neu starten"},
  forward_10s: {
    IT: "Avanti 10s",
    EN: "Forward 10s",
    FR: "Avance 10s",
    ES: "Adelante 10s",
    RU: "Вперед 10с",
    ZH: "快进10秒"
  , DE: "10s vor"},

  // ── Modalità 3 (Raggio) e 4 (Swip) ───────────────────────────────────
  // Prima erano stringhe hardcoded `language === 'IT' ? ... : ...`: chi usava
  // FR/ES/RU/ZH si trovava mezza schermata in inglese e mezza in italiano.
  radius_mode: {
    IT: "Raggio", EN: "Radius", FR: "Rayon", ES: "Radio", RU: "Радиус", ZH: "半径探索"
  , DE: "Radius"},
  radius_mode_desc: {
    IT: "Scegli base e raggio per 3 alternative",
    EN: "Choose base, radius for 3 options",
    FR: "Choisissez une base et un rayon pour 3 options",
    ES: "Elige base y radio para 3 opciones",
    RU: "Выберите базу и радиус для 3 вариантов",
    ZH: "选择出发地和半径，获取 3 个方案"
  , DE: "Wähle Basis und Radius für 3 Optionen"},
  swip_mode: {
    IT: "Swip", EN: "Swip", FR: "Swip", ES: "Swip", RU: "Swip", ZH: "滑动选择"
  , DE: "Swip"},
  swip_mode_desc: {
    IT: "Scorri e scegli le attrazioni",
    EN: "Swipe to choose attractions",
    FR: "Balayez pour choisir les attractions",
    ES: "Desliza y elige las atracciones",
    RU: "Свайпайте и выбирайте достопримечательности",
    ZH: "滑动卡片挑选景点"
  , DE: "Wische und wähle die Attraktionen"},
  // ── Agente WIP: l'itinerario si crea parlando (23/08/2026) ─────────────
  // Il nome dell'agente è WIP, come nel resto dell'app (decisione utente):
  // nessun personaggio nuovo, una sola identità dappertutto.
  wip_agent_mode: { IT: "Parla con WIP", EN: "Talk to WIP", FR: "Parlez à WIP", ES: "Habla con WIP", DE: "Sprich mit WIP", RU: "Поговори с WIP", ZH: "和 WIP 聊聊" },
  wip_agent_mode_desc: { IT: "Racconta il viaggio a voce o per iscritto: WIP chiede e poi crea l'itinerario", EN: "Tell your trip by voice or text: WIP asks, then builds the itinerary", FR: "Racontez le voyage à l'oral ou à l'écrit : WIP demande, puis crée l'itinéraire", ES: "Cuenta el viaje por voz o por escrito: WIP pregunta y luego crea el itinerario", DE: "Erzähl die Reise per Stimme oder Text: WIP fragt nach und baut dann die Route", RU: "Расскажите о поездке голосом или текстом: WIP спросит и создаст маршрут", ZH: "用语音或文字讲述旅程：WIP 会提问，然后生成行程" },
  wip_agent_title: { IT: "WIP", EN: "WIP", FR: "WIP", ES: "WIP", DE: "WIP", RU: "WIP", ZH: "WIP" },
  wip_agent_subtitle: { IT: "Il tuo agente di viaggio", EN: "Your travel agent", FR: "Votre agent de voyage", ES: "Tu agente de viajes", DE: "Dein Reiseagent", RU: "Ваш турагент", ZH: "你的旅行助手" },
  wip_agent_intro: { IT: "Ciao, sono WIP. Dimmi dove vuoi andare, per quanti giorni e che viaggio hai in mente: ci penso io. Puoi parlare col microfono o scrivere.", EN: "Hi, I'm WIP. Tell me where you want to go, for how many days and what kind of trip you have in mind: I'll take care of it. You can talk with the microphone or type.", FR: "Bonjour, je suis WIP. Dites-moi où vous voulez aller, pour combien de jours et quel voyage vous avez en tête : je m'en occupe. Vous pouvez parler au micro ou écrire.", ES: "Hola, soy WIP. Dime adónde quieres ir, cuántos días y qué viaje tienes en mente: yo me encargo. Puedes hablar con el micrófono o escribir.", DE: "Hallo, ich bin WIP. Sag mir, wohin du willst, für wie viele Tage und welche Reise dir vorschwebt: ich kümmere mich darum. Du kannst ins Mikrofon sprechen oder schreiben.", RU: "Привет, я WIP. Скажите, куда хотите поехать, на сколько дней и какую поездку задумали — остальное сделаю я. Можно говорить в микрофон или писать.", ZH: "你好，我是 WIP。告诉我你想去哪里、玩几天、想要怎样的旅程，剩下的交给我。可以用麦克风说，也可以打字。" },
  wip_agent_placeholder: { IT: "Es. «tre giorni a Lisbona a ottobre, niente musei»", EN: "E.g. \"three days in Lisbon in October, no museums\"", FR: "Ex. « trois jours à Lisbonne en octobre, sans musées »", ES: "Ej. «tres días en Lisboa en octubre, sin museos»", DE: "Z. B. „drei Tage Lissabon im Oktober, keine Museen“", RU: "Напр. «три дня в Лиссабоне в октябре, без музеев»", ZH: "例如“十月去里斯本三天，不去博物馆”" },
  wip_agent_send: { IT: "Invia", EN: "Send", FR: "Envoyer", ES: "Enviar", DE: "Senden", RU: "Отправить", ZH: "发送" },
  wip_agent_listening: { IT: "Ti ascolto…", EN: "Listening…", FR: "Je vous écoute…", ES: "Te escucho…", DE: "Ich höre zu…", RU: "Слушаю…", ZH: "正在听…" },
  wip_agent_thinking: { IT: "WIP sta pensando…", EN: "WIP is thinking…", FR: "WIP réfléchit…", ES: "WIP está pensando…", DE: "WIP überlegt…", RU: "WIP думает…", ZH: "WIP 正在思考…" },
  wip_agent_mic_unsupported: { IT: "Il microfono non è supportato da questo browser: scrivi pure, WIP legge lo stesso.", EN: "The microphone isn't supported by this browser: just type, WIP reads it anyway.", FR: "Le micro n'est pas pris en charge par ce navigateur : écrivez, WIP lit quand même.", ES: "El micrófono no es compatible con este navegador: escribe, WIP lo lee igual.", DE: "Das Mikrofon wird von diesem Browser nicht unterstützt: schreib einfach, WIP liest es trotzdem.", RU: "Микрофон не поддерживается этим браузером: пишите, WIP всё равно прочитает.", ZH: "此浏览器不支持麦克风：直接打字即可，WIP 一样能读。" },
  wip_agent_voice_on: { IT: "WIP parla: attivo", EN: "WIP speaks: on", FR: "WIP parle : activé", ES: "WIP habla: activado", DE: "WIP spricht: an", RU: "WIP говорит: вкл", ZH: "WIP 语音：开" },
  wip_agent_voice_off: { IT: "WIP parla: spento", EN: "WIP speaks: off", FR: "WIP parle : désactivé", ES: "WIP habla: desactivado", DE: "WIP spricht: aus", RU: "WIP говорит: выкл", ZH: "WIP 语音：关" },
  wip_agent_ready_cta: { IT: "Crea l'itinerario", EN: "Create the itinerary", FR: "Créer l'itinéraire", ES: "Crear el itinerario", DE: "Route erstellen", RU: "Создать маршрут", ZH: "生成行程" },
  wip_agent_ready_edit: { IT: "Cambia qualcosa", EN: "Change something", FR: "Modifier quelque chose", ES: "Cambiar algo", DE: "Etwas ändern", RU: "Изменить", ZH: "修改一下" },
  wip_agent_error: { IT: "WIP non risponde in questo momento: riprova tra poco.", EN: "WIP isn't answering right now: try again shortly.", FR: "WIP ne répond pas pour le moment : réessayez bientôt.", ES: "WIP no responde ahora mismo: inténtalo en breve.", DE: "WIP antwortet gerade nicht: versuche es gleich erneut.", RU: "WIP сейчас не отвечает: попробуйте чуть позже.", ZH: "WIP 暂时没有回应，请稍后重试。" },
  wip_agent_login_required: { IT: "Accedi per parlare con WIP: è gratis, basta un account.", EN: "Log in to talk to WIP: it's free, you just need an account.", FR: "Connectez-vous pour parler à WIP : c'est gratuit, un compte suffit.", ES: "Inicia sesión para hablar con WIP: es gratis, solo necesitas una cuenta.", DE: "Melde dich an, um mit WIP zu sprechen: kostenlos, es genügt ein Konto.", RU: "Войдите, чтобы поговорить с WIP: это бесплатно, нужен только аккаунт.", ZH: "登录后即可与 WIP 对话：免费，只需一个账户。" },
  swip_subtitle: {
    IT: "Scegli le attrazioni che ti piacciono",
    EN: "Choose attractions you like",
    FR: "Choisissez les attractions qui vous plaisent",
    ES: "Elige las atracciones que te gustan",
    RU: "Выберите понравившиеся достопримечательности",
    ZH: "挑选您喜欢的景点"
  , DE: "Wähle die Attraktionen, die dir gefallen"},
  attraction_types: {
    IT: "Tipo di Attrazioni", EN: "Attraction Types", FR: "Types d'attractions",
    ES: "Tipos de atracciones", RU: "Типы достопримечательностей", ZH: "景点类型"
  , DE: "Attraktionstypen"},
  start_swip: {
    IT: "Inizia lo Swip!", EN: "Start Swip!", FR: "Commencer le Swip !",
    ES: "¡Empieza el Swip!", RU: "Начать Swip!", ZH: "开始滑动！"
  , DE: "Swip starten!"},
  loading_attractions: {
    IT: "Carico le attrazioni...", EN: "Loading attractions...",
    FR: "Chargement des attractions...", ES: "Cargando atracciones...",
    RU: "Загрузка достопримечательностей...", ZH: "正在加载景点..."
  , DE: "Attraktionen werden geladen..."},
  no_attractions_found: {
    IT: "Nessuna attrazione trovata", EN: "No attractions found",
    FR: "Aucune attraction trouvée", ES: "No se encontraron atracciones",
    RU: "Достопримечательности не найдены", ZH: "未找到景点"
  , DE: "Keine Attraktionen gefunden"},
  try_again: {
    IT: "Riprova", EN: "Try Again", FR: "Réessayer", ES: "Reintentar",
    RU: "Повторить", ZH: "重试"
  , DE: "Erneut versuchen"},
  seen_all_attractions: {
    IT: "Hai visto tutte le attrazioni!", EN: "You've seen all attractions!",
    FR: "Vous avez vu toutes les attractions !", ES: "¡Has visto todas las atracciones!",
    RU: "Вы просмотрели все достопримечательности!", ZH: "您已浏览完所有景点！"
  , DE: "Du hast alle Attraktionen gesehen!"},
  stops_selected: {
    IT: "tappe selezionate", EN: "stops selected", FR: "étapes sélectionnées",
    ES: "paradas seleccionadas", RU: "остановок выбрано", ZH: "个已选行程点"
  , DE: "ausgewählte Stopps"},
  review_stops: {
    IT: "Rivedi le Tappe", EN: "Review Stops", FR: "Revoir les étapes",
    ES: "Revisar paradas", RU: "Проверить остановки", ZH: "查看行程点"
  , DE: "Stopps überprüfen"},
  review_stops_subtitle: {
    IT: "Rimuovi o sostituisci prima di generare",
    EN: "Remove or replace before generating",
    FR: "Supprimez ou remplacez avant de générer",
    ES: "Elimina o sustituye antes de generar",
    RU: "Удалите или замените перед генерацией",
    ZH: "生成前可删除或替换"
  , DE: "Vor dem Generieren entfernen oder ersetzen"},
  start_over: {
    IT: "Ricomincia", EN: "Start Over", FR: "Recommencer", ES: "Empezar de nuevo",
    RU: "Начать заново", ZH: "重新开始"
  , DE: "Neu beginnen"},
  undo_last: {
    IT: "Annulla", EN: "Undo", FR: "Annuler", ES: "Deshacer", RU: "Отменить", ZH: "撤销"
  , DE: "Rückgängig"},
  no_stops_selected: {
    IT: "Nessuna tappa selezionata", EN: "No stops selected",
    FR: "Aucune étape sélectionnée", ES: "Ninguna parada seleccionada",
    RU: "Остановки не выбраны", ZH: "未选择行程点"
  , DE: "Keine Stopps ausgewählt"},
  back_to_swip: {
    IT: "Torna allo Swip", EN: "Back to Swip", FR: "Retour au Swip",
    ES: "Volver al Swip", RU: "Назад к Swip", ZH: "返回滑动"
  , DE: "Zurück zu Swip"},
  selected_label: {
    IT: "Selezionati", EN: "Selected", FR: "Sélectionnés", ES: "Seleccionados",
    RU: "Выбрано", ZH: "已选择"
  , DE: "Ausgewählt"},
  choose_alternative: {
    IT: "Scegli un'alternativa", EN: "Choose an alternative",
    FR: "Choisissez une alternative", ES: "Elige una alternativa",
    RU: "Выберите альтернативу", ZH: "选择替代项"
  , DE: "Wähle eine Alternative"},
  no_alternatives: {
    IT: "Nessuna alternativa disponibile", EN: "No alternatives available",
    FR: "Aucune alternative disponible", ES: "No hay alternativas disponibles",
    RU: "Альтернатив нет", ZH: "无可用替代项"
  , DE: "Keine Alternativen verfügbar"},
  use_alternative: {
    IT: "Usa", EN: "Use", FR: "Utiliser", ES: "Usar", RU: "Выбрать", ZH: "使用"
  , DE: "Verwenden"},
  replace_action: {
    IT: "Sostituisci", EN: "Replace", FR: "Remplacer", ES: "Sustituir",
    RU: "Заменить", ZH: "替换"
  , DE: "Ersetzen"},
  remove_action: {
    IT: "Rimuovi", EN: "Remove", FR: "Supprimer", ES: "Eliminar",
    RU: "Удалить", ZH: "移除"
  , DE: "Entfernen"},
  generate_itinerary_with: {
    IT: "Genera Itinerario con", EN: "Generate Itinerary with",
    FR: "Générer l'itinéraire avec", ES: "Generar itinerario con",
    RU: "Создать маршрут из", ZH: "生成行程，包含"
  , DE: "Reiseroute generieren mit"},
  stops_word: {
    IT: "tappe", EN: "stops", FR: "étapes", ES: "paradas", RU: "остановок", ZH: "个行程点"
  , DE: "Stopps"},
  generate_3_more: {
    IT: "Genera altre 3 idee", EN: "Generate 3 more ideas",
    FR: "Générer 3 autres idées", ES: "Generar 3 ideas más",
    RU: "Ещё 3 идеи", ZH: "再生成 3 个方案"
  , DE: "3 weitere Ideen generieren"},
  saved_trips: {
    IT: "Viaggi salvati", EN: "Saved trips", FR: "Voyages enregistrés",
    ES: "Viajes guardados", RU: "Сохранённые поездки", ZH: "已保存的行程"
  , DE: "Gespeicherte Reisen"},
  no_internet: {
    IT: "Senza internet", EN: "No internet", FR: "Sans internet",
    ES: "Sin internet", RU: "Без интернета", ZH: "无需联网"
  , DE: "Ohne Internet"},

  // ── Impostazioni avanzate (condivise dalle 4 modalità) ────────────────
  include_events: {
    IT: "Includi Eventi Locali", EN: "Include Local Events",
    FR: "Inclure les événements locaux", ES: "Incluir eventos locales",
    RU: "Включить местные события", ZH: "包含本地活动"
  , DE: "Lokale Veranstaltungen einbeziehen"},
  include_events_desc: {
    IT: "Concerti, sport, fiere nelle vicinanze",
    EN: "Concerts, sports and fairs nearby",
    FR: "Concerts, sports et foires à proximité",
    ES: "Conciertos, deportes y ferias cercanas",
    RU: "Концерты, спорт и ярмарки поблизости",
    ZH: "附近的音乐会、体育赛事与展会"
  , DE: "Konzerte, Sport und Messen in der Nähe"},
  include_tours: {
    IT: "Includi Tour e Attività", EN: "Include Tours & Activities",
    FR: "Inclure visites et activités", ES: "Incluir tours y actividades",
    RU: "Включить туры и активности", ZH: "包含旅游团与活动"
  , DE: "Touren & Aktivitäten einbeziehen"},
  include_tours_desc: {
    IT: "Esperienze e biglietti dai partner",
    EN: "Experiences and tickets from partners",
    FR: "Expériences et billets des partenaires",
    ES: "Experiencias y entradas de socios",
    RU: "Впечатления и билеты от партнёров",
    ZH: "来自合作伙伴的体验与门票"
  , DE: "Erlebnisse und Tickets von Partnern"},
  free_only: {
    IT: "Gratis", EN: "Free", FR: "Gratuit", ES: "Gratis",
    DE: "Gratis", RU: "Бесплатно", ZH: "免费"
  },
  free_only_desc: {
    IT: "Solo tappe gratuite: parchi, panorami, musei gratis (pasti esclusi)",
    EN: "Free stops only: parks, viewpoints, free museums (meals excluded)",
    FR: "Uniquement des étapes gratuites : parcs, panoramas, musées gratuits (repas exclus)",
    ES: "Solo paradas gratuitas: parques, miradores, museos gratis (comidas excluidas)",
    DE: "Nur kostenlose Stopps: Parks, Aussichtspunkte, freie Museen (Mahlzeiten ausgenommen)",
    RU: "Только бесплатные места: парки, смотровые площадки, бесплатные музеи (кроме еды)",
    ZH: "只含免费景点：公园、观景点、免费博物馆（餐饮除外）"
  },
  budget_label: {
    IT: "Budget", EN: "Budget", FR: "Budget", ES: "Presupuesto", RU: "Бюджет", ZH: "预算"
  , DE: "Budget"},
  budget_economico: {
    IT: "Economico", EN: "Budget", FR: "Économique", ES: "Económico", RU: "Экономный", ZH: "经济型"
  , DE: "Günstig"},
  budget_standard: {
    IT: "Standard", EN: "Standard", FR: "Standard", ES: "Estándar", RU: "Стандартный", ZH: "标准型"
  , DE: "Standard"},
  budget_lusso: {
    IT: "Lusso", EN: "Luxury", FR: "Luxe", ES: "Lujo", RU: "Люкс", ZH: "豪华型"
  , DE: "Luxus"},
  travelers_label: {
    IT: "Viaggiatori", EN: "Travellers", FR: "Voyageurs", ES: "Viajeros",
    RU: "Путешественники", ZH: "出行人数"
  , DE: "Reisende"},
  travelers_solo: {
    IT: "Solo", EN: "Solo", FR: "Solo", ES: "Solo", RU: "Один", ZH: "单人"
  , DE: "Alleine"},
  travelers_coppia: {
    IT: "Coppia", EN: "Couple", FR: "Couple", ES: "Pareja", RU: "Пара", ZH: "情侣"
  , DE: "Paar"},
  travelers_famiglia: {
    IT: "Famiglia", EN: "Family", FR: "Famille", ES: "Familia", RU: "Семья", ZH: "家庭"
  , DE: "Familie"},
  travelers_gruppo: {
    IT: "Gruppo", EN: "Group", FR: "Groupe", ES: "Grupo", RU: "Группа", ZH: "团体"
  , DE: "Gruppe"},
  pace_label: {
    IT: "Ritmo", EN: "Pace", FR: "Rythme", ES: "Ritmo", RU: "Темп", ZH: "节奏"
  , DE: "Tempo"},
  pace_rilassato: {
    IT: "Rilassato", EN: "Relaxed", FR: "Détendu", ES: "Relajado", RU: "Расслабленный", ZH: "轻松"
  , DE: "Entspannt"},
  pace_standard: {
    IT: "Standard", EN: "Standard", FR: "Standard", ES: "Estándar", RU: "Стандартный", ZH: "标准"
  , DE: "Standard"},
  pace_intenso: {
    IT: "Intenso", EN: "Intense", FR: "Intense", ES: "Intenso", RU: "Насыщенный", ZH: "紧凑"
  , DE: "Intensiv"},
  guide_label: {
    IT: "Guida", EN: "Guide", FR: "Guide", ES: "Guía", RU: "Гид", ZH: "导览员"
  , DE: "Guide"},
  guide_nicky: {
    IT: "Nicky (Locale)", EN: "Nicky (Local)", FR: "Nicky (Local)",
    ES: "Nicky (Local)", RU: "Ники (местный)", ZH: "Nicky（本地向导）"
  , DE: "Nicky (Lokal)"},
  guide_dante: {
    IT: "Dante (Storico)", EN: "Dante (Historian)", FR: "Dante (Historien)",
    ES: "Dante (Historiador)", RU: "Данте (историк)", ZH: "Dante（历史学家）"
  , DE: "Dante (Historiker)"},
  guide_entrambi: {
    IT: "Entrambi", EN: "Both", FR: "Les deux", ES: "Ambos", RU: "Оба", ZH: "两者"
  , DE: "Beide"},

  // ── Mesi (le select erano hardcoded in italiano in tutte le lingue) ────
  month_any: {
    IT: "Indifferente", EN: "Any", FR: "Peu importe", ES: "Cualquiera",
    RU: "Любой", ZH: "不限"
  , DE: "Beliebig"},
  month_1:  { IT: "Gennaio",   EN: "January",   FR: "Janvier",   ES: "Enero",      RU: "Январь",   ZH: "一月" , DE: "Januar"},
  month_2:  { IT: "Febbraio",  EN: "February",  FR: "Février",   ES: "Febrero",    RU: "Февраль",  ZH: "二月" , DE: "Februar"},
  month_3:  { IT: "Marzo",     EN: "March",     FR: "Mars",      ES: "Marzo",      RU: "Март",     ZH: "三月" , DE: "März"},
  month_4:  { IT: "Aprile",    EN: "April",     FR: "Avril",     ES: "Abril",      RU: "Апрель",   ZH: "四月" , DE: "April"},
  month_5:  { IT: "Maggio",    EN: "May",       FR: "Mai",       ES: "Mayo",       RU: "Май",      ZH: "五月" , DE: "Mai"},
  month_6:  { IT: "Giugno",    EN: "June",      FR: "Juin",      ES: "Junio",      RU: "Июнь",     ZH: "六月" , DE: "Juni"},
  month_7:  { IT: "Luglio",    EN: "July",      FR: "Juillet",   ES: "Julio",      RU: "Июль",     ZH: "七月" , DE: "Juli"},
  month_8:  { IT: "Agosto",    EN: "August",    FR: "Août",      ES: "Agosto",     RU: "Август",   ZH: "八月" , DE: "August"},
  month_9:  { IT: "Settembre", EN: "September", FR: "Septembre", ES: "Septiembre", RU: "Сентябрь", ZH: "九月" , DE: "September"},
  month_10: { IT: "Ottobre",   EN: "October",   FR: "Octobre",   ES: "Octubre",    RU: "Октябрь",  ZH: "十月" , DE: "Oktober"},
  month_11: { IT: "Novembre",  EN: "November",  FR: "Novembre",  ES: "Noviembre",  RU: "Ноябрь",   ZH: "十一月" , DE: "November"},
  month_12: { IT: "Dicembre",  EN: "December",  FR: "Décembre",  ES: "Diciembre",  RU: "Декабрь",  ZH: "十二月" , DE: "Dezember"},

  // ── Interessi (form_c) ────────────────────────────────────────────────
  interest_arte: {
    IT: "Arte & Cultura", EN: "Art & Culture", FR: "Art et culture",
    ES: "Arte y cultura", RU: "Искусство и культура", ZH: "艺术与文化"
  , DE: "Kunst & Kultur"},
  interest_famiglia: {
    IT: "Famiglie", EN: "Families", FR: "Familles", ES: "Familias", RU: "Для семьи", ZH: "亲子"
  , DE: "Familien"},
  interest_enogastronomia: {
    IT: "Enogastronomia", EN: "Food & Wine", FR: "Gastronomie", ES: "Enogastronomía",
    RU: "Гастрономия", ZH: "美食与美酒"
  , DE: "Essen & Wein"},
  interest_mare: {
    IT: "Mare", EN: "Sea", FR: "Mer", ES: "Mar", RU: "Море", ZH: "海滨"
  , DE: "Meer"},
  interest_montagna: {
    IT: "Montagna", EN: "Mountains", FR: "Montagne", ES: "Montaña", RU: "Горы", ZH: "山地"
  , DE: "Berge"},
  interest_natura: {
    IT: "Natura", EN: "Nature", FR: "Nature", ES: "Naturaleza", RU: "Природа", ZH: "自然"
  , DE: "Natur"},
  interest_relax: {
    IT: "Relax", EN: "Relax", FR: "Détente", ES: "Relax", RU: "Отдых", ZH: "休闲"
  , DE: "Entspannung"},
  interest_avventura: {
    IT: "Avventura", EN: "Adventure", FR: "Aventure", ES: "Aventura", RU: "Приключения", ZH: "探险"
  , DE: "Abenteuer"},

  // ── Categorie attrazioni (tinder_form) ────────────────────────────────
  cat_musei: {
    IT: "Musei", EN: "Museums", FR: "Musées", ES: "Museos", RU: "Музеи", ZH: "博物馆"
  , DE: "Museen"},
  cat_monumenti: {
    IT: "Monumenti", EN: "Monuments", FR: "Monuments", ES: "Monumentos",
    RU: "Памятники", ZH: "古迹"
  , DE: "Denkmäler"},
  cat_chiese: {
    IT: "Chiese", EN: "Churches", FR: "Églises", ES: "Iglesias", RU: "Церкви", ZH: "教堂"
  , DE: "Kirchen"},
  cat_attrazioni: {
    IT: "Attrazioni", EN: "Attractions", FR: "Attractions", ES: "Atracciones",
    RU: "Достопримечательности", ZH: "景点"
  , DE: "Attraktionen"},
  cat_gastronomia: {
    IT: "Gastronomia", EN: "Food", FR: "Gastronomie", ES: "Gastronomía",
    RU: "Гастрономия", ZH: "美食"
  , DE: "Gastronomie"},
  cat_natura: {
    IT: "Natura", EN: "Nature", FR: "Nature", ES: "Naturaleza", RU: "Природа", ZH: "自然"
  , DE: "Natur"},
  cat_shopping: {
    IT: "Shopping", EN: "Shopping", FR: "Shopping", ES: "Compras", RU: "Шопинг", ZH: "购物"
  , DE: "Shopping"},

  // ── Badge e azioni sulle tappe ────────────────────────────────────────
  badge_visited: {
    IT: "Visitato", EN: "Visited", FR: "Visité", ES: "Visitado", RU: "Посещено", ZH: "已到访"
  , DE: "Besucht"},
  badge_verified: {
    IT: "Verificata", EN: "Verified", FR: "Vérifiée", ES: "Verificada",
    RU: "Проверено", ZH: "已核实"
  , DE: "Verifiziert"},
  badge_to_verify: {
    IT: "Da verificare", EN: "To verify", FR: "À vérifier", ES: "Por verificar",
    RU: "Требует проверки", ZH: "待核实"
  , DE: "Zu verifizieren"},
  badge_hidden_gem: {
    IT: "Gemma poco nota", EN: "Hidden gem", FR: "Pépite cachée", ES: "Joya escondida",
    RU: "Скрытая жемчужина", ZH: "小众宝藏"
  , DE: "Geheimtipp"},
  badge_verified_tooltip: {
    IT: "Tappa confermata dalla verifica AI incrociata",
    EN: "Stop confirmed by cross-checked AI verification",
    FR: "Étape confirmée par vérification croisée de l'IA",
    ES: "Parada confirmada por verificación cruzada de IA",
    RU: "Остановка подтверждена перекрёстной AI-проверкой",
    ZH: "该行程点已通过 AI 交叉核实"
  , DE: "Station durch geprüfte KI-Verifizierung bestätigt"},
  source_label: {
    IT: "Fonte", EN: "Source", FR: "Source", ES: "Fuente", RU: "Источник", ZH: "来源"
  , DE: "Quelle"},
  buy_see_tour: {
    IT: "Acquista / Vedi Tour", EN: "Book / View Tour", FR: "Réserver / Voir le tour",
    ES: "Reservar / Ver tour", RU: "Купить / Посмотреть тур", ZH: "购买 / 查看行程"
  , DE: "Buchen / Tour ansehen"},
  move_up: {
    IT: "Sposta su", EN: "Move up", FR: "Monter", ES: "Subir", RU: "Вверх", ZH: "上移"
  , DE: "Nach oben"},
  move_down: {
    IT: "Sposta giù", EN: "Move down", FR: "Descendre", ES: "Bajar", RU: "Вниз", ZH: "下移"
  , DE: "Nach unten"},
  lock_stop: {
    IT: "Blocca tappa (non verrà cambiata rigenerando)",
    EN: "Lock stop (kept when regenerating)",
    FR: "Verrouiller l'étape (conservée à la régénération)",
    ES: "Bloquear parada (se mantiene al regenerar)",
    RU: "Закрепить остановку (сохранится при повторной генерации)",
    ZH: "锁定行程点（重新生成时保留）"
  , DE: "Station sperren (bleibt bei Neugenerierung erhalten)"},
  confirm_delete_stop: {
    IT: "Vuoi eliminare questa tappa dall'itinerario?",
    EN: "Delete this stop from the itinerary?",
    FR: "Supprimer cette étape de l'itinéraire ?",
    ES: "¿Eliminar esta parada del itinerario?",
    RU: "Удалить эту остановку из маршрута?",
    ZH: "确定从行程中删除该点吗？"
  , DE: "Diese Station aus der Route entfernen?"},
  suggest_with_ai: {
    IT: "Suggerisci con AI", EN: "Suggest with AI", FR: "Suggérer avec l'IA",
    ES: "Sugerir con IA", RU: "Предложить с ИИ", ZH: "用 AI 推荐"
  , DE: "Mit KI vorschlagen"},
  save_btn: {
    IT: "Salva", EN: "Save", FR: "Enregistrer", ES: "Guardar", RU: "Сохранить", ZH: "保存"
  , DE: "Speichern"},
  stop_type_visita: {
    IT: "Azione/Visita", EN: "Activity/Visit", FR: "Activité/Visite",
    ES: "Actividad/Visita", RU: "Активность/Посещение", ZH: "活动/参观"
  , DE: "Aktivität/Besichtigung"},
  stop_type_ristorante: {
    IT: "Ristorante", EN: "Restaurant", FR: "Restaurant", ES: "Restaurante",
    RU: "Ресторан", ZH: "餐厅"
  , DE: "Restaurant"},
  stop_type_spostamento: {
    IT: "Spostamento", EN: "Transfer", FR: "Déplacement", ES: "Traslado",
    RU: "Переезд", ZH: "交通"
  , DE: "Transfer"},
  premium_experiences: {
    IT: "Esperienze Premium consigliate", EN: "Recommended Premium Experiences",
    FR: "Expériences premium recommandées", ES: "Experiencias premium recomendadas",
    RU: "Рекомендуемые премиум-впечатления", ZH: "推荐的精选体验"
  , DE: "Empfohlene Premium-Erlebnisse"},

  // ── Feedback / errori (sostituiscono gli alert() nativi) ──────────────
  err_no_destination: {
    IT: "Inserisci almeno una destinazione.", EN: "Enter at least one destination.",
    FR: "Saisissez au moins une destination.", ES: "Introduce al menos un destino.",
    RU: "Укажите хотя бы один пункт назначения.", ZH: "请至少输入一个目的地。"
  , DE: "Gib mindestens ein Reiseziel ein."},
  err_no_base: {
    IT: "Inserisci una città di partenza.", EN: "Enter a starting city.",
    FR: "Saisissez une ville de départ.", ES: "Introduce una ciudad de partida.",
    RU: "Укажите город отправления.", ZH: "请输入出发城市。"
  , DE: "Gib eine Startstadt ein."},
  err_valid_destination: {
    IT: "Inserisci una destinazione valida (almeno 3 caratteri).",
    EN: "Enter a valid destination (at least 3 characters).",
    FR: "Saisissez une destination valide (au moins 3 caractères).",
    ES: "Introduce un destino válido (mínimo 3 caracteres).",
    RU: "Введите корректный пункт назначения (не менее 3 символов).",
    ZH: "请输入有效目的地（至少 3 个字符）。"
  , DE: "Gib ein gültiges Reiseziel ein (mindestens 3 Zeichen)."},
  err_no_favorites: {
    IT: "Seleziona almeno un luogo dai preferiti.",
    EN: "Select at least one saved place.",
    FR: "Sélectionnez au moins un lieu enregistré.",
    ES: "Selecciona al menos un lugar guardado.",
    RU: "Выберите хотя бы одно сохранённое место.",
    ZH: "请至少选择一个收藏地点。"
  , DE: "Wähle mindestens einen gespeicherten Ort aus."},
  err_no_liked: {
    IT: "Seleziona almeno un'attrazione col cuore.",
    EN: "Select at least one attraction with the heart.",
    FR: "Sélectionnez au moins une attraction avec le cœur.",
    ES: "Selecciona al menos una atracción con el corazón.",
    RU: "Отметьте сердечком хотя бы одну достопримечательность.",
    ZH: "请用爱心至少选择一个景点。"
  , DE: "Markiere mindestens eine Attraktion mit dem Herz."},
  err_insufficient_credits: {
    IT: "Crediti insufficienti. Visita lo store per ricaricare.",
    EN: "Not enough credits. Visit the store to top up.",
    FR: "Crédits insuffisants. Visitez la boutique pour recharger.",
    ES: "Créditos insuficientes. Visita la tienda para recargar.",
    RU: "Недостаточно кредитов. Пополните в магазине.",
    ZH: "点数不足，请前往商店充值。"
  , DE: "Nicht genug Guthaben. Besuche den Store, um aufzuladen."},
  err_generation_refunded: {
    IT: "Generazione non riuscita. I crediti ti sono stati restituiti.",
    EN: "Generation failed. Your credits have been refunded.",
    FR: "Échec de la génération. Vos crédits ont été remboursés.",
    ES: "Error en la generación. Se te han devuelto los créditos.",
    RU: "Ошибка генерации. Кредиты возвращены.",
    ZH: "生成失败，点数已退还。"
  , DE: "Generierung fehlgeschlagen. Dein Guthaben wurde erstattet."},
  err_no_alternatives: {
    IT: "Nessuna alternativa trovata. Riprova con un raggio più ampio.",
    EN: "No alternatives found. Try a wider radius.",
    FR: "Aucune alternative trouvée. Essayez un rayon plus large.",
    ES: "No se encontraron alternativas. Prueba un radio mayor.",
    RU: "Альтернатив не найдено. Попробуйте больший радиус.",
    ZH: "未找到方案，请尝试更大的半径。"
  , DE: "Keine Alternativen gefunden. Versuche einen größeren Radius."},
  err_candidates: {
    IT: "Errore nel recupero delle attrazioni. Riprova.",
    EN: "Error retrieving attractions. Please try again.",
    FR: "Erreur lors de la récupération des attractions. Réessayez.",
    ES: "Error al recuperar las atracciones. Inténtalo de nuevo.",
    RU: "Ошибка загрузки достопримечательностей. Повторите попытку.",
    ZH: "获取景点失败，请重试。"
  , DE: "Fehler beim Abrufen der Attraktionen. Bitte versuche es erneut."},
  err_location_not_found: {
    IT: "Località non trovata. Controlla il nome e riprova.",
    EN: "Location not found. Check the name and try again.",
    FR: "Lieu introuvable. Vérifiez le nom et réessayez.",
    ES: "Ubicación no encontrada. Comprueba el nombre e inténtalo de nuevo.",
    RU: "Место не найдено. Проверьте название и повторите.",
    ZH: "未找到该地点，请检查名称后重试。"
  , DE: "Ort nicht gefunden. Überprüfe den Namen und versuche es erneut."},
  err_gps_failed: {
    IT: "Impossibile ottenere la posizione.", EN: "Could not get your location.",
    FR: "Impossible d'obtenir la position.", ES: "No se pudo obtener la ubicación.",
    RU: "Не удалось определить местоположение.", ZH: "无法获取您的位置。"
  , DE: "Standort konnte nicht ermittelt werden."},
  err_end_before_start: {
    IT: "L'orario di fine deve essere successivo a quello di inizio.",
    EN: "End time must be later than start time.",
    FR: "L'heure de fin doit être postérieure à l'heure de début.",
    ES: "La hora de fin debe ser posterior a la de inicio.",
    RU: "Время окончания должно быть позже времени начала.",
    ZH: "结束时间必须晚于开始时间。"
  , DE: "Die Endzeit muss nach der Startzeit liegen."},
  getting_location: {
    IT: "Rilevamento posizione...", EN: "Getting location...",
    FR: "Localisation en cours...", ES: "Obteniendo ubicación...",
    RU: "Определение местоположения...", ZH: "正在定位..."
  , DE: "Standort wird ermittelt..."},
  cache_hit_discount: {
    IT: "Itinerario pronto dalla nostra libreria: consegna immediata e metà prezzo",
    EN: "Itinerary ready from our library: instant delivery, half price",
    FR: "Itinéraire prêt dans notre bibliothèque : livraison immédiate, moitié prix",
    ES: "Itinerario listo en nuestra biblioteca: entrega inmediata y mitad de precio",
    RU: "Маршрут уже в нашей библиотеке: мгновенно и за полцены",
    ZH: "行程已在我们的库中：即时交付，半价"
  , DE: "Route aus unserer Bibliothek verfügbar: sofortige Lieferung, halber Preis"},
  credits_refunded: {
    IT: "crediti restituiti", EN: "credits refunded", FR: "crédits remboursés",
    ES: "créditos devueltos", RU: "кредитов возвращено", ZH: "点数已退还"
  , DE: "Guthaben erstattet"},
  library_note: {
    IT: "Se è già nella nostra libreria, lo ricevi subito a metà prezzo",
    EN: "If it's already in our library, you get it instantly at half price",
    FR: "S'il est déjà dans notre bibliothèque, vous l'obtenez aussitôt à moitié prix",
    ES: "Si ya está en nuestra biblioteca, lo recibes al instante a mitad de precio",
    RU: "Если он уже в нашей библиотеке, вы получите его сразу за полцены",
    ZH: "若已在我们的库中，将立即以半价交付"
  , DE: "Ist sie bereits in unserer Bibliothek, erhältst du sie sofort zum halben Preis"},
  warn_favorites_spread: {
    IT: "I luoghi che hai scelto sono molto distanti tra loro",
    EN: "The places you picked are very far apart",
    FR: "Les lieux choisis sont très éloignés les uns des autres",
    ES: "Los lugares que has elegido están muy alejados entre sí",
    RU: "Выбранные места находятся очень далеко друг от друга",
    ZH: "您选择的地点彼此相距很远"
  , DE: "Die ausgewählten Orte liegen sehr weit auseinander"},
  warn_continue_anyway: {
    IT: "Vuoi continuare comunque?", EN: "Continue anyway?",
    FR: "Continuer quand même ?", ES: "¿Continuar de todos modos?",
    RU: "Всё равно продолжить?", ZH: "仍要继续吗？"
  , DE: "Trotzdem fortfahren?"},
  free_label: {
    IT: "gratis", EN: "free", FR: "gratuit", ES: "gratis", RU: "бесплатно", ZH: "免费"
  , DE: "gratis"},
  credits_label: {
    IT: "crediti", EN: "credits", FR: "crédits", ES: "créditos", RU: "кредитов", ZH: "点数"
  , DE: "Guthaben"},
  free_replacement_done: {
    IT: "Sostituzione gratuita effettuata", EN: "Free replacement done",
    FR: "Remplacement gratuit effectué", ES: "Sustitución gratuita realizada",
    RU: "Бесплатная замена выполнена", ZH: "已完成免费替换"
  , DE: "Kostenloser Ersatz durchgeführt"},
  remaining_today: {
    IT: "ancora gratis su questo giorno", EN: "free left on this day",
    FR: "gratuits restants sur ce jour", ES: "gratis restantes en este día",
    RU: "бесплатных осталось на этот день", ZH: "该日剩余免费次数"
  , DE: "kostenlose übrig an diesem Tag"},
  free_replacements_left: {
    IT: "sostituzioni gratis", EN: "free replacements",
    FR: "remplacements gratuits", ES: "sustituciones gratis",
    RU: "бесплатных замен", ZH: "次免费替换"
  , DE: "kostenlose Ersetzungen"},
  read_more: {
    IT: "Leggi tutto", EN: "Read more", FR: "Lire la suite", ES: "Leer más",
    RU: "Читать далее", ZH: "展开"
  , DE: "Mehr lesen"},
  read_less: {
    IT: "Riduci", EN: "Read less", FR: "Réduire", ES: "Leer menos",
    RU: "Свернуть", ZH: "收起"
  , DE: "Weniger anzeigen"},
  explore_map: {
    IT: "Esplora la mappa", EN: "Explore the map", FR: "Explorer la carte",
    ES: "Explorar el mapa", RU: "Открыть карту", ZH: "浏览地图"
  , DE: "Karte erkunden"},
  add_destination: {
    IT: "Aggiungi destinazione", EN: "Add destination", FR: "Ajouter une destination",
    ES: "Añadir destino", RU: "Добавить пункт назначения", ZH: "添加目的地"
  , DE: "Reiseziel hinzufügen"},
  searching: {
    IT: "Ricerca...", EN: "Searching...", FR: "Recherche...", ES: "Buscando...",
    RU: "Поиск...", ZH: "搜索中..."
  , DE: "Suche läuft..."},
  no_results: {
    IT: "Nessun risultato trovato.", EN: "No results found.",
    FR: "Aucun résultat trouvé.", ES: "No se encontraron resultados.",
    RU: "Ничего не найдено.", ZH: "未找到结果。"
  , DE: "Keine Ergebnisse gefunden."},
  experience_added: {
    IT: "Esperienza aggiunta all'itinerario", EN: "Experience added to the itinerary",
    FR: "Expérience ajoutée à l'itinéraire", ES: "Experiencia añadida al itinerario",
    RU: "Впечатление добавлено в маршрут", ZH: "体验已加入行程"
  , DE: "Erlebnis zur Route hinzugefügt"},
  event_added: {
    IT: "Evento aggiunto all'itinerario", EN: "Event added to the itinerary",
    FR: "Événement ajouté à l'itinéraire", ES: "Evento añadido al itinerario",
    RU: "Событие добавлено в маршрут", ZH: "活动已加入行程"
  , DE: "Veranstaltung zur Route hinzugefügt"},
  err_stop_required_fields: {
    IT: "Compila almeno il nome della tappa e l'ora.",
    EN: "Fill in at least the stop name and the time.",
    FR: "Renseignez au moins le nom de l'étape et l'heure.",
    ES: "Rellena al menos el nombre de la parada y la hora.",
    RU: "Укажите хотя бы название остановки и время.",
    ZH: "请至少填写行程点名称和时间。"
  , DE: "Gib mindestens Name und Uhrzeit der Station ein."},
  err_delete_itinerary: {
    IT: "Eliminazione non riuscita. Riprova.", EN: "Deletion failed. Please try again.",
    FR: "Échec de la suppression. Réessayez.", ES: "Error al eliminar. Inténtalo de nuevo.",
    RU: "Не удалось удалить. Повторите попытку.", ZH: "删除失败，请重试。"
  , DE: "Löschen fehlgeschlagen. Bitte versuche es erneut."},
  err_tts_unsupported: {
    IT: "Sintesi vocale non supportata su questo browser.",
    EN: "Speech synthesis is not supported in this browser.",
    FR: "La synthèse vocale n'est pas prise en charge par ce navigateur.",
    ES: "Este navegador no admite la síntesis de voz.",
    RU: "Синтез речи не поддерживается этим браузером.",
    ZH: "此浏览器不支持语音合成。"
  , DE: "Sprachausgabe wird von diesem Browser nicht unterstützt."},
  close: {
    IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", RU: "Закрыть", ZH: "关闭"
  , DE: "Schließen"},
  skip: {
    IT: "Salta", EN: "Skip", FR: "Passer", ES: "Saltar", RU: "Пропустить", ZH: "跳过"
  , DE: "Überspringen"},
  free_no_credits: {
    IT: "Gratis — paghi solo l'itinerario che scegli",
    EN: "Free — you only pay for the itinerary you pick",
    FR: "Gratuit — vous ne payez que l'itinéraire choisi",
    ES: "Gratis: solo pagas el itinerario que elijas",
    RU: "Бесплатно — вы платите только за выбранный маршрут",
    ZH: "免费——仅为您选择的行程付费"
  , DE: "Kostenlos — du zahlst nur für die Route, die du auswählst"},

  // ── Eventi: stringhe che prima erano hardcoded in italiano ──
  events_only_free: {
    IT: "Solo gratis", EN: "Free only", FR: "Gratuit seulement", ES: "Solo gratis", RU: "Только бесплатные", ZH: "仅免费"
  , DE: "Nur kostenlos"},
  events_free_badge: {
    IT: "Gratis", EN: "Free", FR: "Gratuit", ES: "Gratis", RU: "Бесплатно", ZH: "免费"
  , DE: "Kostenlos"},
  events_evening_cta: {
    IT: "Serata perfetta in un tap", EN: "Perfect evening in one tap", FR: "Soirée parfaite en un clic", ES: "Noche perfecta en un toque", RU: "Идеальный вечер в одно касание", ZH: "一键完美夜晚"
  , DE: "Perfekter Abend mit einem Tipp"},
  events_evening_preparing: {
    IT: "Preparo la tua serata...", EN: "Preparing your evening...", FR: "Je prépare votre soirée...", ES: "Preparando tu noche...", RU: "Готовлю ваш вечер...", ZH: "正在准备您的夜晚..."
  , DE: "Ich bereite deinen Abend vor..."},
  events_evening_no_position: {
    IT: "Posizione non disponibile per comporre la serata.", EN: "Position unavailable to plan the evening.", FR: "Position indisponible pour composer la soirée.", ES: "Posición no disponible para preparar la noche.", RU: "Местоположение недоступно для планирования вечера.", ZH: "无法获取位置，无法安排夜晚。"
  , DE: "Position nicht verfügbar, um den Abend zu planen."},
  events_evening_unavailable: {
    IT: "Serata perfetta non disponibile al momento, riprova tra poco.", EN: "Perfect evening unavailable right now, try again shortly.", FR: "Soirée parfaite indisponible pour le moment, réessayez bientôt.", ES: "Noche perfecta no disponible ahora, inténtalo en breve.", RU: "Идеальный вечер сейчас недоступен, попробуйте позже.", ZH: "完美夜晚暂不可用，请稍后再试。"
  , DE: "Perfekter Abend gerade nicht verfügbar, versuche es gleich noch einmal."},
  events_evening_not_composable: {
    IT: "Qui non ho abbastanza locali ed eventi reali per comporre una serata: prova da una città più grande.", EN: "Not enough real venues and events here to plan an evening: try from a bigger city.", FR: "Pas assez de lieux et d'événements réels ici pour composer une soirée : essayez depuis une plus grande ville.", ES: "No hay suficientes locales y eventos reales aquí para preparar una noche: prueba desde una ciudad más grande.", RU: "Здесь недостаточно реальных заведений и событий, чтобы составить вечер: попробуйте из города побольше.", ZH: "这里真实的场所和活动不足以安排夜晚：请尝试更大的城市。"
  , DE: "Hier gibt es nicht genug echte Lokale und Events für einen Abend: versuche es von einer größeren Stadt aus."},
  events_evening_timeout: {
    IT: "La serata ci sta mettendo troppo: riprova tra poco.", EN: "The evening plan is taking too long: try again shortly.", FR: "La soirée prend trop de temps : réessayez bientôt.", ES: "La noche está tardando demasiado: inténtalo en breve.", RU: "Планирование вечера занимает слишком много времени: попробуйте позже.", ZH: "夜晚规划耗时过长：请稍后再试。"
  , DE: "Der Abend dauert zu lange: versuche es gleich noch einmal."},
  events_evening_budget: {
    IT: "Budget stimato", EN: "Estimated budget", FR: "Budget estimé", ES: "Presupuesto estimado", RU: "Ориентировочный бюджет", ZH: "预计预算"
  , DE: "Geschätztes Budget"},
  events_evening_open_map: {
    IT: "Apri in mappa", EN: "Open in map", FR: "Ouvrir sur la carte", ES: "Abrir en el mapa", RU: "Открыть на карте", ZH: "在地图中打开"
  , DE: "In Karte öffnen"},
  events_evening_tickets: {
    IT: "Biglietti", EN: "Tickets", FR: "Billets", ES: "Entradas", RU: "Билеты", ZH: "门票"
  , DE: "Tickets"},
  events_evening_disclaimer: {
    IT: "Proposta generata con AI su locali ed eventi reali della zona: verifica orari e disponibilità.", EN: "AI-generated proposal based on real venues and events in the area: check times and availability.", FR: "Proposition générée par IA sur des lieux et événements réels : vérifiez horaires et disponibilité.", ES: "Propuesta generada con IA sobre locales y eventos reales de la zona: verifica horarios y disponibilidad.", RU: "Предложение создано ИИ на основе реальных заведений и событий: проверьте время и доступность.", ZH: "由 AI 根据该区域真实场所和活动生成：请核实时间和可用性。"
  , DE: "KI-Vorschlag auf Basis echter Lokale und Events der Gegend: Zeiten und Verfügbarkeit prüfen."},
  events_tonight_title: {
    IT: "Stasera vicino a te", EN: "Tonight near you", FR: "Ce soir près de vous", ES: "Esta noche cerca de ti", RU: "Сегодня вечером рядом", ZH: "今晚在您附近"
  , DE: "Heute Abend in deiner Nähe"},
  events_tonight_at: {
    IT: "ore", EN: "at", FR: "à", ES: "a las", RU: "в", ZH: "时间"
  , DE: "um"},
  events_loading_source: {
    IT: "Carico", EN: "Loading", FR: "Chargement", ES: "Cargando", RU: "Загрузка", ZH: "加载中"
  , DE: "Lade"},
  events_source_unavailable: {
    IT: "non disponibile", EN: "unavailable", FR: "indisponible", ES: "no disponible", RU: "недоступно", ZH: "不可用"
  , DE: "nicht verfügbar"},
  events_source_local_label: {
    IT: "Sagre & Mercati", EN: "Fairs & Markets", FR: "Fêtes & Marchés", ES: "Ferias y Mercados", RU: "Ярмарки и рынки", ZH: "集市与节庆"
  , DE: "Feste & Märkte"},
  events_err_virgilio: {
    IT: "Impossibile caricare eventi da Virgilio.", EN: "Could not load events from Virgilio.", FR: "Impossible de charger les événements de Virgilio.", ES: "No se pudieron cargar eventos de Virgilio.", RU: "Не удалось загрузить события Virgilio.", ZH: "无法从 Virgilio 加载活动。"
  , DE: "Events von Virgilio konnten nicht geladen werden."},
  events_err_ticketmaster: {
    IT: "Nessun evento o API key mancante.", EN: "No events or missing API key.", FR: "Aucun événement ou clé API manquante.", ES: "Sin eventos o falta la clave API.", RU: "Нет событий или отсутствует API-ключ.", ZH: "无活动或缺少 API 密钥。"
  , DE: "Keine Events oder API-Schlüssel fehlt."},
  events_err_local: {
    IT: "Sagre e mercati non disponibili.", EN: "Fairs and markets unavailable.", FR: "Fêtes et marchés indisponibles.", ES: "Ferias y mercados no disponibles.", RU: "Ярмарки и рынки недоступны.", ZH: "集市与节庆不可用。"
  , DE: "Feste und Märkte nicht verfügbar."},
  events_err_tiqets: {
    IT: "Impossibile recuperare biglietti Tiqets", EN: "Could not fetch Tiqets tickets", FR: "Impossible de récupérer les billets Tiqets", ES: "No se pudieron obtener entradas de Tiqets", RU: "Не удалось получить билеты Tiqets", ZH: "无法获取 Tiqets 门票"
  , DE: "Tiqets-Tickets konnten nicht geladen werden"},
  events_err_viator: {
    IT: "Impossibile caricare esperienze Viator.", EN: "Could not load Viator experiences.", FR: "Impossible de charger les expériences Viator.", ES: "No se pudieron cargar experiencias de Viator.", RU: "Не удалось загрузить впечатления Viator.", ZH: "无法加载 Viator 体验。"
  , DE: "Viator-Erlebnisse konnten nicht geladen werden."},
  events_err_gyg: {
    IT: "Impossibile recuperare eventi GetYourGuide", EN: "Could not fetch GetYourGuide activities", FR: "Impossible de récupérer les activités GetYourGuide", ES: "No se pudieron obtener actividades de GetYourGuide", RU: "Не удалось получить GetYourGuide", ZH: "无法获取 GetYourGuide 活动"
  , DE: "GetYourGuide-Aktivitäten konnten nicht geladen werden"},
  events_err_mostre: {
    IT: "Mostre non disponibili.", EN: "Exhibitions unavailable.", FR: "Expositions indisponibles.", ES: "Exposiciones no disponibles.", RU: "Выставки недоступны.", ZH: "展览不可用。"
  , DE: "Ausstellungen nicht verfügbar."},
  events_err_permanenti: {
    IT: "Collezioni permanenti non disponibili.", EN: "Permanent collections unavailable.", FR: "Collections permanentes indisponibles.", ES: "Colecciones permanentes no disponibles.", RU: "Постоянные коллекции недоступны.", ZH: "常设展不可用。"
  , DE: "Dauerausstellungen nicht verfügbar."},
  events_save_login: {
    IT: "Devi essere loggato per salvare un evento.", EN: "Log in to save an event.", FR: "Connectez-vous pour enregistrer un événement.", ES: "Inicia sesión para guardar un evento.", RU: "Войдите, чтобы сохранить событие.", ZH: "请登录以保存活动。"
  , DE: "Melde dich an, um ein Event zu speichern."},
  events_save_already: {
    IT: "Evento già salvato nei preferiti!", EN: "Event already in favorites!", FR: "Événement déjà dans les favoris !", ES: "¡Evento ya guardado en favoritos!", RU: "Событие уже в избранном!", ZH: "活动已在收藏中！"
  , DE: "Event ist schon in den Favoriten!"},
  events_save_watch: {
    IT: "Evento salvato! Ti avviso qui se il prezzo o lo stato dei biglietti cambia.", EN: "Event saved! I'll let you know here if the price or ticket status changes.", FR: "Événement enregistré ! Je vous préviens ici si le prix ou l'état des billets change.", ES: "¡Evento guardado! Te aviso aquí si cambia el precio o el estado de las entradas.", RU: "Событие сохранено! Сообщу здесь, если изменится цена или статус билетов.", ZH: "活动已保存！价格或票务状态变化时会在此通知您。"
  , DE: "Event gespeichert! Ich sage dir hier Bescheid, wenn sich Preis oder Ticketstatus ändern."},
  events_save_done: {
    IT: "Evento salvato nei Preferiti! Potrai usarlo per generare itinerari personalizzati.", EN: "Event saved to Favorites! You can use it to build custom itineraries.", FR: "Événement enregistré dans les favoris ! Utilisez-le pour créer des itinéraires personnalisés.", ES: "¡Evento guardado en Favoritos! Podrás usarlo para generar itinerarios personalizados.", RU: "Событие сохранено в избранное! Используйте его для персональных маршрутов.", ZH: "活动已保存至收藏！可用于生成个性化行程。"
  , DE: "Event in den Favoriten gespeichert! Du kannst es für persönliche Routen nutzen."},
  events_save_error: {
    IT: "Errore durante il salvataggio.", EN: "Error while saving.", FR: "Erreur lors de l'enregistrement.", ES: "Error al guardar.", RU: "Ошибка при сохранении.", ZH: "保存时出错。"
  , DE: "Fehler beim Speichern."},
  events_save_title: {
    IT: "Salva nei preferiti", EN: "Save to favorites", FR: "Enregistrer dans les favoris", ES: "Guardar en favoritos", RU: "В избранное", ZH: "保存到收藏"
  , DE: "In Favoriten speichern"},
  events_book_viator: {
    IT: "Prenota su Viator", EN: "Book on Viator", FR: "Réserver sur Viator", ES: "Reservar en Viator", RU: "Забронировать на Viator", ZH: "在 Viator 预订"
  , DE: "Auf Viator buchen"},
  events_book_gyg: {
    IT: "Prenota su GetYourGuide", EN: "Book on GetYourGuide", FR: "Réserver sur GetYourGuide", ES: "Reservar en GetYourGuide", RU: "Забронировать на GetYourGuide", ZH: "在 GetYourGuide 预订"
  , DE: "Auf GetYourGuide buchen"},
  events_show_more: {
    IT: "Mostra altri 20", EN: "Show 20 more", FR: "Afficher 20 de plus", ES: "Mostrar 20 más", RU: "Показать ещё 20", ZH: "再显示 20 个"
  , DE: "20 weitere anzeigen"},
  events_type_all: {
    IT: "Tutti", EN: "All", FR: "Tous", ES: "Todos", RU: "Все", ZH: "全部"
  , DE: "Alle"},
  events_type_concerts: {
    IT: "Concerti", EN: "Concerts", FR: "Concerts", ES: "Conciertos", RU: "Концерты", ZH: "音乐会"
  , DE: "Konzerte"},
  events_type_fairs: {
    IT: "Sagre", EN: "Fairs", FR: "Fêtes", ES: "Ferias", RU: "Ярмарки", ZH: "节庆"
  , DE: "Feste"},
  events_type_markets: {
    IT: "Mercati", EN: "Markets", FR: "Marchés", ES: "Mercados", RU: "Рынки", ZH: "集市"
  , DE: "Märkte"},
  events_type_tours: {
    IT: "Tour", EN: "Tours", FR: "Visites", ES: "Tours", RU: "Туры", ZH: "导览"
  , DE: "Touren"},
  events_type_tickets: {
    IT: "Biglietti", EN: "Tickets", FR: "Billets", ES: "Entradas", RU: "Билеты", ZH: "门票"
  , DE: "Tickets"},
  events_trip_active: {
    IT: "Eventi a {city} (viaggio attivo)", EN: "Events in {city} (active trip)", FR: "Événements à {city} (voyage en cours)", ES: "Eventos en {city} (viaje activo)", RU: "События в {city} (активная поездка)", ZH: "{city} 的活动（当前行程）"
  , DE: "Events in {city} (aktive Reise)"},
  events_current_position: {
    IT: "Posizione attuale", EN: "Current position", FR: "Position actuelle", ES: "Posición actual", RU: "Текущее положение", ZH: "当前位置"
  , DE: "Aktuelle Position"},
  events_alert_dismiss: {
    IT: "Ho capito, nascondi", EN: "Got it, hide", FR: "Compris, masquer", ES: "Entendido, ocultar", RU: "Понятно, скрыть", ZH: "知道了，隐藏"
  , DE: "Verstanden, ausblenden"},
  // ── Pianificatore: errori specifici di generazione (22/08/2026) ──────
  err_quota_exceeded_itinerary: {
    IT: "Hai raggiunto il limite giornaliero di itinerari. Riprova domani.",
    EN: "You've reached today's itinerary limit. Try again tomorrow.",
    FR: "Vous avez atteint la limite quotidienne d'itinéraires. Réessayez demain.",
    ES: "Has alcanzado el límite diario de itinerarios. Vuelve a intentarlo mañana.",
    DE: "Du hast das tägliche Routenlimit erreicht. Versuche es morgen erneut.",
    RU: "Достигнут дневной лимит маршрутов. Попробуйте завтра.",
    ZH: "已达到今日行程上限，请明天再试。" },
  err_feature_disabled: {
    IT: "La generazione itinerari è temporaneamente in manutenzione. Riprova più tardi.",
    EN: "Itinerary generation is temporarily under maintenance. Try again later.",
    FR: "La génération d'itinéraires est temporairement en maintenance. Réessayez plus tard.",
    ES: "La generación de itinerarios está temporalmente en mantenimiento. Inténtalo más tarde.",
    DE: "Die Routenerstellung ist vorübergehend in Wartung. Versuche es später erneut.",
    RU: "Создание маршрутов временно недоступно. Попробуйте позже.",
    ZH: "行程生成暂时维护中，请稍后再试。" },
  err_charge_failed: {
    IT: "Problema temporaneo con l'addebito dei crediti. Nessun credito è stato scalato: riprova tra poco.",
    EN: "Temporary problem charging credits. No credits were deducted: try again shortly.",
    FR: "Problème temporaire lors du débit des crédits. Aucun crédit n'a été prélevé : réessayez bientôt.",
    ES: "Problema temporal al cobrar los créditos. No se ha descontado nada: inténtalo en breve.",
    DE: "Vorübergehendes Problem beim Abbuchen der Credits. Es wurde nichts abgezogen: versuche es gleich erneut.",
    RU: "Временная ошибка списания кредитов. Кредиты не списаны: попробуйте чуть позже.",
    ZH: "扣除点数时出现临时问题，未扣除任何点数，请稍后重试。" },
  err_ai_timeout: {
    IT: "Il server sta impiegando troppo tempo a rispondere. Riprova tra poco.",
    EN: "The server is taking too long to respond. Try again shortly.",
    FR: "Le serveur met trop de temps à répondre. Réessayez bientôt.",
    ES: "El servidor tarda demasiado en responder. Inténtalo en breve.",
    DE: "Der Server braucht zu lange. Versuche es gleich erneut.",
    RU: "Сервер отвечает слишком долго. Попробуйте чуть позже.",
    ZH: "服务器响应超时，请稍后重试。" },
  err_ai_empty: {
    IT: "Il server non ha restituito dati. Riprova tra qualche secondo.",
    EN: "The server returned no data. Try again in a few seconds.",
    FR: "Le serveur n'a renvoyé aucune donnée. Réessayez dans quelques secondes.",
    ES: "El servidor no ha devuelto datos. Inténtalo en unos segundos.",
    DE: "Der Server hat keine Daten geliefert. Versuche es in ein paar Sekunden erneut.",
    RU: "Сервер не вернул данных. Попробуйте через несколько секунд.",
    ZH: "服务器未返回数据，请几秒后重试。" },
  err_ai_invalid_response: {
    IT: "Risposta AI incompleta o non valida. Riprova; se persiste, prova con meno giorni o una destinazione più semplice.",
    EN: "Incomplete or invalid AI response. Try again; if it persists, try fewer days or a simpler destination.",
    FR: "Réponse IA incomplète ou invalide. Réessayez ; si le problème persiste, réduisez les jours ou simplifiez la destination.",
    ES: "Respuesta de la IA incompleta o no válida. Inténtalo de nuevo; si persiste, prueba con menos días o un destino más sencillo.",
    DE: "Unvollständige oder ungültige KI-Antwort. Versuche es erneut; bleibt es dabei, nimm weniger Tage oder ein einfacheres Ziel.",
    RU: "Неполный или неверный ответ ИИ. Попробуйте снова; если повторяется, уменьшите число дней или упростите направление.",
    ZH: "AI 响应不完整或无效。请重试；若仍失败，请减少天数或选择更简单的目的地。" },
  err_login_required: {
    IT: "Accedi per continuare.", EN: "Sign in to continue.", FR: "Connectez-vous pour continuer.",
    ES: "Inicia sesión para continuar.", DE: "Melde dich an, um fortzufahren.", RU: "Войдите, чтобы продолжить.", ZH: "请登录以继续。" },
  err_generation_failed: {
    IT: "Generazione non riuscita. Riprova tra poco.", EN: "Generation failed. Try again shortly.",
    FR: "Échec de la génération. Réessayez bientôt.", ES: "La generación ha fallado. Inténtalo en breve.",
    DE: "Generierung fehlgeschlagen. Versuche es gleich erneut.", RU: "Не удалось сгенерировать. Попробуйте чуть позже.", ZH: "生成失败，请稍后重试。" },
  library_cache_hit_free: {
    IT: "Trovato in biblioteca: nessun credito scalato.", EN: "Found in the library: no credits charged.",
    FR: "Trouvé dans la bibliothèque : aucun crédit débité.", ES: "Encontrado en la biblioteca: no se han descontado créditos.",
    DE: "In der Bibliothek gefunden: keine Credits abgebucht.", RU: "Найдено в библиотеке: кредиты не списаны.", ZH: "已在图书馆中找到：未扣除点数。" },
  replacing_stop: {
    IT: "Sostituisco la tappa…", EN: "Replacing stop…", FR: "Remplacement de l'étape…", ES: "Sustituyendo la parada…",
    DE: "Station wird ersetzt…", RU: "Замена остановки…", ZH: "正在替换行程点…" },
  prefill_applied_check_form: {
    IT: "applicato. Controlla il form e premi Genera.", EN: "applied. Check the form and press Generate.",
    FR: "appliqué. Vérifiez le formulaire et appuyez sur Générer.", ES: "aplicado. Revisa el formulario y pulsa Generar.",
    DE: "angewendet. Prüfe das Formular und tippe auf Erstellen.", RU: "применено. Проверьте форму и нажмите «Создать».", ZH: "已应用。请检查表单并点击“生成”。" },
  prefill_route_applied: {
    IT: "tappe caricate come roadtrip. Controlla il form e premi Genera.", EN: "stages loaded as a road trip. Check the form and press Generate.",
    FR: "étapes chargées en road trip. Vérifiez le formulaire et appuyez sur Générer.", ES: "etapas cargadas como roadtrip. Revisa el formulario y pulsa Generar.",
    DE: "Etappen als Roadtrip geladen. Prüfe das Formular und tippe auf Erstellen.", RU: "этапы загружены как автопутешествие. Проверьте форму и нажмите «Создать».", ZH: "行程段已作为公路旅行加载。请检查表单并点击“生成”。" },
  rain_plan_failed: {
    IT: "Piano B non riuscito", EN: "Plan B failed", FR: "Plan B échoué", ES: "El plan B ha fallado",
    DE: "Plan B fehlgeschlagen", RU: "План Б не удался", ZH: "备选方案失败" },
  saved_to_my_itineraries: {
    IT: "Salvato nei tuoi itinerari ✅ — guida premium, podcast e PDF sono già attivi.",
    EN: "Saved to your itineraries ✅ — premium guide, podcast and PDF are ready.",
    FR: "Enregistré dans vos itinéraires ✅ — guide premium, podcast et PDF sont prêts.",
    ES: "Guardado en tus itinerarios ✅ — guía premium, pódcast y PDF ya activos.",
    DE: "In deinen Routen gespeichert ✅ — Premium-Guide, Podcast und PDF sind bereit.",
    RU: "Сохранено в ваших маршрутах ✅ — премиум-гид, подкаст и PDF уже доступны.",
    ZH: "已保存到我的行程 ✅ — 高级指南、播客和 PDF 已可用。" },
  err_save_itinerary_retry: {
    IT: "Non sono riuscito a salvare l'itinerario: riprova tra poco.", EN: "Couldn't save the itinerary: try again shortly.",
    FR: "Impossible d'enregistrer l'itinéraire : réessayez bientôt.", ES: "No se ha podido guardar el itinerario: inténtalo en breve.",
    DE: "Die Route konnte nicht gespeichert werden: versuche es gleich erneut.", RU: "Не удалось сохранить маршрут: попробуйте чуть позже.", ZH: "无法保存行程，请稍后重试。" },
  mini_guide_daily_limit: {
    IT: "Hai già letto le mini-guide gratuite di 3 città oggi ✨ Torna domani per la prossima, o genera subito l'itinerario di questa.",
    EN: "You've already read today's 3 free mini-guides ✨ Come back tomorrow for the next one, or generate this city's itinerary now.",
    FR: "Vous avez déjà lu les 3 mini-guides gratuits du jour ✨ Revenez demain, ou générez tout de suite l'itinéraire de cette ville.",
    ES: "Ya has leído las 3 miniguías gratuitas de hoy ✨ Vuelve mañana o genera ahora el itinerario de esta ciudad.",
    DE: "Du hast die 3 kostenlosen Mini-Guides von heute schon gelesen ✨ Komm morgen wieder oder erstelle jetzt die Route dieser Stadt.",
    RU: "Вы уже прочитали 3 бесплатных мини-гида на сегодня ✨ Возвращайтесь завтра или создайте маршрут по этому городу сейчас.",
    ZH: "今天的 3 份免费迷你指南已读完 ✨ 明天再来，或立即生成这座城市的行程。" },
  rain_variant_applied: {
    IT: "Giornata sostituita con la variante al coperto. Pranzo e cena sono rimasti al loro posto.",
    EN: "Day replaced with the indoor variant. Lunch and dinner stayed where they were.",
    FR: "Journée remplacée par la variante en intérieur. Déjeuner et dîner sont restés en place.",
    ES: "Día sustituido por la variante a cubierto. Comida y cena siguen en su sitio.",
    DE: "Tag durch die Indoor-Variante ersetzt. Mittag- und Abendessen blieben an ihrem Platz.",
    RU: "День заменён на вариант в помещении. Обед и ужин остались на месте.",
    ZH: "已替换为室内方案，午餐和晚餐保持不变。" },
  choose_destination_first: {
    IT: "Scegli prima una destinazione dall'elenco", EN: "Pick a destination from the list first",
    FR: "Choisissez d'abord une destination dans la liste", ES: "Elige primero un destino de la lista",
    DE: "Wähle zuerst ein Ziel aus der Liste", RU: "Сначала выберите направление из списка", ZH: "请先从列表中选择目的地" },
  login_to_continue: {
    IT: "Accedi per continuare", EN: "Sign in to continue", FR: "Connectez-vous pour continuer", ES: "Inicia sesión para continuar",
    DE: "Melde dich an, um fortzufahren", RU: "Войдите, чтобы продолжить", ZH: "请登录以继续" },
  group_trip_title: {
    IT: "Viaggio di gruppo", EN: "Group trip", FR: "Voyage de groupe", ES: "Viaje en grupo", DE: "Gruppenreise", RU: "Групповая поездка", ZH: "团体旅行" },
  group_trip_desc: {
    IT: "Ognuno vota le sue preferenze via PIN, WIP le fonde in un itinerario per tutti.",
    EN: "Everyone votes their preferences via PIN, WIP merges them into one itinerary for all.",
    FR: "Chacun vote ses préférences via un PIN, WIP les fusionne en un itinéraire pour tous.",
    ES: "Cada uno vota sus preferencias con un PIN y WIP las fusiona en un itinerario para todos.",
    DE: "Alle stimmen per PIN ab, WIP verschmilzt die Wünsche zu einer Route für alle.",
    RU: "Каждый голосует через PIN, WIP объединяет предпочтения в один маршрут для всех.",
    ZH: "每个人通过 PIN 投票，WIP 将偏好融合为一份共同行程。" },
  library_card_title: {
    IT: "Libreria itinerari", EN: "Itinerary library", FR: "Bibliothèque d'itinéraires", ES: "Biblioteca de itinerarios",
    DE: "Routen-Bibliothek", RU: "Библиотека маршрутов", ZH: "行程图书馆" },
  library_card_desc: {
    IT: "Centinaia di itinerari pronti e verificati: porti, scali, cammini, cinema, fioriture… Gratis.",
    EN: "Hundreds of ready, verified itineraries: ports, layovers, pilgrim ways, cinema, blooms… Free.",
    FR: "Des centaines d'itinéraires prêts et vérifiés : ports, escales, chemins, cinéma, floraisons… Gratuit.",
    ES: "Cientos de itinerarios listos y verificados: puertos, escalas, caminos, cine, floraciones… Gratis.",
    DE: "Hunderte fertige, geprüfte Routen: Häfen, Zwischenstopps, Pilgerwege, Kino, Blüten… Kostenlos.",
    RU: "Сотни готовых проверенных маршрутов: порты, пересадки, паломнические пути, кино, цветение… Бесплатно.",
    ZH: "数百条现成且经过验证的行程：港口、中转、朝圣之路、电影、花季……免费。" },
  group_prefs_applied: {
    IT: "Preferenze del gruppo applicate: controlla il form e premi Genera.", EN: "Group preferences applied: check the form and press Generate.",
    FR: "Préférences du groupe appliquées : vérifiez le formulaire et appuyez sur Générer.", ES: "Preferencias del grupo aplicadas: revisa el formulario y pulsa Generar.",
    DE: "Gruppenwünsche übernommen: prüfe das Formular und tippe auf Erstellen.", RU: "Предпочтения группы применены: проверьте форму и нажмите «Создать».", ZH: "已应用团队偏好，请检查表单并点击“生成”。" },
  seasonal_inspirations_label: {
    IT: "Ispirazioni di stagione", EN: "Seasonal inspirations", FR: "Inspirations de saison", ES: "Inspiraciones de temporada",
    DE: "Saisonale Inspirationen", RU: "Сезонные идеи", ZH: "当季灵感" },
  no_inspiration_for_filter: {
    IT: "Nessuna ispirazione per questo filtro nel periodo.", EN: "No inspirations for this filter in this period.",
    FR: "Aucune inspiration pour ce filtre à cette période.", ES: "Sin inspiraciones para este filtro en este periodo.",
    DE: "Keine Inspirationen für diesen Filter in diesem Zeitraum.", RU: "Нет идей для этого фильтра в этот период.", ZH: "此时段下该筛选无灵感。" },
  special_itineraries_label: {
    IT: "Itinerari speciali", EN: "Special itineraries", FR: "Itinéraires spéciaux", ES: "Itinerarios especiales",
    DE: "Besondere Routen", RU: "Особые маршруты", ZH: "特色行程" },
  short_stop_label: {
    IT: "Sosta breve", EN: "Short stop", FR: "Escale courte", ES: "Parada breve", DE: "Kurzer Stopp", RU: "Короткая остановка", ZH: "短暂停留" },
  taste_routes_label: {
    IT: "Strade del vino e del gusto", EN: "Wine and food routes", FR: "Routes du vin et du goût", ES: "Rutas del vino y del sabor",
    DE: "Wein- und Genussstraßen", RU: "Винные и гастрономические маршруты", ZH: "美酒美食之路" },
  thematic_trips_label: {
    IT: "Viaggi tematici", EN: "Themed trips", FR: "Voyages thématiques", ES: "Viajes temáticos", DE: "Themenreisen", RU: "Тематические поездки", ZH: "主题旅行" },
  roadtrip_hint: {
    IT: "Roadtrip multi-città: i giorni verranno ripartiti tra le città e i trasferimenti diventano tappe con km e tempi reali. In auto tieni attiva l'audioguida GPS: i luoghi lungo il percorso si raccontano da soli.",
    EN: "Multi-city road trip: days are split between cities and transfers become stops with real km and times. Keep the GPS audio guide on in the car: places along the way tell their own story.",
    FR: "Road trip multi-villes : les jours sont répartis entre les villes et les transferts deviennent des étapes avec km et temps réels. En voiture, gardez l'audioguide GPS actif : les lieux sur la route se racontent d'eux-mêmes.",
    ES: "Roadtrip multiciudad: los días se reparten entre ciudades y los traslados se convierten en paradas con km y tiempos reales. En el coche mantén activa la audioguía GPS: los lugares del camino se cuentan solos.",
    DE: "Roadtrip über mehrere Städte: die Tage werden auf die Städte verteilt, Transfers werden zu Stationen mit echten km und Zeiten. Lass im Auto den GPS-Audioguide an: die Orte am Weg erzählen sich selbst.",
    RU: "Автопутешествие по нескольким городам: дни распределяются между городами, переезды становятся остановками с реальными км и временем. В машине держите GPS-аудиогид включённым: места по пути расскажут о себе сами.",
    ZH: "多城市公路旅行：天数在城市间分配，转移成为带真实公里数和时间的行程点。开车时请保持 GPS 语音导览开启：沿途景点会自动讲述。" },
  mini_guide_free_hint: {
    IT: "Mini-guida gratuita, da leggere subito", EN: "Free mini-guide, read it now", FR: "Mini-guide gratuit, à lire tout de suite",
    ES: "Miniguía gratuita, para leer ahora", DE: "Kostenloser Mini-Guide, sofort lesbar", RU: "Бесплатный мини-гид, читайте сейчас", ZH: "免费迷你指南，立即阅读" },
  placeholder_destination_example: {
    IT: "Es: Firenze, Roma...", EN: "E.g. Florence, Rome...", FR: "Ex : Florence, Rome...", ES: "Ej.: Florencia, Roma...",
    DE: "Z. B. Florenz, Rom...", RU: "Напр.: Флоренция, Рим...", ZH: "例如：佛罗伦萨、罗马……" },
  rain_variant_tooltip: {
    IT: "Variante al coperto: musei, chiese e gallerie al posto delle tappe all'aperto, pranzo e cena invariati",
    EN: "Indoor variant: museums, churches and galleries instead of outdoor stops, lunch and dinner unchanged",
    FR: "Variante en intérieur : musées, églises et galeries à la place des étapes en plein air, déjeuner et dîner inchangés",
    ES: "Variante a cubierto: museos, iglesias y galerías en lugar de las paradas al aire libre, comida y cena sin cambios",
    DE: "Indoor-Variante: Museen, Kirchen und Galerien statt Stationen im Freien, Mittag- und Abendessen unverändert",
    RU: "Вариант в помещении: музеи, церкви и галереи вместо остановок на открытом воздухе, обед и ужин без изменений",
    ZH: "室内方案：以博物馆、教堂和画廊替代户外行程点，午餐和晚餐不变" },
  resume: { IT: "Riprendi", EN: "Resume", FR: "Reprendre", ES: "Reanudar", DE: "Fortsetzen", RU: "Продолжить", ZH: "继续" },
  pause: { IT: "Pausa", EN: "Pause", FR: "Pause", ES: "Pausa", DE: "Pause", RU: "Пауза", ZH: "暂停" },
  stop: { IT: "Stop", EN: "Stop", FR: "Stop", ES: "Detener", DE: "Stopp", RU: "Стоп", ZH: "停止" },
  replay_from_start: {
    IT: "Riascolta dall'inizio", EN: "Replay from the start", FR: "Réécouter depuis le début", ES: "Volver a escuchar desde el inicio",
    DE: "Von vorn anhören", RU: "Прослушать с начала", ZH: "从头重播" },
  no_tours_viator: {
    IT: "Nessun tour Viator trovato.", EN: "No Viator tours found.", FR: "Aucun tour Viator trouvé.", ES: "No se han encontrado tours de Viator.",
    DE: "Keine Viator-Touren gefunden.", RU: "Туры Viator не найдены.", ZH: "未找到 Viator 行程。" },
  no_tours_gyg: {
    IT: "Nessun tour GetYourGuide trovato.", EN: "No GetYourGuide tours found.", FR: "Aucun tour GetYourGuide trouvé.", ES: "No se han encontrado tours de GetYourGuide.",
    DE: "Keine GetYourGuide-Touren gefunden.", RU: "Туры GetYourGuide не найдены.", ZH: "未找到 GetYourGuide 行程。" },
  no_events_ticketmaster: {
    IT: "Nessun evento Ticketmaster trovato.", EN: "No Ticketmaster events found.", FR: "Aucun événement Ticketmaster trouvé.", ES: "No se han encontrado eventos de Ticketmaster.",
    DE: "Keine Ticketmaster-Events gefunden.", RU: "События Ticketmaster не найдены.", ZH: "未找到 Ticketmaster 活动。" },
  no_tickets_tiqets: {
    IT: "Nessun biglietto Tiqets trovato.", EN: "No Tiqets tickets found.", FR: "Aucun billet Tiqets trouvé.", ES: "No se han encontrado entradas de Tiqets.",
    DE: "Keine Tiqets-Tickets gefunden.", RU: "Билеты Tiqets не найдены.", ZH: "未找到 Tiqets 门票。" },
  search_nearby_city: {
    IT: "Cerca una città vicina…", EN: "Search a nearby city…", FR: "Chercher une ville proche…", ES: "Busca una ciudad cercana…",
    DE: "Stadt in der Nähe suchen…", RU: "Найти город поблизости…", ZH: "搜索附近城市…" },
  day_theme: { IT: "Tema del giorno", EN: "Theme of the day", FR: "Thème du jour", ES: "Tema del día", DE: "Thema des Tages", RU: "Тема дня", ZH: "今日主题" },
  rain_preview_desc: {
    IT: "Pranzo e cena restano invariati; le visite all'aperto sono sostituite da alternative al coperto.",
    EN: "Lunch and dinner stay the same; outdoor visits are replaced by indoor alternatives.",
    FR: "Déjeuner et dîner inchangés ; les visites en plein air sont remplacées par des alternatives en intérieur.",
    ES: "Comida y cena no cambian; las visitas al aire libre se sustituyen por alternativas a cubierto.",
    DE: "Mittag- und Abendessen bleiben; Besuche im Freien werden durch Indoor-Alternativen ersetzt.",
    RU: "Обед и ужин без изменений; прогулки на открытом воздухе заменены вариантами в помещении.",
    ZH: "午餐和晚餐不变；户外参观替换为室内方案。" },
  apply_variant: { IT: "Applica variante", EN: "Apply variant", FR: "Appliquer la variante", ES: "Aplicar variante", DE: "Variante übernehmen", RU: "Применить вариант", ZH: "应用方案" },
  generate_plan_first_guide: {
    IT: "Genera prima l'itinerario: a piano pronto troverai la Guida d'Autore completa 📖",
    EN: "Generate the itinerary first: once it's ready you'll find the full Author's Guide 📖",
    FR: "Générez d'abord l'itinéraire : une fois prêt, vous trouverez le Guide d'auteur complet 📖",
    ES: "Genera primero el itinerario: con el plan listo encontrarás la Guía de Autor completa 📖",
    DE: "Erstelle zuerst die Route: sobald sie fertig ist, findest du den kompletten Autoren-Guide 📖",
    RU: "Сначала создайте маршрут: когда он будет готов, появится полный Авторский гид 📖",
    ZH: "请先生成行程：计划就绪后即可查看完整的作者指南 📖" },

  // ── Guida Premium: renderer PDF (pg_*) ───────────────────────────────
  pg_premium_guide: { IT: "Guida Premium", EN: "Premium Guide", FR: "Guide Premium", ES: "Guía Premium", DE: "Premium-Guide", RU: "Премиум-гид", ZH: "高级指南" },
  pg_dedication: { IT: "Dedica", EN: "Dedication", FR: "Dédicace", ES: "Dedicatoria", DE: "Widmung", RU: "Посвящение", ZH: "题词" },
  pg_toc: { IT: "Sommario", EN: "Contents", FR: "Sommaire", ES: "Índice", DE: "Inhalt", RU: "Содержание", ZH: "目录" },
  pg_toc_sub: { IT: "Indice della guida", EN: "Guide index", FR: "Index du guide", ES: "Índice de la guía", DE: "Verzeichnis des Guides", RU: "Указатель гида", ZH: "指南索引" },
  pg_day: { IT: "Giorno", EN: "Day", FR: "Jour", ES: "Día", DE: "Tag", RU: "День", ZH: "第天" },
  pg_poi: { IT: "Punto di interesse", EN: "Point of interest", FR: "Point d'intérêt", ES: "Punto de interés", DE: "Sehenswürdigkeit", RU: "Достопримечательность", ZH: "景点" },
  pg_discover_destination: { IT: "Scopri la destinazione", EN: "Discover the destination", FR: "Découvrez la destination", ES: "Descubre el destino", DE: "Entdecke das Ziel", RU: "Откройте направление", ZH: "探索目的地" },
  pg_history: { IT: "Storia & Identità", EN: "History & Identity", FR: "Histoire & Identité", ES: "Historia e identidad", DE: "Geschichte & Identität", RU: "История и идентичность", ZH: "历史与身份" },
  pg_culture: { IT: "Cultura & Tradizioni", EN: "Culture & Traditions", FR: "Culture & Traditions", ES: "Cultura y tradiciones", DE: "Kultur & Traditionen", RU: "Культура и традиции", ZH: "文化与传统" },
  pg_practical_tips: { IT: "Consigli pratici", EN: "Practical tips", FR: "Conseils pratiques", ES: "Consejos prácticos", DE: "Praktische Tipps", RU: "Практические советы", ZH: "实用建议" },
  pg_address: { IT: "Indirizzo", EN: "Address", FR: "Adresse", ES: "Dirección", DE: "Adresse", RU: "Адрес", ZH: "地址" },
  pg_how_to_get: { IT: "Come arrivare", EN: "Getting there", FR: "Comment s'y rendre", ES: "Cómo llegar", DE: "Anreise", RU: "Как добраться", ZH: "如何到达" },
  pg_hours: { IT: "Orari", EN: "Opening hours", FR: "Horaires", ES: "Horarios", DE: "Öffnungszeiten", RU: "Часы работы", ZH: "开放时间" },
  pg_admission: { IT: "Ingresso", EN: "Admission", FR: "Entrée", ES: "Entrada", DE: "Eintritt", RU: "Вход", ZH: "门票" },
  pg_best_time: { IT: "Momento ideale", EN: "Best time", FR: "Meilleur moment", ES: "Mejor momento", DE: "Beste Zeit", RU: "Лучшее время", ZH: "最佳时间" },
  pg_contacts: { IT: "Contatti", EN: "Contacts", FR: "Contacts", ES: "Contactos", DE: "Kontakt", RU: "Контакты", ZH: "联系方式" },
  pg_curiosities: { IT: "Lo sapevi? Curiosità & Segreti", EN: "Did you know? Curiosities & Secrets", FR: "Le saviez-vous ? Curiosités & Secrets", ES: "¿Sabías que…? Curiosidades y secretos", DE: "Wusstest du? Kurioses & Geheimnisse", RU: "Знаете ли вы? Факты и секреты", ZH: "你知道吗？趣闻与秘密" },
  pg_historical_detail: { IT: "Dettaglio storico & architettonico", EN: "Historical & architectural detail", FR: "Détail historique & architectural", ES: "Detalle histórico y arquitectónico", DE: "Historisches & architektonisches Detail", RU: "Исторические и архитектурные детали", ZH: "历史与建筑细节" },
  pg_insider_tip: { IT: "Consiglio insider", EN: "Insider tip", FR: "Conseil d'initié", ES: "Consejo de experto", DE: "Insider-Tipp", RU: "Совет знатока", ZH: "内行建议" },
  pg_must_order: { IT: "Da ordinare assolutamente", EN: "Must-order dishes", FR: "À commander absolument", ES: "Imprescindible pedir", DE: "Unbedingt bestellen", RU: "Обязательно закажите", ZH: "必点菜品" },
  pg_back_cover_tagline: { IT: "La tua guida di viaggio intelligente.", EN: "Your smart travel guide.", FR: "Votre guide de voyage intelligent.", ES: "Tu guía de viaje inteligente.", DE: "Dein smarter Reiseführer.", RU: "Ваш умный путеводитель.", ZH: "您的智能旅行指南。" },
  pg_back_cover_sources: { IT: "Generata con Wikipedia, Wikivoyage, Foursquare e TripAdvisor.", EN: "Generated with Wikipedia, Wikivoyage, Foursquare and TripAdvisor.", FR: "Générée avec Wikipedia, Wikivoyage, Foursquare et TripAdvisor.", ES: "Generada con Wikipedia, Wikivoyage, Foursquare y TripAdvisor.", DE: "Erstellt mit Wikipedia, Wikivoyage, Foursquare und TripAdvisor.", RU: "Создано с помощью Wikipedia, Wikivoyage, Foursquare и TripAdvisor.", ZH: "基于 Wikipedia、Wikivoyage、Foursquare 和 TripAdvisor 生成。" },

  // ── Guida Premium: modale ────────────────────────────────────────────
  premium_guide_share_text: { IT: "Guarda la mia Guida Premium per", EN: "Check out my Premium Guide for", FR: "Découvrez mon Guide Premium pour", ES: "Mira mi Guía Premium de", DE: "Schau dir meinen Premium-Guide für", RU: "Посмотрите мой премиум-гид по", ZH: "看看我的高级指南：" },
  link_copied: { IT: "Link copiato negli appunti!", EN: "Link copied to clipboard!", FR: "Lien copié dans le presse-papiers !", ES: "¡Enlace copiado al portapapeles!", DE: "Link in die Zwischenablage kopiert!", RU: "Ссылка скопирована!", ZH: "链接已复制到剪贴板！" },
  premium_guide_podcast: { IT: "Podcast della Guida", EN: "Guide Podcast", FR: "Podcast du Guide", ES: "Pódcast de la Guía", DE: "Guide-Podcast", RU: "Подкаст гида", ZH: "指南播客" },
  podcast_generation_failed: { IT: "Errore nella generazione del podcast. Nessun credito è stato scalato.", EN: "Podcast generation failed. No credits were charged.", FR: "Échec de la génération du podcast. Aucun crédit débité.", ES: "Error al generar el pódcast. No se han descontado créditos.", DE: "Podcast-Erstellung fehlgeschlagen. Keine Credits abgebucht.", RU: "Не удалось создать подкаст. Кредиты не списаны.", ZH: "播客生成失败，未扣除点数。" },
  epub_export_failed: { IT: "Export EPUB non riuscito. Riprova.", EN: "EPUB export failed. Try again.", FR: "Échec de l'export EPUB. Réessayez.", ES: "La exportación EPUB ha fallado. Inténtalo de nuevo.", DE: "EPUB-Export fehlgeschlagen. Versuche es erneut.", RU: "Экспорт EPUB не удался. Попробуйте снова.", ZH: "EPUB 导出失败，请重试。" },
  file_saved: { IT: "File salvato.", EN: "File saved.", FR: "Fichier enregistré.", ES: "Archivo guardado.", DE: "Datei gespeichert.", RU: "Файл сохранён.", ZH: "文件已保存。" },
  dedication_optional: { IT: "Dedica (opzionale)", EN: "Dedication (optional)", FR: "Dédicace (facultatif)", ES: "Dedicatoria (opcional)", DE: "Widmung (optional)", RU: "Посвящение (необязательно)", ZH: "题词（可选）" },
  dedication_placeholder: { IT: "Es. \"A Maria, per i tuoi 50 anni — Fabrizio\"", EN: "E.g. \"To Maria, for your 50th — Fabrizio\"", FR: "Ex. « À Maria, pour tes 50 ans — Fabrizio »", ES: "Ej. \"Para María, por tus 50 años — Fabrizio\"", DE: "Z. B. \"Für Maria, zum 50. — Fabrizio\"", RU: "Напр. «Марии, на 50-летие — Фабрицио»", ZH: "例如：“献给玛丽亚，五十岁生日快乐 — 法布里奇奥”" },
  dedication_hint: { IT: "Appare in copertina con stile elegante: perfetta per la guida-regalo. Costo invariato.", EN: "Shown on the cover in an elegant style: perfect for a gift guide. Same price.", FR: "Apparaît en couverture avec élégance : parfait pour un guide-cadeau. Prix inchangé.", ES: "Aparece en la portada con estilo elegante: perfecta para regalar. Mismo precio.", DE: "Erscheint elegant auf dem Cover: perfekt als Geschenk-Guide. Gleicher Preis.", RU: "Элегантно размещается на обложке: идеально для гида в подарок. Цена та же.", ZH: "以优雅风格显示在封面上：适合作为礼物。价格不变。" },
  oops: { IT: "Ops!", EN: "Oops!", FR: "Oups !", ES: "¡Vaya!", DE: "Hoppla!", RU: "Упс!", ZH: "哎呀！" },
  share_guide: { IT: "Condividi guida", EN: "Share guide", FR: "Partager le guide", ES: "Compartir guía", DE: "Guide teilen", RU: "Поделиться гидом", ZH: "分享指南" },
  playing: { IT: "In riproduzione", EN: "Playing", FR: "Lecture en cours", ES: "Reproduciendo", DE: "Wird abgespielt", RU: "Воспроизведение", ZH: "播放中" },
  epub_download_hint: { IT: "Scarica la guida in formato EPUB (gratuito)", EN: "Download the guide as EPUB (free)", FR: "Télécharger le guide en EPUB (gratuit)", ES: "Descargar la guía en EPUB (gratis)", DE: "Guide als EPUB herunterladen (kostenlos)", RU: "Скачать гид в формате EPUB (бесплатно)", ZH: "下载 EPUB 格式指南（免费）" },

  // ── Libreria itinerari (lib_*) ───────────────────────────────────────
  lib_title: { IT: "Libreria itinerari", EN: "Itinerary library", FR: "Bibliothèque d'itinéraires", ES: "Biblioteca de itinerarios", DE: "Routen-Bibliothek", RU: "Библиотека маршрутов", ZH: "行程图书馆" },
  lib_server_down: { IT: "La libreria non risponde in questo momento: riprova tra poco.", EN: "The library isn't responding right now: try again shortly.", FR: "La bibliothèque ne répond pas pour le moment : réessayez bientôt.", ES: "La biblioteca no responde ahora mismo: inténtalo en breve.", DE: "Die Bibliothek antwortet gerade nicht: versuche es gleich erneut.", RU: "Библиотека сейчас не отвечает: попробуйте чуть позже.", ZH: "图书馆暂时无响应，请稍后重试。" },
  lib_open_failed: { IT: "Impossibile aprire questo itinerario ora: riprova tra poco.", EN: "Can't open this itinerary right now: try again shortly.", FR: "Impossible d'ouvrir cet itinéraire pour le moment : réessayez bientôt.", ES: "No se puede abrir este itinerario ahora: inténtalo en breve.", DE: "Diese Route lässt sich gerade nicht öffnen: versuche es gleich erneut.", RU: "Не удалось открыть маршрут: попробуйте чуть позже.", ZH: "暂时无法打开此行程，请稍后重试。" },
  lib_generating: { IT: "Genero l'itinerario…", EN: "Generating the itinerary…", FR: "Génération de l'itinéraire…", ES: "Generando el itinerario…", DE: "Route wird erstellt…", RU: "Создаю маршрут…", ZH: "正在生成行程…" },
  lib_still_working: { IT: "Ci sto ancora lavorando: riapri la libreria tra un minuto, lo troverai pronto.", EN: "Still working on it: reopen the library in a minute, it'll be ready.", FR: "J'y travaille encore : rouvrez la bibliothèque dans une minute, il sera prêt.", ES: "Sigo trabajando: vuelve a abrir la biblioteca en un minuto y lo encontrarás listo.", DE: "Ich arbeite noch daran: öffne die Bibliothek in einer Minute erneut, dann ist sie fertig.", RU: "Ещё работаю: откройте библиотеку через минуту, маршрут будет готов.", ZH: "仍在处理中：一分钟后重新打开图书馆即可。" },
  lib_network_missing: { IT: "Rete assente: controlla la connessione e riprova.", EN: "No network: check your connection and try again.", FR: "Pas de réseau : vérifiez la connexion et réessayez.", ES: "Sin red: comprueba la conexión e inténtalo de nuevo.", DE: "Kein Netz: prüfe die Verbindung und versuche es erneut.", RU: "Нет сети: проверьте соединение и попробуйте снова.", ZH: "无网络：请检查连接后重试。" },
  lib_still_waiting: { IT: "Ci vuole ancora un momento, resto in attesa…", EN: "Just a little longer, still waiting…", FR: "Encore un instant, j'attends…", ES: "Un momento más, sigo esperando…", DE: "Noch einen Moment, ich warte…", RU: "Ещё немного, жду…", ZH: "还需一点时间，请稍候…" },
  lib_preparing: { IT: "Sto preparando l'itinerario, ~1 minuto…", EN: "Preparing the itinerary, ~1 minute…", FR: "Préparation de l'itinéraire, ~1 minute…", ES: "Preparando el itinerario, ~1 minuto…", DE: "Route wird vorbereitet, ~1 Minute…", RU: "Готовлю маршрут, ~1 минута…", ZH: "正在准备行程，约 1 分钟…" },
  lib_generation_failed: { IT: "Generazione non riuscita: riprova tra poco.", EN: "Generation failed: try again shortly.", FR: "Échec de la génération : réessayez bientôt.", ES: "La generación ha fallado: inténtalo en breve.", DE: "Generierung fehlgeschlagen: versuche es gleich erneut.", RU: "Не удалось создать: попробуйте чуть позже.", ZH: "生成失败，请稍后重试。" },
  lib_login_required: { IT: "Accedi per generare questo itinerario: è gratis, basta un account.", EN: "Log in to generate this itinerary: it's free, you just need an account.", FR: "Connectez-vous pour générer cet itinéraire : c'est gratuit, un compte suffit.", ES: "Inicia sesión para generar este itinerario: es gratis, solo necesitas una cuenta.", DE: "Melde dich an, um diese Route zu erstellen: kostenlos, es genügt ein Konto.", RU: "Войдите, чтобы создать этот маршрут: это бесплатно, нужен только аккаунт.", ZH: "登录后即可生成此行程：免费，只需一个账户。" },
  lib_generated_empty: { IT: "L'itinerario generato è vuoto: riprova.", EN: "The generated itinerary is empty: try again.", FR: "L'itinéraire généré est vide : réessayez.", ES: "El itinerario generado está vacío: inténtalo de nuevo.", DE: "Die erstellte Route ist leer: versuche es erneut.", RU: "Созданный маршрут пуст: попробуйте снова.", ZH: "生成的行程为空，请重试。" },
  lib_searching_as: { IT: "Cerco i luoghi di", EN: "Looking for the places of", FR: "Je cherche les lieux de", ES: "Busco los lugares de", DE: "Suche die Orte von", RU: "Ищу места из", ZH: "正在查找相关地点：" },
  lib_building_on_real_places: { IT: "Sto costruendo l'itinerario sui luoghi veri, ~1 minuto…", EN: "Building the itinerary on real places, ~1 minute…", FR: "Je construis l'itinéraire sur des lieux réels, ~1 minute…", ES: "Construyendo el itinerario sobre lugares reales, ~1 minuto…", DE: "Route aus echten Orten wird gebaut, ~1 Minute…", RU: "Строю маршрут по реальным местам, ~1 минута…", ZH: "正在基于真实地点构建行程，约 1 分钟…" },
  lib_places_not_documented: { IT: "i luoghi non sono documentati o sono troppo sparsi per farne un itinerario. Prova con un altro nome.", EN: "the places aren't documented or are too scattered for an itinerary. Try another name.", FR: "les lieux ne sont pas documentés ou trop dispersés pour un itinéraire. Essayez un autre nom.", ES: "los lugares no están documentados o están demasiado dispersos para un itinerario. Prueba con otro nombre.", DE: "die Orte sind nicht dokumentiert oder zu verstreut für eine Route. Versuche einen anderen Namen.", RU: "места не задокументированы или слишком разбросаны для маршрута. Попробуйте другое название.", ZH: "相关地点没有记录或过于分散，无法构成行程。请尝试其他名称。" },
  lib_search_failed: { IT: "Ricerca non riuscita: riprova.", EN: "Search failed: try again.", FR: "Échec de la recherche : réessayez.", ES: "La búsqueda ha fallado: inténtalo de nuevo.", DE: "Suche fehlgeschlagen: versuche es erneut.", RU: "Поиск не удался: попробуйте снова.", ZH: "搜索失败，请重试。" },
  lib_verified_by: { IT: "Verificato da", EN: "Verified by", FR: "Vérifié par", ES: "Verificado por", DE: "Geprüft von", RU: "Проверено", ZH: "已验证：" },
  lib_back_to_results: { IT: "Torna ai risultati", EN: "Back to results", FR: "Retour aux résultats", ES: "Volver a los resultados", DE: "Zurück zu den Ergebnissen", RU: "К результатам", ZH: "返回结果" },
  lib_opening: { IT: "Apro l'itinerario…", EN: "Opening the itinerary…", FR: "Ouverture de l'itinéraire…", ES: "Abriendo el itinerario…", DE: "Route wird geöffnet…", RU: "Открываю маршрут…", ZH: "正在打开行程…" },
  lib_from_previous_stop: { IT: "dalla tappa precedente", EN: "from the previous stop", FR: "depuis l'étape précédente", ES: "desde la parada anterior", DE: "von der vorherigen Station", RU: "от предыдущей остановки", ZH: "距上一行程点" },
  lib_search_placeholder: { IT: "Cerca città, porto, tema…", EN: "Search city, port, theme…", FR: "Chercher ville, port, thème…", ES: "Busca ciudad, puerto, tema…", DE: "Stadt, Hafen, Thema suchen…", RU: "Город, порт, тема…", ZH: "搜索城市、港口、主题…" },
  lib_intro: { IT: "Centinaia di itinerari pronti, già controllati da due AI indipendenti. Usarli è gratis.", EN: "Hundreds of ready itineraries, already checked by two independent AIs. Using them is free.", FR: "Des centaines d'itinéraires prêts, déjà vérifiés par deux IA indépendantes. Gratuit.", ES: "Cientos de itinerarios listos, ya revisados por dos IA independientes. Usarlos es gratis.", DE: "Hunderte fertige Routen, bereits von zwei unabhängigen KIs geprüft. Die Nutzung ist kostenlos.", RU: "Сотни готовых маршрутов, проверенных двумя независимыми ИИ. Использование бесплатно.", ZH: "数百条现成行程，已由两个独立 AI 核验。免费使用。" },
  lib_all: { IT: "Tutti", EN: "All", FR: "Tous", ES: "Todos", DE: "Alle", RU: "Все", ZH: "全部" },
  lib_hours_per_stop: { IT: "Ore per sosta", EN: "Hours per stop", FR: "Heures par escale", ES: "Horas por parada", DE: "Stunden pro Stopp", RU: "Часов на остановку", ZH: "每次停留时长" },
  lib_hours_all: { IT: "Ore sosta: tutte", EN: "Stop hours: all", FR: "Heures d'escale : toutes", ES: "Horas de parada: todas", DE: "Stopp-Stunden: alle", RU: "Часы стоянки: все", ZH: "停留时长：全部" },
  lib_up_to: { IT: "fino a", EN: "up to", FR: "jusqu'à", ES: "hasta", DE: "bis zu", RU: "до", ZH: "最多" },
  lib_days_all: { IT: "Giorni: tutti", EN: "Days: all", FR: "Jours : tous", ES: "Días: todos", DE: "Tage: alle", RU: "Дни: все", ZH: "天数：全部" },
  lib_remove_city_filter: { IT: "Rimuovi il filtro città", EN: "Remove the city filter", FR: "Retirer le filtre ville", ES: "Quitar el filtro de ciudad", DE: "Stadtfilter entfernen", RU: "Убрать фильтр города", ZH: "移除城市筛选" },
  lib_browsing: { IT: "Sfoglio la libreria…", EN: "Browsing the library…", FR: "Je parcours la bibliothèque…", ES: "Hojeando la biblioteca…", DE: "Bibliothek wird durchsucht…", RU: "Просматриваю библиотеку…", ZH: "正在浏览图书馆…" },
  lib_ready: { IT: "Pronto", EN: "Ready", FR: "Prêt", ES: "Listo", DE: "Fertig", RU: "Готов", ZH: "就绪" },
  lib_one_minute: { IT: "1 minuto", EN: "1 minute", FR: "1 minute", ES: "1 minuto", DE: "1 Minute", RU: "1 минута", ZH: "1 分钟" },
  lib_generate: { IT: "Genera", EN: "Generate", FR: "Générer", ES: "Generar", DE: "Erstellen", RU: "Создать", ZH: "生成" },
  lib_search_as: { IT: "Cerca", EN: "Search", FR: "Chercher", ES: "Buscar", DE: "Suchen", RU: "Искать", ZH: "搜索" },
  lib_real_places_note: { IT: "Itinerario sui luoghi veri (riprese, ambientazioni, opere, eventi o venue), verificati su Wikidata.", EN: "Itinerary on real places (shoots, settings, works, events or venues), verified on Wikidata.", FR: "Itinéraire sur des lieux réels (tournages, décors, œuvres, événements ou salles), vérifiés sur Wikidata.", ES: "Itinerario sobre lugares reales (rodajes, escenarios, obras, eventos o sedes), verificados en Wikidata.", DE: "Route über echte Orte (Drehorte, Schauplätze, Werke, Events oder Venues), geprüft auf Wikidata.", RU: "Маршрут по реальным местам (съёмки, локации, произведения, события или площадки), проверенным в Wikidata.", ZH: "基于真实地点（拍摄地、场景、作品、活动或场馆）的行程，已在 Wikidata 核验。" },
  lib_no_results: { IT: "Nessun itinerario per questa ricerca. Prova con un'altra città o togli qualche filtro.", EN: "No itineraries for this search. Try another city or remove some filters.", FR: "Aucun itinéraire pour cette recherche. Essayez une autre ville ou retirez des filtres.", ES: "Ningún itinerario para esta búsqueda. Prueba con otra ciudad o quita algún filtro.", DE: "Keine Routen für diese Suche. Versuche eine andere Stadt oder entferne Filter.", RU: "Маршрутов не найдено. Попробуйте другой город или уберите фильтры.", ZH: "没有符合的行程。请尝试其他城市或减少筛选条件。" },
  lib_saving: { IT: "Lo salvo nei tuoi itinerari…", EN: "Saving to your itineraries…", FR: "Enregistrement dans vos itinéraires…", ES: "Guardando en tus itinerarios…", DE: "Wird in deinen Routen gespeichert…", RU: "Сохраняю в ваши маршруты…", ZH: "正在保存到我的行程…" },
  lib_use_free: { IT: "Usa questo itinerario (gratis)", EN: "Use this itinerary (free)", FR: "Utiliser cet itinéraire (gratuit)", ES: "Usar este itinerario (gratis)", DE: "Diese Route verwenden (kostenlos)", RU: "Использовать маршрут (бесплатно)", ZH: "使用此行程（免费）" },
  lib_use_hint: { IT: "Si salva nei tuoi itinerari: guida premium, podcast e PDF funzionano come su ogni itinerario.", EN: "It's saved to your itineraries: premium guide, podcast and PDF work like on any itinerary.", FR: "Il est enregistré dans vos itinéraires : guide premium, podcast et PDF fonctionnent comme pour tout itinéraire.", ES: "Se guarda en tus itinerarios: guía premium, pódcast y PDF funcionan como en cualquier itinerario.", DE: "Wird in deinen Routen gespeichert: Premium-Guide, Podcast und PDF funktionieren wie bei jeder Route.", RU: "Сохраняется в ваши маршруты: премиум-гид, подкаст и PDF работают как обычно.", ZH: "保存到我的行程后，高级指南、播客和 PDF 均可正常使用。" },

  // ── Cammini e pellegrinaggi (pw_*) ───────────────────────────────────
  pw_title: { IT: "Cammini e pellegrinaggi", EN: "Pilgrim ways & trails", FR: "Chemins et pèlerinages", ES: "Caminos y peregrinaciones", DE: "Pilgerwege", RU: "Паломнические пути", ZH: "朝圣之路" },
  pw_search_placeholder: { IT: "Cerca un cammino nel mondo…", EN: "Search a trail worldwide…", FR: "Chercher un chemin dans le monde…", ES: "Busca un camino en el mundo…", DE: "Pilgerweg weltweit suchen…", RU: "Найти путь в мире…", ZH: "搜索世界各地的步道…" },
  pw_intro: { IT: "Un passo alla volta: tappe, alloggi e timbri già pensati. La strada è la meta.", EN: "One step at a time: stages, lodging and stamps already planned. The road is the destination.", FR: "Un pas à la fois : étapes, hébergements et tampons déjà prévus. Le chemin est la destination.", ES: "Paso a paso: etapas, alojamientos y sellos ya pensados. El camino es la meta.", DE: "Schritt für Schritt: Etappen, Unterkünfte und Stempel schon geplant. Der Weg ist das Ziel.", RU: "Шаг за шагом: этапы, ночлег и печати уже продуманы. Дорога и есть цель.", ZH: "一步一步来：路段、住宿和印章已规划好。路途即目的地。" },
  pw_filter_continent: { IT: "Filtra per continente", EN: "Filter by continent", FR: "Filtrer par continent", ES: "Filtrar por continente", DE: "Nach Kontinent filtern", RU: "Фильтр по континенту", ZH: "按大洲筛选" },
  pw_anywhere: { IT: "Ovunque", EN: "Anywhere", FR: "Partout", ES: "Cualquier lugar", DE: "Überall", RU: "Везде", ZH: "任何地方" },
  pw_any_duration: { IT: "Ogni durata", EN: "Any duration", FR: "Toute durée", ES: "Cualquier duración", DE: "Jede Dauer", RU: "Любая длительность", ZH: "任意时长" },
  pw_any_pace: { IT: "Ogni passo", EN: "Any pace", FR: "Tout rythme", ES: "Cualquier ritmo", DE: "Jedes Tempo", RU: "Любой темп", ZH: "任意强度" },
  pw_diff_facile: { IT: "Facile", EN: "Easy", FR: "Facile", ES: "Fácil", DE: "Leicht", RU: "Лёгкий", ZH: "简单" },
  pw_diff_media: { IT: "Media", EN: "Moderate", FR: "Moyenne", ES: "Media", DE: "Mittel", RU: "Средний", ZH: "中等" },
  pw_diff_impegnativa: { IT: "Impegnativa", EN: "Demanding", FR: "Exigeante", ES: "Exigente", DE: "Anspruchsvoll", RU: "Сложный", ZH: "困难" },
  pw_editorial: { IT: "Redazione", EN: "Editorial", FR: "Rédaction", ES: "Redacción", DE: "Redaktion", RU: "Редакция", ZH: "编辑精选" },
  pw_stage: { IT: "Tappa", EN: "Stage", FR: "Étape", ES: "Etapa", DE: "Etappe", RU: "Этап", ZH: "路段" },
  pw_terrain: { IT: "Terreno", EN: "Terrain", FR: "Terrain", ES: "Terreno", DE: "Gelände", RU: "Рельеф", ZH: "地形" },
  pw_terrain_hilly: { IT: "collinare", EN: "hilly", FR: "vallonné", ES: "ondulado", DE: "hügelig", RU: "холмистый", ZH: "丘陵" },
  pw_credential: { IT: "Credenziale", EN: "Credential", FR: "Credencial", ES: "Credencial", DE: "Pilgerpass", RU: "Креденсиаль", ZH: "朝圣护照" },
  pw_stages_completed: { IT: "tappe completate", EN: "stages completed", FR: "étapes terminées", ES: "etapas completadas", DE: "Etappen geschafft", RU: "этапов пройдено", ZH: "路段已完成" },
  pw_route_completed: { IT: "Cammino completato", EN: "Trail completed", FR: "Chemin terminé", ES: "Camino completado", DE: "Pilgerweg abgeschlossen", RU: "Путь пройден", ZH: "已完成全程" },
  pw_prepare: { IT: "Prepara il cammino", EN: "Prepare the trail", FR: "Préparer le chemin", ES: "Preparar el camino", DE: "Pilgerweg vorbereiten", RU: "Подготовить путь", ZH: "准备行程" },
  pw_see_ready: { IT: "Vedi gli itinerari pronti per questo cammino", EN: "See ready itineraries for this trail", FR: "Voir les itinéraires prêts pour ce chemin", ES: "Ver itinerarios listos para este camino", DE: "Fertige Routen für diesen Pilgerweg ansehen", RU: "Готовые маршруты для этого пути", ZH: "查看此步道的现成行程" },
  pw_not_curated: { IT: "non è tra i cammini curati.", EN: "isn't among the curated trails.", FR: "ne figure pas parmi les chemins sélectionnés.", ES: "no está entre los caminos seleccionados.", DE: "ist nicht unter den kuratierten Wegen.", RU: "нет среди отобранных путей.", ZH: "不在精选步道中。" },
  pw_ai_tracing: { IT: "La redazione AI traccia le tappe…", EN: "The AI editors are tracing the stages…", FR: "La rédaction IA trace les étapes…", ES: "La redacción IA traza las etapas…", DE: "Die KI-Redaktion zeichnet die Etappen…", RU: "ИИ-редакция прокладывает этапы…", ZH: "AI 编辑正在规划路段…" },
  pw_generate_ai: { IT: "Genera con l'AI la guida del cammino", EN: "Generate the trail guide with AI:", FR: "Générer avec l'IA le guide du chemin", ES: "Generar con IA la guía del camino", DE: "Wegführer mit KI erstellen:", RU: "Создать гид по пути с ИИ:", ZH: "用 AI 生成步道指南：" },
  pw_no_results: { IT: "Nessun cammino per questi filtri: allarga la ricerca.", EN: "No trails for these filters: widen the search.", FR: "Aucun chemin pour ces filtres : élargissez la recherche.", ES: "Ningún camino para estos filtros: amplía la búsqueda.", DE: "Keine Wege für diese Filter: erweitere die Suche.", RU: "Нет путей для этих фильтров: расширьте поиск.", ZH: "没有符合筛选的步道，请放宽条件。" },
  pw_ai_unavailable: { IT: "Cammino non disponibile in questo momento: riprova.", EN: "Trail not available right now: try again.", FR: "Chemin indisponible pour le moment : réessayez.", ES: "Camino no disponible ahora mismo: inténtalo de nuevo.", DE: "Pilgerweg gerade nicht verfügbar: versuche es erneut.", RU: "Путь сейчас недоступен: попробуйте снова.", ZH: "步道暂不可用，请重试。" },
  pw_network_error: { IT: "Rete assente o server occupato: riprova tra poco.", EN: "No network or busy server: try again shortly.", FR: "Pas de réseau ou serveur occupé : réessayez bientôt.", ES: "Sin red o servidor ocupado: inténtalo en breve.", DE: "Kein Netz oder Server ausgelastet: versuche es gleich erneut.", RU: "Нет сети или сервер занят: попробуйте чуть позже.", ZH: "无网络或服务器繁忙，请稍后重试。" },
  pw_default_traveler: { IT: "Viaggiatore WIP", EN: "WIP traveller", FR: "Voyageur WIP", ES: "Viajero WIP", DE: "WIP-Reisender", RU: "Путешественник WIP", ZH: "WIP 旅行者" },
  pw_cert_failed: { IT: "Generazione non riuscita: riprova.", EN: "Generation failed: try again.", FR: "Échec de la génération : réessayez.", ES: "La generación ha fallado: inténtalo de nuevo.", DE: "Erstellung fehlgeschlagen: versuche es erneut.", RU: "Не удалось создать: попробуйте снова.", ZH: "生成失败，请重试。" },
  pw_png_saved: { IT: "PNG salvato: incornicialo dove vuoi! 🖼", EN: "PNG saved: frame it wherever you like! 🖼", FR: "PNG enregistré : encadrez-le où vous voulez ! 🖼", ES: "PNG guardado: ¡enmárcalo donde quieras! 🖼", DE: "PNG gespeichert: rahme es ein, wo du willst! 🖼", RU: "PNG сохранён: повесьте в рамку! 🖼", ZH: "PNG 已保存：随意装裱吧！🖼" },
  pw_share_failed: { IT: "Condivisione non riuscita: prova con \"Scarica PNG\".", EN: "Sharing failed: try \"Download PNG\".", FR: "Partage impossible : essayez « Télécharger PNG ».", ES: "No se ha podido compartir: prueba \"Descargar PNG\".", DE: "Teilen fehlgeschlagen: versuche \"PNG herunterladen\".", RU: "Не удалось поделиться: попробуйте «Скачать PNG».", ZH: "分享失败：请尝试“下载 PNG”。" },
  pw_generate_cert: { IT: "Genera il tuo attestato", EN: "Generate your certificate", FR: "Générer votre attestation", ES: "Genera tu certificado", DE: "Urkunde erstellen", RU: "Создать сертификат", ZH: "生成证书" },
  pw_cert_title: { IT: "Attestato del Pellegrino", EN: "Pilgrim's Certificate", FR: "Attestation du Pèlerin", ES: "Certificado del Peregrino", DE: "Pilgerurkunde", RU: "Сертификат паломника", ZH: "朝圣者证书" },
  pw_code: { IT: "Codice", EN: "Code", FR: "Code", ES: "Código", DE: "Code", RU: "Код", ZH: "代码" },
  pw_verifiable: { IT: "verificabile su wip.guide", EN: "verifiable on wip.guide", FR: "vérifiable sur wip.guide", ES: "verificable en wip.guide", DE: "überprüfbar auf wip.guide", RU: "можно проверить на wip.guide", ZH: "可在 wip.guide 验证" },
  pw_share: { IT: "Condividi", EN: "Share", FR: "Partager", ES: "Compartir", DE: "Teilen", RU: "Поделиться", ZH: "分享" },
  pw_download_png: { IT: "Scarica PNG", EN: "Download PNG", FR: "Télécharger PNG", ES: "Descargar PNG", DE: "PNG herunterladen", RU: "Скачать PNG", ZH: "下载 PNG" },

  // ── Sosta breve: porti & aeroporti (te_*) ────────────────────────────
  te_title: { IT: "Sosta breve", EN: "Short stop", FR: "Escale courte", ES: "Parada breve", DE: "Kurzer Stopp", RU: "Короткая остановка", ZH: "短暂停留" },
  te_search_placeholder: { IT: "Cerca porto o aeroporto in tutto il mondo…", EN: "Search a port or airport worldwide…", FR: "Chercher un port ou un aéroport dans le monde…", ES: "Busca un puerto o aeropuerto en el mundo…", DE: "Hafen oder Flughafen weltweit suchen…", RU: "Найти порт или аэропорт в мире…", ZH: "搜索世界各地的港口或机场…" },
  te_intro: { IT: "Escursioni con le ore contate: rientro alla nave o al gate sempre garantito.", EN: "Excursions with the clock ticking: return to the ship or gate always guaranteed.", FR: "Excursions chronométrées : retour au navire ou à la porte toujours garanti.", ES: "Excursiones con el tiempo contado: regreso al barco o a la puerta siempre garantizado.", DE: "Ausflüge mit knapper Zeit: Rückkehr zum Schiff oder Gate immer garantiert.", RU: "Экскурсии с ограниченным временем: возвращение на корабль или к выходу гарантировано.", ZH: "时间有限的短途游：保证按时返回邮轮或登机口。" },
  te_all: { IT: "Tutti", EN: "All", FR: "Tous", ES: "Todos", DE: "Alle", RU: "Все", ZH: "全部" },
  te_ports: { IT: "Porti", EN: "Ports", FR: "Ports", ES: "Puertos", DE: "Häfen", RU: "Порты", ZH: "港口" },
  te_airports: { IT: "Aeroporti", EN: "Airports", FR: "Aéroports", ES: "Aeropuertos", DE: "Flughäfen", RU: "Аэропорты", ZH: "机场" },
  te_filter_country: { IT: "Filtra per paese", EN: "Filter by country", FR: "Filtrer par pays", ES: "Filtrar por país", DE: "Nach Land filtern", RU: "Фильтр по стране", ZH: "按国家筛选" },
  te_all_countries: { IT: "Tutti i paesi", EN: "All countries", FR: "Tous les pays", ES: "Todos los países", DE: "Alle Länder", RU: "Все страны", ZH: "所有国家" },
  te_city_from: { IT: "città da", EN: "city from", FR: "ville dès", ES: "ciudad desde", DE: "Stadt ab", RU: "город от", ZH: "进城需中转" },
  te_editorial: { IT: "Redazione", EN: "Editorial", FR: "Rédaction", ES: "Redacción", DE: "Redaktion", RU: "Редакция", ZH: "编辑精选" },
  te_to_center: { IT: "Verso il centro", EN: "To the centre", FR: "Vers le centre", ES: "Hacia el centro", DE: "Ins Zentrum", RU: "В центр", ZH: "前往市中心" },
  te_luggage_default: { IT: "Deposito bagagli: verifica in loco il punto left luggage del terminal prima di uscire.", EN: "Luggage storage: check the terminal's left-luggage point on site before leaving.", FR: "Consigne à bagages : vérifiez sur place la consigne du terminal avant de sortir.", ES: "Consigna de equipaje: comprueba in situ el punto de consigna de la terminal antes de salir.", DE: "Gepäckaufbewahrung: prüfe vor Ort die Gepäckaufbewahrung des Terminals, bevor du hinausgehst.", RU: "Камера хранения: уточните на месте, где она в терминале, прежде чем выходить.", ZH: "行李寄存：离开前请在航站楼现场确认寄存点。" },
  te_hours_ashore: { IT: "Ore di sosta a terra", EN: "Hours ashore", FR: "Heures à terre", ES: "Horas en tierra", DE: "Stunden an Land", RU: "Часов на берегу", ZH: "上岸停留时长" },
  te_hours_layover: { IT: "Ore di scalo", EN: "Layover hours", FR: "Heures d'escale", ES: "Horas de escala", DE: "Stunden Aufenthalt", RU: "Часов пересадки", ZH: "中转时长" },
  te_back_aboard_within: { IT: "Rientro a bordo entro", EN: "Back on board within", FR: "Retour à bord dans", ES: "Regreso a bordo en", DE: "Zurück an Bord innerhalb von", RU: "Возвращение на борт в течение", ZH: "返回船上需在" },
  te_back_aboard_note: { IT: "dall'inizio della sosta (1h di margine: la nave non aspetta).", EN: "from the start of the stop (1h margin: the ship won't wait).", FR: "après le début de l'escale (1 h de marge : le navire n'attend pas).", ES: "desde el inicio de la parada (1 h de margen: el barco no espera).", DE: "ab Beginn des Stopps (1 h Puffer: das Schiff wartet nicht).", RU: "с начала стоянки (запас 1 ч: корабль не ждёт).", ZH: "内（自停留开始计，预留 1 小时：邮轮不会等人）。" },
  te_stay_airport: { IT: "Si resta in aeroporto: al gate", EN: "Staying at the airport: at the gate", FR: "On reste à l'aéroport : à la porte", ES: "Nos quedamos en el aeropuerto: en la puerta", DE: "Wir bleiben am Flughafen: am Gate", RU: "Остаёмся в аэропорту: у выхода", ZH: "留在机场：到达登机口" },
  te_stay_airport_note: { IT: "prima del volo, senza stress.", EN: "before the flight, stress-free.", FR: "avant le vol, sans stress.", ES: "antes del vuelo, sin estrés.", DE: "vor dem Flug, ganz entspannt.", RU: "до вылета, без спешки.", ZH: "提前于航班，轻松无压力。" },
  te_back_airport_within: { IT: "Ritorno in aeroporto entro", EN: "Back at the airport within", FR: "Retour à l'aéroport dans", ES: "Regreso al aeropuerto en", DE: "Zurück am Flughafen innerhalb von", RU: "Возвращение в аэропорт в течение", ZH: "返回机场需在" },
  te_back_airport_note: { IT: "dall'inizio dello scalo (2h prima del volo per controlli e imbarco).", EN: "from the start of the layover (2h before the flight for security and boarding).", FR: "après le début de l'escale (2 h avant le vol pour les contrôles et l'embarquement).", ES: "desde el inicio de la escala (2 h antes del vuelo para controles y embarque).", DE: "ab Beginn des Aufenthalts (2 h vor dem Flug für Kontrollen und Boarding).", RU: "с начала пересадки (за 2 ч до вылета на контроль и посадку).", ZH: "内（自中转开始计，航班前 2 小时用于安检和登机）。" },
  te_use: { IT: "Usa questo itinerario", EN: "Use this itinerary", FR: "Utiliser cet itinéraire", ES: "Usar este itinerario", DE: "Diese Route verwenden", RU: "Использовать маршрут", ZH: "使用此行程" },
  te_see_ready: { IT: "Vedi gli itinerari pronti per questa sosta", EN: "See ready itineraries for this stop", FR: "Voir les itinéraires prêts pour cette escale", ES: "Ver itinerarios listos para esta parada", DE: "Fertige Routen für diesen Stopp ansehen", RU: "Готовые маршруты для этой остановки", ZH: "查看此停留的现成行程" },
  te_not_curated: { IT: "non è nel catalogo curato.", EN: "isn't in the curated catalogue.", FR: "n'est pas dans le catalogue sélectionné.", ES: "no está en el catálogo seleccionado.", DE: "ist nicht im kuratierten Katalog.", RU: "нет в отобранном каталоге.", ZH: "不在精选目录中。" },
  te_ai_preparing: { IT: "La redazione AI prepara la guida…", EN: "The AI editors are preparing the guide…", FR: "La rédaction IA prépare le guide…", ES: "La redacción IA prepara la guía…", DE: "Die KI-Redaktion bereitet den Guide vor…", RU: "ИИ-редакция готовит гид…", ZH: "AI 编辑正在准备指南…" },
  te_generate_port: { IT: "Genera con l'AI la guida del porto", EN: "Generate the port guide with AI:", FR: "Générer avec l'IA le guide du port", ES: "Generar con IA la guía del puerto", DE: "Hafen-Guide mit KI erstellen:", RU: "Создать гид по порту с ИИ:", ZH: "用 AI 生成港口指南：" },
  te_generate_airport: { IT: "Genera con l'AI la guida dell'aeroporto", EN: "Generate the airport guide with AI:", FR: "Générer avec l'IA le guide de l'aéroport", ES: "Generar con IA la guía del aeropuerto", DE: "Flughafen-Guide mit KI erstellen:", RU: "Создать гид по аэропорту с ИИ:", ZH: "用 AI 生成机场指南：" },
  te_no_results: { IT: "Nessuna voce per questo filtro: prova un altro paese o cerca per nome.", EN: "Nothing for this filter: try another country or search by name.", FR: "Rien pour ce filtre : essayez un autre pays ou cherchez par nom.", ES: "Nada para este filtro: prueba otro país o busca por nombre.", DE: "Nichts für diesen Filter: versuche ein anderes Land oder suche nach Namen.", RU: "Ничего для этого фильтра: попробуйте другую страну или поиск по названию.", ZH: "该筛选无结果：请尝试其他国家或按名称搜索。" },
  te_ai_unavailable: { IT: "Guida non disponibile in questo momento: riprova.", EN: "Guide not available right now: try again.", FR: "Guide indisponible pour le moment : réessayez.", ES: "Guía no disponible ahora mismo: inténtalo de nuevo.", DE: "Guide gerade nicht verfügbar: versuche es erneut.", RU: "Гид сейчас недоступен: попробуйте снова.", ZH: "指南暂不可用，请重试。" },
  te_network_error: { IT: "Rete assente o server occupato: riprova tra poco.", EN: "No network or busy server: try again shortly.", FR: "Pas de réseau ou serveur occupé : réessayez bientôt.", ES: "Sin red o servidor ocupado: inténtalo en breve.", DE: "Kein Netz oder Server ausgelastet: versuche es gleich erneut.", RU: "Нет сети или сервер занят: попробуйте чуть позже.", ZH: "无网络或服务器繁忙，请稍后重试。" },

  // ── Calendario .ics (cal_*) ──────────────────────────────────────────
  cal_invalid_date: { IT: "Scegli una data valida.", EN: "Pick a valid date.", FR: "Choisissez une date valide.", ES: "Elige una fecha válida.", DE: "Wähle ein gültiges Datum.", RU: "Выберите корректную дату.", ZH: "请选择有效日期。" },
  cal_ready: { IT: "File calendario pronto: aprilo per aggiungere le tappe.", EN: "Calendar file ready: open it to add the stops.", FR: "Fichier calendrier prêt : ouvrez-le pour ajouter les étapes.", ES: "Archivo de calendario listo: ábrelo para añadir las paradas.", DE: "Kalenderdatei bereit: öffne sie, um die Stationen hinzuzufügen.", RU: "Файл календаря готов: откройте его, чтобы добавить остановки.", ZH: "日历文件已就绪：打开即可添加行程点。" },
  cal_download_failed: { IT: "Impossibile scaricare il file su questo dispositivo.", EN: "Couldn't download the file on this device.", FR: "Impossible de télécharger le fichier sur cet appareil.", ES: "No se ha podido descargar el archivo en este dispositivo.", DE: "Die Datei konnte auf diesem Gerät nicht heruntergeladen werden.", RU: "Не удалось скачать файл на этом устройстве.", ZH: "无法在此设备上下载文件。" },
  cal_export_error: { IT: "Errore durante l'esportazione. Riprova.", EN: "Export error. Try again.", FR: "Erreur lors de l'export. Réessayez.", ES: "Error al exportar. Inténtalo de nuevo.", DE: "Fehler beim Export. Versuche es erneut.", RU: "Ошибка экспорта. Попробуйте снова.", ZH: "导出出错，请重试。" },
  cal_button_title: { IT: "Esporta le tappe come eventi nel tuo calendario", EN: "Export the stops as events in your calendar", FR: "Exporter les étapes comme événements dans votre calendrier", ES: "Exporta las paradas como eventos en tu calendario", DE: "Stationen als Termine in deinen Kalender exportieren", RU: "Экспортировать остановки как события в календарь", ZH: "将行程点导出为日历事件" },
  cal_add_to_calendar: { IT: "Aggiungi al calendario", EN: "Add to calendar", FR: "Ajouter au calendrier", ES: "Añadir al calendario", DE: "Zum Kalender hinzufügen", RU: "Добавить в календарь", ZH: "添加到日历" },
  cal_stops: { IT: "tappe", EN: "stops", FR: "étapes", ES: "paradas", DE: "Stationen", RU: "остановок", ZH: "个行程点" },
  cal_when_starts: { IT: "Quando inizia il viaggio?", EN: "When does the trip start?", FR: "Quand commence le voyage ?", ES: "¿Cuándo empieza el viaje?", DE: "Wann beginnt die Reise?", RU: "Когда начинается поездка?", ZH: "旅行何时开始？" },
  cal_one_event_per_stop: { IT: "Un evento per ogni tappa, con promemoria 30 minuti prima.", EN: "One event per stop, with a reminder 30 minutes before.", FR: "Un événement par étape, avec un rappel 30 minutes avant.", ES: "Un evento por parada, con recordatorio 30 minutos antes.", DE: "Ein Termin pro Station, mit Erinnerung 30 Minuten vorher.", RU: "Одно событие на остановку, с напоминанием за 30 минут.", ZH: "每个行程点一个事件，提前 30 分钟提醒。" },
  cal_download_ics: { IT: "Scarica il calendario (.ics)", EN: "Download the calendar (.ics)", FR: "Télécharger le calendrier (.ics)", ES: "Descargar el calendario (.ics)", DE: "Kalender herunterladen (.ics)", RU: "Скачать календарь (.ics)", ZH: "下载日历 (.ics)" },

  // ── WIP Nav: POI lungo il percorso (rp_*) ────────────────────────────
  rp_to: { IT: "Verso", EN: "To", FR: "Vers", ES: "Hacia", DE: "Nach", RU: "В", ZH: "前往" },
  rp_gps_unavailable: { IT: "GPS non disponibile: usa un indirizzo personalizzato.", EN: "GPS unavailable: use a custom address.", FR: "GPS indisponible : utilisez une adresse personnalisée.", ES: "GPS no disponible: usa una dirección personalizada.", DE: "GPS nicht verfügbar: nutze eine eigene Adresse.", RU: "GPS недоступен: укажите адрес вручную.", ZH: "GPS 不可用：请使用自定义地址。" },
  rp_choose_start: { IT: "Scegli il punto di partenza per scansionare il percorso.", EN: "Choose a starting point to scan the route.", FR: "Choisissez un point de départ pour analyser l'itinéraire.", ES: "Elige el punto de partida para escanear la ruta.", DE: "Wähle einen Startpunkt, um die Route zu scannen.", RU: "Выберите точку старта, чтобы просканировать маршрут.", ZH: "选择起点以扫描路线。" },
  rp_scanning: { IT: "Scansione percorso in corso...", EN: "Scanning route...", FR: "Analyse de l'itinéraire...", ES: "Escaneando la ruta...", DE: "Route wird gescannt...", RU: "Сканирование маршрута...", ZH: "正在扫描路线…" },
  rp_scan_failed: { IT: "Errore durante la scansione del percorso.", EN: "Route scan failed.", FR: "Échec de l'analyse de l'itinéraire.", ES: "Error al escanear la ruta.", DE: "Routen-Scan fehlgeschlagen.", RU: "Ошибка сканирования маршрута.", ZH: "路线扫描失败。" },
  rp_can_still_navigate: { IT: "Puoi comunque avviare la navigazione.", EN: "You can still start navigating.", FR: "Vous pouvez quand même démarrer la navigation.", ES: "Aun así puedes iniciar la navegación.", DE: "Du kannst die Navigation trotzdem starten.", RU: "Вы всё равно можете начать навигацию.", ZH: "您仍可开始导航。" },
  rp_no_pois: { IT: "Nessun POI sul percorso", EN: "No POIs on the route", FR: "Aucun POI sur l'itinéraire", ES: "Ningún POI en la ruta", DE: "Keine POIs auf der Route", RU: "На маршруте нет точек интереса", ZH: "路线上没有景点" },
  rp_no_pois_desc: { IT: "Non abbiamo trovato luoghi di interesse a meno di 300 metri dal tuo tragitto stradale.", EN: "No points of interest found within 300 metres of your route.", FR: "Aucun point d'intérêt trouvé à moins de 300 mètres de votre trajet.", ES: "No se han encontrado puntos de interés a menos de 300 metros de tu ruta.", DE: "Keine Sehenswürdigkeiten im Umkreis von 300 Metern deiner Route gefunden.", RU: "В пределах 300 метров от маршрута точек интереса не найдено.", ZH: "路线 300 米范围内未找到景点。" },
  rp_wait: { IT: "Attendi...", EN: "Wait...", FR: "Patientez...", ES: "Espera...", DE: "Warten...", RU: "Подождите...", ZH: "请稍候…" },
  rp_start_navigation: { IT: "Inizia navigazione", EN: "Start navigation", FR: "Démarrer la navigation", ES: "Iniciar navegación", DE: "Navigation starten", RU: "Начать навигацию", ZH: "开始导航" },
  // ── Mappe offline: peso dichiarato PRIMA del download (offl_*) ───────
  offl_size_estimate: { IT: "Sfondo mappa: ~{min}-{max} MB ({tiles} tessere) per {radius} km.", EN: "Map background: ~{min}-{max} MB ({tiles} tiles) for {radius} km.", FR: "Fond de carte : ~{min}-{max} Mo ({tiles} tuiles) pour {radius} km.", ES: "Fondo de mapa: ~{min}-{max} MB ({tiles} teselas) para {radius} km.", DE: "Kartenhintergrund: ~{min}-{max} MB ({tiles} Kacheln) für {radius} km.", RU: "Фон карты: ~{min}-{max} МБ ({tiles} тайлов) на {radius} км.", ZH: "地图底图：约 {min}-{max} MB（{tiles} 张瓦片），半径 {radius} 公里。" },
  offl_size_pick_city: { IT: "Scegli una città: ti diciamo quanti MB pesa prima di scaricare.", EN: "Pick a city: we'll tell you how many MB it weighs before downloading.", FR: "Choisissez une ville : nous indiquons le poids en Mo avant le téléchargement.", ES: "Elige una ciudad: te decimos cuántos MB ocupa antes de descargar.", DE: "Wähle eine Stadt: Wir nennen die MB, bevor du herunterlädst.", RU: "Выберите город: мы покажем размер в МБ до загрузки.", ZH: "选择城市：下载前我们会告诉您占用多少 MB。" },
  offl_zoom_note: { IT: "Oltre lo zoom 15 la mappa offline si ingrandisce sfocata invece di restare grigia.", EN: "Beyond zoom 15 the offline map scales up blurry instead of staying grey.", FR: "Au-delà du zoom 15, la carte hors ligne s'agrandit en flou au lieu de rester grise.", ES: "Más allá del zoom 15 el mapa sin conexión se amplía borroso en vez de quedarse gris.", DE: "Ab Zoom 15 wird die Offline-Karte unscharf vergrößert, statt grau zu bleiben.", RU: "Выше зума 15 офлайн-карта увеличивается размыто, а не остаётся серой.", ZH: "超过 15 级缩放时，离线地图会模糊放大，而不是变成灰色。" },
  offl_storage_short: { IT: "Spazio quasi esaurito: il download richiede circa {needed} ma sul dispositivo ne restano {free}. Il download potrebbe risultare incompleto. Vuoi procedere comunque?", EN: "Storage almost full: the download needs about {needed} but only {free} are left on the device. The download may end up incomplete. Continue anyway?", FR: "Espace presque épuisé : le téléchargement demande environ {needed} mais il ne reste que {free} sur l'appareil. Le téléchargement pourrait être incomplet. Continuer quand même ?", ES: "Espacio casi agotado: la descarga necesita unos {needed} pero en el dispositivo quedan {free}. La descarga podría quedar incompleta. ¿Continuar igualmente?", DE: "Speicher fast voll: Der Download braucht etwa {needed}, auf dem Gerät sind noch {free} frei. Der Download könnte unvollständig bleiben. Trotzdem fortfahren?", RU: "Места почти нет: загрузке нужно около {needed}, а на устройстве осталось {free}. Загрузка может остаться неполной. Продолжить?", ZH: "存储空间将满：下载约需 {needed}，设备仅剩 {free}。下载可能不完整。仍要继续吗？" },
  offl_levels_skipped: { IT: "Alcuni livelli di dettaglio (zoom {levels}) sono stati saltati per non superare il limite di spazio: in quelle zone lo zoom resterà sfocato.", EN: "Some detail levels (zoom {levels}) were skipped to stay within the size cap: zooming there will stay blurry.", FR: "Certains niveaux de détail (zoom {levels}) ont été ignorés pour respecter la limite d'espace : le zoom y restera flou.", ES: "Algunos niveles de detalle (zoom {levels}) se han omitido para no superar el límite de espacio: allí el zoom se verá borroso.", DE: "Einige Detailstufen (Zoom {levels}) wurden übersprungen, um das Speicherlimit einzuhalten: Dort bleibt der Zoom unscharf.", RU: "Некоторые уровни детализации (зум {levels}) пропущены, чтобы уложиться в лимит: там зум останется размытым.", ZH: "为不超出容量上限，已跳过部分细节层级（缩放 {levels}）：这些区域放大后会显示模糊。" },

  // ── Chat WIP (AgentControls) — 23/08/2026: era tutta in italiano cablato ──
  chat_mic_unsupported: { IT: "Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge.", EN: "Your browser doesn't support speech recognition. Use Chrome or Edge.", FR: "Ton navigateur ne prend pas en charge la reconnaissance vocale. Utilise Chrome ou Edge.", ES: "Tu navegador no admite el reconocimiento de voz. Usa Chrome o Edge.", DE: "Dein Browser unterstützt keine Spracherkennung. Nutze Chrome oder Edge.", RU: "Ваш браузер не поддерживает распознавание речи. Используйте Chrome или Edge.", ZH: "你的浏览器不支持语音识别。请使用 Chrome 或 Edge。" },
  chat_listening: { IT: "Ascolto in corso...", EN: "Listening...", FR: "Écoute en cours...", ES: "Escuchando...", DE: "Ich höre zu...", RU: "Слушаю...", ZH: "正在聆听..." },
  chat_write_message: { IT: "Scrivi un messaggio...", EN: "Write a message...", FR: "Écris un message...", ES: "Escribe un mensaje...", DE: "Schreib eine Nachricht...", RU: "Напишите сообщение...", ZH: "输入消息..." },
  chat_ask_wip: { IT: "Chiedi a WIP o ottimizza l'itinerario...", EN: "Ask WIP or optimize the itinerary...", FR: "Demande à WIP ou optimise l'itinéraire...", ES: "Pregunta a WIP u optimiza el itinerario...", DE: "Frag WIP oder optimiere die Route...", RU: "Спросите WIP или улучшите маршрут...", ZH: "询问 WIP 或优化行程..." },
  chat_thinking: { IT: "Sto pensando...", EN: "Thinking...", FR: "Je réfléchis...", ES: "Estoy pensando...", DE: "Ich denke nach...", RU: "Думаю...", ZH: "思考中..." },
  chat_welcome_general: { IT: "Ciao! Sono WIP, il tuo esperto di viaggi. Chiedimi pure qualsiasi cosa sui monumenti, la storia locale o consigli per il tuo tour!", EN: "Hi! I'm WIP, your travel expert. Ask me anything about monuments, local history or tips for your tour!", FR: "Salut ! Je suis WIP, ton expert voyages. Demande-moi ce que tu veux sur les monuments, l'histoire locale ou des conseils pour ton tour !", ES: "¡Hola! Soy WIP, tu experto en viajes. Pregúntame lo que quieras sobre monumentos, historia local o consejos para tu tour.", DE: "Hallo! Ich bin WIP, dein Reiseexperte. Frag mich alles über Denkmäler, lokale Geschichte oder Tipps für deine Tour!", RU: "Привет! Я WIP, ваш эксперт по путешествиям. Спрашивайте о памятниках, местной истории или советах для тура!", ZH: "你好！我是 WIP，你的旅行专家。关于古迹、本地历史或行程建议，尽管问我！" },
  chat_welcome_itinerary: { IT: "Ciao! L'itinerario è pronto, ma se vuoi modificarlo (es. aggiungere un museo, scambiare orari, trovare alternative se piove) o farmi domande sui luoghi... sono a tua disposizione!", EN: "Hi! The itinerary is ready, but if you want to change it (add a museum, swap times, find rain alternatives) or ask about the places... I'm here for you!", FR: "Salut ! L'itinéraire est prêt, mais si tu veux le modifier (ajouter un musée, échanger des horaires, trouver des alternatives s'il pleut) ou me poser des questions sur les lieux... je suis là !", ES: "¡Hola! El itinerario está listo, pero si quieres modificarlo (añadir un museo, cambiar horarios, buscar alternativas si llueve) o preguntarme por los lugares... ¡estoy a tu disposición!", DE: "Hallo! Die Route ist fertig — wenn du sie ändern willst (ein Museum ergänzen, Zeiten tauschen, Regen-Alternativen finden) oder Fragen zu den Orten hast... bin ich für dich da!", RU: "Привет! Маршрут готов, но если хотите его изменить (добавить музей, поменять время, найти альтернативы на случай дождя) или спросить о местах — я к вашим услугам!", ZH: "你好！行程已就绪。如果你想修改（比如加个博物馆、调整时间、下雨时找替代方案）或询问这些地点……随时找我！" },
  chat_login_required: { IT: "Per chattare con WIP devi prima accedere con il tuo account (serve per i crediti).", EN: "To chat with WIP you first need to sign in with your account (needed for credits).", FR: "Pour discuter avec WIP, connecte-toi d'abord avec ton compte (nécessaire pour les crédits).", ES: "Para chatear con WIP primero debes iniciar sesión con tu cuenta (necesario para los créditos).", DE: "Um mit WIP zu chatten, melde dich zuerst mit deinem Konto an (für die Credits nötig).", RU: "Чтобы общаться с WIP, сначала войдите в аккаунт (это нужно для кредитов).", ZH: "要与 WIP 聊天，请先登录账号（积分需要）。" },
  chat_messages_left: { IT: "{n} messaggi rimasti", EN: "{n} messages left", FR: "{n} messages restants", ES: "{n} mensajes restantes", DE: "{n} Nachrichten übrig", RU: "Осталось сообщений: {n}", ZH: "剩余 {n} 条消息" },
  chat_included_exhausted: { IT: "Messaggi inclusi esauriti · +10 per {c} crediti", EN: "Included messages used up · +10 for {c} credits", FR: "Messages inclus épuisés · +10 pour {c} crédits", ES: "Mensajes incluidos agotados · +10 por {c} créditos", DE: "Inklusive Nachrichten aufgebraucht · +10 für {c} Credits", RU: "Включённые сообщения закончились · +10 за {c} кредитов", ZH: "赠送消息已用完 · {c} 积分再获 10 条" },
  chat_price_for_messages: { IT: "{c} crediti per 10 messaggi", EN: "{c} credits for 10 messages", FR: "{c} crédits pour 10 messages", ES: "{c} créditos por 10 mensajes", DE: "{c} Credits für 10 Nachrichten", RU: "{c} кредитов за 10 сообщений", ZH: "{c} 积分换 10 条消息" },
  chat_info_title: { IT: "Cosa puoi chiedere a WIP?", EN: "What can you ask WIP?", FR: "Que peux-tu demander à WIP ?", ES: "¿Qué puedes preguntar a WIP?", DE: "Was kannst du WIP fragen?", RU: "О чём можно спросить WIP?", ZH: "可以问 WIP 什么？" },
  chat_info_b1t: { IT: "Modificare l'itinerario:", EN: "Change the itinerary:", FR: "Modifier l'itinéraire :", ES: "Modificar el itinerario:", DE: "Route ändern:", RU: "Изменить маршрут:", ZH: "修改行程：" },
  chat_info_b1: { IT: "\"Aggiungi un museo alle 15:00\", \"Ho un'ora di ritardo\", \"Piove, cambia i piani.\"", EN: "\"Add a museum at 3 PM\", \"I'm an hour late\", \"It's raining, change the plans.\"", FR: "« Ajoute un musée à 15 h », « J'ai une heure de retard », « Il pleut, change les plans. »", ES: "\"Añade un museo a las 15:00\", \"Llevo una hora de retraso\", \"Llueve, cambia los planes.\"", DE: "„Füge um 15 Uhr ein Museum hinzu“, „Ich bin eine Stunde zu spät“, „Es regnet, ändere die Pläne.“", RU: "«Добавь музей на 15:00», «Я опаздываю на час», «Идёт дождь, поменяй планы».", ZH: "“下午 3 点加一个博物馆”“我晚了一小时”“下雨了，改一下计划”。" },
  chat_info_b2t: { IT: "Informazioni Locali:", EN: "Local information:", FR: "Infos locales :", ES: "Información local:", DE: "Lokale Infos:", RU: "Местная информация:", ZH: "本地信息：" },
  chat_info_b2: { IT: "\"Dove si trova lo stadio?\", \"A che ora apre la galleria d'arte?\"", EN: "\"Where is the stadium?\", \"What time does the art gallery open?\"", FR: "« Où se trouve le stade ? », « À quelle heure ouvre la galerie d'art ? »", ES: "\"¿Dónde está el estadio?\", \"¿A qué hora abre la galería de arte?\"", DE: "„Wo ist das Stadion?“, „Wann öffnet die Kunstgalerie?“", RU: "«Где находится стадион?», «Во сколько открывается галерея?»", ZH: "“体育场在哪里？”“美术馆几点开门？”" },
  chat_info_b3t: { IT: "Consigli Pratici:", EN: "Practical tips:", FR: "Conseils pratiques :", ES: "Consejos prácticos:", DE: "Praktische Tipps:", RU: "Практические советы:", ZH: "实用建议：" },
  chat_info_b3: { IT: "\"Che tempo fa oggi?\", \"Quali documenti mi servono?\"", EN: "\"What's the weather today?\", \"Which documents do I need?\"", FR: "« Quel temps fait-il aujourd'hui ? », « Quels documents me faut-il ? »", ES: "\"¿Qué tiempo hace hoy?\", \"¿Qué documentos necesito?\"", DE: "„Wie ist das Wetter heute?“, „Welche Dokumente brauche ich?“", RU: "«Какая сегодня погода?», «Какие документы мне нужны?»", ZH: "“今天天气怎么样？”“我需要哪些证件？”" },
  chat_error_connection: { IT: "Ops! Si è verificato un errore di connessione. Riprova tra poco.", EN: "Oops! A connection error occurred. Try again shortly.", FR: "Oups ! Une erreur de connexion s'est produite. Réessaie dans un instant.", ES: "¡Vaya! Se ha producido un error de conexión. Inténtalo de nuevo en un momento.", DE: "Hoppla! Ein Verbindungsfehler ist aufgetreten. Versuch es gleich noch mal.", RU: "Ой! Произошла ошибка соединения. Повторите попытку чуть позже.", ZH: "哎呀！连接出错了。请稍后重试。" },
  chat_updated_itinerary: { IT: "Ho aggiornato l'itinerario come richiesto!", EN: "I've updated the itinerary as requested!", FR: "J'ai mis à jour l'itinéraire comme demandé !", ES: "¡He actualizado el itinerario como pediste!", DE: "Ich habe die Route wie gewünscht aktualisiert!", RU: "Я обновил маршрут, как вы просили!", ZH: "已按你的要求更新行程！" },
  chat_no_credits: { IT: "Crediti insufficienti. Ricarica nel WIP Shop.", EN: "Not enough credits. Top up in the WIP Shop.", FR: "Crédits insuffisants. Recharge dans le WIP Shop.", ES: "Créditos insuficientes. Recarga en la WIP Shop.", DE: "Nicht genug Credits. Lade im WIP Shop nach.", RU: "Недостаточно кредитов. Пополните в WIP Shop.", ZH: "积分不足。请在 WIP Shop 充值。" },
  chat_voice_replies_on: { IT: "Risposte a voce: attive", EN: "Voice replies: on", FR: "Réponses vocales : activées", ES: "Respuestas de voz: activas", DE: "Sprachantworten: an", RU: "Голосовые ответы: включены", ZH: "语音回复：已开启" },
  chat_voice_replies_off: { IT: "Leggi le risposte a voce", EN: "Read replies aloud", FR: "Lire les réponses à voix haute", ES: "Leer las respuestas en voz alta", DE: "Antworten vorlesen", RU: "Читать ответы вслух", ZH: "朗读回复" },
  chat_empty_hint: { IT: "Scrivi un messaggio per chattare con WIP o modificare il tuo itinerario.", EN: "Write a message to chat with WIP or change your itinerary.", FR: "Écris un message pour discuter avec WIP ou modifier ton itinéraire.", ES: "Escribe un mensaje para chatear con WIP o modificar tu itinerario.", DE: "Schreib eine Nachricht, um mit WIP zu chatten oder deine Route zu ändern.", RU: "Напишите сообщение, чтобы пообщаться с WIP или изменить маршрут.", ZH: "输入消息与 WIP 聊天或修改行程。" },
  chat_service_name: { IT: "WIP - Esperto Viaggi (10 messaggi)", EN: "WIP - Travel Expert (10 messages)", FR: "WIP - Expert Voyages (10 messages)", ES: "WIP - Experto en Viajes (10 mensajes)", DE: "WIP - Reiseexperte (10 Nachrichten)", RU: "WIP — эксперт по путешествиям (10 сообщений)", ZH: "WIP - 旅行专家（10 条消息）" },
  chat_speak_btn: { IT: "Parla", EN: "Speak", FR: "Parler", ES: "Hablar", DE: "Sprechen", RU: "Говорить", ZH: "说话" },
  chat_stop_listening: { IT: "Ferma ascolto", EN: "Stop listening", FR: "Arrêter l'écoute", ES: "Detener escucha", DE: "Zuhören beenden", RU: "Остановить прослушивание", ZH: "停止聆听" },
  // ── Audit UI/UX pre-release 28/08/2026: mini-player, blocco app, bussola, a11y ──
  // (`audio_titolo_default` esiste già più in alto: il mini-player la riusa.)
  audio_in_riproduzione: { IT: "In riproduzione", EN: "Playing", FR: "En lecture", ES: "Reproduciendo", DE: "Wird abgespielt", RU: "Воспроизведение", ZH: "正在播放" },
  audio_in_pausa: { IT: "In pausa", EN: "Paused", FR: "En pause", ES: "En pausa", DE: "Pausiert", RU: "На паузе", ZH: "已暂停" },
  map_orientamento: { IT: "Orientamento", EN: "Heading", FR: "Orientation", ES: "Orientación", DE: "Ausrichtung", RU: "Ориентация", ZH: "方向" },
  map_follow_on: { IT: "Segui attivo", EN: "Follow on", FR: "Suivi actif", ES: "Seguimiento activo", DE: "Verfolgung an", RU: "Слежение включено", ZH: "跟随已开启" },
  applock_titolo: { IT: "Sblocca con impronta o Face ID", EN: "Unlock with fingerprint or Face ID", FR: "Déverrouiller avec l'empreinte ou Face ID", ES: "Desbloquea con huella o Face ID", DE: "Mit Fingerabdruck oder Face ID entsperren", RU: "Разблокируйте отпечатком или Face ID", ZH: "使用指纹或面容 ID 解锁" },
  applock_sblocca: { IT: "Sblocca", EN: "Unlock", FR: "Déverrouiller", ES: "Desbloquear", DE: "Entsperren", RU: "Разблокировать", ZH: "解锁" },
  applock_motivo: { IT: "Sblocca World in Pocket", EN: "Unlock World in Pocket", FR: "Déverrouiller World in Pocket", ES: "Desbloquear World in Pocket", DE: "World in Pocket entsperren", RU: "Разблокировать World in Pocket", ZH: "解锁 World in Pocket" },
  applock_prompt_titolo: { IT: "Sblocco app", EN: "App unlock", FR: "Déverrouillage de l'app", ES: "Desbloqueo de la app", DE: "App-Entsperrung", RU: "Разблокировка приложения", ZH: "应用解锁" },
  b2b_iap_non_disponibile: { IT: "Gli acquisti in-app dallo store saranno disponibili a breve. Per ora i pacchetti si acquistano dal sito wip.guide.", EN: "In-app purchases from the store are coming soon. For now, packages are purchased on wip.guide.", FR: "Les achats intégrés via le store arrivent bientôt. Pour l'instant, les packs s'achètent sur wip.guide.", ES: "Las compras dentro de la app desde la tienda llegarán pronto. Por ahora, los paquetes se compran en wip.guide.", DE: "In-App-Käufe über den Store kommen bald. Vorerst werden die Pakete auf wip.guide gekauft.", RU: "Покупки в приложении через магазин скоро появятся. Пока пакеты покупаются на сайте wip.guide.", ZH: "应用商店内购即将推出。目前请在 wip.guide 网站购买套餐。" },
  b2b_checkout_errore: { IT: "Non siamo riusciti ad avviare il pagamento. Riprova tra poco.", EN: "We couldn't start the checkout. Please try again shortly.", FR: "Impossible de lancer le paiement. Réessaie dans un instant.", ES: "No hemos podido iniciar el pago. Inténtalo de nuevo en un momento.", DE: "Der Bezahlvorgang konnte nicht gestartet werden. Versuch es gleich noch mal.", RU: "Не удалось начать оплату. Повторите попытку чуть позже.", ZH: "无法启动付款。请稍后重试。" },
  a11y_nav_principale: { IT: "Navigazione principale", EN: "Main navigation", FR: "Navigation principale", ES: "Navegación principal", DE: "Hauptnavigation", RU: "Основная навигация", ZH: "主导航" },
  a11y_fotocamera: { IT: "Fotocamera e riconoscimento", EN: "Camera and recognition", FR: "Appareil photo et reconnaissance", ES: "Cámara y reconocimiento", DE: "Kamera und Erkennung", RU: "Камера и распознавание", ZH: "相机与识别" },
  a11y_audioguida: { IT: "Audioguida automatica", EN: "Automatic audio guide", FR: "Audioguide automatique", ES: "Audioguía automática", DE: "Automatischer Audioguide", RU: "Автоматический аудиогид", ZH: "自动语音导览" },
  a11y_silenzia_audio: { IT: "Silenzia l'audioguida", EN: "Mute the audio guide", FR: "Couper le son de l'audioguide", ES: "Silenciar la audioguía", DE: "Audioguide stummschalten", RU: "Выключить звук аудиогида", ZH: "静音语音导览" },
  a11y_riattiva_audio: { IT: "Riattiva l'audio dell'audioguida", EN: "Unmute the audio guide", FR: "Réactiver le son de l'audioguide", ES: "Reactivar el sonido de la audioguía", DE: "Ton des Audioguides wieder einschalten", RU: "Включить звук аудиогида", ZH: "取消静音语音导览" },
  a11y_pausa: { IT: "Pausa", EN: "Pause", FR: "Pause", ES: "Pausa", DE: "Pause", RU: "Пауза", ZH: "暂停" },
  a11y_riproduci: { IT: "Riproduci", EN: "Play", FR: "Lecture", ES: "Reproducir", DE: "Abspielen", RU: "Воспроизвести", ZH: "播放" },
  a11y_ferma_audio: { IT: "Ferma l'audio", EN: "Stop the audio", FR: "Arrêter l'audio", ES: "Detener el audio", DE: "Audio stoppen", RU: "Остановить аудио", ZH: "停止音频" },
  a11y_cancella_ricerca: { IT: "Cancella la ricerca", EN: "Clear the search", FR: "Effacer la recherche", ES: "Borrar la búsqueda", DE: "Suche löschen", RU: "Очистить поиск", ZH: "清除搜索" },
  a11y_esci_follow: { IT: "Tocca per uscire dalla modalità Segui", EN: "Tap to leave Follow mode", FR: "Touche pour quitter le mode Suivi", ES: "Toca para salir del modo Seguir", DE: "Tippen, um den Verfolgungsmodus zu verlassen", RU: "Нажмите, чтобы выйти из режима слежения", ZH: "点按以退出跟随模式" },
  // ── 🛒 Acquisti in-app: ripristino e prezzi dello store (28/08/2026) ──
  // Requisiti di App Store Review: il pulsante "Ripristina acquisti" e il
  // prezzo nella valuta del negozio dell'utente (mai un euro cablato).
  iap_ripristina: { IT: "Ripristina acquisti", EN: "Restore purchases", FR: "Restaurer les achats", ES: "Restaurar compras", DE: "Käufe wiederherstellen", RU: "Восстановить покупки", ZH: "恢复购买" },
  iap_ripristino_ok: { IT: "Acquisti ripristinati: {n}. Saldo e pass aggiornati.", EN: "Purchases restored: {n}. Balance and pass updated.", FR: "Achats restaurés : {n}. Solde et pass mis à jour.", ES: "Compras restauradas: {n}. Saldo y pase actualizados.", DE: "Wiederhergestellte Käufe: {n}. Guthaben und Pass aktualisiert.", RU: "Восстановлено покупок: {n}. Баланс и пропуск обновлены.", ZH: "已恢复购买：{n} 项。余额和通行证已更新。" },
  iap_ripristino_vuoto: { IT: "Nessun acquisto da ripristinare su questo account.", EN: "No purchases to restore on this account.", FR: "Aucun achat à restaurer sur ce compte.", ES: "No hay compras que restaurar en esta cuenta.", DE: "Für dieses Konto gibt es keine Käufe zum Wiederherstellen.", RU: "На этом аккаунте нет покупок для восстановления.", ZH: "此账号没有可恢复的购买项目。" },
  iap_ripristino_errore: { IT: "Non siamo riusciti a contattare il negozio. Riprova tra poco.", EN: "We couldn't reach the store. Please try again shortly.", FR: "Impossible de joindre la boutique. Réessaie dans un instant.", ES: "No hemos podido contactar con la tienda. Inténtalo de nuevo en un momento.", DE: "Der Store war nicht erreichbar. Versuch es gleich noch mal.", RU: "Не удалось связаться с магазином. Повторите попытку чуть позже.", ZH: "无法连接到应用商店，请稍后重试。" },
  iap_ripristino_web: { IT: "Il ripristino vale per gli acquisti in-app: apri l'app WIP sul telefono. I crediti comprati sul web sono già sul tuo profilo.", EN: "Restoring applies to in-app purchases: open the WIP app on your phone. Credits bought on the web are already on your profile.", FR: "La restauration concerne les achats in-app : ouvre l'app WIP sur ton téléphone. Les crédits achetés sur le web sont déjà sur ton profil.", ES: "La restauración se aplica a las compras dentro de la app: abre la app WIP en tu móvil. Los créditos comprados en la web ya están en tu perfil.", DE: "Die Wiederherstellung gilt für In-App-Käufe: Öffne die WIP-App auf deinem Handy. Im Web gekaufte Credits sind bereits in deinem Profil.", RU: "Восстановление относится к встроенным покупкам: откройте приложение WIP на телефоне. Кредиты, купленные в вебе, уже в вашем профиле.", ZH: "恢复功能适用于应用内购买：请在手机上打开 WIP 应用。在网页端购买的积分已记入你的账户。" },
  iap_ripristino_corso: { IT: "Ripristino in corso…", EN: "Restoring…", FR: "Restauration en cours…", ES: "Restaurando…", DE: "Wird wiederhergestellt…", RU: "Восстановление…", ZH: "正在恢复…" },
  iap_prezzo_non_disp: { IT: "Prezzo non disponibile", EN: "Price unavailable", FR: "Prix indisponible", ES: "Precio no disponible", DE: "Preis nicht verfügbar", RU: "Цена недоступна", ZH: "价格暂不可用" },
  iap_prezzo_al_checkout: { IT: "Prezzo al pagamento", EN: "Price at checkout", FR: "Prix au paiement", ES: "Precio al pagar", DE: "Preis beim Bezahlen", RU: "Цена при оплате", ZH: "结算时显示价格" },
  iap_store_non_raggiungibile: { IT: "Il negozio non è raggiungibile: non possiamo mostrarti il prezzo giusto. Controlla la connessione e riprova.", EN: "The store isn't reachable, so we can't show you the right price. Check your connection and try again.", FR: "La boutique est injoignable : impossible d'afficher le bon prix. Vérifie ta connexion et réessaie.", ES: "La tienda no está disponible: no podemos mostrarte el precio correcto. Comprueba la conexión e inténtalo de nuevo.", DE: "Der Store ist nicht erreichbar, deshalb können wir dir keinen korrekten Preis zeigen. Prüfe deine Verbindung und versuch es erneut.", RU: "Магазин недоступен, поэтому мы не можем показать правильную цену. Проверьте соединение и повторите попытку.", ZH: "无法连接应用商店，因此无法显示正确价格。请检查网络后重试。" },
  // ── 👤 Modalità ospite (28/08/2026) ──
  // App Store Review contesta il login obbligatorio quando il contenuto è
  // fruibile senza account: mappa, POI e teaser sono liberi, l'account serve
  // solo per acquisti, crediti, salvataggi e profilo.
  guest_accedi: { IT: "Accedi", EN: "Sign in", FR: "Se connecter", ES: "Iniciar sesión", DE: "Anmelden", RU: "Войти", ZH: "登录" },
  guest_accedi_per: { IT: "Accedi per salvare i preferiti, usare i crediti e acquistare le audioguide.", EN: "Sign in to save favorites, use credits and buy audio guides.", FR: "Connecte-toi pour enregistrer tes favoris, utiliser tes crédits et acheter les audioguides.", ES: "Inicia sesión para guardar favoritos, usar créditos y comprar audioguías.", DE: "Melde dich an, um Favoriten zu speichern, Guthaben zu nutzen und Audioguides zu kaufen.", RU: "Войдите, чтобы сохранять избранное, тратить кредиты и покупать аудиогиды.", ZH: "登录后即可收藏地点、使用积分并购买语音导览。" },
  guest_banner: { IT: "Stai esplorando come ospite: mappa e anteprime sono libere.", EN: "You're exploring as a guest: map and previews are free.", FR: "Tu explores en invité : la carte et les aperçus sont libres.", ES: "Estás explorando como invitado: el mapa y las vistas previas son libres.", DE: "Du erkundest als Gast: Karte und Vorschauen sind frei.", RU: "Вы исследуете как гость: карта и превью доступны свободно.", ZH: "你正在以访客身份浏览：地图和预览均可免费使用。" },
  guest_azione_richiede_account: { IT: "Questa azione richiede un account WIP.", EN: "This action requires a WIP account.", FR: "Cette action nécessite un compte WIP.", ES: "Esta acción requiere una cuenta WIP.", DE: "Für diese Aktion brauchst du ein WIP-Konto.", RU: "Для этого действия нужен аккаунт WIP.", ZH: "此操作需要 WIP 账号。" },
  guest_continua_senza: { IT: "Continua senza account", EN: "Continue without an account", FR: "Continuer sans compte", ES: "Continuar sin cuenta", DE: "Ohne Konto fortfahren", RU: "Продолжить без аккаунта", ZH: "不登录继续使用" },
  rp_places_along_way: { IT: "Ecco i luoghi che incontrerai lungo la strada. L'audioguida partirà in automatico solo per quelli selezionati.", EN: "These are the places you'll pass along the way. The audio guide starts automatically only for the selected ones.", FR: "Voici les lieux que vous croiserez en chemin. L'audioguide se lancera automatiquement uniquement pour ceux sélectionnés.", ES: "Estos son los lugares que encontrarás por el camino. La audioguía se activará solo para los seleccionados.", DE: "Das sind die Orte, an denen du vorbeikommst. Der Audioguide startet automatisch nur für die ausgewählten.", RU: "Вот места, которые встретятся по пути. Аудиогид включится автоматически только для выбранных.", ZH: "这些是您沿途将经过的地点。语音导览仅对选中的地点自动播放。" },
};

// I dizionari per area della bonifica 24/08/2026 (lib/traduzioni/*): import
// pigro-circolare evitato importando QUI il modulo aggregatore, che a sua
// volta importa solo il tipo Language da questo file.
import { DIZIONARI_EXTRA } from './i18nDizionari';

export const LINGUE_SUPPORTATE: Language[] = ['IT', 'EN', 'FR', 'ES', 'DE', 'RU', 'ZH'];

/**
 * La lingua di SISTEMA del dispositivo, ridotta alle 7 supportate.
 *
 * Prima l'app partiva sempre in italiano per chiunque: un revisore Apple in
 * California apriva WIP e trovava una schermata di login in una lingua che non
 * conosce (motivo di rifiuto ricorrente). Si guardano tutte le lingue
 * preferite del browser/telefono, in ordine; se nessuna combacia si usa EN —
 * MAI IT, che è la lingua di chi ha scritto l'app, non di chi la usa.
 *
 * Non usiamo @capacitor/device: il pacchetto non è installato e su nativo la
 * WebView eredita comunque la lingua di sistema in navigator.language(s).
 */
export function rilevaLinguaSistema(): Language {
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const candidati: string[] = [
      ...(Array.isArray(nav?.languages) ? nav.languages : []),
      nav?.language,
      nav?.userLanguage,
    ].filter(Boolean);
    for (const c of candidati) {
      // "it-CH" → "IT"; "zh-Hant-TW" → "ZH".
      const base = String(c).split('-')[0].toUpperCase();
      if ((LINGUE_SUPPORTATE as string[]).includes(base)) return base as Language;
    }
  } catch { /* ambiente senza navigator */ }
  return 'EN';
}

/**
 * La lingua della UI per chi NON riceve `language` via props (banner, modali
 * montate fuori dall'albero principale): la stessa chiave localStorage che
 * App.tsx scrive a ogni cambio lingua. Senza scelta salvata si RILEVA quella
 * di sistema (la scelta manuale, una volta fatta, vince sempre e resta).
 */
export function linguaCorrente(): Language {
  try {
    const salvata = localStorage.getItem('wip_language');
    if (!salvata) return rilevaLinguaSistema();
    const l = String(salvata).toUpperCase();
    return ((LINGUE_SUPPORTATE as string[]).includes(l) ? l : rilevaLinguaSistema()) as Language;
  } catch { return rilevaLinguaSistema(); }
}

export function getTranslation(key: string, lang: Language): string {
  let dictionary = TRANSLATIONS[key];
  if (!dictionary) {
    for (const d of DIZIONARI_EXTRA) { if (d[key]) { dictionary = d[key]; break; } }
  }
  if (!dictionary) return key;
  return dictionary[lang] || dictionary["EN"] || key;
}
