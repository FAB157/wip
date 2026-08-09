export type Language = "IT" | "EN" | "FR" | "ES" | "RU" | "ZH";

export const LANGUAGES: Record<Language, { label: string; flag: string }> = {
  IT: { label: "Italiano", flag: "🇮🇹" },
  EN: { label: "English", flag: "🇬🇧" },
  FR: { label: "Français", flag: "🇫🇷" },
  ES: { label: "Español", flag: "🇪🇸" },
  RU: { label: "Русский", flag: "🇷🇺" },
  ZH: { label: "中文 (Zhōngwén)", flag: "🇨🇳" },
};

export const TRANSLATIONS: Record<string, Record<Language, string>> = {
  // Navigazione a piedi (NavigationOverlay) — prima erano hardcoded in IT
  nav_calculating: { IT: "Calcolo del percorso…", EN: "Calculating route…", FR: "Calcul de l'itinéraire…", ES: "Calculando la ruta…", RU: "Расчёт маршрута…", ZH: "正在计算路线…" },
  nav_proceed: { IT: "Prosegui", EN: "Continue", FR: "Continuez", ES: "Continúa", RU: "Продолжайте", ZH: "继续前行" },
  nav_in: { IT: "tra", EN: "in", FR: "dans", ES: "en", RU: "через", ZH: "还有" },
  nav_arrived: { IT: "Sei arrivato!", EN: "You've arrived!", FR: "Vous êtes arrivé !", ES: "¡Has llegado!", RU: "Вы прибыли!", ZH: "您已到达！" },
  nav_arrived_at: { IT: "Sei arrivato a", EN: "You arrived at", FR: "Vous êtes arrivé à", ES: "Has llegado a", RU: "Вы прибыли в", ZH: "您已到达" },
  nav_next_stop: { IT: "Vai alla prossima tappa", EN: "Go to next stop", FR: "Aller à l'étape suivante", ES: "Ir a la siguiente parada", RU: "К следующей точке", ZH: "前往下一站" },
  nav_repeat: { IT: "Ripeti istruzione", EN: "Repeat instruction", FR: "Répéter l'instruction", ES: "Repetir instrucción", RU: "Повторить указание", ZH: "重复指令" },
  nav_stop: { IT: "Ferma navigazione", EN: "Stop navigation", FR: "Arrêter la navigation", ES: "Detener navegación", RU: "Остановить навигацию", ZH: "停止导航" },
  // Itinerari offline (lista) — prima hardcoded in IT
  offline_itineraries_title: { IT: "Itinerari Offline", EN: "Offline Itineraries", FR: "Itinéraires hors ligne", ES: "Itinerarios sin conexión", RU: "Офлайн-маршруты", ZH: "离线行程" },
  offline_saved_count: { IT: "salvati", EN: "saved", FR: "enregistrés", ES: "guardados", RU: "сохранено", ZH: "已保存" },
  offline_none: { IT: "Nessun itinerario scaricato", EN: "No downloaded itineraries", FR: "Aucun itinéraire téléchargé", ES: "Ningún itinerario descargado", RU: "Нет загруженных маршрутов", ZH: "没有已下载的行程" },
  offline_none_hint: { IT: "Usa il bottone 'Offline' dentro un itinerario generato", EN: "Use the 'Offline' button inside a generated itinerary", FR: "Utilisez le bouton « Hors ligne » dans un itinéraire généré", ES: "Usa el botón 'Sin conexión' dentro de un itinerario generado", RU: "Нажмите «Офлайн» внутри созданного маршрута", ZH: "在已生成的行程中使用“离线”按钮" },
  offline_saved_on: { IT: "Salvato il:", EN: "Saved on:", FR: "Enregistré le :", ES: "Guardado el:", RU: "Сохранено:", ZH: "保存于：" },
  offline_open: { IT: "Apri Offline", EN: "Open Offline", FR: "Ouvrir hors ligne", ES: "Abrir sin conexión", RU: "Открыть офлайн", ZH: "离线打开" },
  // Navigation & Core Tabs
  explore: {
    IT: "Esplora",
    EN: "Explore",
    FR: "Explorer",
    ES: "Explorar",
    RU: "Исследовать",
    ZH: "探索"
  },
  itinerary: {
    IT: "Itinerario",
    EN: "Itinerary",
    FR: "Itinéraire",
    ES: "Itinerario",
    RU: "Маршрут",
    ZH: "行程"
  },
  guide: {
    IT: "Guida",
    EN: "Guide",
    FR: "Guide",
    ES: "Guía",
    RU: "Путеводитель",
    ZH: "导览"
  },
  profile: {
    IT: "Profilo",
    EN: "Profile",
    FR: "Profil",
    ES: "Perfil",
    RU: "Профиль",
    ZH: "个人"
  },
  
  // Category Chips
  monumenti: {
    IT: "Monumenti",
    EN: "Monuments",
    FR: "Monuments",
    ES: "Monumentos",
    RU: "Памятники",
    ZH: "历史遗迹"
  },
  chiese: {
    IT: "Chiese",
    EN: "Churches",
    FR: "Églises",
    ES: "Iglesias",
    RU: "Церкви",
    ZH: "教堂"
  },
  musei: {
    IT: "Musei",
    EN: "Museums",
    FR: "Musées",
    ES: "Museos",
    RU: "Музеи",
    ZH: "博物馆"
  },
  panorami: {
    IT: "Panorami",
    EN: "Views",
    FR: "Panoramas",
    ES: "Vistas",
    RU: "Панорамы",
    ZH: "全景"
  },
  gemme: {
    IT: "Gemme",
    EN: "Gems",
    FR: "Gemmes",
    ES: "Gemas",
    RU: "Жемчужины",
    ZH: "隐藏瑰宝"
  },
  locali: {
    IT: "Locali",
    EN: "Food & Drinks",
    FR: "Gastronomie",
    ES: "Gastronomía",
    RU: "Заведения",
    ZH: "美食与餐饮"
  },
  utilita: {
    IT: "Utilità",
    EN: "Utilities",
    FR: "Utilités",
    ES: "Utilidades",
    RU: "Услуги",
    ZH: "实用设施"
  },
  famiglie: {
    IT: "Famiglie",
    EN: "Families",
    FR: "Familles",
    ES: "Familias",
    RU: "Семья",
    ZH: "亲子家庭"
  },
  eventi: {
    IT: "Eventi",
    EN: "Events",
    FR: "Événements",
    ES: "Eventos",
    RU: "События",
    ZH: "精彩活动"
  },
  esperienze_locali: {
    IT: "Esperienze Locali",
    EN: "Local Experiences",
    FR: "Expériences Locales",
    ES: "Experiencias Locales",
    RU: "Местный опыт",
    ZH: "当地深度体验"
  },
  
  // Subcategories
  monumento: {
    IT: "Monumento",
    EN: "Monument",
    FR: "Monument",
    ES: "Monumento",
    RU: "Памятник",
    ZH: "纪念碑"
  },
  chiesa: {
    IT: "Chiesa",
    EN: "Church",
    FR: "Église",
    ES: "Iglesia",
    RU: "Церковь",
    ZH: "教堂"
  },
  museo: {
    IT: "Museo",
    EN: "Museum",
    FR: "Musée",
    ES: "Museo",
    RU: "Музей",
    ZH: "博物馆"
  },
  panorama: {
    IT: "Panorama",
    EN: "Viewpoint",
    FR: "Panorama",
    ES: "Panorama",
    RU: "Панорама",
    ZH: "观景点/全景"
  },
  piazza: {
    IT: "Piazza",
    EN: "Square",
    FR: "Place",
    ES: "Plaza",
    RU: "Площадь",
    ZH: "广场"
  },
  arte: {
    IT: "Arte",
    EN: "Art",
    FR: "Art",
    ES: "Arte",
    RU: "Искусство",
    ZH: "艺术品"
  },
  ristorante: {
    IT: "Ristorante",
    EN: "Restaurant",
    FR: "Restaurant",
    ES: "Restaurante",
    RU: "Ресторан",
    ZH: "餐厅"
  },
  pizza: {
    IT: "Pizzeria",
    EN: "Pizza",
    FR: "Pizzeria",
    ES: "Pizzería",
    RU: "Пиццерия",
    ZH: "比萨店"
  },
  pesce: {
    IT: "Ristorante di Pesce",
    EN: "Seafood Restaurant",
    FR: "Restaurant de Poisson",
    ES: "Restaurante de Pescado",
    RU: "Рыбный ресторан",
    ZH: "海鲜餐厅"
  },
  carne: {
    IT: "Braceria / Carne",
    EN: "Steakhouse",
    FR: "Steakhouse",
    ES: "Asador",
    RU: "Мясной ресторан",
    ZH: "牛排馆/烤肉"
  },
  sushi: {
    IT: "Sushi",
    EN: "Sushi",
    FR: "Sushi",
    ES: "Sushi",
    RU: "Суши",
    ZH: "寿司"
  },
  vegetariano: {
    IT: "Vegetariano",
    EN: "Vegetarian",
    FR: "Végétarien",
    ES: "Vegetariano",
    RU: "Вегетарианское",
    ZH: "素食/有机"
  },
  bar_caffe: {
    IT: "Bar & Caffè",
    EN: "Bar & Café",
    FR: "Bar & Café",
    ES: "Bar y Café",
    RU: "Бар и кафе",
    ZH: "咖啡酒吧"
  },
  gelati: {
    IT: "Gelateria",
    EN: "Gelato Shop",
    FR: "Glacier",
    ES: "Heladería",
    RU: "Магазин мороженого",
    ZH: "冰淇淋店"
  },
  gluten_free_only: {
    IT: "Solo Senza Glutine",
    EN: "Strictly Gluten-Free",
    FR: "Uniquement Sans Gluten",
    ES: "Solo Sin Gluten",
    RU: "Только без глютена",
    ZH: "纯无麸质"
  },
  gluten_free_options: {
    IT: "Opzioni Senza Glutine",
    EN: "Gluten-Free Options",
    FR: "Options Sans Gluten",
    ES: "Opciones Sin Gluten",
    RU: "Есть безглютеновое меню",
    ZH: "有无麸质餐食"
  },
  fontanella: {
    IT: "Fontanella",
    EN: "Drinking Water",
    FR: "Eau Potable",
    ES: "Agua Potable",
    RU: "Питьевой фонтанчик",
    ZH: "饮用水/喷泉"
  },
  bagni: {
    IT: "Bagni Pubblici",
    EN: "Public Restrooms",
    FR: "Toilettes Publiques",
    ES: "Aseos Públicos",
    RU: "Общественный туалет",
    ZH: "公共卫生间"
  },
  farmacia: {
    IT: "Farmacia",
    EN: "Pharmacy",
    FR: "Pharmacie",
    ES: "Farmacia",
    RU: "Аптека",
    ZH: "药店"
  },
  ospedale: {
    IT: "Ospedale / Pronto Soccorso",
    EN: "Hospital / Emergency",
    FR: "Hôpital / Urgences",
    ES: "Hospital / Urgencias",
    RU: "Больница / Скорая помощь",
    ZH: "医院/急诊"
  },
  taxi: {
    IT: "Stazionamento Taxi",
    EN: "Taxi Stand",
    FR: "Station de Taxi",
    ES: "Parada de Taxi",
    RU: "Стоянка такси",
    ZH: "出租车乘车点"
  },
  stazione_fs: {
    IT: "Stazione Ferroviaria",
    EN: "Train Station",
    FR: "Gare ferroviaire",
    ES: "Estación de Tren",
    RU: "Железнодорожный вокзал",
    ZH: "火车站"
  },
  metro: {
    IT: "Metropolitana",
    EN: "Subway Station",
    FR: "Station de Métro",
    ES: "Estación de Metro",
    RU: "Станция метро",
    ZH: "地铁站"
  },
  aeroporto: {
    IT: "Aeroporto",
    EN: "Airport",
    FR: "Aéroport",
    ES: "Aeropuerto",
    RU: "Аэропорт",
    ZH: "机场"
  },
  autostrada: {
    IT: "Autostrada",
    EN: "Highway",
    FR: "Autoroute",
    ES: "Autopista",
    RU: "Автомагистраль",
    ZH: "高速公路"
  },
  parco_giochi: {
    IT: "Parco Giochi",
    EN: "Playground",
    FR: "Aire de jeux",
    ES: "Parque Infantil",
    RU: "Детская площадка",
    ZH: "儿童游乐场"
  },
  divertimento: {
    IT: "Parco Divertimenti",
    EN: "Amusement Park",
    FR: "Parc d'attractions",
    ES: "Parque de Atracciones",
    RU: "Пак развлечений",
    ZH: "主题游乐园"
  },
  acquario: {
    IT: "Acquario",
    EN: "Aquarium",
    FR: "Aquarium",
    ES: "Acuario",
    RU: "Аквариум",
    ZH: "水族馆"
  },
  zoo: {
    IT: "Zoo",
    EN: "Zoo",
    FR: "Zoo",
    ES: "Zoológico",
    RU: "Зоопарк",
    ZH: "动物园"
  },
  artigianato: {
    IT: "Bottega Artigiana",
    EN: "Artisan Workshop",
    FR: "Atelier d'artisan",
    ES: "Taller Artesano",
    RU: "Ремесленная мастерская",
    ZH: "手工艺工作坊"
  },
  mercato: {
    IT: "Mercato Locale",
    EN: "Local Market",
    FR: "Marché Local",
    ES: "Mercado Local",
    RU: "Местный рынок",
    ZH: "当地集市"
  },
  gastronomia: {
    IT: "Gastronomia / Delicatessen",
    EN: "Delicatessen",
    FR: "Épicerie fine",
    ES: "Gastronomía / Delicatessen",
    RU: "Гастрономия",
    ZH: "特色美食/熟食店"
  },

  // Planner Screen
  planner_title: {
    IT: "Trip Planner",
    EN: "Trip Planner",
    FR: "Trip Planner",
    ES: "Planificatore",
    RU: "Планировщик",
    ZH: "智能行程规划"
  },
  planner_desc: {
    IT: "Crea il tuo viaggio perfetto con WIP l'esperto di viaggi",
    EN: "Create your perfect trip with WIP, the travel expert",
    FR: "Créez votre voyage parfait avec WIP, l'expert voyage",
    ES: "Crea tu viaje perfecto con WIP, el experto en viajes",
    RU: "Создайте идеальное путешествие с WIP, экспертом по поездкам",
    ZH: "与智能旅行专家 WIP 一起规划您的完美旅程"
  },
  auto_mode: {
    IT: "Modalità Automatica",
    EN: "Automatic Mode",
    FR: "Mode Automatique",
    ES: "Modo Automático",
    RU: "Автоматический режим",
    ZH: "自动规划模式"
  },
  auto_mode_desc: {
    IT: "Dimmi dove vuoi andare e per quanto tempo. L'AI farà il resto.",
    EN: "Tell me where you want to go and for how long. The AI does the rest.",
    FR: "Dites-moi où vous voulez aller et pour combien de temps. L'IA s'occupe du reste.",
    ES: "Dime a dónde quieres ir y por cuánto tiempo. La IA hará el resto.",
    RU: "Скажите, куда вы хотите поехать и на сколько. ИИ сделает все остальное.",
    ZH: "告诉我您的目的地和天数，AI 将为您打理一切。"
  },
  favorites_mode: {
    IT: "Dai Miei Preferiti",
    EN: "From My Favorites",
    FR: "Depuis Mes Favoris",
    ES: "De Mis Favoritos",
    RU: "Из избранного",
    ZH: "从我的收藏生成"
  },
  favorites_mode_desc: {
    IT: "Crea un percorso ottimizzato partendo dai luoghi che hai salvato nel Diario.",
    EN: "Create an optimized path starting from the places saved in your Diary.",
    FR: "Créez un parcours optimisé à partir des lieux enregistrés dans votre Journal.",
    ES: "Crea un recorrido optimizado a partir de los lugares guardados en tu Diario.",
    RU: "Создайте оптимизированный маршрут на основе мест, сохраненных в вашем дневнике.",
    ZH: "根据您在旅行日记中收藏的地点生成最优化路线。"
  },
  offline_mode: {
    IT: "Itinerari Scaricati",
    EN: "Downloaded Itineraries",
    FR: "Itinéraires Téléchargés",
    ES: "Itinerarios Descargados",
    RU: "Скачанные маршруты",
    ZH: "已下载的离线行程"
  },
  offline_mode_desc: {
    IT: "Consulta offline gli itinerari salvati. Nessun consumo dati.",
    EN: "Consult saved itineraries offline. Zero data usage.",
    FR: "Consultez vos itinéraires enregistrés hors ligne. Zéro data.",
    ES: "Consulta tus itinerarios guardados sin conexión. Cero consumo.",
    RU: "Просматривайте сохраненные маршруты офлайн. Без расхода данных.",
    ZH: "离线查看保存的行程，无需消耗任何流量。"
  },
  destination: {
    IT: "Destinazione",
    EN: "Destination",
    FR: "Destination",
    ES: "Destino",
    RU: "Направление",
    ZH: "目的地"
  },
  duration: {
    IT: "Durata Viaggio",
    EN: "Trip Duration",
    FR: "Durée du Voyage",
    ES: "Duración del Viaje",
    RU: "Длительность поездки",
    ZH: "旅程天数"
  },
  giorno: {
    IT: "giorno",
    EN: "day",
    FR: "jour",
    ES: "día",
    RU: "день",
    ZH: "天"
  },
  giorni: {
    IT: "giorni",
    EN: "days",
    FR: "jours",
    ES: "días",
    RU: "дней",
    ZH: "天"
  },
  day: {
    IT: "Giorno",
    EN: "Day",
    FR: "Jour",
    ES: "Día",
    RU: "День",
    ZH: "第"
  },
  start_time: {
    IT: "Inizio Giornata",
    EN: "Start Time",
    FR: "Début de Journée",
    ES: "Inicio del Día",
    RU: "Начало дня",
    ZH: "出发时间"
  },
  end_time: {
    IT: "Fine Giornata",
    EN: "End Time",
    FR: "Fin de Journée",
    ES: "Fin del Día",
    RU: "Конец дня",
    ZH: "结束时间"
  },
  interests: {
    IT: "I Tuoi Interessi",
    EN: "Your Interests",
    FR: "Vos Intérêts",
    ES: "Tus Intereses",
    RU: "Ваши интересы",
    ZH: "旅行偏好"
  },
  special_requests: {
    IT: "Richieste Particolari (Opzionale)",
    EN: "Special Requests (Optional)",
    FR: "Demandes Spéciales (Optionnel)",
    ES: "Peticiones Especiales (Opcional)",
    RU: "Особые пожелания (Опционально)",
    ZH: "个性化需求（选填）"
  },
  btn_generate: {
    IT: "GENERA ITINERARIO",
    EN: "GENERATE ITINERARY",
    FR: "GÉNÉRER L'ITINÉRAIRE",
    ES: "GENERAR ITINERARIO",
    RU: "СОЗДАТЬ МАРШРУТ",
    ZH: "一键生成智能行程"
  },
  btn_optimize: {
    IT: "OTTIMIZZA PERCORSO",
    EN: "OPTIMIZE ROUTE",
    FR: "OPTIMISER LE PARCOURS",
    ES: "OPTIMIZAR RUTA",
    RU: "ОПТИМИЗИРОВАТЬ ПУТЬ",
    ZH: "优化旅行路线"
  },
  regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Перегенерировать",
    ZH: "重新生成"
  },
  offline_btn: {
    IT: "Offline",
    EN: "Offline",
    FR: "Hors ligne",
    ES: "Sin conexión",
    RU: "Офлайн",
    ZH: "离线保存"
  },
  navigate: {
    IT: "Naviga",
    EN: "Navigate",
    FR: "Naviguer",
    ES: "Navegar",
    RU: "Навигация",
    ZH: "导航导览"
  },
  gps_active: {
    IT: "Audio GPS",
    EN: "GPS Audio",
    FR: "GPS Audio",
    ES: "Audio GPS",
    RU: "Аудио GPS",
    ZH: "GPS语音"
  },
  time_expected: {
    IT: "Tempo previsto",
    EN: "Estimated time",
    FR: "Temps prévu",
    ES: "Tiempo estimado",
    RU: "Ожидаемое время",
    ZH: "预计游览时长"
  },
  movement: {
    IT: "Spostamento",
    EN: "Travel",
    FR: "Déplacement",
    ES: "Desplazamiento",
    RU: "Перемещение",
    ZH: "交通方式"
  },
  details_offline: {
    IT: "Dettagli & Salva Offline",
    EN: "Details & Save Offline",
    FR: "Détails & Hors ligne",
    ES: "Detalles y Sin conexión",
    RU: "Детали и Офлайн",
    ZH: "详情与离线保存"
  },

  // POI Detail Sheet
  show_basic_options: {
    IT: "Mostra Opzioni di Base",
    EN: "Show Basic Options",
    FR: "Afficher les Options de Base",
    ES: "Mostrar Opciones Básicas",
    RU: "Показать основные параметры",
    ZH: "显示基本选项"
  },
  hide_basic_options: {
    IT: "Nascondi Opzioni di Base",
    EN: "Hide Basic Options",
    FR: "Masquer les Options de Base",
    ES: "Ocultar Opciones Básicas",
    RU: "Скрыть основные параметры",
    ZH: "隐藏基本选项"
  },
  reviews: {
    IT: "recensioni",
    EN: "reviews",
    FR: "avis",
    ES: "reseñas",
    RU: "отзывов",
    ZH: "条评价"
  },
  from_you: {
    IT: "da te",
    EN: "from you",
    FR: "de vous",
    ES: "de ti",
    RU: "от вас",
    ZH: "距您"
  },
  save_plan: {
    IT: "Salva nel piano",
    EN: "Save to plan",
    FR: "Ajouter au plan",
    ES: "Guardar en plan",
    RU: "Добавить в план",
    ZH: "保存至行程"
  },
  remove_plan: {
    IT: "Rimuovi dal piano",
    EN: "Remove from plan",
    FR: "Retirer du plan",
    ES: "Quitar del plan",
    RU: "Убрать из плана",
    ZH: "移出行程"
  },
  remove_favorites: {
    IT: "Rimuovi dai preferiti",
    EN: "Remove from favorites",
    FR: "Retirer des favoris",
    ES: "Quitar de favoritos",
    RU: "Удалить из избранного",
    ZH: "取消收藏"
  },
  period_month: {
    IT: "Periodo / Mese",
    EN: "Period / Month",
    FR: "Période / Mois",
    ES: "Período / Mes",
    RU: "Период / Месяц",
    ZH: "期间/月份"
  },
  generic_any: {
    IT: "Qualsiasi",
    EN: "Any",
    FR: "N'importe quel",
    ES: "Cualquiera",
    RU: "Любой",
    ZH: "任何"
  },
  website: {
    IT: "Sito Web",
    EN: "Website",
    FR: "Site Web",
    ES: "Sitio Web",
    RU: "Веб-сайт",
    ZH: "官方网站"
  },
  call: {
    IT: "Chiama",
    EN: "Call",
    FR: "Appeler",
    ES: "Llamar",
    RU: "Позвонить",
    ZH: "联系电话"
  },
  explore_nearby: {
    IT: "Esplora Dintorni",
    EN: "Explore Nearby",
    FR: "Explorer les Alentours",
    ES: "Explorar Alrededores",
    RU: "Исследовать окрестности",
    ZH: "探索周边景点"
  },
  other_attractions: {
    IT: "altre attrazioni entro 1000m",
    EN: "other attractions within 1000m",
    FR: "autres attractions à moins de 1000m",
    ES: "otras atracciones a menos de 1000m",
    RU: "других мест в радиусе 1000м",
    ZH: "千米以内的周边景点"
  },
  detailed_description: {
    IT: "Descrizione Dettagliata",
    EN: "Detailed Description",
    FR: "Description Détaillée",
    ES: "Descripción Detallada",
    RU: "Подробное описание",
    ZH: "详细介绍"
  },
  artwork_details: {
    IT: "Dettagli dell'Opera",
    EN: "Artwork Details",
    FR: "Détails de l'Œuvre",
    ES: "Detalles de la Obra",
    RU: "Детали объекта",
    ZH: "艺术与历史细节"
  },
  author: {
    IT: "Autore / Artista",
    EN: "Author / Artist",
    FR: "Auteur / Artiste",
    ES: "Autor / Artista",
    RU: "Автор / Художник",
    ZH: "创作者/艺术家"
  },
  period: {
    IT: "Periodo Storico",
    EN: "Historical Period",
    FR: "Période Historique",
    ES: "Periodo Histórico",
    RU: "Исторический период",
    ZH: "历史时期"
  },
  curiosity: {
    IT: "Curiosità",
    EN: "Fun Fact",
    FR: "Anecdote",
    ES: "Curiosidades",
    RU: "Интересный факт",
    ZH: "趣味小常识"
  },
  premium_exclusive: {
    IT: "ESCLUSIVA PREMIUM",
    EN: "PREMIUM EXCLUSIVE",
    FR: "EXCLUSIVITÉ PREMIUM",
    ES: "EXCLUSIVA PREMIUM",
    RU: "ПРЕМИУМ ЭКСКЛЮЗИВ",
    ZH: "PREMIUM 会员专属"
  },
  megaphone: {
    IT: "MEGAFONO",
    EN: "MEGAPHONE",
    FR: "MÉGAPHONE",
    ES: "MEGÁFONO",
    RU: "МЕГАФОН",
    ZH: "扩音模式"
  },
  more_info: {
    IT: "Richiedi più informazioni",
    EN: "Ask for more details",
    FR: "Demander plus de détails",
    ES: "Solicitar más detalles",
    RU: "Узнать больше подробностей",
    ZH: "获取更详细的语音解说"
  },
  save_audio: {
    IT: "Salva Audio Offline",
    EN: "Save Audio Offline",
    FR: "Enregistrer l'audio",
    ES: "Guardar Audio Offline",
    RU: "Скачать аудио офлайн",
    ZH: "保存离线语音导览"
  },
  audio_hint: {
    IT: "💡 Ascolta prima l'audio (premi Play) per abilitare il salvataggio offline.",
    EN: "💡 Listen to the audio first (press Play) to enable offline saving.",
    FR: "💡 Écoutez d'abord l'audio (appuyez sur Play) per l'enregistrer hors ligne.",
    ES: "💡 Escucha primero il audio (pulsa Play) para habilitar el guardado offline.",
    RU: "💡 Сначала прослушайте аудио (нажмите Play), чтобы скачать его.",
    ZH: "💡 友情提示：请先点击播放（Play）试听语音，即可解锁离线保存功能。"
  },

  // Profile / Settings Panel
  my_discoveries: {
    IT: "Le Mie Scoperte",
    EN: "My Discoveries",
    FR: "Mes Découvertes",
    ES: "Mis Descubrimientos",
    RU: "Мои открытия",
    ZH: "我的足迹与发现"
  },
  places: {
    IT: "Luoghi",
    EN: "Places",
    FR: "Lieux",
    ES: "Lugares",
    RU: "Мест",
    ZH: "个地点"
  },
  no_gems: {
    IT: "Nessuna gemma salvata",
    EN: "No saved gems yet",
    FR: "Aucune gemme enregistrée",
    ES: "Ninguna gema guardada",
    RU: "Нет сохраненных жемчужин",
    ZH: "旅行日记空空如也"
  },
  no_gems_desc: {
    IT: "Esplora la mappa e salva i tuoi luoghi preferiti per trovarli qui!",
    EN: "Explore the map and save your favorite places to find them here!",
    FR: "Explorez la carte et enregistrez vos lieux favoris pour les retrouver ici!",
    ES: "¡Explora el mapa y guarda tus lugares favoritos para encontrarlos aquí!",
    RU: "Исследуйте карту и сохраняйте любимые места, чтобы они появились здесь!",
    ZH: "快去探索周边的地图，收藏您心仪的地方吧！"
  },
  diary: {
    IT: "DIARIO",
    EN: "DIARY",
    FR: "JOURNAL",
    ES: "DIARIO",
    RU: "ДНЕВНИК",
    ZH: "旅行日记"
  },
  itinerari_tab: {
    IT: "ITINERARI",
    EN: "ITINERARIES",
    FR: "ITINÉRAIRES",
    ES: "ITINERARIOS",
    RU: "МАРШРУТЫ",
    ZH: "行程规划"
  },
  history_tab: {
    IT: "ARCHIVIO",
    EN: "ARCHIVE",
    FR: "ARCHIVE",
    ES: "ARCHIVO",
    RU: "АРХИВ",
    ZH: "存档"
  },
  setup_tab: {
    IT: "SETUP",
    EN: "SETUP",
    FR: "CONFIG",
    ES: "AJUSTES",
    RU: "НАСТРОЙКИ",
    ZH: "应用设置"
  },
  premium_tab: {
    IT: "PREMIUM",
    EN: "PREMIUM",
    FR: "PREMIUM",
    ES: "PREMIUM",
    RU: "ПРЕМИУМ",
    ZH: "WIP 会员"
  },
  hotel_tab: {
    IT: "HOTEL",
    EN: "HOTELS",
    FR: "HÔTELS",
    ES: "HOTELES",
    RU: "ОТЕЛИ",
    ZH: "酒店合作"
  },
  app_settings: {
    IT: "Impostazioni App",
    EN: "App Settings",
    FR: "Paramètres de l'App",
    ES: "Ajustes de la Aplicación",
    RU: "Настройки приложения",
    ZH: "系统与个性化设置"
  },
  personal_area: {
    IT: "Area Personale",
    EN: "Personal Profile",
    FR: "Profil Personnel",
    ES: "Perfil Personal",
    RU: "Личный профиль",
    ZH: "个人资料"
  },
  personal_desc: {
    IT: "Personalizza nome e foto profilo",
    EN: "Customize your name and profile photo",
    FR: "Personnalisez votre nom et photo de profil",
    ES: "Personaliza tu nombre y foto de perfil",
    RU: "Настройте имя и аватар профиля",
    ZH: "设置您的专属昵称与头像"
  },
  display_name: {
    IT: "Nome Mostrato",
    EN: "Display Name",
    FR: "Nom d'Affichage",
    ES: "Nombre a Mostrar",
    RU: "Отображаемое имя",
    ZH: "昵称"
  },
  profile_photo: {
    IT: "Foto Profilo (Emoji o Carica)",
    EN: "Profile Photo (Emoji or Upload)",
    FR: "Photo de Profil (Emoji ou Fichier)",
    ES: "Foto de Perfil (Emoji o Cargar)",
    RU: "Аватар (Эмодзи или Файл)",
    ZH: "上传头像或选择Emoji"
  },
  browse: {
    IT: "Sfoglia...",
    EN: "Browse...",
    FR: "Parcourir...",
    ES: "Buscar...",
    RU: "Обзор...",
    ZH: "选择本地图片..."
  },
  default_location: {
    IT: "Posizione Predefinita",
    EN: "Default Location",
    FR: "Position par Défaut",
    ES: "Ubicación Predeterminada",
    RU: "Начальное местоположение",
    ZH: "常用初始位置"
  },
  default_location_desc: {
    IT: "Salva la tua posizione iniziale per la mappa",
    EN: "Save your starting location for the map",
    FR: "Enregistrez votre position de départ sur la carte",
    ES: "Guarda tu posición inicial para el mapa",
    RU: "Сохраните начальную точку для открытия карты",
    ZH: "自定义每次打开地图时的定位点"
  },
  search_city: {
    IT: "Cerca una città...",
    EN: "Search a city...",
    FR: "Rechercher une ville...",
    ES: "Buscar una ciudad...",
    RU: "Поиск города...",
    ZH: "查找城市并设为中心点..."
  },
  search_btn: {
    IT: "Cerca",
    EN: "Search",
    FR: "Rechercher",
    ES: "Buscar",
    RU: "Поиск",
    ZH: "定位"
  },
  use_current_location: {
    IT: "Usa la mia posizione attuale",
    EN: "Use my current location",
    FR: "Utiliser ma position actuelle",
    ES: "Usar mi ubicación actual",
    RU: "Использовать текущую геопозицию",
    ZH: "使用我当前的 GPS 定位"
  },
  default_location_hint: {
    IT: "La mappa si aprirà sempre da questa posizione se convalidata.",
    EN: "The map will always open at this location once validated.",
    FR: "La carte s'ouvrira toujours sur cette position une fois validée.",
    ES: "El mapa se abrirá siempre en esta ubicación una vez validada.",
    RU: "Карта всегда будет открываться на этой точке.",
    ZH: "验证通过后，每次进入应用时地图默认显示此区域。"
  },
  have_coupon: {
    IT: "Hai un codice partner?",
    EN: "Do you have a partner code?",
    FR: "Avez-vous un code partenaire?",
    ES: "¿Tienes un código de socio?",
    RU: "Есть партнерский код?",
    ZH: "您拥有酒店合作兑换码吗？"
  },
  redeem_coupon_desc: {
    IT: "Attiva i vantaggi Premium offerti dal tuo Hotel",
    EN: "Activate the Premium benefits offered by your Hotel",
    FR: "Activez les avantages Premium offerts par votre Hôtel",
    ES: "Activa las ventajas Premium que ofrece tu Hotel",
    RU: "Активируйте Премиум-доступ от вашего отеля",
    ZH: "激活您的合作酒店免费赠送的 Premium 会员权益"
  },
  redeem_btn: {
    IT: "Attiva",
    EN: "Activate",
    FR: "Activer",
    ES: "Activar",
    RU: "Активировать",
    ZH: "兑换"
  },
  redeem_verifying: {
    IT: "Verifica...",
    EN: "Verifying...",
    FR: "Vérification...",
    ES: "Verificando...",
    RU: "Проверка...",
    ZH: "验证中..."
  },
  redeem_success: {
    IT: "Coupon attivato! Extra Premium abilitato.",
    EN: "Coupon activated! Extra Premium enabled.",
    FR: "Code activé! Extra Premium activé.",
    ES: "¡Cupón activado! Beneficios Premium disponibles.",
    RU: "Код активирован! Премиум включен.",
    ZH: "兑换成功！您的Premium会员特权已激活。"
  },
  guide_mode: {
    IT: "Modalità Guida",
    EN: "Guide Mode",
    FR: "Mode Guide",
    ES: "Modo Guía",
    RU: "Режим гида",
    ZH: "语音导览讲解员"
  },
  guide_mode_desc: {
    IT: "Scegli la voce narrante",
    EN: "Choose the narrator voice",
    FR: "Choisissez la voix du narrateur",
    ES: "Elige la voz del narrador",
    RU: "Выберите голос рассказчика",
    ZH: "轻触切换您喜欢的语音助手"
  },
  signout: {
    IT: "Esci dall'Account",
    EN: "Sign Out of Account",
    FR: "Se Déconnecter",
    ES: "Cerrar Sesión",
    RU: "Выйти из аккаунта",
    ZH: "退出登录"
  },
  language_title: {
    IT: "Lingua di Sistema",
    EN: "System Language",
    FR: "Langue du Système",
    ES: "Idioma del Sistema",
    RU: "Язык системы",
    ZH: "应用语言 (Language)"
  },
  language_desc: {
    IT: "Traduci istantaneamente descrizioni, itinerari ed audioguide",
    EN: "Instantly translate descriptions, itineraries, and audio guides",
    FR: "Traduisez instantanément descriptions, itinéraires et guides audio",
    ES: "Traduce al instante descripciones, itinerarios y audioguías",
    RU: "Мгновенный перевод описаний, маршрутов и аудиогидов",
    ZH: "一键切换中文、英文等多语种，音频与文字秒速翻译"
  },
  loading_audio_nicky: {
    IT: 'Generando nuova "vibe" da Nicky...',
    EN: 'Generating new "vibe" by Nicky...',
    FR: 'Génération de la "vibe" de Nicky...',
    ES: 'Generando nueva "vibe" de Nicky...',
    RU: 'Создание новой «атмосферы» от Ники...',
    ZH: 'Nicky 正在为您定制个性化旅行氛围...'
  },
  loading_audio_dante: {
    IT: "Dante sta elaborando la descrizione storica...",
    EN: "Dante is crafting the historical narrative...",
    FR: "Dante élabore le récit historique...",
    ES: "Dante está elaborando la narración histórica...",
    RU: "Данте готовит историческое повествование...",
    ZH: "但丁正在撰写历史典故..."
  },
  
  // Premium Tab (Pricing.tsx)
  premium_title: {
    IT: "Sblocca il Premium",
    EN: "Unlock Premium",
    FR: "Débloquez Premium",
    ES: "Desbloquee Premium",
    RU: "Разблокировать Премиум",
    ZH: "升级 WIP Premium"
  },
  premium_desc: {
    IT: "Costruisci itinerari senza limiti e goditi ogni dettaglio con le audioguide. Scegli il piano più adatto a te.",
    EN: "Build unlimited itineraries and enjoy every detail with audio guides. Choose the plan that suits you best.",
    FR: "Créez des itinéraires illimités et profitez de chaque détail grâce aux guides audio. Choisissez le forfait idéal.",
    ES: "Cree itinerarios ilimitados y disfrute de cada detalle con las audioguías. Elija el plan que mejor se adapte a usted.",
    RU: "Планируйте поездки без ограничений и слушайте аудиогиды без лимитов. Выберите наиболее подходящий тариф.",
    ZH: "解锁无限次智能行程规划与语音导游功能。即刻开启前所未有的深度旅行体验。"
  },
  premium_popular: {
    IT: "Più Popolare",
    EN: "Most Popular",
    FR: "Le Plus Populaire",
    ES: "Más Popular",
    RU: "Популярный выбор",
    ZH: "最具性价比"
  },
  premium_select: {
    IT: "Seleziona",
    EN: "Select",
    FR: "Sélectionner",
    ES: "Seleccionar",
    RU: "Выбрать",
    ZH: "立即订阅"
  },
  premium_loading: {
    IT: "Caricamento...",
    EN: "Loading...",
    FR: "Chargement...",
    ES: "Cargando...",
    RU: "Загрузка...",
    ZH: "跳转支付中..."
  },
  premium_alert_login: {
    IT: "Devi effettuare l'accesso per abbonarti.",
    EN: "You must log in to subscribe.",
    FR: "Vous devez vous connecter pour vous abonner.",
    ES: "Debe iniciar sesión para suscribirse.",
    RU: "Вам необходимо войти в систему для оформления подписки.",
    ZH: "请先登录您的 WIP 账户，即可继续订阅。"
  },
  premium_plan_weekly: {
    IT: "Settimanale",
    EN: "Weekly",
    FR: "Hebdomadaire",
    ES: "Semanal",
    RU: "Недельный",
    ZH: "周度会员"
  },
  premium_plan_monthly: {
    IT: "Mensile",
    EN: "Monthly",
    FR: "Mensuel",
    ES: "Mensual",
    RU: "Месячный",
    ZH: "月度会员"
  },
  premium_plan_yearly: {
    IT: "Annuale",
    EN: "Yearly",
    FR: "Annuel",
    ES: "Anual",
    RU: "Годовой",
    ZH: "年度会员"
  },
  premium_period_week: {
    IT: "/ settimana",
    EN: "/ week",
    FR: "/ semaine",
    ES: "/ semana",
    RU: "/ неделю",
    ZH: "/ 周"
  },
  premium_period_month: {
    IT: "/ mese",
    EN: "/ month",
    FR: "/ mois",
    ES: "/ mes",
    RU: "/ месяц",
    ZH: "/ 月"
  },
  premium_period_year: {
    IT: "/ anno",
    EN: "/ year",
    FR: "/ an",
    ES: "/ año",
    RU: "/ год",
    ZH: "/ 年"
  },
  premium_feature_itineraries: {
    IT: "5 Itinerari al giorno",
    EN: "5 Itineraries per day",
    FR: "5 Itinéraires par jour",
    ES: "5 Itinerarios por día",
    RU: "5 маршрутов в день",
    ZH: "每日上限 5 个智能行程"
  },
  premium_feature_audioguides: {
    IT: "15 Audioguide al giorno",
    EN: "15 Audio guides per day",
    FR: "15 Guides audio par jour",
    ES: "15 Audioguías por día",
    RU: "15 аудиогидов в день",
    ZH: "每日上限 15 次语音解说"
  },
  premium_feature_ads: {
    IT: "Nessuna pubblicità",
    EN: "No ads",
    FR: "Sans publicité",
    ES: "Sin publicidad",
    RU: "Без рекламы",
    ZH: "纯净体验，无任何广告"
  },
  premium_feature_support: {
    IT: "Assistenza prioritaria",
    EN: "Priority support",
    FR: "Support prioritaire",
    ES: "Soporte prioritario",
    RU: "Приоритетная поддержка",
    ZH: "专属高级客服与技术支持"
  },
  premium_feature_savings: {
    IT: "Risparmio di 60€",
    EN: "Save 60€",
    FR: "Économisez 60€",
    ES: "Ahorre 60€",
    RU: "Скидка 60€",
    ZH: "超值特惠（立省 60 欧元）"
  },

  // Hotel Tab (B2BPartner.tsx)
  b2b_title: {
    IT: "Portale Strutture Ricettive",
    EN: "Hospitality Portal",
    FR: "Portail Hébergement",
    ES: "Portal de Alojamiento",
    RU: "Портал для отелей",
    ZH: "合作酒店服务管理中心"
  },
  b2b_desc: {
    IT: "Acquista pacchetti di coupon prepagati per offrire l'accesso Premium ai tuoi clienti durante il loro soggiorno.",
    EN: "Purchase prepaid coupon packages to offer Premium access to your guests during their stay.",
    FR: "Achetez des packs de coupons prépayés pour offrir un accès Premium à vos clients pendant leur séjour.",
    ES: "Adquiera paquetes de cupones prepagados para ofrecer acceso Premium a sus huéspedes durante su estancia.",
    RU: "Приобретайте пакеты предоплаченных купонов, чтобы предоставить вашим гостям Премиум-доступ на время их проживания.",
    ZH: "在此购买酒店客户专属优惠礼券包，让您的客人在入住期间免费享受 WIP 智能导览与行程规划服务。"
  },
  b2b_success_title: {
    IT: "Acquisto Completato!",
    EN: "Purchase Completed!",
    FR: "Achat Terminé!",
    ES: "¡Compra Completada!",
    RU: "Покупка успешно совершена!",
    ZH: "支付成功，礼券已到账！"
  },
  b2b_success_desc: {
    IT: "I tuoi coupon sono stati generati. Cerca il nome della tua struttura per visualizzarli.",
    EN: "Your coupons have been generated. Search for your accommodation name to view them.",
    FR: "Vos coupons ont été générés. Recherchez le nom de votre établissement pour les afficher.",
    ES: "Sus cupones han sido generados. Busque el nombre de su establecimiento para verlos.",
    RU: "Ваши купоны были успешно созданы. Введите название отеля для их отображения.",
    ZH: "您的兑换券已生成完毕。请输入您的酒店名称进行查询与分配。"
  },
  b2b_structure_title: {
    IT: "La tua Struttura",
    EN: "Your Accommodation",
    FR: "Votre Établissement",
    ES: "Su Establecimiento",
    RU: "Ваш отель",
    ZH: "酒店基本信息"
  },
  b2b_structure_placeholder: {
    IT: "Nome dell'Hotel / Residence",
    EN: "Hotel / Residence Name",
    FR: "Nom de l'Hôtel / Résidence",
    ES: "Nombre del Hotel / Residencia",
    RU: "Название отеля или апартаментов",
    ZH: "请输入酒店或公寓名称..."
  },
  b2b_search: {
    IT: "Cerca",
    EN: "Search",
    FR: "Rechercher",
    ES: "Buscar",
    RU: "Найти",
    ZH: "查询"
  },
  b2b_price_validity: {
    IT: "Validità 7 giorni/cad.",
    EN: "7-day validity each",
    FR: "Validité 7 jours chacun",
    ES: "Validez de 7 días cada uno",
    RU: "Срок действия: 7 дней каждый",
    ZH: "每张券有效期为7天"
  },
  b2b_price_codes: {
    IT: "Codici",
    EN: "Codes",
    FR: "Codes",
    ES: "Códigos",
    RU: "кодов",
    ZH: "个兑换码"
  },
  b2b_purchase: {
    IT: "Acquista",
    EN: "Buy",
    FR: "Acheter",
    ES: "Comprar",
    RU: "Купить",
    ZH: "立即购买"
  },
  b2b_best_seller: {
    IT: "PIÙ VENDUTO",
    EN: "BEST SELLER",
    FR: "MEILLEURE VENTE",
    ES: "MÁS VENDIDO",
    RU: "ХИТ ПРОДАЖ",
    ZH: "精选热销"
  },
  b2b_coupons_title: {
    IT: "I Tuoi Coupon",
    EN: "Your Coupons",
    FR: "Vos Coupons",
    ES: "Sus Cupones",
    RU: "Ваши купоны",
    ZH: "已购礼券列表"
  },
  b2b_coupons_desc: {
    IT: "Codici generati per",
    EN: "Codes generated for",
    FR: "Codes générés pour",
    ES: "Códigos generados para",
    RU: "Коды, созданные для",
    ZH: "已为您成功生成激活码，归属单位："
  },
  b2b_download_csv: {
    IT: "Scarica CSV",
    EN: "Download CSV",
    FR: "Télécharger CSV",
    ES: "Descargar CSV",
    RU: "Скачать CSV",
    ZH: "导出 CSV 电子表格"
  },
  b2b_used: {
    IT: "Utilizzato",
    EN: "Used",
    FR: "Utilisé",
    ES: "Utilizado",
    RU: "Использован",
    ZH: "已激活使用"
  },
  b2b_available: {
    IT: "Disponibile",
    EN: "Available",
    FR: "Disponible",
    ES: "Disponible",
    RU: "Свободен",
    ZH: "未使用 (待分配)"
  },
  b2b_alert_fill_name: {
    IT: "Inserisci il nome della tua struttura prima di procedere",
    EN: "Please enter your accommodation name before proceeding",
    FR: "Veuillez saisir le nom de votre établissement avant de continuer",
    ES: "Por favor, introduzca el nombre de su establecimiento antes de continuar",
    RU: "Пожалуйста, введите название отеля перед продолжением",
    ZH: "在继续购买前，请先输入您的酒店名称以进行绑定登记"
  },
  b2b_csv_header_code: {
    IT: "Codice",
    EN: "Code",
    FR: "Code",
    ES: "Código",
    RU: "Код",
    ZH: "兑换码"
  },
  b2b_csv_header_status: {
    IT: "Stato",
    EN: "Status",
    FR: "Statut",
    ES: "Estado",
    RU: "Статус",
    ZH: "使用状态"
  },
  b2b_csv_header_expiry: {
    IT: "Scadenza",
    EN: "Expiry",
    FR: "Expiration",
    ES: "Expiración",
    RU: "Истечение срока",
    ZH: "有效天数"
  },
  b2b_csv_days: {
    IT: "giorni",
    EN: "days",
    FR: "jours",
    ES: "días",
    RU: "дней",
    ZH: "天"
  },

  // AI Camera Screen (CameraScreen.tsx)
  camera_unavailable: {
    IT: "Fotocamera non disponibile",
    EN: "Camera not available",
    FR: "Appareil photo non disponible",
    ES: "Cámara no disponible",
    RU: "Камера недоступна",
    ZH: "未检测到或无法开启摄像头"
  },
  camera_unavailable_desc: {
    IT: "Carica una foto dalla tua galleria per identificare il monumento.",
    EN: "Upload a photo from your gallery to identify the monument.",
    FR: "Téléchargez une photo de votre galerie pour identifier le monument.",
    ES: "Cargue una foto de su galería para identificar el monumento.",
    RU: "Загрузите фотографию из галереи, чтобы распознать памятник.",
    ZH: "您可以从手机相册中上传一张照片，让我们帮您识别出这个历史建筑。"
  },
  camera_upload_photo: {
    IT: "CARICA FOTO",
    EN: "UPLOAD PHOTO",
    FR: "CHARGER LA PHOTO",
    ES: "CARGAR FOTO",
    RU: "ЗАГРУЗИТЬ ФОТО",
    ZH: "从相册上传"
  },
  camera_viewfinder_hint: {
    IT: "Inquadra un monumento",
    EN: "Frame a monument",
    FR: "Cadrez un monument",
    ES: "Encuadre un monumento",
    RU: "Направьте камеру на памятник",
    ZH: "请将镜头对准历史建筑或雕像"
  },
  camera_scanning: {
    IT: "Analisi in corso",
    EN: "Analyzing...",
    FR: "Analyse en cours...",
    ES: "Analizando...",
    RU: "Распознавание...",
    ZH: "正在利用 AI 进行智能识别..."
  },
  camera_scanning_desc: {
    IT: "Interrogando la guida AI...",
    EN: "Querying AI guide...",
    FR: "Interrogation du guide IA...",
    ES: "Consultando la guía IA...",
    RU: "Запрос к ИИ-путеводителю...",
    ZH: "正在检索 WIP 云端数据库与AI导游..."
  },
  camera_error_title: {
    IT: "Ops!",
    EN: "Oops!",
    FR: "Oups!",
    ES: "¡Ops!",
    RU: "Ой!",
    ZH: "提示"
  },
  camera_error_not_recognized: {
    IT: "Scusa, non riesco a riconoscere questo monumento. Potrebbe non essere in Italia o l'immagine non è chiara.",
    EN: "Sorry, I can't recognize this monument. It might not be in Italy or the image is not clear.",
    FR: "Désolé, je ne parviens pas à reconnaître ce monument. Il se peut qu'il ne soit pas en Italie ou que l'image ne soit pas claire.",
    ES: "Lo siento, no puedo reconocer este monumento. Puede que no esté en Italia o que la imagen no sea clara.",
    RU: "Извините, не удалось распознать этот памятник. Возможно, он находится не в Италии или фото нечеткое.",
    ZH: "很抱歉，我们无法准确识别此建筑。建议拍摄更清晰的角度，或者它可能不在我们的收录范围内。"
  },
  camera_error_quota: {
    IT: "Hai superato il limite di richieste gratuite dell'API. Riprova più tardi (tra qualche minuto).",
    EN: "You have exceeded the free API request limit. Try again later (in a few minutes).",
    FR: "Vous avez dépassé la limite de requêtes API gratuites. Réessayez plus tard (dans quelques minutes).",
    ES: "Ha superado el límite de solicitudes de API gratuitas. Inténtelo de nuevo más tarde (en unos minutos).",
    RU: "Вы превысили лимит бесплатных запросов к API. Попробуйте еще раз через несколько минут.",
    ZH: "您今天免费识别的次数已达上限。请几分钟后再次尝试。"
  },
  camera_error_failed: {
    IT: "ERRORE: Impossibile completare il riconoscimento.",
    EN: "ERROR: Unable to complete recognition.",
    FR: "ERREUR : Impossible de terminer la reconnaissance.",
    ES: "ERROR: No se pudo completar el riconoscimento.",
    RU: "ОШИБКА: Не удалось выполнить распознавание.",
    ZH: "识别失败，请检查您的网络连接后重试。"
  },
  camera_retry: {
    IT: "RIPROVA",
    EN: "RETRY",
    FR: "RÉESSAYER",
    ES: "REINTENTAR",
    RU: "ПОВТОРИТЬ",
    ZH: "重新尝试"
  },
  camera_access_denied: {
    IT: "Accesso alla fotocamera negato o non disponibile.",
    EN: "Camera access denied or unavailable.",
    FR: "Accès à l'appareil photo refusé ou non disponible.",
    ES: "Acceso a la cámara denegado o no disponible.",
    RU: "Доступ к камере запрещен или недоступен.",
    ZH: "未能获得摄像头调用权限，请在系统设置中允许 WIP 访问您的相机。"
  },

  // Events Explorer Screen (EventsScreen.tsx)
  events_title: {
    IT: "Eventi",
    EN: "Events",
    FR: "Événements",
    ES: "Eventos",
    RU: "События",
    ZH: "精彩活动"
  },
  events_subtitle: {
    IT: "Sagre, mostre, concerti e mercatini entro",
    EN: "Festivals, exhibitions, concerts, and markets within",
    FR: "Festivals, expositions, concerts et marchés dans un rayon de",
    ES: "Festivales, exposiciones, conciertos y mercados a menos de",
    RU: "Фестивали, выставки, концерты и ярмарки в радиусе",
    ZH: "为您网罗周边的艺术展、美食节、音乐会与集市，范围："
  },
  events_from: {
    IT: "Dal",
    EN: "From",
    FR: "Du",
    ES: "Desde",
    RU: "С",
    ZH: "开始日期"
  },
  events_to: {
    IT: "Al",
    EN: "To",
    FR: "Au",
    ES: "Hasta",
    RU: "По",
    ZH: "结束日期"
  },
  events_distance: {
    IT: "Distanza:",
    EN: "Distance:",
    FR: "Distance:",
    ES: "Distancia:",
    RU: "Дистанция:",
    ZH: "搜索范围:"
  },
  events_sort: {
    IT: "Ordina:",
    EN: "Sort by:",
    FR: "Trier par:",
    ES: "Ordenar por:",
    RU: "Сортировка:",
    ZH: "排序规则:"
  },
  events_sort_date: {
    IT: "Data",
    EN: "Date",
    FR: "Date",
    ES: "Fecha",
    RU: "Дате",
    ZH: "按日期"
  },
  events_sort_relevance: {
    IT: "Pertinenza",
    EN: "Relevance",
    FR: "Pertinence",
    ES: "Relevancia",
    RU: "Популярности",
    ZH: "按推荐度"
  },
  events_loading: {
    IT: "Ricerca eventi in corso...",
    EN: "Searching events...",
    FR: "Recherche d'événements...",
    ES: "Buscando eventos...",
    RU: "Поиск событий...",
    ZH: "正在为您搜罗周边好玩的活动..."
  },
  events_retry: {
    IT: "Riprova tutto",
    EN: "Retry all",
    FR: "Réessayer tout",
    ES: "Reintentar todo",
    RU: "Повторить всё",
    ZH: "重新加载"
  },
  events_not_found: {
    IT: "Nessun evento trovato",
    EN: "No events found",
    FR: "Aucun événement trouvé",
    ES: "No se encontraron eventos",
    RU: "Событий не найдено",
    ZH: "该时段及区域暂无活动信息"
  },
  events_not_found_desc: {
    IT: "Prova a cambiare le date o i filtri di ricerca.",
    EN: "Try changing dates or search filters.",
    FR: "Essayez de changer les dates ou les filtres de recherche.",
    ES: "Intente cambiar las fechas o los filtros de búsqueda.",
    RU: "Попробуйте изменить даты или фильтры поиска.",
    ZH: "您可以尝试更改日期区间或扩大搜索范围再试试看。"
  },
  events_source_errors: {
    IT: "Alcune sorgenti hanno riportato errori",
    EN: "Some sources reported errors",
    FR: "Certaines sources ont signalé des erreurs",
    ES: "Algunas fuentes informaron de errores",
    RU: "Некоторые источники сообщили об ошибках",
    ZH: "部分活动数据接口出现临时性网络故障"
  },
  events_date_unconfirmed: {
    IT: "Data non confermata",
    EN: "Date unconfirmed",
    FR: "Date non confirmée",
    ES: "Fecha no confirmada",
    RU: "Дата не подтверждена",
    ZH: "活动时间待定"
  },
  events_km_from_you: {
    IT: "da te",
    EN: "from you",
    FR: "de vous",
    ES: "de ti",
    RU: "от вас",
    ZH: "距离您"
  },
  events_km_from_map: {
    IT: "dalla mappa",
    EN: "from map center",
    FR: "du centre",
    ES: "del centro",
    RU: "от центра карты",
    ZH: "距离地图中心"
  },
  events_navigate: {
    IT: "Naviga",
    EN: "Navigate",
    FR: "S'y rendre",
    ES: "Navegar",
    RU: "Маршрут",
    ZH: "一键导航"
  },
  events_info_tickets: {
    IT: "Info & Ticket",
    EN: "Info & Tickets",
    FR: "Infos & Billets",
    ES: "Info y Entradas",
    RU: "Билеты и инфо",
    ZH: "详情与购票"
  },
  events_info_unavailable: {
    IT: "Info Non Disp.",
    EN: "Info Unavail.",
    FR: "Info Non Dispo",
    ES: "Info No Disp.",
    RU: "Нет информации",
    ZH: "暂无票务详情"
  },
  events_error_nav: {
    IT: "Coordinate e indirizzo non disponibili per questo evento.",
    EN: "Coordinates and address not available for this event.",
    FR: "Coordonnées et adresse non disponibles pour cet événement.",
    ES: "Coordenadas y dirección no disponibles para este evento.",
    RU: "Координаты и адрес недоступны для этого события.",
    ZH: "抱歉，该活动未提供具体定位坐标或物理地址。"
  },
  events_error_load: {
    IT: "Impossibile caricare gli eventi principali.",
    EN: "Unable to load main events.",
    FR: "Impossible de charger les événements principaux.",
    ES: "No se pudieron cargar los eventos principaux.",
    RU: "Не удалось загрузить основные события.",
    ZH: "由于网络异常，未能成功加载活动信息。"
  },

  // User Profile Header
  profile_one_moment: {
    IT: "Un momento...",
    EN: "One moment...",
    FR: "Un moment...",
    ES: "Un momento...",
    RU: "Секунду...",
    ZH: "正在加载..."
  },
  profile_forever_premium: {
    IT: "Sempre Premium",
    EN: "Always Premium",
    FR: "Premium à vie",
    ES: "Sempre Premium",
    RU: "Премиум навсегда",
    ZH: "终身 Premium 会员"
  },
  profile_partner_premium: {
    IT: "Partner Premium",
    EN: "Premium Partner",
    FR: "Partenaire Premium",
    ES: "Socio Premium",
    RU: "Премиум-партнер",
    ZH: "酒店专属 Premium 特权"
  },
  profile_active_until: {
    IT: "Attivo fino al",
    EN: "Active until",
    FR: "Actif jusqu'au",
    ES: "Activo hasta el",
    RU: "Активен до",
    ZH: "特权有效期至"
  },
  profile_free_tier: {
    IT: "Free Tier",
    EN: "Free Tier",
    FR: "Version Gratuite",
    ES: "Versión Gratuita",
    RU: "Бесплатный тариф",
    ZH: "普通免费用户"
  },
  // Map Screen Bottom Bar and Warnings
  find_near: {
    IT: "TROVA VICINO",
    EN: "FIND NEARBY",
    FR: "TROUVER PROCHE",
    ES: "BUSCAR CERCA",
    RU: "НАЙТИ РЯДОМ",
    ZH: "搜寻周边"
  },
  search_city_placeholder: {
    IT: "Cerca città...",
    EN: "Search city...",
    FR: "Rechercher une ville...",
    ES: "Buscar città...",
    RU: "Поиск города...",
    ZH: "搜索城市..."
  },
  near_you: {
    IT: "Vicino a te",
    EN: "Near you",
    FR: "Proche de vous",
    ES: "Cerca de ti",
    RU: "Рядом с вами",
    ZH: "您附近的景点"
  },
  within_1000m: {
    IT: "Entro 1000 metri",
    EN: "Within 1000 meters",
    FR: "À moins de 1000 mètres",
    ES: "A menos de 1000 metros",
    RU: "В радиусе 1000 метров",
    ZH: "1000米以内"
  },
  no_pois_found_within_1000m: {
    IT: "Nessun punto di interesse trovato nel raggio di 1000m.",
    EN: "No points of interest found within 1000m.",
    FR: "Aucun point d'intérêt trouvé à moins de 1000m.",
    ES: "No se encontraron puntos de interés a menos de 1000m.",
    RU: "В радиусе 1000м не найдено интересных мест.",
    ZH: "在1000米范围内未找到任何景点。"
  },
  my_position: {
    IT: "La mia posizione",
    EN: "My location",
    FR: "Ma position",
    ES: "Mi ubicación",
    RU: "Мое местоположение",
    ZH: "我的位置"
  },
  retry_btn: {
    IT: "Riprova",
    EN: "Retry",
    FR: "Réessayer",
    ES: "Reintentar",
    RU: "Повторить",
    ZH: "重试"
  },
  error_map_places: {
    IT: "Mappe & Luoghi",
    EN: "Maps & Places",
    FR: "Cartes & Lieux",
    ES: "Mapas y Lugares",
    RU: "Карты и Места",
    ZH: "地图与景点"
  },
  error_position: {
    IT: "Posizione",
    EN: "Location",
    FR: "Position",
    ES: "Ubicación",
    RU: "Местоположение",
    ZH: "定位"
  },
  geolocation_error_denied: {
    IT: "Permesso di geolocalizzazione negato dal browser.",
    EN: "Geolocation permission denied by the browser.",
    FR: "Autorisation de géolocalisation refusée par le navigateur.",
    ES: "Permiso de geolocalización denegado por el navegador.",
    RU: "Разрешение на геолокацию отклонено браузером.",
    ZH: "定位失败，浏览器拒绝对本应用的GPS定位授权。"
  },
  geolocation_error_unavailable: {
    IT: "Impossibile ottenere la tua posizione. Verifica i permessi di localizzazione.",
    EN: "Unable to get your location. Please check location permissions.",
    FR: "Impossible d'obtenir votre position. Veuillez vérifier les autorisations.",
    ES: "No se pudo obtener su ubicación. Verifique los permisos de ubicación.",
    RU: "Не удалось получить ваше местоположение. Проверьте разрешения.",
    ZH: "无法获取您的当前位置，请检查设备的GPS或定位服务权限。"
  },
  geolocation_error_unsupported: {
    IT: "Il tuo browser non supporta la geolocalizzazione.",
    EN: "Your browser does not support geolocation.",
    FR: "Votre navigateur ne prend pas en charge la géolocalisation.",
    ES: "Su navegador no admite la geolocalizzazione.",
    RU: "Ваш браузер не поддерживает геолокацию.",
    ZH: "抱歉，您当前使用的浏览器不支持网页定位服务。"
  },
  geocontrol_title: {
    IT: "GeoControl Avanzato",
    EN: "Advanced GeoControl",
    FR: "GéoContrôle Avancé",
    ES: "GeoControl Avanzado",
    RU: "Расширенный геоконтроль",
    ZH: "高级 GPS 属性设定"
  },
  geocontrol_desc: {
    IT: "Configura distanze di tracciamento GPS, trigger di avviso e categorie attive per il geofencing",
    EN: "Configure GPS tracking distances, alert triggers, and active category tree for geofencing",
    FR: "Configurez les distances GPS, les déclencheurs d'alerte et l'arborescence des catégories pour le géofencing",
    ES: "Configure las distancias GPS, los activadores de alerta y las categorías para el geofencing",
    RU: "Настройте дистанцию отслеживания, триггеры оповещений и дерево активных категорий",
    ZH: "设定定位触发半径、播报触发距离及参与自动语音播报的景点分类"
  },
  activation_mode: {
    IT: "Modalità Attivazione",
    EN: "Activation Mode",
    FR: "Mode d'activation",
    ES: "Modo de Activación",
    RU: "Режим активации",
    ZH: "导览播放模式"
  },
  activation_auto: {
    IT: "Automatica",
    EN: "Automatic",
    FR: "Automatique",
    ES: "Automática",
    RU: "Автоматический",
    ZH: "全自动（即时播放）"
  },
  activation_semi: {
    IT: "Semi-Automatica",
    EN: "Semi-Automatic",
    FR: "Semi-Automatique",
    ES: "Semi-Automática",
    RU: "Полуавтомат",
    ZH: "半自动（点选通知）"
  },
  dist_walk_label: {
    IT: "Distanza Avviso a Piedi",
    EN: "Walking Alert Distance",
    FR: "Distance d'alerte à pied",
    ES: "Distancia Aviso a Pie",
    RU: "Дистанция оповещения пешком",
    ZH: "步行警示距离"
  },
  dist_car_label: {
    IT: "Distanza Avviso in Auto",
    EN: "Driving Alert Distance",
    FR: "Distance d'alerte en voiture",
    ES: "Distancia Aviso en Auto",
    RU: "Дистанция оповещения в авто",
    ZH: "行车警示距离 (CarPlay)"
  },
  dist_start_label: {
    IT: "Distanza Inizio Guida",
    EN: "Guidance Start Distance",
    FR: "Distance début de guide",
    ES: "Distancia Inicios Guía",
    RU: "Дистанция начала рассказа",
    ZH: "语音播报起始半径"
  },
  category_tree_title: {
    IT: "Albero delle Categorie Geofence",
    EN: "Geofence Categories Tree",
    FR: "Arbre des catégories de géofencing",
    ES: "Árbol de Categorías de Geofencing",
    RU: "Дерево категорий геозон",
    ZH: "导览围栏景点分类树"
  },
  category_gems_only: {
    IT: "Default Assoluto: Gemme (Sempre Attivo)",
    EN: "Absolute Default: Gems (Always Active)",
    FR: "Défaut absolu: Gemmes (Toujours actif)",
    ES: "Predeterminado: Gemas (Siempre activo)",
    RU: "По умолчанию: Жемчужины (Всегда активно)",
    ZH: "系统预设：隐藏瑰宝（永远保持激活）"
  },
  geofence_alert_title: {
    IT: "Attrazione Vicina",
    EN: "Attraction Nearby",
    FR: "Attraction à Proximité",
    ES: "Atracción Cercana",
    RU: "Достопримечательность рядом",
    ZH: "附近有推荐景点"
  },
  geofence_alert_ascolta: {
    IT: "Ascolta Guida",
    EN: "Listen to Guide",
    FR: "Écouter le Guide",
    ES: "Escuchar Guía",
    RU: "Слушать гид",
    ZH: "语音导览播报"
  },
  geofence_alert_close: {
    IT: "Chiudi",
    EN: "Close",
    FR: "Fermer",
    ES: "Cerrar",
    RU: "Закрыть",
    ZH: "关闭"
  },
  geofence_approaching: {
    IT: "Attenzione, stai arrivando a ",
    EN: "Attention, you are approaching ",
    FR: "Attention, vous approchez de ",
    ES: "Atención, te estás acercando a ",
    RU: "Внимание, вы приближаетесь к ",
    ZH: "注意，您即将到达 "
  },
  geofence_arrived_play: {
    IT: "Sei arrivato a [NAME], premi play nella scheda per ascoltare l'audioguida.",
    EN: "You have arrived at [NAME], press play in the card to listen to the audioguide.",
    FR: "Vous êtes arrivé à [NAME], appuyez sur play dans la fiche pour écouter le guide audio.",
    ES: "Has llegado a [NAME], presiona play en la tarjeta para escuchar la audioguía.",
    RU: "Вы прибыли к [NAME], нажмите play в карточке, чтобы прослушать аудиогид.",
    ZH: "您已到达 [NAME]，请在卡片中点击播放以收听语音导览。"
  },
  loading_card: {
    IT: "Carico la scheda…",
    EN: "Loading card…",
    FR: "Chargement de la carte…",
    ES: "Cargando tarjeta…",
    RU: "Загрузка карточки…",
    ZH: "加载卡片中…"
  },
  poi_close: {
    IT: "Chiudi",
    EN: "Close",
    FR: "Fermer",
    ES: "Cerrar",
    RU: "Закрыть",
    ZH: "关闭"
  },
  poi_monument: {
    IT: "Monumento",
    EN: "Monument",
    FR: "Monument",
    ES: "Monumento",
    RU: "Памятник",
    ZH: "纪念碑"
  },
  audioguide_ai: {
    IT: "Audioguida",
    EN: "Audioguide",
    FR: "Audioguide",
    ES: "Audioguía",
    RU: "Аудиогид",
    ZH: "语音导览"
  },
  voice_nicky: {
    IT: "Voce: Nicky",
    EN: "Voice: Nicky",
    FR: "Voix: Nicky",
    ES: "Voz: Nicky",
    RU: "Голос: Nicky",
    ZH: "声音: Nicky"
  },
  poi_website: {
    IT: "Sito web",
    EN: "Website",
    FR: "Site web",
    ES: "Sitio web",
    RU: "Веб-сайт",
    ZH: "网站"
  },
  poi_phone: {
    IT: "Telefono",
    EN: "Phone",
    FR: "Téléphone",
    ES: "Teléfono",
    RU: "Телефон",
    ZH: "电话"
  },
  poi_maps: {
    IT: "Maps",
    EN: "Maps",
    FR: "Cartes",
    ES: "Mapas",
    RU: "Карты",
    ZH: "地图"
  },
  poi_tickets: {
    IT: "Biglietti",
    EN: "Tickets",
    FR: "Billets",
    ES: "Entradas",
    RU: "Билеты",
    ZH: "门票"
  },
  poi_regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Регенерировать",
    ZH: "重新生成"
  },
  poi_historical_data: {
    IT: "Dati storici",
    EN: "Historical data",
    FR: "Données historiques",
    ES: "Datos históricos",
    RU: "Исторические данные",
    ZH: "历史数据"
  },
  poi_built: {
    IT: "Costruito:",
    EN: "Built:",
    FR: "Construit:",
    ES: "Construido:",
    RU: "Построено:",
    ZH: "建造于:"
  },
  poi_architect: {
    IT: "Architetto:",
    EN: "Architect:",
    FR: "Architecte:",
    ES: "Arquitecto:",
    RU: "Архитектор:",
    ZH: "建筑师:"
  },
  poi_style: {
    IT: "Stile:",
    EN: "Style:",
    FR: "Style:",
    ES: "Estilo:",
    RU: "Стиль:",
    ZH: "风格:"
  },
  poi_practical_info: {
    IT: "Info pratiche",
    EN: "Practical info",
    FR: "Infos pratiques",
    ES: "Información práctica",
    RU: "Практическая информация",
    ZH: "实用信息"
  },
  poi_read_wikipedia: {
    IT: "Leggi su Wikipedia",
    EN: "Read on Wikipedia",
    FR: "Lire sur Wikipedia",
    ES: "Leer en Wikipedia",
    RU: "Читать в Википедии",
    ZH: "在维基百科阅读"
  },
  poi_no_barriers: {
    IT: "♿ No Barriere",
    EN: "♿ No Barriers",
    FR: "♿ Sans barrières",
    ES: "♿ Sin barreras",
    RU: "♿ Без барьеров",
    ZH: "♿ 无障碍设施"
  },
  poi_gem: {
    IT: "💎 Gemma",
    EN: "💎 Gem",
    FR: "💎 Gemme",
    ES: "💎 Gema",
    RU: "💎 Жемчужина",
    ZH: "💎 瑰宝"
  },
  poi_audio: {
    IT: "Audio",
    EN: "Audio",
    FR: "Audio",
    ES: "Audio",
    RU: "Аудио",
    ZH: "音频"
  },
  poi_listen_card: {
    IT: "Ascolta la scheda",
    EN: "Listen to the card",
    FR: "Écouter la fiche",
    ES: "Escuchar la ficha",
    RU: "Прослушать карточку",
    ZH: "收听卡片"
  },
  poi_share: {
    IT: "Condividi",
    EN: "Share",
    FR: "Partager",
    ES: "Compartir",
    RU: "Поделиться",
    ZH: "分享"
  },
  gluten_free_available: {
    IT: "Senza Glutine Disponibile",
    EN: "Gluten-Free Available",
    FR: "Sans gluten disponible",
    ES: "Sin gluten disponible",
    RU: "Доступно без глютена",
    ZH: "提供无麸质选项"
  },
  gluten_free_detected: {
    IT: "Abbiamo rilevato che questo locale offre opzioni per celiaci.",
    EN: "We detected that this place offers gluten-free options.",
    FR: "Nous avons détecté que ce lieu propose des options sans gluten.",
    ES: "Hemos detectado que este lugar ofrece opciones sin gluten.",
    RU: "Мы обнаружили, что это заведение предлагает варианты без глютена.",
    ZH: "我们发现该餐厅提供无麸质餐点。"
  },
  explore_by_type: {
    IT: "Esplora per tipo",
    EN: "Explore by type",
    FR: "Explorer par type",
    ES: "Explorar por tipo",
    RU: "Искать по типу",
    ZH: "按类型探索"
  },
  availability_status: {
    IT: "Stato Disponibilità",
    EN: "Availability Status",
    FR: "Statut de disponibilité",
    ES: "Estado de disponibilidad",
    RU: "Статус доступности",
    ZH: "可用状态"
  },
  fare: {
    IT: "Tariffa",
    EN: "Fare",
    FR: "Tarif",
    ES: "Tarifa",
    RU: "Тариф",
    ZH: "费用"
  },
  type: {
    IT: "Tipo",
    EN: "Type",
    FR: "Type",
    ES: "Tipo",
    RU: "Тип",
    ZH: "类型"
  },
  use_headphones: {
    IT: "Per un'esperienza ottimale, si consiglia l'uso di cuffie",
    EN: "For an optimal experience, headphones are recommended",
    FR: "Pour une expérience optimale, l'utilisation d'écouteurs est recommandée",
    ES: "Para una experiencia óptima, se recomienda el uso de auriculares",
    RU: "Для оптимального опыта рекомендуется использовать наушники",
    ZH: "为了获得最佳体验，建议使用耳机"
  },

  attractions_nearby: {
    IT: "Attrazioni nei dintorni",
    EN: "Attractions nearby",
    FR: "Attractions à proximité",
    ES: "Atracciones cercanas",
    RU: "Достопримечательности рядом",
    ZH: "附近景点"
  },
  my_itineraries: {
    IT: "I Miei Itinerari",
    EN: "My Itineraries",
    FR: "Mes Itinéraires",
    ES: "Mis Itinerarios",
    RU: "Мои маршруты",
    ZH: "我的行程"
  },
  no_offline_plans: {
    IT: "Nessun itinerario scaricato",
    EN: "No downloaded itineraries",
    FR: "Aucun itinéraire téléchargé",
    ES: "Ningún itinerario descargado",
    RU: "Нет скачанных маршрутов",
    ZH: "没有已下载的行程"
  },
  use_offline_button: {
    IT: "Usa il bottone 'Offline' dentro un itinerario generato",
    EN: "Use the 'Offline' button inside a generated itinerary",
    FR: "Utilisez le bouton 'Hors ligne' dans un itinéraire généré",
    ES: "Usa el botón 'Offline' dentro de un itinerario generado",
    RU: "Используйте кнопку «Офлайн» внутри созданного маршрута",
    ZH: "在生成的行程中使用“离线”按钮"
  },
  open_offline: {
    IT: "Apri Offline",
    EN: "Open Offline",
    FR: "Ouvrir hors ligne",
    ES: "Abrir Offline",
    RU: "Открыть офлайн",
    ZH: "离线打开"
  },
  open_maps: {
    IT: "Apri in Maps",
    EN: "Open in Maps",
    FR: "Ouvrir dans Maps",
    ES: "Abrir en Maps",
    RU: "Открыть в Картах",
    ZH: "在地图中打开"
  },
  add_stop: {
    IT: "Aggiungi Tappa",
    EN: "Add Stop",
    FR: "Ajouter une étape",
    ES: "Añadir Parada",
    RU: "Добавить остановку",
    ZH: "添加站点"
  },
  action_visit: {
    IT: "Azione/Visita",
    EN: "Action/Visit",
    FR: "Action/Visite",
    ES: "Acción/Visita",
    RU: "Действие/Визит",
    ZH: "活动/游览"
  },
  action_restaurant: {
    IT: "Ristorante",
    EN: "Restaurant",
    FR: "Restaurant",
    ES: "Restaurante",
    RU: "Ресторан",
    ZH: "餐厅"
  },
  action_break: {
    IT: "Pausa",
    EN: "Break",
    FR: "Pause",
    ES: "Pausa",
    RU: "Перерыв",
    ZH: "休息"
  },
  action_travel: {
    IT: "Spostamento",
    EN: "Travel",
    FR: "Déplacement",
    ES: "Desplazamiento",
    RU: "Перемещение",
    ZH: "交通"
  },
  cancel: {
    IT: "Annulla",
    EN: "Cancel",
    FR: "Annuler",
    ES: "Cancelar",
    RU: "Отмена",
    ZH: "取消"
  },
  save: {
    IT: "Salva",
    EN: "Save",
    FR: "Enregistrer",
    ES: "Guardar",
    RU: "Сохранить",
    ZH: "保存"
  },
  add_manual_stop: {
    IT: "Aggiungi una tappa manuale...",
    EN: "Add a manual stop...",
    FR: "Ajouter une étape manuelle...",
    ES: "Añadir una parada manual...",
    RU: "Добавить остановку вручную...",
    ZH: "手动添加站点..."
  },
  daily_budget: {
    IT: "Budget della Giornata",
    EN: "Daily Budget",
    FR: "Budget du jour",
    ES: "Presupuesto del Día",
    RU: "Бюджет на день",
    ZH: "每日预算"
  },
  attractions: {
    IT: "Attrazioni",
    EN: "Attractions",
    FR: "Attractions",
    ES: "Atracciones",
    RU: "Достопримечательности",
    ZH: "景点"
  },
  transport: {
    IT: "Trasporti",
    EN: "Transport",
    FR: "Transports",
    ES: "Transporte",
    RU: "Транспорт",
    ZH: "交通"
  },
  breakfast: {
    IT: "Colazione",
    EN: "Breakfast",
    FR: "Petit-déjeuner",
    ES: "Desayuno",
    RU: "Завтрак",
    ZH: "早餐"
  },
  lunch: {
    IT: "Pranzo",
    EN: "Lunch",
    FR: "Déjeuner",
    ES: "Almuerzo",
    RU: "Обед",
    ZH: "午餐"
  },
  dinner: {
    IT: "Cena",
    EN: "Dinner",
    FR: "Dîner",
    ES: "Cena",
    RU: "Ужин",
    ZH: "晚餐"
  },
  total_day: {
    IT: "TOTALE GIORNO",
    EN: "DAY TOTAL",
    FR: "TOTAL DU JOUR",
    ES: "TOTAL DEL DÍA",
    RU: "ИТОГО ЗА ДЕНЬ",
    ZH: "单日总计"
  },
  itinerary_map: {
    IT: "Mappa Itinerario",
    EN: "Itinerary Map",
    FR: "Carte de l'itinéraire",
    ES: "Mapa del Itinerario",
    RU: "Карта маршрута",
    ZH: "行程地图"
  },
  total_estimated_trip: {
    IT: "Totale Stimato Viaggio",
    EN: "Total Estimated Trip",
    FR: "Total Estimé du Voyage",
    ES: "Total Estimado del Viaje",
    RU: "Общая смета поездки",
    ZH: "行程预估总计"
  },
  wip_working: {
    IT: "WIP l'esperto di viaggi sta lavorando...",
    EN: "WIP the travel expert is working...",
    FR: "WIP l'expert en voyages travaille...",
    ES: "WIP el experto en viajes está trabajando...",
    RU: "WIP, эксперт по путешествиям, работает...",
    ZH: "智能旅行专家 WIP 正在为您规划..."
  },
  optimizing_stops: {
    IT: "Stiamo ottimizzando le tappe del tuo viaggio per minimizzare i tempi di spostamento e massimizzare il divertimento.",
    EN: "We are optimizing your trip stops to minimize travel time and maximize fun.",
    FR: "Nous optimisons les étapes de votre voyage pour minimiser les temps de trajet et maximiser le plaisir.",
    ES: "Estamos optimizando las paradas de tu viaje para minimizar el tiempo de desplazamiento y maximizar la diversión.",
    RU: "Мы оптимизируем остановки вашей поездки, чтобы свести к минимуму время в пути и получить максимум удовольствия.",
    ZH: "我们正在优化您的行程站点，以最大程度地减少旅行时间并增加乐趣。"
  },
  placeholder_interests: {
    IT: "Es: Ristorante vegano, solo musei, ritmo lento...",
    EN: "Ex: Vegan restaurant, only museums, slow pace...",
    FR: "Ex: Restaurant végétalien, que des musées, rythme lent...",
    ES: "Ej: Restaurante vegano, solo museos, ritmo lento...",
    RU: "Например: веганский ресторан, только музеи, медленный темп...",
    ZH: "例如：素食餐厅，只看博物馆，慢节奏..."
  },
  placeholder_time: {
    IT: "Ora (es: 10:00)",
    EN: "Time (e.g. 10:00)",
    FR: "Heure (ex: 10:00)",
    ES: "Hora (ej: 10:00)",
    RU: "Время (напр. 10:00)",
    ZH: "时间（例如：10:00）"
  },
  placeholder_stop_name: {
    IT: "Nome della Tappa",
    EN: "Stop Name",
    FR: "Nom de l'étape",
    ES: "Nombre de la Parada",
    RU: "Название остановки",
    ZH: "站点名称"
  },
  placeholder_duration: {
    IT: "Tempo necessario (es. 2 ore)",
    EN: "Time needed (e.g. 2 hours)",
    FR: "Temps nécessaire (ex: 2 heures)",
    ES: "Tiempo necesario (ej. 2 horas)",
    RU: "Необходимое время (напр. 2 часа)",
    ZH: "所需时间（例如：2小时）"
  },
  placeholder_activity: {
    IT: "Attività / Descrizione",
    EN: "Activity / Description",
    FR: "Activité / Description",
    ES: "Actividad / Descripción",
    RU: "Действие / Описание",
    ZH: "活动 / 描述"
  },
  placeholder_lat: {
    IT: "Latitudine (Opzionale)",
    EN: "Latitude (Optional)",
    FR: "Latitude (Optionnel)",
    ES: "Latitud (Opcional)",
    RU: "Широта (Опционально)",
    ZH: "纬度（选填）"
  },
  placeholder_lon: {
    IT: "Longitudine (Opzionale)",
    EN: "Longitude (Optional)",
    FR: "Longitude (Optionnel)",
    ES: "Longitud (Opcional)",
    RU: "Долгота (Опционально)",
    ZH: "经度（选填）"
  },
  placeholder_notes: {
    IT: "Consigli/Note aggiuntive",
    EN: "Tips/Additional notes",
    FR: "Conseils/Notes supplémentaires",
    ES: "Consejos/Notas adicionales",
    RU: "Советы/Дополнительные примечания",
    ZH: "提示/补充说明"
  },
  suggested_itineraries: {
    IT: "Itinerari Suggeriti",
    EN: "Suggested Itineraries",
    FR: "Itinéraires Suggérés",
    ES: "Itinerarios Sugeridos",
    RU: "Предлагаемые маршруты",
    ZH: "推荐行程"
  },
  suggested_itineraries_desc: {
    IT: "Qui appariranno i percorsi personalizzati creati per te dalla nostra Guida AI.",
    EN: "Here will appear the custom routes created for you by our AI Guide.",
    FR: "Ici apparaîtront les parcours personnalisés créés pour vous par notre Guide IA.",
    ES: "Aquí aparecerán las rutas personalizadas creadas para ti por nuestra Guía IA.",
    RU: "Здесь появятся индивидуальные маршруты, созданные для вас нашим ИИ-гидом.",
    ZH: "这里将显示由我们的 AI 导游为您创建的个性化路线。"
  },
  open_map_caps: {
    IT: "APRI MAPPA",
    EN: "OPEN MAP",
    FR: "OUVRIR LA CARTE",
    ES: "ABRIR MAPA",
    RU: "ОТКРЫТЬ КАРТУ",
    ZH: "打开地图"
  },
  working_on_memories: {
    IT: "LAVORANDO AI TUOI RICORDI...",
    EN: "WORKING ON YOUR MEMORIES...",
    FR: "TRAVAIL SUR VOS SOUVENIRS...",
    ES: "TRABAJANDO EN TUS RECUERDOS...",
    RU: "ОБРАБАТЫВАЕМ ВАШИ ВОСПОМИНАНИЯ...",
    ZH: "正在处理您的旅行回忆..."
  },
  daily_limits_counter: {
    IT: "Contatore Limiti Giornalieri",
    EN: "Daily Limits Counter",
    FR: "Compteur de limites quotidiennes",
    ES: "Contador de Límites Diarios",
    RU: "Счетчик дневных лимитов",
    ZH: "每日额度计数器"
  },
  daily_limits_desc: {
    IT: "Monitora i crediti consumati in tempo reale (in base al tuo piano).",
    EN: "Monitor consumed credits in real time (based on your plan).",
    FR: "Surveillez les crédits consommés en temps réel (selon votre forfait).",
    ES: "Supervisa los créditos consumidos en tiempo real (según tu plan).",
    RU: "Отслеживайте использованные кредиты в реальном времени (согласно вашему тарифу).",
    ZH: "实时监控已使用的额度（根据您的订阅计划）。"
  },
  lbl_history_culture: {
    IT: "🏛️ STORIA E CULTURA",
    EN: "🏛️ HISTORY & CULTURE",
    FR: "🏛️ HISTOIRE & CULTURE",
    ES: "🏛️ HISTORIA Y CULTURA",
    RU: "🏛️ ИСТОРИЯ И КУЛЬТУРА",
    ZH: "🏛️ 历史与文化"
  },
  lbl_nature: {
    IT: "🌲 PAESAGGIO E NATURA",
    EN: "🌲 LANDSCAPE & NATURE",
    FR: "🌲 PAYSAGE & NATURE",
    ES: "🌲 PAISAJE Y NATURALEZA",
    RU: "🌲 ПЕЙЗАЖ И ПРИРОДА",
    ZH: "🌲 自然与景观"
  },
  lbl_food: {
    IT: "🍕 FOOD & OSPITALITÀ",
    EN: "🍕 FOOD & HOSPITALITY",
    FR: "🍕 GASTRONOMIE & ACCUEIL",
    ES: "🍕 COMIDA Y HOSPITALIDAD",
    RU: "🍕 ЕДА И ГОСТЕПРИИМСТВО",
    ZH: "🍕 美食与住宿"
  },
  lbl_services: {
    IT: "🛒 SERVIZI",
    EN: "🛒 SERVICES",
    FR: "🛒 SERVICES",
    ES: "🛒 SERVICIOS",
    RU: "🛒 УСЛУГИ",
    ZH: "🛒 实用设施"
  },

  // ─── Premium Guide Module ────────────────────────────────────
  premium_guide_btn: {
    IT: "📖 Genera Guida d'Autore",
    EN: "📖 Generate Author's Guide",
    FR: "📖 Générer le Guide d'Auteur",
    ES: "📖 Generar Guía de Autor",
    RU: "📖 Создать Авторский Гид",
    ZH: "📖 生成精品导览"
  },
  premium_guide_title: {
    IT: "Guida d'Autore WIP",
    EN: "WIP Author's Guide",
    FR: "Guide d'Auteur WIP",
    ES: "Guía de Autor WIP",
    RU: "Авторский Гид WIP",
    ZH: "WIP 精品导览"
  },
  premium_guide_subtitle: {
    IT: "Scegli il tuo stile narrativo",
    EN: "Choose your narrative style",
    FR: "Choisissez votre style narratif",
    ES: "Elige tu estilo narrativo",
    RU: "Выберите стиль повествования",
    ZH: "选择您的叙述风格"
  },
  premium_guide_style_art: {
    IT: "Arte & Storia",
    EN: "Art & History",
    FR: "Art & Histoire",
    ES: "Arte e Historia",
    RU: "Искусство и история",
    ZH: "艺术与历史"
  },
  premium_guide_style_art_desc: {
    IT: "Analisi critica, architettura e aneddoti storici esclusivi",
    EN: "Critical analysis, architecture & exclusive historical anecdotes",
    FR: "Analyse critique, architecture et anecdotes historiques",
    ES: "Análisis crítico, arquitectura y anécdotas históricas",
    RU: "Критический анализ, архитектура и исторические анекдоты",
    ZH: "批判性分析、建筑与独家历史故事"
  },
  premium_guide_style_family: {
    IT: "Famiglia",
    EN: "Family",
    FR: "Famille",
    ES: "Familia",
    RU: "Семья",
    ZH: "亲子家庭"
  },
  premium_guide_style_family_desc: {
    IT: "Attività, giochi e curiosità per bambini di ogni età",
    EN: "Activities, games & facts for kids of all ages",
    FR: "Activités, jeux et curiosités pour enfants de tous âges",
    ES: "Actividades, juegos y curiosidades para niños de todas las edades",
    RU: "Мероприятия, игры и факты для детей всех возрастов",
    ZH: "适合各年龄段儿童的活动、游戏与趣味知识"
  },
  premium_guide_style_shopping: {
    IT: "Shopping & Design",
    EN: "Shopping & Design",
    FR: "Shopping & Design",
    ES: "Shopping y Diseño",
    RU: "Шопинг и дизайн",
    ZH: "购物与设计"
  },
  premium_guide_style_shopping_desc: {
    IT: "Boutique artigiane, design locale e trend del momento",
    EN: "Artisan boutiques, local design & current trends",
    FR: "Boutiques artisanales, design local et tendances actuelles",
    ES: "Boutiques artesanales, diseño local y tendencias actuales",
    RU: "Ремесленные бутики, местный дизайн и актуальные тренды",
    ZH: "手工精品店、本地设计与当下潮流"
  },
  premium_guide_style_food: {
    IT: "Enogastronomia",
    EN: "Food & Wine",
    FR: "Gastronomie & Vins",
    ES: "Gastronomía & Vinos",
    RU: "Гастрономия и вино",
    ZH: "美食与佳酿"
  },
  premium_guide_style_food_desc: {
    IT: "Piatti tipici, produttori locali e tradizioni culinarie",
    EN: "Local dishes, producers & culinary traditions",
    FR: "Plats typiques, producteurs locaux et traditions culinaires",
    ES: "Platos típicos, productores locales y tradiciones culinarias",
    RU: "Местные блюда, производители и кулинарные традиции",
    ZH: "地方特色美食、本地生产商与烹饪传统"
  },
  premium_guide_style_essential: {
    IT: "Essenziale",
    EN: "Essential",
    FR: "Essentiel",
    ES: "Esencial",
    RU: "Основное",
    ZH: "精简实用"
  },
  premium_guide_style_essential_desc: {
    IT: "Orari, prezzi, accesso e logistica ottimizzata",
    EN: "Hours, prices, access & optimised logistics",
    FR: "Horaires, prix, accès et logistique optimisée",
    ES: "Horarios, precios, acceso y logística optimizada",
    RU: "Часы работы, цены, доступ и оптимизированная логистика",
    ZH: "开放时间、价格、交通与优化行程"
  },
  premium_guide_generating: {
    IT: "Sto assemblando la tua guida d'autore...",
    EN: "Assembling your author's guide...",
    FR: "J'assemble votre guide d'auteur...",
    ES: "Ensamblando tu guía de autor...",
    RU: "Собираю ваш авторский гид...",
    ZH: "正在为您打造精品导览..."
  },
  premium_guide_step1: {
    IT: "Analisi narrativa dei tuoi luoghi...",
    EN: "Narrative analysis of your places...",
    FR: "Analyse narrative de vos lieux...",
    ES: "Análisis narrativo de tus lugares...",
    RU: "Нарративный анализ ваших мест...",
    ZH: "正在分析您的目的地..."
  },
  premium_guide_step2: {
    IT: "Ricerca immagini editoriali...",
    EN: "Searching editorial images...",
    FR: "Recherche d'images éditoriales...",
    ES: "Buscando imágenes editoriales...",
    RU: "Поиск редакционных изображений...",
    ZH: "正在检索精选图片..."
  },
  premium_guide_step3: {
    IT: "Composizione del layout premium...",
    EN: "Composing the premium layout...",
    FR: "Composition de la mise en page premium...",
    ES: "Componiendo el diseño premium...",
    RU: "Создание премиум-макета...",
    ZH: "正在生成精品排版..."
  },
  premium_guide_ready: {
    IT: "La tua guida è pronta!",
    EN: "Your guide is ready!",
    FR: "Votre guide est prêt!",
    ES: "¡Tu guía está lista!",
    RU: "Ваш гид готов!",
    ZH: "您的导览已准备好！"
  },
  premium_guide_download: {
    IT: "Scarica PDF",
    EN: "Download PDF",
    FR: "Télécharger PDF",
    ES: "Descargar PDF",
    RU: "Скачать PDF",
    ZH: "下载 PDF"
  },
  premium_guide_regenerate: {
    IT: "Rigenera",
    EN: "Regenerate",
    FR: "Régénérer",
    ES: "Regenerar",
    RU: "Перегенерировать",
    ZH: "重新生成"
  },
  premium_guide_quota_exceeded: {
    IT: "Hai raggiunto il limite mensile di guide premium. Aggiorna il piano per continuare.",
    EN: "You've reached your monthly premium guide limit. Upgrade your plan to continue.",
    FR: "Vous avez atteint votre limite mensuelle de guides premium. Mettez à niveau votre plan.",
    ES: "Has alcanzado tu límite mensual de guías premium. Actualiza tu plan para continuar.",
    RU: "Вы достигли месячного лимита премиум-гидов. Обновите план для продолжения.",
    ZH: "您已达到本月精品导览上限，请升级您的订阅套餐。"
  },
  premium_guide_only_premium: {
    IT: "La Guida d'Autore è una funzione esclusiva WIP Premium.",
    EN: "The Author's Guide is an exclusive WIP Premium feature.",
    FR: "Le Guide d'Auteur est une fonctionnalité exclusive WIP Premium.",
    ES: "La Guía de Autor es una función exclusiva de WIP Premium.",
    RU: "Авторский Гид — эксклюзивная функция WIP Premium.",
    ZH: "精品导览是 WIP Premium 专属功能。"
  },
  premium_guide_error: {
    IT: "Errore nella generazione della guida. Riprova tra qualche momento.",
    EN: "Error generating the guide. Please try again in a moment.",
    FR: "Erreur lors de la génération du guide. Veuillez réessayer.",
    ES: "Error al generar la guía. Por favor, inténtalo de nuevo.",
    RU: "Ошибка при генерации гида. Попробуйте снова.",
    ZH: "导览生成出错，请稍后重试。"
  },
  premium_guide_narrative: {
    IT: "Narrazione",
    EN: "Narrative",
    FR: "Narration",
    ES: "Narración",
    RU: "Повествование",
    ZH: "叙事"
  },
  premium_guide_technical: {
    IT: "Approfondimento",
    EN: "In-Depth",
    FR: "Approfondissement",
    ES: "Análisis en profundidad",
    RU: "Подробный анализ",
    ZH: "深度解析"
  },
  premium_guide_insider: {
    IT: "Consiglio da Insider",
    EN: "Insider Tip",
    FR: "Conseil d'Initié",
    ES: "Consejo Insider",
    RU: "Совет инсайдера",
    ZH: "达人秘笈"
  },
  premium_guide_useful_info: {
    IT: "Info Pratiche",
    EN: "Practical Info",
    FR: "Infos Pratiques",
    ES: "Info Práctica",
    RU: "Практическая информация",
    ZH: "实用信息"
  },
  premium_guide_credits_left: {
    IT: "guide rimanenti questo mese",
    EN: "guides remaining this month",
    FR: "guides restants ce mois-ci",
    ES: "guías restantes este mes",
    RU: "гидов осталось в этом месяце",
    ZH: "本月剩余导览次数"
  },
  b2b_error: {
    IT: "Errore B2B",
    EN: "B2B Error",
    FR: "Erreur B2B",
    ES: "Error B2B",
    RU: "Ошибка B2B",
    ZH: "B2B 错误"
  },
  selected_items: {
    IT: "Elementi Selezionati",
    EN: "Selected Items",
    FR: "Éléments Sélectionnés",
    ES: "Elementos Seleccionados",
    RU: "Выбранные элементы",
    ZH: "已选项目"
  },
  starting_point: {
    IT: "Punto di Partenza",
    EN: "Starting Point",
    FR: "Point de Départ",
    ES: "Punto de Partida",
    RU: "Точка отправления",
    ZH: "起点"
  },
  starting_point_placeholder: {
    IT: "Es. Indirizzo o città",
    EN: "E.g. Address or city",
    FR: "Ex. Adresse ou ville",
    ES: "Ej. Dirección o ciudad",
    RU: "Напр. Адрес или город",
    ZH: "例如 地址或城市"
  },
  use_my_location: {
    IT: "Usa la mia posizione",
    EN: "Use my location",
    FR: "Utiliser ma position",
    ES: "Usar mi ubicación",
    RU: "Использовать мое местоположение",
    ZH: "使用我的位置"
  },
  radius_km: {
    IT: "Raggio (km)",
    EN: "Radius (km)",
    FR: "Rayon (km)",
    ES: "Radio (km)",
    RU: "Радиус (км)",
    ZH: "半径 (公里)"
  },
  find_3_alts: {
    IT: "Trova 3 Alternative",
    EN: "Find 3 Alternatives",
    FR: "Trouver 3 Alternatives",
    ES: "Buscar 3 Alternativas",
    RU: "Найти 3 альтернативы",
    ZH: "寻找3个替代方案"
  },
  choose_trip: {
    IT: "Scegli il tuo Viaggio",
    EN: "Choose your Trip",
    FR: "Choisissez votre Voyage",
    ES: "Elige tu Viaje",
    RU: "Выберите ваше путешествие",
    ZH: "选择你的旅行"
  },
  here_are_proposals: {
    IT: "Ecco alcune proposte per te",
    EN: "Here are some proposals for you",
    FR: "Voici quelques propositions",
    ES: "Aquí hay algunas propuestas",
    RU: "Вот несколько предложений",
    ZH: "这里有一些建议"
  },
  days_count: {
    IT: "Giorni",
    EN: "Days",
    FR: "Jours",
    ES: "Días",
    RU: "Дни",
    ZH: "天"
  },
  stops_count: {
    IT: "Tappe",
    EN: "Stops",
    FR: "Arrêts",
    ES: "Paradas",
    RU: "Остановки",
    ZH: "停留点"
  },
  go_back: {
    IT: "Torna Indietro",
    EN: "Go Back",
    FR: "Retour",
    ES: "Volver",
    RU: "Назад",
    ZH: "返回"
  },
  saved_count: {
    IT: "Salvati",
    EN: "Saved",
    FR: "Enregistrés",
    ES: "Guardados",
    RU: "Сохранено",
    ZH: "已保存"
  },
  ai_itineraries: {
    IT: "Itinerari AI",
    EN: "AI Itineraries",
    FR: "Itinéraires IA",
    ES: "Itinerarios de IA",
    RU: "Маршруты ИИ",
    ZH: "AI 行程"
  },
  premium_guides_tab: {
    IT: "Guide Premium",
    EN: "Premium Guides",
    FR: "Guides Premium",
    ES: "Guías Premium",
    RU: "Премиум гиды",
    ZH: "高级导游"
  },
  no_saved_itineraries: {
    IT: "Nessun itinerario salvato",
    EN: "No saved itineraries",
    FR: "Aucun itinéraire enregistré",
    ES: "No hay itinerarios guardados",
    RU: "Нет сохраненных маршрутов",
    ZH: "没有保存的行程"
  },
  generate_first: {
    IT: "Genera il tuo primo itinerario!",
    EN: "Generate your first itinerary!",
    FR: "Générez votre premier itinéraire!",
    ES: "¡Genera tu primer itinerario!",
    RU: "Создайте свой первый маршрут!",
    ZH: "生成你的第一个行程！"
  },
  resume_btn: {
    IT: "Riprendi",
    EN: "Resume",
    FR: "Reprendre",
    ES: "Reanudar",
    RU: "Продолжить",
    ZH: "恢复"
  },
  no_pdf_generated: {
    IT: "Nessun PDF generato",
    EN: "No PDF generated",
    FR: "Aucun PDF généré",
    ES: "Ningún PDF generado",
    RU: "PDF не сгенерирован",
    ZH: "未生成 PDF"
  },
  download_pdf_btn: {
    IT: "Scarica PDF",
    EN: "Download PDF",
    FR: "Télécharger PDF",
    ES: "Descargar PDF",
    RU: "Скачать PDF",
    ZH: "下载 PDF"
  },
  from_my_location: {
    IT: "Dalla mia posizione",
    EN: "From my location",
    FR: "De ma position",
    ES: "Desde mi ubicación",
    RU: "От моего местоположения",
    ZH: "从我的位置"
  },
  acquiring_gps: {
    IT: "Acquisizione GPS...",
    EN: "Acquiring GPS...",
    FR: "Acquisition GPS...",
    ES: "Adquiriendo GPS...",
    RU: "Получение GPS...",
    ZH: "获取 GPS 中..."
  },
  custom_address: {
    IT: "Indirizzo Personalizzato",
    EN: "Custom Address",
    FR: "Adresse Personnalisée",
    ES: "Dirección Personalizada",
    RU: "Свой адрес",
    ZH: "自定义地址"
  },
  custom_address_placeholder: {
    IT: "Inserisci un indirizzo",
    EN: "Enter an address",
    FR: "Entrez une adresse",
    ES: "Ingresa una dirección",
    RU: "Введите адрес",
    ZH: "输入地址"
  },
  internal_nav_beta: {
    IT: "Navigatore Interno (Beta)",
    EN: "Internal Navigator (Beta)",
    FR: "Navigateur Interne (Bêta)",
    ES: "Navegador Interno (Beta)",
    RU: "Внутренний навигатор (Бета)",
    ZH: "内部导航器（Beta）"
  },
  open_gmaps: {
    IT: "Apri Google Maps",
    EN: "Open Google Maps",
    FR: "Ouvrir Google Maps",
    ES: "Abrir Google Maps",
    RU: "Открыть Google Maps",
    ZH: "打开谷歌地图"
  },
  areas_to_avoid: {
    IT: "Zone da Evitare",
    EN: "Areas to Avoid",
    FR: "Zones à Éviter",
    ES: "Zonas a Evitar",
    RU: "Зоны, которых следует избегать",
    ZH: "避开区域"
  },
  precautions: {
    IT: "Precauzioni",
    EN: "Precautions",
    FR: "Précautions",
    ES: "Precauciones",
    RU: "Меры предосторожности",
    ZH: "预防措施"
  },
  recommendations: {
    IT: "Raccomandazioni",
    EN: "Recommendations",
    FR: "Recommandations",
    ES: "Recomendaciones",
    RU: "Рекомендации",
    ZH: "建议"
  },
  tips: {
    IT: "Consigli",
    EN: "Tips",
    FR: "Conseils",
    ES: "Consejos",
    RU: "Советы",
    ZH: "提示"
  },
  travel_info: {
    IT: "Info di Viaggio",
    EN: "Travel Info",
    FR: "Infos de Voyage",
    ES: "Info de Viaje",
    RU: "Информация о поездке",
    ZH: "旅行信息"
  },
  travel_info_desc: {
    IT: "Informazioni importanti per il tuo viaggio",
    EN: "Important information for your trip",
    FR: "Informations importantes",
    ES: "Información importante",
    RU: "Важная информация",
    ZH: "重要旅行信息"
  },
  sections_count: {
    IT: "Sezioni",
    EN: "Sections",
    FR: "Sections",
    ES: "Secciones",
    RU: "Разделы",
    ZH: "章节"
  },
  exact_address: {
    IT: "Indirizzo Esatto",
    EN: "Exact Address",
    FR: "Adresse Exacte",
    ES: "Dirección Exacta",
    RU: "Точный адрес",
    ZH: "详细地址"
  },
  calc_distance: {
    IT: "Calcola Distanza",
    EN: "Calculate Distance",
    FR: "Calculer Distance",
    ES: "Calcular Distancia",
    RU: "Рассчитать расстояние",
    ZH: "计算距离"
  },
  tickets_experiences: {
    IT: "Biglietti ed Esperienze",
    EN: "Tickets and Experiences",
    FR: "Billets et Expériences",
    ES: "Entradas y Experiencias",
    RU: "Билеты и Впечатления",
    ZH: "门票与体验"
  },
  skip_line: {
    IT: "Salta la Coda",
    EN: "Skip the Line",
    FR: "Coupe-file",
    ES: "Saltar la Cola",
    RU: "Без очереди",
    ZH: "免排队"
  },
  search_gyg: {
    IT: "Cerca su GetYourGuide",
    EN: "Search on GetYourGuide",
    FR: "Chercher sur GetYourGuide",
    ES: "Buscar en GetYourGuide",
    RU: "Поиск на GetYourGuide",
    ZH: "在 GetYourGuide 上搜索"
  },
  there_are: {
    IT: "Ci sono",
    EN: "There are",
    FR: "Il y a",
    ES: "Hay",
    RU: "Там есть",
    ZH: "有"
  },
  premium_error: {
    IT: "Errore Premium",
    EN: "Premium Error",
    FR: "Erreur Premium",
    ES: "Error Premium",
    RU: "Ошибка Premium",
    ZH: "高级错误"
  },
  updating: {
    IT: "Aggiornamento...",
    EN: "Updating...",
    FR: "Mise à jour...",
    ES: "Actualizando...",
    RU: "Обновление...",
    ZH: "更新中..."
  },
  loading_db: {
    IT: "Caricamento database...",
    EN: "Loading database...",
    FR: "Chargement de la base...",
    ES: "Cargando base de datos...",
    RU: "Загрузка базы данных...",
    ZH: "加载数据库..."
  },
  conn_error: {
    IT: "Errore di connessione",
    EN: "Connection error",
    FR: "Erreur de connexion",
    ES: "Error de conexión",
    RU: "Ошибка подключения",
    ZH: "连接错误"
  },
  loading_history: {
    IT: "Caricamento cronologia...",
    EN: "Loading history...",
    FR: "Chargement de l'historique...",
    ES: "Cargando historial...",
    RU: "Загрузка истории...",
    ZH: "加载历史记录..."
  },
  no_history: {
    IT: "Nessun Ascolto",
    EN: "No Listening History",
    FR: "Aucune écoute",
    ES: "No hay historial",
    RU: "Нет истории прослушиваний",
    ZH: "没有收听记录"
  },
  audio_history_desc: {
    IT: "Gli audio che ascolti appariranno qui",
    EN: "The audios you listen to will appear here",
    FR: "Les audios écoutés apparaîtront ici",
    ES: "Los audios que escuches aparecerán aquí",
    RU: "Прослушанные аудио появятся здесь",
    ZH: "你收听的音频将显示在这里"
  },
  today_at: {
    IT: "Oggi alle ",
    EN: "Today at ",
    FR: "Aujourd'hui à ",
    ES: "Hoy a las ",
    RU: "Сегодня в ",
    ZH: "今天 "
  },
  loc_updated: {
    IT: "Posizione aggiornata",
    EN: "Location updated",
    FR: "Position mise à jour",
    ES: "Ubicación actualizada",
    RU: "Местоположение обновлено",
    ZH: "位置已更新"
  },
  loc_error: {
    IT: "Errore posizione",
    EN: "Location error",
    FR: "Erreur de position",
    ES: "Error de ubicación",
    RU: "Ошибка местоположения",
    ZH: "位置错误"
  },
  loc_unsupported: {
    IT: "Posizione non supportata",
    EN: "Location unsupported",
    FR: "Position non supportée",
    ES: "Ubicación no soportada",
    RU: "Местоположение не поддерживается",
    ZH: "不支持的位置"
  },
  score: {
    IT: "Punteggio",
    EN: "Score",
    FR: "Score",
    ES: "Puntuación",
    RU: "Счет",
    ZH: "得分"
  },
  explored_places: {
    IT: "Luoghi Esplorati",
    EN: "Explored Places",
    FR: "Lieux Explorés",
    ES: "Lugares Explorados",
    RU: "Исследованные места",
    ZH: "探索过的地方"
  },
  explored_empty: {
    IT: "Nessun luogo esplorato",
    EN: "No explored places",
    FR: "Aucun lieu exploré",
    ES: "Ningún lugar explorado",
    RU: "Нет исследованных мест",
    ZH: "没有探索过的地方"
  },
  poi_play: {
    IT: "Ascolta",
    EN: "Listen",
    FR: "Écouter",
    ES: "Escuchar",
    RU: "Слушать",
    ZH: "收听"
  },
  show_more: {
    IT: "Scopri di più",
    EN: "Show more",
    FR: "En savoir plus",
    ES: "Ver más",
    RU: "Подробнее",
    ZH: "更多"
  },
  show_less: {
    IT: "Meno",
    EN: "Show less",
    FR: "Moins",
    ES: "Ver menos",
    RU: "Меньше",
    ZH: "收起"
  },
  built_in: {
    IT: "Costruito:",
    EN: "Built:",
    FR: "Construit:",
    ES: "Construido:",
    RU: "Построено:",
    ZH: "建造于:"
  },
  architect_label: {
    IT: "Architetto:",
    EN: "Architect:",
    FR: "Architecte:",
    ES: "Arquitecto:",
    RU: "Архитектор:",
    ZH: "建筑师:"
  },
  style_label: {
    IT: "Stile:",
    EN: "Style:",
    FR: "Style:",
    ES: "Estilo:",
    RU: "Стиль:",
    ZH: "风格:"
  },
  read_on_wikipedia: {
    IT: "Leggi su Wikipedia",
    EN: "Read on Wikipedia",
    FR: "Lire sur Wikipédia",
    ES: "Leer en Wikipedia",
    RU: "Читать в Википедии",
    ZH: "在维基百科阅读"
  },
  stop_audio: {
    IT: "Ferma audio e torna",
    EN: "Stop audio and return",
    FR: "Arrêter l'audio et revenir",
    ES: "Detener audio e volver",
    RU: "Остановить audio и вернуться",
    ZH: "停止音频并返回"
  },
  add_to_favorites: {
    IT: "Aggiungi ai preferiti",
    EN: "Add to favorites",
    FR: "Ajouter aux favoris",
    ES: "Añadir a favoritos",
    RU: "Добавить в избранное",
    ZH: "加入收藏"
  },
  removed_from_favorites: {
    IT: "Rimosso dai preferiti ✓",
    EN: "Removed from favorites ✓",
    FR: "Retiré des favoris ✓",
    ES: "Eliminado de favoritos ✓",
    RU: "Удалено из избранного ✓",
    ZH: "已从收藏中移除 ✓"
  },
  no_description: {
    IT: "Nessuna descrizione disponibile.",
    EN: "No description available.",
    FR: "Aucune descrizione disponible.",
    ES: "No hay descrizione disponibile.",
    RU: "Описание отсутствует.",
    ZH: "暂无描述。"
  },
  listen_deep: {
    IT: "Ascolta Approfondimento",
    EN: "Listen to Deep Dive",
    FR: "Écouter l'analyse",
    ES: "Escuchar Análisis",
    RU: "Слушать подробнее",
    ZH: "收听深度解析"
  },
  regenerating_label: {
    IT: "Rigenerazione in corso...",
    EN: "Regenerating...",
    FR: "Régénération en cours...",
    ES: "Regenerando...",
    RU: "Регенерация...",
    ZH: "正在重新生成..."
  },
  loading_dots: {
    IT: "Caricamento in corso...",
    EN: "Loading...",
    FR: "Chargement...",
    ES: "Cargando...",
    RU: "Загрузка...",
    ZH: "正在加载..."
  },
  restart_btn: {
    IT: "Ricomincia",
    EN: "Restart",
    FR: "Redémarrer",
    ES: "Reiniciar",
    RU: "Начать сначала",
    ZH: "重播"
  },
  forward_10s: {
    IT: "Avanti 10s",
    EN: "Forward 10s",
    FR: "Avance 10s",
    ES: "Adelante 10s",
    RU: "Вперед 10с",
    ZH: "快进10秒"
  },

  // ── Modalità 3 (Raggio) e 4 (Swip) ───────────────────────────────────
  // Prima erano stringhe hardcoded `language === 'IT' ? ... : ...`: chi usava
  // FR/ES/RU/ZH si trovava mezza schermata in inglese e mezza in italiano.
  radius_mode: {
    IT: "Raggio", EN: "Radius", FR: "Rayon", ES: "Radio", RU: "Радиус", ZH: "半径探索"
  },
  radius_mode_desc: {
    IT: "Scegli base e raggio per 3 alternative",
    EN: "Choose base, radius for 3 options",
    FR: "Choisissez une base et un rayon pour 3 options",
    ES: "Elige base y radio para 3 opciones",
    RU: "Выберите базу и радиус для 3 вариантов",
    ZH: "选择出发地和半径，获取 3 个方案"
  },
  swip_mode: {
    IT: "Swip", EN: "Swip", FR: "Swip", ES: "Swip", RU: "Swip", ZH: "滑动选择"
  },
  swip_mode_desc: {
    IT: "Scorri e scegli le attrazioni",
    EN: "Swipe to choose attractions",
    FR: "Balayez pour choisir les attractions",
    ES: "Desliza y elige las atracciones",
    RU: "Свайпайте и выбирайте достопримечательности",
    ZH: "滑动卡片挑选景点"
  },
  swip_subtitle: {
    IT: "Scegli le attrazioni che ti piacciono",
    EN: "Choose attractions you like",
    FR: "Choisissez les attractions qui vous plaisent",
    ES: "Elige las atracciones que te gustan",
    RU: "Выберите понравившиеся достопримечательности",
    ZH: "挑选您喜欢的景点"
  },
  attraction_types: {
    IT: "Tipo di Attrazioni", EN: "Attraction Types", FR: "Types d'attractions",
    ES: "Tipos de atracciones", RU: "Типы достопримечательностей", ZH: "景点类型"
  },
  start_swip: {
    IT: "Inizia lo Swip!", EN: "Start Swip!", FR: "Commencer le Swip !",
    ES: "¡Empieza el Swip!", RU: "Начать Swip!", ZH: "开始滑动！"
  },
  loading_attractions: {
    IT: "Carico le attrazioni...", EN: "Loading attractions...",
    FR: "Chargement des attractions...", ES: "Cargando atracciones...",
    RU: "Загрузка достопримечательностей...", ZH: "正在加载景点..."
  },
  no_attractions_found: {
    IT: "Nessuna attrazione trovata", EN: "No attractions found",
    FR: "Aucune attraction trouvée", ES: "No se encontraron atracciones",
    RU: "Достопримечательности не найдены", ZH: "未找到景点"
  },
  try_again: {
    IT: "Riprova", EN: "Try Again", FR: "Réessayer", ES: "Reintentar",
    RU: "Повторить", ZH: "重试"
  },
  seen_all_attractions: {
    IT: "Hai visto tutte le attrazioni!", EN: "You've seen all attractions!",
    FR: "Vous avez vu toutes les attractions !", ES: "¡Has visto todas las atracciones!",
    RU: "Вы просмотрели все достопримечательности!", ZH: "您已浏览完所有景点！"
  },
  stops_selected: {
    IT: "tappe selezionate", EN: "stops selected", FR: "étapes sélectionnées",
    ES: "paradas seleccionadas", RU: "остановок выбрано", ZH: "个已选行程点"
  },
  review_stops: {
    IT: "Rivedi le Tappe", EN: "Review Stops", FR: "Revoir les étapes",
    ES: "Revisar paradas", RU: "Проверить остановки", ZH: "查看行程点"
  },
  review_stops_subtitle: {
    IT: "Rimuovi o sostituisci prima di generare",
    EN: "Remove or replace before generating",
    FR: "Supprimez ou remplacez avant de générer",
    ES: "Elimina o sustituye antes de generar",
    RU: "Удалите или замените перед генерацией",
    ZH: "生成前可删除或替换"
  },
  start_over: {
    IT: "Ricomincia", EN: "Start Over", FR: "Recommencer", ES: "Empezar de nuevo",
    RU: "Начать заново", ZH: "重新开始"
  },
  undo_last: {
    IT: "Annulla", EN: "Undo", FR: "Annuler", ES: "Deshacer", RU: "Отменить", ZH: "撤销"
  },
  no_stops_selected: {
    IT: "Nessuna tappa selezionata", EN: "No stops selected",
    FR: "Aucune étape sélectionnée", ES: "Ninguna parada seleccionada",
    RU: "Остановки не выбраны", ZH: "未选择行程点"
  },
  back_to_swip: {
    IT: "Torna allo Swip", EN: "Back to Swip", FR: "Retour au Swip",
    ES: "Volver al Swip", RU: "Назад к Swip", ZH: "返回滑动"
  },
  selected_label: {
    IT: "Selezionati", EN: "Selected", FR: "Sélectionnés", ES: "Seleccionados",
    RU: "Выбрано", ZH: "已选择"
  },
  choose_alternative: {
    IT: "Scegli un'alternativa", EN: "Choose an alternative",
    FR: "Choisissez une alternative", ES: "Elige una alternativa",
    RU: "Выберите альтернативу", ZH: "选择替代项"
  },
  no_alternatives: {
    IT: "Nessuna alternativa disponibile", EN: "No alternatives available",
    FR: "Aucune alternative disponible", ES: "No hay alternativas disponibles",
    RU: "Альтернатив нет", ZH: "无可用替代项"
  },
  use_alternative: {
    IT: "Usa", EN: "Use", FR: "Utiliser", ES: "Usar", RU: "Выбрать", ZH: "使用"
  },
  replace_action: {
    IT: "Sostituisci", EN: "Replace", FR: "Remplacer", ES: "Sustituir",
    RU: "Заменить", ZH: "替换"
  },
  remove_action: {
    IT: "Rimuovi", EN: "Remove", FR: "Supprimer", ES: "Eliminar",
    RU: "Удалить", ZH: "移除"
  },
  generate_itinerary_with: {
    IT: "Genera Itinerario con", EN: "Generate Itinerary with",
    FR: "Générer l'itinéraire avec", ES: "Generar itinerario con",
    RU: "Создать маршрут из", ZH: "生成行程，包含"
  },
  stops_word: {
    IT: "tappe", EN: "stops", FR: "étapes", ES: "paradas", RU: "остановок", ZH: "个行程点"
  },
  generate_3_more: {
    IT: "Genera altre 3 idee", EN: "Generate 3 more ideas",
    FR: "Générer 3 autres idées", ES: "Generar 3 ideas más",
    RU: "Ещё 3 идеи", ZH: "再生成 3 个方案"
  },
  saved_trips: {
    IT: "Viaggi salvati", EN: "Saved trips", FR: "Voyages enregistrés",
    ES: "Viajes guardados", RU: "Сохранённые поездки", ZH: "已保存的行程"
  },
  no_internet: {
    IT: "Senza internet", EN: "No internet", FR: "Sans internet",
    ES: "Sin internet", RU: "Без интернета", ZH: "无需联网"
  },

  // ── Impostazioni avanzate (condivise dalle 4 modalità) ────────────────
  include_events: {
    IT: "Includi Eventi Locali", EN: "Include Local Events",
    FR: "Inclure les événements locaux", ES: "Incluir eventos locales",
    RU: "Включить местные события", ZH: "包含本地活动"
  },
  include_events_desc: {
    IT: "Concerti, sport, fiere nelle vicinanze",
    EN: "Concerts, sports and fairs nearby",
    FR: "Concerts, sports et foires à proximité",
    ES: "Conciertos, deportes y ferias cercanas",
    RU: "Концерты, спорт и ярмарки поблизости",
    ZH: "附近的音乐会、体育赛事与展会"
  },
  include_tours: {
    IT: "Includi Tour e Attività", EN: "Include Tours & Activities",
    FR: "Inclure visites et activités", ES: "Incluir tours y actividades",
    RU: "Включить туры и активности", ZH: "包含旅游团与活动"
  },
  include_tours_desc: {
    IT: "Esperienze e biglietti dai partner",
    EN: "Experiences and tickets from partners",
    FR: "Expériences et billets des partenaires",
    ES: "Experiencias y entradas de socios",
    RU: "Впечатления и билеты от партнёров",
    ZH: "来自合作伙伴的体验与门票"
  },
  budget_label: {
    IT: "Budget", EN: "Budget", FR: "Budget", ES: "Presupuesto", RU: "Бюджет", ZH: "预算"
  },
  budget_economico: {
    IT: "Economico", EN: "Budget", FR: "Économique", ES: "Económico", RU: "Экономный", ZH: "经济型"
  },
  budget_standard: {
    IT: "Standard", EN: "Standard", FR: "Standard", ES: "Estándar", RU: "Стандартный", ZH: "标准型"
  },
  budget_lusso: {
    IT: "Lusso", EN: "Luxury", FR: "Luxe", ES: "Lujo", RU: "Люкс", ZH: "豪华型"
  },
  travelers_label: {
    IT: "Viaggiatori", EN: "Travellers", FR: "Voyageurs", ES: "Viajeros",
    RU: "Путешественники", ZH: "出行人数"
  },
  travelers_solo: {
    IT: "Solo", EN: "Solo", FR: "Solo", ES: "Solo", RU: "Один", ZH: "单人"
  },
  travelers_coppia: {
    IT: "Coppia", EN: "Couple", FR: "Couple", ES: "Pareja", RU: "Пара", ZH: "情侣"
  },
  travelers_famiglia: {
    IT: "Famiglia", EN: "Family", FR: "Famille", ES: "Familia", RU: "Семья", ZH: "家庭"
  },
  travelers_gruppo: {
    IT: "Gruppo", EN: "Group", FR: "Groupe", ES: "Grupo", RU: "Группа", ZH: "团体"
  },
  pace_label: {
    IT: "Ritmo", EN: "Pace", FR: "Rythme", ES: "Ritmo", RU: "Темп", ZH: "节奏"
  },
  pace_rilassato: {
    IT: "Rilassato", EN: "Relaxed", FR: "Détendu", ES: "Relajado", RU: "Расслабленный", ZH: "轻松"
  },
  pace_standard: {
    IT: "Standard", EN: "Standard", FR: "Standard", ES: "Estándar", RU: "Стандартный", ZH: "标准"
  },
  pace_intenso: {
    IT: "Intenso", EN: "Intense", FR: "Intense", ES: "Intenso", RU: "Насыщенный", ZH: "紧凑"
  },
  guide_label: {
    IT: "Guida", EN: "Guide", FR: "Guide", ES: "Guía", RU: "Гид", ZH: "导览员"
  },
  guide_nicky: {
    IT: "Nicky (Locale)", EN: "Nicky (Local)", FR: "Nicky (Local)",
    ES: "Nicky (Local)", RU: "Ники (местный)", ZH: "Nicky（本地向导）"
  },
  guide_dante: {
    IT: "Dante (Storico)", EN: "Dante (Historian)", FR: "Dante (Historien)",
    ES: "Dante (Historiador)", RU: "Данте (историк)", ZH: "Dante（历史学家）"
  },
  guide_entrambi: {
    IT: "Entrambi", EN: "Both", FR: "Les deux", ES: "Ambos", RU: "Оба", ZH: "两者"
  },

  // ── Mesi (le select erano hardcoded in italiano in tutte le lingue) ────
  month_any: {
    IT: "Indifferente", EN: "Any", FR: "Peu importe", ES: "Cualquiera",
    RU: "Любой", ZH: "不限"
  },
  month_1:  { IT: "Gennaio",   EN: "January",   FR: "Janvier",   ES: "Enero",      RU: "Январь",   ZH: "一月" },
  month_2:  { IT: "Febbraio",  EN: "February",  FR: "Février",   ES: "Febrero",    RU: "Февраль",  ZH: "二月" },
  month_3:  { IT: "Marzo",     EN: "March",     FR: "Mars",      ES: "Marzo",      RU: "Март",     ZH: "三月" },
  month_4:  { IT: "Aprile",    EN: "April",     FR: "Avril",     ES: "Abril",      RU: "Апрель",   ZH: "四月" },
  month_5:  { IT: "Maggio",    EN: "May",       FR: "Mai",       ES: "Mayo",       RU: "Май",      ZH: "五月" },
  month_6:  { IT: "Giugno",    EN: "June",      FR: "Juin",      ES: "Junio",      RU: "Июнь",     ZH: "六月" },
  month_7:  { IT: "Luglio",    EN: "July",      FR: "Juillet",   ES: "Julio",      RU: "Июль",     ZH: "七月" },
  month_8:  { IT: "Agosto",    EN: "August",    FR: "Août",      ES: "Agosto",     RU: "Август",   ZH: "八月" },
  month_9:  { IT: "Settembre", EN: "September", FR: "Septembre", ES: "Septiembre", RU: "Сентябрь", ZH: "九月" },
  month_10: { IT: "Ottobre",   EN: "October",   FR: "Octobre",   ES: "Octubre",    RU: "Октябрь",  ZH: "十月" },
  month_11: { IT: "Novembre",  EN: "November",  FR: "Novembre",  ES: "Noviembre",  RU: "Ноябрь",   ZH: "十一月" },
  month_12: { IT: "Dicembre",  EN: "December",  FR: "Décembre",  ES: "Diciembre",  RU: "Декабрь",  ZH: "十二月" },

  // ── Interessi (form_c) ────────────────────────────────────────────────
  interest_arte: {
    IT: "Arte & Cultura", EN: "Art & Culture", FR: "Art et culture",
    ES: "Arte y cultura", RU: "Искусство и культура", ZH: "艺术与文化"
  },
  interest_famiglia: {
    IT: "Famiglie", EN: "Families", FR: "Familles", ES: "Familias", RU: "Для семьи", ZH: "亲子"
  },
  interest_enogastronomia: {
    IT: "Enogastronomia", EN: "Food & Wine", FR: "Gastronomie", ES: "Enogastronomía",
    RU: "Гастрономия", ZH: "美食与美酒"
  },
  interest_mare: {
    IT: "Mare", EN: "Sea", FR: "Mer", ES: "Mar", RU: "Море", ZH: "海滨"
  },
  interest_montagna: {
    IT: "Montagna", EN: "Mountains", FR: "Montagne", ES: "Montaña", RU: "Горы", ZH: "山地"
  },
  interest_natura: {
    IT: "Natura", EN: "Nature", FR: "Nature", ES: "Naturaleza", RU: "Природа", ZH: "自然"
  },
  interest_relax: {
    IT: "Relax", EN: "Relax", FR: "Détente", ES: "Relax", RU: "Отдых", ZH: "休闲"
  },
  interest_avventura: {
    IT: "Avventura", EN: "Adventure", FR: "Aventure", ES: "Aventura", RU: "Приключения", ZH: "探险"
  },

  // ── Categorie attrazioni (tinder_form) ────────────────────────────────
  cat_musei: {
    IT: "Musei", EN: "Museums", FR: "Musées", ES: "Museos", RU: "Музеи", ZH: "博物馆"
  },
  cat_monumenti: {
    IT: "Monumenti", EN: "Monuments", FR: "Monuments", ES: "Monumentos",
    RU: "Памятники", ZH: "古迹"
  },
  cat_chiese: {
    IT: "Chiese", EN: "Churches", FR: "Églises", ES: "Iglesias", RU: "Церкви", ZH: "教堂"
  },
  cat_attrazioni: {
    IT: "Attrazioni", EN: "Attractions", FR: "Attractions", ES: "Atracciones",
    RU: "Достопримечательности", ZH: "景点"
  },
  cat_gastronomia: {
    IT: "Gastronomia", EN: "Food", FR: "Gastronomie", ES: "Gastronomía",
    RU: "Гастрономия", ZH: "美食"
  },
  cat_natura: {
    IT: "Natura", EN: "Nature", FR: "Nature", ES: "Naturaleza", RU: "Природа", ZH: "自然"
  },
  cat_shopping: {
    IT: "Shopping", EN: "Shopping", FR: "Shopping", ES: "Compras", RU: "Шопинг", ZH: "购物"
  },

  // ── Badge e azioni sulle tappe ────────────────────────────────────────
  badge_visited: {
    IT: "Visitato", EN: "Visited", FR: "Visité", ES: "Visitado", RU: "Посещено", ZH: "已到访"
  },
  badge_verified: {
    IT: "Verificata", EN: "Verified", FR: "Vérifiée", ES: "Verificada",
    RU: "Проверено", ZH: "已核实"
  },
  badge_to_verify: {
    IT: "Da verificare", EN: "To verify", FR: "À vérifier", ES: "Por verificar",
    RU: "Требует проверки", ZH: "待核实"
  },
  badge_verified_tooltip: {
    IT: "Tappa confermata dalla verifica AI incrociata",
    EN: "Stop confirmed by cross-checked AI verification",
    FR: "Étape confirmée par vérification croisée de l'IA",
    ES: "Parada confirmada por verificación cruzada de IA",
    RU: "Остановка подтверждена перекрёстной AI-проверкой",
    ZH: "该行程点已通过 AI 交叉核实"
  },
  source_label: {
    IT: "Fonte", EN: "Source", FR: "Source", ES: "Fuente", RU: "Источник", ZH: "来源"
  },
  buy_see_tour: {
    IT: "Acquista / Vedi Tour", EN: "Book / View Tour", FR: "Réserver / Voir le tour",
    ES: "Reservar / Ver tour", RU: "Купить / Посмотреть тур", ZH: "购买 / 查看行程"
  },
  move_up: {
    IT: "Sposta su", EN: "Move up", FR: "Monter", ES: "Subir", RU: "Вверх", ZH: "上移"
  },
  move_down: {
    IT: "Sposta giù", EN: "Move down", FR: "Descendre", ES: "Bajar", RU: "Вниз", ZH: "下移"
  },
  lock_stop: {
    IT: "Blocca tappa (non verrà cambiata rigenerando)",
    EN: "Lock stop (kept when regenerating)",
    FR: "Verrouiller l'étape (conservée à la régénération)",
    ES: "Bloquear parada (se mantiene al regenerar)",
    RU: "Закрепить остановку (сохранится при повторной генерации)",
    ZH: "锁定行程点（重新生成时保留）"
  },
  confirm_delete_stop: {
    IT: "Vuoi eliminare questa tappa dall'itinerario?",
    EN: "Delete this stop from the itinerary?",
    FR: "Supprimer cette étape de l'itinéraire ?",
    ES: "¿Eliminar esta parada del itinerario?",
    RU: "Удалить эту остановку из маршрута?",
    ZH: "确定从行程中删除该点吗？"
  },
  suggest_with_ai: {
    IT: "Suggerisci con AI", EN: "Suggest with AI", FR: "Suggérer avec l'IA",
    ES: "Sugerir con IA", RU: "Предложить с ИИ", ZH: "用 AI 推荐"
  },
  save_btn: {
    IT: "Salva", EN: "Save", FR: "Enregistrer", ES: "Guardar", RU: "Сохранить", ZH: "保存"
  },
  stop_type_visita: {
    IT: "Azione/Visita", EN: "Activity/Visit", FR: "Activité/Visite",
    ES: "Actividad/Visita", RU: "Активность/Посещение", ZH: "活动/参观"
  },
  stop_type_ristorante: {
    IT: "Ristorante", EN: "Restaurant", FR: "Restaurant", ES: "Restaurante",
    RU: "Ресторан", ZH: "餐厅"
  },
  stop_type_spostamento: {
    IT: "Spostamento", EN: "Transfer", FR: "Déplacement", ES: "Traslado",
    RU: "Переезд", ZH: "交通"
  },
  premium_experiences: {
    IT: "Esperienze Premium consigliate", EN: "Recommended Premium Experiences",
    FR: "Expériences premium recommandées", ES: "Experiencias premium recomendadas",
    RU: "Рекомендуемые премиум-впечатления", ZH: "推荐的精选体验"
  },

  // ── Feedback / errori (sostituiscono gli alert() nativi) ──────────────
  err_no_destination: {
    IT: "Inserisci almeno una destinazione.", EN: "Enter at least one destination.",
    FR: "Saisissez au moins une destination.", ES: "Introduce al menos un destino.",
    RU: "Укажите хотя бы один пункт назначения.", ZH: "请至少输入一个目的地。"
  },
  err_no_base: {
    IT: "Inserisci una città di partenza.", EN: "Enter a starting city.",
    FR: "Saisissez une ville de départ.", ES: "Introduce una ciudad de partida.",
    RU: "Укажите город отправления.", ZH: "请输入出发城市。"
  },
  err_valid_destination: {
    IT: "Inserisci una destinazione valida (almeno 3 caratteri).",
    EN: "Enter a valid destination (at least 3 characters).",
    FR: "Saisissez une destination valide (au moins 3 caractères).",
    ES: "Introduce un destino válido (mínimo 3 caracteres).",
    RU: "Введите корректный пункт назначения (не менее 3 символов).",
    ZH: "请输入有效目的地（至少 3 个字符）。"
  },
  err_no_favorites: {
    IT: "Seleziona almeno un luogo dai preferiti.",
    EN: "Select at least one saved place.",
    FR: "Sélectionnez au moins un lieu enregistré.",
    ES: "Selecciona al menos un lugar guardado.",
    RU: "Выберите хотя бы одно сохранённое место.",
    ZH: "请至少选择一个收藏地点。"
  },
  err_no_liked: {
    IT: "Seleziona almeno un'attrazione col cuore.",
    EN: "Select at least one attraction with the heart.",
    FR: "Sélectionnez au moins une attraction avec le cœur.",
    ES: "Selecciona al menos una atracción con el corazón.",
    RU: "Отметьте сердечком хотя бы одну достопримечательность.",
    ZH: "请用爱心至少选择一个景点。"
  },
  err_insufficient_credits: {
    IT: "Crediti insufficienti. Visita lo store per ricaricare.",
    EN: "Not enough credits. Visit the store to top up.",
    FR: "Crédits insuffisants. Visitez la boutique pour recharger.",
    ES: "Créditos insuficientes. Visita la tienda para recargar.",
    RU: "Недостаточно кредитов. Пополните в магазине.",
    ZH: "点数不足，请前往商店充值。"
  },
  err_generation_refunded: {
    IT: "Generazione non riuscita. I crediti ti sono stati restituiti.",
    EN: "Generation failed. Your credits have been refunded.",
    FR: "Échec de la génération. Vos crédits ont été remboursés.",
    ES: "Error en la generación. Se te han devuelto los créditos.",
    RU: "Ошибка генерации. Кредиты возвращены.",
    ZH: "生成失败，点数已退还。"
  },
  err_no_alternatives: {
    IT: "Nessuna alternativa trovata. Riprova con un raggio più ampio.",
    EN: "No alternatives found. Try a wider radius.",
    FR: "Aucune alternative trouvée. Essayez un rayon plus large.",
    ES: "No se encontraron alternativas. Prueba un radio mayor.",
    RU: "Альтернатив не найдено. Попробуйте больший радиус.",
    ZH: "未找到方案，请尝试更大的半径。"
  },
  err_candidates: {
    IT: "Errore nel recupero delle attrazioni. Riprova.",
    EN: "Error retrieving attractions. Please try again.",
    FR: "Erreur lors de la récupération des attractions. Réessayez.",
    ES: "Error al recuperar las atracciones. Inténtalo de nuevo.",
    RU: "Ошибка загрузки достопримечательностей. Повторите попытку.",
    ZH: "获取景点失败，请重试。"
  },
  err_location_not_found: {
    IT: "Località non trovata. Controlla il nome e riprova.",
    EN: "Location not found. Check the name and try again.",
    FR: "Lieu introuvable. Vérifiez le nom et réessayez.",
    ES: "Ubicación no encontrada. Comprueba el nombre e inténtalo de nuevo.",
    RU: "Место не найдено. Проверьте название и повторите.",
    ZH: "未找到该地点，请检查名称后重试。"
  },
  err_gps_failed: {
    IT: "Impossibile ottenere la posizione.", EN: "Could not get your location.",
    FR: "Impossible d'obtenir la position.", ES: "No se pudo obtener la ubicación.",
    RU: "Не удалось определить местоположение.", ZH: "无法获取您的位置。"
  },
  err_end_before_start: {
    IT: "L'orario di fine deve essere successivo a quello di inizio.",
    EN: "End time must be later than start time.",
    FR: "L'heure de fin doit être postérieure à l'heure de début.",
    ES: "La hora de fin debe ser posterior a la de inicio.",
    RU: "Время окончания должно быть позже времени начала.",
    ZH: "结束时间必须晚于开始时间。"
  },
  getting_location: {
    IT: "Rilevamento posizione...", EN: "Getting location...",
    FR: "Localisation en cours...", ES: "Obteniendo ubicación...",
    RU: "Определение местоположения...", ZH: "正在定位..."
  },
  cache_hit_discount: {
    IT: "Itinerario pronto dalla nostra libreria: consegna immediata e metà prezzo",
    EN: "Itinerary ready from our library: instant delivery, half price",
    FR: "Itinéraire prêt dans notre bibliothèque : livraison immédiate, moitié prix",
    ES: "Itinerario listo en nuestra biblioteca: entrega inmediata y mitad de precio",
    RU: "Маршрут уже в нашей библиотеке: мгновенно и за полцены",
    ZH: "行程已在我们的库中：即时交付，半价"
  },
  credits_refunded: {
    IT: "crediti restituiti", EN: "credits refunded", FR: "crédits remboursés",
    ES: "créditos devueltos", RU: "кредитов возвращено", ZH: "点数已退还"
  },
  library_note: {
    IT: "Se è già nella nostra libreria, lo ricevi subito a metà prezzo",
    EN: "If it's already in our library, you get it instantly at half price",
    FR: "S'il est déjà dans notre bibliothèque, vous l'obtenez aussitôt à moitié prix",
    ES: "Si ya está en nuestra biblioteca, lo recibes al instante a mitad de precio",
    RU: "Если он уже в нашей библиотеке, вы получите его сразу за полцены",
    ZH: "若已在我们的库中，将立即以半价交付"
  },
  warn_favorites_spread: {
    IT: "I luoghi che hai scelto sono molto distanti tra loro",
    EN: "The places you picked are very far apart",
    FR: "Les lieux choisis sont très éloignés les uns des autres",
    ES: "Los lugares que has elegido están muy alejados entre sí",
    RU: "Выбранные места находятся очень далеко друг от друга",
    ZH: "您选择的地点彼此相距很远"
  },
  warn_continue_anyway: {
    IT: "Vuoi continuare comunque?", EN: "Continue anyway?",
    FR: "Continuer quand même ?", ES: "¿Continuar de todos modos?",
    RU: "Всё равно продолжить?", ZH: "仍要继续吗？"
  },
  free_label: {
    IT: "gratis", EN: "free", FR: "gratuit", ES: "gratis", RU: "бесплатно", ZH: "免费"
  },
  credits_label: {
    IT: "crediti", EN: "credits", FR: "crédits", ES: "créditos", RU: "кредитов", ZH: "点数"
  },
  free_replacement_done: {
    IT: "Sostituzione gratuita effettuata", EN: "Free replacement done",
    FR: "Remplacement gratuit effectué", ES: "Sustitución gratuita realizada",
    RU: "Бесплатная замена выполнена", ZH: "已完成免费替换"
  },
  remaining_today: {
    IT: "ancora gratis su questo giorno", EN: "free left on this day",
    FR: "gratuits restants sur ce jour", ES: "gratis restantes en este día",
    RU: "бесплатных осталось на этот день", ZH: "该日剩余免费次数"
  },
  free_replacements_left: {
    IT: "sostituzioni gratis", EN: "free replacements",
    FR: "remplacements gratuits", ES: "sustituciones gratis",
    RU: "бесплатных замен", ZH: "次免费替换"
  },
  read_more: {
    IT: "Leggi tutto", EN: "Read more", FR: "Lire la suite", ES: "Leer más",
    RU: "Читать далее", ZH: "展开"
  },
  read_less: {
    IT: "Riduci", EN: "Read less", FR: "Réduire", ES: "Leer menos",
    RU: "Свернуть", ZH: "收起"
  },
  explore_map: {
    IT: "Esplora la mappa", EN: "Explore the map", FR: "Explorer la carte",
    ES: "Explorar el mapa", RU: "Открыть карту", ZH: "浏览地图"
  },
  add_destination: {
    IT: "Aggiungi destinazione", EN: "Add destination", FR: "Ajouter une destination",
    ES: "Añadir destino", RU: "Добавить пункт назначения", ZH: "添加目的地"
  },
  searching: {
    IT: "Ricerca...", EN: "Searching...", FR: "Recherche...", ES: "Buscando...",
    RU: "Поиск...", ZH: "搜索中..."
  },
  no_results: {
    IT: "Nessun risultato trovato.", EN: "No results found.",
    FR: "Aucun résultat trouvé.", ES: "No se encontraron resultados.",
    RU: "Ничего не найдено.", ZH: "未找到结果。"
  },
  experience_added: {
    IT: "Esperienza aggiunta all'itinerario", EN: "Experience added to the itinerary",
    FR: "Expérience ajoutée à l'itinéraire", ES: "Experiencia añadida al itinerario",
    RU: "Впечатление добавлено в маршрут", ZH: "体验已加入行程"
  },
  event_added: {
    IT: "Evento aggiunto all'itinerario", EN: "Event added to the itinerary",
    FR: "Événement ajouté à l'itinéraire", ES: "Evento añadido al itinerario",
    RU: "Событие добавлено в маршрут", ZH: "活动已加入行程"
  },
  err_stop_required_fields: {
    IT: "Compila almeno il nome della tappa e l'ora.",
    EN: "Fill in at least the stop name and the time.",
    FR: "Renseignez au moins le nom de l'étape et l'heure.",
    ES: "Rellena al menos el nombre de la parada y la hora.",
    RU: "Укажите хотя бы название остановки и время.",
    ZH: "请至少填写行程点名称和时间。"
  },
  err_delete_itinerary: {
    IT: "Eliminazione non riuscita. Riprova.", EN: "Deletion failed. Please try again.",
    FR: "Échec de la suppression. Réessayez.", ES: "Error al eliminar. Inténtalo de nuevo.",
    RU: "Не удалось удалить. Повторите попытку.", ZH: "删除失败，请重试。"
  },
  err_tts_unsupported: {
    IT: "Sintesi vocale non supportata su questo browser.",
    EN: "Speech synthesis is not supported in this browser.",
    FR: "La synthèse vocale n'est pas prise en charge par ce navigateur.",
    ES: "Este navegador no admite la síntesis de voz.",
    RU: "Синтез речи не поддерживается этим браузером.",
    ZH: "此浏览器不支持语音合成。"
  },
  close: {
    IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", RU: "Закрыть", ZH: "关闭"
  },
  skip: {
    IT: "Salta", EN: "Skip", FR: "Passer", ES: "Saltar", RU: "Пропустить", ZH: "跳过"
  },
  free_no_credits: {
    IT: "Gratis — paghi solo l'itinerario che scegli",
    EN: "Free — you only pay for the itinerary you pick",
    FR: "Gratuit — vous ne payez que l'itinéraire choisi",
    ES: "Gratis: solo pagas el itinerario que elijas",
    RU: "Бесплатно — вы платите только за выбранный маршрут",
    ZH: "免费——仅为您选择的行程付费"
  }
};

export function getTranslation(key: string, lang: Language): string {
  const dictionary = TRANSLATIONS[key];
  if (!dictionary) return key;
  return dictionary[lang] || dictionary["EN"] || key;
}
