// =====================================================================
// ITAINTA · ApproachBanner — Banner avvicinamento POI
//
// Si attiva quando il geofencing rileva un POI nella zona alert.
// Mostra:
//   - Immagine POI o placeholder
//   - Distanza stradale (Mapbox) che si aggiorna in tempo reale e bussola
//   - Titolo e categoria
//   - Tasto "ASCOLTA ORA" (modalità semi-auto)
// =====================================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Volume2, Car, Footprints } from 'lucide-react';
import { CATEGORY_EMOJI } from '../lib/poiCategories';
import type { PoiCategory } from '../types/poi';
import { getTranslation, Language } from '../lib/i18n';

// ─── Tipi ─────────────────────────────────────────────────────────

interface ApproachEntry {
  poiId: string;
  name: string;
  category?: PoiCategory | null;
  distance: number;       // distanza stradale corrente in metri
  alertRadius: number;    // raggio di alert (per calcolare la progress bar)
  triggerRadius: number;  // raggio di trigger
  isCar: boolean;
  queueNames: string[];   // nomi degli altri POI in coda
  enteredAt: number;
  image?: string;
  lat?: number;
  lon?: number;
  poi?: any;
  alreadyPaid?: boolean;
}

interface Props {
  language?: Language;
}

// ─── Helpers ──────────────────────────────────────────────────────

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (val: number) => (val * Math.PI) / 180;
  const toDeg = (val: number) => (val * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

// ─── Componente ───────────────────────────────────────────────────

  /** Distanza Haversine in metri tra due coordinate. */
  function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /** Beep JS via Web Audio API (1 = avvicinamento, 2 = arrivo). */
  function playBeep(count: number) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = count === 1 ? 760 : 920;
          gain.gain.setValueAtTime(0.4, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.25);
        }, i * 380);
      }
    } catch (_) {}
  }

export default function ApproachBanner({ language = 'IT' }: Props) {
  const [entries, setEntries] = useState<ApproachEntry[]>([]);
  const [navInstruction, setNavInstruction] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number, heading?: number | null} | null>(null);

  useEffect(() => {
    /**
     * wip-poi-approach — aggiunge il POI nella lista del banner.
     * I dati arrivano da GeofenceAudioGuide con poi completo (lat, lon, image_url).
     * Suono + vibrazione JS per il foreground.
     */
    const onApproach = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const poi = d.poi || {};
      const poiId = poi.id || d.poiId;
      const name = poi.name || d.poiName || d.name || '';
      if (!poiId) return;

      const isArrival = !!d.isArrival;

      // Feedback JS se l'app è in foreground
      playBeep(isArrival ? 2 : 1);
      navigator.vibrate?.(isArrival ? [250, 100, 250] : [200]);

      setEntries(prev => {
        if (prev.find(x => x.poiId === poiId)) return prev; // già presente
        return [...prev, {
          poiId,
          name,
          category: poi.category ?? null,
          distance: d.distance ?? (isArrival ? 0 : 150),
          alertRadius: isArrival ? 30 : (d.alertRadius ?? 150),
          triggerRadius: d.triggerRadius ?? 30,
          isCar: d.isCar ?? false,
          queueNames: [],
          enteredAt: Date.now(),
          image: poi.image_url || poi.photo_url || undefined,
          lat: poi.lat,
          lon: poi.lon,
          poi,
          alreadyPaid: d.alreadyPaid || false
        }];
      });
    };

    const onDistUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.entries) {
        setEntries(d.entries.map((entry: any) => ({
          ...entry,
          poiId: entry.poi?.id || entry.poiId,
          name: entry.poi?.name || entry.name,
          category: entry.poi?.category || entry.category,
          image: entry.poi?.image_url,
          lat: entry.poi?.lat,
          lon: entry.poi?.lon
        })));
      }
    };

    const onExit = (e: Event) => {
      const poiId = (e as CustomEvent).detail?.poiId;
      if (poiId) setEntries(prev => prev.filter(x => x.poiId !== poiId));
    };

    const onTrigger = (e: Event) => {
      // Quando scatta il trigger, l'elemento sparisce dallo stack (si apre la scheda)
      const poiId = (e as CustomEvent).detail?.poiId;
      if (poiId) setEntries(prev => prev.filter(x => x.poiId !== poiId));
    };

    const onNavInstruction = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (text) setNavInstruction(text);
    };

    /**
     * Aggiornamento posizione GPS: ricalcola in tempo reale i metri restanti
     * per ogni POI nel banner usando la formula di Haversine.
     */
    const onLocationUpdate = (e: Event) => {
      const loc = (e as CustomEvent).detail as { lat: number; lon: number; heading?: number | null };
      setUserLocation(loc);
      if (loc.lat == null || loc.lon == null) return;
      setEntries(prev =>
        prev.map(entry =>
          entry.lat != null && entry.lon != null
            ? { ...entry, distance: haversineMeters(loc.lat, loc.lon, entry.lat, entry.lon) }
            : entry
        )
      );
    };

    window.addEventListener('wip-poi-approach',        onApproach);
    window.addEventListener('wip-poi-distance-update', onDistUpdate);
    window.addEventListener('wip-poi-exit',            onExit);
    window.addEventListener('wip-poi-trigger',         onTrigger);
    window.addEventListener('wip-nav-instruction',     onNavInstruction);
    window.addEventListener('wip-location-update',     onLocationUpdate);

    return () => {
      window.removeEventListener('wip-poi-approach',        onApproach);
      window.removeEventListener('wip-poi-distance-update', onDistUpdate);
      window.removeEventListener('wip-poi-exit',            onExit);
      window.removeEventListener('wip-poi-trigger',         onTrigger);
      window.removeEventListener('wip-nav-instruction',     onNavInstruction);
      window.removeEventListener('wip-location-update',     onLocationUpdate);
    };
  }, []);

  const handleClose = (poiId: string) => {
    window.dispatchEvent(new CustomEvent('wip-poi-exit-manual', { detail: { poiId } }));
    setEntries(prev => prev.filter(x => x.poiId !== poiId));
  };

  const handlePlayNow = (entry: ApproachEntry) => {
    // Al clic su "Ascolta", apriamo la scheda completa tramite l'evento centralizzato con autoPlay=true
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
      detail: { poi: entry.poi, alreadyPaid: entry.alreadyPaid, autoPlay: true },
    }));
    setEntries(prev => prev.filter(x => x.poiId !== entry.poiId));
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-[99999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {entries.slice(0, 2).map((entry, index) => {
          const isGem = entry.poi?.premium || entry.poi?.is_gem || entry.poi?.category === 'gemme';
          const isLead = index === 0;

          return (
            <motion.div
              key={entry.poiId}
              initial={{ opacity: 0, x: -20, scale: 0.9 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                zIndex: entries.length - index
              }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              layout
              className={`pointer-events-auto bg-white/95 backdrop-blur-xl border ${isGem ? 'border-amber-400 shadow-[0_8px_30px_rgba(245,158,11,0.3)]' : 'border-stone-200 shadow-xl'} rounded-2xl p-3 flex items-start gap-3 relative transition-all`}
            >
              {/* Pulsante X */}
              <button
                onClick={() => handleClose(entry.poiId)}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 transition-all"
              >
                ✕
              </button>

              {entry.image ? (
                <img src={entry.image} alt={entry.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-lg ${isGem ? 'bg-amber-100 text-amber-600' : 'bg-primary/10 text-primary'} flex items-center justify-center text-xl flex-shrink-0`}>
                  {isGem ? '💎' : (CATEGORY_EMOJI[entry.category as PoiCategory] ?? '🗺️')}
                </div>
              )}

              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-1.5 mb-0.5">
                   <span className={`text-[10px] font-black uppercase tracking-tighter ${isGem ? 'text-amber-600' : 'text-primary'}`}>
                     {isGem ? '💎 Gemma' : '📍 ' + (getTranslation(entry.category || 'monumenti', language))} • {Math.round(entry.distance)}m
                   </span>
                   {userLocation && entry.lat && entry.lon && (
                      <div
                        className={`w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shadow-sm transition-transform duration-300 ease-out`}
                        style={{
                          transform: `rotate(${getBearing(userLocation.lat, userLocation.lon, entry.lat, entry.lon) - (userLocation.heading || 0)}deg)`
                        }}
                      >
                        <span className={`${isGem ? 'text-amber-600' : 'text-primary'} text-[12px] font-black`}>↑</span>
                      </div>
                   )}
                </div>
                <h4 className="text-sm font-bold text-stone-900 truncate">{entry.name}</h4>

                {isLead && (
                  <button
                    onClick={() => handlePlayNow(entry)}
                    className={`w-full mt-2 py-1.5 rounded-lg ${isGem ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-primary-hover'} text-white text-[10px] font-black shadow transition-all flex items-center justify-center gap-1.5`}
                  >
                    {entry.alreadyPaid ? (
                      <>
                        <span>🔊</span>
                        {getTranslation('poi_play', language)}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <span>🪙 15</span>
                          <span className="opacity-60">|</span>
                          <span>{getTranslation('poi_play', language)}</span>
                        </div>
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Banner riassuntivo se ci sono più di 2 POI */}
        {entries.length > 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-auto bg-stone-900/80 backdrop-blur-lg text-white rounded-xl px-4 py-2 flex items-center justify-between shadow-lg border border-white/10"
          >
            <span className="text-[10px] font-black uppercase tracking-widest">
              +{entries.length - 2} {language === 'IT' ? 'altri luoghi vicini' : 'other nearby places'}
            </span>
            <button
              onClick={() => setEntries(prev => prev.slice(0, 2))}
              className="text-[10px] font-black bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
            >
              {language === 'IT' ? 'PULISCI' : 'CLEAR'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
