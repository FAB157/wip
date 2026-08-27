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

interface Props {
  poi: NavChoicePoi | null;
  language: Language | string;
  onClose: () => void;
}

export default function NavChoiceSheet({ poi, language, onClose }: Props) {
  if (!poi) return null;
  const lang = language as Language;
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  const sheet = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40"
      onClick={(e) => { stop(e); onClose(); }}
    >
      <div className="w-full max-w-sm m-3 rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={stop}>
        <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 truncate">
          {poi.name || poi.nome}
        </p>
        <button
          onClick={(e) => { stop(e); onClose(); void navigaAPiediVerso(poi); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-t border-gray-100"
        >
          <span className="text-xl">🚶</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-gray-900">{getTranslation("nav_a_piedi", lang)}</span>
            <span className="block text-[11px] text-gray-500">{getTranslation("nav_a_piedi_sub", lang)}</span>
          </span>
        </button>
        <button
          onClick={(e) => { stop(e); onClose(); void navigaInAutoVerso(poi); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-t border-gray-100"
        >
          <span className="text-xl">🚗</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-gray-900">{getTranslation("nav_in_auto", lang)}</span>
            <span className="block text-[11px] text-gray-500">{getTranslation("nav_in_auto_sub", lang)}</span>
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
