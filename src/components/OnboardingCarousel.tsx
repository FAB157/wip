import React, { useState, useEffect, useCallback } from 'react';
import {
  Headphones, Camera, LayoutGrid, ArrowRight, ArrowLeft, Check,
} from 'lucide-react';
import { useSwipeable } from 'react-swipeable';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Language, getTranslation } from '../lib/i18n';

interface OnboardingProps {
  onComplete: () => void;
  language?: Language;
}

/**
 * La presentazione che si vede una volta sola, al primo avvio, prima del login.
 *
 * Le schermate precedenti raccontavano itinerari, audioguida e offline: era
 * l'app di mesi fa. Mancava tutto quello che nel frattempo la distingue davvero
 * — la fotocamera che riconosce, la community che aggiunge luoghi, i crediti al
 * posto dell'abbonamento.
 *
 * TRE schermate, non di piu': chi apre l'app per la prima volta vuole entrare,
 * non leggere. Due raccontano le due cose che nessun'altra app fa (la voce che
 * parte da sola, la fotocamera che riconosce e la community che aggiunge), la
 * terza elenca tutto il resto in una griglia che si scorre in dieci secondi.
 * Il dettaglio vero non sta qui: sta nel manuale, in Profilo → Impostazioni.
 *
 * Ogni schermata ha un colore proprio invece dell'oro ovunque: cosi' si capisce
 * a colpo d'occhio di essere passati oltre, che era il difetto piu' evidente di
 * prima (tre schermate identiche, dorate, indistinguibili durante lo scorrimento).
 *
 * NB: nessun numero inventato. Le "prove" sotto ogni schermata dicono solo cose
 * verificate nel codice — il Pass Museo costa 100 crediti per quattro ore
 * (`pricing.ts`), un riconoscimento Vision ne costa 5. Se quei prezzi cambiano,
 * qui va cambiato il testo.
 */

type Traduzione = { tag: string; titolo: string; evidenza: string; testo: string; prove: string[] };

const COPIA: Partial<Record<Language, Traduzione[]>> = {
  IT: [
    {
      tag: 'Audioguide automatiche',
      titolo: 'Esplora come un',
      evidenza: 'Local',
      testo: 'Cammini, e quando passi davanti a qualcosa che merita la voce parte da sola. Niente da cercare, niente da toccare: il telefono puo’ restare in tasca.',
      prove: ['Funziona a schermo spento', 'Anche in auto', '7 lingue'],
    },
    {
      tag: 'Fotocamera e community',
      titolo: 'Inquadra, e se manca',
      evidenza: 'aggiungilo tu',
      testo: 'Un palazzo senza targa o un quadro senza didascalia: punta la fotocamera e WIP te lo racconta. E se un luogo sulla mappa non c’e’, fotografalo: una volta approvato diventa un luogo WIP per tutti, e a te tornano crediti.',
      prove: ['Riconosce opere e monumenti', 'Pass Museo · 4 ore illimitate', 'La tua foto ti premia'],
    },
  ],
  EN: [
    {
      tag: 'Automatic audio guides',
      titolo: 'Explore like a',
      evidenza: 'Local',
      testo: 'You walk, and when you pass something worth knowing the voice starts on its own. Nothing to search, nothing to tap: your phone can stay in your pocket.',
      prove: ['Works with the screen off', 'Also while driving', '7 languages'],
    },
    {
      tag: 'Camera and community',
      titolo: 'Point it — and if it’s',
      evidenza: 'missing, add it',
      testo: 'A building with no plaque or a painting with no label: point your camera and WIP tells you the story. And if a place is not on the map, photograph it: once approved it becomes a WIP place for everyone, and you earn credits.',
      prove: ['Reads art and monuments', 'Museum Pass · 4 unlimited hours', 'Your photo earns you credits'],
    },
  ],
  FR: [
    {
      tag: 'Audioguides automatiques',
      titolo: 'Explorez comme un',
      evidenza: 'local',
      testo: 'Vous marchez, et quand vous passez devant quelque chose qui vaut le détour, la voix démarre toute seule. Rien à chercher, rien à toucher : le téléphone peut rester dans la poche.',
      prove: ['Fonctionne écran éteint', 'Aussi en voiture', '7 langues'],
    },
    {
      tag: 'Caméra et communauté',
      titolo: 'Visez — et s’il manque,',
      evidenza: 'ajoutez-le',
      testo: 'Un palais sans plaque ou un tableau sans légende : pointez la caméra et WIP vous raconte. Et si un lieu manque sur la carte, photographiez-le : une fois approuvé, il devient un lieu WIP pour tous, et vous gagnez des crédits.',
      prove: ['Reconnaît œuvres et monuments', 'Pass Musée · 4 h illimitées', 'Votre photo vous récompense'],
    },
  ],
  ES: [
    {
      tag: 'Audioguías automáticas',
      titolo: 'Explora como un',
      evidenza: 'local',
      testo: 'Caminas, y cuando pasas junto a algo que merece la pena, la voz empieza sola. Nada que buscar, nada que tocar: el teléfono puede quedarse en el bolsillo.',
      prove: ['Funciona con la pantalla apagada', 'También en coche', '7 idiomas'],
    },
    {
      tag: 'Cámara y comunidad',
      titolo: 'Enfoca — y si falta,',
      evidenza: 'añádelo tú',
      testo: 'Un palacio sin placa o un cuadro sin cartela: apunta la cámara y WIP te lo cuenta. Y si un lugar no está en el mapa, fotografíalo: una vez aprobado se convierte en un lugar WIP para todos, y tú ganas créditos.',
      prove: ['Reconoce obras y monumentos', 'Pase Museo · 4 horas ilimitadas', 'Tu foto te premia'],
    },
  ],
  DE: [
    {
      tag: 'Automatische Audioguides',
      titolo: 'Erkunde wie ein',
      evidenza: 'Local',
      testo: 'Du gehst, und wenn du an etwas Sehenswertem vorbeikommst, startet die Stimme von selbst. Nichts suchen, nichts antippen: Das Telefon kann in der Tasche bleiben.',
      prove: ['Funktioniert bei ausgeschaltetem Bildschirm', 'Auch im Auto', '7 Sprachen'],
    },
    {
      tag: 'Kamera und Community',
      titolo: 'Anvisieren — und wenn’s fehlt,',
      evidenza: 'füge es hinzu',
      testo: 'Ein Palast ohne Tafel oder ein Bild ohne Beschriftung: Richte die Kamera darauf und WIP erzählt dir die Geschichte. Und fehlt ein Ort auf der Karte, fotografiere ihn: Nach der Freigabe wird er ein WIP-Ort für alle, und du bekommst Credits.',
      prove: ['Erkennt Kunstwerke und Denkmäler', 'Museumspass · 4 Stunden unbegrenzt', 'Dein Foto belohnt dich'],
    },
  ],
  RU: [
    {
      tag: 'Автоматические аудиогиды',
      titolo: 'Исследуй как',
      evidenza: 'местный',
      testo: 'Вы идёте, и когда проходите мимо чего-то стоящего, голос включается сам. Ничего не искать, ничего не нажимать: телефон может оставаться в кармане.',
      prove: ['Работает при выключенном экране', 'И в машине', '7 языков'],
    },
    {
      tag: 'Камера и сообщество',
      titolo: 'Наведи камеру — а если места нет,',
      evidenza: 'добавь его',
      testo: 'Дворец без таблички или картина без подписи: наведите камеру, и WIP всё расскажет. А если места нет на карте — сфотографируйте его: после одобрения оно станет местом WIP для всех, а вам вернутся кредиты.',
      prove: ['Распознаёт произведения и памятники', 'Музейный пасс · 4 часа без лимита', 'Ваше фото приносит кредиты'],
    },
  ],
  ZH: [
    {
      tag: '自动语音导览',
      titolo: '像当地人一样',
      evidenza: '探索',
      testo: '你走着走着，经过值得一听的地方时，讲解会自动响起。无需搜索、无需点击：手机可以一直放在口袋里。',
      prove: ['熄屏也能用', '开车也可以', '7种语言'],
    },
    {
      tag: '相机与社区',
      titolo: '拍一下——如果地图上没有',
      evidenza: '就由你来添加',
      testo: '没有铭牌的建筑或没有说明的画作：对准相机，WIP 就会为你讲解。如果某个地点不在地图上，拍下它：审核通过后它将成为所有人的 WIP 地点，你还能获得积分。',
      prove: ['识别艺术品和古迹', '博物馆通票 · 4小时无限次', '你的照片为你赢取积分'],
    },
  ],
};

/**
 * L'ultima schermata: tutto il resto, in una griglia.
 *
 * Il resto delle funzioni e' troppo per farne una schermata ciascuna — sarebbe
 * un carosello di quindici passaggi che nessuno finisce. Ma non nominarle
 * significa che l'utente non sapra' mai che esistono, perche' vivono dentro
 * schede che si aprono solo se le cerchi. Una griglia finale le nomina tutte in
 * dieci secondi di lettura, e chi vuole approfondire le ritrova nell'app.
 */
const TUTTO: Partial<Record<Language, { titolo: string; sottotitolo: string; voci: [string, string][] }>> = {
  IT: {
    titolo: 'E poi c’e’ tutto il resto',
    sottotitolo: 'Compreso nell’app. I dettagli nel manuale, in Profilo → Impostazioni.',
    voci: [
      ['🗺️', 'Itinerari su misura giorno per giorno, con l’alternativa a costo zero'],
      ['🎫', 'Day Pass: 24 ore a mani libere, fino a 40 audioguide'],
      ['🏛️', 'Pass Museo: 4 ore di riconoscimenti illimitati, pensato per l’interno'],
      ['📴', 'Mappe e audioguide offline, scaricate gratis prima di partire'],
      ['💳', 'Crediti che non scadono: nessun abbonamento, nessun rinnovo'],
      ['🧭', 'Navigatore a piedi con la voce che racconta lungo la strada'],
      ['🎧', 'Podcast e guide in PDF da portarti dietro'],
      ['💬', 'Chat con una guida che sa dove sei'],
      ['🎟️', 'Biglietti e visite prenotabili, salta-fila'],
      ['🗓️', 'Eventi e concerti nei giorni in cui ci sei'],
      ['🏺', 'Atlante dei beni vincolati e musei di tutto il mondo'],
      ['🥾', 'Cammini storici con tappe e posti dove dormire'],
      ['⚓', 'Fughe da porto e aeroporto per le soste di 4, 6 o 8 ore'],
      ['🌧️', 'Garanzia pioggia: crediti indietro se il tempo rovina il giro'],
      ['👥', 'Piani di gruppo condivisi con un codice'],
      ['🌱', 'Impronta di CO₂ e passi camminati'],
      ['📅', 'Itinerario esportabile nel calendario del telefono'],
    ],
  },
  EN: {
    titolo: 'And then everything else',
    sottotitolo: 'Included in the app. Details in the manual, under Profile → Settings.',
    voci: [
      ['🗺️', 'Tailored day-by-day itineraries, always with a free version'],
      ['🎫', 'Day Pass: 24 hands-free hours, up to 40 audio guides'],
      ['🏛️', 'Museum Pass: 4 hours of unlimited recognitions, made for indoors'],
      ['📴', 'Offline maps and audio guides, downloaded free before you leave'],
      ['💳', 'Credits that never expire: no subscription, no renewal'],
      ['🧭', 'Walking navigator with the voice narrating along the way'],
      ['🎧', 'Podcasts and PDF guides to take with you'],
      ['💬', 'Chat with a guide that knows where you are'],
      ['🎟️', 'Bookable skip-the-line tickets and tours'],
      ['🗓️', 'Events and concerts on the days you are there'],
      ['🏺', 'Atlas of listed heritage and museums worldwide'],
      ['🥾', 'Historic trails with stages and places to sleep'],
      ['⚓', 'Port and airport escapes for 4, 6 or 8 hour stops'],
      ['🌧️', 'Rain guarantee: credits back if the weather ruins the day'],
      ['👥', 'Shared group plans with a code'],
      ['🌱', 'CO₂ footprint and steps walked'],
      ['📅', 'Itinerary exported to your phone calendar'],
    ],
  },
  FR: {
    titolo: 'Et puis il y a tout le reste',
    sottotitolo: 'Inclus dans l’app. Les détails dans le manuel, sous Profil → Réglages.',
    voci: [
      ['🗺️', 'Itinéraires sur mesure jour par jour, avec toujours une version gratuite'],
      ['🎫', 'Day Pass : 24 h mains libres, jusqu’à 40 audioguides'],
      ['🏛️', 'Pass Musée : 4 h de reconnaissances illimitées, pensé pour l’intérieur'],
      ['📴', 'Cartes et audioguides hors ligne, téléchargés gratuitement avant de partir'],
      ['💳', 'Des crédits qui n’expirent jamais : pas d’abonnement, pas de renouvellement'],
      ['🧭', 'Navigateur piéton avec la voix qui raconte en chemin'],
      ['🎧', 'Podcasts et guides PDF à emporter'],
      ['💬', 'Chat avec un guide qui sait où vous êtes'],
      ['🎟️', 'Billets et visites réservables, coupe-file'],
      ['🗓️', 'Événements et concerts les jours où vous y êtes'],
      ['🏺', 'Atlas du patrimoine protégé et des musées du monde entier'],
      ['🥾', 'Chemins historiques avec étapes et lieux où dormir'],
      ['⚓', 'Escapades depuis le port ou l’aéroport pour les escales de 4, 6 ou 8 h'],
      ['🌧️', 'Garantie pluie : crédits remboursés si la météo gâche la journée'],
      ['👥', 'Plans de groupe partagés avec un code'],
      ['🌱', 'Empreinte CO₂ et pas parcourus'],
      ['📅', 'Itinéraire exportable dans le calendrier du téléphone'],
    ],
  },
  ES: {
    titolo: 'Y luego está todo lo demás',
    sottotitolo: 'Incluido en la app. Los detalles en el manual, en Perfil → Ajustes.',
    voci: [
      ['🗺️', 'Itinerarios a medida día a día, siempre con una versión gratuita'],
      ['🎫', 'Day Pass: 24 horas manos libres, hasta 40 audioguías'],
      ['🏛️', 'Pase Museo: 4 horas de reconocimientos ilimitados, pensado para interiores'],
      ['📴', 'Mapas y audioguías offline, descargados gratis antes de salir'],
      ['💳', 'Créditos que no caducan: sin suscripción, sin renovación'],
      ['🧭', 'Navegador a pie con la voz que narra por el camino'],
      ['🎧', 'Podcasts y guías en PDF para llevar'],
      ['💬', 'Chat con un guía que sabe dónde estás'],
      ['🎟️', 'Entradas y visitas reservables, sin colas'],
      ['🗓️', 'Eventos y conciertos en los días en que estás allí'],
      ['🏺', 'Atlas del patrimonio protegido y museos de todo el mundo'],
      ['🥾', 'Caminos históricos con etapas y lugares donde dormir'],
      ['⚓', 'Escapadas desde puerto y aeropuerto para paradas de 4, 6 u 8 horas'],
      ['🌧️', 'Garantía de lluvia: créditos de vuelta si el tiempo arruina el día'],
      ['👥', 'Planes de grupo compartidos con un código'],
      ['🌱', 'Huella de CO₂ y pasos caminados'],
      ['📅', 'Itinerario exportable al calendario del teléfono'],
    ],
  },
  DE: {
    titolo: 'Und dann der ganze Rest',
    sottotitolo: 'In der App enthalten. Details im Handbuch unter Profil → Einstellungen.',
    voci: [
      ['🗺️', 'Maßgeschneiderte Tag-für-Tag-Routen, immer mit einer Gratis-Version'],
      ['🎫', 'Day Pass: 24 Stunden freihändig, bis zu 40 Audioguides'],
      ['🏛️', 'Museumspass: 4 Stunden unbegrenzte Erkennungen, für drinnen gedacht'],
      ['📴', 'Offline-Karten und -Audioguides, vor der Reise gratis geladen'],
      ['💳', 'Credits, die nie verfallen: kein Abo, keine Verlängerung'],
      ['🧭', 'Fußgänger-Navi mit der Stimme, die unterwegs erzählt'],
      ['🎧', 'Podcasts und PDF-Guides zum Mitnehmen'],
      ['💬', 'Chat mit einem Guide, der weiß, wo du bist'],
      ['🎟️', 'Buchbare Tickets und Touren, ohne Anstehen'],
      ['🗓️', 'Events und Konzerte an den Tagen, an denen du da bist'],
      ['🏺', 'Atlas der denkmalgeschützten Orte und Museen weltweit'],
      ['🥾', 'Historische Wege mit Etappen und Übernachtungsplätzen'],
      ['⚓', 'Ausflüge ab Hafen und Flughafen für Stopps von 4, 6 oder 8 Stunden'],
      ['🌧️', 'Regen-Garantie: Credits zurück, wenn das Wetter den Tag verdirbt'],
      ['👥', 'Geteilte Gruppenpläne mit einem Code'],
      ['🌱', 'CO₂-Fußabdruck und gelaufene Schritte'],
      ['📅', 'Route exportierbar in den Handy-Kalender'],
    ],
  },
  RU: {
    titolo: 'А ещё — всё остальное',
    sottotitolo: 'Включено в приложение. Подробности в руководстве: Профиль → Настройки.',
    voci: [
      ['🗺️', 'Маршруты под вас на каждый день, всегда с бесплатным вариантом'],
      ['🎫', 'Day Pass: 24 часа без рук, до 40 аудиогидов'],
      ['🏛️', 'Музейный пасс: 4 часа распознаваний без лимита, создан для помещений'],
      ['📴', 'Офлайн-карты и аудиогиды, скачанные бесплатно перед поездкой'],
      ['💳', 'Кредиты не сгорают: без подписки и продлений'],
      ['🧭', 'Пешеходный навигатор с голосом, который рассказывает по пути'],
      ['🎧', 'Подкасты и PDF-гиды с собой'],
      ['💬', 'Чат с гидом, который знает, где вы'],
      ['🎟️', 'Билеты и экскурсии без очереди'],
      ['🗓️', 'События и концерты в дни вашего визита'],
      ['🏺', 'Атлас охраняемого наследия и музеев всего мира'],
      ['🥾', 'Исторические пути с этапами и местами для ночлега'],
      ['⚓', 'Вылазки из порта и аэропорта на стоянки 4, 6 или 8 часов'],
      ['🌧️', 'Гарантия дождя: кредиты вернутся, если погода испортит день'],
      ['👥', 'Групповые планы по общему коду'],
      ['🌱', 'След CO₂ и пройденные шаги'],
      ['📅', 'Маршрут экспортируется в календарь телефона'],
    ],
  },
  ZH: {
    titolo: '还有更多精彩',
    sottotitolo: '全部包含在应用中。详情见手册：个人资料 → 设置。',
    voci: [
      ['🗺️', '按天定制的行程，总有免费版本'],
      ['🎫', 'Day Pass：24小时解放双手，最多40段语音导览'],
      ['🏛️', '博物馆通票：4小时无限次识别，专为室内设计'],
      ['📴', '离线地图和语音导览，出发前免费下载'],
      ['💳', '积分永不过期：无订阅、无续费'],
      ['🧭', '步行导航，一路语音讲解'],
      ['🎧', '播客和 PDF 指南随身携带'],
      ['💬', '与知道你位置的向导聊天'],
      ['🎟️', '可预订的免排队门票和游览'],
      ['🗓️', '你在当地那几天的活动和音乐会'],
      ['🏺', '全球受保护文化遗产与博物馆图集'],
      ['🥾', '历史古道：分段路线和住宿地点'],
      ['⚓', '港口和机场的4、6或8小时快闪行程'],
      ['🌧️', '下雨保障：天气毁了行程就退积分'],
      ['👥', '用代码共享的小组计划'],
      ['🌱', '碳足迹和步数统计'],
      ['📅', '行程可导出到手机日历'],
    ],
  },
};

/** Un colore per schermata: e' cosi' che si vede di essere andati avanti. */
const ACCENTI = [
  { alone: 'rgba(56, 189, 248, 0.20)', tinta: '#38bdf8' },  // cielo — camminare
  { alone: 'rgba(167, 139, 250, 0.20)', tinta: '#a78bfa' }, // viola — fotocamera e community
  { alone: 'rgba(212, 175, 55, 0.20)', tinta: '#d4af37' },  // oro — il riepilogo
];

const ICONE = [Headphones, Camera, LayoutGrid];

export const OnboardingCarousel: React.FC<OnboardingProps> = (props) => {
  const { onComplete } = props;
  // Annotato esplicitamente: con la destrutturazione a default ("language =
  // 'IT'") tsc inferiva `string` invece di `Language` per la prop opzionale
  // (24/08/2026, sotto React.FC<OnboardingProps>).
  const language: Language = props.language || 'IT';
  const [indice, setIndice] = useState(0);
  const menoMovimento = useReducedMotion();

  // Tutte e 7 le lingue hanno la loro copia; una lingua eventualmente
  // mancante ricade sull'inglese, com'era prima.
  const lingua: Language = COPIA[language] ? language : 'EN';
  const slides = COPIA[lingua]!;
  const tutto = TUTTO[lingua]!;
  const t = (k: string) => getTranslation(k, language);
  // Il riepilogo e' una schermata in piu' in coda, con un impaginato suo.
  const totale = slides.length + 1;
  const eRiepilogo = indice === slides.length;
  const ultima = indice === totale - 1;
  const s = slides[Math.min(indice, slides.length - 1)];
  const accento = ACCENTI[indice % ACCENTI.length];
  const Icona = ICONE[indice % ICONE.length];

  const avanti = useCallback(() => {
    setIndice((i) => (i < totale - 1 ? i + 1 : (onComplete(), i)));
  }, [totale, onComplete]);
  const indietro = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  // Sul sito si scorre con la tastiera, non con il dito.
  useEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') avanti();
      if (e.key === 'ArrowLeft') indietro();
      if (e.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', tasti);
    return () => window.removeEventListener('keydown', tasti);
  }, [avanti, indietro, onComplete]);

  const gesti = useSwipeable({
    onSwipedLeft: avanti,
    onSwipedRight: indietro,
    trackMouse: true,
  });

  const animazione = menoMovimento
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -24, scale: 0.97 },
      };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#07090e] text-white select-none overflow-hidden"
      role="dialog"
      aria-label={t('vr_a_ob_dialog')}
      {...gesti}
    >
      {/* L'alone cambia colore insieme alla schermata: e' il segnale di
          avanzamento piu' forte, molto piu' dei puntini in fondo. */}
      <div
        className="absolute inset-0 transition-[background-image] duration-700 ease-out"
        style={{
          backgroundImage:
            `radial-gradient(120% 80% at 78% 12%, ${accento.alone} 0%, transparent 62%),` +
            'radial-gradient(90% 70% at 12% 92%, rgba(212,175,55,0.06) 0%, transparent 60%)',
        }}
      />
      <div className="absolute inset-0 pointer-events-none opacity-50 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:34px_34px]" />

      {/* Intestazione: marchio a sinistra, "salta" a destra e sempre
          raggiungibile — prima stava in fondo, dove su schermi piccoli
          finiva sotto la barra del browser. */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="text-lg font-serif font-black tracking-[0.18em] text-[#d4af37]">WIP</span>
          <span className="w-1 h-1 rounded-full bg-[#d4af37]/70" />
          <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/45">
            World in Pocket
          </span>
        </div>
        <button
          onClick={onComplete}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg px-3 py-2 transition-colors"
        >
          {t('vr_a_ob_skip')}
        </button>
      </header>

      {/* Barra di avanzamento a segmenti: dice a che punto si e' e quanto
          manca, cosa che i puntini non dicevano. */}
      <div className="relative z-10 shrink-0 px-6 sm:px-10 pt-5">
        <div className="mx-auto flex max-w-md gap-1.5">
          {Array.from({ length: totale }, (_, i) => (
            <button
              key={i}
              onClick={() => setIndice(i)}
              aria-label={`${i + 1} / ${totale}`}
              aria-current={i === indice}
              className="group h-6 flex-1 focus-visible:outline-none"
            >
              <span
                className="block h-1 rounded-full transition-all duration-500"
                style={{
                  background: i <= indice ? accento.tinta : 'rgba(255,255,255,0.14)',
                  boxShadow: i === indice ? `0 0 12px ${accento.alone}` : 'none',
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <main className="relative z-10 flex-1 flex flex-col justify-center px-6 sm:px-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={indice}
            {...animazione}
            transition={{ duration: menoMovimento ? 0.2 : 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto flex w-full max-w-md flex-col items-center text-center"
          >
            {eRiepilogo ? (
              <>
                <h2 className="text-[24px] sm:text-[28px] font-serif font-black leading-[1.2] tracking-tight text-balance">
                  {tutto.titolo}
                </h2>
                <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-white/60">
                  {tutto.sottotitolo}
                </p>
                {/* Una colonna sola: sono frasi, non etichette, e su due
                    colonne diventerebbero illeggibili sui telefoni stretti.
                    Scorre, perche' dodici voci non ci stanno in altezza. */}
                <ul className="mt-6 w-full space-y-2 overflow-y-auto pr-1 text-left"
                    style={{ maxHeight: 'min(46vh, 380px)' }}>
                  {tutto.voci.map(([emoji, testo]) => (
                    <li
                      key={testo}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5"
                    >
                      <span aria-hidden className="text-base leading-none pt-0.5">{emoji}</span>
                      <span className="text-[12.5px] leading-snug text-white/75">{testo}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
            {/* Medaglione: cerchio pieno del colore della schermata, con un
                alone morbido. Un solo elemento invece di tre anelli
                sovrapposti — si legge meglio e non ruba la scena al testo. */}
            <div className="relative mb-8 flex items-center justify-center">
              {!menoMovimento && (
                <motion.span
                  aria-hidden
                  animate={{ scale: [1, 1.14, 1], opacity: [0.35, 0.6, 0.35] }}
                  transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
                  className="absolute h-32 w-32 rounded-full blur-xl"
                  style={{ background: accento.alone }}
                />
              )}
              <div
                className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border transition-colors duration-700"
                style={{
                  borderColor: `${accento.tinta}59`,
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.01))',
                  boxShadow: `0 18px 50px -20px ${accento.tinta}80`,
                }}
              >
                <Icona className="h-10 w-10" strokeWidth={1.6} style={{ color: accento.tinta }} />
              </div>
            </div>

            <span
              className="mb-5 inline-block rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition-colors duration-700"
              style={{
                color: accento.tinta,
                borderColor: `${accento.tinta}40`,
                background: `${accento.tinta}14`,
              }}
            >
              {s.tag}
            </span>

            <h2 className="text-[26px] sm:text-[32px] font-serif font-black leading-[1.2] tracking-tight text-balance">
              {s.titolo}{' '}
              <span style={{ color: accento.tinta }}>{s.evidenza}</span>
            </h2>

            {/* Testo piu' chiaro di prima (era bianco al 60%, quasi illeggibile
                al sole) e leggermente piu' grande. */}
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/75">
              {s.testo}
            </p>

            {/* Le tre prove concrete: e' la parte che risponde alla domanda
                "si', ma in pratica?" — prima non c'era nulla del genere. */}
            <ul className="mt-7 flex flex-wrap justify-center gap-2">
              {s.prove.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/70"
                >
                  <Check className="h-3 w-3 shrink-0" strokeWidth={3} style={{ color: accento.tinta }} />
                  {p}
                </li>
              ))}
            </ul>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-10 shrink-0 px-6 pb-10 pt-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          {/* "Indietro" compare solo quando ha senso, e occupa spazio fisso
              cosi' il pulsante principale non salta da una schermata all'altra. */}
          <button
            onClick={indietro}
            disabled={indice === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-white/70 transition-all hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label={t('vr_a_ob_prev')}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>

          <button
            onClick={avanti}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[12px] font-black uppercase tracking-[0.18em] text-slate-950 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{
              background: `linear-gradient(100deg, ${accento.tinta}, #d4af37)`,
              boxShadow: `0 14px 40px -18px ${accento.tinta}`,
            }}
          >
            {ultima ? (
              <>
                {t('vr_a_ob_start')}
                <Check className="h-4 w-4" strokeWidth={3} />
              </>
            ) : (
              <>
                {t('vr_a_ob_next')}
                <ArrowRight className="h-4 w-4" strokeWidth={3} />
              </>
            )}
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] uppercase tracking-[0.22em] text-white/25">
          {indice + 1} / {totale}
        </p>
      </footer>
    </div>
  );
};
