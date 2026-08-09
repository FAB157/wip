import React, { useState, useEffect, useRef } from 'react';
import { X, Navigation, Loader2, MapPin, Crosshair, Search, Info } from 'lucide-react';
import { getTranslation, Language } from '../lib/i18n';
import { getApiUrl } from '../lib/api';

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
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              WIP Nav
              <button onClick={() => setShowExplainer(v => !v)} className="p-1 text-gray-400 hover:text-primary" aria-label="Info">
                <Info className="w-4 h-4" />
              </button>
            </h2>
            <p className="text-sm text-gray-500 mt-1">{isIt ? 'Verso' : 'To'}: {destinationName}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 shadow-sm">
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
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
              {isIt ? 'Punto di partenza' : 'Starting point'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOriginMode('gps')}
                className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  originMode === 'gps' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <Crosshair className="w-4 h-4" />
                {getTranslation('from_my_location', language) || (isIt ? 'Dalla mia posizione' : 'From my location')}
              </button>
              <button
                onClick={() => setOriginMode('custom')}
                className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  originMode === 'custom' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <MapPin className="w-4 h-4" />
                {getTranslation('custom_address', language) || (isIt ? 'Indirizzo personalizzato' : 'Custom address')}
              </button>
            </div>

            {originMode === 'gps' && (
              <p className="text-xs text-gray-500 pl-1">
                {gpsCoords
                  ? `GPS: ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lon.toFixed(4)}`
                  : gpsError
                    ? (isIt ? 'GPS non disponibile: usa un indirizzo personalizzato.' : 'GPS unavailable: use a custom address.')
                    : (getTranslation('acquiring_gps', language) || (isIt ? 'Acquisizione GPS...' : 'Acquiring GPS...'))}
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
                  placeholder={getTranslation('custom_address_placeholder', language) || (isIt ? 'Inserisci un indirizzo' : 'Enter an address')}
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
            <div className="text-center py-8 text-sm text-gray-400 font-medium">
              {isIt ? 'Scegli il punto di partenza per scansionare il percorso.' : 'Choose a starting point to scan the route.'}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-gray-500 font-medium">{isIt ? 'Scansione percorso in corso...' : 'Scanning route...'}</p>
            </div>
          ) : scanError ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-500 font-bold">{isIt ? 'Errore durante la scansione del percorso.' : 'Route scan failed.'}</p>
              <p className="text-xs text-gray-400 mt-1">{isIt ? 'Puoi comunque avviare la navigazione.' : 'You can still start navigating.'}</p>
            </div>
          ) : routePois.length === 0 ? (
            <div className="text-center py-8">
              <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{isIt ? 'Nessun POI sul percorso' : 'No POIs on the route'}</h3>
              <p className="text-gray-500 text-sm">{isIt ? 'Non abbiamo trovato luoghi di interesse a meno di 300 metri dal tuo tragitto stradale.' : 'No points of interest found within 300 meters of your route.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 p-3 rounded-xl">
                {isIt
                  ? 'Ecco i luoghi che incontrerai lungo la strada. L\'audioguida partirà in automatico solo per quelli selezionati.'
                  : 'These are the places you will pass along the way. The audio guide will start automatically only for the selected ones.'}
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
            {isIt ? 'Salta' : 'Skip'}
          </button>
          <button
            onClick={handleStart}
            disabled={!origin || loading}
            className="w-2/3 py-4 rounded-2xl bg-gradient-to-r from-primary to-orange-500 text-white font-bold text-lg shadow-lg shadow-primary/30 flex items-center justify-center space-x-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Navigation className="w-5 h-5 fill-white" />
            <span>{loading ? (isIt ? 'Attendi...' : 'Wait...') : (isIt ? 'Inizia Navigazione' : 'Start Navigation')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
