import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'motion/react';
import { Download, AlertTriangle, X } from 'lucide-react';
import { Language } from '../lib/i18n';
import { locationService } from '../services/locationService';

interface GeofenceAudioGuideProps {
  isActive: boolean;
  isMuted?: boolean;
  itinerary: any[]; 
  guideMode: 'nicky' | 'dante';
  language: Language;
}

export default function GeofenceAudioGuide({ isActive, isMuted, itinerary, guideMode, language }: GeofenceAudioGuideProps) {
  useEffect(() => {
    // Keep locationService settings synchronized dynamically as React states change
    locationService.syncSettings(itinerary, guideMode, language, isActive, isMuted);
  }, [isActive, isMuted, itinerary, guideMode, language]);

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
      const msg = e?.detail?.message || 'Il tour di gruppo è terminato.';
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
        const activeCats = stored ? Object.keys(JSON.parse(stored)).filter(k => JSON.parse(stored)[k]) : [];

        let filteredPois = rawPois;
        if (activeCats.length > 0) {
          filteredPois = rawPois.filter((p: any) => {
            const cat = (p.category || p.poiType || '').toLowerCase();
            // Gemme sempre attive: stesso criterio del radar (App.tsx) e del nativo
            const isGem = p.premium || p.is_gem || cat === 'gemme';
            return isGem || activeCats.includes(cat);
          });
        }

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
      
      const banner = document.createElement('div');
      banner.style.position = 'fixed';
      banner.style.top = '100px';
      banner.style.left = '50%';
      banner.style.transform = 'translateX(-50%)';
      banner.style.backgroundColor = '#4CAF50';
      banner.style.color = 'white';
      banner.style.padding = '12px 24px';
      banner.style.borderRadius = '30px';
      banner.style.fontWeight = 'bold';
      banner.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      banner.style.zIndex = '9999';
      banner.style.transition = 'opacity 0.5s ease-in-out';
      banner.innerText = `✅ ${count} POI caricati nel radar. Ora puoi spegnere il display!`;
      
      document.body.appendChild(banner);
      
      setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => document.body.removeChild(banner), 500);
      }, 4000);
    };
    
    window.addEventListener("pois-loaded", handlePoisLoaded);
    return () => window.removeEventListener("pois-loaded", handlePoisLoaded);
  }, [isActive]);

  // Deep Link Autoplay: quando l'app viene aperta dal geofencing nativo
  // con itainta://poi/{id}, il sistema invia 'deep-link-poi' dal MainActivity
  useEffect(() => {
    const openPoiFromDeepLink = async (poiId: string, guide?: string) => {
      // Dedup: in modalità automatica arrivano sia 'poi-arrived' (plugin) sia il
      // deep-link (launchApp/notifica) per lo stesso POI — gestiamo il primo.
      const now = Date.now();
      const last = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
      if (last.id === String(poiId) && now - last.ts < 15000) return;
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

      // La distanza NON è 150 fissa: il raggio di alert è 150 m a piedi ma
      // 300 m in auto, e il banner mostrava "150m" anche per POI molto più
      // lontani. Se il nativo la fornisce si usa quella; altrimenti si parte
      // dal raggio corretto per la modalità e il primo fix GPS la corregge.
      const isCar = (localStorage.getItem('wip_transport_mode') || '') === 'car';
      const nativeDist = Number((e.detail || {}).distance);
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

  return (
    <AnimatePresence>
      {(isActive && isPwa && !dismissedPwaBanner) && (
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
              {language === 'IT' ? 'Esperienza Web Limitata' : 'Limited Web Experience'}
            </p>
            <p className="text-[10px] font-bold text-gray-500 leading-tight">
              {language === 'IT'
                ? 'Su browser l\'audio si interrompe se spegni lo schermo. Scarica l\'App per il tour automatico!'
                : 'Audio stops if the screen turns off in the browser. Download the App for the automatic tour!'}
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
  );
}
