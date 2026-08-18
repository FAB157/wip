import {
  Landmark,
  Library,
  Image as ImageIcon,
  Gem,
  GlassWater,
  ParkingCircle,
  Ticket,
} from "lucide-react";
import { ReactNode } from "react";
import { CATEGORY_COLORS } from "../lib/mapConstants";
import { motion, AnimatePresence } from "motion/react";
import { Language, getTranslation } from "../lib/i18n";

export interface Category {
  id: string;
  label: string;
  icon: ReactNode;
}

export const CATEGORIES: Category[] = [
  { id: "gemme", label: "Gemme", icon: <span className="text-sm">💎</span> },
  { id: "monumenti", label: "Monumenti", icon: <span className="text-sm">🏛️</span> },
  { id: "locali", label: "Locali", icon: <span className="text-sm">🍕</span> },
  { id: "utilita", label: "Utilità", icon: <span className="text-sm">🛠️</span> },
  { id: "famiglie", label: "Famiglie", icon: <span className="text-sm">🛝</span> },
  // Le Vision approvate dei viaggiatori (pin magenta 📸). Spenta di default.
  { id: "community", label: "WIP Community", icon: <span className="text-sm">📸</span> },
  // Atlante dei beni vincolati (tabella beni_culturali, ~1,78 M nel mondo):
  // layer informativo, scheda ridotta e niente audioguida. Spenta di default,
  // e in mappa solo a zoom alto: a scala di continente sarebbe illeggibile.
  { id: "beni_culturali", label: "Beni Culturali", icon: <span className="text-sm">🏺</span> },
  { id: "eventi", label: "Eventi", icon: <span className="text-sm">🎪</span> }
];

const SUB_FILTER_TRANSLATIONS: Record<string, Partial<Record<Language, string>>> = {
  all_f: { IT: "Tutte", EN: "All", FR: "Toutes", ES: "Todas", RU: "Все", ZH: "全部" },
  all_m: { IT: "Tutti", EN: "All", FR: "Tous", ES: "Todos", RU: "Все", ZH: "全部" },
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
  // famiglie
  parco_giochi: { IT: "Parco Giochi", EN: "Playground", FR: "Aire de jeux", ES: "Parque infantil", RU: "Детская площадка", ZH: "儿童游乐场" },
  parco_divertimenti: { IT: "Divertimenti", EN: "Amusement Park", FR: "Parc d'attractions", ES: "Atracciones", RU: "Парк развлечений", ZH: "游乐园" },
  acquario: { IT: "Acquario", EN: "Aquarium", FR: "Aquarium", ES: "Acuario", RU: "Аквариум", ZH: "水族馆" },
  zoo: { IT: "Zoo", EN: "Zoo", FR: "Zoo", ES: "Zoológico", RU: "Зоопарк", ZH: "动物园" },
  // esperienze_locali
  artigianato: { IT: "Artigianato", EN: "Crafts", FR: "Artisanat", ES: "Artesanía", RU: "Ремесла", ZH: "手工艺" },
  mercato: { IT: "Mercati", EN: "Markets", FR: "Marchés", ES: "Mercados", RU: "Рынки", ZH: "集市" },
  gastronomia: { IT: "Gastronomia", EN: "Gastronomy", FR: "Gastronomie", ES: "Gastronomía", RU: "Гастрономия", ZH: "美食" },
  // gemme / monumenti sub-types
  monumenti_sub: { IT: "Monumenti", EN: "Monuments", FR: "Monuments", ES: "Monumentos", RU: "Памятники", ZH: "纪念碑" },
  chiese: { IT: "Chiese", EN: "Churches", FR: "Églises", ES: "Iglesias", RU: "Церкви", ZH: "教堂" },
  musei: { IT: "Musei", EN: "Museums", FR: "Musées", ES: "Museos", RU: "Музеи", ZH: "博物馆" },
  panorami: { IT: "Panorami", EN: "Views", FR: "Panoramas", ES: "Panoramas", RU: "Панорамы", ZH: "全景" },
  castelli: { IT: "Castelli", EN: "Castles", FR: "Châteaux", ES: "Castillos", RU: "Замки", ZH: "城堡" },
  archeo: { IT: "Archeo", EN: "Archaeology", FR: "Archéologie", ES: "Arqueología", RU: "Археология", ZH: "考古" },
  attrazioni: { IT: "Attrazioni", EN: "Attractions", FR: "Attractions", ES: "Atracciones", RU: "Достопримечательности", ZH: "景点" }
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

  return (
    <div className="absolute top-[calc(env(safe-area-inset-top)+0.25rem)] md:top-2 left-0 right-0 z-[2000] pointer-events-none flex flex-col gap-2">
      {/* ── Riga principale categorie ── */}
      <div className="flex flex-row gap-1.5 px-3 overflow-x-auto no-scrollbar pointer-events-auto pb-1">
        {CATEGORIES.map((cat) => {
          if (cat.id === "eventi") {
            return (
              <button
                key={cat.id}
                onClick={() => onEventClick?.()}
                className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] md:text-[13px] transition-all flex items-center gap-1.5 border shadow-sm bg-gradient-to-r from-primary to-black text-secondary border-secondary shadow-secondary/30 hover:scale-105 hover:shadow-lg hover:shadow-secondary/40 active:scale-95"
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

          const isActive = selectedIds.includes(cat.id);
          // Chip WIP Community: colore proprio (magenta come i suoi pin), il
          // nome è un marchio e non si traduce.
          const isCommunity = cat.id === "community";
          return (
            <button
              key={cat.id}
              onClick={() => onToggle(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] md:text-[13px] transition-all flex items-center gap-1.5 border shadow-sm
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

        {/* ── Chip partner esperienze: aprono la ricerca Viator/GetYourGuide
            con la città corrente già compilata e il codice affiliato.
            Il CustomEvent è gestito da MapArea, che conosce il centro mappa. ── */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'viator' } }))}
          className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] md:text-[13px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#FF5100] text-white border-orange-300 hover:scale-105 active:scale-95"
        >
          <Ticket className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Viator</span>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'gyg' } }))}
          className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] md:text-[13px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#0071eb] text-white border-blue-300 hover:scale-105 active:scale-95"
        >
          <span className="text-sm">🌍</span>
          <span className="whitespace-nowrap">GetYourGuide</span>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('wip-open-experiences', { detail: { partner: 'tiqets' } }))}
          className="flex-shrink-0 px-3 py-1.5 rounded-full font-bold text-[11px] md:text-[13px] transition-all flex items-center gap-1.5 border shadow-sm bg-[#7c3aed] text-white border-violet-300 hover:scale-105 active:scale-95"
        >
          <Ticket className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Tiqets</span>
        </button>
      </div>

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
            ].map((f) => (
              <SubChip key={f.id ?? "all"} f={f} isSelected={isSubSelected(f.id)}
                label={f.id === null ? SUB_FILTER_TRANSLATIONS.all_m[language] : (f.id === "monumenti_sub" ? SUB_FILTER_TRANSLATIONS.monumenti_sub?.[language] : SUB_FILTER_TRANSLATIONS[f.id]?.[language]) || f.id}
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

      </AnimatePresence>
    </div>
  );
}
