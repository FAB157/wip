/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { getGuideCharacter, setGuideCharacter, isCategoryAllowed } from "./lib/guideSettings";
import { getBlockedCommunityPoiIds, refreshBlockedCommunityPois } from "./lib/communityModeration";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "./lib/supabase";
import { usePredictiveDownload } from "./hooks/usePredictiveDownload";
// Pannelli pesanti caricati a richiesta (React.lazy): niente più nel bundle
// iniziale, così il first-paint è più leggero. Vengono comunque montati al
// primo accesso e poi mantenuti montati (stato preservato) per plan/profile.
const ProfileScreen = lazy(() => import("./components/ProfileScreen"));
import LoginScreen from "./components/LoginScreen";
import PermissionsModal from "./components/PermissionsModal";
import { locationService } from "./services/locationService";
import { clearOrphanedAudioFiles } from "./lib/offlineStorage";
import { FAVORITES_EVENT, getLocalFavorites, setLocalFavorites, toggleFavoritePoi, removeFavoritePoi, flushPendingFavSync } from "./lib/favorites";
import { initOfflineBilling, azzeraPoiPosseduti, caricaPoiPosseduti } from "./services/dayPassService";
import { ItaintaBackgroundPoi, clearNativeUserContext, pushUserContextToNative } from "./plugins/ItaintaBackgroundPoi";
import DayPassBadge from "./components/DayPassBadge";
import { wipeLocalUserData } from "./lib/userSession";
import { getApiUrl, invalidaTokenCache } from "./lib/api";
import NavChoiceSheet from "./components/NavChoiceSheet";
import { notify } from "./lib/toast";
import { notifyCreditsChanged } from "./lib/pricing";
import { Headphones, MapPin, Loader2, Navigation2, Route } from "lucide-react";
import { Language, getTranslation, linguaCorrente } from "./lib/i18n";
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
// import { Purchases } from '@revenuecat/purchases-capacitor';

import MapArea from "./components/MapArea";
import CategoryChips from "./components/CategoryChips";
import PoiDetailSheet from "./components/PoiDetailSheet";
import BottomNav from "./components/BottomNav";
const PlanScreen = lazy(() => import("./components/PlanScreen"));
const EventsScreen = lazy(() => import("./components/EventsScreen"));
const CameraScreen = lazy(() => import("./components/CameraScreen"));
import VisionCardSheet from "./components/VisionCardSheet";
import GeofenceAudioGuide from "./components/GeofenceAudioGuide";
import PoiRadarPanel from "./components/PoiRadarPanel";
import TourBanner from "./components/TourBanner";
import NavigationOverlay from "./components/NavigationOverlay";
import { ripetiIstruzioneGiro } from "./lib/tour/giroDriver";
import { useVistaGiro, useBozzaGiro } from "./lib/tour/useGiro";
import { tourService } from "./services/tourService";
import { avviaGiroDriver } from "./lib/tour/giroDriver";
import { gestisciErroreGiro } from "./lib/tour/passRichiesto";
import PercorsoPanel from "./components/PercorsoPanel";
import AudioPlayerBanner from "./components/AudioPlayerBanner";
import ApproachBanner from "./components/ApproachBanner";
import { OnboardingCarousel } from "./components/OnboardingCarousel";
import RoutePoisModal from "./components/RoutePoisModal";
import ZeroCreditsBanner from "./components/ZeroCreditsBanner";
import AgentControls from "./components/AgentControls";
import DayPassOfferModal from "./components/DayPassOfferModal";
import ToastHost from "./components/ToastHost";
import { useFeatureFlag } from "./lib/featureFlags";
import { record as recordNotification } from "./lib/notificationCenter";

/**
 * La posizione per un ricalcolo/salto: l'ultimo fix del watch se fresco e
 * credibile, altrimenti il GPS ad alta precisione; un fix da centinaia di
 * metri non vale (undefined → il servizio si prende la sua). Stessa regola
 * di TourBanner.conPosizione.
 */
function posizioneVeloce(fn: (p?: { lat: number; lon: number }) => void) {
  try {
    const l = locationService.getLastLocation();
    if (l && Date.now() - Number(l.timestamp) <= 15_000 && Number(l.accuracy) <= 100) return fn({ lat: l.latitude, lon: l.longitude });
  } catch { /* si passa al GPS */ }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return fn();
  navigator.geolocation.getCurrentPosition(
    (p) => fn(Number(p.coords.accuracy) <= 150 ? { lat: p.coords.latitude, lon: p.coords.longitude } : undefined),
    () => fn(),
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 },
  );
}

// Pannello mostrato al posto di una schermata spenta col kill switch admin.
function FeatureOffNotice({ onBack, language }: { onBack: () => void; language: Language }) {
  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-surface">
      <div className="text-4xl">🛠️</div>
      <div className="font-black text-primary text-lg">
        {language === 'IT' ? 'Funzione in manutenzione' : 'Feature under maintenance'}
      </div>
      <p className="text-sm text-on-surface-variant max-w-xs">
        {language === 'IT'
          ? 'Questa sezione è temporaneamente disattivata. Torna a trovarci tra poco.'
          : 'This section is temporarily disabled. Please check back soon.'}
      </p>
      <button onClick={onBack} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white font-black text-sm">
        {language === 'IT' ? 'Torna alla mappa' : 'Back to map'}
      </button>
    </div>
  );
}

// Fallback mostrato mentre un pannello lazy (plan/events/camera/profile)
// scarica il proprio chunk: uno spinner neutro su bg-surface, così il passaggio
// di tab non mostra uno sfarfallio bianco o un salto visivo.
function TabLoadingFallback() {
  return (
    <div className="flex-1 w-full h-full flex items-center justify-center bg-surface">
      <Loader2 className="w-7 h-7 animate-spin text-primary/70" />
    </div>
  );
}

// Centro iniziale finché l'utente non muove la mappa. Reference stabile: un
// array inline come prop faceva ripartire i fetch di EventsScreen a ogni
// render di App.
const DEFAULT_EVENTS_CENTER: [number, number] = [44.07, 10.1];
/** Raggio di ricerca iniziale (km) prima del primo movimento della mappa. */
const DEFAULT_EVENTS_RADIUS_KM = 100;

export default function App() {
  // --- 1. Basic App State ---
  const [session, setSession] = useState<any>(null);
  // Copia sempre aggiornata della sessione, leggibile dagli ascoltatori di
  // eventi che non possono dipendere da `session` senza riagganciarsi a ogni
  // cambio (vedi 'wip-auth-required').
  const sessionRef = useRef<any>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  // "Sto girando da ospite": scelta esplicita fatta sulla schermata d'accesso.
  // Volutamente in memoria e non in localStorage — vedi il gate piu' sotto.
  const [ospite, setOspite] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  // Utente della sessione precedente: serve a distinguere un semplice
  // refresh del token da un vero cambio account / logout.
  const sessionUserIdRef = useRef<string | null>(null);
  const [language, setLanguageState] = useState<Language>(() => {
    // DE è tornata una lingua UI completa il 14/08/2026 (dizionario tradotto,
    // selettore riabilitato): la vecchia coercizione DE→EN qui avrebbe
    // continuato a scippare la scelta agli utenti tedeschi a ogni avvio.
    //
    // PRIMO AVVIO: nessuna scelta salvata → si RILEVA la lingua del sistema
    // (navigator.languages/language, che su nativo eredita quella del
    // telefono) e si ripiega su EN, non su IT (28/08/2026). L'app che si apre
    // in italiano per chiunque nel mondo è un motivo di rifiuto di App Store
    // Review, oltre che una pessima prima impressione. La scelta manuale
    // dell'utente continua a vincere e resta persistita in `wip_language`.
    // linguaCorrente() applica esattamente la stessa regola per le schermate
    // che non ricevono `language` via props (LoginScreen, AppLockGate, banner).
    return linguaCorrente();
  });
  // Centro e raggio della mappa VISUALIZZATA: è il riferimento geografico di
  // tutte le ricerche esterne (Viator, GetYourGuide, Virgilio, Ticketmaster).
  // Prima erano ancorate a una costante, quindi spostare la mappa su un'altra
  // città non cambiava i risultati.
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_EVENTS_CENTER);
  const [mapRadiusKm, setMapRadiusKm] = useState<number>(DEFAULT_EVENTS_RADIUS_KM);
  const [isRecovering, setIsRecovering] = useState(() => window.location.hash.includes('type=recovery'));
  // MODALITÀ OSPITE (28/08/2026). L'app non è più tutta dietro il login: senza
  // sessione si vedono mappa, POI, schede e teaser gratuiti, e il login si
  // chiede solo quando serve davvero (acquisti, crediti, Day Pass, preferiti,
  // itinerari salvati, profilo, community, rotte server con Bearer).
  // App Store Review contesta il login forzato quando il contenuto è fruibile
  // senza account; è anche il primo muro che faceva abbandonare l'app.
  // `showLogin` è il modale, apribile da qualsiasi punto con l'evento
  // 'wip-open-login' (o automaticamente su 401, vedi più sotto).
  const [showLogin, setShowLogin] = useState(false);

  const { bundleState, closeBundle, triggerBundleCheck, openOffer } = usePredictiveDownload();
  // Invito al Day Pass su richiesta (radar → Dieci Tappe senza pass, 22/08/2026).
  // Con `motivo` (03/09/2026) la card si apre dal cancello del giro col
  // titolo che dice perche' — e col tasto «Acquista ora».
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail || {}; openOffer(d.city, d.motivo); };
    window.addEventListener('wip-open-daypass', h);
    return () => window.removeEventListener('wip-open-daypass', h);
  }, [openOffer]);
  // IL NEGOZIO DA QUALSIASI PUNTO (03/09/2026): «Ricarica crediti» nella card
  // del Day Pass, nel pannello del percorso, ovunque manchino i crediti.
  // App apre il profilo; ProfileScreen ascolta lo stesso evento e passa alla
  // scheda dei pacchetti.
  useEffect(() => {
    const h = () => {
      setMountedTabs(prev => prev.has("profile") ? prev : new Set(prev).add("profile"));
      setActiveTab('profile');
    };
    window.addEventListener('wip-open-shop', h);
    return () => window.removeEventListener('wip-open-shop', h);
  }, []);

  // --- 2. Navigation & UI ---
  const [activeTab, setActiveTab] = useState<"map" | "plan" | "camera" | "profile" | "events">("map");
  // Kill switch dal pannello admin (feature flag): una tab spenta mostra un
  // avviso di manutenzione invece della schermata.
  const eventsEnabled = useFeatureFlag('events_tab');
  const cameraEnabled = useFeatureFlag('vision_camera');
  const [previousTab, setPreviousTab] = useState<string | null>(null);
  // Tab già visitate: i pannelli lazy plan/profile vengono montati SOLO al
  // primo accesso e poi restano montati (con display:none quando inattivi), per
  // preservare lo stato come prima. 'profile' è la tab iniziale, quindi parte
  // già montata. events/camera restano invece a montaggio condizionale.
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(["profile"]));
  // Aggiornamento in fase di render (pattern React ufficiale per lo stato
  // derivato): monta la tab corrente PRIMA del paint, così il primo accesso
  // non mostra un frame vuoto prima dello spinner del Suspense.
  if (!mountedTabs.has(activeTab)) {
    setMountedTabs(prev => prev.has(activeTab) ? prev : new Set(prev).add(activeTab));
  }
  // IL RADAR RIPARTE DA DOV'ERA (28/08/2026, collaudo: «se si chiude l'app
  // il percorso del radar deve rimanere in memoria»). Il giro e la bozza si
  // salvavano gia`; a sparire era il PANNELLO, chiuso a ogni riavvio, e con
  // lui la lista. Aperto o chiuso si ricorda come la bozza.
  const [isRadarMode, setIsRadarMode] = useState<boolean>(() => {
    try { return localStorage.getItem('wip_radar_aperto') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('wip_radar_aperto', isRadarMode ? 'true' : 'false'); } catch { /* storage bloccato */ }
  }, [isRadarMode]);
  // PERCORSO SU MISURA (03/09/2026): la SECONDA funzione della mappa, con il
  // suo tasto (vedi il pulsante col simbolo del percorso, sotto le cuffie).
  // Luoghi di qualsiasi categoria scelti dai pin, ordine ottimizzato dal
  // server, navigatore WIP, niente audioguida, 30 crediti. Aperto o chiuso si
  // ricorda come il radar; il modo della bozza lo decide tourService.
  const [isPercorsoMode, setIsPercorsoMode] = useState<boolean>(() => {
    try { return localStorage.getItem('wip_percorso_aperto') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('wip_percorso_aperto', isPercorsoMode ? 'true' : 'false'); } catch { /* storage bloccato */ }
  }, [isPercorsoMode]);
  /**
   * Cambio di funzione con una selezione in mano: le due bozze non si
   * mescolano (prezzi e regole diverse), quindi si chiede prima di svuotare.
   * Ritorna false se l'utente ha detto no.
   */
  const impostaModoBozza = useCallback((modo: 'giro' | 'percorso'): boolean => {
    if (tourService.bozzaImpostaModo(modo, { senzaSvuotare: true })) return true;
    const ok = typeof window.confirm === 'function' ? window.confirm(getTranslation('pc_cambio_modo_conferma', linguaCorrente())) : true;
    if (!ok) return false;
    tourService.bozzaImpostaModo(modo);
    return true;
  }, []);
  const handleTogglePercorso = useCallback(() => {
    const next = !isPercorsoMode;
    if (next) {
      if (!impostaModoBozza('percorso')) return;
      setIsRadarMode(false);
    }
    setIsPercorsoMode(next);
  }, [isPercorsoMode, impostaModoBozza]);
  // "Nuovo giro da qui" dal banner a giro finito (22/08/2026): riapre il radar.
  useEffect(() => {
    const h = () => { setActiveTab('map'); setIsPercorsoMode(false); tourService.bozzaImpostaModo('giro'); setIsRadarMode(true); };
    window.addEventListener('wip-open-radar', h);
    return () => window.removeEventListener('wip-open-radar', h);
  }, []);
  // Dieci Tappe: un giro in corso. Si riprende all'avvio, perche' l'app chiusa
  // a meta` percorso non deve far perdere il giro (e l'audio gia` scaricato).
  const [giroInCorso, setGiroInCorso] = useState(false);
  useEffect(() => {
    // Prima di riprendere si dice al servizio se la guida e` accesa: con la
    // guida spenta il giro si ricarica in memoria ma resta fermo e invisibile
    // (niente rete, niente geofence nativi) finche` non la si riaccende.
    try { tourService.sospendi(localStorage.getItem('wip_audioguide_active') !== 'true'); } catch { /* si resta attivi */ }
    setGiroInCorso(!!tourService.riprendi() || tourService.inCorso());
    // La bozza sopravvive al riavvio ma il suo percorso no (dipende da dove si
    // e` adesso): senza questa riga resterebbe disegnata in linea d'aria.
    tourService.anteprimaSeManca();
    // Il driver che da` il GPS al giro: senza, il giro si disegna ma non
    // sente dove sei. Idempotente, resta in ascolto per tutta la sessione.
    avviaGiroDriver();
    const avviato = () => setGiroInCorso(true);
    window.addEventListener('wip-giro-avviato', avviato);
    return () => window.removeEventListener('wip-giro-avviato', avviato);
  }, []);
  /**
   * "Riascolta": la scheda dell'ultima tappa con autoplay MANUALE (origine
   * utente): la modalita' silenziosa non lo zittisce e il cooldown non lo
   * blocca. Lo usano il cruscotto e il tasto sulla lock screen.
   */
  const riascoltaTappa = useCallback(() => {
    const t = tourService.tappaDaRiascoltare();
    if (!t) return;
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
      detail: {
        poiId: String(t.id),
        poi: { id: t.id, name: t.nome, lat: t.lat, lon: t.lon, category: t.categoria || undefined, city: t.citta || undefined },
        autoPlay: true, manual: true, fromTour: true, ts: Date.now(),
      },
    }));
  }, []);
  // I TASTI DEL CRUSCOTTO A DISPLAY SPENTO (03/09/2026, committente: «il
  // banner live dovrebbe essere questo blu con gli stessi tasti del
  // controller sotto»). Live Activity iOS (App Intents) e notifica Android
  // arrivano qui come `navBannerAction {action}`. Con un giro/percorso in
  // corso si fa quello che farebbe il tasto del cruscotto; altrimenti e` la
  // navigazione a tappa singola (useWalkingNavigation), che ascolta l'evento.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let vivo = true;
    let handle: { remove: () => Promise<void> | void } | null = null;
    ItaintaBackgroundPoi.addListener('navBannerAction', (d: { action?: string; data?: string; ts?: number | string }) => {
      // Android manda il JSON in `data` (il ponte servizio → plugin e` uno
      // solo per tutti gli eventi); iOS il campo `action` diretto.
      let action = String(d?.action || '');
      let ts = Number(d?.ts);
      if (!action && typeof d?.data === 'string') {
        try { const j = JSON.parse(d.data); action = String(j?.action || ''); if (!Number.isFinite(ts)) ts = Number(j?.ts); }
        catch { action = d.data; }
      }
      if (!action) return;
      // Un evento trattenuto (retainUntilConsumed) e consegnato dopo un
      // minuto non e` piu` un tocco: non si salta una tappa a sorpresa.
      if (Number.isFinite(ts) && ts > 0 && Date.now() - ts > 60_000) return;
      if (tourService.inCorso()) {
        switch (action) {
          case 'pausa': tourService.impostaPausa(!tourService.vista()?.inPausa); break;
          case 'riascolta': riascoltaTappa(); break;
          case 'salta': posizioneVeloce((p) => { void tourService.salta(p); }); break;
          case 'ricalcola': posizioneVeloce((p) => { void tourService.ricalcolaDaQui(p); }); break;
          case 'termina': tourService.termina(); setGiroInCorso(false); break;
        }
        return;
      }
      window.dispatchEvent(new CustomEvent('wip-nav-banner-action', { detail: { action } }));
    }).then((h) => { if (vivo) handle = h; else void h.remove(); }).catch(() => {});
    return () => { vivo = false; if (handle) void handle.remove(); };
  }, [riascoltaTappa]);
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
  // L'ultima lista del radar si tiene (28/08/2026): riaperta l'app diceva
  // «0 luoghi» finche` il servizio nativo non rimandava i POI, e la bozza
  // ripescata non aveva niente intorno. Si mostra subito la lista di prima;
  // la prima lettura vera la sostituisce.
  const [radarPois, setRadarPois] = useState<any[]>(() => {
    try { const s = JSON.parse(localStorage.getItem('wip_radar_pois') || '[]'); return Array.isArray(s) ? s.slice(0, 150) : []; } catch { return []; }
  });
  useEffect(() => {
    try {
      const snella = radarPois.slice(0, 150).map((p: any) => ({
        id: p.id ?? p.poiId, name: p.name || p.nome, lat: p.lat, lon: p.lon,
        category: p.category, poiType: p.poiType, is_gem: p.is_gem, isGem: p.isGem, city: p.city,
        entrance_lat: p.entrance_lat, entrance_lon: p.entrance_lon,
      }));
      localStorage.setItem('wip_radar_pois', JSON.stringify(snella));
    } catch { /* storage pieno o bloccato */ }
  }, [radarPois]);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [itinerary, setItinerary] = useState<any[]>([]);
  const [activePlan, setActivePlan] = useState<any | null>(null);
  // Dieci Tappe: i POI del radar sono i candidati per la sostituta di una
  // tappa tolta e per gli incontri lungo la strada.
  useEffect(() => { tourService.impostaCandidati(radarPois); }, [radarPois]);
  // GUIDA SPENTA = GIRO SOSPESO (28/08/2026). Togliere la guida non chiude il
  // giro: lo mette in pausa e lo nasconde — percorso, pin numerati, cruscotto
  // e tasto "Naviga" spariscono dalla mappa, ma tappe, tappe fatte, ordine e
  // scelta d'arrivo restano intatti (anche su localStorage) e tornano identici
  // riaccendendo. Chiudere davvero il giro si fa con la X rossa del cruscotto.
  useEffect(() => { tourService.sospendi(!isAudioGuideActive); }, [isAudioGuideActive]);
  // Il tasto "Naviga" della mappa (28/08/2026). La vista del giro e` gia`
  // null quando il giro e` sospeso o non c'e`: basta escludere il giro finito.
  const vistaGiro = useVistaGiro();
  const [navTappa, setNavTappa] = useState<any | null>(null);
  /**
   * La card blu delle svolte chiusa con la X (scelta del committente, 29/08/2026:
   * «X = nasconde la card, il giro continua»): resta nascosta per QUESTA tappa
   * (indice) e ricompare da sola alla successiva.
   */
  // Per ID della tappa, non per indice (03/09/2026): dopo un ricalcolo
  // l'indice torna a 0 e la card nascosta sulla tappa 0 restava nascosta
  // anche per la nuova corrente (o ricompariva da sola).
  const [cardSvolteNascostaPer, setCardSvolteNascostaPer] = useState<string | null>(null);
  // AVVIA IL GIRO DALLA MAPPA (28/08/2026, collaudo: «ci deve essere un tasto
  // per iniziare la navigazione di tutto il tour»). Il navigatore del giro
  // intero E` il giro: appena creato, il driver legge le svolte tratta per
  // tratta fino all'ultima tappa (giroDriver). Ma «Crea il giro» stava solo
  // dentro il pannello, e chi guarda la mappa con le tappe spuntate non
  // trovava da dove partire. Stesso avvio del pannello, un tasto in piu`.
  const bozzaGiro = useBozzaGiro();
  const [avviandoGiro, setAvviandoGiro] = useState(false);
  const avviaGiroDaMappa = useCallback(async () => {
    if (avviandoGiro) return;
    setAvviandoGiro(true);
    const L = linguaCorrente();
    try {
      await tourService.avviaDaBozza();
      tourService.prescarica(undefined, String(L).toLowerCase(), getGuideCharacter()).catch(() => {});
      window.dispatchEvent(new CustomEvent('wip-giro-avviato'));
      setIsRadarMode(false);
    } catch (e: any) {
      // Il "motivo" del server (dopo i due punti) prima si scartava: si
      // vedeva sempre «attiva il Day Pass» anche a chi il pass ce l'aveva,
      // senza modo di distinguere «non riconosciuto» da «assente» (29/08/2026).
      // Dal 03/09/2026 il 402 apre anche la cassa (gestisciErroreGiro).
      gestisciErroreGiro(e, L);
      // Col pannello aperto si legge il perche` (pass, posizione) e si riprova.
      setIsRadarMode(true);
    } finally { setAvviandoGiro(false); }
  }, [avviandoGiro]);
  // «Percorso» dal pannello "Tutto nel raggio" (29/08/2026): MapArea riempie
  // la bozza e chiede di aprire il radar, dove il giro si vede e si avvia.
  useEffect(() => {
    const apri = () => setIsRadarMode(true);
    window.addEventListener('wip-apri-radar', apri);
    return () => window.removeEventListener('wip-apri-radar', apri);
  }, []);
  // LA REGOLA DEI DUE TASTI (31/08/2026, committente). Il GIRO multi-tappa
  // e' premium: si avvia SOLO con «Avvia la navigazione», che passa dal
  // cancello del server (passValido → Day Pass). La navigazione verso UNA
  // tappa sola e' gratis (come /api/route/foot): si avvia SOLO col tasto
  // verde tondo. Mai tutti e due insieme — col tasto tondo visibile accanto
  // ad «Avvia», WIP Nav verso la tappa corrente aggirava il pass, tappa
  // dopo tappa (collaudo di stamattina).
  const tappaDaNavigare = useMemo(() => {
    if (!vistaGiro || vistaGiro.stato === 'FINITO') return null;
    // Solo col giro di UNA tappa: la navigazione singola e' gratis, quella
    // dell'itinerario no e ha il suo tasto.
    if ((vistaGiro.tappeTotali ?? 0) > 1) return null;
    const t = tourService.tappaAttuale();
    if (!t) return null;
    // Il POI vero (con il suo id): NavChoiceSheet cerca la porta da li`.
    return { id: t.id, name: t.nome, lat: t.lat, lon: t.lon, entrance_lat: t.ingresso?.lat, entrance_lon: t.ingresso?.lon };
  }, [vistaGiro]);
  // IL BANNER ANCHE A DISPLAY SPENTO (28/08/2026, collaudo: «se il display e`
  // spento ci deve essere lo stesso banner anche li`»). Il tasto Naviga sta
  // sulla mappa, ma chi cammina col telefono in tasca non la vede. A ogni
  // cambio di tappa si posta una notifica locale con la tappa corrente: sulla
  // lock screen fa da cruscotto, e toccarla riapre l'app. Stesso id delle
  // istruzioni di svolta, cosi` si sostituiscono invece di accumularsi. Sul
  // web la funzione non fa nulla.
  // Il contenuto e` LO STESSO del cruscotto in app (committente: «uguale a
  // quello che si apre nell'app»): tappa n/N con i metri alla porta; la
  // svolta da fare e a quanti metri; i metri mancanti, l'ora d'arrivo e la
  // tappa dopo. Si riposta solo quando cambia qualcosa che si legge — la
  // tappa, la svolta, i metri a scatti di 50 — non a ogni fix GPS.
  // (28/08/2026) Il banner non e` piu` una notifica locale qualunque: su
  // Android riscrive la notifica del foreground service (non scartabile), su
  // iOS pilota una Live Activity (lock screen + Dynamic Island). Vedi
  // locationService.updateNavBanner. Qui cambia solo una cosa: quando il giro
  // finisce o va in pausa bisogna dirlo, altrimenti il cruscotto resterebbe
  // fermo sull'ultimo stato per sempre.
  const firmaBannerRef = useRef<string>('');
  const bannerAttivoRef = useRef<boolean>(false);
  useEffect(() => {
    // IN PAUSA IL CRUSCOTTO RESTA (03/09/2026): prima spariva, e dalla lock
    // screen non c'era modo di riprendere. Ora dice «In pausa» col tasto play.
    if (!vistaGiro || vistaGiro.stato === 'FINITO' || !vistaGiro.nomeTappa) {
      if (bannerAttivoRef.current) {
        bannerAttivoRef.current = false;
        firmaBannerRef.current = '';
        // Prima il banner, poi il servizio acceso solo per lui (percorso su
        // misura a cuffie spente, 03/09/2026): vedi useWalkingNavigation.
        locationService.updateNavBanner('', '', false)
          .catch(() => {})
          .finally(() => { locationService.rilasciaServizioNativoPerNav().catch(() => {}); });
      }
      return;
    }
    const L = linguaCorrente();
    const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    const n = Math.min(vistaGiro.tappeFatte + 1, vistaGiro.tappeTotali);
    const allaPorta = vistaGiro.metriAllaTappa != null && vistaGiro.metriAllaTappa > 25 ? ` · ${dist(vistaGiro.metriAllaTappa)}` : '';
    const titolo = `${getTranslation('tour_tappa', L)} ${n}/${vistaGiro.tappeTotali}: ${vistaGiro.nomeTappa}${allaPorta}`;
    const inPausa = !!vistaGiro.inPausa;
    // L'istruzione che si legge: in pausa «In pausa»; senza svolta
    // «Prosegui» (come la card blu), mai una riga vuota.
    const istruzioneBanner = inPausa
      ? getTranslation('tour_in_pausa', L)
      : (vistaGiro.istruzione || getTranslation('nav_proceed', L));
    const righe: string[] = [];
    righe.push(`${istruzioneBanner}${!inPausa && vistaGiro.istruzione && vistaGiro.metriAllaSvolta != null ? ` · ${dist(vistaGiro.metriAllaSvolta)}` : ''}`);
    // Ora d'arrivo: cammino a 4 km/h sui metri rimanenti (come il cruscotto).
    const minutiRimanenti = vistaGiro.metriRimanenti > 0 ? vistaGiro.metriRimanenti / 66.7 : -1;
    const oraArrivo = minutiRimanenti >= 0
      ? new Date(Date.now() + minutiRimanenti * 60000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '';
    const eta = oraArrivo ? ` · ${getTranslation('gr_arrivo_eta', L)} ~${oraArrivo}` : '';
    righe.push(`${dist(vistaGiro.metriRimanenti)} ${getTranslation('tour_mancanti', L)}${eta}${vistaGiro.nomeProssima ? ` · ${getTranslation('gr_poi_prossima', L)}: ${vistaGiro.nomeProssima}` : ''}`);
    // (03/09/2026) Sotto i 100 m dalla svolta la firma scatta ogni 10 m: la
    // card sulla lock screen dice «21 m» e deve scendere come quella in app.
    const ms = vistaGiro.metriAllaSvolta ?? -1;
    const scattoSvolta = ms < 0 ? -1 : ms < 100 ? Math.round(ms / 10) : 100 + Math.round(ms / 50);
    const firma = `${n}|${vistaGiro.nomeTappa}|${vistaGiro.istruzione || ''}|${scattoSvolta}|${Math.round(vistaGiro.metriRimanenti / 100)}|${inPausa ? 'P' : ''}|${vistaGiro.manovra?.type || ''}/${vistaGiro.manovra?.modifier || ''}`;
    if (firma === firmaBannerRef.current) return;
    firmaBannerRef.current = firma;
    const primaVolta = !bannerAttivoRef.current;
    bannerAttivoRef.current = true;
    // I campi separati servono alla Live Activity iOS, che impagina da se`:
    // sono gli STESSI valori con cui sono composti titolo e righe qui sopra.
    const invia = () => locationService.updateNavBanner(titolo, righe.join('\n'), true, {
      nomeTappa: vistaGiro.nomeTappa,
      indiceTappa: n,
      tappeTotali: vistaGiro.tappeTotali,
      metriAllaTappa: vistaGiro.metriAllaTappa ?? -1,
      istruzione: istruzioneBanner,
      metriAllaSvolta: inPausa ? -1 : (vistaGiro.metriAllaSvolta ?? -1),
      metriRimanenti: vistaGiro.metriRimanenti,
      eta: oraArrivo,
      nomeProssima: vistaGiro.nomeProssima || '',
      // La foto della tappa, quando il POI ce l'ha (29/08/2026).
      foto: vistaGiro.fotoTappa || '',
      // La card blu sulla lock screen (03/09/2026): freccia della manovra,
      // barra di avanzamento, pausa e modo (quali tasti mostrare).
      manovraTipo: vistaGiro.manovra?.type || '',
      manovraVerso: vistaGiro.manovra?.modifier || '',
      progresso: vistaGiro.metriTotali > 0 ? Math.min(1, Math.max(0, 1 - vistaGiro.metriRimanenti / vistaGiro.metriTotali)) : -1,
      metriTotali: vistaGiro.metriTotali,
      inPausa,
      modo: vistaGiro.modo === 'percorso' ? 'percorso' : 'giro',
      minutiRimanenti,
    }).catch(() => {});
    // Al primo banner ci si assicura il servizio nativo (03/09/2026): un
    // percorso su misura a cuffie spente non ne avrebbe uno, e senza
    // servizio il cruscotto a display spento non esiste. Con le cuffie
    // accese non fa nulla. Vedi locationService.assicuraServizioNativoPerNav.
    if (primaVolta) locationService.assicuraServizioNativoPerNav().catch(() => {}).finally(invia);
    else invia();
  }, [vistaGiro]);

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
  // Dalla barra di ricerca (23/08/2026): "spiagge toscana" accende la macro
  // Natura con la sotto-chip Spiagge; "terme" accende Terme. Le altre chip
  // restano come sono: si aggiunge, non si sostituisce.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d.macro) return;
      setSelectedCategories(prev => (prev.includes(d.macro) ? prev : [...prev, d.macro]));
      if (d.sub) setSubFilters(prev => (prev.includes(d.sub) ? prev : [...prev, d.sub]));
      setActiveTab('map');
    };
    window.addEventListener('wip-set-category', h);
    return () => window.removeEventListener('wip-set-category', h);
  }, []);
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
    /** Id vero del POI di destinazione (popup/radar): all'arrivo apre la scheda con autoplay. */
    poiId?: string | null;
    onStart: (pois: any[]) => void;
  }>({ isOpen: false, startCoords: null, endCoords: null, destinationName: "", poiId: null, onStart: () => {} });

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

  // Le audioguide gia' acquistate: si caricano UNA volta per sessione (la
  // mappa mostra centinaia di pin, non puo' chiedere per ciascuno) e servono
  // a non mostrare mai un prezzo per un POI che e' gia' dell'utente.
  useEffect(() => {
    if (!session?.user?.id) return;
    caricaPoiPosseduti(true).catch(() => {});
  }, [session?.user?.id]);

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
        // L'id VERO del POI di destinazione (dal popup/radar): all'arrivo serve
        // per aprire la scheda e far partire l'audioguida. Senza, PlanScreen
        // inventava un id sintetico "wipnav_<nome>" che non apriva niente.
        poiId: e.detail.poiId || null,
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

  // Id SINTETICI delle tappe: "wipnav_<nome>" (indirizzo libero), "t<g>_<i>"
  // (tappe AI normalizzate in processItineraryStream), "lib_…" (libreria),
  // "rain_…" (garanzia pioggia), "viator_/gyg_/tm_/tq_" (esperienze). Non
  // sono POI di shared_pois: aprirne la scheda mostrerebbe un POI inesistente.
  const isSyntheticStopId = (id: unknown): boolean => {
    const s = String(id ?? '');
    return !s || /^(wipnav_|lib_|rain_|viator_|gyg_|tm_|tq_|t\d+_)/.test(s);
  };

  // ARRIVO DEL WIP NAV → AUDIOGUIDA. Sul web `wip-nav-arrived` aveva un solo
  // ascoltatore (PlanScreen, che marca la tappa visitata): la promessa "arrivi
  // e la guida parte" reggeva solo sul nativo. Qui, se la destinazione era un
  // POI vero (poiId non sintetico), si apre la scheda con autoPlay — lo stesso
  // evento centralizzato che usa il banner di avvicinamento, quindi stesso
  // flusso di pagamento/pass, niente logica nuova.
  useEffect(() => {
    const handleNavArrived = (e: any) => {
      const poiId = e?.detail?.poiId;
      if (!poiId || isSyntheticStopId(poiId)) return;
      // Stesso dedupe e stesso cooldown degli altri dispatcher (trigger web,
      // nativo, giro): senza, il trigger di prossimita' rifaceva parlare il
      // POI appena raccontato all'arrivo, e un doppio 'wip-nav-arrived' lo
      // apriva due volte.
      const now = Date.now();
      const last = (window as any).__wipLastPoiTrigger || { id: '', ts: 0 };
      if (String(last.id) === String(poiId) && now - last.ts < 60_000) return;
      (window as any).__wipLastPoiTrigger = { id: String(poiId), ts: now };
      import('./lib/geofencing/foregroundTriggers').then(m => m.segnaScattato(String(poiId))).catch(() => {});
      window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
        detail: { poiId: String(poiId), poi: e?.detail?.poi || undefined, autoPlay: true, manual: false, fromNav: true, ts: now },
      }));
    };
    window.addEventListener('wip-nav-arrived', handleNavArrived);
    return () => window.removeEventListener('wip-nav-arrived', handleNavArrived);
  }, []);

  // 401 {error:'auth_required'} dal server (audioguide, enrich, tts…).
  //
  // Con la MODALITÀ OSPITE (28/08/2026, ripristinata il 02/09) un 401 ha due
  // significati diversi, e vanno detti con parole diverse: se non c'è nessuna
  // sessione l'utente è un OSPITE e gli serve un account; se una sessione
  // c'era, è SCADUTA mentre lavorava. Si prova prima un refresh silenzioso e,
  // se non torna nessuna sessione, si riapre il login come modale:
  // `setSession(null)` da solo, ora che il gate non blocca più, lascerebbe
  // l'ospite senza capire perché l'azione non è andata a buon fine.
  // Cooldown di 30 s: una schermata può generare più 401 di fila e non deve
  // sparare una raffica di toast e di modali.
  useEffect(() => {
    let inCorso = false;
    let ultimoInvito = 0;
    const onAuthRequired = async () => {
      if (inCorso) return;
      inCorso = true;
      // `eraLoggato` va letto PRIMA del refresh: dopo, la sessione è comunque
      // nulla e i due casi diventerebbero indistinguibili. Si legge dalla ref
      // e non da `session`: questo effetto dipende solo da `language`, quindi
      // la variabile catturata nella chiusura resterebbe quella del montaggio
      // (sempre nulla) e ogni 401 direbbe «serve un account» anche a chi un
      // account ce l'ha.
      const eraLoggato = !!sessionRef.current;
      try {
        invalidaTokenCache();
        const { data } = await supabase.auth.refreshSession();
        if (!data?.session) {
          setSession(null);
          if (Date.now() - ultimoInvito > 30_000) {
            ultimoInvito = Date.now();
            notify(getTranslation(eraLoggato ? 'auth_sessione_scaduta' : 'guest_azione_richiede_account', language));
            setShowLogin(true);
          }
        }
      } catch {
        setSession(null);
        if (Date.now() - ultimoInvito > 30_000) {
          ultimoInvito = Date.now();
          notify(getTranslation('guest_azione_richiede_account', language));
          setShowLogin(true);
        }
      } finally {
        inCorso = false;
      }
    };
    window.addEventListener('wip-auth-required', onAuthRequired);
    // Invito esplicito al login da qualsiasi punto dell'app (pulsante "Accedi",
    // azioni che sanno già di richiedere un account): nessun refresh, si apre
    // e basta.
    const onOpenLogin = () => setShowLogin(true);
    window.addEventListener('wip-open-login', onOpenLogin);
    return () => {
      window.removeEventListener('wip-auth-required', onAuthRequired);
      window.removeEventListener('wip-open-login', onOpenLogin);
    };
  }, [language]);

  // Deep link "?poi=<id>" (condivisione schede Vision, link dal pannello
  // admin): carica il POI da shared_pois, apre la mappa e lo mette a fuoco;
  // poi pulisce l'URL così un refresh non lo riapre.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const poiId = params.get('poi');
      if (!poiId) return;
      (async () => {
        const { data } = await supabase
          .from('shared_pois')
          .select('id, name, lat, lon, category, poi_type, description_short, image_url')
          .eq('id', poiId)
          .limit(1);
        const p: any = data?.[0];
        if (!p || p.lat == null || p.lon == null) return;
        setActiveTab('map');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wip-open-map-area', { detail: { lat: Number(p.lat), lon: Number(p.lon), zoom: 16 } }));
          window.dispatchEvent(new CustomEvent('focus-poi', { detail: { ...p, lat: Number(p.lat), lon: Number(p.lon) } }));
        }, 1200);
      })();
      params.delete('poi');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    } catch { /* nessun deep link */ }
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

  // Allinea l'attributo lang del documento alla lingua UI (a11y/SEO): copre sia
  // l'avvio sia i cambi lingua successivi.
  useEffect(() => {
    try { document.documentElement.lang = language.toLowerCase(); } catch {}
  }, [language]);

  // Banner leggero mostrato agli avvii successivi se il permesso di posizione è
  // stato negato: le audioguide automatiche non possono partire. Solo su
  // nativo e solo dopo l'onboarding (durante il quale ci pensa PermissionsModal).
  const [showLocDeniedBanner, setShowLocDeniedBanner] = useState(false);
  useEffect(() => {
    if (!permissionsGranted) return;
    let cancelled = false;
    (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const status = await Geolocation.checkPermissions();
          if (!cancelled && (status as any)?.location === 'denied') setShowLocDeniedBanner(true);
        } else if ((navigator as any).permissions?.query) {
          // Anche sul web (22/08/2026): prima il banner era solo nativo, e chi
          // aveva negato la posizione nel browser aveva un tasto cuffie muto
          // senza alcuna spiegazione.
          const st = await (navigator as any).permissions.query({ name: 'geolocation' });
          if (!cancelled && st?.state === 'denied') setShowLocDeniedBanner(true);
          st?.addEventListener?.('change', () => setShowLocDeniedBanner(st.state === 'denied'));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [permissionsGranted]);

  const handleToggleAudioGuide = useCallback((active: boolean) => {
    console.log(`[App.tsx] Audio Guide toggle: ${active}`);
    setIsAudioGuideActive(active);
    try { localStorage.setItem('wip_audioguide_active', active ? 'true' : 'false'); } catch { /* storage bloccato (privato) */ }
    if (active) {
      locationService.unlockAudio();
      // Proponi il bundle delle audioguide solo all'attivazione del tasto cuffie
      triggerBundleCheck();
      // Sul web il permesso di posizione non veniva MAI chiesto da questo
      // flusso: la modale dei permessi e' un no-op nel browser e l'errore del
      // watch finiva in console. Qui si chiede al tocco — il momento in cui
      // l'utente capisce perche' — e se e' negato lo si dice.
      if (!Capacitor.isNativePlatform() && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => setShowLocDeniedBanner(false),
          (err) => { if (err?.code === 1) setShowLocDeniedBanner(true); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
        );
      }
    }
  }, [triggerBundleCheck]);

  const handleToggleRadar = () => {
    const next = !isRadarMode;
    // Il radar compone il GIRO con audioguida: se in mano c'e` un percorso
    // su misura si chiede prima di svuotarlo (vedi impostaModoBozza).
    if (next) {
      if (!impostaModoBozza('giro')) return;
      setIsPercorsoMode(false);
    }
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

    // Anche il NATIVO deve dimenticare l'utente (SEC-02, 28/08/2026): fino a
    // oggi userId, token e snapshot del wallet restavano nelle prefs del
    // servizio, e l'account successivo sullo stesso telefono ereditava lo
    // storico ascolti e il tetto di spesa offline del precedente.
    clearNativeUserContext().catch(() => {});

    // Le audioguide acquistate sono PERSONALI: la cache dei POI posseduti non
    // deve sopravvivere al cambio utente (29/08/2026).
    try { azzeraPoiPosseduti(); } catch { /* niente */ }

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

  // Bonus di benvenuto a EMAIL CONFERMATA: i 100 crediti non sono più il
  // default del profilo (farmabili con email inventate) — li eroga il server
  // con /api/welcome-bonus/claim, idempotente, solo ad account con email
  // verificata. Fire-and-forget a ogni avvio con sessione.
  useEffect(() => {
    if (!session?.access_token) return;
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/welcome-bonus/claim'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => null);
        if (data?.granted > 0) {
          notify(`🎁 Benvenuto in WIP! Hai ricevuto ${data.granted} crediti.`);
          notifyCreditsChanged({ userId: session.user?.id });
        }
      } catch { /* best-effort: riprova al prossimo avvio */ }
    })();
  }, [session?.access_token]);

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

      // Token → nativo (SEC-03). Prima arrivava solo dalla riconciliazione
      // offline di dayPassService (avvio/online/crediti): dopo un'ora il JWT
      // scadeva e il servizio in background scriveva lo storico con un
      // token morto. Ora ogni SIGNED_IN e ogni TOKEN_REFRESHED lo rispinge.
      // La cache del Bearer di apiFetch non deve servire un token vecchio.
      invalidaTokenCache();
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && s?.user?.id) {
        pushUserContextToNative({ userId: s.user.id, accessToken: s.access_token }).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        clearNativeUserContext().catch(() => {});
      }
    });
    
    // Check for deep links (e.g. ?pin=123456)
    const params = new URLSearchParams(window.location.search);
    if (params.get('pin')) {
      setActiveTab('profile');
    }
    // Pianificazione di gruppo (ondata 7): ?groupplan=PIN apre il tab Piani
    // sulla stanza; il PIN passa a PlanScreen via localStorage perché il tab
    // può montare più tardi (login, onboarding).
    const groupPin = params.get('groupplan');
    if (groupPin && /^\d{6}$/.test(groupPin)) {
      try { localStorage.setItem('wip_group_plan_join', groupPin); } catch { /* ok */ }
      setActiveTab('plan');
    }
    // Dieci Tappe condiviso: ?giro=ID apre il giro salvato come piano nel tab
    // Piani. Chi lo apre ne ha una copia sua (id nuovo), vedi apriGiroCondiviso.
    const giroCondiviso = params.get('giro');
    if (giroCondiviso) {
      tourService.apriGiroCondiviso(giroCondiviso).then((piano) => {
        if (!piano) return;
        setActivePlan(piano);
        setActiveTab('plan');
      }).catch(() => { /* link rotto: niente da aprire */ });
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

  // App Link (Android) / Universal Link (iOS): i link di conferma email e di
  // reset password inviati da Supabase Auth ora puntano a
  // https://wip.guide/auth/callback (vedi LoginScreen.tsx). Se il dominio è
  // verificato (assetlinks.json / apple-app-site-association pubblicati con
  // fingerprint/Team ID reali, vedi public/.well-known/), il sistema apre
  // l'app già installata invece del browser — ma la WebView NON naviga
  // davvero su quell'URL (resta su capacitor://localhost): supabase-js non
  // vede mai l'hash con i token, quindi PASSWORD_RECOVERY non scatterebbe da
  // solo. Li estraiamo a mano dall'URL ricevuto e applichiamo la sessione;
  // l'effect onAuthStateChange qui sopra fa il resto (aggiorna `session`,
  // e per un vero reset noi soli mettiamo isRecovering per mostrare
  // "Nuova Password", esattamente come già fa su web via l'hash della pagina).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: any = null;
    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        handle = await CapApp.addListener('appUrlOpen', async ({ url }: { url: string }) => {
          try {
            const parsed = new URL(url);
            // Supabase mette i token nel fragment (#access_token=...&type=recovery);
            // per sicurezza si prova anche la query string se un giorno cambiasse flow.
            const raw = parsed.hash && parsed.hash.length > 1 ? parsed.hash.slice(1) : parsed.search.replace(/^\?/, '');
            const params = new URLSearchParams(raw);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            const type = params.get('type');
            if (access_token && refresh_token) {
              const { error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (!error && type === 'recovery') setIsRecovering(true);
            }
          } catch (e) {
            console.warn('[App.tsx] appUrlOpen: URL non valido', url, e);
          }
        });
      } catch (e) {
        console.warn('[App.tsx] appUrlOpen listener non registrato', e);
      }
    })();
    return () => { handle?.remove?.(); };
  }, []);

  // Check initial categories on mount (But DO NOT sync active service state automatically)
  useEffect(() => {
    if (!permissionsGranted) return;
    const init = async () => {
      locationService.startWatching();
      // Blocklist community dal server (best-effort): riempie la cache locale
      // usata dai filtri di mappa e radar per gli autori bloccati.
      refreshBlockedCommunityPois();
    };
    init();

    const handlePoisUpdated = (e: any) => {
      let pois = Array.isArray(e.detail) ? e.detail : [];

      // Filtro per categorie attive con la MAPPA categoria→bucket condivisa
      // (isCategoryAllowed): il vecchio confronto diretto tra i bucket del
      // setup ("musei") e il tag grezzo del POI ("museum") non combaciava mai
      // per i POI scaricati dal servizio nativo → il radar mostrava quasi
      // solo gemme. In più si nascondono i POI community degli autori
      // bloccati (App Store Guideline 1.2).
      const activeSubcats = (() => {
        try {
          const stored = localStorage.getItem('wip_active_subcategories');
          if (stored) return JSON.parse(stored);
        } catch {}
        // Default allineato al setup GeoControl (monumenti/musei/chiese attivi)
        return { monumenti: true, musei: true, chiese: true };
      })();
      const blockedCommunity = getBlockedCommunityPoiIds();
      pois = pois.filter((p: any) =>
        isCategoryAllowed({ category: p.category || p.poiType, premium: p.premium, is_gem: p.is_gem }, activeSubcats)
        && !((p.category || p.poiType || '').toLowerCase() === 'community' && blockedCommunity.has(String(p.id ?? p.poiId ?? ''))));

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
      setRadarPois(prev => {
        // Stessa lista del giro precedente? Riusa l'array esistente: l'identità
        // stabile tiene in piedi il memo di MapArea, altrimenti ogni evento
        // 'pois-updated' ricostruiva tutti i marker (sfarfallio dei pin).
        const idOf = (p: any) => String(p.id ?? p.poiId ?? `${p.lat},${p.lon}`);
        if (prev.length === uniquePois.length && prev.every((p: any, i: number) => idOf(p) === idOf(uniquePois[i]))) {
          return prev;
        }
        return uniquePois;
      });
    };

    const handleItineraryCheckin = (e: any) => {
      const { poiId } = e.detail;
      console.log(`[App.tsx] Check-in received for POI: ${poiId}`);
      setActiveTab("plan");
    };

    // Listen for category updates from Setup page. Riflette sui chip mappa
    // SOLO le chiavi che i chip possiedono (vedi MAP_FILTER_KEYS sopra): il
    // setup GeoControl salva anche musei/chiese/panorami/consigli/castelli/
    // archeo, che i chip non conoscono — riversarle tutte in selectedCategories
    // cancellava dalla mappa "locali"/"utilita"/"famiglie" ad ogni modifica
    // del setup GeoControl (sovrascritti dalla lista, mai riselezionati).
    const handleSettingsUpdated = () => {
      const stored = localStorage.getItem('wip_active_subcategories');
      if (stored) {
        const parsed = JSON.parse(stored);
        // NB: 'enogastronomia' NON è qui. Non è una chip mappa: è un layer del
    // pannello ⓘ, e la sua chiave in wip_active_subcategories la scrive il
    // toggle del layer (MapArea.toggleStradeGusto). Metterla in questa lista
    // la azzererebbe a ogni tap sui chip culturali.
    // I VERTICALI TEMATICI entrano con le loro OTTO chiavi, non con la macro
    // 'tematiche': la macro è solo il contenitore della riga di chip e non ha
    // POI propri, mentre terme/cinema/cieli/… si accendono e si spengono una
    // per una, qui come in GeoControl.
    // (29/08/2026, collaudo: «le localita' restano attive anche se non
    // selezionate») `localita` MANCAVA da questa lista, in entrambe le copie:
    // spegnendo la chip non si scriveva mai `localita: false`, il valore
    // salvato restava vero, e al primo evento di impostazioni la chip — e i
    // suoi pin — tornavano da soli. Ogni chip della barra deve stare qui.
    const MAP_FILTER_KEYS = ['gemme', 'monumenti', 'natura', 'localita', 'locali', 'utilita', 'famiglie', 'community', 'beni_culturali',
      'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento'];
        const cats = MAP_FILTER_KEYS.filter(k => parsed[k]);
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
  // Nonce dell'autoplay: incrementa a ogni trigger esplicito così PoiDetailSheet
  // riparte anche se poi.id e autoPlay non cambiano (secondo click sul banner).
  const [poiAutoPlayNonce, setPoiAutoPlayNonce] = useState(0);
  const handleSelectPoi = useCallback((poi: any, nearbyPois: any[], autoPlay = false) => {
    setSelectedPoi(poi);
    setPoiAutoPlay(autoPlay);
    if (autoPlay) setPoiAutoPlayNonce(n => n + 1);
    setNearbyPoisForSelected(nearbyPois || []);
    setPreviousTab(prev => (activeTab !== "map" ? activeTab : prev));
    setActiveTab("map");
  }, [activeTab]);

  // Global UI Trigger - Opens POI sheet from background events (Geofencing, etc.)
  useEffect(() => {
    const handleOpenPoiFromEvent = async (e: any) => {
      let { poi, poiId, autoPlay, guide } = e.detail || {};
      // Il banner può arrivare senza l'oggetto poi (entries ricostruite dai
      // distance-update nativi): si ricarica dal repository invece di uscire
      // in silenzio — era il "click a vuoto" sul tasto Ascolta.
      if (!poi && poiId) {
        try {
          const { getPoiById } = await import('./services/poiRepository');
          poi = await getPoiById(String(poiId));
        } catch { /* repository non disponibile: si prosegue solo se poi esiste */ }
      }
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

    // STATI DI ROUTINE DEL RADAR (29/08/2026, collaudo: «perche' il telefono
    // continua a inviare il banner "41 luoghi monitorati"?»). Il conteggio,
    // il POI piu' vicino, «ricerca in corso», «posizione acquisita» sono lo
    // stato normale del servizio: stanno gia' nella notifica persistente e
    // nel pannello del radar. Come toast sulla mappa erano solo rumore.
    // Restano i toast per tutto il resto (permessi, errori, esiti).
    const statoDiRoutine = (t: string) =>
      /luoghi monitorati|places monitored|lieux surveill|lugares monitor|Orte überwacht|мест|个地点|^Prossimo: |Ricerca POI|Posizione acquisita|Acquisizione posizione|dal pacchetto offline|Giro concluso/i.test(t);
    const handleGuideStatus = (e: any) => {
      const text = typeof e.detail === 'string' ? e.detail : e.detail?.text;
      if (text && statoDiRoutine(String(text))) return;
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

  // Centro notifiche in-app: registra in localStorage (lib/notificationCenter)
  // i trigger POI e gli stati audioguida già emessi come CustomEvent, così
  // restano consultabili dalla campanella 🔔 del profilo anche dopo che il
  // banner è sparito. Solo listener: nessuna UI qui.
  useEffect(() => {
    const onPoiTrigger = (e: any) => {
      const d = e?.detail || {};
      const nome = d.poi?.name || d.poiName || (d.poiId ? `POI ${d.poiId}` : 'Punto di interesse');
      recordNotification({
        tipo: 'poi',
        titolo: `🔔 Audioguida: ${nome}`,
        corpo: d.autoPlay ? 'Riproduzione avviata automaticamente' : 'Tocca per ascoltare la guida',
        meta: { poiId: d.poiId ?? d.poi?.id },
      });
    };
    const onGuideStatus = (e: any) => {
      const text = typeof e?.detail === 'string' ? e.detail : e?.detail?.text;
      if (!text) return;
      // Gli stati di routine del radar (conteggio, POI piu' vicino, ricerca
      // in corso) non sono notifiche: riempivano la campanella a ogni fix.
      if (/luoghi monitorati|places monitored|^Prossimo: |Ricerca POI|Posizione acquisita|Acquisizione posizione/i.test(String(text))) return;
      recordNotification({ tipo: 'audioguida', titolo: '🎧 Stato audioguida', corpo: String(text) });
    };
    window.addEventListener('wip-poi-trigger', onPoiTrigger);
    window.addEventListener('audioguide-status', onGuideStatus);
    return () => {
      window.removeEventListener('wip-poi-trigger', onPoiTrigger);
      window.removeEventListener('audioguide-status', onGuideStatus);
    };
  }, []);

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
    // Tocchiamo SOLO le chiavi che i chip mappa possiedono davvero
    // (CategoryChips.CATEGORIES): le chiavi del setup GeoControl senza
    // equivalente qui (musei/chiese/panorami/consigli/castelli/archeo)
    // restavano azzerate ad ogni tap sui chip mappa, disattivando a sua
    // insaputa le categorie audioguida scelte dall'utente in GeoControl.
    // NB: 'enogastronomia' NON è qui. Non è una chip mappa: è un layer del
    // pannello ⓘ, e la sua chiave in wip_active_subcategories la scrive il
    // toggle del layer (MapArea.toggleStradeGusto). Metterla in questa lista
    // la azzererebbe a ogni tap sui chip culturali.
    // I VERTICALI TEMATICI entrano con le loro OTTO chiavi, non con la macro
    // 'tematiche': la macro è solo il contenitore della riga di chip e non ha
    // POI propri, mentre terme/cinema/cieli/… si accendono e si spengono una
    // per una, qui come in GeoControl.
    // (29/08/2026, collaudo: «le localita' restano attive anche se non
    // selezionate») `localita` MANCAVA da questa lista, in entrambe le copie:
    // spegnendo la chip non si scriveva mai `localita: false`, il valore
    // salvato restava vero, e al primo evento di impostazioni la chip — e i
    // suoi pin — tornavano da soli. Ogni chip della barra deve stare qui.
    const MAP_FILTER_KEYS = ['gemme', 'monumenti', 'natura', 'localita', 'locali', 'utilita', 'famiglie', 'community', 'beni_culturali',
      'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento'];
    let obj: Record<string, boolean> = {};
    try { obj = JSON.parse(localStorage.getItem('wip_active_subcategories') || '{}') || {}; } catch { obj = {}; }
    MAP_FILTER_KEYS.forEach(k => { obj[k] = selectedCategories.includes(k); });
    // (28/08/2026, collaudo) LE CHIP DELLA MAPPA NON ACCENDONO L'AUDIOGUIDA
    // dei verticali commerciali. Vino e Gusto, shopping e lusso sulla mappa
    // sono livelli da GUARDARE; se diventano categorie da raccontare, chi li
    // accende per curiosita' si sente partire la guida di una pasticceria.
    // Per quelle tre decide solo il setup (Profilo → Categorie audioguida).
    const SOLO_SETUP = new Set(['enogastronomia', 'shopping', 'lusso']);
    selectedCategories.forEach(c => { if (!SOLO_SETUP.has(c)) obj[c] = true; });
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
  // GATE RIDOTTO AL MINIMO: resta a tutto schermo solo mentre si legge la
  // sessione (spinner) e durante il reset password via link email.
  //
  // MODALITA' OSPITE RIPRISTINATA (02/09/2026, decisione del committente).
  // Il 29/08 il login era stato reso obbligatorio: mappa, POI e anteprime
  // erano dietro un muro. In tre giorni quel muro ha prodotto due grane
  // distinte, che avevano la STESSA causa:
  //   1. Apple ha respinto la 1.3 il 01/09 (Guideline 2.1): il revisore ha
  //      trovato il login e le note di verifica dicevano che non serviva
  //      account. Vedi la memoria del rifiuto iOS.
  //   2. Wikicaves/Grottocenter ci ha scritto il 02/09 contestando l'uso dei
  //      loro dati sulle grotte (129.508 POI) proprio perche' "users must log
  //      in to access your site".
  // L'account continua a reggere quello che deve reggere — crediti, acquisti,
  // Day Pass, preferiti, itinerari salvati, profilo — e chi prova a fare una
  // di quelle cose da ospite si vede aprire il modale di login (`showLogin`).
  // Quello che torna libero e' la CONSULTAZIONE: guardare la mappa e leggere
  // le schede.
  //
  // MA L'INGRESSO RESTA IL LOGIN (02/09/2026, dopo la prova sul telefono).
  // Non si entra dritti sulla mappa: la prima schermata e' sempre l'accesso,
  // con "Continua senza account" bene in vista. Cosi' chi ha un account non
  // finisce per errore a girare da ospite — scoprendolo solo quando un'azione
  // a crediti gli chiede di accedere a meta' strada — e chi non lo vuole entra
  // lo stesso con un tocco. Per Apple e per Wikicaves quello che conta e' che
  // la porta si apra senza account, non che sia gia' aperta.
  //
  // `ospite` NON e' persistito di proposito: a ogni avvio si ripassa da qui.
  // Persisterlo vorrebbe dire che chi tocca "continua senza account" una volta
  // non rivede mai piu' il login, ed e' esattamente il modo per restare
  // ospite senza saperlo.
  //
  // isRecovering va azzerato al successo, altrimenti l'utente resta in loop sul
  // form "Nuova Password".
  if (authLoading || isRecovering) return <LoginScreen onLoginSuccess={(s) => { setSession(s); setIsRecovering(false); }} initialAuthLoading={authLoading} forceMethod={isRecovering ? "update_password" : undefined} />;
  if (!session && !ospite) return <LoginScreen onLoginSuccess={(s) => { setSession(s); setOspite(false); }} onClose={() => setOspite(true)} />;

  return (
    <div className="min-h-[100dvh] bg-[#323639] flex justify-center items-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-[100dvh] sm:h-[800px] max-w-[1200px] bg-surface relative overflow-hidden flex flex-col rounded-none sm:rounded-2xl lg:shadow-2xl border border-white/10">
        <PermissionsModal onComplete={() => setPermissionsGranted(true)} language={language} />
        
        {session?.user && <ZeroCreditsBanner userId={session.user.id} />}

        {/* Avviso leggero: posizione negata → audioguide automatiche off. */}
        {showLocDeniedBanner && (
          <div className="shrink-0 bg-amber-500 text-white px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] font-bold z-[900]">
            <span className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {getTranslation('loc_denied_banner', language)}
              </span>
            </span>
            <button onClick={() => setShowLocDeniedBanner(false)} className="shrink-0 underline uppercase tracking-wide">
              {getTranslation('loc_denied_dismiss', language)}
            </button>
          </div>
        )}

        {/* TAB: MAPPA */}
        <div className={`flex-1 w-full overflow-hidden ${activeTab === "map" ? "h-full relative block" : "absolute inset-0 invisible opacity-0 pointer-events-none -z-10"}`}>
          <MapArea selectedCategories={selectedCategories} onSelectPoi={handleSelectPoi} subFilter={subFilters} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} language={language} activeTab={activeTab} isRadarMode={isRadarMode} radarPois={radarPois} modalitaPercorso={isPercorsoMode} />

          {/* PULSANTE RADAR CUFFIE — sopra la tab bar E la safe area inferiore
              (iPhone con home indicator, Android gesture nav): con 100px fissi
              il bottone finiva sotto la barra di sistema (UX-12).
              A DESTRA (28/08/2026): in basso a sinistra copriva il tasto dei
              livelli della mappa. A destra c'è solo la bussola (bottom-16):
              si sta sopra, con la fila che cresce verso sinistra. */}
          {activeTab === "map" && (
            /* IN COLONNA, NON IN FILA (28/08/2026, collaudo del committente):
               cuffie, Naviga, tappa d'itinerario e badge del pass uno sotto
               l'altro, allineati a destra. In fila crescevano verso sinistra
               fin sopra il centro della mappa, e il tasto del navigatore —
               l'unico che serve camminando — era in fondo alla fila. */
            <div className="absolute right-4 z-[999] flex flex-col items-end gap-2" style={{ bottom: "calc(9.75rem + env(safe-area-inset-bottom, 0px))" }}>
              {/* PERCORSO SU MISURA (03/09/2026, committente: «due funzioni
                  diverse, attivate in modo diverso»). Il suo tasto sta qui,
                  sopra le cuffie, e NON dipende da loro: si compone un
                  percorso di ristoranti, farmacie e monumenti anche con
                  l'audioguida spenta, perche' non c'entra con l'audioguida. */}
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleTogglePercorso}
                title={getTranslation('pc_tasto_mappa', language)}
                aria-label={getTranslation('pc_tasto_mappa', language)}
                className={`w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all ${
                  isPercorsoMode
                    ? 'bg-emerald-700 text-white ring-4 ring-emerald-700/30'
                    : 'bg-white/90 text-emerald-700 border border-emerald-100'
                }`}
              >
                <Route className="w-6 h-6" />
              </motion.button>
              {isAudioGuideActive && (<>
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
              {/* DUE PASSI, DUE TASTI (28/08/2026, committente: «deve avere
                  un avvio esplicito»). Tappe scelte → «Crea il giro»: il
                  server ordina e disegna, il cruscotto compare, ma non parte
                  niente. Giro creato → «Avvia la navigazione»: da qui la
                  voce, le svolte e i geofence. */}
              {/* Solo per la bozza del GIRO: il percorso su misura ha il suo
                  tasto nel suo pannello (paga a crediti, parte subito). */}
              {!vistaGiro && bozzaGiro.tappe.length > 0 && bozzaGiro.modo !== 'percorso' && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={avviaGiroDaMappa}
                  disabled={avviandoGiro}
                  title={getTranslation('gr_crea_giro', language)}
                  className="h-12 px-4 rounded-full shadow-2xl bg-[#1e3a8a] text-white ring-4 ring-[#1e3a8a]/25 flex items-center gap-2 font-black text-[12px] transition-all disabled:opacity-60"
                >
                  {avviandoGiro ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                  {getTranslation('gr_crea_giro', language)}
                </motion.button>
              )}
              {/* Multi-tappa = premium: solo «Avvia la navigazione» (il server
                  verifica il Day Pass). Con una tappa sola questo tasto non
                  compare: c'e' il tondo verde gratis qui sotto (31/08/2026). */}
              {vistaGiro && !vistaGiro.avviato && vistaGiro.stato !== 'FINITO' && (vistaGiro.tappeTotali ?? 0) > 1 && vistaGiro.modo !== 'percorso' && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    // Il navigatore (le svolte) si paga col Day Pass: creare il
                    // giro e' gratis, e' qui che il server puo' dire di no — e
                    // quando lo dice si apre la cassa con «Acquista ora».
                    tourService.avvia().catch((e: any) => {
                      gestisciErroreGiro(e, language, { city: tourService.datiGiro()?.citta });
                    });
                  }}
                  title={getTranslation('gr_avvia_navigazione', language)}
                  className="h-12 px-4 rounded-full shadow-2xl bg-emerald-600 text-white ring-4 ring-emerald-600/25 flex items-center gap-2 font-black text-[12px] transition-all animate-pulse"
                >
                  <Navigation2 className="w-5 h-5" />
                  {getTranslation('gr_avvia_navigazione', language)}
                </motion.button>
              )}
              {/* Tappa SINGOLA = gratis: il tondo verde apre la doppia scelta
                  (WIP Nav / Google) verso quell'unica tappa. Compare solo se
                  il giro non e' multi-tappa (vedi tappaDaNavigare): mai
                  accanto ad «Avvia la navigazione», dove faceva da bypass
                  del Day Pass (31/08/2026, committente). */}
              {tappaDaNavigare && !vistaGiro?.avviato && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setNavTappa(tappaDaNavigare)}
                  title={getTranslation('tour_naviga', language)}
                  aria-label={getTranslation('tour_naviga', language)}
                  className="w-12 h-12 rounded-full shadow-2xl bg-emerald-600 text-white ring-4 ring-emerald-600/25 flex items-center justify-center transition-all"
                >
                  <Navigation2 className="w-6 h-6" />
                </motion.button>
              )}
              <DayPassBadge />
              </>)}
            </div>
          )}

          {/* La doppia scelta 🚶 WIP Nav / 🚗 Google Maps verso la PORTA
              dell'unica tappa: e' la navigazione singola, gratis. */}
          <NavChoiceSheet poi={navTappa} language={language} onClose={() => setNavTappa(null)} />

          <AnimatePresence>
            {isRadarMode && activeTab === "map" && (
              <PoiRadarPanel pois={radarPois} onClose={() => setIsRadarMode(false)} onFocus={(poi) => window.dispatchEvent(new CustomEvent('focus-poi', { detail: poi }))} onRemove={handleRemoveRadarPoi} language={language} />
            )}
            {isPercorsoMode && !isRadarMode && activeTab === "map" && (
              <PercorsoPanel language={language} onClose={() => setIsPercorsoMode(false)} />
            )}
          </AnimatePresence>

          {/* LA CARD BLU DELLE SVOLTE, IN ALTO, ANCHE PER IL GIRO (29/08/2026,
              collaudo: «il banner blu con le indicazioni del navigatore che
              era in alto non c'e' piu'?»). Era la card di WIP Nav verso la
              singola tappa (PlanScreen/useWalkingNavigation), che partiva dal
              tasto tondo verde — nascosto a giro avviato perche' riproponeva
              la scelta WIP Nav/Google. Il giro ha le stesse informazioni
              (svolta, metri, tappa, ETA): ora le mostra nella stessa card.
              La X la NASCONDE per la tappa in corso (il giro continua) e
              ricompare alla tappa dopo; fermare il giro si fa dal cruscotto. */}
          {/* Per il PERCORSO SU MISURA (03/09/2026, committente: «riclicca il
              tasto verde: deve nascondere l'itinerario; se si attiva deve
              tornare l'itinerario e il banner blu») il tasto verde della
              mappa e' anche l'interruttore di questo banner: nascosto col
              pannello, ricompare riattivandolo. Il giro classico Dieci Tappe
              non dipende da isPercorsoMode: resta sempre visibile com'era. */}
          {vistaGiro && vistaGiro.avviato && !vistaGiro.inPausa && vistaGiro.stato !== 'FINITO'
            && activeTab === "map" && cardSvolteNascostaPer !== String(tourService.tappaAttuale()?.id ?? '')
            && (vistaGiro.modo !== 'percorso' || isPercorsoMode) && (
            <NavigationOverlay
              state="navigating"
              language={language}
              currentInstruction={vistaGiro.istruzione}
              currentManeuver={vistaGiro.manovra}
              distanceToNext={vistaGiro.metriAllaSvolta}
              distanceToDestination={vistaGiro.metriAllaTappa}
              etaSeconds={vistaGiro.metriRimanenti > 0 ? Math.round(vistaGiro.metriRimanenti / 1.11) : null}
              progress={vistaGiro.metriTotali > 0 ? 1 - vistaGiro.metriRimanenti / vistaGiro.metriTotali : null}
              poiName={vistaGiro.nomeTappa || undefined}
              onStop={() => setCardSvolteNascostaPer(String(tourService.tappaAttuale()?.id ?? ''))}
              onRepeat={() => ripetiIstruzioneGiro()}
              onRecalc={() => posizioneVeloce((p) => { void tourService.ricalcolaDaQui(p); })}
            />
          )}

          {/* Dieci Tappe: il cruscotto del giro. Compare solo con un giro in
              corso e solo sulla mappa — altrove coprirebbe contenuto senza
              servire a niente, perche' il giro si cammina guardando la mappa. */}
          {giroInCorso && activeTab === "map" && (
            <TourBanner
              language={language}
              onChiudi={() => setGiroInCorso(false)}
              onRiascolta={riascoltaTappa}
            />
          )}

          <CategoryChips selectedIds={selectedCategories} onToggle={(id) => setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])} onEventClick={() => setActiveTab("events")} subFilter={subFilters} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} language={language} />

          <PoiDetailSheet poi={selectedPoi} autoPlay={poiAutoPlay} autoPlayNonce={poiAutoPlayNonce} guideMode={guideMode} modalitaGiro={!!isRadarMode || isPercorsoMode} isAdmin={isAdmin} onClose={() => { setSelectedPoi(null); setPoiAutoPlay(false); if (previousTab && previousTab !== "map") { setActiveTab(previousTab as any); setPreviousTab(null); } }} visionText={visionText} isSaved={!!selectedPoi && itinerary.some((p) => String(p.id) === String(selectedPoi.id))} onToggleSave={() => selectedPoi && toggleSavedPoi(selectedPoi)} onSetSubFilter={(f) => setSubFilters(prev => f === null ? [] : (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]))} nearbyPois={nearbyPoisForSelected} onSelectNearby={(p) => handleSelectPoi(p, nearbyPoisForSelected.filter((n) => n.id !== p.id).concat([selectedPoi]))} language={language} />
        </div>
        
        {/* ALTRE TAB — i container restano montati (stato preservato), la
            transizione slide+fade è sul wrapper interno: quando il tab si
            attiva il display passa a flex e motion anima l'ingresso. */}
        {mountedTabs.has("plan") && (
        <div className={`flex-1 w-full overflow-hidden ${activeTab === "plan" ? "flex flex-col relative" : "hidden"}`}>
          <motion.div
            className="flex-1 flex flex-col min-h-0"
            animate={activeTab === "plan" ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
          <Suspense fallback={<TabLoadingFallback />}>
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
          </Suspense>
          </motion.div>
        </div>
        )}

        {activeTab === "events" && !eventsEnabled && (
          <FeatureOffNotice onBack={() => setActiveTab("map")} language={language} />
        )}
        {activeTab === "events" && eventsEnabled && (
          <motion.div
            className="flex-1 w-full overflow-hidden flex flex-col relative"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
            <Suspense fallback={<TabLoadingFallback />}>
              <EventsScreen mapCenter={mapCenter} mapRadiusKm={mapRadiusKm} onClose={() => setActiveTab("map")} language={language} />
            </Suspense>
          </motion.div>
        )}
        {activeTab === "camera" && !cameraEnabled && (
          <FeatureOffNotice onBack={() => setActiveTab("map")} language={language} />
        )}
        {activeTab === "camera" && cameraEnabled && (
          <Suspense fallback={<TabLoadingFallback />}>
            <CameraScreen onRecognize={(data) => {
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
            }} onClose={() => setActiveTab("map")} language={language} />
          </Suspense>
        )}

        {visionCard && (
          <VisionCardSheet card={visionCard} language={language} onClose={() => setVisionCard(null)} />
        )}

        {mountedTabs.has("profile") && (
        <div className={`flex-1 w-full overflow-hidden ${activeTab === "profile" ? "flex flex-col relative" : "hidden"}`}>
          <motion.div
            className="flex-1 flex flex-col min-h-0"
            animate={activeTab === "profile" ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          >
          <Suspense fallback={<TabLoadingFallback />}>
          <ProfileScreen guideMode={guideMode} setGuideMode={setGuideMode} itinerary={itinerary} onSelectPoi={handleSelectPoi} defaultLocation={defaultLocation} setDefaultLocation={updateDefaultLocation} userSession={session} onSignOut={session ? async () => { await supabase.auth.signOut(); setSession(null); setOspite(false); } : undefined} onRemovePoi={removePoiById} onClearItinerary={async () => setItinerary([])} language={language} setLanguage={setLanguage} />
          </Suspense>
          </motion.div>
        </div>
        )}

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
              // Il listener vive in PlanScreen, che e' montato lazy al primo
              // accesso alla tab: chi parte dalla mappa senza averla mai aperta
              // trovava zero listener e l'evento si perdeva in silenzio
              // (verificato il 22/08/2026). Quindi: si MONTA la tab Plan senza
              // attivarla e si ridispatcha finche' il listener non marca
              // detail.handled, per 12 secondi al massimo (il chunk lazy deve
              // ancora arrivare).
              // Si RESTA sulla mappa (23/08/2026): prima si saltava sulla tab
              // Piano, dove senza un itinerario generato non c'e' nessuna
              // mappa — l'overlay partiva ma il percorso non si vedeva da
              // nessuna parte. Il tracciato lo disegna MapArea (NavRouteLayer,
              // evento 'wip-nav-route') e l'overlay e' un portal fixed, quindi
              // compare sopra qualsiasi tab.
              if (routeModalConfig.endCoords) {
                const detail: any = {
                  endCoords: routeModalConfig.endCoords,
                  destinationName: routeModalConfig.destinationName,
                  poiId: (routeModalConfig as any).poiId || null,
                  origin: origin || null,
                  pois,
                  handled: false,
                };
                setMountedTabs(prev => prev.has("plan") ? prev : new Set(prev).add("plan"));
                setActiveTab("map");
                let tentativi = 0;
                const spara = () => {
                  window.dispatchEvent(new CustomEvent('wip-internal-nav-start', { detail }));
                  if (!detail.handled && ++tentativi < 40) setTimeout(spara, 300);
                  else if (!detail.handled) console.warn('[WIP Nav] nessun listener per wip-internal-nav-start dopo 12 s');
                };
                spara();
              }
            }}
          />
          <DayPassOfferModal
            isOpen={bundleState.isOpen}
            city={bundleState.city}
            poisCount={bundleState.pois.length}
            motivo={bundleState.motivo}
            onClose={closeBundle}
          />
        </div>

        {/* MODALE DI LOGIN — a tutto schermo sopra l'app, richiudibile:
            l'ospite deve poter tornare alla mappa senza fare l'account.
            Si apre dal tasto "Accedi", dall'evento 'wip-open-login' e da
            qualsiasi 401 della nostra API. */}
        {/* Serve in due casi diversi, e in entrambi si deve poter chiudere
            (02/09/2026): l'OSPITE che tocca un'azione da account e ci ripensa
            deve tornare alla mappa, e chi ha la sessione SCADUTA a meta' lavoro
            non deve perdere quello che stava facendo. Senza `onClose` la X e il
            "continua senza account" non compaiono e si resta in trappola. */}
        {showLogin && !session && (
          <div className="absolute inset-0 z-[3000] bg-surface">
            <LoginScreen
              onLoginSuccess={(s) => { setSession(s); setShowLogin(false); setOspite(false); }}
              onClose={() => setShowLogin(false)}
              comeModale
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
