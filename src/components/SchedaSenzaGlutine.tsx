import React, { useEffect, useState } from "react";
import { Language } from "../lib/i18n";
import { apriScheda } from "../lib/apriScheda";
import { supabase } from "../lib/supabase";

/**
 * IL LIVELLO «SENZA GLUTINE» SUL PIN E NEL FUMETTO DEL LOCALE (03/10/2026).
 *
 * I dati sono nella tabellina locali_gf (scripts/importa-senza-glutine.mjs),
 * portati sul pin dalla RPC locali_pois_vicini: `gf_livello` (dedicato | menu
 * | opzioni), `gf_tipo` (pizzeria | gelateria | forno | ristorante | bar |
 * negozio), `gf_url` (la scheda sulla fonte).
 * Grafica «A» scelta dal committente: pin verde, TIPO di locale al centro,
 * spiga a sinistra, livello a destra («100%», «Menu», «Opz.»).
 * Come per la Guida (SchedaMichelin.tsx), della fonte restano il livello e il
 * link: via, telefono e sito sono i nostri; niente voti ne' recensioni.
 * Il fumetto dice sempre di verificare sul posto: per un celiaco un «menu
 * senza glutine» non e' una cucina dedicata, e noi non l'abbiamo controllata.
 */

export const VERDE_GF = "#166534";

type Testi = Record<string, Partial<Record<Language, string>> & { IT: string; EN: string }>;
const T: Testi = {
  occhiello: { IT: "Senza glutine", EN: "Gluten-free", FR: "Sans gluten", ES: "Sin gluten", DE: "Glutenfrei", RU: "Без глютена", ZH: "无麸质" },
  dedicato: { IT: "100% senza glutine", EN: "100% gluten-free", FR: "100 % sans gluten", ES: "100 % sin gluten", DE: "100 % glutenfrei", RU: "100% без глютена", ZH: "100%无麸质" },
  menu: { IT: "Menu senza glutine", EN: "Gluten-free menu", FR: "Carte sans gluten", ES: "Carta sin gluten", DE: "Glutenfreie Karte", RU: "Безглютеновое меню", ZH: "有无麸质菜单" },
  opzioni: { IT: "Opzioni senza glutine", EN: "Gluten-free options", FR: "Options sans gluten", ES: "Opciones sin gluten", DE: "Glutenfreie Optionen", RU: "Есть безглютеновые блюда", ZH: "有无麸质选择" },
  avvisoDedicato: {
    IT: "Locale segnalato come interamente senza glutine. Verifica sempre sul posto.",
    EN: "Reported as entirely gluten-free. Always check on site.",
    FR: "Signalé comme entièrement sans gluten. Vérifiez toujours sur place.",
    ES: "Señalado como totalmente sin gluten. Compruébalo siempre en el local.",
    DE: "Als vollständig glutenfrei gemeldet. Bitte immer vor Ort prüfen.",
    RU: "Отмечено как полностью безглютеновое заведение. Всегда уточняйте на месте.",
    ZH: "据报为全无麸质店铺。请务必到店确认。",
  },
  avvisoMenu: {
    IT: "Il locale ha un menu senza glutine, ma non è dedicato. Verifica sempre sul posto.",
    EN: "This place has a gluten-free menu but is not a dedicated kitchen. Always check on site.",
    FR: "L'établissement a une carte sans gluten mais n'est pas dédié. Vérifiez toujours sur place.",
    ES: "El local tiene carta sin gluten, pero no es exclusivo. Compruébalo siempre en el local.",
    DE: "Das Lokal hat eine glutenfreie Karte, ist aber nicht ausschließlich glutenfrei. Bitte immer vor Ort prüfen.",
    RU: "В заведении есть безглютеновое меню, но кухня не отдельная. Всегда уточняйте на месте.",
    ZH: "该店有无麸质菜单，但并非专门厨房。请务必到店确认。",
  },
  avvisoOpzioni: {
    IT: "Segnalato dagli utenti, senza menu dedicato. Chiedi al locale prima di ordinare.",
    EN: "Reported by users, no dedicated menu. Ask the staff before ordering.",
    FR: "Signalé par des utilisateurs, sans carte dédiée. Demandez avant de commander.",
    ES: "Señalado por usuarios, sin carta específica. Pregunta antes de pedir.",
    DE: "Von Nutzern gemeldet, ohne eigene Karte. Bitte vor der Bestellung nachfragen.",
    RU: "Отмечено пользователями, отдельного меню нет. Уточняйте перед заказом.",
    ZH: "由用户报告，无专门菜单。点餐前请先询问店家。",
  },
  piatti: { IT: "Senza glutine qui", EN: "Gluten-free here", FR: "Sans gluten ici", ES: "Sin gluten aquí", DE: "Glutenfrei hier", RU: "Без глютена здесь", ZH: "无麸质菜品" },
  recensione: { IT: "recensione", EN: "review", FR: "avis", ES: "reseña", DE: "Bewertung", RU: "отзыв", ZH: "条评价" },
  recensioni: { IT: "recensioni", EN: "reviews", FR: "avis", ES: "reseñas", DE: "Bewertungen", RU: "отзывов", ZH: "条评价" },
  chiama: { IT: "Chiama", EN: "Call", FR: "Appeler", ES: "Llamar", DE: "Anrufen", RU: "Позвонить", ZH: "致电" },
  sito: { IT: "Sito", EN: "Website", FR: "Site", ES: "Web", DE: "Website", RU: "Сайт", ZH: "网站" },
  scheda: { IT: "Vedi la scheda", EN: "See listing", FR: "Voir la fiche", ES: "Ver ficha", DE: "Eintrag ansehen", RU: "Открыть карточку", ZH: "查看详情" },
  pizzeria: { IT: "Pizzeria", EN: "Pizzeria", FR: "Pizzeria", ES: "Pizzería", DE: "Pizzeria", RU: "Пиццерия", ZH: "比萨店" },
  gelateria: { IT: "Gelateria", EN: "Gelato shop", FR: "Glacier", ES: "Heladería", DE: "Eisdiele", RU: "Мороженое", ZH: "冰淇淋店" },
  forno: { IT: "Forno · Pasticceria", EN: "Bakery · Pastry shop", FR: "Boulangerie · Pâtisserie", ES: "Panadería · Pastelería", DE: "Bäckerei · Konditorei", RU: "Пекарня · Кондитерская", ZH: "面包店 · 糕点店" },
  ristorante: { IT: "Ristorante", EN: "Restaurant", FR: "Restaurant", ES: "Restaurante", DE: "Restaurant", RU: "Ресторан", ZH: "餐厅" },
  bar: { IT: "Bar · Caffè", EN: "Bar · Café", FR: "Bar · Café", ES: "Bar · Café", DE: "Bar · Café", RU: "Бар · Кафе", ZH: "酒吧 · 咖啡" },
  negozio: { IT: "Negozio di alimentari", EN: "Grocery shop", FR: "Épicerie", ES: "Tienda de alimentación", DE: "Lebensmittelgeschäft", RU: "Продуктовый магазин", ZH: "食品店" },
};
const t = (k: keyof typeof T, l: Language) => (T[k] as any)[l] || T[k].EN;
export const tSenzaGlutine = t;

const LIVELLI = ["dedicato", "menu", "opzioni"];
/** Il livello, o '' se il locale non e' nella tabella locali_gf. */
export function livelloGf(poi: any): string {
  const l = String(poi?.gf_livello || "");
  return LIVELLI.includes(l) ? l : "";
}

/** L'emoji del TIPO di locale: e' quella che sta al centro del pin. */
export const EMOJI_TIPO_GF: Record<string, string> = {
  pizzeria: "🍕", gelateria: "🍦", forno: "🥖", ristorante: "🍴", bar: "☕", negozio: "🛒",
};
export function emojiTipoGf(poi: any): string {
  return EMOJI_TIPO_GF[String(poi?.gf_tipo || "")] || "🍴";
}

/** La targhetta di destra del pin: «100%», «Menu», «Opz.». */
export function targaGf(poi: any): string {
  const l = livelloGf(poi);
  return l === "dedicato" ? "100%" : l === "menu" ? "Menu" : l === "opzioni" ? "Opz." : "";
}

const TINTA: Record<string, string> = { dedicato: "#166534", menu: "#15803d", opzioni: "#4b5563" };
const ferma = (e: React.SyntheticEvent) => { e.stopPropagation(); };

interface Props {
  poi: any;
  language: Language;
  /** `fumetto` = dentro il popup del pin; `scheda` = dentro PoiDetailSheet (che ha gia' i suoi tasti Chiama/Sito). */
  variante?: "fumetto" | "scheda";
}

// I piatti arrivano in inglese dalla fonte («Pizza, Bread/Buns, Beer»): in
// italiano si traducono con questo elenco chiuso; nelle altre lingue restano.
const PIATTI_IT: Record<string, string> = {
  "bread/buns": "Pane", beer: "Birra", dessert: "Dolci", "ice cream": "Gelato", "ice cream cones": "Coni", fries: "Patatine",
  sandwiches: "Panini", salad: "Insalate", burgers: "Hamburger", cake: "Torte", cookies: "Biscotti", soup: "Zuppe",
  "frozen yogurt": "Yogurt gelato", pancakes: "Pancake", crepes: "Crêpe", bagels: "Bagel", donuts: "Ciambelle", waffles: "Waffle",
  muffins: "Muffin", cupcakes: "Cupcake", pastries: "Pasticceria", pie: "Crostate", wraps: "Piadine", tacos: "Tacos",
  "fried chicken": "Pollo fritto", "fish & chips": "Fish & chips", "chicken salad": "Insalata di pollo", breakfast: "Colazione",
  "& more": "e altro",
};
function piattiNellaLingua(piatti: string, language: Language): string {
  if (language !== "IT") return piatti;
  return piatti.replace(/\s*&\s*more\s*$/i, ", & more").split(",").map((x) => x.trim()).filter(Boolean)
    .map((x) => PIATTI_IT[x.toLowerCase()] || x).join(", ").replace(/, e altro$/, " e altro");
}

export default function SchedaSenzaGlutine({ poi, language, variante = "fumetto" }: Props) {
  const liv = livelloGf(poi);
  // (03/10 sera, committente: «metti tutte le info») I dati della scheda sulla
  // fonte — telefono, sito, indirizzo, piatti, prezzo, voto — stanno nella
  // tabellina locali_gf e si leggono quando il fumetto si apre: una riga per
  // chiave, non passano dalla RPC della mappa.
  const [det, setDet] = useState<any>(null);
  useEffect(() => {
    setDet(null);
    if (!poi?.id || !liv) return;
    let vivo = true;
    supabase.from("locali_gf").select("telefono, sito, indirizzo, piatti, prezzo, voto, recensioni").eq("id", String(poi.id)).maybeSingle()
      .then(({ data }: any) => { if (vivo && data) setDet(data); }, () => { /* senza dettagli resta il riquadro base */ });
    return () => { vivo = false; };
  }, [poi?.id, liv]);
  if (!liv) return null;
  const tipo = String(poi.gf_tipo || "ristorante");
  // I nostri dati per primi; quelli della fonte dove i nostri mancano.
  const indirizzo = [poi.address, poi.city].map((x: any) => String(x || "").trim()).filter(Boolean).join(", ") || String(det?.indirizzo || "").trim();
  const telefono = String(poi.contact_phone || det?.telefono || "").trim();
  const sito = String(poi.contact_website || det?.sito || "").trim();
  const piatti = det?.piatti ? piattiNellaLingua(String(det.piatti), language) : "";
  const prezzo = Number(det?.prezzo) >= 1 ? "€".repeat(Math.min(4, Number(det.prezzo))) : "";
  const voto = Number(det?.voto) > 0 ? Number(det.voto).toLocaleString(language.toLowerCase(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "";
  const recensioni = Number(det?.recensioni) || 0;
  const tasto = "px-3 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-all";
  const avviso = liv === "dedicato" ? "avvisoDedicato" : liv === "menu" ? "avvisoMenu" : "avvisoOpzioni";

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white mb-3">
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: TINTA[liv] }}>
        <span className="text-[18px] leading-none">🌾</span>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/65 leading-none mb-1">{t("occhiello", language)}</p>
          <p className="text-[13px] font-black text-white leading-tight">{t(liv as keyof typeof T, language)}</p>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="text-[12px] font-bold text-gray-900">{emojiTipoGf(poi)} {t((T[tipo] ? tipo : "ristorante") as keyof typeof T, language)}</span>
          {prezzo && <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700">{prezzo}</span>}
          {voto && (
            <span className="text-[11px] font-bold text-gray-700">★ {voto}{recensioni > 0 ? ` · ${recensioni} ${t(recensioni === 1 ? "recensione" : "recensioni", language)}` : ""}</span>
          )}
        </div>
        {indirizzo && <p className="text-[11px] text-gray-600 leading-snug">📍 {indirizzo}</p>}
        {piatti && (
          <p className="text-[11px] text-gray-600 leading-snug mt-1"><span className="font-bold text-gray-800">{t("piatti", language)}:</span> {piatti}</p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {variante === "fumetto" && telefono && (
            <a href={`tel:${telefono.replace(/\s+/g, "")}`} onClick={ferma} className={`${tasto} text-white`} style={{ background: VERDE_GF }}>
              📞 {t("chiama", language)}
            </a>
          )}
          {variante === "fumetto" && sito && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void apriScheda(sito.startsWith("http") ? sito : `https://${sito}`); }}
              className={`${tasto} bg-white border border-gray-200 text-gray-800`}>
              🌐 {t("sito", language)}
            </button>
          )}
          {poi.gf_url && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void apriScheda(String(poi.gf_url)); }}
              className={`${tasto} bg-white border border-gray-300 text-gray-800`}>
              {t("scheda", language)} ↗
            </button>
          )}
        </div>
        <p className="text-[9px] text-gray-400 leading-snug mt-2">{t(avviso, language)}</p>
      </div>
    </div>
  );
}
