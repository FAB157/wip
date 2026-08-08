import { Trash2, User, History, Landmark, Check, MapPin, Calendar, Compass, Sparkles, Plus, X, RotateCcw, Save, Loader2, ListChecks, Map, Heart, Printer, Navigation, ChevronDown, ChevronUp, Download, Lock, Unlock, Headphones, ArrowUp, ArrowDown, Clock, Church, Utensils, Trees, AlertTriangle, ShieldAlert, Lightbulb, ThumbsUp, Ticket, Bus, Coffee, Wine, Wallet, Coins, LocateFixed, ArrowLeft, ExternalLink, Star, Radio, Square, Info, Eye, Play, Pause, SkipBack, RefreshCw, Globe, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { saveOfflineItinerary, getOfflineItinerariesList, getOfflineItinerary, deleteOfflineItinerary } from '../lib/offlineStorage';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { supabase } from '../lib/supabase';
import { useCreditConfirmation } from '../hooks/useCreditConfirmation';
import CreditConfirmationModal from './CreditConfirmationModal';
import { consumeCredits, PRICING_LIST, getWalletBalance, refundCredits } from '../lib/pricing';
import { printScoped } from '../lib/printScoped';
import { getApiUrl } from '../lib/api';
import { ensureAffiliateUrl, trackAffiliateClick } from '../lib/affiliates';
import QuotaLimitToast, { useQuotaToast } from './QuotaLimitToast';
import { Language, getTranslation } from '../lib/i18n';
import PrintView from './PrintView';
import { FAVORITES_EVENT } from '../lib/favorites';
import { useWalkingNavigation } from '../hooks/useWalkingNavigation';
import NavigationOverlay from './NavigationOverlay';
import PlanMap from './PlanMap';
import PremiumGuideModal from './PremiumGuideModal';
import AgentControls from './AgentControls';
import { useItinerary } from '../hooks/useItinerary';
import PremiumGuideRenderer from './PremiumGuideRenderer';
import { parsePartialJSON } from '../lib/partialJsonParser';
import OfflineAudioBundleModal from './OfflineAudioBundleModal';
import DayPassCard from './DayPassCard';
import ShopScreen from './ShopScreen';
import LoadingQuiz from './LoadingQuiz';
import { downloadGuideAsPdf } from '../services/premiumGuideService';
import { mapItineraryCategoryToMapCategory } from '../services/poiRepository';
import BudgetTable from './itinerary/BudgetTable';
import ItineraryStop from './itinerary/ItineraryStop';
import TravelInfo from './itinerary/TravelInfo';
async function processItineraryStream(
  url: string,
  body: any,
  onPartialData: (data: any) => void
): Promise<any> {
  const controller = new AbortController();
  // 30s per il primo byte: prima dello stream il server fa quota + RAG +
  // retrieval ristoranti (fino a ~6s) — con 20s i margini erano stretti.
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error("Timeout AI: Il server sta impiegando troppo tempo a rispondere. Riprova tra poco.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Stream non supportato");

  const decoder = new TextDecoder();
  let fullJson = "";
  let hasError = false;
  let errorMessage = "";
  
  // Timeout di sicurezza sul loop di lettura: se lo stream si blocca (es. DeepSeek idle)
  // non lasciamo la lambda e il browser appesi per sempre.
  // 120s: con 40s gli itinerari lunghi (4-5 giorni, 8+ tappe/giorno) venivano
  // troncati a metà streaming — il JSON riparato perdeva giorni interi.
  const streamTimeout = 120000;
  const streamStart = Date.now();

  while (true) {
    if (Date.now() - streamStart > streamTimeout) {
      reader.cancel();
      throw new Error("Timeout stream: L'IA ha impiegato troppo tempo a completare la risposta.");
    }

    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.trim().startsWith('data: ')) {
        const dataStr = line.trim().slice(6);
        if (dataStr === '[DONE]') break;
        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              hasError = true;
              errorMessage = parsed.error;
            } else if (parsed.text) {
              fullJson += parsed.text;
              const partialObj = parsePartialJSON(fullJson);
              if (partialObj && partialObj.giorni) {
                onPartialData(partialObj);
              }
            }
          } catch (e) {
            // Ignoriamo errori di parsing sui singoli chunk se l'intero JSON non è pronto
          }
        }
      }
    }
  }

  if (hasError) {
    throw new Error(errorMessage === "QUOTA_EXCEEDED"
      ? "Hai raggiunto il limite di itinerari. Riprova domani."
      : `Errore dal server AI: ${errorMessage}`);
  }

  if (!fullJson.trim()) {
    throw new Error("Il server AI non ha restituito dati. Riprova tra qualche secondo.");
  }

  // Tentativo 1: JSON valido completo
  let result: any = null;
  try {
    result = JSON.parse(fullJson);
  } catch (_) {}

  // Tentativo 2: ripara JSON troncato
  if (!result) {
    const repaired = parsePartialJSON(fullJson);
    if (repaired && (repaired.giorni || repaired.alternative)) {
      result = repaired;
    }
  }

  // Tentativo 3: estrai il primo oggetto JSON dal testo (a volte l'AI aggiunge testo prima/dopo)
  if (!result) {
    const match = fullJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        result = JSON.parse(match[0]);
      } catch (_) {}
    }
  }

  if (!result) {
    throw new Error("Risposta AI incompleta o non valida. Riprova — se il problema persiste prova con meno giorni o destinazione più semplice.");
  }

  // Verifica anti-allucinazione IN BACKGROUND: il risultato torna SUBITO
  // (l'utente vede l'itinerario appena finito lo streaming, zero attesa in
  // più); quando il server risponde coi marchi ✓/⚠ viene emesso l'evento
  // 'wip-itinerary-verified' e PlanScreen fonde i badge nelle tappe già a
  // schermo. Fail-open: se la verifica fallisce, semplicemente niente badge.
  if (result?.giorni?.length && body?.destination) {
    verifyItineraryAntiAllucinazioni(result, body)
      .then((verified) => {
        if (verified && verified !== result && verified.giorni) {
          window.dispatchEvent(new CustomEvent('wip-itinerary-verified', { detail: verified }));
        }
      })
      .catch(() => {});
  }
  return result;
}

/**
 * Fonde i marchi di verifica (verifica/nota_verifica + link rimossi) della
 * copia verificata dentro l'itinerario corrente, agganciandosi al titolo
 * della tappa: così eventuali modifiche fatte nel frattempo dall'utente
 * (spostamenti, cancellazioni) non vengono sovrascritte.
 */
function mergeVerificationMarks(current: any, verified: any): any {
  if (!current?.giorni || !verified?.giorni) return current;
  const marks = new Map<string, any>();
  verified.giorni.forEach((g: any) => (g?.tappe || []).forEach((t: any) => {
    const k = (t?.titolo_tappa || '').trim().toLowerCase();
    if (k && (t.verifica || t.nota_verifica)) marks.set(k, t);
  }));
  if (marks.size === 0) return current;
  return {
    ...current,
    giorni: current.giorni.map((g: any) => ({
      ...g,
      tappe: (g?.tappe || []).map((t: any) => {
        const m = marks.get((t?.titolo_tappa || '').trim().toLowerCase());
        if (!m) return t;
        const patched: any = { ...t, verifica: m.verifica, nota_verifica: m.nota_verifica };
        // Link bocciato dalla verifica server (irraggiungibile): via anche qui
        if (m.link_info === '' && t.link_info) patched.link_info = '';
        return patched;
      }),
    })),
  };
}

async function verifyItineraryAntiAllucinazioni(data: any, genBody: any): Promise<any> {
  try {
    if (!data?.giorni?.length || !genBody?.destination) return data;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch('/api/itinerary/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itinerary: data,
        destination: genBody.destination,
        lat: genBody.lat,
        lon: genBody.lon,
        radius: genBody.radius,
        specialRequests: genBody.specialRequests,
        interests: genBody.interests,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return data;
    const v = await res.json();
    if (v?.report?.flagged > 0) console.log(`[Verifica AI] ${v.report.flagged}/${v.report.checked} tappe segnalate`);
    return v?.itinerary?.giorni ? v.itinerary : data;
  } catch {
    return data;
  }
}

interface PlanScreenProps {
  resetCounter?: number;
  guideMode: 'nicky' | 'dante';
  setGuideMode: (mode: 'nicky' | 'dante') => void;
  itinerary: any[];
  onRemovePoi: (id: string | number) => any;
  onSelectPoi?: (poi: any) => void;
  isAudioGuideActive?: boolean;
  setIsAudioGuideActive?: (active: boolean) => void;
  language: Language;
}

interface ItineraryDay {
  giorno: number;
  tappe: Array<{
    id_tappa: string;
    ora: string;
    titolo_tappa: string;
    attivita: string;
    consiglio_guida: string;
    tempo_necessario?: string;
    spostamento_precedente?: string | null;
    tipo: string;
    coordinate: { lat: number; lng: number };
  }>;
}

interface GeneratedItinerary {
  id?: string;
  titolo: string;
  giorni: ItineraryDay[];
  info_viaggio?: {
    zone_da_evitare?: string[];
    raccomandazioni?: string[];
    suggerimenti?: string[];
    precauzioni?: string[];
  };
}

const getCategoryIconAndBg = (poi: any) => {
  const cat = (poi.category || '').toLowerCase();
  const name = (poi.name || poi.title || '').toLowerCase();
  const desc = (poi.description || poi.attivita || '').toLowerCase();
  
  // 1. Chiese / Chiesa / Religious
  if (
    cat.includes('chies') || cat.includes('relig') ||
    name.includes('chiesa') || name.includes('basilica') || name.includes('cattedrale') || name.includes('duomo') || name.includes('santuario') || name.includes('tempio') || name.includes('parrocchia') || name.includes('abbazia') || name.includes('monastero') || name.includes('cappella') ||
    desc.includes('chiesa') || desc.includes('basilica') || desc.includes('religios')
  ) {
    return {
      icon: <Church className="w-6 h-6 text-blue-700 animate-pulse-slow" />,
      bg: 'bg-blue-50 border-blue-200'
    };
  }
  
  // 2. Musei / Art / Museum
  if (
    cat.includes('museo') || cat === 'musei' || cat.includes('art') || cat.includes('galler') ||
    name.includes('museo') || name.includes('museum') || name.includes('galleria d') || name.includes('pinacoteca') || name.includes('mostra') || name.includes('collezione') ||
    desc.includes('museo') || desc.includes('museum') || desc.includes('galleria')
  ) {
    return {
      icon: <Landmark className="w-6 h-6 text-indigo-700 animate-pulse-slow" />,
      bg: 'bg-indigo-50 border-indigo-200'
    };
  }
  
  // 3. Locali / Ristoranti / Cibo
  if (
    cat.includes('ristorante') || cat.includes('cibo') || cat === 'locali' || cat.includes('gelateria') || cat.includes('bar') || cat.includes('pizzeria') || cat.includes('oster') || cat.includes('trattor') || cat.includes('food') || cat.includes('drink') ||
    name.includes('ristorante') || name.includes('pizzeria') || name.includes('osteria') || name.includes('trattoria') || name.includes('caffè') || name.includes('pub') || name.includes('bar ') || name.includes('gelateria') ||
    desc.includes('ristorante') || desc.includes('mangiare') || desc.includes('pizzeria') || desc.includes('cucina')
  ) {
    return {
      icon: <Utensils className="w-6 h-6 text-rose-700 animate-pulse-slow" />,
      bg: 'bg-rose-50 border-rose-200'
    };
  }

  // 4. Parchi / Natura
  if (
    cat.includes('parco') || cat.includes('natura') || cat.includes('giardin') || cat === 'panorami' || cat.includes('foresta') || cat.includes('riserva') ||
    name.includes('parco') || name.includes('giardino') || name.includes('panoram') || name.includes('riserva') || name.includes('spiaggia') || name.includes('bosco') || name.includes('belvedere') || name.includes('veduta') ||
    desc.includes('parco') || desc.includes('giardino') || desc.includes('natura') || desc.includes('panoram')
  ) {
    return {
      icon: <Trees className="w-6 h-6 text-emerald-700 animate-pulse-slow" />,
      bg: 'bg-emerald-50 border-emerald-200'
    };
  }
  
  // 5. Monumenti / Landmark / Gemme (General structures/stadiums/castles/palaces)
  if (
    cat.includes('monument') || cat === 'monumenti' || cat === 'gemme' || cat.includes('storic') ||
    name.includes('monumento') || name.includes('castello') || name.includes('stadio') || name.includes('arena') || name.includes('palazzo') || name.includes('villa') || name.includes('torre') || name.includes('ponte') || name.includes('statua') || name.includes('teatro') || name.includes('palazzetti') || name.includes('arco') || name.includes('rocca') || name.includes('mura') ||
    desc.includes('monumento') || desc.includes('castello') || desc.includes('palazzo') || desc.includes('storico')
  ) {
    return {
      icon: <Landmark className="w-6 h-6 text-amber-700 animate-pulse-slow" />,
      bg: 'bg-amber-50 border-amber-200'
    };
  }

  // Default/other
  return {
    icon: <Compass className="w-6 h-6 text-primary animate-pulse-slow" />,
    bg: 'bg-emerald-50/50 border-emerald-100'
  };
};

const FavoriteImageOrIcon = ({ poi }: { poi: any }) => {
  const [imgError, setImgError] = React.useState(false);
  const imageUrl = poi.image_url;
  
  const { icon, bg } = getCategoryIconAndBg(poi);

  if (!imageUrl || (imageUrl.includes('unsplash.com') && imageUrl.includes('featured')) || imgError) {
    return (
      <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${bg} flex-shrink-0 shadow-sm transition-all hover:scale-105 duration-300`}>
        {icon}
      </div>
    );
  }

  return (
    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border-2 border-outline-variant/10 flex-shrink-0 shadow-sm transition-all hover:scale-105 duration-300">
      <img 
        src={imageUrl} 
        alt={poi.name || ''} 
        className="w-full h-full object-cover" 
        onError={() => setImgError(true)}
      />
    </div>
  );
};

const ExperienceCard = ({ exp, onAdd, color }: { key?: React.Key, exp: any, onAdd: () => void, color: string }) => (
  <div className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-all group/card relative">
    {/* ensureAffiliateUrl: senza, i click su queste card uscivano senza
        parametri di affiliazione e la commissione andava persa */}
    <a
      href={ensureAffiliateUrl(exp.url)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAffiliateClick(exp.url, exp.name, '', 'itinerary_experience')}
      className="flex gap-4 flex-1"
    >
      {exp.imageUrl && (
        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          <img src={exp.imageUrl} alt={exp.name} className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h5 className="text-sm font-black text-primary line-clamp-2 mb-1 group-hover/card:opacity-80 transition-colors">
          {exp.name}
        </h5>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-400">
          {exp.duration && <span className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> {exp.duration}</span>}
          {exp.rating && exp.rating !== "Nuovo" && <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full"><Star className="w-3 h-3" /> {exp.rating}</span>}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-black" style={{ color }}>{exp.price}</span>
          <span className="flex items-center gap-1 text-[10px] font-bold opacity-60 group-hover/card:opacity-100 transition-colors" style={{ color }}>
            Vedi Dettagli <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
    <button onClick={(e) => { e.preventDefault(); onAdd(); }} className="md:w-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 md:self-center" style={{ backgroundColor: `${color}15`, color }}>
      ➕ Aggiungi
    </button>
  </div>
);

export default function PlanScreen({
  resetCounter,
  guideMode,
  setGuideMode,
  itinerary,
  onRemovePoi,
  onSelectPoi,
  isAudioGuideActive,
  setIsAudioGuideActive,
  language,
  externalPlan,
  setExternalPlan
}: PlanScreenProps & { externalPlan?: any, setExternalPlan?: (p: any) => void }) {
  const isOnline = useNetworkStatus();
  const [plannerMode, setPlannerMode] = useState<'selection' | 'form_a' | 'form_b' | 'form_c' | 'tinder_form' | 'tinder_swipe' | 'tinder_review' | 'alternatives_view' | 'view' | 'offline_list' | 'my_itineraries'>(isOnline ? 'selection' : 'offline_list');
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  // Shop crediti raggiungibile anche dal tab Plan (prima "Ricarica" era un alert)
  const [showShop, setShowShop] = useState(false);
  // Guardie per l'arricchimento POI in background (vedi enrichSequentially)
  const enrichInFlightRef = useRef(false);
  const enrichedPoiIdsRef = useRef<Set<string>>(new Set());
  // ── Form A / Form B / Form C shared fields ──
  const [destinations, setDestinations] = useState<string[]>(['']);
  // Coordinate della destinazione scelta dall'autocomplete Mapbox. Senza,
  // al server arrivava solo il nome come testo libero e l'AI "reinterpretava"
  // la città (Giza→Milano, Tallinn→Olbia). Si azzera se l'utente ridigita.
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [focusedDestIdx, setFocusedDestIdx] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeQuizLength, setActiveQuizLength] = useState<number>(7);
  const [days, setDays] = useState(2);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('20:00');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');
  // I default devono coincidere con le option delle select in renderAdvancedSettings
  const [budget, setBudget] = useState<'economico' | 'standard' | 'lusso'>('standard');
  const [viaggiatori, setViaggiatori] = useState<'solo' | 'coppia' | 'famiglia' | 'gruppo'>('coppia');
  const [ritmo, setRitmo] = useState<'rilassato' | 'standard' | 'intenso'>('standard');
  const [guida, setGuida] = useState<'NICKY' | 'DANTE' | 'ENTRAMBI'>('NICKY');
  const [mese, setMese] = useState('');
  const [radius, setRadius] = useState('300');
  // ── Tinder mode ──
  const [likedCandidates, setLikedCandidates] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [tinderActiveDay, setTinderActiveDay] = useState(0);
  const [tinderSelectedCategories, setTinderSelectedCategories] = useState<string[]>([]);
  const [activeReplacingIdx, setActiveReplacingIdx] = useState<number | null>(null);
  // ── Favorites & UI ──
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<string[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  // ── Loading animation ──
  const planLoadingPhrases = [
    'Analizzo le gemme nascoste della zona...',
    'Ottimizziamo i percorsi per te...',
    'Raccogliamo informazioni storiche...',
    'Preparo il tuo itinerario su misura...',
    'Quasi pronto! Ultimi ritocchi...',
  ];
  const [planLoadingIndex, setPlanLoadingIndex] = useState(0);
  const [generatedPlan, setGeneratedPlanState] = useState<GeneratedItinerary | null>(null);

  // Garantisce id_tappa unici in tutto il piano: evita chiavi React duplicate
  // sulle liste riordinabili (vedi key={tappa.id_tappa} nella vista itinerario)
  const dedupTappaIds = (plan: GeneratedItinerary | null): GeneratedItinerary | null => {
    if (!plan || !Array.isArray(plan.giorni)) return plan;
    const seen = new Set<string>();
    let changed = false;
    const giorni = plan.giorni.map(g => {
      if (!Array.isArray(g?.tappe)) return g;
      const tappe = g.tappe.map(t => {
        const originale = t?.id_tappa;
        let id = originale || `tappa_${Math.random().toString(36).slice(2, 10)}`;
        let n = 2;
        while (seen.has(id)) id = `${originale || id}_${n++}`;
        seen.add(id);
        if (id === originale) return t;
        changed = true;
        return { ...t, id_tappa: id };
      });
      return { ...g, tappe };
    });
    return changed ? { ...plan, giorni } : plan;
  };

  // Sincronizza lo stato locale con quello globale (App.tsx)
  const setGeneratedPlan = (p: GeneratedItinerary | null) => {
    const deduped = dedupTappaIds(p);
    setGeneratedPlanState(deduped);
    if (setExternalPlan) setExternalPlan(deduped);
  };

  useEffect(() => {
    if (externalPlan && !generatedPlan) {
      setGeneratedPlanState(dedupTappaIds(externalPlan));
      setPlannerMode('view');
    }
  }, [externalPlan]);

  // Badge di verifica in background: 'wip-itinerary-verified' arriva quando
  // il server finisce il cross-check anti-allucinazione (Agnes + link),
  // mentre l'itinerario è già a schermo. I marchi ✓/⚠ vengono fusi nelle
  // tappe correnti per titolo, senza toccare le modifiche dell'utente.
  useEffect(() => {
    const handler = (e: any) => {
      const verified = e?.detail;
      if (!verified?.giorni) return;
      setGeneratedPlanState((prev: any) => mergeVerificationMarks(prev, verified));
    };
    window.addEventListener('wip-itinerary-verified', handler);
    return () => window.removeEventListener('wip-itinerary-verified', handler);
  }, []);
  const [lockedStops, setLockedStops] = useState<Record<string, any>>({});
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});
  const [includeEvents, setIncludeEvents] = useState(false);
  const [includeTours, setIncludeTours] = useState(false);
  const [savedPois, setSavedPois] = useState<any[]>([]);
  // Storico itinerari personali
  const [myItineraries, setMyItineraries] = useState<any[]>([]);
  const [myItinerariesLoading, setMyItinerariesLoading] = useState(false);
  // Navigazione: modale scelta punto di partenza
  const [navModal, setNavModal] = useState<{ open: boolean; gIdx: number | null }>({ open: false, gIdx: null });
  const [navOrigin, setNavOrigin] = useState<'gps' | 'custom'>('gps');
  const [navCustomAddress, setNavCustomAddress] = useState('');
  // Autocomplete indirizzo di partenza (stessa UX della ricerca mappa):
  // suggerimenti Mapbox + coordinate dell'indirizzo scelto, così anche il
  // navigatore interno può partire da lì e non solo dal GPS.
  const [navAddrSuggestions, setNavAddrSuggestions] = useState<Array<{ id: string; description: string; lat: number; lon: number }>>([]);
  const [navAddrCoords, setNavAddrCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token || navOrigin !== 'custom' || navCustomAddress.trim().length < 3 || navAddrCoords) {
      if (!navAddrCoords) setNavAddrSuggestions([]);
      return;
    }
    const abortCtrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(navCustomAddress)}.json` +
          `?access_token=${token}&language=${language.toLowerCase()}&limit=5`,
          { signal: abortCtrl.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (abortCtrl.signal.aborted) return;
        setNavAddrSuggestions((data.features || []).map((f: any) => ({
          id: f.id,
          description: f.place_name,
          lat: f.center[1],
          lon: f.center[0],
        })));
      } catch { /* abort o rete */ }
    }, 600);
    return () => { clearTimeout(timer); abortCtrl.abort(); };
  }, [navCustomAddress, navOrigin, navAddrCoords, language]);
  const [navGpsCoords, setNavGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Premium Guide Modal
  const [showPremiumGuideModal, setShowPremiumGuideModal] = useState(false);
  // Nessun fallback hardcodato: null finché la sessione non è caricata
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Premium Guide Archive
  const [savedPremiumGuides, setSavedPremiumGuides] = useState<any[]>([]);

  // Offline Audio Bundle Modal
  const [showOfflineBundleModal, setShowOfflineBundleModal] = useState(false);

  useEffect(() => {
    if (resetCounter && resetCounter > 0) {
      setPlannerMode('selection');
      setGeneratedPlan(null);
    }
  }, [resetCounter]);
  const [planMyItinerariesTab, setPlanMyItinerariesTab] = useState<'ai' | 'premium'>('ai');
  const [guideToRender, setGuideToRender] = useState<{content: any, media: any, hash: string} | null>(null);

  // ── Viator Experiences per day ──
  const [viatorByDay, setViatorByDay] = useState<Record<number, any[]>>({});
  const [viatorLoadingDay, setViatorLoadingDay] = useState<number | null>(null);
  const [viatorExpandedDay, setViatorExpandedDay] = useState<number | null>(null);
  const [gygByDay, setGygByDay] = useState<Record<number, any[]>>({});
  const [gygLoadingDay, setGygLoadingDay] = useState<number | null>(null);
  const [gygExpandedDay, setGygExpandedDay] = useState<number | null>(null);

  // ── Ticketmaster Events per day ──
  const [ticketmasterByDay, setTicketmasterByDay] = useState<Record<number, any[]>>({});
  const [ticketmasterLoadingDay, setTicketmasterLoadingDay] = useState<number | null>(null);
  const [ticketmasterExpandedDay, setTicketmasterExpandedDay] = useState<number | null>(null);

  // ── Podcast state ──
  const [playingDay, setPlayingDay] = useState<number | string | null>(null);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState<number | string | null>(null);
  const [isPodcastPaused, setIsPodcastPaused] = useState(false);
  // Cache testi podcast per non rigenerare: chiave = `${planKey}_${dayNum}`
  const [podcastCache, setPodcastCache] = useState<Record<string, string>>({});
  // Refs per controllo playback senza closure stale
  const podcastCancelRef = useRef(false);
  const podcastRestartFnRef = useRef<(() => void) | null>(null);
  // Addebito podcast in sospeso: se la generazione non produce testo, i
  // crediti vanno restituiti (prima non venivano rimborsati in alcun ramo).
  const podcastChargeRef = useRef<{ userId: string; amount: number } | null>(null);

  const refundPodcastCharge = async () => {
    const pending = podcastChargeRef.current;
    if (!pending) return;
    podcastChargeRef.current = null;
    await refundCredits(pending.userId, pending.amount)
      .catch(e => console.warn('[Podcast] Rimborso fallito:', e));
  };

  const loadViatorForDay = async (dayIdx: number) => {
    if (viatorByDay[dayIdx]) {
      setViatorExpandedDay(prev => prev === dayIdx ? null : dayIdx);
      return;
    }

    setViatorLoadingDay(dayIdx);
    setViatorExpandedDay(dayIdx);

    try {
      let lat = 0, lon = 0;
      let cityName = destinations[0] || '';

      if (generatedPlan) {
        const giorno = generatedPlan.giorni[dayIdx === 999 ? 0 : dayIdx];
        const firstStop = giorno?.tappe?.[0];
        lat = firstStop?.coordinate?.lat || 0;
        lon = firstStop?.coordinate?.lng || (firstStop?.coordinate as any)?.lon || 0;
        if (!cityName) cityName = resolvePartnerCity();
      } else if (likedCandidates.length > 0) {
        const first = likedCandidates[0];
        lat = first.coordinate?.lat || 0;
        lon = first.coordinate?.lng || 0;
      }

      const res = await fetch("/api/viator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat, lon,
          radius: 50,
          cityName
        })
      });
      const data = await res.json();
      let experiences = Array.isArray(data) ? data : [];

      // Tracciamento affiliato centralizzato (stessa logica della modalità Swip)
      experiences = experiences.map((exp: any) => ({
        ...exp,
        url: ensureAffiliateUrl(exp.url)
      }));

      setViatorByDay(prev => ({ ...prev, [dayIdx]: experiences }));
    } catch (err) {
      console.error("[Viator] Error loading experiences for day", dayIdx, err);
      setViatorByDay(prev => ({ ...prev, [dayIdx]: [] }));
    } finally {
      setViatorLoadingDay(null);
    }
  };

  const loadGygForDay = async (dayIdx: number) => {
    if (gygByDay[dayIdx]) {
      setGygExpandedDay(prev => prev === dayIdx ? null : dayIdx);
      return;
    }
    setGygLoadingDay(dayIdx);
    setGygExpandedDay(dayIdx);

    try {
      let lat = 0, lon = 0;
      let cityName = destinations[0] || '';

      if (generatedPlan) {
        const g = generatedPlan.giorni[dayIdx === 999 ? 0 : dayIdx];
        const firstStop = g?.tappe?.[0];
        lat = firstStop?.coordinate?.lat || 0;
        lon = firstStop?.coordinate?.lng || (firstStop?.coordinate as any)?.lon || 0;
        if (!cityName) cityName = resolvePartnerCity();
      } else if (likedCandidates.length > 0) {
        const first = likedCandidates[0];
        lat = first.coordinate?.lat || 0;
        lon = first.coordinate?.lng || 0;
      }
      
      const res = await fetch("/api/getyourguide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          radius: 50,
          cityName: cityName
        })
      });
      if (!res.ok) throw new Error("Errore api GYG");
      let experiences = await res.json();

      // Tracciamento affiliato centralizzato (stessa logica della modalità Swip)
      experiences = experiences.map((exp: any) => ({
        ...exp,
        url: ensureAffiliateUrl(exp.url)
      }));

      setGygByDay(prev => ({ ...prev, [dayIdx]: experiences }));
    } catch (err) {
      console.error("[GYG] Error loading experiences for day", dayIdx, err);
      setGygByDay(prev => ({ ...prev, [dayIdx]: [] }));
    } finally {
      setGygLoadingDay(null);
    }
  };

  const loadTicketmasterForDay = async (dayIdx: number) => {
    if (ticketmasterByDay[dayIdx]) {
      setTicketmasterExpandedDay(prev => prev === dayIdx ? null : dayIdx);
      return;
    }
    setTicketmasterLoadingDay(dayIdx);
    setTicketmasterExpandedDay(dayIdx);

    try {
      let lat = 0, lon = 0;
      let cityName = destinations[0] || '';

      if (generatedPlan) {
        const g = generatedPlan.giorni[dayIdx === 999 ? 0 : dayIdx];
        const firstStop = g?.tappe?.[0];
        lat = firstStop?.coordinate?.lat || 0;
        lon = firstStop?.coordinate?.lng || (firstStop?.coordinate as any)?.lon || 0;
        if (!cityName) cityName = resolvePartnerCity();
      } else if (likedCandidates.length > 0) {
        const first = likedCandidates[0];
        lat = first.coordinate?.lat || 0;
        lon = first.coordinate?.lng || 0;
      }

      // Senza coordinate valide la ricerca finirebbe a 0,0 (in mezzo
      // all'oceano) restituendo sempre zero eventi.
      if (!lat || !lon) {
        setTicketmasterByDay(prev => ({ ...prev, [dayIdx]: [] }));
        return;
      }

      const res = await fetch(getApiUrl(`/api/ticketmaster?lat=${lat}&lon=${lon}&radius=50`));
      if (!res.ok) throw new Error("Errore api Ticketmaster");
      const data = await res.json();

      // La route inoltra il JSON grezzo di Ticketmaster: gli eventi stanno in
      // _embedded.events. Il vecchio `Array.isArray(data) ? data : []` non era
      // MAI vero, quindi la sezione biglietti degli itinerari restava sempre
      // vuota. (EventsScreen lo estraeva già correttamente.)
      const rawEvents = data?._embedded?.events || [];
      const events = rawEvents.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.info || item.pleaseNote || item.classifications?.[0]?.segment?.name || 'Evento',
        date: item.dates?.start?.localDate || '',
        time: item.dates?.start?.localTime || '',
        venue: item._embedded?.venues?.[0]?.name || '',
        price: item.priceRanges?.[0]?.min ? `Da ${item.priceRanges[0].min} ${item.priceRanges[0].currency || 'EUR'}` : 'Vedi prezzo',
        imageUrl: item.images?.[0]?.url || '',
        url: item.url,
        source: 'ticketmaster'
      })).filter((e: any) => e.url);

      setTicketmasterByDay(prev => ({ ...prev, [dayIdx]: events }));
    } catch (err) {
      console.error("[Ticketmaster] Error loading events for day", dayIdx, err);
      setTicketmasterByDay(prev => ({ ...prev, [dayIdx]: [] }));
    } finally {
      setTicketmasterLoadingDay(null);
    }
  };

  const handleDownloadAudioBundle = async (selectedPoiIds: string[]) => {
    // Conferma e ADDEBITO prima di scaricare: il vecchio flusso nel modale
    // passava la callback al posto del saldo a requestConfirmation, quindi
    // il download partiva senza conferma e senza mai scalare i crediti.
    // Prezzo pieno: lo sconto 50% è stato rimosso (l'offerta è il Day Pass).
    // Tenere allineato a BUNDLE_PRICE_PER_POI in OfflineAudioBundleModal.
    const BUNDLE_PRICE_PER_POI = PRICING_LIST.audio_guide + PRICING_LIST.poi_detail;
    const bundleCost = selectedPoiIds.length * BUNDLE_PRICE_PER_POI;
    const { data: bundleSession } = await supabase.auth.getSession();
    const bundleUserId = bundleSession?.session?.user?.id || "mock-user-id";
    const bal = await getWalletBalance(bundleUserId);
    const confirmed = await creditConfirm.requestConfirmation(bundleCost, `Bundle Audio Offline (${selectedPoiIds.length} tappe)`, bal.total);
    if (!confirmed) return;
    const bundlePayRes = await consumeCredits(bundleUserId, bundleCost);
    if (!bundlePayRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");
      return;
    }

    // Prima salviamo il testo/struttura base offline (gratis)
    await handleSaveOffline();

    // Mostriamo un feedback all'utente (non bloccante)
    setOfflineStatus(getTranslation('downloading_audio_bundle', language) || 'Download audioguide in corso...');

    const allTappe = generatedPlan?.giorni.flatMap(g => g.tappe) || [];
    let okCount = 0;

    try {
      const { saveOfflineAudio, saveOfflinePoiSheet } = await import('../lib/offlineStorage');

      for (const poiId of selectedPoiIds) {
        // Troviamo la tappa corrispondente dall'ID
        // L'ID nel modal è generato così: `iti-${tappa.titolo_tappa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`
        const tappa = allTappe.find(t => 
          `iti-${t.titolo_tappa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}` === poiId
        );
        
        if (!tappa) continue;
        
        const lat = tappa.coordinate?.lat || 0;
        const lon = tappa.coordinate?.lng || (tappa.coordinate as any)?.lon || 0;
        
        // 1. Otteniamo il testo
        // Per gli itinerari salviamo il POI in shared_pois, quindi simuliamo lo stesso fetch di PoiDetailSheet
        // Route corretta: `/api/poi-details` non è mai esistita (la vera è
        // `/api/poi/details`), quindi ogni POI veniva saltato e il bundle
        // risultava vuoto pur annunciando "Audioguide scaricate e pronte!".
        // getApiUrl serve perché su app nativa i path relativi puntano al
        // bundle locale invece che al server.
        const res = await fetch(getApiUrl(`/api/poi/details?id=${poiId}&lat=${lat}&lon=${lon}&name=${encodeURIComponent(tappa.titolo_tappa)}`));
        if (!res.ok) continue;
        const details = await res.json();
        
        const textToSpeak = details?.description_long || details?.description || details?.description_short || details?.summary || details?.wiki_extract || tappa.attivita || tappa.titolo_tappa;

        // Scheda testuale offline: PoiDetailSheet la legge quando manca la
        // rete (chiave offline_poi_<id>), così testo e guida restano fruibili.
        saveOfflinePoiSheet(poiId, {
          wikiData: {
            extract: textToSpeak,
            thumbnail: details?.image_url || details?.photo_url || undefined,
            description: tappa.tipo || 'Luogo',
            pageUrl: '#'
          },
          tripData: { address: '', tags: [tappa.tipo || 'cultura'], rating: details?.rating || null, numReviews: 0, reviews: [] },
          generatedText: details?.audio_script || textToSpeak
        });

        // 2. Chiamiamo il TTS
        const voiceMapping: Record<string, { nicky: string; dante: string }> = {
          IT: { nicky: "it-IT-ElsaNeural", dante: "it-IT-DiegoNeural" },
          EN: { nicky: "en-US-JennyNeural", dante: "en-US-GuyNeural" },
          FR: { nicky: "fr-FR-DeniseNeural", dante: "fr-FR-HenriNeural" },
          ES: { nicky: "es-ES-ElviraNeural", dante: "es-ES-AlvaroNeural" },
          RU: { nicky: "ru-RU-SvetlanaNeural", dante: "ru-RU-DmitryNeural" },
          ZH: { nicky: "zh-CN-XiaoxiaoNeural", dante: "zh-CN-YunxiNeural" },
          DE: { nicky: "de-DE-KatjaNeural", dante: "de-DE-ConradNeural" }
        };
        const voice = voiceMapping[language.toUpperCase()]?.[guideMode] || "it-IT-ElsaNeural";
        
        const ttsRes = await fetch(getApiUrl("/api/tts/smart"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSpeak, voice }),
        });

        if (!ttsRes.ok) continue;
        const blob = await ttsRes.blob();
        if (blob.size < 500) continue; // MP3 vuoto: non spacciarlo per scaricato
        const url = URL.createObjectURL(blob);

        // 3. Salviamo offline con la stessa chiave usata in PoiDetailSheet
        const audioKey = `${poiId}_${guideMode}`;
        try {
          await saveOfflineAudio(url, audioKey);
          okCount++;
        } finally {
          URL.revokeObjectURL(url); // senza, un blob per POI restava in memoria
        }
      }

      // Messaggio onesto: prima si annunciava il successo anche con zero file
      if (okCount === 0) {
        setOfflineStatus('Nessuna audioguida scaricata. Controlla la connessione e riprova.');
        setTimeout(() => setOfflineStatus(null), 4000);
      } else {
        const ready = getTranslation('audio_bundle_ready', language) || 'Audioguide scaricate e pronte!';
        setOfflineStatus(okCount < selectedPoiIds.length ? `${ready} (${okCount}/${selectedPoiIds.length})` : ready);
        setTimeout(() => setOfflineStatus(null), 4000);
      }
      
    } catch (error) {
      console.error("Bundle download error:", error);
      setOfflineStatus('Errore durante il download del bundle audio.');
      setTimeout(() => setOfflineStatus(null), 3000);
    } finally {
      // Rimborso delle tappe non scaricate: si paga solo ciò che è arrivato
      const failedCount = selectedPoiIds.length - okCount;
      if (failedCount > 0) {
        refundCredits(bundleUserId, failedCount * BUNDLE_PRICE_PER_POI).catch(e =>
          console.warn('[Bundle] refund fallito:', e)
        );
      }
    }
  };

  const isPrint = false;

  // Background bulk-upsert of cultural itinerary stops to Supabase so GPS tracking can find them
  useEffect(() => {
    // Durante lo streaming il piano cambia a ogni chunk: aspettiamo la fine della generazione
    if (loading) return;
    if (generatedPlan && generatedPlan.giorni) {
      const allPoisToUpsert: any[] = [];
      generatedPlan.giorni.forEach(giorno => {
        giorno.tappe.forEach(tappa => {
          const lat = tappa.coordinate?.lat || 0;
          const lon = tappa.coordinate?.lng || (tappa.coordinate as any)?.lon || 0;
          if (lat !== 0 && lon !== 0 && tappa.tipo !== 'ristorante' && tappa.tipo !== 'pausa' && tappa.tipo !== 'spostamento') {
            const stableId = `iti-${tappa.titolo_tappa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
            allPoisToUpsert.push({
              id: stableId,
              name: tappa.titolo_tappa,
              category: tappa.tipo || 'monumenti',
              lat: lat,
              lon: lon,
              description_ai: tappa.attivita || '',
              source: 'itinerary',
              created_at: new Date().toISOString()
            });
          }
        });
      });

      if (allPoisToUpsert.length > 0) {
        supabase.from('shared_pois').upsert(allPoisToUpsert, { onConflict: "id" })
          .then(({ error }) => {
            if (error) console.warn("[PlanScreen] Bulk upsert error:", error);
          });
      }
    }
    // `loading` nelle dipendenze: l'upsert parte quando la generazione termina (loading -> false)
  }, [generatedPlan, loading]);

  useEffect(() => {
    if (generatedPlan?.info_viaggio?.includeTours && generatedPlan?.giorni?.length > 0) {
      generatedPlan.giorni.forEach((giorno, gIdx) => {
        if (!viatorByDay[gIdx]) {
           const firstStop = giorno?.tappe?.[0];
           const lat = firstStop?.coordinate?.lat || 0;
           const lon = firstStop?.coordinate?.lng || (firstStop?.coordinate as any)?.lon || 0;
           const cityName = resolvePartnerCity();

           fetch("/api/viator", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ lat, lon, radius: 50, cityName })
           })
           .then(res => res.json())
           .then(data => {
              const experiences = (Array.isArray(data) ? data : [])
                .map((exp: any) => ({ ...exp, url: ensureAffiliateUrl(exp.url) }));
              setViatorByDay(prev => ({ ...prev, [gIdx]: experiences }));
           })
           .catch(err => {
              console.error("[Viator Auto] Error loading day", gIdx, err);
              setViatorByDay(prev => ({ ...prev, [gIdx]: [] }));
           });
        }
      });
    }
  }, [generatedPlan?.info_viaggio?.includeTours, generatedPlan?.giorni]);

  const handleAddViatorToDay = (dayIdx: number, exp: any) => {
    if (!generatedPlan) return;

    // Tracciamento affiliato centralizzato (pid/mcid ufficiali Viator)
    const finalUrl = ensureAffiliateUrl(exp.url);

    const newTappa = {
      id_tappa: `viator_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ora: "Da definire",
      titolo_tappa: exp.name,
      attivita: `Esperienza consigliata: ${exp.name}. Prenota tramite il link per partecipare.`,
      consiglio_guida: `✨ Nicky: Ottima scelta! Questa esperienza arricchirà il tuo viaggio.`,
      tempo_necessario: exp.duration || "2 ore",
      spostamento_precedente: "N/A",
      tipo: "esperienza",
      coordinate: { lat: 0, lng: 0 },
      link_info: finalUrl
    };
    
    const updatedPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === dayIdx ? { ...g, tappe: [...g.tappe, newTappa] } : g
      )
    };

    setGeneratedPlan(updatedPlan);
    savePlanToSupabase(updatedPlan);
    alert("Esperienza aggiunta all'itinerario!");
  };

  const handleAddGygToDay = (dayIdx: number, exp: any) => {
    if (!generatedPlan) return;

    // Tracciamento affiliato centralizzato (partner_id GYG)
    const finalUrl = ensureAffiliateUrl(exp.url);

    const newTappa = {
      id_tappa: `gyg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ora: "TBD",
      titolo_tappa: exp.name || "Esperienza GetYourGuide",
      attivita: (exp.description || "Scopri questa fantastica attività guidata."),
      consiglio_guida: `✨ Nicky: Esperienza prenotabile su GetYourGuide: ${exp.price} (${exp.duration})`,
      tipo: "esperienza",
      coordinate: {
        lat: exp.lat || 0,
        lng: exp.lon || 0
      },
      link_info: finalUrl
    };

    const updatedPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === dayIdx ? { ...g, tappe: [...g.tappe, newTappa] } : g
      )
    };

    setGeneratedPlan(updatedPlan);
    savePlanToSupabase(updatedPlan);
    alert(`Esperienza GYG aggiunta al giorno ${dayIdx + 1}!`);
  };

  const handleAddTicketmasterToDay = (dayIdx: number, exp: any) => {
    if (!generatedPlan) return;

    const newTappa = {
      id_tappa: `tm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ora: exp.startTime || "Da definire",
      titolo_tappa: exp.name,
      attivita: `Evento Ticketmaster: ${exp.name}. ${exp.venue || ''}`,
      consiglio_guida: `✨ Nicky: Un evento imperdibile! Controlla la disponibilità dei biglietti.`,
      tipo: "evento",
      coordinate: {
        lat: exp.lat || 0,
        lng: exp.lon || 0
      },
      link_info: ensureAffiliateUrl(exp.url)
    };

    const updatedPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === dayIdx ? { ...g, tappe: [...g.tappe, newTappa] } : g
      )
    };

    setGeneratedPlan(updatedPlan);
    savePlanToSupabase(updatedPlan);
    alert(`Evento aggiunto al giorno ${dayIdx + 1}!`);
  };

  // Quota limit toast
  const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) {
        setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  // Real-time Agent Itinerary Sync
  const [dbItineraryId, setDbItineraryId] = useState<string | null>(null);
  const { itinerary: dynamicItinerary } = useItinerary(dbItineraryId || undefined);

  useEffect(() => {
    // Issue 17 Fix: solo se il piano in arrivo è più recente (updated_at) del locale
    // o se il locale è vuoto. Evitiamo rimbalzi infiniti se siamo stati noi a salvare.
    if (dynamicItinerary && dynamicItinerary.plan) {
      const localUpdated = (generatedPlan as any)?.updated_at ? new Date((generatedPlan as any).updated_at).getTime() : 0;
      const remoteUpdated = dynamicItinerary.updated_at ? new Date(dynamicItinerary.updated_at).getTime() : 0;

      if (!generatedPlan || remoteUpdated > localUpdated + 1000) {
        setGeneratedPlan(dynamicItinerary.plan);
      }
    }
  }, [dynamicItinerary]);

  // Navigazione Interna
  const [navDayIndex, setNavDayIndex] = useState<number | null>(null);
  const [navStopIndex, setNavStopIndex] = useState<number | null>(null);
  const {
    state: navState,
    currentInstruction,
    distanceToNext,
    distanceToDestination,
    etaSeconds,
    routeGeometry,
    startNavigation,
    stopNavigation,
    repeatInstruction,
  } = useWalkingNavigation(language);

  // Avvio WIP Nav dal modal "Rotta Intelligente" (bottone per tappa in
  // ItineraryStop → App → qui): destinazione, origine (GPS o indirizzo
  // personalizzato) e POI selezionati lungo il percorso arrivano via evento;
  // il percorso viene disegnato su PlanMap, le indicazioni vocali e le
  // audioguide automatiche partono da useWalkingNavigation.
  useEffect(() => {
    const handleInternalNavStart = (e: any) => {
      const { endCoords, destinationName, origin, pois } = e.detail || {};
      if (!endCoords?.lat) return;
      startNavigation(
        {
          lat: endCoords.lat,
          lon: endCoords.lon,
          poiId: `wipnav_${String(destinationName || '').slice(0, 40)}`,
          poiName: destinationName || '',
        },
        origin || undefined,
        Array.isArray(pois) ? pois : []
      );
    };
    window.addEventListener('wip-internal-nav-start', handleInternalNavStart);
    return () => window.removeEventListener('wip-internal-nav-start', handleInternalNavStart);
  }, [startNavigation]);

  // Non usiamo più l'auto-avanzamento, ma un avanzo manuale tramite bottone "onNextStop"
  const handleNextStop = () => {
    if (navDayIndex !== null && navStopIndex !== null && generatedPlan) {
      const giorno = generatedPlan.giorni[navDayIndex];
      if (giorno && navStopIndex < giorno.tappe.length - 1) {
         // Passa alla prossima tappa
         const nextStop = giorno.tappe[navStopIndex + 1];
         if (nextStop?.coordinate) {
           setNavStopIndex(navStopIndex + 1);
           startNavigation({
             lat: nextStop.coordinate.lat,
             lon: nextStop.coordinate.lng,
             poiId: parseInt(nextStop.id_tappa.replace(/\D/g, '') || '0') || undefined,
             poiName: nextStop.titolo_tappa
           });
         }
      } else {
         // Fine itinerario per il giorno
         stopNavigation();
         setNavDayIndex(null);
         setNavStopIndex(null);
      }
    }
  };

  const toggleLockTappa = (tappa: any, giorno: number) => {
    setLockedStops(prev => {
      const next = { ...prev };
      if (next[tappa.id_tappa]) {
        delete next[tappa.id_tappa];
      } else {
        next[tappa.id_tappa] = { ...tappa, giorno };
      }
      return next;
    });
  };

  /**
   * Città da passare ai partner (Viator/GYG). Prima si usava la prima parola
   * del titolo dell'itinerario — che è quasi sempre "Weekend", "Tour" o "Alla"
   * — e la ricerca partiva da un nome inesistente. La destinazione scelta
   * dall'utente è il dato corretto.
   */
  const resolvePartnerCity = (): string => {
    const picked = (destCoords?.label || destinations[0] || '').trim();
    if (picked) return picked.split(',')[0].trim();
    const titolo = (generatedPlan?.titolo || '').trim();
    // Nel titolo la città segue spesso "a"/"in"/"di" ("Weekend a Bologna")
    const m = titolo.match(/\b(?:a|in|di|ad)\s+([A-ZÀ-Ù][\wÀ-ù'’-]+(?:\s+[A-ZÀ-Ù][\wÀ-ù'’-]+)?)/);
    return (m?.[1] || titolo.split(' ')[0] || '').trim();
  };

  // Conguaglio costi: si paga per i giorni EFFETTIVAMENTE generati. Se l'AI
  // produce meno giorni di quelli addebitati in anticipo (prompt troncato,
  // JSON parziale), la differenza torna subito all'utente.
  const settleItineraryCost = async (userId: string, chargedDays: number, plan: any) => {
    const effective = Array.isArray(plan?.giorni) ? plan.giorni.length : 0;
    const delta = (chargedDays - effective) * PRICING_LIST.itinerary_daily;
    if (effective > 0 && delta > 0) {
      await refundCredits(userId, delta).catch(e => console.warn('[PlanScreen] Conguaglio fallito:', e));
    }
  };

  const handleRegenerateWithLocks = async () => {
    if (!generatedPlan) return;
    if (loading) return; // anti doppio-click: doppio addebito

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    // Prezzo sui giorni reali dell'itinerario da rigenerare, non sullo stato del form
    const numDaysForPricing = Math.max(1, generatedPlan.giorni.length);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {


       return;
    }
    const payRes = await consumeCredits(currentUserId, totalItineraryCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");


      return;
    }

    setLoading(true);
    try {
      // Destinazione REALE dal form (il titolo dell'itinerario mandava il
      // modello fuori strada: "Weekend d'arte" non è una città) + coordinate
      const regenCoords = destCoords || await resolveDestCoords();
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinations.filter(d => d.trim()).join(" e ") || generatedPlan.titolo,
        lat: regenCoords?.lat,
        lon: regenCoords?.lon,
        days: generatedPlan.giorni.length,
        startTime,
        endTime,
        interests: selectedInterests.length > 0 ? selectedInterests : ['generale'],
        specialRequests,
        includeEvents,
        includeTours,
        budget,
        viaggiatori,
        ritmo,
        guida,
        lockedStops: Object.values(lockedStops),
        radius: parseInt(radius),
        language
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        await settleItineraryCost(currentUserId, numDaysForPricing, data);
      } else {
        // Nessun itinerario valido: rimborsiamo i crediti addebitati
        await refundCredits(currentUserId, totalItineraryCost);
        alert("Errore durante la rigenerazione dell'itinerario. I crediti ti sono stati restituiti.");
      }
    } catch (err) {
      console.error("Regeneration with locks error:", err);
      await refundCredits(currentUserId, totalItineraryCost);
      alert("Errore durante la rigenerazione dell'itinerario. I crediti ti sono stati restituiti.");
    } finally {
      setLoading(false);
    }
  };

  const [addingStopDay, setAddingStopDay] = useState<number | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const handleSuggestTappa = async (gIdx: number) => {
    if (!generatedPlan) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    // Costo per singola tappa suggerita (non l'intero itinerario)
    const suggestCost = PRICING_LIST.audio_guide * 0.5;
    const confirmed = await creditConfirm.requestConfirmation(suggestCost, "Suggerimento tappa AI", bal.total);
    if (!confirmed) {


       return;
    }
    const payRes = await consumeCredits(currentUserId, suggestCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");


      return;
    }

    setSuggestLoading(true);
    try {
      const dayStops = generatedPlan.giorni[gIdx].tappe;
      const res = await fetch('/api/groq/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayStops, gIdx, destination: generatedPlan.titolo, language })
      });
      const data = await res.json();
      if (data && data.ora) {
        setNewStop({
          ora: data.ora,
          titolo_tappa: data.titolo_tappa || '',
          attivita: data.attivita || '',
          consiglio_guida: data.consiglio_guida || '',
          tempo_necessario: data.tempo_necessario || '',
          tipo: data.tipo || 'visita',
          lat: data.coordinate?.lat?.toString() || '',
          lng: data.coordinate?.lng?.toString() || ''
        });
      } else {
        // Nessun suggerimento valido: rimborsiamo i crediti addebitati
        await refundCredits(currentUserId, suggestCost);
        alert("L'AI non ha trovato un suggerimento valido. I crediti ti sono stati restituiti.");
      }
    } catch (err) {
      console.error("Suggest Stop Error:", err);
      await refundCredits(currentUserId, suggestCost);
      alert("Errore durante il suggerimento della tappa. I crediti ti sono stati restituiti.");
    } finally {
      setSuggestLoading(false);
    }
  };

  const [newStop, setNewStop] = useState({
    ora: '',
    titolo_tappa: '',
    attivita: '',
    consiglio_guida: '',
    tempo_necessario: '',
    tipo: 'visita',
    lat: '',
    lng: ''
  });

  const INTERESTS_TRANSLATIONS: Record<string, Record<Language, string>> = {
    arte: { IT: "🏛️ Arte e Storia", EN: "🏛️ Art & History", FR: "🏛️ Art & Histoire", ES: "🏛️ Arte e Historia", RU: "🏛️ Искусство и история", ZH: "🏛️ 艺术与历史" },
    gastronomia: { IT: "🍕 Gastronomia", EN: "🍕 Gastronomy", FR: "🍕 Gastronomie", ES: "🍕 Gastronomía", RU: "🍕 Гастрономия", ZH: "🍕 美食" },
    natura: { IT: "🌿 Natura e Relax", EN: "🌿 Nature & Relax", FR: "🌿 Nature & Détente", ES: "🌿 Naturaleza y Relax", RU: "🌿 Природа и отдых", ZH: "🌿 自然与休闲" },
    avventura: { IT: "🎒 Avventura", EN: "🎒 Adventure", FR: "🎒 Aventure", ES: "🎒 Aventura", RU: "🎒 Приключения", ZH: "🎒 户外冒险" },
    shopping: { IT: "🛍️ Shopping", EN: "🛍️ Shopping", FR: "🛍️ Shopping", ES: "🛍️ Compras", RU: "🛍️ Шопинг", ZH: "🛍️ 购物" },
    fotografia: { IT: "📸 Fotografia", EN: "📸 Photography", FR: "📸 Photographie", ES: "📸 Fotografía", RU: "📸 Фотография", ZH: "📸 摄影" }
  };

  const interests = [
    { id: 'arte', label: INTERESTS_TRANSLATIONS.arte[language] },
    { id: 'gastronomia', label: INTERESTS_TRANSLATIONS.gastronomia[language] },
    { id: 'natura', label: INTERESTS_TRANSLATIONS.natura[language] },
    { id: 'avventura', label: INTERESTS_TRANSLATIONS.avventura[language] },
    { id: 'shopping', label: INTERESTS_TRANSLATIONS.shopping[language] },
    { id: 'fotografia', label: INTERESTS_TRANSLATIONS.fotografia[language] }
  ];

  useEffect(() => {
    fetchSavedPois();
    fetchCurrentPlan();

    const handleFavoritesUpdate = () => {
      fetchSavedPois();
    };

    // Issue 18 Fix: Ascolta check-in e arrivo a destinazione per marcare le tappe
    const handleCheckin = (e: any) => {
      const { poiId, poiName } = e.detail;
      if (!generatedPlan) return;

      const newPlan = {
        ...generatedPlan,
        giorni: generatedPlan.giorni.map(g => ({
          ...g,
          tappe: g.tappe.map(t => {
            const isMatch = (poiId && String(t.id_tappa).includes(String(poiId))) ||
                          (poiName && t.titolo_tappa === poiName);
            return isMatch ? { ...t, visited: true } : t;
          })
        }))
      };
      setGeneratedPlan(newPlan);
      savePlanToSupabase(newPlan);
    };

    window.addEventListener(FAVORITES_EVENT, handleFavoritesUpdate);
    window.addEventListener('wip-itinerary-checkin', handleCheckin);
    window.addEventListener('wip-nav-arrived', handleCheckin);

    return () => {
      window.removeEventListener(FAVORITES_EVENT, handleFavoritesUpdate);
      window.removeEventListener('wip-itinerary-checkin', handleCheckin);
      window.removeEventListener('wip-nav-arrived', handleCheckin);
      // Issue 19: Interrompe qualsiasi podcast in corso quando si cambia tab
      // per evitare che la voce continui a parlare in background.
      window.speechSynthesis?.cancel();
    };
  }, [generatedPlan?.id]); // Re-bind if plan changes to ensure correct closure scope

  useEffect(() => {
    if (focusedDestIdx === null || !destinations[focusedDestIdx] || destinations[focusedDestIdx].length < 3 || !showSuggestions) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const token = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!token) {
        setIsSearching(false);
        return;
      }

      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destinations[focusedDestIdx])}.json?access_token=${token}&language=${language.toLowerCase()}&limit=5`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.features.map((f: any) => ({
            id: f.id,
            description: f.place_name,
            lat: f.center[1],
            lon: f.center[0],
            isMapbox: true
          })) || []);
        }
      } catch (e) {
        console.error("Mapbox search error:", e);
      } finally {
        setIsSearching(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [destinations, focusedDestIdx, showSuggestions, language]);

  const fetchSavedPois = async () => {
    try {
      // Filtro per utente: prima scaricava l'intera tabella di tutti gli utenti.
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      let combinedData: any[] = [];
      // Senza uid la .eq('user_id', undefined) produce una richiesta malformata:
      // si passa direttamente al mirror locale.
      if (uid) {
        const { data, error } = await supabase.from('saved_pois').select('*')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(200);
        if (!error && data) {
          combinedData = [...data];
        }
      }
      // Fallback/merge with local storage (String + fallback id: id numerici
      // o righe legacy senza poi_id creavano doppioni o collassi errati)
      try {
        const localData = JSON.parse(localStorage.getItem('mock_db_saved_pois') || '[]');
        localData.forEach((item: any) => {
          const itemKey = String(item.poi_id ?? item.id);
          if (!combinedData.find((c: any) => String(c.poi_id ?? c.id) === itemKey)) {
            combinedData.push(item);
          }
        });
      } catch (e) {}

      setSavedPois(combinedData);
    } catch (err) {
      console.error("Error fetching saved POIs:", err);
      try {
        const localData = JSON.parse(localStorage.getItem('mock_db_saved_pois') || '[]');
        setSavedPois(localData);
      } catch (e) {}
    }
  };

  const fetchCurrentPlan = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) { setPlannerMode('selection'); return; }
      const { data, error } = await supabase
        .from('user_itineraries')
        .select('*')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!error && data && data.dati_itinerario && Array.isArray(data.dati_itinerario.giorni)) {
        setGeneratedPlan(data.dati_itinerario);
        setPlannerMode('view');
        return;
      }
    } catch (err) {
      // Not found, fallback
    }

    // Fallback to local storage
    try {
      const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
      if (localData.length > 0) {
        const latestInfo = localData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (latestInfo && latestInfo.dati_itinerario && Array.isArray(latestInfo.dati_itinerario.giorni)) {
          setGeneratedPlan(latestInfo.dati_itinerario);
          setPlannerMode('view');
          return;
        }
      }
    } catch (e) {}

    setPlannerMode('selection');
  };

  // Carica tutti gli itinerari personali dell'utente
  const fetchMyItineraries = async () => {
    setMyItinerariesLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) { setMyItineraries([]); return; }
      const { data, error } = await supabase
        .from('user_itineraries')
        .select('id, titolo, updated_at, dati_itinerario')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (!error && data) {
        setMyItineraries(data);
      } else {
        // Fallback locale
        const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        setMyItineraries(localData);
      }
    } catch (e) {
      const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
      setMyItineraries(localData);
    } finally {
      setMyItinerariesLoading(false);
    }
  };

  const fetchSavedPremiumGuides = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) return;
      const { data, error } = await supabase
        .from('itinerary_guides')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setSavedPremiumGuides(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMyItinerary = async (id: string) => {
    if (!confirm('Eliminare questo itinerario?')) return;
    try {
      // Cancella solo gli itinerari dell'utente corrente (mai righe di altri utenti)
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (uid) {
        const { error } = await supabase.from('user_itineraries').delete().eq('id', id).eq('user_id', uid);
        if (error) {
          alert("Errore durante l'eliminazione dell'itinerario: " + error.message);
          return;
        }
      }
    } catch (e) {}
    // Fallback locale
    try {
      const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
      localStorage.setItem('mock_db_user_itineraries', JSON.stringify(localData.filter((i: any) => i.id !== id)));
    } catch (e) {}
    fetchMyItineraries();
  };

  // Apre il modale di navigazione per un giorno e recupera GPS
  const openNavModal = (gIdx: number) => {
    setNavModal({ open: true, gIdx });
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => setNavGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setNavGpsCoords(null)
      );
    }
  };

  // Costruisce URL Google Maps con tutti i waypoints del giorno
  const buildNavUrl = (gIdx: number) => {
    if (!generatedPlan) return '#';
    const tappe = generatedPlan.giorni[gIdx]?.tappe || [];
    if (tappe.length === 0) return '#';

    let origin = '';
    if (navOrigin === 'gps' && navGpsCoords) {
      origin = `${navGpsCoords.lat},${navGpsCoords.lng}`;
    } else if (navOrigin === 'custom' && navCustomAddress.trim()) {
      origin = encodeURIComponent(navCustomAddress.trim());
    } else {
      // Fallback: prima tappa come origine
      const first = tappe[0];
      if (first.coordinate?.lat && first.coordinate?.lat !== 0) {
        origin = `${first.coordinate.lat},${first.coordinate.lng || (first.coordinate as any).lon}`;
      } else {
        origin = encodeURIComponent(first.titolo_tappa);
      }
    }

    const destination = tappe[tappe.length - 1];
    const destStr = destination.coordinate?.lat && destination.coordinate.lat !== 0
      ? `${destination.coordinate.lat},${destination.coordinate.lng || (destination.coordinate as any).lon}`
      : encodeURIComponent(destination.titolo_tappa);

    const waypoints = tappe.slice(0, -1).map((t: any) =>
      t.coordinate?.lat && t.coordinate.lat !== 0
        ? `${t.coordinate.lat},${t.coordinate.lng || (t.coordinate as any).lon}`
        : encodeURIComponent(t.titolo_tappa)
    ).join('|');

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destStr}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=walking`;
  };

  const handleGenerateAutomatic = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    if (activeDestinations.length === 0) return alert("Inserisci almeno una destinazione!");

    const destination = activeDestinations.join(" e ");

    // Coordinate certe della destinazione PRIMA di addebitare: è questo il
    // flusso classico dove "Tallinn" diventava "Olbia".
    const coords = await resolveDestCoords();
    if (!coords && import.meta.env.VITE_MAPBOX_TOKEN) {
      alertDestNotFound();
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = Math.max(1, days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
       
       
       return;
    }
    const payRes = await consumeCredits(currentUserId, totalItineraryCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");
      
      
      return;
    }

    setLoading(true);
    setLockedStops({});
    setExpandedStops({});

    // Chiave cache: include tutti i parametri che influenzano il risultato
    // (budget, ritmo, viaggiatori, interessi ordinati), altrimenti utenti con
    // preferenze diverse si vedrebbero servire lo stesso itinerario.
    const cacheId = [
      destination.toLowerCase().trim().replace(/[^a-z0-9]/g, '_'),
      // Coordinate nella chiave: distinguono città omonime e invalidano le
      // voci generate prima del fix geografico (es. "Tallinn" → Olbia), che
      // altrimenti continuerebbero a essere servite dalla cache.
      coords ? `${coords.lat.toFixed(1)}_${coords.lon.toFixed(1)}` : 'nogeo',
      days,
      language.toLowerCase(),
      budget,
      ritmo,
      viaggiatori,
      [...selectedInterests].sort().join('-') || 'nessuno'
    ].join('_');
    // Le richieste speciali sono libere e personali: niente cache (né lettura né scrittura)
    const cacheUsable = specialRequests.trim().length === 0;

    // Prova a recuperare l'itinerario dalla cache condivisa Supabase (costo e tempo zero!)
    if (cacheUsable) try {
      const { data: cachedData, error: cacheErr } = await supabase
        .from("shared_itinerary_cache")
        .select("*")
        .eq("id", cacheId)
        .single();

      if (cachedData && !cacheErr && cachedData.dati_itinerario?.giorni) {
        console.log("[Global Itinerary Cache] Hit for:", cacheId);
        // Clona e riassegna un id nuovo: il piano in cache porta l'id dell'utente
        // che l'ha popolata, e l'upsert su user_itineraries riassegnerebbe la sua riga.
        const plan = structuredClone(cachedData.dati_itinerario);
        plan.id = crypto.randomUUID();
        setGeneratedPlan(plan);
        savePlanToSupabase(plan); // Salva nei personali dell'utente
        setPlannerMode('view');
        setLoading(false);
        return; // Successo! Usciamo subito
      }
    } catch (e) {
      console.debug("Global itinerary cache fetch skipped/failed:", e);
    }

    try {
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        days,
        startTime,
        endTime,
        interests: selectedInterests,
        specialRequests,
        includeEvents,
        includeTours,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        radius: parseInt(radius),
        language,
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        await settleItineraryCost(currentUserId, numDaysForPricing, data);

        // Salva in background l'itinerario appena generato nella cache condivisa
        // (senza l'id personale: la cache è condivisa tra utenti)
        if (cacheUsable) try {
          const { id: _omit, ...cachePayload } = data;
          await supabase.from("shared_itinerary_cache").upsert({
            id: cacheId,
            destination: destination.trim(),
            days: days,
            dati_itinerario: cachePayload,
            created_at: new Date().toISOString()
          }, { onConflict: "id" });
          console.log("[Global Itinerary Cache] Saved generated itinerary:", cacheId);
        } catch(e) {}

        setPlannerMode('view');
      } else {
        // Nessun itinerario valido: rimborsiamo i crediti addebitati
        await refundCredits(currentUserId, totalItineraryCost);
        alert("Errore durante la generazione dell'itinerario. I crediti ti sono stati restituiti.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      await refundCredits(currentUserId, totalItineraryCost);
      alert("Errore durante la generazione dell'itinerario: " + (err.message || "Verifica la console") + "\nI crediti ti sono stati restituiti.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromAlternative = async (alt: any) => {
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    const baseLocation = activeDestinations[0] || "Destinazione sconosciuta";
    const destinationStr = alt.titolo; // DeepSeek will generate the itinerary for this alternative title
    // Coordinate della base già risolte nel passo precedente (handleGenerateRadius):
    // ancorano anche l'alternativa alla zona giusta.
    const coords = destCoords && destCoords.label === baseLocation ? destCoords : null;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    setActiveQuizLength(7);
    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    setPlannerMode('view');

    try {
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinationStr,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        days,
        startTime,
        endTime,
        interests: selectedInterests,
        specialRequests: `ATTENZIONE: Questo è un itinerario a raggio con base di partenza ${baseLocation}. L'utente ha selezionato questa opzione specifica: ${alt.titolo} - ${alt.descrizione_breve}. Sviluppa le tappe seguendo questa idea. ${specialRequests}`,
        includeEvents,
        includeTours,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        radius: parseInt(radius),
        language,
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      alert("Errore durante la generazione dell'itinerario: " + (err.message || "Verifica la console"));
      setPlannerMode('alternatives_view');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRadius = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    if (activeDestinations.length === 0) return alert("Inserisci una città di partenza!");

    const baseLocation = activeDestinations[0]; // Take the first one as base

    // Anche il raggio parte da una città: senza coordinate certe le
    // alternative venivano cercate attorno al posto sbagliato.
    const coords = await resolveDestCoords();
    if (!coords && import.meta.env.VITE_MAPBOX_TOKEN) {
      alertDestNotFound();
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = Math.max(1, days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
       
       
       return;
    }
    const payRes = await consumeCredits(currentUserId, totalItineraryCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");
      
      
      return;
    }

    setActiveQuizLength(4);
    setLoading(true);
    
    try {
      const res = await fetch('/api/groq/radius-alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseLocation,
          ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
          radius,
          days,
          startTime,
          endTime,
          interests: [...selectedInterests, includeEvents ? "Eventi Locali" : null, includeTours ? "Tour e Attività" : null].filter(Boolean),
          budget,
          viaggiatori,
          ritmo,
          guida,
          mese,
          language
        })
      });
      const data = await res.json();
      if (data.alternative && Array.isArray(data.alternative) && data.alternative.length > 0) {
        setAlternatives(data.alternative);
        setPlannerMode('alternatives_view');
      } else {
        await refundCredits(currentUserId, totalItineraryCost);
        alert("L'agente non ha trovato alternative. I crediti ti sono stati restituiti.");
      }
    } catch (err) {
      console.error("Generation error:", err);
      await refundCredits(currentUserId, totalItineraryCost);
      alert("L'agente non ha trovato alternative. I crediti ti sono stati restituiti.");
    } finally {
      setLoading(false);
    }
  };

  // ── Avvia playback TTS dai chunk ──
  const startTtsPlayback = useCallback((
    chunks: string[],
    utteranceLang: string,
    chosenVoice: SpeechSynthesisVoice | null,
    pitch: number,
    dayNum: number | string,
    startIdx = 0
  ) => {
    podcastCancelRef.current = false;
    setIsPodcastPaused(false);
    setPlayingDay(dayNum);
    let idx = startIdx;

    const doSpeak = () => {
      if (podcastCancelRef.current || idx >= chunks.length) {
        if (!podcastCancelRef.current) setPlayingDay(null);
        return;
      }
      const utt = new SpeechSynthesisUtterance(chunks[idx]);
      utt.lang = utteranceLang;
      utt.rate = 0.92;
      utt.pitch = pitch;
      utt.volume = 1.0;
      if (chosenVoice) utt.voice = chosenVoice;
      utt.onend = () => { if (!podcastCancelRef.current) { idx++; setTimeout(doSpeak, 50); } };
      utt.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn(`[Podcast] chunk ${idx} error: ${e.error}`);
        if (!podcastCancelRef.current) { idx++; setTimeout(doSpeak, 100); }
      };
      window.speechSynthesis.speak(utt);
    };

    // Salva funzione per replay
    podcastRestartFnRef.current = () => {
      window.speechSynthesis.cancel();
      setTimeout(() => startTtsPlayback(chunks, utteranceLang, chosenVoice, pitch, dayNum, 0), 250);
    };

    // ⚠️ Chrome fix: aspetta dopo cancel()
    setTimeout(doSpeak, 250);
  }, []);

  const handlePlayDailyPodcast = async (dayNum: number | string, tappe: any[], isLastDay: boolean = false) => {
    if (!tappe || !Array.isArray(tappe) || tappe.length === 0) {
      console.warn('[Podcast] Nessuna tappa disponibile');
      return;
    }

    // ── STOP se già in play (toggle) ──
    if (playingDay === dayNum) {
      handleStopPodcast();
      return;
    }

    // ── Ferma podcast precedente ──
    podcastCancelRef.current = true;
    window.speechSynthesis?.cancel();
    setPlayingDay(null);
    setIsPodcastPaused(false);

    // ── Chiave cache per questo giorno/piano ──
    // Issue 19 Fix: usiamo l'ID dell'itinerario invece del titolo per evitare
    // collisioni tra viaggi diversi con lo stesso nome (es. "Weekend a Roma").
    const planKey = generatedPlan?.id || generatedPlan?.titolo || 'plan';
    const cacheKey = `${planKey}_day${dayNum}`;

    // ── Stato generazione ──
    setIsGeneratingPodcast(dayNum);

    try {
      // ── Usa cache se disponibile ──
      let podcastText = podcastCache[cacheKey];

      if (!podcastText) {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
        const numDaysPodcast = dayNum === "Intero Itinerario" && generatedPlan ? generatedPlan.giorni.length : 1;
        const podcastCost = PRICING_LIST.podcast_daily * numDaysPodcast;
        
        // Saldo passato al modale: senza, mostrava sempre "0 crediti disponibili"
        const balPodcast = await getWalletBalance(currentUserId);
        const confirmed = await creditConfirm.requestConfirmation(podcastCost, `Podcast AI (${numDaysPodcast} giorni)`, balPodcast.total);
        if (!confirmed) {
          setIsGeneratingPodcast(null);
          return;
        }
        
        const payRes = await consumeCredits(currentUserId, podcastCost);
        if (!payRes) {
          alert("Crediti insufficienti. Visita lo store per ricaricare.");
          setIsGeneratingPodcast(null);
          return;
        }
        // Da qui in poi i crediti sono già stati scalati: ogni uscita senza
        // podcast deve rimborsarli (prima non lo faceva in nessun ramo).
        podcastChargeRef.current = { userId: currentUserId, amount: podcastCost };
        // Normalizza tappe per diversi formati salvati
        const tappeNorm = tappe.map(t => ({
          name: t.titolo_tappa || t.name || t.title || t.nome || 'Tappa',
          description: (t.attivita || t.description || t.descrizione || '')?.slice(0, 150)
        })).filter(t => t.name !== 'Tappa' || t.description);

        const destination = generatedPlan?.titolo || generatedPlan?.citta || 'la tua destinazione';
        console.log(`[Podcast] Genero per "${destination}" Day ${dayNum} (${tappeNorm.length} tappe)`); 

        const res = await fetch('/api/generate-daily-podcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination,
            dayNum,
            tappe: tappeNorm.length > 0 ? tappeNorm : tappe.map(t => ({ name: t.titolo_tappa || t.name || 'Visita', description: '' })),
            language: language || 'IT',
            isLastDay
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        podcastText = data.text?.trim();

        if (!podcastText) {
          await refundPodcastCharge();
          alert('Nessun testo ricevuto dal server per il podcast. I crediti ti sono stati restituiti.');
          setIsGeneratingPodcast(null);
          return;
        }
        // Contenuto ricevuto: l'addebito è legittimo, niente rimborso
        podcastChargeRef.current = null;

        // Salva in cache locale (sessione corrente)
        setPodcastCache(prev => ({ ...prev, [cacheKey]: podcastText! }));
        console.log(`[Podcast] Testo generato e cachato (${podcastText.length} chars)`);

        // Salva su Supabase in background (non bloccante)
        const planId = generatedPlan?.id || '';
        if (planId) savePodcastToSupabase(planId, cacheKey, podcastText);
      } else {
        console.log(`[Podcast] Uso testo dalla cache per ${cacheKey}`);
      }

      setIsGeneratingPodcast(null);

      if (!('speechSynthesis' in window)) {
        alert('Sintesi vocale non supportata su questo browser.');
        return;
      }

      // ── Fix pronuncia: WIP → "Uip" per TTS ──
      const ttsText = podcastText
        .replace(/\bWIP\b/g, 'Uip')
        .replace(/\bwip\b/gi, 'Uip');

      // ── Mappa lang code ──
      const langMap: Record<string, string> = {
        'IT': 'it-IT', 'EN': 'en-US', 'FR': 'fr-FR',
        'ES': 'es-ES', 'RU': 'ru-RU', 'ZH': 'zh-CN', 'DE': 'de-DE'
      };
      const utteranceLang = langMap[language?.toUpperCase()] || 'it-IT';
      const langPrefix = utteranceLang.split('-')[0];

      // ── Carica voci ──
      const loadVoices = (): Promise<SpeechSynthesisVoice[]> =>
        new Promise(resolve => {
          const v = window.speechSynthesis.getVoices();
          if (v.length > 0) return resolve(v);
          const onVC = () => { window.speechSynthesis.removeEventListener('voiceschanged', onVC); resolve(window.speechSynthesis.getVoices()); };
          window.speechSynthesis.addEventListener('voiceschanged', onVC);
          setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1500);
        });

      const allVoices = await loadVoices();
      const langVoices = allVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));

      const scoreVoice = (v: SpeechSynthesisVoice) => {
        const n = v.name.toLowerCase();
        let s = 0;
        if (n.includes('siri') || n.includes('premium') || n.includes('enhanced') || n.includes('natural')) s += 100;
        if (n.includes('neural') || n.includes('wavenet') || n.includes('studio')) s += 90;
        if (n.includes('google')) s += 80;
        if (n.includes('microsoft') && (n.includes('natural') || n.includes('neural'))) s += 85;
        if (n.includes('apple')) s += 75;
        if (v.localService) s += 20;
        const isDante = guideMode === 'dante';
        const maleK = ['matteo','luca','diego','massimo','giorgio','male','david','james','william','reed','thomas','alex','cosimo','marco'];
        const femK = ['nicky','alice','anna','sofia','elena','sara','female','woman','lisa','emma','julia','elsa'];
        if (isDante && maleK.some(k => n.includes(k))) s += 50;
        if (!isDante && femK.some(k => n.includes(k))) s += 50;
        return s;
      };

      let chosenVoice: SpeechSynthesisVoice | null = null;
      if (langVoices.length > 0) {
        chosenVoice = [...langVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
        console.log(`[Podcast] Voce: "${chosenVoice.name}" local=${chosenVoice.localService}`);
      } else {
        chosenVoice = allVoices.find(v => v.localService) || allVoices[0] || null;
      }

      const pitch = guideMode === 'dante' ? 0.85 : 1.05;

      // ── Chunking ──
      const chunks = (ttsText.match(/[^.!?…\n]+(?:[.!?…]+|$)/g) || [ttsText])
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 3);

      if (chunks.length === 0) return;

      startTtsPlayback(chunks, utteranceLang, chosenVoice, pitch, dayNum);

    } catch (e: any) {
      console.error('[Podcast]', e);
      await refundPodcastCharge();
      setPlayingDay(null);
      setIsGeneratingPodcast(null);
      alert(`Errore podcast: ${e.message || 'Riprova.'}\nI crediti ti sono stati restituiti.`);
    }
  };

  const handlePausePodcast = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPodcastPaused(true);
    }
  };

  const handleResumePodcast = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPodcastPaused(false);
    }
  };

  const handleStopPodcast = () => {
    podcastCancelRef.current = true;
    window.speechSynthesis?.cancel();
    setPlayingDay(null);
    setIsPodcastPaused(false);
  };

  const handleReplayPodcast = () => {
    if (podcastRestartFnRef.current) {
      podcastCancelRef.current = true;
      window.speechSynthesis?.cancel();
      setIsPodcastPaused(false);
      podcastRestartFnRef.current();
    }
  };


  // Risolve la destinazione in coordinate certe: usa quelle già scelte
  // dall'autocomplete, altrimenti geocoding rigoroso (limit=1). Ritorna null
  // se la località non esiste — in quel caso i flussi si fermano con un
  // avviso invece di lasciare che l'AI "reinterpreti" il nome (Giza→Milano).
  const resolveDestCoords = async (): Promise<{ lat: number; lon: number; label: string } | null> => {
    const dest = (destinations[0] || '').trim();
    if (!dest) return null;

    // Supporto diretto per coordinate GPS (es. "GPS: 45.1234, 9.5678")
    if (dest.startsWith("GPS:")) {
      try {
        const parts = dest.replace("GPS:", "").split(",");
        if (parts.length === 2) {
          const lat = parseFloat(parts[0].trim());
          const lon = parseFloat(parts[1].trim());
          if (!isNaN(lat) && !isNaN(lon)) {
            return { lat, lon, label: dest };
          }
        }
      } catch (e) {
        console.warn("[PlanScreen] GPS parsing failed:", e);
      }
    }

    if (destCoords && destCoords.label === dest) return destCoords;
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return null;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(dest)}.json?access_token=${token}&limit=1&types=place,locality,region,country&language=${language.toLowerCase()}`
      );
      if (!res.ok) return null;
      const f = (await res.json()).features?.[0];
      if (!f?.center) return null;
      const coords = { lat: f.center[1], lon: f.center[0], label: dest };
      setDestCoords(coords);
      return coords;
    } catch {
      return null;
    }
  };

  const alertDestNotFound = () => {
    alert(language === 'IT'
      ? `Località "${destinations[0]}" non trovata. Controlla il nome e riprova.`
      : `Location "${destinations[0]}" not found. Check the name and try again.`);
  };

  const handleFetchCandidates = async () => {
    if (!destinations[0] || destinations[0].trim().length < 3) {
      alert(language === 'IT' ? 'Inserisci una destinazione valida' : 'Please enter a valid destination');
      return;
    }
    const coords = await resolveDestCoords();
    if (!coords && import.meta.env.VITE_MAPBOX_TOKEN) {
      alertDestNotFound();
      return;
    }
    setCandidatesLoading(true);
    setPlannerMode('tinder_swipe');
    setCandidates([]);
    setLikedCandidates([]);
    setCurrentCardIdx(0);
    setTinderActiveDay(1);
    try {
      const res = await fetch('/api/groq/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destinations[0],
          ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
          days,
          categories: tinderSelectedCategories,
          includeEvents,
          includeTours,
          language
        })
      });
      const data = await res.json();
      if (data && Array.isArray(data.candidates)) {
        setCandidates(data.candidates);
      } else {
        alert(language === 'IT' ? 'Nessuna attrazione trovata. Riprova.' : 'No attractions found. Please try again.');
        setPlannerMode('tinder_form');
      }
    } catch (err) {
      console.error(err);
      alert(language === 'IT' ? 'Errore durante il recupero dei candidati.' : 'Error retrieving candidates.');
      setPlannerMode('tinder_form');
    } finally {
      setCandidatesLoading(false);
    }
  };

  const handleGenerateTinderItinerary = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    if (likedCandidates.length === 0) {
      alert(language === 'IT' ? "Seleziona almeno un'attrazione col cuore per generare l'itinerario." : 'Select at least one attraction with a heart to generate the itinerary.');
      return;
    }

    // Coordinate certe PRIMA di addebitare: se la località non esiste ci si
    // ferma qui, senza consumare crediti.
    const coords = await resolveDestCoords();
    if (!coords && import.meta.env.VITE_MAPBOX_TOKEN) {
      alertDestNotFound();
      return;
    }

    // Stesso addebito degli altri percorsi di generazione (saldo + conferma + consumo)
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = Math.max(1, days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
      return;
    }
    const payRes = await consumeCredits(currentUserId, totalItineraryCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");
      return;
    }

    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    try {
      const poisList = likedCandidates.map(c => c.titolo_tappa);
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinations[0],
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        days,
        interests: selectedInterests.length > 0 ? selectedInterests : ['generale'],
        pois: poisList,
        lockedStops: [],
        specialRequests: specialRequests || 'Usa rigorosamente le attrazioni selezionate per strutturare le tappe principali.',
        includeEvents,
        includeTours,
        budget,
        viaggiatori,
        ritmo,
        guida,
        radius: parseInt(radius),
        language
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        setPlannerMode('view');
        await settleItineraryCost(currentUserId, numDaysForPricing, data);
      } else {
        // Nessun itinerario valido: rimborsiamo i crediti addebitati
        await refundCredits(currentUserId, totalItineraryCost);
        alert(language === 'IT' ? "Errore nella generazione dell'itinerario. I crediti ti sono stati restituiti." : 'Error generating itinerary. Your credits have been refunded.');
      }
    } catch (err) {
      console.error(err);
      await refundCredits(currentUserId, totalItineraryCost);
      alert(language === 'IT' ? 'Errore durante la generazione. I crediti ti sono stati restituiti.' : 'Error during generation. Your credits have been refunded.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromFavorites = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    if (selectedFavoriteIds.length === 0) return alert("Seleziona almeno un luogo!");

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = Math.max(1, days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
       
       
       return;
    }
    const payRes = await consumeCredits(currentUserId, totalItineraryCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");
      
      
      return;
    }

    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    try {
      const allPois = [...itinerary.map(p => ({ id: p.id, poi: p })), ...savedPois.map(s => ({ id: s.poi_id || s.id, poi: s.data || s }))]
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i); // Deduplicate

      const selectedPoisFull = allPois
        .filter(s => selectedFavoriteIds.includes(s.id))
        .map(s => {
          const lat = s.poi.lat || s.poi.location?.lat || 0;
          const lon = s.poi.lon || s.poi.location?.lng || 0;
          return `${s.poi.name || s.poi.title} (Coordinate: ${lat}, ${lon}) - ${s.poi.description || s.poi.editorial_summary?.overview || s.poi.attivita || ""}`;
        });

      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: "Tappe Selezionate",
        days: Math.ceil(selectedPoisFull.length / 3) || 1,
        startTime,
        endTime,
        specialRequests,
        includeEvents,
        includeTours,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        pois: selectedPoisFull,
        radius: parseInt(radius),
        language
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        setPlannerMode('view');
        // Qui la discrepanza era doppia: si addebitava sui giorni del form ma
        // si generava ceil(tappe/3) giorni — il conguaglio riallinea al reale.
        await settleItineraryCost(currentUserId, numDaysForPricing, data);
      } else {
         // Nessun itinerario valido: rimborsiamo i crediti addebitati
         await refundCredits(currentUserId, totalItineraryCost);
         alert("Impossibile generare l'itinerario. Assicurati che i luoghi includano un minimo di informazioni coerenti. I crediti ti sono stati restituiti.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      await refundCredits(currentUserId, totalItineraryCost);
      alert("Errore durante la generazione dell'itinerario: " + (err.message || "Verifica la console") + "\nI crediti ti sono stati restituiti.");
    } finally {
      setLoading(false);
    }
  };

  const savePlanToSupabase = async (plan: GeneratedItinerary) => {
    try {
      if (!plan.id) {
        plan.id = crypto.randomUUID();
      }

      // [AUTOMAZIONE POI AI] - Versione Ottimizzata e Protetta (FASE 1)
      try {
        // Estrai il nome della città dalla destinazione o dal titolo del piano
        const cityFromPlan = (plan as any).destinazione || (plan as any).destination || 
          plan.titolo?.split(':')?.[0]?.trim() || "";

        const allStops = plan.giorni.flatMap(g => g.tappe);
        const poiPayloads = allStops
          .filter(t => t.coordinate && t.coordinate.lat !== 0)
          .map(tappa => {
            const lat = parseFloat(String(tappa.coordinate.lat));
            const lon = parseFloat(String(tappa.coordinate.lng || (tappa.coordinate as any).lon));
            const poiId = tappa.id_tappa && !tappa.id_tappa.startsWith('custom-')
              ? tappa.id_tappa
              : `ai_${lat.toFixed(5)}_${lon.toFixed(5)}`.replace(/\./g, '_');

            const descriptionFull = tappa.attivita || "";
            const descShort = descriptionFull.substring(0, 300).replace(/\n/g, ' ').trim();
            const descLong = descriptionFull;

            return {
              id: poiId,
              lat,
              lon,
              name: tappa.titolo_tappa,
              city: cityFromPlan,
              category: mapItineraryCategoryToMapCategory(tappa.tipo || "monumenti"),
              description_ai: descLong + (tappa.consiglio_guida ? "\n\n💡 " + tappa.consiglio_guida : ""),
              description_short: descShort,
              description_long: descLong,
              status: 'auto', // generati dall'AI: non marcarli come verificati
              created_at: new Date().toISOString()
            };
          });

        if (poiPayloads.length > 0) {
          // 1. Unica chiamata batch al DB (Efficienza 10x)
          await supabase.from("shared_pois").upsert(poiPayloads, { onConflict: "id" });
          console.log(`[PlanScreen] Batch upserted ${poiPayloads.length} POIs`);

          // 2. Arricchimento Sequenziale (Evita il 429 Too Many Requests)
          // Eseguiamo l'arricchimento in background senza bloccare l'utente
          const enrichSequentially = async () => {
            // Guardia anti-tempesta: ogni modifica di tappa risalvava il piano
            // e rilanciava l'arricchimento di TUTTI i POI in parallelo ai loop
            // precedenti. Ora: un solo loop alla volta, e ogni POI viene
            // arricchito una sola volta per sessione.
            if (enrichInFlightRef.current) return;
            enrichInFlightRef.current = true;
            try {
              for (const poi of poiPayloads) {
                if (enrichedPoiIdsRef.current.has(poi.id)) continue;
                try {
                  await fetch('/api/poi/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...poi, lang: language, fast: false, mode: 'full' })
                  });
                  enrichedPoiIdsRef.current.add(poi.id);
                  // Piccolo delay di cortesia per le API esterne
                  await new Promise(r => setTimeout(r, 600));
                } catch (e) {
                  console.warn(`[PlanScreen] Enrichment failed for ${poi.name}`);
                }
              }
            } finally {
              enrichInFlightRef.current = false;
            }
          };
          enrichSequentially();
        }
      } catch (e) {
        console.warn("[AI POI Optimization] Batching failed:", e);
      }

      // Include i testi podcast già generati (a pagamento) così non vanno persi
      // al riaprire l'itinerario: stessa chiave `podcast_cache` usata da
      // savePodcastToSupabase e letta nel resume da "I miei itinerari"/offline.
      const datiItinerario = {
        ...plan,
        podcast_cache: { ...((plan as any).podcast_cache || {}), ...podcastCache }
      };

      // Copia locale sempre aggiornata: riapertura istantanea e a prova di
      // offline anche se Supabase fallisce dopo.
      idbSet('wip_last_plan', datiItinerario).catch(() => {});

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) {
        // Fallback locale... (rimane invariato)
        let localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        const idx = localData.findIndex((i: any) => i.id === plan.id);
        const newItem = { id: plan.id, titolo: plan.titolo, dati_itinerario: datiItinerario, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (idx >= 0) localData[idx] = newItem; else localData.push(newItem);
        localStorage.setItem('mock_db_user_itineraries', JSON.stringify(localData));
        return;
      }

      // Salva itinerario utente
      await supabase.from('user_itineraries').upsert({
        id: plan.id,
        user_id: currentUserId,
        titolo: plan.titolo,
        dati_itinerario: datiItinerario,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      // ✅ Sincronizzazione shared_itinerary_cache (per ricerca per città)
      const destinationName = (plan as any).destinazione || (plan as any).destination || 
        plan.titolo?.split(':')?.[0]?.trim() || "";
      const numDays = plan.giorni?.length || 1;
      if (destinationName) {
        supabase.from('shared_itinerary_cache').upsert({
          id: plan.id,
          destination: destinationName,
          days: numDays,
          dati_itinerario: plan,
          created_at: new Date().toISOString()
        }, { onConflict: 'id' }).then(({ error }) => {
          if (error) console.warn("[PlanScreen] shared_itinerary_cache sync failed:", error);
          else console.log(`✅ [PlanScreen] Itinerario sincronizzato in shared_itinerary_cache: ${destinationName}`);
        });
      }

      // Sincronizzazione per Agent Optimization
      let finalItineraryId = dbItineraryId;
      if (dbItineraryId) {
        await supabase.from('itineraries').update({ plan: plan, updated_at: new Date().toISOString() }).eq('id', dbItineraryId);
      } else {
        const { data: newItinerary } = await supabase.from('itineraries').insert({ user_id: currentUserId, plan: plan }).select('id').single();
        if (newItinerary?.id) {
          setDbItineraryId(newItinerary.id);
          finalItineraryId = newItinerary.id;
        }
      }

      // Sincronizzazione attiva con il modulo nativo per la navigazione fluida
      if (typeof window !== 'undefined' && (window as any).locationService) {
        (window as any).locationService.syncSettings(plan.giorni.flatMap(g => g.tappe), guideMode, language, isAudioGuideActive, false);
      }

    } catch (err) {
      console.error("Save plan error:", err);
    }
  };

  // ── Salva i podcast generati in Supabase (campo podcast_cache in dati_itinerario) ──
  const savePodcastToSupabase = async (planId: string, cacheKey: string, text: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId || !planId) return;

      // Leggi il record corrente per fare merge della cache
      const { data: existing } = await supabase
        .from('user_itineraries')
        .select('dati_itinerario')
        .eq('id', planId)
        .eq('user_id', userId)
        .single();

      const currentData = existing?.dati_itinerario || {};
      const updatedData = {
        ...currentData,
        podcast_cache: {
          ...(currentData.podcast_cache || {}),
          [cacheKey]: text
        }
      };

      await supabase
        .from('user_itineraries')
        .update({ dati_itinerario: updatedData, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .eq('user_id', userId);

      console.log(`[Podcast] Cache salvata su Supabase per ${cacheKey}`);
    } catch (e) {
      console.warn('[Podcast] Salvataggio Supabase fallito (non critico):', e);
    }
  };

  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlinePlans, setOfflinePlans] = useState<any[]>([]);

  useEffect(() => {
    if (plannerMode === 'offline_list') {
      getOfflineItinerariesList().then(list => setOfflinePlans(list));
    }
  }, [plannerMode]);

  const handleSaveOffline = async () => {
    if (!generatedPlan) return;
    setOfflineStatus("Scarico file audio e mappe...");
    
    try {
      const salvataggio = {
        ...generatedPlan,
        data_salvataggio: new Date().toISOString(),
        citta: generatedPlan.titolo || 'Città Personalizzata',
        descrizione: `Itinerario di ${generatedPlan.giorni.length} giorni con ${generatedPlan.giorni.reduce((acc, g) => acc + g.tappe.length, 0)} tappe.`
      };
      
      const id = (generatedPlan.titolo || 'itinerario').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      await saveOfflineItinerary(id, salvataggio);
      
      setOfflineStatus("Disponibile Offline ✓");
      setTimeout(() => setOfflineStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setOfflineStatus("Errore durante il salvataggio");
      setTimeout(() => setOfflineStatus(null), 3000);
    }
  };

  const handleDeleteTappa = (giornoIdx: number, tappaId: string) => {
    if (!generatedPlan) return;
    const newPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === giornoIdx
          ? { ...g, tappe: g.tappe.filter(t => t.id_tappa !== tappaId) }
          : g
      )
    };
    setGeneratedPlan(newPlan);
    savePlanToSupabase(newPlan);
  };

  const handleMoveTappa = (giornoIdx: number, tappaIdx: number, direction: 'up' | 'down') => {
    if (!generatedPlan) return;
    const tappe = generatedPlan.giorni[giornoIdx]?.tappe;
    if (!tappe) return;
    const targetIdx = direction === 'up' ? tappaIdx - 1 : tappaIdx + 1;
    if (targetIdx < 0 || targetIdx >= tappe.length) return;

    // Aggiornamento immutabile: nuovi array/oggetti per giorno e tappe scambiate,
    // così PlanMap (dep [giorni]) e gli altri consumer si accorgono del cambiamento.
    // Le tappe si scambiano di posto ma ogni slot mantiene il proprio orario.
    const newTappe = [...tappe];
    newTappe[tappaIdx] = { ...tappe[targetIdx], ora: tappe[tappaIdx].ora };
    newTappe[targetIdx] = { ...tappe[tappaIdx], ora: tappe[targetIdx].ora };

    const newPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === giornoIdx ? { ...g, tappe: newTappe } : g
      )
    };

    setGeneratedPlan(newPlan);
    savePlanToSupabase(newPlan);
  };

  const handleReplaceTappa = async (tappaId: string) => {
    if (!generatedPlan) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    // Costo per la sostituzione di una singola tappa (non l'intero itinerario)
    const replaceCost = PRICING_LIST.audio_guide * 0.5;
    const confirmed = await creditConfirm.requestConfirmation(replaceCost, "Sostituzione tappa AI", bal.total);
    if (!confirmed) {


       return;
    }
    const payRes = await consumeCredits(currentUserId, replaceCost);
    if (!payRes) {
      alert("Crediti insufficienti. Visita lo store per ricaricare.");


      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/groq/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentItinerary: generatedPlan,
          tappaId
        })
      });
      const data = await res.json();
      if (data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        // Anche la tappa sostituita passa dalla verifica anti-allucinazione
        // in background: i badge ✓/⚠ arrivano via 'wip-itinerary-verified'
        verifyItineraryAntiAllucinazioni(data, {
          destination: destinations.filter(d => d.trim()).join(' e ') || generatedPlan.titolo,
          lat: destCoords?.lat,
          lon: destCoords?.lon,
          specialRequests,
          interests: selectedInterests,
        }).then((verified) => {
          if (verified && verified !== data && verified.giorni) {
            window.dispatchEvent(new CustomEvent('wip-itinerary-verified', { detail: verified }));
          }
        }).catch(() => {});
      } else {
        // Nessuna sostituzione valida: rimborsiamo i crediti addebitati
        await refundCredits(currentUserId, replaceCost);
        alert("L'AI non è riuscita a sostituire la tappa. I crediti ti sono stati restituiti.");
      }
    } catch (err) {
      console.error("Replace error:", err);
      await refundCredits(currentUserId, replaceCost);
      alert("Errore durante la sostituzione della tappa. I crediti ti sono stati restituiti.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddTappa = (giornoIdx: number) => {
    if (!generatedPlan || !newStop.titolo_tappa || !newStop.ora) {
      alert("Compila almeno 'Nome Tappa' e 'Ora'");
      return;
    }

    // Create new tappa object
    const tappa = {
      id_tappa: `custom-${Date.now()}`,
      ora: newStop.ora,
      titolo_tappa: newStop.titolo_tappa,
      attivita: newStop.attivita,
      consiglio_guida: newStop.consiglio_guida,
      tempo_necessario: newStop.tempo_necessario,
      tipo: newStop.tipo,
      coordinate: {
        lat: parseFloat(newStop.lat) || 0,
        lng: parseFloat(newStop.lng) || 0
      }
    };

    // Aggiornamento immutabile del giorno interessato. Ordinamento: prima le
    // tappe con orario HH:MM (in ordine cronologico), poi le altre
    // ("Da definire", "TBD", ...) nell'ordine attuale.
    const isOrario = (v: string) => /^\d{1,2}:\d{2}$/.test((v || '').trim());
    const toMinuti = (v: string) => {
      const [h, m] = v.trim().split(':').map(Number);
      return h * 60 + m;
    };
    const merged = [...generatedPlan.giorni[giornoIdx].tappe, tappa];
    const conOrario = merged.filter(t => isOrario(t.ora)).sort((a, b) => toMinuti(a.ora) - toMinuti(b.ora));
    const senzaOrario = merged.filter(t => !isOrario(t.ora));

    const newPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === giornoIdx ? { ...g, tappe: [...conOrario, ...senzaOrario] } : g
      )
    };

    setGeneratedPlan(newPlan);
    savePlanToSupabase(newPlan);
    setAddingStopDay(null);
    setNewStop({ ora: '', titolo_tappa: '', attivita: '', consiglio_guida: '', tempo_necessario: '', tipo: 'visita', lat: '', lng: '' });
  };

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectItineraryPoi = async (tappa: any) => {
    if (!onSelectPoi) return;

    // ID Unificato (Issue 12): usiamo lo schema ai_lat_lon per coerenza con
    // shared_pois e savePlanToSupabase, evitando duplicati non deterministici.
    const lat = tappa.coordinate?.lat || 0;
    const lon = tappa.coordinate?.lng || (tappa.coordinate as any)?.lon || 0;
    const stableId = tappa.id_tappa && !tappa.id_tappa.startsWith('custom-')
      ? tappa.id_tappa
      : `ai_${lat.toFixed(5)}_${lon.toFixed(5)}`.replace(/\./g, '_');

    const category = tappa.tipo || 'monumenti';
    const desc = tappa.attivita || '';

    // Silently upsert to Supabase to make it a real POI for audio guide support
    if (lat !== 0 && lon !== 0) {
      await supabase.from('shared_pois').upsert({
        id: stableId,
        name: tappa.titolo_tappa,
        category: category,
        lat: lat,
        lon: lon,
        description_ai: desc,
        source: 'itinerary',
        created_at: new Date().toISOString()
      }, { onConflict: "id" });
    }

    // Cerchiamo un'immagine valida se presente nei dettagli già noti
    const existingPoi = (generatedPlan as any).poi_details_cache?.[stableId];

    onSelectPoi({
      id: stableId,
      name: tappa.titolo_tappa,
      description: desc,
      category: category,
      lat: lat,
      lon: lon,
      image_url: existingPoi?.image_url || ''
    });
  };

  const toggleFavorite = (id: string) => {
    setSelectedFavoriteIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const renderAdvancedSettings = () => (
    <>
      <div className="space-y-2 pt-2">
        <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
          <input type="checkbox" checked={includeEvents} onChange={e => setIncludeEvents(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary">🎵 Includi Eventi Locali</span>
            <span className="text-xs text-gray-500">Concerti, sport, fiere nelle vicinanze</span>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
          <input type="checkbox" checked={includeTours} onChange={e => setIncludeTours(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary">🗺️ Includi Tour e Attività</span>
            <span className="text-xs text-gray-500">Esperienze Viator con commissione affiliato</span>
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        className="w-full py-3 mt-4 bg-gray-50 text-primary rounded-2xl font-bold text-sm border border-outline-variant/10 flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <ListChecks className="w-4 h-4" />
        {showAdvancedOptions ? getTranslation("hide_basic_options", language) : getTranslation("show_basic_options", language)}
      </button>

      <AnimatePresence>
        {showAdvancedOptions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden pt-4"
          >
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">Budget</label>
                <select 
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="economico">Economico</option>
                  <option value="standard">Standard</option>
                  <option value="lusso">Lusso</option>
                </select>
              </div>
              <div className="flex-1 space-y-3">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">Viaggiatori</label>
                <select 
                  value={viaggiatori}
                  onChange={(e) => setViaggiatori(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="solo">Solo</option>
                  <option value="coppia">Coppia</option>
                  <option value="famiglia">Famiglia</option>
                  <option value="gruppo">Gruppo</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">Ritmo</label>
                <select 
                  value={ritmo}
                  onChange={(e) => setRitmo(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="rilassato">Rilassato</option>
                  <option value="standard">Standard</option>
                  <option value="intenso">Intenso</option>
                </select>
              </div>
              <div className="flex-1 space-y-3">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">Guida</label>
                <select 
                  value={guida}
                  onChange={(e) => setGuida(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="NICKY">Nicky (Locale)</option>
                  <option value="DANTE">Dante (Storico)</option>
                  <option value="ENTRAMBI">Entrambi</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#f8f5f0] overflow-y-auto overflow-x-hidden print:overflow-visible pb-32 print:pb-0 no-scrollbar">
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}
      {/* Header */}
      <div className="px-6 pt-12 pb-8 bg-primary text-white relative overflow-hidden print:hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tight mb-2">{getTranslation("planner_title", language)}</h1>
          <p className="text-white/60 text-sm font-bold">{getTranslation("planner_desc", language)}</p>
        </div>
      </div>


      <div className="p-6">
        <AnimatePresence mode="wait">
          {plannerMode === 'selection' && (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 pt-4"
            >
              <div className="grid grid-cols-2 gap-4">
                {/* Form A: Itinerario su Misura */}
                <button 
                  onClick={() => setPlannerMode('form_a')}
                  className="p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-primary/50 transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation("auto_mode", language)}</h3>
                  <p className="text-[10px] text-gray-500 font-bold leading-snug">
                    {getTranslation("auto_mode_desc", language)}
                  </p>
                </button>

                {/* Form B: Basato sui Preferiti */}
                <button 
                  onClick={() => setPlannerMode('form_b')}
                  className="p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-secondary/50 transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Star className="w-6 h-6 text-secondary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation("favorites_mode", language)}</h3>
                  <p className="text-[10px] text-gray-500 font-bold leading-snug">
                    {getTranslation("favorites_mode_desc", language)}
                  </p>
                </button>

                {/* Form C: Esplorazione a Raggio */}
                <button 
                  onClick={() => setPlannerMode('form_c')}
                  className="p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-tertiary/50 transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Compass className="w-6 h-6 text-tertiary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{language === 'IT' ? 'Raggio' : 'Radius'}</h3>
                  <p className="text-[10px] text-gray-500 font-bold leading-snug">
                    {language === 'IT' ? 'Scegli base e raggio per 3 alternative' : 'Choose base, radius for 3 options'}
                  </p>
                </button>

                {/* Form Swip */}
                <button
                  onClick={() => setPlannerMode('tinder_form')}
                  className="p-5 bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl border border-rose-200/60 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-rose-400/50 transition-all"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-rose-100 to-pink-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{language === 'IT' ? 'Swip' : 'Swip'}</h3>
                  <p className="text-[10px] text-gray-500 font-bold leading-snug">
                    {language === 'IT' ? 'Scorri e scegli le attrazioni' : 'Swipe to choose attractions'}
                  </p>
                </button>
              </div>

              {/* I Miei Itinerari (tasto lungo) + Offline */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setPlannerMode('my_itineraries'); fetchMyItineraries(); fetchSavedPremiumGuides(); }}
                  className="flex-1 p-4 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-3 group hover:bg-blue-100 hover:border-blue-300 transition-all"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <History className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xs font-black text-gray-900">{getTranslation('my_itineraries', language)}</h3>
                    <p className="text-[9px] text-gray-500 font-bold">{language === 'IT' ? 'Viaggi salvati' : 'Saved trips'}</p>
                  </div>
                </button>
                <button 
                  onClick={() => setPlannerMode('offline_list')}
                  className="flex-1 p-4 bg-primary rounded-2xl shadow-md flex items-center gap-3 group hover:bg-primary/90 transition-all"
                >
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Download className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xs font-black text-white">{getTranslation("offline_mode", language)}</h3>
                    <p className="text-[9px] text-gray-300 font-bold">{language === 'IT' ? 'Senza internet' : 'No internet'}</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {plannerMode === 'form_a' && (
            <motion.div 
              key="form_a"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 pt-4"
            >
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("destination", language)}</label>
                  
                  <div className="space-y-3">
                    {destinations.map((dest, idx) => (
                      <div key={idx} className="relative flex items-center gap-2">
                        <div className="relative flex-1 border-b border-outline focus-within:border-primary transition-colors pb-1">
                          <MapPin className="absolute left-1 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                          <input 
                            type="text" 
                            placeholder={idx === 0 ? "Es: Firenze, Roma..." : "Aggiungi altra destinazione..."}
                            className="w-full pl-8 pr-4 py-3 bg-transparent outline-none font-medium text-on-surface text-base placeholder:text-outline-variant"
                            value={dest}
                            onChange={(e) => {
                              const newDests = [...destinations];
                              newDests[idx] = e.target.value;
                              setDestinations(newDests);
                              if (idx === 0) setDestCoords(null);
                              setFocusedDestIdx(idx);
                              setShowSuggestions(true);
                            }}
                            onFocus={() => {
                              setFocusedDestIdx(idx);
                              setShowSuggestions(true);
                            }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          />
                        </div>

                        {destinations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newDests = destinations.filter((_, i) => i !== idx);
                              setDestinations(newDests);
                            }}
                            className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDestinations([...destinations, ''])}
                    className="mt-2 text-xs font-black text-primary hover:text-primary-hover flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/10 transition-all active:scale-95"
                  >
                    <span>➕</span> {language === 'IT' ? 'Aggiungi destinazione' : 'Add destination'}
                  </button>

                  {/* Suggestions Dropdown */}
                  <AnimatePresence>
                    {showSuggestions && focusedDestIdx !== null && (destinations[focusedDestIdx]?.length >= 3) && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        role="listbox"
                        aria-label={getTranslation("destination", language)}
                        className="absolute left-6 right-6 mt-2 bg-surface rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden z-50 max-h-72 overflow-y-auto"
                      >
                        {isSearching ? (
                          <div className="p-4 text-center text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-2" aria-live="polite">
                            <Loader2 className="w-4 h-4 animate-spin" /> {language === 'IT' ? 'Ricerca...' : 'Searching...'}
                          </div>
                        ) : suggestions.length > 0 ? (
                          /* Ordine naturale: la tendina si apre verso il BASSO, il
                             risultato migliore deve stare in cima (il vecchio
                             reverse() lo spingeva in fondo alla lista). */
                          suggestions.map((suggestion, index) => {
                            const full = suggestion.display_name || suggestion.description || '';
                            const main = full.split(',')[0];
                            const rest = full.split(',').slice(1).join(',').trim();
                            return (
                            <button
                              key={index}
                              type="button"
                              role="option"
                              aria-selected={false}
                              className="w-full text-left px-4 py-3.5 min-h-[52px] hover:bg-primary/5 active:bg-primary/10 transition-colors border-b border-outline-variant/5 last:border-0 flex items-start gap-3"
                              onClick={() => {
                                const name = suggestion.isMapbox
                                  ? suggestion.description.split(",")[0]
                                  : (suggestion.display_name || suggestion.description);
                                const newDests = [...destinations];
                                newDests[focusedDestIdx] = name;
                                setDestinations(newDests);
                                if (focusedDestIdx === 0 && suggestion.lat != null && suggestion.lon != null) {
                                  setDestCoords({ lat: suggestion.lat, lon: suggestion.lon, label: name });
                                }
                                setShowSuggestions(false);
                                setFocusedDestIdx(null);
                              }}
                            >
                              <div className="mt-0.5 p-1.5 bg-primary/5 rounded-lg shrink-0">
                                <MapPin className="w-4 h-4 text-primary" />
                              </div>
                              <span className="flex flex-col min-w-0">
                                <span className="text-[15px] font-bold text-on-surface leading-tight break-words">{main}</span>
                                {rest && <span className="text-xs text-on-surface-variant leading-snug mt-0.5 break-words">{rest}</span>}
                              </span>
                            </button>
                            );
                          })
                        ) : (
                          <div className="p-4 text-center text-sm font-semibold text-on-surface-variant" aria-live="polite">
                            {language === 'IT' ? 'Nessun risultato trovato.' : 'No results found.'}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("duration", language)}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm overflow-x-auto no-scrollbar">
                      {[1, 2, 3, 4, 5, 6, 7].map(d => (
                        <button 
                          key={d}
                          onClick={() => setDays(d)}
                          className={`flex-1 min-w-[40px] py-3 rounded-2xl font-black text-sm transition-all ${days === d ? 'bg-primary text-white shadow-lg' : 'text-primary/40 hover:bg-primary/5'}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="w-24 shrink-0 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm flex items-center">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                        className="w-full text-center font-black text-primary text-sm bg-transparent outline-none"
                      />
                      <span className="text-xs font-bold text-primary/40 pr-2">gg</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('period_month', language)}</label>
                  <select 
                    value={mese}
                    onChange={(e) => setMese(e.target.value)}
                    className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm appearance-none"
                  >
                    <option value="">{getTranslation('generic_any', language)}</option>
                    <option value="Gennaio">Gennaio</option>
                    <option value="Febbraio">Febbraio</option>
                    <option value="Marzo">Marzo</option>
                    <option value="Aprile">Aprile</option>
                    <option value="Maggio">Maggio</option>
                    <option value="Giugno">Giugno</option>
                    <option value="Luglio">Luglio</option>
                    <option value="Agosto">Agosto</option>
                    <option value="Settembre">Settembre</option>
                    <option value="Ottobre">Ottobre</option>
                    <option value="Novembre">Novembre</option>
                    <option value="Dicembre">Dicembre</option>
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-3">
                    <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("start_time", language)}</label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("end_time", language)}</label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("interests", language)}</label>
                  <div className="flex flex-wrap gap-3">
                    {interests.map(i => (
                      <button 
                        key={i.id}
                        onClick={() => toggleInterest(i.id)}
                        className={`px-6 py-3 rounded-full font-black text-xs transition-all border ${selectedInterests.includes(i.id) ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white border-outline-variant/10 text-primary/60 hover:border-primary/30'}`}
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("special_requests", language)}</label>
                  <input 
                    type="text" 
                    placeholder={getTranslation("placeholder_interests", language)} 
                    className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                  />
                </div>

                {renderAdvancedSettings()}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setPlannerMode('selection')}
                  className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/40 hover:text-red-500 transition-colors shadow-sm"
                >
                  <X className="w-6 h-6" />
                </button>
                <button 
                  onClick={handleGenerateAutomatic}
                  disabled={loading || !isOnline || !destinations.some(d => d.trim().length >= 3)}
                  className="flex-1 h-16 bg-primary text-white rounded-3xl font-black tracking-tight shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50 px-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="/avatar.png" alt="Avatar" className="w-8 h-8 rounded-full border border-white/20 object-cover" />}
                  <span className="text-sm">{isOnline ? "WIP, Genera l'itinerario" : getTranslation("offline_btn", language)}</span>
                </button>
              </div>
            </motion.div>
          )}

          {plannerMode === 'form_b' && (
            <motion.div 
              key="form_b"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 pt-4"
            >
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-xl font-black text-primary">{getTranslation("favorites_mode", language)}</h3>
                <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">
                  {selectedFavoriteIds.length} {getTranslation('selected_items', language)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 max-h-[50dvh] overflow-y-auto pr-2 no-scrollbar">
                {[...itinerary.map(p => ({ id: p.id, poi: p })), ...savedPois.map(s => ({ id: s.poi_id || s.id, poi: s.data || s }))]
                  .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i) // Deduplicate
                  .map(item => (
                  <button 
                    key={item.id}
                    onClick={() => toggleFavorite(item.id)}
                    className={`p-4 rounded-[2rem] border transition-all flex items-center gap-4 text-left ${selectedFavoriteIds.includes(item.id) ? 'bg-secondary/5 border-secondary shadow-md' : 'bg-white border-outline-variant/10 shadow-sm opacity-60'}`}
                  >
                    <FavoriteImageOrIcon poi={item.poi || {}} />
                    <div className="flex-1">
                      <h4 className="font-black text-on-surface text-sm">{item.poi?.name || item.poi?.title || 'Monumento'}</h4>
                      <p className="text-[10px] font-bold text-on-surface-variant opacity-60 uppercase">{item.poi?.category || 'Migliore Scelta'}</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${selectedFavoriteIds.includes(item.id) ? 'bg-secondary text-white' : 'border-2 border-outline-variant/20'}`}>
                      {selectedFavoriteIds.includes(item.id) && <Check className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
                
                {itinerary.length === 0 && savedPois.length === 0 && (
                   <div className="p-12 border-2 border-dashed border-outline-variant/30 rounded-[2.5rem] flex flex-col items-center text-center opacity-40">
                      <Heart className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold">{getTranslation("no_gems", language)}</p>
                   </div>
                )}
              </div>

              <div className="space-y-3 pt-4">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('period_month', language)}</label>
                <select 
                  value={mese}
                  onChange={(e) => setMese(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm appearance-none"
                >
                  <option value="">{getTranslation('generic_any', language)}</option>
                  <option value="Gennaio">Gennaio</option>
                  <option value="Febbraio">Febbraio</option>
                  <option value="Marzo">Marzo</option>
                  <option value="Aprile">Aprile</option>
                  <option value="Maggio">Maggio</option>
                  <option value="Giugno">Giugno</option>
                  <option value="Luglio">Luglio</option>
                  <option value="Agosto">Agosto</option>
                  <option value="Settembre">Settembre</option>
                  <option value="Ottobre">Ottobre</option>
                  <option value="Novembre">Novembre</option>
                  <option value="Dicembre">Dicembre</option>
                </select>
              </div>

              <div className="space-y-3 pt-4">
                {renderAdvancedSettings()}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setPlannerMode('selection')}
                  className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/40 hover:text-red-500 transition-colors shadow-sm"
                >
                  <X className="w-6 h-6" />
                </button>
                <button 
                  onClick={handleGenerateFromFavorites}
                  disabled={loading || selectedFavoriteIds.length === 0 || !isOnline}
                  className="flex-1 h-16 bg-secondary text-white rounded-3xl font-black tracking-tight shadow-xl shadow-secondary/20 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                  {isOnline ? getTranslation("btn_optimize", language) : getTranslation("offline_btn", language)}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── FORM C: ESPLORAZIONE A RAGGIO ── */}
          {plannerMode === 'form_c' && (
            <motion.div 
              key="form_c"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 pt-4"
            >
              <div className="space-y-6">
                
                {/* Base di Partenza */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">
                    {getTranslation('starting_point', language)}
                  </label>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/30" />
                      <input 
                        type="text" 
                        placeholder={getTranslation('starting_point_placeholder', language)}
                        className="w-full pl-12 pr-12 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                        value={destinations[0] || ''}
                        onChange={(e) => {
                          const newDests = [...destinations];
                          newDests[0] = e.target.value;
                          setDestinations(newDests);
                          setDestCoords(null);
                          setFocusedDestIdx(0);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => {
                          setFocusedDestIdx(0);
                          setShowSuggestions(true);
                        }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      />
                      <button 
                        onClick={() => {
                          if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition((pos) => {
                              const newDests = [...destinations];
                              newDests[0] = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                              setDestinations(newDests);
                            }, () => alert("Impossibile ottenere la posizione."));
                          }
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-primary hover:text-primary-hover p-1"
                        title={getTranslation('use_my_location', language)}
                      >
                        <LocateFixed className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Suggestions per Form C */}
                  <AnimatePresence>
                    {showSuggestions && focusedDestIdx === 0 && (destinations[0]?.length >= 3) && !destinations[0]?.startsWith("GPS:") && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        role="listbox"
                        aria-label={getTranslation('starting_point_placeholder', language)}
                        className="absolute left-6 right-6 mt-2 bg-surface rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden z-50 max-h-72 overflow-y-auto"
                      >
                        {isSearching ? (
                          <div className="p-4 text-center text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-2" aria-live="polite">
                            <Loader2 className="w-4 h-4 animate-spin" /> Ricerca...
                          </div>
                        ) : suggestions.length > 0 ? (
                          /* Ordine naturale (niente reverse): miglior risultato in cima */
                          suggestions.map((suggestion, index) => {
                            const full = suggestion.display_name || suggestion.description || '';
                            const main = full.split(',')[0];
                            const rest = full.split(',').slice(1).join(',').trim();
                            return (
                            <button
                              key={index}
                              type="button"
                              role="option"
                              aria-selected={false}
                              className="w-full text-left px-4 py-3.5 min-h-[52px] hover:bg-primary/5 active:bg-primary/10 transition-colors border-b border-outline-variant/5 last:border-0 flex items-start gap-3"
                              onClick={() => {
                                const label = suggestion.display_name || suggestion.description;
                                const newDests = [...destinations];
                                newDests[0] = label;
                                setDestinations(newDests);
                                if (suggestion.lat != null && suggestion.lon != null) {
                                  setDestCoords({ lat: suggestion.lat, lon: suggestion.lon, label });
                                }
                                setShowSuggestions(false);
                                setFocusedDestIdx(null);
                              }}
                            >
                              <div className="mt-0.5 p-1.5 bg-primary/5 rounded-lg shrink-0">
                                <MapPin className="w-4 h-4 text-primary" />
                              </div>
                              <span className="flex flex-col min-w-0">
                                <span className="text-[15px] font-bold text-on-surface leading-tight break-words">{main}</span>
                                {rest && <span className="text-xs text-on-surface-variant leading-snug mt-0.5 break-words">{rest}</span>}
                              </span>
                            </button>
                            );
                          })
                        ) : (
                          <div className="p-4 text-center text-sm font-semibold text-on-surface-variant" aria-live="polite">
                            Nessun risultato trovato.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Raggio chilometrico */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">
                    {getTranslation('radius_km', language)}
                  </label>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm">
                    {['100', '300', '500'].map(r => (
                      <button 
                        key={r}
                        onClick={() => setRadius(r)}
                        className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all ${radius === r && !['custom'].includes(radius) ? 'bg-emerald-600 text-white shadow-lg' : !['100','300','500'].includes(radius) ? 'text-primary/40 hover:bg-primary/5' : radius === r ? 'bg-emerald-600 text-white shadow-lg' : 'text-primary/40 hover:bg-primary/5'}`}
                      >
                        {r} km
                      </button>
                    ))}
                    {/* Input personalizzato */}
                    <div className={`flex items-center gap-1 px-3 py-2 rounded-2xl border-2 transition-all ${!['100','300','500'].includes(radius) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        placeholder="0"
                        value={!['100','300','500'].includes(radius) ? radius : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRadius(v);
                        }}
                        onFocus={() => {
                          if (['100','300','500'].includes(radius)) setRadius('');
                        }}
                        className="w-14 bg-transparent text-sm font-black text-emerald-700 placeholder-gray-300 outline-none text-center"
                      />
                      <span className="text-[10px] font-black text-gray-400">km</span>
                    </div>
                  </div>
                </div>

                {/* Interessi (Migliorati per esplorazione) */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("interests", language)}</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'arte', label: 'Arte & Cultura', icon: '🏛️' },
                      { id: 'famiglia', label: 'Famiglie', icon: '👨‍👩‍👧' },
                      { id: 'enogastronomia', label: 'Enogastronomia', icon: '🍷' },
                      { id: 'mare', label: 'Mare', icon: '🌊' },
                      { id: 'montagna', label: 'Montagna', icon: '⛰️' },
                      { id: 'natura', label: 'Natura', icon: '🌳' },
                      { id: 'relax', label: 'Relax', icon: '💆' },
                      { id: 'avventura', label: 'Avventura', icon: '🧗' }
                    ].map(interest => (
                      <button 
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all flex items-center gap-2 border-2 ${selectedInterests.includes(interest.id) ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-on-surface border-outline-variant/10 hover:border-primary/30'}`}
                      >
                        <span>{interest.icon}</span>
                        {interest.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Periodo / Mese */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('period_month', language)}</label>
                  <select 
                    value={mese}
                    onChange={(e) => setMese(e.target.value)}
                    className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-emerald-600/20 outline-none font-bold text-on-surface text-sm appearance-none"
                  >
                    <option value="">{getTranslation('generic_any', language)}</option>
                    <option value="Gennaio">Gennaio</option>
                    <option value="Febbraio">Febbraio</option>
                    <option value="Marzo">Marzo</option>
                    <option value="Aprile">Aprile</option>
                    <option value="Maggio">Maggio</option>
                    <option value="Giugno">Giugno</option>
                    <option value="Luglio">Luglio</option>
                    <option value="Agosto">Agosto</option>
                    <option value="Settembre">Settembre</option>
                    <option value="Ottobre">Ottobre</option>
                    <option value="Novembre">Novembre</option>
                    <option value="Dicembre">Dicembre</option>
                  </select>
                </div>

                {/* Durata in Giorni */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("duration", language)}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm overflow-x-auto no-scrollbar">
                      {[1, 2, 3, 4, 5, 6, 7].map(d => (
                        <button 
                          key={d}
                          onClick={() => setDays(d)}
                          className={`flex-1 min-w-[40px] py-3 rounded-2xl font-black text-sm transition-all ${days === d ? 'bg-primary text-white shadow-lg' : 'text-primary/40 hover:bg-primary/5'}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="w-24 shrink-0 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm flex items-center">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                        className="w-full text-center font-black text-primary text-sm bg-transparent outline-none"
                      />
                      <span className="text-xs font-bold text-primary/40 pr-2">gg</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-3">
                    <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("start_time", language)}</label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("end_time", language)}</label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                    />
                  </div>
                </div>

                {renderAdvancedSettings()}

              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setPlannerMode('selection')}
                  className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/40 hover:text-red-500 transition-colors shadow-sm shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
                <button 
                  onClick={handleGenerateRadius}
                  disabled={loading || !isOnline}
                  className="flex-1 h-16 bg-emerald-600 text-white rounded-3xl font-black tracking-tight shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {isOnline ? (getTranslation('find_3_alts', language)) : getTranslation("offline_btn", language)}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── TINDER FORM ── */}
          {plannerMode === 'tinder_form' && (
            <motion.div
              key="tinder_form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 pt-4 pb-20"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => setPlannerMode('selection')} className="w-9 h-9 bg-white rounded-xl border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-black text-primary tracking-tight">❤️ Swip</h2>
                  <p className="text-xs text-gray-500 font-bold">{language === 'IT' ? 'Scegli le attrazioni che ti piacciono' : 'Choose attractions you like'}</p>
                </div>
              </div>

              {/* Destinazione */}
              <div className="relative">
                <label className="block text-xs font-black text-primary uppercase tracking-widest mb-2">{getTranslation('destination', language)}</label>
                <input
                  type="text"
                  value={destinations[0]}
                  onChange={(e) => { const d = [...destinations]; d[0] = e.target.value; setDestinations(d); setDestCoords(null); setShowSuggestions(true); setFocusedDestIdx(0); }}
                  onFocus={() => { setShowSuggestions(true); setFocusedDestIdx(0); }}
                  placeholder="Es: Firenze, Roma..."
                  className="w-full px-5 py-4 rounded-3xl border-2 border-amber-100 bg-white/80 text-sm font-bold placeholder-gray-300 focus:outline-none focus:border-primary/30 shadow-sm"
                />
                {showSuggestions && focusedDestIdx === 0 && suggestions.length > 0 && (
                  <div
                    role="listbox"
                    aria-label={getTranslation('destination', language)}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden max-h-72 overflow-y-auto"
                  >
                    {suggestions.map((s, i) => {
                      const full = s.description || s.display_name || s.structured_formatting?.main_text || s.name || '';
                      const main = full.split(',')[0];
                      const rest = full.split(',').slice(1).join(',').trim();
                      return (
                      <button key={i} type="button" role="option" aria-selected={false} onMouseDown={() => {
                        const name = s.isMapbox ? s.description.split(",")[0] : (s.description || s.structured_formatting?.main_text || s.name || '');
                        const d = [...destinations]; d[0] = name; setDestinations(d); setShowSuggestions(false); setFocusedDestIdx(null);
                        if (s.lat != null && s.lon != null) setDestCoords({ lat: s.lat, lon: s.lon, label: name });
                      }} className="w-full text-left px-4 py-3.5 min-h-[52px] hover:bg-primary/5 active:bg-primary/10 flex items-start gap-3 border-b border-gray-50 last:border-0">
                        <div className="mt-0.5 p-1.5 bg-primary/5 rounded-lg shrink-0">
                          <MapPin className="w-4 h-4 text-primary" />
                        </div>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[15px] font-bold text-gray-800 leading-tight break-words">{main}</span>
                          {rest && <span className="text-xs text-gray-500 leading-snug mt-0.5 break-words">{rest}</span>}
                        </span>
                      </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Giorni */}
              <div>
                <label className="block text-xs font-black text-primary uppercase tracking-widest mb-3">{getTranslation('days', language)}</label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[1,2,3,4,5,6,7].map(d => (
                    <button key={d} onClick={() => setDays(d)} className={`flex-1 min-w-[40px] py-3 rounded-2xl font-black text-sm transition-all ${days === d ? 'bg-primary text-white shadow-lg' : 'text-primary/40 hover:bg-primary/5'}`}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Categorie */}
              <div>
                <label className="block text-xs font-black text-primary uppercase tracking-widest mb-3">{language === 'IT' ? 'Tipo di Attrazioni' : 'Attraction Types'}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'musei', label: '🏛️ Musei' },
                    { id: 'monumenti', label: '🗿 Monumenti' },
                    { id: 'chiese', label: '⛪ Chiese' },
                    { id: 'attrazioni', label: '📍 Attrazioni' },
                    { id: 'gastronomia', label: '🍕 Gastronomia' },
                    { id: 'natura', label: '🌿 Natura' },
                    { id: 'shopping', label: '🛍️ Shopping' },
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setTinderSelectedCategories(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                      className={`px-3 py-2 rounded-full text-xs font-black transition-all border ${
                        tinderSelectedCategories.includes(cat.id)
                          ? 'bg-primary text-white border-primary shadow-md'
                          : 'bg-white text-gray-600 border-gray-100 hover:border-primary/30'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {renderAdvancedSettings()}

              <button
                onClick={handleFetchCandidates}
                disabled={!destinations[0] || destinations[0].trim().length < 3 || !isOnline}
                className="w-full h-16 bg-gradient-to-r from-rose-400 to-pink-500 text-white rounded-3xl font-black tracking-tight shadow-xl shadow-pink-400/30 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
              >
                <Heart className="w-5 h-5 fill-white" />
                {language === 'IT' ? 'Inizia lo Swip!' : 'Start Swip!'}
              </button>
            </motion.div>
          )}

          {/* ── TINDER SWIPE ── */}
          {plannerMode === 'tinder_swipe' && (
            <motion.div
              key="tinder_swipe"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 pt-4 pb-24"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setPlannerMode('tinder_form')} className="w-9 h-9 bg-white rounded-xl border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                    {currentCardIdx + 1} / {candidates.length > 0 ? candidates.length : '...'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-rose-50 rounded-2xl px-3 py-1.5">
                  <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                  <span className="text-sm font-black text-rose-600">{likedCandidates.length}</span>
                </div>
              </div>

              {candidatesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm font-black text-gray-500">{language === 'IT' ? 'Carico le attrazioni...' : 'Loading attractions...'}</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="text-4xl">😕</p>
                  <p className="text-sm font-black text-gray-500">{language === 'IT' ? 'Nessuna attrazione trovata' : 'No attractions found'}</p>
                  <button onClick={() => setPlannerMode('tinder_form')} className="px-6 py-3 bg-primary text-white rounded-2xl font-black text-sm">{language === 'IT' ? 'Riprova' : 'Try Again'}</button>
                </div>
              ) : currentCardIdx >= candidates.length ? (
                <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
                  <span className="text-5xl">🎉</span>
                  <h3 className="text-xl font-black text-primary">{language === 'IT' ? 'Hai visto tutte le attrazioni!' : 'You\'ve seen all attractions!'}</h3>
                  <p className="text-sm text-gray-500 font-bold">{language === 'IT' ? `${likedCandidates.length} tappe selezionate` : `${likedCandidates.length} stops selected`}</p>
                  {likedCandidates.length > 0 ? (
                    <button
                      onClick={() => setPlannerMode('tinder_review')}
                      className="w-full h-16 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
                    >
                      <ListChecks className="w-5 h-5" />
                      {language === 'IT' ? 'Rivedi le Tappe' : 'Review Stops'}
                    </button>
                  ) : (
                    <button onClick={() => { setCurrentCardIdx(0); setLikedCandidates([]); }} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-2xl font-black text-sm">
                      {language === 'IT' ? 'Ricomincia' : 'Start Over'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  {/* Stack di card */}
                  {[candidates[currentCardIdx + 1], candidates[currentCardIdx]].filter(Boolean).map((card, stackIdx, arr) => {
                    const isTop = stackIdx === arr.length - 1;
                    return (
                      <motion.div
                        key={card.id_tappa || card.titolo_tappa}
                        drag={isTop ? "x" : false}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.7}
                        onDragEnd={(e, { offset }) => {
                          if (offset.x > 80) {
                            setSwipeDir('right');
                            setTimeout(() => {
                              setLikedCandidates(prev => [...prev, candidates[currentCardIdx]]);
                              setCurrentCardIdx(i => i + 1);
                              setSwipeDir(null);
                            }, 300);
                          } else if (offset.x < -80) {
                            setSwipeDir('left');
                            setTimeout(() => { setCurrentCardIdx(i => i + 1); setSwipeDir(null); }, 300);
                          }
                        }}
                        initial={isTop ? false : { scale: 0.95, y: 12, opacity: 0.6 }}
                        animate={isTop
                          ? { scale: 1, y: 0, opacity: 1, x: swipeDir === 'left' ? -300 : swipeDir === 'right' ? 300 : 0, rotate: swipeDir === 'left' ? -10 : swipeDir === 'right' ? 10 : 0 }
                          : { scale: 0.95, y: 12, opacity: 0.6 }
                        }
                        className={`absolute inset-0 bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden ${isTop ? 'z-10 cursor-grab active:cursor-grabbing' : 'z-0'}`}
                        style={{ position: stackIdx === 0 ? 'relative' : 'absolute', top: 0, left: 0, right: 0 }}
                      >
                        {/* Card content: foto reale se disponibile, altrimenti
                            sfondo tematico per categoria con medaglione. */}
                        {(card.image_url || card.imageUrl || card.photo_url) ? (
                          <div className="h-52 relative bg-gradient-to-br from-blue-200 via-sky-100 to-slate-50">
                            <img
                              src={card.image_url || card.imageUrl || card.photo_url}
                              alt={card.titolo_tappa}
                              className="w-full h-full object-cover"
                              draggable={false}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                          </div>
                        ) : (
                          <div className={`h-52 relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${
                            card.tipo === 'museo' ? 'from-amber-200 via-orange-100 to-yellow-50'
                            : card.tipo === 'chiesa' ? 'from-indigo-200 via-purple-100 to-blue-50'
                            : card.tipo === 'monumento' ? 'from-stone-300 via-amber-100 to-stone-50'
                            : card.tipo === 'ristorante' ? 'from-rose-200 via-orange-100 to-amber-50'
                            : card.tipo === 'parco' ? 'from-emerald-200 via-green-100 to-lime-50'
                            : card.tipo === 'esperienza' ? 'from-sky-200 via-cyan-100 to-blue-50'
                            : 'from-blue-200 via-sky-100 to-slate-50'
                          }`}>
                            {/* Cerchi decorativi di profondità */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/30 blur-2xl" />
                            <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-white/40 blur-3xl" />
                            {/* Medaglione con icona */}
                            <div className="relative w-24 h-24 rounded-full bg-white/80 backdrop-blur-sm border border-white shadow-xl flex items-center justify-center">
                              <span className="text-5xl drop-shadow-sm">
                                {card.tipo === 'museo' ? '🏛️' : card.tipo === 'chiesa' ? '⛪' : card.tipo === 'monumento' ? '🗿' : card.tipo === 'ristorante' ? '🍕' : card.tipo === 'parco' ? '🌿' : card.tipo === 'esperienza' ? '🎟️' : '📍'}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="p-6 space-y-3 pointer-events-none">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-wider">{card.tipo || 'attrazione'}</span>
                            <span className="text-[10px] text-gray-400 font-bold">{card.ora}</span>
                          </div>
                          <h3 className="text-lg font-black text-gray-900 leading-tight">{card.titolo_tappa}</h3>
                          <p className="text-sm text-gray-600 font-medium leading-relaxed line-clamp-3">{card.attivita}</p>
                          {card.consiglio_guida && (
                            <p className="text-xs text-primary/70 font-bold italic">{card.consiglio_guida}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pulsanti swipe */}
                  <div className="relative z-20 flex justify-center gap-6 mt-4" style={{ marginTop: '24px' }}>
                    <button
                      onClick={() => {
                        setSwipeDir('left');
                        setTimeout(() => { setCurrentCardIdx(i => i + 1); setSwipeDir(null); }, 300);
                      }}
                      className="w-16 h-16 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center text-gray-400 shadow-lg hover:border-red-300 hover:text-red-400 hover:scale-110 transition-all active:scale-95"
                    >
                      <X className="w-7 h-7" />
                    </button>
                    <button
                      onClick={() => {
                        setSwipeDir('right');
                        setTimeout(() => {
                          setLikedCandidates(prev => [...prev, candidates[currentCardIdx]]);
                          setCurrentCardIdx(i => i + 1);
                          setSwipeDir(null);
                        }, 300);
                      }}
                      className="w-16 h-16 bg-gradient-to-br from-rose-400 to-pink-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-pink-300/40 hover:scale-110 transition-all active:scale-95"
                    >
                      <Heart className="w-7 h-7 fill-white" />
                    </button>
                  </div>

                  {/* Liked list preview */}
                  {/* ESPERIENZE PREMIUM CONSIGLIATE (PRIMA DELLA CREAZIONE) */}
              {includeTours && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-black text-primary uppercase tracking-widest">{language === 'IT' ? 'Esperienze Premium consigliate' : 'Recommended Premium Experiences'}</h3>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Prendi coordinate dalla prima tappa dei liked se possibile
                        const first = likedCandidates[0];
                        const lat = first?.coordinate?.lat || 0;
                        const lon = first?.coordinate?.lng || 0;
                        // Usiamo una versione fittizia di dayIdx 999 per la review
                        loadViatorForDay(999);
                      }}
                      className="flex-1 p-3 bg-orange-50 border border-orange-100 rounded-xl text-[10px] font-black text-[#FF5100] uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Ticket className="w-3.5 h-3.5" /> Viator
                    </button>
                    <button
                      onClick={() => loadGygForDay(999)}
                      className="flex-1 p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-black text-blue-600 uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Globe className="w-3.5 h-3.5" /> GetYourGuide
                    </button>
                    <button
                      onClick={() => loadTicketmasterForDay(999)}
                      className="flex-1 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Music className="w-3.5 h-3.5" /> Ticketmaster
                    </button>
                  </div>

                  <AnimatePresence>
                    {viatorExpandedDay === 999 && (
                      <div className="space-y-3">
                        {viatorByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#FF5100" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.description || exp.name,
                              tipo: 'esperienza',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                    {gygExpandedDay === 999 && (
                      <div className="space-y-3">
                        {gygByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#0071eb" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.description || exp.name,
                              tipo: 'esperienza',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                    {ticketmasterExpandedDay === 999 && (
                      <div className="space-y-3">
                        {ticketmasterByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#1e3a8a" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.venue || exp.name,
                              tipo: 'evento',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {likedCandidates.length > 0 && (
                    <div className="mt-6 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <p className="text-xs font-black text-rose-600 uppercase tracking-widest mb-2">{language === 'IT' ? '❤️ Selezionati' : '❤️ Selected'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {likedCandidates.map((c, i) => (
                          <span key={i} className="px-2.5 py-1 bg-white rounded-full text-[10px] font-black text-rose-700 border border-rose-200 shadow-sm inline-flex items-center gap-1.5">
                            {c.titolo_tappa}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setLikedCandidates(prev => prev.filter((_, idx) => idx !== i));
                              }}
                              className="bg-rose-100 hover:bg-rose-200 rounded-full p-0.5 transition-colors"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Genera itinerario se ci sono liked e non siamo alla fine */}
              {likedCandidates.length >= 3 && currentCardIdx < candidates.length && (
                <button
                  onClick={() => setPlannerMode('tinder_review')}
                  className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <ListChecks className="w-4 h-4" />
                  {language === 'IT' ? `Rivedi ${likedCandidates.length} tappe` : `Review ${likedCandidates.length} stops`}
                </button>
              )}
            </motion.div>
          )}

          {/* ── TINDER REVIEW ── */}
          {plannerMode === 'tinder_review' && (
            <motion.div
              key="tinder_review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-5 pt-4 pb-24"
            >
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => setPlannerMode('tinder_swipe')} className="w-9 h-9 bg-white rounded-xl border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-black text-primary tracking-tight">📋 {language === 'IT' ? 'Rivedi le Tappe' : 'Review Stops'}</h2>
                  <p className="text-xs text-gray-500 font-bold">{language === 'IT' ? 'Rimuovi o sostituisci prima di generare' : 'Remove or replace before generating'}</p>
                </div>
              </div>

              {likedCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <span className="text-4xl">🤷</span>
                  <p className="text-sm font-black text-gray-500">{language === 'IT' ? 'Nessuna tappa selezionata' : 'No stops selected'}</p>
                  <button onClick={() => setPlannerMode('tinder_swipe')} className="px-6 py-3 bg-primary text-white rounded-2xl font-black text-sm">
                    {language === 'IT' ? 'Torna allo Swip' : 'Back to Swip'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {likedCandidates.map((c, i) => (
                    <div key={c.id_tappa || c.titolo_tappa + i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <span className="text-2xl shrink-0">
                          {c.tipo === 'museo' ? '🏛️' : c.tipo === 'chiesa' ? '⛪' : c.tipo === 'monumento' ? '🗿' : c.tipo === 'ristorante' ? '🍕' : c.tipo === 'parco' ? '🌿' : '📍'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 title={c.titolo_tappa} className="text-sm font-black text-gray-900 line-clamp-2">{c.titolo_tappa}</h4>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{c.tipo || 'attrazione'} {c.ora ? `• ${c.ora}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setActiveReplacingIdx(activeReplacingIdx === i ? null : i)}
                            className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center hover:bg-amber-100 transition-colors"
                            title={language === 'IT' ? 'Sostituisci' : 'Replace'}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setLikedCandidates(prev => prev.filter((_, idx) => idx !== i)); if (activeReplacingIdx === i) setActiveReplacingIdx(null); }}
                            className="w-8 h-8 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors"
                            title={language === 'IT' ? 'Rimuovi' : 'Remove'}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Pannello alternative */}
                      <AnimatePresence>
                        {activeReplacingIdx === i && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-gray-100 bg-gray-50 overflow-hidden"
                          >
                            <p className="px-4 pt-3 pb-1 text-[10px] font-black text-primary uppercase tracking-widest">
                              {language === 'IT' ? '🔄 Scegli un\'alternativa' : '🔄 Choose an alternative'}
                            </p>
                            <div className="max-h-48 overflow-y-auto px-2 pb-3 space-y-1">
                              {candidates
                                .filter(alt => !likedCandidates.some(lc => (lc.id_tappa || lc.titolo_tappa) === (alt.id_tappa || alt.titolo_tappa)))
                                .map((alt, ai) => (
                                  <button
                                    key={alt.id_tappa || alt.titolo_tappa + ai}
                                    onClick={() => {
                                      setLikedCandidates(prev => {
                                        const copy = [...prev];
                                        copy[i] = alt;
                                        return copy;
                                      });
                                      setActiveReplacingIdx(null);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white transition-colors text-left"
                                  >
                                    <span className="text-lg shrink-0">
                                      {alt.tipo === 'museo' ? '🏛️' : alt.tipo === 'chiesa' ? '⛪' : alt.tipo === 'monumento' ? '🗿' : alt.tipo === 'ristorante' ? '🍕' : alt.tipo === 'parco' ? '🌿' : '📍'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p title={alt.titolo_tappa} className="text-xs font-black text-gray-800 line-clamp-2">{alt.titolo_tappa}</p>
                                      <p className="text-[10px] text-gray-400 font-bold">{alt.tipo || 'attrazione'}</p>
                                    </div>
                                    <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-1 rounded-lg shrink-0">
                                      {language === 'IT' ? 'Usa' : 'Use'}
                                    </span>
                                  </button>
                                ))}
                              {candidates.filter(alt => !likedCandidates.some(lc => (lc.id_tappa || lc.titolo_tappa) === (alt.id_tappa || alt.titolo_tappa))).length === 0 && (
                                <p className="text-xs text-gray-400 font-bold text-center py-4">{language === 'IT' ? 'Nessuna alternativa disponibile' : 'No alternatives available'}</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}

              {/* ESPERIENZE PREMIUM CONSIGLIATE (PRIMA DELLA CREAZIONE) */}
              {includeTours && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-black text-primary uppercase tracking-widest">{language === 'IT' ? 'Esperienze Premium consigliate' : 'Recommended Premium Experiences'}</h3>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Prendi coordinate dalla prima tappa dei liked se possibile
                        const first = likedCandidates[0];
                        const lat = first?.coordinate?.lat || 0;
                        const lon = first?.coordinate?.lng || 0;
                        // Usiamo una versione fittizia di dayIdx 999 per la review
                        loadViatorForDay(999);
                      }}
                      className="flex-1 p-3 bg-orange-50 border border-orange-100 rounded-xl text-[10px] font-black text-[#FF5100] uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Ticket className="w-3.5 h-3.5" /> Viator
                    </button>
                    <button
                      onClick={() => loadGygForDay(999)}
                      className="flex-1 p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-black text-blue-600 uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Globe className="w-3.5 h-3.5" /> GetYourGuide
                    </button>
                    <button
                      onClick={() => loadTicketmasterForDay(999)}
                      className="flex-1 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Music className="w-3.5 h-3.5" /> Ticketmaster
                    </button>
                  </div>

                  <AnimatePresence>
                    {viatorExpandedDay === 999 && (
                      <div className="space-y-3">
                        {viatorByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#FF5100" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.description || exp.name,
                              tipo: 'esperienza',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                    {gygExpandedDay === 999 && (
                      <div className="space-y-3">
                        {gygByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#0071eb" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.description || exp.name,
                              tipo: 'esperienza',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                    {ticketmasterExpandedDay === 999 && (
                      <div className="space-y-3">
                        {ticketmasterByDay[999]?.map((exp, eIdx) => (
                          <ExperienceCard key={eIdx} exp={exp} color="#1e3a8a" onAdd={() => {
                            setLikedCandidates(prev => [...prev, {
                              titolo_tappa: exp.name,
                              attivita: exp.venue || exp.name,
                              tipo: 'evento',
                              link_info: ensureAffiliateUrl(exp.url),
                              coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
                            }]);
                          }} />
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {likedCandidates.length > 0 && (
                <button
                  onClick={handleGenerateTinderItinerary}
                  disabled={loading}
                  className="w-full h-16 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-xl shadow-pink-400/30 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {language === 'IT' ? `Genera Itinerario con ${likedCandidates.length} tappe!` : `Generate Itinerary with ${likedCandidates.length} stops!`}
                </button>
              )}
            </motion.div>
          )}

          {/* ── ALTERNATIVE VIEW ── */}
          {plannerMode === 'alternatives_view' && alternatives.length > 0 && (
            <motion.div 
              key="alternatives_view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pt-4 pb-20"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-primary">{getTranslation('choose_trip', language)}</h2>
                <p className="text-sm font-bold text-on-surface-variant/70 mt-1">
                  {getTranslation('here_are_proposals', language)}
                </p>
              </div>

              <div className="space-y-4">
                {alternatives.map((alt, index) => (
                  <button 
                    key={alt.id_alternativa || index}
                    onClick={() => handleGenerateFromAlternative(alt)}
                    className="w-full bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm text-left hover:shadow-xl hover:scale-[1.02] transition-all relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-lg">
                          {index + 1}
                        </div>
                        <h3 className="text-xl font-black text-primary leading-tight flex-1">{alt.titolo}</h3>
                      </div>
                      <p className="text-sm font-bold text-on-surface-variant opacity-80 leading-relaxed mb-4">
                        {alt.descrizione_breve}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-primary/60">
                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {alt.dati_itinerario?.giorni?.length || days} {getTranslation('days_count', language)}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {(Array.isArray(alt.dati_itinerario?.giorni) ? alt.dati_itinerario.giorni : Object.values(alt.dati_itinerario?.giorni || {})).reduce((acc: number, g: any) => acc + (g.tappe?.length || 0), 0) || 0} {getTranslation('stops_count', language)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={handleGenerateRadius}
                disabled={loading}
                className="w-full py-4 mt-8 bg-emerald-100/50 text-emerald-700 font-black rounded-3xl flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                {language === 'IT' ? 'Genera altre 3 idee' : 'Generate 3 more ideas'}
              </button>

              <button 
                onClick={() => setPlannerMode('form_c')}
                className="w-full py-4 mt-2 font-black text-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                {getTranslation('go_back', language)}
              </button>
            </motion.div>
          )}

          {/* ── I MIEI ITINERARI ── */}
          {plannerMode === 'my_itineraries' && (
            <motion.div
              key="my_itineraries"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 pt-4"
            >
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xl font-black text-primary">
                  {getTranslation('my_itineraries', language)}
                </h3>
                <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">
                  {planMyItinerariesTab === 'ai' ? myItineraries.length : savedPremiumGuides.length} {getTranslation('saved_count', language)}
                </span>
              </div>

              {/* Toggles */}
              <div className="flex bg-white/50 p-1 rounded-2xl mb-4 border border-outline-variant/10 shadow-sm">
                <button
                  onClick={() => setPlanMyItinerariesTab('ai')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${planMyItinerariesTab === 'ai' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/50'}`}
                >
                  {getTranslation('ai_itineraries', language)}
                </button>
                <button
                  onClick={() => setPlanMyItinerariesTab('premium')}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${planMyItinerariesTab === 'premium' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/50'}`}
                >
                  {getTranslation('premium_guides_tab', language)}
                </button>
              </div>

              {planMyItinerariesTab === 'ai' ? (
                <div className="grid grid-cols-1 gap-4 max-h-[60dvh] overflow-y-auto pr-2 no-scrollbar">
                  {myItinerariesLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                    </div>
                  ) : myItineraries.length === 0 ? (
                    <div className="p-12 border-2 border-dashed border-outline-variant/30 rounded-[2.5rem] flex flex-col items-center text-center opacity-40">
                      <History className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold">
                        {getTranslation('no_saved_itineraries', language)}
                      </p>
                      <p className="text-[10px] uppercase font-black tracking-widest mt-2 px-6">
                        {getTranslation('generate_first', language)}
                      </p>
                    </div>
                  ) : (
                    [...myItineraries].sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()).map((item: any) => {
                      const parsedDati = typeof item.dati_itinerario === 'string' ? JSON.parse(item.dati_itinerario) : item.dati_itinerario;
                      const giorniRaw = parsedDati?.giorni || [];
                      const giorni = Array.isArray(giorniRaw) ? giorniRaw : Object.values(giorniRaw);
                      const tappeTotal = giorni.reduce((acc: number, g: any) => acc + (g.tappe?.length || 0), 0);
                      const date = item.updated_at ? new Date(item.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                      return (
                        <div
                          key={item.id}
                          className="p-5 rounded-[2rem] bg-white border border-outline-variant/10 shadow-sm group relative overflow-hidden"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 pr-2">
                              <h4 className="font-black text-primary text-base leading-tight mb-1">{item.titolo || 'Itinerario'}</h4>
                              <div className="flex gap-2 flex-wrap">
                                <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                                  📅 {giorni.length} {language === 'IT' ? 'giorni' : 'days'}
                                </span>
                                <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                                  📍 {tappeTotal} {language === 'IT' ? 'tappe' : 'stops'}
                                </span>
                                {date && <span className="text-[10px] font-bold text-gray-400">{date}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteMyItinerary(item.id)}
                              className="w-9 h-9 rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setGeneratedPlan(parsedDati);
                              // Stato blocchi/espansioni appartiene al vecchio itinerario: azzeriamo
                              setLockedStops({});
                              setExpandedStops({});
                              // Ripristina podcast cache da Supabase
                              if (parsedDati?.podcast_cache) {
                                setPodcastCache(parsedDati.podcast_cache);
                              } else {
                                setPodcastCache({});
                              }
                              setPlannerMode('view');
                            }}
                            className="w-full py-3 bg-primary/5 text-primary rounded-xl font-bold text-sm border border-primary/10 hover:bg-primary hover:text-white transition-colors"
                          >
                            {getTranslation('resume_btn', language)}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 max-h-[60dvh] overflow-y-auto pr-2 no-scrollbar">
                  {savedPremiumGuides.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-primary/5 rounded-[2rem] flex items-center justify-center mb-6">
                        <Download className="w-10 h-10 text-primary/20" />
                      </div>
                      <h3 className="font-black text-primary mb-2">Guide Premium</h3>
                      <p className="text-sm text-on-surface-variant font-bold max-w-xs opacity-70">
                        {getTranslation('no_pdf_generated', language)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {savedPremiumGuides.map((guide) => (
                        <div key={guide.id} className="p-5 bg-white rounded-3xl border border-outline-variant/10 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1.5">
                              <h4 className="font-black text-primary text-lg leading-tight">
                                {guide.content_data?.guida_titolo || "Guida Premium"}
                              </h4>
                              <span className="text-[10px] bg-amber-100 text-amber-800 self-start px-2 py-0.5 rounded font-black tracking-widest uppercase">
                                {guide.stile_guida || 'essential'}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-on-surface-variant opacity-70">
                             {new Date(guide.created_at || Date.now()).toLocaleDateString('it-IT')}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setGuideToRender({ content: guide.content_data, media: guide.media_manifest, hash: guide.itinerary_hash })}
                              className="flex-1 text-center py-3 bg-primary text-white font-black text-xs rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                            >
                              <Download className="w-4 h-4" /> {getTranslation('download_pdf_btn', language)}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setPlannerMode('selection')}
                className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/40 hover:text-red-500 transition-colors shadow-sm"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          )}

          {plannerMode === 'offline_list' && (
            <motion.div 
              key="offline_list"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 pt-4"
            >
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-xl font-black text-primary">Itinerari Offline</h3>
                <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">
                  {offlinePlans.length} salvati
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 max-h-[60dvh] overflow-y-auto pr-2 no-scrollbar">
                {offlinePlans.length === 0 ? (
                   <div className="p-12 border-2 border-dashed border-outline-variant/30 rounded-[2.5rem] flex flex-col items-center text-center opacity-40">
                      <Download className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold">Nessun itinerario scaricato</p>
                      <p className="text-[10px] uppercase font-black tracking-widest mt-2 px-6">Usa il bottone 'Offline' dentro un itinerario generato</p>
                   </div>
                ) : (
                  offlinePlans.map((plan: any, i: number) => (
                    <div 
                      key={plan.id || i}
                      className="p-5 rounded-[2rem] bg-white border border-outline-variant/10 shadow-sm flex flex-col gap-3 group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-on-surface text-lg leading-tight mb-1">{plan.title || plan.titolo}</h4>
                          <h5 className="text-[11px] font-bold text-primary uppercase tracking-widest bg-primary/5 inline-flex px-2 py-0.5 rounded-lg mb-2">
                            Offline
                          </h5>
                          <p className="text-[10px] text-on-surface-variant/60 font-bold mt-2">
                            Salvato il: {new Date(plan.date || plan.data_salvataggio).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                        <button
                           onClick={async (e) => {
                             e.stopPropagation();
                             if (plan.id) {
                               await deleteOfflineItinerary(plan.id);
                             }
                             const newPlans = await getOfflineItinerariesList();
                             setOfflinePlans(newPlans);
                           }}
                           className="w-10 h-10 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center shrink-0 border border-red-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={async () => {
                          const data = await getOfflineItinerary(plan.id);
                          if (data) {
                            setGeneratedPlan(data);
                            // Stato blocchi/espansioni appartiene al vecchio itinerario: azzeriamo
                            setLockedStops({});
                            setExpandedStops({});
                            // Ripristina podcast cache salvata localmente
                            if (data.podcast_cache && typeof data.podcast_cache === 'object') {
                              setPodcastCache(data.podcast_cache);
                            }
                            setPlannerMode('view');
                          }
                        }}
                        className="w-full mt-2 py-3 bg-primary/5 text-primary rounded-xl font-bold text-sm border border-primary/10 hover:bg-primary hover:text-white transition-colors"
                      >
                        Apri Offline
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setPlannerMode('selection')}
                  className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/40 hover:text-red-500 transition-colors shadow-sm"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          )}

          {plannerMode === 'view' && generatedPlan && Array.isArray(generatedPlan.giorni) && (
            <motion.div 
              key="view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1 print:hidden gap-4">
                <h2 className="text-2xl font-black text-primary tracking-tight">{generatedPlan.titolo}</h2>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button 
                    onClick={() => setShowOfflineBundleModal(true)}
                    className="px-4 py-2 bg-primary text-white rounded-2xl flex items-center gap-2 font-bold hover:bg-primary/90 transition-colors shadow-sm text-sm print:hidden"
                  >
                    <Download className="w-4 h-4" /> {getTranslation("offline_btn", language)}
                  </button>
                  <button 
                    onClick={handleRegenerateWithLocks}
                    disabled={loading}
                    className="px-4 py-2 bg-secondary text-white rounded-2xl flex items-center gap-2 font-bold hover:bg-secondary/90 transition-colors shadow-sm text-sm disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" /> {getTranslation("regenerate", language)}
                  </button>
                  <button 
                    onClick={() => setShowPremiumGuideModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-2xl flex items-center gap-2 font-bold hover:from-yellow-600 hover:to-amber-700 transition-all shadow-md text-sm shadow-amber-500/20"
                  >
                    📖 {getTranslation("premium_guide_btn", language)}
                  </button>
                  <button 
                    onClick={() => {
                      const oldTitle = document.title;
                      const d = new Date();
                      const mesi = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
                      const gg = String(d.getDate()).padStart(2, '0');
                      const mese = mesi[d.getMonth()];
                      const aa = String(d.getFullYear()).slice(-2);
                      const t = generatedPlan?.titolo || "Itinerario";
                      document.title = `WIP - ${t.substring(0, 30)} - ${gg}${mese}${aa}.pdf`;
                      // Il titolo torna quello vecchio SOLO ad anteprima chiusa
                      // (in Chrome window.print è asincrono: ripristinarlo
                      // subito rompeva il nome file del PDF). Rimosso anche il
                      // vecchio setTimeout(3000) senza feedback.
                      const restoreTitle = () => {
                        document.title = oldTitle;
                        window.removeEventListener('afterprint', restoreTitle);
                      };
                      window.addEventListener('afterprint', restoreTitle);
                      printScoped('itinerary');
                    }}
                    className="p-3 bg-white rounded-2xl border border-outline-variant/10 text-primary hover:bg-primary/5 transition-colors shadow-sm"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setPlannerMode('selection')}
                    className="p-3 bg-white rounded-2xl border border-outline-variant/10 text-on-surface-variant/40 hover:text-primary transition-colors shadow-sm"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Punto strategico: chi ha appena generato un itinerario è il
                  candidato perfetto per il Day Pass (sostituisce la vecchia
                  offerta bundle al 50%). */}
              <div className="print:hidden">
                <DayPassCard />
              </div>

              {generatedPlan && <PrintView plan={generatedPlan} language={language} />}

              <AnimatePresence>
                {offlineStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-primary text-white px-4 py-2 rounded-xl text-center text-sm font-bold shadow-md print:hidden"
                  >
                    {offlineStatus}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── INFO VIAGGIO: zone, raccomandazioni, suggerimenti, precauzioni ── */}
              {generatedPlan.info_viaggio && (
                <div className="print:hidden">
                  <TravelInfo info={generatedPlan.info_viaggio} language={language} />
                </div>
              )}

              <div className="space-y-12 pb-12 mt-4 print:hidden">
                {generatedPlan.giorni.map((giorno, gIdx) => (
                  <div key={giorno.giorno} className="space-y-6 break-inside-avoid">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden">
                      <div className="w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center font-black shrink-0">
                        {giorno.giorno}
                      </div>
                      <h3 className="font-black text-primary uppercase tracking-widest text-xs shrink-0">{getTranslation("day", language)} {giorno.giorno}</h3>
                      <div className="flex-1 h-px bg-primary/10 min-w-[12px]"></div>
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        {setIsAudioGuideActive && (
                          <button 
                            onClick={() => setIsAudioGuideActive(!isAudioGuideActive)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all print:hidden ${isAudioGuideActive ? 'bg-secondary text-white shadow-md scale-105' : 'bg-secondary/10 text-secondary hover:bg-secondary/20 hover:scale-105'}`}
                          >
                            <Headphones className="w-3 h-3 shrink-0" /> {isAudioGuideActive ? 'Audio ON ✓' : getTranslation("gps_active", language)}
                          </button>
                        )}
                        {/* 🎙️ Mini Player Podcast */}
                        {isGeneratingPodcast === giorno.giorno ? (
                          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest print:hidden">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Genera...
                          </span>
                        ) : (playingDay === giorno.giorno) ? (
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-xl px-2 py-1 print:hidden shadow-sm">
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest mr-0.5">WIP</span>
                            {isPodcastPaused ? (
                              <button onClick={handleResumePodcast} title="Riprendi" className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors">
                                <Play className="w-3 h-3" />
                              </button>
                            ) : (
                              <button onClick={handlePausePodcast} title="Pausa" className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors">
                                <Pause className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={handleStopPodcast} title="Stop" className="w-6 h-6 rounded-lg bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                              <Square className="w-3 h-3" />
                            </button>
                            <button onClick={handleReplayPodcast} title="Riascolta dall'inizio" className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center hover:bg-amber-200 transition-colors">
                              <SkipBack className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePlayDailyPodcast(giorno.giorno, giorno.tappe, gIdx === generatedPlan.giorni.length - 1)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all print:hidden ${
                              podcastCache[`${generatedPlan?.titolo || 'plan'}_day${giorno.giorno}`]
                                ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 hover:scale-105'
                            }`}
                          >
                            {podcastCache[`${generatedPlan?.titolo || 'plan'}_day${giorno.giorno}`] ? (
                              <><Play className="w-3 h-3 shrink-0" /> Riascolta</>
                            ) : (
                              <><Radio className="w-3 h-3 shrink-0" /> Podcast</>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => openNavModal(gIdx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-colors hover:scale-105 print:hidden"
                        >
                          <Navigation className="w-3 h-3 shrink-0" /> {getTranslation("navigate", language)}
                        </button>
                      </div>
                    </div>


                    <div className="space-y-8 pl-5 relative border-l border-dashed border-primary/20">
                      {giorno.tappe.map((tappa, tIdx) => (
                        <ItineraryStop
                          key={tappa.id_tappa}
                          tappa={tappa}
                          tIdx={tIdx}
                          gIdx={gIdx}
                          isLast={tIdx === giorno.tappe.length - 1}
                          expanded={!!expandedStops[tappa.id_tappa]}
                          isLocked={!!lockedStops[tappa.id_tappa]}
                          language={language}
                          onToggleExpand={() => setExpandedStops(prev => ({...prev, [tappa.id_tappa]: !prev[tappa.id_tappa]}))}
                          onMove={(dir) => handleMoveTappa(gIdx, tIdx, dir)}
                          onToggleLock={() => toggleLockTappa(tappa, giorno.giorno)}
                          onReplace={() => handleReplaceTappa(tappa.id_tappa)}
                          onDelete={() => handleDeleteTappa(gIdx, tappa.id_tappa)}
                          onSelectPoi={onSelectPoi ? handleSelectItineraryPoi : undefined}
                        />
                      ))}

                      {addingStopDay === giorno.giorno ? (
                        <div className="relative mt-8">
                          <div className="absolute -left-[27px] top-4 w-3 h-3 rounded-full border-2 border-[#f8f5f0] shadow-sm bg-gray-300"></div>
                          <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm relative space-y-4">
                            <h4 className="font-black text-primary text-lg mb-2">{getTranslation("add_stop", language)}</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <input type="time" className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.ora} onChange={e => setNewStop({...newStop, ora: e.target.value})} placeholder={getTranslation("placeholder_time", language)} />
                              <select className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.tipo} onChange={e => setNewStop({...newStop, tipo: e.target.value})}>
                                <option value="visita">Azione/Visita</option>
                                <option value="ristorante">Ristorante</option>
                                <option value="pausa">{getTranslation("action_break", language)}</option>
                                <option value="spostamento">Spostamento</option>
                              </select>
                            </div>
                            <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.titolo_tappa} onChange={e => setNewStop({...newStop, titolo_tappa: e.target.value})} placeholder={getTranslation("placeholder_stop_name", language)} />
                            <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.tempo_necessario} onChange={e => setNewStop({...newStop, tempo_necessario: e.target.value})} placeholder={getTranslation("placeholder_duration", language)} />
                            <textarea className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.attivita} onChange={e => setNewStop({...newStop, attivita: e.target.value})} placeholder={getTranslation("placeholder_activity", language)} rows={2} />
                            <div className="grid grid-cols-2 gap-4">
                              <input type="number" step="any" className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.lat} onChange={e => setNewStop({...newStop, lat: e.target.value})} placeholder={getTranslation("placeholder_lat", language)} />
                              <input type="number" step="any" className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.lng} onChange={e => setNewStop({...newStop, lng: e.target.value})} placeholder={getTranslation("placeholder_lon", language)} />
                            </div>
                            <textarea className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.consiglio_guida} onChange={e => setNewStop({...newStop, consiglio_guida: e.target.value})} placeholder={getTranslation("placeholder_notes", language)} rows={2} />
                            <div className="flex justify-between items-center mt-4 border-t border-gray-100 pt-4">
                              <button 
                                onClick={() => handleSuggestTappa(gIdx)} 
                                disabled={suggestLoading}
                                className="px-4 py-2 text-sm font-bold text-secondary bg-secondary/10 hover:bg-secondary/20 rounded-xl transition-colors flex items-center gap-2"
                              >
                                {suggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Suggerisci con AI
                              </button>
                              <div className="flex gap-2">
                                <button onClick={() => setAddingStopDay(null)} className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">{getTranslation("cancel", language)}</button>
                                <button onClick={() => handleAddTappa(gIdx)} className="px-5 py-2 text-sm font-black text-white bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-2">
                                  <Plus className="w-4 h-4" /> Salva
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative mt-8 group print:hidden">
                          <button 
                            onClick={() => setAddingStopDay(giorno.giorno)}
                            className="absolute -left-[32px] top-4 w-6 h-6 rounded-full border-2 border-dashed border-primary/30 bg-[#f8f5f0] text-primary/30 group-hover:bg-primary/10 group-hover:text-primary transition-all flex items-center justify-center cursor-pointer group-hover:scale-110"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <div className="text-sm font-bold text-primary/40 pt-4 pl-[4px] cursor-pointer group-hover:text-primary transition-colors" onClick={() => setAddingStopDay(giorno.giorno)}>
                            Aggiungi una tappa manuale...
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tabella Budget per la giornata */}
                    <BudgetTable giorno={giorno} language={language} />

                    {/* ── ESPERIENZE PREMIUM (Viator, GYG, Ticketmaster) ──
                        Sempre visibili, in OGNI modalità di itinerario: prima
                        erano nascoste quando includeTours era attivo, quindi
                        proprio chi chiedeva i tour non vedeva né Viator né GYG. */}
                    <div className="mt-6 print:hidden">
                      {(
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => loadViatorForDay(gIdx)}
                              disabled={viatorLoadingDay === gIdx}
                              className="flex-1 flex items-center justify-between p-4 bg-gradient-to-r from-[#FF5100]/5 to-orange-50 rounded-2xl border border-[#FF5100]/20 hover:border-[#FF5100]/40 transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#FF5100]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  {viatorLoadingDay === gIdx
                                    ? <Loader2 className="w-5 h-5 text-[#FF5100] animate-spin" />
                                    : <Ticket className="w-5 h-5 text-[#FF5100]" />
                                  }
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-black text-[#FF5100]">🎟️ Viator</p>
                                </div>
                              </div>
                              {viatorExpandedDay === gIdx
                                ? <ChevronUp className="w-5 h-5 text-[#FF5100]/50" />
                                : <ChevronDown className="w-5 h-5 text-[#FF5100]/50" />
                              }
                            </button>

                            <button
                              onClick={() => loadGygForDay(gIdx)}
                              disabled={gygLoadingDay === gIdx}
                              className="flex-1 flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 hover:border-blue-400 transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  {gygLoadingDay === gIdx
                                    ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                                    : <Globe className="w-5 h-5 text-blue-600" />
                                  }
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-black text-blue-600">🌍 GYG</p>
                                </div>
                              </div>
                              {gygExpandedDay === gIdx
                                ? <ChevronUp className="w-5 h-5 text-blue-400" />
                                : <ChevronDown className="w-5 h-5 text-blue-400" />
                              }
                            </button>
                          </div>

                          <button
                            onClick={() => loadTicketmasterForDay(gIdx)}
                            disabled={ticketmasterLoadingDay === gIdx}
                            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-900/5 to-blue-800/5 rounded-2xl border border-blue-900/20 hover:border-blue-900/40 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-900/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {ticketmasterLoadingDay === gIdx
                                  ? <Loader2 className="w-5 h-5 text-blue-900 animate-spin" />
                                  : <Music className="w-5 h-5 text-blue-900" />
                                }
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-black text-blue-900">🎵 Ticketmaster</p>
                              </div>
                            </div>
                            {ticketmasterExpandedDay === gIdx
                              ? <ChevronUp className="w-5 h-5 text-blue-900/50" />
                              : <ChevronDown className="w-5 h-5 text-blue-900/50" />
                            }
                          </button>
                        </div>
                      )}

                      <AnimatePresence>
                        {viatorExpandedDay === gIdx && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            {viatorByDay[gIdx] && viatorByDay[gIdx].length > 0 ? (
                              <div className="space-y-3 mt-4">
                                {viatorByDay[gIdx].map((exp: any, eIdx: number) => (
                                  <ExperienceCard key={`vi-${gIdx}-${eIdx}`} exp={exp} onAdd={() => handleAddViatorToDay(gIdx, exp)} color="#FF5100" />
                                ))}
                              </div>
                            ) : <div className="py-6 text-center text-sm text-gray-400 font-bold">Nessun tour Viator trovato.</div>}
                          </motion.div>
                        )}

                        {gygExpandedDay === gIdx && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            {gygByDay[gIdx] && gygByDay[gIdx].length > 0 ? (
                              <div className="space-y-3 mt-4">
                                {gygByDay[gIdx].map((exp: any, eIdx: number) => (
                                  <ExperienceCard key={`gyg-${gIdx}-${eIdx}`} exp={exp} onAdd={() => handleAddGygToDay(gIdx, exp)} color="#0071eb" />
                                ))}
                              </div>
                            ) : <div className="py-6 text-center text-sm text-gray-400 font-bold">Nessun tour GetYourGuide trovato.</div>}
                          </motion.div>
                        )}

                        {ticketmasterExpandedDay === gIdx && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            {ticketmasterByDay[gIdx] && ticketmasterByDay[gIdx].length > 0 ? (
                              <div className="space-y-3 mt-4">
                                {ticketmasterByDay[gIdx].map((exp: any, eIdx: number) => (
                                  <ExperienceCard key={`tm-${gIdx}-${eIdx}`} exp={exp} onAdd={() => handleAddTicketmasterToDay(gIdx, exp)} color="#1e3a8a" />
                                ))}
                                </div>
                            ) : <div className="py-6 text-center text-sm text-gray-400 font-bold">Nessun evento Ticketmaster trovato.</div>}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                ))}

                {generatedPlan.giorni.some(g => g.tappe.some(t => t.coordinate && t.coordinate.lat !== 0)) && (
                  <div className="mt-8 break-inside-avoid print:hidden">
                    <h3 className="font-black text-primary uppercase tracking-widest text-xs mb-4">{getTranslation("itinerary_map", language)}</h3>
                    <PlanMap giorni={generatedPlan.giorni} navRouteGeometry={routeGeometry} onSelectPoi={handleSelectItineraryPoi} isAudioGuideActive={isAudioGuideActive} />
                  </div>
                )}

                {generatedPlan.totale_viaggio && (
                  <div className="mt-8 bg-primary p-6 rounded-[2rem] text-white shadow-xl flex flex-col sm:flex-row justify-between items-center print:break-inside-avoid">
                    <div className="flex items-center gap-3 mb-2 sm:mb-0">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-xl font-black">€</span>
                      </div>
                      <h3 className="text-lg font-black uppercase tracking-wide">{getTranslation("total_estimated_trip", language)}</h3>
                    </div>
                    <div className="text-xl font-black font-mono bg-white text-primary px-6 py-3 rounded-2xl shadow-inner">
                      {generatedPlan.totale_viaggio}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── NAV MODAL: scelta punto di partenza ── */}
      <AnimatePresence>
        {navModal.open && navModal.gIdx !== null && (
          <motion.div
            key="nav-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setNavModal({ open: false, gIdx: null })}
          >
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 24 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-primary text-lg">
                  {language === 'IT' ? '🧭 Punto di Partenza' : '🧭 Starting Point'}
                </h3>
                <button onClick={() => setNavModal({ open: false, gIdx: null })} className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* GPS option */}
              <button
                onClick={() => setNavOrigin('gps')}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${navOrigin === 'gps' ? 'border-primary bg-primary/5' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${navOrigin === 'gps' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-black text-sm text-primary">
                    {getTranslation('from_my_location', language)}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {navGpsCoords
                      ? `GPS: ${navGpsCoords.lat.toFixed(4)}, ${navGpsCoords.lng.toFixed(4)}`
                      : getTranslation('acquiring_gps', language)}
                  </p>
                </div>
                {navOrigin === 'gps' && <Check className="w-5 h-5 text-primary ml-auto shrink-0" />}
              </button>

              {/* Custom address */}
              <button
                onClick={() => setNavOrigin('custom')}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${navOrigin === 'custom' ? 'border-primary bg-primary/5' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${navOrigin === 'custom' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-sm text-primary mb-1">
                    {getTranslation('custom_address', language)}
                  </p>
                  {navOrigin === 'custom' && (
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={navCustomAddress}
                        onChange={e => { setNavCustomAddress(e.target.value); setNavAddrCoords(null); }}
                        placeholder={getTranslation('custom_address_placeholder', language)}
                        className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                        autoFocus
                      />
                      {navAddrSuggestions.length > 0 && !navAddrCoords && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden max-h-44 overflow-y-auto">
                          {navAddrSuggestions.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setNavCustomAddress(s.description);
                                setNavAddrCoords({ lat: s.lat, lon: s.lon });
                                setNavAddrSuggestions([]);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                            >
                              <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="text-[11px] text-gray-800 truncate">{s.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {navOrigin === 'custom' && navCustomAddress && <Check className="w-5 h-5 text-primary ml-auto shrink-0" />}
              </button>

              {/* Confirm button */}
              <div className="flex flex-col gap-3 mt-4">
                <button
                  onClick={() => {
                    const gIdx = navModal.gIdx;
                    setNavModal({ open: false, gIdx: null });
                    if (gIdx !== null && generatedPlan) {
                      const giorno = generatedPlan.giorni[gIdx];
                      if (giorno && giorno.tappe.length > 0) {
                        setNavDayIndex(gIdx);
                        setNavStopIndex(0);
                        const firstStop = giorno.tappe[0];
                        if (firstStop?.coordinate) {
                          // Origine scelta nel modal: prima veniva ignorata e
                          // si partiva sempre dal GPS anche con "Indirizzo
                          // personalizzato" selezionato.
                          const originOverride =
                            navOrigin === 'custom' && navAddrCoords
                              ? navAddrCoords
                              : navOrigin === 'gps' && navGpsCoords
                                ? { lat: navGpsCoords.lat, lon: navGpsCoords.lng ?? (navGpsCoords as any).lon }
                                : undefined;
                          startNavigation({
                            lat: firstStop.coordinate.lat,
                            lon: firstStop.coordinate.lng,
                            poiId: parseInt(firstStop.id_tappa.replace(/\D/g, '') || '0') || undefined,
                            poiName: firstStop.titolo_tappa
                          }, originOverride);
                        }
                      }
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-amber-500 text-white font-black rounded-2xl text-sm shadow-lg hover:bg-amber-600 transition-colors active:scale-95"
                >
                  <Compass className="w-5 h-5" />
                  {getTranslation('internal_nav_beta', language)}
                </button>

                <a
                  href={buildNavUrl(navModal.gIdx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setNavModal({ open: false, gIdx: null })}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-primary text-white font-black rounded-2xl text-sm shadow-lg hover:bg-primary/90 transition-colors active:scale-95"
                >
                  <Navigation className="w-5 h-5" />
                  {getTranslation('open_gmaps', language)}
                </a>
              </div>

              <p className="text-center text-[10px] text-gray-400 font-medium">
                {language === 'IT'
                  ? 'Tutte le tappe del giorno saranno incluse come waypoint'
                  : "All day's stops will be included as waypoints"}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* L'overlay appare per QUALSIASI navigazione attiva: prima era
            vincolato a navDayIndex/navStopIndex, quindi il WIP Nav avviato
            dalla singola tappa navigava "alla cieca" senza banner. */}
        {navState !== 'idle' && (
          <NavigationOverlay
            state={navState}
            currentInstruction={currentInstruction}
            distanceToNext={distanceToNext}
            distanceToDestination={distanceToDestination}
            etaSeconds={etaSeconds}
            poiName={navDayIndex !== null && navStopIndex !== null
              ? generatedPlan?.giorni[navDayIndex]?.tappe[navStopIndex]?.titolo_tappa
              : undefined}
            onStop={() => {
              stopNavigation();
              setNavDayIndex(null);
              setNavStopIndex(null);
            }}
            onNextStop={navDayIndex !== null && navStopIndex !== null && (generatedPlan?.giorni[navDayIndex]?.tappe.length || 0) > (navStopIndex || 0) + 1 ? handleNextStop : undefined}
            onRepeat={repeatInstruction}
          />
        )}
      </AnimatePresence>

      {dbItineraryId && generatedPlan && plannerMode === 'view' && (
        <AgentControls
          itineraryId={dbItineraryId}
          userId={currentUserId || undefined}
          status={dynamicItinerary?.status || 'active'} 
          chatHistory={dynamicItinerary?.metadata?.chat_history || []}
          language={language}
        />
      )}

      {/* Quiz anche durante il caricamento delle attrazioni da swippare
          (candidatesLoading): l'attesa dell'AI è lunga e prima restava un
          semplice spinner. */}
      {(loading || candidatesLoading) && (
        <LoadingQuiz
          destination={destinations[0] || 'la tua destinazione'}
          quizLength={candidatesLoading && !loading ? 4 : activeQuizLength}
          userId={currentUserId || ''}
          language={language}
        />
      )}

      {/* Premium Guide Modal (richiede un utente loggato) */}
      {showPremiumGuideModal && generatedPlan && currentUserId && (
        <PremiumGuideModal
          itinerary={generatedPlan}
          userId={currentUserId}
          language={language}
          onClose={() => {
            setShowPremiumGuideModal(false);
            fetchSavedPremiumGuides();
          }}
        />
      )}

      {guideToRender && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative">
            <div className="p-4 bg-primary text-white flex justify-between items-center z-10 shrink-0 shadow-lg">
              <h3 className="font-black text-lg">Guida Premium</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    const container = document.getElementById('premium-guide-viewer-container-plan');
                    if (container) container.style.overflow = 'visible';
                    try {
                      // Nome file univoco legato alla guida (mai un nome fisso)
                      const titolo = guideToRender?.content?.guida_titolo || generatedPlan?.titolo || 'Guida';
                      const filename = `WIP_${String(titolo).replace(/[^a-zA-Z0-9àèéìòù ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)}.pdf`;
                      await downloadGuideAsPdf('premium-guide-pdf-inner-plan', filename);
                    } catch (e) {
                      console.error("PDF Download failed", e);
                    } finally {
                      if (container) container.style.overflow = 'auto';
                    }
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
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
            <div className="flex-1 overflow-y-auto bg-gray-100 p-2 sm:p-8" id="premium-guide-viewer-container-plan">
              <PremiumGuideRenderer 
                content={guideToRender.content} 
                mediaManifest={guideToRender.media} 
                language={language}
                containerId="premium-guide-pdf-inner-plan"
                onClose={() => setGuideToRender(null)} 
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Offline Audio Bundle Modal */}
      {generatedPlan && showOfflineBundleModal && (
        <OfflineAudioBundleModal
          isOpen={showOfflineBundleModal}
          onClose={() => setShowOfflineBundleModal(false)}
          plan={generatedPlan}
          language={language}
          guideMode={guideMode}
          setGuideMode={setGuideMode}
          onSaveOfflineOnly={handleSaveOffline}
          onDownloadAudioBundle={handleDownloadAudioBundle}
        />
      )}

      {/* MODAL CREDITI */}
      <CreditConfirmationModal 
        isOpen={creditConfirm?.isOpen}
        onClose={creditConfirm?.handleCancel}
        onConfirm={creditConfirm?.handleConfirm}
        onBuyCredits={() => {
           creditConfirm?.handleCancel();
           setShowShop(true);
        }}
        cost={creditConfirm?.cost || 0}
        currentBalance={creditConfirm?.balance !== undefined ? creditConfirm.balance : currentBalance}
        serviceName={creditConfirm?.serviceName || ''}
        language={language}
      />

      {/* SHOP CREDITI (aperto da "Ricarica" nel modale crediti) */}
      {showShop && currentUserId && (
        <div className="fixed inset-0 z-[10001] bg-white">
          <ShopScreen userId={currentUserId} language={language} onClose={() => setShowShop(false)} />
        </div>
      )}
    </div>
  );
}

// ── InfoViaggio: Sezione info sicurezza e consigli viaggio ── rimosso, spostato in TravelInfo.tsx
