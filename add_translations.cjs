const fs = require('fs');
const path = require('path');

const newTranslations = {
  // PoiCard & PoiPopupContent & PoiDetail
  loading_card: {
    IT: "Carico la scheda…", EN: "Loading card…", FR: "Chargement de la carte…", ES: "Cargando tarjeta…", RU: "Загрузка карточки…", ZH: "加载卡片中…"
  },
  poi_close: {
    IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", RU: "Закрыть", ZH: "关闭"
  },
  poi_monument: {
    IT: "Monumento", EN: "Monument", FR: "Monument", ES: "Monumento", RU: "Памятник", ZH: "纪念碑"
  },
  audioguide_ai: {
    IT: "Audioguida AI", EN: "AI Audioguide", FR: "Audioguide IA", ES: "Audioguía IA", RU: "ИИ Аудиогид", ZH: "AI 语音导览"
  },
  voice_nicky: {
    IT: "Voce: Nicky • ElevenLabs", EN: "Voice: Nicky • ElevenLabs", FR: "Voix: Nicky • ElevenLabs", ES: "Voz: Nicky • ElevenLabs", RU: "Голос: Nicky • ElevenLabs", ZH: "声音: Nicky • ElevenLabs"
  },
  poi_website: {
    IT: "Sito web", EN: "Website", FR: "Site web", ES: "Sitio web", RU: "Веб-сайт", ZH: "网站"
  },
  poi_phone: {
    IT: "Telefono", EN: "Phone", FR: "Téléphone", ES: "Teléfono", RU: "Телефон", ZH: "电话"
  },
  poi_maps: {
    IT: "Maps", EN: "Maps", FR: "Cartes", ES: "Mapas", RU: "Карты", ZH: "地图"
  },
  poi_tickets: {
    IT: "Biglietti", EN: "Tickets", FR: "Billets", ES: "Entradas", RU: "Билеты", ZH: "门票"
  },
  poi_regenerate: {
    IT: "Rigenera", EN: "Regenerate", FR: "Régénérer", ES: "Regenerar", RU: "Регенерировать", ZH: "重新生成"
  },
  poi_historical_data: {
    IT: "Dati storici", EN: "Historical data", FR: "Données historiques", ES: "Datos históricos", RU: "Исторические данные", ZH: "历史数据"
  },
  poi_built: {
    IT: "Costruito:", EN: "Built:", FR: "Construit:", ES: "Construido:", RU: "Построено:", ZH: "建造于:"
  },
  poi_architect: {
    IT: "Architetto:", EN: "Architect:", FR: "Architecte:", ES: "Arquitecto:", RU: "Архитектор:", ZH: "建筑师:"
  },
  poi_style: {
    IT: "Stile:", EN: "Style:", FR: "Style:", ES: "Estilo:", RU: "Стиль:", ZH: "风格:"
  },
  poi_practical_info: {
    IT: "Info pratiche", EN: "Practical info", FR: "Infos pratiques", ES: "Información práctica", RU: "Практическая информация", ZH: "实用信息"
  },
  poi_read_wikipedia: {
    IT: "Leggi su Wikipedia", EN: "Read on Wikipedia", FR: "Lire sur Wikipedia", ES: "Leer en Wikipedia", RU: "Читать в Википедии", ZH: "在维基百科阅读"
  },
  poi_no_barriers: {
    IT: "♿ No Barriere", EN: "♿ No Barriers", FR: "♿ Sans barrières", ES: "♿ Sin barreras", RU: "♿ Без барьеров", ZH: "♿ 无障碍设施"
  },
  poi_gem: {
    IT: "💎 Gemma", EN: "💎 Gem", FR: "💎 Gemme", ES: "💎 Gema", RU: "💎 Жемчужина", ZH: "💎 瑰宝"
  },
  poi_audio: {
    IT: "Audio", EN: "Audio", FR: "Audio", ES: "Audio", RU: "Аудио", ZH: "音频"
  },
  poi_listen_card: {
    IT: "Ascolta la scheda", EN: "Listen to the card", FR: "Écouter la fiche", ES: "Escuchar la ficha", RU: "Прослушать карточку", ZH: "收听卡片"
  },
  poi_share: {
    IT: "Condividi", EN: "Share", FR: "Partager", ES: "Compartir", RU: "Поделиться", ZH: "分享"
  },

  // PoiDetailSheet
  gluten_free_available: {
    IT: "Senza Glutine Disponibile", EN: "Gluten-Free Available", FR: "Sans gluten disponible", ES: "Sin gluten disponible", RU: "Доступно без глютена", ZH: "提供无麸质选项"
  },
  gluten_free_detected: {
    IT: "Abbiamo rilevato che questo locale offre opzioni per celiaci.", EN: "We detected that this place offers gluten-free options.", FR: "Nous avons détecté que ce lieu propose des options sans gluten.", ES: "Hemos detectado que este lugar ofrece opciones sin gluten.", RU: "Мы обнаружили, что это заведение предлагает варианты без глютена.", ZH: "我们发现该餐厅提供无麸质餐点。"
  },
  explore_by_type: {
    IT: "Esplora per tipo", EN: "Explore by type", FR: "Explorer par type", ES: "Explorar por tipo", RU: "Искать по типу", ZH: "按类型探索"
  },
  availability_status: {
    IT: "Stato Disponibilità", EN: "Availability Status", FR: "Statut de disponibilité", ES: "Estado de disponibilidad", RU: "Статус доступности", ZH: "可用状态"
  },
  fare: {
    IT: "Tariffa", EN: "Fare", FR: "Tarif", ES: "Tarifa", RU: "Тариф", ZH: "费用"
  },
  type: {
    IT: "Tipo", EN: "Type", FR: "Type", ES: "Tipo", RU: "Тип", ZH: "类型"
  },
  use_headphones: {
    IT: "Per un'esperienza ottimale, si consiglia l'uso di cuffie", EN: "For an optimal experience, headphones are recommended", FR: "Pour une expérience optimale, l'utilisation d'écouteurs est recommandée", ES: "Para una experiencia óptima, se recomienda el uso de auriculares", RU: "Для оптимального опыта рекомендуется использовать наушники", ZH: "为了获得最佳体验，建议使用耳机"
  },
  near_you: {
    IT: "Vicino a te", EN: "Near you", FR: "Près de chez vous", ES: "Cerca de ti", RU: "Рядом с вами", ZH: "在您附近"
  },
  attractions_nearby: {
    IT: "Attrazioni nei dintorni", EN: "Attractions nearby", FR: "Attractions à proximité", ES: "Atracciones cercanas", RU: "Достопримечательности рядом", ZH: "附近景点"
  },

  // PlanScreen
  my_itineraries: {
    IT: "I Miei Itinerari", EN: "My Itineraries", FR: "Mes Itinéraires", ES: "Mis Itinerarios", RU: "Мои маршруты", ZH: "我的行程"
  },
  no_offline_plans: {
    IT: "Nessun itinerario scaricato", EN: "No downloaded itineraries", FR: "Aucun itinéraire téléchargé", ES: "Ningún itinerario descargado", RU: "Нет скачанных маршрутов", ZH: "没有已下载的行程"
  },
  use_offline_button: {
    IT: "Usa il bottone 'Offline' dentro un itinerario generato", EN: "Use the 'Offline' button inside a generated itinerary", FR: "Utilisez le bouton 'Hors ligne' dans un itinéraire généré", ES: "Usa el botón 'Offline' dentro de un itinerario generado", RU: "Используйте кнопку «Офлайн» внутри созданного маршрута", ZH: "在生成的行程中使用“离线”按钮"
  },
  open_offline: {
    IT: "Apri Offline", EN: "Open Offline", FR: "Ouvrir hors ligne", ES: "Abrir Offline", RU: "Открыть офлайн", ZH: "离线打开"
  },
  open_maps: {
    IT: "Apri in Maps", EN: "Open in Maps", FR: "Ouvrir dans Maps", ES: "Abrir en Maps", RU: "Открыть в Картах", ZH: "在地图中打开"
  },
  add_stop: {
    IT: "Aggiungi Tappa", EN: "Add Stop", FR: "Ajouter une étape", ES: "Añadir Parada", RU: "Добавить остановку", ZH: "添加站点"
  },
  action_visit: {
    IT: "Azione/Visita", EN: "Action/Visit", FR: "Action/Visite", ES: "Acción/Visita", RU: "Действие/Визит", ZH: "活动/游览"
  },
  action_restaurant: {
    IT: "Ristorante", EN: "Restaurant", FR: "Restaurant", ES: "Restaurante", RU: "Ресторан", ZH: "餐厅"
  },
  action_break: {
    IT: "Pausa", EN: "Break", FR: "Pause", ES: "Pausa", RU: "Перерыв", ZH: "休息"
  },
  action_travel: {
    IT: "Spostamento", EN: "Travel", FR: "Déplacement", ES: "Desplazamiento", RU: "Перемещение", ZH: "交通"
  },
  cancel: {
    IT: "Annulla", EN: "Cancel", FR: "Annuler", ES: "Cancelar", RU: "Отмена", ZH: "取消"
  },
  save: {
    IT: "Salva", EN: "Save", FR: "Enregistrer", ES: "Guardar", RU: "Сохранить", ZH: "保存"
  },
  add_manual_stop: {
    IT: "Aggiungi una tappa manuale...", EN: "Add a manual stop...", FR: "Ajouter une étape manuelle...", ES: "Añadir una parada manual...", RU: "Добавить остановку вручную...", ZH: "手动添加站点..."
  },
  daily_budget: {
    IT: "Budget della Giornata", EN: "Daily Budget", FR: "Budget du jour", ES: "Presupuesto del Día", RU: "Бюджет на день", ZH: "每日预算"
  },
  attractions: {
    IT: "Attrazioni", EN: "Attractions", FR: "Attractions", ES: "Atracciones", RU: "Достопримечательности", ZH: "景点"
  },
  transport: {
    IT: "Trasporti", EN: "Transport", FR: "Transports", ES: "Transporte", RU: "Транспорт", ZH: "交通"
  },
  breakfast: {
    IT: "Colazione", EN: "Breakfast", FR: "Petit-déjeuner", ES: "Desayuno", RU: "Завтрак", ZH: "早餐"
  },
  lunch: {
    IT: "Pranzo", EN: "Lunch", FR: "Déjeuner", ES: "Almuerzo", RU: "Обед", ZH: "午餐"
  },
  dinner: {
    IT: "Cena", EN: "Dinner", FR: "Dîner", ES: "Cena", RU: "Ужин", ZH: "晚餐"
  },
  total_day: {
    IT: "TOTALE GIORNO", EN: "DAY TOTAL", FR: "TOTAL DU JOUR", ES: "TOTAL DEL DÍA", RU: "ИТОГО ЗА ДЕНЬ", ZH: "单日总计"
  },
  itinerary_map: {
    IT: "Mappa Itinerario", EN: "Itinerary Map", FR: "Carte de l'itinéraire", ES: "Mapa del Itinerario", RU: "Карта маршрута", ZH: "行程地图"
  },
  total_estimated_trip: {
    IT: "Totale Stimato Viaggio", EN: "Total Estimated Trip", FR: "Total Estimé du Voyage", ES: "Total Estimado del Viaje", RU: "Общая смета поездки", ZH: "行程预估总计"
  },
  wip_working: {
    IT: "WIP l'esperto di viaggi sta lavorando...", EN: "WIP the travel expert is working...", FR: "WIP l'expert en voyages travaille...", ES: "WIP el experto en viajes está trabajando...", RU: "WIP, эксперт по путешествиям, работает...", ZH: "智能旅行专家 WIP 正在为您规划..."
  },
  optimizing_stops: {
    IT: "Stiamo ottimizzando le tappe del tuo viaggio per minimizzare i tempi di spostamento e massimizzare il divertimento.", EN: "We are optimizing your trip stops to minimize travel time and maximize fun.", FR: "Nous optimisons les étapes de votre voyage pour minimiser les temps de trajet et maximiser le plaisir.", ES: "Estamos optimizando las paradas de tu viaje para minimizar el tiempo de desplazamiento y maximizar la diversión.", RU: "Мы оптимизируем остановки вашей поездки, чтобы свести к минимуму время в пути и получить максимум удовольствия.", ZH: "我们正在优化您的行程站点，以最大程度地减少旅行时间并增加乐趣。"
  },

  // PlanScreen Attributes
  placeholder_interests: {
    IT: "Es: Ristorante vegano, solo musei, ritmo lento...", EN: "Ex: Vegan restaurant, only museums, slow pace...", FR: "Ex: Restaurant végétalien, que des musées, rythme lent...", ES: "Ej: Restaurante vegano, solo museos, ritmo lento...", RU: "Например: веганский ресторан, только музеи, медленный темп...", ZH: "例如：素食餐厅，只看博物馆，慢节奏..."
  },
  placeholder_time: {
    IT: "Ora (es: 10:00)", EN: "Time (e.g. 10:00)", FR: "Heure (ex: 10:00)", ES: "Hora (ej: 10:00)", RU: "Время (напр. 10:00)", ZH: "时间（例如：10:00）"
  },
  placeholder_stop_name: {
    IT: "Nome della Tappa", EN: "Stop Name", FR: "Nom de l'étape", ES: "Nombre de la Parada", RU: "Название остановки", ZH: "站点名称"
  },
  placeholder_duration: {
    IT: "Tempo necessario (es. 2 ore)", EN: "Time needed (e.g. 2 hours)", FR: "Temps nécessaire (ex: 2 heures)", ES: "Tiempo necesario (ej. 2 horas)", RU: "Необходимое время (напр. 2 часа)", ZH: "所需时间（例如：2小时）"
  },
  placeholder_activity: {
    IT: "Attività / Descrizione", EN: "Activity / Description", FR: "Activité / Description", ES: "Actividad / Descripción", RU: "Действие / Описание", ZH: "活动 / 描述"
  },
  placeholder_lat: {
    IT: "Latitudine (Opzionale)", EN: "Latitude (Optional)", FR: "Latitude (Optionnel)", ES: "Latitud (Opcional)", RU: "Широта (Опционально)", ZH: "纬度（选填）"
  },
  placeholder_lon: {
    IT: "Longitudine (Opzionale)", EN: "Longitude (Optional)", FR: "Longitude (Optionnel)", ES: "Longitud (Opcional)", RU: "Долгота (Опционально)", ZH: "经度（选填）"
  },
  placeholder_notes: {
    IT: "Consigli/Note aggiuntive", EN: "Tips/Additional notes", FR: "Conseils/Notes supplémentaires", ES: "Consejos/Notas adicionales", RU: "Советы/Дополнительные примечания", ZH: "提示/补充说明"
  },

  // ProfileScreen
  suggested_itineraries: {
    IT: "Itinerari Suggeriti", EN: "Suggested Itineraries", FR: "Itinéraires Suggérés", ES: "Itinerarios Sugeridos", RU: "Предлагаемые маршруты", ZH: "推荐行程"
  },
  suggested_itineraries_desc: {
    IT: "Qui appariranno i percorsi personalizzati creati per te dalla nostra Guida AI.", EN: "Here will appear the custom routes created for you by our AI Guide.", FR: "Ici apparaîtront les parcours personnalisés créés pour vous par notre Guide IA.", ES: "Aquí aparecerán las rutas personalizadas creadas para ti por nuestra Guía IA.", RU: "Здесь появятся индивидуальные маршруты, созданные для вас нашим ИИ-гидом.", ZH: "这里将显示由我们的 AI 导游为您创建的个性化路线。"
  },
  open_map_caps: {
    IT: "APRI MAPPA", EN: "OPEN MAP", FR: "OUVRIR LA CARTE", ES: "ABRIR MAPA", RU: "ОТКРЫТЬ КАРТУ", ZH: "打开地图"
  },
  working_on_memories: {
    IT: "LAVORANDO AI TUOI RICORDI...", EN: "WORKING ON YOUR MEMORIES...", FR: "TRAVAIL SUR VOS SOUVENIRS...", ES: "TRABAJANDO EN TUS RECUERDOS...", RU: "ОБРАБАТЫВАЕМ ВАШИ ВОСПОМИНАНИЯ...", ZH: "正在处理您的旅行回忆..."
  },
  daily_limits_counter: {
    IT: "Contatore Limiti Giornalieri", EN: "Daily Limits Counter", FR: "Compteur de limites quotidiennes", ES: "Contador de Límites Diarios", RU: "Счетчик дневных лимитов", ZH: "每日额度计数器"
  },
  daily_limits_desc: {
    IT: "Monitora i crediti consumati in tempo reale (in base al tuo piano).", EN: "Monitor consumed credits in real time (based on your plan).", FR: "Surveillez les crédits consommés en temps réel (selon votre forfait).", ES: "Supervisa los créditos consumidos en tiempo real (según tu plan).", RU: "Отслеживайте использованные кредиты в реальном времени (согласно вашему тарифу).", ZH: "实时监控已使用的额度（根据您的订阅计划）。"
  },
  lbl_history_culture: {
    IT: "🏛️ STORIA E CULTURA", EN: "🏛️ HISTORY & CULTURE", FR: "🏛️ HISTOIRE & CULTURE", ES: "🏛️ HISTORIA Y CULTURA", RU: "🏛️ ИСТОРИЯ И КУЛЬТУРА", ZH: "🏛️ 历史与文化"
  },
  lbl_nature: {
    IT: "🌲 PAESAGGIO E NATURA", EN: "🌲 LANDSCAPE & NATURE", FR: "🌲 PAYSAGE & NATURE", ES: "🌲 PAISAJE Y NATURALEZA", RU: "🌲 ПЕЙЗАЖ И ПРИРОДА", ZH: "🌲 自然与景观"
  },
  lbl_food: {
    IT: "🍕 FOOD & OSPITALITÀ", EN: "🍕 FOOD & HOSPITALITY", FR: "🍕 GASTRONOMIE & ACCUEIL", ES: "🍕 COMIDA Y HOSPITALIDAD", RU: "🍕 ЕДА И ГОСТЕПРИИМСТВО", ZH: "🍕 美食与住宿"
  },
  lbl_services: {
    IT: "🛒 SERVIZI", EN: "🛒 SERVICES", FR: "🛒 SERVICES", ES: "🛒 SERVICIOS", RU: "🛒 УСЛУГИ", ZH: "🛒 实用设施"
  }
};

let content = fs.readFileSync('src/lib/i18n.ts', 'utf8');

let appendStr = '';
for (const [key, langs] of Object.entries(newTranslations)) {
  appendStr += `  ${key}: {\n`;
  appendStr += `    IT: ${JSON.stringify(langs.IT)},\n`;
  appendStr += `    EN: ${JSON.stringify(langs.EN)},\n`;
  appendStr += `    FR: ${JSON.stringify(langs.FR)},\n`;
  appendStr += `    ES: ${JSON.stringify(langs.ES)},\n`;
  appendStr += `    RU: ${JSON.stringify(langs.RU)},\n`;
  appendStr += `    ZH: ${JSON.stringify(langs.ZH)}\n`;
  appendStr += `  },\n`;
}

content = content.replace(/  geofence_arrived_play: {[^}]*\}\n};/, (match) => {
  return match.replace('\n};', ',\n' + appendStr + '};');
});

fs.writeFileSync('src/lib/i18n.ts', content, 'utf8');
console.log('Translations added successfully.');
