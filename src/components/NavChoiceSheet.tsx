import React from "react";
import { createPortal } from "react-dom";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Language, getTranslation } from "../lib/i18n";
import { puntoArrivoSuStrada } from "../lib/puntoArrivo";

/**
 * La doppia scelta di navigazione verso un POI, la stessa degli itinerari
 * (ItineraryStop) e del popup sulla mappa (PoiPopupContent):
 *   🚶 a piedi  → WIP Nav (evento `wip-smart-navigate`, gestito da App.tsx)
 *   🚗 in auto  → Google Maps / Mappe di sistema (plugin nativo, link web in PWA)
 * Richiesta del 22/08/2026: «nei POI ci vuole la doppia opzione come negli
 * itinerari». Un solo componente per scheda completa, card e radar, cosi'
 * la forma dell'evento (startCoords/endCoords/destinationName) resta una.
 */
export interface NavChoicePoi {
  id?: string | number;
  name?: string;
  nome?: string;
  lat: number;
  lon: number;
  [k: string]: any;
}

export async function navigaAPiediVerso(poi: NavChoicePoi) {
  // La porta; senza porta, il civico dell'indirizzo (= la via principale);
  // senza nemmeno quello, il centroide. Vedi puntoArrivoSuStrada.
  const a = await puntoArrivoSuStrada(poi as any);
  window.dispatchEvent(new CustomEvent("wip-smart-navigate", {
    detail: {
      startCoords: null,
      endCoords: { lat: a.lat, lon: a.lon },
      destinationName: poi.name || poi.nome,
      poiId: poi.id,
      mode: "foot",
      arrivoDa: a.fonte,
    },
  }));
}

export async function navigaInAutoVerso(poi: NavChoicePoi) {
  const a = await puntoArrivoSuStrada(poi as any);
  const web = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}&travelmode=driving`, "_blank");
  if (Capacitor.isNativePlatform()) {
    try {
      const plugin = registerPlugin<any>("ItaintaBackgroundPoiPlugin");
      await plugin.openSystemNavigator({ lat: a.lat, lon: a.lon, name: poi.name || poi.nome, mode: "driving" });
      return;
    } catch (e) {
      console.warn("[NavChoice] openSystemNavigator fallito, apro il link web", e);
    }
  }
  web();
}

/**
 * IN AUTO, UN GIRO INTERO (29/08/2026). Dall'itinerario si sceglie a piedi o
 * in auto: a piedi il giorno diventa un giro Dieci Tappe dentro l'app (radar,
 * tracciato, aggiunte lungo la strada); in auto si esce e si consegna tutto a
 * Google Maps, perche' guidando non si ascolta una guida a piedi e non si
 * gioca con i pin.
 *
 * Google Maps accetta al massimo 9 tappe intermedie: se il giorno ne ha di
 * piu' si tengono la prima, l'ultima e quelle intermedie campionate a passo
 * regolare — meglio un giro completo con qualche sosta in meno che un errore
 * dell'URL. Il numero tenuto viene restituito, cosi' il chiamante puo' dirlo.
 */
const MAX_TAPPE_GOOGLE = 10; // 1 destinazione + 9 waypoint

export function urlGoogleItinerario(tappe: NavChoicePoi[]): { url: string; usate: number } | null {
  const valide = tappe.filter((t) => Number.isFinite(t?.lat) && Number.isFinite(t?.lon));
  if (valide.length === 0) return null;

  let scelte = valide;
  if (valide.length > MAX_TAPPE_GOOGLE) {
    // Prima e ultima sempre; le intermedie a passo regolare.
    const prima = valide[0];
    const ultima = valide[valide.length - 1];
    const intermedie = valide.slice(1, -1);
    const quante = MAX_TAPPE_GOOGLE - 2;
    const passo = intermedie.length / quante;
    const campionate = Array.from({ length: quante }, (_, i) => intermedie[Math.floor(i * passo)]).filter(Boolean);
    scelte = [prima, ...campionate, ultima];
  }

  const punto = (t: NavChoicePoi) => `${t.lat},${t.lon}`;
  const destinazione = punto(scelte[scelte.length - 1]);
  const waypoints = scelte.slice(0, -1).map(punto).join('|');
  // Nessun `origin`: Google parte dalla posizione attuale di chi guida.
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destinazione}`
    + (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '')
    + '&travelmode=driving';
  return { url, usate: scelte.length };
}

/** Apre l'itinerario del giorno in Google Maps (o Mappe di sistema). */
export function navigaInAutoItinerario(tappe: NavChoicePoi[]): number {
  const g = urlGoogleItinerario(tappe);
  if (!g) return 0;
  // Sempre il link: il navigatore di sistema nativo accetta una sola meta,
  // e un giro di otto tappe ridotto alla prima sarebbe un inganno.
  window.open(g.url, '_blank');
  return g.usate;
}

interface Props {
  poi: NavChoicePoi | null;
  language: Language | string;
  onClose: () => void;
  /**
   * Modalita' ITINERARIO: invece di navigare verso un singolo POI, «a piedi»
   * consegna il giorno al radar (lo fa il chiamante con `onAPiedi`) e «in
   * auto» apre Google Maps con tutte le tappe. `poi` resta la prima tappa,
   * per il titolo.
   */
  tappe?: NavChoicePoi[];
  onAPiedi?: () => void;
  titolo?: string;
}

export default function NavChoiceSheet({ poi, language, onClose, tappe, onAPiedi, titolo }: Props) {
  if (!poi) return null;
  const lang = language as Language;
  const modoItinerario = Array.isArray(tappe) && tappe.length > 0;
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  const sheet = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40"
      onClick={(e) => { stop(e); onClose(); }}
    >
      <div className="w-full max-w-sm m-3 rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={stop}>
        <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 truncate">
          {titolo || poi.name || poi.nome}
        </p>
        <button
          onClick={(e) => {
            stop(e); onClose();
            if (modoItinerario && onAPiedi) onAPiedi(); else void navigaAPiediVerso(poi);
          }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-t border-gray-100"
        >
          <span className="text-xl">🚶</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-gray-900">
              {getTranslation(modoItinerario ? "nav_giorno_a_piedi" : "nav_a_piedi", lang)}
            </span>
            <span className="block text-[11px] text-gray-500">
              {getTranslation(modoItinerario ? "nav_giorno_a_piedi_sub" : "nav_a_piedi_sub", lang)}
            </span>
          </span>
        </button>
        <button
          onClick={(e) => {
            stop(e); onClose();
            if (modoItinerario) navigaInAutoItinerario(tappe!); else void navigaInAutoVerso(poi);
          }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-t border-gray-100"
        >
          <span className="text-xl">🚗</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-gray-900">
              {getTranslation(modoItinerario ? "nav_giorno_in_auto" : "nav_in_auto", lang)}
            </span>
            <span className="block text-[11px] text-gray-500">
              {getTranslation(modoItinerario ? "nav_giorno_in_auto_sub" : "nav_in_auto_sub", lang)}
            </span>
          </span>
        </button>
        <button
          onClick={(e) => { stop(e); onClose(); }}
          className="w-full py-3 text-sm font-bold text-gray-500 border-t border-gray-100 hover:bg-gray-50 transition-colors"
        >
          {getTranslation("cancel", lang)}
        </button>
      </div>
    </div>
  );
  // Portal: la scheda e la card stanno dentro contenitori con overflow/transform
  // che chiuderebbero un fixed nel loro riquadro.
  return typeof document !== "undefined" ? createPortal(sheet, document.body) : sheet;
}
