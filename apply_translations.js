import fs from 'fs';

const dictText = `
  selected_items: { IT: "selezionati", EN: "selected", FR: "sélectionnés", ES: "seleccionados", RU: "выбрано", ZH: "已选择" },
  period_month: { IT: "Periodo / Mese", EN: "Period / Month", FR: "Période / Mois", ES: "Período / Mes", RU: "Период / Месяц", ZH: "期间 / 月份" },
  generic_any: { IT: "Generico (Qualsiasi)", EN: "Generic (Any)", FR: "Générique (N'importe lequel)", ES: "Genérico (Cualquiera)", RU: "Общий (Любой)", ZH: "通用 (任何)" },
  starting_point: { IT: "Punto di Partenza", EN: "Starting Point", FR: "Point de départ", ES: "Punto de partida", RU: "Отправная точка", ZH: "起点" },
  starting_point_placeholder: { IT: "Es: Roma, Milano...", EN: "E.g. Rome, Milan...", FR: "Ex: Paris, Lyon...", ES: "Ej: Madrid, Barcelona...", RU: "Напр.: Москва, Санкт-Петербург...", ZH: "例如：罗马，米兰..." },
  use_my_location: { IT: "Usa la mia posizione", EN: "Use my location", FR: "Utiliser ma position", ES: "Usar mi ubicación", RU: "Использовать мое местоположение", ZH: "使用我的位置" },
  radius_km: { IT: "Raggio (Km)", EN: "Radius (Km)", FR: "Rayon (Km)", ES: "Radio (Km)", RU: "Радиус (Км)", ZH: "半径 (公里)" },
  hide_basic_options: { IT: "Nascondi opzioni base", EN: "Hide basic options", FR: "Masquer les options de base", ES: "Ocultar opciones básicas", RU: "Скрыть базовые настройки", ZH: "隐藏基本选项" },
  show_basic_options: { IT: "Mostra opzioni base (orari, ecc)", EN: "Show basic options (times, etc)", FR: "Afficher les options de base (horaires, etc.)", ES: "Mostrar opciones básicas (horarios, etc.)", RU: "Показать базовые настройки (время и т.д.)", ZH: "显示基本选项 (时间等)" },
  find_3_alts: { IT: "Trova 3 Alternative", EN: "Find 3 Alternatives", FR: "Trouver 3 Alternatives", ES: "Buscar 3 Alternativas", RU: "Найти 3 альтернативы", ZH: "查找3个备选方案" },
  choose_trip: { IT: "Scegli il tuo Viaggio", EN: "Choose your Trip", FR: "Choisissez votre Voyage", ES: "Elige tu Viaje", RU: "Выберите ваше путешествие", ZH: "选择您的旅行" },
  here_are_proposals: { IT: "Ecco 3 proposte studiate per te.", EN: "Here are 3 proposals designed for you.", FR: "Voici 3 propositions conçues pour vous.", ES: "Aquí tienes 3 propuestas diseñadas para ti.", RU: "Вот 3 предложения, разработанные для вас.", ZH: "这里是为您设计的3个建议。" },
  days_count: { IT: "Giorni", EN: "Days", FR: "Jours", ES: "Días", RU: "Дни", ZH: "天" },
  stops_count: { IT: "Tappe", EN: "Stops", FR: "Étapes", ES: "Paradas", RU: "Остановки", ZH: "站" },
  go_back: { IT: "Torna Indietro", EN: "Go Back", FR: "Retour", ES: "Volver", RU: "Вернуться", ZH: "返回" },
  my_itineraries: { IT: "I Miei Itinerari", EN: "My Itineraries", FR: "Mes Itinéraires", ES: "Mis Itinerarios", RU: "Мои маршруты", ZH: "我的行程" },
  saved_count: { IT: "salvati", EN: "saved", FR: "sauvegardés", ES: "guardados", RU: "сохранено", ZH: "已保存" },
  ai_itineraries: { IT: "ITINERARI AI", EN: "AI ITINERARIES", FR: "ITINÉRAIRES IA", ES: "ITINERARIOS IA", RU: "ИИ МАРШРУТЫ", ZH: "AI 行程" },
  premium_guides_tab: { IT: "GUIDE PREMIUM", EN: "PREMIUM GUIDES", FR: "GUIDES PREMIUM", ES: "GUÍAS PREMIUM", RU: "ПРЕМИУМ ГИДЫ", ZH: "高级导览" },
  no_saved_itineraries: { IT: "Nessun itinerario salvato", EN: "No saved itineraries", FR: "Aucun itinéraire sauvegardé", ES: "No hay itinerarios guardados", RU: "Нет сохраненных маршрутов", ZH: "没有保存的行程" },
  generate_first: { IT: "Genera il tuo primo itinerario!", EN: "Generate your first itinerary!", FR: "Générez votre premier itinéraire !", ES: "¡Genera tu primer itinerario!", RU: "Создайте свой первый маршрут!", ZH: "生成您的第一个行程！" },
  resume_btn: { IT: "▶ Riprendi", EN: "▶ Resume", FR: "▶ Reprendre", ES: "▶ Reanudar", RU: "▶ Продолжить", ZH: "▶ 恢复" },
  no_pdf_generated: { IT: "Non hai ancora generato nessuna guida PDF.", EN: "You haven't generated any PDF guide yet.", FR: "Vous n'avez pas encore généré de guide PDF.", ES: "Aún no has generado ninguna guía en PDF.", RU: "Вы еще не создали ни одного PDF гида.", ZH: "您尚未生成任何PDF指南。" },
  download_pdf_btn: { IT: "SCARICA PDF", EN: "DOWNLOAD PDF", FR: "TÉLÉCHARGER PDF", ES: "DESCARGAR PDF", RU: "СКАЧАТЬ PDF", ZH: "下载 PDF" },
  from_my_location: { IT: "Dalla mia posizione", EN: "From my location", FR: "Depuis ma position", ES: "Desde mi ubicación", RU: "Из моего местоположения", ZH: "从我的位置" },
  acquiring_gps: { IT: "Acquisizione GPS…", EN: "Acquiring GPS…", FR: "Acquisition GPS…", ES: "Adquiriendo GPS…", RU: "Получение GPS…", ZH: "正在获取 GPS…" },
  custom_address: { IT: "Indirizzo personalizzato", EN: "Custom address", FR: "Adresse personnalisée", ES: "Dirección personalizada", RU: "Пользовательский адрес", ZH: "自定义地址" },
  custom_address_placeholder: { IT: "Es: Hotel Roma, Via del Corso 1…", EN: "E.g. Hotel, Station…", FR: "Ex : Hôtel, Gare…", ES: "Ej: Hotel, Estación…", RU: "Напр.: Отель, Вокзал…", ZH: "例如：酒店，车站…" },
  internal_nav_beta: { IT: "Navigazione Interna (Beta)", EN: "Internal Navigation (Beta)", FR: "Navigation interne (Bêta)", ES: "Navegación interna (Beta)", RU: "Внутренняя навигация (Beta)", ZH: "内部导航 (Beta)" },
  open_gmaps: { IT: "Apri in Google Maps", EN: "Open in Google Maps", FR: "Ouvrir dans Google Maps", ES: "Abrir en Google Maps", RU: "Открыть в Google Maps", ZH: "在 Google Maps 中打开" },
  areas_to_avoid: { IT: "Zone da Evitare", EN: "Areas to Avoid", FR: "Zones à éviter", ES: "Zonas a evitar", RU: "Зоны, которых стоит избегать", ZH: "应避免的区域" },
  precautions: { IT: "Precauzioni", EN: "Precautions", FR: "Précautions", ES: "Precauciones", RU: "Меры предосторожности", ZH: "注意事项" },
  recommendations: { IT: "Raccomandazioni", EN: "Recommendations", FR: "Recommandations", ES: "Recomendaciones", RU: "Рекомендации", ZH: "建议" },
  tips: { IT: "Suggerimenti", EN: "Tips", FR: "Conseils", ES: "Consejos", RU: "Подсказки", ZH: "提示" },
  travel_info: { IT: "Informazioni di Viaggio", EN: "Travel Information", FR: "Informations de voyage", ES: "Información de viaje", RU: "Информация о путешествии", ZH: "旅行信息" },
  travel_info_desc: { IT: "Zone, precauzioni, raccomandazioni e suggerimenti", EN: "Zones, precautions, recommendations & tips", FR: "Zones, précautions, recommandations et conseils", ES: "Zonas, precauciones, recomendaciones y consejos", RU: "Зоны, меры предосторожности, рекомендации и советы", ZH: "区域，预防措施，建议和提示" },
  sections_count: { IT: "sezioni", EN: "sections", FR: "sections", ES: "secciones", RU: "разделов", ZH: "部分" },
  from_you: { IT: "da te", EN: "from you", FR: "de vous", ES: "de ti", RU: "от вас", ZH: "距您" },
  calc_distance: { IT: "Calcolo distanza...", EN: "Calculating distance...", FR: "Calcul de la distance...", ES: "Calculando distancia...", RU: "Вычисление расстояния...", ZH: "计算距离中..." },
  remove_favorites: { IT: "Rimuovi dai preferiti", EN: "Remove from favorites", FR: "Retirer des favoris", ES: "Quitar de favoritos", RU: "Удалить из избранного", ZH: "取消收藏" },
  tickets_experiences: { IT: "Biglietti ed Esperienze", EN: "Tickets & Experiences", FR: "Billets et Expériences", ES: "Entradas y Experiencias", RU: "Билеты и впечатления", ZH: "门票与体验" },
  skip_line: { IT: "Salta la fila e prenota subito i biglietti online per questa attrazione.", EN: "Skip the line and book tickets online for this attraction.", FR: "Évitez la file d'attente et réservez vos billets en ligne pour cette attraction.", ES: "Salta la cola y reserva entradas en línea para esta atracción.", RU: "Пройдите без очереди и забронируйте билеты на эту достопримечательность онлайн.", ZH: "免排队并在线预订此景点的门票。" },
  search_gyg: { IT: "Cerca su GetYourGuide", EN: "Search on GetYourGuide", FR: "Rechercher sur GetYourGuide", ES: "Buscar en GetYourGuide", RU: "Искать на GetYourGuide", ZH: "在 GetYourGuide 上搜索" },
  there_are: { IT: "Ci sono ", EN: "There are ", FR: "Il y a ", ES: "Hay ", RU: "Там есть ", ZH: "有 " },
  updating: { IT: "Aggiornamento...", EN: "Updating...", FR: "Mise à jour...", ES: "Actualizando...", RU: "Обновление...", ZH: "更新中..." },
  loading_db: { IT: "Caricamento dal database...", EN: "Loading from database...", FR: "Chargement depuis la base de données...", ES: "Cargando desde la base de datos...", RU: "Загрузка из базы данных...", ZH: "正在从数据库加载..." },
  conn_error: { IT: "Errore di connessione", EN: "Connection Error", FR: "Erreur de connexion", ES: "Error de conexión", RU: "Ошибка соединения", ZH: "连接错误" },
  loading_history: { IT: "Caricamento storia...", EN: "Loading history...", FR: "Chargement de l'historique...", ES: "Cargando historial...", RU: "Загрузка истории...", ZH: "正在加载历史记录..." },
  audio_history_desc: { IT: "Le audioguide che ascolterai esplorando appariranno qui.", EN: "Audioguides you listen to while exploring will appear here.", FR: "Les audioguides que vous écoutez en explorant apparaîtront ici.", ES: "Las audioguías que escuches mientras exploras aparecerán aquí.", RU: "Здесь появятся аудиогиды, которые вы слушаете во время исследования.", ZH: "您在探索时收听的语音导览将显示在此处。" },
  today_at: { IT: "Oggi alle ", EN: "Today at ", FR: "Aujourd'hui à ", ES: "Hoy a las ", RU: "Сегодня в ", ZH: "今天 " },
  loc_updated: { IT: "Posizione predefinita aggiornata con successo! ✅", EN: "Default location updated successfully! ✅", FR: "Position par défaut mise à jour avec succès ! ✅", ES: "¡Ubicación predeterminada actualizada con éxito! ✅", RU: "Местоположение по умолчанию успешно обновлено! ✅", ZH: "默认位置更新成功！✅" },
  loc_error: { IT: "Impossibile ottenere la posizione. Verifica i permessi.", EN: "Unable to get location. Please verify permissions.", FR: "Impossible d'obtenir la position. Veuillez vérifier les permissions.", ES: "No se puede obtener la ubicación. Verifique los permisos.", RU: "Не удалось получить местоположение. Проверьте разрешения.", ZH: "无法获取位置。请验证权限。" },
  loc_unsupported: { IT: "Geolocalizzazione non supportata dal tuo browser.", EN: "Geolocation not supported by your browser.", FR: "La géolocalisation n'est pas supportée par votre navigateur.", ES: "Geolocalización no soportada por su navegador.", RU: "Геолокация не поддерживается вашим браузером.", ZH: "您的浏览器不支持地理定位。" },
  score: { IT: "Punteggio", EN: "Score", FR: "Score", ES: "Puntuación", RU: "Счет", ZH: "分数" },
  explored_places: { IT: "Luoghi Esplorati", EN: "Explored Places", FR: "Lieux Explorés", ES: "Lugares Explorados", RU: "Исследованные места", ZH: "探索过的地点" },
  explored_empty: { IT: "Non hai ancora esplorato nessun luogo. Inizia il tuo viaggio!", EN: "You haven't explored any places yet. Start your journey!", FR: "Vous n'avez encore exploré aucun lieu. Commencez votre voyage !", ES: "Aún no has explorado ningún lugar. ¡Comienza tu viaje!", RU: "Вы еще не исследовали ни одного места. Начните свое путешествие!", ZH: "您尚未探索任何地方。开始您的旅程！" },
`;

// Inject into i18n.ts
let i18nContent = fs.readFileSync('src/lib/i18n.ts', 'utf8');
i18nContent = i18nContent.replace('// Error states', dictText + '\n  // Error states');
fs.writeFileSync('src/lib/i18n.ts', i18nContent);
console.log('Injected translations into i18n.ts');

const replaceRules = [
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'selezionati' : 'selected'", replace: "getTranslation('selected_items', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Periodo / Mese' : 'Period / Month'", replace: "getTranslation('period_month', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Generico (Qualsiasi)' : 'Generic (Any)'", replace: "getTranslation('generic_any', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Punto di Partenza' : 'Starting Point'", replace: "getTranslation('starting_point', language)" },
  { file: 'src/components/PlanScreen.tsx', find: 'language === \'IT\' ? "Es: Roma, Milano..." : "E.g. Rome, Milan..."', replace: "getTranslation('starting_point_placeholder', language)" },
  { file: 'src/components/PlanScreen.tsx', find: 'language === \'IT\' ? "Usa la mia posizione" : "Use my location"', replace: "getTranslation('use_my_location', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Raggio (Km)' : 'Radius (Km)'", replace: "getTranslation('radius_km', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Nascondi opzioni base' : 'Hide basic options'", replace: "getTranslation('hide_basic_options', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Mostra opzioni base (orari, ecc)' : 'Show basic options (times, etc)'", replace: "getTranslation('show_basic_options', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Trova 3 Alternative' : 'Find 3 Alternatives'", replace: "getTranslation('find_3_alts', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Scegli il tuo Viaggio' : 'Choose your Trip'", replace: "getTranslation('choose_trip', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Ecco 3 proposte studiate per te.' : 'Here are 3 proposals designed for you.'", replace: "getTranslation('here_are_proposals', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Giorni' : 'Days'", replace: "getTranslation('days_count', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Tappe' : 'Stops'", replace: "getTranslation('stops_count', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Torna Indietro' : 'Go Back'", replace: "getTranslation('go_back', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'I Miei Itinerari' : 'My Itineraries'", replace: "getTranslation('my_itineraries', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'salvati' : 'saved'", replace: "getTranslation('saved_count', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'ITINERARI AI' : 'AI ITINERARIES'", replace: "getTranslation('ai_itineraries', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'GUIDE PREMIUM' : 'PREMIUM GUIDES'", replace: "getTranslation('premium_guides_tab', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Nessun itinerario salvato' : 'No saved itineraries'", replace: "getTranslation('no_saved_itineraries', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Genera il tuo primo itinerario!' : 'Generate your first itinerary!'", replace: "getTranslation('generate_first', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? '▶ Riprendi' : '▶ Resume'", replace: "getTranslation('resume_btn', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Non hai ancora generato nessuna guida PDF.' : 'You haven\\'t generated any PDF guide yet.'", replace: "getTranslation('no_pdf_generated', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'SCARICA PDF' : 'DOWNLOAD PDF'", replace: "getTranslation('download_pdf_btn', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Dalla mia posizione' : 'From my location'", replace: "getTranslation('from_my_location', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Acquisizione GPS…' : 'Acquiring GPS…'", replace: "getTranslation('acquiring_gps', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Indirizzo personalizzato' : 'Custom address'", replace: "getTranslation('custom_address', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Es: Hotel Roma, Via del Corso 1…' : 'E.g. Hotel, Station…'", replace: "getTranslation('custom_address_placeholder', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Navigazione Interna (Beta)' : 'Internal Navigation (Beta)'", replace: "getTranslation('internal_nav_beta', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Apri in Google Maps' : 'Open in Google Maps'", replace: "getTranslation('open_gmaps', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Zone da Evitare' : 'Areas to Avoid'", replace: "getTranslation('areas_to_avoid', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Precauzioni' : 'Precautions'", replace: "getTranslation('precautions', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Raccomandazioni' : 'Recommendations'", replace: "getTranslation('recommendations', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Suggerimenti' : 'Tips'", replace: "getTranslation('tips', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'Informazioni di Viaggio' : 'Travel Information'", replace: "getTranslation('travel_info', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT'\n                ? 'Zone, precauzioni, raccomandazioni e suggerimenti'\n                : 'Zones, precautions, recommendations & tips'", replace: "getTranslation('travel_info_desc', language)" },
  { file: 'src/components/PlanScreen.tsx', find: "language === 'IT' ? 'sezioni' : 'sections'", replace: "getTranslation('sections_count', language)" },
  
  { file: 'src/components/PoiDetailSheet.tsx', find: "language === 'IT' ? `A ${distanceFromUser >= 10000 ? (distanceFromUser / 1000).toFixed(1).replace(\".0\", \"\") + \" km\" : distanceFromUser + \" m\"} da te` : `${distanceFromUser >= 10000 ? (distanceFromUser / 1000).toFixed(1).replace(\".0\", \"\") + \" km\" : distanceFromUser + \" m\"} ${getTranslation(\"from_you\", language)}`", replace: "`${distanceFromUser >= 10000 ? (distanceFromUser / 1000).toFixed(1).replace(\".0\", \"\") + \" km\" : distanceFromUser + \" m\"} ${getTranslation(\"from_you\", language)}`" },
  { file: 'src/components/PoiDetailSheet.tsx', find: 'language === \'IT\' ? "Calcolo distanza..." : "Calculating distance..."', replace: 'getTranslation("calc_distance", language)' },
  { file: 'src/components/PoiDetailSheet.tsx', find: 'language === \'IT\' ? "Rimuovi dai preferiti" : "Remove from favorites"', replace: 'getTranslation("remove_favorites", language)' },
  { file: 'src/components/PoiDetailSheet.tsx', find: 'language === \'IT\' ? "Biglietti ed Esperienze" : "Tickets & Experiences"', replace: 'getTranslation("tickets_experiences", language)' },
  { file: 'src/components/PoiDetailSheet.tsx', find: 'language === \'IT\' ? "Salta la fila e prenota subito i biglietti online per questa attrazione." : "Skip the line and book tickets online for this attraction."', replace: 'getTranslation("skip_line", language)' },
  { file: 'src/components/PoiDetailSheet.tsx', find: 'language === \'IT\' ? "Cerca su GetYourGuide" : "Search on GetYourGuide"', replace: 'getTranslation("search_gyg", language)' },
  { file: 'src/components/PoiDetailSheet.tsx', find: "language === 'IT' ? 'Ci sono ' : ''", replace: "getTranslation('there_are', language)" },
  
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Aggiornamento...' : 'Updating...'", replace: "getTranslation('updating', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Caricamento dal database...' : 'Loading from database...'", replace: "getTranslation('loading_db', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Errore di connessione' : 'Connection Error'", replace: "getTranslation('conn_error', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Caricamento storia...' : 'Loading history...'", replace: "getTranslation('loading_history', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Le audioguide che ascolterai esplorando appariranno qui.' : 'Audioguides you listen to while exploring will appear here.'", replace: "getTranslation('audio_history_desc', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: "language === 'IT' ? 'Oggi alle ' : 'Today at '", replace: "getTranslation('today_at', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: 'language === \'IT\' ? "Posizione predefinita aggiornata con successo! ✅" : "Default location updated successfully! ✅"', replace: "getTranslation('loc_updated', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: 'language === \'IT\' ? "Impossibile ottenere la posizione. Verifica i permessi." : "Unable to get location. Please verify permissions."', replace: "getTranslation('loc_error', language)" },
  { file: 'src/components/ProfileScreen.tsx', find: 'language === \'IT\' ? "Geolocalizzazione non supportata dal tuo browser." : "Geolocation not supported by your browser."', replace: "getTranslation('loc_unsupported', language)" },
  
  { file: 'src/components/UserProfileSummary.tsx', find: 'Punteggio', replace: '{getTranslation("score", language)}' },
  { file: 'src/components/UserProfileSummary.tsx', find: 'Luoghi Esplorati', replace: '{getTranslation("explored_places", language)}' },
  { file: 'src/components/UserProfileSummary.tsx', find: 'Non hai ancora esplorato nessun luogo. Inizia il tuo viaggio!', replace: '{getTranslation("explored_empty", language)}' }
];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

for (const rule of replaceRules) {
  if (fs.existsSync(rule.file)) {
    let fileContent = fs.readFileSync(rule.file, 'utf8');
    
    // For normal string replacements
    if (fileContent.includes(rule.find)) {
      fileContent = fileContent.split(rule.find).join(rule.replace);
      fs.writeFileSync(rule.file, fileContent);
    } else {
      // Try with different line breaks if not found
      const altFind = rule.find.replace(/\n/g, '\r\n');
      if (fileContent.includes(altFind)) {
        fileContent = fileContent.split(altFind).join(rule.replace);
        fs.writeFileSync(rule.file, fileContent);
      } else if (rule.file.includes('UserProfileSummary')) {
        // Special manual replacements for text nodes
        if (rule.find === 'Punteggio') fileContent = fileContent.replace(/>\s*Punteggio\s*</, `>{getTranslation("score", language)}<`);
        if (rule.find === 'Luoghi Esplorati') {
          fileContent = fileContent.replace(/Luoghi Esplorati \(/, `{getTranslation("explored_places", language)} (`);
          fileContent = fileContent.replace(/>\s*Luoghi Esplorati\s*</, `>{getTranslation("explored_places", language)}<`);
        }
        if (rule.find === 'Non hai ancora esplorato nessun luogo. Inizia il tuo viaggio!') fileContent = fileContent.replace(/Non hai ancora esplorato nessun luogo\. Inizia il tuo viaggio!/, `{getTranslation("explored_empty", language)}`);
        fs.writeFileSync(rule.file, fileContent);
      }
    }
  }
}

console.log('UI files patched successfully');
