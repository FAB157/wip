import { Radio, Trash2, User, History, Landmark, Check, CheckCircle, Settings, Volume2, Globe, Heart, BookOpen, Map, Clock, Loader2, MapPin, Search, Gift, ShieldCheck, Ticket, Building2, Church, Utensils, Trees, Compass, ChevronDown, ChevronRight, Award, Crown, Star, Target, Headphones, Camera, Info, LifeBuoy, Mail, MessageSquare, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { ReactNode, useState, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Capacitor } from '@capacitor/core';

import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { resetAllPlayed, getDistances, setDistance } from '../lib/guideSettings';
import AdminPanel from './AdminPanel';
import ShopScreen from './ShopScreen';
import UserProfileSummary from './UserProfileSummary';
import { getUserProfile, UserProfile } from '../lib/quotaManager';
import { getOfflineItinerariesList, getOfflineItinerary } from '../lib/offlineStorage';
import { Language, getTranslation, LANGUAGES } from '../lib/i18n';
import B2BPartner from './B2BPartner';
import { FAVORITES_EVENT } from '../lib/favorites';
import { getListeningHistory, ListeningHistoryEntry, LISTENING_HISTORY_EVENT, deleteListeningHistory } from '../lib/listeningHistory';
import PremiumGuideRenderer from './PremiumGuideRenderer';
import { downloadGuideAsPdf } from '../services/premiumGuideService';
import { Download, X, Fingerprint, Lock } from 'lucide-react';
import { useBiometricAuth } from '../hooks/useBiometricAuth';
import { BIOMETRIC_PREF_KEY, isBiometricPrefEnabled } from './LoginScreen';
import { Skeleton } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
interface ProfileScreenProps {
  guideMode: 'nicky' | 'dante';
  setGuideMode: (mode: 'nicky' | 'dante') => void;
  itinerary: any[];
  onRemovePoi: (id: string | number) => void;
  onClearItinerary: () => void;
  onSelectPoi?: (poi: any) => void;
  defaultLocation: [number, number];
  setDefaultLocation: (loc: [number, number]) => void;
  userSession?: any;
  onSignOut?: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

import AttractionImage from './AttractionImage';
import PrivacyPolicy from './PrivacyPolicy';
import AppGuide from './AppGuide';
import PriceList from './PriceList';
import FreeFeaturesModal from './FreeFeaturesModal';
import OfflineMapsTab from './OfflineMapsTab';
import ProminentDisclosure from './ProminentDisclosure';
import { PRICING_LIST } from '../lib/pricing';
import LiveTourPanel from './LiveTourPanel';

const getCardIcon = (poi: any) => {
  const cat = (poi.category || '').toLowerCase();
  const name = (poi.name || '').toLowerCase();
  const desc = (poi.description || '').toLowerCase();
  
  if (
    ['church', 'place_of_worship', 'chiese', 'chiesa', 'cathedral', 'cattedrale', 'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia', 'shrine', 'santuario'].includes(cat) ||
    cat.includes('chies') || cat.includes('relig') ||
    name.includes('chiesa') || name.includes('basilica') || name.includes('cattedrale') || name.includes('duomo') || name.includes('santuario') || name.includes('tempio') || name.includes('parrocchia') || name.includes('abbazia') || name.includes('monastero') || name.includes('cappella') ||
    desc.includes('chiesa') || desc.includes('basilica') || desc.includes('religios')
  ) {
    return <Church className="w-3 h-3 text-blue-700" />;
  }
  
  if (
    cat === 'museum' || cat === 'musei' ||
    cat.includes('museo') || cat.includes('art') || cat.includes('galler') ||
    name.includes('museo') || name.includes('museum') || name.includes('galleria d') || name.includes('pinacoteca') || name.includes('mostra') || name.includes('collezione') ||
    desc.includes('museo') || desc.includes('museum') || desc.includes('galleria')
  ) {
    return <Landmark className="w-3 h-3 text-indigo-700" />;
  }
  
  if (
    cat === 'restaurant' || cat === 'cafe' || cat === 'locali' || cat === 'ristoranti' || cat === 'bar' ||
    cat.includes('ristorante') || cat.includes('cibo') || cat.includes('gelateria') || cat.includes('pizzeria') || cat.includes('oster') || cat.includes('trattor') || cat.includes('food') || cat.includes('drink') ||
    name.includes('ristorante') || name.includes('pizzeria') || name.includes('osteria') || name.includes('trattoria') || name.includes('caffè') || name.includes('pub') || name.includes('bar ') || name.includes('gelateria') ||
    desc.includes('ristorante') || desc.includes('mangiare') || desc.includes('pizzeria') || desc.includes('cucina')
  ) {
    return <Utensils className="w-3 h-3 text-rose-700" />;
  }

  if (
    cat === 'viewpoint' || cat === 'park' || cat === 'panorami' || cat === 'parchi' ||
    cat.includes('parco') || cat.includes('natura') || cat.includes('giardin') || cat.includes('foresta') || cat.includes('riserva') ||
    name.includes('parco') || name.includes('giardino') || name.includes('panoram') || name.includes('riserva') || name.includes('spiaggia') || name.includes('bosco') || name.includes('belvedere') || name.includes('veduta') ||
    desc.includes('parco') || desc.includes('giardino') || desc.includes('natura') || desc.includes('panoram')
  ) {
    return <Trees className="w-3 h-3 text-emerald-700" />;
  }
  
  if (
    cat === 'monument' || cat === 'castle' || cat === 'archaeological_site' || cat === 'ruins' || cat === 'attraction' || cat === 'artwork' || cat === 'monumenti' || cat === 'castelli' || cat === 'archeo' || cat === 'gemme' ||
    cat.includes('monument') || cat.includes('storic') ||
    name.includes('monumento') || name.includes('castello') || name.includes('stadio') || name.includes('arena') || name.includes('palazzo') || name.includes('villa') || name.includes('torre') || name.includes('ponte') || name.includes('statua') || name.includes('teatro') || name.includes('palazzetti') || name.includes('arco') || name.includes('rocca') || name.includes('mura') ||
    desc.includes('monumento') || desc.includes('castello') || desc.includes('palazzo') || desc.includes('storico')
  ) {
    return <Landmark className="w-3 h-3 text-amber-700" />;
  }

  return <Compass className="w-3 h-3 text-primary/60" />;
};

export default function ProfileScreen({ guideMode, setGuideMode, itinerary, onRemovePoi, onClearItinerary, onSelectPoi, defaultLocation, setDefaultLocation, userSession, onSignOut, language, setLanguage }: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState<'diario' | 'itinerari' | 'livetour' | 'cronologia' | 'impostazioni' | 'pricing' | 'admin' | 'b2b' | 'missioni' | 'privacy' | 'offline' | 'listino' | 'guida' | 'supporto'>('diario');
  const [savedPois, setSavedPois] = useState<any[]>([]);
  const [savedItineraries, setSavedItineraries] = useState<any[]>([]);
  const [savedPremiumGuides, setSavedPremiumGuides] = useState<any[]>([]);
  const [itinerariSubTab, setItinerariSubTab] = useState<'ai' | 'premium'>('ai');
  const [guideToRender, setGuideToRender] = useState<any | null>(null);
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryEntry[]>([]);
  // Archivio ascolti: dettagli POI (descrizione, coordinate) letti dal repository
  // per arricchire le card. Chiave = poi_id; POI sparito dal DB → assente.
  const [historyPoiDetails, setHistoryPoiDetails] = useState<Map<string, any>>(new Map());

  // ── Test Azure TTS (pannello diagnostico voci) ──────────────────────────
  // NB: 'DE' ha una voce Azure mappata anche se non è (ancora) nel type Language dell'app
  const TTS_TEST_LANGS: string[] = ['IT', 'EN', 'FR', 'ES', 'DE', 'RU', 'ZH'];
  const TTS_TEST_GUIDES: Array<'nicky' | 'dante'> = ['nicky', 'dante'];
  const TTS_TEST_PHRASES: Record<string, string> = {
    IT: 'Ciao! Sono la tua guida di World in Pocket.',
    EN: 'Hi! I am your World in Pocket guide.',
    FR: 'Bonjour ! Je suis votre guide World in Pocket.',
    ES: '¡Hola! Soy tu guía de World in Pocket.',
    DE: 'Hallo! Ich bin dein World in Pocket Guide.',
    RU: 'Привет! Я ваш гид World in Pocket.',
    ZH: '你好！我是你的World in Pocket向导。'
  };
  const [showTtsTestPanel, setShowTtsTestPanel] = useState(false);
  const [ttsTestResults, setTtsTestResults] = useState<Record<string, { status: 'pending' | 'ok' | 'error'; message?: string }>>({});
  const [isTtsTestingAll, setIsTtsTestingAll] = useState(false);
  const ttsTestAudioRef = React.useRef<HTMLAudioElement | null>(null);

  /**
   * Testa UNA combinazione lingua+guida chiamando la route Azure reale
   * (/api/tts/azure: niente cache né quota, l'errore emerge davvero).
   * Con play=true riproduce anche l'MP3 ricevuto.
   */
  const runTtsVoiceTest = async (lang: string, character: 'nicky' | 'dante', play = false): Promise<boolean> => {
    const key = `${lang}_${character}`;
    setTtsTestResults(prev => ({ ...prev, [key]: { status: 'pending' } }));
    try {
      const { azureVoiceName, unlockSpeech } = await import('../services/ttsService');
      unlockSpeech();
      const voice = azureVoiceName(lang, character);
      const res = await fetch(getApiUrl('/api/tts/azure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: TTS_TEST_PHRASES[lang] || TTS_TEST_PHRASES.IT, voice })
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg += ': ' + ((await res.json())?.error || ''); } catch { /* body non JSON */ }
        setTtsTestResults(prev => ({ ...prev, [key]: { status: 'error', message: `${voice} — ${msg}` } }));
        return false;
      }
      const blob = await res.blob();
      if (blob.size < 500 || blob.type.includes('json')) {
        setTtsTestResults(prev => ({ ...prev, [key]: { status: 'error', message: `${voice} — audio non valido (${blob.size} byte)` } }));
        return false;
      }
      setTtsTestResults(prev => ({ ...prev, [key]: { status: 'ok', message: voice } }));
      if (play) {
        try {
          if (ttsTestAudioRef.current) { ttsTestAudioRef.current.pause(); ttsTestAudioRef.current = null; }
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsTestAudioRef.current = audio;
          audio.addEventListener('ended', () => URL.revokeObjectURL(url));
          await audio.play();
        } catch { /* autoplay bloccato: il risultato OK resta valido */ }
      }
      return true;
    } catch (e: any) {
      setTtsTestResults(prev => ({ ...prev, [key]: { status: 'error', message: e?.message || 'Errore di rete' } }));
      return false;
    }
  };

  /** Testa in sequenza tutte le combinazioni guida × lingua. */
  const runAllTtsVoiceTests = async () => {
    if (isTtsTestingAll) return;
    setIsTtsTestingAll(true);
    try {
      for (const character of TTS_TEST_GUIDES) {
        for (const lang of TTS_TEST_LANGS) {
          await runTtsVoiceTest(lang, character, false);
        }
      }
    } finally {
      setIsTtsTestingAll(false);
    }
  };

  // Arricchisce le card dell'archivio ascolti con i dati POI completi
  // (descrizione, coordinate) letti dal repository. Fallback robusto:
  // se il POI non esiste più (o si è offline) la card resta senza bottone
  // "Riascolta" ma continua a mostrare nome/foto salvati nello storico.
  useEffect(() => {
    let cancelled = false;
    if (listeningHistory.length === 0) { setHistoryPoiDetails(new Map()); return; }
    (async () => {
      try {
        const { getPoisByIds } = await import('../services/poiRepository');
        const map = await getPoisByIds(listeningHistory.map(h => h.poi_id));
        if (!cancelled) setHistoryPoiDetails(map);
      } catch (e) {
        console.warn('[ProfileScreen] Arricchimento archivio ascolti fallito', e);
      }
    })();
    return () => { cancelled = true; };
  }, [listeningHistory]);

  /**
   * Riascolto dall'archivio: l'ascolto è già stato pagato (è nello storico),
   * quindi riapriamo la scheda POI con alreadyPaid+autoPlay riusando l'evento
   * centralizzato wip-poi-trigger (stesso payload dei dispatcher del geofencing).
   * PoiDetailSheet riverifica comunque lo storico prima di addebitare.
   */
  const handleRelisten = (item: ListeningHistoryEntry, fullPoi: any) => {
    import('../services/ttsService').then(({ unlockSpeech }) => unlockSpeech()).catch(() => {});
    const poi = {
      ...fullPoi,
      id: fullPoi?.id ?? item.poi_id,
      name: fullPoi?.name || item.poi_name,
      category: fullPoi?.category || item.category,
      image_url: fullPoi?.image_url || item.image_url,
    };
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
      detail: { poiId: String(poi.id), poi, alreadyPaid: true, autoPlay: true }
    }));
  };
  const [gamificationLevels, setGamificationLevels] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('wip_gamification_levels') || '[]'); } catch { return []; }
  });
  const [gamificationChallenges, setGamificationChallenges] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('wip_gamification_challenges') || '[]'); } catch { return []; }
  });
  const [userXP, setUserXP] = useState(() => parseInt(localStorage.getItem('wip_user_xp') || '0', 10));

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFreeFeaturesOpen, setIsFreeFeaturesOpen] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [pendingActivationMode, setPendingActivationMode] = useState<'automatic' | 'semi-automatic' | null>(null);

  // Advanced Geocontrol state
  const [activationMode, setActivationMode] = useState<'automatic' | 'semi-automatic'>(() => {
    return (localStorage.getItem('wip_activation_mode') as 'automatic' | 'semi-automatic') || 'automatic';
  });
  // Distanze lette/scritte tramite guideSettings: sono le stesse chiavi
  // (wip_walk_alert, wip_car_alert, wip_walk_trigger/wip_car_trigger) che
  // locationService passa al servizio nativo. Le vecchie chiavi wip_dist_*
  // non erano lette da nessun motore.
  const [distWalk, setDistWalk] = useState<number>(() => getDistances().walkAlert);
  const [distCar, setDistCar] = useState<number>(() => getDistances().carAlert);
  const [distStart, setDistStart] = useState<number>(() => getDistances().walkTrigger);

  // Category Tree checkbox states
  const [activeSubcats, setActiveSubcats] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('wip_active_subcategories');
      if (stored) {
         const parsed = JSON.parse(stored);
         // Migration for old structure or normal load
         if ('monumenti' in parsed) return parsed;
      }
    } catch (e) {}
    return {
      monumenti: true,
      musei: true,
      panorami: false,
      chiese: true,
      consigli: false
    };
  });

  const toggleSubcat = (id: string) => {
    setActiveSubcats(prev => {
      const updated = { ...prev, [id] : !prev[id] };
      localStorage.setItem('wip_active_subcategories', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('wip-settings-updated'));
      return updated;
    });
  };

  const handleActivationModeChange = (mode: 'automatic' | 'semi-automatic') => {
    if (mode === 'automatic') {
      const hasAccepted = localStorage.getItem('wip_location_disclosure_accepted') === 'true';
      if (!hasAccepted) {
        setPendingActivationMode(mode);
        setShowDisclosure(true);
        return;
      }

      const confirmMsg = language === 'IT'
        ? `⚠️ Attenzione: In modalità Automatica, ogni nuovo punto di interesse attivato scalerà automaticamente ${PRICING_LIST.audio_guide} crediti, anche a telefono bloccato. Vuoi procedere?`
        : `⚠️ Warning: In Automatic mode, each new point of interest will automatically consume ${PRICING_LIST.audio_guide} credits, even when the phone is locked. Do you want to proceed?`;

      if (!window.confirm(confirmMsg)) return;
    }
    setActivationMode(mode);
    localStorage.setItem('wip_activation_mode', mode);
    window.dispatchEvent(new CustomEvent('wip-settings-updated'));
  };

  const [playedResetMsg, setPlayedResetMsg] = useState(false);
  const handleResetPlayed = () => {
    resetAllPlayed();
    window.dispatchEvent(new CustomEvent('wip-played-reset'));
    setPlayedResetMsg(true);
    setTimeout(() => setPlayedResetMsg(false), 2500);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'elimina') return;
    setIsDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Utente non trovato");

      // getApiUrl: su Capacitor i path relativi puntano agli asset locali, non a Vercel.
      // L'identità viaggia nel Bearer token: il server cancella solo l'utente del token.
      const res = await fetch(getApiUrl('/api/delete-account'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error("Errore durante l'eliminazione");
      
      await supabase.auth.signOut();
      if (onSignOut) onSignOut();
    } catch (e) {
      console.error(e);
      alert("Errore durante l'eliminazione dell'account.");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // "start" = distanza di arrivo/inizio guida: un solo controllo che scrive
  // sia walkTrigger che carTrigger (ognuno con il proprio clamp).
  type DistUiKey = 'walkAlert' | 'carAlert' | 'start';

  const persistDist = (key: DistUiKey, val: number, setter: (v: number) => void) => {
    if (key === 'start') {
      setDistance('walkTrigger', val);
      setDistance('carTrigger', val);
      setter(getDistances().walkTrigger); // valore effettivo post-clamp
    } else {
      setDistance(key, val);
      setter(getDistances()[key]);
    }
    window.dispatchEvent(new CustomEvent('wip-settings-updated'));
  };

  const handleDistChange = (key: DistUiKey, val: number, setter: (v: number) => void) => {
    if (val < 1) return;
    persistDist(key, val, setter);
  };

  const handleDirectDistChange = (key: DistUiKey, rawVal: string, setter: (v: number) => void) => {
    if (rawVal === '') {
      setter(0);
      return;
    }
    const val = parseInt(rawVal, 10);
    if (isNaN(val)) return;
    // Durante la digitazione si mostra il valore grezzo (niente eco del
    // clamp, o non si riuscirebbe a scrivere "50" passando per "5");
    // in storage setDistance salva comunque il valore clampato.
    setter(val);
    if (val >= 1) {
      if (key === 'start') {
        setDistance('walkTrigger', val);
        setDistance('carTrigger', val);
      } else {
        setDistance(key, val);
      }
      window.dispatchEvent(new CustomEvent('wip-settings-updated'));
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  // Stati di caricamento SEPARATI per le azioni puntuali: prima claim premi e
  // download PDF usavano l'isLoading condiviso e "svuotavano" l'intero tab
  // Missioni (il cui spinner è legato a isLoading) durante l'operazione.
  const [isClaiming, setIsClaiming] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile status states
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const currentUserId = userSession?.user?.id || "mock-user-id";

  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [isSearchingCity, setIsSearchingCity] = useState(false);

  const [quotaCounters, setQuotaCounters] = useState({
    itinerari_used: 0,
    itinerari_limit: 5,
    audioguide_used: 0,
    audioguide_limit: 15,
    vision_used: 0,
    vision_limit: 10,
    poi_details_used: 0,
    poi_details_limit: 25,
    premium_guide_used: 0,
    premium_guide_limit: 10,
    bonus_vision: 0,
    bonus_audio: 0,
    bonus_itinerari: 0
  });

  const [gamificationPopup, setGamificationPopup] = useState<{
    type: 'level' | 'challenge';
    title: string;
    icon: string;
    rewards: { credits: number };
    idToClaim: string;
  } | null>(null);

  const fetchQuotaCounters = async () => {
    try {
      const prof = await getUserProfile(currentUserId);
      const tier = prof.subscription_tier || 'free';

      const { data: globalQuotas } = await supabase.from('global_quotas').select('*');
      const tierQuota = (globalQuotas || []).find((q: any) => q.tier === tier) || {
        itineraries_limit: tier === 'premium' ? 5 : 1,
        audio_guides_limit: tier === 'premium' ? 15 : 3,
        photo_searches_limit: tier === 'premium' ? 10 : 2,
        poi_details_limit: tier === 'premium' ? 20 : 5,
        premium_guides_limit: tier === 'premium' ? 10 : 0
      };

      const { data: quotasData } = await supabase
        .from('user_quotas')
        .select('*')
        .eq('user_id', currentUserId);

      let record = quotasData && quotasData.length > 0 ? quotasData[0] : null;

      // Ensure fallback if record is missing
      const itineraries_limit = record?.itinerari_limit ?? (prof?.custom_limit_itinerary ?? tierQuota.itineraries_limit);
      const audio_guides_limit = record?.audioguide_limit ?? (prof?.custom_limit_audio_guide ?? tierQuota.audio_guides_limit);
      const photo_searches_limit = record?.vision_limit ?? tierQuota.photo_searches_limit;
      const poi_details_limit = record?.poi_details_limit ?? tierQuota.poi_details_limit;
      const premium_guides_limit = record?.premium_guide_limit ?? tierQuota.premium_guides_limit;

      setQuotaCounters({
        itinerari_used: record?.itinerari_used || 0,
        itinerari_limit: itineraries_limit,
        audioguide_used: record?.audioguide_used || 0,
        audioguide_limit: audio_guides_limit,
        vision_used: record?.vision_used || 0,
        vision_limit: photo_searches_limit,
        poi_details_used: record?.poi_details_used || 0,
        poi_details_limit: poi_details_limit,
        premium_guide_used: record?.premium_guide_used || 0,
        premium_guide_limit: premium_guides_limit,
        bonus_vision: prof?.bonus_vision || 0,
        bonus_audio: prof?.bonus_audio || 0,
        bonus_itinerari: prof?.bonus_itinerari || 0
      });
    } catch (err) {
      console.error("Error fetching quota counters:", err);
    }
  };

  const loadProfileData = async () => {
    try {
      const prof = await getUserProfile(currentUserId);
      setProfile(prof);
      await fetchQuotaCounters();
    } catch (err) {
      console.error("Error loading profile setup:", err);
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMessage(null);
    try {
      const codeUpper = couponCode.trim().toUpperCase();

      // I voucher regalano CREDITI (i pacchetti sono solo quelli dei crediti):
      // riscatto server-side che valida, consuma e accredita earned_credits
      // con la service key. Sostituisce sia la RPC premium-giorni sia il
      // vecchio fallback client che falliva in silenzio.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setCouponMessage({ type: 'error', text: 'Accedi al tuo account per riscattare il voucher.' });
        return;
      }
      const res = await fetch(getApiUrl('/api/coupon/redeem'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: codeUpper })
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponMessage({ type: 'error', text: data?.error || 'Codice non valido, disattivato o esaurito.' });
        return;
      }

      setCouponMessage({
        type: 'success',
        text: `Voucher riscattato! Hai ricevuto ${data.credits} crediti omaggio 🎉`
      });
      setCouponCode('');
      window.dispatchEvent(new CustomEvent('wip-credits-updated'));
      await loadProfileData();
    } catch (e: any) {
      console.error(e);
      setCouponMessage({ type: 'error', text: 'Errore durante l\'attivazione: ' + e.message });
    } finally {
      setCouponLoading(false);
    }
  };

  const TABS = profile?.is_admin 
    ? (['diario', 'itinerari', 'missioni', 'livetour', 'cronologia', 'impostazioni', 'offline', 'pricing', 'listino', 'b2b', 'guida', 'supporto', 'privacy', 'admin'] as const)
    : (['diario', 'itinerari', 'missioni', 'livetour', 'cronologia', 'impostazioni', 'offline', 'pricing', 'listino', 'b2b', 'guida', 'supporto', 'privacy'] as const);

  const handleSwipe = (e: any, direction: 'left' | 'right') => {
    if (e.event && e.event.target) {
      let target = e.event.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.dataset?.swipeIgnore === "true" || target.classList.contains('no-scrollbar')) {
          return;
        }
        target = target.parentElement;
      }
    }
    const idx = TABS.indexOf(activeTab as any);
    if (direction === 'left' && idx < TABS.length - 1) setActiveTab(TABS[idx + 1] as any);
    if (direction === 'right' && idx > 0) setActiveTab(TABS[idx - 1] as any);
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: (e) => handleSwipe(e, 'left'),
    onSwipedRight: (e) => handleSwipe(e, 'right'),
    trackMouse: false,
    delta: 200,
    preventScrollOnSwipe: false
  });

  const [userName, setUserName] = useState("Explorer Personale");

  // --- Opzioni di sicurezza (cambio password + sblocco biometrico) ---
  const { isAvailable: biometricAvailable, saveCredentials: saveBiometricCredentials, deleteCredentials: deleteBiometricCredentials } = useBiometricAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricPrefEnabled());
  const [secCurrentPw, setSecCurrentPw] = useState('');
  const [secNewPw, setSecNewPw] = useState('');
  const [secConfirmPw, setSecConfirmPw] = useState('');
  const [secLoading, setSecLoading] = useState(false);
  // Gli account Google non hanno una password da cambiare
  const isEmailProvider = (userSession?.user?.app_metadata?.provider || 'email') === 'email';

  const handleToggleBiometric = async () => {
    const next = !biometricEnabled;
    setBiometricEnabled(next);
    localStorage.setItem(BIOMETRIC_PREF_KEY, String(next));
    if (!next) {
      // Disattivazione = rimozione immediata delle credenziali dal keystore
      await deleteBiometricCredentials?.().catch?.(() => {});
    } else {
      alert('Sblocco biometrico attivo: verrà configurato al prossimo accesso con email e password.');
    }
  };

  const handleChangePassword = async () => {
    const emailAddr = userSession?.user?.email;
    if (!emailAddr) return;
    if (!secNewPw || secNewPw.length < 6) { alert('La nuova password deve avere almeno 6 caratteri.'); return; }
    if (secNewPw !== secConfirmPw) { alert('Le password non coincidono.'); return; }
    setSecLoading(true);
    try {
      // Re-autenticazione: mai cambiare password senza verificare quella attuale
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: emailAddr, password: secCurrentPw });
      if (verifyErr) { alert('Password attuale non corretta.'); return; }
      const { error } = await supabase.auth.updateUser({ password: secNewPw });
      if (error) throw error;
      // Aggiorna le credenziali biometriche, altrimenti lo sblocco con
      // impronta continuerebbe a usare la vecchia password
      if (biometricAvailable && isBiometricPrefEnabled()) {
        await saveBiometricCredentials(emailAddr, secNewPw).catch(() => {});
      }
      setSecCurrentPw(''); setSecNewPw(''); setSecConfirmPw('');
      alert('Password aggiornata con successo ✅');
    } catch (e: any) {
      alert(e?.message || 'Errore durante il cambio password.');
    } finally {
      setSecLoading(false);
    }
  };
  const [userAvatar, setUserAvatar] = useState("👤");

  // Sync cloud di nome/avatar nei metadata auth (debounced): prima vivevano
  // SOLO in localStorage e cambiando dispositivo si perdevano. I metadata
  // auth non dipendono dallo schema di user_profiles e sono sempre scrivibili
  // dall'utente autenticato.
  const profileSyncTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncProfileToCloud = (name: string, avatar: string) => {
    if (!userSession?.user?.id) return; // ospite: resta solo locale
    if (profileSyncTimer.current) clearTimeout(profileSyncTimer.current);
    profileSyncTimer.current = setTimeout(() => {
      // Gli avatar in base64 possono superare i limiti dei metadata: sincronizza
      // solo emoji/URL brevi, la foto caricata resta locale.
      const avatarForCloud = avatar && avatar.length <= 2048 ? avatar : undefined;
      supabase.auth.updateUser({
        data: { display_name: name, ...(avatarForCloud !== undefined ? { avatar: avatarForCloud } : {}) }
      }).catch(() => { /* best effort: la copia locale resta valida */ });
      // Write-through su user_profiles: così il nome è visibile anche
      // server-side (pannello admin, email) e non solo nei metadata auth.
      supabase.from('user_profiles').update({ display_name: name })
        .eq('id', userSession.user.id)
        .then(() => {}, () => { /* colonna assente finché la migration non è applicata */ });
    }, 1200);
  };

  const searchCityLocation = async () => {
    if (!citySearch.trim()) return;
    setIsSearchingCity(true);
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      alert("Ricerca città non disponibile in questa build (token mappe mancante).");
      setIsSearchingCity(false);
      return;
    }
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(citySearch.trim())}.json?access_token=${token}&limit=1`
      );
      if (!response.ok) throw new Error("Errore nella ricerca");
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        const feat = data.features[0];
        setDefaultLocation([feat.center[1], feat.center[0]]);
        alert(`Posizione aggiornata a: ${feat.place_name.split(',')[0]} ✅`);
      } else {
        alert("Città non trovata.");
      }
    } catch (e) {
      console.error(e);
      alert("Errore durante la ricerca.");
    } finally {
      setIsSearchingCity(false);
    }
  };

  useEffect(() => {
    const savedName = localStorage.getItem('userProfileName');
    const savedAvatar = localStorage.getItem('userProfileAvatar');
    if (savedName) setUserName(savedName);
    if (savedAvatar) setUserAvatar(savedAvatar);
    // Su un dispositivo nuovo recupera nome/avatar dai metadata auth
    // (display_name = registrazione/impostazioni, full_name = account Google)
    const meta: any = userSession?.user?.user_metadata;
    const cloudName = meta?.display_name || meta?.full_name;
    if (!savedName && cloudName) {
      setUserName(cloudName);
      localStorage.setItem('userProfileName', cloudName);
    }
    if (!savedAvatar && meta?.avatar) {
      setUserAvatar(meta.avatar);
      localStorage.setItem('userProfileAvatar', meta.avatar);
    }
    loadProfileData();

    // Check URL params to auto-open specific tabs (pricing, b2b)
    const params = new URLSearchParams(window.location.search);
    if (params.get('pin')) {
      setActiveTab('livetour');
    } else if (params.get('b2b') === 'true' || params.get('b2bsuccess') === 'true' || params.get('b2bcanceled') === 'true') {
      setActiveTab('b2b');
    } else if (params.get('pricing') === 'true') {
      setActiveTab('pricing');
    } else {
      setActiveTab('diario');
    }

    // Saldo sempre allineato: a ogni consumo/rimborso crediti (evento
    // emesso da src/lib/pricing.ts) ricarichiamo profilo e contatori.
    const onCreditsUpdated = () => loadProfileData();
    window.addEventListener('wip-credits-updated', onCreditsUpdated);
    return () => window.removeEventListener('wip-credits-updated', onCreditsUpdated);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validazione reale: accept="image/*" è solo un hint del picker. Una foto da
    // fotocamera (5-10MB) in base64 supera la quota localStorage (~5MB) e
    // QuotaExceededError faceva sparire l'avatar al riavvio senza messaggi.
    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      return;
    }
    if (file.size > 1024 * 1024) {
      alert('Immagine troppo grande (max 1 MB). Scegli una foto più piccola.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      try {
        localStorage.setItem('userProfileAvatar', base64String);
        setUserAvatar(base64String);
      } catch {
        alert('Impossibile salvare la foto: spazio locale esaurito.');
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (activeTab === 'diario') {
      fetchSavedPois();
    } else if (activeTab === 'itinerari') {
      fetchSavedItineraries();
      fetchSavedPremiumGuides();
    } else if (activeTab === 'impostazioni') {
      fetchQuotaCounters();
    } else if (activeTab === 'livetour') {
      // Initialize live tour tab
    } else if (activeTab === 'cronologia') {
      fetchListeningHistoryData();
    } else if (activeTab === 'missioni') {
      fetchGamificationData();
    }
  }, [activeTab]);

  const fetchGamificationData = async () => {
    setIsLoading(true);
    try {
      const [levelsRes, challengesRes, history, profileRes] = await Promise.all([
        supabase.from('gamification_levels').select('*').order('level', { ascending: true }),
        supabase.from('gamification_challenges').select('*').order('created_at', { ascending: true }),
        getListeningHistory(currentUserId),
        supabase.from('user_profiles').select('xp_points').eq('id', currentUserId).single()
      ]);
      
      const levels = levelsRes.data || [];
      const challenges = challengesRes.data || [];
      const realXp = profileRes.data?.xp_points || 0;
      
      setGamificationLevels(levels);
      localStorage.setItem('wip_gamification_levels', JSON.stringify(levels));
      setGamificationChallenges(challenges);
      localStorage.setItem('wip_gamification_challenges', JSON.stringify(challenges));
      setListeningHistory(history);
      
      // Calcola XP: Dal database (include ascolti e vision)
      setUserXP(realXp);
      localStorage.setItem('wip_user_xp', realXp.toString());

      // Check per i premi non ancora riscossi
      const { data: claimedData } = await supabase
        .from('user_rewards_claimed')
        .select('reward_source_type, reward_source_id')
        .eq('user_id', currentUserId);
      const claimedSet = new Set((claimedData || []).map(c => `${c.reward_source_type}_${c.reward_source_id}`));

      // Controllo Livelli sbloccati non riscossi
      for (const lvl of levels) {
        if (realXp >= lvl.xp_required && !claimedSet.has(`level_${lvl.id}`)) {
          setGamificationPopup({
            type: 'level',
            title: `Livello ${lvl.title} Raggiunto!`,
            icon: '🏆',
            // Migrazione 20260711: i premi sono CREDITI (reward_credits); le
            // vecchie colonne reward_vision/audio/itineraries non esistono più.
            rewards: { credits: lvl.reward_credits || 0 },
            idToClaim: lvl.id
          });
          return; // Mostriamo un popup alla volta
        }
      }

      // Controllo Sfide completate non riscosse
      for (const challenge of challenges) {
        const visits = history.filter(h => challenge.category_trigger === 'all' || h.category === challenge.category_trigger).length;
        if (visits >= challenge.threshold && !claimedSet.has(`challenge_${challenge.id}`)) {
          setGamificationPopup({
            type: 'challenge',
            title: `Missione "${challenge.name}" Completata!`,
            icon: challenge.icon || '🎯',
            rewards: { credits: challenge.reward_credits || 0 },
            idToClaim: challenge.id
          });
          return; // Un popup alla volta
        }
      }

    } catch (err) {
      console.warn("Failed to load gamification data", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchListeningHistoryData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id || "mock-user-id";
      const history = await getListeningHistory(uid);
      setListeningHistory(history);
    } catch (err) {
      console.warn("Failed to load listening history", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleFavoritesUpdate = () => {
      if (activeTab === 'diario') {
        fetchSavedPois();
      }
    };
    const handleHistoryUpdate = () => {
      if (activeTab === 'livetour') {
        // Handle history update if needed for live tour?
      }
      if (activeTab === 'cronologia') {
        fetchListeningHistoryData();
      }
    };
    window.addEventListener(FAVORITES_EVENT, handleFavoritesUpdate);
    window.addEventListener(LISTENING_HISTORY_EVENT, handleHistoryUpdate);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, handleFavoritesUpdate);
      window.removeEventListener(LISTENING_HISTORY_EVENT, handleHistoryUpdate);
    };
  }, [activeTab]);

  const fetchSavedItineraries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
      const { data, error } = await supabase
        .from('user_itineraries')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      let combinedData: any[] = [];
      if (!error && data) {
         combinedData = [...data];
      }
      
      try {
        const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        localData.forEach((item: any) => {
          if (!combinedData.find(c => c.id === item.id)) {
            combinedData.push(item);
          }
        });
      } catch (e) {}

      // Carica anche gli itinerari IndexedDB salvati offline
      try {
        const offlineList = await getOfflineItinerariesList();
        for (const item of offlineList) {
          const detail = await getOfflineItinerary(item.id);
          if (detail) {
            const mappedItinerary = {
              id: item.id,
              titolo: detail.titolo || item.title || "Itinerario offline",
              created_at: new Date(item.date || Date.now()).toISOString(),
              dati_itinerario: detail,
              isOffline: true
            };
            if (!combinedData.find(c => c.id === mappedItinerary.id)) {
              combinedData.push(mappedItinerary);
            }
          }
        }
      } catch (e) {
        console.error("Errore nel caricamento degli itinerari offline in ProfileScreen:", e);
      }

      setSavedItineraries(combinedData);

      if (error && error.code !== '42P01' && !error.message?.includes('does not exist')) {
        console.warn(error);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Errore di connessione a Supabase");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSavedPremiumGuides = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
      const { data, error } = await supabase
        .from('itinerary_guides')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSavedPremiumGuides(data);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSavedPois = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Solo i salvataggi dell'utente corrente: senza il filtro user_id il
      // Diario mostrava i POI salvati di TUTTI gli utenti.
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;

      let combinedData: any[] = [];
      let queryError: any = null;
      // Da sloggati NIENTE query col filtro user_id undefined (produceva una
      // richiesta malformata): restano solo i preferiti locali.
      if (uid) {
        const { data, error } = await supabase
          .from('saved_pois')
          .select(`*`)
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(200);
        if (!error && data) combinedData = [...data];
        queryError = error;
      }

      try {
        const localData = JSON.parse(localStorage.getItem('mock_db_saved_pois') || '[]');
        localData.forEach((item: any) => {
          // String + fallback id: senza, id numerici non matchavano mai
          // (doppioni) e righe legacy senza poi_id collassavano tra loro.
          const itemKey = String(item.poi_id ?? item.id);
          if (!combinedData.find(c => String(c.poi_id ?? c.id) === itemKey)) {
            combinedData.push(item);
          }
        });
      } catch (e) {}

      setSavedPois(combinedData);

      if (queryError && queryError.code !== '42P01' && queryError.code !== 'PGRST116' && !queryError.message?.includes('does not exist')) {
        console.warn(queryError);
        // Prima l'errore era solo in console e il ramo UI di errore del
        // Diario risultava irraggiungibile.
        setError('Impossibile caricare i luoghi salvati dal cloud. Mostro solo quelli sul dispositivo.');
      }
    } catch (err: any) {
      console.error('Errore durante il recupero dei POI salvati', err);
      try {
        const localData = JSON.parse(localStorage.getItem('mock_db_saved_pois') || '[]');
        setSavedPois(localData);
      } catch (e) {
        setSavedPois([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAFA] overflow-y-scroll pb-32 no-scrollbar">
      {/* Header Profile - Minimalist Light Mode */}
      <div className="px-6 pt-16 pb-6 bg-white border-b border-gray-100 shrink-0">
        <UserProfileSummary 
          session={userSession} 
          userName={userName} 
          userAvatar={userAvatar} 
          language={language} 
          onOpenFreeFeatures={() => setIsFreeFeaturesOpen(true)}
        />

        {/* Navigation Tabs - Minimalist Style */}
        <div className="mt-8 overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex items-center gap-6 min-w-max px-1">
            <TabButton 
              active={activeTab === 'diario'} 
              onClick={() => setActiveTab('diario')} 
              icon={<BookOpen className="w-3.5 h-3.5" />} 
              label={getTranslation("diary", language)} 
            />
            <TabButton 
              active={activeTab === 'itinerari'} 
              onClick={() => setActiveTab('itinerari')} 
              icon={<Map className="w-3.5 h-3.5" />} 
              label={getTranslation("itinerari_tab", language)} 
            />
            <TabButton 
              active={activeTab === 'missioni'} 
              onClick={() => setActiveTab('missioni')} 
              icon={<Award className="w-3.5 h-3.5" />} 
              label="Missioni" 
            />
            <TabButton 
              active={activeTab === 'livetour'} 
              onClick={() => setActiveTab('livetour')} 
              icon={<Radio className="w-3.5 h-3.5" />} 
              label="Tour di Gruppo" 
            />
            <TabButton 
              active={activeTab === 'cronologia'} 
              onClick={() => setActiveTab('cronologia')} 
              icon={<Clock className="w-3.5 h-3.5" />} 
              label={getTranslation("history_tab", language)} 
            />
            <TabButton 
              active={activeTab === 'impostazioni'} 
              onClick={() => setActiveTab('impostazioni')} 
              icon={<Settings className="w-3.5 h-3.5" />} 
              label={getTranslation("setup_tab", language)} 
            />
            <TabButton 
              active={activeTab === 'offline'} 
              onClick={() => setActiveTab('offline')} 
              icon={<Download className="w-3.5 h-3.5" />} 
              label="Mappe Offline" 
            />
            <TabButton 
              active={activeTab === 'pricing'} 
              onClick={() => setActiveTab('pricing')} 
              icon={<Ticket className="w-3.5 h-3.5" />} 
              label="Shop"
            />
            <TabButton
              active={activeTab === 'listino'}
              onClick={() => setActiveTab('listino')}
              icon={<Coins className="w-3.5 h-3.5" />}
              label="Listino"
            />
            <TabButton 
              active={activeTab === 'b2b'} 
              onClick={() => setActiveTab('b2b')} 
              icon={<Building2 className="w-3.5 h-3.5" />} 
              label={getTranslation("hotel_tab", language)} 
            />
            <TabButton
              active={activeTab === 'guida'}
              onClick={() => setActiveTab('guida')}
              icon={<Info className="w-3.5 h-3.5" />}
              label="Guida"
            />
            <TabButton
              active={activeTab === 'supporto'}
              onClick={() => setActiveTab('supporto')}
              icon={<LifeBuoy className="w-3.5 h-3.5" />}
              label="Supporto"
            />
            <TabButton 
              active={activeTab === 'privacy'} 
              onClick={() => setActiveTab('privacy')} 
              icon={<ShieldCheck className="w-3.5 h-3.5" />} 
              label="Privacy" 
            />
            {profile?.is_admin && (
              <TabButton 
                active={activeTab === 'admin'} 
                onClick={() => setActiveTab('admin')} 
                icon={<ShieldCheck className="w-3.5 h-3.5" />} 
                label="ADMIN" 
              />
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div {...(activeTab === 'admin' ? {} : swipeHandlers)} className="flex-1 p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'diario' && (
            <motion.div
              key="diario"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-1">
                <h2 className="text-xl font-black text-primary tracking-tight">{getTranslation("my_discoveries", language)}</h2>
                <div className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-widest">
                  {/* Stesso dedup della griglia: la somma secca contava i
                      doppioni presenti in entrambe le liste */}
                  {isLoading
                    ? (getTranslation('updating', language))
                    : `${itinerary.length + savedPois.filter(s => !itinerary.some(p => String(p.id) === String(s.poi_id ?? s.id))).length} ${getTranslation("places", language)}`}
                </div>
              </div>

              {isLoading ? (
                <div className="py-20 flex flex-col gap-4 items-center justify-center">
                  <Skeleton className="w-full h-32 rounded-3xl" />
                  <Skeleton className="w-full h-32 rounded-3xl" />
                </div>
              ) : error ? (
                <div className="p-8 bg-red-50 border border-red-100 rounded-3xl text-center">
                   <p className="text-red-500 font-bold text-sm">{getTranslation('conn_error', language)}</p>
                   <p className="text-[11px] text-red-400 mt-1">{error}</p>
                </div>
              ) : (savedPois.length === 0 && itinerary.length === 0) ? (
                <EmptyState 
                  icon={Heart}
                  title={getTranslation("no_gems", language)}
                  description={getTranslation("no_gems_desc", language)}
                />
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Combinazione di POI da Supabase e POI locali (Sessione) */}
                    {[
                      ...itinerary.map(p => ({ id: p.id, poi: p })), 
                      ...savedPois
                        .filter(s => !itinerary.some(p => String(p.id) === String(s.poi_id ?? s.id)))
                        .map(s => ({ id: s.poi_id || s.id, poi: s.data || s }))
                    ].map((item, idx) => (
                      <PoiCard 
                        key={item.id + idx} 
                        poi={item.poi} 
                        onRemove={() => onRemovePoi(item.id)} 
                        onClick={() => onSelectPoi?.(item.poi)}
                      />
                    ))}
                  </div>
              )}
            </motion.div>
          )}

          {activeTab === 'itinerari' && (
            <motion.div
              key="itinerari"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Sub-tabs per Itinerari AI e Guide Premium - Modern Segmented Control */}
              <div className="flex bg-gray-100/80 p-1.5 rounded-2xl mb-6">
                <button
                  onClick={() => setItinerariSubTab('ai')}
                  className={`flex-1 py-2.5 text-[11px] font-black tracking-widest rounded-[14px] transition-all duration-300 ${itinerariSubTab === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  ITINERARI AI
                </button>
                <button
                  onClick={() => setItinerariSubTab('premium')}
                  className={`flex-1 py-2.5 text-[11px] font-black tracking-widest rounded-[14px] transition-all duration-300 ${itinerariSubTab === 'premium' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  GUIDE PREMIUM
                </button>
              </div>

              {isLoading ? (
                <div className="py-20 flex flex-col gap-4 items-center justify-center">
                  <Skeleton className="w-full h-32 rounded-3xl" />
                  <Skeleton className="w-full h-32 rounded-3xl" />
                </div>
              ) : itinerariSubTab === 'ai' ? (
                savedItineraries.length === 0 ? (
                <EmptyState 
                  icon={Map}
                  title={getTranslation("suggested_itineraries", language)}
                  description="Qui appariranno i percorsi personalizzati creati per te dalla nostra Guida AI."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedItineraries.map((itineraryDb) => (
                    <div key={itineraryDb.id} className="group p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1.5">
                          <h4 className="font-black text-gray-900 text-xl leading-tight group-hover:text-primary transition-colors">
                            {itineraryDb.titolo || "Il mio itinerario"}
                          </h4>
                          <div className="flex items-center gap-2">
                            {(itineraryDb.dati_itinerario?.giorni?.length || 0) > 0 && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-black uppercase tracking-widest flex items-center gap-1">
                                <Map className="w-3 h-3" />
                                {itineraryDb.dati_itinerario.giorni.length} {itineraryDb.dati_itinerario.giorni.length === 1 ? 'Giorno' : 'Giorni'}
                              </span>
                            )}
                            {itineraryDb.isOffline && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-black tracking-widest uppercase flex items-center gap-1">
                                <Check className="w-3 h-3" /> Offline
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                         Creato il {new Date(itineraryDb.created_at || Date.now()).toLocaleDateString('it-IT')}
                      </p>
                      <div className="flex mt-auto pt-2">
                        {(() => {
                          // Deeplink con COORDINATE quando disponibili (il nome
                          // tappa da solo porta Maps su destinazioni ambigue);
                          // senza tappe il bottone è disabilitato, non un
                          // finto link con href="#".
                          let mapsUrl: string | null = null;
                          try {
                            const firstDay = itineraryDb.dati_itinerario?.giorni?.[0];
                            const tappe = firstDay?.tappe || [];
                            if (tappe.length > 0) {
                              const point = (t: any) =>
                                (t.lat != null && t.lon != null)
                                  ? `${t.lat},${t.lon}`
                                  : (t.titolo_tappa || t.nome || '');
                              const last = tappe[tappe.length - 1];
                              const waypoints = tappe.slice(0, -1).map((t: any) => encodeURIComponent(point(t))).join('|');
                              mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point(last))}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
                            }
                          } catch { /* dati itinerario malformati */ }
                          return mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full text-center py-3.5 bg-gray-900 text-white font-black text-[11px] uppercase tracking-widest rounded-[1.25rem] hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                              APRI IN MAPS <ChevronRight className="w-4 h-4" />
                            </a>
                          ) : (
                            <span className="w-full text-center py-3.5 bg-gray-100 text-gray-400 font-black text-[11px] uppercase tracking-widest rounded-[1.25rem] flex items-center justify-center gap-2 cursor-not-allowed">
                              Nessuna tappa disponibile
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )) : (
                savedPremiumGuides.length === 0 ? (
                  <EmptyState 
                    icon={BookOpen}
                    title="Guide Premium"
                    description="Non hai ancora generato nessuna guida PDF in alta qualità."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {savedPremiumGuides.map((guide) => (
                      <div key={guide.id} className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-3 hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-black text-gray-900 text-lg leading-tight group-hover:text-primary transition-colors">
                              {guide.content_data?.guida_titolo || "Guida Premium"}
                            </h4>
                            <span className="text-[9px] bg-amber-50 text-amber-700 self-start px-2.5 py-1 rounded-full font-black tracking-widest uppercase">
                              {guide.stile_guida || 'essential'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                           {new Date(guide.created_at || Date.now()).toLocaleDateString('it-IT')}
                        </p>
                        <div className="flex mt-auto pt-3">
                          <button
                            onClick={() => setGuideToRender({ content: guide.content_data, media: guide.media_manifest, hash: guide.itinerary_hash })}
                            className="w-full text-center py-3.5 bg-gray-100 text-gray-900 font-black text-[11px] uppercase tracking-widest rounded-[1.25rem] hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                          >
                            {/* Etichetta onesta: questo bottone APRE il visualizzatore;
                                il download PDF è dentro, in alto a destra. */}
                            <BookOpen className="w-4 h-4" /> APRI GUIDA
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </motion.div>
          )}

          {activeTab === 'missioni' && (
            <motion.div
              key="missioni"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-primary/40">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Sezione Livello e XP - Minimal Dashboard */}
                  <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                    {(() => {
                      // Determina il livello corrente e il prossimo
                      let currentLvl = gamificationLevels[0] || { level: 1, title: 'Turista', xp_required: 0 };
                      let nextLvl = null;
                      
                      for (let i = 0; i < gamificationLevels.length; i++) {
                        if (userXP >= gamificationLevels[i].xp_required) {
                          currentLvl = gamificationLevels[i];
                        } else {
                          nextLvl = gamificationLevels[i];
                          break;
                        }
                      }
                      
                      // Guardia sul divisore: due livelli con lo stesso xp_required
                      // producevano NaN nell'anello di progresso
                      const xpSpan = nextLvl ? Math.max(1, nextLvl.xp_required - currentLvl.xp_required) : 1;
                      const progressPercentage = nextLvl
                        ? Math.min(100, Math.max(0, ((userXP - currentLvl.xp_required) / xpSpan) * 100))
                        : 100;
                        
                      return (
                        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
                          <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                              <circle cx="50" cy="50" r="45" fill="none" stroke="#D4AF37" strokeWidth="6" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * progressPercentage) / 100} className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-3xl font-black text-gray-900">{currentLvl.level}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Livello</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 w-full text-center md:text-left">
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Status Attuale</p>
                            <h3 className="text-3xl font-black text-gray-900 mb-2">{currentLvl.title}</h3>
                            
                            <div className="flex flex-col gap-1">
                              <span className="font-black text-xl text-gray-900">{userXP} <span className="text-sm font-bold text-gray-400">/ {nextLvl ? nextLvl.xp_required : userXP} XP</span></span>
                              {nextLvl && (
                                <div className="flex flex-col items-center md:items-start gap-1">
                                  <p className="text-xs font-bold text-gray-500">
                                    Mancano <span className="text-gray-900">{nextLvl.xp_required - userXP} XP</span> per {nextLvl.title}
                                  </p>
                                  {(nextLvl.reward_credits || 0) > 0 && (
                                    <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-1 border border-amber-200 shadow-sm">
                                      <Award className="w-3.5 h-3.5 text-amber-500" />
                                      Premio livello: +{nextLvl.reward_credits} Crediti
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Premi Sbloccabili - Grid Orizzontale */}
                  <div className="space-y-3">
                    <h4 className="font-black text-gray-900 flex items-center gap-2">
                      <Gift className="w-5 h-5 text-[#D4AF37]" />
                      Premi dei Livelli
                    </h4>
                    <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar px-1">
                      {gamificationLevels.map((lvl) => {
                        const isUnlocked = userXP >= lvl.xp_required;
                        return (
                          <div key={lvl.id} className={`w-64 shrink-0 p-5 rounded-[2rem] border transition-all flex flex-col gap-3 ${isUnlocked ? 'bg-white border-green-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                            <div className="flex justify-between items-start">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isUnlocked ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                {lvl.level}
                              </div>
                              {isUnlocked && <CheckCircle className="w-6 h-6 text-green-500" />}
                            </div>
                            <div>
                              <h5 className="font-black text-gray-900">{lvl.title}</h5>
                              <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider mb-2">{lvl.xp_required} XP Richiesti</p>
                              
                              <div className="flex flex-wrap gap-1 text-[9px] font-black uppercase tracking-wider">
                                {(lvl.reward_credits || 0) > 0 ? (
                                  <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 shadow-sm flex items-center gap-1">
                                    🏆 +{lvl.reward_credits} Crediti
                                  </span>
                                ) : (
                                  <span className="text-gray-400">Nessun premio</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Wip è Gratis */}
                  <div className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 shadow-sm mt-6 mb-6">
                    <h4 className="font-black text-emerald-900 flex items-center gap-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      Wip è Gratis! Cosa puoi fare a costo zero?
                    </h4>
                    <p className="text-xs font-bold text-emerald-800 mb-4 opacity-80 leading-relaxed">
                      Wip ti offre un mondo di funzionalità totalmente gratuite. L'unica cosa che si paga con i Crediti è la **generazione intelligente dell'audio (Audioguida AI)** e l'assistente **Esperto Viaggi**. Tutto il resto è libero:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-start gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-emerald-50/50">
                        <Map className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-black text-gray-800 mb-0.5">Esplora la Mappa</h5>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Trova e scopri tutti i Punti di Interesse (POI) intorno a te senza alcun limite.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-emerald-50/50">
                        <BookOpen className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-black text-gray-800 mb-0.5">Informazioni e Storia</h5>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Leggi liberamente descrizioni, orari e curiosità testuali di ogni attrazione.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-emerald-50/50">
                        <Compass className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-black text-gray-800 mb-0.5">Navigatore Integrato</h5>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Fatti guidare a piedi o in auto verso il POI selezionato, come su Maps.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-emerald-50/50">
                        <Headphones className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-black text-gray-800 mb-0.5">Avvisi Geofencing (Cuffie)</h5>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight">Ricevi notifiche audio automatiche e gratuite ("A 150m c'è...") mentre cammini.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Come ottenere Punti XP */}
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[2rem] p-6 border border-indigo-100 shadow-sm mt-6">
                    <h4 className="font-black text-indigo-900 flex items-center gap-2 mb-4">
                      Come ottenere Punti XP
                    </h4>
                    {/* Solo le sorgenti XP realmente implementate (gamification.ts):
                        la vecchia tabella prometteva 6 voci di cui 4 inesistenti
                        e 2 con valori doppi rispetto al codice. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-indigo-50/50">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">🎧 Ascolto Audioguida</span>
                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">+10 XP</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-indigo-50/50">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">📸 Scansione Vision AI</span>
                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">+5 XP</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-indigo-50/50">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">🎯 Trivia dei luoghi</span>
                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">XP bonus</span>
                      </div>
                    </div>
                  </div>

                  {/* Sfide / Missioni - Grid 2 Colonne */}
                  <div className="space-y-3">
                    <h4 className="font-black text-gray-900 flex items-center gap-2">
                      <Target className="w-5 h-5 text-gray-400" />
                      Achievement Esplorativi
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {gamificationChallenges.map(challenge => {
                        const visits = listeningHistory.filter(h => 
                          challenge.category_trigger === 'all' || h.category === challenge.category_trigger
                        ).length;
                        
                        const isCompleted = visits >= challenge.threshold;
                        const progress = Math.min(100, (visits / challenge.threshold) * 100);
                        
                        return (
                          <div key={challenge.id} className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between aspect-square">
                            <div className="relative z-10 flex-1">
                              <div className="text-3xl mb-2">{challenge.icon}</div>
                              <h5 className="font-black text-gray-900 text-sm leading-tight mb-1 line-clamp-2">{challenge.name}</h5>
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 line-clamp-2">
                                Visita {challenge.threshold} luoghi ({challenge.category_trigger === 'all' ? 'Tutti' : (challenge.category_trigger || '').replace(/_/g, ' ')})
                              </p>
                            </div>
                            
                            <div className="relative z-10 mt-auto">
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-1.5">
                                <div 
                                  className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-green-500' : 'bg-[#D4AF37]'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                                <span className={isCompleted ? 'text-green-600' : 'text-gray-400'}>
                                  {visits} / {challenge.threshold}
                                </span>
                                {(challenge.reward_credits || 0) > 0 && !isCompleted && (
                                  <span className="text-gray-400">
                                    +{challenge.reward_credits} 🪙
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {isCompleted && (
                              <div className="absolute inset-0 bg-green-50/20 pointer-events-none border-2 border-green-500/20 rounded-3xl" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {gamificationChallenges.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6 font-medium">
                        Non ci sono missioni attive al momento.
                      </p>
                    )}
                  </div>
                  
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'cronologia' && (
            <motion.div
              key="cronologia"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
                {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                    <Loader2 className="w-10 h-10 animate-spin mb-4" />
                    <p className="font-bold text-sm tracking-tight">{getTranslation('loading_history', language)}</p>
                  </div>
                ) : listeningHistory.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                      <Volume2 className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="font-black text-gray-900 text-xl mb-2">{getTranslation("no_history", language) || "Nessun ascolto"}</h3>
                    <p className="text-sm text-gray-500 font-bold max-w-xs">
                      {getTranslation('audio_history_desc', language)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(
                      listeningHistory.reduce((acc, item) => {
                        // 'today_at' vale "Oggi alle " (stringa per un orario):
                        // come intestazione di gruppo serve solo "Oggi".
                        const dateStr = new Date(item.listened_at).toDateString() === new Date().toDateString()
                          ? (language === 'IT' ? 'Oggi' : 'Today')
                          : new Date(item.listened_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
                        if (!acc[dateStr]) acc[dateStr] = [];
                        acc[dateStr].push(item);
                        return acc;
                      }, {} as any)
                    ).map(([date, items]: any) => (
                      <div key={date}>
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 sticky top-0 bg-[#f8f5f0] py-2 z-10">{date}</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {items.map((item, idx) => {
                            // POI completo dal repository (null se sparito dal DB / offline)
                            const fullPoi = historyPoiDetails.get(String(item.poi_id)) || null;
                            const cardDescription = fullPoi?.description_ai || fullPoi?.description_short || fullPoi?.description || null;
                            return (
                            <div
                              key={item.id || item.poi_id + idx}
                              className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
                              onClick={() => onSelectPoi?.(fullPoi || { id: item.poi_id, name: item.poi_name, category: item.category })}
                            >
                              <div className="relative h-28 shrink-0 bg-gray-100 overflow-hidden">
                                {(item.image_url || fullPoi?.image_url) ? (
                                  <img src={item.image_url || fullPoi?.image_url} alt={item.poi_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1522083111811-0985223abac3?auto=format&fit=crop&q=80&w=400'; }} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                    <span className="text-4xl opacity-50">{getCardIcon({ category: item.category })}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                                
                                <div className="absolute top-2 right-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm("Vuoi rimuovere questo ascolto dalla cronologia?")) {
                                        // Promise gestita: se la delete fallisce l'utente lo sa
                                        // e la lista viene ricaricata (prima la voce spariva
                                        // dalla UI ma restava nel DB).
                                        deleteListeningHistory(item.poi_id, currentUserId).catch(() => {
                                          alert('Rimozione non riuscita, riprova.');
                                          fetchListeningHistoryData();
                                        });
                                      }
                                    }}
                                    className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1">
                                  <span className="bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-gray-900 shadow-sm flex items-center gap-1 truncate max-w-[80%]">
                                    <span className="text-[10px]">{getCardIcon({ category: item.category })}</span>
                                    {(item.category || 'luogo').replace(/_/g, ' ')}
                                  </span>
                                </div>
                              </div>
                              <div className="p-3 bg-white flex-1 flex flex-col">
                                <h4 title={item.poi_name} className="font-black text-gray-900 line-clamp-2 text-sm leading-tight">{item.poi_name}</h4>
                                {cardDescription && (
                                  <p className="text-[10px] text-gray-500 leading-snug line-clamp-3 mt-1">{cardDescription}</p>
                                )}
                                <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                                  <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                    <Volume2 className="w-3 h-3" />
                                    {new Date(item.listened_at).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                  {fullPoi ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRelisten(item, fullPoi);
                                      }}
                                      className="flex items-center gap-1 bg-primary text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-full shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                                      title={language === 'IT' ? 'Riascolta (già acquistato)' : 'Listen again (already purchased)'}
                                    >
                                      <Headphones className="w-3 h-3" />
                                      {language === 'IT' ? 'Riascolta' : 'Replay'}
                                    </button>
                                  ) : (
                                    <span className="text-[9px] font-bold text-gray-300 uppercase tracking-wider">
                                      {language === 'IT' ? 'Non disponibile' : 'Unavailable'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );})}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </motion.div>
          )}

          {activeTab === 'livetour' && (
            <LiveTourPanel />
          )}

          {activeTab === 'guida' && (
             <AppGuide language={language} />
          )}

          {activeTab === 'supporto' && (
            <motion.div
              key="supporto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <LifeBuoy className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">Centro Assistenza</h2>
                    <p className="text-sm font-bold text-gray-400">Siamo qui per aiutarti</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <a href="mailto:wip15775@gmail.com" className="flex items-center gap-4 p-6 bg-gray-50 rounded-3xl border border-transparent hover:border-blue-200 transition-all group">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-blue-600 transition-colors shadow-sm">
                      <Mail className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-gray-900">Email di Assistenza</h4>
                      <p className="text-xs font-bold text-gray-400">Risposta entro 24 ore lavorative</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </a>

                  {/* Segnalazione tecnica: mailto precompilato con i dati
                      diagnostici del dispositivo (prima la card era senza
                      handler: un bottone morto con cursor-pointer). */}
                  <button
                    type="button"
                    onClick={() => {
                      const diag = [
                        `App: WIP / World in Pocket`,
                        `Piattaforma: ${Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'}`,
                        `Lingua: ${language}`,
                        `User Agent: ${navigator.userAgent}`,
                        `Data: ${new Date().toISOString()}`,
                      ].join('\n');
                      const body = encodeURIComponent(
                        `Descrivi qui il problema (cosa stavi facendo, cosa è successo):\n\n\n--- Dati diagnostici (non cancellare) ---\n${diag}`
                      );
                      window.location.href = `mailto:wip15775@gmail.com?subject=${encodeURIComponent('Segnalazione problema tecnico WIP')}&body=${body}`;
                    }}
                    className="flex items-center gap-4 p-6 bg-gray-50 rounded-3xl border border-transparent hover:border-blue-200 transition-all group cursor-pointer text-left w-full"
                  >
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-blue-600 transition-colors shadow-sm">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-gray-900">Segnala un problema tecnico</h4>
                      <p className="text-xs font-bold text-gray-400">Email precompilata con i dati diagnostici del dispositivo</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </button>

                  {/* Scorciatoia al manuale d'uso */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('guida')}
                    className="flex items-center gap-4 p-6 bg-gray-50 rounded-3xl border border-transparent hover:border-blue-200 transition-all group cursor-pointer text-left w-full"
                  >
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-blue-600 transition-colors shadow-sm">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-gray-900">Manuale d'uso dell'app</h4>
                      <p className="text-xs font-bold text-gray-400">Tutte le funzioni spiegate passo passo (anche in PDF)</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </button>

                  <div className="p-6 bg-blue-600 rounded-3xl text-white shadow-lg shadow-blue-600/20">
                    <div className="flex items-center gap-3 mb-3">
                      <Info className="w-5 h-5" />
                      <h4 className="font-black uppercase tracking-widest text-xs">Informazioni Legali</h4>
                    </div>
                    <p className="text-xs font-bold opacity-90 leading-relaxed mb-4">
                      ItaInta / WIP — World in Pocket<br/>
                      Carrara (MS), Italia
                    </p>
                    <button
                      className="text-[10px] font-black uppercase tracking-widest underline"
                      onClick={() => setActiveTab('privacy')}
                    >
                      Privacy & Termini d'uso
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'privacy' && (
             <PrivacyPolicy language={language} />
          )}

          {activeTab === 'impostazioni' && (
            <motion.div
              key="impostazioni"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <h3 className="text-xl font-black text-primary tracking-tight mb-4">{getTranslation("app_settings", language)}</h3>
              
              {/* Setup Consumi e Costi Dashboard Section */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-5 border-b border-gray-100/60 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Compass className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-on-surface">Consumi e Costi</h4>
                    <p className="text-[11px] font-bold text-on-surface-variant opacity-75">
                      Monitora i crediti consumati per ogni servizio a pagamento nel periodo di riferimento.
                    </p>
                  </div>
                </div>

                {/* Dashboard Consumi */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {/* Crediti Consumati */}
                  <div className="col-span-2 bg-blue-50/50 p-4 rounded-[2rem] border border-blue-100 shadow-sm">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-blue-800 mb-3 text-center">Crediti Consumati</h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {/* Costi derivati da PRICING_LIST (unica fonte di verità):
                          i moltiplicatori a mano si desincronizzavano al primo
                          cambio di listino. Chat e Podcast non hanno ancora un
                          contatore in user_quotas: mostrati come non tracciati. */}
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/70">
                        <span>Dettagli POI</span>
                        <span className="font-black text-blue-600">{quotaCounters.poi_details_used * PRICING_LIST.poi_detail} 🪙</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/70">
                        <span>Vision AI</span>
                        <span className="font-black text-blue-600">{quotaCounters.vision_used * PRICING_LIST.photo_search} 🪙</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/70">
                        <span>Itinerario AI</span>
                        <span className="font-black text-blue-600">{quotaCounters.itinerari_used * PRICING_LIST.itinerary_daily} 🪙</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/70">
                        <span>Audioguida</span>
                        <span className="font-black text-blue-600">{quotaCounters.audioguide_used * PRICING_LIST.audio_guide} 🪙</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/70">
                        <span>Guida PDF</span>
                        <span className="font-black text-blue-600">{quotaCounters.premium_guide_used * PRICING_LIST.premium_guide_daily} 🪙</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-blue-900/40">
                        <span>Chat & Podcast</span>
                        <span className="font-bold">non tracciati</span>
                      </div>
                    </div>
                  </div>

                  {/* Listino Rapido */}
                  <div className="col-span-2 bg-amber-50/50 p-4 rounded-[2rem] border border-amber-100 shadow-sm">
                    <h5 className="text-[11px] font-black uppercase tracking-widest text-amber-800 mb-1 text-center">Listino Servizi AI</h5>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-amber-900/60 text-center mb-4">Trasparenza totale sui tuoi consumi</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Wip - Esperto Viaggi</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">3 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">10 msg</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Dettagli POI</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">5 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">per luogo</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Vision AI</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">5 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">per scansione</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Itinerario AI</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">10 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">al giorno</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Audioguida</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">15 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">per luogo</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Podcast AI</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">15 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">al giorno</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-amber-900/70">
                        <span>Guida PDF</span>
                        <div className="text-right leading-tight">
                          <span className="font-black text-amber-600 text-xs block">20 🪙</span>
                          <span className="text-[8px] opacity-70 uppercase">al giorno</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-amber-200/50 text-center">
                      <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest">
                        I crediti non scadono mai &bull; Utilizzo e Consigli sono sempre gratuiti
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sezione Crediti Guadagnati con Gamification */}
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-green-500" />
                    <h4 className="font-black text-primary uppercase tracking-wider text-xs">Crediti Guadagnati con Gamification</h4>
                  </div>
                  <div className="bg-green-50 p-4 rounded-3xl flex items-center justify-between border border-green-100 shadow-sm">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-green-800 mb-1 block">Saldo Premi</span>
                      <span className="text-xs font-bold text-green-700/70">Punti XP convertiti in vantaggi</span>
                    </div>
                    <div className="text-right flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-green-200">
                      <span className="text-2xl font-black text-green-600">{profile?.earned_credits || 0}</span>
                      <span className="text-xl">🪙</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("personal_area", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("personal_desc", language)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 relative z-0">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-2 mb-1 block">{getTranslation("display_name", language)}</label>
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => {
                         setUserName(e.target.value);
                         localStorage.setItem('userProfileName', e.target.value);
                         syncProfileToCloud(e.target.value, userAvatar);
                      }}
                      className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-[#1e3a8a]/20"
                      placeholder="Il tuo nome"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-2 mb-1 block">{getTranslation("profile_photo", language)}</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={userAvatar}
                        onChange={(e) => {
                           setUserAvatar(e.target.value);
                           localStorage.setItem('userProfileAvatar', e.target.value);
                           syncProfileToCloud(userName, e.target.value);
                        }}
                        className="flex-1 w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-[#1e3a8a]/20"
                        placeholder="es. 👤 o URL"
                      />
                      <label className="bg-primary/10 hover:bg-primary/20 text-primary px-4 rounded-xl flex items-center justify-center cursor-pointer font-bold text-sm transition-colors whitespace-nowrap">
                        {getTranslation("browse", language)}
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageUpload} 
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sicurezza: cambio password + sblocco biometrico */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">Sicurezza</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">Password e sblocco rapido</p>
                  </div>
                </div>

                {biometricAvailable && (
                  <div className="flex items-center justify-between bg-[#f8f5f0] rounded-xl p-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-sm font-bold text-on-surface">Sblocco con impronta / volto</p>
                        <p className="text-[10px] font-bold text-on-surface-variant/60">Accesso rapido senza reinserire la password</p>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleBiometric}
                      className={`w-12 h-7 rounded-full transition-colors relative ${biometricEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      aria-label="Attiva o disattiva lo sblocco biometrico"
                    >
                      <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${biometricEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}

                {isEmailProvider ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary/60 ml-1">
                      <Lock className="w-3.5 h-3.5" /> Cambia password
                    </div>
                    <input
                      type="password"
                      value={secCurrentPw}
                      onChange={(e) => setSecCurrentPw(e.target.value)}
                      className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-[#1e3a8a]/20"
                      placeholder="Password attuale"
                    />
                    <input
                      type="password"
                      value={secNewPw}
                      onChange={(e) => setSecNewPw(e.target.value)}
                      className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-[#1e3a8a]/20"
                      placeholder="Nuova password (min 6 caratteri)"
                    />
                    <input
                      type="password"
                      value={secConfirmPw}
                      onChange={(e) => setSecConfirmPw(e.target.value)}
                      className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-[#1e3a8a]/20"
                      placeholder="Conferma nuova password"
                    />
                    <button
                      onClick={handleChangePassword}
                      disabled={secLoading || !secCurrentPw || !secNewPw}
                      className="bg-primary text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {secLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Aggiorna password
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-on-surface-variant/70 bg-[#f8f5f0] rounded-xl p-3">
                    Accedi con Google: la password si gestisce dal tuo account Google.
                  </p>
                )}
              </div>

              {/* Selezionatore Lingua */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("language_title", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("language_desc", language)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 relative z-0">
                  {Object.entries(LANGUAGES).map(([code, langObj]) => {
                    const isSelected = language === code;
                    return (
                      <button
                        key={code}
                        onClick={() => setLanguage(code as Language)}
                        className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? "bg-primary/5 border-primary text-primary shadow-sm font-black scale-[1.02]"
                            : "bg-[#f8f5f0] border-transparent hover:bg-primary/10 hover:border-gray-200 text-on-surface-variant/80 font-bold"
                        }`}
                      >
                        <span className="text-xl">{langObj.flag}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs leading-none font-black truncate">{langObj.label}</span>
                          <span className="text-[9px] text-on-surface-variant/60 uppercase font-bold mt-1 tracking-widest">{code}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("default_location", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("default_location_desc", language)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 relative z-0">
                   <div className="bg-[#f8f5f0] p-3 rounded-2xl flex flex-col gap-2">
                      <div className="text-xs font-bold text-on-surface-variant flex flex-col">
                        <span>Latitudine: {defaultLocation[0].toFixed(4)}</span>
                        <span>Longitudine: {defaultLocation[1].toFixed(4)}</span>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={citySearch}
                          onChange={(e) => setCitySearch(e.target.value)}
                          placeholder={getTranslation("search_city", language)}
                          className="flex-1 px-3 py-2 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                          onKeyDown={(e) => e.key === 'Enter' && searchCityLocation()}
                        />
                        <button
                          onClick={searchCityLocation}
                          disabled={isSearchingCity || !citySearch.trim()}
                          className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                        >
                          {isSearchingCity ? getTranslation("searching", language) : getTranslation("search_btn", language)}
                        </button>
                      </div>
                   </div>
                   <button 
                     onClick={() => {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              setDefaultLocation([position.coords.latitude, position.coords.longitude]);
                              alert(getTranslation('loc_updated', language));
                            },
                            (error) => {
                              console.error("Error getting location", error);
                              alert(getTranslation('loc_error', language));
                            },
                            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                          );
                        } else {
                          alert(getTranslation('loc_unsupported', language));
                        }
                     }}
                     className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow-md"
                   >
                     <Search className="w-4 h-4" />
                     {getTranslation("use_current_location", language)}
                   </button>
                   <p className="text-[10px] text-center text-on-surface-variant/60 font-medium mt-1">
                     {getTranslation("default_location_hint", language)}
                   </p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Gift className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("have_coupon", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("redeem_coupon_desc", language)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="es. CAV2026"
                      className="flex-1 bg-[#f8f5f0] border-none rounded-xl p-3 text-xs font-black uppercase tracking-widest placeholder:lowercase focus:ring-2 focus:ring-[#1e3a8a]/20"
                      disabled={couponLoading}
                    />
                    <button
                      onClick={handleRedeemCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="bg-primary hover:opacity-90 disabled:opacity-50 text-white px-5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                    >
                      {couponLoading ? getTranslation("redeem_verifying", language) : getTranslation("redeem_btn", language)}
                    </button>
                  </div>

                  {couponMessage && (
                    <div className={`p-3 rounded-xl text-xs font-bold ${
                      couponMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                    }`}>
                      {couponMessage.text}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("guide_mode", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("guide_mode_desc", language)}</p>
                  </div>
                </div>
                
                <div className="flex bg-[#f8f5f0] p-1 rounded-2xl gap-1 relative z-0">
                   <button 
                     onClick={() => setGuideMode('nicky')}
                     className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all relative z-10 ${guideMode === 'nicky' ? 'bg-white shadow-md text-on-surface' : 'text-on-surface-variant/50 hover:bg-white/50'}`}
                   >
                     <img 
                        src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop"
                        alt="Nicky" 
                        className="w-8 h-8 rounded-full object-cover mb-2 border border-secondary shadow-sm"
                     />
                     <span className="text-[10px] font-black uppercase tracking-widest">Nicky</span>
                     <span className="text-[9px] font-bold text-on-surface-variant/70 mt-1">Trendy & Fun</span>
                   </button>
                   <button 
                     onClick={() => setGuideMode('dante')}
                     className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all relative z-10 ${guideMode === 'dante' ? 'bg-white shadow-md text-on-surface' : 'text-on-surface-variant/50 hover:bg-white/50'}`}
                   >
                     <img 
                        src="/Portrait_de_Dante.jpg"
                        alt="Dante" 
                        className="w-8 h-8 rounded-full object-cover mb-2 border border-primary shadow-sm object-top"
                     />
                     <span className="text-[10px] font-black uppercase tracking-widest">Dante</span>
                     <span className="text-[9px] font-bold text-on-surface-variant/70 mt-1">Guida Classica</span>
                   </button>
                </div>
              </div>

              {/* ADVANCED GEOCONTROL PANEL */}
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm mt-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
                    <Settings className="w-5 h-5 animate-spin-slow" />
                  </div>
                  <div>
                    <h4 className="font-black text-on-surface">{getTranslation("geocontrol_title", language)}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-70">{getTranslation("geocontrol_desc", language)}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Activation Mode Selector */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-2 mb-2 block">
                      {getTranslation("activation_mode", language)}
                    </label>
                    <div className="flex bg-[#f8f5f0] p-1 rounded-2xl gap-1">
                      <button
                        onClick={() => handleActivationModeChange('automatic')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activationMode === 'automatic'
                            ? "bg-primary text-white shadow-sm"
                            : "text-primary/60 hover:bg-white/40"
                        }`}
                      >
                        {getTranslation("activation_auto", language)}
                      </button>
                      <button
                        onClick={() => handleActivationModeChange('semi-automatic')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activationMode === 'semi-automatic'
                            ? "bg-primary text-white shadow-sm"
                            : "text-primary/60 hover:bg-white/40"
                        }`}
                      >
                        {getTranslation("activation_semi", language)}
                      </button>
                    </div>
                    {activationMode === 'automatic' && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-800 leading-tight text-center">
                          ⚠️ Attenzione: La modalità automatica scarica {PRICING_LIST.audio_guide} crediti ad ogni nuovo POI. L'ascolto automatico in background funziona correttamente solo sull'App nativa Android (non su browser web/PWA).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Numerical Distances Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Walk Alert Distance */}
                    <div className="bg-[#f8f5f0] p-3 rounded-2xl flex flex-col items-center">
                      <span className="text-[9px] font-black text-primary/75 uppercase tracking-wider text-center leading-tight mb-2">
                        {getTranslation("dist_walk_label", language)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDistChange('walkAlert', distWalk - 10, setDistWalk)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          -
                        </button>
                        <div className="flex items-center gap-0.5 font-mono font-black text-xs text-primary">
                          <input 
                            type="number"
                            value={distWalk === 0 ? '' : distWalk}
                            onChange={(e) => handleDirectDistChange('walkAlert', e.target.value, setDistWalk)}
                            style={{ width: '36px', textAlign: 'center', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid rgba(30, 58, 138, 0.2)', color: '#1e3a8a', fontWeight: 900, fontFamily: 'monospace', fontSize: '12px', outline: 'none' }}
                            min="1"
                          />
                          <span>m</span>
                        </div>
                        <button
                          onClick={() => handleDistChange('walkAlert', distWalk + 10, setDistWalk)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Car Alert Distance */}
                    <div className="bg-[#f8f5f0] p-3 rounded-2xl flex flex-col items-center">
                      <span className="text-[9px] font-black text-primary/75 uppercase tracking-wider text-center leading-tight mb-2">
                        {getTranslation("dist_car_label", language)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDistChange('carAlert', distCar - 20, setDistCar)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          -
                        </button>
                        <div className="flex items-center gap-0.5 font-mono font-black text-xs text-primary">
                          <input 
                            type="number"
                            value={distCar === 0 ? '' : distCar}
                            onChange={(e) => handleDirectDistChange('carAlert', e.target.value, setDistCar)}
                            style={{ width: '42px', textAlign: 'center', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid rgba(30, 58, 138, 0.2)', color: '#1e3a8a', fontWeight: 900, fontFamily: 'monospace', fontSize: '12px', outline: 'none' }}
                            min="1"
                          />
                          <span>m</span>
                        </div>
                        <button
                          onClick={() => handleDistChange('carAlert', distCar + 20, setDistCar)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Guide Start Distance */}
                    <div className="bg-[#f8f5f0] p-3 rounded-2xl flex flex-col items-center">
                      <span className="text-[9px] font-black text-primary/75 uppercase tracking-wider text-center leading-tight mb-2">
                        {getTranslation("dist_start_label", language)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDistChange('start', distStart - 5, setDistStart)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          -
                        </button>
                        <div className="flex items-center gap-0.5 font-mono font-black text-xs text-primary">
                          <input 
                            type="number"
                            value={distStart === 0 ? '' : distStart}
                            onChange={(e) => handleDirectDistChange('start', e.target.value, setDistStart)}
                            style={{ width: '36px', textAlign: 'center', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid rgba(30, 58, 138, 0.2)', color: '#1e3a8a', fontWeight: 900, fontFamily: 'monospace', fontSize: '12px', outline: 'none' }}
                            min="1"
                          />
                          <span>m</span>
                        </div>
                        <button
                          onClick={() => handleDistChange('start', distStart + 5, setDistStart)}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center font-black text-sm text-primary hover:bg-primary/5 shadow-sm active:scale-90 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reset audioguide ascoltate (anti-ripetizione geofencing) */}
                  <div className="border-t border-primary/10 pt-4 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleResetPlayed}
                      className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-white border border-primary/15 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary shadow-sm hover:border-primary/30 transition-all"
                    >
                      <History size={15} />
                      {playedResetMsg ? 'Fatto ✓' : 'Azzera Storico'}
                    </button>
                    <button
                      onClick={() => setShowTtsTestPanel(v => !v)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary border border-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-primary/90 transition-all"
                    >
                      <Volume2 size={15} />
                      Test Voce Azure
                    </button>
                  </div>
                  <p className="text-[9px] text-primary/55 ml-2 leading-tight">
                    Azzera la memoria dei POI gia' ascoltati oppure testa le voci Azure per ogni guida e lingua.
                  </p>

                  {/* Pannello test voci Azure: ogni combinazione guida × lingua chiama
                      la route TTS reale (/api/tts/azure) e riporta ok/errore.
                      Tap su una cella = test singolo con riproduzione audio. */}
                  {showTtsTestPanel && (
                    <div className="mt-3 bg-white border border-primary/15 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                          Voci neurali Azure
                        </span>
                        <button
                          onClick={runAllTtsVoiceTests}
                          disabled={isTtsTestingAll}
                          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                        >
                          {isTtsTestingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                          {isTtsTestingAll ? 'Test in corso…' : 'Testa tutte'}
                        </button>
                      </div>
                      {TTS_TEST_GUIDES.map(g => (
                        <div key={g}>
                          <p className="text-[9px] font-black uppercase tracking-widest text-primary/50 mb-1.5 ml-1">
                            {g === 'nicky' ? 'Nicky (voce femminile)' : 'Dante (voce maschile)'}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {TTS_TEST_LANGS.map(l => {
                              const r = ttsTestResults[`${l}_${g}`];
                              const cls = !r
                                ? 'bg-gray-50 border-gray-200 text-gray-500'
                                : r.status === 'pending'
                                  ? 'bg-amber-50 border-amber-300 text-amber-700 animate-pulse'
                                  : r.status === 'ok'
                                    ? 'bg-green-50 border-green-400 text-green-700'
                                    : 'bg-red-50 border-red-400 text-red-700';
                              return (
                                <button
                                  key={l}
                                  onClick={() => runTtsVoiceTest(l, g, true)}
                                  disabled={r?.status === 'pending'}
                                  title={r?.message || `Prova ${l} · ${g}`}
                                  className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black tracking-wider flex items-center gap-1 transition-colors ${cls}`}
                                >
                                  {l}
                                  {r?.status === 'ok' && <Check className="w-3 h-3" />}
                                  {r?.status === 'error' && <X className="w-3 h-3" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {Object.keys(ttsTestResults).some(k => ttsTestResults[k].status === 'error') && (
                        <div className="border-t border-red-100 pt-2 space-y-1">
                          {Object.keys(ttsTestResults).filter(k => ttsTestResults[k].status === 'error').map(k => (
                            <p key={k} className="text-[9px] font-bold text-red-600 leading-tight">
                              {k.replace('_', ' · ')}: {ttsTestResults[k].message}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="text-[8px] text-primary/45 leading-tight">
                        Tocca una lingua per sentire la voce. Il test chiama direttamente Azure Speech: verde = sintesi riuscita, rosso = errore (chiave/region/voce).
                      </p>
                    </div>
                  )}

                  {/* Simplified Category Toggles */}
                  <div className="border-t border-primary/10 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 ml-2 block">
                        Categorie Audioguida
                      </label>
                      <button
                        onClick={() => {
                          const allChecked = activeSubcats.monumenti && activeSubcats.musei && activeSubcats.panorami && activeSubcats.chiese && activeSubcats.consigli;
                          setActiveSubcats({
                            monumenti: !allChecked,
                            musei: !allChecked,
                            panorami: !allChecked,
                            chiese: !allChecked,
                            consigli: !allChecked
                          });
                          localStorage.setItem('wip_active_subcategories', JSON.stringify({
                            monumenti: !allChecked,
                            musei: !allChecked,
                            panorami: !allChecked,
                            chiese: !allChecked,
                            consigli: !allChecked
                          }));
                          window.dispatchEvent(new CustomEvent('wip-settings-updated'));
                        }}
                        className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2 py-1 rounded-md active:scale-95 transition-transform"
                      >
                        {activeSubcats.monumenti && activeSubcats.musei && activeSubcats.panorami && activeSubcats.chiese && activeSubcats.consigli ? "Deseleziona Tutti" : "Seleziona Tutti"}
                      </button>
                    </div>

                     {/* Standing Premium Toggle for Gemme Esclusive */}
                     <div className="mb-4 bg-white border border-primary/15 p-3.5 rounded-2xl flex items-center justify-between shadow-sm hover:border-primary/30 transition-all select-none">
                       <div className="flex items-center gap-2.5">
                         <span className="text-lg">💎</span>
                         <div className="flex flex-col">
                           <span className="text-xs font-black text-primary tracking-tight">
                             {language === 'EN' ? 'EXCLUSIVE GEMS' : language === 'FR' ? 'GEMMES EXCLUSIVES' : language === 'ES' ? 'GEMAS EXCLUSIVAS' : language === 'RU' ? 'ЭКСКЛЮЗИВНЫЕ ЖЕМЧУЖИНЫ' : language === 'ZH' ? '专属隐藏瑰宝 (GEMS)' : 'GEMME ESCLUSIVE'}
                           </span>
                           <span className="text-[9px] font-bold text-primary/65 uppercase tracking-wide leading-none mt-0.5">
                             {language === 'EN' ? 'Absolute Default • Recommended' : language === 'FR' ? 'Défaut Absolu • Recommandé' : language === 'ES' ? 'Predeterminato • Recomendado' : language === 'RU' ? 'Рекомендуется по умолчанию' : language === 'ZH' ? '系统推荐 • 默认激活' : 'Default Assoluto • Sempre Attive'}
                           </span>
                         </div>
                       </div>
                       <input
                         type="checkbox"
                         checked={true}
                         disabled
                         className="w-5 h-5 rounded-md accent-[#1e3a8a] border-2 border-primary/20 focus:ring-0 opacity-60 cursor-not-allowed"
                       />
                     </div>

                     <div className="space-y-2 bg-[#f8f5f0] p-3 rounded-2xl border border-outline-variant/5">
                        <SubcatItem label="Monumenti & Castelli" isChecked={!!activeSubcats.monumenti} onToggle={() => toggleSubcat('monumenti')} />
                        <SubcatItem label="Musei & Gallerie" isChecked={!!activeSubcats.musei} onToggle={() => toggleSubcat('musei')} />
                        <SubcatItem label="Panorami & Parchi" isChecked={!!activeSubcats.panorami} onToggle={() => toggleSubcat('panorami')} />
                        <SubcatItem label="Chiese & Luoghi di Culto" isChecked={!!activeSubcats.chiese} onToggle={() => toggleSubcat('chiese')} />
                        <div className="border-t border-primary/10 mt-2 pt-2">
                           <SubcatItem label="Consigli & Info (Gratuiti)" isChecked={!!activeSubcats.consigli} onToggle={() => toggleSubcat('consigli')} />
                           <p className="text-[9px] text-primary/50 leading-tight mt-1 ml-1">Questi POI speciali non consumano il credito delle audioguide.</p>
                        </div>
                     </div>
                  </div>
                </div>
              </div>

              {onSignOut && (
                <div className="pt-4 flex flex-col gap-3 justify-center mb-8">
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      // Su dispositivo condiviso i dati dell'utente precedente
                      // (email, crediti, luoghi visitati) restavano su disco.
                      ['wip_user_profile', 'userProfileName', 'userProfileAvatar', 'wip_user_xp']
                        .forEach(k => localStorage.removeItem(k));
                      onSignOut();
                    }}
                    className="px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shrink-0 w-full shadow-sm"
                  >
                    {getTranslation("signout", language)}
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shrink-0 w-full shadow-sm"
                  >
                    Elimina Account
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'offline' && (
            <motion.div
              key="offline"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <OfflineMapsTab language={language} />
            </motion.div>
          )}

          {activeTab === 'pricing' && (
            <motion.div
              key="pricing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 -m-6 h-[calc(100dvh-160px)]"
            >
              {/* ShopScreen è l'unico negozio funzionante: Google Play/RevenueCat
                  su Android e Stripe Checkout via server sul web. Il vecchio
                  componente Pricing era bloccato su app nativa ("disponibili a
                  breve") e usava una chiave Stripe di TEST hardcoded. */}
              <ShopScreen
                userId={userSession?.user?.id || 'mock-user-id'}
                language={String(language)}
                onClose={() => setActiveTab('diario')}
              />
            </motion.div>
          )}

          {activeTab === 'listino' && (
             <PriceList language={language} onOpenShop={() => setActiveTab('pricing')} />
          )}

          {activeTab === 'b2b' && (
            <motion.div
              key="b2b"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <B2BPartner userSession={userSession} language={language} />
            </motion.div>
          )}

          {activeTab === 'admin' && profile?.is_admin && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <AdminPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gamification Popup */}
      {gamificationPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-yellow-400/20 to-transparent pointer-events-none" />
            <div className="text-6xl mb-4 relative z-10 animate-bounce">{gamificationPopup.icon}</div>
            <h2 className="text-2xl font-black text-primary mb-2">{gamificationPopup.title}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">
              Hai completato l'obiettivo! Ecco i tuoi premi bonus (senza scadenza).
            </p>

            <div className="flex justify-center gap-3 mb-8">
              {(gamificationPopup.rewards.credits || 0) > 0 ? (
                <div className="bg-amber-50 text-amber-700 px-5 py-3 rounded-xl text-xs font-black flex flex-col items-center border border-amber-200">
                  <span className="text-2xl">+{gamificationPopup.rewards.credits} 🪙</span>
                  <span className="uppercase text-[9px] opacity-70 mt-1">Crediti bonus</span>
                </div>
              ) : (
                <div className="bg-gray-50 text-gray-500 px-3 py-2 rounded-xl text-xs font-black">
                  Nessun premio materiale, ma tanta gloria!
                </div>
              )}
            </div>

            <button 
              onClick={async () => {
                try {
                  setIsClaiming(true);
                  const popupData = gamificationPopup;

                  // Riscatto SERVER-SIDE: valida il requisito e accredita i
                  // crediti con la service key (il client non può scrivere
                  // earned_credits per le policy di sicurezza). Il popup si
                  // chiude solo a successo: prima un insert fallito lo faceva
                  // ricomparire a ogni apertura del tab.
                  const { data: sessionData } = await supabase.auth.getSession();
                  const token = sessionData?.session?.access_token;
                  if (!token) throw new Error('Accedi per riscattare i premi.');
                  const res = await fetch(getApiUrl('/api/gamification/claim'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ type: popupData.type, id: popupData.idToClaim })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data?.error || 'Riscatto non riuscito');

                  setGamificationPopup(null);
                  window.dispatchEvent(new CustomEvent('wip-credits-updated'));
                  await fetchQuotaCounters();
                } catch (e: any) {
                  console.error("Error claiming reward:", e);
                  alert(e?.message || 'Riscatto non riuscito, riprova.');
                } finally {
                  setIsClaiming(false);
                }
              }}
              disabled={isClaiming}
              className="w-full py-4 bg-gradient-to-r from-[#1e3a8a] to-blue-600 hover:opacity-90 disabled:opacity-50 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 flex items-center justify-center gap-2"
            >
              {isClaiming ? <Loader2 className="w-5 h-5 animate-spin" /> : 'RISCATTA PREMI'}
            </button>
          </motion.div>
        </div>
      )}

      {/* Guide PDF Modal */}
      {guideToRender && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative">
            <div className="p-4 bg-primary text-white flex justify-between items-center z-10 shrink-0 shadow-lg">
              <h3 className="font-black text-lg">Guida Premium</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setIsPdfLoading(true);
                    try {
                      const container = document.getElementById('premium-guide-viewer-container');
                      if (container) container.style.overflow = 'visible';
                      // Nome file univoco legato alla guida (mai un nome fisso)
                      const titolo = guideToRender?.content?.guida_titolo || 'Guida';
                      const filename = `WIP_${String(titolo).replace(/[^a-zA-Z0-9àèéìòù ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)}.pdf`;
                      await downloadGuideAsPdf('premium-guide-pdf-inner', filename);
                    } catch (e) {
                      console.error("PDF Download failed", e);
                      // Prima falliva in silenzio (specie su Android WebView)
                      alert('Generazione PDF non riuscita su questo dispositivo. Puoi leggere la guida qui nel visualizzatore.');
                    } finally {
                      const container = document.getElementById('premium-guide-viewer-container');
                      if (container) container.style.overflow = 'auto';
                      setIsPdfLoading(false);
                    }
                  }}
                  disabled={isPdfLoading}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors flex items-center gap-2"
                >
                  {isPdfLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  <span className="text-sm font-black hidden sm:inline">SCARICA PDF</span>
                </button>
                <button
                  onClick={() => setGuideToRender(null)}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100 p-2 sm:p-8" id="premium-guide-viewer-container">
              <PremiumGuideRenderer
                content={guideToRender.content}
                mediaManifest={guideToRender.media}
                language={language}
                containerId="premium-guide-pdf-inner"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl relative"
          >
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-center text-gray-900 mb-2">Sei sicuro?</h2>
            <p className="text-sm text-gray-500 text-center font-bold mb-6">
              Questa azione è irreversibile. Tutti i tuoi dati, crediti e progressi verranno eliminati definitivamente.
            </p>
            <div className="mb-6">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block text-center">
                Scrivi "elimina" per confermare
              </label>
              <input 
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center font-black text-gray-900 focus:outline-none focus:border-red-500 transition-colors"
                placeholder="elimina"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors"
              >
                Annulla
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.toLowerCase() !== 'elimina' || isDeleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Conferma'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isFreeFeaturesOpen && (
        <FreeFeaturesModal onClose={() => setIsFreeFeaturesOpen(false)} />
      )}

      <ProminentDisclosure
        isOpen={showDisclosure}
        language={language}
        onDecline={() => {
          setShowDisclosure(false);
          setPendingActivationMode(null);
        }}
        onAccept={() => {
          localStorage.setItem('wip_location_disclosure_accepted', 'true');
          setShowDisclosure(false);
          if (pendingActivationMode) {
            handleActivationModeChange(pendingActivationMode);
          }
        }}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-center gap-2 pb-3 border-b-2 transition-all cursor-pointer whitespace-nowrap px-1
        ${active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}
      `}
    >
      <div className={`flex items-center justify-center ${active ? 'text-gray-900' : 'text-gray-400'}`}>
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function PoiCard({ poi, onRemove, onClick }: { poi: any; onRemove: () => void; onClick?: () => void; key?: any }) {
  return (
    <motion.div 
      layout
      onClick={onClick}
      className="bg-white rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full"
    >
      <div className="h-40 w-full relative overflow-hidden bg-gray-50 p-2">
        <div className="w-full h-full rounded-3xl overflow-hidden relative">
          <AttractionImage 
            src={poi.image_url || poi.imageUrl || poi.photo_url || poi.thumbnail} 
            alt={poi.name} 
            category={poi.category || 'default'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-3 right-3 p-2 bg-white/30 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-colors z-10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          {getCardIcon(poi)}
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {poi.category || 'Monumento'}
          </span>
        </div>
        <h4 className="font-black text-gray-900 text-lg leading-tight mb-2">{poi.name}</h4>
        <p className="text-xs text-gray-500 font-medium leading-relaxed line-clamp-2">
          {poi.description || 'Nessuna descrizione disponibile per questo luogo.'}
        </p>
      </div>
    </motion.div>
  );
}

function SubcatItem({
  label,
  isChecked,
  onToggle
}: {
  label: string;
  isChecked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1 select-none">
      <span className="text-[11px] font-bold text-on-surface-variant/80">{label}</span>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded text-primary focus:ring-[#1e3a8a]/25 border-gray-300 cursor-pointer"
      />
    </div>
  );
}

