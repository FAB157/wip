import type { Language } from '../i18n';

/**
 * PERCORSO SU MISURA (03/09/2026) — le chiavi del pannello, del cruscotto e
 * del listino. Funzione DIVERSA dal giro con audioguida e attivata da un
 * altro tasto: si scelgono i luoghi di QUALSIASI categoria dai pin della
 * mappa (monumenti, ristoranti, farmacie, parcheggi…), WIP ottimizza
 * l'ordine e il navigatore li porta uno dopo l'altro. Nessuna audioguida,
 * nessun Day Pass: costa 30 crediti e comprende tre modifiche.
 */
export const TRAD_PERCORSO: Record<string, Partial<Record<Language, string>>> = {
  pc_titolo: {
    IT: 'Percorso su misura', EN: 'Custom route', FR: 'Parcours sur mesure',
    ES: 'Ruta a medida', DE: 'Route nach Maß', RU: 'Свой маршрут', ZH: '自定义路线',
  },
  pc_sottotitolo: {
    IT: 'Luoghi di ogni categoria · navigatore WIP · senza audioguida',
    EN: 'Places of any category · WIP navigator · no audio guide',
    FR: 'Lieux de toute catégorie · navigateur WIP · sans audioguide',
    ES: 'Lugares de cualquier categoría · navegador WIP · sin audioguía',
    DE: 'Orte jeder Kategorie · WIP-Navigator · ohne Audioguide',
    RU: 'Места любой категории · навигатор WIP · без аудиогида',
    ZH: '任意类别地点 · WIP 导航 · 无语音导览',
  },
  pc_tasto_mappa: {
    IT: 'Componi un percorso', EN: 'Build a route', FR: 'Composer un parcours',
    ES: 'Crear una ruta', DE: 'Route zusammenstellen', RU: 'Составить маршрут', ZH: '规划路线',
  },
  // IL MENU DELLE TRE VIE (07/09/2026, committente: «cliccando sul tasto
  // itinerario appaiono sopra le 3 alternative: personale più gli altri 2
  // modi veloci, tempo e gemme»). Personale = il metodo di sempre, pin per
  // pin. Gemme = le migliori gemme intorno a te, gia' nella lista. A tempo =
  // quante gemme ci stanno in un'ora, due, mezza giornata.
  pc_menu_personale: {
    IT: 'Personale · scelgo io i luoghi', EN: 'Custom · I pick the places', FR: 'Personnel · je choisis les lieux',
    ES: 'Personal · elijo yo los lugares', DE: 'Persönlich · ich wähle die Orte', RU: 'Свой · выбираю места сам', ZH: '自选 · 我来挑地点',
  },
  pc_menu_gemme: {
    IT: 'Gemme intorno a me', EN: 'Gems around me', FR: 'Pépites autour de moi',
    ES: 'Joyas a mi alrededor', DE: 'Juwelen um mich herum', RU: 'Жемчужины рядом со мной', ZH: '我身边的瑰宝',
  },
  pc_menu_tempo: {
    IT: 'A tempo · quanto ho?', EN: 'By time · how long have I got?', FR: 'Au temps · combien ai-je ?',
    ES: 'Por tiempo · ¿cuánto tengo?', DE: 'Nach Zeit · wie viel habe ich?', RU: 'По времени · сколько у меня?', ZH: '按时间 · 我有多久？',
  },
  pc_tempo_1h: { IT: '1 ora', EN: '1 hour', FR: '1 heure', ES: '1 hora', DE: '1 Stunde', RU: '1 час', ZH: '1 小时' },
  pc_tempo_2h: { IT: '2 ore', EN: '2 hours', FR: '2 heures', ES: '2 horas', DE: '2 Stunden', RU: '2 часа', ZH: '2 小时' },
  pc_tempo_mezza: { IT: 'Mezza giornata', EN: 'Half a day', FR: 'Une demi-journée', ES: 'Media jornada', DE: 'Ein halber Tag', RU: 'Полдня', ZH: '半天' },
  pc_veloce_cerco: {
    IT: 'Cerco le gemme intorno a te…', EN: 'Looking for gems around you…', FR: 'Je cherche les pépites autour de vous…',
    ES: 'Busco las joyas a tu alrededor…', DE: 'Ich suche Juwelen in deiner Nähe…', RU: 'Ищу жемчужины рядом с вами…', ZH: '正在寻找你身边的瑰宝……',
  },
  pc_veloce_nessuna: {
    IT: 'Nessuna gemma nei dintorni: sposta la mappa su una città o scegli i luoghi dai pin.',
    EN: 'No gems nearby: move the map to a town or pick places from the pins.',
    FR: 'Aucune pépite aux alentours : déplacez la carte vers une ville ou choisissez les lieux sur les épingles.',
    ES: 'No hay joyas cerca: mueve el mapa a una ciudad o elige los lugares desde los pines.',
    DE: 'Keine Juwelen in der Nähe: verschiebe die Karte auf eine Stadt oder wähle Orte über die Pins.',
    RU: 'Рядом нет жемчужин: переместите карту на город или выберите места по меткам.',
    ZH: '附近没有瑰宝：把地图移到某个城市，或从图钉中挑选地点。',
  },
  pc_veloce_pronto: {
    IT: '{n} gemme intorno a te, già in ordine di cammino. Togli quelle che non vuoi, poi «Crea e avvia».',
    EN: '{n} gems around you, already in walking order. Remove any you don’t want, then “Create & start”.',
    FR: '{n} pépites autour de vous, déjà dans l’ordre de marche. Retirez celles que vous ne voulez pas, puis « Créer et lancer ».',
    ES: '{n} joyas a tu alrededor, ya en orden de camino. Quita las que no quieras y luego «Crear e iniciar».',
    DE: '{n} Juwelen um dich herum, schon in Gehreihenfolge. Entferne, was du nicht willst, dann „Erstellen & starten“.',
    RU: '{n} жемчужин рядом с вами, уже в порядке маршрута. Уберите лишние и нажмите «Создать и начать».',
    ZH: '你身边的 {n} 处瑰宝已按步行顺序排好。删掉不想去的，然后点「创建并开始」。',
  },
  // LA CONFERMA DEL PAGAMENTO (07/09/2026, committente: «deve chiedere prima
  // della navigazione e dichiarare che l'utente sta pagando»). Prima «Crea e
  // avvia» addebitava e partiva in un colpo solo.
  pc_conferma_titolo: {
    IT: 'Confermi il pagamento?', EN: 'Confirm the payment?', FR: 'Confirmer le paiement ?',
    ES: '¿Confirmas el pago?', DE: 'Zahlung bestätigen?', RU: 'Подтвердить оплату?', ZH: '确认付款？',
  },
  pc_conferma_testo: {
    IT: 'Stai per pagare {n} crediti per questo percorso di {t} tappe. Comprende fino a {m} modifiche. Il navigatore parte subito dopo.',
    EN: 'You are about to pay {n} credits for this {t}-stop route. Up to {m} changes included. The navigator starts right after.',
    FR: 'Vous allez payer {n} crédits pour ce parcours de {t} étapes. Jusqu’à {m} modifications incluses. Le navigateur démarre juste après.',
    ES: 'Vas a pagar {n} créditos por esta ruta de {t} paradas. Incluye hasta {m} cambios. El navegador arranca justo después.',
    DE: 'Du zahlst gleich {n} Credits für diese Route mit {t} Stationen. Bis zu {m} Änderungen inklusive. Der Navigator startet direkt danach.',
    RU: 'Вы заплатите {n} кредитов за маршрут из {t} остановок. Включено до {m} изменений. Навигатор запустится сразу после.',
    ZH: '你将为这条 {t} 站的路线支付 {n} 积分，含最多 {m} 次修改。付款后导航立即开始。',
  },
  pc_conferma_saldo: {
    IT: 'Saldo attuale: {s} crediti', EN: 'Current balance: {s} credits', FR: 'Solde actuel : {s} crédits',
    ES: 'Saldo actual: {s} créditos', DE: 'Aktuelles Guthaben: {s} Credits', RU: 'Текущий баланс: {s} кредитов', ZH: '当前余额：{s} 积分',
  },
  pc_conferma_paga: {
    IT: 'Paga {n} crediti e avvia', EN: 'Pay {n} credits and start', FR: 'Payer {n} crédits et lancer',
    ES: 'Pagar {n} créditos e iniciar', DE: '{n} Credits zahlen und starten', RU: 'Оплатить {n} кредитов и начать', ZH: '支付 {n} 积分并开始',
  },
  pc_vuoto: {
    IT: 'Tocca il «+» sui pin della mappa — monumenti, ristoranti, farmacie, parcheggi, qualsiasi categoria — e WIP calcola il percorso più corto che li tocca tutti.',
    EN: 'Tap the "+" on the map pins — monuments, restaurants, pharmacies, car parks, any category — and WIP works out the shortest route through all of them.',
    FR: 'Touchez le « + » sur les épingles de la carte — monuments, restaurants, pharmacies, parkings, toute catégorie — et WIP calcule le parcours le plus court qui les relie tous.',
    ES: 'Toca el «+» en los pines del mapa — monumentos, restaurantes, farmacias, aparcamientos, cualquier categoría — y WIP calcula la ruta más corta que los une todos.',
    DE: 'Tippe auf das „+“ an den Pins der Karte — Denkmäler, Restaurants, Apotheken, Parkplätze, jede Kategorie — und WIP berechnet die kürzeste Route durch alle.',
    RU: 'Нажимайте «+» на метках карты — памятники, рестораны, аптеки, парковки, любая категория — и WIP построит кратчайший маршрут через все точки.',
    ZH: '点击地图图钉上的「+」——古迹、餐厅、药店、停车场，任意类别——WIP 会计算经过所有地点的最短路线。',
  },
  pc_prezzo_riga: {
    IT: '{n} crediti · fino a {m} modifiche incluse · nessuna audioguida',
    EN: '{n} credits · up to {m} changes included · no audio guide',
    FR: '{n} crédits · jusqu’à {m} modifications incluses · sans audioguide',
    ES: '{n} créditos · hasta {m} cambios incluidos · sin audioguía',
    DE: '{n} Credits · bis zu {m} Änderungen inklusive · ohne Audioguide',
    RU: '{n} кредитов · до {m} изменений включено · без аудиогида',
    ZH: '{n} 积分 · 含最多 {m} 次修改 · 无语音导览',
  },
  pc_crea: {
    IT: 'Crea e avvia · {n} crediti', EN: 'Create & start · {n} credits', FR: 'Créer et lancer · {n} crédits',
    ES: 'Crear e iniciar · {n} créditos', DE: 'Erstellen & starten · {n} Credits', RU: 'Создать и начать · {n} кредитов', ZH: '创建并开始 · {n} 积分',
  },
  pc_tappe_scelte: {
    IT: '{n} luoghi scelti', EN: '{n} places chosen', FR: '{n} lieux choisis',
    ES: '{n} lugares elegidos', DE: '{n} Orte gewählt', RU: 'Выбрано мест: {n}', ZH: '已选 {n} 个地点',
  },
  pc_tappa_scelta: {
    IT: '1 luogo scelto', EN: '1 place chosen', FR: '1 lieu choisi',
    ES: '1 lugar elegido', DE: '1 Ort gewählt', RU: 'Выбрано 1 место', ZH: '已选 1 个地点',
  },
  pc_modifiche: {
    IT: 'Modifiche usate: {n}/{m}', EN: 'Changes used: {n}/{m}', FR: 'Modifications utilisées : {n}/{m}',
    ES: 'Cambios usados: {n}/{m}', DE: 'Änderungen genutzt: {n}/{m}', RU: 'Использовано изменений: {n}/{m}', ZH: '已用修改：{n}/{m}',
  },
  pc_modifiche_esaurite: {
    IT: 'Hai usato tutte le {m} modifiche di questo percorso. Termina e creane uno nuovo per cambiarlo ancora.',
    EN: 'You have used all {m} changes for this route. End it and create a new one to change it again.',
    FR: 'Vous avez utilisé les {m} modifications de ce parcours. Terminez-le et créez-en un nouveau pour le modifier encore.',
    ES: 'Has usado los {m} cambios de esta ruta. Termínala y crea una nueva para cambiarla otra vez.',
    DE: 'Du hast alle {m} Änderungen dieser Route verbraucht. Beende sie und erstelle eine neue, um sie weiter zu ändern.',
    RU: 'Вы использовали все {m} изменений этого маршрута. Завершите его и создайте новый, чтобы изменить снова.',
    ZH: '本路线的 {m} 次修改已用完。结束并新建路线才能再次修改。',
  },
  pc_crediti_insufficienti: {
    IT: 'Crediti insufficienti: il percorso costa {n} crediti.',
    EN: 'Not enough credits: the route costs {n} credits.',
    FR: 'Crédits insuffisants : le parcours coûte {n} crédits.',
    ES: 'Créditos insuficientes: la ruta cuesta {n} créditos.',
    DE: 'Nicht genug Credits: die Route kostet {n} Credits.',
    RU: 'Недостаточно кредитов: маршрут стоит {n} кредитов.',
    ZH: '积分不足：路线需要 {n} 积分。',
  },
  pc_accedi: {
    IT: 'Accedi per creare il percorso', EN: 'Sign in to create the route', FR: 'Connectez-vous pour créer le parcours',
    ES: 'Inicia sesión para crear la ruta', DE: 'Melde dich an, um die Route zu erstellen', RU: 'Войдите, чтобы создать маршрут', ZH: '登录以创建路线',
  },
  pc_in_corso: {
    IT: 'Percorso in corso', EN: 'Route in progress', FR: 'Parcours en cours',
    ES: 'Ruta en curso', DE: 'Route läuft', RU: 'Маршрут идёт', ZH: '路线进行中',
  },
  pc_aggiungi_togli_hint: {
    IT: 'Aggiungi o togli luoghi dalla mappa: il percorso si ricalcola da dove sei.',
    EN: 'Add or remove places on the map: the route is recalculated from where you are.',
    FR: 'Ajoutez ou retirez des lieux sur la carte : le parcours est recalculé depuis votre position.',
    ES: 'Añade o quita lugares en el mapa: la ruta se recalcula desde donde estás.',
    DE: 'Füge Orte auf der Karte hinzu oder entferne sie: die Route wird von deinem Standort aus neu berechnet.',
    RU: 'Добавляйте или убирайте места на карте: маршрут пересчитывается от вашего положения.',
    ZH: '在地图上添加或移除地点：路线会从你所在位置重新计算。',
  },
  pc_termina: {
    IT: 'Termina percorso', EN: 'End route', FR: 'Terminer le parcours',
    ES: 'Terminar ruta', DE: 'Route beenden', RU: 'Завершить маршрут', ZH: '结束路线',
  },
  pc_termina_conferma: {
    IT: 'Terminare il percorso? I crediti spesi non vengono restituiti.',
    EN: 'End the route? The credits spent are not refunded.',
    FR: 'Terminer le parcours ? Les crédits dépensés ne sont pas remboursés.',
    ES: '¿Terminar la ruta? Los créditos gastados no se devuelven.',
    DE: 'Route beenden? Die ausgegebenen Credits werden nicht erstattet.',
    RU: 'Завершить маршрут? Потраченные кредиты не возвращаются.',
    ZH: '结束路线？已花费的积分不予退还。',
  },
  pc_in_auto: {
    IT: 'Tutte le tappe in Google Maps (auto)', EN: 'All stops in Google Maps (car)', FR: 'Toutes les étapes dans Google Maps (voiture)',
    ES: 'Todas las paradas en Google Maps (coche)', DE: 'Alle Stationen in Google Maps (Auto)', RU: 'Все точки в Google Maps (авто)', ZH: '所有站点用 Google 地图（驾车）',
  },
  pc_nuovo: {
    IT: 'Nuovo percorso', EN: 'New route', FR: 'Nouveau parcours',
    ES: 'Nueva ruta', DE: 'Neue Route', RU: 'Новый маршрут', ZH: '新路线',
  },
  pc_pieno: {
    IT: 'Percorso pieno: al massimo {m} luoghi.', EN: 'Route full: at most {m} places.', FR: 'Parcours complet : {m} lieux au maximum.',
    ES: 'Ruta completa: como máximo {m} lugares.', DE: 'Route voll: höchstens {m} Orte.', RU: 'Маршрут заполнен: не более {m} мест.', ZH: '路线已满：最多 {m} 个地点。',
  },
  pc_cruscotto_riga: {
    IT: 'Percorso su misura · senza audioguida', EN: 'Custom route · no audio guide', FR: 'Parcours sur mesure · sans audioguide',
    ES: 'Ruta a medida · sin audioguía', DE: 'Route nach Maß · ohne Audioguide', RU: 'Свой маршрут · без аудиогида', ZH: '自定义路线 · 无语音导览',
  },
  pc_cambio_modo_conferma: {
    IT: 'Hai dei luoghi scelti per l’altra funzione: passando di qua la selezione si svuota. Continuare?',
    EN: 'You have places selected for the other feature: switching here clears the selection. Continue?',
    FR: 'Vous avez des lieux sélectionnés pour l’autre fonction : en passant ici, la sélection sera vidée. Continuer ?',
    ES: 'Tienes lugares elegidos para la otra función: al pasar aquí la selección se vacía. ¿Continuar?',
    DE: 'Du hast Orte für die andere Funktion gewählt: beim Wechsel wird die Auswahl geleert. Fortfahren?',
    RU: 'У вас есть места, выбранные для другой функции: при переходе выбор очистится. Продолжить?',
    ZH: '你在另一功能中已选地点：切换到此处将清空选择。继续？',
  },
  // ── Listino ──
  pc_listino_nome: {
    IT: 'Percorso su misura', EN: 'Custom route', FR: 'Parcours sur mesure',
    ES: 'Ruta a medida', DE: 'Route nach Maß', RU: 'Свой маршрут', ZH: '自定义路线',
  },
  pc_listino_unit: {
    IT: 'a percorso', EN: 'per route', FR: 'par parcours',
    ES: 'por ruta', DE: 'pro Route', RU: 'за маршрут', ZH: '每条路线',
  },
  pc_listino_desc: {
    IT: 'Scegli luoghi di qualsiasi categoria dalla mappa; WIP ottimizza l’ordine e ti guida col navigatore. Fino a 3 modifiche incluse. Senza audioguida.',
    EN: 'Pick places of any category on the map; WIP optimises the order and guides you with the navigator. Up to 3 changes included. No audio guide.',
    FR: 'Choisissez des lieux de toute catégorie sur la carte ; WIP optimise l’ordre et vous guide avec le navigateur. Jusqu’à 3 modifications incluses. Sans audioguide.',
    ES: 'Elige lugares de cualquier categoría en el mapa; WIP optimiza el orden y te guía con el navegador. Hasta 3 cambios incluidos. Sin audioguía.',
    DE: 'Wähle Orte jeder Kategorie auf der Karte; WIP optimiert die Reihenfolge und führt dich mit dem Navigator. Bis zu 3 Änderungen inklusive. Ohne Audioguide.',
    RU: 'Выберите места любой категории на карте; WIP оптимизирует порядок и ведёт вас навигатором. До 3 изменений включено. Без аудиогида.',
    ZH: '在地图上选择任意类别的地点；WIP 优化顺序并用导航带你前往。含最多 3 次修改。无语音导览。',
  },
};
