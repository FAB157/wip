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
import { puntoArrivo } from '../lib/puntoArrivo';
import { vibra } from './hapticsHelper';
import { useAudioState } from '../hooks/useAudioState';
import { PRICING_LIST } from '../lib/pricing';
import { getDayPassState, DAY_PASS_UPDATED_EVENT, possiedePoiSync, caricaPoiPosseduti } from '../services/dayPassService';

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

// ─── Costanti di pulizia ──────────────────────────────────────────
/** Oltre `alertRadius × questo fattore` il banner si rimuove da solo. */
const BANNER_DISMISS_FACTOR = 2.5;
/** Rete di sicurezza temporale: se il GPS tace (galleria, app congelata)
 *  una voce non può restare a schermo per sempre. */
const BANNER_MAX_AGE_MS = 10 * 60 * 1000;

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

  // DAY PASS ATTIVO (03/09/2026, segnalato dal committente: «perche' mi ha
  // richiesto il pagamento anche se ho gia' il day pass?»).
  //
  // Il tasto mostrava il prezzo guardando SOLO `entry.alreadyPaid`, che ogni
  // punto che emette 'wip-poi-trigger' cabla a `false`
  // (foregroundTriggers, useWalkingNavigation, giroDriver). Quindi con un pass
  // attivo e 37 guide residue il banner chiedeva comunque 15 crediti: il
  // pagamento non partiva davvero — `authorizeGuidePlayback` il pass lo
  // rispetta — ma l'utente leggeva di dover pagare due volte, che e' un danno
  // di fiducia anche senza addebito.
  //
  // Qui il diritto si RICALCOLA da chi lo sa: lo stato del pass e il registro
  // dei POI gia' posseduti. `alreadyPaid` resta come terza fonte per chi lo
  // valorizza davvero.
  const [passAttivo, setPassAttivo] = useState(false);
  const [possedutiVersione, setPossedutiVersione] = useState(0);
  useEffect(() => {
    let vivo = true;
    const aggiorna = async () => {
      try {
        const p = await getDayPassState();
        if (vivo) setPassAttivo(!!p?.active && (p.used ?? 0) < (p.cap ?? 0));
      } catch { /* in dubbio si mostra il prezzo: fail-closed */ }
    };
    aggiorna();
    // Il registro dei posseduti ha una cache condivisa: si scalda una volta e
    // poi `possiedePoiSync` risponde senza rete.
    caricaPoiPosseduti().then(() => vivo && setPossedutiVersione(v => v + 1)).catch(() => {});
    const suPass = () => aggiorna();
    const suPosseduto = () => setPossedutiVersione(v => v + 1);
    window.addEventListener(DAY_PASS_UPDATED_EVENT, suPass);
    window.addEventListener('wip-poi-posseduto', suPosseduto);
    return () => {
      vivo = false;
      window.removeEventListener(DAY_PASS_UPDATED_EVENT, suPass);
      window.removeEventListener('wip-poi-posseduto', suPosseduto);
    };
  }, []);

  // Il mini-player (AudioPlayerBanner) è ancorato a 5,5 rem dal fondo: quando
  // è visibile il banner di avvicinamento sale di ~4 rem per non coprirlo.
  // Stesse due sorgenti che usa il mini-player: player principale + ttsService.
  const audioState = useAudioState();
  const [ttsVisible, setTtsVisible] = useState(false);
  useEffect(() => {
    const onAudio = (e: Event) => setTtsVisible(!!((e as CustomEvent).detail || {}).isVisible);
    window.addEventListener('wip-audio-state-change', onAudio);
    return () => window.removeEventListener('wip-audio-state-change', onAudio);
  }, []);
  const miniPlayerVisible = audioState.isActive || ttsVisible;

  // Specchio delle entries per i listener (deps []) + memorie anti-ripetizione:
  // - announcedAtRef: ultimo beep/vibrazione per POI (mai due annunci ravvicinati)
  // - dismissedRef: POI chiusi con la X o già aperti in scheda — i distance-update
  //   nativi (ogni ~5 m) non devono resuscitarli: era il banner della pineta
  //   che ricompariva a ogni fix GPS.
  const entriesRef = useRef<ApproachEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  const announcedAtRef = useRef<Map<string, number>>(new Map());
  const dismissedRef = useRef<Map<string, number>>(new Map());
  const ANNOUNCE_COOLDOWN_MS = 10 * 60 * 1000;
  const DISMISS_COOLDOWN_MS = 30 * 60 * 1000;

  const isDismissedRecently = (poiId: string) => {
    const ts = dismissedRef.current.get(String(poiId)) || 0;
    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  };

  useEffect(() => {
    /**
     * wip-poi-approach — aggiunge il POI nella lista del banner.
     * I dati arrivano da GeofenceAudioGuide con poi completo (lat, lon, image_url).
     * Suono + vibrazione JS per il foreground, SOLO alla prima comparsa.
     */
    const onApproach = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const poi = d.poi || {};
      const poiId = String(poi.id || d.poiId || '');
      const name = poi.name || d.poiName || d.name || '';
      if (!poiId) return;

      const isArrival = !!d.isArrival;
      const already = entriesRef.current.some(x => String(x.poiId) === poiId);

      if (already) {
        // Aggiorna i dati dell'entry esistente senza rumore né ricreazione
        setEntries(prev => prev.map(x => String(x.poiId) === poiId
          ? { ...x, distance: d.distance ?? x.distance, poi: x.poi ?? poi, alreadyPaid: x.alreadyPaid ?? d.alreadyPaid }
          : x));
        return;
      }

      // Anti-ripetizione: un POI già annunciato da poco (o chiuso con la X)
      // non torna a ogni oscillazione del GPS. L'ARRIVO passa sempre: è
      // l'evento forte e raro, e aggiorna lui i timestamp.
      const lastAnnounced = announcedAtRef.current.get(poiId) || 0;
      const repeatedSoon = Date.now() - lastAnnounced < ANNOUNCE_COOLDOWN_MS;
      if (!isArrival && (repeatedSoon || isDismissedRecently(poiId))) return;

      announcedAtRef.current.set(poiId, Date.now());
      playBeep(isArrival ? 2 : 1);
      // Haptics nativi (iOS non implementa navigator.vibrate, UX-08).
      vibra(isArrival ? 'successo' : 'avviso');

      // La distanza e la freccia puntano all'INGRESSO quando lo conosciamo,
      // non al centroide: su un edificio grande il banner diceva "40 m" a
      // chi era davanti alla porta (stesso criterio del trigger).
      const arrivo = puntoArrivo(poi);
      const lat = Number.isFinite(arrivo.lat) ? arrivo.lat : poi.lat;
      const lon = Number.isFinite(arrivo.lon) ? arrivo.lon : poi.lon;

      setEntries(prev => {
        if (prev.find(x => String(x.poiId) === poiId)) return prev; // già presente
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
          lat,
          lon,
          poi,
          alreadyPaid: d.alreadyPaid || false
        }];
      });
    };

    /**
     * Aggiornamento distanze dal nativo (ogni ~5 m a piedi). MERGE, non
     * rimpiazzo: il vecchio rimpiazzo integrale perdeva poi/alreadyPaid/
     * enteredAt/alertRadius — il tasto "Ascolta" dispatchava poi undefined
     * (click a vuoto) e la pulizia per età/distanza confrontava NaN.
     */
    const onDistUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d.entries) return;
      const isCar = (localStorage.getItem('wip_transport_pref') || '') === 'car';
      setEntries(prev => {
        const prevById = new Map<string, any>(prev.map(x => [String(x.poiId), x] as [string, any]));
        return (d.entries as any[])
          .map((entry: any) => {
            const id = String(entry.poi?.id ?? entry.poiId ?? '');
            if (!id) return null;
            const old = prevById.get(id);
            if (old) {
              return {
                ...old,
                distance: entry.distance ?? old.distance,
                lat: old.lat ?? entry.lat ?? entry.poi?.lat,
                lon: old.lon ?? entry.lon ?? entry.poi?.lon,
              };
            }
            // Entry sconosciuta (approach perso mentre la WebView dormiva):
            // entra solo se non è stata chiusa/aperta da poco.
            if (isDismissedRecently(id)) return null;
            const arrivo = entry.poi ? puntoArrivo(entry.poi) : { lat: NaN, lon: NaN };
            return {
              poiId: id,
              name: entry.poi?.name || entry.name || '',
              category: entry.poi?.category ?? entry.category ?? null,
              distance: entry.distance ?? 0,
              alertRadius: entry.alertRadius ?? (isCar ? 300 : 150),
              triggerRadius: entry.triggerRadius ?? 30,
              isCar,
              queueNames: [],
              enteredAt: Date.now(),
              image: entry.poi?.image_url,
              lat: Number.isFinite(arrivo.lat) ? arrivo.lat : (entry.lat ?? entry.poi?.lat),
              lon: Number.isFinite(arrivo.lon) ? arrivo.lon : (entry.lon ?? entry.poi?.lon),
              poi: entry.poi,
              alreadyPaid: entry.alreadyPaid || false,
            } as ApproachEntry;
          })
          .filter(Boolean) as ApproachEntry[];
      });
    };

    const onExit = (e: Event) => {
      const poiId = (e as CustomEvent).detail?.poiId;
      if (poiId) setEntries(prev => prev.filter(x => String(x.poiId) !== String(poiId)));
    };

    const onTrigger = (e: Event) => {
      // Quando scatta il trigger, l'elemento sparisce dallo stack (si apre la
      // scheda) e non deve tornare al prossimo distance-update.
      const poiId = (e as CustomEvent).detail?.poiId ?? (e as CustomEvent).detail?.poi?.id;
      if (poiId) {
        dismissedRef.current.set(String(poiId), Date.now());
        setEntries(prev => prev.filter(x => String(x.poiId) !== String(poiId)));
      }
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
        prev
          .map(entry =>
            entry.lat != null && entry.lon != null
              ? { ...entry, distance: haversineMeters(loc.lat, loc.lon, entry.lat, entry.lon) }
              : entry
          )
          // AUTO-PULIZIA per distanza e per età.
          //
          // Prima le voci uscivano SOLO su `wip-poi-exit`, sul trigger o
          // chiudendole a mano. In auto, attraversando un centro storico,
          // se ne accumulavano a decine e restavano lì: sbloccando lo
          // schermo comparivano banner con il tasto "Ascolta" per luoghi
          // ormai a chilometri di distanza. Peggio: in background la
          // WebView è congelata, quindi l'evento di uscita nativo spesso
          // non arrivava mai e nessuno le rimuoveva.
          .filter(entry => {
            if (entry.lat == null || entry.lon == null) return true;
            const outOfRange = entry.distance > entry.alertRadius * BANNER_DISMISS_FACTOR;
            const tooOld = Date.now() - entry.enteredAt > BANNER_MAX_AGE_MS;
            return !outOfRange && !tooOld;
          })
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
    // Chiusura esplicita: il POI non deve ricomparire al prossimo
    // distance-update nativo (arrivava ogni ~5 m e resuscitava il banner).
    dismissedRef.current.set(String(poiId), Date.now());
    window.dispatchEvent(new CustomEvent('wip-poi-exit-manual', { detail: { poiId } }));
    // Anche il servizio nativo dovrebbe sapere che l'utente ha chiuso il
    // POI (uscito/ignorato), altrimenti al prossimo fix lo riannuncia. Il
    // plugin (ItaintaBackgroundPoiPlugin, Kotlin/Swift) oggi NON ha un
    // metodo del genere: si prova `markPoiExited` se una build lo espone.
    // TODO(nativo): aggiungere markPoiExited({poiId}) al plugin.
    (async () => {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');
        if (typeof plugin.markPoiExited === 'function') { await plugin.markPoiExited({ poiId: String(poiId) }); return; }
        console.warn('[ApproachBanner] markPoiExited non disponibile nel plugin nativo: il POI chiuso resta attivo lato servizio');
      } catch {
        console.warn('[ApproachBanner] markPoiExited non disponibile nel plugin nativo: il POI chiuso resta attivo lato servizio');
      }
    })();
    setEntries(prev => prev.filter(x => x.poiId !== poiId));
  };

  /**
   * "Portami li'" dal banner di avvicinamento.
   * Prima il banner diceva solo QUANTO sei lontano e in che direzione (la
   * freccia e' in linea d'aria): per sapere CHE STRADA fare bisognava chiudere
   * il banner, trovare il POI sulla mappa e avviare la navigazione da li'.
   * Qui si apre direttamente il modale del percorso — stesso evento che usa
   * una tappa dell'itinerario, quindi nessuna logica nuova.
   * Il banner NON si chiude: l'utente potrebbe voler comunque ascoltare, e il
   * pagamento resta legato al trigger di arrivo, non alla navigazione.
   */
  const handleNavigate = (entry: ApproachEntry) => {
    if (typeof entry.lat !== 'number' || typeof entry.lon !== 'number') return;
    window.dispatchEvent(new CustomEvent('wip-smart-navigate', {
      detail: {
        startCoords: userLocation ? { lat: userLocation.lat, lon: userLocation.lon } : null,
        endCoords: { lat: entry.lat, lon: entry.lon },
        destinationName: entry.name,
      },
    }));
  };

  const handlePlayNow = (entry: ApproachEntry) => {
    // Al clic su "Ascolta", apriamo la scheda completa tramite l'evento
    // centralizzato con autoPlay=true. Si passa anche poiId: se l'oggetto poi
    // manca (entry ricostruita da un distance-update) App.tsx lo ricarica dal
    // repository invece di ignorare il click.
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
      // manual: e' l'utente che ha premuto "Ascolta" — la modalita' silenziosa
      // non deve zittirlo (locationService non lo registra come trigger).
      detail: { poi: entry.poi, poiId: entry.poiId, alreadyPaid: entry.alreadyPaid, autoPlay: true, manual: true },
    }));
    setEntries(prev => prev.filter(x => x.poiId !== entry.poiId));
  };

  // In BASSO, sopra la barra dei tab (UX-07): «Ascolta» e «Portami lì» sono
  // i tasti che si premono camminando e con una mano, e in alto a destra
  // (sotto il notch, fuori dal pollice) non ci si arrivava. Stessa quota di
  // AgentControls (6 rem + safe-area); +4 rem quando c'è il mini-player.
  return (
    <div
      // Cambia quando il registro dei POI posseduti si aggiorna: serve solo a
      // far ridisegnare le etichette dei tasti (possiedePoiSync legge una
      // cache, non uno stato React).
      data-posseduti={possedutiVersione}
      className="absolute left-4 right-4 z-[99999] flex flex-col gap-3 pointer-events-none transition-[bottom] duration-300"
      style={{ bottom: `calc(${miniPlayerVisible ? '10rem' : '6rem'} + var(--wip-cruscotto-h, 0px) + env(safe-area-inset-bottom, 0px))` /* + il cruscotto del giro (TourBanner pubblica --wip-cruscotto-h): le due card non si sovrappongono */ }}
    >
      <AnimatePresence>
        {entries.slice(0, 2).map((entry, index) => {
          // Solo il flag (03/09/2026), come in poiTaxonomy: la categoria
          // 'gemme' e' il contenitore dell'import CSV, non un giudizio.
          const isGem = entry.poi?.premium || entry.poi?.is_gem === true;
          const isLead = index === 0;

          return (
            <motion.div
              key={entry.poiId}
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                zIndex: entries.length - index
              }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              layout
              role="status"
              className={`pointer-events-auto bg-white/95 backdrop-blur-xl border ${isGem ? 'border-amber-400 shadow-[0_8px_30px_rgba(245,158,11,0.3)]' : 'border-stone-200 shadow-xl'} rounded-2xl p-2 pr-3 flex items-start gap-2 relative transition-all`}
            >
              {/* Pulsante X: a SINISTRA, 44 px, lontano da «Ascolta» (che
                  addebita crediti) — prima era 24 px a 8 px da quel tasto
                  (UX-06). */}
              <button
                type="button"
                onClick={() => handleClose(entry.poiId)}
                aria-label={getTranslation('close', language)}
                className="min-w-11 min-h-11 self-center flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 active:bg-stone-200 transition-all shrink-0"
              >
                <span aria-hidden="true">✕</span>
              </button>

              {entry.image ? (
                <img src={entry.image} alt="" loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className={`w-12 h-12 rounded-lg ${isGem ? 'bg-amber-100 text-amber-600' : 'bg-primary/10 text-primary'} flex items-center justify-center text-xl flex-shrink-0`} aria-hidden="true">
                  {isGem ? '💎' : (CATEGORY_EMOJI[entry.category as PoiCategory] ?? '🗺️')}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                   <span className={`text-[11px] font-black uppercase tracking-tight ${isGem ? 'text-amber-600' : 'text-primary'}`}>
                     {isGem ? '💎 ' + getTranslation('gr_gemma', language) : '📍 ' + (getTranslation(entry.category || 'monumenti', language))} • {Math.round(entry.distance)}m
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
                  <div className="mt-2 flex items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePlayNow(entry)}
                      className={`flex-1 min-h-11 py-2 rounded-lg ${isGem ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-primary-hover'} text-white text-[13px] font-black shadow transition-all flex items-center justify-center gap-1.5`}
                    >
                      {/* Niente prezzo se l'ascolto e' gia' coperto: pass
                          attivo, POI gia' acquistato, o `alreadyPaid` dal
                          chiamante. Il costo NON e' piu' scritto a mano: era
                          "15" cablato nel JSX, che sarebbe restato 15 anche
                          cambiando il listino dal pannello admin. */}
                      {(entry.alreadyPaid || passAttivo || possiedePoiSync(String(entry.poiId))) ? (
                        <>
                          <span>🔊</span>
                          {getTranslation('poi_play', language)}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <span>🪙 {PRICING_LIST.audio_guide}</span>
                            <span className="opacity-60">|</span>
                            <span>{getTranslation('poi_play', language)}</span>
                          </div>
                        </>
                      )}
                    </button>

                    {/* "Portami li'": compare solo se sappiamo dov'e' il POI.
                        Stretto di proposito — l'azione principale resta
                        ascoltare, questa e' il modo per arrivarci. */}
                    {typeof entry.lat === 'number' && typeof entry.lon === 'number' && (
                      <button
                        type="button"
                        onClick={() => handleNavigate(entry)}
                        aria-label={getTranslation('navigate', language)}
                        title={getTranslation('navigate', language)}
                        className="min-w-11 min-h-11 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-700 text-white text-[13px] font-black shadow transition-all flex items-center justify-center"
                      >
                        ➤
                      </button>
                    )}
                  </div>
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
            <span className="text-[12px] font-black uppercase tracking-wider">
              +{entries.length - 2} {getTranslation('altri_luoghi_vicini', language)}
            </span>
            <button
              type="button"
              onClick={() => setEntries(prev => prev.slice(0, 2))}
              className="text-[12px] min-h-11 font-black bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
            >
              {getTranslation('pulisci', language)}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
