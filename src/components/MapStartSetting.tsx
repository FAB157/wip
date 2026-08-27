import { useEffect, useState, type ReactNode } from "react";
import { MapPin, History, Building2, Search, Loader2 } from "lucide-react";
import { getApiUrl } from "../lib/api";
import { Language, getTranslation } from "../lib/i18n";
import { getMapStartPref, setMapStartPref, type MapStartMode, type MapStartCity } from "../lib/mapStart";

/**
 * «Dove si apre la mappa» (22/08/2026): la mia posizione · dove ero l'ultima
 * volta · una città scelta. Prima la mappa si apriva sempre su Carrara.
 */
export default function MapStartSetting({ language }: { language: Language }) {
  const [mode, setMode] = useState<MapStartMode>(() => getMapStartPref().mode);
  const [city, setCity] = useState<MapStartCity | undefined>(() => getMapStartPref().city);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapStartCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = (k: string) => getTranslation(k, language);

  // Ricerca città con debounce, via il proxy Nominatim del server.
  useEffect(() => {
    if (mode !== "city" || query.trim().length < 3) { setResults([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setError(null);
      try {
        const res = await fetch(
          getApiUrl(`/api/nominatim/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&lang=${language.toLowerCase()}`),
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const rows = await res.json();
        const list: MapStartCity[] = (Array.isArray(rows) ? rows : [])
          .map((r: any) => ({ name: String(r.display_name || r.name || "").split(",").slice(0, 2).join(",").trim(), lat: Number(r.lat), lon: Number(r.lon) }))
          .filter((c: MapStartCity) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon));
        setResults(list);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(t("map_start_search_error"));
      } finally { setSearching(false); }
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, mode, language]);

  const choose = (m: MapStartMode) => {
    setMode(m);
    if (m !== "city") setMapStartPref({ mode: m });
    else if (city) setMapStartPref({ mode: "city", city });
  };

  const pickCity = (c: MapStartCity) => {
    setCity(c); setResults([]); setQuery("");
    setMapStartPref({ mode: "city", city: c });
  };

  const options: { id: MapStartMode; icon: ReactNode; label: string; hint: string }[] = [
    { id: "gps", icon: <MapPin className="w-4 h-4" />, label: t("map_start_gps"), hint: t("map_start_gps_hint") },
    { id: "last", icon: <History className="w-4 h-4" />, label: t("map_start_last"), hint: t("map_start_last_hint") },
    { id: "city", icon: <Building2 className="w-4 h-4" />, label: t("map_start_city"), hint: t("map_start_city_hint") },
  ];

  return (
    <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
      <div className="flex items-center gap-3 mb-4 border-b border-gray-100/60 pb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <MapPin className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-black text-on-surface">{t("map_start_title")}</h4>
          <p className="text-[11px] font-bold text-on-surface-variant opacity-75">{t("map_start_subtitle")}</p>
        </div>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label={t("map_start_title")}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={mode === o.id}
            onClick={() => choose(o.id)}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              mode === o.id ? "border-primary bg-primary/5 text-primary" : "border-outline-variant/20 text-on-surface"
            }`}
          >
            <span className="shrink-0">{o.icon}</span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{o.label}</span>
              <span className="block text-[11px] opacity-70">{o.hint}</span>
            </span>
            <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${mode === o.id ? "border-primary bg-primary" : "border-outline-variant/40"}`} />
          </button>
        ))}
      </div>

      {mode === "city" && (
        <div className="mt-3">
          {city && (
            <p className="text-sm font-bold text-on-surface mb-2">
              📍 {city.name}
            </p>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("map_start_city_placeholder")}
              aria-label={t("map_start_city_placeholder")}
              className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-2xl border border-outline-variant/30 bg-white text-sm focus:outline-none focus:border-primary"
            />
            {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          {results.length > 0 && (
            <ul className="mt-2 border border-outline-variant/20 rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lon},${i}`}>
                  <button type="button" onClick={() => pickCity(r)}
                    className="w-full min-h-[44px] text-left px-4 py-2 text-sm hover:bg-primary/5 focus:outline-none focus-visible:bg-primary/10">
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!city && !results.length && !searching && query.trim().length < 3 && (
            <p className="text-[11px] text-on-surface-variant mt-2">{t("map_start_city_help")}</p>
          )}
        </div>
      )}
    </div>
  );
}
