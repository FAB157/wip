import React, { useState, useEffect, useRef } from 'react';
import { X, Navigation, Loader2, MapPin, Crosshair, Search, Info } from 'lucide-react';
import { getTranslation, Language } from '../lib/i18n';
import { getApiUrl } from '../lib/api';
import { haversineMeters } from '../lib/geo';
import { notify } from '../lib/toast';

// Oltre questa distanza in linea d'aria il tragitto a piedi è irrealistico
// per la maggior parte degli utenti: prima si procedeva silenziosamente
// anche per decine di km, ora si avvisa (non bloccante) prima della scansione.
const LONG_WALK_WARNING_M = 8000;

interface RoutePoisModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Avvia la navigazione: POI selezionati lungo il percorso + origine scelta. */
  onStartNavigation: (selectedPois: any[], origin: { lat: number; lon: number } | null) => void;
  startCoords: { lat: number, lon: number } | null;
  /** Null finché nessuna navigazione è stata richiesta (il modal è chiuso). */
  endCoords: { lat: number, lon: number } | null;
  destinationName: string;
  language: Language;
}

/**
 * Modal "WIP Nav": scelta del punto di partenza (GPS o indirizzo con
 * autocomplete, stessa UX della barra di ricerca della mappa), scansione dei
 * POI lungo il tragitto e avvio del navigatore interno.
 */
export default function RoutePoisModal({
  isOpen,
  onClose,
  onStartNavigation,
  startCoords,
  endCoords,
  destinationName,
  language
}: RoutePoisModalProps) {
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [routePois, setRoutePois] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExplainer, setShowExplainer] = useState(false);

  // ── Punto di partenza ──
  const [originMode, setOriginMode] = useState<'gps' | 'custom'>('gps');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(startCoords);
  const [gpsError, setGpsError] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [customCoords, setCustomCoords] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; description: string; lat: number; lon: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const isIt = language === 'IT';
  const origin = originMode === 'gps' ? gpsCoords : (customCoords ? { lat: customCoords.lat, lon: customCoords.lon } : null);

  // Acquisizione GPS all'apertura (se non fornita a monte dal chiamante)
  useEffect(() => {
    if (!isOpen) return;
    setGpsError(false);
    if (startCoords) { setGpsCoords(startCoords); return; }
    if (!navigator.geolocation) { setGpsError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [isOpen, startCoords]);

  // Autocomplete Mapbox per l'indirizzo personalizzato — stesso pattern
  // (debounce + AbortController + limit 5) della ricerca della mappa.
  useEffect(() => {
    if (!isOpen || originMode !== 'custom' || customQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const abortCtrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abortCtrl;
    const timer = setTimeout(async () => {
      try {
        // Proxy server-side (/api/geocode): il token Mapbox non sta più nel
        // bundle client. `types` allargati per accettare indirizzi civici.
        const res = await fetch(getApiUrl(
          `/api/geocode?q=${encodeURIComponent(customQuery)}`
          + `&lang=${language.toLowerCase()}&limit=5&types=address,poi,place,locality,neighborhood`
        ), { signal: abortCtrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (abortCtrl.signal.aborted) return;
        setSuggestions((data.features || []).map((f: any) => ({
          id: f.id,
          description: f.description,
          lat: f.lat,
          lon: f.lon,
        })));
      } catch { /* abort o rete: ignora */ }
    }, 600);
    return () => { clearTimeout(timer); abortCtrl.abort(); };
  }, [customQuery, originMode, isOpen, language]);

  // Scansione POI lungo il percorso: parte appena origine e destinazione sono note
  useEffect(() => {
    if (!isOpen || !origin || !endCoords) {
      setRoutePois([]);
      return;
    }
    if (!origin || !endCoords) return;

    // Avviso non bloccante per tragitti irrealistici a piedi: prima si
    // procedeva silenziosamente con la scansione POI qualunque fosse la
    // distanza (anche decine di km in linea d'aria).
    const straightLineM = haversineMeters(origin.lat, origin.lon, endCoords.lat, endCoords.lon);
    if (straightLineM > LONG_WALK_WARNING_M) {
      const km = (straightLineM / 1000).toFixed(1);
      notify(
        isIt
          ? `Il percorso è di oltre ${km} km in linea d'aria: potrebbe richiedere molto tempo a piedi.`
          : `The route is over ${km} km in a straight line: it may take a long time on foot.`,
        'info',
      );
    }

    let cancelled = false;
    setLoading(true);
    setScanError(false);
    fetch(getApiUrl('/api/route-pois'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startLat: origin.lat,
        startLon: origin.lon,
        endLat: endCoords.lat,
        endLon: endCoords.lon,
        radius_m: 300
      })
    })
      .then(r => { if (!r.ok) throw new Error(`route-pois ${r.status}`); return r.json(); })
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setRoutePois(data);
          setSelectedIds(new Set(data.map((p: any) => p.id)));
        }
      })
      .catch(err => { if (!cancelled) { console.error('[WIP Nav] route-pois:', err); setScanError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // endCoords con optional chaining: App renderizza il modal SEMPRE (anche
  // chiuso) e all'avvio endCoords è null — senza `?.` l'app crashava al mount.
  }, [isOpen, origin?.lat, origin?.lon, endCoords?.lat, endCoords?.lon]);

  // A11y: focus trap + ritorno del focus alla chiusura, Esc chiude.
  useEffect(() => {
    if (!isOpen || !endCoords) return;
    const root = dialogRef.current;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] =>
      (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).filter(el => el.offsetParent !== null);
    const focusTimer = setTimeout(() => {
      if (!root.contains(document.activeElement)) focusables()[0]?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, endCoords?.lat, endCoords?.lon]);

  if (!isOpen || !endCoords) return null;

  const togglePoi = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleStart = () => {
    const finalPois = routePois.filter(p => selectedIds.has(p.id));
    onStartNavigation(finalPois, origin);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="WIP Nav"
        className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              WIP Nav
              <button onClick={() => setShowExplainer(v => !v)} className="p-1 text-gray-400 hover:text-primary" aria-label="Info">
                <Info className="w-4 h-4" />
              </button>
            </h2>
            <p className="text-sm text-gray-500 mt-1">{getTranslation('rp_to', language)}: {destinationName}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 shadow-sm">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ── Cos'è WIP Nav ── */}
          {showExplainer && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed space-y-2">
              <p>
                {isIt
                  ? 'WIP Nav è il navigatore integrato dell\'app: ti guida in tempo reale lungo i percorsi dell\'itinerario con indicazioni vocali, e lungo la strada fa partire da sole le audioguide dei luoghi geofenzati che scegli qui sotto — senza uscire dall\'app.'
                  : 'WIP Nav is the app\'s built-in navigator: it guides you in real time along your itinerary with voice directions, and automatically plays the audio guides of the geofenced places you select below — without leaving the app.'}
              </p>
              <p>
                {isIt
                  ? 'A differenza di Google Maps (navigatore stradale generalista punto-punto basato sul traffico), WIP Nav è ottimizzato per il turismo di prossimità: ascolto contestuale delle tracce audio e scoperta dei punti di interesse curati lungo il tracciato.'
                  : 'Unlike Google Maps (a general-purpose point-to-point road navigator built around traffic), WIP Nav is optimized for proximity tourism: contextual audio playback and discovery of curated points of interest along your route.'}
              </p>
            </div>
          )}

          {/* ── Punto di partenza ── */}
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
              {getTranslation('starting_point', language)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOriginMode('gps')}
                className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  originMode === 'gps' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <Crosshair className="w-4 h-4" />
                {getTranslation('from_my_location', language)}
              </button>
              <button
                onClick={() => setOriginMode('custom')}
                className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  originMode === 'custom' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <MapPin className="w-4 h-4" />
                {getTranslation('custom_address', language)}
              </button>
            </div>

            {originMode === 'gps' && (
              <p className="text-xs text-gray-500 pl-1">
                {gpsCoords
                  ? `GPS: ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lon.toFixed(4)}`
                  : gpsError
                    ? getTranslation('rp_gps_unavailable', language)
                    : getTranslation('acquiring_gps', language)}
              </p>
            )}

            {originMode === 'custom' && (
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => { setCustomQuery(e.target.value); setCustomCoords(null); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={getTranslation('custom_address_placeholder', language)}
                  className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden">
                    {suggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCustomQuery(s.description.split(',')[0]);
                          setCustomCoords({ lat: s.lat, lon: s.lon, label: s.description });
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-50 dark:border-gray-700 last:border-b-0"
                      >
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-800 dark:text-gray-200 truncate">{s.description}</span>
                      </button>
                    ))}
                  </div>
                )}
                {customCoords && (
                  <p className="text-[11px] text-emerald-600 font-bold mt-1 pl-1 truncate">✓ {customCoords.label}</p>
                )}
              </div>
            )}
          </div>

          {/* ── POI lungo il percorso ── */}
          {!origin ? (
            <div className="text-center py-8 text-sm text-gray-500 font-medium">
              {getTranslation('rp_choose_start', language)}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-gray-500 font-medium">{getTranslation('rp_scanning', language)}</p>
            </div>
          ) : scanError ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-500 font-bold">{getTranslation('rp_scan_failed', language)}</p>
              <p className="text-xs text-gray-500 mt-1">{getTranslation('rp_can_still_navigate', language)}</p>
            </div>
          ) : routePois.length === 0 ? (
            <div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{getTranslation('rp_no_pois', language)}</h3>
              <p className="text-gray-500 text-sm">{getTranslation('rp_no_pois_desc', language)}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 p-3 rounded-xl">
                {getTranslation('rp_places_along_way', language)}
              </p>

              {routePois.map(poi => (
                <div
                  key={poi.id}
                  onClick={() => togglePoi(poi.id)}
                  className={`flex items-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    selectedIds.has(poi.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 opacity-60'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex justify-center items-center mr-4 border transition-colors ${
                    selectedIds.has(poi.id) ? 'bg-primary border-primary' : 'border-gray-300'
                  }`}>
                    {selectedIds.has(poi.id) && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white">{poi.nome || poi.name}</h4>
                    <p className="text-xs text-gray-500 capitalize">{poi.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex space-x-3">
          <button
            onClick={() => onStartNavigation([], origin)}
            className="w-1/3 py-4 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold active:scale-[0.98] transition-transform"
          >
            {getTranslation('skip', language)}
          </button>
          <button
            onClick={handleStart}
            disabled={!origin || loading}
            className="w-2/3 py-4 rounded-2xl bg-gradient-to-r from-primary to-orange-500 text-white font-bold text-lg shadow-lg shadow-primary/30 flex items-center justify-center space-x-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Navigation className="w-5 h-5 fill-white" />
            <span>{loading ? getTranslation('rp_wait', language) : getTranslation('rp_start_navigation', language)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
