import React from "react";
import { X } from "lucide-react";
import { Language } from "../lib/i18n";
import { VERDE_GF } from "./SchedaSenzaGlutine";
import { COLORE_STELLATI, ORO_STELLATI } from "./SchedaMichelin";

/**
 * LA LEGENDA DELLE TARGHETTE DEI LOCALI (04/10/2026).
 *
 * Committente: «meglio inserire una legenda per dirlo all'utente, com'e'
 * scritto anche nel pin». Le targhette del pin — «100%», «Menu», «Opz.» per il
 * senza glutine; ★, ★★, ★★★ e «Bib» per gli stellati — da sole non si
 * spiegano, e per un celiaco la differenza fra «100%» e «Opz.» e' sostanza.
 * Si apre dal tasto «Legenda» in fondo alla fila di chips (CategoryChips).
 * Le targhette qui sono disegnate come quelle del pin (MapArea.createPoiIcon):
 * se cambia una, cambia anche l'altra.
 */

type Tipo = "gf" | "stellati";
type Testo = Partial<Record<Language, string>> & { IT: string; EN: string };
const tr = (x: Testo, l: Language) => x[l] || x.EN;

export const ETICHETTA_LEGENDA: Testo = { IT: "Legenda", EN: "Legend", FR: "Légende", ES: "Leyenda", DE: "Legende", RU: "Легенда", ZH: "图例" };

const T: Record<string, Testo> = {
  titoloGf: { IT: "Senza glutine: cosa dicono le targhette", EN: "Gluten-free: what the badges mean", FR: "Sans gluten : ce que disent les badges", ES: "Sin gluten: qué significan las etiquetas", DE: "Glutenfrei: was die Kennzeichen bedeuten", RU: "Без глютена: что означают метки", ZH: "无麸质：标记的含义" },
  dedicato: { IT: "Locale interamente senza glutine.", EN: "The whole place is gluten-free.", FR: "Établissement entièrement sans gluten.", ES: "Local totalmente sin gluten.", DE: "Das ganze Lokal ist glutenfrei.", RU: "Всё заведение без глютена.", ZH: "全店无麸质。" },
  menu: { IT: "Ha un menu senza glutine, ma cucina anche con glutine.", EN: "Has a gluten-free menu, but also cooks with gluten.", FR: "Propose une carte sans gluten, mais cuisine aussi avec gluten.", ES: "Tiene carta sin gluten, pero también cocina con gluten.", DE: "Hat eine glutenfreie Karte, kocht aber auch mit Gluten.", RU: "Есть безглютеновое меню, но готовят и с глютеном.", ZH: "有无麸质菜单，但厨房也使用含麸质食材。" },
  opzioni: { IT: "Segnalato dagli utenti, senza menu dedicato: chiedi prima di ordinare.", EN: "Reported by users, no dedicated menu: ask before ordering.", FR: "Signalé par des utilisateurs, sans carte dédiée : demandez avant de commander.", ES: "Señalado por usuarios, sin carta específica: pregunta antes de pedir.", DE: "Von Nutzern gemeldet, ohne eigene Karte: vor der Bestellung nachfragen.", RU: "Отмечено пользователями, отдельного меню нет: уточняйте перед заказом.", ZH: "由用户报告，无专门菜单：点餐前请先询问。" },
  centro: { IT: "Al centro del pin c'è il tipo di locale: pizzeria, gelateria, forno, ristorante, bar, negozio.", EN: "The centre of the pin shows the kind of place: pizzeria, gelato shop, bakery, restaurant, bar, shop.", FR: "Au centre du repère, le type d'établissement : pizzeria, glacier, boulangerie, restaurant, bar, épicerie.", ES: "En el centro del pin, el tipo de local: pizzería, heladería, panadería, restaurante, bar, tienda.", DE: "In der Mitte des Pins steht die Art des Lokals: Pizzeria, Eisdiele, Bäckerei, Restaurant, Bar, Laden.", RU: "В центре метки — тип заведения: пиццерия, мороженое, пекарня, ресторан, бар, магазин.", ZH: "图钉中央显示店铺类型：比萨店、冰淇淋店、面包店、餐厅、酒吧、商店。" },
  notaGf: { IT: "Informazioni dichiarate dalla fonte, non verificate da WIP. Verifica sempre sul posto.", EN: "Information as declared by the source, not verified by WIP. Always check on site.", FR: "Informations déclarées par la source, non vérifiées par WIP. Vérifiez toujours sur place.", ES: "Información declarada por la fuente, no verificada por WIP. Compruébalo siempre en el local.", DE: "Angaben laut Quelle, von WIP nicht geprüft. Bitte immer vor Ort prüfen.", RU: "Сведения по данным источника, WIP их не проверяла. Всегда уточняйте на месте.", ZH: "信息由来源方声明，WIP 未作核实。请务必到店确认。" },
  titoloSt: { IT: "Ristoranti stellati: cosa dicono le targhette", EN: "Starred restaurants: what the badges mean", FR: "Restaurants étoilés : ce que disent les badges", ES: "Restaurantes con estrella: qué significan las etiquetas", DE: "Sternerestaurants: was die Kennzeichen bedeuten", RU: "Рестораны со звёздами: что означают метки", ZH: "星级餐厅：标记的含义" },
  st3: { IT: "3 Stelle MICHELIN.", EN: "3 MICHELIN Stars.", FR: "3 Étoiles MICHELIN.", ES: "3 Estrellas MICHELIN.", DE: "3 MICHELIN-Sterne.", RU: "3 звезды MICHELIN.", ZH: "米其林三星。" },
  st2: { IT: "2 Stelle MICHELIN.", EN: "2 MICHELIN Stars.", FR: "2 Étoiles MICHELIN.", ES: "2 Estrellas MICHELIN.", DE: "2 MICHELIN-Sterne.", RU: "2 звезды MICHELIN.", ZH: "米其林二星。" },
  st1: { IT: "1 Stella MICHELIN.", EN: "1 MICHELIN Star.", FR: "1 Étoile MICHELIN.", ES: "1 Estrella MICHELIN.", DE: "1 MICHELIN-Stern.", RU: "1 звезда MICHELIN.", ZH: "米其林一星。" },
  bib: { IT: "Bib Gourmand MICHELIN: si vede sulla mappa, ma non rientra nella chip «Stellati».", EN: "MICHELIN Bib Gourmand: shown on the map, but not included in the “Starred” chip.", FR: "Bib Gourmand MICHELIN : visible sur la carte, mais hors du filtre « Étoilés ».", ES: "Bib Gourmand MICHELIN: se ve en el mapa, pero no entra en el filtro «Con estrella».", DE: "MICHELIN Bib Gourmand: auf der Karte sichtbar, aber nicht im Filter „Sterneküche“.", RU: "Bib Gourmand MICHELIN: виден на карте, но не входит в фильтр «Со звёздами».", ZH: "米其林必比登：在地图上显示，但不属于“星级餐厅”筛选。" },
  notaSt: { IT: "Riconoscimenti assegnati dalla Guida MICHELIN. WIP non è affiliata a Michelin.", EN: "Awards given by the MICHELIN Guide. WIP is not affiliated with Michelin.", FR: "Distinctions attribuées par le Guide MICHELIN. WIP n'est pas affiliée à Michelin.", ES: "Distinciones otorgadas por la Guía MICHELIN. WIP no está afiliada a Michelin.", DE: "Auszeichnungen des Guide MICHELIN. WIP ist nicht mit Michelin verbunden.", RU: "Награды присуждены гидом MICHELIN. WIP не связана с Michelin.", ZH: "荣誉由米其林指南授予。WIP 与米其林无关联。" },
  chiudi: { IT: "Chiudi", EN: "Close", FR: "Fermer", ES: "Cerrar", DE: "Schließen", RU: "Закрыть", ZH: "关闭" },
};

/** Una targhetta disegnata come sul pin. */
function Targa({ testo, stile }: { testo: string; stile: React.CSSProperties }) {
  return (
    <span className="inline-flex items-center justify-center flex-shrink-0 font-black leading-none"
      style={{ minWidth: 34, height: 20, padding: "0 6px", borderRadius: 10, fontSize: 10, boxShadow: "0 1px 3px rgba(0,0,0,.2)", ...stile }}>
      {testo}
    </span>
  );
}

export default function LegendaLocali({ tipo, language, onClose }: { tipo: Tipo; language: Language; onClose: () => void }) {
  const righe = tipo === "gf"
    ? [
        { targa: <Targa testo="100%" stile={{ background: VERDE_GF, color: "#fff", border: `1.5px solid ${VERDE_GF}` }} />, testo: tr(T.dedicato, language) },
        { targa: <Targa testo="Menu" stile={{ background: "#fff", color: VERDE_GF, border: `1.5px solid ${VERDE_GF}` }} />, testo: tr(T.menu, language) },
        { targa: <Targa testo="Opz." stile={{ background: "#fff", color: "#6b7280", border: "1.5px solid #9ca3af" }} />, testo: tr(T.opzioni, language) },
      ]
    : [
        { targa: <Targa testo="★★★" stile={{ background: "#fff", color: ORO_STELLATI, border: `1.5px solid ${ORO_STELLATI}` }} />, testo: tr(T.st3, language) },
        { targa: <Targa testo="★★" stile={{ background: "#fff", color: ORO_STELLATI, border: `1.5px solid ${ORO_STELLATI}` }} />, testo: tr(T.st2, language) },
        { targa: <Targa testo="★" stile={{ background: "#fff", color: ORO_STELLATI, border: `1.5px solid ${ORO_STELLATI}` }} />, testo: tr(T.st1, language) },
        { targa: <Targa testo="Bib" stile={{ background: "#fff", color: ORO_STELLATI, border: `1.5px solid ${ORO_STELLATI}` }} />, testo: tr(T.bib, language) },
      ];
  return (
    <div className="mx-3 mb-1 max-w-sm rounded-2xl bg-white shadow-xl border border-gray-200 pointer-events-auto overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white" style={{ background: tipo === "gf" ? VERDE_GF : COLORE_STELLATI }}>
        <span className="text-[11px] font-black leading-tight">{tipo === "gf" ? "🌾 " : "⭐ "}{tr(tipo === "gf" ? T.titoloGf : T.titoloSt, language)}</span>
        <button onClick={onClose} aria-label={tr(T.chiudi, language)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:scale-95">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {righe.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5">
            {r.targa}
            <span className="text-[11.5px] text-gray-700 leading-snug">{r.testo}</span>
          </div>
        ))}
        {tipo === "gf" && <p className="text-[10.5px] text-gray-500 leading-snug">{tr(T.centro, language)}</p>}
        <p className="text-[10px] text-gray-400 leading-snug border-t border-gray-100 pt-2">{tr(tipo === "gf" ? T.notaGf : T.notaSt, language)}</p>
      </div>
    </div>
  );
}
