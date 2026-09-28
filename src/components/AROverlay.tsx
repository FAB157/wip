import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, X, MapPin, CameraOff, Loader2, List, Camera } from 'lucide-react';
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
  // LISTA E RADAR 2D COME OPZIONE (12/09/2026). La vista dall'alto con
  // l'elenco dei più vicini era solo il ripiego senza fotocamera; il
  // committente la vuole anche con la fotocamera accesa: in piazza, col sole
  // sullo schermo, si legge meglio di un'etichetta sopra il video. Un tasto
  // in testata la accende, un tasto in fondo riporta alla fotocamera. Senza
  // fotocamera resta obbligata, con «Riprova» per chiedere di nuovo il
  // permesso.
  const [vistaRadar, setVistaRadar] = useState(false);
  const [tentativoCamera, setTentativoCamera] = useState(0);

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

  // 1. Avvia la fotocamera. Effetto a sé: «Riprova» la richiede di nuovo
  //    senza rifare GPS e bussola.
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let vivo = true;
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
        if (!vivo) { stream.getTracks().forEach(track => track.stop()); return; }
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
    return () => {
      vivo = false;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [tentativoCamera]);

  useEffect(() => {
    let cleanupOrientation: (() => void) | null = null;

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
  // Senza fotocamera la vista dall'alto è obbligata; con la fotocamera è
  // una scelta.
  const mostraRadar = !!cameraError || vistaRadar;
  // «nord-est», nella lingua dell'app: l'elenco dice da che parte andare
  // anche a chi non guarda il disegno.
  const puntoCardinale = (bearing: number) => {
    const k = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
    return t(`vr_a_dir_${k}`);
  };

  return (
    /* Radar AR nella grafica delle tavole (10/09/2026). Qui sotto scorre il
       video, quindi il fondo si vede solo quando la fotocamera manca o sta
       ancora partendo: in quel caso è panna come il resto dell'app, non nero.
       Le sovrapposizioni diventano schede bianche con ombra — si leggono sia
       sopra l'immagine dal vivo sia sopra il fondo chiaro, mentre le pillole
       nere sparivano contro una facciata in ombra. */
    <div className="absolute inset-0 bg-background z-50 overflow-hidden flex flex-col">
      {/* Video Stream Container */}
      <div className="absolute inset-0 z-0">
        {!cameraError && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
        {mostraRadar && (
          /* SENZA FOTOCAMERA IL RADAR FUNZIONA LO STESSO (10/09/2026).
             Prima qui c'era un vicolo cieco: icona rossa, «errore» e un tasto
             per tornare indietro — con il GPS acceso, la bussola attiva e i
             luoghi intorno già caricati. Ma per sapere che cosa hai attorno e
             in che direzione guardare la fotocamera non serve: serve solo per
             disegnarci sopra. La tavola lo dice apertamente («Fotocamera in
             attesa · il radar funziona lo stesso»), e questo è quel disegno:
             radar dall'alto, nord in cima, i luoghi alla loro distanza vera,
             e sotto l'elenco dei più vicini che si tocca per aprire la scheda.
             L'avviso resta, ma come nota in cima e non come muro.
             Dal 12/09/2026 è anche una MODALITÀ a scelta (tasto in testata):
             sta sopra il video, che continua a scorrere sotto per tornarci
             senza richiedere la fotocamera. */
          <div className="absolute inset-0 flex flex-col bg-background overflow-y-auto pt-[92px]">
            {/* Avviso, non bloccante, con «Riprova»: solo quando la fotocamera manca davvero */}
            {cameraError && (
              <div className="mx-6 px-3 py-2.5 rounded-2xl bg-white border border-gray-200 flex items-center gap-2.5 shrink-0">
                <CameraOff className="w-[18px] h-[18px] text-slate-500 shrink-0" />
                <p className="flex-1 text-[11px] font-bold text-slate-600 leading-snug">{t('vr_a_ar_camera_waiting')}</p>
                <button
                  onClick={() => setTentativoCamera(n => n + 1)}
                  className="text-[11px] font-black text-primary shrink-0 px-1 py-1 active:scale-95 transition-transform"
                >
                  {t('vr_a_ar_retry')}
                </button>
              </div>
            )}

            {/* Radar dall'alto: 2 km di raggio, nord in cima */}
            {(() => {
              const R = 140, CX = 150, CY = 150, RAGGIO_M = 2000;
              const punti = (pois || []).map((p: any) => {
                const la = typeof p.lat === 'number' ? p.lat : parseFloat(p.lat);
                const lo = typeof p.lon === 'number' ? p.lon : parseFloat(p.lon);
                if (!gps || isNaN(la) || isNaN(lo)) return null;
                const d = calculateDistance(gps.lat, gps.lon, la, lo);
                if (d > RAGGIO_M) return null;
                // La bussola gira la mappa sotto di te: quello che hai davanti
                // sta in alto, come su un radar vero.
                const ang = (calculateBearing(gps.lat, gps.lon, la, lo) - heading) * Math.PI / 180;
                const r = (d / RAGGIO_M) * R;
                return { p, d, x: CX + r * Math.sin(ang), y: CY - r * Math.cos(ang) };
              }).filter(Boolean).sort((a: any, b: any) => a.d - b.d).slice(0, 24);

              return (
                <div className="px-6 pt-4 shrink-0 flex justify-center">
                  <svg width="300" height="300" viewBox="0 0 300 300" className="max-w-full">
                    <circle cx={CX} cy={CY} r={R} fill="#ffffff" stroke="#e5e7eb" strokeWidth="1" />
                    <circle cx={CX} cy={CY} r={100} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                    <circle cx={CX} cy={CY} r={55} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                    <line x1={CX} y1="10" x2={CX} y2="290" stroke="#eef2f7" strokeWidth="1" />
                    <line x1="10" y1={CY} x2="290" y2={CY} stroke="#eef2f7" strokeWidth="1" />
                    <text x={CX} y="26" textAnchor="middle" fontSize="11" fontWeight="900" fill="#b45309">N</text>
                    <text x="278" y="154" textAnchor="middle" fontSize="10" fontWeight="900" fill="#475569">E</text>
                    <text x={CX} y="284" textAnchor="middle" fontSize="10" fontWeight="900" fill="#475569">S</text>
                    <text x="22" y="154" textAnchor="middle" fontSize="10" fontWeight="900" fill="#475569">O</text>
                    <text x="207" y="154" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569">500 m</text>
                    <text x="252" y="154" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569">2 km</text>
                    {punti.map((n: any, i: number) => (
                      <g key={n.p.id || i} onClick={() => onPoiClick(n.p)} style={{ cursor: 'pointer' }}>
                        {/* Vicino = grande. La dimensione dice la distanza
                            prima ancora di leggere i metri. */}
                        <circle cx={n.x} cy={n.y} r={Math.max(5, 9 - (n.d / RAGGIO_M) * 4)} fill={n.p.is_gem ? '#d4af37' : '#1e3a8a'} />
                        {i === 0 && <circle cx={n.x} cy={n.y} r="14" fill="none" stroke="#1e3a8a" strokeOpacity="0.25" strokeWidth="2" />}
                      </g>
                    ))}
                    <circle cx={CX} cy={CY} r="7" fill="#ffffff" stroke="#1e3a8a" strokeWidth="3" />
                  </svg>
                </div>
              );
            })()}

            {/* I più vicini: si tocca e si apre la scheda, come nella tavola.
                Sotto il nome: categoria · punto cardinale · audioguida pronta. */}
            <div className="px-6 pb-8 pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{t('vr_a_ar_nearest')}</span>
                <span className="text-[10px] font-black text-slate-500">{t('vr_a_ar_within').replace('{n}', String(pois.length))}</span>
              </div>
              {(pois || [])
                .map((p: any) => ({ p, d: gps ? calculateDistance(gps.lat, gps.lon, Number(p.lat), Number(p.lon)) : Infinity, b: gps ? calculateBearing(gps.lat, gps.lon, Number(p.lat), Number(p.lon)) : 0 }))
                .filter((x: any) => Number.isFinite(x.d))
                .sort((a: any, b: any) => a.d - b.d)
                .slice(0, 12)
                .map(({ p, d, b }: any) => {
                  const categoria = String(p.category || p.categoria || '').replace(/_/g, ' ');
                  const sotto = [
                    categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : '',
                    puntoCardinale(b),
                    (p.audioguide_text || p.summary || p.description_long || p.has_audioguide) ? t('vr_a_ar_audio_ready') : '',
                  ].filter(Boolean).join(' · ');
                  return (
                  <button
                    key={p.id}
                    onClick={() => onPoiClick(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] text-left active:scale-95 transition-transform"
                  >
                    {p.photo_url || p.image_url ? (
                      <img src={p.photo_url || p.image_url} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" />
                    ) : (
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.is_gem ? 'bg-amber-50' : 'bg-blue-50'}`}>
                        <MapPin className={`w-[18px] h-[18px] ${p.is_gem ? 'text-amber-600' : 'text-primary'}`} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-slate-900 truncate">{p.nome || p.name || 'POI'}</p>
                      <p className={`text-[11px] font-bold truncate ${p.is_gem ? 'text-amber-700' : 'text-slate-500'}`}>{sotto}</p>
                    </div>
                    <span className={`px-2.5 py-1.5 rounded-full text-[11px] font-black shrink-0 ${d < 300 ? 'bg-primary text-white' : d < 1000 ? 'bg-blue-50 text-primary' : 'bg-amber-50 text-amber-700'}`}>
                      {d >= 1000 ? `${(d / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(d)} m`}
                    </span>
                  </button>
                  );
                })}

              {/* Con la fotocamera disponibile si torna al video da qui */}
              {!cameraError && (
                <button
                  onClick={() => setVistaRadar(false)}
                  className="mt-3 w-full py-3.5 rounded-2xl bg-white border border-primary/40 text-primary text-[13px] font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Camera className="w-4 h-4" />{t('vr_a_ar_view_camera')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && !cameraError && !vistaRadar && (
        <div className="absolute inset-0 z-40 bg-background flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">{t('vr_a_ar_init')}</p>
        </div>
      )}

      {/* Testata: scheda bianca, come nella tavola. Sopra il video serviva un
          gradiente nero per leggere il testo bianco; una scheda con la sua
          ombra si legge su qualunque sfondo e non annerisce l'immagine.
          z-50, SOPRA lo stato di caricamento (z-40): se la fotocamera non
          risponde mai (permesso mai concesso/negato, nessuna webcam) la X
          restava dietro la scritta "Inizializzazione radar..." e non si
          poteva chiudere Radar AR in nessun modo (11/09/2026, trovato in
          collaudo). */}
      <div className="absolute top-0 left-0 right-0 p-4 z-50 flex justify-between items-start gap-3">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl px-3.5 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
          <h2 className="font-black text-lg text-primary flex items-center gap-2">
            <Compass className={`w-5 h-5 ${compassAvailable ? 'text-emerald-700' : 'text-amber-700'}`} />
            Radar AR
          </h2>
          <p className="text-[11px] text-slate-500 font-bold">
            {mostraRadar
              ? `${cameraError ? t('vr_a_ar_camera_waiting_short') : t('vr_a_ar_radar_2d')} · ${compassAvailable ? t('vr_a_ar_compass_on') : t('vr_a_ar_compass_off')}`
              : `${t('vr_a_ar_compass')}: ${Math.round(heading)}° | POI: ${pois.length}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Lista e radar 2D ↔ fotocamera: solo quando la fotocamera c'è
              (senza, la lista è l'unica vista e il tasto non serve). */}
          {!cameraError && (
            <button
              onClick={() => setVistaRadar(v => !v)}
              aria-label={vistaRadar ? t('vr_a_ar_view_camera') : t('vr_a_ar_view_radar')}
              aria-pressed={vistaRadar}
              className={`w-10 h-10 border shadow-[0_1px_3px_rgba(15,23,42,0.08)] rounded-full flex items-center justify-center ${vistaRadar ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-slate-900'}`}
            >
              {vistaRadar ? <Camera className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </button>
          )}
          <button onClick={onClose} aria-label="close" className="w-10 h-10 bg-white border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.08)] rounded-full flex items-center justify-center text-slate-900">
            <X className="w-6 h-6" />
          </button>
        </div>
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
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.08)] rounded-full px-4 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-slate-600 text-xs font-bold">{t('vr_a_ar_loading_pois')}</span>
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
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.08)] rounded-2xl px-5 py-3 flex items-center gap-3 mx-6">
              <MapPin className="w-5 h-5 text-amber-700 shrink-0" />
              <span className="text-slate-600 text-xs font-bold">{t('vr_a_ar_no_pois')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Rendering dei POI (Pin fluttuanti) ─────────────────────────────── */}
      {/* Mostriamo i POI appena GPS disponibile, indipendentemente dalla bussola */}
      {gps && pois.length > 0 && !mostraRadar && (() => {
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
                  {/* Etichetta bianca, come i cartellini della tavola: si legge
                      sopra una facciata chiara e sopra una in ombra, mentre la
                      pillola nera spariva contro i portali scuri. */}
                  <div className="bg-white/95 backdrop-blur-sm p-1 pr-4 rounded-full shadow-[0_4px_14px_rgba(15,23,42,0.18)] mb-1.5 flex items-center gap-2.5 border border-gray-200 hover:border-primary transition-colors">
                    {poi.photo_url || poi.image_url ? (
                      <img src={poi.photo_url || poi.image_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-[#dbe4f5] flex items-center justify-center">
                         <MapPin className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <span className="text-xs font-black text-slate-900 truncate max-w-[140px]">{poiName}</span>
                  </div>
                  <div className="bg-primary text-white text-[11px] font-black px-3 py-1 rounded-full shadow-[0_4px_12px_rgba(30,58,138,0.3)]">
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
