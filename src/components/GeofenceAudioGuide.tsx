import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'motion/react';
import { Download, AlertTriangle, X, MapPinOff, Compass } from 'lucide-react';
import { Language, getTranslation, linguaCorrente } from '../lib/i18n';
import { notify } from '../lib/toast';
import { locationService } from '../services/locationService';
import { isCategoryAllowed, isPlayed } from '../lib/guideSettings';
import { isBearingGateEnabled, setBearingGateEnabled } from '../lib/geofencing/bearingGate';
import { useFeatureFlag } from '../lib/featureFlags';

/**
 * ANCORA DEL PANNELLO GUIDA. L'interruttore del gate di bussola appartiene
 * al pannello GeoControl (ProfileScreen), insieme a modalita' di attivazione
 * e distanze. Vive qui perche' qui vive tutta la logica del geofencing web:
 * il pannello deve solo lasciare un `<div id="wip-guide-settings-extra" />`
 * (oppure importare direttamente `InterruttoreGateBussola`), e il controllo
 * ci si infila da solo. Nessuna delle due cose e' obbligatoria: senza ancora
 * il gate resta acceso col suo default, e non si rompe niente.
 */
const ANCORA_IMPOSTAZIONI = 'wip-guide-settings-extra';

/**
 * Interruttore utente del gate di bussola («racconta solo cio' che hai
 * davanti»). Scrive `wip_bearing_gate`, la chiave che bearingGate.ts legge da
 * se': niente stato condiviso, niente eventi da propagare.
 */
export function InterruttoreGateBussola({ language }: { language: Language }) {
  const [attivo, setAttivo] = useState<boolean>(() => isBearingGateEnabled());
  const cambia = (v: boolean) => { setAttivo(v); setBearingGateEnabled(v); };
  return (
    <div className="bg-[#f8f5f0] p-4 rounded-2xl">
      <button
        type="button"
        role="switch"
        aria-checked={attivo}
        onClick={() => cambia(!attivo)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${attivo ? 'bg-primary text-white' : 'bg-white text-primary/40'}`}>
          <Compass className="w-4 h-4" />
        </div>
        <span className="flex-1 text-[11px] font-black uppercase tracking-wider text-primary leading-tight">
          {getTranslation('bearing_gate_label', language)}
        </span>
        <span className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors ${attivo ? 'bg-primary' : 'bg-gray-300'}`}>
          <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${attivo ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      <p className="text-[10px] font-bold text-on-surface-variant opacity-70 leading-tight mt-2">
        {getTranslation('bearing_gate_desc', language)}
      </p>
    </div>
  );
}

/** Tetto al prefetch dei testi in avvicinamento: 3 al minuto. */
const PREFETCH_MAX_PER_MIN = 3;
// Side-effect: attiva il registratore di tracce GPS (wip_gps_record) al load
// dell'app — ascolta 'wip-location-update', non tocca locationService.
import '../lib/geofencing/gpsReplay';

interface GeofenceAudioGuideProps {
  isActive: boolean;
  isMuted?: boolean;
  itinerary: any[]; 
  guideMode: 'nicky' | 'dante';
  language: Language;
}

export default function GeofenceAudioGuide({ isActive, isMuted, itinerary, guideMode, language }: GeofenceAudioGuideProps) {
  // NIENTE syncSettings qui: lo fa gia' App.tsx con gli stessi argomenti (e
  // in piu' le categorie). Con entrambi, ogni cambio di stato faceva partire
  // due volte banner, musica d'ambiente, lettura dei POI e rilancio del
  // servizio nativo (misurato 22/08/2026). `itinerary`, `guideMode` e
  // `isMuted` restano nelle props per i listener sotto.
  void itinerary; void guideMode; void isMuted;

  // Trigger web autonomi in FOREGROUND (solo PWA/browser): il geofencing di
  // prossimità fuori da WIP Nav. Su nativo non parte mai (il service in
  // background ha la stessa logica: niente doppi trigger). Kill switch admin:
  // feature flag 'web_foreground_triggers' (fail-open).
  const webTriggersOn = useFeatureFlag('web_foreground_triggers');

  // PERMESSO POSIZIONE NEGATO (web): fino al 22/08/2026 finiva in console e
  // l'audioguida restava muta senza spiegazione. Al tocco delle cuffie si
  // interroga navigator.permissions (se c'e'): se e' 'denied' il banner esce
  // subito; altrimenti esce al primo errore del watch ('location-denied').
  const [posizioneNegata, setPosizioneNegata] = useState(false);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const onDenied = () => setPosizioneNegata(true);
    window.addEventListener('location-denied', onDenied);
    if (isActive) {
      locationService.checkWebLocationPermission().then(st => { if (st === 'denied') setPosizioneNegata(true); }).catch(() => {});
      if (locationService.isLocationDenied()) setPosizioneNegata(true);
    } else {
      setPosizioneNegata(false);
    }
    return () => window.removeEventListener('location-denied', onDenied);
  }, [isActive]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isActive || !webTriggersOn) return;
    let alive = true;
    import('../lib/geofencing/foregroundTriggers')
      .then(m => { if (alive) m.startForegroundTriggers(); })
      .catch(() => { /* modulo non caricabile: il resto dell'app non ne risente */ });
    return () => {
      alive = false;
      import('../lib/geofencing/foregroundTriggers')
        .then(m => m.stopForegroundTriggers())
        .catch(() => { /* idem */ });
    };
  }, [isActive, webTriggersOn]);

  useEffect(() => {
    // NB: il listener 'wip-semi-play-audio' vive SOLO in useGeofencing
    // (userTriggeredPlay → executePlay → pagamenti): quello duplicato qui
    // riproduceva l'audio bypassando crediti/Day Pass ed è stato rimosso.

    // Tour di gruppo: feedback visivo per i follower quando il leader
    // sblocca un luogo o termina la sessione (riusa il banner di stato).
    const handleLiveAudio = (e: any) => {
      const msg = e?.detail?.message;
      if (msg) window.dispatchEvent(new CustomEvent('audioguide-status', { detail: msg }));
    };
    const handleLiveEnded = (e: any) => {
      const msg = e?.detail?.message || getTranslation('gr_tour_gruppo_finito', language);
      window.dispatchEvent(new CustomEvent('audioguide-status', { detail: msg }));
    };
    window.addEventListener('wip-live-audio', handleLiveAudio);
    window.addEventListener('wip-live-tour-ended', handleLiveEnded);

    return () => {
      window.removeEventListener('wip-live-audio', handleLiveAudio);
      window.removeEventListener('wip-live-tour-ended', handleLiveEnded);
    };
  }, [language, guideMode]);

  // Banner "POI scaricati" quando il nativo invia la lista
  useEffect(() => {
    const handlePoisLoaded = (e: any) => {
      // Non mostrare se la guida non è attiva (l'utente non ha cliccato le cuffie)
      if (!isActive) return;

      const rawPois: any[] = Array.isArray(e.detail?.pois) ? e.detail.pois : [];
      const rawCount: number = e.detail?.count || rawPois.length || 0;

      // Calcola il conteggio filtrato e DE-DUPLICATO (allineamento perfetto con App.tsx)
      let count = rawCount;
      try {
        const stored = localStorage.getItem('wip_active_subcategories');
        const activeSubcats: Record<string, boolean> = stored ? JSON.parse(stored) : {};

        // Stesso confronto categoria→bucket del nativo (isCategoryAllowed):
        // confrontare activeCats direttamente col tag grezzo del POI non
        // combaciava mai, quindi il conteggio del banner ignorava di fatto
        // la selezione categorie del setup GeoControl.
        const filteredPois = rawPois.filter((p: any) =>
          isCategoryAllowed({ category: p.category || p.poiType, premium: p.premium, is_gem: p.is_gem }, activeSubcats));

        const uniquePois: any[] = [];
        const seen = new Set<string>();
        for (const p of filteredPois) {
          const keyName = (p.nome || p.name || '').toLowerCase().trim();
          const keyCoord = `${(p.lat || 0).toFixed(4)}_${(p.lon || 0).toFixed(4)}`;
          if (!seen.has(keyName) && !seen.has(keyCoord)) {
            if (keyName) seen.add(keyName);
            seen.add(keyCoord);
            uniquePois.push(p);
          }
        }
        count = uniquePois.length;
      } catch {}
      
      if (count === 0) return;

      // Banner di stato via canale toast condiviso (ToastHost, role="status"/
      // aria-live): prima era un <div> costruito a mano con document.createElement,
      // fuori dal flusso React e invisibile agli screen reader.
      notify(getTranslation('gr_poi_caricati', language).replace('{n}', String(count)), 'success', 5000);
    };
    
    window.addEventListener("pois-loaded", handlePoisLoaded);
    return () => window.removeEventListener("pois-loaded", handlePoisLoaded);
  }, [isActive, language]);

  // Deep Link Autoplay: quando l'app viene aperta dal geofencing nativo
  // con itainta://poi/{id}, il sistema invia 'deep-link-poi' dal MainActivity
  useEffect(() => {
    const openPoiFromDeepLink = async (poiId: string, guide?: string) => {
      // Dedup: in modalità automatica arrivano sia 'poi-arrived' (plugin) sia il
      // deep-link (launchApp/notifica) per lo stesso POI — gestiamo il primo.
      const now = Date.now();
      const last = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
      // 60 s, non 15: con la WebView fredda il deep link arriva ben dopo il
      // 'poi-arrived' (gli eventi nativi sono retainUntilConsumed) e la stessa
      // tappa si apriva e parlava due volte. 60 s e' la stessa finestra di
      // WIP Nav e dei trigger web.
      if (last.id === String(poiId) && now - last.ts < 60_000) return;
      (window as any).__wipLastPoiTrigger = { id: String(poiId), ts: now };

      // ✅ [RECUPERO DATI COMPLETI] - Necessario per la visualizzazione corretta della scheda
      const { supabase } = await import('../lib/supabase');
      let poiData = null;
      try {
          const { data } = await supabase
            .from('shared_pois')
            .select('*')
            .eq('id', poiId)
            .single();
          poiData = data;
      } catch (e) {
          console.warn("[DeepLink] Supabase fetch failed", e);
      }

      const poi = poiData || { id: poiId };

      // Controllo sblocco
      const { getListeningHistory } = await import('../lib/listeningHistory');
      const { data: sessionData } = await supabase.auth.getSession();
      const history = await getListeningHistory(sessionData?.session?.user?.id);
      // Le gemme pagano come le altre categorie: niente sblocco automatico.
      const alreadyPaid = history.some(h => h.poi_id === String(poiId));

      const activationMode = localStorage.getItem('wip_activation_mode') || 'automatic';
      const isAutomatic = activationMode !== 'semi-automatic';

      // Unica via di riproduzione: PoiDetailSheet via autoPlay. Il vecchio
      // percorso che avviava qui l'audio direttamente causava doppie
      // riproduzioni (in coda) e partiva sopra il teaser nativo ancora in corso.
      window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
        detail: { poiId, poi, alreadyPaid, autoPlay: isAutomatic, guide }
      }));
    };

    const handleDeepLinkPoi = async (e: any) => {
      const { poiId, guide } = e.detail || {};
      // Il tap sulla notifica è un intento esplicito dell'utente: la scheda si
      // apre anche se il tour non risulta (ancora) attivo lato React.
      if (!poiId) return;
      console.log(`[GeofenceAudioGuide] Deep link received: poi=${poiId}, guide=${guide}`);
      await openPoiFromDeepLink(String(poiId), guide);
    };

    window.addEventListener('deep-link-poi', handleDeepLinkPoi);

    // Cold start: recupera il deep link salvato da MainActivity quando la
    // WebView non aveva ancora i listener montati (l'evento live era perso).
    locationService.consumePendingDeepLink().then((pending) => {
      if (pending?.poiId) {
        console.log(`[GeofenceAudioGuide] Pending deep link consumed: ${pending.poiId}`);
        openPoiFromDeepLink(pending.poiId, pending.guide);
      }
    }).catch(() => {});

    return () => window.removeEventListener('deep-link-poi', handleDeepLinkPoi);
  }, [isActive, language, guideMode]);

  // Prefetch in avvicinamento: finestra scorrevole degli ultimi 60 s.
  const prefetchTsRef = useRef<number[]>([]);

  // Listener per eventi nativi di arrivo/avvicinamento dal plugin nativo Android
  useEffect(() => {

    /** Fetch POI completo da Supabase (lat, lon, category, image_url per il banner). */
    const fetchPoiFull = async (poiId: string) => {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data } = await supabase
          .from('shared_pois')
          .select('id, name, lat, lon, category, image_url')
          .eq('id', poiId)
          .single();
        return data;
      } catch { return null; }
    };

    /**
     * poiArrived: il servizio background segnala che l'utente è arrivato al POI.
     * - Modalità automatica: genera e riproduce immediatamente l'audioguida + mostra banner.
     * - Modalità semi-automatica: mostra banner "Ascolta ora".
     * Entrambe le modalità mostrano il banner con metri = 0.
     */
    /**
     * Gli eventi nativi vengono trattenuti mentre la WebView dorme e
     * consegnati tutti insieme allo sblocco: senza questo filtro comparivano
     * scheda e banner "Ascolta" per POI superati da minuti (test in auto).
     * Gli eventi senza ts (build native vecchie) passano come prima.
     */
    const isStaleNativeEvent = (detail: any): boolean => {
      const ts = Number(detail?.ts);
      if (!Number.isFinite(ts) || ts <= 0) return false;
      return Date.now() - ts > 3 * 60_000;
    };

    const handlePoiArrived = async (e: any) => {
      const { poiId, poiName, lat, lon } = e.detail || {};
      if (!poiId) return;
      if (isStaleNativeEvent(e.detail)) return;

      let poiData = await fetchPoiFull(poiId);
      const poi = poiData || { id: poiId, name: poiName, lat, lon };

      // Controllo se l'audioguida è già sbloccata/salvata offline o acquistata nella storia
      const { getOfflineAudioUrl } = await import('../lib/offlineStorage');
      const { getListeningHistory } = await import('../lib/listeningHistory');
      const { supabase } = await import('../lib/supabase');

      const offlineAudio = await getOfflineAudioUrl(`${poiId}_${guideMode}`);
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;

      // 🛡️ [ARCHIVIO ACQUISTI] - Verifica se già pagata in precedenza
      const history = await getListeningHistory(currentUserId);
      // Gemme a pagamento come tutto il resto; l'audio offline resta uno
      // sblocco valido (è stato scaricato con un ascolto già pagato).
      const alreadyPaid = history.some(h => h.poi_id === String(poiId)) || !!offlineAudio;

      const activationMode = localStorage.getItem('wip_activation_mode') || 'automatic';
      const isAutomatic = activationMode !== 'semi-automatic';

      // ✅ [UI] - Apri sempre la scheda del POI per feedback visivo immediato
      // Passiamo autoPlay: isAutomatic per far partire l'audio (o il modale) senza click
      // Marca il trigger: il deep-link che segue l'arrivo (launchApp in modalità
      // automatica) per lo stesso POI viene così deduplicato.
      (window as any).__wipLastPoiTrigger = { id: String(poiId), ts: Date.now() };
      window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
        detail: { poiId, poi, alreadyPaid, autoPlay: isAutomatic }
      }));

      // Mostra il banner di arrivo (metri = 0)
      window.dispatchEvent(new CustomEvent('wip-poi-approach', {
        detail: { poi, distance: 0, isCar: false, isArrival: true, alreadyPaid }
      }));

      // ✅ [NOTA] - Il teaser viene ora gestito dal servizio Nativo Android (Opzione B)
      // per garantire reattività massima. Il JS attende solo la guida Elite.
      // La logica di autoplay dell'audio Elite è ora centralizzata in PoiDetailSheet.tsx
      // tramite la prop autoPlay, per evitare duplicazioni e gestire correttamente i crediti.
    };

    /**
     * poiApproaching: l'utente si sta avvicinando al POI (zona alert).
     * Mostra sempre il banner con i metri restanti e il tasto "Ascolta".
     */
    const handlePoiApproaching = async (e: any) => {
      const { poiId, poiName, lat, lon } = e.detail || {};
      if (!poiId) return;
      if (isStaleNativeEvent(e.detail)) return;

      const poiData = await fetchPoiFull(poiId);
      const poi = poiData || { id: poiId, name: poiName, lat, lon };

      // PREFETCH DEL TESTO DELL'AUDIOGUIDA, come fa il nativo (AudioPrefetch-
      // Manager a 150/300 m): all'arrivo la scheda trova il testo gia' in
      // cache (poi_audioguides) e in modalita' pass l'ascolto parte subito
      // invece di aspettare la generazione. Best-effort, mai bloccante: un
      // errore qui non deve toccare il banner di avvicinamento.
      // SOLO se il POI passera' davvero il trigger (categoria attiva, non in
      // cooldown, non gia' ascoltato) e al massimo 3 al minuto: prima si
      // generava (e si contava un play) anche per POI che non avrebbero mai
      // parlato — in auto, decine di chiamate LLM per niente.
      try {
        const { passerebbeIlTrigger } = await import('../lib/geofencing/foregroundTriggers');
        const now = Date.now();
        prefetchTsRef.current = prefetchTsRef.current.filter(ts => now - ts < 60_000);
        const ammesso = passerebbeIlTrigger(poi) && !isPlayed(String(poiId)) && prefetchTsRef.current.length < PREFETCH_MAX_PER_MIN;
        if (ammesso) {
          prefetchTsRef.current.push(now);
          const { getOrCreateAudioguideText } = await import('../services/audioguideService');
          // linguaCorrente(): al primo avvio rileva la lingua di sistema
          // invece di ripiegare su IT (il prefetch generava testi italiani).
          const lingua = linguaCorrente();
          const personaggio = (localStorage.getItem('wip_guide_character') || guideMode || 'nicky') as any;
          void getOrCreateAudioguideText(poi as any, lingua, personaggio, { incrementPlay: false }).catch(() => { /* si generera' all'arrivo */ });
        }
      } catch { /* modulo non disponibile: nessun prefetch */ }

      // La distanza NON è 150 fissa: il raggio di alert è 150 m a piedi ma
      // 300 m in auto, e il banner mostrava "150m" anche per POI molto più
      // lontani. Se il nativo la fornisce si usa quella; altrimenti si parte
      // dal raggio corretto per la modalità e il primo fix GPS la corregge.
      // Chiave allineata alle impostazioni (guideSettings.KEYS.transport =
      // 'wip_transport_pref', valore 'auto' | 'walk' | 'car'): prima leggeva
      // 'wip_transport_mode', chiave inesistente → sempre modalità a piedi.
      const isCar = (localStorage.getItem('wip_transport_pref') || '') === 'car';
      // Il nativo può fornire la distanza come `distanceM` (nuove build) o
      // `distance`; se manca (NaN) si ricade sul raggio di alert corretto per
      // la modalità invece di mostrare un "150m" fittizio.
      const nativeDist = Number((e.detail || {}).distanceM ?? (e.detail || {}).distance);
      window.dispatchEvent(new CustomEvent('wip-poi-approach', {
        detail: {
          poi,
          distance: Number.isFinite(nativeDist) && nativeDist > 0 ? nativeDist : (isCar ? 300 : 150),
          alertRadius: isCar ? 300 : 150,
          isCar,
          isArrival: false,
        }
      }));
    };

    // IMPORTANTE: locationService dispatcha su window, non su document
    window.addEventListener('poi-arrived', handlePoiArrived);
    window.addEventListener('poi-approaching', handlePoiApproaching);
    return () => {
      window.removeEventListener('poi-arrived', handlePoiArrived);
      window.removeEventListener('poi-approaching', handlePoiApproaching);
    };
  }, [isActive, language, guideMode]);

  const [dismissedPwaBanner, setDismissedPwaBanner] = useState(false);
  const isPwa = !Capacitor.isNativePlatform();

  // L'interruttore del gate di bussola si aggancia al pannello GeoControl
  // quando questo compare (l'utente apre il profilo) e si stacca quando
  // sparisce. L'osservatore guarda solo le comparse/sparizioni di nodi e fa
  // una getElementById per frame al massimo (coalescenza con rAF): in un'app
  // con la mappa aperta le mutazioni sono continue, e senza il freno sarebbe
  // una ricerca per ogni tile spostata.
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let pendente = 0;
    const guarda = () => {
      pendente = 0;
      const el = document.getElementById(ANCORA_IMPOSTAZIONI);
      setAncora(prev => (prev === el ? prev : el));
    };
    guarda();
    const obs = new MutationObserver(() => {
      if (pendente) return;
      pendente = requestAnimationFrame(guarda);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (pendente) cancelAnimationFrame(pendente); };
  }, []);

  return (
    <>
      {ancora && createPortal(<InterruttoreGateBussola language={language} />, ancora)}
    <AnimatePresence>
      {(isActive && isPwa && posizioneNegata) && (
        <motion.div
          key="posizione-negata"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          role="alert"
          className="fixed top-20 left-4 right-4 z-[9999] bg-white/95 backdrop-blur-xl border border-red-200 p-4 rounded-3xl shadow-2xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0">
            <MapPinOff className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-red-700 uppercase tracking-tight mb-0.5">
              {getTranslation('posizione_negata_titolo', language)}
            </p>
            <p className="text-[10px] font-bold text-gray-600 leading-tight">
              {getTranslation('posizione_negata_testo', language)}
            </p>
          </div>
          <button
            onClick={() => setPosizioneNegata(false)}
            className="p-2 bg-gray-100 text-gray-400 rounded-xl hover:text-gray-600 transition-colors"
            aria-label={getTranslation('tour_chiudi', language)}
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
      {(isActive && isPwa && !dismissedPwaBanner && !posizioneNegata) && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-20 left-4 right-4 z-[9999] bg-white/90 backdrop-blur-xl border border-amber-200 p-4 rounded-3xl shadow-2xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-primary uppercase tracking-tight mb-0.5">
              {getTranslation('web_limitata_titolo', language)}
            </p>
            <p className="text-[10px] font-bold text-gray-500 leading-tight">
              {getTranslation('web_limitata_testo', language)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.open('https://play.google.com/store/apps/details?id=com.itaintasca.app', '_blank')}
              className="p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDismissedPwaBanner(true)}
              className="p-2 bg-gray-100 text-gray-400 rounded-xl hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
