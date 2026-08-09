import React, { useState, useEffect } from 'react';
import { Download, Trash2, MapPin, Search, Loader2, RefreshCw, Radar } from 'lucide-react';
import { OfflineMapArea, saveOfflineMapArea, getOfflineMapAreasList, deleteOfflineMapArea } from '../lib/offlineStorage';
import { prefetchTilesForArea, removeTilesForArea, planTilesForArea } from '../lib/offlineTiles';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { getTranslation, Language } from '../lib/i18n';
import { insertAutoPois } from '../services/poiRepository';
import {
  isNativeOfflineSupported,
  listOfflinePackages,
  deleteOfflinePackage,
  syncOfflinePackage,
  downloadOfflinePackage,
  onPackageProgress,
  checkOfflineVoice,
  openTtsVoiceInstall,
  makeOfflinePackageId,
  OfflinePackageInfo,
} from '../services/offlinePackageService';
import DayPassCard from './DayPassCard';

interface OfflineMapsTabProps {
  language: Language;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OfflineMapsTab({ language }: OfflineMapsTabProps) {
  const isNative = isNativeOfflineSupported();
  const [areas, setAreas] = useState<OfflineMapArea[]>([]);
  const [packages, setPackages] = useState<OfflinePackageInfo[]>([]);
  const [searchCity, setSearchCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(50);
  const [isDownloading, setIsDownloading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState('');
  // Autocomplete MONDIALE (stessa UX della ricerca destinazioni degli
  // itinerari: Mapbox, debounce, dropdown). selectedPlace conserva le
  // coordinate del suggerimento scelto per saltare il geocoding al download.
  const [suggestions, setSuggestions] = useState<Array<{ id: string; description: string; lat: number; lon: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; lat: number; lon: number } | null>(null);
  useEffect(() => {
    loadAreas();
  }, []);

  useEffect(() => {
    if (!showSuggestions || searchCity.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        // Proxy server-side (/api/geocode): niente token Mapbox nel bundle.
        const res = await fetch(getApiUrl(
          `/api/geocode?q=${encodeURIComponent(searchCity)}`
          + `&lang=${language.toLowerCase()}&limit=5&types=place,locality,region`
        ));
        const data = await res.json();
        setSuggestions(
          (data.features || []).map((f: any) => ({
            id: f.id,
            description: f.description,
            lat: f.lat,
            lon: f.lon,
          }))
        );
      } catch {
        setSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchCity, showSuggestions, language]);

  const loadAreas = async () => {
    if (isNative) {
      setPackages(await listOfflinePackages());
    } else {
      const list = await getOfflineMapAreasList();
      setAreas(list);
    }
  };

  /** Geocoding MONDIALE: suggerimento già scelto → Mapbox → proxy Nominatim
   *  (ora senza filtro Italia lato server). */
  const geocodeCity = async (): Promise<{ lat: number; lon: number; name: string }> => {
    const query = searchCity.trim();
    if (selectedPlace && selectedPlace.name === query) {
      return selectedPlace;
    }
    try {
      // Proxy server-side; se non risponde si prosegue col fallback Nominatim.
      const res = await fetch(getApiUrl(
        `/api/geocode?q=${encodeURIComponent(query)}`
        + `&lang=${language.toLowerCase()}&limit=1&types=place,locality,region,country`
      ));
      const data = await res.json();
      const f = data.features?.[0];
      if (f && Number.isFinite(f.lat) && Number.isFinite(f.lon)) {
        return { lat: f.lat, lon: f.lon, name: String(f.description || query).split(',')[0] };
      }
    } catch { /* fallback Nominatim sotto */ }
    // getApiUrl: su app nativa l'URL relativo punta a https://localhost → 404.
    const res = await fetch(getApiUrl(`/api/nominatim/search?q=${encodeURIComponent(query)}&format=json&limit=1`));
    const data = await res.json();
    if (!data || data.length === 0) {
      throw new Error('Città non trovata. Riprova con un nome più preciso.');
    }
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      name: data[0].display_name.split(',')[0],
    };
  };

  /**
   * Storage: chiede la persistenza (evita che il browser spazzi via tile e
   * POI offline sotto pressione di spazio) e stima lo spazio richiesto
   * (~tile × 30KB + 5MB di dati POI). Se supera quello disponibile, avvisa
   * l'utente e chiede conferma. Ritorna false solo se l'utente annulla.
   */
  const ensureStorageForDownload = async (lat: number, lon: number): Promise<boolean> => {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage) return true;

      // persist(): best effort, il browser può rifiutare senza errore.
      if (navigator.storage.persist) {
        try {
          const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
          if (!already) await navigator.storage.persist();
        } catch { /* best effort */ }
      }

      if (navigator.storage.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const tileCount = planTilesForArea(lat, lon, radiusKm).length;
        const estimatedBytes = tileCount * 30 * 1024 + 5 * 1024 * 1024;
        const available = quota - usage;
        if (quota > 0 && estimatedBytes > available) {
          return confirm(
            `Spazio quasi esaurito: il download richiede circa ${formatBytes(estimatedBytes)} ` +
            `ma sul dispositivo ne restano ${formatBytes(Math.max(0, available))}. ` +
            'Il download potrebbe risultare incompleto. Vuoi procedere comunque?'
          );
        }
      }
    } catch {
      // Una stima fallita non deve mai bloccare il download.
    }
    return true;
  };

  /** Scarica lo sfondo mappa (tile) dell'area nella cache del service worker:
   *  senza questo la mappa offline restava un riquadro vuoto. */
  const prefetchTiles = async (lat: number, lon: number) => {
    setDownloadProgress('Scaricamento sfondo mappa...');
    try {
      const result = await prefetchTilesForArea(lat, lon, radiusKm, (p) => {
        setDownloadProgress(`Scaricamento sfondo mappa: ${p.done}/${p.total} tile...`);
      });
      return result;
    } catch (e) {
      console.warn('Prefetch tile fallito (la mappa offline mostrerà solo i pin):', e);
      return { done: 0, failed: 0, total: 0 };
    }
  };

  /**
   * PERCORSO NATIVO (Android): pacchetto area completo — testi + geofencing
   * hardware a display spento, voce di sistema, vista radar. Download
   * GRATUITO (freemium): si paga solo l'ascolto (per-listen o Day Pass).
   */
  const handleDownloadNative = async () => {
    setIsDownloading(true);
    setDownloadProgress('Ricerca città...');
    let unsub: (() => void) | null = null;
    try {
      const city = await geocodeCity();

      // Persistenza storage + verifica spazio (l'utente può annullare qui).
      if (!(await ensureStorageForDownload(city.lat, city.lon))) return;

      // Verifica voce TTS ORA, con la rete ancora viva: offline la voce di
      // sistema è l'unica sorgente audio.
      setDownloadProgress('Verifica voce offline...');
      const voice = await checkOfflineVoice(language);
      if (!voice.available || !voice.offlineVoice) {
        const goInstall = confirm(
          'La voce di sistema per la tua lingua non risulta installata per l\'uso offline. ' +
          'Vuoi aprire le impostazioni per scaricarla ora (finché sei connesso)? ' +
          'Puoi comunque proseguire: senza voce offline i luoghi verranno solo notificati.'
        );
        if (goInstall) {
          await openTtsVoiceInstall();
          return; // l'utente rilancia il download dopo l'installazione
        }
      }

      const pkgId = makeOfflinePackageId(city.name, radiusKm);
      unsub = onPackageProgress(pkgId, (p) => {
        if (p.phase === 'downloading') {
          setDownloadProgress(p.total > 0 ? `Scaricati ${p.done}/${p.total} luoghi...` : `Scaricati ${p.done} luoghi...`);
        }
      });

      setDownloadProgress(`Download pacchetto ${city.name} (${radiusKm} km)...`);
      const pkg = await downloadOfflinePackage({
        id: pkgId,
        name: `${city.name} (${radiusKm}km)`,
        lat: city.lat,
        lon: city.lon,
        radiusKm,
        language,
      });

      // Sfondo mappa per la WebView (best effort: offline la vista principale
      // è il radar, ma se il SW è attivo anche la mappa resta consultabile).
      await prefetchTiles(city.lat, city.lon);

      await loadAreas();
      setSearchCity('');
      setSelectedPlace(null);
      notify(
        `Pacchetto "${pkg.name}" pronto: ${pkg.poiCount} luoghi (${formatBytes(pkg.sizeBytes)}).\n\n` +
        'Offline l\'app userà la vista radar e la voce di sistema: download istantaneo e zero ingombro. ' +
        'L\'audioguida parte da sola quando ti avvicini a un luogo, anche a schermo spento.'
      );
    } catch (e: any) {
      console.error(e);
      notify(e?.message || 'Errore durante il download del pacchetto');
    } finally {
      unsub?.();
      setIsDownloading(false);
      setDownloadProgress('');
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const pkg = await syncOfflinePackage(id);
      await loadAreas();
      notify(`Aggiornato: ${pkg.poiCount} luoghi nel pacchetto.`);
    } catch (e: any) {
      notify(e?.message || 'Sincronizzazione fallita. Riprova quando sei online.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeletePackage = async (id: string) => {
    if (confirm('Vuoi eliminare questo pacchetto offline dal dispositivo?')) {
      const pkg = packages.find(p => p.id === id);
      await deleteOfflinePackage(id);
      // Cleanup anche delle tile di sfondo (risparmiando quelle condivise
      // con gli altri pacchetti ancora installati).
      if (pkg) {
        const keep = new Set<string>();
        packages.filter(p => p.id !== id)
          .forEach(p => planTilesForArea(p.centerLat, p.centerLon, p.radiusKm).forEach(u => keep.add(u)));
        await removeTilesForArea(pkg.centerLat, pkg.centerLon, pkg.radiusKm, keep);
      }
      await loadAreas();
    }
  };

  /** PERCORSO WEB/PWA: flusso Dexie storico (niente geofencing hardware). */
  const handleDownloadWeb = async () => {
    setIsDownloading(true);
    setDownloadProgress('Ricerca città...');

    try {
      const city = await geocodeCity();
      const centerLat = city.lat;
      const centerLon = city.lon;
      const cityName = city.name;

      // Persistenza storage + verifica spazio (l'utente può annullare qui).
      if (!(await ensureStorageForDownload(centerLat, centerLon))) return;

      setDownloadProgress(`Scaricamento POI nel raggio di ${radiusKm}km da ${cityName}...`);

      // 2. Chiama l'Edge Function o usa rpc per trovare i POI (Supabase)
      let pois = [];
      try {
        const { data, error } = await supabase.rpc('get_pois_within_radius', {
          center_lat: centerLat,
          center_lon: centerLon,
          radius_km: radiusKm
        });
        if (error) {
          console.warn("Supabase RPC error (schema cache or missing function), falling back to Overpass:", error.message);
        } else if (data) {
          pois = data;
        }
      } catch (e) {
        console.warn("Supabase RPC failed, continuing with Overpass only");
      }

      let poiList: any[] = pois || [];

      // 2b. Record COMPLETI da shared_pois (descrizioni + audio_script):
      // la RPC ritorna solo i campi base; per l'ascolto offline delle guide
      // servono anche i testi. Merge per id: i campi completi vincono.
      try {
        setDownloadProgress('Scaricamento testi e audioguide della zona...');
        const deltaLat = radiusKm / 111;
        const deltaLon = radiusKm / (111 * Math.cos(centerLat * (Math.PI / 180)) || 1);
        const { data: fullRows, error: fullErr } = await supabase
          .from('shared_pois')
          .select('id,name,lat,lon,category,status,is_gem,description,description_short,description_long,description_ai,audio_script,practical_info,image_url,photo_url,teaser_text_it')
          .gte('lat', centerLat - deltaLat)
          .lte('lat', centerLat + deltaLat)
          .gte('lon', centerLon - deltaLon)
          .lte('lon', centerLon + deltaLon)
          .in('status', ['verified', 'auto', 'approved', 'draft'])
          .not('name', 'is', null)
          .limit(3000);
        if (!fullErr && fullRows && fullRows.length > 0) {
          const byId = new Map<string, any>(poiList.map((p: any) => [String(p.id), p]));
          for (const row of fullRows as any[]) {
            byId.set(String(row.id), { ...byId.get(String(row.id)), ...row });
          }
          poiList = Array.from(byId.values());
        }
      } catch (e) {
        console.warn('Fetch record completi fallito, procedo con i soli pin:', e);
      }
      const existingIds = new Set(poiList.map(p => p.id));

      // 3. Integrare Overpass API (per la copertura globale dove Supabase manca)
      setDownloadProgress(`Integrazione mappa globale (potrebbe richiedere fino a 1 minuto)...`);
      try {
        // Calcolo manuale bounding box per il raggio
        // Limita il raggio di Overpass a max 20km per evitare timeout su query immense (mentre da Supabase peschiamo tutto)
        const overpassRadius = Math.min(radiusKm, 20);
        const latDelta = overpassRadius / 111.32;
        const lonDelta = overpassRadius / (111.32 * Math.cos(centerLat * (Math.PI / 180)));
        const south = centerLat - latDelta;
        const north = centerLat + latDelta;
        const west = centerLon - lonDelta;
        const east = centerLon + lonDelta;

        const overpassQuery = `
          [out:json][timeout:90];
          (
            nwr["tourism"~"^(museum|gallery|viewpoint|artwork|attraction|theme_park|zoo|winery)$"](${south},${west},${north},${east});
            nwr["historic"](${south},${west},${north},${east});
            nwr["amenity"="place_of_worship"](${south},${west},${north},${east});
            nwr["amenity"~"^(restaurant|cafe|bar|pub|pharmacy|drinking_water|hospital|toilets|marketplace)$"](${south},${west},${north},${east});
            nwr["place"="square"](${south},${west},${north},${east});
            nwr["highway"="pedestrian"]["area"="yes"](${south},${west},${north},${east});
          );
          out center;
        `;

        const overpassMirrors = [
          "https://overpass-api.de/api/interpreter",
          "https://lz4.overpass-api.de/api/interpreter",
          "https://z.overpass-api.de/api/interpreter"
        ];

        let overpassRes = null;
        for (const mirror of overpassMirrors) {
          try {
            const tempRes = await fetch(mirror, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `data=${encodeURIComponent(overpassQuery)}`
            });
            if (tempRes.ok) {
              overpassRes = tempRes;
              break;
            }
          } catch(e) {}
        }

        if (overpassRes) {
          const overpassData = await overpassRes.json();
          const overpassElements = overpassData.elements || [];

          for (const el of overpassElements) {
            const osmId = `osm-${el.id}`;
            if (existingIds.has(osmId)) continue; // Già presente in Supabase

            const name = el.tags?.name || el.tags?.["name:it"] || el.tags?.["name:en"];
            if (!name) continue;

            if (el.tags?.place && ["village", "town", "city", "locality", "hamlet", "suburb", "neighborhood"].includes(el.tags.place)) {
                continue;
            }

            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;
            if (!lat || !lon) continue;

            let cat = "monumenti";
            const hist = el.tags?.historic || "";
            const amenity = el.tags?.amenity || "";
            const tourism = el.tags?.tourism || "";
            const building = el.tags?.building || "";
            if (amenity === "place_of_worship" || building.match(/church|cathedral|chapel|basilica|mosque|temple|synagogue/) || hist.match(/church|monastery|abbey|convent/)) cat = "chiese";
            else if (tourism.match(/museum|gallery/)) cat = "musei";
            else if (tourism === "viewpoint" || el.tags?.natural === "peak") cat = "panorami";
            else if (amenity.match(/restaurant|cafe|fast_food|bar|pub|ice_cream/)) cat = "locali";
            else if (amenity.match(/hospital|pharmacy|police|library|post_office|drinking_water|taxi|toilets/)) cat = "utilita";

            poiList.push({
              id: osmId,
              lat,
              lon,
              name,
              category: cat,
              baseCategory: cat,
              isFromDb: false,
              is_gem: !!(el.tags?.wikidata || el.tags?.wikipedia),
              status: "verified"
            });
          }

          // Salva in Supabase i nuovi POI trovati in modo che siano permanenti!
          const newPoisToInsert = poiList
            .filter(p => !existingIds.has(p.id) && p.id.startsWith('osm-'))
            .map(p => ({
               osm_id: p.id.replace('osm-', ''),
               name: p.name,
               lat: p.lat,
               lon: p.lon,
               category: p.category as any
            }));

          if (newPoisToInsert.length > 0) {
            setDownloadProgress(`Salvataggio di ${newPoisToInsert.length} nuovi luoghi nel database globale...`);
            await insertAutoPois(newPoisToInsert).catch(e => console.warn("Errore salvataggio auto POI:", e));
          }
        }
      } catch (err) {
        console.error("Overpass offline fetch error:", err);
      }

      const newArea: OfflineMapArea = {
        id: `${cityName.toLowerCase().replace(/\s+/g, '_')}_${radiusKm}km`,
        name: `${cityName} (${radiusKm}km)`,
        center: { lat: centerLat, lon: centerLon },
        radiusKm,
        date: Date.now(),
        poiCount: poiList.length
      };

      await saveOfflineMapArea(newArea, poiList);

      // 4. Sfondo mappa: senza le tile in cache la mappa offline era vuota.
      const tiles = await prefetchTiles(centerLat, centerLon);

      await loadAreas();
      setSearchCity('');
      setSelectedPlace(null);
      notify(
        `Mappa di ${cityName} scaricata con successo!\n` +
        `${poiList.length} POI salvati offline` +
        (tiles.total > 0 ? ` + ${tiles.done} tile di sfondo mappa.` : '.') +
        `\n\nPer verificare: attiva la modalità aereo e riapri la mappa sulla zona di ${cityName} — sfondo e pin restano visibili.`
      );

    } catch (e: any) {
      console.error(e);
      notify(e.message || "Errore durante il download");
    } finally {
      setIsDownloading(false);
      setDownloadProgress('');
    }
  };

  const handleDownload = () => {
    if (!searchCity.trim()) return;
    if (isNative) handleDownloadNative();
    else handleDownloadWeb();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Vuoi eliminare questa mappa offline dal dispositivo?")) {
      const area = areas.find(a => a.id === id);
      await deleteOfflineMapArea(id);
      if (area?.center) {
        // Le tile condivise con le altre aree ancora scaricate restano.
        const keep = new Set<string>();
        areas.filter(a => a.id !== id && a.center)
          .forEach(a => planTilesForArea(a.center.lat, a.center.lon, a.radiusKm).forEach(u => keep.add(u)));
        await removeTilesForArea(area.center.lat, area.center.lon, area.radiusKm, keep);
      }
      await loadAreas();
    }
  };

  return (
    <div className="p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-2 font-display">Mappe Offline</h2>
      {isNative ? (
        <p className="text-gray-600 mb-6 text-sm">
          Scarica il pacchetto di un'area (raggio {radiusKm} km): luoghi, teaser e audioguide complete in formato testo.
          Offline l'app passa alla <strong>vista radar</strong> e alla <strong>voce di sistema</strong> — download istantaneo
          e zero ingombro — e l'audioguida parte da sola quando ti avvicini a un luogo, anche a schermo spento.
          Il download del pacchetto è gratuito; si paga solo l'ascolto delle audioguide.
        </p>
      ) : (
        <p className="text-gray-600 mb-6 text-sm">
          Scarica i luoghi di una città (in tutto il mondo) per avere pin, informazioni di base e lo sfondo della mappa disponibili anche senza rete. Per verificare che funzioni: attiva la modalità aereo e riapri la mappa sulla zona scaricata.
        </p>
      )}

      {/* WIP Day Pass (solo app nativa: l'enforcement vive nel servizio Kotlin) */}
      {isNative && (
        <div className="mb-4">
          <DayPassCard />
        </div>
      )}

      {/* Sezione di Ricerca e Download */}
      <div className="bg-gray-50 rounded-2xl p-4 mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Nuova Area</h3>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cerca una città nel mondo (es. Roma, Parigi, Tokyo)"
              value={searchCity}
              onChange={(e) => { setSearchCity(e.target.value); setSelectedPlace(null); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
              onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
            />
            {/* Dropdown suggerimenti (stessa UX della ricerca destinazioni degli itinerari) */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const name = s.description.split(',')[0];
                      setSearchCity(name);
                      setSelectedPlace({ name, lat: s.lat, lon: s.lon });
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                  >
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={isDownloading || !searchCity.trim()}
            className="bg-black text-white p-3 rounded-xl hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center shrink-0"
          >
            {isDownloading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raggio</span>
          {[50, 100, 200].map(km => (
            <button
              key={km}
              onClick={() => setRadiusKm(km)}
              disabled={isDownloading}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                radiusKm === km ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {km} km
            </button>
          ))}
        </div>
        {isDownloading && (
          <p className="text-sm text-blue-600 mt-3 animate-pulse flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {downloadProgress}
          </p>
        )}
      </div>

      {/* Lista pacchetti nativi (Android) */}
      {isNative ? (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Pacchetti Scaricati ({packages.length})</h3>
          {packages.length === 0 ? (
            <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
              <Radar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Nessun pacchetto offline. Cerca una città e scarica l'area per usare l'audioguida senza rete.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packages.map(pkg => (
                <div key={pkg.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  {/* Tocca il pacchetto → mappa già centrata su tile e POI scaricati (anche offline) */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer active:opacity-70"
                    onClick={() => window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: pkg.centerLat, lon: pkg.centerLon, zoom: 13 } }))}
                  >
                    <h4 className="font-semibold text-gray-900">{pkg.name}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                      <span>{pkg.poiCount} luoghi</span>
                      <span>{formatBytes(pkg.sizeBytes)}</span>
                      <span>{pkg.downloadedAt ? new Date(pkg.downloadedAt).toLocaleDateString() : ''}</span>
                      {pkg.status === 'error' && <span className="text-red-500 font-medium">download incompleto</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: pkg.centerLat, lon: pkg.centerLon, zoom: 13 } }))}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Apri sulla mappa (funziona anche offline)"
                    >
                      <MapPin className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleSync(pkg.id)}
                      disabled={syncingId === pkg.id}
                      className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Aggiorna (solo modifiche)"
                    >
                      {syncingId === pkg.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Elimina dal dispositivo"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Lista Aree Scaricate (web/PWA) */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Aree Scaricate ({areas.length})</h3>
          {areas.length === 0 ? (
            <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
              <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Nessuna mappa offline. Cerca una città per scaricare i POI nel raggio di 100km.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {areas.map(area => (
                <div key={area.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  {/* Tocca l'area → mappa già centrata su tile e POI scaricati (anche offline) */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer active:opacity-70"
                    onClick={() => window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: area.center.lat, lon: area.center.lon, zoom: 13 } }))}
                  >
                    <h4 className="font-semibold text-gray-900">{area.name}</h4>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>{area.poiCount} Pin salvati</span>
                      <span>{new Date(area.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: area.center.lat, lon: area.center.lon, zoom: 13 } }))}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Apri sulla mappa (funziona anche offline)"
                    >
                      <MapPin className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(area.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Elimina dal dispositivo"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
