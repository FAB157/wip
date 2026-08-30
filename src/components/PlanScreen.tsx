// "Map as MapIcon": il nome nudo oscurava la Map NATIVA di JS in tutto il
// modulo → "new Map()" (linkByName) esplodeva con "is not a constructor".
import { Mic, Trash2, User, History, Landmark, Check, MapPin, Calendar, Compass, Sparkles, Plus, X, RotateCcw, Save, Loader2, ListChecks, Map as MapIcon, Heart, Printer, Navigation, ChevronDown, ChevronUp, Download, Lock, Unlock, Headphones, ArrowUp, ArrowDown, Clock, Church, Utensils, Trees, AlertTriangle, ShieldAlert, Lightbulb, ThumbsUp, Ticket, Bus, Coffee, Wine, Wallet, LocateFixed, ArrowLeft, ExternalLink, Star, Radio, Square, Info, Eye, Play, Pause, SkipBack, RefreshCw, Globe, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { saveOfflineItinerary, getOfflineItinerariesList, getOfflineItinerary, deleteOfflineItinerary } from '../lib/offlineStorage';
import { tourService, MAX_TAPPE } from '../services/tourService';
import NavChoiceSheet from './NavChoiceSheet';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { supabase } from '../lib/supabase';
import { useCreditConfirmation } from '../hooks/useCreditConfirmation';
import CreditConfirmationModal from './CreditConfirmationModal';
import { consumeCredits, PRICING_LIST, getWalletBalance, refundCredits, notifyCreditsChanged } from '../lib/pricing';
import { printScoped } from '../lib/printScoped';
import { getApiUrl, apiFetch } from '../lib/api';
import { OSRM_FOOT_BASE } from '../services/osrmService';
import { notify as sharedNotify } from '../lib/toast';
import { Capacitor } from '@capacitor/core';
import { ensureAffiliateUrl, trackAffiliateClick } from '../lib/affiliates';
import QuotaLimitToast, { useQuotaToast } from './QuotaLimitToast';
import { Language, getTranslation, linguaCorrente } from '../lib/i18n';
import PrintView from './PrintView';
import { FAVORITES_EVENT } from '../lib/favorites';
import { useWalkingNavigation } from '../hooks/useWalkingNavigation';
import NavigationOverlay from './NavigationOverlay';
import PlanMap from './PlanMap';
import PremiumGuideModal from './PremiumGuideModal';
import AgentControls from './AgentControls';
import { useItinerary } from '../hooks/useItinerary';
import PremiumGuideRenderer from './PremiumGuideRenderer';
import PremiumGuideAudiobook from './PremiumGuideAudiobook';
import { parsePartialJSON } from '../lib/partialJsonParser';
import OfflineAudioBundleModal from './OfflineAudioBundleModal';
import { templatesForNow, loadTemplateTranslations, SEASONAL_THEMES, type SeasonalTemplate, type SeasonalTheme, type TemplateI18nMap } from '../lib/seasonalTemplates';
import SeasonalCatalogSheet from './SeasonalCatalogSheet';
import TransitEscapesSheet from './TransitEscapesSheet';
import PilgrimWaysSheet from './PilgrimWaysSheet';
import TasteRoutesSheet from './TasteRoutesSheet';
import ThematicSheet from './ThematicSheet';
import ItineraryLibrarySheet from './ItineraryLibrarySheet';
import WipAgentPlanner, { type WipAgentParams } from './WipAgentPlanner';
import type { StopPrefill, RoutePrefill } from '../lib/transitCatalog';
import GroupPlanPanel, { type MergedGroupPrefs } from './GroupPlanPanel';
import DayPassCard from './DayPassCard';
import ShopScreen from './ShopScreen';
import LoadingQuiz from './LoadingQuiz';
import { downloadGuideAsPdf } from '../services/premiumGuideService';
import { mapItineraryCategoryToMapCategory } from '../services/poiRepository';
import BudgetTable from './itinerary/BudgetTable';
import CalendarExportButton from './CalendarExportButton';
import ItineraryStop from './itinerary/ItineraryStop';
import TravelInfo from './itinerary/TravelInfo';
/** Valori inviati al server (restano in italiano, è il contratto dell'API);
 *  le etichette mostrate arrivano da i18n (`month_1`…`month_12`). */
/** Tetto ai campi destinazione: prima se ne potevano aggiungere all'infinito. */
const MAX_DESTINATIONS = 5;

const RADIUS_PRESETS = ['100', '300', '500'] as const;

/** Slot "giorno" fittizio per le esperienze proposte durante lo Swip, quando
 *  i giorni reali non esistono ancora. */
const PREMIUM_DAY_SLOT = 999;

/** Massimo di carte-evento reali (Ticketmaster) mescolate nel mazzo Swip. */
const MAX_EVENT_CARDS = 5;

/** Locale BCP-47 per le date, dalla lingua UI (ZH → zh-CN, EN → en-GB). */
function localeForLanguage(language: string): string {
  const map: Record<string, string> = { IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN' };
  return map[String(language || 'IT').toUpperCase()] || 'it-IT';
}

/** Data evento leggibile sulla carta (es. "sab 22 agosto"). */
function formatEventCardDate(isoDate: string, language: string): string {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(localeForLanguage(language), {
      weekday: 'short', day: 'numeric', month: 'long'
    });
  } catch { return isoDate; }
}

/**
 * Sostituzioni tappa gratuite per OGNI giorno dell'itinerario.
 * Oltre questa soglia la sostituzione costa `PRICING_LIST.replace_stop`.
 * Un itinerario di 3 giorni ha quindi 9 sostituzioni gratuite in totale,
 * ma non più di 3 sullo stesso giorno.
 */
const FREE_REPLACEMENTS_PER_DAY = 3;

/**
 * Temi disponibili per "➕ Aggiungi un giorno" / "➕ Tappa vicina"
 * (/api/itinerary/extend): gli STESSI angoli editoriali della Libreria
 * (src/lib/libraryDescriptors.ts, PORT_ZONE_ANGLES — id/label ripresi qui
 * a mano per non appesantire il bundle client con l'intero catalogo).
 * Un match esatto id+città-tra-le-30-curate fa scattare lato server il
 * percorso cache (più economico e quasi istantaneo); "Sorprendimi" (tema
 * vuoto) salta sempre la cache e lascia decidere all'AI.
 */
const EXTEND_DAY_THEMES: { id: string; labelKey: string }[] = [
  // labelKey: etichetta tradotta al render (vr_b_theme_*); l'id resta il
  // valore italiano/atteso dal server e dalla cache Libreria.
  { id: 'classica', labelKey: 'vr_b_theme_classica' },
  { id: 'gastronomica', labelKey: 'vr_b_theme_gastronomica' },
  { id: 'famiglie', labelKey: 'vr_b_theme_famiglie' },
  { id: 'nascosta', labelKey: 'vr_b_theme_nascosta' },
  { id: 'arte-storia', labelKey: 'vr_b_theme_arte_storia' },
  { id: 'relax-panorami', labelKey: 'vr_b_theme_relax_panorami' },
];

/** Oltre questa distanza dal centroide, i preferiti scelti sono troppo
 *  sparsi per un itinerario sensato: si avvisa prima di far pagare. */
const MAX_FAVORITES_SPREAD_KM = 150;

/** Distanza in km fra due coordinate (formula dell'emisenoverso). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Mini-guida «Big five» gratuita: massimo di città DIVERSE al giorno per
 *  device (localStorage). Rileggere la stessa città non consuma il limite. */
const BIG_FIVE_DAILY_MAX = 3;

/**
 * Gate anti-abuso client-side della mini-guida gratuita: registra la città
 * nel contatore giornaliero e dice se si può procedere. Storage rotto o
 * pieno → si lascia passare (è un lead magnet, non un paywall).
 */
function bigFiveDailyGate(cityNorm: string): boolean {
  try {
    const oggi = new Date().toISOString().slice(0, 10);
    let rec: any = null;
    try { rec = JSON.parse(localStorage.getItem('wip_bigfive_daily') || 'null'); } catch { /* corrotto */ }
    if (!rec || rec.date !== oggi || !Array.isArray(rec.cities)) rec = { date: oggi, cities: [] };
    if (rec.cities.includes(cityNorm)) return true;
    if (rec.cities.length >= BIG_FIVE_DAILY_MAX) return false;
    rec.cities.push(cityNorm);
    localStorage.setItem('wip_bigfive_daily', JSON.stringify(rec));
    return true;
  } catch {
    return true;
  }
}

/** Interessi della modalità Raggio: le etichette vengono da i18n
 *  (`interest_*`), i valori restano gli id attesi dal server. */
const RADIUS_INTERESTS = [
  { id: 'arte', icon: '🏛️' },
  { id: 'famiglia', icon: '👨‍👩‍👧' },
  { id: 'enogastronomia', icon: '🍷' },
  { id: 'mare', icon: '🌊' },
  { id: 'montagna', icon: '⛰️' },
  { id: 'natura', icon: '🌳' },
  { id: 'relax', icon: '💆' },
  { id: 'avventura', icon: '🧗' }
] as const;

/** Categorie della modalità Swip (etichette da i18n `cat_*`). */
const SWIP_CATEGORIES = [
  { id: 'musei', icon: '🏛️' },
  { id: 'monumenti', icon: '🗿' },
  { id: 'chiese', icon: '⛪' },
  { id: 'attrazioni', icon: '📍' },
  { id: 'gastronomia', icon: '🍕' },
  { id: 'natura', icon: '🌿' },
  { id: 'shopping', icon: '🛍️' }
] as const;

const MONTH_VALUES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
] as const;

/**
 * Errore di generazione con un CODICE stabile: il chiamante lo traduce con
 * describePlanError nella lingua dell'utente. Prima processItineraryStream
 * lanciava frasi italiane fisse e ogni catch mostrava comunque
 * «err_generation_refunded», anche a quota esaurita o saldo insufficiente.
 */
class PlanError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

const PLAN_ERROR_KEYS: Record<string, string> = {
  QUOTA_EXCEEDED: 'err_quota_exceeded_itinerary',
  FEATURE_DISABLED: 'err_feature_disabled',
  INSUFFICIENT_CREDITS: 'err_insufficient_credits',
  CHARGE_FAILED: 'err_charge_failed',
  TIMEOUT: 'err_ai_timeout',
  STREAM_TIMEOUT: 'err_ai_timeout',
  EMPTY_RESPONSE: 'err_ai_empty',
  STREAM_UNSUPPORTED: 'err_ai_empty',
  INVALID_RESPONSE: 'err_ai_invalid_response',
  UNAUTHORIZED: 'err_login_required',
};

/** Messaggio utente per un errore di generazione/sostituzione/suggerimento. */
function describePlanError(err: unknown, language: Language): string {
  const code = (err as any)?.code || (err instanceof Error ? err.message : String(err || ''));
  const key = PLAN_ERROR_KEYS[code];
  if (key) return getTranslation(key, language);
  if ((err as any)?.name === 'AbortError') return getTranslation('err_ai_timeout', language);
  const detail = (err as any)?.detail || (err instanceof Error ? err.message : '');
  return detail
    ? `${getTranslation('err_generation_failed', language)} (${String(detail).slice(0, 120)})`
    : getTranslation('err_generation_failed', language);
}

/** Codice d'errore da una risposta HTTP non-ok (402/429/401 + body JSON). */
async function planErrorFromResponse(res: Response): Promise<PlanError> {
  const text = await res.text().catch(() => '');
  let code = '';
  try { code = JSON.parse(text)?.error || JSON.parse(text)?.code || ''; } catch { /* testo nudo */ }
  if (res.status === 402) return new PlanError('INSUFFICIENT_CREDITS');
  if (res.status === 401) return new PlanError('UNAUTHORIZED');
  if (res.status === 429 || code === 'QUOTA_EXCEEDED') return new PlanError('QUOTA_EXCEEDED');
  if (PLAN_ERROR_KEYS[code]) return new PlanError(code);
  return new PlanError('API_ERROR', `HTTP ${res.status} ${text.slice(0, 120)}`);
}

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
    // Il server richiede login (401 senza token) e dal 14/08/2026 fa anche
    // l'ADDEBITO (pre-addebito + conguaglio sui giorni consegnati): il client
    // non scala più crediti da sé, aggiorna solo il saldo mostrato.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new PlanError('TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw await planErrorFromResponse(res);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new PlanError('STREAM_UNSUPPORTED');

  const decoder = new TextDecoder();
  let fullJson = "";
  let hasError = false;
  let errorMessage = "";
  let billing: { credits_paid?: number; credits_paid_earned?: number; days?: number; ts?: number } | null = null;

  // Timeout di sicurezza sul loop di lettura: se lo stream si blocca (es. DeepSeek idle)
  // non lasciamo la lambda e il browser appesi per sempre.
  // 120s: con 40s gli itinerari lunghi (4-5 giorni, 8+ tappe/giorno) venivano
  // troncati a metà streaming — il JSON riparato perdeva giorni interi.
  const streamTimeout = 120000;
  const streamStart = Date.now();

  // BUFFER DI RIGA: il server emette un evento SSE per token, ma i confini dei
  // chunk HTTP NON coincidono con quelli degli eventi. Con chunk.split('\n')
  // secco, un evento spezzato a metà tra due chunk andava perso in ENTRAMBE le
  // metà → JSON corrotto, "Risposta AI incompleta", tappe perse. Ora si
  // accumula il testo e si processano solo le righe COMPLETE, tenendo da parte
  // l'ultima riga parziale per il giro successivo.
  let buffer = '';
  let streamDone = false;

  while (!streamDone) {
    if (Date.now() - streamStart > streamTimeout) {
      reader.cancel();
      throw new PlanError('STREAM_TIMEOUT');
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // L'ultimo elemento è la riga (eventualmente) incompleta: la si conserva.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') { streamDone = true; break; }
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            hasError = true;
            errorMessage = parsed.error;
          } else if (parsed.billing) {
            // Crediti realmente addebitati (22/08/2026): finiscono nel piano
            // (dati_itinerario.credits_paid) e la Garanzia pioggia rimborsa
            // solo quelli, mai un itinerario gratuito.
            billing = parsed.billing;
          } else if (parsed.text) {
            fullJson += parsed.text;
            const partialObj = parsePartialJSON(fullJson);
            if (partialObj && partialObj.giorni) {
              onPartialData(partialObj);
            }
          }
        } catch (e) {
          // Riga completa ma JSON non ancora chiudibile: si ignora (il testo
          // è già accumulato in fullJson).
        }
      }
    }
  }

  if (hasError) {
    // Codice noto (QUOTA_EXCEEDED, FEATURE_DISABLED, INSUFFICIENT_CREDITS,
    // CHARGE_FAILED) → chiave i18n; altrimenti il testo del server in coda
    // al messaggio generico.
    throw PLAN_ERROR_KEYS[errorMessage]
      ? new PlanError(errorMessage)
      : new PlanError('API_ERROR', errorMessage);
  }

  if (!fullJson.trim()) {
    throw new PlanError('EMPTY_RESPONSE');
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
    throw new PlanError('INVALID_RESPONSE');
  }

  // NORMALIZZAZIONE DELLE TAPPE (ITI-01, 28/08/2026): lo schema AI del server
  // non produce `id_tappa`, ma tutto il resto della schermata lo da' per
  // scontato (lock, check-in, navigazione). Un id sintetico stabile
  // "t<giorno>_<indice>" evita il TypeError su `id_tappa.replace` e resta
  // riconoscibile come NON-POI (App.tsx lo ignora all'arrivo del WIP Nav).
  if (Array.isArray(result?.giorni)) {
    result.giorni.forEach((g: any, gi: number) => {
      if (!g || !Array.isArray(g.tappe)) return;
      const giorno = Number.isFinite(Number(g.giorno)) ? Number(g.giorno) : gi + 1;
      g.tappe.forEach((t: any, i: number) => {
        if (t && typeof t === 'object' && !t.id_tappa) t.id_tappa = `t${giorno}_${i}`;
      });
    });
  }

  // I crediti pagati viaggiano col piano: savePlanToSupabase li scrive in
  // dati_itinerario e la Garanzia pioggia li legge da lì.
  if (billing && typeof billing.credits_paid === 'number' && result && typeof result === 'object') {
    result.credits_paid = billing.credits_paid;
    result.credits_paid_earned = billing.credits_paid_earned ?? 0;
    result.credits_paid_ts = billing.ts ?? Date.now();
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
    // Dal 22/08/2026 la rotta vuole il token (era anonima e usata via curl
    // per far girare Agnes gratis): senza sessione la verifica non parte.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return data;
    const res = await fetch('/api/itinerary/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        itinerary: data,
        destination: genBody.destination,
        lat: genBody.lat,
        lon: genBody.lon,
        radius: genBody.radius,
        specialRequests: genBody.specialRequests,
        interests: genBody.interests,
        // Le note di verifica (es. "chicca poco conosciuta") escono nella lingua dell'utente
        language: genBody.language,
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

/**
 * Coordinate USABILI per la navigazione: finite e non il punto (0,0) nel
 * Golfo di Guinea, che e' il segnaposto delle esperienze/eventi aggiunti a
 * mano senza posizione (Viator/GYG/Ticketmaster/Tiqets). Prima bastava che
 * `coordinate` fosse truthy e WIP Nav partiva verso l'Atlantico (ITI-04).
 */
const haCoordinateValide = (t: { coordinate?: { lat?: number; lng?: number } | null } | null | undefined): boolean => {
  const lat = Number(t?.coordinate?.lat);
  const lng = Number(t?.coordinate?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

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
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-500">
          {exp.duration && <span className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> {exp.duration}</span>}
          {exp.rating && exp.rating !== "Nuovo" && <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full"><Star className="w-3 h-3" /> {exp.rating}</span>}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-black" style={{ color }}>{exp.price}</span>
          <span className="flex items-center gap-1 text-[10px] font-bold opacity-60 group-hover/card:opacity-100 transition-colors" style={{ color }}>
            {getTranslation('vr_b_see_details', linguaCorrente())} <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
    <button onClick={(e) => { e.preventDefault(); onAdd(); }} className="md:w-auto w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 md:self-center" style={{ backgroundColor: `${color}15`, color }}>
      ➕ {getTranslation('vr_b_add', linguaCorrente())}
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
  const [plannerMode, setPlannerMode] = useState<'selection' | 'form_a' | 'form_b' | 'form_c' | 'tinder_form' | 'tinder_swipe' | 'tinder_review' | 'alternatives_view' | 'view' | 'offline_list' | 'my_itineraries' | 'group_plan' | 'wip_agent'>(isOnline ? 'selection' : 'offline_list');
  // L'agente WIP ha consegnato i parametri: il form è stato riempito con
  // setState e la generazione deve partire al render SUCCESSIVO, quando gli
  // stati sono davvero aggiornati (handleGenerateAutomatic legge
  // destinations/days/… dallo stato, non da argomenti). Chiamarla subito
  // userebbe il form vecchio.
  const [wipAgentPending, setWipAgentPending] = useState(false);
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  // Shop crediti raggiungibile anche dal tab Plan (prima "Ricarica" era un alert)
  const [showShop, setShowShop] = useState(false);
  // Notifiche in-app: sostituiscono gli alert() nativi dei 4 flussi di
  // pianificazione (bloccanti, non stilizzati, non traducibili e su PWA iOS
  // mostrano il dominio nel titolo).
  // Delega al canale condiviso (lib/toast.ts), renderizzato da <ToastHost/>
  // in App.tsx: prima questa schermata aveva un proprio toast locale, con il
  // risultato di due sistemi di notifica diversi nella stessa app.
  const notify = useCallback(
    (text: string, tone: 'error' | 'info' | 'success' = 'error') => sharedNotify(text, tone),
    []
  );
  // Acquisizione GPS (Form C): può durare parecchi secondi e prima non dava
  // alcun segnale, il bottone sembrava semplicemente non funzionare.
  const [gpsLoading, setGpsLoading] = useState(false);
  // Il quiz d'attesa è un overlay opaco a tutto schermo: chiudendolo si vede
  // l'itinerario costruirsi in streaming. Si riapre a ogni nuova generazione.
  const [quizDismissed, setQuizDismissed] = useState(false);
  // Tappa in sostituzione (spinner locale sulla card, niente quiz globale).
  const [replacingId, setReplacingId] = useState<string | null>(null);
  // Guardie per l'arricchimento POI in background (vedi enrichSequentially)
  const enrichInFlightRef = useRef(false);
  const enrichedPoiIdsRef = useRef<Set<string>>(new Set());

  /**
   * OGNI TAPPA CHE PARLA DEVE AVERE QUALCOSA DA DIRE (29/08/2026).
   *
   * Esportando un giorno sulla mappa, le sue tappe diventano POI veri: scheda,
   * foto e racconto. Se non esistono ancora — un itinerario ripreso dalla
   * libreria, o generato prima che l'arricchimento girasse — si creano ADESSO,
   * altrimenti si arriva davanti al monumento e la scheda e` vuota.
   *
   * Due passaggi, entrambi best-effort e in sottofondo: l'utente intanto
   * cammina, non aspetta una barra di caricamento.
   *  1. la riga in `shared_pois` (id stabile `iti-…`, lo stesso del
   *     geofencing), cosi` il servizio nativo la riconosce;
   *  2. `/api/poi/enrich`, che porta descrizione e FOTO da Wikipedia,
   *     Wikidata e Commons.
   * Il testo dell'audioguida NON si genera qui: lo fa `tourService.prescarica`
   * quando il giro parte davvero, insieme all'MP3 — generarlo per tappe che
   * l'utente potrebbe togliere sarebbe spendere per niente.
   *
   * Le tappe SENZA guida (pranzo, pause) sono escluse: non hanno un racconto
   * da preparare.
   */
  const assicuraContenutiTappe = useCallback(async (poi: any[]) => {
    const daFare = (poi || []).filter((p) => p && !p.senzaGuida && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (daFare.length === 0) return;
    try {
      await supabase.from('shared_pois').upsert(
        daFare.map((p) => ({
          id: String(p.id),
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          category: p.category || 'monumenti',
          city: p.city || null,
          // 'auto': viene da un itinerario AI, non e` un POI verificato.
          status: 'auto',
        })),
        { onConflict: 'id' },
      );
    } catch (e) {
      console.warn('[PlanScreen] upsert tappe del giro fallito', e);
    }
    // Uno alla volta con una pausa di cortesia: l'arricchimento tocca API
    // esterne, e venti richieste insieme si prendono un 429.
    for (const p of daFare) {
      if (enrichedPoiIdsRef.current.has(String(p.id))) continue;
      try {
        await apiFetch(getApiUrl('/api/poi/enrich'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: String(p.id), name: p.name, lat: p.lat, lon: p.lon, category: p.category, city: p.city, lang: language, mode: 'full' }),
        }, 30000);
        enrichedPoiIdsRef.current.add(String(p.id));
      } catch { /* la scheda si arricchira` all'apertura: non blocca il giro */ }
      await new Promise((r) => setTimeout(r, 600));
    }
  }, [language]);
  // ── Form A / Form B / Form C shared fields ──
  const [destinations, setDestinations] = useState<string[]>(['']);
  // Coordinate della destinazione scelta dall'autocomplete Mapbox. Senza,
  // al server arrivava solo il nome come testo libero e l'AI "reinterpretava"
  // la città (Giza→Milano, Tallinn→Olbia). Si azzera se l'utente ridigita.
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [focusedDestIdx, setFocusedDestIdx] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  // Opzione evidenziata nella tendina (navigazione con le frecce).
  const [activeSuggestIdx, setActiveSuggestIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeQuizLength, setActiveQuizLength] = useState<number>(7);
  const [days, setDays] = useState(2);
  // Preferenze di viaggio persistenti (ondata 3): le stesse scelte non si
  // rifanno a ogni itinerario — pre-compilate dall'ultima sessione e salvate
  // a ogni modifica (vedi useEffect dopo le checkbox avanzate). Restano fuori
  // le scelte legate al singolo viaggio: giorni, mese, richieste speciali.
  const loadPlanPref = <T,>(key: string, fallback: T): T => {
    try {
      const all = JSON.parse(localStorage.getItem('wip_plan_prefs') || '{}');
      return all && all[key] !== undefined ? all[key] : fallback;
    } catch { return fallback; }
  };
  const [startTime, setStartTime] = useState(() => loadPlanPref('startTime', '09:00'));
  const [endTime, setEndTime] = useState(() => loadPlanPref('endTime', '20:00'));
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => loadPlanPref<string[]>('interests', []));
  const [specialRequests, setSpecialRequests] = useState('');
  // Indirizzo hotel/alloggio (form_a, opzionale): se valorizzato diventa il
  // punto di partenza del Giorno 1 invece del generico centro città. Niente
  // cache condivisa quando presente, come per specialRequests: cambia troppo
  // l'itinerario perché sia corretto servire una versione generica in cache.
  const [accommodationAddress, setAccommodationAddress] = useState('');
  // «Da reel a itinerario» (CameraScreen, modo screenshot): i luoghi estratti
  // dallo screenshot arrivano via localStorage 'wip_reel_to_plan' e diventano
  // tappe obbligatorie della prossima generazione (pois/poisDetailed + frase
  // in specialRequests). Si azzerano con la X del banner o a itinerario fatto.
  const [reelPlaces, setReelPlaces] = useState<Array<{ name: string; lat: number | null; lon: number | null }>>([]);
  // I default devono coincidere con le option delle select in renderAdvancedSettings
  const [budget, setBudget] = useState<'economico' | 'standard' | 'lusso'>(() => loadPlanPref('budget', 'standard' as const));
  const [viaggiatori, setViaggiatori] = useState<'solo' | 'coppia' | 'famiglia' | 'gruppo'>(() => loadPlanPref('viaggiatori', 'coppia' as const));
  const [ritmo, setRitmo] = useState<'rilassato' | 'standard' | 'intenso'>(() => loadPlanPref('ritmo', 'standard' as const));
  const [guida, setGuida] = useState<'NICKY' | 'DANTE' | 'ENTRAMBI'>(() => loadPlanPref('guida', 'NICKY' as const));
  const [mese, setMese] = useState('');
  const [radius, setRadius] = useState(() => loadPlanPref('radius', '300'));
  // ── Tinder mode ──
  const [likedCandidates, setLikedCandidates] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  // Storico degli swipe per l'Undo: il gesto "scorri per scartare" implica
  // poter tornare indietro, ma l'unico rimedio era "Ricomincia" (che azzerava
  // anche tutti i like). Ogni voce dice se la carta era stata messa nei like.
  const [swipeHistory, setSwipeHistory] = useState<Array<{ idx: number; liked: boolean }>>([]);
  // Foto che hanno fallito il caricamento: si ricade sul medaglione tematico
  // invece di lasciare una banda vuota alta 208px.
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  // Card con descrizione espansa (il line-clamp-3 non era apribile).
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [tinderSelectedCategories, setTinderSelectedCategories] = useState<string[]>([]);
  const [activeReplacingIdx, setActiveReplacingIdx] = useState<number | null>(null);
  // ── Favorites & UI ──
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<string[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [generatedPlan, setGeneratedPlanState] = useState<GeneratedItinerary | null>(null);
  // Selettore giorno sulla mappa dell'itinerario: 'tutti' resta il default
  // (mappa completa coi colori per giorno come prima), un numero filtra
  // mappa E stampa a quel solo giorno. Si azzera a ogni nuovo piano
  // generato, altrimenti un vecchio giorno selezionato (es. "Giorno 5" di
  // un itinerario di 3) resterebbe silenziosamente vuoto sul piano nuovo.
  const [mapSelectedDay, setMapSelectedDay] = useState<number | 'all'>('all');
  // Ricade su 'all' se il giorno selezionato non esiste più nel piano
  // corrente (piano rigenerato più corto): condiviso da mappa e stampa,
  // così restano sempre coerenti fra loro.
  const validMapSelectedDay = useMemo<number | 'all'>(() => {
    if (mapSelectedDay === 'all' || !generatedPlan) return 'all';
    return generatedPlan.giorni.some(g => g.giorno === mapSelectedDay) ? mapSelectedDay : 'all';
  }, [mapSelectedDay, generatedPlan]);
  // Il piano passato alla stampa: se è selezionato un solo giorno sulla
  // mappa, la stampa esce con SOLO quel giorno (richiesta utente 26/08/2026).
  const printPlan = useMemo(() => {
    if (!generatedPlan || validMapSelectedDay === 'all') return generatedPlan;
    return { ...generatedPlan, giorni: generatedPlan.giorni.filter(g => g.giorno === validMapSelectedDay) };
  }, [generatedPlan, validMapSelectedDay]);

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
  // Accetta sia un valore sia un updater funzionale (prev => next): serve agli
  // handler che devono partire dallo stato CORRENTE e non da una closure
  // stantia (es. handleCheckin). Dedup e sync di externalPlan restano applicati
  // in entrambi i casi.
  const setGeneratedPlan = (
    p: GeneratedItinerary | null | ((prev: GeneratedItinerary | null) => GeneratedItinerary | null)
  ) => {
    setGeneratedPlanState((prev) => {
      const next = typeof p === 'function' ? (p as any)(prev) : p;
      const deduped = dedupTappaIds(next);
      if (setExternalPlan) setExternalPlan(deduped);
      return deduped;
    });
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

  // Deep link di gruppo (?groupplan=PIN, stashato da App.tsx in localStorage):
  // si entra direttamente nella stanza per votare le preferenze.
  useEffect(() => {
    try {
      if (localStorage.getItem('wip_group_plan_join')) setPlannerMode('group_plan');
    } catch { /* ok */ }
  }, []);
  const [lockedStops, setLockedStops] = useState<Record<string, any>>({});
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});
  const [includeEvents, setIncludeEvents] = useState<boolean>(() => loadPlanPref('includeEvents', false));
  const [includeTours, setIncludeTours] = useState<boolean>(() => loadPlanPref('includeTours', false));
  // Casella "Gratis": solo tappe a ingresso libero (pasti esclusi dal vincolo)
  const [soloGratis, setSoloGratis] = useState<boolean>(() => loadPlanPref('soloGratis', false));

  // Persistenza delle preferenze di viaggio: ogni modifica sovrascrive il
  // blocco intero, così la prossima pianificazione parte già configurata.
  useEffect(() => {
    try {
      localStorage.setItem('wip_plan_prefs', JSON.stringify({
        startTime, endTime, interests: selectedInterests, budget, viaggiatori,
        ritmo, guida, radius, includeEvents, includeTours, soloGratis,
      }));
    } catch { /* storage pieno o bloccato: pazienza, niente persistenza */ }
  }, [startTime, endTime, selectedInterests, budget, viaggiatori, ritmo, guida, radius, includeEvents, includeTours, soloGratis]);

  // ── Trasporti per tratta (ondata 6): durate REALI dalla rete stradale ──
  // Una chiamata OSRM multi-waypoint per giorno; a piedi = distanza/4,5 km/h,
  // taxi ≈ 3,50€ + 1,35€/km. Se OSRM non risponde l'itinerario resta intatto.
  const [dayLegs, setDayLegs] = useState<Record<number, Record<number, { walkMin: number; carMin: number; km: number; taxiEur: number }>>>({});
  const legsSigRef = useRef('');
  useEffect(() => {
    const plan = generatedPlan;
    const coordOf = (t: any) => {
      const lat = Number(t?.coordinate?.lat ?? t?.lat);
      const lon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? { lat, lon } : null;
    };
    if (!plan?.giorni?.length) { setDayLegs({}); legsSigRef.current = ''; return; }
    // Durante lo streaming il piano cambia a ogni chunk: una chiamata OSRM
    // per chunk (e per giorno) era uno sciame di richieste inutili. Si
    // calcola a generazione finita.
    if (loading) return;
    const sig = plan.giorni.map((g: any) => (g.tappe || []).map((t: any) => { const c = coordOf(t); return c ? `${c.lat.toFixed(4)},${c.lon.toFixed(4)}` : 'x'; }).join(';')).join('|');
    if (sig === legsSigRef.current) return;
    legsSigRef.current = sig;
    let cancelled = false;
    (async () => {
      const out: Record<number, Record<number, any>> = {};
      for (let g = 0; g < plan.giorni.length; g++) {
        const tappe = plan.giorni[g].tappe || [];
        const pts = tappe.map(coordOf);
        const validIdx = pts.map((p: any, i: number) => (p ? i : -1)).filter((i: number) => i >= 0);
        if (validIdx.length < 2) continue;
        try {
          const coordStr = validIdx.map((i: number) => `${pts[i]!.lon},${pts[i]!.lat}`).join(';');
          const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false&steps=false`);
          if (!r.ok) continue;
          const data = await r.json();
          const legs = data?.routes?.[0]?.legs || [];
          // walkMin sul grafo PEDONALE reale: a piedi il percorso/tempo differisce
          // da quello auto (marciapiedi, ZTL, scorciatoie). Richiesta foot separata
          // sulla base condivisa (stesso fix del routing pedonale). Best-effort: se
          // fallisce si ricade sulla stima dalla distanza auto.
          let footLegs: any[] = [];
          try {
            const rf = await fetch(`${OSRM_FOOT_BASE}${coordStr}?overview=false&steps=false`, { signal: AbortSignal.timeout(6000) });
            if (rf.ok) { const df = await rf.json(); footLegs = df?.routes?.[0]?.legs || []; }
          } catch { /* foot giù: fallback alla stima dalla distanza auto */ }
          out[g] = {};
          for (let j = 0; j < validIdx.length - 1; j++) {
            // La tratta vale solo tra tappe CONSECUTIVE nell'itinerario
            if (validIdx[j + 1] !== validIdx[j] + 1) continue;
            // Le tappe 'trasferimento' (roadtrip, ondata 7) sono spostamenti
            // inter-città di decine/centinaia di km: hanno già la loro card
            // dedicata con km e durata reali. Un badge "🚶 N min · taxi ~340€"
            // calcolato da OSRM su quella tratta non avrebbe senso.
            if (tappe[validIdx[j]]?.tipo === 'trasferimento' || tappe[validIdx[j + 1]]?.tipo === 'trasferimento') continue;
            const leg = legs[j];
            if (!leg) continue;
            const km = (leg.distance || 0) / 1000;
            if (km <= 0.02) continue; // stessa piazza: inutile
            const footLeg = footLegs[j];
            out[g][validIdx[j]] = {
              carMin: Math.max(1, Math.round((leg.duration || 0) / 60)),
              // Tempo a piedi dalla DURATA del percorso pedonale reale; solo se
              // manca si stima dalla distanza auto (÷1,25 m/s).
              walkMin: footLeg
                ? Math.max(1, Math.round((footLeg.duration || 0) / 60))
                : Math.max(1, Math.round((leg.distance || 0) / 1.25 / 60)),
              km,
              taxiEur: km >= 0.8 ? Math.round(3.5 + km * 1.35) : 0,
            };
          }
        } catch { /* OSRM giù: niente tratte per questo giorno */ }
        if (cancelled) return;
      }
      if (!cancelled) setDayLegs(out);
    })();
    return () => { cancelled = true; };
  }, [generatedPlan, loading]);

  // ── Piano B pioggia (ondata 6) ─────────────────────────────────────────
  // Previsioni Open-Meteo (gratuite): badge sul giorno con probabilità di
  // pioggia ≥50%, assumendo Giorno 1 = oggi (la data è mostrata nel badge).
  const [rainByDay, setRainByDay] = useState<Record<number, { prob: number; dateLabel: string }>>({});
  const [rainLoadingDay, setRainLoadingDay] = useState<number | null>(null);
  const [rainPreview, setRainPreview] = useState<{ gIdx: number; giornoNum: number; tappe: any[] } | null>(null);
  useEffect(() => {
    const lat = destCoords?.lat, lon = destCoords?.lon;
    if (!generatedPlan?.giorni?.length || !Number.isFinite(lat) || !Number.isFinite(lon)) { setRainByDay({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&timezone=auto&forecast_days=14`);
        if (!r.ok) return;
        const data = await r.json();
        const probs: number[] = data?.daily?.precipitation_probability_max || [];
        const dates: string[] = data?.daily?.time || [];
        if (cancelled) return;
        const out: Record<number, { prob: number; dateLabel: string }> = {};
        (generatedPlan.giorni || []).forEach((g: any, i: number) => {
          const p = probs[i];
          if (typeof p === 'number' && p >= 50) {
            const d = dates[i] ? new Date(dates[i]) : null;
            out[g.giorno] = { prob: p, dateLabel: d ? d.toLocaleDateString(localeForLanguage(language), { weekday: 'short', day: '2-digit', month: '2-digit' }) : '' };
          }
        });
        setRainByDay(out);
      } catch { /* meteo irraggiungibile: nessun badge */ }
    })();
    return () => { cancelled = true; };
  }, [generatedPlan?.id, generatedPlan?.giorni?.length, destCoords?.lat, destCoords?.lon, language]);

  const handleRainPlan = async (gIdx: number) => {
    const giorno = generatedPlan?.giorni?.[gIdx];
    if (!giorno) return;
    setRainLoadingDay(giorno.giorno);
    try {
      const res = await fetch(getApiUrl('/api/itinerary/rainplan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destinations.filter(d => d.trim()).join(' e ') || generatedPlan?.titolo || '',
          lat: destCoords?.lat, lon: destCoords?.lon, lang: language,
          giorno: giorno.giorno,
          tappe: (giorno.tappe || []).map((t: any) => ({ orario: t.orario, titolo_tappa: t.titolo_tappa, tipo: t.tipo, attivita: t.attivita, tempo_necessario: t.tempo_necessario })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.tappe) || data.tappe.length === 0) throw new Error(data?.error || 'variante vuota');
      setRainPreview({ gIdx, giornoNum: giorno.giorno, tappe: data.tappe });
    } catch (e: any) {
      notify(`${getTranslation('rain_plan_failed', language)}: ${e?.message || getTranslation('try_again', language)}`, 'error');
    } finally {
      setRainLoadingDay(null);
    }
  };
  // Template stagionali (ondata 6): un tap pre-compila il form; la
  // generazione resta all'utente perché costa crediti.
  // Filtro a chips, paginazione (7 alla volta) e sheet catalogo completo.
  const [tplFilter, setTplFilter] = useState<'tutti' | 'nascosti' | SeasonalTheme>('tutti');
  const [tplShown, setTplShown] = useState(7);
  const [showSeasonalCatalog, setShowSeasonalCatalog] = useState(false);
  // Itinerari speciali (porti/scali e cammini): due sheet dedicate.
  const [showTransitSheet, setShowTransitSheet] = useState(false);
  const [showPilgrimSheet, setShowPilgrimSheet] = useState(false);
  // 🍷 Strade del vino e del gusto: stessa meccanica dei cammini (percorso
  // dato, tappe reali, prefill roadtrip), catalogo in wineRoutesCatalog.ts.
  const [showTasteSheet, setShowTasteSheet] = useState(false);
  // 🧭 Viaggi tematici: gli otto verticali (terme, set di film, cieli bui,
  // street art, mercatini, fioriture, memoria, viaggio lento). Qui il
  // percorso NON esiste: esiste il luogo, e il giro lo compone WIP.
  const [showThematicSheet, setShowThematicSheet] = useState(false);
  // 📚 Libreria itinerari: catalogo di itinerari già generati e verificati
  // (rotte /api/library/*). Il prefill arriva dai link nelle sheet
  // Sosta breve / Cammini ("Vedi gli itinerari pronti per questo porto").
  const [showLibrarySheet, setShowLibrarySheet] = useState(false);
  // `group` pre-seleziona una macro-categoria (es. 'cultura') senza un chip
  // preciso — stesso meccanismo di `kind`, usato dalla card "Ispirazioni &
  // temi" invece che da un porto/cammino specifico.
  const [libraryPrefill, setLibraryPrefill] = useState<{ kind?: string; group?: string; city?: string; query?: string } | null>(null);
  const openLibrary = (pre?: { kind?: string; group?: string; city?: string; query?: string }) => {
    setLibraryPrefill(pre || null);
    setShowLibrarySheet(true);
  };
  // Coordinate CURATE delle tappe di un cammino pre-compilato: consultate da
  // buildRoadtripLegs PRIMA del geocoding (frazioni e località minori spesso
  // geocodificano male; le coordinate redazionali vincono).
  const presetLegCoordsRef = useRef<Record<string, { lat: number; lon: number }>>({});
  const seasonTemplates = useMemo(() => templatesForNow(new Date(), {
    theme: tplFilter !== 'tutti' && tplFilter !== 'nascosti' ? tplFilter : undefined,
    soloNascosti: tplFilter === 'nascosti',
  }), [tplFilter]);
  // Ispirazioni multilingua: con UI non italiana le card curate mostrano
  // title/specialRequests tradotti (fetch batch una volta, cache client 7gg,
  // fallback silenzioso all'italiano). Con UI in italiano: zero chiamate.
  const [tplI18n, setTplI18n] = useState<TemplateI18nMap>({});
  useEffect(() => {
    if (String(language).toUpperCase() === 'IT') { setTplI18n({}); return; }
    let vivo = true;
    // Tutti i template del periodo (senza filtro): copre anche i cambi chips.
    loadTemplateTranslations(language, templatesForNow(new Date()))
      .then(m => { if (vivo) setTplI18n(m); })
      .catch(() => { /* fallback: italiano */ });
    return () => { vivo = false; };
  }, [language]);
  const applyTemplate = (t: SeasonalTemplate) => {
    const tr = tplI18n[t.id];
    setDestinations([t.destination]);
    setDestCoords(null);
    setDays(t.days);
    setSelectedInterests(t.interests);
    setSpecialRequests(tr?.specialRequests || t.specialRequests);
    notify(`${tr?.title || t.title}: ${getTranslation('prefill_applied_check_form', language)}`);
  };

  // ── Itinerari speciali: pre-fill dalle sheet Sosta breve / Cammini ──
  // Gemelli di applyTemplate. La generazione (e il costo) restano un gesto
  // esplicito dell'utente; il vincolo di rientro vive in specialRequests.
  const applySpecialStop = (p: StopPrefill) => {
    presetLegCoordsRef.current = {};
    setDestinations([p.destination]);
    // Coordinate curate: ancorano il geocoding (label === destinations[0]
    // fa sì che resolveDestCoords le usi senza richiamare /api/geocode).
    setDestCoords(p.coords ? { lat: p.coords.lat, lon: p.coords.lon, label: p.destination } : null);
    setDays(1);
    // Interessi: quelli del prefill solo se ne porta; altrimenti restano le
    // preferenze dell'utente (prima ogni porto imponeva fotografia+gastronomia).
    if (p.interests.length) setSelectedInterests(p.interests);
    setSpecialRequests(p.specialRequests);
    // Esperienza affiliata + alternativa gratis: regola di prodotto.
    if (typeof p.includeTours === 'boolean') setIncludeTours(p.includeTours);
    if (typeof p.soloGratis === 'boolean') setSoloGratis(p.soloGratis);
    setShowTransitSheet(false);
    notify(`${p.label}: ${getTranslation('prefill_applied_check_form', language)}`, 'success');
  };
  const applySpecialRoute = (p: RoutePrefill) => {
    // Le tappe del cammino diventano il roadtrip multi-città (legs):
    // coordinate curate in mappa, consultate da buildRoadtripLegs.
    const preset: Record<string, { lat: number; lon: number }> = {};
    for (const l of p.legs) {
      if (Number.isFinite(l.lat) && Number.isFinite(l.lon)) {
        preset[l.city.trim().toLowerCase()] = { lat: l.lat as number, lon: l.lon as number };
      }
    }
    presetLegCoordsRef.current = preset;
    setDestinations(p.legs.map(l => l.city));
    const first = p.legs[0];
    setDestCoords(first && Number.isFinite(first.lat) && Number.isFinite(first.lon)
      ? { lat: first.lat as number, lon: first.lon as number, label: first.city }
      : null);
    setDays(clampDays(p.days));
    if (p.interests.length) setSelectedInterests(p.interests);
    setSpecialRequests(p.specialRequests);
    if (typeof p.includeTours === 'boolean') setIncludeTours(p.includeTours);
    if (typeof p.soloGratis === 'boolean') setSoloGratis(p.soloGratis);
    setRitmo('rilassato'); // il ritmo del cammino è lento per definizione
    setShowPilgrimSheet(false);
    notify(`${p.label}: ${getTranslation('prefill_route_applied', language)}`, 'success');
  };

  // ── 📚 Libreria: "Usa questo itinerario (gratis)" ──────────────────────
  // Salva l'item della libreria in user_itineraries con lo STESSO flusso di
  // un itinerario generato (savePlanToSupabase: id, titolo, dati_itinerario,
  // podcast_cache, POI condivisi) e lo apre subito nel viewer. Da qui in poi
  // Guida Premium, podcast, PDF, calendario e racconto funzionano perché il
  // piano ha titolo/destinazione/giorni nello stesso formato.
  const activateLibraryItinerary = async (itin: any, meta: any) => {
    try {
      const copia = structuredClone(itin);
      // Id NUOVO per utente: l'upsert su user_itineraries è per id, riusare
      // lo stesso id della libreria per due utenti farebbe collidere le righe.
      copia.id = crypto.randomUUID();
      copia.titolo = `📚 ${String(copia.titolo || meta?.title || 'Itinerario').replace(/^📚\s*/, '')}`;
      if (!copia.destinazione && meta?.city) copia.destinazione = meta.city;
      // Stato del viewer azzerato come nel resume da "I miei itinerari"
      setDbItineraryId(null);
      setLockedStops({});
      setExpandedStops({});
      setPodcastCache(copia.podcast_cache || {});
      setGeneratedPlan(copia);
      setPlannerMode('view');
      setShowLibrarySheet(false);
      await savePlanToSupabase(copia);
      notify(getTranslation('saved_to_my_itineraries', language), 'success');
    } catch (e) {
      console.error('[Libreria] attivazione fallita:', e);
      notify(getTranslation('err_save_itinerary_retry', language), 'error');
    }
  };

  // «Big five» gratuita (lead magnet): mini-guida dei 5 imperdibili della
  // destinazione scelta, letta in una sheet. Il server è cache-first per
  // (città, lingua); qui si tiene anche una piccola cache di sessione.
  const [bigFive, setBigFive] = useState<{
    open: boolean; loading: boolean; city: string; guide: any | null; error: string | null;
  }>({ open: false, loading: false, city: '', guide: null, error: null });
  const bigFiveCacheRef = useRef<Record<string, any>>({});
  const openBigFive = async () => {
    // Nome pulito della città: l'etichetta scelta dall'autocomplete se c'è,
    // altrimenti il testo digitato (solo la parte prima della virgola).
    const city = (destCoords?.label || destinations[0] || '').split(',')[0].trim();
    if (city.length < 2) return;
    const norm = city.toLowerCase();
    if (!bigFiveDailyGate(norm)) {
      notify(getTranslation('mini_guide_daily_limit', language));
      return;
    }
    const hit = bigFiveCacheRef.current[`${norm}_${language}`];
    if (hit) { setBigFive({ open: true, loading: false, city, guide: hit, error: null }); return; }
    setBigFive({ open: true, loading: true, city, guide: null, error: null });
    try {
      // apiFetch: Bearer automatico (il server esige il login per generare).
      const res = await apiFetch(getApiUrl('/api/city-big-five'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, lang: String(language || 'IT').toLowerCase() }),
      }, 90000);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.guide?.luoghi?.length) throw new Error(data?.error || 'no-guide');
      bigFiveCacheRef.current[`${norm}_${language}`] = data.guide;
      setBigFive({ open: true, loading: false, city, guide: data.guide, error: null });
    } catch {
      // Fallimento: la città non deve consumare uno dei 3 slot del giorno.
      try {
        const rec = JSON.parse(localStorage.getItem('wip_bigfive_daily') || 'null');
        if (rec && Array.isArray(rec.cities)) {
          rec.cities = rec.cities.filter((c: string) => c !== norm);
          localStorage.setItem('wip_bigfive_daily', JSON.stringify(rec));
        }
      } catch { /* pazienza */ }
      setBigFive(b => ({ ...b, loading: false, error: 'La mini-guida non è disponibile in questo momento. Riprova tra qualche minuto.' }));
    }
  };

  const applyRainPlan = () => {
    if (!rainPreview || !generatedPlan) return;
    const newPlan = structuredClone(generatedPlan);
    newPlan.giorni[rainPreview.gIdx].tappe = rainPreview.tappe.map((t: any, i: number) => ({
      ...t,
      id_tappa: t.id_tappa || `rain_${rainPreview.giornoNum}_${i}_${Date.now()}`,
    }));
    setGeneratedPlan(newPlan);
    savePlanToSupabase(newPlan);
    setRainPreview(null);
    notify(getTranslation('rain_variant_applied', language), 'success');
  };
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
    if (navOrigin !== 'custom' || navCustomAddress.trim().length < 3 || navAddrCoords) {
      if (!navAddrCoords) setNavAddrSuggestions([]);
      return;
    }
    const abortCtrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // Proxy server-side: qui serve anche l'indirizzo civico, non solo la
        // località, quindi si allargano i `types`.
        const res = await fetch(getApiUrl(
          `/api/geocode?q=${encodeURIComponent(navCustomAddress)}`
          + `&lang=${language.toLowerCase()}&limit=5&types=address,poi,place,locality,neighborhood`
        ), { signal: abortCtrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (abortCtrl.signal.aborted) return;
        setNavAddrSuggestions((data.features || []).map((f: any) => ({
          id: f.id,
          description: f.description,
          lat: f.lat,
          lon: f.lon,
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

  // ── Tiqets (biglietti musei/attrazioni) per day ──
  const [tiqetsByDay, setTiqetsByDay] = useState<Record<number, any[]>>({});
  const [tiqetsLoadingDay, setTiqetsLoadingDay] = useState<number | null>(null);
  const [tiqetsExpandedDay, setTiqetsExpandedDay] = useState<number | null>(null);

  // ── Podcast state ──
  const [playingDay, setPlayingDay] = useState<number | string | null>(null);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState<number | string | null>(null);
  /**
   * (29/08/2026) Il giorno dell'itinerario, in attesa che l'utente scelga COME
   * farlo: a piedi diventa un giro Dieci Tappe nel radar (tracciato, tappe che
   * si aggiungono e si tolgono, audioguide), in auto esce su Google Maps con
   * tutte le tappe. Prima il tasto portava dritto nel radar, e chi era in
   * macchina si ritrovava una guida a piedi.
   */
  const [navGiorno, setNavGiorno] = useState<{ titolo: string; poi: any[] } | null>(null);
  const [isPodcastPaused, setIsPodcastPaused] = useState(false);
  // Cache testi podcast per non rigenerare: chiave = `${planKey}_${dayNum}`
  const [podcastCache, setPodcastCache] = useState<Record<string, string>>({});
  // Refs per controllo playback senza closure stale
  const podcastCancelRef = useRef(false);
  const podcastRestartFnRef = useRef<(() => void) | null>(null);
  // Timer della catena TTS: va cancellato in stop/replay, altrimenti un
  // setTimeout(doSpeak) già schedulato faceva ripartire la vecchia catena
  // sopra la nuova (doppia voce).
  const podcastTimerRef = useRef<any>(null);
  // Token di sessione incrementale: ogni avvio ne prende uno; la catena
  // procede solo finché è la sessione corrente. Sostituisce il solo booleano
  // podcastCancelRef, che veniva rimesso a false dal nuovo avvio e riabilitava
  // la catena vecchia ancora in volo.
  const podcastSessionRef = useRef(0);

  /**
   * Le 4 modalità condividevano UN SOLO set di campi (destinazioni, giorni,
   * mese, interessi, orari, raggio, categorie): impostare 7 giorni in
   * Automatica e poi aprire Preferiti faceva pagare 70 crediti per un
   * itinerario che non li usava, e gli interessi di una modalità si
   * mescolavano con quelli dell'altra (i due set hanno id diversi).
   * Tornando al menù di scelta si riparte puliti.
   */
  // Ogni nuova generazione riapre il quiz (che l'utente può richiudere).
  useEffect(() => {
    if (loading || candidatesLoading) setQuizDismissed(false);
  }, [loading, candidatesLoading]);

  useEffect(() => {
    if (plannerMode !== 'selection') return;
    setDestinations(['']);
    setDestCoords(null);
    setFocusedDestIdx(null);
    setShowSuggestions(false);
    setSuggestions([]);
    setDays(2);
    setMese('');
    setStartTime('09:00');
    setEndTime('20:00');
    setSelectedInterests([]);
    setSpecialRequests('');
    setRadius('300');
    setSelectedFavoriteIds([]);
    setAlternatives([]);
    setTinderSelectedCategories([]);
    setCandidates([]);
    setLikedCandidates([]);
    setCurrentCardIdx(0);
    setSwipeHistory([]);
    setActiveReplacingIdx(null);
    setSwipeDir(null);
    setReelPlaces([]);
  }, [plannerMode]);

  // «Da reel a itinerario»: CameraScreen salva città e luoghi estratti dallo
  // screenshot in 'wip_reel_to_plan' ({ city, places:[{name,lat,lon}], ts })
  // e naviga qui con 'wip-itinerary-checkin' (poiId 'reel-to-plan'). Si
  // consuma al mount e a quell'evento, solo entro 15 minuti dal salvataggio;
  // la chiave si rimuove subito dopo la lettura. Questo effect sta DOPO il
  // reset su 'selection' qui sopra: al mount i due setState si accodano in
  // ordine di dichiarazione e la città prefillata deve vincere sul reset.
  const consumeReelToPlan = () => {
    try {
      const raw = localStorage.getItem('wip_reel_to_plan');
      if (!raw) return;
      localStorage.removeItem('wip_reel_to_plan');
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts);
      if (!Number.isFinite(ts) || Date.now() - ts > 15 * 60 * 1000) return;
      const places = (Array.isArray(parsed?.places) ? parsed.places : [])
        .map((p: any) => ({
          name: String(p?.name || '').trim(),
          lat: p?.lat != null && Number.isFinite(Number(p.lat)) ? Number(p.lat) : null,
          lon: p?.lon != null && Number.isFinite(Number(p.lon)) ? Number(p.lon) : null,
        }))
        .filter((p: { name: string }) => p.name.length > 0);
      if (places.length === 0) return;
      const city = String(parsed?.city || '').trim();
      setPlannerMode('form_a');
      if (city) { setDestinations([city]); setDestCoords(null); }
      setReelPlaces(places);
    } catch { /* chiave assente o corrotta: si ignora */ }
  };
  useEffect(() => {
    consumeReelToPlan();
    const onReelCheckin = (e: any) => { if (e?.detail?.poiId === 'reel-to-plan') consumeReelToPlan(); };
    window.addEventListener('wip-itinerary-checkin', onReelCheckin);
    return () => window.removeEventListener('wip-itinerary-checkin', onReelCheckin);
  }, []);
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

  const loadTiqetsForDay = async (dayIdx: number) => {
    if (tiqetsByDay[dayIdx]) {
      setTiqetsExpandedDay(prev => prev === dayIdx ? null : dayIdx);
      return;
    }
    setTiqetsLoadingDay(dayIdx);
    setTiqetsExpandedDay(dayIdx);

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

      const res = await fetch("/api/tiqets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, radius: 30, cityName, lang: (language || 'IT').toLowerCase() })
      });
      if (!res.ok) throw new Error("Errore api Tiqets");
      const experiences = await res.json();

      // NIENTE ensureAffiliateUrl: le URL Tiqets arrivano dal server GIÀ con
      // ?partner=<brand> (attribuzione legata al token) — riscriverle o
      // "normalizzarle" farebbe perdere la commissione.
      setTiqetsByDay(prev => ({ ...prev, [dayIdx]: Array.isArray(experiences) ? experiences : [] }));
    } catch (err) {
      console.error("[Tiqets] Error loading tickets for day", dayIdx, err);
      setTiqetsByDay(prev => ({ ...prev, [dayIdx]: [] }));
    } finally {
      setTiqetsLoadingDay(null);
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
        price: item.priceRanges?.[0]?.min ? `${getTranslation('vr_b_from', language)} ${item.priceRanges[0].min} ${item.priceRanges[0].currency || 'EUR'}` : getTranslation('vr_b_see_price', language),
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
      notify(getTranslation('err_insufficient_credits', language));
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

        // CHIAVE OFFLINE CANONICA: identica a handleSelectItineraryPoi, cioè
        // ciò che PoiDetailSheet userà per LEGGERE (poi.id). Prima il bundle
        // salvava con `iti-<slug>` mentre la scheda leggeva `id_tappa`/`ai_...`:
        // audio e testo pagati (20 crediti/tappa) restavano introvabili.
        const stableId = tappa.id_tappa && !tappa.id_tappa.startsWith('custom-')
          ? tappa.id_tappa
          : `ai_${lat.toFixed(5)}_${lon.toFixed(5)}`.replace(/\./g, '_');

        // 1. Otteniamo il testo
        // Per gli itinerari salviamo il POI in shared_pois, quindi simuliamo lo stesso fetch di PoiDetailSheet
        // Route corretta: `/api/poi-details` non è mai esistita (la vera è
        // `/api/poi/details`), quindi ogni POI veniva saltato e il bundle
        // risultava vuoto pur annunciando "Audioguide scaricate e pronte!".
        // getApiUrl serve perché su app nativa i path relativi puntano al
        // bundle locale invece che al server.
        // apiFetch: col Bearer /api/poi/details risponde completo (all'anonimo
        // in forma degradata con auth_required: true).
        const res = await apiFetch(getApiUrl(`/api/poi/details?id=${poiId}&lat=${lat}&lon=${lon}&name=${encodeURIComponent(tappa.titolo_tappa)}`), undefined, 20000);
        if (!res.ok) continue;
        const details = await res.json();
        
        let textToSpeak = details?.description_long || details?.description || details?.description_short || details?.summary || details?.wiki_extract || tappa.attivita || tappa.titolo_tappa;

        // MULTI-LINGUA (ondata 4 — chiude il residuo noto "pacchetti offline
        // mono-lingua"): il testo da leggere arriva dal get-or-create PER
        // LINGUA (/api/poi/audioguide, cache poi_audioguides condivisa con il
        // nativo), non più dai campi italiani di shared_pois. La traduzione
        // la paga il primo utente di quella lingua, poi è cache per tutti.
        try {
          // Bearer automatico. NIENTE `charge`: il bundle e' gia' stato pagato
          // dal client (consumeCredits del bundle sopra); senza pass/diritto il
          // server risponde 402 e si resta sul testo base della scheda.
          const agRes = await apiFetch(getApiUrl('/api/poi/audioguide'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poiId: stableId, lang: language, character: guideMode, prefetch: true }),
          }, 25000);
          if (agRes.ok) {
            const ag = await agRes.json();
            if (ag?.text && String(ag.text).trim().length > 40) textToSpeak = ag.text;
          }
        } catch { /* rete instabile: il bundle prosegue col testo base */ }

        // Scheda testuale offline: PoiDetailSheet la legge quando manca la
        // rete (chiave offline_poi_<id>), così testo e guida restano fruibili.
        saveOfflinePoiSheet(stableId, {
          wikiData: {
            extract: textToSpeak,
            thumbnail: details?.image_url || details?.photo_url || undefined,
            description: tappa.tipo || 'Luogo',
            pageUrl: '#'
          },
          tripData: { address: '', tags: [tappa.tipo || 'cultura'], rating: details?.rating || null, numReviews: 0, reviews: [] },
          // In italiano il copione DB resta il migliore; nelle altre lingue
          // vale il testo tradotto appena ottenuto.
          generatedText: String(language).toUpperCase() === 'IT' ? (details?.audio_script || textToSpeak) : textToSpeak
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
        
        const ttsRes = await apiFetch(getApiUrl("/api/tts/smart"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSpeak, voice }),
        }, 30000);

        if (!ttsRes.ok) continue;
        const blob = await ttsRes.blob();
        if (blob.size < 500) continue; // MP3 vuoto: non spacciarlo per scaricato
        const url = URL.createObjectURL(blob);

        // 3. Salviamo offline con la stessa chiave usata in PoiDetailSheet
        const audioKey = `${stableId}_${guideMode}`;
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
          // 'trasferimento' (roadtrip, ondata 7): coordinate del centro della
          // città di arrivo, non un luogo visitabile — non deve diventare un
          // POI geofenceable, altrimenti il servizio nativo lo attiverebbe
          // semplicemente passando vicino alla città, leggendo il racconto
          // del viaggio come se fosse l'audioguida di un luogo reale.
          if (lat !== 0 && lon !== 0 && tappa.tipo !== 'ristorante' && tappa.tipo !== 'pausa' && tappa.tipo !== 'spostamento' && tappa.tipo !== 'trasferimento') {
            // L'id porta anche le coordinate (22/08/2026): con il solo slug
            // del titolo, «iti-duomo» era UNA riga condivisa da tutte le
            // città con un Duomo, e teneva la foto e il testo della prima.
            // A 3 decimali (~100 m) due tappe omonime in città diverse non
            // collidono più; la stessa tappa dello stesso itinerario sì.
            const stableId = `iti-${tappa.titolo_tappa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}-${lat.toFixed(3)}_${lon.toFixed(3)}`.replace(/\./g, 'p');
            allPoisToUpsert.push({
              id: stableId,
              name: tappa.titolo_tappa,
              category: mapItineraryCategoryToMapCategory(tappa.tipo || 'monumenti'),
              lat: lat,
              lon: lon,
              description_ai: tappa.attivita || '',
              source: 'itinerary',
              // status: 'auto' (27/08/2026) — mancava, e isDownloadablePoiStatus
              // tratta i record senza status come non scaricabili: queste POI
              // "per il GPS tracking" restavano escluse proprio dal trigger
              // offline/background per cui esistono.
              status: 'auto',
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
    notify(getTranslation('experience_added', language), 'success');
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
    notify(`${getTranslation('experience_added', language)} — ${getTranslation('day', language)} ${dayIdx + 1}`, 'success');
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
    notify(`${getTranslation('event_added', language)} — ${getTranslation('day', language)} ${dayIdx + 1}`, 'success');
  };

  const handleAddTiqetsToDay = (dayIdx: number, exp: any) => {
    if (!generatedPlan) return;

    const newTappa = {
      id_tappa: `tq_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ora: "Da definire",
      titolo_tappa: exp.name || "Biglietto Tiqets",
      attivita: exp.description || "Biglietto d'ingresso prenotabile online.",
      consiglio_guida: `✨ Nicky: Biglietto prenotabile su Tiqets${exp.price ? `: ${exp.price}` : ''}${exp.rating ? ` (${exp.rating})` : ''}.`,
      tipo: "esperienza",
      coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 },
      // URL Tiqets INTATTA: il ?partner= è già dentro (attribuzione dal token
      // server); niente ensureAffiliateUrl, che è per Viator/GYG.
      link_info: exp.url
    };

    const updatedPlan = {
      ...generatedPlan,
      giorni: generatedPlan.giorni.map((g, idx) =>
        idx === dayIdx ? { ...g, tappe: [...g.tappe, newTappa] } : g
      )
    };

    setGeneratedPlan(updatedPlan);
    savePlanToSupabase(updatedPlan);
    notify(`${getTranslation('experience_added', language)} — ${getTranslation('day', language)} ${dayIdx + 1}`, 'success');
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
  // Copia in ref per l'handler di check-in (registrato con deps
  // [generatedPlan?.id], quindi con una closure che non vede gli stati).
  const navIdxRef = useRef<{ day: number | null; stop: number | null }>({ day: null, stop: null });
  useEffect(() => { navIdxRef.current = { day: navDayIndex, stop: navStopIndex }; }, [navDayIndex, navStopIndex]);
  const {
    state: navState,
    currentInstruction,
    currentManeuver,
    distanceToNext,
    distanceToDestination,
    etaSeconds,
    progress: navProgress,
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
      // Ricevuta: App.tsx ridispatcha l'evento finché qualcuno non lo marca.
      // Senza, chi avviava la navigazione dalla mappa prima di aver mai aperto
      // questa tab (montata lazy) sparava l'evento nel vuoto.
      if (e.detail) e.detail.handled = true;
      const { endCoords, destinationName, origin, pois, poiId } = e.detail || {};
      if (!endCoords?.lat) return;
      startNavigation(
        {
          lat: endCoords.lat,
          lon: endCoords.lon,
          // Id vero se c'e' (popup/radar): all'arrivo App.tsx apre la scheda
          // e avvia l'audioguida. Sintetico solo per gli indirizzi liberi.
          poiId: poiId ? String(poiId) : `wipnav_${String(destinationName || '').slice(0, 40)}`,
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
      // Prossima tappa CON coordinate valide (ITI-04): le esperienze
      // aggiunte a mano hanno {0,0} e vanno saltate, non "navigate".
      let nextIdx = navStopIndex + 1;
      while (giorno && nextIdx < giorno.tappe.length && !haCoordinateValide(giorno.tappe[nextIdx])) nextIdx += 1;
      if (giorno && nextIdx < giorno.tappe.length) {
         const nextStop = giorno.tappe[nextIdx];
         setNavStopIndex(nextIdx);
         startNavigation({
           lat: nextStop.coordinate.lat,
           lon: nextStop.coordinate.lng,
           // L'id della tappa COM'E' (ITI-01): `parseInt(id.replace(/\D/g,''))`
           // esplodeva se id_tappa mancava (lo schema AI non lo produce) e
           // trasformava "lib_1_2_ab12cd" in 12, cioe' un POI a caso.
           poiId: nextStop.id_tappa || undefined,
           poiName: nextStop.titolo_tappa,
           dayIndex: navDayIndex,
           stopIndex: nextIdx,
         });
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

  // Dal 14/08/2026 l'addebito è INTERAMENTE SERVER-SIDE dentro
  // /api/groq/itinerary-stream (pre-addebito sui giorni richiesti + conguaglio
  // a fine stream sui giorni consegnati, rimborso su fallimento): l'addebito
  // client era bypassabile via curl. Dopo la consegna il client chiama solo
  // notifyCreditsChanged — MAI consumeCredits (doppio addebito).

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
    // Addebito SERVER-SIDE (14/08/2026): /api/groq/itinerary-stream pre-addebita
    // e fa il conguaglio sui giorni consegnati. Il gate di saldo qui sotto è solo
    // UX anticipata ("crediti insufficienti" senza round-trip); il server
    // rifiuta comunque con INSUFFICIENT_CREDITS se il saldo non basta.
    if (bal.total < totalItineraryCost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    setLoading(true);
    try {
      // Destinazione REALE dal form (il titolo dell'itinerario mandava il
      // modello fuori strada: "Weekend d'arte" non è una città) + coordinate
      const regenCoords = destCoords || await resolveDestCoords();
      // Roadtrip (ondata 7): anche la rigenerazione conserva le città multiple;
      // silent=true perché qui l'addebito è già avvenuto — se una città non si
      // risolve si ricade sulla generazione mono-città senza doppio avviso.
      const regenLegs = await buildRoadtripLegs(destinations.filter(d => d.trim()), regenCoords, true);
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinations.filter(d => d.trim()).join(" e ") || generatedPlan.titolo,
        lat: regenCoords?.lat,
        lon: regenCoords?.lon,
        ...(regenLegs ? { legs: regenLegs } : {}),
        days: generatedPlan.giorni.length,
        startTime,
        endTime,
        interests: selectedInterests.length > 0 ? selectedInterests : ['generale'],
        specialRequests,
        includeEvents,
        includeTours,
        soloGratis,
        budget,
        viaggiatori,
        ritmo,
        guida,
        lockedStops: Object.values(lockedStops),
        radius: parseInt(radius),
        language,
        // Quota per-UTENTE, non per-IP: senza userId il server ricadeva su
        // anonymous-fallback-<ip> e più utenti sotto la stessa NAT si
        // consumavano a vicenda il tetto 30/giorno.
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });
      
      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        notifyCreditsChanged({ userId: currentUserId }); // addebito/conguaglio server-side: si riallinea il saldo
      } else {
        // Nessun itinerario valido: il rimborso è server-side, qui si
        // riallinea solo il saldo mostrato.
        notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
      }
    } catch (err) {
      console.error("Regeneration with locks error:", err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
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
    // Costo per singola tappa suggerita (non l'intero itinerario).
    // `audio_guide * 0.5` = 7,5 crediti FRAZIONARI: consume_credits vuole un
    // integer → 22P02 → fallback bloccato → "crediti insufficienti" a wallet
    // pieno. Voce intera dedicata (8), come già fa la sostituzione tappa.
    const suggestCost = PRICING_LIST.replace_stop;
    const confirmed = await creditConfirm.requestConfirmation(suggestCost, "Suggerimento tappa AI", bal.total);
    if (!confirmed) {


       return;
    }
    // Addebito SERVER-SIDE: /api/groq/suggest verifica il token, scala i
    // crediti e li restituisce se non consegna una tappa valida. Il gate di
    // saldo qui sotto è solo UX anticipata (niente round-trip a saldo zero).
    if (bal.total < suggestCost) {
      notify(getTranslation('err_insufficient_credits', language));
      return;
    }

    setSuggestLoading(true);
    try {
      const dayStops = generatedPlan.giorni[gIdx].tappe;
      const token = sessionData?.session?.access_token;
      const res = await fetch(getApiUrl('/api/groq/suggest'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dayStops, gIdx, destination: generatedPlan.titolo, language })
      });
      if (!res.ok) throw await planErrorFromResponse(res);
      const data = await res.json();
      if (data?.error && PLAN_ERROR_KEYS[data.error]) throw new PlanError(data.error);
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
        // L'addebito è già avvenuto sul server: qui si riallinea solo il saldo.
        notifyCreditsChanged({ userId: currentUserId });
      } else {
        // Nessun suggerimento valido: il server ha già restituito i crediti.
        notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
      }
    } catch (err) {
      console.error("Suggest Stop Error:", err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
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

  const INTERESTS_TRANSLATIONS: Record<string, Partial<Record<Language, string>>> = {
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

    // Issue 18 Fix: Ascolta check-in e arrivo a destinazione per marcare le tappe.
    // UPDATER FUNZIONALE: prima l'handler catturava `generatedPlan` per closure
    // con dipendenza [generatedPlan?.id]; poiché l'id non cambia durante le
    // modifiche (spostamenti, cancellazioni, aggiunte), la closure restava
    // ferma a uno snapshot STANTIO e il save lo ripersisteva, cancellando le
    // modifiche di sessione. Con `prev` si parte sempre dallo stato corrente.
    // MATCHING ESATTO: prima `includes` faceva sì che "t1" combaciasse con
    // t1/t10/t11/t21 → una tappa raggiunta ne marcava mezzo itinerario.
    const handleCheckin = (e: any) => {
      const { poiId, poiName } = e.detail || {};
      // MATCH PER INDICE quando c'e' (ITI-12): 'wip-nav-arrived' porta
      // dayIndex/stopIndex della tappa navigata; in mancanza si usano gli
      // indici correnti della navigazione. Il nome resta SOLO come ultima
      // riserva, limitata al giorno corrente: due «Duomo» in giorni diversi
      // non si marcano piu' insieme.
      const dayIdx: number | null = Number.isInteger(e.detail?.dayIndex) ? e.detail.dayIndex
        : Number.isInteger(navIdxRef.current.day) ? navIdxRef.current.day : null;
      const stopIdx: number | null = Number.isInteger(e.detail?.stopIndex) ? e.detail.stopIndex
        : (Number.isInteger(e.detail?.dayIndex) ? null : (Number.isInteger(navIdxRef.current.stop) ? navIdxRef.current.stop : null));
      setGeneratedPlan(prev => {
        if (!prev) return prev;
        let changed = false;
        const newPlan = {
          ...prev,
          giorni: prev.giorni.map((g, gi) => ({
            ...g,
            tappe: g.tappe.map((t, ti) => {
              let isMatch = false;
              if (dayIdx != null && stopIdx != null) {
                isMatch = gi === dayIdx && ti === stopIdx;
              } else if (poiId != null && String(t.id_tappa) === String(poiId)) {
                isMatch = true;
              } else if (poiName && t.titolo_tappa === poiName) {
                isMatch = dayIdx == null || gi === dayIdx;
              }
              if (isMatch && !(t as any).visited) { changed = true; return { ...t, visited: true }; }
              return t;
            })
          }))
        };
        if (changed) savePlanToSupabase(newPlan);
        return changed ? newPlan : prev;
      });
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
      setActiveSuggestIdx(-1);
      return;
    }
    setActiveSuggestIdx(-1);

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Proxy server-side: il token Mapbox non sta più nel bundle client.
        const res = await fetch(getApiUrl(
          `/api/geocode?q=${encodeURIComponent(destinations[focusedDestIdx])}`
          + `&lang=${language.toLowerCase()}&limit=5`
        ));
        if (res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data.features) ? data.features : []);
        }
      } catch (e) {
        console.error("Geocode search error:", e);
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
    // Copia locale dell'ultimo piano (scritta da savePlanToSupabase in
    // idb 'wip_last_plan'): fino al 28/08/2026 veniva salvata e MAI letta,
    // quindi offline o con Supabase in timeout l'utente vedeva la schermata
    // di selezione vuota anche col piano di ieri sul telefono (ITI-02).
    const ripiegaSuCopiaLocale = async (): Promise<boolean> => {
      try {
        const local: any = await idbGet('wip_last_plan');
        if (local && Array.isArray(local.giorni) && local.giorni.length > 0) {
          setGeneratedPlan(local);
          setPlannerMode('view');
          return true;
        }
      } catch { /* IndexedDB non disponibile */ }
      return false;
    };

    const offline = !isOnline || (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (offline && await ripiegaSuCopiaLocale()) return;

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
      // Errore di RETE/timeout (non "nessuna riga", che e' PGRST116): il
      // piano c'e' quasi certamente in locale.
      if (error && String(error.code || '') !== 'PGRST116' && await ripiegaSuCopiaLocale()) return;
    } catch (err) {
      // Timeout del fetch (supabase.ts abortisce a 20 s) o rete assente
      if (await ripiegaSuCopiaLocale()) return;
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
      if (!currentUserId) {
        // Utente non loggato: mostra il mirror locale invece di una lista
        // vuota (prima il return secco nascondeva itinerari salvati offline).
        const localData = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
        setMyItineraries(localData);
        return;
      }
      const { data, error } = await supabase
        .from('user_itineraries')
        .select('id, titolo, updated_at, dati_itinerario')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false })
        // Tetto alzato da 20 a 200: senza paginazione, 20 nascondeva gli
        // itinerari più vecchi (irraggiungibili dalla UI). 200 copre l'uso
        // reale; oltre serve una paginazione vera.
        .limit(200);
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
    if (!confirm(getTranslation('vr_b_confirm_delete_itinerary', language))) return;
    try {
      // Cancella solo gli itinerari dell'utente corrente (mai righe di altri utenti)
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (uid) {
        const { error } = await supabase.from('user_itineraries').delete().eq('id', id).eq('user_id', uid);
        if (error) {
          notify(getTranslation('err_delete_itinerary', language));
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

  /**
   * AGENTE WIP → FORM STANDARD (23/08/2026). L'agente non genera: riempie
   * il form "Itinerario su misura" con quello che ha capito e lascia che
   * sia handleGenerateAutomatic a fare tutto — geocodifica della
   * destinazione, conferma del prezzo, cache condivisa, streaming,
   * verifica. Un solo motore, una sola regola di addebito, e l'utente vede
   * il form compilato se vuole ritoccare a mano.
   */
  const applyWipAgentParams = (p: WipAgentParams) => {
    // "Roma e Firenze" → due destinazioni (roadtrip), come nel form.
    const dests = p.destination.split(/\s+e\s+|\s*,\s*/i).map(s => s.trim()).filter(Boolean);
    setDestinations(dests.length ? dests : [p.destination]);
    setDays(clampDays(p.days));
    setMese(p.month || '');
    setSelectedInterests(p.interests || []);
    setBudget(p.budget);
    setRitmo(p.ritmo);
    setViaggiatori(p.viaggiatori);
    setSoloGratis(!!p.soloGratis);
    setStartTime(p.startTime || '09:00');
    setEndTime(p.endTime || '20:00');
    setSpecialRequests(p.specialRequests || '');
    // Si va sul form: se la generazione si ferma (saldo, destinazione non
    // trovata, annullo della conferma) l'utente è già davanti ai campi
    // compilati dall'agente, e handleGenerateAutomatic torna lì in ogni caso.
    setPlannerMode('form_a');
    setWipAgentPending(true);
  };
  useEffect(() => {
    if (!wipAgentPending) return;
    setWipAgentPending(false);
    void handleGenerateAutomatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wipAgentPending]);

  const handleGenerateAutomatic = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    if (activeDestinations.length === 0) { notify(getTranslation('err_no_destination', language)); return; }
    if (!validateTimes()) return;

    const destination = activeDestinations.join(" e ");

    // Coordinate certe della destinazione PRIMA di addebitare: è questo il
    // flusso classico dove "Tallinn" diventava "Olbia".
    const coords = await resolveDestCoords();
    // Guardia INCONDIZIONATA: il geocoding è server-side (/api/geocode, che usa
    // anche MAPBOX_TOKEN non-VITE). Legarla a VITE_MAPBOX_TOKEN significava che
    // un build senza quella variabile client generava senza lat/lon, senza
    // ancora geografica e senza verifica anti-allucinazione (20 crediti per un
    // itinerario nella città sbagliata).
    if (!coords) {
      alertDestNotFound();
      return;
    }

    // Roadtrip multi-città (ondata 7): tutte le città risolte PRIMA di
    // addebitare — una città non geocodificabile blocca qui, a costo zero.
    let roadtripLegs: Array<{ city: string; lat: number; lon: number }> | null = null;
    if (activeDestinations.length >= 2) {
      roadtripLegs = await buildRoadtripLegs(activeDestinations, coords);
      if (!roadtripLegs) return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = clampDays(days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
       return;
    }
    // Addebito SERVER-SIDE (14/08/2026): /api/groq/itinerary-stream pre-addebita
    // e fa il conguaglio sui giorni consegnati. Il gate di saldo qui sotto è solo
    // UX anticipata ("crediti insufficienti" senza round-trip); il server
    // rifiuta comunque con INSUFFICIENT_CREDITS se il saldo non basta.
    if (bal.total < totalItineraryCost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    // Lunghezza quiz esplicita: restava al valore impostato dall'ultima
    // sessione Raggio (4) anche nelle altre modalità.
    setActiveQuizLength(7);
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
      // altrimenti continuerebbero a essere servite dalla cache. Nel roadtrip
      // entrano le coordinate di TUTTE le città.
      roadtripLegs
        ? roadtripLegs.map(l => `${l.lat.toFixed(1)}_${l.lon.toFixed(1)}`).join('-')
        : (coords ? `${coords.lat.toFixed(1)}_${coords.lon.toFixed(1)}` : 'nogeo'),
      numDaysForPricing,
      language.toLowerCase(),
      budget,
      ritmo,
      viaggiatori,
      [...selectedInterests].sort().join('-') || 'nessuno',
      // Questi parametri cambiano il risultato tanto quanto gli altri ma non
      // erano nella chiave: chi sceglieva Dicembre riceveva — a prezzo pieno —
      // l'itinerario cachato di chi aveva scelto Luglio, e gli orari o gli
      // eventi/tour richiesti venivano ignorati del tutto.
      mese || 'anymonth',
      `${startTime}-${endTime}`,
      includeEvents ? 'ev1' : 'ev0',
      includeTours ? 'tr1' : 'tr0',
      // La casella "Gratis" cambia radicalmente le tappe: slot cache separato
      soloGratis ? 'fr1' : 'fr0'
    ].join('_');
    // Le richieste speciali sono libere e personali: niente cache (né lettura né scrittura).
    // Stesso discorso per l'indirizzo dell'alloggio: cambia il punto di
    // partenza del Giorno 1, quindi l'itinerario non è più intercambiabile
    // con quello (generico) in cache.
    // Idem per le tappe dal reel: sono obbligatorie e personali, un itinerario
    // generico in cache le ignorerebbe (e quello generato non va in cache).
    const cacheUsable = specialRequests.trim().length === 0 && accommodationAddress.trim().length === 0 && reelPlaces.length === 0;

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

        // Sconto libreria: l'itinerario esiste già nella cache condivisa, qui
        // non c'è NESSUNA chiamata AI. Con l'addebito ora interamente SERVER-SIDE
        // questo ramo cache NON passa dal server (return anticipato): non esiste
        // alcun addebito da scontare, quindi NON si rimborsa dal client — lo
        // farebbe STAMPANDO crediti dal nulla. Il cache-hit resta gratuito.
        // TODO(prodotto): se il cache-hit dovrà costare (mezzo prezzo), l'addebito
        // va fatto su una rotta SERVER dedicata, mai col refund lato client.

        setGeneratedPlan(plan);
        savePlanToSupabase(plan); // Salva nei personali dell'utente
        setPlannerMode('view');
        setLoading(false);
        // L'utente aveva confermato un prezzo: gli si dice che non ha pagato.
        notify(getTranslation('library_cache_hit_free', language), 'success');
        return; // Successo! Usciamo subito
      }
    } catch (e) {
      console.debug("Global itinerary cache fetch skipped/failed:", e);
    }

    // Si passa subito alla vista risultato: lo streaming popola l'itinerario
    // tappa per tappa e, chiudendo il quiz, lo si vede costruire in diretta.
    setPlannerMode('view');

    // L'indirizzo dell'alloggio, se compilato, entra come istruzione esplicita
    // nella richiesta senza toccare lo state visibile di specialRequests
    // (restano due campi separati in UI, uniti solo qui per il generatore).
    const accommodationTrimmed = accommodationAddress.trim();
    // Tappe dal reel: entrano sia come frase nelle richieste sia nei campi
    // strutturati del server (`pois` = elenco obbligatorio, `poisDetailed`
    // = coordinate per il piano geografico per giorno, come swipe/preferiti).
    const reelNames = reelPlaces.map(p => p.name);
    const reelRequest = reelNames.length
      ? `Includi obbligatoriamente queste tappe: ${reelNames.join(', ')}.`
      : '';
    const specialRequestsForGeneration = (accommodationTrimmed || reelRequest)
      ? [
          accommodationTrimmed ? `Punto di partenza del Giorno 1 (e possibilmente base per il rientro serale): ${accommodationTrimmed}.` : '',
          reelRequest,
          specialRequests.trim(),
        ].filter(Boolean).join(' ')
      : specialRequests;

    try {
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        ...(roadtripLegs ? { legs: roadtripLegs } : {}),
        ...(reelNames.length ? {
          pois: reelNames,
          poisDetailed: reelPlaces.map(p => ({
            nome: p.name,
            tipo: 'attrazione',
            descrizione: '',
            ...(p.lat != null && p.lon != null && p.lat !== 0 ? { lat: p.lat, lon: p.lon } : {}),
          })),
        } : {}),
        days: numDaysForPricing,
        startTime,
        endTime,
        interests: selectedInterests,
        specialRequests: specialRequestsForGeneration,
        includeEvents,
        includeTours,
        soloGratis,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        radius: safeRadius(),
        language,
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });

      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        notifyCreditsChanged({ userId: currentUserId }); // addebito/conguaglio server-side: si riallinea il saldo
        // Le tappe dal reel sono state consumate: il prossimo itinerario riparte pulito.
        if (reelNames.length) setReelPlaces([]);

        // Salva in background l'itinerario appena generato nella cache condivisa
        // (senza l'id personale: la cache è condivisa tra utenti)
        if (cacheUsable) try {
          const { id: _omit, ...cachePayload } = data;
          await supabase.from("shared_itinerary_cache").upsert({
            id: cacheId,
            destination: destination.trim(),
            days: numDaysForPricing,
            dati_itinerario: cachePayload,
            created_at: new Date().toISOString()
          }, { onConflict: "id" });
          console.log("[Global Itinerary Cache] Saved generated itinerary:", cacheId);
        } catch(e) {}

        setPlannerMode('view');
      } else {
        // Nessun itinerario valido: il rimborso è server-side.
        notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
        setPlannerMode('form_a');
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
      if ((err as any)?.code === 'INSUFFICIENT_CREDITS') setShowShop(true);
      setPlannerMode('form_a');
    } finally {
      setLoading(false);
    }
  };

  /**
   * FASE B del Raggio: qui — e solo qui — si paga, perché è qui che nasce
   * l'itinerario vero. Stesso schema degli altri flussi: conferma, addebito,
   * rimborso su qualunque fallimento, conguaglio sui giorni effettivi.
   */
  const handleGenerateFromAlternative = async (alt: any) => {
    if (loading) return; // anti doppio-click: doppio addebito
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    const baseLocation = activeDestinations[0] || "Destinazione sconosciuta";
    const destinationStr = alt.titolo; // DeepSeek will generate the itinerary for this alternative title
    // Coordinate della base già risolte nel passo precedente (handleGenerateRadius):
    // ancorano anche l'alternativa alla zona giusta.
    const coords = destCoords && destCoords.label === baseLocation ? destCoords : null;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = clampDays(alt?.dati_itinerario?.giorni?.length || days);
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) return;
    // Addebito SERVER-SIDE (14/08/2026): /api/groq/itinerary-stream pre-addebita
    // e fa il conguaglio sui giorni consegnati. Il gate di saldo qui sotto è solo
    // UX anticipata ("crediti insufficienti" senza round-trip); il server
    // rifiuta comunque con INSUFFICIENT_CREDITS se il saldo non basta.
    if (bal.total < totalItineraryCost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    setActiveQuizLength(7);
    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    setPlannerMode('view');

    try {
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinationStr,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        // Giorni coerenti col prezzo appena confermato (quelli dell'alternativa,
        // non lo stato del form): altrimenti si confermava N e si chiedeva M.
        days: numDaysForPricing,
        startTime,
        endTime,
        interests: selectedInterests,
        specialRequests: `ATTENZIONE: Questo è un itinerario a raggio con base di partenza ${baseLocation}. L'utente ha selezionato questa opzione specifica: ${alt.titolo} - ${alt.descrizione_breve}. Sviluppa le tappe seguendo questa idea. ${specialRequests}`,
        includeEvents,
        includeTours,
        soloGratis,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        radius: safeRadius(),
        language,
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });

      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        notifyCreditsChanged({ userId: currentUserId }); // addebito/conguaglio server-side: si riallinea il saldo
      } else {
        notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
        setPlannerMode('alternatives_view');
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
      if ((err as any)?.code === 'INSUFFICIENT_CREDITS') setShowShop(true);
      setPlannerMode('alternatives_view');
    } finally {
      setLoading(false);
    }
  };

  /**
   * FASE A del Raggio: propone 3 idee di viaggio. È GRATUITA.
   *
   * Prima si addebitava qui l'intero itinerario (fino a 70 crediti per 7
   * giorni) per ottenere solo 3 titoli con descrizione breve: chi tornava
   * indietro senza scegliere — o premeva "Genera altre 3 idee" — pagava una
   * o più volte senza ricevere alcun itinerario. Ora si paga una volta sola,
   * al momento della scelta, dentro handleGenerateFromAlternative.
   */
  const handleGenerateRadius = async () => {
    if (loading) return;
    const activeDestinations = destinations.filter(d => d.trim().length > 0);
    if (activeDestinations.length === 0) { notify(getTranslation('err_no_base', language)); return; }
    if (!validateTimes()) return;

    const baseLocation = activeDestinations[0]; // Take the first one as base

    // Anche il raggio parte da una città: senza coordinate certe le
    // alternative venivano cercate attorno al posto sbagliato.
    const coords = await resolveDestCoords();
    // Guardia INCONDIZIONATA: il geocoding è server-side (/api/geocode, che usa
    // anche MAPBOX_TOKEN non-VITE). Legarla a VITE_MAPBOX_TOKEN significava che
    // un build senza quella variabile client generava senza lat/lon, senza
    // ancora geografica e senza verifica anti-allucinazione (20 crediti per un
    // itinerario nella città sbagliata).
    if (!coords) {
      alertDestNotFound();
      return;
    }

    setActiveQuizLength(4);
    setLoading(true);

    try {
      // Il server richiede login (401 senza token) anche qui, per chiudere la
      // generazione anonima via curl; la funzione resta gratuita per l'utente.
      const { data: raSess } = await supabase.auth.getSession();
      const raToken = raSess?.session?.access_token;
      // getApiUrl: il path relativo su app nativa punta a localhost e la
      // chiamata fallisce sempre (le 3 alternative non arrivavano mai su
      // telefono). Tutte le altre fetch del file passano già di qui.
      const res = await fetch(getApiUrl('/api/groq/radius-alternatives'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(raToken ? { Authorization: `Bearer ${raToken}` } : {}),
        },
        body: JSON.stringify({
          baseLocation,
          ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
          radius: safeRadius(),
          days: clampDays(days),
          startTime,
          endTime,
          interests: [...selectedInterests, includeEvents ? "Eventi Locali" : null, includeTours ? "Tour e Attività" : null].filter(Boolean),
          budget,
          viaggiatori,
          ritmo,
          guida,
          mese,
          soloGratis,
          language
        })
      });
      const data = await res.json();
      if (data.alternative && Array.isArray(data.alternative) && data.alternative.length > 0) {
        setAlternatives(data.alternative);
        setPlannerMode('alternatives_view');
      } else {
        notify(getTranslation('err_no_alternatives', language));
      }
    } catch (err) {
      console.error("Radius alternatives error:", err);
      notify(getTranslation('err_no_alternatives', language));
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
    // Nuova sessione: invalida qualunque catena precedente ancora schedulata.
    const mySession = ++podcastSessionRef.current;
    podcastCancelRef.current = false;
    if (podcastTimerRef.current) clearTimeout(podcastTimerRef.current);
    setIsPodcastPaused(false);
    setPlayingDay(dayNum);
    let idx = startIdx;

    const isActive = () => mySession === podcastSessionRef.current && !podcastCancelRef.current;

    const doSpeak = () => {
      if (!isActive() || idx >= chunks.length) {
        if (isActive()) setPlayingDay(null);
        return;
      }
      const utt = new SpeechSynthesisUtterance(chunks[idx]);
      utt.lang = utteranceLang;
      utt.rate = 0.92;
      utt.pitch = pitch;
      utt.volume = 1.0;
      if (chosenVoice) utt.voice = chosenVoice;
      utt.onend = () => { if (isActive()) { idx++; podcastTimerRef.current = setTimeout(doSpeak, 50); } };
      utt.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn(`[Podcast] chunk ${idx} error: ${e.error}`);
        if (isActive()) { idx++; podcastTimerRef.current = setTimeout(doSpeak, 100); }
      };
      window.speechSynthesis.speak(utt);
    };

    // Salva funzione per replay
    podcastRestartFnRef.current = () => {
      const s = window.speechSynthesis;
      if (s) { s.resume(); s.cancel(); } // resume prima di cancel: fix muto Chrome
      podcastTimerRef.current = setTimeout(() => startTtsPlayback(chunks, utteranceLang, chosenVoice, pitch, dayNum, 0), 250);
    };

    // ⚠️ Chrome fix: aspetta dopo cancel()
    podcastTimerRef.current = setTimeout(doSpeak, 250);
  }, []);

  const handlePlayDailyPodcast = async (dayNum: number | string, tappe: any[], isLastDay: boolean = false) => {
    if (!tappe || !Array.isArray(tappe) || tappe.length === 0) {
      console.warn('[Podcast] Nessuna tappa disponibile');
      return;
    }
    // iOS Safari/PWA: il TTS va "sbloccato" DENTRO il gesto utente. Il primo
    // speak() reale parte solo dopo il fetch (~10 s), fuori dal contesto del
    // tap: senza questo, crediti scalati e zero audio. unlockSpeech emette una
    // utterance muta ora, mentre il gesto è ancora valido.
    import('../services/ttsService').then(({ unlockSpeech }) => unlockSpeech()).catch(() => {});

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
        
        // ADDEBITO E RIMBORSO ORA SERVER-SIDE: la rotta scala 15 crediti in
        // modo atomico (cache-first: niente addebito se già generato) e li
        // restituisce se la generazione fallisce. Il client non addebita più
        // (niente slot podcastChargeRef unico e niente crediti persi al
        // refresh); passa solo il token. La modale di conferma sopra resta.
        // Normalizza tappe per diversi formati salvati
        const tappaFallback = getTranslation('vr_b_stop_fallback', language);
        const tappeNorm = tappe.map(t => ({
          name: t.titolo_tappa || t.name || t.title || t.nome || tappaFallback,
          description: (t.attivita || t.description || t.descrizione || '')?.slice(0, 150)
        })).filter(t => t.name !== tappaFallback || t.description);

        const destination = generatedPlan?.titolo || generatedPlan?.citta || 'la tua destinazione';
        console.log(`[Podcast] Genero per "${destination}" Day ${dayNum} (${tappeNorm.length} tappe)`);

        const { data: podSess } = await supabase.auth.getSession();
        const res = await fetch('/api/generate-daily-podcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${podSess?.session?.access_token || ''}`,
          },
          body: JSON.stringify({
            destination,
            dayNum,
            tappe: tappeNorm.length > 0 ? tappeNorm : tappe.map(t => ({ name: t.titolo_tappa || t.name || 'Visita', description: '' })),
            language: language || 'IT',
            isLastDay
          })
        });

        if (res.status === 402) {
          notify(getTranslation('err_insufficient_credits', language));
          setIsGeneratingPodcast(null);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        podcastText = data.text?.trim();

        if (!podcastText) {
          notify(getTranslation('err_generation_refunded', language));
          setIsGeneratingPodcast(null);
          return;
        }
        // Il saldo è cambiato lato server (tranne cache hit): riallinea le viste.
        notifyCreditsChanged({ userId: currentUserId });

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
        notify(getTranslation('err_tts_unsupported', language));
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
        // 'male' NON può stare nella lista maschile: è contenuto in "female",
        // e su Android le voci si chiamano `it-it-x-kda#female_1-local` — così
        // ogni voce femminile prendeva +50 come maschile e Dante finiva con
        // voce di donna. Si usano i marcatori espliciti '#male'/'#female'.
        const maleK = ['matteo','luca','diego','massimo','giorgio','#male','david','james','william','reed','thomas','alex','cosimo','marco'];
        const femK = ['nicky','alice','anna','sofia','elena','sara','#female','woman','lisa','emma','julia','elsa'];
        const isFem = n.includes('#female') || femK.some(k => n.includes(k));
        const isMale = !isFem && maleK.some(k => n.includes(k));
        if (isDante && isMale) s += 50;
        if (!isDante && isFem) s += 50;
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
      // Addebito e rimborso sono server-side: qui si riallinea solo il saldo.
      notifyCreditsChanged({});
      setPlayingDay(null);
      setIsGeneratingPodcast(null);
      notify(getTranslation('err_generation_refunded', language));
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
    podcastSessionRef.current++;      // invalida la catena corrente
    podcastCancelRef.current = true;
    if (podcastTimerRef.current) clearTimeout(podcastTimerRef.current);
    const s = window.speechSynthesis;
    // resume() PRIMA di cancel(): se il motore era in pausa, un cancel secco
    // lo lasciava in stato paused e le utterance successive restavano mute.
    if (s) { s.resume(); s.cancel(); }
    setPlayingDay(null);
    setIsPodcastPaused(false);
  };

  const handleReplayPodcast = () => {
    if (podcastRestartFnRef.current) {
      podcastSessionRef.current++;
      podcastCancelRef.current = true;
      if (podcastTimerRef.current) clearTimeout(podcastTimerRef.current);
      const s = window.speechSynthesis;
      if (s) { s.resume(); s.cancel(); }
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
    try {
      // Geocoding rigoroso via proxy server (solo località amministrative).
      const res = await fetch(getApiUrl(
        `/api/geocode?q=${encodeURIComponent(dest)}&limit=1`
        + `&types=place,locality,region,country&lang=${language.toLowerCase()}`
      ));
      if (!res.ok) return null;
      const f = (await res.json()).features?.[0];
      if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return null;
      const coords = { lat: f.lat, lon: f.lon, label: dest };
      setDestCoords(coords);
      return coords;
    } catch {
      return null;
    }
  };

  const alertDestNotFound = () => {
    notify(`"${destinations[0]}" — ${getTranslation('err_location_not_found', language)}`);
  };

  // Geocodifica una singola città (roadtrip, ondata 7): stessa rotta rigorosa
  // di resolveDestCoords ma senza toccare destCoords, che resta sulla prima.
  const geocodeCity = async (name: string): Promise<{ lat: number; lon: number } | null> => {
    const q = name.trim();
    if (!q) return null;
    try {
      const res = await fetch(getApiUrl(
        `/api/geocode?q=${encodeURIComponent(q)}&limit=1`
        + `&types=place,locality,region,country&lang=${language.toLowerCase()}`
      ));
      if (!res.ok) return null;
      const f = (await res.json()).features?.[0];
      return f && Number.isFinite(f.lat) && Number.isFinite(f.lon) ? { lat: f.lat, lon: f.lon } : null;
    } catch { return null; }
  };

  // Roadtrip multi-città (ondata 7): con 2+ destinazioni ogni città viene
  // geocodificata e inviata al server come tappa del viaggio [{city,lat,lon}];
  // la ripartizione dei giorni e i trasferimenti li calcola il server sulle
  // coordinate reali. null se una città non è risolvibile.
  const buildRoadtripLegs = async (
    activeDestinations: string[],
    firstCoords: { lat: number; lon: number } | null,
    silent = false
  ): Promise<Array<{ city: string; lat: number; lon: number }> | null> => {
    if (activeDestinations.length < 2) return null;
    // Distanza in linea d'aria tra due punti (km): usata solo come controllo
    // di plausibilità sul geocoding, non per i tempi di guida (calcolati dal
    // server con lo stesso fattore strada).
    const airKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const R = 6371, toRad = (x: number) => x * Math.PI / 180;
      const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const legs: Array<{ city: string; lat: number; lon: number }> = [];
    for (let i = 0; i < activeDestinations.length; i++) {
      const cityName = activeDestinations[i];
      // Coordinate curate degli itinerari speciali (cammini): vincono sul
      // geocoding, che sulle frazioni di tappa sbaglia facilmente.
      const preset = presetLegCoordsRef.current[cityName.trim().toLowerCase()];
      const c = i === 0 && firstCoords ? firstCoords : (preset || await geocodeCity(cityName));
      if (!c) {
        if (!silent) notify(`"${cityName}" — ${getTranslation('err_location_not_found', language)}`);
        return null;
      }
      // Un nome di città comune (es. un piccolo paese omonimo di una città
      // estera) può risolversi silenziosamente nel posto sbagliato: se la
      // tappa geocodificata dista più di 2500 km dalla precedente è quasi
      // certamente un errore di geocoding, non un roadtrip intercontinentale
      // reale — meglio fermarsi qui, a costo zero, che generare un itinerario
      // con una tappa nel continente sbagliato.
      const prev = legs[legs.length - 1];
      if (prev) {
        const dist = airKm(prev, c);
        if (dist > 2500) {
          if (!silent) notify(getTranslation('vr_b_city_far', language)
            .replace('{city}', cityName)
            .replace('{km}', String(Math.round(dist)))
            .replace('{from}', legs[0].city));
          return null;
        }
      }
      legs.push({ city: cityName.trim(), lat: c.lat, lon: c.lon });
    }
    return legs;
  };

  /** Giorni sempre entro [1, 30]: l'input numerico ignorava min/max e un "99"
   *  digitato a mano portava la conferma a 990 crediti. */
  const clampDays = (v: number) => Math.min(30, Math.max(1, Math.floor(v) || 1));

  /** Orario di fine successivo a quello di inizio (prima nessun vincolo). */
  const validateTimes = (): boolean => {
    if (startTime && endTime && endTime <= startTime) {
      notify(getTranslation('err_end_before_start', language));
      return false;
    }
    return true;
  };

  /** Raggio numerico valido: l'onFocus dell'input custom azzerava `radius` a
   *  stringa vuota, che diventava `NaN` → `null` nel JSON inviato al server. */
  const safeRadius = (): number => {
    const n = parseInt(radius, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(5000, n) : 300;
  };

  // ── Autocomplete destinazione: apertura, selezione e tastiera ──────────
  /** La tendina è aperta solo per il campo che ha il fuoco. */
  const isSuggestOpen = (idx: number) =>
    showSuggestions && focusedDestIdx === idx && (destinations[idx]?.trim().length >= 3);

  /** Applica un suggerimento al campo `idx` fissando anche le coordinate. */
  const pickSuggestion = (suggestion: any, idx: number) => {
    const name = suggestion.isMapbox
      ? String(suggestion.description || '').split(',')[0]
      : (suggestion.display_name || suggestion.description || suggestion.name || '');
    const newDests = [...destinations];
    newDests[idx] = name;
    setDestinations(newDests);
    // Solo il primo campo definisce la posizione di riferimento del viaggio.
    if (idx === 0 && suggestion.lat != null && suggestion.lon != null) {
      setDestCoords({ lat: suggestion.lat, lon: suggestion.lon, label: name });
    }
    setShowSuggestions(false);
    setFocusedDestIdx(null);
    setActiveSuggestIdx(-1);
  };

  /**
   * Navigazione da tastiera del combobox: prima non esisteva (né frecce, né
   * Invio, né Escape) e con un solo campo di testo sciolto premere Invio non
   * faceva assolutamente nulla.
   */
  const handleSuggestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, onSubmit?: () => void) => {
    if (!isSuggestOpen(idx) || suggestions.length === 0) {
      if (e.key === 'Escape') setShowSuggestions(false);
      // Con la tendina chiusa, Invio avvia l'azione principale della
      // modalità: prima non faceva assolutamente nulla (nessun <form>).
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault();
        e.currentTarget.blur();
        onSubmit();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestIdx(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickSuggestion(suggestions[activeSuggestIdx >= 0 ? activeSuggestIdx : 0], idx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
      setActiveSuggestIdx(-1);
    }
  };

  /**
   * Finestra date del viaggio ricavata dal mese scelto nel form: senza mese
   * non c'è finestra (e quindi NIENTE carte-evento nel mazzo). Se il mese è
   * già passato quest'anno si assume l'anno prossimo; se è quello corrente
   * si parte da oggi, così non si propongono eventi già conclusi.
   */
  const getTripDateWindow = (): { start: Date; end: Date } | null => {
    const idx = MONTH_VALUES.indexOf(mese as (typeof MONTH_VALUES)[number]);
    if (idx < 0) return null;
    const now = new Date();
    const year = idx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    const start = idx === now.getMonth() && year === now.getFullYear() ? now : new Date(year, idx, 1);
    const end = new Date(year, idx + 1, 0, 23, 59, 59);
    return end > start ? { start, end } : null;
  };

  /**
   * Carte-evento per il mazzo dello Swip: eventi REALI Ticketmaster attorno
   * alla destinazione e dentro la finestra del viaggio. Qualunque problema
   * (chiave assente, rete, zero eventi, date mancanti) restituisce [] e il
   * mazzo resta identico a oggi: zero regressioni.
   */
  const fetchSwipeEventCards = async (coords: { lat: number; lon: number } | null): Promise<any[]> => {
    try {
      const win = getTripDateWindow();
      if (!coords || !win) return [];
      // Stesso formato data di EventsScreen (ISO senza millisecondi).
      const startDateTime = win.start.toISOString().split('.')[0] + 'Z';
      const endDateTime = win.end.toISOString().split('.')[0] + 'Z';
      const res = await fetch(getApiUrl(`/api/ticketmaster?lat=${coords.lat}&lon=${coords.lon}&radius=50&startDateTime=${startDateTime}&endDateTime=${endDateTime}`));
      if (!res.ok) return [];
      const data = await res.json();
      const raw: any[] = data?._embedded?.events || [];
      const seen = new Set<string>();
      const cards: any[] = [];
      for (const item of raw) {
        const date = item?.dates?.start?.localDate || '';
        const nameKey = String(item?.name || '').toLowerCase().trim();
        // Servono nome, link e una DATA certa: senza data l'evento non è
        // fissabile come tappa a orario bloccato.
        if (!item?.id || !nameKey || !item?.url || !date || seen.has(nameKey)) continue;
        seen.add(nameKey);
        const venue = item?._embedded?.venues?.[0];
        const time = String(item?.dates?.start?.localTime || '').slice(0, 5);
        const desc = item.info || item.pleaseNote || item.classifications?.[0]?.segment?.name || 'Evento dal vivo';
        cards.push({
          _uid: `ev_${item.id}`,
          _isEvent: true,
          _eventDate: date,
          _eventTime: time,
          _eventVenue: venue?.name || '',
          titolo_tappa: item.name,
          tipo: 'evento',
          ora: time,
          attivita: venue?.name ? `${desc} — ${venue.name}` : desc,
          image_url: item.images?.[0]?.url || '',
          link_info: ensureAffiliateUrl(item.url),
          coordinate: {
            lat: Number(venue?.location?.latitude) || 0,
            lng: Number(venue?.location?.longitude) || 0
          }
        });
        if (cards.length >= MAX_EVENT_CARDS) break;
      }
      return cards;
    } catch {
      return [];
    }
  };

  const handleFetchCandidates = async () => {
    if (!destinations[0] || destinations[0].trim().length < 3) {
      notify(getTranslation('err_valid_destination', language));
      return;
    }
    const coords = await resolveDestCoords();
    // Guardia INCONDIZIONATA: il geocoding è server-side (/api/geocode, che usa
    // anche MAPBOX_TOKEN non-VITE). Legarla a VITE_MAPBOX_TOKEN significava che
    // un build senza quella variabile client generava senza lat/lon, senza
    // ancora geografica e senza verifica anti-allucinazione (20 crediti per un
    // itinerario nella città sbagliata).
    if (!coords) {
      alertDestNotFound();
      return;
    }
    setCandidatesLoading(true);
    setPlannerMode('tinder_swipe');
    setCandidates([]);
    setLikedCandidates([]);
    setCurrentCardIdx(0);
    setSwipeHistory([]);
    setSwipeDir(null);
    setBrokenImages({});
    setExpandedCard(null);
    try {
      // Le carte-evento si caricano IN PARALLELO ai candidati: non allungano
      // l'attesa e se falliscono il mazzo resta quello di sempre.
      const eventCardsPromise = fetchSwipeEventCards(coords);
      // getApiUrl come sopra: su nativo il path relativo non raggiunge l'API
      // e il mazzo di carte "tinder" restava vuoto.
      const res = await apiFetch(getApiUrl('/api/groq/candidates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destinations[0],
          ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
          days: clampDays(days),
          categories: tinderSelectedCategories,
          includeEvents,
          includeTours,
          soloGratis,
          language
        })
      }, 120000);
      const data = await res.json();
      if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
        // Id stabile e univoco per ogni carta: il render usava
        // `id_tappa || titolo_tappa` come key React e due attrazioni omonime
        // senza id facevano riusare il nodo sbagliato durante l'animazione.
        const baseDeck = data.candidates.map((c: any, i: number) => ({
          ...c,
          _uid: c.id_tappa ? `c_${c.id_tappa}` : `c_${i}_${String(c.titolo_tappa || '').slice(0, 24)}`
        }));
        // Mescola fino a 5 eventi reali nel mazzo: mai in prima posizione,
        // circa uno ogni 4 carte, senza mai sostituire le attrazioni.
        const eventCards = await eventCardsPromise;
        eventCards.forEach((ev: any, i: number) => {
          baseDeck.splice(Math.min(2 + i * 4, baseDeck.length), 0, ev);
        });
        setCandidates(baseDeck);
      } else {
        notify(getTranslation('no_attractions_found', language));
        setPlannerMode('tinder_form');
      }
    } catch (err) {
      console.error(err);
      notify(getTranslation('err_candidates', language));
      setPlannerMode('tinder_form');
    } finally {
      setCandidatesLoading(false);
    }
  };

  /**
   * Unico punto di verità per lo swipe (bottoni e gesto drag).
   *
   * Prima ogni bottone schedulava direttamente un setTimeout(300ms) leggendo
   * `currentCardIdx` dalla closure: due tap ravvicinati programmavano due
   * callback con lo STESSO indice, così la carta finiva due volte nei like e
   * l'indice avanzava di 2 (una carta mai mostrata). La guardia su `swipeDir`
   * blocca il secondo tap finché l'animazione è in corso.
   */
  const commitSwipe = useCallback((liked: boolean) => {
    if (swipeDir) return;
    const idx = currentCardIdx;
    const card = candidates[idx];
    if (!card) return;
    setSwipeDir(liked ? 'right' : 'left');
    setTimeout(() => {
      if (liked) setLikedCandidates(prev => [...prev, card]);
      setSwipeHistory(prev => [...prev, { idx, liked }]);
      setCurrentCardIdx(i => i + 1);
      setSwipeDir(null);
    }, 300);
  }, [swipeDir, currentCardIdx, candidates]);

  // ── Quota gratuita sostituzioni (3 per ogni giorno dell'itinerario) ────
  /** Quante gratuite sono già state usate su quel giorno. */
  const getFreeReplacementsUsed = (dayKey: string): number => {
    const map = (generatedPlan as any)?.free_replacements;
    const n = map?.[dayKey];
    return Number.isFinite(n) ? Number(n) : 0;
  };

  /** Gratuite ancora disponibili sul giorno (usata anche dalla UI). */
  const freeReplacementsLeft = (dayNum: number | string): number =>
    Math.max(0, FREE_REPLACEMENTS_PER_DAY - getFreeReplacementsUsed(String(dayNum)));

  /** Giorno a cui appartiene una tappa, quando il chiamante non lo passa. */
  const findGiornoOfTappa = (tappaId: string): number | null => {
    const giorni = (generatedPlan as any)?.giorni;
    if (!Array.isArray(giorni)) return null;
    for (const g of giorni) {
      if ((g?.tappe || []).some((t: any) => t?.id_tappa === tappaId)) return g.giorno;
    }
    return null;
  };

  /** Candidati non ancora selezionati, usati come alternative in revisione.
   *  Prima lo stesso filtro veniva ricalcolato due volte per ogni tappa. */
  const availableAlternatives = candidates.filter(
    alt => !likedCandidates.some(lc => (lc._uid || lc.id_tappa || lc.titolo_tappa) === (alt._uid || alt.id_tappa || alt.titolo_tappa))
  );

  /** Annulla l'ultimo swipe (il gesto lo implica, ma non esisteva). */
  const undoSwipe = useCallback(() => {
    if (swipeDir) return;
    setSwipeHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.liked) {
        const card = candidates[last.idx];
        const key = card?._uid;
        setLikedCandidates(likes => {
          // Rimuove solo l'ULTIMA occorrenza, non tutte le omonime.
          const pos = key
            ? likes.map(l => l._uid).lastIndexOf(key)
            : likes.length - 1;
          return pos >= 0 ? likes.filter((_, i) => i !== pos) : likes;
        });
      }
      setCurrentCardIdx(last.idx);
      return prev.slice(0, -1);
    });
  }, [swipeDir, candidates]);

  const handleGenerateTinderItinerary = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    if (likedCandidates.length === 0) {
      notify(getTranslation('err_no_liked', language));
      return;
    }

    // Coordinate certe PRIMA di addebitare: se la località non esiste ci si
    // ferma qui, senza consumare crediti.
    const coords = await resolveDestCoords();
    // Guardia INCONDIZIONATA: il geocoding è server-side (/api/geocode, che usa
    // anche MAPBOX_TOKEN non-VITE). Legarla a VITE_MAPBOX_TOKEN significava che
    // un build senza quella variabile client generava senza lat/lon, senza
    // ancora geografica e senza verifica anti-allucinazione (20 crediti per un
    // itinerario nella città sbagliata).
    if (!coords) {
      alertDestNotFound();
      return;
    }

    // Stesso addebito degli altri percorsi di generazione (saldo + conferma + consumo)
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = clampDays(days);
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
      return;
    }
    // Addebito SERVER-SIDE (14/08/2026): /api/groq/itinerary-stream pre-addebita
    // e fa il conguaglio sui giorni consegnati. Il gate di saldo qui sotto è solo
    // UX anticipata ("crediti insufficienti" senza round-trip); il server
    // rifiuta comunque con INSUFFICIENT_CREDITS se il saldo non basta.
    if (bal.total < totalItineraryCost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    setActiveQuizLength(7);
    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    setPlannerMode('view');
    try {
      // Prima si inviava solo `titolo_tappa`: coordinate, tipo e soprattutto
      // il link affiliato delle esperienze Viator/GYG/Ticketmaster aggiunte
      // con "+" andavano persi, e con loro la commissione.
      // Le carte-evento con data certa NON passano tra i POI liberi: diventano
      // tappe BLOCCATE a orario fisso (il server le mantiene identiche e ci
      // costruisce attorno il resto dell'itinerario).
      const likedEvents = likedCandidates.filter(c => c._isEvent && c._eventDate);
      const likedPlaces = likedCandidates.filter(c => !(c._isEvent && c._eventDate));
      const eventLockedStops = likedEvents.map(ev => ({
        titolo_tappa: ev.titolo_tappa,
        tipo: 'evento',
        data: ev._eventDate,
        ora: ev._eventTime || '',
        attivita: `Evento con biglietto${ev._eventVenue ? ` presso ${ev._eventVenue}` : ''}: tappa fissa, non spostabile.`,
        ...(ev.link_info ? { link_info: ev.link_info } : {})
      }));
      // Ridondanza voluta: oltre a lockedStops, la frase esplicita in
      // linguaggio naturale àncora data e orario dell'evento nel prompt.
      const eventRequests = likedEvents.map(ev =>
        `Il giorno ${ev._eventDate}${ev._eventTime ? ` alle ore ${ev._eventTime}` : ''} l'utente ha il biglietto per "${ev.titolo_tappa}"${ev._eventVenue ? ` a ${ev._eventVenue}` : ''}: fissa questa tappa in quel giorno e a quell'orario.`
      ).join(' ');
      const poisList = likedPlaces.map(c => c.titolo_tappa);
      const poisDetailed = likedPlaces.map(c => ({
        nome: c.titolo_tappa,
        tipo: c.tipo || 'attrazione',
        descrizione: c.attivita || '',
        ...(Number.isFinite(Number(c?.coordinate?.lat)) && Number(c?.coordinate?.lat) !== 0
          ? { lat: Number(c.coordinate.lat), lon: Number(c.coordinate.lng ?? c.coordinate.lon) }
          : {}),
        ...(c.link_info ? { link_info: c.link_info } : {})
      }));
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: destinations[0],
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        days: numDaysForPricing,
        interests: selectedInterests.length > 0 ? selectedInterests : ['generale'],
        pois: poisList,
        poisDetailed,
        lockedStops: eventLockedStops,
        specialRequests: [
          specialRequests || 'Usa rigorosamente le attrazioni selezionate per strutturare le tappe principali.',
          eventRequests
        ].filter(Boolean).join(' '),
        ...(mese ? { mese } : {}),
        includeEvents,
        includeTours,
        soloGratis,
        budget,
        viaggiatori,
        ritmo,
        guida,
        radius: safeRadius(),
        language,
        // Quota per-utente (non più per-IP): vedi handleRegenerateWithLocks.
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });

      if (data && data.giorni) {
        // Reinnesta i link affiliato che il modello non riporta nel JSON:
        // il match è sul titolo della tappa, senza toccare il resto.
        const linkByName = new Map(
          likedCandidates.filter(c => c.link_info).map(c => [String(c.titolo_tappa || '').toLowerCase().trim(), c.link_info])
        );
        if (linkByName.size > 0 && Array.isArray(data.giorni)) {
          for (const g of data.giorni) {
            for (const t of (g.tappe || [])) {
              const hit = linkByName.get(String(t.titolo_tappa || '').toLowerCase().trim());
              if (hit && !t.link_info) t.link_info = hit;
            }
          }
        }
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        setPlannerMode('view');
        notifyCreditsChanged({ userId: currentUserId }); // addebito/conguaglio server-side: si riallinea il saldo
      } else {
        // Nessun itinerario valido: il rimborso è server-side.
        notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
        setPlannerMode('tinder_review');
      }
    } catch (err) {
      console.error(err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
      if ((err as any)?.code === 'INSUFFICIENT_CREDITS') setShowShop(true);
      setPlannerMode('tinder_review');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromFavorites = async () => {
    if (loading) return; // anti doppio-click: doppio addebito
    if (selectedFavoriteIds.length === 0) { notify(getTranslation('err_no_favorites', language)); return; }
    if (!validateTimes()) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    // I POI vanno risolti PRIMA del prezzo: questo form non ha un selettore
    // giorni, e il costo veniva calcolato su `days` (ereditato dalle altre
    // modalità, default 2) mentre il server ne generava ceil(nPoi/3). Il
    // modale annunciava quindi un numero di giorni che non c'entrava nulla
    // con l'itinerario prodotto.
    const allPois = [...itinerary.map(p => ({ id: p.id, poi: p })), ...savedPois.map(s => ({ id: s.poi_id || s.id, poi: s.data || s }))]
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i); // Deduplicate

    const selectedPoiObjs = allPois.filter(s => selectedFavoriteIds.includes(s.id));
    const selectedPoisFull = selectedPoiObjs.map(s => {
      const lat = s.poi.lat || s.poi.location?.lat || 0;
      const lon = s.poi.lon || s.poi.location?.lng || 0;
      return `${s.poi.name || s.poi.title} (Coordinate: ${lat}, ${lon}) - ${s.poi.description || s.poi.editorial_summary?.overview || s.poi.attivita || ""}`;
    });

    const effectiveDays = clampDays(Math.ceil(selectedPoisFull.length / 3) || 1);

    // Ancoraggio geografico: la destinazione era la stringa fissa "Tappe
    // Selezionate", quindi il modello non aveva nessun riferimento di zona.
    // Passiamo il centroide dei preferiti scelti e un nome di località reale.
    const coordsList = selectedPoiObjs
      .map(s => ({ lat: Number(s.poi.lat ?? s.poi.location?.lat), lon: Number(s.poi.lon ?? s.poi.location?.lng) }))
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon) && (c.lat !== 0 || c.lon !== 0));
    const centroid = coordsList.length
      ? { lat: coordsList.reduce((a, c) => a + c.lat, 0) / coordsList.length,
          lon: coordsList.reduce((a, c) => a + c.lon, 0) / coordsList.length }
      : null;
    const anchorName = selectedPoiObjs[0]?.poi?.city || selectedPoiObjs[0]?.poi?.comune
      || selectedPoiObjs[0]?.poi?.name || selectedPoiObjs[0]?.poi?.title || "Tappe Selezionate";

    // Controllo di prossimità: si potevano selezionare Palermo e Bolzano
    // nello stesso itinerario di un giorno e l'AI produceva un piano
    // geograficamente impossibile — pagato per intero. Qui si avvisa PRIMA
    // dell'addebito, lasciando comunque la scelta all'utente.
    if (centroid && coordsList.length > 1) {
      const maxKm = Math.max(...coordsList.map(c => haversineKm(centroid.lat, centroid.lon, c.lat, c.lon)));
      if (maxKm > MAX_FAVORITES_SPREAD_KM) {
        const proceed = window.confirm(
          `${getTranslation('warn_favorites_spread', language)} (~${Math.round(maxKm)} km).\n\n${getTranslation('warn_continue_anyway', language)}`
        );
        if (!proceed) return;
      }
    }

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const numDaysForPricing = effectiveDays;
    // 10 crediti/giorno per la pianificazione; le audioguide si pagano a
    // parte (per luogo a prezzo pieno, oppure Day Pass 24h).
    const totalItineraryCost = PRICING_LIST.itinerary_daily * numDaysForPricing;
    const confirmed = await creditConfirm.requestConfirmation(totalItineraryCost, "Itinerario AI PRO (" + numDaysForPricing + " giorni)", bal.total);
    if (!confirmed) {
       return;
    }
    // Addebito SERVER-SIDE (14/08/2026): /api/groq/itinerary-stream pre-addebita
    // e fa il conguaglio sui giorni consegnati. Il gate di saldo qui sotto è solo
    // UX anticipata ("crediti insufficienti" senza round-trip); il server
    // rifiuta comunque con INSUFFICIENT_CREDITS se il saldo non basta.
    if (bal.total < totalItineraryCost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    setActiveQuizLength(7);
    setLoading(true);
    setLockedStops({});
    setExpandedStops({});
    setPlannerMode('view');
    try {
      const data = await processItineraryStream('/api/groq/itinerary-stream', {
        destination: anchorName,
        ...(centroid ? { lat: centroid.lat, lon: centroid.lon } : {}),
        days: effectiveDays,
        startTime,
        endTime,
        specialRequests,
        includeEvents,
        includeTours,
        soloGratis,
        budget,
        viaggiatori,
        ritmo,
        guida,
        mese,
        pois: selectedPoisFull,
        // Coordinate strutturate per l'ottimizzazione del percorso server-side
        // (nearest-neighbour + giorni compatti): la stringa di selectedPoisFull
        // non è parsabile in modo affidabile.
        poisDetailed: selectedPoiObjs.map(s => ({
          nome: s.poi.name || s.poi.title,
          lat: Number(s.poi.lat ?? s.poi.location?.lat),
          lon: Number(s.poi.lon ?? s.poi.location?.lng)
        })),
        radius: safeRadius(),
        language,
        // Quota per-utente (non più per-IP): vedi handleRegenerateWithLocks.
        userId: currentUserId
      }, (partialData) => {
        setGeneratedPlan(partialData);
      });

      if (data && data.giorni) {
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        setPlannerMode('view');
        // Il prezzo è già allineato a ceil(tappe/3); il conguaglio copre il
        // caso in cui l'AI restituisca meno giorni di quelli richiesti.
        notifyCreditsChanged({ userId: currentUserId }); // addebito/conguaglio server-side: si riallinea il saldo
      } else {
         // Nessun itinerario valido: il rimborso è server-side.
         notifyCreditsChanged({ userId: currentUserId });
         notify(getTranslation('err_generation_refunded', language));
         setPlannerMode('form_b');
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
      if ((err as any)?.code === 'INSUFFICIENT_CREDITS') setShowShop(true);
      setPlannerMode('form_b');
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
          // Le tappe "trasferimento" (roadtrip, ondata 7) hanno le coordinate
          // del centro della città di arrivo: non sono luoghi visitabili e non
          // devono diventare POI in shared_pois.
          .filter(t => String((t as any).tipo || '').toLowerCase() !== 'trasferimento')
          .filter(t => t.coordinate && t.coordinate.lat !== 0)
          .map(tappa => {
            const lat = parseFloat(String(tappa.coordinate.lat));
            const lon = parseFloat(String(tappa.coordinate.lng || (tappa.coordinate as any).lon));
            const poiId = tappa.id_tappa && !tappa.id_tappa.startsWith('custom-')
              ? tappa.id_tappa
              : `ai_${lat.toFixed(5)}_${lon.toFixed(5)}`.replace(/\./g, '_');

            const descriptionFull = tappa.attivita || "";
            const descLong = descriptionFull;

            return {
              id: poiId,
              lat,
              lon,
              name: tappa.titolo_tappa,
              city: cityFromPlan,
              category: mapItineraryCategoryToMapCategory(tappa.tipo || "monumenti"),
              // SOLO description_ai (27/08/2026), non description_short/long:
              // quei due campi sono il segnale che /api/poi/enrich legge per
              // decidere se il POI è "già arricchito" (existing.description_short,
              // server.ts) — riempirli subito con la prosa AI non verificata
              // faceva SALTARE per sempre la vera messa a terra su Wikipedia,
              // anche quando esiste. description_ai resta per la UI (che fa
              // fallback su di lei finché description_long non arriva).
              description_ai: descLong + (tappa.consiglio_guida ? "\n\n💡 " + tappa.consiglio_guida : ""),
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
                  // Bearer automatico: lo userId lo prende dal token, non dal body.
                  await apiFetch(getApiUrl('/api/poi/enrich'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...poi, lang: language, fast: false, mode: 'full' })
                  }, 30000);
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

      // NIENTE upsert in shared_itinerary_cache da qui: il piano personale
      // (con id utente, modifiche a mano, richieste speciali, alloggio) non è
      // un itinerario condivisibile. La scrittura legittima nella cache
      // condivisa avviene solo in handleGenerate, con la chiave parametrica
      // e solo quando cacheUsable è vero.

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
        // I podcast già pagati vanno salvati offline: senza, riaprendo da
        // "Itinerari Offline" la cache era vuota e il bottone tornava a
        // "Podcast" (15 crediti) invece di "Riascolta". Il merge esisteva solo
        // in savePlanToSupabase.
        podcast_cache: { ...(generatedPlan as any).podcast_cache, ...podcastCache },
        data_salvataggio: new Date().toISOString(),
        citta: generatedPlan.titolo || 'Città Personalizzata',
        descrizione: `Itinerario di ${generatedPlan.giorni.length} giorni con ${generatedPlan.giorni.reduce((acc, g) => acc + g.tappe.length, 0)} tappe.`
      };

      // Id offline stabile: prima derivava dal solo titolo → due "Weekend a
      // Roma" si sovrascrivevano. Includiamo l'id del piano se presente.
      const titleSlug = (generatedPlan.titolo || 'itinerario').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const id = generatedPlan.id ? `${titleSlug}_${String(generatedPlan.id).slice(0, 8)}` : titleSlug;
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

  const handleReplaceTappa = async (tappaId: string, giornoNum?: number) => {
    if (!generatedPlan) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    // ── Quota gratuita: FREE_REPLACEMENTS_PER_DAY sostituzioni per ogni
    // giorno dell'itinerario. Il contatore vive dentro il piano (come
    // podcast_cache), quindi viene salvato su Supabase e sopravvive al
    // ricaricamento e al cambio dispositivo.
    const dayKey = String(giornoNum ?? findGiornoOfTappa(tappaId) ?? 1);
    const usedFree = getFreeReplacementsUsed(dayKey);
    const isFree = usedFree < FREE_REPLACEMENTS_PER_DAY;

    let replaceCost = 0;
    if (!isFree) {
      const bal = await getWalletBalance(currentUserId);
      setCurrentBalance(bal.total);
      // Costo per la sostituzione di una singola tappa (non l'intero itinerario).
      // Voce intera dedicata: `audio_guide * 0.5` produceva 7,5 crediti.
      replaceCost = PRICING_LIST.replace_stop;
      const confirmed = await creditConfirm.requestConfirmation(
        replaceCost,
        `${getTranslation('replace_action', language)} — ${getTranslation('day', language)} ${dayKey}`,
        bal.total
      );
      if (!confirmed) {
         return;
      }
      // Addebito SERVER-SIDE: /api/groq/replace verifica il token, scala i
      // crediti (se la sostituzione non è gratuita) e li restituisce se non
      // consegna. Il gate di saldo qui sotto è solo UX anticipata.
      if (bal.total < replaceCost) {
        notify(getTranslation('err_insufficient_credits', language));
        setShowShop(true);
        return;
      }
    }

    // Spinner LOCALE sulla tappa: setLoading(true) riapriva il quiz a tutto
    // schermo per una sostituzione di pochi secondi.
    if (replacingId) return; // anti doppio-click: doppio addebito
    setReplacingId(tappaId);
    try {
      const token = sessionData?.session?.access_token;
      const res = await fetch(getApiUrl('/api/groq/replace'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentItinerary: generatedPlan,
          tappaId,
          // Il server decide l'addebito: entro la quota gratuita del giorno
          // non scala nulla (stesso contatore free_replacements del piano).
          isFree,
          giornoNum: Number(dayKey),
          language
        })
      });
      if (!res.ok) throw await planErrorFromResponse(res);
      const data = await res.json();
      if (data?.error && PLAN_ERROR_KEYS[data.error]) throw new PlanError(data.error);
      if (data.giorni) {
        // Il contatore delle gratuite si incrementa SOLO a sostituzione
        // riuscita, e viaggia dentro il piano salvato.
        if (isFree) {
          data.free_replacements = {
            ...(generatedPlan as any).free_replacements,
            [dayKey]: usedFree + 1
          };
          const left = FREE_REPLACEMENTS_PER_DAY - (usedFree + 1);
          notify(
            `${getTranslation('free_replacement_done', language)} — ${left}/${FREE_REPLACEMENTS_PER_DAY} ${getTranslation('remaining_today', language)}`,
            'success'
          );
        } else {
          data.free_replacements = (generatedPlan as any).free_replacements;
        }
        setGeneratedPlan(data);
        savePlanToSupabase(data);
        // L'addebito (solo a pagamento) è già avvenuto sul server: qui si
        // riallinea il saldo mostrato.
        if (replaceCost > 0) notifyCreditsChanged({ userId: currentUserId });
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
        // Nessuna sostituzione valida: il server ha già restituito i crediti
        // (una gratuita fallita non consuma la quota, gestita sopra).
        if (replaceCost > 0) notifyCreditsChanged({ userId: currentUserId });
        notify(getTranslation('err_generation_refunded', language));
      }
    } catch (err) {
      console.error("Replace error:", err);
      if (replaceCost > 0) notifyCreditsChanged({ userId: currentUserId });
      notify(describePlanError(err, language), 'error');
      if ((err as any)?.code === 'INSUFFICIENT_CREDITS') setShowShop(true);
    } finally {
      setReplacingId(null);
    }
  };

  const handleAddTappa = (giornoIdx: number) => {
    if (!generatedPlan || !newStop.titolo_tappa || !newStop.ora) {
      notify(getTranslation('err_stop_required_fields', language));
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

  // ── "➕ Aggiungi un giorno" / "➕ Tappa vicina" (gita fuori porta) ──────
  // Estende un itinerario ESISTENTE e già salvato via /api/itinerary/extend
  // (server-side: pre-addebito pieno + conguaglio automatico a metà prezzo
  // se il giorno viene servito dalla cache della Libreria).
  const [extendPanelMode, setExtendPanelMode] = useState<'closed' | 'day' | 'nearby'>('closed');
  const [extendTheme, setExtendTheme] = useState<string>(''); // '' = "Sorprendimi"
  const [extendNearbyQuery, setExtendNearbyQuery] = useState('');
  const [extendNearbySuggestions, setExtendNearbySuggestions] = useState<any[]>([]);
  const [extendNearbyPicked, setExtendNearbyPicked] = useState<{ description: string; lat: number; lon: number } | null>(null);
  const [extendNearbySearching, setExtendNearbySearching] = useState(false);
  const [extendLoading, setExtendLoading] = useState(false);
  // Dismiss del quiz durante l'attesa di "Aggiungi un giorno"/"Gita fuori
  // porta" (separato da quizDismissed della generazione principale, così
  // chiudere l'uno non nasconde l'altro se capitano in momenti diversi).
  const [extendQuizDismissed, setExtendQuizDismissed] = useState(false);

  // Stesso pattern debounced di /api/geocode già usato per il campo
  // destinazione principale (vedi l'useEffect su `destinations`/`focusedDestIdx`
  // più sopra): qui è scoped al solo pannello "tappa vicina", per non
  // interferire con lo stato del roadtrip multi-città.
  useEffect(() => {
    if (extendPanelMode !== 'nearby' || extendNearbyPicked || extendNearbyQuery.trim().length < 3) {
      setExtendNearbySuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setExtendNearbySearching(true);
      try {
        const res = await fetch(getApiUrl(`/api/geocode?q=${encodeURIComponent(extendNearbyQuery)}&lang=${language.toLowerCase()}&limit=5`));
        if (res.ok) {
          const data = await res.json();
          setExtendNearbySuggestions(Array.isArray(data.features) ? data.features : []);
        }
      } catch (e) {
        console.error('Extend nearby geocode error:', e);
      } finally {
        setExtendNearbySearching(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [extendNearbyQuery, extendPanelMode, extendNearbyPicked, language]);

  const handleExtendItinerary = async (mode: 'day' | 'nearby') => {
    if (!generatedPlan?.id) return;
    if (mode === 'nearby' && !extendNearbyPicked) {
      notify(getTranslation('choose_destination_first', language), 'error');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (!currentUserId) {
      notify(getTranslation('login_to_continue', language), 'error');
      return;
    }

    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const cost = PRICING_LIST.extend_itinerary_day;
    const themeKey = EXTEND_DAY_THEMES.find(t => t.id === extendTheme)?.labelKey;
    const label = mode === 'day'
      ? `${getTranslation('vr_b_add_day_label', language)}${extendTheme ? ` — ${themeKey ? getTranslation(themeKey, language) : extendTheme}` : ''}`
      : `${getTranslation('vr_b_day_trip_label', language)} — ${extendNearbyPicked?.description || extendNearbyQuery}`;
    const confirmed = await creditConfirm.requestConfirmation(cost, label, bal.total);
    if (!confirmed) return;
    if (bal.total < cost) {
      notify(getTranslation('err_insufficient_credits', language));
      setShowShop(true);
      return;
    }

    setExtendLoading(true);
    setExtendQuizDismissed(false);
    try {
      const token = sessionData?.session?.access_token;
      const res = await fetch(getApiUrl('/api/itinerary/extend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          itineraryId: generatedPlan.id,
          mode,
          theme: extendTheme || 'sorprendimi',
          language,
          ...(mode === 'nearby' ? {
            city: extendNearbyPicked?.description || extendNearbyQuery,
            lat: extendNearbyPicked?.lat,
            lon: extendNearbyPicked?.lon,
          } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data?.giorno) {
        const newPlan = {
          ...generatedPlan,
          giorni: [...generatedPlan.giorni, data.giorno],
          totale_viaggio: data.totale_viaggio || (generatedPlan as any).totale_viaggio,
        };
        setGeneratedPlan(newPlan);
        // Stesso salvataggio incrementale delle altre modifiche: oltre a
        // ri-scrivere user_itineraries (il server l'ha già fatto), aggiorna
        // shared_pois/enrichment e la copia idb offline per le nuove tappe.
        savePlanToSupabase(newPlan);
        notifyCreditsChanged({ userId: currentUserId });
        notify(data.cached ? getTranslation('vr_b_day_added_cached', language) : getTranslation('vr_b_day_added', language), 'success');
        setExtendPanelMode('closed');
        setExtendTheme('');
        setExtendNearbyQuery('');
        setExtendNearbyPicked(null);
      } else {
        // Fallimento: il server ha già rimborsato server-side.
        notifyCreditsChanged({ userId: currentUserId });
        notify(data?.message || getTranslation('err_generation_refunded', language), 'error');
      }
    } catch (err) {
      console.error('Extend itinerary error:', err);
      notifyCreditsChanged({ userId: currentUserId });
      notify(getTranslation('err_generation_refunded', language), 'error');
    } finally {
      setExtendLoading(false);
    }
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

    const category = mapItineraryCategoryToMapCategory(tappa.tipo || 'monumenti');
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
        status: 'auto',
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

  /**
   * Select dei mesi condivisa dalle 3 modalità che la mostrano. Prima erano
   * tre blocchi identici con le opzioni scritte a mano in italiano, servite
   * così com'erano anche a chi usava FR/ES/RU/ZH.
   */
  const renderMonthSelect = (focusRing = 'focus:ring-primary/20') => (
    <div className="space-y-3">
      <label htmlFor="wip-month" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">
        {getTranslation('period_month', language)}
      </label>
      <select
        id="wip-month"
        value={mese}
        onChange={(e) => setMese(e.target.value)}
        className={`w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm ${focusRing} focus:ring-2 outline-none font-bold text-on-surface text-sm appearance-none`}
      >
        <option value="">{getTranslation('month_any', language)}</option>
        {MONTH_VALUES.map((m, i) => (
          <option key={m} value={m}>{getTranslation(`month_${i + 1}`, language)}</option>
        ))}
      </select>
    </div>
  );

  /**
   * Fascia oraria condivisa. Il vincolo fine > inizio non esisteva: si poteva
   * chiedere un itinerario dalle 20:00 alle 09:00 e il segnale d'errore
   * arrivava solo (se arrivava) dal modello.
   */
  const renderTimeRange = () => {
    const invalid = !!startTime && !!endTime && endTime <= startTime;
    return (
      <div className="space-y-1">
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <label htmlFor="wip-start-time" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("start_time", language)}</label>
            <input
              id="wip-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`w-full px-4 py-4 bg-white rounded-2xl border shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm ${invalid ? 'border-red-300' : 'border-outline-variant/10'}`}
            />
          </div>
          <div className="flex-1 space-y-3">
            <label htmlFor="wip-end-time" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("end_time", language)}</label>
            <input
              id="wip-end-time"
              type="time"
              value={endTime}
              aria-invalid={invalid}
              onChange={(e) => setEndTime(e.target.value)}
              className={`w-full px-4 py-4 bg-white rounded-2xl border shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm ${invalid ? 'border-red-300' : 'border-outline-variant/10'}`}
            />
          </div>
        </div>
        {invalid && (
          <p className="text-[11px] font-bold text-red-600 pl-1 pt-1" aria-live="polite">
            {getTranslation('err_end_before_start', language)}
          </p>
        )}
      </div>
    );
  };

  /**
   * Esperienze partner mostrate durante lo Swip. Era lo stesso blocco di ~85
   * righe copiato in `tinder_swipe` e in `tinder_review`, con due variabili
   * `lat`/`lon` calcolate e mai usate.
   *
   * `PREMIUM_DAY_SLOT` è lo slot fittizio usato per la fase di selezione, che
   * non ha ancora giorni veri.
   */
  const renderPremiumExperiences = () => {
    if (!includeTours) return null;
    const addLiked = (exp: any, tipo: 'esperienza' | 'evento') => {
      setLikedCandidates(prev => [...prev, {
        _uid: `x_${tipo}_${prev.length}_${String(exp.name || '').slice(0, 24)}`,
        titolo_tappa: exp.name,
        attivita: (tipo === 'evento' ? exp.venue : exp.description) || exp.name,
        tipo,
        link_info: ensureAffiliateUrl(exp.url),
        coordinate: { lat: exp.lat || 0, lng: exp.lon || 0 }
      }]);
      notify(getTranslation(tipo === 'evento' ? 'event_added' : 'experience_added', language), 'success');
    };
    return (
      <div className="mt-8 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-black text-primary uppercase tracking-widest">{getTranslation('premium_experiences', language)}</h3>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => loadViatorForDay(PREMIUM_DAY_SLOT)}
            className="flex-1 p-3 min-h-[44px] bg-orange-50 border border-orange-100 rounded-xl text-[10px] font-black text-[#FF5100] uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {viatorLoadingDay === PREMIUM_DAY_SLOT ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />} Viator
          </button>
          <button
            type="button"
            onClick={() => loadGygForDay(PREMIUM_DAY_SLOT)}
            className="flex-1 p-3 min-h-[44px] bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-black text-blue-700 uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {gygLoadingDay === PREMIUM_DAY_SLOT ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />} GetYourGuide
          </button>
          <button
            type="button"
            onClick={() => loadTicketmasterForDay(PREMIUM_DAY_SLOT)}
            className="flex-1 p-3 min-h-[44px] bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {ticketmasterLoadingDay === PREMIUM_DAY_SLOT ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />} Ticketmaster
          </button>
          <button
            type="button"
            onClick={() => loadTiqetsForDay(PREMIUM_DAY_SLOT)}
            className="flex-1 p-3 min-h-[44px] bg-violet-50 border border-violet-100 rounded-xl text-[10px] font-black text-violet-700 uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {tiqetsLoadingDay === PREMIUM_DAY_SLOT ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />} Tiqets
          </button>
        </div>

        <AnimatePresence>
          {viatorExpandedDay === PREMIUM_DAY_SLOT && (
            <div className="space-y-3">
              {viatorByDay[PREMIUM_DAY_SLOT]?.map((exp: any, eIdx: number) => (
                <ExperienceCard key={eIdx} exp={exp} color="#FF5100" onAdd={() => addLiked(exp, 'esperienza')} />
              ))}
            </div>
          )}
          {gygExpandedDay === PREMIUM_DAY_SLOT && (
            <div className="space-y-3">
              {gygByDay[PREMIUM_DAY_SLOT]?.map((exp: any, eIdx: number) => (
                <ExperienceCard key={eIdx} exp={exp} color="#0071eb" onAdd={() => addLiked(exp, 'esperienza')} />
              ))}
            </div>
          )}
          {ticketmasterExpandedDay === PREMIUM_DAY_SLOT && (
            <div className="space-y-3">
              {ticketmasterByDay[PREMIUM_DAY_SLOT]?.map((exp: any, eIdx: number) => (
                <ExperienceCard key={eIdx} exp={exp} color="#1e3a8a" onAdd={() => addLiked(exp, 'evento')} />
              ))}
            </div>
          )}
          {tiqetsExpandedDay === PREMIUM_DAY_SLOT && (
            <div className="space-y-3">
              {tiqetsByDay[PREMIUM_DAY_SLOT]?.map((exp: any, eIdx: number) => (
                <ExperienceCard key={eIdx} exp={exp} color="#7c3aed" onAdd={() => addLiked(exp, 'esperienza')} />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderAdvancedSettings = () => (
    <>
      <div className="space-y-2 pt-2">
        <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
          <input type="checkbox" checked={includeEvents} onChange={e => setIncludeEvents(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary">🎵 {getTranslation('include_events', language)}</span>
            <span className="text-xs text-gray-600">{getTranslation('include_events_desc', language)}</span>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
          <input type="checkbox" checked={includeTours} onChange={e => setIncludeTours(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary">🗺️ {getTranslation('include_tours', language)}</span>
            <span className="text-xs text-gray-600">{getTranslation('include_tours_desc', language)}</span>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer bg-[#F8FAFC] p-4 rounded-2xl border border-outline-variant/10 hover:border-blue-200 transition-colors">
          <input type="checkbox" checked={soloGratis} onChange={e => setSoloGratis(e.target.checked)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary">🆓 {getTranslation('free_only', language)}</span>
            <span className="text-xs text-gray-600">{getTranslation('free_only_desc', language)}</span>
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
                <label htmlFor="wip-budget" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('budget_label', language)}</label>
                <select
                  id="wip-budget"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="economico">{getTranslation('budget_economico', language)}</option>
                  <option value="standard">{getTranslation('budget_standard', language)}</option>
                  <option value="lusso">{getTranslation('budget_lusso', language)}</option>
                </select>
              </div>
              <div className="flex-1 space-y-3">
                <label htmlFor="wip-travelers" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('travelers_label', language)}</label>
                <select
                  id="wip-travelers"
                  value={viaggiatori}
                  onChange={(e) => setViaggiatori(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="solo">{getTranslation('travelers_solo', language)}</option>
                  <option value="coppia">{getTranslation('travelers_coppia', language)}</option>
                  <option value="famiglia">{getTranslation('travelers_famiglia', language)}</option>
                  <option value="gruppo">{getTranslation('travelers_gruppo', language)}</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <label htmlFor="wip-pace" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('pace_label', language)}</label>
                <select
                  id="wip-pace"
                  value={ritmo}
                  onChange={(e) => setRitmo(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="rilassato">{getTranslation('pace_rilassato', language)}</option>
                  <option value="standard">{getTranslation('pace_standard', language)}</option>
                  <option value="intenso">{getTranslation('pace_intenso', language)}</option>
                </select>
              </div>
              <div className="flex-1 space-y-3">
                <label htmlFor="wip-guide" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation('guide_label', language)}</label>
                <select
                  id="wip-guide"
                  value={guida}
                  onChange={(e) => setGuida(e.target.value)}
                  className="w-full px-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                >
                  <option value="NICKY">{getTranslation('guide_nicky', language)}</option>
                  <option value="DANTE">{getTranslation('guide_dante', language)}</option>
                  <option value="ENTRAMBI">{getTranslation('guide_entrambi', language)}</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    // Scrollbar visibile: `no-scrollbar` sull'intera schermata toglieva
    // l'unico indicatore che il contenuto continua sotto la piega.
    <div className="flex-1 flex flex-col bg-[#f8f5f0] overflow-y-auto overflow-x-hidden print:overflow-visible pb-32 print:pb-0">
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}
      {/* Header — pt rispetta la notch/status bar su PWA e app nativa */}
      <div className="px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-8 bg-primary text-white relative overflow-hidden print:hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tight mb-2">{getTranslation("planner_title", language)}</h1>
          <p className="text-white/60 text-sm font-bold">{getTranslation("planner_desc", language)}</p>
        </div>
      </div>


      <div className="p-6">
        <AnimatePresence mode="wait">
          {plannerMode === 'wip_agent' && (
            <div className="pt-4">
              <WipAgentPlanner
                language={language}
                onClose={() => setPlannerMode('selection')}
                onReady={applyWipAgentParams}
              />
            </div>
          )}

          {plannerMode === 'selection' && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 pt-4"
            >
              {/* 2 colonne su mobile, 4 da tablet in su: nel guscio desktop
                  (max-w-1200) le card restavano larghe ~560px con testo 10px.
                  `items-stretch` + h-full pareggia le altezze, che prima
                  variavano con la lunghezza della descrizione. */}
              {/* AGENTE WIP (23/08/2026): l'itinerario si crea parlando. Sta
                  sopra la griglia perché è la strada più semplice di tutte —
                  niente campi — e finisce comunque nel flusso standard (vedi
                  applyWipAgentParams). */}
              <button
                onClick={() => setPlannerMode('wip_agent')}
                className="w-full p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/70 shadow-sm flex items-center gap-3 group hover:shadow-md hover:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/40 outline-none transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-110 transition-transform">
                  <img src="/avatar.png" alt="WIP" className="w-full h-full object-cover p-0.5" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h3 className="text-sm font-black text-gray-900 leading-tight">{getTranslation('wip_agent_mode', language)}</h3>
                  <p className="text-[11px] text-gray-600 font-bold leading-snug">{getTranslation('wip_agent_mode_desc', language)}</p>
                </div>
                <Mic className="w-5 h-5 text-amber-600 shrink-0" />
              </button>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-stretch">
                {/* Form A: Itinerario su Misura */}
                <button
                  onClick={() => setPlannerMode('form_a')}
                  className="h-full p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shrink-0">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation("auto_mode", language)}</h3>
                  <p className="text-[11px] text-gray-600 font-bold leading-snug">
                    {getTranslation("auto_mode_desc", language)}
                  </p>
                </button>

                {/* Form B: Basato sui Preferiti */}
                <button
                  onClick={() => setPlannerMode('form_b')}
                  className="h-full p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-secondary/50 focus-visible:ring-2 focus-visible:ring-secondary/40 outline-none transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shrink-0">
                    <Star className="w-6 h-6 text-secondary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation("favorites_mode", language)}</h3>
                  <p className="text-[11px] text-gray-600 font-bold leading-snug">
                    {getTranslation("favorites_mode_desc", language)}
                  </p>
                </button>

                {/* Form C: Esplorazione a Raggio */}
                <button
                  onClick={() => setPlannerMode('form_c')}
                  className="h-full p-5 bg-white rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-tertiary/50 focus-visible:ring-2 focus-visible:ring-tertiary/40 outline-none transition-all"
                >
                  <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shrink-0">
                    <Compass className="w-6 h-6 text-tertiary" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation('radius_mode', language)}</h3>
                  <p className="text-[11px] text-gray-600 font-bold leading-snug">
                    {getTranslation('radius_mode_desc', language)}
                  </p>
                </button>

                {/* Form Swip */}
                <button
                  onClick={() => setPlannerMode('tinder_form')}
                  className="h-full p-5 bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl border border-rose-200/60 shadow-sm flex flex-col items-center text-center group hover:shadow-md hover:border-rose-400/50 focus-visible:ring-2 focus-visible:ring-rose-400/40 outline-none transition-all"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-rose-100 to-pink-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shrink-0">
                    <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-tight">{getTranslation('swip_mode', language)}</h3>
                  <p className="text-[11px] text-gray-600 font-bold leading-snug">
                    {getTranslation('swip_mode_desc', language)}
                  </p>
                </button>
              </div>

              {/* Pianificazione di gruppo (ondata 7): ogni amico vota per
                  conto suo (anche senza account), WIP fonde le preferenze */}
              <button
                onClick={() => setPlannerMode('group_plan')}
                className="w-full p-4 bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-200/60 shadow-sm flex items-center gap-3 group hover:shadow-md hover:border-violet-400/50 transition-all"
              >
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <span className="text-lg">👥</span>
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-xs font-black text-gray-900">{getTranslation('group_trip_title', language)}</h3>
                  <p className="text-[10px] text-gray-600 font-bold">{getTranslation('group_trip_desc', language)}</p>
                </div>
              </button>

              {/* 📚 Libreria itinerari: catalogo già generato e verificato,
                  usarli è gratis (niente generazione, niente crediti) */}
              <button
                onClick={() => openLibrary()}
                className="w-full p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/60 shadow-sm flex items-center gap-3 group hover:shadow-md hover:border-amber-400/50 transition-all"
              >
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <span className="text-lg">📚</span>
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-xs font-black text-gray-900">{getTranslation('library_card_title', language)}</h3>
                  <p className="text-[10px] text-gray-600 font-bold">{getTranslation('library_card_desc', language)}</p>
                </div>
              </button>

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
                    <p className="text-[10px] text-gray-600 font-bold">{getTranslation('saved_trips', language)}</p>
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
                    <p className="text-[10px] text-white/70 font-bold">{getTranslation('no_internet', language)}</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {plannerMode === 'group_plan' && (
            <GroupPlanPanel
              language={language}
              defaultDestination={(destinations[0] || '').trim()}
              defaultDays={days}
              notify={notify}
              onBack={() => setPlannerMode('selection')}
              onApplyGroup={(g: MergedGroupPrefs) => {
                // La fusione pre-compila il form: la generazione (e il costo)
                // restano un gesto esplicito dell'organizzatore.
                setDestinations([g.destination]);
                setDestCoords(null);
                setDays(clampDays(g.days));
                if (g.interests.length) setSelectedInterests(g.interests);
                setBudget(g.budget);
                setRitmo(g.ritmo);
                setViaggiatori('gruppo');
                setMese(g.mese);
                setSpecialRequests(g.specialRequests);
                setPlannerMode('form_a');
                notify(getTranslation('group_prefs_applied', language), 'success');
              }}
            />
          )}

          {plannerMode === 'form_a' && (
            <motion.div
              key="form_a"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 pt-4"
            >
              {/* Template stagionali curati (ondata 6, esteso): proposti in
                  base al periodo (mese corrente + 2), chips di tema, 7 card
                  alla volta e sheet col catalogo completo (curati + AI) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pl-1 pr-1">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest">✨ {getTranslation('seasonal_inspirations_label', language)}</label>
                  <button
                    type="button"
                    onClick={() => setShowSeasonalCatalog(true)}
                    className="text-[11px] font-black text-primary/70 hover:text-primary transition"
                  >
                    {getTranslation('vr_b_see_all', language)} →
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                  {([
                    { id: 'tutti' as const, label: 'Tutti', emoji: '' },
                    { id: 'nascosti' as const, label: 'Nascosti', emoji: '💎' },
                    ...SEASONAL_THEMES.map(th => ({ id: th.id, label: th.label, emoji: th.emoji })),
                  ]).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setTplFilter(c.id); setTplShown(7); }}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black transition-all border ${
                        tplFilter === c.id
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
                      }`}
                    >
                      {c.emoji ? `${c.emoji} ` : ''}{c.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                  {seasonTemplates.slice(0, tplShown).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="shrink-0 w-44 text-left bg-white border border-outline-variant/20 rounded-2xl p-3 shadow-sm hover:border-primary/30 hover:shadow-md transition-all active:scale-95"
                    >
                      <div className="text-2xl mb-1">{t.emoji}{t.hiddenGem ? ' 💎' : ''}</div>
                      <div className="text-xs font-black text-primary leading-tight">{tplI18n[t.id]?.title || t.title}</div>
                      <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                        {t.destination}{t.country && t.country !== 'Italia' ? ` · ${t.country}` : ''} · {t.days} {t.days === 1 ? 'giorno' : 'giorni'}
                      </div>
                    </button>
                  ))}
                  {seasonTemplates.length > tplShown && (
                    <button
                      type="button"
                      onClick={() => setTplShown(n => n + 7)}
                      className="shrink-0 w-28 flex flex-col items-center justify-center gap-1 bg-primary/5 border border-primary/20 rounded-2xl p-3 text-primary hover:bg-primary/10 transition-all active:scale-95"
                    >
                      <span className="text-lg">✨</span>
                      <span className="text-[10px] font-black leading-tight text-center">{getTranslation('show_more', language)}</span>
                    </button>
                  )}
                  {seasonTemplates.length === 0 && (
                    <p className="text-[11px] font-bold text-gray-400 px-1 py-3">{getTranslation('no_inspiration_for_filter', language)}</p>
                  )}
                </div>
              </div>

              {/* Itinerari speciali: due verticali dedicate con identità
                  proprie — sosta breve (porti/scali, ore contate) e cammini
                  (ritmo lento). Il tap apre la sheet, la sheet pre-compila. */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">🧭 {getTranslation('special_itineraries_label', language)}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTransitSheet(true)}
                    className="text-left bg-white border border-outline-variant/20 rounded-2xl p-2.5 shadow-sm hover:border-primary/30 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="text-xl mb-1">🛳✈️</div>
                    <div className="text-[11px] font-black text-primary leading-tight">{getTranslation('short_stop_label', language)}</div>
                    <div className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Porti e scali: il meglio nelle ore che hai.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPilgrimSheet(true)}
                    className="text-left bg-white border border-emerald-200/60 rounded-2xl p-2.5 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="text-xl mb-1">🥾</div>
                    <div className="text-[11px] font-black text-emerald-700 leading-tight">Cammini</div>
                    <div className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Tappe e timbri già pensati.
                    </div>
                  </button>
                  {/* 🍷 Strade del vino e del gusto: accanto ai cammini
                      perché è la stessa idea — un percorso che esiste già,
                      con le sue tappe in ordine. Cambia solo cosa si cerca
                      lungo la strada. */}
                  <button
                    type="button"
                    onClick={() => setShowTasteSheet(true)}
                    className="text-left bg-white border border-red-200/60 rounded-2xl p-2.5 shadow-sm hover:border-red-400 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="text-xl mb-1">🍷</div>
                    <div className="text-[11px] font-black text-[#7f1d1d] leading-tight">{getTranslation('taste_routes_label', language)}</div>
                    <div className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Cantine, caseifici e frantoi lungo il percorso.
                    </div>
                  </button>
                  {/* 🧭 Viaggi tematici: otto cataloghi curati di LUOGHI (non
                      di percorsi). Si sceglie il tema, poi il luogo, e il
                      giro intorno lo compone il generatore. */}
                  <button
                    type="button"
                    onClick={() => setShowThematicSheet(true)}
                    className="text-left bg-white border border-sky-200/60 rounded-2xl p-2.5 shadow-sm hover:border-sky-400 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="text-xl mb-1">🧭</div>
                    <div className="text-[11px] font-black text-sky-700 leading-tight">{getTranslation('thematic_trips_label', language)}</div>
                    <div className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Terme, set di film, stelle, street art, mercatini.
                    </div>
                  </button>
                  {/* 🎭 Ispirazioni & temi: apre la libreria pre-filtrata sulla
                      macro-categoria "cultura" (cinema/libri/musica/arte/
                      storia/scienza/sport/moda), stesso meccanismo di
                      prefill di porto/cammino ma sull'intero gruppo. */}
                  <button
                    type="button"
                    onClick={() => openLibrary({ group: 'cultura' })}
                    className="text-left bg-white border border-indigo-200/60 rounded-2xl p-2.5 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="text-xl mb-1">🎭</div>
                    <div className="text-[11px] font-black text-indigo-700 leading-tight">Ispirazioni & temi</div>
                    <div className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Cinema, arte, musica, storia…
                    </div>
                  </button>
                </div>
                {/* 📚 Libreria: itinerari GIÀ generati e verificati (gratis),
                    porta d'accesso "a tutto" senza alcun filtro pre-impostato */}
                <button
                  type="button"
                  onClick={() => openLibrary()}
                  className="w-full text-left bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-3 shadow-sm hover:border-amber-400/60 hover:shadow-md transition-all active:scale-[0.99] flex items-center gap-3"
                >
                  <div className="text-2xl shrink-0">📚</div>
                  <div>
                    <div className="text-xs font-black text-amber-800 leading-tight">{getTranslation('library_card_title', language)}</div>
                    <div className="text-[10px] font-bold text-gray-500 mt-0.5 leading-snug">
                      Centinaia di itinerari pronti e verificati, da usare gratis senza generarli.
                    </div>
                  </div>
                </button>
              </div>

              <div className="space-y-6">
                {/* «Da reel a itinerario»: i luoghi estratti dallo screenshot
                    (CameraScreen) che entreranno come tappe obbligatorie */}
                {reelPlaces.length > 0 && (
                  <div className="flex items-start gap-2.5 bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200/70 rounded-2xl px-3 py-2.5 shadow-sm">
                    <div className="text-xl shrink-0 leading-none mt-0.5">📱</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-black text-violet-800 leading-tight">
                        {getTranslation('vis_reel_banner', language).replace('{n}', String(reelPlaces.length))}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {reelPlaces.map((p, i) => (
                          <span key={`${p.name}-${i}`} className="px-2 py-0.5 rounded-full bg-white border border-violet-200/80 text-[10px] font-bold text-violet-900 truncate max-w-[170px]">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReelPlaces([])}
                      aria-label={getTranslation('vis_reel_banner_cancel', language)}
                      title={getTranslation('vis_reel_banner_cancel', language)}
                      className="shrink-0 w-7 h-7 rounded-full bg-white border border-violet-200/80 text-violet-700 hover:bg-violet-100 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("destination", language)}</label>

                  <div className="space-y-3">
                    {destinations.map((dest, idx) => (
                      <div key={idx} className="relative flex items-center gap-2">
                        <div className="relative flex-1 border-b border-outline focus-within:border-primary transition-colors pb-1">
                          <MapPin className="absolute left-1 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                          <input
                            type="text"
                            role="combobox"
                            aria-expanded={isSuggestOpen(idx)}
                            aria-controls={`wip-dest-list-${idx}`}
                            aria-autocomplete="list"
                            autoComplete="off"
                            placeholder={idx === 0 ? "Es: Firenze, Roma..." : getTranslation('add_destination', language)}
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
                            onKeyDown={(e) => handleSuggestKeyDown(e, idx, handleGenerateAutomatic)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          />
                        </div>

                        {destinations.length > 1 && (
                          <button
                            type="button"
                            aria-label={getTranslation('remove_action', language)}
                            onClick={() => {
                              const newDests = destinations.filter((_, i) => i !== idx);
                              setDestinations(newDests);
                              setFocusedDestIdx(null);
                              setShowSuggestions(false);
                            }}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}

                        {/* La tendina vive DENTRO la riga (che è `relative`):
                            prima era un absolute senza antenato posizionato nel
                            blocco, quindi finiva sotto il pulsante "Aggiungi
                            destinazione" e restava lì anche digitando nel 2°/3°
                            campo, staccata da quello attivo. */}
                        <AnimatePresence>
                          {isSuggestOpen(idx) && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              id={`wip-dest-list-${idx}`}
                              role="listbox"
                              aria-label={getTranslation("destination", language)}
                              className="absolute top-full left-0 right-0 mt-2 bg-surface rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden z-50 max-h-72 overflow-y-auto"
                            >
                              {isSearching ? (
                                <div className="p-4 text-center text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-2" aria-live="polite">
                                  <Loader2 className="w-4 h-4 animate-spin" /> {getTranslation('searching', language)}
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
                                    aria-selected={index === activeSuggestIdx}
                                    className={`w-full text-left px-4 py-3.5 min-h-[52px] transition-colors border-b border-outline-variant/5 last:border-0 flex items-start gap-3 ${index === activeSuggestIdx ? 'bg-primary/10' : 'hover:bg-primary/5 active:bg-primary/10'}`}
                                    onMouseEnter={() => setActiveSuggestIdx(index)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pickSuggestion(suggestion, idx)}
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
                                  {getTranslation('no_results', language)}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={destinations.length >= MAX_DESTINATIONS}
                    onClick={() => setDestinations([...destinations, ''])}
                    className="mt-2 text-xs font-black text-primary hover:text-primary-hover flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/10 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>➕</span> {getTranslation('add_destination', language)}
                  </button>

                  {/* Roadtrip multi-città (ondata 7): con 2+ città il viaggio
                      diventa un roadtrip con trasferimenti come tappe */}
                  {destinations.filter(d => d.trim()).length >= 2 && (
                    <div className="mt-2 flex items-start gap-2 text-[11px] font-bold text-primary/80 bg-primary/5 border border-primary/10 rounded-2xl px-3 py-2">
                      <span className="text-base leading-none">🚗</span>
                      <span>{getTranslation('roadtrip_hint', language)}</span>
                    </div>
                  )}

                  {/* «Big five» gratuita: card discreta sotto la destinazione
                      scelta, apre la mini-guida in una sheet leggibile. */}
                  {(destinations[0] || '').trim().length >= 3 && (
                    <button
                      type="button"
                      onClick={openBigFive}
                      className="mt-2 w-full flex items-center gap-2.5 text-left bg-amber-50/70 border border-amber-200/60 rounded-2xl px-3 py-2.5 hover:bg-amber-50 transition-all active:scale-[0.99]"
                    >
                      <span className="text-xl leading-none shrink-0">📖</span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black text-amber-900 leading-tight truncate">
                          I 5 imperdibili di {(destCoords?.label || destinations[0]).split(',')[0].trim()}
                        </span>
                        <span className="block text-[10px] font-bold text-amber-700/70">{getTranslation('mini_guide_free_hint', language)}</span>
                      </span>
                    </button>
                  )}
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
                        aria-label={getTranslation('duration', language)}
                        value={days}
                        // min/max su un input number non vincolano il valore
                        // digitato: un "99" battuto a mano portava la conferma
                        // crediti a 990. Ora si tronca subito a [1, 30].
                        onChange={(e) => setDays(clampDays(parseInt(e.target.value, 10)))}
                        className="w-full text-center font-black text-primary text-sm bg-transparent outline-none"
                      />
                      <span className="text-xs font-bold text-primary/40 pr-2">gg</span>
                    </div>
                  </div>
                </div>

                {renderMonthSelect()}

                {renderTimeRange()}

                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("interests", language)}</label>
                  <div className="flex flex-wrap gap-3">
                    {interests.map(i => (
                      <button
                        key={i.id}
                        type="button"
                        aria-pressed={selectedInterests.includes(i.id)}
                        onClick={() => toggleInterest(i.id)}
                        className={`px-6 py-3 rounded-full font-black text-xs transition-all border ${selectedInterests.includes(i.id) ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white border-outline-variant/10 text-primary/70 hover:border-primary/30'}`}
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("accommodation_label", language)}</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/30" />
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={getTranslation("accommodation_placeholder", language)}
                      className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                      value={accommodationAddress}
                      onChange={(e) => setAccommodationAddress(e.target.value)}
                    />
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
                  type="button"
                  onClick={handleGenerateAutomatic}
                  disabled={loading || !isOnline || !destinations.some(d => d.trim().length >= 3)}
                  className="flex-1 h-16 bg-primary text-white rounded-3xl font-black tracking-tight shadow-xl shadow-primary/20 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform disabled:opacity-50 px-2"
                >
                  <span className="flex items-center gap-3">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="/avatar.png" alt="" className="w-8 h-8 rounded-full border border-white/20 object-cover" />}
                    <span className="text-sm">{isOnline ? "WIP, Genera l'itinerario" : getTranslation("offline_btn", language)}</span>
                  </span>
                  {/* Trasparenza sullo sconto libreria dichiarata PRIMA di
                      pagare, non solo dopo. */}
                  {isOnline && (
                    <span className="text-[10px] font-bold text-white/75 normal-case tracking-normal leading-tight text-center px-2">
                      {getTranslation('library_note', language)}
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {plannerMode === 'form_b' && (
            <motion.div 
              key="form_b"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 pt-4"
            >
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-xl font-black text-primary">{getTranslation("favorites_mode", language)}</h3>
                <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">
                  {selectedFavoriteIds.length} {getTranslation('selected_items', language)}
                </span>
              </div>

              {/* Scrollbar visibile: con `no-scrollbar` e 30+ preferiti nulla
                  segnalava che la lista proseguiva sotto il bordo. */}
              <div className="grid grid-cols-1 gap-4 max-h-[50dvh] overflow-y-auto pr-2">
                {[...itinerary.map(p => ({ id: p.id, poi: p })), ...savedPois.map(s => ({ id: s.poi_id || s.id, poi: s.data || s }))]
                  .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i) // Deduplicate
                  .map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selectedFavoriteIds.includes(item.id)}
                    onClick={() => toggleFavorite(item.id)}
                    className={`p-4 rounded-[2rem] border transition-all flex items-center gap-4 text-left ${selectedFavoriteIds.includes(item.id) ? 'bg-secondary/5 border-secondary shadow-md' : 'bg-white border-outline-variant/10 shadow-sm opacity-75'}`}
                  >
                    <FavoriteImageOrIcon poi={item.poi || {}} />
                    {/* min-w-0 + line-clamp: senza, un nome lungo mandava a capo
                        e sfondava l'altezza fissa della riga. */}
                    <div className="flex-1 min-w-0">
                      <h4 title={item.poi?.name || item.poi?.title || ''} className="font-black text-on-surface text-sm line-clamp-2 break-words">{item.poi?.name || item.poi?.title || 'Monumento'}</h4>
                      <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase truncate">{item.poi?.category || ''}</p>
                    </div>
                    <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-all ${selectedFavoriteIds.includes(item.id) ? 'bg-secondary text-white' : 'border-2 border-outline-variant/30'}`}>
                      {selectedFavoriteIds.includes(item.id) && <Check className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
                
                {itinerary.length === 0 && savedPois.length === 0 && (
                   <div className="p-10 border-2 border-dashed border-outline-variant/40 rounded-[2.5rem] flex flex-col items-center text-center text-on-surface-variant/70">
                      <Heart className="w-12 h-12 mb-4 opacity-60" />
                      <p className="text-sm font-bold mb-4">{getTranslation("no_gems", language)}</p>
                      {/* Prima era un vicolo cieco: nessuna via per andare ad
                          aggiungere preferiti. */}
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('wip-open-map-area'))}
                        className="px-5 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
                      >
                        <MapIcon className="w-4 h-4" /> {getTranslation('explore_map', language)}
                      </button>
                   </div>
                )}
              </div>

              <div className="pt-4">
                {renderMonthSelect()}
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
                        role="combobox"
                        aria-expanded={isSuggestOpen(0)}
                        aria-controls="wip-base-list"
                        aria-autocomplete="list"
                        autoComplete="off"
                        placeholder={getTranslation('starting_point_placeholder', language)}
                        className="w-full pl-12 pr-14 py-4 bg-white rounded-2xl border border-outline-variant/10 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
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
                        onKeyDown={(e) => handleSuggestKeyDown(e, 0, handleGenerateRadius)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      />
                      {/* Il GPS può metterci diversi secondi: senza stato di
                          attesa il bottone sembrava non fare nulla. */}
                      <button
                        type="button"
                        disabled={gpsLoading}
                        onClick={() => {
                          if (!navigator.geolocation) { notify(getTranslation('err_gps_failed', language)); return; }
                          setGpsLoading(true);
                          navigator.geolocation.getCurrentPosition((pos) => {
                            const newDests = [...destinations];
                            newDests[0] = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                            setDestinations(newDests);
                            // Coordinate note con certezza: niente geocoding sul testo.
                            setDestCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: newDests[0] });
                            setShowSuggestions(false);
                            setGpsLoading(false);
                          }, () => { setGpsLoading(false); notify(getTranslation('err_gps_failed', language)); },
                          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-primary hover:text-primary-hover disabled:opacity-50 rounded-xl"
                        aria-label={getTranslation('use_my_location', language)}
                        title={gpsLoading ? getTranslation('getting_location', language) : getTranslation('use_my_location', language)}
                      >
                        {gpsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Tendina ancorata al campo (il wrapper è `relative`):
                        prima era un absolute agganciato al contenitore del tab. */}
                    <AnimatePresence>
                      {isSuggestOpen(0) && !destinations[0]?.startsWith("GPS:") && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          id="wip-base-list"
                          role="listbox"
                          aria-label={getTranslation('starting_point_placeholder', language)}
                          className="absolute top-full left-0 right-0 mt-2 bg-surface rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden z-50 max-h-72 overflow-y-auto"
                        >
                          {isSearching ? (
                            <div className="p-4 text-center text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-2" aria-live="polite">
                              <Loader2 className="w-4 h-4 animate-spin" /> {getTranslation('searching', language)}
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
                                aria-selected={index === activeSuggestIdx}
                                className={`w-full text-left px-4 py-3.5 min-h-[52px] transition-colors border-b border-outline-variant/5 last:border-0 flex items-start gap-3 ${index === activeSuggestIdx ? 'bg-primary/10' : 'hover:bg-primary/5 active:bg-primary/10'}`}
                                onMouseEnter={() => setActiveSuggestIdx(index)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickSuggestion(suggestion, 0)}
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
                              {getTranslation('no_results', language)}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Raggio chilometrico */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">
                    {getTranslation('radius_km', language)}
                  </label>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-3xl border border-outline-variant/10 shadow-sm">
                    {/* La vecchia catena di ternari conteneva una condizione mai
                        vera (`!['custom'].includes(radius)`) e si riduceva a
                        questo confronto. */}
                    {RADIUS_PRESETS.map(r => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={radius === r}
                        onClick={() => setRadius(r)}
                        className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all ${radius === r ? 'bg-emerald-600 text-white shadow-lg' : 'text-primary/70 hover:bg-primary/5'}`}
                      >
                        {r} km
                      </button>
                    ))}
                    {/* Input personalizzato */}
                    <div className={`flex items-center gap-1 px-3 py-2 rounded-2xl border-2 transition-all ${!RADIUS_PRESETS.includes(radius as any) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        placeholder="0"
                        aria-label={getTranslation('radius_km', language)}
                        value={!RADIUS_PRESETS.includes(radius as any) ? radius : ''}
                        onChange={(e) => setRadius(e.target.value)}
                        onFocus={() => {
                          if (RADIUS_PRESETS.includes(radius as any)) setRadius('');
                        }}
                        // Uscendo dal campo senza aver digitato nulla, `radius`
                        // restava stringa vuota e finiva al server come `null`
                        // (parseInt('') → NaN → null in JSON). Si ripristina il
                        // preset di default.
                        onBlur={() => { if (!radius || !(parseInt(radius, 10) > 0)) setRadius('300'); }}
                        className="w-14 bg-transparent text-sm font-black text-emerald-700 placeholder-gray-400 outline-none text-center"
                      />
                      <span className="text-[10px] font-black text-gray-500">km</span>
                    </div>
                  </div>
                </div>

                {/* Interessi (Migliorati per esplorazione) */}
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">{getTranslation("interests", language)}</label>
                  <div className="flex flex-wrap gap-2">
                    {RADIUS_INTERESTS.map(interest => (
                      <button
                        key={interest.id}
                        type="button"
                        aria-pressed={selectedInterests.includes(interest.id)}
                        onClick={() => toggleInterest(interest.id)}
                        className={`px-4 py-2.5 min-h-[44px] rounded-2xl text-sm font-black transition-all flex items-center gap-2 border-2 ${selectedInterests.includes(interest.id) ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-on-surface border-outline-variant/10 hover:border-primary/30'}`}
                      >
                        <span aria-hidden="true">{interest.icon}</span>
                        {getTranslation(`interest_${interest.id}`, language)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Periodo / Mese */}
                {renderMonthSelect('focus:ring-emerald-600/20')}

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
                        aria-label={getTranslation('duration', language)}
                        value={days}
                        // min/max su un input number non vincolano il valore
                        // digitato: un "99" battuto a mano portava la conferma
                        // crediti a 990. Ora si tronca subito a [1, 30].
                        onChange={(e) => setDays(clampDays(parseInt(e.target.value, 10)))}
                        className="w-full text-center font-black text-primary text-sm bg-transparent outline-none"
                      />
                      <span className="text-xs font-bold text-primary/40 pr-2">gg</span>
                    </div>
                  </div>
                </div>

                {renderTimeRange()}

                {renderAdvancedSettings()}

              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  aria-label={getTranslation('cancel', language)}
                  onClick={() => setPlannerMode('selection')}
                  className="w-16 h-16 rounded-3xl bg-white border border-outline-variant/10 flex items-center justify-center text-primary/60 hover:text-red-500 transition-colors shadow-sm shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
                {/* Il disabled ora rispecchia le stesse condizioni della
                    Modalità 1: prima il bottone era attivo anche senza città e
                    il click apriva soltanto un alert. */}
                <button
                  type="button"
                  onClick={handleGenerateRadius}
                  disabled={loading || !isOnline || !(destinations[0]?.trim().length >= 3)}
                  className="flex-1 h-16 bg-emerald-600 text-white rounded-3xl font-black tracking-tight shadow-xl shadow-emerald-500/20 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <span className="flex items-center gap-3">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {isOnline ? (getTranslation('find_3_alts', language)) : getTranslation("offline_btn", language)}
                  </span>
                  {isOnline && (
                    <span className="text-[10px] font-bold text-white/80 normal-case tracking-normal">
                      {getTranslation('free_no_credits', language)}
                    </span>
                  )}
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
                  <h2 className="text-lg font-black text-primary tracking-tight">❤️ {getTranslation('swip_mode', language)}</h2>
                  <p className="text-xs text-gray-600 font-bold">{getTranslation('swip_subtitle', language)}</p>
                </div>
              </div>

              {/* Destinazione */}
              <div className="relative">
                <label className="block text-xs font-black text-primary uppercase tracking-widest mb-2">{getTranslation('destination', language)}</label>
                <input
                  type="text"
                  role="combobox"
                  aria-expanded={isSuggestOpen(0)}
                  aria-controls="wip-swip-list"
                  aria-autocomplete="list"
                  autoComplete="off"
                  value={destinations[0]}
                  onChange={(e) => { const d = [...destinations]; d[0] = e.target.value; setDestinations(d); setDestCoords(null); setShowSuggestions(true); setFocusedDestIdx(0); }}
                  onFocus={() => { setShowSuggestions(true); setFocusedDestIdx(0); }}
                  onKeyDown={(e) => handleSuggestKeyDown(e, 0, handleFetchCandidates)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={getTranslation('placeholder_destination_example', language)}
                  // Bordo ambra su una schermata rosa/rosso: allineato alla
                  // palette della modalità.
                  className="w-full px-5 py-4 rounded-3xl border-2 border-rose-100 bg-white/80 text-sm font-bold placeholder-gray-400 focus:outline-none focus:border-rose-300 shadow-sm"
                />
                {isSuggestOpen(0) && suggestions.length > 0 && (
                  <div
                    id="wip-swip-list"
                    role="listbox"
                    aria-label={getTranslation('destination', language)}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden max-h-72 overflow-y-auto"
                  >
                    {suggestions.map((s, i) => {
                      const full = s.description || s.display_name || s.structured_formatting?.main_text || s.name || '';
                      const main = full.split(',')[0];
                      const rest = full.split(',').slice(1).join(',').trim();
                      return (
                      <button
                        key={i}
                        type="button"
                        role="option"
                        aria-selected={i === activeSuggestIdx}
                        onMouseEnter={() => setActiveSuggestIdx(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSuggestion(s, 0)}
                        className={`w-full text-left px-4 py-3.5 min-h-[52px] flex items-start gap-3 border-b border-gray-50 last:border-0 ${i === activeSuggestIdx ? 'bg-primary/10' : 'hover:bg-primary/5 active:bg-primary/10'}`}
                      >
                        <div className="mt-0.5 p-1.5 bg-primary/5 rounded-lg shrink-0">
                          <MapPin className="w-4 h-4 text-primary" />
                        </div>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[15px] font-bold text-gray-800 leading-tight break-words">{main}</span>
                          {rest && <span className="text-xs text-gray-600 leading-snug mt-0.5 break-words">{rest}</span>}
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

              {/* Mese del viaggio: serve alle carte-evento del mazzo (eventi
                  reali Ticketmaster filtrati sulle date giuste). Senza mese
                  il mazzo resta di sole attrazioni, come prima. */}
              {renderMonthSelect('focus:ring-rose-300/40')}

              {/* Categorie */}
              <div>
                <label className="block text-xs font-black text-primary uppercase tracking-widest mb-3">{getTranslation('attraction_types', language)}</label>
                <div className="flex flex-wrap gap-2">
                  {SWIP_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={tinderSelectedCategories.includes(cat.id)}
                      onClick={() => setTinderSelectedCategories(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                      className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-black transition-all border flex items-center gap-1.5 ${
                        tinderSelectedCategories.includes(cat.id)
                          ? 'bg-primary text-white border-primary shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-primary/30'
                      }`}
                    >
                      <span aria-hidden="true">{cat.icon}</span>
                      {getTranslation(`cat_${cat.id}`, language)}
                    </button>
                  ))}
                </div>
              </div>

              {renderAdvancedSettings()}

              <button
                onClick={handleFetchCandidates}
                disabled={candidatesLoading || !destinations[0] || destinations[0].trim().length < 3 || !isOnline}
                className="w-full h-16 bg-gradient-to-r from-rose-400 to-pink-500 text-white rounded-3xl font-black tracking-tight shadow-xl shadow-pink-400/30 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  {candidatesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5 fill-white" />}
                  {getTranslation('start_swip', language)}
                </span>
                <span className="text-[10px] font-bold text-white/85 normal-case tracking-normal">
                  {getTranslation('free_no_credits', language)}
                </span>
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
                <button
                  type="button"
                  aria-label={getTranslation('go_back', language)}
                  onClick={() => setPlannerMode('tinder_form')}
                  className="min-w-[44px] min-h-[44px] bg-white rounded-xl border border-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-center" aria-live="polite">
                  <p className="text-xs font-black text-gray-600 uppercase tracking-widest">
                    {Math.min(currentCardIdx + 1, candidates.length || 1)} / {candidates.length > 0 ? candidates.length : '...'}
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
                  <p className="text-sm font-black text-gray-600">{getTranslation('loading_attractions', language)}</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="text-4xl" aria-hidden="true">😕</p>
                  <p className="text-sm font-black text-gray-600">{getTranslation('no_attractions_found', language)}</p>
                  <button type="button" onClick={() => setPlannerMode('tinder_form')} className="px-6 py-3 min-h-[44px] bg-primary text-white rounded-2xl font-black text-sm">{getTranslation('try_again', language)}</button>
                </div>
              ) : currentCardIdx >= candidates.length ? (
                <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
                  <span className="text-5xl" aria-hidden="true">🎉</span>
                  <h3 className="text-xl font-black text-primary">{getTranslation('seen_all_attractions', language)}</h3>
                  <p className="text-sm text-gray-600 font-bold">{likedCandidates.length} {getTranslation('stops_selected', language)}</p>
                  {likedCandidates.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPlannerMode('tinder_review')}
                      className="w-full h-16 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
                    >
                      <ListChecks className="w-5 h-5" />
                      {getTranslation('review_stops', language)}
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setCurrentCardIdx(0); setLikedCandidates([]); setSwipeHistory([]); }} className="px-6 py-3 min-h-[44px] bg-gray-100 text-gray-700 rounded-2xl font-black text-sm">
                      {getTranslation('start_over', language)}
                    </button>
                  )}
                  {/* Anche a mazzo finito si può tornare sull'ultima carta. */}
                  {swipeHistory.length > 0 && (
                    <button type="button" onClick={undoSwipe} className="px-5 py-2.5 min-h-[44px] text-gray-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:text-primary transition-colors">
                      <RotateCcw className="w-4 h-4" /> {getTranslation('undo_last', language)}
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  {/* Stack di card. La carta IN PRIMO PIANO è quella in flusso
                      (`relative`), quella di sfondo è sovrapposta in absolute:
                      prima era il contrario e l'altezza del contenitore la
                      dettava la carta di sfondo, così un testo più lungo su
                      quella attiva usciva dal riquadro. */}
                  {[candidates[currentCardIdx], candidates[currentCardIdx + 1]].filter(Boolean).map((card, stackIdx) => {
                    const isTop = stackIdx === 0;
                    return (
                      <motion.div
                        key={card._uid || card.id_tappa || `${card.titolo_tappa}-${stackIdx}`}
                        drag={isTop ? "x" : false}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.7}
                        onDragEnd={(e, { offset }) => {
                          if (offset.x > 80) commitSwipe(true);
                          else if (offset.x < -80) commitSwipe(false);
                        }}
                        initial={isTop ? false : { scale: 0.95, y: 12, opacity: 0.6 }}
                        animate={isTop
                          ? { scale: 1, y: 0, opacity: 1, x: swipeDir === 'left' ? -300 : swipeDir === 'right' ? 300 : 0, rotate: swipeDir === 'left' ? -10 : swipeDir === 'right' ? 10 : 0 }
                          : { scale: 0.95, y: 12, opacity: 0.6 }
                        }
                        className={`bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden ${isTop ? 'relative z-10 cursor-grab active:cursor-grabbing' : 'absolute inset-x-0 top-0 z-0 pointer-events-none'}`}
                      >
                        {/* Badge per gli eventi reali (Ticketmaster) mescolati nel mazzo */}
                        {card._isEvent && (
                          <span className="absolute top-3 left-3 z-20 px-2.5 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-black shadow-md pointer-events-none">
                            🎫 Evento reale
                          </span>
                        )}
                        {/* Card content: foto reale se disponibile, altrimenti
                            sfondo tematico per categoria con medaglione. */}
                        {(card.image_url || card.imageUrl || card.photo_url) && !brokenImages[card._uid] ? (
                          <div className="h-52 relative bg-gradient-to-br from-blue-200 via-sky-100 to-slate-50">
                            <img
                              src={card.image_url || card.imageUrl || card.photo_url}
                              alt={card.titolo_tappa}
                              className="w-full h-full object-cover"
                              draggable={false}
                              loading="lazy"
                              // Nascondere l'immagine lasciava una banda vuota di
                              // 208px: si ricade sul medaglione tematico.
                              onError={() => setBrokenImages(prev => ({ ...prev, [card._uid]: true }))}
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
                            : card.tipo === 'evento' ? 'from-indigo-200 via-blue-100 to-violet-50'
                            : 'from-blue-200 via-sky-100 to-slate-50'
                          }`}>
                            {/* Cerchi decorativi di profondità */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/30 blur-2xl" />
                            <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-white/40 blur-3xl" />
                            {/* Medaglione con icona */}
                            <div className="relative w-24 h-24 rounded-full bg-white/80 backdrop-blur-sm border border-white shadow-xl flex items-center justify-center">
                              <span className="text-5xl drop-shadow-sm">
                                {card.tipo === 'museo' ? '🏛️' : card.tipo === 'chiesa' ? '⛪' : card.tipo === 'monumento' ? '🗿' : card.tipo === 'ristorante' ? '🍕' : card.tipo === 'parco' ? '🌿' : card.tipo === 'esperienza' ? '🎟️' : card.tipo === 'evento' ? '🎫' : '📍'}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="p-6 space-y-3">
                          <div className="flex items-center gap-2 pointer-events-none">
                            <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-wider">{card.tipo || 'attrazione'}</span>
                            <span className="text-[10px] text-gray-500 font-bold">{card.ora}</span>
                          </div>
                          <h3 className="text-lg font-black text-gray-900 leading-tight pointer-events-none">{card.titolo_tappa}</h3>
                          {/* Data/orario/venue dell'evento reale: like = tappa
                              bloccata a questo orario nell'itinerario. */}
                          {card._isEvent && card._eventDate && (
                            <p className="text-xs font-black text-indigo-700 pointer-events-none">
                              📅 {formatEventCardDate(card._eventDate, language)}{card._eventTime ? ` · ore ${card._eventTime}` : ''}{card._eventVenue ? ` · ${card._eventVenue}` : ''}
                            </p>
                          )}
                          {/* La descrizione era troncata a 3 righe dentro un
                              blocco `pointer-events-none`: illeggibile e
                              impossibile da espandere. Ora si può aprire. */}
                          <p className={`text-sm text-gray-700 font-medium leading-relaxed ${expandedCard === card._uid ? '' : 'line-clamp-3'}`}>
                            {card.attivita}
                          </p>
                          {isTop && (card.attivita || '').length > 140 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedCard(expandedCard === card._uid ? null : card._uid); }}
                              className="text-[11px] font-black text-primary uppercase tracking-widest hover:underline"
                            >
                              {expandedCard === card._uid ? getTranslation('read_less', language) : getTranslation('read_more', language)}
                            </button>
                          )}
                          {card.consiglio_guida && (
                            <p className="text-xs text-primary/80 font-bold italic pointer-events-none">{card.consiglio_guida}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pulsanti swipe */}
                  <div className="relative z-20 flex justify-center items-center gap-5 mt-6">
                    <button
                      type="button"
                      onClick={() => commitSwipe(false)}
                      disabled={!!swipeDir}
                      aria-label={getTranslation('remove_action', language)}
                      className="w-16 h-16 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center text-gray-500 shadow-lg hover:border-red-300 hover:text-red-500 hover:scale-110 transition-all active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <X className="w-7 h-7" />
                    </button>
                    {/* Undo: il gesto di swipe lo dà per scontato, ma prima
                        l'unico rimedio era "Ricomincia" (che azzerava i like). */}
                    <button
                      type="button"
                      onClick={undoSwipe}
                      disabled={swipeHistory.length === 0 || !!swipeDir}
                      aria-label={getTranslation('undo_last', language)}
                      title={getTranslation('undo_last', language)}
                      className="w-12 h-12 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center text-gray-500 shadow-md hover:border-amber-300 hover:text-amber-600 transition-all active:scale-95 disabled:opacity-30"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => commitSwipe(true)}
                      disabled={!!swipeDir}
                      aria-label={getTranslation('selected_label', language)}
                      className="w-16 h-16 bg-gradient-to-br from-rose-400 to-pink-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-pink-300/40 hover:scale-110 transition-all active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    >
                      <Heart className="w-7 h-7 fill-white" />
                    </button>
                  </div>

                  {renderPremiumExperiences()}

                  {likedCandidates.length > 0 && (
                    <div className="mt-6 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <p className="text-xs font-black text-rose-700 uppercase tracking-widest mb-2">❤️ {getTranslation('selected_label', language)}</p>
                      <div className="flex flex-wrap gap-2">
                        {likedCandidates.map((c, i) => (
                          <span key={c._uid || `${c.titolo_tappa}-${i}`} className="pl-3 pr-1 py-1 bg-white rounded-full text-[11px] font-black text-rose-700 border border-rose-200 shadow-sm inline-flex items-center gap-1.5 max-w-full">
                            <span className="truncate max-w-[160px]" title={c.titolo_tappa}>{c.titolo_tappa}</span>
                            {/* Il target era 8×8 px: impossibile da centrare col dito. */}
                            <button
                              type="button"
                              aria-label={`${getTranslation('remove_action', language)}: ${c.titolo_tappa}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLikedCandidates(prev => prev.filter((_, idx) => idx !== i));
                              }}
                              className="w-7 h-7 shrink-0 bg-rose-100 hover:bg-rose-200 rounded-full flex items-center justify-center transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Si può passare alla revisione con almeno UNA tappa: la vecchia
                  soglia di 3 costringeva a esaurire tutto il mazzo. */}
              {likedCandidates.length >= 1 && currentCardIdx < candidates.length && (
                <button
                  type="button"
                  onClick={() => setPlannerMode('tinder_review')}
                  className="w-full py-4 min-h-[52px] bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <ListChecks className="w-4 h-4" />
                  {getTranslation('review_stops', language)} ({likedCandidates.length})
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
                <button
                  type="button"
                  aria-label={getTranslation('go_back', language)}
                  onClick={() => setPlannerMode('tinder_swipe')}
                  className="min-w-[44px] min-h-[44px] bg-white rounded-xl border border-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-black text-primary tracking-tight">📋 {getTranslation('review_stops', language)}</h2>
                  <p className="text-xs text-gray-600 font-bold">{getTranslation('review_stops_subtitle', language)}</p>
                </div>
              </div>

              {likedCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <span className="text-4xl" aria-hidden="true">🤷</span>
                  <p className="text-sm font-black text-gray-600">{getTranslation('no_stops_selected', language)}</p>
                  <button type="button" onClick={() => setPlannerMode('tinder_swipe')} className="px-6 py-3 min-h-[44px] bg-primary text-white rounded-2xl font-black text-sm">
                    {getTranslation('back_to_swip', language)}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {likedCandidates.map((c, i) => (
                    <div key={c._uid || (c.id_tappa || c.titolo_tappa) + i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <span className="text-2xl shrink-0" aria-hidden="true">
                          {c.tipo === 'museo' ? '🏛️' : c.tipo === 'chiesa' ? '⛪' : c.tipo === 'monumento' ? '🗿' : c.tipo === 'ristorante' ? '🍕' : c.tipo === 'parco' ? '🌿' : '📍'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 title={c.titolo_tappa} className="text-sm font-black text-gray-900 line-clamp-2">{c.titolo_tappa}</h4>
                          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">{c.tipo || 'attrazione'} {c.ora ? `• ${c.ora}` : ''}</p>
                        </div>
                        {/* Target portati a 44px (erano 32). */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            aria-expanded={activeReplacingIdx === i}
                            onClick={() => setActiveReplacingIdx(activeReplacingIdx === i ? null : i)}
                            className="min-w-[44px] min-h-[44px] bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center hover:bg-amber-100 transition-colors"
                            aria-label={getTranslation('replace_action', language)}
                            title={getTranslation('replace_action', language)}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLikedCandidates(prev => prev.filter((_, idx) => idx !== i)); if (activeReplacingIdx === i) setActiveReplacingIdx(null); }}
                            className="min-w-[44px] min-h-[44px] bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors"
                            aria-label={getTranslation('remove_action', language)}
                            title={getTranslation('remove_action', language)}
                          >
                            <X className="w-4 h-4" />
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
                              🔄 {getTranslation('choose_alternative', language)}
                            </p>
                            <div className="max-h-48 overflow-y-auto px-2 pb-3 space-y-1">
                              {availableAlternatives.map((alt, ai) => (
                                  <button
                                    type="button"
                                    key={alt._uid || (alt.id_tappa || alt.titolo_tappa) + ai}
                                    onClick={() => {
                                      setLikedCandidates(prev => {
                                        const copy = [...prev];
                                        copy[i] = alt;
                                        return copy;
                                      });
                                      setActiveReplacingIdx(null);
                                    }}
                                    className="w-full min-h-[52px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white transition-colors text-left"
                                  >
                                    <span className="text-lg shrink-0" aria-hidden="true">
                                      {alt.tipo === 'museo' ? '🏛️' : alt.tipo === 'chiesa' ? '⛪' : alt.tipo === 'monumento' ? '🗿' : alt.tipo === 'ristorante' ? '🍕' : alt.tipo === 'parco' ? '🌿' : '📍'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p title={alt.titolo_tappa} className="text-xs font-black text-gray-800 line-clamp-2">{alt.titolo_tappa}</p>
                                      <p className="text-[10px] text-gray-600 font-bold">{alt.tipo || 'attrazione'}</p>
                                    </div>
                                    <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-1 rounded-lg shrink-0">
                                      {getTranslation('use_alternative', language)}
                                    </span>
                                  </button>
                                ))}
                              {availableAlternatives.length === 0 && (
                                <p className="text-xs text-gray-500 font-bold text-center py-4">{getTranslation('no_alternatives', language)}</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}

              {renderPremiumExperiences()}

              {likedCandidates.length > 0 && (
                <button
                  type="button"
                  onClick={handleGenerateTinderItinerary}
                  disabled={loading || !isOnline}
                  className="w-full h-16 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-3xl font-black shadow-xl shadow-pink-400/30 flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {getTranslation('generate_itinerary_with', language)} {likedCandidates.length} {getTranslation('stops_word', language)}
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
                    type="button"
                    key={alt.id_alternativa || index}
                    disabled={loading}
                    onClick={() => handleGenerateFromAlternative(alt)}
                    className="w-full bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm text-left hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all relative overflow-hidden group disabled:opacity-60"
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

              {/* Rigenerare le idee è gratis: l'addebito avviene solo quando
                  si sceglie un'alternativa e nasce l'itinerario vero. */}
              <button
                type="button"
                onClick={handleGenerateRadius}
                disabled={loading}
                className="w-full py-4 mt-8 bg-emerald-100/60 text-emerald-800 font-black rounded-3xl flex flex-col items-center justify-center gap-0.5 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  {getTranslation('generate_3_more', language)}
                </span>
                <span className="text-[10px] font-bold text-emerald-700/80 normal-case">
                  {getTranslation('free_no_credits', language)}
                </span>
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
                      // JSON.parse PROTETTO: prima una sola riga corrotta (save
                      // parziale) faceva crashare l'INTERA lista in render, e
                      // l'utente non poteva nemmeno cancellarla. Ora la riga
                      // corrotta mostra solo il cestino.
                      let parsedDati: any = null;
                      try {
                        parsedDati = typeof item.dati_itinerario === 'string' ? JSON.parse(item.dati_itinerario) : item.dati_itinerario;
                      } catch { parsedDati = null; }
                      if (!parsedDati) {
                        return (
                          <div key={item.id} className="p-5 rounded-[2rem] bg-white border border-red-100 shadow-sm flex justify-between items-center">
                            <span className="text-xs font-bold text-red-400">{item.titolo || 'Itinerario'} — dati non leggibili</span>
                            <button onClick={() => deleteMyItinerary(item.id)} className="w-9 h-9 rounded-full bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }
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
                                  📅 {giorni.length} {getTranslation('days_count', language)}
                                </span>
                                <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                                  📍 {tappeTotal} {getTranslation('stops_count', language)}
                                </span>
                                {date && <span className="text-[10px] font-bold text-gray-500">{date}</span>}
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
                              // Normalizza giorni (a volte oggetto invece di array)
                              // così la vista non resta bianca senza uscita.
                              setGeneratedPlan({ ...parsedDati, giorni });
                              // Aggancia la riga DB reale: senza, il primo edit
                              // creava un itinerario duplicato e l'agente AI non
                              // era disponibile finché non si salvava.
                              setDbItineraryId(item.itinerary_id || null);
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
                <h3 className="text-xl font-black text-primary">{getTranslation('offline_itineraries_title', language)}</h3>
                <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">
                  {offlinePlans.length} {getTranslation('offline_saved_count', language)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 max-h-[60dvh] overflow-y-auto pr-2 no-scrollbar">
                {offlinePlans.length === 0 ? (
                   <div className="p-12 border-2 border-dashed border-outline-variant/30 rounded-[2.5rem] flex flex-col items-center text-center opacity-40">
                      <Download className="w-12 h-12 mb-4" />
                      <p className="text-sm font-bold">{getTranslation('offline_none', language)}</p>
                      <p className="text-[10px] uppercase font-black tracking-widest mt-2 px-6">{getTranslation('offline_none_hint', language)}</p>
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
                            {getTranslation('offline_saved_on', language)} {new Date(plan.date || plan.data_salvataggio).toLocaleDateString(language.toLowerCase())}
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
                        {getTranslation('offline_open', language)}
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
                  {/* Export .ics: le date esatte non esistono (il form ha solo
                      il mese), quindi la modalina chiede la data di inizio;
                      il default arriva dalla finestra del mese scelto. */}
                  <CalendarExportButton
                    itinerary={generatedPlan}
                    defaultStart={(() => {
                      // Primo giorno del mese scelto nel form (anno prossimo se
                      // il mese è già passato); la modalina ripiega su domani
                      // quando la data non è futura.
                      const idx = MONTH_VALUES.indexOf(mese as (typeof MONTH_VALUES)[number]);
                      if (idx < 0) return null;
                      const now = new Date();
                      const year = idx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
                      return new Date(year, idx, 1);
                    })()}
                    language={language}
                    destCoords={destCoords ? { lat: destCoords.lat, lon: destCoords.lon } : null}
                  />
                  <button
                    onClick={async () => {
                      const d = new Date();
                      const gg = String(d.getDate()).padStart(2, '0');
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const aa = String(d.getFullYear()).slice(-2);
                      const t = generatedPlan?.titolo || getTranslation('itinerary', language);
                      const nomeFile = `WIP - ${t.substring(0, 30)} - ${gg}${mm}${aa}.pdf`;

                      // SUL TELEFONO NON ESISTE window.print() (29/08/2026,
                      // collaudo sul Realme: il tasto non faceva NULLA, senza
                      // nemmeno un errore in console). Il WebView Android non
                      // implementa la stampa: si genera il PDF con html2pdf
                      // dalla vista di stampa e lo si salva nei Documenti,
                      // come fa gia' il manuale (AppGuide) e la Guida Premium.
                      if (Capacitor.isNativePlatform()) {
                        const elemento = document.getElementById('itinerary-print-view');
                        if (!elemento) { notify(getTranslation('pf_pdf_non_riuscito', language)); return; }
                        try {
                          notify(getTranslation('pf_pdf_in_corso', language));
                          const mod: any = await import('html2pdf.js');
                          const html2pdf = mod.default || mod;
                          const blob: Blob = await html2pdf().set({
                            margin: [10, 12, 15, 12],
                            filename: nomeFile,
                            image: { type: 'jpeg', quality: 0.95 },
                            html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true, scrollY: 0, windowWidth: elemento.scrollWidth, windowHeight: elemento.scrollHeight },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                            pagebreak: { mode: ['css', 'legacy'] },
                          }).from(elemento).outputPdf('blob');
                          const { saveBlobAsFile } = await import('../services/premiumGuideService');
                          const ok = await saveBlobAsFile(blob, nomeFile);
                          notify(getTranslation(ok ? 'pf_pdf_salvato' : 'pf_pdf_non_riuscito', language));
                        } catch (e) {
                          console.error('[PlanScreen] PDF itinerario non riuscito', e);
                          notify(getTranslation('pf_pdf_non_riuscito', language));
                        }
                        return;
                      }

                      const oldTitle = document.title;
                      document.title = nomeFile;
                      // Il titolo torna quello vecchio ad anteprima chiusa
                      // ('afterprint'); ma l'evento non arriva su tutti i
                      // browser (annulla su iOS/WebView) e il titolo restava
                      // «...pdf» per sempre: rete di sicurezza con focus e un
                      // timeout lungo, idempotenti.
                      let ripristinato = false;
                      const restoreTitle = () => {
                        if (ripristinato) return;
                        ripristinato = true;
                        document.title = oldTitle;
                        window.removeEventListener('afterprint', restoreTitle);
                        window.removeEventListener('focus', restoreTitle);
                      };
                      window.addEventListener('afterprint', restoreTitle);
                      window.addEventListener('focus', restoreTitle);
                      setTimeout(restoreTitle, 60000);
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

              {printPlan && <PrintView plan={printPlan} language={language} />}

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
                      {/* Quota gratuita di sostituzioni residua su questo giorno */}
                      {freeReplacementsLeft(giorno.giorno) > 0 && (
                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest print:hidden">
                          <RotateCcw className="w-2.5 h-2.5" />
                          {freeReplacementsLeft(giorno.giorno)} {getTranslation('free_replacements_left', language)}
                        </span>
                      )}
                      {/* Piano B pioggia (ondata 6): previsioni reali sul giorno */}
                      {rainByDay[giorno.giorno] && (
                        <span className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[9px] font-black uppercase tracking-widest print:hidden">
                          🌧 {rainByDay[giorno.giorno].prob}%{rainByDay[giorno.giorno].dateLabel ? ` ${rainByDay[giorno.giorno].dateLabel}` : ''}
                          <button
                            onClick={() => handleRainPlan(gIdx)}
                            disabled={rainLoadingDay === giorno.giorno}
                            className="px-1.5 py-0.5 bg-sky-600 text-white rounded-full disabled:opacity-50 hover:bg-sky-700 transition-colors"
                            title={getTranslation('rain_variant_tooltip', language)}
                          >
                            {rainLoadingDay === giorno.giorno ? '…' : 'Piano B'}
                          </button>
                        </span>
                      )}
                      <div className="flex-1 h-px bg-primary/10 min-w-[12px]"></div>
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        {setIsAudioGuideActive && (
                          <button 
                            onClick={() => {
                              // (28/08/2026, collaudo) NON solo cuffie: LE TAPPE DI QUESTO
                              // GIORNO VANNO NEL RADAR come giro Dieci Tappe — tracciato,
                              // ordine del piano, aggiunte lungo la strada, X sui pin, «Crea
                              // il giro». Fuori pasti, pause e trasferimenti: non sono luoghi
                              // da audioguida. L'id e` lo stesso con cui la tappa e` scritta
                              // in shared_pois per il geofencing (vedi l'upsert piu` su), cosi`
                              // il servizio nativo e la porta d'ingresso la riconoscono.
                              //
                              // (29/08/2026) PRIMA SI CHIEDE COME: a piedi il giorno diventa
                              // il giro qui dentro; in auto si esce su Google Maps con tutte
                              // le tappe. Guidando l'audioguida a piedi non serve, e i pin
                              // non si toccano.
                              // TUTTE le tappe con coordinate, pranzi e pause
                              // comprese (29/08/2026, committente): un giorno
                              // senza il ristorante non e' piu' il giorno che
                              // l'utente ha pianificato, e il tracciato
                              // passerebbe altrove. Quelle che non hanno una
                              // storia entrano come tappe MUTE: si vedono, ci
                              // si arriva, l'arrivo si annuncia col nome, ma
                              // non parlano e non costano nulla.
                              const SENZA_RACCONTO = ['ristorante', 'pausa', 'spostamento', 'trasferimento', 'pranzo', 'cena', 'colazione', 'aperitivo', 'shopping', 'hotel', 'alloggio'];
                              const tappe = (giorno.tappe || []).filter((t: any) => {
                                const la = Number(t?.coordinate?.lat), lo = Number(t?.coordinate?.lng ?? t?.coordinate?.lon);
                                return Number.isFinite(la) && Number.isFinite(lo) && la !== 0 && lo !== 0;
                              });
                              const poi = tappe.map((t: any) => {
                                const la = Number(t.coordinate.lat), lo = Number(t.coordinate.lng ?? t.coordinate.lon);
                                const stableId = `iti-${String(t.titolo_tappa || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}-${la.toFixed(3)}_${lo.toFixed(3)}`.replace(/\./g, 'p');
                                const tipo = String(t?.tipo || '').toLowerCase();
                                return {
                                  id: stableId, name: t.titolo_tappa, lat: la, lon: lo,
                                  category: mapItineraryCategoryToMapCategory(t.tipo || 'monumenti'),
                                  city: (generatedPlan as any)?.destinazione || (generatedPlan as any)?.destination || null,
                                  senzaGuida: SENZA_RACCONTO.some((s) => tipo.includes(s)) || undefined,
                                  // La foto della tappa, se il piano la porta: va nel cruscotto a display spento.
                                  image_url: t.image_url || t.foto || t.immagine || t.photo_url || null,
                                };
                              });
                              if (poi.length === 0) return;
                              setNavGiorno({ titolo: `${getTranslation('day', language)} ${giorno.giorno}`, poi });
                            }}
                            title={getTranslation('gr_nel_radar', language)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all print:hidden ${isAudioGuideActive ? 'bg-secondary text-white shadow-md scale-105' : 'bg-secondary/10 text-secondary hover:bg-secondary/20 hover:scale-105'}`}
                          >
                            <Headphones className="w-3 h-3 shrink-0" /> {getTranslation('gr_nel_radar', language)} ({Math.min(MAX_TAPPE, (giorno.tappe || []).length)})
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
                              <button onClick={handleResumePodcast} title={getTranslation('resume', language)} className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors">
                                <Play className="w-3 h-3" />
                              </button>
                            ) : (
                              <button onClick={handlePausePodcast} title={getTranslation('pause', language)} className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors">
                                <Pause className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={handleStopPodcast} title={getTranslation('stop', language)} className="w-6 h-6 rounded-lg bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                              <Square className="w-3 h-3" />
                            </button>
                            <button onClick={handleReplayPodcast} title={getTranslation('replay_from_start', language)} className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center hover:bg-amber-200 transition-colors">
                              <SkipBack className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePlayDailyPodcast(giorno.giorno, giorno.tappe, gIdx === generatedPlan.giorni.length - 1)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all print:hidden ${
                              podcastCache[`${generatedPlan?.id || generatedPlan?.titolo || 'plan'}_day${giorno.giorno}`]
                                ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 hover:scale-105'
                            }`}
                          >
                            {podcastCache[`${generatedPlan?.id || generatedPlan?.titolo || 'plan'}_day${giorno.giorno}`] ? (
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
                        <div key={tappa.id_tappa} className="relative" aria-busy={replacingId === tappa.id_tappa}>
                        {/* Spinner locale della sostituzione: la card resta
                            al suo posto, niente overlay a tutto schermo. */}
                        {replacingId === tappa.id_tappa && (
                          <div className="absolute inset-0 z-10 rounded-[2rem] bg-white/70 backdrop-blur-[1px] flex items-center justify-center gap-2 text-primary text-xs font-black uppercase tracking-widest">
                            <Loader2 className="w-4 h-4 animate-spin" /> {getTranslation('replacing_stop', language)}
                          </div>
                        )}
                        <ItineraryStop
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
                          onReplace={() => handleReplaceTappa(tappa.id_tappa, giorno.giorno)}
                          freeReplacementsLeft={freeReplacementsLeft(giorno.giorno)}
                          replaceCost={PRICING_LIST.replace_stop}
                          onDelete={() => handleDeleteTappa(gIdx, tappa.id_tappa)}
                          onSelectPoi={onSelectPoi ? handleSelectItineraryPoi : undefined}
                          legToNext={dayLegs[gIdx]?.[tIdx] || null}
                        />
                        </div>
                      ))}

                      {addingStopDay === giorno.giorno ? (
                        <div className="relative mt-8">
                          <div className="absolute -left-[27px] top-4 w-3 h-3 rounded-full border-2 border-[#f8f5f0] shadow-sm bg-gray-300"></div>
                          <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm relative space-y-4">
                            <h4 className="font-black text-primary text-lg mb-2">{getTranslation("add_stop", language)}</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <input type="time" className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.ora} onChange={e => setNewStop({...newStop, ora: e.target.value})} placeholder={getTranslation("placeholder_time", language)} />
                              <select className="col-span-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none" value={newStop.tipo} onChange={e => setNewStop({...newStop, tipo: e.target.value})}>
                                <option value="visita">{getTranslation("stop_type_visita", language)}</option>
                                <option value="ristorante">{getTranslation("stop_type_ristorante", language)}</option>
                                <option value="pausa">{getTranslation("action_break", language)}</option>
                                <option value="spostamento">{getTranslation("stop_type_spostamento", language)}</option>
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
                                {getTranslation("suggest_with_ai", language)}
                              </button>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setAddingStopDay(null)} className="px-4 py-2 min-h-[44px] text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">{getTranslation("cancel", language)}</button>
                                <button type="button" onClick={() => handleAddTappa(gIdx)} className="px-5 py-2 min-h-[44px] text-sm font-black text-white bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-2">
                                  <Plus className="w-4 h-4" /> {getTranslation("save_btn", language)}
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
                          <div className="text-sm font-bold text-primary/60 pt-4 pl-[4px] cursor-pointer group-hover:text-primary transition-colors" onClick={() => setAddingStopDay(giorno.giorno)}>
                            {getTranslation("add_manual_stop", language)}
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

                          <button
                            onClick={() => loadTiqetsForDay(gIdx)}
                            disabled={tiqetsLoadingDay === gIdx}
                            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-200 hover:border-violet-400 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {tiqetsLoadingDay === gIdx
                                  ? <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
                                  : <Ticket className="w-5 h-5 text-violet-600" />
                                }
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-black text-violet-600">🎫 Tiqets</p>
                              </div>
                            </div>
                            {tiqetsExpandedDay === gIdx
                              ? <ChevronUp className="w-5 h-5 text-violet-400" />
                              : <ChevronDown className="w-5 h-5 text-violet-400" />
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
                            ) : <div className="py-6 text-center text-sm text-gray-500 font-bold">{getTranslation('no_tours_viator', language)}</div>}
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
                            ) : <div className="py-6 text-center text-sm text-gray-500 font-bold">{getTranslation('no_tours_gyg', language)}</div>}
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
                            ) : <div className="py-6 text-center text-sm text-gray-500 font-bold">{getTranslation('no_events_ticketmaster', language)}</div>}
                          </motion.div>
                        )}

                        {tiqetsExpandedDay === gIdx && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            {tiqetsByDay[gIdx] && tiqetsByDay[gIdx].length > 0 ? (
                              <div className="space-y-3 mt-4">
                                {tiqetsByDay[gIdx].map((exp: any, eIdx: number) => (
                                  <ExperienceCard key={`tq-${gIdx}-${eIdx}`} exp={exp} onAdd={() => handleAddTiqetsToDay(gIdx, exp)} color="#7c3aed" />
                                ))}
                              </div>
                            ) : <div className="py-6 text-center text-sm text-gray-500 font-bold">{getTranslation('no_tickets_tiqets', language)}</div>}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                ))}

                {/* ➕ Aggiungi un giorno / ➕ Tappa vicina (gita fuori porta):
                    estende l'itinerario ESISTENTE e già salvato via
                    /api/itinerary/extend. Stesso pannello sia per un piano
                    generato normalmente sia per uno attivato dalla Libreria
                    (nessuna differenza di trattamento). */}
                {generatedPlan.id && (
                  <div className="mt-8 print:hidden bg-white p-6 rounded-[2rem] border border-dashed border-primary/20 space-y-4">
                    {extendPanelMode === 'closed' ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => { setExtendPanelMode('day'); setExtendTheme(''); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 text-primary rounded-2xl font-black text-sm hover:bg-primary/20 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> ➕ Aggiungi un giorno
                        </button>
                        <button
                          type="button"
                          onClick={() => { setExtendPanelMode('nearby'); setExtendTheme(''); setExtendNearbyQuery(''); setExtendNearbyPicked(null); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-secondary/10 text-secondary rounded-2xl font-black text-sm hover:bg-secondary/20 transition-colors"
                        >
                          <Compass className="w-4 h-4" /> ➕ Tappa vicina (gita fuori porta)
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-primary text-sm uppercase tracking-widest">
                            {extendPanelMode === 'day' ? '➕ Nuovo giorno' : '➕ Gita fuori porta'}
                          </h4>
                          <button type="button" onClick={() => setExtendPanelMode('closed')} className="p-1.5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {extendPanelMode === 'nearby' && (
                          <div className="relative">
                            {extendNearbyPicked ? (
                              <div className="flex items-center justify-between px-4 py-3 bg-secondary/5 border border-secondary/20 rounded-xl">
                                <span className="text-sm font-bold text-secondary flex items-center gap-2 min-w-0">
                                  <MapPin className="w-4 h-4 shrink-0" /> <span className="truncate">{extendNearbyPicked.description}</span>
                                </span>
                                <button type="button" onClick={() => { setExtendNearbyPicked(null); setExtendNearbyQuery(''); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={extendNearbyQuery}
                                  onChange={e => setExtendNearbyQuery(e.target.value)}
                                  placeholder={getTranslation('search_nearby_city', language)}
                                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-secondary/20"
                                />
                                {extendNearbySearching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3.5 text-gray-400" />}
                                {extendNearbySuggestions.length > 0 && (
                                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                                    {extendNearbySuggestions.map((s: any) => (
                                      <button
                                        type="button"
                                        key={s.id || s.description}
                                        onClick={() => { setExtendNearbyPicked({ description: s.description || s.display_name, lat: s.lat, lon: s.lon }); setExtendNearbySuggestions([]); }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                      >
                                        {s.description || s.display_name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{getTranslation('day_theme', language)}</p>
                          <div className="flex flex-wrap gap-2">
                            {EXTEND_DAY_THEMES.map(th => (
                              <button
                                key={th.id}
                                type="button"
                                onClick={() => setExtendTheme(th.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${extendTheme === th.id ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-primary/30'}`}
                              >
                                {getTranslation(th.labelKey, language)}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setExtendTheme('')}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${!extendTheme ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-primary/30'}`}
                            >
                              ✨ Sorprendimi
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={extendLoading || (extendPanelMode === 'nearby' && !extendNearbyPicked)}
                          onClick={() => handleExtendItinerary(extendPanelMode as 'day' | 'nearby')}
                          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl font-black text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {extendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {extendLoading ? 'Genero…' : `Genera (${PRICING_LIST.extend_itinerary_day} crediti)`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {generatedPlan.giorni.some(g => g.tappe.some(t => t.coordinate && t.coordinate.lat !== 0)) && (() => {
                  const validSelectedDay = validMapSelectedDay;
                  const mapGiorni = validSelectedDay === 'all'
                    ? generatedPlan.giorni
                    : generatedPlan.giorni.filter(g => g.giorno === validSelectedDay);
                  return (
                    <div className="mt-8 break-inside-avoid print:hidden">
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <h3 className="font-black text-primary uppercase tracking-widest text-xs">{getTranslation("itinerary_map", language)}</h3>
                        {/* Selettore giorno: pulsanti a pillola, scorrevoli su
                            mobile. "Tutti" resta il default — la mappa
                            completa coi colori per giorno non cambia
                            comportamento finché non si sceglie un giorno. */}
                        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
                          <button
                            type="button"
                            onClick={() => setMapSelectedDay('all')}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-colors ${validSelectedDay === 'all' ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-primary/30'}`}
                          >
                            {getTranslation('map_all_days', language)}
                          </button>
                          {generatedPlan.giorni.map(g => (
                            <button
                              key={`map-day-sel-${g.giorno}`}
                              type="button"
                              onClick={() => setMapSelectedDay(g.giorno)}
                              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-colors ${validSelectedDay === g.giorno ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-primary/30'}`}
                            >
                              {getTranslation('day', language)} {g.giorno}
                            </button>
                          ))}
                        </div>
                      </div>
                      <PlanMap giorni={mapGiorni} navRouteGeometry={validSelectedDay === 'all' ? routeGeometry : undefined} onSelectPoi={handleSelectItineraryPoi} isAudioGuideActive={isAudioGuideActive} />
                    </div>
                  );
                })()}

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
                  🧭 {getTranslation('starting_point', language)}
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
                  <p className="text-[11px] text-gray-500 font-medium">
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
                        // Prima tappa CON coordinate valide (ITI-04).
                        let firstIdx = 0;
                        while (firstIdx < giorno.tappe.length && !haCoordinateValide(giorno.tappe[firstIdx])) firstIdx += 1;
                        setNavDayIndex(gIdx);
                        setNavStopIndex(firstIdx < giorno.tappe.length ? firstIdx : 0);
                        const firstStop = firstIdx < giorno.tappe.length ? giorno.tappe[firstIdx] : undefined;
                        if (firstStop && haCoordinateValide(firstStop)) {
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
                            // Id com'e' (ITI-01): niente parseInt su un id che puo' mancare.
                            poiId: firstStop.id_tappa || undefined,
                            poiName: firstStop.titolo_tappa,
                            dayIndex: gIdx,
                            stopIndex: firstIdx,
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

              <p className="text-center text-[10px] text-gray-500 font-medium">
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
            language={language}
            currentInstruction={currentInstruction}
            currentManeuver={currentManeuver}
            distanceToNext={distanceToNext}
            distanceToDestination={distanceToDestination}
            etaSeconds={etaSeconds}
            progress={navProgress}
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
      {(loading || candidatesLoading) && !quizDismissed && (
        <LoadingQuiz
          destination={destinations[0] || 'la tua destinazione'}
          quizLength={candidatesLoading && !loading ? 4 : activeQuizLength}
          userId={currentUserId || ''}
          language={language}
          onDismiss={() => setQuizDismissed(true)}
        />
      )}

      {/* Barra di avanzamento quando il quiz è stato chiuso: l'utente vede
          l'itinerario costruirsi ma deve comunque sapere che sta lavorando. */}
      {(loading || candidatesLoading) && quizDismissed && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[95] px-5 py-3 bg-primary text-white rounded-2xl shadow-2xl flex items-center gap-3 print:hidden" aria-live="polite">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest">
            {getTranslation('wip_working', language)}
          </span>
        </div>
      )}

      {/* Quiz anche durante l'attesa di "Aggiungi un giorno"/"Gita fuori
          porta" (~1 minuto, prima solo l'etichetta "Genero…" sul bottone). */}
      {extendLoading && !extendQuizDismissed && (
        <LoadingQuiz
          destination={extendPanelMode === 'nearby' ? (extendNearbyPicked?.description || extendNearbyQuery || destinations[0] || 'la tua destinazione') : (destinations[0] || 'la tua destinazione')}
          quizLength={3}
          userId={currentUserId || ''}
          language={language}
          onDismiss={() => setExtendQuizDismissed(true)}
        />
      )}
      {extendLoading && extendQuizDismissed && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[95] px-5 py-3 bg-primary text-white rounded-2xl shadow-2xl flex items-center gap-3 print:hidden" aria-live="polite">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest">Genero…</span>
        </div>
      )}

      {/* Le notifiche sono renderizzate da <ToastHost/> in App.tsx */}

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
              {/* Audio-libro: fuori dal contenitore PDF, così non finisce in stampa */}
              <PremiumGuideAudiobook content={guideToRender.content} language={language} hash={guideToRender.hash} onContentUpdate={(c: any) => setGuideToRender(g => g ? { ...g, content: c } : g)} />
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
      
      {/* Anteprima Piano B pioggia (ondata 6): si applica solo su conferma */}
      {rainPreview && (
        <div className="fixed inset-0 z-[1360] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRainPreview(null)}>
          <div className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-primary text-base">🌧 Piano B — Giorno {rainPreview.giornoNum} al coperto</h3>
            <p className="text-[11px] text-gray-500 font-medium">{getTranslation('rain_preview_desc', language)}</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {rainPreview.tappe.map((t: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 bg-[#f8f5f0] rounded-xl px-3 py-2">
                  <span className="text-[10px] font-black text-primary/50 mt-0.5 shrink-0 tabular-nums">{t.orario || '—'}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-primary leading-tight">{t.titolo_tappa}</p>
                    {t.attivita && <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{t.attivita}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRainPreview(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest">{getTranslation('cancel', language)}</button>
              <button onClick={applyRainPlan} className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl font-black text-xs uppercase tracking-widest">{getTranslation('apply_variant', language)}</button>
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

      {/* CATALOGO ISPIRAZIONI DI STAGIONE (sheet a tutto schermo) */}
      {showSeasonalCatalog && (
        <SeasonalCatalogSheet
          language={language}
          onClose={() => setShowSeasonalCatalog(false)}
          onApply={(t) => { applyTemplate(t); setShowSeasonalCatalog(false); }}
        />
      )}

      {/* ITINERARI SPECIALI: sosta breve (porti & aeroporti) e cammini */}
      {showTransitSheet && (
        <TransitEscapesSheet
          language={language}
          onClose={() => setShowTransitSheet(false)}
          onApply={applySpecialStop}
          onOpenLibrary={openLibrary}
        />
      )}
      {showPilgrimSheet && (
        <PilgrimWaysSheet
          language={language}
          onClose={() => setShowPilgrimSheet(false)}
          onApply={applySpecialRoute}
          onOpenLibrary={openLibrary}
        />
      )}
      {showTasteSheet && (
        <TasteRoutesSheet
          language={language}
          onClose={() => setShowTasteSheet(false)}
          onApply={applySpecialRoute}
          onOpenLibrary={openLibrary}
        />
      )}
      {/* 🧭 VIAGGI TEMATICI: il luogo diventa un roadtrip di una tappa
          (applySpecialRoute), con il brief del tema in specialRequests. */}
      {showThematicSheet && (
        <ThematicSheet
          language={language}
          onClose={() => setShowThematicSheet(false)}
          onApply={applySpecialRoute}
          onOpenLibrary={openLibrary}
        />
      )}

      {/* 📚 LIBRERIA ITINERARI (sheet a tutto schermo, sopra le altre) */}
      {showLibrarySheet && (
        <ItineraryLibrarySheet
          language={language}
          userId={currentUserId || undefined}
          initialQuery={libraryPrefill?.query || ''}
          initialKind={libraryPrefill?.kind || ''}
          initialGroup={libraryPrefill?.group || ''}
          initialCity={libraryPrefill?.city || ''}
          onClose={() => { setShowLibrarySheet(false); setLibraryPrefill(null); }}
          onUse={activateLibraryItinerary}
        />
      )}

      {/* MINI-GUIDA «BIG FIVE» GRATUITA (sheet leggibile, niente PDF) */}
      {bigFive.open && (
        <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
            <h2 className="font-black text-primary text-lg truncate pr-2">📖 I 5 imperdibili di {bigFive.city}</h2>
            <button
              onClick={() => setBigFive(b => ({ ...b, open: false }))}
              className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition shrink-0"
              aria-label="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-10">
            {bigFive.loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs font-bold">La redazione prepara la mini-guida di {bigFive.city}…</p>
              </div>
            )}
            {!bigFive.loading && bigFive.error && (
              <p className="text-center text-xs font-bold text-gray-400 py-12">{bigFive.error}</p>
            )}
            {!bigFive.loading && bigFive.guide && (
              <div className="max-w-xl mx-auto pt-5 space-y-6">
                <div>
                  <h3 className="text-xl font-black text-primary leading-tight">{bigFive.guide.titolo}</h3>
                  {bigFive.guide.introduzione && (
                    <p className="text-sm text-gray-600 leading-relaxed mt-2">{bigFive.guide.introduzione}</p>
                  )}
                </div>
                {(bigFive.guide.luoghi || []).map((l: any, i: number) => (
                  <div key={i} className="space-y-1.5">
                    <h4 className="text-sm font-black text-primary">{i + 1}. {l.nome}</h4>
                    <p className="text-sm text-gray-700 leading-relaxed">{l.racconto}</p>
                    {l.consiglio && (
                      <p className="text-[12px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        💡 {l.consiglio}
                      </p>
                    )}
                  </div>
                ))}
                {bigFive.guide.invito && (
                  <p className="text-sm text-gray-600 leading-relaxed italic border-t border-gray-100 pt-4">
                    {bigFive.guide.invito}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBigFive(b => ({ ...b, open: false }));
                    // La Guida d'Autore nasce dall'itinerario: se c'è già un
                    // piano si apre il modale, altrimenti si guida al form.
                    if (generatedPlan && currentUserId) setShowPremiumGuideModal(true);
                    else notify(getTranslation('generate_plan_first_guide', language));
                  }}
                  className="w-full py-3 rounded-2xl bg-primary text-white text-sm font-black active:scale-95 transition-transform"
                >
                  {getTranslation('premium_guide_btn', language)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COME FAI QUESTO GIORNO? (29/08/2026) — a piedi diventa un giro Dieci
          Tappe nel radar, con tracciato e tappe che si aggiungono; in auto
          esce su Google Maps con tutte le fermate. */}
      {navGiorno && (
        <NavChoiceSheet
          poi={navGiorno.poi[0]}
          tappe={navGiorno.poi}
          titolo={navGiorno.titolo}
          language={language}
          onClose={() => setNavGiorno(null)}
          onAPiedi={() => {
            const n = tourService.bozzaDaTappe(navGiorno.poi);
            if (setIsAudioGuideActive && !isAudioGuideActive) setIsAudioGuideActive(true);
            if (n > 0) window.dispatchEvent(new CustomEvent('wip-open-radar'));
            // Ogni tappa che parla deve avere scheda, foto e racconto: se non
            // ci sono, si creano ADESSO (vedi assicuraContenutiTappe).
            void assicuraContenutiTappe(navGiorno.poi);
            setNavGiorno(null);
          }}
        />
      )}
    </div>
  );
}

// ── InfoViaggio: Sezione info sicurezza e consigli viaggio ── rimosso, spostato in TravelInfo.tsx
