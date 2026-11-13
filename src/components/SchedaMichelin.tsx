import React from "react";
import { Language } from "../lib/i18n";
import { apriScheda } from "../lib/apriScheda";

/**
 * IL RICONOSCIMENTO DELLA GUIDA MICHELIN SUL PIN E SULLA SCHEDA DEL LOCALE.
 *
 * VERSIONE PRUDENTE (02/10/2026, scelta del committente dopo la domanda
 * «Michelin puo' opporsi?»). La selezione della Guida e' una banca dati
 * protetta e «MICHELIN» un marchio: finche' non c'e' un accordo scritto,
 * - della Guida si mostra SOLO IL FATTO: distinzione, Stella Verde, anno, e il
 *   link alla loro scheda;
 * - indirizzo, telefono, sito e cucina sono i NOSTRI (Overture/OSM), gia' sul
 *   pin: niente cucina, fascia di prezzo, orari o servizi presi dalla Guida;
 * - nessuna grafica che imiti la loro (niente fascia rossa «Guida MICHELIN»),
 *   e la riga «WIP non e' affiliata a Michelin»;
 * - niente recensione dell'ispettore e niente foto della Guida, mai.
 * Con l'accordo: VERSIONE_COMPLETA = true e import con --completo
 * (scripts/importa-michelin.mjs); le colonne michelin_prezzo/_cucina/_orari/
 * _servizi esistono gia'.
 *
 * `michelin_url` valorizzato = il ristorante e' nella Guida. La distinzione
 * (`3_stelle | 2_stelle | 1_stella | bib_gourmand | selezionato`) PUO' MANCARE:
 * allora non si mostra nessuna stella.
 */

export const VERSIONE_COMPLETA = false;
/** Il colore del pin dei ristoranti stellati: antracite, con la targhetta oro. Non il rosso della Guida. */
export const COLORE_STELLATI = "#1f2937";
export const ORO_STELLATI = "#b45309";

type Testi = Record<string, Partial<Record<Language, string>> & { IT: string; EN: string }>;
const T: Testi = {
  stella: { IT: "Stella MICHELIN", EN: "MICHELIN Star", FR: "Étoile MICHELIN", ES: "Estrella MICHELIN", DE: "MICHELIN-Stern", RU: "звезда MICHELIN", ZH: "米其林一星" },
  stelle: { IT: "Stelle MICHELIN", EN: "MICHELIN Stars", FR: "Étoiles MICHELIN", ES: "Estrellas MICHELIN", DE: "MICHELIN-Sterne", RU: "звезды MICHELIN", ZH: "米其林星" },
  bib: { IT: "Bib Gourmand MICHELIN", EN: "MICHELIN Bib Gourmand", FR: "Bib Gourmand MICHELIN", ES: "Bib Gourmand MICHELIN", DE: "MICHELIN Bib Gourmand", RU: "Bib Gourmand MICHELIN", ZH: "米其林必比登" },
  selezionato: { IT: "Selezionato dalla Guida MICHELIN", EN: "Selected by the MICHELIN Guide", FR: "Sélectionné par le Guide MICHELIN", ES: "Recomendado por la Guía MICHELIN", DE: "Vom Guide MICHELIN empfohlen", RU: "Рекомендован гидом MICHELIN", ZH: "米其林指南入选" },
  inGuida: { IT: "Nella Guida MICHELIN", EN: "In the MICHELIN Guide", FR: "Dans le Guide MICHELIN", ES: "En la Guía MICHELIN", DE: "Im Guide MICHELIN", RU: "В гиде MICHELIN", ZH: "收录于米其林指南" },
  verde: { IT: "Stella Verde", EN: "Green Star", FR: "Étoile Verte", ES: "Estrella Verde", DE: "Grüner Stern", RU: "Зелёная звезда", ZH: "绿星" },
  riconoscimento: { IT: "Riconoscimento", EN: "Award", FR: "Distinction", ES: "Distinción", DE: "Auszeichnung", RU: "Награда", ZH: "荣誉" },
  chiama: { IT: "Chiama", EN: "Call", FR: "Appeler", ES: "Llamar", DE: "Anrufen", RU: "Позвонить", ZH: "致电" },
  sito: { IT: "Sito", EN: "Website", FR: "Site", ES: "Web", DE: "Website", RU: "Сайт", ZH: "网站" },
  scheda: { IT: "Vedi sulla Guida MICHELIN", EN: "See on the MICHELIN Guide", FR: "Voir sur le Guide MICHELIN", ES: "Ver en la Guía MICHELIN", DE: "Im Guide MICHELIN ansehen", RU: "Открыть в гиде MICHELIN", ZH: "在米其林指南查看" },
  nonAffiliata: {
    IT: "Riconoscimento assegnato dalla Guida MICHELIN. WIP non è affiliata a Michelin.",
    EN: "Award given by the MICHELIN Guide. WIP is not affiliated with Michelin.",
    FR: "Distinction attribuée par le Guide MICHELIN. WIP n'est pas affiliée à Michelin.",
    ES: "Distinción otorgada por la Guía MICHELIN. WIP no está afiliada a Michelin.",
    DE: "Auszeichnung des Guide MICHELIN. WIP ist nicht mit Michelin verbunden.",
    RU: "Награда присуждена гидом MICHELIN. WIP не связана с Michelin.",
    ZH: "该荣誉由米其林指南授予。WIP 与米其林无关联。",
  },
  oggi: { IT: "Oggi", EN: "Today", FR: "Aujourd'hui", ES: "Hoy", DE: "Heute", RU: "Сегодня", ZH: "今天" },
  chiuso: { IT: "chiuso", EN: "closed", FR: "fermé", ES: "cerrado", DE: "geschlossen", RU: "закрыто", ZH: "休息" },
  orari: { IT: "Orari", EN: "Hours", FR: "Horaires", ES: "Horario", DE: "Öffnungszeiten", RU: "Часы работы", ZH: "营业时间" },
};
const t = (k: keyof typeof T, l: Language) => (T[k] as any)[l] || T[k].EN;
/** Gli stessi testi per i fumetti HTML di Leaflet (livello Lusso in MapArea). */
export const tMichelin = t;

const N_STELLE: Record<string, number> = { "3_stelle": 3, "2_stelle": 2, "1_stella": 1 };

/** Quante stelle (0 se non ne ha o se il livello non e' noto). */
export function stelleMichelin(poi: any): number {
  return N_STELLE[String(poi?.michelin_distinzione || "")] || 0;
}

/** Cosa va nella targhetta del pin: «★★», «Bib», oppure niente (selezionato o livello non noto = pin normale). */
export function targaStellati(poi: any): string {
  if (!poi?.michelin_url) return "";
  const n = stelleMichelin(poi);
  if (n > 0) return "★".repeat(n);
  return poi.michelin_distinzione === "bib_gourmand" ? "Bib" : "";
}

/** Il fatto, detto per intero: «2 Stelle MICHELIN», «Bib Gourmand MICHELIN», «Selezionato dalla Guida MICHELIN». */
export function etichettaMichelin(poi: any, language: Language): string {
  const n = stelleMichelin(poi);
  if (n > 0) return `${n} ${n === 1 ? t("stella", language) : t("stelle", language)}`;
  if (poi?.michelin_distinzione === "bib_gourmand") return t("bib", language);
  if (poi?.michelin_distinzione === "selezionato") return t("selezionato", language);
  return t("inGuida", language);
}

// ── Solo versione completa: orari e servizi come li scrive la Guida («Lunedì 12:30-15:00; Martedì chiuso»).
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
function orarioDiOggi(orari: string | null | undefined): string | null {
  if (!orari) return null;
  const oggi = GIORNI[new Date().getDay()];
  for (const pezzo of String(orari).split(";")) {
    const p = pezzo.trim();
    if (p.toLowerCase().startsWith(oggi)) return p.slice(oggi.length).trim() || null;
  }
  return null;
}
function orariTradotti(orari: string, language: Language): string {
  const nomeGiorno = (i: number) => {
    try {
      // 05/01/2025 e' una domenica: + i giorni = il giorno i della settimana.
      const g = new Intl.DateTimeFormat(language.toLowerCase(), { weekday: "long" }).format(new Date(2025, 0, 5 + i));
      return g.charAt(0).toUpperCase() + g.slice(1);
    } catch { return GIORNI[i].charAt(0).toUpperCase() + GIORNI[i].slice(1); }
  };
  return String(orari).split(";").map((x) => x.trim()).filter(Boolean).map((p) => {
    const i = GIORNI.findIndex((g) => p.toLowerCase().startsWith(g));
    if (i < 0) return p;
    const resto = p.slice(GIORNI[i].length).trim();
    return `${nomeGiorno(i)} ${resto.toLowerCase() === "chiuso" ? t("chiuso", language) : resto}`;
  }).join(" · ");
}

const ferma = (e: React.SyntheticEvent) => { e.stopPropagation(); };

interface Props {
  poi: any;
  language: Language;
  /** `fumetto` = dentro il popup del pin; `scheda` = dentro PoiDetailSheet (la scheda ha gia' i suoi tasti Chiama/Sito). */
  variante?: "fumetto" | "scheda";
}

export default function SchedaMichelin({ poi, language, variante = "fumetto" }: Props) {
  if (!poi?.michelin_url) return null;
  const n = stelleMichelin(poi);
  const anno = Number(poi.michelin_anno) > 2000 ? String(poi.michelin_anno) : "";
  // I NOSTRI dati (Overture/OSM), gia' sul pin.
  const cucinaNostra = String(poi.poi_type || "").replace(/_/g, " ").replace(/\b(restaurant|ristorante)\b/gi, "").trim();
  const indirizzo = [poi.address, poi.city].map((x: any) => String(x || "").trim()).filter(Boolean).join(", ");
  const telefono = String(poi.contact_phone || "").trim();
  const sito = String(poi.contact_website || "").trim();
  const tasto = "px-3 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-all";
  // Dalla Guida, solo con l'accordo.
  const completa = VERSIONE_COMPLETA;
  const prezzo = completa && Number(poi.michelin_prezzo) >= 1 ? "€".repeat(Math.min(4, Number(poi.michelin_prezzo))) : "";
  const oggi = completa ? orarioDiOggi(poi.michelin_orari) : null;
  const servizi: string[] = completa && Array.isArray(poi.michelin_servizi) ? poi.michelin_servizi : [];

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white mb-3">
      {/* Il riconoscimento: un fatto, scritto per esteso. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: COLORE_STELLATI }}>
        {n > 0 && <span className="text-[17px] leading-none tracking-wider" style={{ color: "#fbbf24" }}>{"★".repeat(n)}</span>}
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60 leading-none mb-1">{t("riconoscimento", language)}{anno ? ` ${anno}` : ""}</p>
          <p className="text-[13px] font-black text-white leading-tight">{etichettaMichelin(poi, language)}</p>
        </div>
        {poi.michelin_stella_verde && (
          <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-md bg-green-100 text-green-800 whitespace-nowrap">🍀 {t("verde", language)}</span>
        )}
      </div>

      <div className="px-3 py-2.5">
        {(cucinaNostra || prezzo) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {cucinaNostra && <span className="text-[12px] font-bold text-gray-900 capitalize">{completa && poi.michelin_cucina ? poi.michelin_cucina : cucinaNostra}</span>}
            {prezzo && <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700">{prezzo}</span>}
          </div>
        )}
        {indirizzo && <p className="text-[11px] text-gray-600 leading-snug">📍 {indirizzo}</p>}
        {oggi && (
          <p className="text-[11px] text-gray-600 leading-snug mt-0.5">🕒 {t("oggi", language)}: <span className="font-bold text-gray-800">{oggi.toLowerCase() === "chiuso" ? t("chiuso", language) : oggi}</span></p>
        )}
        {completa && variante === "scheda" && poi.michelin_orari && (
          <div className="mt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{t("orari", language)}</p>
            <p className="text-[11px] text-gray-600 leading-relaxed">{orariTradotti(String(poi.michelin_orari), language)}</p>
          </div>
        )}
        {servizi.length > 0 && variante === "scheda" && (
          <div className="flex flex-wrap gap-1 mt-2">
            {servizi.slice(0, 12).map((s) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {variante === "fumetto" && telefono && (
            <a href={`tel:${telefono.replace(/\s+/g, "")}`} onClick={ferma} className={`${tasto} text-white`} style={{ background: COLORE_STELLATI }}>
              📞 {t("chiama", language)}
            </a>
          )}
          {variante === "fumetto" && sito && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void apriScheda(sito.startsWith("http") ? sito : `https://${sito}`); }}
              className={`${tasto} bg-white border border-gray-200 text-gray-800`}>
              🌐 {t("sito", language)}
            </button>
          )}
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void apriScheda(String(poi.michelin_url)); }}
            className={`${tasto} bg-white border border-gray-300 text-gray-800`}>
            {t("scheda", language)} ↗
          </button>
        </div>
        <p className="text-[9px] text-gray-400 leading-snug mt-2">{t("nonAffiliata", language)}</p>
      </div>
    </div>
  );
}
