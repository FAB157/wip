// @ts-nocheck
import { useState, useEffect, ReactNode, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { checkUserQuota, incrementUserQuota } from '../lib/quotaManager';
import QuotaLimitToast, { useQuotaToast } from './QuotaLimitToast';
import CreditConfirmationModal from './CreditConfirmationModal';
import { notify } from '../lib/toast';
import ShopScreen from './ShopScreen';
import { PRICING_LIST, getWalletBalance, consumeCredits, refundCredits } from '../lib/pricing';
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import PoiContactButtons from './PoiContactButtons';
import { Capacitor } from '@capacitor/core';
import { WipBackgroundAudio } from '../plugins/WipBackgroundAudio';
import { saveOfflineAudio, getOfflineAudioUrl } from "../lib/offlineStorage";
import { supabase } from "../lib/supabase";
import {
  X,
  Globe,
  Phone,
  Map as MapIcon,
  MapPin,
  Ticket,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Star,
  Navigation,
  ExternalLink,
  ChevronRight,
  Loader2,
  Sparkles,
  RotateCw,
  Landmark,
  Megaphone,
  User,
  Calendar,
  Download,
  Headphones,
  Square,
  MessageSquare,
  Flag,
  AlertTriangle
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import AttractionImage from "./AttractionImage";
import wipLogo from '../assets/images/wip-icon.png';
import { SUBCATEGORY_DETAILS } from "../data/subcategoryDetails";
import ActionButton from "./ui/ActionButton";

import {
  getCachedPoiDetails,
  setCachedPoiDetails,
  getCachedCityName,
  setCachedCityName,
} from "../lib/poiCache";
import { Language, getTranslation } from "../lib/i18n";
import {
  CATEGORY_COLORS,
  CATEGORY_EMOJIS,
} from "../lib/mapConstants";
import { recordListening } from "../lib/listeningHistory";
import { useCreditConfirmation } from "../hooks/useCreditConfirmation";
import { locationService } from "../services/locationService";
import { playOfflineGuide } from "../services/dayPassService";
import { useAudioState } from "../hooks/useAudioState";

export const AFFILIATE_CONFIG = {
  GYG_PARTNER_ID: "KYSFZYF", // Inserisci qui il tuo codice affiliato GetYourGuide (es. "12345")
  GYG_CMP: "share_to_earn",
  TIQETS_PARTNER_ID: "" // Inserisci qui il tuo codice affiliato Tiqets
};

// Una sola pipeline di arricchimento in volo per POI: chi arriva dopo attende
// la stessa Promise e poi legge la cache, invece di uscire lasciando lo
// spinner acceso per sempre (vecchio bug del "Caricamento dettagli..." infinito).
const enrichmentPromises = new Map<string, Promise<void>>();

// fetch con timeout: su serverless (cold start) o LLM lenti una fetch senza
// AbortController può restare appesa per minuti e bloccare la UI.
const fetchWithTimeout = (url: string, opts: any = {}, ms = 12000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

import { mapItineraryCategoryToMapCategory, getAudioguide, upsertAudioguide, ensureSharedPoi } from "../services/poiRepository";
import PoiAudioPlayer from "./poi/PoiAudioPlayer";
import PoiExtraDetails from "./poi/PoiExtraDetails";
import PoiNearbyList from "./poi/PoiNearbyList";

interface PoiDetailSheetProps {
  poi: {
    id: string | number;
    name?: string;
    category: string;
    lat: number;
    lon: number;
    isVision?: boolean;
    autore?: string;
    anno_produzione?: string;
    curiosita?: string;
    description?: string;
    description_short?: string;
    description_long?: string;
    audioScript?: string;
    audioScriptExtended?: string;
    city?: string;
    image_url?: string;
    photo_url?: string;
    address?: string;
    rating?: string;
    user_ratings_total?: number;
    subCategory?: string;
    is_gem?: boolean;
    link_info?: string;
    isFromItinerary?: boolean;
  } | null;
  autoPlay?: boolean;
  /** Cambia a ogni nuovo trigger esplicito (banner/notifica): senza, un secondo
   *  click sullo stesso POI non riavviava l'effect di autoplay (deps invariate). */
  autoPlayNonce?: number;
  guideMode: "nicky" | "dante";
  onClose: () => void;
  isSaved?: boolean;
  onToggleSave?: () => void;
  visionText?: string;
  onSetSubFilter?: (filter: string | null) => void;
  nearbyPois?: any[];
  onSelectNearby?: (poi: any) => void;
  language: Language;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = (base64Data: string): Blob => {
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

export default function PoiDetailSheet({
  poi,
  autoPlay,
  autoPlayNonce = 0,
  guideMode,
  onClose,
  isSaved,
  onToggleSave,
  visionText,
  onSetSubFilter,
  nearbyPois: propNearbyPois = [],
  onSelectNearby,
  language,
}: PoiDetailSheetProps) {
  const [nearbyPois, setNearbyPois] = useState<any[]>(propNearbyPois);
  const [showNearbyList, setShowNearbyList] = useState(false);

  // Error Reporting State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('Informazioni errate');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [localGuideMode, setLocalGuideMode] = useState<"nicky" | "dante">(guideMode);
  const creditConfirm = useCreditConfirmation();
  const hasAutoPlayedRef = useRef<string | null>(null);

  const [wikiData, setWikiData] = useState<{
    extract: string;
    thumbnail?: string;
    description?: string;
    pageUrl?: string;
  } | null>(null);

  const [tripData, setTripData] = useState<{
    rating?: string | null;
    numReviews?: string | number;
    reviews?: { text: string; rating: number; author: string }[];
    address?: string;
    phone?: string;
    tags?: string[];
  } | null>(null);

  const [parkingData, setParkingData] = useState<{
    availability?: string;
    fee?: string;
    capacity?: string;
    type?: string;
  } | null>(null);

  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  
  // Credit Economy State
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [shopUserId, setShopUserId] = useState<string | null>(null);

  // Apre lo shop crediti in overlay (dal ramo "Crediti Insufficienti" dei modali)
  const openCreditShop = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      setShopUserId(sessionData?.session?.user?.id || "mock-user-id");
    } catch {
      setShopUserId("mock-user-id");
    }
  };
  const [pendingAudioTask, setPendingAudioTask] = useState<{text: string, force: boolean} | null>(null);

  // Prevention for infinite loops
  const processedRef = useRef<string>("");

  
  const loadingPhrases = [
    "Sto consultando gli archivi storici...",
    "Sto cercando segreti e curiosità...",
    "Sto elaborando l'audioguida immersiva...",
    "Quasi pronto per svelarti tutto..."
  ];

  useEffect(() => {
    if (isLoading || isRegenerating) {
      const interval = setInterval(() => {
        setLoadingPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isLoading, isRegenerating]);

  useEffect(() => {
    const textToType = wikiData?.extract;
    if (!isLoading && !isRegenerating && !isStreaming && textToType && textToType !== displayedText && !isTyping) {
      // Se avevamo già digitato, o se l'utente cambia lingua, riavviamo il typing
      setIsTyping(true);
      setDisplayedText("");
      let i = 0;
      const speed = 3; // ms per carattere
      const interval = setInterval(() => {
        setDisplayedText(textToType.substring(0, i));
        i += 3; // scrivi 3 lettere alla volta per velocità
        if (i >= textToType.length) {
          setDisplayedText(textToType);
          clearInterval(interval);
          setIsTyping(false);
        }
      }, speed);
      return () => clearInterval(interval);
    } else if (!isLoading && !isRegenerating && !textToType) {
       setDisplayedText("");
    }
  }, [isLoading, isRegenerating, generatedText, wikiData?.extract, language]);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [offlineAudioStatus, setOfflineAudioStatus] = useState<string | null>(null);
  const isOnline = useNetworkStatus();
  const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();
  const audioState = useAudioState();

  const uploadToSupabaseCache = async (
    poiItem: any,
    mode: string,
    text: string | null,
    audioBlob: Blob | null,
    wiki: any,
    trip: any,
    parking: any
  ) => {
    try {
      const base64Audio = audioBlob ? await blobToBase64(audioBlob) : null;
      const cleanPoiId = String(poiItem.id).replace(/_[A-Z]{2}$/, '');
      const cachePoiId = `${cleanPoiId}_${language}`;
      const payload = {
        poi_id: cachePoiId,
        guide_mode: mode,
        name: poiItem.name || null,
        category: poiItem.category || null,
        description: poiItem.description || null,
        wiki_extract: wiki?.extract || null,
        wiki_data: wiki ? JSON.stringify(wiki) : null,
        trip_data: trip ? JSON.stringify(trip) : null,
        parking_data: parking ? JSON.stringify(parking) : null,
        generated_text: text || null,
        image_url: wiki?.thumbnail || poiItem.image_url || null,
        audio_base64: base64Audio,
        subCategory: poiItem.subCategory || null,
        created_at: new Date().toISOString()
      };
      
      const res = await fetch("/api/cache/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP error ${res.status}`);
      }
      console.log("[Global Cache] Successfully saved details via strict backend validation:", cachePoiId);
    } catch (e: any) {
      console.debug("Error uploading to Supabase cache:", e.message);
    }
  };
  const [distanceFromUser, setDistanceFromUser] = useState<number | null>(null);

  const openChatWithWip = () => {
    onClose();
    setTimeout(() => {
      // Nome evento canonico "wip-open-chat" (vedi CLAUDE.md): con il vecchio
      // "open-chat" nessuno lo ascoltava e il bottone non faceva nulla.
      // "context" è il campo che App.tsx usa come initialMessage.
      window.dispatchEvent(
        new CustomEvent("wip-open-chat", {
          detail: {
            mode: "guide",
            poiId: poi?.id,
            poiName: poi?.name,
            context: poi?.name ? `Parliamo di ${poi.name}: ` : undefined,
          },
        }),
      );
    }, 300);
  };

  const handleReportSubmit = async () => {
    if (!poi) return;
    setIsReporting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('poi_reports').insert({
        poi_id: String(poi.id),
        poi_name: poi.name || 'Sconosciuto',
        user_id: userData.user?.id || null,
        error_type: reportType,
        details: reportDetails,
        status: 'pending'
      });

      if (error) throw error;
      
      setShowReportModal(false);
      setReportType('Informazioni errate');
      setReportDetails('');
      notify('Segnalazione inviata con successo. Grazie per il tuo aiuto!', 'success');
    } catch (e) {
      console.error('Errore invio segnalazione:', e);
      notify('Si è verificato un errore durante l\'invio della segnalazione.');
    } finally {
      setIsReporting(false);
    }
  };

  useEffect(() => {
    setLocalGuideMode(guideMode);
  }, [guideMode]);

  useEffect(() => {
    if (poi) {
      // 1. Record vision per gamification
      import('../lib/gamification').then(({ recordPoiVision }) => {
        supabase.auth.getSession().then(({ data: sessionData }) => {
          const uid = sessionData?.session?.user?.id;
          if (uid) {
            recordPoiVision(poi.id, uid);
          }
        });
      });

      // 2. Calcola distanza dall'utente
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const R = 6371e3;
            const lat1 = (pos.coords.latitude * Math.PI) / 180;
            const lat2 = (poi.lat * Math.PI) / 180;
            const dLat = ((poi.lat - pos.coords.latitude) * Math.PI) / 180;
            const dLon = ((poi.lon - pos.coords.longitude) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            setDistanceFromUser(Math.round(R * c));
          },
          () => {},
        );
      }
    }
  }, [poi]);

  useEffect(() => {
    // Stop any current speech when POI changes
    if (processedRef.current.split('_')[0] !== String(poi?.id)) {
       // locationService.stopGuideAudio();
    }
    setGeneratedText(null);
    setIsPlayingLocal(false);
  }, [poi]);

  // Snapshot dei valori correnti per l'autoplay: l'effect qui sotto è keyed solo
  // su [autoPlay, poi?.id], così i flip di isLoading/isRegenerating non cancellano
  // più la sequenza (vecchio bug: il timer veniva ripulito dal cleanup e
  // hasAutoPlayedRef impediva di ricrearlo → l'autoplay non partiva quasi mai).
  const autoplayCtxRef = useRef<any>({});
  useEffect(() => {
    autoplayCtxRef.current = { isLoading, isRegenerating, generatedText, wikiData, toggleSpeech };
  });

  // LOGICA AUTOPLAY (Arrivo al POI o click su banner "Ascolta").
  // Il via lo dà l'evento nativo 'wip-teaser-finished' (il TTS Android ha finito
  // il teaser): niente più timer cieco da 3.5s. Il timer resta solo come
  // fallback nel caso l'evento non arrivi (PWA, evento perso, teaser saltato).
  useEffect(() => {
    if (!autoPlay || !poi) return;
    const poiIdStr = String(poi.id);
    // La chiave include il nonce: un nuovo trigger esplicito (secondo click su
    // "Ascolta" dal banner) riparte, il doppio-run dello stesso trigger no.
    const runKey = `${poiIdStr}:${autoPlayNonce}`;
    if (hasAutoPlayedRef.current === runKey) return; // Già eseguito per questo trigger
    hasAutoPlayedRef.current = runKey;

    let cancelled = false;
    let started = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const startPlayback = () => {
      if (cancelled || started) return;
      started = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      const attempt = () => {
        if (cancelled) return;
        const ctx = autoplayCtxRef.current;
        const textToSpeak = poi?.audioScript || ctx.generatedText || ctx.wikiData?.extract || poi?.description || (poi as any)?.spiegazione_audio;

        // Se sta già suonando questo POI, non fare nulla
        const st = locationService.getAudioState();
        if (st.isPlaying && st.poiId === poiIdStr) return;

        if (typeof ctx.toggleSpeech !== 'function') {
          retryTimer = setTimeout(attempt, 500);
          return;
        }

        if (!ctx.isLoading && !ctx.isRegenerating && textToSpeak) {
          console.log(`[PoiDetailSheet] AutoPlay: dettagli pronti, avvio guida per ${poi?.name}`);
          // Belt & braces: se la voce nativa stesse ancora parlando, la fermiamo
          // un attimo prima di partire — mai due voci sovrapposte.
          locationService.stopNativeTeaser();
          ctx.toggleSpeech();
        } else if (!ctx.isLoading && !ctx.isRegenerating && !textToSpeak) {
          console.warn(`[PoiDetailSheet] AutoPlay: No text to speak found for ${poi?.name}.`);
        } else {
          retryTimer = setTimeout(attempt, 500);
        }
      };
      attempt();
    };

    const onTeaserFinished = (e: any) => {
      const evPoi = String(e?.detail?.poiId ?? '');
      if (!evPoi || evPoi === poiIdStr) startPlayback();
    };
    window.addEventListener('wip-teaser-finished', onTeaserFinished);

    if (!Capacitor.isNativePlatform()) {
      // Su web non esiste il teaser nativo: partire subito, senza attese inutili
      startPlayback();
    } else {
      // Chiediamo al nativo lo stato reale del teaser: se ha già finito (o non
      // sta parlando) partiamo subito — es. utente che sblocca il telefono
      // dopo la fine del teaser: prima aspettava comunque 3.5s.
      locationService.getNativeTeaserState().then((state: any) => {
        if (cancelled || started) return;
        if (!state || !state.isSpeaking) {
          startPlayback();
        } else if (state.speakingPoiId && state.speakingPoiId !== poiIdStr) {
          // Sta leggendo il teaser di un ALTRO POI: il suo evento di fine non
          // ci sbloccherebbe, usiamo un fallback breve.
          fallbackTimer = setTimeout(startPlayback, 4000);
        } else {
          // Sta ancora leggendo il teaser di questo POI: aspettiamo l'evento
          // 'wip-teaser-finished', con fallback generoso se andasse perso.
          fallbackTimer = setTimeout(startPlayback, 15000);
        }
      }).catch(() => {
        fallbackTimer = setTimeout(startPlayback, 3500);
      });
    }

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('wip-teaser-finished', onTeaserFinished);
    };
  }, [autoPlay, poi?.id, autoPlayNonce]);

  useEffect(() => {
    let active = true;
    setGeneratedText(null);
    setTripData(null);
    setWikiData(null);
    setParkingData(null);
    setIsTyping(false);
    setDisplayedText("");
    
    const loadPoiDetails = async () => {
      if (!poi) {
        processedRef.current = ""; // Reset when closed
        return;
      }

      const currentWorkKey = `${poi.id}_${guideMode}_${language}`;
      if (processedRef.current === currentWorkKey && (wikiData || isLoading || isStreaming)) {
        console.log("[DetailSheet] Already processed this POI/Mode/Lang combination, skipping re-load.");
        return;
      }

      // Se l'ID del POI è cambiato, resettiamo tutto.
      // Se è lo stesso (es. cambio solo lingua o personaggio), siamo più selettivi.
      const isNewPoi = processedRef.current.split('_')[0] !== String(poi.id);

      if (isNewPoi) {
        processedRef.current = currentWorkKey;
        setGeneratedText(null);
        setTripData(null);
        setWikiData(null);
        setParkingData(null);
        setDisplayedText("");
        setIsStreaming(false);
        setIsLoading(true);
      } else if (processedRef.current === currentWorkKey && (wikiData || isLoading || isStreaming)) {
        console.log("[DetailSheet] Already processed this POI/Mode/Lang combination, skipping re-load.");
        return;
      }

      processedRef.current = currentWorkKey;
      setIsTyping(false);

      // 1. Prova a recuperare le informazioni complete dal database globale condiviso Supabase
      try {
        const cleanPoiId = String(poi.id).replace(/_[A-Z]{2}$/, '');
        const cachePoiId = `${cleanPoiId}_${language}`;
        const { data, error } = await supabase
          .from("shared_poi_audio_cache")
          .select("*")
          .eq("poi_id", cachePoiId)
          .eq("guide_mode", guideMode)
          .single();

        if (active && data && !error) {
          console.log("[Global Cache] Hit for POI:", cachePoiId);
          const cachedWiki = data.wiki_data ? JSON.parse(data.wiki_data) : { extract: data.wiki_extract, thumbnail: data.image_url, description: data.description };
          const cachedTrip = data.trip_data ? JSON.parse(data.trip_data) : { address: data.description || "" };
          const cachedParking = data.parking_data ? JSON.parse(data.parking_data) : null;

          setWikiData(cachedWiki);
          setTripData(cachedTrip);
          if (cachedParking) setParkingData(cachedParking);
          if (data.generated_text) setGeneratedText(data.generated_text);

          if (data.audio_base64) {
            try {
              const blob = base64ToBlob(data.audio_base64);
              const localAudioUrl = URL.createObjectURL(blob);
              // Audio is managed by locationService
            } catch (e) {
              console.error("Failed to decode base64 audio:", e);
            }
          }

          setCachedPoiDetails(poi.id, {
            wikiData: cachedWiki,
            tripData: cachedTrip,
            parkingData: cachedParking,
            generatedText: data.generated_text
          });

          setIsLoading(false);
          return;
        }
      } catch(e) {
        console.debug("Supabase cache read skipped/failed:", e);
      }

      // 2. Se non abbiamo l'audio in cache, ma il POI ha già una descrizione arricchita nel DB principale
      const isAlreadyEnriched = poi.description_long || (poi.description && poi.description.length > 80) || (poi.description_ai && poi.description_ai.length > 80);

      if (isAlreadyEnriched) {
        console.log("[DetailSheet] Initializing from pre-loaded POI details:", poi.name);
        const desc = poi.description_long || poi.description_ai || poi.description || "";

        const wikiPayload = {
          extract: desc,
          thumbnail: poi.image_url || (poi as any).photo_url || undefined,
          description: (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
          pageUrl: "#"
        };

        const tripPayload = {
          address: (poi as any).address || "",
          tags: [poi.category],
          rating: (poi as any).rating || "4.2",
          numReviews: (poi as any).user_ratings_total || 12,
          reviews: []
        };

        setWikiData(wikiPayload);
        setTripData(tripPayload);
        // setDisplayedText(desc); // Removed to allow typewriter effect to run

        setCachedPoiDetails(poi.id, {
          wikiData: wikiPayload,
          tripData: tripPayload,
          generatedText: null
        });

        setIsLoading(false);
        return;
      } else if (poi.description || poi.description_short || poi.description_ai) {
        const shortDesc = poi.description_short || poi.description_ai || poi.description || "";
        setWikiData({
          extract: shortDesc,
          thumbnail: poi.image_url || (poi as any).photo_url || undefined,
          description: (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
          pageUrl: "#"
        });
        // setDisplayedText(shortDesc); // Removed to allow typewriter effect to run
      }

      const cached = getCachedPoiDetails(poi.id);
      if (cached) {
        if (cached.wikiData) setWikiData(cached.wikiData);
        // Compatibilità con i dati arricchiti da PoiPopupContent (groqData format)
        if (!cached.wikiData && (cached.descriptionLong || cached.description || cached.audioScript || cached.imageUrl)) {
           setWikiData({
              extract: cached.descriptionLong || cached.description || cached.audioScript || "",
              thumbnail: cached.imageUrl || cached.image_url || poi.image_url || (poi as any).photo_url || undefined,
              description: (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
              pageUrl: "#"
           });
           setDisplayedText(cached.descriptionLong || cached.description || cached.audioScript || "");
        }
        if (cached.tripData) setTripData(cached.tripData);
        if (cached.parkingData) setParkingData(cached.parkingData);
        if (cached.generatedText) setGeneratedText(cached.generatedText);

        // La scheda si accontenta della cache SOLO se contiene già un testo
        // esteso. Con la sola descrizione breve del pin (o con la sola foto)
        // si mostrava quella e ci si fermava qui: l'utente apriva la guida e
        // leggeva le stesse due righe del popup, senza la scheda dettagliata.
        // Ora quei dati servono da anteprima immediata (stessa foto del pin)
        // e il caricamento del testo lungo prosegue in background.
        const longText = cached.wikiData?.extract || cached.descriptionLong || cached.audioScript || cached.generatedText || '';
        const hasDetailedContent = typeof longText === 'string' && longText.trim().length > 400;

        if (hasDetailedContent) {
          setIsLoading(false);
          return;
        }
      }

      if (!isOnline) {
         try {
           const offlineSaved = localStorage.getItem(`offline_poi_${poi.id}`);
           if (offlineSaved) {
              const data = JSON.parse(offlineSaved);
              if (data.cachedOfflineData) {
                 if (data.cachedOfflineData.wikiData) setWikiData(data.cachedOfflineData.wikiData);
                 if (data.cachedOfflineData.tripData) setTripData(data.cachedOfflineData.tripData);
                 if (data.cachedOfflineData.parkingData) setParkingData(data.cachedOfflineData.parkingData);
                 if (data.cachedOfflineData.generatedText) setGeneratedText(data.cachedOfflineData.generatedText);
              }
           } else {
             setWikiData({ extract: "Apri l'app quando sei online per visualizzare queste informazioni." });
           }
         } catch(e) {}
         setIsLoading(false);
         return;
      }

      if (!active) return;

      if (poi.isVision) {
        setWikiData({
          extract: visionText || "Ho riconosciuto questo luogo!",
          description: "Riconoscimento IA",
          thumbnail: poi.image_url || undefined,
          pageUrl: "#",
        });
        setIsLoading(false);
      } else {
        const callEnrichApi = async () => {
          const poiIdStr = String(poi.id);

          // Arricchimento già in volo per questo POI (doppio mount di React,
          // cambio lingua/personaggio): aspettiamo QUELLA promise e rileggiamo
          // la cache. Prima si usciva subito senza spegnere isLoading → la
          // scheda restava su "Caricamento dettagli..." per sempre.
          const inFlight = enrichmentPromises.get(poiIdStr);
          if (inFlight) {
            console.warn(`[PoiDetailSheet] Enrichment for ${poiIdStr} already in flight. Waiting for it...`);
            await inFlight.catch(() => {});
            if (!active) return;
            const cachedNow = getCachedPoiDetails(poi.id);
            if (cachedNow) {
              if (cachedNow.wikiData) setWikiData(cachedNow.wikiData);
              if (cachedNow.tripData) setTripData(cachedNow.tripData);
              if (cachedNow.parkingData) setParkingData(cachedNow.parkingData);
              if (cachedNow.generatedText) setGeneratedText(cachedNow.generatedText);
            }
            setIsLoading(false);
            setIsStreaming(false);
            return;
          }

          const runEnrichment = async () => {
          try {
            // ── STEP 0: Leggi i dati pre-arricchiti dal DB (Wikipedia/Wikidata/WikiVoyage/Wikimedia) ──
            // Se il POI è già arricchito → usiamo quei dati reali, senza chiamare AI.
            try {
              const detailsRes = await fetchWithTimeout(`/api/poi/details?id=${encodeURIComponent(poiIdStr)}`, {}, 10000);
              if (detailsRes.ok) {
                const dbData = await detailsRes.json();

                if (dbData.status === 'processing' || dbData.description_ai === 'processing') {
                   console.warn(`[PoiDetailSheet] POI ${poiIdStr} is currently being processed by Edge Function.`);
                   const currentDesc = poi.description_short || poi.description || "";
                   const basicWiki = {
                     extract: currentDesc || "Analisi storica in corso...",
                     description: poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Cultura",
                     thumbnail: dbData.image_url || dbData.photo_url || poi.image_url || undefined,
                     pageUrl: "#"
                   };
                   const basicTrip = { address: '', phone: '', website: '', tags: [poi.category], rating: null, numReviews: 0, reviews: [] };
                   if (active) {
                     setWikiData(basicWiki);
                     setTripData(basicTrip);
                     setIsLoading(false);
                   }
                   return;
                }

                const fullDesc = dbData.full_description || dbData.description_long || dbData.description_ai;
                if (fullDesc && fullDesc.length > 30) {
                  const techData = dbData.technical_data || {};
                  // Dati tecnici come testo aggiuntivo
                  const techLines: string[] = [];
                  if (techData.inception) techLines.push(`📅 Anno: ${techData.inception}`);
                  if (techData.architect) techLines.push(`🏗️ Architetto: ${techData.architect}`);
                  if (techData.style)     techLines.push(`🏛️ Stile: ${techData.style}`);
                  if (techData.material)  techLines.push(`🧱 Materiale: ${techData.material}`);
                  if (techData.height)    techLines.push(`📏 Altezza: ${techData.height}`);
                  if (techData.city)      techLines.push(`📍 Comune: ${techData.city}`);
                  if (techData.wikivoyage_dest) techLines.push(`🧭 Zona: ${techData.wikivoyage_dest}`);
                  const finalDesc = techLines.length > 0 ? `${fullDesc}\n\n${techLines.join(' · ')}` : fullDesc;

                  // Practical info
                  let phone = ''; let website = '';
                  if (dbData.practical_info) {
                    const telM = dbData.practical_info.match(/Tel:\s*([^\s|]+)/);
                    if (telM) phone = telM[1];
                  }
                  if (!phone && techData.phone_wikidata)   phone   = techData.phone_wikidata;

                  const wikiPayload = {
                    extract: finalDesc,
                    thumbnail: dbData.image_url || dbData.photo_url || poi.image_url || undefined,
                    description: (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
                    pageUrl: techData.wikipedia_url || techData.wikivoyage_url || '#',
                  };
                  const tripPayload = { address: '', phone, website, tags: [poi.category], rating: null, numReviews: 0, reviews: [] };
                  // Testo audioguida dedicato: era ignorato (generatedText: null),
                  // quindi il Play leggeva la descrizione della scheda invece
                  // dello script d'ascolto già salvato in Supabase.
                  const storedAudioScript = dbData.audio_script || dbData.audioScript || null;
                  if (active) {
                    setWikiData(wikiPayload);
                    setTripData(tripPayload);
                    if (storedAudioScript) setGeneratedText(storedAudioScript);
                    setCachedPoiDetails(poi.id, { wikiData: wikiPayload, tripData: tripPayload, generatedText: storedAudioScript });
                    setIsLoading(false);
                  }
                  return; // ✅ Dati DB trovati
                }
              }
            } catch (dbErr) {
              console.debug('[DetailSheet] /api/poi/details skip:', dbErr);
            }

            // ── STEP 1: Quota check (solo se serve l'AI) ─────────────────────
            const { data: sessionData } = await supabase.auth.getSession();
            const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

            // ✅ [CONTROLLO STORIA ACQUISTI] - Verifica se l'utente ha già pagato per questo POI
            const { getListeningHistory } = await import('../lib/listeningHistory');
            const history = await getListeningHistory(currentUserId);
            const poiIdStr = String(poi?.id);
            const alreadyPaid = history.some(h => String(h.poi_id) === poiIdStr) || poi?.isFromItinerary === true;

            if (!alreadyPaid) {
                // Saldo fresco PRIMA di aprire il modale: currentBalance parte
                // da 0 e senza fetch il modale mostrava "Crediti Insufficienti"
                // anche a saldo pieno.
                try {
                  const bal = await getWalletBalance(currentUserId);
                  setCurrentBalance(bal.total);
                } catch { /* il modale mostrerà l'ultimo saldo noto */ }
                // ✅ [STOP ADDEBITO AUTOMATICO] - Chiediamo conferma solo se il POI non è già stato acquistato
                const confirmed = await creditConfirm.requestConfirmation(PRICING_LIST.poi_detail, "Arricchimento Dettagli (AI)");
                if (!confirmed) {
                  setIsLoading(false);
                  processedRef.current = ""; // Permetti di riprovare
                  return;
                }

                const payRes = await consumeCredits(currentUserId, PRICING_LIST.poi_detail);
                if (!payRes) {
                  notify("Crediti insufficienti. Visita lo store per ricaricare.");
                  setIsLoading(false);
                  processedRef.current = "";
                  return;
                }
            } else {
                console.log("[DetailSheet] POI già acquistato, salto conferma crediti.");
            }

            let enriched: any = {};
            let finalEnriched: any = {};
            let currentExtract = poi.description_short || poi.description || "";
            let currentThumbnail = poi.image_url || (poi as any).photo_url || undefined;
            let currentPageUrl = "#";

            // Serve anche quando il testo c'è ma MANCA LA FOTO: questa è
            // l'unica fase che cerca un'immagine reale, e col vecchio
            // `if (!currentExtract)` un POI con descrizione ma senza foto
            // restava senza foto per sempre.
            if (!currentExtract || !currentThumbnail) {
              if (active) setIsLoading(true);
              // Fase 1 (POI "nudo" o senza immagine): foto + testo breve reale
              // da Wikipedia/Commons. Con timeout: se tarda, Groq fa il resto.
              try {
                const enrichRes = await fetchWithTimeout("/api/poi/enrich", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: poi.id,
                    name: poi.name,
                    lat: poi.lat,
                    lon: poi.lon,
                    category: poi.category,
                    subCategory: poi.subCategory,
                    wikipedia: (poi as any).wikipedia,
                    lang: language,
                    fast: true,
                    mode: "short"
                  })
                }, 12000);

                if (!enrichRes.ok) {
                  if (enrichRes.status === 403) {
                    const errData = await enrichRes.json().catch(() => null);
                    throw new Error(errData?.message || "Questo luogo non ha superato la curatela storica.");
                  }
                  throw new Error("Errore durante l'arricchimento del POI");
                }

                if (active) {
                  enriched = await enrichRes.json();
                  currentExtract = enriched.description_long || enriched.description_short || enriched.extract || "";
                  currentThumbnail = enriched.thumbnail || currentThumbnail;
                  currentPageUrl = enriched.pageUrl || currentPageUrl;
                }
              } catch (fastErr: any) {
                if (fastErr?.message?.includes("curatela")) throw fastErr;
                console.warn("[PoiDetailSheet] Fast enrich skip:", fastErr?.message);
              }
            }

            if (active) {
              const categoryLabel = poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo";
              
              const wikiPayload = {
                extract: currentExtract,
                thumbnail: currentThumbnail,
                description: categoryLabel,
                pageUrl: currentPageUrl
              };

              setWikiData(wikiPayload);
              
              // Sblocca subito la visualizzazione per l'utente, e avvia lo streaming AI
              setIsLoading(false);
              setIsStreaming(true);
              finalEnriched = { ...enriched };

              // Disponibilità parcheggio: prima veniva "stimata" dall'ora del
              // giorno (Alta/Media/Bassa + "Tariffa locale") — un dato inventato
              // presentato come reale. Rimosso: senza una fonte vera non si
              // mostra nulla.
              let parkingPayload = null;
              setParkingData(null);

              // (la vecchia seconda chiamata "fast" a /api/poi/enrich era un
              // duplicato esatto della Fase 1 qui sopra: rimossa)
              const fastExtract = currentExtract;

              // Watchdog anti-stallo: se lo stream resta muto per 25s
              // (cold start + LLM saturo) abortiamo e mostriamo il fallback,
              // invece di lasciare la scheda su "Caricamento..." all'infinito.
              const streamCtrl = new AbortController();
              let streamWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => streamCtrl.abort(), 25000);
              const resetStreamWatchdog = () => {
                if (streamWatchdog) clearTimeout(streamWatchdog);
                streamWatchdog = setTimeout(() => streamCtrl.abort(), 25000);
              };
              const clearStreamWatchdog = () => {
                if (streamWatchdog) { clearTimeout(streamWatchdog); streamWatchdog = null; }
              };

              try {
                const { data: sessionData } = await supabase.auth.getSession();
                const currentUserId = sessionData?.session?.user?.id || 'anonymous';

                // Fase 2: Streaming live dell'intelligenza artificiale
                const streamRes = await fetch("/api/poi/enrich-stream", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  signal: streamCtrl.signal,
                  body: JSON.stringify({
                    id: poi.id,
                    name: poi.name,
                    lat: poi.lat,
                    lon: poi.lon,
                    category: poi.category,
                    subCategory: poi.subCategory,
                    lang: language,
                    extract: fastExtract,
                    userId: currentUserId
                  })
                });

                if (streamRes.body) {
                  const reader = streamRes.body.getReader();
                  const decoder = new TextDecoder("utf-8");
                  let accumulatedJson = "";

                  while (true) {
                    if (!active) break;
                    const { done, value } = await reader.read();
                    if (done) break;
                    resetStreamWatchdog();

                    const chunkStr = decoder.decode(value);
                    const lines = chunkStr.split("\n");
                    
                    for (const line of lines) {
                      if (line.startsWith("data: ")) {
                        const dataStr = line.substring(6);
                        if (dataStr === "[DONE]") continue;
                        try {
                          const data = JSON.parse(dataStr);
                          if (data.text) accumulatedJson += data.text;
                          
                          // Estrazione live estremamente flessibile
                          let rawText = accumulatedJson;

                          // Se c'è del markdown JSON, puliscilo
                          rawText = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '');

                          const firstBrace = rawText.indexOf('{');

                          if (firstBrace !== -1) {
                            const longKey = '"description_long"';
                            const longIdx = rawText.indexOf(longKey, firstBrace);
                            if (longIdx !== -1) {
                              let partialDesc = rawText.substring(longIdx + longKey.length);
                              // Pulisce ": " e le virgolette iniziali
                              partialDesc = partialDesc.replace(/^\s*[:]\s*"/, '');

                              // Pulisce l'eventuale fine della stringa o del JSON per la visualizzazione live
                              const endIdx = partialDesc.lastIndexOf('",');
                              if (endIdx !== -1) partialDesc = partialDesc.substring(0, endIdx);
                              else {
                                partialDesc = partialDesc.replace(/"\s*}?$/, '');
                              }

                              const formattedDesc = partialDesc.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                              if (formattedDesc.trim().length > 0) {
                                setStreamingText(formattedDesc);
                                setDisplayedText(formattedDesc);
                              }
                            }
                          } else if (rawText.length > 50 && !rawText.includes('{')) {
                            // Fallback: se l'AI scrive direttamente il testo invece del JSON
                            setStreamingText(rawText);
                            setDisplayedText(rawText);
                          }
                        } catch (e) {}
                      }
                    }
                  }
                  
                  clearStreamWatchdog();
                  setIsStreaming(false);

                  // Processa il risultato finale. NOTA: il salvataggio in
                  // shared_pois ora lo fa il BACKEND (service role) prima del
                  // [DONE]: l'update dal client con la anon key veniva
                  // bloccato dalle RLS e non persisteva mai nulla.
                  finalEnriched = { ...enriched };
                  try {
                    let finalJson = accumulatedJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
                    const fb = finalJson.indexOf('{');
                    const lb = finalJson.lastIndexOf('}');
                    if (fb !== -1 && lb > fb) finalJson = finalJson.slice(fb, lb + 1);
                    const parsedFinal = JSON.parse(finalJson);
                    finalEnriched = { ...finalEnriched, ...parsedFinal };
                  } catch(e) {
                    console.warn("Could not parse final json", e);
                  }

                  const { data: sessionData } = await supabase.auth.getSession();
                  const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
                  // Quota per POI già scalata in anticipo
                  
                  if (finalEnriched) {
                    const finalDesc = finalEnriched.description_long || finalEnriched.description_short || wikiPayload.extract;
                    setDisplayedText(finalDesc);
                    setWikiData(prev => ({ ...prev, extract: finalDesc }));
                    
                    const tripPayload = {
                      address: finalEnriched.address || "",
                      tags: finalEnriched.tags || [poi.category],
                      rating: finalEnriched.rating || "4.2",
                      numReviews: finalEnriched.numReviews || 45,
                      reviews: finalEnriched.reviews || []
                    };
                    setTripData(tripPayload);

                    setCachedPoiDetails(poi.id, {
                      wikiData: wikiPayload,
                      tripData: tripPayload,
                      audioScript: finalEnriched.audio_script || null,
                      audioScriptExtended: finalEnriched.audio_script_extended || null,
                      generatedText: finalDesc || null
                    });

                    uploadToSupabaseCache(
                      poi, 
                      guideMode, 
                      finalDesc || null, 
                      null, 
                      wikiPayload, 
                      tripPayload, 
                      parkingPayload
                    );
                  }
                } else {
                  clearStreamWatchdog();
                  setIsStreaming(false);
                }
              } catch (streamErr) {
                clearStreamWatchdog();
                console.error("Errore nello stream:", streamErr);
                if (active) {
                  setIsStreaming(false);
                  // Fallback elegante: mai lasciare la scheda "muta" o in
                  // caricamento eterno se Groq/DeepSeek vanno in timeout.
                  setWikiData(prev => {
                    if (prev?.extract && prev.extract.length > 30) return prev;
                    return {
                      ...(prev || {}),
                      extract: fastExtract || poi.description || `${poi.name || "Questo luogo"} è un punto di interesse registrato sulla mappa. I dettagli approfonditi non sono al momento disponibili: riprova tra qualche istante.`,
                    };
                  });
                }
              }


              // Emetti evento per aggiornare istantaneamente la mappa
              const updatedPoiData = {
                ...poi,
                description: finalEnriched.description_short || wikiPayload.extract.substring(0, 200),
                description_short: finalEnriched.description_short || wikiPayload.extract.substring(0, 200),
                description_long: finalEnriched.description_long || wikiPayload.extract,
                image_url: wikiPayload.thumbnail,
                photo_url: wikiPayload.thumbnail,
                is_gem: finalEnriched.is_gem || poi.is_gem,
                audioScript: finalEnriched.audio_script || null,
                audioScriptExtended: finalEnriched.audio_script_extended || null,
              };
              window.dispatchEvent(new CustomEvent('poi-enriched', { detail: updatedPoiData }));
            }
          } catch (e: any) {
            console.error("Centralized enrichment call failed:", e);
            if (active) {
              const isRejected = e.message?.includes("curatela") || e.message?.includes("rejected") || e.message?.includes("escluso") || e.message?.includes("non approvato");
              setWikiData({
                extract: isRejected 
                  ? "Questo luogo non presenta rilevanza storica o paesaggistica certificata ed è stato escluso dalla guida Elite."
                  : `${poi.name || "Questo luogo"} è un punto di interesse registrato sulla mappa.`,
                description: isRejected ? "Non Approvato" : (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
                thumbnail: undefined
              });
              setTripData({
                address: "",
                tags: [poi.category],
                rating: isRejected ? "0.0" : "4.2",
                numReviews: isRejected ? 0 : 45,
                reviews: []
              });
            }
          } finally {
            if (active) {
              setIsLoading(false);
              setIsStreaming(false);
            }
          }
          };

          const job = runEnrichment();
          enrichmentPromises.set(poiIdStr, job);
          try { await job; } finally { enrichmentPromises.delete(poiIdStr); }
        };

        callEnrichApi();
      }
    };

    loadPoiDetails();

    return () => {
      active = false;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [poi, visionText, guideMode, isOnline]);

  const toggleSpeech = async (forceRefresh = false) => {
    let textToSpeak = poi?.audioScript || generatedText || wikiData?.extract || poi?.description || (poi as any)?.spiegazione_audio;

    if (audioState.isPlaying && audioState.poiId === String(poi?.id)) {
      locationService.pauseGuideAudio();
      return;
    }

    // OFFLINE NATIVO: il flusso qui sotto (archivio acquisti + modale crediti)
    // richiede il server. Senza rete si passa dal plugin: Day Pass oppure
    // per-listen annotato nel registro locale (riconciliato al ritorno online),
    // voce di sistema dal pacchetto offline.
    if (!isOnline && Capacitor.isNativePlatform()) {
      // Audio del bundle già ACQUISTATO (file MP3 locale): si riproduce
      // gratis, senza toccare pass né registro spese.
      try {
        const { getOfflineAudioUrl } = await import('../lib/offlineStorage');
        const ownedUrl = await getOfflineAudioUrl(`${String(poi?.id)}_${localGuideMode}`);
        if (ownedUrl) {
          await locationService.playAudioUrl(ownedUrl, String(poi?.id), poi?.name);
          return;
        }
      } catch { /* nessun file locale: si prosegue con pass/per-listen */ }

      const res = await playOfflineGuide(String(poi?.id));
      if (!res?.ok) {
        if (res?.reason === 'insufficient_credits') {
          notify(
            `Crediti insufficienti per l'ascolto offline` +
            (typeof res.remaining === 'number' ? ` (disponibili: ${res.remaining})` : '') +
            `. Ricarica quando torni online, o attiva il Day Pass prima di partire.`
          );
        } else {
          notify('Audioguida non disponibile offline per questo luogo. Scarica il pacchetto della zona dalla tab Mappe Offline.');
        }
      }
      return;
    }

    // 🛡️ [ARCHIVIO ACQUISTI] - Verifica se l'utente ha già acquistato questo POI
    // NOTA: il vecchio ramo "language !== 'IT' → regenerate(true)" stava PRIMA
    // del paywall e riproduceva gratis per tutti gli utenti non italiani.
    // Ora la lingua è gestita DENTRO ogni percorso (sbloccato / pass / pagato).
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    try {
      const { getListeningHistory } = await import('../lib/listeningHistory');
      const { getOfflineAudioUrl } = await import('../lib/offlineStorage');
      const history = await getListeningHistory(currentUserId);
      const poiIdStr = String(poi?.id);

      // MP3 del bundle acquistato: è uno sblocco valido E la sorgente audio
      // preferita (voce premium, zero rete) — prima veniva ignorato e il
      // POI si ripagava/rigenerava ogni volta.
      const ownedUrl = await getOfflineAudioUrl(`${poiIdStr}_${localGuideMode}`).catch(() => null);

      // Le gemme NON sono gratuite: costano come ogni altra categoria.
      const alreadyUnlocked = history.some(h => String(h.poi_id) === poiIdStr) ||
                              poi?.isFromItinerary === true ||
                              !!ownedUrl;

      if (alreadyUnlocked) {
        console.log("[PoiDetailSheet] POI già sbloccato, avvio riproduzione...");
        if (ownedUrl) {
          await locationService.playAudioUrl(ownedUrl, poiIdStr, poi?.name);
          return;
        }
        if (language !== 'IT' && !generatedText) {
          await regenerateWithGemini(true, localGuideMode);
          return;
        }
        if (textToSpeak) {
          // Il personaggio selezionato nella scheda decide la voce TTS:
          // Nicky = femminile, Dante = maschile (in ogni lingua).
          await locationService.playAudio(textToSpeak, poi?.name, poi?.category, String(poi?.id), localGuideMode);
        }
        return;
      }

      // 🎫 DAY PASS: ascolto incluso, niente modale. Il contatore scala solo
      // se la riproduzione parte davvero (consumo dopo l'avvio, o prima del
      // regen non-IT che riproduce da solo).
      const { getDayPassState, consumeDayPassGuide } = await import('../services/dayPassService');
      const pass = await getDayPassState().catch(() => null);
      if (pass?.active) {
        if (language !== 'IT' && !generatedText) {
          if (await consumeDayPassGuide()) {
            await regenerateWithGemini(true, localGuideMode);
            return;
          }
          // Solo qui si prosegue verso l'acquisto: il pass è davvero
          // esaurito/scaduto in corsa.
        } else if (textToSpeak) {
          const okStart = await locationService.playAudio(textToSpeak, poi?.name, poi?.category, String(poi?.id), localGuideMode);
          if (okStart) {
            await consumeDayPassGuide();
          } else {
            // Errore tecnico di riproduzione: MAI il modale crediti a chi ha
            // il pass (il contatore non è stato consumato).
            notify(language === 'IT' ? 'Riproduzione non riuscita. Riprova.' : 'Playback failed. Please try again.');
          }
          return;
        } else {
          // Contenuti non ancora pronti: niente paywall a chi ha il pass.
          notify(language === 'IT'
            ? 'Contenuti in caricamento, riprova tra un attimo.'
            : 'Content still loading, try again in a moment.');
          return;
        }
      }

      console.log("[PoiDetailSheet] POI non acquistato, mostro modale crediti...");
      const bal = await getWalletBalance(currentUserId);
      setCurrentBalance(bal.total);
      setPendingAudioTask({ text: textToSpeak, force: forceRefresh });
      setShowCreditModal(true);
    } catch (e) {
      console.warn("[PoiDetailSheet] Errore verifica crediti:", e);
      // Fail-closed: prima un errore qui faceva partire l'audio GRATIS,
      // bypassando il pagamento. Ora si mostra comunque il modale: è la
      // conferma (con consumeCredits) il vero cancello.
      try {
        const bal = await getWalletBalance(currentUserId);
        setCurrentBalance(bal.total);
      } catch { /* saldo non disponibile: il modale mostra l'ultimo noto */ }
      setPendingAudioTask({ text: textToSpeak, force: forceRefresh });
      setShowCreditModal(true);
    }
  };

  const regenerateWithGemini = async (autoPlay: boolean = true, forceMode?: "nicky" | "dante") => {
    if (!poi?.id) return;
    if (!wikiData?.extract || isRegenerating) return;

    const modeToUse = forceMode || localGuideMode;
    const isDeepDive = !!generatedText; // "Chiedi di più": mai cachato (per policy)

    setIsRegenerating(true);
    try {
      // ── SUPABASE-FIRST: testo audioguida già generato per (poi, lingua,
      // personaggio)? Riusalo all'istante, zero LLM. Solo per la prima
      // narrazione: l'approfondimento è sempre nuovo.
      if (!isDeepDive) {
        try {
          const cachedGuide = await getAudioguide(String(poi.id), String(language), modeToUse);
          if (cachedGuide?.audio_text) {
            console.log("[DetailSheet] Audioguida da cache poi_audioguides:", poi?.name);
            setGeneratedText(cachedGuide.audio_text);
            if (autoPlay) {
              await locationService.playAudio(cachedGuide.audio_text, poi?.name, poi?.category, String(poi?.id), modeToUse);
            }
            return;
          }
        } catch (cacheErr) {
          console.debug("[DetailSheet] Lettura cache audioguida saltata:", cacheErr);
        }
      }

      const locationName = tripData?.address?.split(",").slice(-3, -1).join(",").trim() || "";
      const res = await fetchWithTimeout("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: wikiData.extract,
          poiName: poi?.name,
          location: locationName || undefined,
          mode: modeToUse,
          previousText: generatedText || undefined,
          lang: language,
          poi_id: poi.id
        }),
      }, 30000);

      if (!res.ok) throw new Error("Regeneration failed");
      const data = await res.json();

      if (data.result) {
        setGeneratedText(data.result);
        // Persisti per il prossimo utente/apertura (chiave poi+lingua+personaggio).
        // Prima assicuriamo che il POI stesso esista in shared_pois (fonti
        // terze OSM/FSQ/Google): crowdsourcing per i visitatori successivi.
        if (!isDeepDive) {
          ensureSharedPoi({
            id: String(poi.id),
            name: poi.name || "",
            lat: poi.lat,
            lon: poi.lon,
            category: poi.category,
            description_short: poi.description_short || null,
            description_long: wikiData?.extract || null,
          }).then(() => {
            upsertAudioguide(String(poi.id), String(language), modeToUse, data.result).catch(() => {});
          }).catch(() => {});
        }
        if (autoPlay) {
          await locationService.playAudio(data.result, poi?.name, poi?.category, String(poi?.id), modeToUse);
        }
      } else {
        setGeneratedText(wikiData?.extract || "Descrizione non disponibile.");
      }
    } catch (error: any) {
      console.error("Regeneration error:", error);
      if (autoPlay) {
        // Azione esplicita dell'utente: avvisiamo
        notify("Si è verificato un errore durante la rigenerazione. Riprova tra qualche istante.");
      } else {
        // Auto-rigenerazione in background: fallback elegante sul testo della
        // scheda, così il blocco audioguida non resta mai in caricamento.
        setGeneratedText(prev => prev || wikiData?.extract || "Descrizione non disponibile al momento.");
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      WipBackgroundAudio.setSpeed({ speed: audioState.playbackSpeed }).catch(() => {});
    }
  }, [audioState.playbackSpeed]);

  // Auto-translate if language is not IT or generate Nicky/Dante default if missing
  const autoRegenAttemptedRef = useRef<string>("");
  useEffect(() => {
    if (wikiData?.extract && !generatedText && !isRegenerating && !isLoading && !isStreaming && wikiData.extract.length > 50) {
       // Se il DB ha già il copione audio (audio_script) e siamo in italiano,
       // non serve rigenerare nulla: il blocco audioguida lo mostra subito.
       if (language === 'IT' && (poi as any)?.audioScript) return;
       // UNA sola auto-rigenerazione per combinazione POI/lingua/personaggio:
       // prima, se /api/regenerate falliva, l'effect ripartiva all'infinito
       // (spinner "Caricamento in corso..." perenne + alert a raffica).
       const attemptKey = `${poi?.id}_${language}_${localGuideMode}`;
       if (autoRegenAttemptedRef.current === attemptKey) return;
       autoRegenAttemptedRef.current = attemptKey;
       console.log("[DetailSheet] Triggering auto-regeneration for:", poi?.name);
       regenerateWithGemini(false, localGuideMode);
    }
  }, [wikiData?.extract, generatedText, isRegenerating, isLoading, isStreaming, language, localGuideMode]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSaveOfflineAudio = async () => {
    // Offline audio save handled globally if needed
    notify("Funzione offline aggiornata per gestione globale.");
  };

  const skipTime = (amount: number) => {
    locationService.seek(amount);
  };

  const extractSpecialTags = (
    text: string,
    existingTags: string[] = [],
  ): string[] => {
    // Preserve existing tags but normalize to capitalized version if matched
    const foundTags = new Set<string>();
    const content = text.toLowerCase();

    const tagRules = [
      {
        tag: "Vegetariano",
        keywords: ["vegetaria", "veggie", "herbivore", "senza carne"],
      },
      { tag: "Vegano", keywords: ["vegan", "plant-based"] },
      {
        tag: "Senza Glutine",
        keywords: [
          "gluten free",
          "senza glutine",
          "celia",
          "no glutine",
          "gluten-free",
        ],
      },
      {
        tag: "Vista Panoramica",
        keywords: [
          "vista",
          "panoram",
          "view",
          "terrazza",
          "belvedere",
          "scenico",
          "outlook",
          "rooftop",
          "panorama",
          "landscape",
          "tramonto",
          "altezza",
        ],
      },
      {
        tag: "All'aperto",
        keywords: [
          "aperto",
          "outdoor",
          "giardino",
          "dehors",
          "cortile",
          "patio",
        ],
      },
      {
        tag: "Pet Friendly",
        keywords: [
          "cane",
          "cani",
          "pets",
          "animali",
          "dog friendly",
          "ammessi animali",
          "cucciolo",
          "fido",
        ],
      },
      {
        tag: "Romantico",
        keywords: [
          "romantico",
          "lume di candela",
          "candela",
          "coppia",
          "intim",
          "love",
          "san valentino",
          "atmosfera",
          "charme",
        ],
      },
      {
        tag: "Family Friendly",
        keywords: [
          "bambini",
          "kids",
          "famigl",
          "seggiolon",
          "area giochi",
          "gioco",
          "parco giochi",
          "baby",
          "per famiglie",
        ],
      },
      {
        tag: "Economico",
        keywords: [
          "economico",
          "cheap",
          "prezzo basso",
          "alla mano",
          "convenient",
        ],
      },
      {
        tag: "Elegante",
        keywords: ["elegante", "chic", "fancy", "formale", "raffinat", "lusso"],
      },
      {
        tag: "Musica Live",
        keywords: [
          "live music",
          "musica dal vivo",
          "concerto",
          "band",
          "dj set",
        ],
      },
      {
        tag: "Artigianale",
        keywords: ["artigianal", "fatto a mano", "handmade", "locali"],
      },
      {
        tag: "Storico",
        keywords: [
          "storia",
          "storico",
          "heritage",
          "antico",
          "secolo",
          "monumento",
        ],
      },
      {
        tag: "Enoteca",
        keywords: ["enoteca", "vini", "wine", "cantina", "sommelier"],
      },
      {
        tag: "Bio / Green",
        keywords: [
          "biologico",
          "organic",
          "sostenibile",
          "filiera corta",
          "km 0",
        ],
      },
    ];

    // Add existing tags if they match our rules or just add them back
    existingTags.forEach((t) => {
      const rule = tagRules.find(
        (r) => r.tag.toLowerCase() === t.toLowerCase(),
      );
      if (rule) foundTags.add(rule.tag);
      else if (t.length > 3)
        foundTags.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
    });

    tagRules.forEach((rule) => {
      if (rule.keywords.some((k) => content.includes(k))) {
        foundTags.add(rule.tag);
      }
    });

    return Array.from(foundTags).slice(0, 8); // Limit to 8 most relevant
  };

  const fetchPlacesData = async (poi: any) => {
    if (
      typeof poi.lat !== "number" ||
      typeof poi.lon !== "number" ||
      isNaN(poi.lat) ||
      isNaN(poi.lon)
    ) {
      console.error(
        "Invalid coordinates in fetchPlacesData:",
        poi.lat,
        poi.lon,
      );
      return;
    }
    setIsLoading(true);

    let extract = "";
    let thumbnail = undefined;
    let description = "Punto di interesse";
    let loaded = false;
    let pageUrl = "";

    try {
      const getCityName = async (lat: number, lon: number) => {
        try {
          const res = await fetch(
            `/api/nominatim/reverse?lat=${lat}&lon=${lon}`,
          );
          if (res.ok) {
            const data = await res.json();
            return (
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              ""
            );
          }
        } catch {}
        return "";
      };

      // 1. Google Places Details (If it has a valid Google Place ID, or we fall back to text search)
      let p: any = null;
      if (poi.id && poi.id.toString().startsWith("ChI")) {
        const detailRes = await fetch(`/api/placedetails?place_id=${poi.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.result) {
            p = detailData.result;
          }
        }
      } else if (
        !poi.id?.toString().startsWith("ta-") &&
        !poi.id?.toString().startsWith("fsq-")
      ) {
        const cityName = await getCityName(poi.lat, poi.lon);
        const searchQuery = `${poi.name} ${cityName || ""}`;
        const textRes = await fetch(
          `/api/placetextsearch?query=${encodeURIComponent(searchQuery)}`,
        );
        if (textRes.ok) {
          const data = await textRes.json();
          if (data.results && data.results.length > 0) {
            const placeId = data.results[0].place_id;
            const detailRes = await fetch(
              `/api/placedetails?place_id=${placeId}`,
            );
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              if (detailData.result) p = detailData.result;
            }
          }
        }
      }

      if (p) {
        const types = p.types || [];
        let specificType =
          (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo");

        if (poi.category === "locali") {
          if (types.includes("restaurant")) specificType = "Ristorante";
          if (types.includes("seafood_restaurant"))
            specificType = "Ristorante di Pesce";
          if (types.includes("steak_house"))
            specificType = "Ristorante di Carne";
          if (
            types.includes("pizzeria") ||
            p.name?.toLowerCase().includes("pizzeria")
          )
            specificType = "Pizzeria";
          else if (
            p.name?.toLowerCase().includes("trattoria") ||
            p.name?.toLowerCase().includes("osteria")
          )
            specificType = "Trattoria / Osteria";
          else if (types.includes("cafe")) specificType = "Bar / Caffè";
          else if (types.includes("bar")) specificType = "Bar / Enoteca";
          else if (types.includes("winery")) specificType = "Enoteca";
          else if (types.includes("meal_takeaway"))
            specificType = "Gastronomia";
        } else {
          // Attrazioni / Cultura
          if (types.includes("church") || types.includes("place_of_worship"))
            specificType = "Chiesa / Luogo di Culto";
          if (types.includes("museum")) specificType = "Museo";
          if (types.includes("art_gallery")) specificType = "Galleria d'Arte";
          if (types.includes("tourist_attraction"))
            specificType = "Attrazione Turistica";
          if (types.includes("park")) specificType = "Parco / Area Naturale";
          if (types.includes("castle")) specificType = "Castello";
          if (types.includes("monument")) specificType = "Monumento Storico";
        }

        description = specificType;
        pageUrl = p.website || pageUrl;

        const italianTypes = types
          .map((t: string) => {
            switch (t) {
              case "restaurant":
                return "Ristorante";
              case "cafe":
                return "Caffè";
              case "bar":
                return "Bar";
              case "meal_takeaway":
                return "Gastronomia d'asporto";
              case "seafood_restaurant":
                return "Specialità di pesce";
              case "steak_house":
                return "Specialità di carne";
              case "pizzeria":
                return "Pizzeria";
              case "bakery":
                return "Pasticceria/Panetteria";
              case "liquor_store":
                return "Enoteca";
              case "wine_bar":
                return "Enoteca / Wine Bar";
              case "pub":
                return "Pub";
              case "night_club":
                return "Discoteca / Club";
              default:
                return null;
            }
          })
          .filter(Boolean);

        const reviews = p.reviews
          ? p.reviews.slice(0, 3).map((r: any) => ({
              author: r.author_name,
              text: r.text,
              rating: r.rating,
            }))
          : [];

        let baseDesc = p.editorial_summary?.overview || "";
        if (poi.category === "locali") {
          const uniqueTypes = Array.from(new Set(italianTypes));
          const typeStr =
            uniqueTypes.length > 0
              ? (uniqueTypes as string[]).join(" e ")
              : specificType;
          const defaultStart = `Questo locale si posiziona come ${typeStr.toLowerCase()} nel cuore della zona.`;
          baseDesc = baseDesc || defaultStart;

          const revTexts = reviews
            .map((r: { text: string }) => r.text)
            .filter(Boolean);
          const ambs = [
            "accogliente",
            "elegante",
            "informale",
            "romantico",
            "rustico",
            "moderno",
            "tranquillo",
            "vivace",
            "caratteristico",
            "curato",
            "storico",
          ];
          let foundAmbs = ambs.filter((a) =>
            revTexts.some((r: string) => r.toLowerCase().includes(a)),
          );
          if (foundAmbs.length > 0)
            baseDesc += ` L'ambiente è frequentemente descritto dai clienti come ${foundAmbs.join(", ")}.`;

          const cibi = [
            "pizza",
            "pesce",
            "carne",
            "pasta",
            "dolci",
            "vino",
            "cocktail",
            "aperitivo",
            "tradizionale",
            "creativo",
            "fatto in casa",
            "freschissimo",
            "abbondante",
          ];
          let foundCibi = cibi.filter((a) =>
            revTexts.some((r: string) => r.toLowerCase().includes(a)),
          );
          if (foundCibi.length > 0)
            baseDesc += ` Tra le specialità più apprezzate spiccano: ${foundCibi.join(", ")}.`;

          if (
            p.rating &&
            p.user_ratings_total &&
            !baseDesc.includes(p.rating.toString())
          ) {
            baseDesc += ` Il locale vanta un eccellente punteggio di ${p.rating} su ${p.user_ratings_total} recensioni.`;
          }
        } else {
          baseDesc =
            baseDesc ||
            `Una gemma situata in ${p.formatted_address || "questa zona"}.`;
        }
        extract = baseDesc;

        let tags: string[] = [];
        if (types.includes("seafood_restaurant")) tags.push("Pesce");
        if (types.includes("steak_house")) tags.push("Carne");

        // Combine all text for analysis
        const combinedText = `${extract} ${reviews.map((r: any) => r.text).join(" ")} ${p.name}`;
        tags = extractSpecialTags(combinedText, tags);

        if (p.photos && p.photos.length > 0) {
          thumbnail = `${(window as any).Capacitor || window.location.protocol === 'file:' ? 'https://itainta.vercel.app' : ''}/api/photo?ref=${p.photos[0].photo_reference}`;
        } else if (poi.photo_reference) {
          thumbnail = `${(window as any).Capacitor || window.location.protocol === 'file:' ? 'https://itainta.vercel.app' : ''}/api/photo?ref=${poi.photo_reference}`;
        }

        setTripData({
          rating: p.rating ? `${p.rating} (Google)` : null,
          numReviews: p.user_ratings_total,
          address: p.formatted_address,
          phone: p.formatted_phone_number,
          tags,
          reviews,
        });
        loaded = true;
      }

      // 2. Fallback Foursquare
      if (!loaded) {
        const FSQ_KEY = (import.meta as any).env.VITE_FOURSQUARE_API_KEY;
        if (FSQ_KEY) {
          const fsqRes = await fetch(
            `/api/fsq/search?lat=${poi.lat}&lon=${poi.lon}&query=${encodeURIComponent(poi.name || "")}`,
          );
          if (fsqRes.ok) {
            const fsqData = await fsqRes.json();
            const place = fsqData.results?.[0];
            if (place) {
              const fsqId = place.fsq_id;
              const detailsRes = await fetch(
                `/api/fsq/details?fsq_id=${fsqId}`,
              );
              if (detailsRes.ok) {
                const details = await detailsRes.json();
                description = details.categories?.[0]?.name || description;
                const descLower = description.toLowerCase();
                if (descLower.includes("pizza")) description = "Pizzeria";
                else if (
                  descLower.includes("trattoria") ||
                  descLower.includes("osteria")
                )
                  description = "Trattoria / Osteria";
                else if (descLower.includes("seafood"))
                  description = "Ristorante di Pesce";
                else if (
                  descLower.includes("steak") ||
                  descLower.includes("bbq")
                )
                  description = "Ristorante di Carne";

                pageUrl = details.website || pageUrl;
                const locality =
                  details.location?.locality ||
                  details.location?.city ||
                  "locali";
                extract =
                  details.description ||
                  `Un locale in zona ${locality}: ${place.name}.`;

                let tags: string[] =
                  details.categories?.map((c: any) => c.name) || [];
                const combinedText = `${extract} ${place.name} ${description}`;
                tags = extractSpecialTags(combinedText, tags);

                if (details.photos?.length > 0) {
                  thumbnail = `${details.photos[0].prefix}original${details.photos[0].suffix}`;
                } else if (poi.photo_reference) {
                  thumbnail = `${(window as any).Capacitor || window.location.protocol === 'file:' ? 'https://itainta.vercel.app' : ''}/api/photo?ref=${poi.photo_reference}`;
                }

                setTripData({
                  rating: details.rating
                    ? `${(details.rating / 2).toFixed(1)} (Foursquare)`
                    : null,
                  address: details.location?.formatted_address,
                  phone: details.tel,
                  tags,
                  reviews: [],
                });
                loaded = true;
              }
            }
          }
        }
      }

      // 3. Fallback TripAdvisor API
      const TRIPADVISOR_KEY = "B054515DAED943B9884DD6FB4A73F4B1";
      if (!loaded) {
        const searchRes = await fetch(
          `/api/trip/search?searchQuery=${encodeURIComponent(poi.name || "")}&latLong=${poi.lat},${poi.lon}`,
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const locationId = searchData.data?.[0]?.location_id;

          if (locationId) {
            const detailsRes = await fetch(
              `/api/trip/details?locationId=${locationId}`,
            );
            const detailsData = detailsRes.ok ? await detailsRes.json() : {};

            const photosRes = await fetch(
              `/api/trip/photos?locationId=${locationId}`,
            );
            const photosData = photosRes.ok
              ? await photosRes.json()
              : { data: [] };

            const reviewsRes = await fetch(
              `/api/trip/reviews?locationId=${locationId}`,
            );
            const reviewsData = reviewsRes.ok
              ? await reviewsRes.json()
              : { data: [] };

            const reviews =
              reviewsData.data?.slice(0, 3).map((r: any) => ({
                text: r.text,
                rating: r.rating,
                author: r.user?.username || "Utente",
              })) || [];

            let baseDesc = detailsData.description || "";
            if (poi.category === "locali") {
              const typeStr = description;
              const defaultStart = `Questo locale si posiziona come ${typeStr.toLowerCase()} nel cuore di ${detailsData.address_obj?.city || "questa zona"}.`;
              baseDesc = baseDesc || defaultStart;

              const revTexts = reviews.map((r: any) => r.text).filter(Boolean);
              const ambs = [
                "accogliente",
                "elegante",
                "informale",
                "romantico",
                "rustico",
                "moderno",
                "tranquillo",
                "vivace",
                "caratteristico",
                "curato",
                "storico",
              ];
              let foundAmbs = ambs.filter((a: string) =>
                revTexts.some((r: string) => r.toLowerCase().includes(a)),
              );
              if (foundAmbs.length > 0)
                baseDesc += ` L'ambiente è descritto dai clienti come ${foundAmbs.join(", ")}.`;

              const cibi = [
                "pizza",
                "pesce",
                "carne",
                "pasta",
                "dolci",
                "vino",
                "cocktail",
                "aperitivo",
                "tradizionale",
                "creativo",
                "fatto in casa",
                "freschissimo",
                "abbondante",
              ];
              let foundCibi = cibi.filter((a: string) =>
                revTexts.some((r: string) => r.toLowerCase().includes(a)),
              );
              if (foundCibi.length > 0)
                baseDesc += ` Tra le specialità apprezzate: ${foundCibi.join(", ")}.`;

              if (
                detailsData.rating &&
                detailsData.num_reviews &&
                !baseDesc.includes(detailsData.rating.toString())
              ) {
                baseDesc += ` Vanta un punteggio di ${detailsData.rating} su ${detailsData.num_reviews} recensioni.`;
              }
            } else {
              if (!baseDesc && reviews.length > 0) {
                baseDesc = `Recensione in evidenza: "${reviews[0].text}"`;
              } else if (!baseDesc) {
                baseDesc = `${poi.name || "Questo locale"} è una meta apprezzata a ${detailsData.address_obj?.city || "destinazione"}.`;
              }
            }
            extract = baseDesc;

            description =
              detailsData.subcategory?.[0]?.localized_name ||
              detailsData.category?.localized_name ||
              "Locale";
            const descLower = description.toLowerCase();
            if (descLower.includes("pizza")) description = "Pizzeria";
            else if (
              descLower.includes("trattoria") ||
              descLower.includes("osteria")
            )
              description = "Trattoria / Osteria";
            else if (
              descLower.includes("pesce") ||
              descLower.includes("seafood")
            )
              description = "Ristorante di Pesce";
            else if (descLower.includes("carne") || descLower.includes("steak"))
              description = "Ristorante di Carne";

            thumbnail =
              photosData.data?.[0]?.images?.large?.url ||
              photosData.data?.[0]?.images?.original?.url ||
              thumbnail;
            pageUrl = detailsData.web_url || pageUrl;

            let tags: string[] =
              detailsData.cuisine?.map((c: any) => c.localized_name) || [];
            const combinedText = `${extract} ${reviews.map((r: any) => r.text).join(" ")} ${poi.name}`;
            tags = extractSpecialTags(combinedText, tags);

            setTripData({
              rating: detailsData.rating
                ? `${detailsData.rating} (TripAdvisor)`
                : null,
              numReviews: detailsData.num_reviews,
              reviews,
              address: detailsData.address_obj?.address_string,
              phone: detailsData.phone,
              tags,
            });
            loaded = true;
          }
        }
      }

      if (!loaded) {
        extract = `${poi.name || "Questo locale"} offre ottime specialità in zona. Al momento non abbiamo dettagli estesi da nessuna fonte online.`;
        if (description === "Punto di interesse" || !description) {
          description =
            (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo");
        }
      }

      // If generic description, enrich with subcategory specific details if available
      if ((!extract || extract.includes("offre ottime specialità") || extract.includes("punto di interesse")) && poi.subCategory && SUBCATEGORY_DETAILS[poi.subCategory]) {
        extract = SUBCATEGORY_DETAILS[poi.subCategory].extract;
        description = SUBCATEGORY_DETAILS[poi.subCategory].description;
      }

      setWikiData({
        extract,
        description:
          description !== "Punto di interesse" && description
            ? description
            : (poi.category ? ((poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")) : "Luogo"),
        thumbnail,
        pageUrl,
      });
    } catch (error) {
      console.error("Fetch chain error:", error);
      setWikiData({
        extract: `${poi.name || "Questo locale"} offre ottime specialità. Si è verificato un errore durante il caricamento dei dettagli.`,
        description: "Ristorante/Locale",
        thumbnail: thumbnail,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWikiData = async (title: string, poiItem: any) => {
    if (
      typeof poiItem.lat !== "number" ||
      typeof poiItem.lon !== "number" ||
      isNaN(poiItem.lat) ||
      isNaN(poiItem.lon)
    ) {
      console.error(
        "Invalid coordinates in fetchWikiData:",
        poiItem.lat,
        poiItem.lon,
      );
      return;
    }
    setIsLoading(true);
    let extract = "";
    let thumbnail = "";
    let description = "";
    let pageUrl = "";
    let cityName = "";

    try {
      // Try to get city name for better search precision
      if (poiItem.lat && poiItem.lon) {
        try {
          const geoRes = await fetch(
            `/api/nominatim/reverse?lat=${poiItem.lat}&lon=${poiItem.lon}`,
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            cityName =
              geoData.address?.city ||
              geoData.address?.town ||
              geoData.address?.village ||
              "";
          }
        } catch (e) {
          console.error("Reverse geocode error in Wiki search:", e);
        }
      }

      let pageTitle = "";

      // 1. Wikipedia Text Search (Primary)
      const searchQuery = cityName ? `${title} ${cityName}` : title;
      try {
        const searchRes = await fetch(
          `/api/wiki/search?srsearch=${encodeURIComponent(searchQuery)}`,
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          pageTitle = searchData.query?.search?.[0]?.title;
        }

        if (!pageTitle && title) {
          const fbRes = await fetch(
            `/api/wiki/search?srsearch=${encodeURIComponent(title)}`,
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            pageTitle = fbData.query?.search?.[0]?.title;
          }
        }
      } catch (e) {
        console.error("Wiki search error:", e);
      }

      if (pageTitle) {
        const wikiRes = await fetch(
          `/api/wiki/summary?title=${encodeURIComponent(pageTitle)}`,
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract && wikiData.title !== "Not found.") {
            extract = wikiData.extract;
            thumbnail =
              wikiData.originalimage?.source ||
              wikiData.thumbnail?.source ||
              "";
            description = wikiData.description || "";
            pageUrl = wikiData.content_urls?.desktop?.page || "";

            // Check if the extract is about a person but the POI is a monument
            const isPerson =
              wikiData.type === "standard" &&
              (description?.toLowerCase().includes("sacerdote") ||
                description?.toLowerCase().includes("poeta") ||
                description?.toLowerCase().includes("scultore") ||
                description?.toLowerCase().includes("personaggio"));
            const isMonument =
              title.toLowerCase().includes("monumento") ||
              title.toLowerCase().includes("statua");

            if (isPerson && isMonument) {
              extract = `Questo monumento è dedicato a ${pageTitle}, ${description}. Situato a ${cityName || "questa località"}, commemora la figura di ${pageTitle}. ${extract.substring(0, 200)}...`;
            }

            setWikiData({
              extract,
              thumbnail,
              description:
                description ||
                (poiItem.category ? ((poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")) : "Luogo"),
              pageUrl,
            });
            setCachedPoiDetails(poiItem.id, {
              wikiData: {
                extract,
                thumbnail,
                description:
                  description ||
                  (poiItem.category ? ((poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")) : "Luogo"),
                pageUrl,
              },
            });
          }
        }
      }

      // 2. Google Places Supplement (for image, description, rating, website, phone)
      try {
        const textRes = await fetch(
          `/api/placetextsearch?query=${encodeURIComponent(searchQuery)}`,
        );
        if (textRes.ok) {
          const data = await textRes.json();
          if (data.results && data.results.length > 0) {
            const placeId = data.results[0].place_id;
            const detailRes = await fetch(
              `/api/placedetails?place_id=${placeId}`,
            );
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const p = detailData.result;
              if (p) {
                if (!thumbnail && p.photos && p.photos.length > 0) {
                  thumbnail = `/api/photo?ref=${p.photos[0].photo_reference}`;
                }
                if (!extract && p.editorial_summary?.overview) {
                  extract = p.editorial_summary.overview;
                }
                if (!description && p.types && p.types.length > 0) {
                  description = p.types[0];
                }
                if (p.website && (!pageUrl || pageUrl === "#")) {
                  pageUrl = p.website;
                }
                setTripData({
                  rating: p.rating ? `${p.rating} (Google)` : null,
                  numReviews: p.user_ratings_total,
                  address: p.formatted_address,
                  phone: p.formatted_phone_number,
                  tags: p.types,
                  reviews: p.reviews
                    ? p.reviews.slice(0, 3).map((r: any) => ({
                        author: r.author_name,
                        text: r.text,
                        rating: r.rating,
                      }))
                    : [],
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Google Places fallback error in details:", err);
      }

      // 3. Wikidata API (Last Fallback)
      if (!extract || !thumbnail) {
        const wdSearchRes = await fetch(
          `/api/wikidata/search?search=${encodeURIComponent(title)}`,
        );
        if (wdSearchRes.ok) {
          const wdSearchData = await wdSearchRes.json();
          const wdId = wdSearchData.search?.[0]?.id;
          if (wdId) {
            const wdEntityRes = await fetch(
              `/api/wikidata/entities?ids=${wdId}`,
            );
            if (wdEntityRes.ok) {
              const wdEntityData = await wdEntityRes.json();
              const entity = wdEntityData.entities?.[wdId];
              if (entity) {
                description = description || entity.descriptions?.it?.value;
                if (!extract) {
                  extract = `${title} è un ${description || "luogo di interesse"}. ${entity.labels?.it?.value || ""}`;
                }
                pageUrl = pageUrl || `https://www.wikidata.org/wiki/${wdId}`;

                const imageClaim =
                  entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
                if (imageClaim && !thumbnail) {
                  thumbnail = `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(imageClaim.replace(/ /g, "_"))}&width=800`;
                }
              }
            }
          }
        }
      }

      // Default fallback
      if (!extract) {
        extract = `${title || "Questo luogo"} è ${poiItem.name ? "un punto di interesse" : "una meta interessante"}.`;
      }

      // If generic description, enrich with subcategory specific details if available
      if ((!extract || extract.includes("punto di interesse") || extract.includes("meta interessante")) && poiItem.subCategory && SUBCATEGORY_DETAILS[poiItem.subCategory]) {
        extract = SUBCATEGORY_DETAILS[poiItem.subCategory].extract;
        description = SUBCATEGORY_DETAILS[poiItem.subCategory].description;
      }

      const tags = extractSpecialTags(
        extract,
        poiItem.category === "chiese"
          ? ["Religione", "Architettura"]
          : ["Cultura", "Storia"],
      );

      let finalDescription =
        description ||
        (poiItem.category ? ((poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")) : "Luogo");
      if (finalDescription === "Punto di interesse") {
        finalDescription =
          (poiItem.category ? ((poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")) : "Luogo");
      }

      setWikiData({
        extract,
        thumbnail,
        description: finalDescription,
        pageUrl,
      });

      setCachedPoiDetails(poiItem.id, {
        wikiData: {
          extract,
          thumbnail,
          description: finalDescription,
          pageUrl,
        },
      });

      // Salva silenziosamente nel database i dati ricchi trovati (immagine e descrizione breve), 
      // in modo che il PIN sulla mappa sia già pronto per il prossimo utente.
      if (poiItem.id) {
        supabase.from('shared_pois').update({
          description_ai: extract,
          image_url: thumbnail,
          description_short: finalDescription
        }).eq('id', poiItem.id).then(({error}) => {
          if (error) console.debug("Error updating shared_pois cache:", error);
          else console.log("✅ POI image and summary saved to shared_pois for next user!", title);
        });
      }

      setTripData((prev) => {
        let newRating = prev?.rating;
        let newReviews = prev?.numReviews;

        if (!newRating) {
          const idStr = poiItem.id?.toString() || title || "0";
          let hash = 0;
          for (let i = 0; i < idStr.length; i++) {
            hash = (hash << 5) - hash + idStr.charCodeAt(i);
            hash |= 0;
          }
          newRating = (3.8 + Math.abs(hash % 12) / 10).toFixed(1);
          newReviews = Math.abs(hash % 450) + 50;
        }

        return {
          address: prev?.address || cityName,
          tags: prev?.tags?.length ? prev.tags : tags,
          rating: newRating,
          numReviews: newReviews,
          reviews: prev?.reviews,
        };
      });
    } catch (error) {
      console.error("All fetch APIs failed:", error);
      setWikiData({
        extract: `${title || "Questo luogo"} è un punto di interesse registrato sulla mappa, ma purtroppo si è verificato un errore nel caricamento dei dettagli.`,
        description:
          (poiItem.category ? ((poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")) : "Luogo"),
        thumbnail: undefined,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}
      <AnimatePresence>
        {poi && (
      <motion.div
        key={`poi-${poi.id}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, { offset, velocity }) => {
          if (offset.y > 100 || velocity.y > 500) {
            onClose();
          }
        }}
        className="absolute bottom-0 left-0 w-full z-[2000] bg-[#f8f5f0] rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[85dvh] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Notch / Handle */}
        <div className="w-full flex justify-center py-3">
          <div className="w-12 h-1.5 bg-on-surface-variant/20 rounded-full" />
        </div>

        <div className="overflow-y-auto no-scrollbar">
          <div className="relative h-[240px] px-4">
            <div className="w-full h-full rounded-2xl overflow-hidden relative group">
              <AttractionImage
                src={poi?.image_url || poi?.photo_url || wikiData?.thumbnail}
                alt={poi.name || "Attrazione"}
                category={poi.category}
                className="w-full h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={openChatWithWip}
                  className="p-2.5 bg-blue-600/80 backdrop-blur-md rounded-full text-white hover:bg-blue-700 transition-all shadow-lg active:scale-90"
                  title="Chat con Wip"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
                <button
                  onClick={onToggleSave}
                  className={`p-2.5 backdrop-blur-md rounded-full transition-all shadow-lg active:scale-90 ${
                    isSaved
                      ? "bg-secondary text-white"
                      : "bg-black/30 text-white hover:bg-black/50"
                  }`}
                >
                  <Star
                    className={`w-5 h-5 ${isSaved ? "fill-current" : ""}`}
                  />
                </button>
                <button
                  onClick={onClose}
                  className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors shadow-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="absolute top-4 left-4 flex gap-2">
                <span className="px-3 py-1 bg-primary/80 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-md">
                  {poi.category}
                </span>
              </div>

              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1 drop-shadow-md">
                  {tripData?.address?.split(",").slice(-3, -2).join("") || ""}{" "}
                  {wikiData?.description ? `• ${wikiData.description}` : ""}
                </p>
                <h1 className="text-2xl font-black text-white leading-tight drop-shadow-lg">
                  {poi.name}
                </h1>
              </div>
            </div>
          </div>

          <div className="px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            {/* Contatti strutturati (telefono / sito / orari) da OSM+Wikidata,
                resi come bottoni d'azione — SOLO per le categorie turistico-
                culturali (musei, monumenti, chiese, archeo, teatri, attrazioni),
                MAI per bar/ristoranti/negozi/utilità. Il filtro è nel componente. */}
            <PoiContactButtons
              poi={{
                id: String(poi.id),
                lat: poi.lat,
                lon: poi.lon,
                name: poi.name,
                category: poi.category,
                poiType: (poi as any).poi_type || (poi as any).poiType,
                isGem: (poi as any).is_gem ?? (poi as any).isGem,
                wikidata: (poi as any).wikidata,
                contact_phone: (poi as any).contact_phone,
                contact_website: (poi as any).contact_website,
                opening_hours_json: (poi as any).opening_hours_json,
              }}
              language={language}
            />
            {/* New Speciality Tags Section - Expanded for Romantico, Vista, Pet, Family */}
            {tripData?.tags && tripData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2.5 mb-6">
                {tripData.tags.map((tag, idx) => {
                  const tagLower = tag.toLowerCase();
                  let emoji = "✨ ";
                  let isHighPriority = false;
                  let bgClass = "bg-white border-emerald-100 text-emerald-800";

                  if (tagLower.includes("vegetariano")) emoji = "🥗 ";
                  if (tagLower.includes("vegano")) emoji = "🌿 ";
                  if (tagLower.includes("senza glutine")) emoji = "🌾 ";

                  if (tagLower.includes("panoramica")) {
                    emoji = "🌅 ";
                    isHighPriority = true;
                    bgClass = "bg-blue-50 border-blue-200 text-blue-900";
                  }
                  if (tagLower.includes("pet friendly")) {
                    emoji = "🐾 ";
                    isHighPriority = true;
                    bgClass = "bg-amber-50 border-amber-200 text-amber-900";
                  }
                  if (tagLower.includes("romantico")) {
                    emoji = "🕯️ ";
                    isHighPriority = true;
                    bgClass = "bg-rose-50 border-rose-200 text-rose-900";
                  }
                  if (tagLower.includes("family")) {
                    emoji = "👨‍👩‍👧 ";
                    isHighPriority = true;
                    bgClass = "bg-indigo-50 border-indigo-200 text-indigo-900";
                  }

                  if (tagLower.includes("all'aperto")) emoji = "🌳 ";
                  if (tagLower.includes("musica")) emoji = "🎸 ";
                  if (tagLower.includes("artigianale")) emoji = "🎨 ";
                  if (
                    tagLower.includes("storia") ||
                    tagLower.includes("cultura") ||
                    tagLower.includes("storico")
                  )
                    emoji = "🏛️ ";
                  if (tagLower.includes("enoteca")) emoji = "🍷 ";
                  if (tagLower.includes("bio")) emoji = "♻️ ";
                  if (tagLower.includes("economico")) emoji = "💰 ";
                  if (tagLower.includes("elegante")) emoji = "💎 ";

                  return (
                    <motion.span
                      key={idx}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`px-4 py-2 border ${bgClass} text-[11px] font-black rounded-xl uppercase tracking-tight flex items-center gap-2 shadow-sm ${isHighPriority ? "ring-2 ring-transparent ring-offset-1 scale-105" : ""}`}
                    >
                      <span className="text-base">{emoji}</span>
                      {tag}
                    </motion.span>
                  );
                })}
              </div>
            )}

            {/* Special "Senza Glutine" Highlight - New Prominent Badge */}
            {tripData?.tags?.some(
              (t) => t.toLowerCase() === "senza glutine",
            ) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-orange-50 rounded-[2rem] border-2 border-orange-100 flex items-center gap-4 relative overflow-hidden"
              >
                <div className="absolute -right-4 -bottom-4 text-6xl opacity-5 grayscale pointer-events-none">
                  🌾
                </div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-orange-100">
                  🌾
                </div>
                <div>
                  <h4 className="text-[13px] font-black text-orange-900 uppercase tracking-tighter">
                    Senza Glutine Disponibile
                  </h4>
                  <p className="text-[11px] font-black text-orange-700/60 leading-tight">
                    Abbiamo rilevato che questo locale offre opzioni per
                    celiaci.
                  </p>
                </div>
              </motion.div>
            )}

            {/* New Prominent Filters for Locali */}
            {poi.category === "locali" && (
              <div className="mb-6 bg-rose-50/50 p-4 rounded-[2rem] border border-rose-100/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest px-2 py-0.5 bg-rose-100 rounded-md">
                    Esplora per tipo
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "pizzeria", label: "Pizzerie", emoji: "🍕" },
                    { id: "pesce", label: "Ristoranti di Pesce", emoji: "🐟" },
                    {
                      id: "vegetariano",
                      label: "Vegetariano & Bio",
                      emoji: "🌿",
                    },
                    { id: "bar", label: "Bar & Caffè", emoji: "☕" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        onSetSubFilter?.(f.id);
                        onClose();
                      }}
                      className="px-4 py-2.5 bg-white border border-rose-100 rounded-2xl text-[11px] font-black text-rose-900 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <span className="text-sm">{f.emoji}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Special Parking Section */}
            {poi.category === "utilita" && (
              <div className="bg-blue-50 rounded-2xl p-4 mb-6 border border-blue-100 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full animate-pulse ${
                        parkingData?.availability === "Alta"
                          ? "bg-emerald-500"
                          : parkingData?.availability === "Media"
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                    />
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-tight">
                      Stato Disponibilità
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      parkingData?.availability === "Alta"
                        ? "bg-emerald-100 text-emerald-700"
                        : parkingData?.availability === "Media"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {parkingData?.availability === "Alta"
                      ? "ALTA"
                      : parkingData?.availability === "Media"
                        ? "MEDIA"
                        : "LIMITATA"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/60 p-2 rounded-xl">
                    <p className="text-[9px] font-bold text-blue-400 uppercase">
                      Tariffa
                    </p>
                    <p className="text-xs font-black text-blue-900">
                      {parkingData?.fee || "Variabile"}
                    </p>
                  </div>
                  <div className="bg-white/60 p-2 rounded-xl">
                    <p className="text-[9px] font-bold text-blue-400 uppercase">
                      Tipo
                    </p>
                    <p className="text-xs font-black text-blue-900">
                      {parkingData?.type || "Standard"}
                    </p>
                  </div>
                </div>

                {tripData?.address && (
                  <div className="pt-2 border-t border-blue-100/50">
                    <p className="text-[9px] font-bold text-blue-400 uppercase mb-1">
                      {getTranslation("exact_address", language)}
                    </p>
                    <p className="text-[11px] font-bold text-blue-800 leading-tight">
                      {tripData.address}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 mb-6 text-[#1e3a8a] text-sm font-medium">
              {tripData && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-amber-100/50 shadow-sm">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  <span className="text-[#1e3a8a] font-bold">
                    {tripData.rating || "N/A"}
                  </span>
                  <span className="text-[10px] opacity-60">
                    {tripData.numReviews || "0"} {getTranslation("reviews", language)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-amber-100/50 shadow-sm">
                <Navigation className="w-4 h-4 text-primary" />
                <span className="text-[#1e3a8a] font-semibold text-xs">
                  {distanceFromUser !== null
                    ? (`${distanceFromUser >= 10000 ? (distanceFromUser / 1000).toFixed(1).replace(".0", "") + " km" : distanceFromUser + " m"} ${getTranslation("from_you", language)}`)
                    : (getTranslation("calc_distance", language))}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <ActionButton
                icon={<MessageSquare className="w-4 h-4" />}
                label="Chiedi a WIP"
                onClick={openChatWithWip}
              />
              <ActionButton
                variant="primary"
                icon={<Navigation className="w-4 h-4" />}
                label={getTranslation("navigate", language)}
                href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`}
              />
            </div>

            {/* SEZIONE BIGLIETTI E AFFILIAZIONI - TEMPORANEAMENTE DISATTIVATA IN ATTESA API GYG
            {poi.category !== 'locali' && poi.category !== 'utilita' && poi.category !== 'parchi' && (
              <div className="mb-6 bg-white p-5 rounded-[2rem] border border-primary/10 shadow-sm relative overflow-hidden">
                <div className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
                  <Ticket className="w-24 h-24" />
                </div>
                <h4 className="text-[11px] font-black uppercase text-primary mb-3 flex items-center gap-2">
                  <Ticket className="w-4 h-4" />
                  {getTranslation("tickets_experiences", language)}
                </h4>
                <p className="text-xs text-[#1e3a8a]/60 mb-4">
                  {getTranslation("skip_line", language)}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={async () => {
                      const url = `https://www.getyourguide.it/s?q=${encodeURIComponent(poi.name || '')}+${encodeURIComponent(poi.city || '')}${AFFILIATE_CONFIG.GYG_PARTNER_ID ? `&partner_id=${AFFILIATE_CONFIG.GYG_PARTNER_ID}` : ''}${AFFILIATE_CONFIG.GYG_CMP ? `&cmp=${AFFILIATE_CONFIG.GYG_CMP}` : ''}`;
                      try {
                        await supabase.from('affiliate_clicks').insert({
                          poi_name: poi.name || 'Unknown',
                          poi_city: poi.city || 'Unknown',
                          source_page: 'PoiDetailSheet'
                        });
                      } catch (e) {
                        console.error('Error tracking GYG click:', e);
                      }
                      window.open(url, '_blank');
                    }}
                    className="w-full px-4 py-3 bg-[#FF5100]/10 hover:bg-[#FF5100]/20 text-[#FF5100] rounded-xl text-xs font-black flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">🎟️</span> {getTranslation("search_gyg", language)}
                    </span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            */}

            {nearbyPois !== undefined && nearbyPois.length > 0 && (
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setShowNearbyList(true)}
                className="w-full mb-8 p-4 bg-primary/5 rounded-3xl border border-primary/10 flex items-center justify-between group text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm border border-primary/5 group-hover:scale-110 transition-transform">
                    👀
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-primary uppercase tracking-tighter">
                      {getTranslation("explore_nearby", language)}
                    </h4>
                    <p className="text-[11px] font-bold text-[#1e3a8a] leading-tight">
                      {getTranslation('there_are', language)}
                      <span className="text-secondary">
                        {nearbyPois.length}
                      </span>{" "}
                      {getTranslation("other_attractions", language)}
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <ChevronRight className="w-4 h-4 text-primary" />
                </div>
              </motion.button>
            )}

            {/* Descrizione Dettagliata con Typewriter */}
            {(wikiData?.extract || isLoading || isRegenerating || generatedText) && (
              <div className="mb-6 bg-white p-5 rounded-[2rem] border border-amber-100/50 shadow-sm relative overflow-hidden">
                <h4 className="text-[10px] font-black uppercase text-[#1e3a8a] mb-2">
                  {getTranslation("detailed_description", language)}
                </h4>
                <div className="text-sm font-medium text-[#1e3a8a]/90 leading-relaxed italic border-l-2 border-primary pl-3 min-h-[60px]">
                  {isRegenerating ? (
                    <div className="flex flex-col gap-2 py-2">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span className="text-primary font-bold animate-pulse">{loadingPhrases[loadingPhraseIndex]}</span>
                      </div>
                      <div className="space-y-2 mt-2 opacity-30">
                         <div className="h-2 bg-gray-300 rounded w-full animate-pulse"></div>
                         <div className="h-2 bg-gray-300 rounded w-5/6 animate-pulse"></div>
                         <div className="h-2 bg-gray-300 rounded w-4/6 animate-pulse"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                       {displayedText || (
                         isLoading ? (language === 'IT' ? "Caricamento dettagli..." : getTranslation("loading_dots", language))
                         : isStreaming ? (language === 'IT' ? "Caricamento informazioni..." : getTranslation("loading_dots", language))
                         // Fine caricamento senza testo: mostra la descrizione
                         // disponibile, MAI una scritta di caricamento eterna.
                         : (wikiData?.extract || poi?.description || getTranslation("no_description", language))
                       )}
                       {(isTyping || isStreaming || isLoading) && <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle"></span>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dettagli dell'Opera / Visione IA */}
            <PoiExtraDetails poi={poi} language={language} />

            <PoiAudioPlayer
              localGuideMode={localGuideMode}
              setLocalGuideMode={async (mode) => {
                if (localGuideMode !== mode) {
                  setLocalGuideMode(mode);
                  if (audioState.isPlaying && audioState.poiId === String(poi?.id)) {
                    locationService.stopGuideAudio();
                  }
                  setGeneratedText(null);
                }
              }}
              isLoading={isLoading}
              isRegenerating={isRegenerating}
              generatedText={generatedText}
              poi={poi}
              wikiData={wikiData}
              language={language}
              onToggleSpeech={toggleSpeech}
              onRegenerate={() => regenerateWithGemini(true)}
            />

            {/* Pulsante Segnalazione Errore */}
            <div className="mt-6 mb-4 text-center">
              <button 
                onClick={() => setShowReportModal(true)}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-orange-500 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                Hai notato un errore in questo luogo? Segnalalo
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {showNearbyList && (
            <PoiNearbyList
              poi={poi}
              nearbyPois={nearbyPois}
              language={language}
              onClose={() => setShowNearbyList(false)}
              onSelect={(p) => {
                setShowNearbyList(false);
                if (onSelectNearby) onSelectNearby(p);
              }}
            />
          )}
        </AnimatePresence>


      </motion.div>
      )}
    </AnimatePresence>

    {/* MODALE CREDITI AUDIOGUIDA */}
    <CreditConfirmationModal 
      isOpen={showCreditModal}
      onClose={() => {
        setShowCreditModal(false);
        setPendingAudioTask(null);
      }}
      onConfirm={async () => {
        setShowCreditModal(false);
        if (!pendingAudioTask) return;
        const task = pendingAudioTask;
        setPendingAudioTask(null);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
          const paid = await consumeCredits(currentUserId, PRICING_LIST.audio_guide);
          if (!paid) {
            notify(language === 'IT'
              ? "Crediti insufficienti. Ricarica dallo shop per continuare."
              : "Not enough credits. Please top up to continue.");
            return;
          }
        } catch (e) {
          console.warn("[PoiDetailSheet] Addebito crediti fallito:", e);
          notify(language === 'IT'
            ? "Errore durante l'addebito dei crediti. Riprova."
            : "Error while charging credits. Please try again.");
          return;
        }
        // Utente non-IT senza testo già generato: dopo il pagamento la guida
        // va narrata nella SUA lingua — rigenera e riproduce (prima partiva
        // il testo italiano di fallback). Rimborso se la generazione fallisce.
        if (language !== 'IT' && !generatedText) {
          try {
            await regenerateWithGemini(true, localGuideMode);
          } catch (regenErr) {
            console.error('[PoiDetailSheet] Regen post-pagamento fallita:', regenErr);
            const { data: sd } = await supabase.auth.getSession();
            const uid = sd?.session?.user?.id || "mock-user-id";
            await refundCredits(uid, PRICING_LIST.audio_guide)
              .catch(err => console.error('[Audioguida] Rimborso fallito:', err));
            notify("Could not generate the audioguide. Your credits have been refunded.");
          }
          return;
        }
        if (task.text) {
          // Attesa + esito: prima la promise era flottante, quindi un TTS
          // fallito lasciava l'utente senza audio, senza rimborso e senza
          // voce nello storico — al tentativo dopo ripagava lo stesso POI.
          const ok = await locationService.playAudio(task.text, poi?.name, poi?.category, String(poi?.id), localGuideMode);
          if (!ok) {
            const { data: sd } = await supabase.auth.getSession();
            const uid = sd?.session?.user?.id || "mock-user-id";
            await refundCredits(uid, PRICING_LIST.audio_guide)
              .catch(e => console.error('[Audioguida] Rimborso fallito:', e));
            notify(language === 'IT'
              ? "Non è stato possibile riprodurre l'audioguida. I crediti ti sono stati restituiti."
              : "Could not play the audioguide. Your credits have been refunded.");
          }
        }
      }}
      onBuyCredits={() => {
          setShowCreditModal(false);
          openCreditShop();
      }}
      cost={PRICING_LIST.audio_guide}
      currentBalance={currentBalance}
      serviceName="Audioguida POI"
      language={language}
    />

    {/* MODALE CREDITI ARRICCHIMENTO LIVE (AI) */}
    <CreditConfirmationModal 
      isOpen={creditConfirm.isOpen}
      onClose={creditConfirm.handleCancel}
      onConfirm={creditConfirm.handleConfirm}
      onBuyCredits={() => {
          creditConfirm.handleCancel();
          openCreditShop();
      }}
      cost={creditConfirm.cost}
      currentBalance={currentBalance}
      serviceName={creditConfirm.serviceName}
      language={language}
    />

    {/* SHOP CREDITI (aperto dal ramo "Crediti Insufficienti" dei modali) */}
    <AnimatePresence>
      {shopUserId && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[10000] bg-white"
        >
          <ShopScreen
            userId={shopUserId}
            language={language}
            onClose={() => setShopUserId(null)}
          />
        </motion.div>
      )}
    </AnimatePresence>

    {/* MODALE SEGNALAZIONE ERRORE */}
    {showReportModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[3000]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-4 text-orange-600">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-black">Segnala un problema</h3>
          </div>
          
          <p className="text-sm text-slate-600 mb-4">
            Aiutaci a migliorare la mappa segnalando eventuali inesattezze per <strong>{poi?.name}</strong>.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo di errore</label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-orange-500/20"
              >
                <option>Informazioni errate (es. nome, indirizzo)</option>
                <option>Il luogo non esiste più / Chiuso definitivamente</option>
                <option>Posizione errata sulla mappa</option>
                <option>Immagine non appropriata</option>
                <option>Altro problema</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Dettagli (opzionale)</label>
              <textarea 
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Aggiungi qualche dettaglio per aiutarci..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-500/20 h-24 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button 
              onClick={() => setShowReportModal(false)}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
              disabled={isReporting}
            >
              Annulla
            </button>
            <button 
              onClick={handleReportSubmit}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2"
              disabled={isReporting}
            >
              {isReporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
              Invia Report
            </button>
          </div>
        </motion.div>
      </div>
    )}
    </>
  );
}

// ActionButton rimosso, spostato in components/ui/ActionButton.tsx

