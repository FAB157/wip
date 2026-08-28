import {
  Landmark,
  Library,
  Image as ImageIcon,
  Gem,
  GlassWater,
  ParkingCircle,
  Ticket,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { CATEGORY_COLORS } from "../lib/mapConstants";
import { motion, AnimatePresence } from "motion/react";
import { Language, getTranslation } from "../lib/i18n";

export interface Category {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * QUALI CHIP STANNO SEMPRE IN BARRA (decisione committente, 22/08/2026).
 *
 * Prima erano nove macro più tre bottoni partner: dodici pillole su una riga
 * che scorre, con tre categorie spente di default che occupavano posto per
 * qualcosa che l'utente non vedeva finché non lo accendeva.
 *
 * Ora la barra porta cinque cose e basta — quelle che si toccano davvero
 * ogni giorno — e tutto il resto si accende dal pannello ＋, che le AGGIUNGE
 * alla barra: una categoria accesa dal pannello diventa una chip come le
 * altre, con i suoi sotto-filtri.
 */
const FISSE = ["gemme", "monumenti", "community", "esperienze", "eventi"] as const;

/**
 * Cosa c'è dentro ogni categoria, in una riga. Serve alla ⓘ del pannello:
 * "Utilità" non dice niente finché non sai che dentro ci sono le farmacie e
 * le fontanelle, e questa è l'unica ragione per cui la gente non le accende.
 */
export const COSA_CONTIENE: Record<string, string> = {
  gemme: "I luoghi che valgono la deviazione: monumenti, chiese, musei e panorami con l'audioguida — scelti, non tutti.",
  monumenti: "Tutto il patrimonio da visitare: monumenti, chiese, musei, panorami.",
  natura: "I luoghi naturali: spiagge e isole, vette e vulcani, cascate e laghi, grotte, parchi e riserve.",
  localita: "Borghi e villaggi che sono meta di per sé — Riomaggiore, Volterra, Colonnata — con foto, descrizione e audioguida.",
  community: "Le foto dei viaggiatori approvate dalla redazione: luoghi che non stanno su nessuna guida.",
  esperienze: "Visite guidate, biglietti salta-fila e attività prenotabili di Viator, GetYourGuide e Tiqets, nella zona che stai guardando.",
  eventi: "Concerti, mostre e sagre in corso e nei prossimi giorni, con i biglietti dove esistono.",
  locali: "Dove mangiare: ristoranti, pizzerie, pesce, carne, sushi, vegetariano, senza glutine, bar e gelaterie.",
  utilita: "Quello che serve mentre giri: farmacie, ospedali, mercati, fontanelle, stazioni, metro, taxi, caselli.",
  famiglie: "Con i bambini: parchi giochi, parchi divertimenti, acquari e zoo.",
  beni_culturali: "L'atlante dei beni vincolati nel mondo: scheda ridotta, niente audioguida.",
  tematiche: "Otto verticali con un catalogo vero: terme, set di film, cieli bui, street art, mercati, fioriture, case-museo, viaggio lento.",
};

export const CATEGORIES: Category[] = [
  { id: "gemme", label: "Gemme", icon: <span className="text-sm">💎</span> },
  { id: "monumenti", label: "Monumenti", icon: <span className="text-sm">🏛️</span> },
  // NATURA (22/08/2026): spiagge, vette, acque, grotte, parchi. Era un pezzo
  // di Monumenti; il committente la vuole a se', selezionabile da «Altro».
  { id: "natura", label: "Natura", icon: <span className="text-sm">🌿</span> },
  // LOCALITÀ TURISTICHE (24/08/2026): borghi e villaggi come Riomaggiore,
  // Volterra, Colonnata — mete di per sé, non un monumento dentro una città.
  // Mondiale, con foto/descrizione da Wikidata e audioguida (vedi
  // scratch/importa-localita-mondo.mjs). Spenta di default come Natura.
  { id: "localita", label: "Località", icon: <span className="text-sm">🏘️</span> },
  { id: "locali", label: "Locali", icon: <span className="text-sm">🍕</span> },
  { id: "utilita", label: "Utilità", icon: <span className="text-sm">🛠️</span> },
  { id: "famiglie", label: "Famiglie", icon: <span className="text-sm">🛝</span> },
  // NB: "Vino e Gusto" (199.280 cantine, caseifici, frantoi, birrifici e le
  // strade del vino) NON è una chip. Sta nel pannello ⓘ come layer, accanto
  // ai sentieri, perché non è patrimonio culturale: è un verticale a sé, si
  // accende quando serve, e non deve mescolarsi ai monumenti nella barra.
  // Le Vision approvate dei viaggiatori (pin magenta 📸). Spenta di default.
  { id: "community", label: "WIP Community", icon: <span className="text-sm">📸</span> },
  // Atlante dei beni vincolati (tabella beni_culturali, ~1,78 M nel mondo):
  // layer informativo, scheda ridotta e niente audioguida. Spenta di default,
  // e in mappa solo a zoom alto: a scala di continente sarebbe illeggibile.
  { id: "beni_culturali", label: "Beni Culturali", icon: <span className="text-sm">🏺</span> },
  // Verticali tematici (21/08/2026): otto categorie proprie in shared_pois
  // (terme, cinema, cieli, street art, mercati, fioriture, memoria, lento)
  // riunite sotto una macro-chip sola, perché in barra otto chip non ci
  // stanno. La macro apre la riga dei sotto-chip: lì ogni verticale si accende
  // da solo. Spenta di default.
  { id: "tematiche", label: "Tematici", icon: <span className="text-sm">🧭</span> },
  { id: "eventi", label: "Eventi", icon: <span className="text-sm">🎪</span> }
];

/**
 * I sotto-chip della macro 🧭. A differenza di tutte le altre macro NON sono
 * sotto-filtri (subFilter): sono categorie a pieno titolo, quindi si accendono
 * con lo stesso `onToggle` delle chip principali e finiscono in
 * selectedCategories / wip_active_subcategories. Vedi TEMATICI_KEYS in
 * lib/poiTaxonomy.ts — l'ordine è lo stesso.
 */
const TEMATICI_CHIPS: { id: string; emoji: string }[] = [
  { id: "terme", emoji: "🛁" },
  { id: "cinema", emoji: "🎬" },
  { id: "cieli", emoji: "🌌" },
  { id: "street_art", emoji: "🎨" },
  { id: "mercati", emoji: "🛍️" },
  { id: "fioriture", emoji: "🌸" },
  { id: "memoria", emoji: "🕯️" },
  { id: "lento", emoji: "🚂" },
];

const SUB_FILTER_TRANSLATIONS: Record<string, Partial<Record<Language, string>>> = {
  all_f: { IT: "Tutte", EN: "All", FR: "Toutes", ES: "Todas", RU: "Все", ZH: "全部" },
  all_m: { IT: "Tutti", EN: "All", FR: "Tous", ES: "Todos", RU: "Все", ZH: "全部" },
  all_n: { IT: "Tutta", EN: "All", FR: "Toute", ES: "Toda", RU: "Вся", ZH: "全部", DE: "Alle" },
  // locali
  ristorante: { IT: "Ristoranti", EN: "Restaurants", FR: "Restaurants", ES: "Restaurantes", RU: "Рестораны", ZH: "餐厅" },
  pizzeria: { IT: "Pizza", EN: "Pizza", FR: "Pizza", ES: "Pizza", RU: "Пицца", ZH: "比萨" },
  pesce: { IT: "Pesce", EN: "Seafood", FR: "Poisson", ES: "Pescado", RU: "Рыба/Морепродукты", ZH: "海鲜" },
  carne: { IT: "Carne", EN: "Meat", FR: "Viande", ES: "Carne", RU: "Мясо", ZH: "肉类" },
  sushi: { IT: "Sushi", EN: "Sushi", FR: "Sushi", ES: "Sushi", RU: "Суши", ZH: "寿司" },
  vegetariano: { IT: "Vegetariano", EN: "Vegetarian", FR: "Végétarien", ES: "Vegetariano", RU: "Вегетарианское", ZH: "素食" },
  glutenfree: { IT: "Gluten-Free", EN: "Gluten-Free", FR: "Sans Gluten", ES: "Sin Gluten", RU: "Без глютена", ZH: "无麸质" },
  bar: { IT: "Bar & Caffè", EN: "Bars & Cafés", FR: "Bars & Cafés", ES: "Bares y Cafés", RU: "Бары и кафе", ZH: "酒吧与咖啡" },
  gelateria: { IT: "Gelati", EN: "Gelato", FR: "Glaces", ES: "Helados", RU: "Мороженое", ZH: "冰淇淋" },
  // utilita
  disabili: { IT: "No Barriere", EN: "No Barriers", FR: "Sans barrières", ES: "Sin barreras", RU: "Без барьеров", ZH: "无障碍" },
  taxi: { IT: "Taxi", EN: "Taxi", FR: "Taxi", ES: "Taxi", RU: "Такси", ZH: "出租车" },
  stazione_ferroviaria: { IT: "Stazione FS", EN: "Train Station", FR: "Gare", ES: "Estación de Tren", RU: "Вокзал", ZH: "火车站" },
  casello_autostradale: { IT: "Autostrada", EN: "Highway", FR: "Autoroute", ES: "Autopista", RU: "Автомагистраль", ZH: "高速公路" },
  ospedale: { IT: "Ospedale", EN: "Hospital", FR: "Hôpital", ES: "Hospital", RU: "Больница", ZH: "医院" },
  farmacia: { IT: "Farmacia", EN: "Pharmacy", FR: "Pharmacie", ES: "Farmacia", RU: "Аптека", ZH: "药店" },
  fontanelle: { IT: "Fontanelle", EN: "Drinking Water", FR: "Eau Potable", ES: "Agua Potable", RU: "Питьевая вода", ZH: "饮用水" },
  metropolitana: { IT: "Metro", EN: "Metro", FR: "Métro", ES: "Metro", RU: "Метро", ZH: "地铁" },
  ev_charging: { IT: "Ricarica EV", EN: "EV Charging", FR: "Recharge VE", ES: "Carga VE", RU: "Зарядка EV", ZH: "电动车充电" },
  // famiglie
  parco_giochi: { IT: "Parco Giochi", EN: "Playground", FR: "Aire de jeux", ES: "Parque infantil", RU: "Детская площадка", ZH: "儿童游乐场" },
  parco_divertimenti: { IT: "Divertimenti", EN: "Amusement Park", FR: "Parc d'attractions", ES: "Atracciones", RU: "Парк развлечений", ZH: "游乐园" },
  acquario: { IT: "Acquario", EN: "Aquarium", FR: "Aquarium", ES: "Acuario", RU: "Аквариум", ZH: "水族馆" },
  zoo: { IT: "Zoo", EN: "Zoo", FR: "Zoo", ES: "Zoológico", RU: "Зоопарк", ZH: "动物园" },
  // esperienze_locali
  artigianato: { IT: "Artigianato", EN: "Crafts", FR: "Artisanat", ES: "Artesanía", RU: "Ремесла", ZH: "手工艺" },
  mercato: { IT: "Mercati", EN: "Markets", FR: "Marchés", ES: "Mercados", RU: "Рынки", ZH: "集市" },
  gastronomia: { IT: "Gastronomia", EN: "Gastronomy", FR: "Gastronomie", ES: "Gastronomía", RU: "Гастрономия", ZH: "美食" },
  // enogastronomia
  cantine: { IT: "Cantine", EN: "Wineries", FR: "Caves & domaines", ES: "Bodegas", DE: "Weingüter", RU: "Винодельни", ZH: "酒庄" },
  vigneti: { IT: "Vigneti", EN: "Vineyards", FR: "Vignobles", ES: "Viñedos", DE: "Weinberge", RU: "Виноградники", ZH: "葡萄园" },
  birrifici: { IT: "Birre e distillati", EN: "Beer & spirits", FR: "Bières & spiritueux", ES: "Cervezas y destilados", DE: "Bier & Spirituosen", RU: "Пиво и крепкие напитки", ZH: "啤酒与烈酒" },
  caseifici: { IT: "Caseifici", EN: "Cheese makers", FR: "Fromageries", ES: "Queserías", DE: "Käsereien", RU: "Сыроварни", ZH: "奶酪坊" },
  frantoi: { IT: "Frantoi e olio", EN: "Olive oil mills", FR: "Moulins à huile", ES: "Almazaras", DE: "Ölmühlen", RU: "Маслодавильни", ZH: "橄榄油坊" },
  botteghe_gusto: { IT: "Botteghe del gusto", EN: "Food shops", FR: "Boutiques gourmandes", ES: "Tiendas gourmet", DE: "Feinkost", RU: "Гастрономические лавки", ZH: "美食小店" },
  strade_vino: { IT: "Strade del vino", EN: "Wine routes", FR: "Routes des vins", ES: "Rutas del vino", DE: "Weinstraßen", RU: "Винные маршруты", ZH: "葡萄酒之路" },
  // shopping (28/08/2026)
  vie_shopping: { IT: "Vie dello shopping", EN: "Shopping streets", FR: "Rues commerçantes", ES: "Calles comerciales", DE: "Einkaufsstraßen", RU: "Торговые улицы", ZH: "购物街" },
  grandi_magazzini: { IT: "Grandi magazzini", EN: "Department stores", FR: "Grands magasins", ES: "Grandes almacenes", DE: "Kaufhäuser", RU: "Универмаги", ZH: "百货商店" },
  mall: { IT: "Centri commerciali", EN: "Shopping malls", FR: "Centres commerciaux", ES: "Centros comerciales", DE: "Einkaufszentren", RU: "Торговые центры", ZH: "购物中心" },
  outlet: { IT: "Outlet", EN: "Outlets", FR: "Magasins d'usine", ES: "Outlets", DE: "Outlet-Center", RU: "Аутлеты", ZH: "奥特莱斯" },
  souk: { IT: "Souk e bazaar", EN: "Souks & bazaars", FR: "Souks et bazars", ES: "Zocos y bazares", DE: "Basare", RU: "Базары", ZH: "集市与巴扎" },
  duty_free: { IT: "Duty-free", EN: "Duty-free", FR: "Hors-taxe", ES: "Libre de impuestos", DE: "Duty-Free", RU: "Дьюти-фри", ZH: "免税店" },
  // lusso (28/08/2026)
  hotel_lusso: { IT: "Hotel e resort di lusso", EN: "Luxury hotels & resorts", FR: "Hôtels et resorts de luxe", ES: "Hoteles y resorts de lujo", DE: "Luxushotels & Resorts", RU: "Роскошные отели и курорты", ZH: "豪华酒店与度假村" },
  ristoranti_stellati: { IT: "Ristoranti stellati", EN: "Starred restaurants", FR: "Restaurants étoilés", ES: "Restaurantes con estrellas", DE: "Sternerestaurants", RU: "Рестораны со звёздами", ZH: "米其林星级餐厅" },
  marine_yacht: { IT: "Marine per yacht", EN: "Yacht marinas", FR: "Marinas de yachts", ES: "Marinas de yates", DE: "Yachthäfen", RU: "Яхтенные марины", ZH: "游艇码头" },
  club_esclusivi: { IT: "Club esclusivi", EN: "Exclusive clubs", FR: "Clubs exclusifs", ES: "Clubes exclusivos", DE: "Exklusive Clubs", RU: "Эксклюзивные клубы", ZH: "尊享会所" },
  treni_storici: { IT: "Treni di lusso storici", EN: "Historic luxury trains", FR: "Trains de luxe historiques", ES: "Trenes de lujo históricos", DE: "Historische Luxuszüge", RU: "Исторические поезда люкс", ZH: "历史豪华列车" },
  sci_lusso: { IT: "Sci di lusso", EN: "Luxury ski resorts", FR: "Ski de luxe", ES: "Esquí de lujo", DE: "Luxus-Skiorte", RU: "Люкс-горнолыжные курорты", ZH: "豪华滑雪度假区" },
  noleggio_lusso: { IT: "Noleggio yacht e jet", EN: "Yacht & jet charter", FR: "Location de yachts et jets", ES: "Alquiler de yates y jets", DE: "Yacht- & Jetcharter", RU: "Аренда яхт и самолётов", ZH: "游艇与私人飞机租赁" },
  // gemme / monumenti sub-types
  monumenti_sub: { IT: "Monumenti", EN: "Monuments", FR: "Monuments", ES: "Monumentos", RU: "Памятники", ZH: "纪念碑" },
  chiese: { IT: "Chiese", EN: "Churches", FR: "Églises", ES: "Iglesias", RU: "Церкви", ZH: "教堂" },
  musei: { IT: "Musei", EN: "Museums", FR: "Musées", ES: "Museos", RU: "Музеи", ZH: "博物馆" },
  panorami: { IT: "Panorami", EN: "Views", FR: "Panoramas", ES: "Panoramas", RU: "Панорамы", ZH: "全景" },
  spiagge: { IT: "Spiagge e isole", EN: "Beaches & islands", FR: "Plages et îles", ES: "Playas e islas", DE: "Strände & Inseln", RU: "Пляжи и острова", ZH: "海滩与岛屿" },
  vette: { IT: "Vette e ghiacciai", EN: "Peaks & glaciers", FR: "Sommets et glaciers", ES: "Cumbres y glaciares", DE: "Gipfel & Gletscher", RU: "Вершины и ледники", ZH: "山峰与冰川" },
  acque: { IT: "Cascate e laghi", EN: "Waterfalls & lakes", FR: "Cascades et lacs", ES: "Cascadas y lagos", DE: "Wasserfälle & Seen", RU: "Водопады и озёра", ZH: "瀑布与湖泊" },
  grotte: { IT: "Grotte", EN: "Caves", FR: "Grottes", ES: "Cuevas", DE: "Höhlen", RU: "Пещеры", ZH: "洞穴" },
  parchi: { IT: "Parchi e riserve", EN: "Parks & reserves", FR: "Parcs et réserves", ES: "Parques y reservas", DE: "Parks & Reservate", RU: "Парки и заповедники", ZH: "公园与保护区" },
  castelli: { IT: "Castelli", EN: "Castles", FR: "Châteaux", ES: "Castillos", RU: "Замки", ZH: "城堡" },
  archeo: { IT: "Archeo", EN: "Archaeology", FR: "Archéologie", ES: "Arqueología", RU: "Археология", ZH: "考古" },
  attrazioni: { IT: "Attrazioni", EN: "Attractions", FR: "Attractions", ES: "Atracciones", RU: "Достопримечательности", ZH: "景点" },
  // tematiche (21/08/2026) — le stesse etichette stanno anche in i18n.ts con
  // la chiave nuda (terme, cinema…): qui servono al sotto-chip, lì alla scheda
  // e a GeoControl.
  terme: { IT: "Terme e sorgenti", EN: "Hot springs & spas", FR: "Thermes et sources", ES: "Termas y manantiales", DE: "Thermen & Quellen", RU: "Термы и источники", ZH: "温泉与浴场" },
  cinema: { IT: "Location di film e serie", EN: "Film & series locations", FR: "Lieux de tournage", ES: "Localizaciones de cine y series", DE: "Film- & Seriendrehorte", RU: "Локации фильмов и сериалов", ZH: "影视取景地" },
  cieli: { IT: "Cieli bui e stelle", EN: "Dark skies & stargazing", FR: "Ciels étoilés", ES: "Cielos oscuros y estrellas", DE: "Dunkler Himmel & Sterne", RU: "Тёмное небо и звёзды", ZH: "暗夜星空" },
  street_art: { IT: "Street art", EN: "Street art", FR: "Street art", ES: "Arte urbano", DE: "Street Art", RU: "Стрит-арт", ZH: "街头艺术" },
  mercati: { IT: "Mercati e mercatini", EN: "Markets & fairs", FR: "Marchés et brocantes", ES: "Mercados y mercadillos", DE: "Märkte & Trödelmärkte", RU: "Рынки и ярмарки", ZH: "市集与市场" },
  fioriture: { IT: "Fioriture", EN: "Blossoms & blooms", FR: "Floraisons", ES: "Floraciones", DE: "Blütezeiten", RU: "Цветение", ZH: "花期" },
  memoria: { IT: "Memoria e case-museo", EN: "Memory & house museums", FR: "Mémoire et maisons-musées", ES: "Memoria y casas museo", DE: "Erinnerung & Hausmuseen", RU: "Память и дома-музеи", ZH: "纪念地与故居博物馆" },
  lento: { IT: "Viaggio lento", EN: "Slow travel", FR: "Voyage lent", ES: "Viaje lento", DE: "Langsames Reisen", RU: "Медленные путешествия", ZH: "慢旅行" }
};

// Helper per costruire una sub-chip con underline se selezionata
function SubChip({
  f,
  isSelected,
  label,
  onSelect,
}: {
  f: { id: string | null; emoji: string };
  isSelected: boolean;
  label: string;
  onSelect: () => void;
  key?: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black transition-all border relative pb-2 ${
        isSelected
          ? "bg-primary border-secondary text-secondary shadow-md active:scale-95"
          : "bg-[#fcfaf8]/90 backdrop-blur-sm border-outline-variant text-primary hover:bg-[#fcfaf8] active:scale-95"
      }`}
    >
      <span className="mr-1">{f.emoji}</span>
      {label}
      {isSelected && (
        <span className="absolute bottom-0.5 left-3 right-3 h-0.5 bg-secondary rounded-full" />
      )}
    </button>
  );
}

interface CategoryChipsProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onEventClick?: () => void;
  subFilter?: string[];
  onSetSubFilter?: (filter: string | null) => void;
  language: Language;
}

export default function CategoryChips({
  selectedIds,
  onToggle,
  onEventClick,
  subFilter,
  onSetSubFilter,
  language,
}: CategoryChipsProps) {
  const isSubSelected = (id: string | null) =>
    id === null ? (subFilter?.length === 0 || !subFilter) : !!subFilter?.includes(id);

  // ── Quali categorie "extra" l'utente ha portato in barra ────────────
  // La scelta È il suo default: si ricorda fra una sessione e l'altra,
  // come già fa selectedCategories in wip_active_subcategories. Chiave a
  // parte perché sono due cose diverse — questa dice "voglio vederla nella
  // barra", quella dice "è accesa adesso".
  const [inBarra, setInBarra] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('wip_chip_extra') || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('wip_chip_extra', JSON.stringify(inBarra)); } catch { /* storage pieno */ }
  }, [inBarra]);

  // MIGRAZIONE dai nove chip fissi di prima. Chi aveva "Locali" acceso si
  // ritroverebbe la categoria attiva e NESSUNA chip per spegnerla, perché
  // ora Locali sta nel pannello: i pin resterebbero sulla mappa senza un
  // modo ovvio di toglierli. Al primo avvio dopo l'aggiornamento le extra
  // già accese entrano in barra da sole; la volta dopo la chiave esiste e
  // questo blocco non fa più niente.
  useEffect(() => {
    if (localStorage.getItem('wip_chip_extra') !== null) return;
    const accese = CATEGORIES
      .map((c) => c.id)
      .filter((id) => !FISSE.includes(id as typeof FISSE[number]))
      .filter((id) => id === 'tematiche'
        ? selectedIds.includes('tematiche') || TEMATICI_CHIPS.some((t) => selectedIds.includes(t.id))
        : selectedIds.includes(id));
    if (accese.length) setInBarra(accese);
    else { try { localStorage.setItem('wip_chip_extra', '[]'); } catch { /* niente */ } }
    // Solo al montaggio: dopo, la barra la governa l'utente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pannelloAperto, setPannelloAperto] = useState(false);
  const [infoAperta, setInfoAperta] = useState<string | null>(null);
  // "Esperienze" NON è una categoria di POI: vive solo qui. Se finisse in
  // selectedCategories arriverebbe in wip_active_subcategories, e il
  // servizio nativo proverebbe a filtrare i POI per una categoria che nel
  // database non esiste — spegnendo il radar invece di aggiungerci qualcosa.
  const [esperienzeAperte, setEsperienzeAperte] = useState(false);

  const catById = (id: string) => CATEGORIES.find((c) => c.id === id);
  const temAccesi = TEMATICI_CHIPS.filter((t) => selectedIds.includes(t.id));
  const isAcceso = (id: string) => id === 'tematiche'
    ? selectedIds.includes('tematiche') || temAccesi.length > 0
    : selectedIds.includes(id);

  /** Accende o spegne una categoria. 'tematiche' fa da interruttore
   *  generale sui suoi otto verticali, che sono categorie vere. */
  const accendiSpegni = (id: string) => {
    if (id !== 'tematiche') { onToggle(id); return; }
    if (isAcceso('tematiche')) {
      if (selectedIds.includes('tematiche')) onToggle('tematiche');
      temAccesi.forEach((t) => onToggle(t.id));
    } else {
      onToggle('tematiche');
      TEMATICI_CHIPS.forEach((t) => { if (!selectedIds.includes(t.id)) onToggle(t.id); });
    }
  };

  /** Dal pannello: portarla in barra la accende, toglierla la spegne. */
  const cambiaDalPannello = (id: string) => {
    const giaInBarra = inBarra.includes(id);
    setInBarra((prev) => giaInBarra ? prev.filter((x) => x !== id) : [...prev, id]);
    // Togliendola dalla barra la si spegne, mettendocela la si accende:
    // altrimenti resterebbe accesa senza una chip per spegnerla.
    if (giaInBarra ? isAcceso(id) : !isAcceso(id)) accendiSpegni(id);
  };

  const EXTRA = CATEGORIES.filter((c) => !FISSE.includes(c.id as typeof FISSE[number])).map((c) => c.id);
  const inBarraValide = inBarra.filter((id) => EXTRA.includes(id));

  // Interruttore "Tematici" spento ⇒ gli otto verticali spenti. Senza
  // questo restavano accesi in selectedCategories (da una sessione
  // precedente, o da GeoControl che salva solo le otto chiavi) e filtravano
  // la mappa senza una chip a vista per spegnerli — lo stesso motivo per cui
  // cambiaDalPannello spegne quando toglie dalla barra. Si salta finché la
  // migrazione al primo avvio non ha scritto la chiave: quella, al
  // contrario, li PORTA in barra invece di spegnerli.
  useEffect(() => {
    if (localStorage.getItem('wip_chip_extra') === null) return;
    if (inBarraValide.includes('tematiche')) return;
    if (selectedIds.includes('tematiche')) onToggle('tematiche');
    TEMATICI_CHIPS.forEach((t) => { if (selectedIds.includes(t.id)) onToggle(t.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBarraValide.includes('tematiche'), selectedIds]);

  return (
    <div className="absolute top-[calc(env(safe-area-inset-top)+0.25rem)] md:top-2 left-0 right-0 z-[2000] pointer-events-none flex flex-col gap-2">
      {/* ── Riga principale: le cinque fisse + quelle portate in barra ── */}
      <div className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
        {[...FISSE, ...inBarraValide].map((id) => {
          const cat = catById(id);
          // "esperienze" non è in CATEGORIES: è una chip che apre i partner,
          // non una categoria di POI.
          if (id === "esperienze") {
            return (
              <button
                key="esperienze"
                onClick={() => setEsperienzeAperte((v) => !v)}
                className={`flex-shrink-0 px-3 py-2 min-h-10 rounded-full font-bold text-[13px] transition-all flex items-center gap-1.5 border shadow-sm
                  ${esperienzeAperte
                    ? "bg-primary text-secondary border-secondary shadow-md scale-105"
                    : "bg-[#fcfaf8]/90 backdrop-blur-sm text-primary border-outline-variant hover:bg-[#fcfaf8]"}`}
              >
                <Ticket className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">{getTranslation('vr_b_cc_experiences', language)}</span>
              </button>
            );
          }
          if (!cat) return null;
          if (cat.id === "eventi") {
            return (
              <button
                key={cat.id}
                onClick={() => onEventClick?.()}
                className="flex-shrink-0 px-3 py-2 min-h-10 rounded-full font-bold text-[13px] transition-all flex items-center gap-1.5 border shadow-sm bg-gradient-to-r from-primary to-black text-secondary border-secondary shadow-secondary/30 hover:scale-105 hover:shadow-lg hover:shadow-secondary/40 active:scale-95"
              >
                <div className="w-4 h-4 flex items-center justify-center shrink-0 relative">
                  {cat.icon}
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full animate-ping opacity-75" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                </div>
                <span className="whitespace-nowrap">{getTranslation(cat.id, language)}</span>
              </button>
            );
          }

          // Macro 🧭 Tematici: risulta accesa anche quando lo è uno solo dei
          // suoi otto verticali — che sono categorie vere e vivono in
          // selectedCategories, non in subFilter. Il tap fa da interruttore
          // generale: accende tutti e otto (la chip da sola deve mostrare
          // qualcosa) o li spegne tutti.
          const isActive = isAcceso(cat.id);
          // Chip WIP Community: colore proprio (magenta come i suoi pin), il
          // nome è un marchio e non si traduce.
          const isCommunity = cat.id === "community";
          const handleChipClick = () => accendiSpegni(cat.id);
          return (
            <button
              key={cat.id}
              onClick={handleChipClick}
              className={`flex-shrink-0 px-3 py-2 min-h-10 rounded-full font-bold text-[13px] transition-all flex items-center gap-1.5 border shadow-sm
                ${
                  isActive
                    ? (isCommunity ? "bg-[#ec4899] text-white border-pink-300 shadow-md scale-105" : "bg-primary text-secondary border-secondary shadow-md scale-105")
                    : "bg-[#fcfaf8]/90 backdrop-blur-sm text-primary border-outline-variant hover:bg-[#fcfaf8]"
                }
              `}
            >
              <div className={`w-4 h-4 flex items-center justify-center shrink-0 ${isActive && !isCommunity ? 'brightness-0 invert' : ''}`}>
                {cat.icon}
              </div>
              <span className="whitespace-nowrap">{isCommunity ? 'WIP Community' : getTranslation(cat.id, language)}</span>
            </button>
          );
        })}

        {/* ── ＋ : il pannello che aggiunge categorie alla barra ── */}
        <button
          onClick={() => setPannelloAperto((v) => !v)}
          aria-expanded={pannelloAperto}
          className={`flex-shrink-0 px-3 py-2 min-h-10 rounded-full font-bold text-[13px] transition-all flex items-center gap-1.5 border shadow-sm
            ${pannelloAperto
              ? "bg-primary text-secondary border-secondary shadow-md scale-105"
              : "bg-[#fcfaf8]/90 backdrop-blur-sm text-primary border-outline-variant hover:bg-[#fcfaf8]"}`}
        >
          <span className="text-sm leading-none">{pannelloAperto ? '×' : '＋'}</span>
          <span className="whitespace-nowrap">{getTranslation('vr_b_cc_more', language)}</span>
        </button>
      </div>

      {/* ── Sotto-chip di ESPERIENZE: i tre partner ──────────────────────
          Erano tre chip separate sempre in barra. Sono la stessa cosa —
          un'esperienza da prenotare — e occupavano tre posti su dodici.
          Il CustomEvent è quello di prima: lo gestisce MapArea, che conosce
          il centro mappa e ci mette la città. */}
      <AnimatePresence>
        {esperienzeAperte && (
          <motion.div key="esperienze-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'viator' } }))}
              className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#FF5100] text-white border-orange-300 hover:scale-105 active:scale-95"
            >
              <Ticket className="w-3.5 h-3.5" /><span className="whitespace-nowrap">Viator</span>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'gyg' } }))}
              className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#0071eb] text-white border-blue-300 hover:scale-105 active:scale-95"
            >
              <span className="text-sm">🌍</span><span className="whitespace-nowrap">GetYourGuide</span>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'tiqets' } }))}
              className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#7c3aed] text-white border-violet-300 hover:scale-105 active:scale-95"
            >
              <Ticket className="w-3.5 h-3.5" /><span className="whitespace-nowrap">Tiqets</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Il pannello ＋ ───────────────────────────────────────────────
          Ogni riga ha una ⓘ che dice COSA C'È DENTRO: "Utilità" non
          significa niente finché non sai che ci sono le farmacie e le
          fontanelle, ed è il motivo per cui nessuno la accendeva. */}
      <AnimatePresence>
        {pannelloAperto && (
          <motion.div key="pannello" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="px-3 pointer-events-auto overflow-hidden">
            <div className="rounded-2xl border border-outline-variant bg-[#fcfaf8]/95 backdrop-blur-md shadow-lg p-2 max-w-md">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary/50">
                {getTranslation('vr_b_cc_add_to_bar', language)}
              </p>
              {EXTRA.map((id) => {
                const cat = catById(id);
                if (!cat) return null;
                const attiva = inBarra.includes(id);
                const apertaInfo = infoAperta === id;
                return (
                  <div key={id} className="border-b border-outline-variant/40 last:border-b-0">
                    <div className="flex items-center gap-2 px-2 py-2">
                      <span className="w-5 flex items-center justify-center shrink-0">{cat.icon}</span>
                      <span className="flex-1 text-[13px] font-bold text-primary">
                        {id === 'community' ? 'WIP Community' : getTranslation(id, language)}
                      </span>
                      <button
                        onClick={() => setInfoAperta(apertaInfo ? null : id)}
                        aria-label={getTranslation('vr_b_cc_contains', language).replace('{name}', getTranslation(id, language))}
                        aria-expanded={apertaInfo}
                        className={`w-5 h-5 rounded-full border text-[10px] font-black shrink-0 transition-colors
                          ${apertaInfo ? 'bg-primary text-secondary border-primary' : 'border-outline-variant text-primary/60 hover:text-primary'}`}
                      >i</button>
                      <button
                        onClick={() => cambiaDalPannello(id)}
                        role="switch"
                        aria-checked={attiva}
                        aria-label={`${attiva ? getTranslation('vr_b_cc_remove', language) : getTranslation('vr_b_cc_add', language)} ${getTranslation(id, language)}`}
                        className={`w-10 h-6 rounded-full border shrink-0 relative transition-colors
                          ${attiva ? 'bg-primary border-primary' : 'bg-black/5 border-outline-variant'}`}
                      >
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all
                          ${attiva ? 'left-[19px]' : 'left-[3px]'}`} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {apertaInfo && (
                        <motion.p key="info" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="px-2 pb-2 text-[11px] leading-snug text-primary/70 overflow-hidden">
                          {COSA_CONTIENE[id]}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {/* Chiusura anche IN FONDO (22/08/2026): il pannello e` lungo e
                  la × della chip «Altro» resta in cima, fuori dal pollice. */}
              <button
                onClick={() => setPannelloAperto(false)}
                aria-label={getTranslation('vr_b_cc_close_panel', language)}
                className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold text-primary/70 hover:text-primary hover:bg-black/5 transition-colors"
              >
                <span className="text-base leading-none">×</span>
                {getTranslation('close', language)}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sub-filter rows: visibili per TUTTE le categorie attive ── */}
      <AnimatePresence>
        {/* GEMME */}
        {selectedIds.includes("gemme") && (
          <motion.div key="gemme-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "💎" },
              { id: "monumenti_sub", emoji: "🏛️" },
              { id: "chiese", emoji: "⛪" },
              { id: "musei", emoji: "🖼️" },
              { id: "panorami", emoji: "🌅" },
              // Gemme e Monumenti hanno SOLO le quattro famiglie con
              // l'audioguida (decisione utente 22/08/2026): spiagge, vette,
              // acque, grotte e parchi vivono nella macro Natura, qui sotto.
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_f[language] : (f.id === "monumenti_sub" ? SUB_FILTER_TRANSLATIONS.monumenti_sub?.[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language]) || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* MONUMENTI */}
        {selectedIds.includes("monumenti") && (
          <motion.div key="monumenti-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "🏛️" },
              { id: "monumenti_sub", emoji: "🏛️" },
              { id: "chiese", emoji: "⛪" },
              { id: "musei", emoji: "🖼️" },
              { id: "panorami", emoji: "🌅" },
              // Spiagge, vette, acque, grotte e parchi NON stanno piu' qui:
              // dal 22/08/2026 sono la macro Natura (riga sotto).
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_m[language] : (f.id === "monumenti_sub" ? SUB_FILTER_TRANSLATIONS.monumenti_sub?.[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language]) || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* NATURA — le cinque famiglie, ognuna col suo sotto-chip */}
        {selectedIds.includes("natura") && (
          <motion.div key="natura-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "🌿" },
              { id: "spiagge", emoji: "🏖️" },
              { id: "vette", emoji: "⛰️" },
              { id: "acque", emoji: "💧" },
              { id: "grotte", emoji: "🕳️" },
              { id: "parchi", emoji: "🌳" },
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_n[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language] || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* LOCALI */}
        {selectedIds.includes("locali") && (
          <motion.div key="locali-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "🍽️" },
              { id: "ristorante", emoji: "🍴" },
              { id: "pizzeria", emoji: "🍕" },
              { id: "pesce", emoji: "🐟" },
              { id: "carne", emoji: "🥩" },
              { id: "sushi", emoji: "🍣" },
              { id: "vegetariano", emoji: "🥬" },
              { id: "glutenfree", emoji: "🌾" },
              { id: "bar", emoji: "☕" },
              { id: "gelateria", emoji: "🍦" },
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_m[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language] || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* UTILITA */}
        {selectedIds.includes("utilita") && (
          <motion.div key="utilita-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "🛠️" },
              { id: "farmacia", emoji: "💊" },
              { id: "ospedale", emoji: "🏥" },
              { id: "mercato", emoji: "🎪" },
              { id: "fontanelle", emoji: "🚰" },
              { id: "stazione_ferroviaria", emoji: "🚂" },
              { id: "metropolitana", emoji: "🚇" },
              { id: "taxi", emoji: "🚕" },
              { id: "casello_autostradale", emoji: "🛣️" },
              { id: "ev_charging", emoji: "🔌" },
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_f[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language] || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* FAMIGLIE */}
        {selectedIds.includes("famiglie") && (
          <motion.div key="famiglie-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            {[
              { id: null, emoji: "👨‍👩‍👧‍👦" },
              { id: "parco_giochi", emoji: "🛝" },
              { id: "parco_divertimenti", emoji: "🎢" },
              { id: "acquario", emoji: "🐠" },
              { id: "zoo", emoji: "🦓" },
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_f[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language] || f.id}
                onSelect={() => onSetSubFilter?.(f.id)} />
            ))}
          </motion.div>
        )}

        {/* TEMATICI — unica riga di sotto-chip che NON scrive in subFilter: le
            otto voci sono categorie vere (shared_pois.category), quindi si
            accendono con onToggle come le chip principali. La riga compare
            SOLO se l'interruttore "Tematici" del pannello ＋ è acceso (la
            chip è in barra): prima bastava che un verticale fosse attivo —
            anche rimasto acceso da una sessione precedente o da GeoControl —
            e la riga da Terme a Viaggio lento restava a vista con
            l'interruttore spento (22/08/2026). Lo stato incoerente
            (verticali accesi, interruttore spento) lo sana l'effetto qui
            sopra spegnendoli. */}
        {inBarraValide.includes("tematiche") && isAcceso("tematiche") && (
          <motion.div key="tematiche-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
            <SubChip key="all" f={{ id: null, emoji: "🧭" }}
              isSelected={TEMATICI_CHIPS.every((t) => selectedIds.includes(t.id))}
              label={SUB_FILTER_TRANSLATIONS.all_m[language] || "Tutti"}
              onSelect={() => TEMATICI_CHIPS.forEach((t) => { if (!selectedIds.includes(t.id)) onToggle(t.id); })} />
            {TEMATICI_CHIPS.map((f) => (
              <SubChip key={f.id} f={f} isSelected={selectedIds.includes(f.id)}
                label={SUB_FILTER_TRANSLATIONS[f.id]?.[language] || getTranslation(f.id, language)}
                onSelect={() => onToggle(f.id)} />
            ))}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
