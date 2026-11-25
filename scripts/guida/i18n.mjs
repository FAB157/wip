// Il centro guida nelle 7 lingue dell'app (16/11/2026, committente: «la guida deve essere in tutte le lingue
// selezionabili»). L'italiano è la fonte; le altre lingue vivono in /guida/<lingua>/… e prendono le frasi da
// scripts/guida/traduzioni/<lingua>.json (chiave = frase italiana esatta), prodotte da scripts/guida/traduci.mjs.
// Una frase senza traduzione resta in italiano: il build lo conta e lo dice, non inventa.

export const LINGUE = [
  { c: 'it', nome: 'Italiano', locale: 'it-IT', ai: 'Italian' },
  { c: 'en', nome: 'English', locale: 'en-GB', ai: 'English' },
  { c: 'fr', nome: 'Français', locale: 'fr-FR', ai: 'French' },
  { c: 'es', nome: 'Español', locale: 'es-ES', ai: 'Spanish' },
  { c: 'de', nome: 'Deutsch', locale: 'de-DE', ai: 'German' },
  { c: 'ru', nome: 'Русский', locale: 'ru-RU', ai: 'Russian' },
  { c: 'zh', nome: '中文', locale: 'zh-CN', ai: 'Simplified Chinese' },
];

// Chiavi del contenuto che NON sono testo (identificatori, slug, file, chiavi del database).
export const CHIAVI_NON_TESTO = new Set(['slug', 'padre', 'correlate', 'chiavi', 'l', 'macro', 'stat', 'emoji', 'e', 'p', 'id', 'pagina', 'file', 'home', 'faqTutte', 'catalogo', 'categorieComplete', 'beni', 'tipo', 'w', 'h_px', 'testoFile']);
// Una stringa che non va tradotta anche dove la chiave sarebbe testo.
export const nonTesto = s => !/[A-Za-zÀ-ÿ]{2}/.test(s) || /^(https?:|\/|mailto:)/.test(s) || /^[a-z0-9_-]+$/.test(s) && s.includes('-');

/** Percorre i dati e applica `f` a ogni stringa di TESTO. `corpo` è una lista di [tipo, valore]: il tipo non si tocca. */
export function mappaTesti(v, f, chiave = '') {
  if (typeof v === 'string') return CHIAVI_NON_TESTO.has(chiave) || nonTesto(v) ? v : f(v);
  if (Array.isArray(v)) {
    if (chiave === 'corpo') return v.map(b => (Array.isArray(b) ? [b[0], mappaTesti(b[1], f, 'corpo_v')] : b));
    return v.map(x => mappaTesti(x, f, chiave));
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mappaTesti(x, f, k)]));
  return v;
}

// Testi dell'interfaccia delle pagine (scritti a mano, non dal modello).
export const UI = {
  guida: { it: 'Guida', en: 'Guide', fr: 'Guide', es: 'Guía', de: 'Anleitung', ru: 'Руководство', zh: '指南' },
  logo: { it: 'WIP · Guida', en: 'WIP · Guide', fr: 'WIP · Guide', es: 'WIP · Guía', de: 'WIP · Anleitung', ru: 'WIP · Руководство', zh: 'WIP · 指南' },
  categorie: { it: 'Categorie', en: 'Categories', fr: 'Catégories', es: 'Categorías', de: 'Kategorien', ru: 'Категории', zh: '类别' },
  audioguide: { it: 'Audioguide', en: 'Audio guides', fr: 'Audioguides', es: 'Audioguías', de: 'Audioguides', ru: 'Аудиогиды', zh: '语音导览' },
  itinerari: { it: 'Itinerari', en: 'Itineraries', fr: 'Itinéraires', es: 'Itinerarios', de: 'Reiserouten', ru: 'Маршруты', zh: '行程' },
  tutorial: { it: 'Tutorial', en: 'Tutorials', fr: 'Tutoriels', es: 'Tutoriales', de: 'Tutorials', ru: 'Уроки', zh: '教程' },
  faq: { it: 'FAQ', en: 'FAQ', fr: 'FAQ', es: 'FAQ', de: 'FAQ', ru: 'Вопросы', zh: '常见问题' },
  apri: { it: 'Apri WIP', en: 'Open WIP', fr: 'Ouvrir WIP', es: 'Abrir WIP', de: 'WIP öffnen', ru: 'Открыть WIP', zh: '打开 WIP' },
  vaiContenuto: { it: 'Vai al contenuto', en: 'Skip to content', fr: 'Aller au contenu', es: 'Ir al contenido', de: 'Zum Inhalt', ru: 'К содержанию', zh: '跳到正文' },
  lingua: { it: 'Lingua', en: 'Language', fr: 'Langue', es: 'Idioma', de: 'Sprache', ru: 'Язык', zh: '语言' },
  verificato: { it: "Contenuto verificato sul codice dell'app il 16 novembre 2026. Se qualcosa non corrisponde a ciò che vedi, scrivi a", en: 'Content checked against the app code on 16 November 2026. If something does not match what you see, write to', fr: "Contenu vérifié sur le code de l'app le 16 novembre 2026. Si quelque chose ne correspond pas à ce que vous voyez, écrivez à", es: 'Contenido verificado en el código de la app el 16 de noviembre de 2026. Si algo no coincide con lo que ves, escribe a', de: 'Inhalt am 16. November 2026 mit dem App-Code abgeglichen. Wenn etwas nicht mit dem übereinstimmt, was du siehst, schreib an', ru: 'Содержание сверено с кодом приложения 16 ноября 2026 г. Если что-то не совпадает с тем, что вы видите, напишите на', zh: '内容已于 2026 年 11 月 16 日与应用代码核对。如有与您所见不符之处，请写信至' },
  tradotto: { it: '', en: 'Translated from Italian. Screenshots, videos and examples show the app in Italian.', fr: "Traduit de l'italien. Les captures, vidéos et exemples montrent l'app en italien.", es: 'Traducido del italiano. Las capturas, los vídeos y los ejemplos muestran la app en italiano.', de: 'Aus dem Italienischen übersetzt. Screenshots, Videos und Beispiele zeigen die App auf Italienisch.', ru: 'Переведено с итальянского. Скриншоты, видео и примеры показывают приложение на итальянском.', zh: '译自意大利语。截图、视频和示例显示的是意大利语界面。' },
  privacy: { it: 'Privacy', en: 'Privacy', fr: 'Confidentialité', es: 'Privacidad', de: 'Datenschutz', ru: 'Конфиденциальность', zh: '隐私' },
  supporto: { it: 'Supporto', en: 'Support', fr: 'Assistance', es: 'Soporte', de: 'Support', ru: 'Поддержка', zh: '支持' },
  daSapere: { it: 'Da sapere.', en: 'Good to know.', fr: 'Bon à savoir.', es: 'Conviene saber.', de: 'Gut zu wissen.', ru: 'Полезно знать.', zh: '须知。' },
  costo: { it: 'Costo.', en: 'Cost.', fr: 'Coût.', es: 'Coste.', de: 'Kosten.', ru: 'Стоимость.', zh: '费用。' },
  apriWeb: { it: 'Apri sul web', en: 'Open on the web', fr: 'Ouvrir sur le web', es: 'Abrir en la web', de: 'Im Web öffnen', ru: 'Открыть в браузере', zh: '在网页上打开' },
  esempiTitolo: { it: 'Ecco cosa ricevi: esempi veri', en: 'What you get: real examples', fr: 'Ce que vous recevez : de vrais exemples', es: 'Lo que recibes: ejemplos reales', de: 'Was du bekommst: echte Beispiele', ru: 'Что вы получаете: настоящие примеры', zh: '你会得到什么：真实示例' },
  esempiTesto: { it: "File generati dall'app per un utente vero, senza ritocchi: una grande città e un centro più piccolo.", en: 'Files generated by the app for a real user, untouched: a big city and a smaller town. They are in Italian.', fr: "Fichiers générés par l'app pour un vrai utilisateur, sans retouche : une grande ville et une plus petite. Ils sont en italien.", es: 'Archivos generados por la app para un usuario real, sin retoques: una gran ciudad y una localidad más pequeña. Están en italiano.', de: 'Dateien, die die App für einen echten Nutzer erzeugt hat, unbearbeitet: eine Großstadt und ein kleinerer Ort. Sie sind auf Italienisch.', ru: 'Файлы, созданные приложением для реального пользователя, без правок: большой город и небольшой. Они на итальянском.', zh: '应用为真实用户生成的文件，未经修改：一座大城市和一个小城镇。文件为意大利语。' },
  apriPdf: { it: '📄 Apri il PDF', en: '📄 Open the PDF', fr: '📄 Ouvrir le PDF', es: '📄 Abrir el PDF', de: '📄 PDF öffnen', ru: '📄 Открыть PDF', zh: '📄 打开 PDF' },
  leggiTesto: { it: 'Leggi il testo', en: 'Read the text', fr: 'Lire le texte', es: 'Leer el texto', de: 'Text lesen', ru: 'Читать текст', zh: '阅读文字' },
  videoReale: { it: "Registrazione reale dell'app.", en: 'Real recording of the app (in Italian).', fr: "Enregistrement réel de l'app (en italien).", es: 'Grabación real de la app (en italiano).', de: 'Echte Aufnahme der App (auf Italienisch).', ru: 'Настоящая запись приложения (на итальянском).', zh: '应用真实录屏（意大利语）。' },
  manca: { it: 'Cosa WIP non fa (per non crearti aspettative)', en: 'What WIP does not do (so you know what to expect)', fr: 'Ce que WIP ne fait pas (pour éviter les fausses attentes)', es: 'Lo que WIP no hace (para que sepas qué esperar)', de: 'Was WIP nicht kann (damit du weißt, was dich erwartet)', ru: 'Чего WIP не делает (чтобы не было ложных ожиданий)', zh: 'WIP 不做什么（以免产生误解）' },
  domande: { it: 'Domande frequenti', en: 'Frequently asked questions', fr: 'Questions fréquentes', es: 'Preguntas frecuentes', de: 'Häufige Fragen', ru: 'Частые вопросы', zh: '常见问题' },
  continua: { it: 'Continua con', en: 'Continue with', fr: 'Continuer avec', es: 'Continúa con', de: 'Weiter mit', ru: 'Читать дальше', zh: '继续阅读' },
  letto: { it: 'Ho letto questa guida (si salva solo sul tuo dispositivo)', en: 'I have read this guide (saved only on your device)', fr: "J'ai lu ce guide (enregistré uniquement sur votre appareil)", es: 'He leído esta guía (se guarda solo en tu dispositivo)', de: 'Ich habe diese Anleitung gelesen (nur auf deinem Gerät gespeichert)', ru: 'Я прочитал(а) это руководство (сохраняется только на вашем устройстве)', zh: '我已读完本指南（仅保存在你的设备上）' },
  tutteCategorie: { it: 'Tutte le categorie', en: 'All categories', fr: 'Toutes les catégories', es: 'Todas las categorías', de: 'Alle Kategorien', ru: 'Все категории', zh: '全部类别' },
  perMacro: { it: 'Per macroarea', en: 'By area', fr: 'Par domaine', es: 'Por área', de: 'Nach Bereich', ru: 'По разделам', zh: '按领域' },
  sottocategorie: { it: 'Sottocategorie con guida dedicata', en: 'Subcategories with their own guide', fr: 'Sous-catégories avec leur propre guide', es: 'Subcategorías con guía propia', de: 'Unterkategorien mit eigener Anleitung', ru: 'Подкатегории со своим руководством', zh: '有专门指南的子类别' },
  categoria: { it: 'Categoria', en: 'Category', fr: 'Catégorie', es: 'Categoría', de: 'Kategorie', ru: 'Категория', zh: '类别' },
  luoghi: { it: 'Luoghi', en: 'Places', fr: 'Lieux', es: 'Lugares', de: 'Orte', ru: 'Места', zh: '地点' },
  doveTrovi: { it: 'Dove la trovi:', en: 'Where to find it:', fr: 'Où la trouver :', es: 'Dónde encontrarla:', de: 'Wo du sie findest:', ru: 'Где найти:', zh: '在哪里找到：' },
  audioguida: { it: 'Audioguida:', en: 'Audio guide:', fr: 'Audioguide :', es: 'Audioguía:', de: 'Audioguide:', ru: 'Аудиогид:', zh: '语音导览：' },
  senzaNumeri: { it: 'Numeri non ancora calcolati per questa famiglia.', en: 'Numbers not yet calculated for this group.', fr: 'Chiffres pas encore calculés pour ce groupe.', es: 'Cifras aún no calculadas para este grupo.', de: 'Zahlen für diese Gruppe noch nicht berechnet.', ru: 'Цифры для этой группы ещё не подсчитаны.', zh: '此类别的数字尚未统计。' },
  insieme: { it: 'Insieme: circa {n} luoghi.', en: 'Together: about {n} places.', fr: 'Ensemble : environ {n} lieux.', es: 'En total: unos {n} lugares.', de: 'Zusammen: etwa {n} Orte.', ru: 'Всего: около {n} мест.', zh: '合计：约 {n} 个地点。' },
  altreChiavi: { it: 'Altre chiavi presenti nel database', en: 'Other keys in the database', fr: 'Autres clés présentes dans la base', es: 'Otras claves en la base de datos', de: 'Weitere Schlüssel in der Datenbank', ru: 'Другие ключи в базе данных', zh: '数据库中的其他键' },
  aggiornatiAl: { it: 'Dati aggiornati al {d}.', en: 'Data updated on {d}.', fr: 'Données mises à jour le {d}.', es: 'Datos actualizados el {d}.', de: 'Daten aktualisiert am {d}.', ru: 'Данные обновлены {d}.', zh: '数据更新于 {d}。' },
  circa: { it: 'circa ', en: 'about ', fr: 'environ ', es: 'unos ', de: 'etwa ', ru: 'около ', zh: '约 ' },
  beniAtlante: { it: "beni nell'atlante", en: 'heritage sites in the atlas', fr: "biens dans l'atlas", es: 'bienes en el atlas', de: 'Kulturgüter im Atlas', ru: 'объектов в атласе', zh: '图集中的遗产' },
  numeriReali: { it: 'Numeri reali', en: 'Real numbers', fr: 'Chiffres réels', es: 'Cifras reales', de: 'Echte Zahlen', ru: 'Реальные цифры', zh: '真实数据' },
  principali: { it: 'Tutorial principali', en: 'Main tutorials', fr: 'Tutoriels principaux', es: 'Tutoriales principales', de: 'Wichtigste Tutorials', ru: 'Основные уроки', zh: '主要教程' },
  percorsiApp: { it: 'Percorsi di apprendimento', en: 'Learning paths', fr: "Parcours d'apprentissage", es: 'Rutas de aprendizaje', de: 'Lernpfade', ru: 'Учебные маршруты', zh: '学习路径' },
  ogniViaggio: { it: 'WIP è la tua guida per ogni tipo di viaggio', en: 'WIP is your guide for every kind of trip', fr: 'WIP est votre guide pour tous les voyages', es: 'WIP es tu guía para cualquier tipo de viaje', de: 'WIP ist deine Anleitung für jede Art von Reise', ru: 'WIP — ваш гид для любого путешествия', zh: 'WIP 是你各种旅行的向导' },
  lezLetta: { it: '✓ letta', en: '✓ read', fr: '✓ lu', es: '✓ leída', de: '✓ gelesen', ru: '✓ прочитано', zh: '✓ 已读' },
  lezioni: { it: '{n} di {t} lezioni lette', en: '{n} of {t} lessons read', fr: '{n} leçons lues sur {t}', es: '{n} de {t} lecciones leídas', de: '{n} von {t} Lektionen gelesen', ru: 'прочитано {n} из {t}', zh: '已读 {n}/{t} 课' },
  esplora: { it: 'Esplora le funzionalità', en: 'Explore the features', fr: 'Découvrir les fonctions', es: 'Explora las funciones', de: 'Funktionen entdecken', ru: 'Посмотреть функции', zh: '探索功能' },
  comeFunziona: { it: 'Guarda come funziona', en: 'See how it works', fr: 'Voir comment ça marche', es: 'Mira cómo funciona', de: 'So funktioniert es', ru: 'Как это работает', zh: '看看如何使用' },
  cosaFare: { it: 'Cosa vuoi fare oggi?', en: 'What do you want to do today?', fr: "Que voulez-vous faire aujourd'hui ?", es: '¿Qué quieres hacer hoy?', de: 'Was möchtest du heute machen?', ru: 'Что вы хотите сделать сегодня?', zh: '今天想做什么？' },
  cosaFareTesto: { it: 'Scegli un obiettivo: ti diciamo quale funzione usare e dove trovare la guida passo per passo.', en: 'Pick a goal: we tell you which feature to use and where to find the step-by-step guide.', fr: 'Choisissez un objectif : nous vous disons quelle fonction utiliser et où trouver le guide pas à pas.', es: 'Elige un objetivo: te decimos qué función usar y dónde está la guía paso a paso.', de: 'Wähle ein Ziel: Wir sagen dir, welche Funktion du nutzt und wo die Schritt-für-Schritt-Anleitung ist.', ru: 'Выберите цель: мы подскажем, какую функцию использовать и где пошаговое руководство.', zh: '选择一个目标：我们会告诉你用哪个功能、在哪里看分步指南。' },
  chiedi: { it: 'Chiedi a WIP come fare', en: 'Ask WIP how to do it', fr: 'Demandez à WIP comment faire', es: 'Pregunta a WIP cómo hacerlo', de: 'Frag WIP, wie es geht', ru: 'Спросите WIP, как это сделать', zh: '问问 WIP 怎么做' },
  esempioRicerca: { it: 'Es. Come trovo un ristorante senza glutine?', en: 'E.g. How do I find a gluten-free restaurant?', fr: 'Ex. Comment trouver un restaurant sans gluten ?', es: 'Ej. ¿Cómo encuentro un restaurante sin gluten?', de: 'Z. B. Wie finde ich ein glutenfreies Restaurant?', ru: 'Напр.: как найти ресторан без глютена?', zh: '例如：怎么找到无麸质餐厅？' },
  cercaGuida: { it: 'Cerca nella guida', en: 'Search the guide', fr: 'Rechercher dans le guide', es: 'Buscar en la guía', de: 'In der Anleitung suchen', ru: 'Поиск по руководству', zh: '搜索指南' },
  ricercaNota: { it: 'La ricerca cerca nelle guide, non inventa risposte: ti porta alla pagina che spiega la funzione.', en: 'The search looks through the guides and does not make up answers: it takes you to the page that explains the feature.', fr: "La recherche parcourt les guides et n'invente pas de réponses : elle vous mène à la page qui explique la fonction.", es: 'La búsqueda mira en las guías y no inventa respuestas: te lleva a la página que explica la función.', de: 'Die Suche durchsucht die Anleitungen und erfindet keine Antworten: Sie führt dich zur Seite, die die Funktion erklärt.', ru: 'Поиск ищет по руководствам и ничего не выдумывает: он ведёт на страницу с объяснением функции.', zh: '搜索只在指南中查找，不会编造答案：它会带你到讲解该功能的页面。' },
  nessunRisultato: { it: 'Nessuna guida trovata: prova con altre parole o scorri le categorie.', en: 'No guide found: try other words or browse the categories.', fr: "Aucun guide trouvé : essayez d'autres mots ou parcourez les catégories.", es: 'No se ha encontrado ninguna guía: prueba con otras palabras o mira las categorías.', de: 'Keine Anleitung gefunden: Versuch es mit anderen Wörtern oder blättere durch die Kategorien.', ru: 'Ничего не найдено: попробуйте другие слова или посмотрите категории.', zh: '没有找到相关指南：换个词试试，或浏览类别。' },
  esploraTutto: { it: 'Esplora tutto quello che puoi trovare', en: 'Explore everything you can find', fr: 'Explorez tout ce que vous pouvez trouver', es: 'Explora todo lo que puedes encontrar', de: 'Entdecke alles, was du finden kannst', ru: 'Всё, что можно найти', zh: '探索你能找到的一切' },
  guidePrincipali: { it: 'Le guide principali', en: 'The main guides', fr: 'Les guides principaux', es: 'Las guías principales', de: 'Die wichtigsten Anleitungen', ru: 'Главные руководства', zh: '主要指南' },
  scarica: { it: 'Scarica WIP', en: 'Download WIP', fr: 'Télécharger WIP', es: 'Descarga WIP', de: 'WIP herunterladen', ru: 'Скачать WIP', zh: '下载 WIP' },
  tutteRisposte: { it: 'Tutte le risposte raccolte in una pagina →', en: 'All the answers on one page →', fr: 'Toutes les réponses sur une page →', es: 'Todas las respuestas en una página →', de: 'Alle Antworten auf einer Seite →', ru: 'Все ответы на одной странице →', zh: '所有答案汇总在一页 →' },
};
export const ui = (k, lang, vars = {}) => Object.entries(vars).reduce((s, [a, b]) => s.replace(`{${a}}`, b), (UI[k]?.[lang] ?? UI[k]?.it ?? k));
