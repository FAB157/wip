/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { getGuideCharacter, setGuideCharacter } from "./lib/guideSettings";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "./lib/supabase";
import { usePredictiveDownload } from "./hooks/usePredictiveDownload";
import ProfileScreen from "./components/ProfileScreen";
import LoginScreen from "./components/LoginScreen";
import PermissionsModal from "./components/PermissionsModal";
import { locationService } from "./services/locationService";
import { clearOrphanedAudioFiles } from "./lib/offlineStorage";
import { FAVORITES_EVENT, getLocalFavorites, setLocalFavorites, toggleFavoritePoi, removeFavoritePoi, flushPendingFavSync } from "./lib/favorites";
import { initOfflineBilling } from "./services/dayPassService";
import DayPassBadge from "./components/DayPassBadge";
import { wipeLocalUserData } from "./lib/userSession";
import { Headphones, MapPin } from "lucide-react";
import { Language, getTranslation } from "./lib/i18n";
import { Capacitor } from '@capacitor/core';
// import { Purchases } from '@revenuecat/purchases-capacitor';

import MapArea from "./components/MapArea";
import CategoryChips from "./components/CategoryChips";
import PoiDetailSheet from "./components/PoiDetailSheet";
import BottomNav from "./components/BottomNav";
import PlanScreen from "./components/PlanScreen";
import EventsScreen from "./components/EventsScreen";
import CameraScreen from "./components/CameraScreen";
import VisionCardSheet from "./components/VisionCardSheet";
import GeofenceAudioGuide from "./components/GeofenceAudioGuide";
import PoiRadarPanel from "./components/PoiRadarPanel";
import AudioPlayerBanner from "./components/AudioPlayerBanner";
import ApproachBanner from "./components/ApproachBanner";
import { OnboardingCarousel } from "./components/OnboardingCarousel";
import RoutePoisModal from "./components/RoutePoisModal";
import ZeroCreditsBanner from "./components/ZeroCreditsBanner";
import AgentControls from "./components/AgentControls";
import DayPassOfferModal from "./components/DayPassOfferModal";
import ToastHost from "./components/ToastHost";

// Centro iniziale finché l'utente non muove la mappa. Reference stabile: un
// array inline come prop faceva ripartire i fetch di EventsScreen a ogni
// render di App.
const DEFAULT_EVENTS_CENTER: [number, number] = [44.07, 10.1];
/** Raggio di ricerca iniziale (km) prima del primo movimento della mappa. */
const DEFAULT_EVENTS_RADIUS_KM = 100;

export default function App() {
  // --- 1. Basic App State ---
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Utente della sessione precedente: serve a distinguere un semplice
  // refresh del token da un vero cambio account / logout.
  const sessionUserIdRef = useRef<string | null>(null);
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem("wip_language") as Language) || "IT");
  // Centro e raggio della mappa VISUALIZZATA: è il riferimento geografico di
  // tutte le ricerche esterne (Viator, GetYourGuide, Virgilio, Ticketmaster).
  // Prima erano ancorate a una costante, quindi spostare la mappa su un'altra
  // città non cambiava i risultati.
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_EVENTS_CENTER);
  const [mapRadiusKm, setMapRadiusKm] = useState<number>(DEFAULT_EVENTS_RADIUS_KM);
  const [isRecovering, setIsRecovering] = useState(() => window.location.hash.includes('type=recovery'));

  const { bundleState, closeBundle, triggerBundleCheck } = usePredictiveDownload();

  // --- 2. Navigation & UI ---
  const [activeTab, setActiveTab] = useState<"map" | "plan" | "camera" | "profile" | "events">("profile");
  const [previousTab, setPreviousTab] = useState<string | null>(null);
  const [isRadarMode, setIsRadarMode] = useState(false);
  // Scheda Vision (riconoscimento fotocamera): NON è un POI, ha una vista dedicata
  const [visionCard, setVisionCard] = useState<any | null>(null);

  // --- 3. Audio Guide State ---
  // Ripristino dal flag persistito: partendo sempre da `false`, riaprire
  // l'app mentre la guida era attiva in background la SPEGNEVA (il sync
  // successivo chiamava stopBackgroundPoiService).
  const [isAudioGuideActive, setIsAudioGuideActive] = useState(() => {
    try {
      return localStorage.getItem('wip_audioguide_active') === 'true';
    } catch {
      return false;
    }
  });
  const [isAudioGuideMuted, setIsAudioGuideMuted] = useState(false);
  // Personaggio guida persistito in guideSettings (wip_guide_character):
  // prima era solo state React → la scelta Dante si perdeva al riavvio e
  // popup POI / Vision (che leggono getGuideCharacter) restavano su Nicky.
  const [guideMode, setGuideModeState] = useState<"nicky" | "dante">(() => getGuideCharacter());
  const setGuideMode = useCallback((mode: "nicky" | "dante") => {
    setGuideCharacter(mode);
    setGuideModeState(mode);
  }, []);
  const [radarPois, setRadarPois] = useState<any[]>([]);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [itinerary, setItinerary] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any | null>(null);

  // Località predefinita del profilo. Prima era una costante con un setter
  // vuoto: "Usa posizione attuale" e la ricerca città confermavano ma non
  // cambiavano nulla. Ora è stato vero, persistito tra le sessioni.
  const [defaultLocation, setDefaultLocation] = useState<[number, number]>(() => {
    try {
      const stored = localStorage.getItem('wip_default_location');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n: any) => typeof n === 'number')) {
          return parsed as [number, number];
        }
      }
    } catch { /* valore corrotto: si usa il default */ }
    return [44.07, 10.1];
  });

  const updateDefaultLocation = useCallback((loc: [number, number]) => {
    setDefaultLocation(loc);
    try {
      localStorage.setItem('wip_default_location', JSON.stringify(loc));
    } catch { /* storage pieno o non disponibile */ }
  }, []);

  const isFollowingItinerary = isAudioGuideActive && (!!activePlan || itinerary.length > 0);

  // --- 4. Filtering & POIs ---
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('wip_active_subcategories');
      if (stored) {
        const parsed = JSON.parse(stored);
        const cats = Object.keys(parsed).filter(k => parsed[k]);
        return cats.length > 0 ? cats : ["monumenti", "musei", "chiese"];
      }
    } catch(e) {}
    // Stesso default del setup GeoControl (le gemme sono sempre attive a parte)
    return ["monumenti", "musei", "chiese"];
  });

  const [selectedPoi, setSelectedPoi] = useState<any | null>(null);
  const [poiAutoPlay, setPoiAutoPlay] = useState(false);
  const [nearbyPoisForSelected, setNearbyPoisForSelected] = useState<any[]>([]);
  const [subFilters, setSubFilters] = useState<string[]>([]);
  const [visionText, setVisionText] = useState<string>("");

  // --- 5. Game & Admin ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [discoveredPoi, setDiscoveredPoi] = useState<any | null>(null);
  const [badgeAlert, setBadgeAlert] = useState<string[] | null>(null);

  // --- 6. Smart Route Modal ---
  const [routeModalConfig, setRouteModalConfig] = useState<{
    isOpen: boolean;
    startCoords: { lat: number, lon: number } | null;
    endCoords: { lat: number, lon: number } | null;
    destinationName: string;
    onStart: (pois: any[]) => void;
  }>({ isOpen: false, startCoords: null, endCoords: null, destinationName: "", onStart: () => {} });

  // --- 7. Global Chat State ---
  const [globalChatConfig, setGlobalChatConfig] = useState<{
    isOpen: boolean;
    poiName?: string;
    initialMessage?: string;
  }>({ isOpen: false });

  // Billing offline: riconcilia il registro spese per-listen e il contatore
  // Day Pass al ritorno della rete, e tiene aggiornato lo snapshot del saldo
  // nel nativo (tetto di spesa quando si è offline).
  useEffect(() => {
    initOfflineBilling();
  }, []);

  useEffect(() => {
    const handleOpenChat = (e: any) => {
      setGlobalChatConfig({
        isOpen: true,
        poiName: e.detail.poiName,
        initialMessage: e.detail.context
      });
      setActiveTab("map"); // Optional: switch to map or keep current
    };
    window.addEventListener('wip-open-chat', handleOpenChat);
    return () => window.removeEventListener('wip-open-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    const handleSmartNav = (e: any) => {
      setRouteModalConfig({
        isOpen: true,
        startCoords: e.detail.startCoords || null,
        endCoords: e.detail.endCoords,
        destinationName: e.detail.destinationName,
        // Default sicuro: il dispatch di ItineraryStop non fornisce onStart e
        // il vecchio `routeModalConfig.onStart(pois)` esplodeva con TypeError
        // alla conferma. Senza callback esplicita si avvia il navigatore
        // interno via evento (gestito da PlanScreen/useWalkingNavigation).
        onStart: e.detail.onStart || (() => {})
      });
    };
    window.addEventListener('wip-smart-navigate', handleSmartNav);
    return () => window.removeEventListener('wip-smart-navigate', handleSmartNav);
  }, []);

  // "Apri sulla mappa" dalle aree offline scaricate: porta al tab mappa
  // (MapArea centra sulla zona). Funziona anche senza connessione.
  useEffect(() => {
    const handleOpenMapArea = () => setActiveTab('map');
    window.addEventListener('wip-open-map-area', handleOpenMapArea);
    return () => window.removeEventListener('wip-open-map-area', handleOpenMapArea);
  }, []);

  // --- Handlers ---
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("wip_language", lang);
  }, []);

  const handleToggleAudioGuide = useCallback((active: boolean) => {
    console.log(`[App.tsx] Audio Guide toggle: ${active}`);
    setIsAudioGuideActive(active);
    localStorage.setItem('wip_audioguide_active', active ? 'true' : 'false');
    if (active) {
      locationService.unlockAudio();
      // Proponi il bundle delle audioguide solo all'attivazione del tasto cuffie
      triggerBundleCheck();
    }
  }, [triggerBundleCheck]);

  const handleToggleRadar = () => {
    const next = !isRadarMode;
    setIsRadarMode(next);
    if (next && !isAudioGuideActive) handleToggleAudioGuide(true);
  };

  const handleRemoveRadarPoi = async (poiId: string) => {
    // Rimozione COSMETICA dal radar UI. Prima chiamava syncManualSelection coi
    // POI del radar: ma quel metodo marca le voci come isFromItinerary=true nel
    // nativo, trasformando ogni POI di prossimità in "tappa" e generando
    // notifiche di check-in false ("Tappa completata!"). syncManualSelection è
    // ora riservato alle vere tappe (locationService.syncItineraryToNative).
    setRadarPois(radarPois.filter(p => p.id !== poiId));
  };

  /**
   * Azzera tutto ciò che appartiene all'utente uscente: stato React,
   * dati locali e servizi in corso. Chiamata al logout e al cambio account.
   */
  const resetUserState = useCallback(() => {
    setItinerary([]);
    setActivePlan(null);
    setRadarPois([]);
    setSelectedPoi(null);
    setVisionCard(null);
    setIsAdmin(false);
    setIsAudioGuideActive(false);
    setActiveTab('profile');

    // La guida non deve continuare a girare (né a raccogliere posizione)
    // per un utente che non è più loggato.
    try {
      locationService.syncSettings([], 'nicky', language, false);
      locationService.stopWatching();
    } catch (e) {
      console.warn('[Session] Stop guida al logout fallito:', e);
    }
    try {
      localStorage.setItem('wip_audioguide_active', 'false');
    } catch { /* storage non disponibile */ }

    wipeLocalUserData();
  }, [language]);

  // Centro mappa dal viewport (emesso da MapArea a fine movimento). Aggiorniamo
  // lo stato solo oltre una soglia: EventsScreen rilancia 4 API a pagamento a
  // ogni cambio di valore, non deve farlo per un pan di pochi metri.
  useEffect(() => {
    const onMapCenter = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return;
      setMapCenter((prev) =>
        Math.abs(prev[0] - d.lat) > 0.02 || Math.abs(prev[1] - d.lon) > 0.02
          ? [d.lat, d.lon]
          : prev,
      );
      if (Number.isFinite(d.radiusKm)) {
        setMapRadiusKm((prev) => (Math.abs(prev - d.radiusKm) > 5 ? d.radiusKm : prev));
      }
    };
    window.addEventListener('wip-map-center-change', onMapCenter);
    return () => window.removeEventListener('wip-map-center-change', onMapCenter);
  }, []);

  // --- Initialization Effects ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      sessionUserIdRef.current = session?.user?.id ?? null;
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Logout o cambio account: azzerare TUTTO lo stato derivato dall'utente.
      // Senza questo, itinerario, piano, POI del radar e scheda vision del
      // precedente restavano in memoria e ricomparivano al login del
      // successivo sullo stesso dispositivo (con i suoi dati locali).
      const prevUserId = sessionUserIdRef.current;
      const nextUserId = s?.user?.id ?? null;
      if (prevUserId && prevUserId !== nextUserId) {
        resetUserState();
      }
      sessionUserIdRef.current = nextUserId;

      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
    });
    
    // Check for deep links (e.g. ?pin=123456)
    const params = new URLSearchParams(window.location.search);
    if (params.get('pin')) {
      setActiveTab('profile');
    }

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      // if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      //   Purchases.setLogLevel({ level: "DEBUG" as any });
      //   // NOTE: The RevenueCat API Key must be set in your .env or RevenueCat Dashboard
      //   Purchases.configure({ apiKey: import.meta.env.VITE_REVENUECAT_ANDROID_KEY || 'goog_placeholder' });
      //   Purchases.logIn({ appUserID: session.user.id }).catch(e => console.warn('RevenueCat login failed', e));
      // }
      supabase.from("user_profiles").select("is_admin").eq("id", session.user.id).single()
        .then(({ data }) => setIsAdmin(data?.is_admin === true))
        .catch(() => setIsAdmin(false));

      // Filtro server-side: prima scaricava l'INTERA tabella (tutti gli utenti)
      // e filtrava client-side — banda, egress e privacy.
      // Prima si svuota la coda delle sync pendenti, POI si legge il cloud:
      // senza await, una rimozione fatta offline non era ancora committata
      // quando arrivava la select e il preferito rimosso "risorgeva" nel
      // mirror locale per sempre.
      flushPendingFavSync().catch(() => {})
        .then(() => supabase.from("saved_pois").select("*").eq('user_id', session.user.id)
          .order('created_at', { ascending: false }).limit(200))
        .then(({ data, error }: any) => {
        if (!error && data && Array.isArray(data)) {
          // MERGE cloud + mirror locale (mock_db_saved_pois): prima il cloud
          // sovrascriveva tutto e i cuori messi offline (o con sync fallita)
          // sparivano da Scoperte/Preferiti/stella pur restando sul device.
          // La dedup è anche cloud-vs-cloud: senza vincolo unique sul DB due
          // device (o due retry) possono aver creato righe doppie.
          const localFavs = getLocalFavorites();
          const seen = new Set<string>();
          const merged: any[] = [];
          for (const item of data) {
            if (!item?.data && !item?.poi_id) continue;
            const key = String(item.poi_id ?? item.data?.id ?? item.id);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          for (const f of localFavs) {
            const key = String(f.poi_id ?? f.id);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(f);
          }
          // Aggiorna il mirror locale (dispatch di FAVORITES_EVENT incluso,
          // che riallinea anche `itinerary` tramite il listener sotto).
          setLocalFavorites(merged);

          const userPois = merged
            .map((item: any) => item.data || item)
            .filter(Boolean);
          setItinerary(userPois);

          // 🧹 Garbage Collection: Pulisci audio orfani all'avvio
          const activeIds = [
            ...userPois.map((p: any) => p.id),
            ...(activePlan?.giorni?.flatMap((g: any) => g.tappe.map((t: any) => t.id_tappa)) || [])
          ];
          clearOrphanedAudioFiles(activeIds.map(id => String(id)));
        }
      }).catch((e: any) => console.warn("[App.tsx] Failed to load saved POIs", e));
    }
  // Dipendenza sull'ID, non sull'oggetto session: onAuthStateChange crea un
  // oggetto nuovo anche su TOKEN_REFRESHED (~ogni ora) e il refetch
  // sovrascriveva lo stato locale dell'itinerario.
  }, [session?.user?.id]);

  // Il mirror locale dei preferiti è l'unica fonte per `itinerary`: cuore
  // (popup mappa), stella (scheda POI) e cestino del Diario passano tutti da
  // lib/favorites, che dopo ogni modifica emette FAVORITES_EVENT. Prima ogni
  // controllo scriveva in uno store diverso e le liste restavano scollegate.
  useEffect(() => {
    const syncFromLocal = () => {
      setItinerary(getLocalFavorites().map((f: any) => f.data || f).filter(Boolean));
    };
    window.addEventListener(FAVORITES_EVENT, syncFromLocal);
    return () => window.removeEventListener(FAVORITES_EVENT, syncFromLocal);
  }, []);

  // Back button Android: senza questo listener Capacitor chiude l'Activity da
  // qualsiasi schermata (la SPA non ha history). Chiudiamo nell'ordine:
  // chat → modale percorso → scheda POI → radar → torna alla mappa → minimizza.
  // MAI exitApp: ucciderebbe anche il servizio audioguida in background.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: any = null;
    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        handle = await CapApp.addListener('backButton', () => {
          if (globalChatConfig.isOpen) { setGlobalChatConfig(p => ({ ...p, isOpen: false })); return; }
          if (routeModalConfig.isOpen) { setRouteModalConfig(p => ({ ...p, isOpen: false })); return; }
          if (selectedPoi) { setSelectedPoi(null); setPoiAutoPlay(false); return; }
          if (isRadarMode) { setIsRadarMode(false); return; }
          if (activeTab !== 'map') { setActiveTab('map'); return; }
          import('@capacitor/app').then(({ App: A }) => A.minimizeApp());
        });
      } catch (e) {
        console.warn('[App.tsx] backButton listener non registrato', e);
      }
    })();
    return () => { handle?.remove?.(); };
  }, [globalChatConfig.isOpen, routeModalConfig.isOpen, selectedPoi, isRadarMode, activeTab]);

  // Check initial categories on mount (But DO NOT sync active service state automatically)
  useEffect(() => {
    if (!permissionsGranted) return;
    const init = async () => {
      locationService.startWatching();
    };
    init();

    const handlePoisUpdated = (e: any) => {
      let pois = Array.isArray(e.detail) ? e.detail : [];
      
      // Filtra per categorie attive (allineamento con la logica web)
      const activeCats = (() => {
        try {
          const stored = localStorage.getItem('wip_active_subcategories');
          if (stored) {
            const parsed = JSON.parse(stored);
            return Object.keys(parsed).filter(k => parsed[k]);
          }
        } catch {}
        // Default allineato al setup GeoControl (monumenti/musei/chiese attivi)
        return ['monumenti', 'musei', 'chiese'];
      })();

      if (activeCats.length > 0) {
        pois = pois.filter((p: any) => {
          const cat = (p.category || p.poiType || '').toLowerCase();
          // Gemme "Default Assoluto • Sempre Attive" (checkbox disabilitata nel
          // setup): passano sempre, come nel servizio nativo.
          const isGem = p.premium || p.is_gem || cat === 'gemme';
          return isGem || activeCats.includes(cat);
        });
      }

      const uniquePois: any[] = [];
      const seen = new Set<string>();
      for (const p of pois) {
        const keyName = (p.nome || p.name || '').toLowerCase().trim();
        const keyCoord = `${(p.lat || 0).toFixed(4)}_${(p.lon || 0).toFixed(4)}`;
        if (!seen.has(keyName) && !seen.has(keyCoord)) {
          if (keyName) seen.add(keyName);
          seen.add(keyCoord);
          uniquePois.push(p);
        }
      }
      setRadarPois(uniquePois);
    };

    const handleItineraryCheckin = (e: any) => {
      const { poiId } = e.detail;
      console.log(`[App.tsx] Check-in received for POI: ${poiId}`);
      setActiveTab("plan");
    };

    // Listen for category updates from Setup page
    const handleSettingsUpdated = () => {
      const stored = localStorage.getItem('wip_active_subcategories');
      if (stored) {
        const parsed = JSON.parse(stored);
        const cats = Object.keys(parsed).filter(k => parsed[k]);
        // Anche la lista vuota va rispettata ("Deseleziona tutti"): prima
        // veniva ignorata e restava attiva la selezione precedente.
        setSelectedCategories(cats);
      }
    };

    window.addEventListener('pois-updated', handlePoisUpdated);
    window.addEventListener('wip-itinerary-checkin', handleItineraryCheckin);
    window.addEventListener('wip-settings-updated', handleSettingsUpdated);

    return () => {
      window.removeEventListener('pois-updated', handlePoisUpdated);
      window.removeEventListener('wip-itinerary-checkin', handleItineraryCheckin);
      window.removeEventListener('wip-settings-updated', handleSettingsUpdated);
    };
  }, [permissionsGranted]);

  // --- Map Handlers ---
  const handleSelectPoi = useCallback((poi: any, nearbyPois: any[], autoPlay = false) => {
    setSelectedPoi(poi);
    setPoiAutoPlay(autoPlay);
    setNearbyPoisForSelected(nearbyPois || []);
    setPreviousTab(prev => (activeTab !== "map" ? activeTab : prev));
    setActiveTab("map");
  }, [activeTab]);

  // Global UI Trigger - Opens POI sheet from background events (Geofencing, etc.)
  useEffect(() => {
    const handleOpenPoiFromEvent = (e: any) => {
      const { poi, autoPlay, guide } = e.detail;
      if (poi) {
        console.log(`[App] Opening POI from trigger: ${poi.name || poi.id}, autoPlay=${autoPlay}`);
        // Il deep link della notifica porta il personaggio (itainta://poi/ID?guide=dante):
        // prima veniva ignorato e l'autoplay usava sempre la voce corrente dell'app.
        if (guide === 'nicky' || guide === 'dante') setGuideMode(guide);
        // Piccolo delay per assicurare che il cambio tab avvenga correttamente
        setTimeout(() => {
          handleSelectPoi(poi, [], !!autoPlay);
        }, 100);
      }
    };
    window.addEventListener('wip-poi-trigger', handleOpenPoiFromEvent);

    const handleGuideStatus = (e: any) => {
      const text = typeof e.detail === 'string' ? e.detail : e.detail?.text;
      if (text) {
        console.log(`[App] Guide Status: ${text}`);
        // Show status banner
        const banner = document.createElement('div');
        banner.style.position = 'fixed';
        banner.style.top = '100px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.backgroundColor = '#2563eb';
        banner.style.color = 'white';
        banner.style.padding = '12px 24px';
        banner.style.borderRadius = '30px';
        banner.style.fontWeight = 'bold';
        banner.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.4)';
        banner.style.zIndex = '9999';
        banner.style.transition = 'opacity 0.5s ease-in-out';
        banner.innerText = text;

        document.body.appendChild(banner);
        setTimeout(() => {
          banner.style.opacity = '0';
          setTimeout(() => document.body.removeChild(banner), 500);
        }, 3000);
      }
    };
    window.addEventListener('audioguide-status', handleGuideStatus);

    return () => {
      window.removeEventListener('wip-poi-trigger', handleOpenPoiFromEvent);
      window.removeEventListener('audioguide-status', handleGuideStatus);
    };
  }, [handleSelectPoi]);

  // Ritorno dal checkout Stripe (/?payment=success|cancel): feedback
  // all'utente e pulizia dell'URL. I crediti li accredita il webhook,
  // qui diamo solo la conferma visiva.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const payment = params.get('payment');
      if (!payment) return;
      window.history.replaceState({}, '', window.location.pathname);
      const msg = payment === 'success'
        ? '✅ Pagamento completato! I crediti saranno accreditati a breve.'
        : 'Pagamento annullato.';
      // Il banner 'audioguide-status' viene montato da un altro effect:
      // piccolo delay per essere sicuri che il listener ci sia già.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('audioguide-status', { detail: msg }));
      }, 1000);
    } catch { /* URL non disponibile: nessun feedback */ }
  }, []);

  // Sync Categories & Active State to LocationService
  useEffect(() => {
    const cats = [...selectedCategories];
    if (!cats.includes('gemme')) cats.push('gemme');
    locationService.setCategories(cats);

    // Also update localStorage so native service sees it on next start.
    // MERGE, non sovrascrittura: il setup GeoControl salva anche i "false"
    // espliciti e il trigger web li legge con semantica `?? true` (chiave
    // assente = attiva). Riscrivere solo le chiavi true cancellava le
    // deselezioni dell'utente, che tornavano attive al riavvio.
    let obj: Record<string, boolean> = {};
    try { obj = JSON.parse(localStorage.getItem('wip_active_subcategories') || '{}') || {}; } catch { obj = {}; }
    Object.keys(obj).forEach(k => { obj[k] = selectedCategories.includes(k); });
    selectedCategories.forEach(c => { obj[c] = true; });
    localStorage.setItem('wip_active_subcategories', JSON.stringify(obj));

    locationService.syncSettings(itinerary, guideMode, language, isAudioGuideActive, isAudioGuideMuted);
  }, [itinerary, guideMode, language, isAudioGuideActive, isAudioGuideMuted, selectedCategories]);

  // Rimozione persistita via lib/favorites: aggiorna il mirror locale,
  // emette FAVORITES_EVENT (che riallinea `itinerary` e le altre liste) e
  // cancella dal cloud, con coda di retry se offline.
  const removePoiById = useCallback(async (id: string) => {
    setItinerary((prev) => prev.filter((p) => String(p.id) !== String(id)));
    await removeFavoritePoi(id);
  }, []);

  // Stella della scheda POI: stesso percorso del cuore del popup mappa
  // (lib/favorites), così Scoperte, Preferiti e la mappa restano coerenti.
  const toggleSavedPoi = useCallback(async (poi: any) => {
    await toggleFavoritePoi(poi);
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(!localStorage.getItem('has_seen_onboarding'));
  if (showOnboarding) return <OnboardingCarousel language={language} onComplete={() => { localStorage.setItem('has_seen_onboarding', 'true'); setShowOnboarding(false); }} />;
  // isRecovering va azzerato al successo, altrimenti l'utente resta in loop sul form "Nuova Password"
  if (authLoading || !session || isRecovering) return <LoginScreen onLoginSuccess={(s) => { setSession(s); setIsRecovering(false); }} initialAuthLoading={authLoading} forceMethod={isRecovering ? "update_password" : undefined} />;

  return (
    <div className="min-h-[100dvh] bg-[#323639] flex justify-center items-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-[100dvh] sm:h-[800px] max-w-[1200px] bg-surface relative overflow-hidden flex flex-col rounded-none sm:rounded-2xl lg:shadow-2xl border border-white/10">
        <PermissionsModal onComplete={() => setPermissionsGranted(true)} language={language} />
        
        {session?.user && <ZeroCreditsBanner userId={session.user.id} />}

        {/* TAB: MAPPA */}
        <div className={`flex-1 w-full overflow-hidden ${activeTab === "map" ? "h-full relative block" : "absolute inset-0 invisible opacity-0 pointer-events-none -z-10"}`}>
          <MapArea selectedCategories={selectedCategories} onSelectPoi={handleSelectPoi} subFilter={subFilters} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} language={language} activeTab={activeTab} isRadarMode={isRadarMode} radarPois={radarPois} />

          {/* PULSANTE RADAR CUFFIE */}
          {isAudioGuideActive && activeTab === "map" && (
            <div className="absolute left-4 z-[999] flex items-center gap-2" style={{ bottom: "100px" }}>
              <DayPassBadge />
              {isFollowingItinerary && (
                <motion.div
                  initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                  className="w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white shrink-0"
                >
                  <MapPin className="w-5 h-5 text-white" />
                </motion.div>
              )}
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleToggleRadar}
                className={`w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isFollowingItinerary
                    ? 'bg-rose-600 text-white ring-4 ring-rose-600/30'
                    : isRadarMode
                      ? 'bg-blue-600 text-white ring-4 ring-blue-600/30 animate-pulse'
                      : 'bg-white/90 text-blue-600 border border-blue-100'
                }`}
              >
                <Headphones className="w-6 h-6" />
              </motion.button>
            </div>
          )}

          <AnimatePresence>
            {isRadarMode && activeTab === "map" && (
              <PoiRadarPanel pois={radarPois} onClose={() => setIsRadarMode(false)} onFocus={(poi) => window.dispatchEvent(new CustomEvent('focus-poi', { detail: poi }))} onRemove={handleRemoveRadarPoi} language={language} />
            )}
          </AnimatePresence>

          <CategoryChips selectedIds={selectedCategories} onToggle={(id) => setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])} onEventClick={() => setActiveTab("events")} subFilter={subFilters} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} language={language} />

          <PoiDetailSheet poi={selectedPoi} autoPlay={poiAutoPlay} guideMode={guideMode} onClose={() => { setSelectedPoi(null); setPoiAutoPlay(false); if (previousTab && previousTab !== "map") { setActiveTab(previousTab as any); setPreviousTab(null); } }} visionText={visionText} isSaved={!!selectedPoi && itinerary.some((p) => String(p.id) === String(selectedPoi.id))} onToggleSave={() => selectedPoi && toggleSavedPoi(selectedPoi)} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} nearbyPois={nearbyPoisForSelected} onSelectNearby={(p) => handleSelectPoi(p, nearbyPoisForSelected.filter((n) => n.id !== p.id).concat([selectedPoi]))} language={language} />
        </div>
        
        {/* ALTRE TAB — i container restano montati (stato preservato), la
            transizione slide+fade è sul wrapper interno: quando il tab si
            attiva il display passa a flex e motion anima l'ingresso. */}
        <div className={`flex-1 w-full overflow-hidden ${activeTab === "plan" ? "flex flex-col relative" : "hidden"}`}>
          <motion.div
            className="flex-1 flex flex-col min-h-0"
            animate={activeTab === "plan" ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
          <PlanScreen
            guideMode={guideMode}
            setGuideMode={setGuideMode}
            itinerary={itinerary}
            onRemovePoi={removePoiById}
            onSelectPoi={handleSelectPoi}
            isAudioGuideActive={isAudioGuideActive}
            setIsAudioGuideActive={handleToggleAudioGuide}
            language={language}
            externalPlan={activePlan}
            setExternalPlan={setActivePlan}
          />
          </motion.div>
        </div>

        {activeTab === "events" && (
          <motion.div
            className="flex-1 w-full overflow-hidden flex flex-col relative"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
            <EventsScreen mapCenter={mapCenter} mapRadiusKm={mapRadiusKm} onClose={() => setActiveTab("map")} language={language} />
          </motion.div>
        )}
        {activeTab === "camera" && <CameraScreen onRecognize={(data) => {
          // Foto riconosciuta (ha l'immagine scattata o una scheda salvata):
          // apre la scheda Vision dedicata, NON un finto POI.
          if (data.image || data.card_id) {
            setVisionCard(data);
            return;
          }
          // Percorso Radar AR: è un vero POI del DB, apre la scheda POI classica
          setVisionText(data.spiegazione_audio || "");
          setSelectedPoi({ ...data, id: data.id || `vision-${Date.now()}` });
          setActiveTab("map");
        }} onClose={() => setActiveTab("map")} language={language} />}

        {visionCard && (
          <VisionCardSheet card={visionCard} language={language} onClose={() => setVisionCard(null)} />
        )}

        <div className={`flex-1 w-full overflow-hidden ${activeTab === "profile" ? "flex flex-col relative" : "hidden"}`}>
          <motion.div
            className="flex-1 flex flex-col min-h-0"
            animate={activeTab === "profile" ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
          <ProfileScreen guideMode={guideMode} setGuideMode={setGuideMode} itinerary={itinerary} onSelectPoi={handleSelectPoi} defaultLocation={defaultLocation} setDefaultLocation={updateDefaultLocation} userSession={session} onSignOut={async () => { await supabase.auth.signOut(); setSession(null); }} onRemovePoi={removePoiById} onClearItinerary={async () => setItinerary([])} language={language} setLanguage={setLanguage} />
          </motion.div>
        </div>

        <ApproachBanner language={language} />

        {/* Canale unico delle notifiche in-app (lib/toast.ts): sostituisce
            gli alert() bloccanti sparsi nelle schermate. */}
        <ToastHost language={language} />

        {/* BOTTOM NAV */}
        {activeTab !== "camera" && (
          <div className="print:hidden">
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} onPlanClick={() => setActiveTab("plan")} isAudioGuideActive={isAudioGuideActive} setIsAudioGuideActive={handleToggleAudioGuide} isAudioGuideMuted={isAudioGuideMuted} setIsAudioGuideMuted={setIsAudioGuideMuted} language={language} />
          </div>
        )}

        <div className="print:hidden">
          <GeofenceAudioGuide isActive={isAudioGuideActive} isMuted={isAudioGuideMuted} itinerary={itinerary} guideMode={guideMode} language={language} />
          <AudioPlayerBanner />

          <AnimatePresence>
            {globalChatConfig.isOpen && (
              <AgentControls
                itineraryId="general"
                userId={session?.user?.id}
                status="active"
                language={language}
                onClose={() => setGlobalChatConfig(prev => ({ ...prev, isOpen: false }))}
                initialMessage={globalChatConfig.initialMessage}
              />
            )}
          </AnimatePresence>

          <RoutePoisModal 
            isOpen={routeModalConfig.isOpen}
            onClose={() => setRouteModalConfig(prev => ({ ...prev, isOpen: false }))}
            startCoords={routeModalConfig.startCoords}
            endCoords={routeModalConfig.endCoords!}
            destinationName={routeModalConfig.destinationName}
            language={language}
            onStartNavigation={(pois, origin) => {
              setRouteModalConfig(prev => ({ ...prev, isOpen: false }));
              try { routeModalConfig.onStart?.(pois); } catch (e) { console.warn('[WIP Nav] onStart callback error', e); }
              // Avvia il navigatore interno (WIP Nav): PlanScreen ascolta e
              // chiama useWalkingNavigation.startNavigation con l'origine
              // scelta nel modal (GPS o indirizzo personalizzato).
              if (routeModalConfig.endCoords) {
                window.dispatchEvent(new CustomEvent('wip-internal-nav-start', {
                  detail: {
                    endCoords: routeModalConfig.endCoords,
                    destinationName: routeModalConfig.destinationName,
                    origin: origin || null,
                    pois
                  }
                }));
              }
            }}
          />
          <DayPassOfferModal
            isOpen={bundleState.isOpen}
            city={bundleState.city}
            poisCount={bundleState.pois.length}
            onClose={closeBundle}
          />
        </div>
      </motion.div>
    </div>
  );
}
