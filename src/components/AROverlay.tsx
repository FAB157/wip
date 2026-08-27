import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, X, MapPin, CameraOff, Loader2 } from 'lucide-react';
import { calculateDistance, calculateBearing, lowPassFilter } from '../lib/arMath';
import { supabase } from '../lib/supabase';
import { locationService } from '../services/locationService';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface AROverlayProps {
  onClose: () => void;
  onPoiClick: (poi: any) => void;
}

export default function AROverlay({ onClose, onPoiClick }: AROverlayProps) {
  // Nessuna prop `language`: si legge la stessa chiave localStorage di App.tsx.
  const lingua = linguaCorrente();
  const t = (k: string) => getTranslation(k, lingua);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [heading, setHeading] = useState<number>(0);
  const [pois, setPois] = useState<any[]>([]);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [needsIosPermission, setNeedsIosPermission] = useState(false);
  const [gps, setGps] = useState<{lat: number, lon: number} | null>(null);
  const [poisLoaded, setPoisLoaded] = useState(false);
  // La bussola è "disponibile" SOLO quando arrivano eventi di orientamento
  // reali. Se manca (sensore assente, permesso negato, tap su "Salta") l'AR
  // deve passare a 360° e mostrare TUTTI i POI attorno, non solo ±45° da Nord.
  const [compassAvailable, setCompassAvailable] = useState(false);

  const headingRef = useRef(0);
  const lastRenderedHeadingRef = useRef(0);
  // Timestamp dell'ultimo evento di orientamento valido: alimenta il watchdog
  // che riporta a 360° se la bussola smette di aggiornare (heading fermo >3s).
  const lastOrientationTsRef = useRef(0);
  // Ultima posizione per cui abbiamo caricato i POI: serve a ricaricare
  // camminando (>200m) senza rifare la query a ogni micro-spostamento GPS.
  const lastPoiLoadRef = useRef<{ lat: number; lon: number } | null>(null);
  // Cleanup del listener bussola avviato dal percorso iOS (dopo il tap di
  // consenso): senza questo ref la funzione di rimozione veniva scartata e
  // ogni apertura dell'AR accumulava listener deviceorientation a ~60Hz.
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  // Campo visivo molto largo (90°) per tollerare errori della bussola
  const FOV = 90;

  // ─── Listener orientamento ───────────────────────────────────────────────
  const startOrientationListener = useCallback(() => {
    setPermissionsGranted(true);
    
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let alpha = event.alpha;
      const webkitCompassHeading = (event as any).webkitCompassHeading;
      
      // webkitCompassHeading è molto più accurato su iOS (già relativo al Nord)
      if (webkitCompassHeading !== undefined && webkitCompassHeading !== null) {
        alpha = webkitCompassHeading;
      } else if (alpha !== null) {
        // Android: alpha è anticlockwise da N, invertiamo
        alpha = (360 - alpha) % 360;
      }
      
      if (alpha !== null) {
        // Evento di orientamento reale ricevuto: la bussola è disponibile.
        lastOrientationTsRef.current = Date.now();
        setCompassAvailable(true);
        const smoothed = lowPassFilter(alpha, headingRef.current, 0.12);
        headingRef.current = smoothed;
        // Re-render solo per variazioni percettibili: gli eventi arrivano a
        // ~60Hz e un setState per ognuno faceva "ballare" le etichette
        // (oltre a ridisegnare tutto continuamente).
        let delta = Math.abs(smoothed - lastRenderedHeadingRef.current);
        if (delta > 180) delta = 360 - delta;
        if (delta > 0.7) {
          lastRenderedHeadingRef.current = smoothed;
          setHeading(smoothed);
        }
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    // Cleanup: ritorna funzione di rimozione listener
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  // ─── Richiesta permesso iOS ───────────────────────────────────────────────
  const requestOrientationPermission = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
        if (permissionState === 'granted') {
          orientationCleanupRef.current = startOrientationListener();
        } else {
          // Permesso negato: mostriamo comunque i POI con FOV 360°
          console.warn('Permesso bussola negato, uso FOV 360°');
          setPermissionsGranted(true);
        }
      } catch (e) {
        console.error(e);
        setPermissionsGranted(true); // Procedi comunque
      }
    } else {
      orientationCleanupRef.current = startOrientationListener();
    }
    setNeedsIosPermission(false);
  };

  // ─── Caricamento POI vicini (raggio 5 km) ────────────────────────────────
  // Estratto in useCallback così può essere richiamato camminando (>200m) e
  // non solo una volta al mount: prima l'AR restava "congelata" sui POI del
  // punto di partenza anche dopo chilometri.
  const loadPois = useCallback(async (lat: number, lon: number) => {
    // Categorie importanti da mostrare in AR (evitiamo ristoranti, utilità, ecc)
    const importantCategories = ['castle', 'museum', 'musei', 'monument', 'monumenti', 'church', 'chiese', 'viewpoint', 'panorami', 'attraction', 'gemme'];
    try {
      const { data, error } = await supabase.rpc('nearby_pois', {
        p_lat: lat,
        p_lon: lon,
        radius_m: 5000,
        limit_num: 50
      });

      if (error) {
        console.warn('[AROverlay] RPC nearby_pois error:', error.message);
        // Fallback: query diretta su shared_pois
        const delta = 5000 / 111000;
        const { data: fallback } = await supabase
          .from('shared_pois')
          .select('id, name, nome, lat, lon, category, status, photo_url, image_url')
          .gte('lat', lat - delta)
          .lte('lat', lat + delta)
          .gte('lon', lon - delta)
          .lte('lon', lon + delta)
          .in('status', ['verified', 'auto', 'approved'])
          .in('category', importantCategories)
          .not('name', 'is', null)
          .limit(50);

        if (fallback && fallback.length > 0) {
          console.log(`[AROverlay] Fallback: ${fallback.length} POI caricati`);
          setPois(fallback);
        } else {
          console.warn('[AROverlay] Nessun POI trovato nel raggio di 5000m');
        }
      } else if (data && data.length > 0) {
        // La RPC nearby_pois restituisce solo id/nome/lat/lon/distanza: NON
        // espone `category`. Si filtra solo dove la categoria è presente.
        const mapped = data.map((p: any) => ({ ...p, name: p.name ?? p.nome }));
        const filtered = mapped.filter((p: any) =>
          !p.category || importantCategories.includes(String(p.category).toLowerCase())
        );
        console.log(`[AROverlay] RPC: ${filtered.length} POI caricati`);
        setPois(filtered);
      } else {
        console.warn('[AROverlay] RPC OK ma 0 POI nel raggio di 5000m');
      }
    } catch (e) {
      console.warn('[AROverlay] Errore caricamento POI:', e);
    } finally {
      lastPoiLoadRef.current = { lat, lon };
      setPoisLoaded(true);
    }
  }, []);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cleanupOrientation: (() => void) | null = null;
    
    // 1. Avvia la fotocamera
    async function startCamera() {
      setIsLoading(true);
      setCameraError(null);
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Video play failed:", e));
            setStreamActive(true);
            setIsLoading(false);
          };
        }
      } catch (err: any) {
        console.error("Errore fotocamera AR:", err);
        setCameraError(err.message || t('vr_a_ar_camera_denied'));
        setIsLoading(false);
        setStreamActive(false);
      }
    }
    startCamera();

    // 2. Ottieni posizione GPS e carica POI vicini
    async function initLocation() {
      try {
        // Prima prova il locationService centrale
        let lat: number;
        let lon: number;

        const lastLoc = locationService.getLastLocation();
        if (lastLoc && lastLoc.latitude && lastLoc.longitude) {
          lat = lastLoc.latitude;
          lon = lastLoc.longitude;
        } else {
          const pos: any = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000
            })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }

        setGps({ lat, lon });
        console.log('[AROverlay] GPS ottenuto:', lat, lon);

        // Carica POI vicini (raggio 5000 m)
        await loadPois(lat, lon);
      } catch (e) {
        console.warn("[AROverlay] GPS non disponibile:", e);
        setPoisLoaded(true);
      }
    }
    initLocation();

    // 3. Avvia il listener orientamento
    //    Su iOS richiede click esplicito, su Android/Web partiamo subito
    const isIOS = typeof (DeviceOrientationEvent as any).requestPermission === 'function';
    if (isIOS) {
      // Mostriamo il modal di consenso iOS
      setNeedsIosPermission(true);
    } else {
      // Android / desktop: avviamo direttamente
      cleanupOrientation = startOrientationListener();
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      if (cleanupOrientation) {
        cleanupOrientation();
      }
      // Percorso iOS (listener avviato dopo il tap di consenso)
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
    };
  }, [startOrientationListener, loadPois]);

  // ─── GPS live: distanze e posizioni etichette aggiornate camminando ──────
  // L'evento wip-location-update c'è solo con la guida attiva, quindi teniamo
  // anche un watchPosition autonomo. Aggiorniamo lo stato solo per spostamenti
  // reali (>3m) per non ridisegnare a ogni oscillazione del GPS.
  useEffect(() => {
    const applyFix = (lat: number, lon: number) => {
      setGps(prev => {
        if (prev && calculateDistance(prev.lat, prev.lon, lat, lon) < 3) return prev;
        return { lat, lon };
      });
      // Ricarica i POI se ci siamo spostati di oltre 200m dall'ultimo caricamento:
      // camminando si entra in aree nuove e i POI del punto di partenza non
      // bastano più.
      const last = lastPoiLoadRef.current;
      if (last && calculateDistance(last.lat, last.lon, lat, lon) > 200) {
        loadPois(lat, lon);
      }
    };
    const onLoc = (e: any) => {
      const { lat, lon } = e.detail || {};
      if (typeof lat === 'number' && typeof lon === 'number') applyFix(lat, lon);
    };
    window.addEventListener('wip-location-update', onLoc);
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => applyFix(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000 }
      );
    } catch { /* geolocation assente */ }
    return () => {
      window.removeEventListener('wip-location-update', onLoc);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [loadPois]);

  // ─── Watchdog bussola ────────────────────────────────────────────────────
  // Se non arriva alcun evento di orientamento valido da oltre 3s (sensore
  // che si blocca, heading fermo) la bussola torna "non disponibile" → 360°.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastOrientationTsRef.current && Date.now() - lastOrientationTsRef.current > 3000) {
        setCompassAvailable(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // ─── Determina se usare FOV ristretto o 360° ─────────────────────────────
  // Bussola disponibile → FOV ristretto (punta il telefono). Bussola assente,
  // permesso negato o "Salta" → 360° (tutti i POI attorno).
  const effectiveFOV = compassAvailable ? FOV : 360;

  return (
    <div className="absolute inset-0 bg-[#0a0a0a] z-50 overflow-hidden flex flex-col">
      {/* Video Stream Container */}
      <div className="absolute inset-0 z-0">
        {!cameraError ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-[#151619]">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
              <CameraOff className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-secondary font-black text-xl mb-2">{t('vr_a_ar_camera_error_title')}</h3>
            <p className="text-secondary/60 text-sm font-medium mb-6">{t('vr_a_ar_camera_error_desc')}</p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-surface/10 text-secondary font-black text-sm rounded-2xl hover:bg-surface/20 transition-colors"
            >
              {t('vr_a_ar_back')}
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && !cameraError && (
        <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-white/60 text-xs font-black uppercase tracking-widest">{t('vr_a_ar_init')}</p>
        </div>
      )}

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-10 flex justify-between items-start">
        <div className="text-white">
          <h2 className="font-black text-lg flex items-center gap-2">
            <Compass className={`w-5 h-5 ${compassAvailable ? 'text-emerald-400' : 'text-amber-400'}`} />
            Radar AR
          </h2>
          <p className="text-xs text-white/80 font-medium">
            {t('vr_a_ar_compass')}: {Math.round(heading)}° | POI: {pois.length}
          </p>
        </div>
        <button onClick={onClose} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Modal consenso iOS bussola */}
      <AnimatePresence>
        {needsIosPermission && streamActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-20 p-6 bg-black/40 backdrop-blur-sm"
          >
            <div className="bg-white rounded-3xl p-6 text-center max-w-sm">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Compass className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-black mb-2">{t('vr_a_ar_enable_compass')}</h3>
              <p className="text-sm text-gray-500 mb-6 font-medium">{t('vr_a_ar_compass_desc')}</p>
              <button 
                onClick={requestOrientationPermission}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black shadow-lg"
              >
                {t('vr_a_ar_allow')}
              </button>
              <button
                onClick={() => { setNeedsIosPermission(false); setPermissionsGranted(true); }}
                className="w-full py-3 mt-2 text-gray-500 text-sm font-bold"
              >
                {t('vr_a_ar_skip')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messaggio "caricamento POI" */}
      <AnimatePresence>
        {streamActive && !poisLoaded && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-24 left-0 right-0 flex justify-center z-20"
          >
            <div className="bg-black/60 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
              <span className="text-white text-xs font-bold">{t('vr_a_ar_loading_pois')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messaggio "nessun POI" */}
      <AnimatePresence>
        {streamActive && poisLoaded && pois.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-24 left-0 right-0 flex justify-center z-20"
          >
            <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-3 flex items-center gap-3 mx-6">
              <MapPin className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="text-white text-xs font-bold">{t('vr_a_ar_no_pois')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Rendering dei POI (Pin fluttuanti) ─────────────────────────────── */}
      {/* Mostriamo i POI appena GPS disponibile, indipendentemente dalla bussola */}
      {gps && pois.length > 0 && (() => {
        const currentFOV = effectiveFOV;

        // 1. Proietta i POI nel campo visivo corrente
        const projected: { poi: any; dist: number; leftPercent: number }[] = [];
        for (const poi of pois) {
          const poiLat = typeof poi.lat === 'number' ? poi.lat : parseFloat(poi.lat);
          const poiLon = typeof poi.lon === 'number' ? poi.lon : parseFloat(poi.lon);
          if (isNaN(poiLat) || isNaN(poiLon)) continue;

          const dist = calculateDistance(gps.lat, gps.lon, poiLat, poiLon);
          const bearing = calculateBearing(gps.lat, gps.lon, poiLat, poiLon);
          let diff = bearing - heading;
          if (diff < -180) diff += 360;
          else if (diff > 180) diff -= 360;
          if (Math.abs(diff) > currentFOV / 2) continue;

          projected.push({ poi, dist, leftPercent: ((diff + currentFOV / 2) / currentFOV) * 100 });
        }

        // 2. Vicini prima: sono i più rilevanti, vincono i conflitti di spazio
        //    e restano sopra nelle sovrapposizioni (zIndex). Max 12 etichette
        //    per non trasformare le zone dense in un muro di pin.
        projected.sort((a, b) => a.dist - b.dist);
        const visible = projected.slice(0, 12);

        // 3. Prospettiva + anti-sovrapposizione: vicino = grande e in basso,
        //    lontano = piccolo e in alto; se due etichette cadono nello stesso
        //    punto dello schermo, la più lontana viene spostata più in alto.
        const placed: { left: number; top: number }[] = [];
        const items = visible.map((v) => {
          const scale = Math.max(0.6, 1 - (v.dist / 5000) * 0.4);
          let top = 62 - Math.min(v.dist / 5000, 1) * 28;
          let guard = 0;
          while (
            guard < 5 &&
            placed.some(p => Math.abs(p.left - v.leftPercent) < 16 && Math.abs(p.top - top) < 11)
          ) {
            top -= 11;
            guard++;
          }
          top = Math.max(12, top);
          placed.push({ left: v.leftPercent, top });
          return { ...v, scale, top };
        });

        return (
          <div className="absolute inset-0 z-10 pointer-events-none">
            {items.map(({ poi, dist, leftPercent, scale, top }, idx) => {
              const poiName = poi.nome || poi.name || 'POI';
              return (
                <motion.div
                  key={poi.id}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  onClick={() => onPoiClick(poi)}
                  className="absolute pointer-events-auto cursor-pointer flex flex-col items-center transition-all duration-100"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${top}%`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    zIndex: 100 - idx
                  }}
                >
                  <div className="bg-[#151619]/80 backdrop-blur-xl p-1 pr-4 rounded-full shadow-2xl mb-1.5 flex items-center gap-2.5 border border-white/20 hover:border-primary/50 transition-colors">
                    {poi.photo_url || poi.image_url ? (
                      <img src={poi.photo_url || poi.image_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20 shadow-inner" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                         <MapPin className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <span className="text-xs font-black text-white truncate max-w-[140px] drop-shadow-md">{poiName}</span>
                  </div>
                  <div className="bg-primary text-white text-[11px] font-black px-3 py-1 rounded-full shadow-[0_0_15px_rgba(var(--color-primary),0.5)] border border-white/30">
                    {dist >= 1000 ? (dist/1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}
                  </div>
                  <div className="w-0.5 h-10 bg-gradient-to-b from-primary to-transparent mt-1 rounded-full opacity-80 blur-[0.5px]"></div>
                </motion.div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
