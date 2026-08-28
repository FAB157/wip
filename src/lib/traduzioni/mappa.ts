import type { Language } from '../i18n';

// Chiavi della bonifica lingua 24/08/2026 — area: mappa (MapArea: pannello
// layer, popup Leaflet, banner, ricerca, carta del sole).
export const TRAD_MAPPA: Record<string, Partial<Record<Language, string>>> = {
  // ── Carta del sole: consigliSole (lib/sunIndex.ts) — 24/08/2026 ──
  mp_sole_percepiti_ombra: {
    IT: 'Percepiti {temp}°: acqua con te e ombra nelle ore centrali.',
    EN: 'Feels like {temp}°: carry water and stay in the shade midday.',
    FR: 'Ressenti {temp}° : prends de l\'eau et reste à l\'ombre aux heures centrales.',
    ES: 'Sensación de {temp}°: lleva agua y busca sombra en las horas centrales.',
    DE: 'Gefühlt {temp}°: Wasser mitnehmen und mittags im Schatten bleiben.',
    RU: 'Ощущается как {temp}°: возьмите воду и держитесь в тени в середине дня.',
    ZH: '体感 {temp}°：请随身带水，正午时段待在阴凉处。',
  },
  mp_sole_crema_cappello: {
    IT: 'Crema solare e cappello: il sole scotta anche con le nuvole.',
    EN: 'Sunscreen and a hat: it burns even through clouds.',
    FR: 'Crème solaire et chapeau : le soleil brûle même sous les nuages.',
    ES: 'Protector solar y sombrero: el sol quema incluso con nubes.',
    DE: 'Sonnencreme und Hut: Die Sonne brennt auch bei Wolken.',
    RU: 'Солнцезащитный крем и шляпа: солнце обжигает даже сквозь облака.',
    ZH: '请涂防晒霜并戴帽子：即使多云也会晒伤。',
  },
  mp_sole_crema_mezzora: {
    IT: "Crema solare se resti fuori più di mezz'ora.",
    EN: 'Sunscreen if you stay out over half an hour.',
    FR: 'Crème solaire si tu restes dehors plus d\'une demi-heure.',
    ES: 'Protector solar si vas a estar fuera más de media hora.',
    DE: 'Sonnencreme, wenn du länger als eine halbe Stunde draußen bleibst.',
    RU: 'Солнцезащитный крем, если вы будете на улице дольше получаса.',
    ZH: '如果户外停留超过半小时，请涂防晒霜。',
  },
  mp_sole_freddo: {
    IT: "Fa freddo: copriti bene per le soste all'aperto.",
    EN: 'It is cold: dress warmly for outdoor stops.',
    FR: 'Il fait froid : couvre-toi bien pour les arrêts en extérieur.',
    ES: 'Hace frío: abrígate bien para las paradas al aire libre.',
    DE: 'Es ist kalt: Zieh dich für Pausen im Freien warm an.',
    RU: 'Холодно: одевайтесь теплее для остановок на улице.',
    ZH: '天气寒冷：户外停留时请注意保暖。',
  },
  mp_sole_tranquillo: {
    IT: 'Condizioni tranquille per stare all\'aperto.',
    EN: 'Comfortable conditions for being outdoors.',
    FR: 'Conditions agréables pour rester dehors.',
    ES: 'Condiciones tranquilas para estar al aire libre.',
    DE: 'Angenehme Bedingungen, um draußen zu sein.',
    RU: 'Комфортные условия для пребывания на улице.',
    ZH: '户外活动条件舒适。',
  },

  // ── Banner errori dati ──
  mp_luoghi_vicini_errore: {
    IT: 'Impossibile aggiornare i luoghi vicini. Riprova più tardi.',
    EN: 'Unable to refresh nearby places. Please try again later.',
    FR: 'Impossible de mettre à jour les lieux à proximité. Réessayez plus tard.',
    ES: 'No se han podido actualizar los lugares cercanos. Inténtalo de nuevo más tarde.',
    DE: 'Die Orte in der Nähe konnten nicht aktualisiert werden. Versuche es später erneut.',
    RU: 'Не удалось обновить места поблизости. Повторите попытку позже.',
    ZH: '无法更新附近地点，请稍后重试。',
  },
  mp_servizi_errore: {
    IT: 'Servizi (fontanelle, bagni, panchine) non disponibili al momento. Riprova più tardi.',
    EN: 'Services (fountains, toilets, benches) unavailable right now. Try again later.',
    FR: 'Services (fontaines, toilettes, bancs) indisponibles pour le moment. Réessayez plus tard.',
    ES: 'Los servicios (fuentes, baños, bancos) no están disponibles ahora mismo. Inténtalo más tarde.',
    DE: 'Services (Trinkbrunnen, Toiletten, Bänke) sind derzeit nicht verfügbar. Versuche es später erneut.',
    RU: 'Сервисы (фонтанчики, туалеты, скамейки) сейчас недоступны. Повторите попытку позже.',
    ZH: '便民设施（饮水点、卫生间、长椅）暂不可用，请稍后重试。',
  },
  mp_db_pausa: {
    IT: 'Troppi errori di rete recenti: pausa di sicurezza sul caricamento dei luoghi dal database.',
    EN: 'Too many recent network errors: pausing place loading from the database as a safety measure.',
    FR: "Trop d'erreurs réseau récentes : pause de sécurité du chargement des lieux depuis la base de données.",
    ES: 'Demasiados errores de red recientes: pausa de seguridad en la carga de lugares desde la base de datos.',
    DE: 'Zu viele Netzwerkfehler in letzter Zeit: Sicherheitspause beim Laden der Orte aus der Datenbank.',
    RU: 'Слишком много сетевых ошибок: загрузка мест из базы данных приостановлена в целях безопасности.',
    ZH: '近期网络错误过多：已暂停从数据库加载地点以保护应用。',
  },
  mp_overpass_errore: {
    IT: 'Servizio mappe OpenStreetMap non raggiungibile. Alcuni luoghi potrebbero mancare.',
    EN: 'OpenStreetMap map service unreachable. Some places may be missing.',
    FR: 'Service cartographique OpenStreetMap injoignable. Certains lieux peuvent manquer.',
    ES: 'El servicio de mapas de OpenStreetMap no está accesible. Pueden faltar algunos lugares.',
    DE: 'OpenStreetMap-Kartendienst nicht erreichbar. Einige Orte können fehlen.',
    RU: 'Сервис карт OpenStreetMap недоступен. Некоторые места могут отсутствовать.',
    ZH: '无法连接 OpenStreetMap 地图服务，部分地点可能缺失。',
  },
  mp_err_db_titolo: {
    IT: 'Luoghi Vicini', EN: 'Nearby Places', FR: 'Lieux à proximité',
    ES: 'Lugares cercanos', DE: 'Orte in der Nähe', RU: 'Места поблизости', ZH: '附近地点',
  },
  mp_err_servizi_titolo: {
    IT: 'Servizi', EN: 'Services', FR: 'Services',
    ES: 'Servicios', DE: 'Services', RU: 'Сервисы', ZH: '便民设施',
  },
  mp_gps_attiva: {
    IT: 'Attiva la posizione GPS per vedere i luoghi attorno a te.',
    EN: 'Enable GPS location to see places around you.',
    FR: 'Activez la localisation GPS pour voir les lieux autour de vous.',
    ES: 'Activa la ubicación GPS para ver los lugares a tu alrededor.',
    DE: 'Aktiviere die GPS-Ortung, um Orte in deiner Umgebung zu sehen.',
    RU: 'Включите GPS, чтобы увидеть места вокруг вас.',
    ZH: '开启 GPS 定位即可查看您周围的地点。',
  },

  // ── Popup Leaflet (sentieri, ciclabili, gusto, neve) ──
  mp_punto_partenza_osm: {
    IT: 'Punto di partenza · © contributori OpenStreetMap',
    EN: 'Starting point · © OpenStreetMap contributors',
    FR: 'Point de départ · © contributeurs OpenStreetMap',
    ES: 'Punto de salida · © colaboradores de OpenStreetMap',
    DE: 'Startpunkt · © OpenStreetMap-Mitwirkende',
    RU: 'Точка старта · © участники OpenStreetMap',
    ZH: '起点 · © OpenStreetMap 贡献者',
  },
  mp_osm_contributori: {
    IT: '© contributori OpenStreetMap',
    EN: '© OpenStreetMap contributors',
    FR: '© contributeurs OpenStreetMap',
    ES: '© colaboradores de OpenStreetMap',
    DE: '© OpenStreetMap-Mitwirkende',
    RU: '© участники OpenStreetMap',
    ZH: '© OpenStreetMap 贡献者',
  },
  mp_punto_partenza_percorso: {
    IT: 'Punto di partenza del percorso', EN: 'Route starting point',
    FR: "Point de départ de l'itinéraire", ES: 'Punto de salida de la ruta',
    DE: 'Startpunkt der Route', RU: 'Начало маршрута', ZH: '路线起点',
  },
  mp_sito_ufficiale: {
    IT: 'sito ufficiale', EN: 'official website', FR: 'site officiel',
    ES: 'sitio oficial', DE: 'offizielle Website', RU: 'официальный сайт', ZH: '官方网站',
  },
  mp_sito: {
    IT: 'sito', EN: 'website', FR: 'site', ES: 'sitio web',
    DE: 'Website', RU: 'сайт', ZH: '网站',
  },
  mp_verifica_orari_osm: {
    IT: 'Verifica sempre orari e prenotazione · © contributori OpenStreetMap',
    EN: 'Always check hours and booking · © OpenStreetMap contributors',
    FR: 'Vérifiez toujours les horaires et la réservation · © contributeurs OpenStreetMap',
    ES: 'Comprueba siempre horarios y reservas · © colaboradores de OpenStreetMap',
    DE: 'Öffnungszeiten und Reservierung immer prüfen · © OpenStreetMap-Mitwirkende',
    RU: 'Всегда проверяйте часы работы и бронирование · © участники OpenStreetMap',
    ZH: '请务必确认营业时间和预订 · © OpenStreetMap 贡献者',
  },
  mp_rifugio_alpino: {
    IT: 'Rifugio alpino', EN: 'Mountain hut', FR: 'Refuge de montagne',
    ES: 'Refugio de montaña', DE: 'Berghütte', RU: 'Горный приют', ZH: '山间小屋',
  },
  mp_comprensorio_sci: {
    IT: 'Comprensorio sciistico', EN: 'Ski area', FR: 'Domaine skiable',
    ES: 'Estación de esquí', DE: 'Skigebiet', RU: 'Горнолыжный курорт', ZH: '滑雪场',
  },
  mp_impianto_risalita: {
    IT: 'Impianto di risalita', EN: 'Ski lift', FR: 'Remontée mécanique',
    ES: 'Remonte', DE: 'Skilift', RU: 'Подъёмник', ZH: '滑雪缆车',
  },
  mp_pista_sci: {
    IT: 'Pista da sci', EN: 'Ski piste', FR: 'Piste de ski',
    ES: 'Pista de esquí', DE: 'Skipiste', RU: 'Горнолыжная трасса', ZH: '滑雪道',
  },
  mp_condizioni_non_disponibili: {
    IT: 'condizioni non disponibili', EN: 'conditions unavailable',
    FR: 'conditions indisponibles', ES: 'condiciones no disponibles',
    DE: 'Bedingungen nicht verfügbar', RU: 'нет данных об условиях', ZH: '暂无实况信息',
  },

  // ── Popup acque di balneazione (EEA) ──
  mp_qualita: {
    IT: 'Qualità', EN: 'Quality', FR: 'Qualité', ES: 'Calidad',
    DE: 'Qualität', RU: 'Качество', ZH: '水质',
  },
  mp_acqua_excellent: {
    IT: 'Eccellente', EN: 'Excellent', FR: 'Excellente', ES: 'Excelente',
    DE: 'Ausgezeichnet', RU: 'Отличное', ZH: '极佳',
  },
  mp_acqua_good: {
    IT: 'Buona', EN: 'Good', FR: 'Bonne', ES: 'Buena',
    DE: 'Gut', RU: 'Хорошее', ZH: '良好',
  },
  mp_acqua_sufficient: {
    IT: 'Sufficiente', EN: 'Sufficient', FR: 'Suffisante', ES: 'Suficiente',
    DE: 'Ausreichend', RU: 'Удовлетворительное', ZH: '合格',
  },
  mp_acqua_poor: {
    IT: 'Scarsa', EN: 'Poor', FR: 'Mauvaise', ES: 'Mala',
    DE: 'Mangelhaft', RU: 'Плохое', ZH: '较差',
  },
  mp_acqua_unknown: {
    IT: 'Non classificata', EN: 'Not classified', FR: 'Non classée',
    ES: 'Sin clasificar', DE: 'Nicht klassifiziert', RU: 'Не классифицировано', ZH: '未分级',
  },
  mp_acqua_onde_ora: {
    IT: 'Acqua e onde ora (Open-Meteo)', EN: 'Water and waves now (Open-Meteo)',
    FR: 'Eau et vagues en ce moment (Open-Meteo)', ES: 'Agua y oleaje ahora (Open-Meteo)',
    DE: 'Wasser und Wellen jetzt (Open-Meteo)', RU: 'Вода и волны сейчас (Open-Meteo)',
    ZH: '当前水温与海浪（Open-Meteo）',
  },
  mp_classificazione_eea: {
    IT: 'Classificazione ufficiale UE (EEA) — verifica i divieti temporanei in loco',
    EN: 'Official EU classification (EEA) — check temporary bans on site',
    FR: "Classification officielle de l'UE (AEE) — vérifiez sur place les interdictions temporaires",
    ES: 'Clasificación oficial de la UE (AEMA) — comprueba in situ las prohibiciones temporales',
    DE: 'Offizielle EU-Klassifizierung (EEA) — vorübergehende Badeverbote vor Ort prüfen',
    RU: 'Официальная классификация ЕС (EEA) — проверяйте временные запреты на месте',
    ZH: '欧盟官方分级（EEA）——请在现场确认临时禁泳通知',
  },

  // ── ZTL: banner, disclaimer e avviso vocale ──
  mp_ztl_entrando: {
    IT: 'Stai per entrare nella ZTL{name} — rischio multa',
    EN: 'Entering limited traffic zone{name} — fine risk',
    FR: "Vous entrez dans la zone à circulation restreinte{name} — risque d'amende",
    ES: 'Estás entrando en la zona de tráfico restringido{name} — riesgo de multa',
    DE: 'Du fährst gleich in die verkehrsbeschränkte Zone{name} — Bußgeldrisiko',
    RU: 'Вы въезжаете в зону ограниченного движения{name} — риск штрафа',
    ZH: '即将进入交通限行区{name}——有罚款风险',
  },
  mp_ztl_dentro: {
    IT: 'Sei nella ZTL{name} — rischio multa',
    EN: 'Inside limited traffic zone{name} — fine risk',
    FR: "Vous êtes dans la zone à circulation restreinte{name} — risque d'amende",
    ES: 'Estás en la zona de tráfico restringido{name} — riesgo de multa',
    DE: 'Du bist in der verkehrsbeschränkten Zone{name} — Bußgeldrisiko',
    RU: 'Вы в зоне ограниченного движения{name} — риск штрафа',
    ZH: '您已进入交通限行区{name}——有罚款风险',
  },
  mp_ztl_vocale: {
    IT: 'Attenzione, zona a traffico limitato',
    EN: 'Warning, limited traffic zone',
    FR: 'Attention, zone à circulation restreinte',
    ES: 'Atención, zona de tráfico restringido',
    DE: 'Achtung, Zone mit Verkehrsbeschränkung',
    RU: 'Внимание, зона с ограниченным движением',
    ZH: '注意，前方是交通限行区',
  },
  mp_chiudi_avviso_ztl: {
    IT: 'Chiudi avviso ZTL', EN: 'Dismiss ZTL alert', FR: "Fermer l'alerte ZTL",
    ES: 'Cerrar aviso de ZTL', DE: 'ZTL-Hinweis schließen',
    RU: 'Закрыть предупреждение о зоне', ZH: '关闭限行区提醒',
  },
  mp_chiudi: {
    IT: 'Chiudi', EN: 'Close', FR: 'Fermer', ES: 'Cerrar',
    DE: 'Schließen', RU: 'Закрыть', ZH: '关闭',
  },
  mp_ztl_copertura: {
    IT: 'Copertura basata su OpenStreetMap: non tutte le ZTL sono mappate, verifica sempre la segnaletica.',
    EN: 'Coverage based on OpenStreetMap: not all restricted zones are mapped, always check road signs.',
    FR: 'Couverture basée sur OpenStreetMap : toutes les zones restreintes ne sont pas cartographiées, vérifiez toujours la signalisation.',
    ES: 'Cobertura basada en OpenStreetMap: no todas las zonas restringidas están cartografiadas, comprueba siempre la señalización.',
    DE: 'Abdeckung auf Basis von OpenStreetMap: Nicht alle Zonen sind erfasst, achte immer auf die Beschilderung.',
    RU: 'Покрытие на основе OpenStreetMap: не все зоны нанесены на карту, всегда сверяйтесь с дорожными знаками.',
    ZH: '数据来自 OpenStreetMap：并非所有限行区都已收录，请务必以现场交通标志为准。',
  },
  mp_balneazione_disclaimer: {
    IT: 'Qualità delle acque di balneazione: classificazione annuale ufficiale UE (EEA). Copertura solo europea; avvicina la mappa per vedere i siti.',
    EN: 'Bathing water quality: official annual EU classification (EEA). Europe-only coverage; zoom in to see the sites.',
    FR: "Qualité des eaux de baignade : classification annuelle officielle de l'UE (AEE). Couverture européenne uniquement ; zoomez pour voir les sites.",
    ES: 'Calidad de las aguas de baño: clasificación anual oficial de la UE (AEMA). Cobertura solo europea; acerca el mapa para ver los sitios.',
    DE: 'Badegewässerqualität: offizielle jährliche EU-Klassifizierung (EEA). Nur Europa; heranzoomen, um die Badestellen zu sehen.',
    RU: 'Качество воды для купания: официальная ежегодная классификация ЕС (EEA). Только Европа; приблизьте карту, чтобы увидеть пляжи.',
    ZH: '海水浴场水质：欧盟官方年度分级（EEA）。仅覆盖欧洲；放大地图查看各浴场。',
  },

  // ── Banner offline, beni culturali, pioggia/al coperto ──
  mp_sei_offline: {
    IT: 'Sei offline', EN: "You're offline", FR: 'Vous êtes hors ligne',
    ES: 'Estás sin conexión', DE: 'Du bist offline', RU: 'Вы офлайн', ZH: '当前离线',
  },
  mp_beni_fascia_ab: {
    IT: 'Beni culturali: solo i principali (fascia A e B) — avvicinati per tutti',
    EN: 'Heritage: main sites only (tier A–B) — zoom in for all',
    FR: 'Patrimoine : sites principaux uniquement (catégories A–B) — zoomez pour tout voir',
    ES: 'Patrimonio: solo los principales (categorías A y B) — acércate para verlos todos',
    DE: 'Kulturerbe: nur die wichtigsten Stätten (Stufe A–B) — heranzoomen für alle',
    RU: 'Культурное наследие: только главные объекты (уровни A–B) — приблизьте, чтобы увидеть все',
    ZH: '文化遗产：仅显示主要地点（A、B 级）——放大查看全部',
  },
  mp_beni_fascia_a: {
    IT: 'Beni culturali: solo i grandi monumenti (fascia A) — avvicinati per gli altri',
    EN: 'Heritage: major monuments only (tier A) — zoom in for more',
    FR: 'Patrimoine : grands monuments uniquement (catégorie A) — zoomez pour en voir plus',
    ES: 'Patrimonio: solo los grandes monumentos (categoría A) — acércate para ver más',
    DE: 'Kulturerbe: nur die großen Denkmäler (Stufe A) — heranzoomen für mehr',
    RU: 'Культурное наследие: только крупнейшие памятники (уровень A) — приблизьте, чтобы увидеть больше',
    ZH: '文化遗产：仅显示重要古迹（A 级）——放大查看更多',
  },
  mp_pioggia_domanda: {
    IT: 'Pioggia in arrivo — vuoi vedere i luoghi al coperto?',
    EN: 'Rain coming — want to see indoor places?',
    FR: 'Pluie en approche — voir les lieux couverts ?',
    ES: 'Lluvia a la vista — ¿quieres ver los lugares cubiertos?',
    DE: 'Regen im Anmarsch — Orte im Trockenen anzeigen?',
    RU: 'Скоро дождь — показать места под крышей?',
    ZH: '快要下雨了——要看看室内景点吗？',
  },
  mp_al_coperto: {
    IT: 'Al coperto', EN: 'Indoor', FR: "À l'abri", ES: 'A cubierto',
    DE: 'Drinnen', RU: 'Под крышей', ZH: '室内',
  },
  mp_no_grazie: {
    IT: 'No grazie', EN: 'No thanks', FR: 'Non merci', ES: 'No, gracias',
    DE: 'Nein danke', RU: 'Нет, спасибо', ZH: '不用了',
  },
  mp_al_coperto_attivo: {
    IT: 'Al coperto attivo', EN: 'Indoor mode on', FR: "Mode à l'abri activé",
    ES: 'Modo a cubierto activado', DE: 'Drinnen-Modus an',
    RU: 'Режим «под крышей» включён', ZH: '室内模式已开启',
  },

  // ── Pannello dei livelli (ⓘ / Layers) ──
  mp_livelli_mappa: {
    IT: 'Livelli della mappa', EN: 'Map layers', FR: 'Couches de la carte',
    ES: 'Capas del mapa', DE: 'Kartenebenen', RU: 'Слои карты', ZH: '地图图层',
  },
  mp_attivi: {
    IT: 'attivi', EN: 'active', FR: 'actives', ES: 'activas',
    DE: 'aktiv', RU: 'включено', ZH: '已开启',
  },
  mp_livelli_attivi: {
    IT: 'Livelli attivi', EN: 'Active layers', FR: 'Couches actives',
    ES: 'Capas activas', DE: 'Aktive Ebenen', RU: 'Включённые слои', ZH: '已开启的图层',
  },
  mp_dove_andare: {
    IT: 'Dove andare', EN: 'Where to go', FR: 'Où aller', ES: 'Dónde ir',
    DE: 'Wohin gehen', RU: 'Куда пойти', ZH: '去哪儿',
  },
  mp_come_adesso: {
    IT: 'Com’è adesso', EN: 'Conditions now', FR: 'Conditions actuelles',
    ES: 'Cómo está ahora', DE: 'Aktuelle Bedingungen', RU: 'Условия сейчас', ZH: '当前状况',
  },
  mp_avvicinati: {
    IT: 'avvicinati per vederli', EN: 'zoom in to see them', FR: 'zoomez pour les voir',
    ES: 'acércate para verlos', DE: 'heranzoomen, um sie zu sehen',
    RU: 'приблизьте, чтобы увидеть', ZH: '放大后可见',
  },
  mp_spegni_tutti: {
    IT: 'Spegni tutti ({n})', EN: 'Turn all off ({n})', FR: 'Tout éteindre ({n})',
    ES: 'Apagar todo ({n})', DE: 'Alle ausschalten ({n})',
    RU: 'Выключить все ({n})', ZH: '全部关闭（{n}）',
  },
  mp_layer_sentieri_nome: {
    IT: 'Sentieri e cammini', EN: 'Trails and pilgrim ways', FR: 'Sentiers et chemins',
    ES: 'Senderos y caminos', DE: 'Wanderwege und Pilgerwege',
    RU: 'Тропы и пешие маршруты', ZH: '步道与朝圣之路',
  },
  mp_layer_sentieri_det: {
    IT: 'con ippovie, rifugi, corsa, canoa e itinerari storici',
    EN: 'with bridleways, huts, running, canoe and historic routes',
    FR: 'avec voies équestres, refuges, course, canoë et itinéraires historiques',
    ES: 'con vías ecuestres, refugios, rutas para correr, canoa e itinerarios históricos',
    DE: 'mit Reitwegen, Hütten, Lauf-, Kanu- und historischen Routen',
    RU: 'с конными тропами, приютами, беговыми, каноэ и историческими маршрутами',
    ZH: '含骑马道、山屋、跑步、皮划艇与历史路线',
  },
  mp_layer_ciclabili_nome: {
    IT: 'Ciclovie e mountain bike', EN: 'Cycle routes and MTB', FR: 'Voies cyclables et VTT',
    ES: 'Rutas ciclistas y BTT', DE: 'Radwege und Mountainbike',
    RU: 'Веломаршруты и маунтинбайк', ZH: '自行车道与山地车',
  },
  mp_layer_ciclabili_det: {
    IT: 'EuroVelo e reti nazionali', EN: 'EuroVelo and national networks',
    FR: 'EuroVelo et réseaux nationaux', ES: 'EuroVelo y redes nacionales',
    DE: 'EuroVelo und nationale Netze', RU: 'EuroVelo и национальные сети',
    ZH: 'EuroVelo 与各国路网',
  },
  mp_layer_gusto_nome: {
    IT: 'Vino e gusto', EN: 'Wine & food', FR: 'Vin et gastronomie',
    ES: 'Vino y gastronomía', DE: 'Wein und Genuss',
    RU: 'Вино и гастрономия', ZH: '美酒与美食',
  },
  mp_layer_gusto_det: {
    IT: 'cantine, strade e botteghe', EN: 'cellars, routes and shops',
    FR: 'caves, routes et boutiques', ES: 'bodegas, rutas y tiendas',
    DE: 'Weingüter, Straßen und Läden', RU: 'винодельни, маршруты и лавки',
    ZH: '酒庄、酒乡之路与特色小店',
  },
  mp_layer_servizi_nome: {
    IT: 'Fontanelle, bagni, panchine', EN: 'Water, toilets, benches',
    FR: 'Fontaines, toilettes, bancs', ES: 'Fuentes, baños, bancos',
    DE: 'Trinkbrunnen, Toiletten, Bänke', RU: 'Фонтанчики, туалеты, скамейки',
    ZH: '饮水点、卫生间、长椅',
  },
  mp_layer_neve_nome: {
    IT: 'Neve: piste, impianti e rifugi', EN: 'Snow: pistes, lifts and huts',
    FR: 'Neige : pistes, remontées et refuges', ES: 'Nieve: pistas, remontes y refugios',
    DE: 'Schnee: Pisten, Lifte und Hütten', RU: 'Снег: трассы, подъёмники и приюты',
    ZH: '雪场：雪道、缆车与山屋',
  },
  mp_layer_neve_det: {
    IT: '9.569 piste disegnate + copertura satellitare NASA (giornaliera)',
    EN: '9,569 pistes drawn + NASA satellite snow cover (daily)',
    FR: '9 569 pistes tracées + couverture satellite NASA (quotidienne)',
    ES: '9.569 pistas dibujadas + cobertura satelital NASA (diaria)',
    DE: '9.569 eingezeichnete Pisten + NASA-Satelliten-Schneebedeckung (täglich)',
    RU: '9 569 трасс на карте + спутниковый снежный покров NASA (ежедневно)',
    ZH: '已绘制 9,569 条雪道 + NASA 卫星积雪覆盖（每日）',
  },
  mp_layer_sole_nome: {
    IT: 'Sole: UV e caldo percepito', EN: 'Sun: UV and feels-like',
    FR: 'Soleil : UV et température ressentie', ES: 'Sol: UV y sensación térmica',
    DE: 'Sonne: UV und gefühlte Temperatur', RU: 'Солнце: УФ и ощущаемая температура',
    ZH: '日照：紫外线与体感温度',
  },
  mp_layer_balneazione_nome: {
    IT: 'Qualità acqua del mare', EN: 'Bathing water quality',
    FR: 'Qualité des eaux de baignade', ES: 'Calidad del agua de baño',
    DE: 'Badegewässerqualität', RU: 'Качество воды для купания', ZH: '海水浴场水质',
  },
  // ── Aree protette Natura 2000 (EEA) — 27/08/2026 ──
  mp_layer_natura2000_nome: {
    IT: 'Aree protette Natura 2000', EN: 'Natura 2000 protected areas',
    FR: 'Aires protégées Natura 2000', ES: 'Áreas protegidas Natura 2000',
    DE: 'Natura-2000-Schutzgebiete', RU: 'Охраняемые территории Natura 2000', ZH: 'Natura 2000 保护区',
  },
  mp_layer_natura2000_det: {
    IT: '~27.000 siti UE con confini (Agenzia Europea dell\'Ambiente)',
    EN: '~27,000 EU sites with boundaries (European Environment Agency)',
    FR: '~27 000 sites UE avec leurs limites (Agence européenne pour l\'environnement)',
    ES: '~27.000 sitios de la UE con sus límites (Agencia Europea de Medio Ambiente)',
    DE: '~27.000 EU-Gebiete mit Grenzen (Europäische Umweltagentur)',
    RU: '~27 000 участков ЕС с границами (Европейское агентство по окружающей среде)',
    ZH: '约 27,000 个欧盟保护区及其边界（欧洲环境署）',
  },
  mp_n2k_habitat: {
    IT: 'Sito di importanza comunitaria (habitat)', EN: 'Habitats Directive site (SCI/SAC)',
    FR: 'Site d\'importance communautaire (habitats)', ES: 'Lugar de importancia comunitaria (hábitats)',
    DE: 'FFH-Gebiet (Lebensräume)', RU: 'Участок Директивы о местообитаниях', ZH: '栖息地指令保护区',
  },
  mp_n2k_uccelli: {
    IT: 'Zona di protezione speciale (uccelli)', EN: 'Special Protection Area (birds)',
    FR: 'Zone de protection spéciale (oiseaux)', ES: 'Zona de especial protección para las aves',
    DE: 'Vogelschutzgebiet', RU: 'Особая охраняемая зона (птицы)', ZH: '特别保护区（鸟类）',
  },
  mp_cdda_nazionale: {
    IT: 'Area protetta nazionale', EN: 'Nationally designated area', FR: 'Aire protégée nationale',
    ES: 'Área protegida nacional', DE: 'National ausgewiesenes Schutzgebiet', RU: 'Национальная охраняемая территория', ZH: '国家级保护区',
  },
  mp_n2k_scheda: {
    IT: 'Scheda ufficiale', EN: 'Official factsheet', FR: 'Fiche officielle', ES: 'Ficha oficial',
    DE: 'Offizielles Datenblatt', RU: 'Официальная карточка', ZH: '官方资料页',
  },
  mp_n2k_fonte: {
    IT: 'Fonte: Agenzia Europea dell\'Ambiente (CC BY 4.0) — rispetta i regolamenti del sito',
    EN: 'Source: European Environment Agency (CC BY 4.0) — respect the site rules',
    FR: 'Source : Agence européenne pour l\'environnement (CC BY 4.0) — respectez la réglementation du site',
    ES: 'Fuente: Agencia Europea de Medio Ambiente (CC BY 4.0) — respeta las normas del lugar',
    DE: 'Quelle: Europäische Umweltagentur (CC BY 4.0) — beachte die Schutzgebietsregeln',
    RU: 'Источник: Европейское агентство по окружающей среде (CC BY 4.0) — соблюдайте правила территории',
    ZH: '来源：欧洲环境署（CC BY 4.0）——请遵守保护区规定',
  },
  mp_natura2000_disclaimer: {
    IT: 'Confini ufficiali della rete Natura 2000 (EEA). Solo Europa; avvicina la mappa per vederli.',
    EN: 'Official Natura 2000 network boundaries (EEA). Europe only; zoom in to see them.',
    FR: 'Limites officielles du réseau Natura 2000 (AEE). Europe uniquement ; zoomez pour les voir.',
    ES: 'Límites oficiales de la red Natura 2000 (AEMA). Solo Europa; acerca el mapa para verlos.',
    DE: 'Offizielle Grenzen des Natura-2000-Netzes (EUA). Nur Europa; zum Anzeigen hineinzoomen.',
    RU: 'Официальные границы сети Natura 2000 (ЕАОС). Только Европа; приблизьте карту.',
    ZH: 'Natura 2000 网络官方边界（EEA）。仅限欧洲；请放大地图查看。',
  },
  // ── Scheda POI: denominazioni d'origine e link ai registri esterni — 27/08/2026 ──
  poi_denominazioni_zona: {
    IT: 'Denominazioni della zona', EN: 'Designations of origin in the area', FR: 'Appellations de la zone',
    ES: 'Denominaciones de la zona', DE: 'Herkunftsbezeichnungen der Gegend', RU: 'Наименования происхождения этой зоны', ZH: '该地区的原产地名称',
  },
  poi_denominazioni_nota: {
    IT: 'Registro UE eAmbrosia (CC BY 4.0). Aggancio per zona, non certificazione del produttore.',
    EN: 'EU eAmbrosia register (CC BY 4.0). Matched by area, not a producer certification.',
    FR: 'Registre UE eAmbrosia (CC BY 4.0). Rattachement par zone, pas une certification du producteur.',
    ES: 'Registro UE eAmbrosia (CC BY 4.0). Vinculado por zona, no es una certificación del productor.',
    DE: 'EU-Register eAmbrosia (CC BY 4.0). Zuordnung nach Gebiet, keine Zertifizierung des Erzeugers.',
    RU: 'Реестр ЕС eAmbrosia (CC BY 4.0). Привязка по зоне, не сертификация производителя.',
    ZH: '欧盟 eAmbrosia 登记册（CC BY 4.0）。按地区匹配，并非生产者认证。',
  },
  mp_denominazione_area: {
    IT: 'Zona di denominazione', EN: 'Designation area', FR: 'Zone d\'appellation', ES: 'Zona de denominación',
    DE: 'Herkunftsgebiet', RU: 'Зона наименования происхождения', ZH: '原产地名称区域',
  },
  mp_area_ufficiale: {
    IT: 'confine ufficiale', EN: 'official boundary', FR: 'limite officielle', ES: 'límite oficial',
    DE: 'amtliche Grenze', RU: 'официальная граница', ZH: '官方边界',
  },
  mp_area_indicativa: {
    IT: 'area indicativa (confini dei comuni), non il disciplinare', EN: 'indicative area (municipal boundaries), not the specification',
    FR: 'zone indicative (limites communales), pas le cahier des charges', ES: 'zona indicativa (límites municipales), no el pliego de condiciones',
    DE: 'ungefähres Gebiet (Gemeindegrenzen), nicht die Produktspezifikation', RU: 'ориентировочная зона (границы муниципалитетов), не спецификация', ZH: '示意区域（市镇边界），并非产品规范',
  },
  poi_scheda_rcdb: {
    IT: 'Scheda su RCDB', EN: 'RCDB entry', FR: 'Fiche RCDB', ES: 'Ficha en RCDB', DE: 'RCDB-Eintrag', RU: 'Карточка RCDB', ZH: 'RCDB 资料页',
  },
  poi_scheda_wwd: {
    IT: 'Scheda su World Waterfall Database', EN: 'World Waterfall Database entry', FR: 'Fiche World Waterfall Database',
    ES: 'Ficha en World Waterfall Database', DE: 'Eintrag in der World Waterfall Database', RU: 'Карточка World Waterfall Database', ZH: 'World Waterfall Database 资料页',
  },
  // ── Pericolo valanghe (avalanche.report, Euregio) — 27/08/2026 ──
  mp_valanghe: {
    IT: 'Pericolo valanghe', EN: 'Avalanche danger', FR: 'Risque d\'avalanche', ES: 'Peligro de aludes',
    DE: 'Lawinengefahr', RU: 'Лавинная опасность', ZH: '雪崩危险',
  },
  mp_valanghe_0: {
    IT: 'nessuna neve', EN: 'no snow', FR: 'pas de neige', ES: 'sin nieve', DE: 'kein Schnee', RU: 'нет снега', ZH: '无雪',
  },
  mp_valanghe_1: {
    IT: 'debole', EN: 'low', FR: 'faible', ES: 'débil', DE: 'gering', RU: 'низкая', ZH: '低',
  },
  mp_valanghe_2: {
    IT: 'moderato', EN: 'moderate', FR: 'limité', ES: 'limitado', DE: 'mäßig', RU: 'умеренная', ZH: '中等',
  },
  mp_valanghe_3: {
    IT: 'marcato', EN: 'considerable', FR: 'marqué', ES: 'notable', DE: 'erheblich', RU: 'значительная', ZH: '较高',
  },
  mp_valanghe_4: {
    IT: 'forte', EN: 'high', FR: 'fort', ES: 'fuerte', DE: 'groß', RU: 'высокая', ZH: '高',
  },
  mp_valanghe_5: {
    IT: 'molto forte', EN: 'very high', FR: 'très fort', ES: 'muy fuerte', DE: 'sehr groß', RU: 'очень высокая', ZH: '极高',
  },
  mp_valanghe_fuori_stagione: {
    IT: 'ultimo bollettino della stagione, non aggiornato', EN: 'last bulletin of the season, not current',
    FR: 'dernier bulletin de la saison, non actualisé', ES: 'último boletín de la temporada, no actualizado',
    DE: 'letztes Bulletin der Saison, nicht aktuell', RU: 'последний бюллетень сезона, не обновлён', ZH: '本季最后一期公报，非最新',
  },
  mp_valanghe_fonte: {
    IT: 'avalanche.report (Euregio, CC BY 4.0)', EN: 'avalanche.report (Euregio, CC BY 4.0)',
    FR: 'avalanche.report (Euregio, CC BY 4.0)', ES: 'avalanche.report (Euregio, CC BY 4.0)',
    DE: 'lawinen.report (Euregio, CC BY 4.0)', RU: 'avalanche.report (Euregio, CC BY 4.0)', ZH: 'avalanche.report（Euregio，CC BY 4.0）',
  },

  // ── Carta del sole ──
  mp_uv_basso: {
    IT: 'Basso', EN: 'Low', FR: 'Faible', ES: 'Bajo',
    DE: 'Niedrig', RU: 'Низкий', ZH: '低',
  },
  mp_uv_moderato: {
    IT: 'Moderato', EN: 'Moderate', FR: 'Modéré', ES: 'Moderado',
    DE: 'Mäßig', RU: 'Умеренный', ZH: '中等',
  },
  mp_uv_alto: {
    IT: 'Alto', EN: 'High', FR: 'Élevé', ES: 'Alto',
    DE: 'Hoch', RU: 'Высокий', ZH: '高',
  },
  mp_uv_molto_alto: {
    IT: 'Molto alto', EN: 'Very high', FR: 'Très élevé', ES: 'Muy alto',
    DE: 'Sehr hoch', RU: 'Очень высокий', ZH: '很高',
  },
  mp_uv_estremo: {
    IT: 'Estremo', EN: 'Extreme', FR: 'Extrême', ES: 'Extremo',
    DE: 'Extrem', RU: 'Экстремальный', ZH: '极高',
  },
  mp_percepiti: {
    IT: 'percepiti', EN: 'feels like', FR: 'ressenti', ES: 'sensación de',
    DE: 'gefühlt', RU: 'ощущается', ZH: '体感',
  },
  mp_reali: {
    IT: 'reali', EN: 'actual', FR: 'réels', ES: 'reales',
    DE: 'tatsächlich', RU: 'фактически', ZH: '实际',
  },
  mp_sole_forte: {
    IT: 'Sole forte', EN: 'Strong sun', FR: 'Soleil fort', ES: 'Sol fuerte',
    DE: 'Starke Sonne', RU: 'Сильное солнце', ZH: '烈日时段',
  },
  mp_sole_sempre_alto: {
    IT: 'Sole sempre sopra l’orizzonte', EN: 'Sun never sets',
    FR: 'Le soleil ne se couche pas', ES: 'El sol no se pone',
    DE: 'Die Sonne geht nicht unter', RU: 'Солнце не заходит за горизонт',
    ZH: '太阳整日不落',
  },
  mp_ora_locale_di: {
    IT: 'ora locale di', EN: 'local time,', FR: 'heure locale de',
    ES: 'hora local de', DE: 'Ortszeit', RU: 'местное время:', ZH: '当地时间：',
  },
  mp_ora_oro: {
    IT: 'Ora d’oro dalle', EN: 'Golden hour from', FR: 'Heure dorée à partir de',
    ES: 'Hora dorada desde las', DE: 'Goldene Stunde ab',
    RU: 'Золотой час с', ZH: '黄金时刻始于',
  },

  // ── Ricerca ──
  mp_ricerca_in_corso: {
    IT: 'Ricerca in corso…', EN: 'Searching…', FR: 'Recherche en cours…',
    ES: 'Buscando…', DE: 'Suche läuft…', RU: 'Идёт поиск…', ZH: '搜索中…',
  },
  mp_nessun_risultato: {
    IT: 'Nessun risultato per "{q}"', EN: 'No results for "{q}"',
    FR: 'Aucun résultat pour « {q} »', ES: 'Sin resultados para "{q}"',
    DE: 'Keine Treffer für "{q}"', RU: 'Ничего не найдено по запросу "{q}"',
    ZH: '未找到与“{q}”相关的结果',
  },
  mp_accendi_categoria: {
    IT: 'Accendi la categoria sulla mappa', EN: 'Turn the category on',
    FR: 'Activer la catégorie sur la carte', ES: 'Enciende la categoría en el mapa',
    DE: 'Kategorie auf der Karte einschalten', RU: 'Включить категорию на карте',
    ZH: '在地图上开启该类别',
  },
  mp_percorso: {
    IT: 'Percorso', EN: 'Route', FR: 'Itinéraire', ES: 'Ruta',
    DE: 'Route', RU: 'Маршрут', ZH: '路线',
  },
};
