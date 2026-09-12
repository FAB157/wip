// =====================================================================
// ITAINTA · useWalkingNavigation — navigatore pedonale "WIP Nav" (OSRM)
// Stati: idle / routing / navigating / arrived
// - Turn-by-turn vocale (Web Speech) quando la svolta e' < 30 m.
// - Audioguide automatiche per i POI scelti lungo il percorso
//   (dispatch 'wip-poi-trigger' quando l'utente ci passa vicino).
// - Fuori rotta: ricalcolo automatico del percorso con annuncio vocale.
// - Distanza/ETA calcolate lungo il tracciato reale, non in linea d'aria.
// - Wake lock dello schermo durante la navigazione (dove supportato).
// All'arrivo emette 'wip-nav-arrived' (trigger audioguida del POI).
// Usa il GPS condiviso di locationService (nessun secondo watchPosition).
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { locationService } from '../services/locationService';
import { fetchWalkingRoute, translateManeuver, type WalkingRoute } from '../services/osrmService';
import { speakInstruction, speakArrivalNative } from '../services/ttsService';
import { haversineMeters, type LatLon } from '../lib/geo';
import { notify } from '../lib/toast';
import { reportTrigger } from '../lib/geofencing/telemetry';
import { puntoArrivo } from '../lib/puntoArrivo';
import { getTranslation, type Language } from '../lib/i18n';
import { getGemmeVicine } from '../services/poiRepository';

export type NavState = 'idle' | 'routing' | 'navigating' | 'arrived';

const SPEAK_DISTANCE_M = 30;    // leggi la manovra entro 30 m dalla svolta
// PRE-ANNUNCIO (08/09/2026): a piedi 30 m sono ~25 secondi — se sei distratto
// o c'e' rumore, la svolta letta una volta sola si perde e sei gia' oltre
// l'incrocio. Come ogni navigatore vero: "tra 150 metri gira a destra" prima,
// "gira a destra" a ridosso. Si legge una sola volta per manovra, solo se la
// manovra e' ancora abbastanza lontana da valere l'avviso (>60 m).
const PREANNOUNCE_DISTANCE_M = 150;
const PREANNOUNCE_MIN_M = 60;
// "GIRATI" ALL'AVVIO (08/09/2026): il primo passo sbagliato e' l'errore piu'
// comune a piedi — "Inizia il percorso" non dice verso dove. Con la direzione
// di marcia del GPS (heading, disponibile appena ci si muove) si confronta
// con il rilevamento verso il primo tratto: se differiscono di oltre questa
// soglia, si e' rivolti dalla parte sbagliata e lo si dice.
const GIRATI_SOGLIA_GRADI = 110;
const GIRATI_MAX_FIX = 6;       // si controlla solo nei primi fix con heading valido
// DEVIAZIONE VERSO UNA GEMMA (08/09/2026): il vantaggio che nessun altro
// navigatore ha — milioni di POI e le gemme curate. Camminando, se una gemma
// sta VICINO al percorso ma non sopra (fra GEMMA_MIN_M e GEMMA_MAX_M dal
// tracciato), la si propone: "gemma a 60 m dal percorso, deviare?". Si
// cerca ogni GEMMA_OGNI_MS, mai piu' di una proposta alla volta, e una gemma
// ignorata non si ripropone.
const GEMMA_OGNI_MS = 45000;
const GEMMA_RAGGIO_RICERCA_M = 180;
const GEMMA_MIN_M = 25;
const GEMMA_MAX_M = 120;
// Soglia di arrivo: 30 m DALLA PORTA (la meta e' l'ingresso, o il civico
// dell'indirizzo, vedi puntoArrivoSuStrada), la stessa distanza a cui il
// geofence fa partire la guida dal perimetro. Il router ci porta sulla via del
// portone e a 30 m si e' "davanti": WIP Nav chiude, l'audioguida apre.
const ARRIVE_DISTANCE_M = 30;
const NEARBY_M = 60;            // "nei paraggi": entro questi metri per NEARBY_S secondi = arrivato
const NEARBY_S = 45;
const ARRIVE_ACCURACY_MAX_M = 150; // per il SOLO controllo d'arrivo si accetta un fix peggiore di 80 m
const WALK_SPEED_MS = 1.3;      // ~4.7 km/h per stima ETA
const POI_TRIGGER_M = 80;       // audioguida automatica entro 80 m dal POI scelto
const OFF_ROUTE_M = 45;         // oltre 45 m dal tracciato = fuori rotta
const OFF_ROUTE_FIXES = 2;      // fix GPS consecutivi fuori rotta prima del ricalcolo
const RECALC_COOLDOWN_MS = 20000;
// Backoff dopo un ricalcolo FALLITO (ITI-03): 20 s, poi x2 fino a 120 s.
// Prima lastRecalcRef si aggiornava solo al successo: senza rete si
// ritentava il routing a OGNI fix GPS (uno al secondo), cioe' una tempesta
// di richieste OSRM proprio quando la rete era gia' in difficolta'.
const RECALC_BACKOFF_MIN_MS = 20000;
const RECALC_BACKOFF_MAX_MS = 120000;
// Stima velocita' per l'ETA (ITI-11): media mobile degli ultimi fix,
// limitata a 0,5-2 m/s (sotto = fermo/semaforo, sopra = non a piedi).
const SPEED_SAMPLES = 5;
const SPEED_MIN_MS = 0.5;
const SPEED_MAX_MS = 2;
// Fix GPS con accuratezza peggiore di questa soglia (metri) non vengono usati
// per lo snap-to-route / fuori-rotta / distanza-da-manovra: un fix "ballerino"
// (es. sotto copertura scarsa) farebbe scattare ricalcoli fantasma o letture
// di manovra premature/mancate. Stesso valore di MIN_GPS_ACCURACY in
// SmartGeofenceManager.ts, per coerenza tra i due moduli di navigazione.
const MAX_GPS_ACCURACY_M = 80;
// FIX WIPNAV-1 (10/09/2026): oltre alla prossimita' (SPEAK_DISTANCE_M), lo
// step avanza anche quando la PROGRESSIONE lungo il tracciato ha superato il
// punto della manovra di questo margine — un salto GPS o un incrocio largo
// possono far saltare del tutto i 30 m, e senza questo lo step resta
// congelato per sempre sulla stessa manovra (mai piu' superata).
const PROGRESS_SKIP_MARGIN_M = 18;
// FIX WIPNAV-4 (10/09/2026): quante volte di fila un ricalcolo puo' RIUSCIRE
// e lasciare comunque l'utente fuori rotta prima che scatti lo stesso backoff
// crescente dei fallimenti — altrimenti "Percorso ricalcolato" si ripete ogni
// RECALC_COOLDOWN_MS all'infinito quando la nuova rotta non basta.
const RECALC_STILL_OFFROUTE_MAX = 3;
// FIX WIPNAV-5 (10/09/2026): con origine personalizzata, se non arriva MAI un
// fix GPS valido (permesso negato) il navigatore restava bloccato in
// silenzio per sempre — dopo questa attesa si avvisa esplicitamente.
const ORIGIN_OVERRIDE_NO_FIX_TIMEOUT_MS = 25000;

const REROUTE_PHRASES: Record<string, string> = {
  it: 'Percorso ricalcolato',
  en: 'Route recalculated',
  fr: 'Itinéraire recalculé',
  es: 'Ruta recalculada',
  de: 'Route neu berechnet',
  ru: 'Маршрут пересчитан',
  zh: '路线已重新计算',
};

const NO_GPS_PHRASES: Record<string, string> = {
  it: 'Attiva il GPS o scegli un indirizzo di partenza',
  en: 'Turn on GPS or choose a starting address',
  fr: 'Activez le GPS ou choisissez une adresse de départ',
  es: 'Activa el GPS o elige una dirección de salida',
  de: 'Aktiviere GPS oder wähle eine Startadresse',
  ru: 'Включите GPS или выберите адрес отправления',
  zh: '请开启GPS或选择出发地址',
};

const ROUTE_FAIL_PHRASES: Record<string, string> = {
  it: 'Impossibile calcolare il percorso. Riprova.',
  en: 'Could not calculate the route. Try again.',
  fr: "Impossible de calculer l'itinéraire. Réessayez.",
  es: 'No se pudo calcular la ruta. Inténtalo de nuevo.',
  de: 'Route konnte nicht berechnet werden. Erneut versuchen.',
  ru: 'Не удалось построить маршрут. Попробуйте снова.',
  zh: '无法计算路线，请重试。',
};

// Pre-annuncio: "{m}" = metri arrotondati, "{i}" = istruzione (minuscola).
const PREANNOUNCE_PHRASES: Record<string, string> = {
  it: 'Tra {m} metri, {i}',
  en: 'In {m} meters, {i}',
  fr: 'Dans {m} mètres, {i}',
  es: 'En {m} metros, {i}',
  de: 'In {m} Metern, {i}',
  ru: 'Через {m} метров {i}',
  zh: '{m}米后{i}',
};

const GIRATI_PHRASES: Record<string, string> = {
  it: 'Girati: il percorso parte dietro di te',
  en: 'Turn around: the route starts behind you',
  fr: 'Faites demi-tour : le trajet commence derrière vous',
  es: 'Date la vuelta: la ruta empieza detrás de ti',
  de: 'Umdrehen: die Route beginnt hinter dir',
  ru: 'Развернитесь: маршрут начинается позади вас',
  zh: '请转身：路线从您身后开始',
};

// PRONUNCIA LOCALE DELLE VIE (08/09/2026): la voce TTS della lingua
// dell'UTENTE che legge "Rue de la Paix" o "Hauptstraße" storpia il nome, e
// chi cammina non lo riconosce sul cartello. La frase resta nella lingua
// dell'utente, il nome della via viene letto nella lingua del PAESE della
// meta (il POI ha `country`). Solo quando le due lingue differiscono.
const LINGUA_PAESE: Record<string, string> = {
  Italy: 'it', Italia: 'it', IT: 'it', ITA: 'it',
  France: 'fr', Francia: 'fr', FR: 'fr', FRA: 'fr', Monaco: 'fr', Belgium: 'fr', Belgio: 'fr',
  Switzerland: 'de', Svizzera: 'de', CH: 'de', Germany: 'de', Germania: 'de', DE: 'de', DEU: 'de',
  Austria: 'de', AT: 'de', AUT: 'de', Liechtenstein: 'de',
  Spain: 'es', Spagna: 'es', ES: 'es', ESP: 'es', Mexico: 'es', Argentina: 'es', Chile: 'es',
  Peru: 'es', Colombia: 'es', Ecuador: 'es', Uruguay: 'es', Venezuela: 'es', Bolivia: 'es',
  'United Kingdom': 'en', UK: 'en', GB: 'en', GBR: 'en', Ireland: 'en', 'United States': 'en',
  USA: 'en', US: 'en', Canada: 'en', Australia: 'en', 'New Zealand': 'en',
  Russia: 'ru', RU: 'ru', RUS: 'ru', China: 'zh', CN: 'zh', CHN: 'zh',
};
function linguaLocale(country?: string | null): string | null {
  if (!country) return null;
  return LINGUA_PAESE[country] || LINGUA_PAESE[String(country).trim()] || null;
}

// Rilevamento (gradi, 0-360) da a verso b.
function bearingGradi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLon = (bLon - aLon) * rad;
  const y = Math.sin(dLon) * Math.cos(bLat * rad);
  const x = Math.cos(aLat * rad) * Math.sin(bLat * rad) - Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function differenzaAngolare(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// VIBRAZIONE ALLA SVOLTA (08/09/2026): telefono in tasca e cuffie e' il caso
// d'uso principale — un impulso aptico distinto per destra/sinistra passa
// anche se la voce e' coperta dall'audioguida in corso o dal traffico. Solo
// su nativo (Capacitor Haptics); sul web niente, best-effort.
async function vibraManovra(modifier?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const mod = (modifier || '').toLowerCase();
    const attesa = (ms: number) => new Promise(r => setTimeout(r, ms));
    if (mod.includes('left')) {
      // Sinistra: due impulsi brevi
      await Haptics.impact({ style: ImpactStyle.Medium });
      await attesa(140);
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (mod.includes('right')) {
      // Destra: un impulso lungo
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch { /* plugin assente o negato: si va avanti senza */ }
}

// Frase d'arrivo di riserva ({name} = nome del POI), quando il router non ne
// fornisce una propria nell'ultimo step.
const ARRIVE_PHRASES: Record<string, string> = {
  it: 'Sei arrivato a {name}',
  en: 'You have arrived at {name}',
  fr: 'Vous êtes arrivé à {name}',
  es: 'Has llegado a {name}',
  de: 'Du hast {name} erreicht',
  ru: 'Вы прибыли: {name}',
  zh: '您已到达{name}',
};

// Proiezione punto→segmento (frame equirettangolare locale), identica a
// roadSnap.projectToSeg (non esportata da quel modulo). Distanza in metri DAL
// SEGMENTO (non dal vertice) + punto proiettato. Geometria in [lat, lon].
function projectToSeg(
  lat: number, lon: number, a: [number, number], b: [number, number],
): { lat: number; lon: number; distM: number } {
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const px = lon * cosLat, py = lat;
  const ax = a[1] * cosLat, ay = a[0];
  const bx = b[1] * cosLat, by = b[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const snapLat = ay + t * dy;
  const snapLon = (ax + t * dx) / cosLat;
  return { lat: snapLat, lon: snapLon, distM: haversineMeters(lat, lon, snapLat, snapLon) };
}

export interface NavTarget extends LatLon {
  poiId?: number | string;
  poiName?: string;
  /** Indici della tappa nell'itinerario (giorno/tappa), se la meta e' una
   *  tappa: all'arrivo viaggiano in 'wip-nav-arrived' cosi' PlanScreen marca
   *  QUELLA tappa e non tutte le omonime (ITI-12). */
  dayIndex?: number;
  stopIndex?: number;
  /** Paese della meta (shared_pois.country): decide la lingua in cui si
   *  pronunciano i nomi delle vie (08/09/2026). Opzionale: senza, si legge
   *  tutto nella lingua dell'utente come prima. */
  country?: string | null;
}

/** Riepilogo del percorso appena calcolato, mostrato all'avvio (08/09/2026):
 *  chi parte deve sapere quanto e' lungo, quanto ci vuole e quante svolte
 *  aspettarsi — prima si partiva direttamente con "Inizia il percorso". */
export interface RouteSummary {
  distanceM: number;
  durationSec: number;
  turns: number;
}

/** POI lungo il percorso scelto nel modal WIP Nav. */
export interface RoutePoi {
  id: string | number;
  name?: string;
  nome?: string;
  lat: number;
  lon: number;
  category?: string;
  [key: string]: any;
}

/**
 * Manovra corrente in forma STRUTTURATA (non solo la frase): serve
 * all'overlay per disegnare la freccia giusta invece di un'icona generica.
 */
export interface ManeuverInfo {
  type: string;
  modifier?: string;
  /** Nome della via della manovra, se OSRM lo espone. */
  street?: string;
}

export interface UseWalkingNavigationResult {
  state: NavState;
  currentInstruction: string | null;
  /** Manovra corrente (tipo + direzione) per l'icona direzionale. */
  currentManeuver: ManeuverInfo | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  /** Avanzamento sul percorso, 0..1 (null se non ancora calcolabile). */
  progress: number | null;
  routeGeometry: [number, number][];
  startNavigation: (target: NavTarget, originOverride?: LatLon | null, routePois?: RoutePoi[]) => Promise<void>;
  stopNavigation: () => void;
  /** Ripete a voce l'istruzione corrente (bottone 🔊 nell'overlay). */
  repeatInstruction: () => void;
  /** «Ricalcola da qui»: la strada si rifa` dalla posizione attuale (03/09/2026). */
  recalculateRoute: () => Promise<boolean>;
  /** Ricalcolo manuale in corso (per lo spinner dell'overlay). */
  recalculating: boolean;
  /** Riepilogo del percorso (distanza/durata/svolte), null fuori navigazione. */
  routeSummary: RouteSummary | null;
  /** Gemma vicina al percorso proposta all'utente (null = nessuna proposta). */
  gemmaVicina: GemmaVicina | null;
  /** Accetta la deviazione: si naviga verso la gemma, poi si riprende la meta. */
  deviaVersoGemma: () => Promise<void>;
  /** Rifiuta la proposta (quella gemma non si ripropone piu'). */
  ignoraGemma: () => void;
  /** Meta originale da riprendere dopo la gemma (null = nessuna deviazione in corso). */
  metaDaRiprendere: NavTarget | null;
  /** Dopo la gemma: riparte verso la meta originale. */
  riprendiMeta: () => Promise<void>;
}

export interface GemmaVicina {
  poi: RoutePoi;
  /** Metri dal tracciato (perpendicolare). */
  distM: number;
}

export function useWalkingNavigation(language = 'it'): UseWalkingNavigationResult {
  const [state, setState] = useState<NavState>('idle');
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);
  const [currentManeuver, setCurrentManeuver] = useState<ManeuverInfo | null>(null);
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  /** «Ricalcola da qui» in corso: l'overlay fa girare l'icona (03/09/2026). */
  const [recalculating, setRecalculating] = useState(false);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [gemmaVicina, setGemmaVicina] = useState<GemmaVicina | null>(null);
  const [metaDaRiprendere, setMetaDaRiprendere] = useState<NavTarget | null>(null);
  // Ultima ricerca gemme, gemme gia' proposte/ignorate (mai due volte), meta
  // originale mentre si devia (ref, per leggerla dentro le callback GPS).
  const gemmaUltimaRicercaRef = useRef(0);
  const gemmeViste = useRef<Set<string>>(new Set());
  const gemmaInCorsoRef = useRef(false);
  const ripresaRef = useRef<NavTarget | null>(null);
  // FIX WIPNAV-9: cercaGemmaVicina e' chiamata dentro la subscription GPS
  // creata da startNavigation (useCallback con deps [language]), quindi la
  // sua closure vede lo stato `gemmaVicina` del render in cui startNavigation
  // e' stata (ri)creata, non quello corrente — restava sempre il valore
  // d'avvio. Un ref aggiornato ad ogni render legge sempre il valore vero.
  const gemmaVicinaRef = useRef<GemmaVicina | null>(null);
  // FIX WIPNAV-8: POI scelti lungo il percorso ORIGINALE, salvati prima di
  // deviare verso una gemma — altrimenti startNavigation(..., []) li perdeva
  // per sempre, sia durante la deviazione sia dopo aver ripreso la meta.
  const pendingPoisOriginaliRef = useRef<RoutePoi[]>([]);
  // FIX WIPNAV-5: vero appena arriva il primo fix della subscription GPS di
  // questa navigazione. Con originOverride e GPS negato, senza fix il
  // navigatore restava bloccato in silenzio per sempre.
  const primoFixRicevutoRef = useRef(false);

  const routeRef = useRef<WalkingRoute | null>(null);
  const targetRef = useRef<NavTarget | null>(null);
  const stepIdxRef = useRef(0);
  const spokenRef = useRef<Set<number>>(new Set());
  // Manovre gia' pre-annunciate ("tra 150 m ...") — una sola volta ciascuna.
  const preannouncedRef = useRef<Set<number>>(new Set());
  // "Girati": quanti fix con heading valido si sono gia' esaminati, e se
  // l'avviso e' gia' stato dato (una volta sola per navigazione).
  const giratiFixRef = useRef(0);
  const giratiDettoRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);
  // Lunghezze cumulate del tracciato (dal vertice i alla fine), per la
  // distanza residua lungo il percorso reale.
  const remainingFromVertexRef = useRef<number[]>([]);
  // Metri residui alla meta nel punto di ogni manovra (lungo il tracciato).
  const stepRemainingRef = useRef<number[]>([]);
  const pendingPoisRef = useRef<RoutePoi[]>([]);
  const offRouteCountRef = useRef(0);
  const lastRecalcRef = useRef(0);
  const recalcInFlightRef = useRef(false);
  // Attesa corrente prima di ritentare un ricalcolo fallito (0 = nessun
  // fallimento pendente: vale RECALC_COOLDOWN_MS).
  const recalcBackoffRef = useRef(0);
  // FIX WIPNAV-4: ricalcoli RIUSCITI di fila che hanno lasciato l'utente
  // comunque fuori rotta (azzerato appena si torna dentro OFF_ROUTE_M).
  const successiveOffRouteRecalcsRef = useRef(0);
  // Campioni di velocita' (m/s) degli ultimi fix + ultimo fix per il calcolo
  // distanza/Δt quando il GPS non fornisce speed.
  const speedSamplesRef = useRef<number[]>([]);
  const lastFixRef = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const wakeLockRef = useRef<any>(null);
  // Lunghezza totale del tracciato corrente: denominatore della barra di
  // avanzamento. Si aggiorna a ogni ricalcolo (la barra si riadatta da sé).
  const routeTotalRef = useRef(0);
  // False finché l'utente non si avvicina al tracciato (solo con origine
  // personalizzata): sospende ricalcolo e arrivo finché non è "sul percorso".
  const joinedRouteRef = useRef(true);
  // Da quando si e' "nei paraggi" della meta (entro NEARBY_M) senza essere
  // riusciti a entrare nei 25 m: verso il centroide di un edificio grande, o
  // con un GPS che balla, i 25 m possono non arrivare MAI — e la navigazione
  // restava aperta per sempre, con wake lock e GPS accesi (verificato 22/08).
  const nearbySinceRef = useRef<number | null>(null);

  // IL CRUSCOTTO A DISPLAY SPENTO ANCHE QUI (31/08/2026, collaudo: «il banner
  // blu della navigazione non rimane live quando si spenge il display»). Il
  // giro lo faceva gia' (App.tsx → locationService.updateNavBanner: notifica
  // del foreground service su Android, Live Activity su iOS, notifica locale
  // di ripiego); il WIP Nav verso il singolo POI postava solo la notifica
  // della svolta pronunciata — tra una svolta e l'altra, a schermo spento,
  // niente. Stessa firma-throttle del giro: si riscrive solo quando cambia
  // qualcosa che si legge, non a ogni fix GPS.
  const bannerFirmaRef = useRef('');
  const aggiornaBannerNav = (
    t: NavTarget,
    istruzione: string | null,
    metriAllaSvolta: number | null,
    metriResidui: number | null,
    etaSec: number | null,
    manovra?: ManeuverInfo | null,
  ) => {
    const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    const nome = t.poiName || '';
    const titolo = `${nome}${metriResidui != null ? `${nome ? ' · ' : ''}${dist(metriResidui)}` : ''}`;
    const eta = etaSec != null && etaSec > 0
      ? new Date(Date.now() + etaSec * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '';
    const righe: string[] = [];
    if (istruzione) righe.push(`${istruzione}${metriAllaSvolta != null && metriAllaSvolta > 0 ? ` · ${dist(metriAllaSvolta)}` : ''}`);
    if (eta) righe.push(`~${eta}`);
    // (03/09/2026) Sotto i 100 m dalla svolta la card dice «21 m»: la firma
    // scatta ogni 10 m, non ogni 50, altrimenti il numero sulla lock screen
    // resta fermo mentre in app scende. Oltre, 50 m bastano.
    const ms = metriAllaSvolta ?? -1;
    const scattoSvolta = ms < 0 ? -1 : ms < 100 ? Math.round(ms / 10) : 100 + Math.round(ms / 50);
    const firma = `${nome}|${istruzione || ''}|${scattoSvolta}|${Math.round((metriResidui ?? 0) / 100)}|${manovra?.type || ''}/${manovra?.modifier || ''}`;
    if (firma === bannerFirmaRef.current) return;
    bannerFirmaRef.current = firma;
    const totale = routeTotalRef.current;
    // Gli stessi campi separati del giro: li impagina la Live Activity iOS.
    locationService.updateNavBanner(titolo, righe.join('\n'), true, {
      nomeTappa: nome,
      indiceTappa: 1,
      tappeTotali: 1,
      metriAllaTappa: metriResidui ?? -1,
      istruzione: istruzione || getTranslation('nav_proceed', String(language || 'IT').toUpperCase() as Language),
      metriAllaSvolta: metriAllaSvolta ?? -1,
      metriRimanenti: metriResidui ?? 0,
      eta,
      nomeProssima: '',
      foto: '',
      // La card blu sulla lock screen (03/09/2026): freccia, barra, tasti.
      manovraTipo: manovra?.type || '',
      manovraVerso: manovra?.modifier || '',
      progresso: totale > 1 && metriResidui != null ? Math.min(1, Math.max(0, 1 - metriResidui / totale)) : -1,
      metriTotali: totale,
      inPausa: false,
      modo: 'singola',
      minutiRimanenti: etaSec != null && etaSec >= 0 ? etaSec / 60 : -1,
    }).catch(() => {});
  };
  const spegniBannerNav = () => {
    bannerFirmaRef.current = '';
    // attivo=false: su Android la notifica del servizio torna al testo del
    // radar, su iOS si chiude la Live Activity, e la notifica locale di
    // ripiego viene cancellata (lo fa updateNavBanner stesso).
    // Prima si spegne il banner, POI (se era stato acceso solo per questa
    // navigazione) il servizio nativo: nell'ordine inverso la notifica del
    // servizio sparirebbe con il cruscotto ancora scritto sopra.
    locationService.updateNavBanner('', '', false)
      .catch(() => {})
      .finally(() => { locationService.rilasciaServizioNativoPerNav().catch(() => {}); });
  };

  /**
   * Legge una manovra. Se la via ha un nome e il paese della meta parla una
   * lingua diversa da quella dell'utente, la frase si legge nella lingua
   * dell'utente e il nome della via, subito dopo, in quella LOCALE — cosi'
   * "Rue de la Paix" si sente come lo dice un francese e si riconosce sul
   * cartello. Altrimenti si legge tutto insieme come prima.
   */
  const parlaManovra = (step: { instruction: string; maneuverType: string; maneuverModifier?: string; name?: string }) => {
    const locale = linguaLocale(targetRef.current?.country);
    const utente = String(language || 'it').toLowerCase().slice(0, 2);
    if (step.name && locale && locale !== utente) {
      // Frase SENZA il nome (la variante generica) + nome via, in UNA sola
      // chiamata (FIX WIPNAV-2): due chiamate separate si cancellavano a
      // vicenda (speakInstruction fa cancel() prima di parlare), e si
      // sentiva solo il nome della via, mai l'istruzione della manovra.
      const senzaNome = translateManeuver(step.maneuverType, step.maneuverModifier, language, targetRef.current?.poiName, undefined, undefined);
      speakInstruction(`${senzaNome} ${step.name}`, language);
      return;
    }
    speakInstruction(step.instruction, language);
  };

  const releaseWakeLock = () => {
    try { wakeLockRef.current?.release?.(); } catch { /* già rilasciato */ }
    wakeLockRef.current = null;
  };

  const acquireWakeLock = async () => {
    try {
      const wl = (navigator as any).wakeLock;
      if (wl?.request) wakeLockRef.current = await wl.request('screen');
    } catch { /* non supportato o negato: si continua senza */ }
  };

  // FIX WIPNAV-9: tiene gemmaVicinaRef sincronizzato con lo stato ad ogni
  // render, cosi' cercaGemmaVicina (chiamata dalla subscription GPS di lunga
  // vita creata da startNavigation) legge sempre il valore vero e non quello
  // catturato quando startNavigation e' stata (ri)creata.
  useEffect(() => { gemmaVicinaRef.current = gemmaVicina; }, [gemmaVicina]);

  // Precalcola, per ogni vertice della polilinea, i metri che restano da lì
  // alla destinazione: distanza residua = remaining[vertice più vicino].
  // La mappa principale (MapArea → NavRouteLayer) disegna il tracciato da
  // questo evento: lo stato `routeGeometry` arriva solo a PlanMap, che esiste
  // soltanto dentro un itinerario generato. Chi partiva dal radar o dal
  // popup non vedeva nessuna linea (23/08/2026).
  const emitRoute = (geometry: [number, number][], fit: boolean) => {
    try {
      const t = targetRef.current;
      window.dispatchEvent(new CustomEvent('wip-nav-route', {
        detail: { geometry, fit, destination: t ? { lat: t.lat, lon: t.lon, name: t.poiName } : null },
      }));
    } catch { /* SSR/test */ }
  };

  const setRoute = (route: WalkingRoute, fit = false) => {
    routeRef.current = route;
    routeTotalRef.current = Math.max(route.distance, 1);
    const g = route.geometry;
    const remaining = new Array<number>(g.length).fill(0);
    for (let i = g.length - 2; i >= 0; i--) {
      remaining[i] = remaining[i + 1] + haversineMeters(g[i][0], g[i][1], g[i + 1][0], g[i + 1][1]);
    }
    remainingFromVertexRef.current = remaining;

    // Metri residui alla meta nel punto di OGNI manovra, misurati LUNGO il
    // tracciato. Servono a dire "fra 120 m gira a destra" contando la strada
    // e non la linea d'aria: dietro una curva le due misure divergono, e il
    // navigatore annunciava meno metri di quanti se ne camminano davvero.
    // Si calcola una volta sola qui, non a ogni fix GPS.
    stepRemainingRef.current = route.steps.map((s) => {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < g.length; i++) {
        const d = haversineMeters(s.location.lat, s.location.lon, g[i][0], g[i][1]);
        if (d < bestD) { bestD = d; best = i; }
      }
      return remaining[best] ?? 0;
    });

    setRouteGeometry(g);
    emitRoute(g, fit);
    // Riepilogo per l'overlay: le "svolte" sono le manovre vere, senza
    // partenza e arrivo.
    const turns = route.steps.filter(s => {
      const t = String(s.maneuverType || '').toLowerCase();
      return t !== 'depart' && t !== 'arrive';
    }).length;
    setRouteSummary({ distanceM: Math.round(route.distance), durationSec: Math.round(route.duration), turns });
  };

  // Punto più vicino sul TRACCIATO (proiezione sul segmento, non sul vertice):
  //   dist      = distanza perpendicolare dal percorso → fuori-rotta corretto
  //   remaining = metri residui dalla proiezione alla meta lungo il tracciato
  // La distanza-al-vertice gonfiava il fuori-rotta e faceva scattare ricalcoli
  // fantasma anche restando esattamente sul percorso.
  const nearestOnRoute = (here: LatLon): { idx: number; dist: number; remaining: number } => {
    const g = routeRef.current?.geometry || [];
    const rem = remainingFromVertexRef.current;
    if (g.length === 0) return { idx: 0, dist: Infinity, remaining: 0 };
    if (g.length === 1) {
      return { idx: 0, dist: haversineMeters(here.lat, here.lon, g[0][0], g[0][1]), remaining: rem[0] ?? 0 };
    }
    let best = { idx: 0, dist: Infinity, remaining: rem[0] ?? 0 };
    for (let i = 0; i + 1 < g.length; i++) {
      const p = projectToSeg(here.lat, here.lon, g[i], g[i + 1]);
      if (p.distM < best.dist) {
        const tail = haversineMeters(p.lat, p.lon, g[i + 1][0], g[i + 1][1]);
        best = { idx: i, dist: p.distM, remaining: (rem[i + 1] ?? 0) + tail };
      }
    }
    return best;
  };

  // Audioguide automatiche: se l'utente passa entro POI_TRIGGER_M da un POI
  // scelto nel modal, si apre la scheda con autoplay (il pagamento/quota è
  // gestito a valle come per ogni altro ascolto). Dedupe condiviso con il
  // geofencing normale via __wipLastPoiTrigger.
  const checkRoutePois = (here: LatLon) => {
    const pending = pendingPoisRef.current;
    if (pending.length === 0) return;
    const stillPending: RoutePoi[] = [];
    for (const p of pending) {
      // Dall'INGRESSO quando lo conosciamo, non dal centroide: su un edificio
      // grande il trigger scattava dal lato sbagliato (stesso criterio di
      // foregroundTriggers e del nativo).
      const arrivo = puntoArrivo(p);
      const d = haversineMeters(here.lat, here.lon, arrivo.lat, arrivo.lon);
      if (d <= POI_TRIGGER_M) {
        const lastTrig = (window as any).__wipLastPoiTrigger;
        const isDup = lastTrig && String(lastTrig.id) === String(p.id) && Date.now() - lastTrig.ts < 60000;
        // Telemetria web: trigger scattato o soppresso dal dedupe (cooldown 60s)
        if (isDup) reportTrigger('suppressed', { poiId: p.id });
        else reportTrigger('fired', { poiId: p.id });
        if (!isDup) {
          (window as any).__wipLastPoiTrigger = { id: String(p.id), ts: Date.now() };
          // Anche il cooldown di 6 h dei trigger web: senza, passati 60 s il
          // modulo di prossimita' rifaceva parlare lo stesso POI gia' raccontato
          // da WIP Nav (segnalato 22/08/2026).
          import('../lib/geofencing/foregroundTriggers').then(m => m.segnaScattato(String(p.id))).catch(() => {});
          window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
            detail: {
              poiId: p.id,
              poi: { ...p, name: p.name || p.nome },
              alreadyPaid: false,
              autoPlay: true,
              fromWipNav: true,
            },
          }));
        }
      } else {
        stillPending.push(p);
      }
    }
    pendingPoisRef.current = stillPending;
  };

  // Distanza perpendicolare di un punto dal tracciato (stessa proiezione di
  // nearestOnRoute, ma per un punto qualsiasi, non per la posizione).
  const distanzaDalTracciato = (lat: number, lon: number): number => {
    const g = routeRef.current?.geometry || [];
    if (g.length < 2) return Infinity;
    let best = Infinity;
    for (let i = 0; i + 1 < g.length; i++) {
      const d = projectToSeg(lat, lon, g[i], g[i + 1]).distM;
      if (d < best) best = d;
    }
    return best;
  };

  // Gemme vicine al percorso (una proposta alla volta, throttling, mai la
  // meta stessa ne' i POI gia' scelti lungo il percorso ne' quelle gia' viste).
  const cercaGemmaVicina = (here: LatLon) => {
    const ora = Date.now();
    if (gemmaInCorsoRef.current || gemmaVicinaRef.current || ora - gemmaUltimaRicercaRef.current < GEMMA_OGNI_MS) return;
    if (!joinedRouteRef.current) return;
    gemmaUltimaRicercaRef.current = ora;
    gemmaInCorsoRef.current = true;
    const t = targetRef.current;
    getGemmeVicine(here.lat, here.lon, GEMMA_RAGGIO_RICERCA_M, 12)
      .then((gemme) => {
        if (targetRef.current !== t || !routeRef.current) return;
        const esclusi = new Set<string>([
          ...(t?.poiId != null ? [String(t.poiId)] : []),
          ...pendingPoisRef.current.map(p => String(p.id)),
          ...(ripresaRef.current?.poiId != null ? [String(ripresaRef.current.poiId)] : []),
        ]);
        let migliore: GemmaVicina | null = null;
        for (const g of gemme) {
          const id = String(g.id);
          if (esclusi.has(id) || gemmeViste.current.has(id)) continue;
          const d = distanzaDalTracciato(g.lat, g.lon);
          if (d < GEMMA_MIN_M || d > GEMMA_MAX_M) continue;
          if (!migliore || d < migliore.distM) migliore = { poi: g as unknown as RoutePoi, distM: Math.round(d) };
        }
        if (migliore) {
          gemmeViste.current.add(String(migliore.poi.id));
          setGemmaVicina(migliore);
          void vibraManovra('straight');
        }
      })
      .catch(() => {})
      .finally(() => { gemmaInCorsoRef.current = false; });
  };

  // Fuori rotta: dopo OFF_ROUTE_FIXES fix consecutivi oltre OFF_ROUTE_M dal
  // tracciato, si ricalcola il percorso dalla posizione corrente.
  const maybeRecalc = async (here: LatLon, distFromRoute: number) => {
    // FIX WIPNAV-4: tornati dentro il percorso, si azzera anche il contatore
    // dei ricalcoli "riusciti ma ancora fuori rotta".
    if (distFromRoute <= OFF_ROUTE_M) { offRouteCountRef.current = 0; successiveOffRouteRecalcsRef.current = 0; return; }
    offRouteCountRef.current += 1;
    if (offRouteCountRef.current < OFF_ROUTE_FIXES) return;
    // Dopo un fallimento vale il backoff (20 s → 120 s), altrimenti il
    // cooldown normale fra due ricalcoli riusciti.
    const attesa = recalcBackoffRef.current > 0 ? recalcBackoffRef.current : RECALC_COOLDOWN_MS;
    if (recalcInFlightRef.current || Date.now() - lastRecalcRef.current < attesa) return;

    const t = targetRef.current;
    if (!t) return;
    recalcInFlightRef.current = true;
    let riuscito = false;
    try {
      const route = await fetchWalkingRoute(here, t, language, t.poiName);
      if (route && route.steps.length > 0 && targetRef.current === t) {
        riuscito = true;
        setRoute(route);
        stepIdxRef.current = 0;
        spokenRef.current.clear();
        preannouncedRef.current.clear();
        // Lo step 0 di un reroute e' un 'depart' nel punto in cui si e' gia'
        // (ITI-10): letto ad alta voce interrompeva «Percorso ricalcolato»
        // con un «Prosegui su via X» un secondo dopo. Si marca come gia'
        // detto: il banner e la voce passano direttamente alla prima svolta.
        route.steps.forEach((s, i) => { if (String(s.maneuverType || '').toLowerCase() === 'depart') spokenRef.current.add(i); });
        offRouteCountRef.current = 0;
        lastRecalcRef.current = Date.now();
        // FIX WIPNAV-4: il ricalcolo e' riuscito, ma se resta comunque fuori
        // rotta per RECALC_STILL_OFFROUTE_MAX volte di fila (il prossimo fix
        // fara' risalire offRouteCountRef da capo), si applica lo stesso
        // backoff crescente dei fallimenti — senza, "Percorso ricalcolato" si
        // ripeteva ogni RECALC_COOLDOWN_MS all'infinito.
        successiveOffRouteRecalcsRef.current += 1;
        recalcBackoffRef.current = successiveOffRouteRecalcsRef.current >= RECALC_STILL_OFFROUTE_MAX
          ? Math.min(RECALC_BACKOFF_MAX_MS, recalcBackoffRef.current > 0 ? recalcBackoffRef.current * 2 : RECALC_BACKOFF_MIN_MS)
          : 0;
        const phrase = REROUTE_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || REROUTE_PHRASES.en;
        setCurrentInstruction(phrase);
        setCurrentManeuver({ type: 'reroute' });
        speakInstruction(phrase, language);
      }
    } catch { /* rete assente: si continua col vecchio tracciato */ }
    finally {
      recalcInFlightRef.current = false;
      if (!riuscito && targetRef.current === t) {
        // Anche il fallimento conta come tentativo: prossimo tra 20 s, poi
        // 40, 80, 120 (tetto). Al successo il backoff torna a zero.
        lastRecalcRef.current = Date.now();
        recalcBackoffRef.current = Math.min(
          RECALC_BACKOFF_MAX_MS,
          recalcBackoffRef.current > 0 ? recalcBackoffRef.current * 2 : RECALC_BACKOFF_MIN_MS,
        );
      }
    }
  };

  /**
   * Velocita' stimata a piedi (m/s): media mobile degli ultimi SPEED_SAMPLES
   * fix, dalla speed del GPS se c'e' (> 0) altrimenti da distanza/Δt fra due
   * fix. Clamp 0,5-2 m/s; null finche' non c'e' nessun campione (il
   * chiamante ricade sulla velocita' media del router).
   */
  const aggiornaVelocitaStimata = (loc: { latitude: number; longitude: number; speed: number | null; timestamp: number }): number | null => {
    const ts = Number(loc.timestamp) || Date.now();
    let v: number | null = Number.isFinite(loc.speed as number) && (loc.speed as number) > 0 ? (loc.speed as number) : null;
    const prev = lastFixRef.current;
    if (v == null && prev) {
      const dt = (ts - prev.ts) / 1000;
      if (dt >= 0.5 && dt <= 60) v = haversineMeters(prev.lat, prev.lon, loc.latitude, loc.longitude) / dt;
    }
    lastFixRef.current = { lat: loc.latitude, lon: loc.longitude, ts };
    if (v != null && Number.isFinite(v)) {
      const s = speedSamplesRef.current;
      s.push(v);
      if (s.length > SPEED_SAMPLES) s.splice(0, s.length - SPEED_SAMPLES);
    }
    const s = speedSamplesRef.current;
    if (s.length === 0) return null;
    const media = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.min(SPEED_MAX_MS, Math.max(SPEED_MIN_MS, media));
  };

  const stopNavigation = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    routeRef.current = null;
    targetRef.current = null;
    stepIdxRef.current = 0;
    spokenRef.current.clear();
    preannouncedRef.current.clear();
    giratiFixRef.current = 0;
    giratiDettoRef.current = false;
    pendingPoisRef.current = [];
    remainingFromVertexRef.current = [];
    offRouteCountRef.current = 0;
    routeTotalRef.current = 0;
    // Anche il cooldown del ricalcolo (22/08/2026): restava l'orario
    // dell'ultimo ricalcolo, e una navigazione nuova avviata subito dopo non
    // poteva ricalcolare per RECALC_COOLDOWN_MS anche se gia' fuori rotta.
    lastRecalcRef.current = 0;
    recalcInFlightRef.current = false;
    recalcBackoffRef.current = 0;
    successiveOffRouteRecalcsRef.current = 0;
    pendingPoisOriginaliRef.current = [];
    speedSamplesRef.current = [];
    lastFixRef.current = null;
    // La notifica dell'ultima svolta non deve restare nel centro notifiche,
    // e il banner nativo (FGS Android / Live Activity iOS) va spento, non
    // lasciato fermo sull'ultimo stato per sempre.
    spegniBannerNav();
    releaseWakeLock();
    setState('idle');
    setCurrentInstruction(null);
    setCurrentManeuver(null);
    setDistanceToNext(null);
    setDistanceToDestination(null);
    setEtaSeconds(null);
    setProgress(null);
    setRouteSummary(null);
    setRouteGeometry([]);
    // Stop esplicito: si chiude anche la deviazione verso la gemma.
    ripresaRef.current = null;
    setMetaDaRiprendere(null);
    setGemmaVicina(null);
    gemmaInCorsoRef.current = false;
    emitRoute([], false);
  }, []);

  const repeatInstruction = useCallback(() => {
    if (currentInstruction) speakInstruction(currentInstruction, language);
  }, [currentInstruction, language]);

  /**
   * «RICALCOLA DA QUI» (03/09/2026, collaudo). Il ricalcolo automatico ha
   * soglie (45 m fuori rotta per 2 fix), cooldown e backoff: chi vede la
   * linea sbagliata non deve aspettare. Stessa rotta di maybeRecalc, ma
   * subito, dalla posizione nota, verso la stessa meta. Ritorna false se non
   * c'e` una navigazione, una posizione o una rete.
   */
  const recalculateRoute = useCallback(async (): Promise<boolean> => {
    const t = targetRef.current;
    if (!t || recalcInFlightRef.current) return false;
    // L'ultimo fix del watch se fresco e credibile, altrimenti il GPS ad alta
    // precisione: ricalcolare da un punto vecchio o a 200 m e` peggio di
    // non ricalcolare.
    let last = locationService.getLastLocation();
    if (!last || Date.now() - Number(last.timestamp) > 15_000 || !(Number(last.accuracy) <= MAX_GPS_ACCURACY_M)) {
      last = await new Promise<typeof last>((res) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return res(last);
        navigator.geolocation.getCurrentPosition(
          (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, speed: null, heading: null, timestamp: p.timestamp } as any),
          () => res(last),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 },
        );
      });
    }
    if (!last || targetRef.current !== t) return false;
    recalcInFlightRef.current = true;
    setRecalculating(true);
    try {
      const here: LatLon = { lat: last.latitude, lon: last.longitude };
      const route = await fetchWalkingRoute(here, t, language, t.poiName);
      if (!route || route.steps.length === 0 || targetRef.current !== t) return false;
      setRoute(route, true);
      stepIdxRef.current = 0;
      spokenRef.current.clear();
      preannouncedRef.current.clear();
      route.steps.forEach((s, i) => { if (String(s.maneuverType || '').toLowerCase() === 'depart') spokenRef.current.add(i); });
      offRouteCountRef.current = 0;
      lastRecalcRef.current = Date.now();
      recalcBackoffRef.current = 0;
      successiveOffRouteRecalcsRef.current = 0;
      joinedRouteRef.current = true;
      nearbySinceRef.current = null;
      const phrase = REROUTE_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || REROUTE_PHRASES.en;
      setCurrentInstruction(phrase);
      setCurrentManeuver({ type: 'reroute' });
      setDistanceToNext(null);
      setDistanceToDestination(Math.round(route.distance));
      const etaSec = Math.round(route.duration > 0 ? route.duration : route.distance / WALK_SPEED_MS);
      setEtaSeconds(etaSec);
      setProgress(0);
      speakInstruction(phrase, language);
      bannerFirmaRef.current = '';
      aggiornaBannerNav(t, phrase, null, Math.round(route.distance), etaSec, { type: 'reroute' });
      return true;
    } catch {
      return false;
    } finally {
      recalcInFlightRef.current = false;
      setRecalculating(false);
    }
  }, [language]);

  // I TASTI DEL CRUSCOTTO A DISPLAY SPENTO (03/09/2026): Live Activity iOS
  // / notifica Android → plugin → App.tsx, che con un giro in corso li
  // gestisce da se' e altrimenti li gira qui come evento. Solo se QUESTA
  // navigazione e` in corso.
  useEffect(() => {
    const h = (e: Event) => {
      if (!targetRef.current) return;
      const a = String((e as CustomEvent).detail?.action || '');
      if (a === 'termina') stopNavigation();
      else if (a === 'riascolta') repeatInstruction();
      else if (a === 'ricalcola') void recalculateRoute();
    };
    window.addEventListener('wip-nav-banner-action', h);
    return () => window.removeEventListener('wip-nav-banner-action', h);
  }, [stopNavigation, repeatInstruction, recalculateRoute]);

  const startNavigation = useCallback(
    async (target: NavTarget, originOverride?: LatLon | null, routePois?: RoutePoi[]) => {
      // Chiude un'eventuale navigazione già attiva: senza, la vecchia
      // subscription GPS restava zombie e all'arrivo spegneva quella nuova
      // ripetendo "Sei arrivato" a ogni fix.
      unsubRef.current?.();
      unsubRef.current = null;

      setState('routing');
      targetRef.current = target;
      spokenRef.current.clear();
      preannouncedRef.current.clear();
      giratiFixRef.current = 0;
      giratiDettoRef.current = false;
      // Nuova navigazione: via la proposta di gemma pendente (ripresaRef NO:
      // la imposta deviaVersoGemma subito prima di chiamarci).
      setGemmaVicina(null);
      gemmaUltimaRicercaRef.current = Date.now(); // niente proposta nei primi 45 s
      stepIdxRef.current = 0;
      offRouteCountRef.current = 0;
      recalcBackoffRef.current = 0;
      successiveOffRouteRecalcsRef.current = 0;
      speedSamplesRef.current = [];
      lastFixRef.current = null;
      primoFixRicevutoRef.current = false;
      pendingPoisRef.current = (routePois || []).filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number');
      // Con origine personalizzata (indirizzo) l'utente è tipicamente LONTANO
      // dal tracciato: ricalcolo e arrivo restano sospesi finché non si
      // "aggancia" il percorso, altrimenti il ricalcolo dalla posizione GPS
      // cancellava l'origine scelta dopo 2 fix.
      joinedRouteRef.current = !originOverride;

      // Origine esplicita (es. "Indirizzo personalizzato" dal modal WIP Nav):
      // prima veniva sempre ignorata e si partiva comunque dal GPS.
      let last = locationService.getLastLocation();
      // FIX WIPNAV-7: stessa soglia eta'/accuratezza di recalculateRoute —
      // senza origine esplicita, un ultimo fix vecchio o impreciso e' peggio
      // di chiederne uno fresco prima di partire (prima si usava
      // getLastLocation() senza controllare eta' o accuratezza).
      if (!originOverride && (!last || Date.now() - Number(last.timestamp) > 15_000 || !(Number(last.accuracy) <= MAX_GPS_ACCURACY_M))) {
        last = await new Promise<typeof last>((res) => {
          if (typeof navigator === 'undefined' || !navigator.geolocation) return res(last);
          navigator.geolocation.getCurrentPosition(
            (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, speed: null, heading: null, timestamp: p.timestamp } as any),
            () => res(last),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 },
          );
        });
      }
      // L'utente può aver premuto STOP durante l'attesa del fix fresco.
      if (targetRef.current !== target) return;
      // Senza origine esplicita E senza fix GPS non si può partire: prima si
      // ripiegava su target→target (percorso degenere di 0 m, "sei arrivato"
      // immediato). Meglio rifiutare con un messaggio chiaro.
      if (!originOverride && !last) {
        setState('idle');
        notify(NO_GPS_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || NO_GPS_PHRASES.en);
        return;
      }
      const from: LatLon = originOverride
        ? originOverride
        : { lat: last!.latitude, lon: last!.longitude };

      const route = await fetchWalkingRoute(from, target, language, target.poiName);
      // L'utente può aver premuto STOP durante il calcolo: senza questo guard
      // si ripartiva comunque, con overlay congelato e wake lock leakato.
      if (targetRef.current !== target) return;
      if (!route || route.steps.length === 0) {
        // Prima l'avvio falliva in SILENZIO (overlay che spariva senza alcun
        // feedback): ora avvisiamo l'utente e torniamo a idle.
        setState('idle');
        notify(ROUTE_FAIL_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || ROUTE_FAIL_PHRASES.en);
        return;
      }
      setRoute(route, true);
      setState('navigating');
      const first = route.steps[0];
      setCurrentInstruction(first?.instruction ?? null);
      setCurrentManeuver(first ? { type: first.maneuverType, modifier: first.maneuverModifier, street: first.name } : null);
      setDistanceToDestination(Math.round(route.distance));
      // ETA dalla durata del router (salite, scale, ZTL) quando c'e'; la
      // velocita' fissa resta solo come riserva. Prima `duration` arrivava e
      // veniva buttata: l'orario d'arrivo era sempre "distanza / 4,7 km/h".
      const etaIniziale = Math.round(route.duration > 0 ? route.duration : route.distance / WALK_SPEED_MS);
      setEtaSeconds(etaIniziale);
      setProgress(0);
      nearbySinceRef.current = null;
      // Il cruscotto sulla lock screen parte SUBITO, non alla prima svolta:
      // chi mette il telefono in tasca appena premuto Avvia deve gia' vederlo.
      // PRIMA il servizio nativo (03/09/2026): senza, a cuffie spente il
      // plugin Android rifiuta il banner (servizio inattivo) e a schermo
      // spento la WebView si congela con il navigatore dentro. Vedi
      // locationService.assicuraServizioNativoPerNav. Si aspetta: il primo
      // banner deve trovare il servizio gia` acceso.
      try { await locationService.assicuraServizioNativoPerNav(); } catch { /* si va avanti col ripiego */ }
      if (targetRef.current !== target) return;
      bannerFirmaRef.current = '';
      aggiornaBannerNav(target, first?.instruction ?? null, null, Math.round(route.distance), etaIniziale,
        first ? { type: first.maneuverType, modifier: first.maneuverModifier, street: first.name } : null);
      acquireWakeLock();

      // Sottoscrizione al flusso GPS condiviso
      unsubRef.current = locationService.subscribe((loc) => {
        primoFixRicevutoRef.current = true; // FIX WIPNAV-5: vedi il setTimeout dopo la subscribe
        const t = targetRef.current;
        const r = routeRef.current;
        if (!t || !r) return;

        const here: LatLon = { lat: loc.latitude, lon: loc.longitude };
        // Velocita' stimata su OGNI fix (anche quelli scartati sotto per
        // accuratezza: la media mobile li smussa da se').
        const velocitaStimata = aggiornaVelocitaStimata(loc);

        // Audioguide dei POI scelti lungo il percorso (posizione "raw": la
        // soglia di trigger è larga, 80 m, un fix impreciso non è un problema).
        checkRoutePois(here);

        // Fix GPS poco accurato: non lo usiamo per la navigazione attiva
        // (snap-to-route, fuori-rotta, distanza dalla manovra) — si aspetta
        // il prossimo fix migliore. ECCEZIONE: l'arrivo. Sotto un portico o
        // fra palazzi alti l'accuratezza resta sopra gli 80 m a lungo, e
        // scartare tutti i fix significava non arrivare mai.
        const dDestGrezza = haversineMeters(here.lat, here.lon, t.lat, t.lon);
        // FIX WIPNAV-6: locationService assegna Infinity quando l'accuratezza
        // non e' un numero finito — sentinella per "sconosciuta", non
        // "pessima". Su una WebView che non la riporta, ogni fix vale
        // Infinity: trattarlo come uno scarto automatico lasciava la
        // navigazione cieca per sempre (anche per l'arrivo).
        const accuracySconosciuta = !Number.isFinite(loc.accuracy as number);
        const fixBuono = accuracySconosciuta || loc.accuracy <= MAX_GPS_ACCURACY_M;
        if (!fixBuono && !(loc.accuracy <= ARRIVE_ACCURACY_MAX_M && dDestGrezza <= ARRIVE_DISTANCE_M && joinedRouteRef.current)) return;

        // "GIRATI" (08/09/2026): nei primi fix con direzione di marcia valida
        // (heading arriva solo in movimento) si confronta la direzione in cui
        // si sta andando con il rilevamento verso il primo tratto del
        // percorso. Oltre la soglia si e' partiti dalla parte sbagliata: lo
        // si dice UNA volta, poi il navigatore normale fa il resto. Solo
        // all'inizio (stepIdx 0/1) e solo se si e' vicini al tracciato.
        if (!giratiDettoRef.current && giratiFixRef.current < GIRATI_MAX_FIX && stepIdxRef.current <= 1
            && Number.isFinite(loc.heading as number) && (loc.heading as number) >= 0
            && Number.isFinite(loc.speed as number) && (loc.speed as number) > 0.4) {
          giratiFixRef.current += 1;
          const g = r.geometry;
          // Punto del tracciato a ~25 m avanti dal piu' vicino: il rilevamento
          // verso il vertice immediatamente successivo e' troppo rumoroso.
          const vicino = nearestOnRoute(here);
          let j = vicino.idx + 1, acc = 0;
          while (j + 1 < g.length && acc < 25) { acc += haversineMeters(g[j][0], g[j][1], g[j + 1][0], g[j + 1][1]); j++; }
          const avanti = g[Math.min(j, g.length - 1)];
          if (avanti && vicino.dist <= 40) {
            const versoPercorso = bearingGradi(here.lat, here.lon, avanti[0], avanti[1]);
            if (differenzaAngolare(loc.heading as number, versoPercorso) > GIRATI_SOGLIA_GRADI) {
              giratiDettoRef.current = true;
              const frase = GIRATI_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || GIRATI_PHRASES.en;
              setCurrentInstruction(frase);
              setCurrentManeuver({ type: 'uturn', modifier: 'uturn' });
              speakInstruction(frase, language);
              void vibraManovra('uturn');
            }
          }
        }

        // Distanza residua LUNGO IL TRACCIATO (non in linea d'aria) + ETA.
        // In linea d'aria un percorso a U dava ETA assurde ("200 m" con 15
        // minuti reali di cammino).
        const nearest = nearestOnRoute(here);
        const remaining = Math.max(nearest.remaining, 0);
        const dDestAir = haversineMeters(here.lat, here.lon, t.lat, t.lon);
        const dDest = remaining;
        const metriResidui = Math.round(Math.min(Math.max(dDest, dDestAir), dDest + nearest.dist));
        setDistanceToDestination(metriResidui);
        // ETA = residuo / velocita' REALE dell'utente (media mobile degli
        // ultimi fix, ITI-11): chi cammina piano o si ferma alle vetrine
        // vedeva un orario d'arrivo che non arrivava mai. Riserva: velocita'
        // media del percorso secondo il router (sente salite e scalinate),
        // poi 1,3 m/s.
        const velocitaRotta = r.duration > 0 && r.distance > 0 ? Math.min(2, Math.max(0.6, r.distance / r.duration)) : WALK_SPEED_MS;
        const etaSec = Math.round((dDest + nearest.dist) / (velocitaStimata ?? velocitaRotta));
        setEtaSeconds(etaSec);
        setProgress(Math.min(1, Math.max(0, 1 - dDest / routeTotalRef.current)));

        // Aggancio al tracciato (origine personalizzata): da qui in poi
        // ricalcolo e arrivo tornano attivi.
        if (!joinedRouteRef.current && nearest.dist <= 60) joinedRouteRef.current = true;

        // Fuori rotta → ricalcolo automatico (solo se già sul percorso)
        if (joinedRouteRef.current) maybeRecalc(here, nearest.dist);

        // Gemme vicine al percorso (throttled dentro): solo se sul tracciato
        // e non gia' in deviazione verso una gemma.
        if (joinedRouteRef.current && nearest.dist <= OFF_ROUTE_M && !ripresaRef.current) cercaGemmaVicina(here);

        // Arrivo. Tre modi, perche' i 30 m in linea d'aria da soli non bastavano:
        //  1. entro 30 m dalla meta (la porta, se il POI ha l'ingresso);
        //  2. il tracciato e' finito (meno di 15 m residui) e la meta e' a
        //     meno di 60 m: il router ci ha portati dove poteva;
        //  3. "nei paraggi": entro 60 m da 45 secondi — e' un edificio grande
        //     o un GPS che balla, e restare in navigazione per sempre e' peggio.
        if (joinedRouteRef.current && dDestAir <= NEARBY_M) { if (nearbySinceRef.current == null) nearbySinceRef.current = Date.now(); }
        else nearbySinceRef.current = null;
        const arrivato = joinedRouteRef.current && (
          dDestAir <= ARRIVE_DISTANCE_M ||
          (remaining <= 15 && dDestAir <= NEARBY_M) ||
          (nearbySinceRef.current != null && Date.now() - nearbySinceRef.current >= NEARBY_S * 1000)
        );
        if (arrivato) {
          nearbySinceRef.current = null;
          setState('arrived');
          setProgress(1);
          setCurrentManeuver({ type: 'arrive' });
          setGemmaVicina(null);
          void vibraManovra('straight');
          // A destinazione il cruscotto si chiude: Live Activity/notifica via.
          spegniBannerNav();
          releaseWakeLock();
          const arriveStep = r.steps[r.steps.length - 1];
          const arrivePhrase = arriveStep?.instruction ||
            (ARRIVE_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || ARRIVE_PHRASES.en)
              .replace('{name}', t.poiName || '').trim();
          // Su nativo l'annuncio entra nella coda TTS dei teaser marcato come
          // 'arrival' col poiId: così il teaser del POI parte SUBITO DOPO senza
          // sovrapporsi (unica coda), e solo allora scatta la logica normale
          // dell'audioguida. Su web (o se la coda non lo prende in carico)
          // si ricade sul percorso di sempre.
          void speakArrivalNative(arrivePhrase, t.poiId != null ? String(t.poiId) : undefined)
            .then(taken => { if (!taken) speakInstruction(arrivePhrase, language); });
          window.dispatchEvent(
            new CustomEvent('wip-nav-arrived', { detail: { poiId: t.poiId, poiName: t.poiName, dayIndex: t.dayIndex, stopIndex: t.stopIndex } }),
          );
          unsubRef.current?.();
          unsubRef.current = null;
          return;
        }

        // Avanzamento sui waypoint + lettura manovra entro 30 m
        let idx = stepIdxRef.current;
        while (idx < r.steps.length) {
          const step = r.steps[idx];
          // FIX WIPNAV-10: senza aggancio al percorso (origine personalizzata
          // non ancora "sul" tracciato) non si annuncia qui l'arrivo — lo
          // step 'arrive' poteva dirlo mentre lo stato restava 'navigating'
          // (il gate joinedRouteRef e' solo sul ramo `arrivato` piu' sotto).
          if (String(step.maneuverType || '').toLowerCase() === 'arrive' && !joinedRouteRef.current) break;
          // FIX WIPNAV-1: oltre alla prossimita', avanza lo step anche quando
          // la PROGRESSIONE lungo il tracciato (stessa proiezione di
          // nearestOnRoute/stepRemainingRef) ha superato il punto della
          // manovra di un margine ragionevole — un salto GPS o un incrocio
          // largo possono far saltare del tutto il raggio dei 30 m, e senza
          // questo lo step resta congelato per sempre sulla stessa manovra.
          const remAllaManovraProgressione = stepRemainingRef.current[idx];
          if (remAllaManovraProgressione != null && remaining <= remAllaManovraProgressione - PROGRESS_SKIP_MARGIN_M) {
            spokenRef.current.add(idx); // non annunciare tardivamente una svolta gia' fatta
            idx += 1;
            stepIdxRef.current = idx;
            continue;
          }
          const dStep = haversineMeters(here.lat, here.lon, step.location.lat, step.location.lon);
          if (dStep <= SPEAK_DISTANCE_M) {
            let appenaAnnunciata = false;
            if (!spokenRef.current.has(idx)) {
              spokenRef.current.add(idx);
              setCurrentInstruction(step.instruction);
              setCurrentManeuver({ type: step.maneuverType, modifier: step.maneuverModifier, street: step.name });
              parlaManovra(step);
              void vibraManovra(step.maneuverModifier);
              // (31/08/2026) Al posto della sola notifica locale della svolta
              // c'e' il cruscotto persistente: FGS Android / Live Activity
              // iOS, con la notifica locale come ripiego DENTRO updateNavBanner.
              aggiornaBannerNav(t, step.instruction, 0, metriResidui, etaSec, { type: step.maneuverType, modifier: step.maneuverModifier, street: step.name });
              appenaAnnunciata = true;
            }
            idx += 1; // passa alla manovra successiva
            stepIdxRef.current = idx;
            // FIX WIPNAV-3: due manovre vicine entrambe entro 30 m si
            // valutavano nello stesso tick e la seconda cancellava la voce
            // della prima (speakInstruction fa cancel() prima di parlare).
            if (appenaAnnunciata) break;
          } else {
            // In avvicinamento: mostra la manovra CHE DEVE ANCORA ARRIVARE,
            // non l'ultima annunciata. Prima il banner diceva "gira a destra"
            // (svolta già fatta) accanto ai metri della svolta SUCCESSIVA:
            // testo e distanza si riferivano a due manovre diverse.
            //
            // I metri sono quelli SULLA STRADA, non in linea d'aria: si
            // sottrae il residuo alla meta nel punto di manovra dal residuo
            // nella posizione attuale. Dietro una curva la linea d'aria
            // annunciava meno metri di quanti se ne camminano davvero — un
            // navigatore che dice "fra 40 m" quando ne mancano 70 fa sbagliare
            // la svolta. Si ricade sulla linea d'aria solo se il residuo di
            // quella manovra non è disponibile.
            const remAllaManovra = stepRemainingRef.current[idx];
            const dLungoStrada = remAllaManovra != null
              ? Math.max(0, remaining - remAllaManovra)
              : dStep;
            setDistanceToNext(Math.round(dLungoStrada));

            // PRE-ANNUNCIO: "tra 120 metri, gira a destra" — una volta per
            // manovra, solo per svolte vere (non per partenza/arrivo, che
            // hanno gia' la loro frase) e solo se la manovra e' ancora
            // abbastanza lontana da valere l'avviso. Metri SULLA STRADA,
            // arrotondati a 10 per non dire "tra 137 metri".
            const tipo = String(step.maneuverType || '').toLowerCase();
            if (!preannouncedRef.current.has(idx) && !spokenRef.current.has(idx)
                && tipo !== 'depart' && tipo !== 'arrive'
                && dLungoStrada <= PREANNOUNCE_DISTANCE_M && dLungoStrada >= PREANNOUNCE_MIN_M) {
              preannouncedRef.current.add(idx);
              const metri = Math.round(dLungoStrada / 10) * 10;
              const l2 = (language || 'it').toLowerCase().slice(0, 2);
              const modello = PREANNOUNCE_PHRASES[l2] || PREANNOUNCE_PHRASES.en;
              // L'istruzione in minuscola iniziale dentro la frase ("Tra 120 metri, gira a destra").
              const istr = step.instruction ? step.instruction.charAt(0).toLowerCase() + step.instruction.slice(1) : '';
              speakInstruction(modello.replace('{m}', String(metri)).replace('{i}', istr), language);
            }
            setCurrentInstruction(step.instruction);
            setCurrentManeuver({ type: step.maneuverType, modifier: step.maneuverModifier, street: step.name });
            aggiornaBannerNav(t, step.instruction, Math.round(dLungoStrada), metriResidui, etaSec, { type: step.maneuverType, modifier: step.maneuverModifier, street: step.name });
            break;
          }
        }
      });

      // FIX WIPNAV-5: con origine personalizzata, se non arriva MAI un fix
      // GPS valido (permesso negato) prima il navigatore restava bloccato in
      // silenzio per sempre — dopo un'attesa ragionevole si avvisa
      // esplicitamente invece di restare muto.
      if (originOverride) {
        setTimeout(() => {
          if (targetRef.current === target && !primoFixRicevutoRef.current) {
            notify(NO_GPS_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || NO_GPS_PHRASES.en);
          }
        }, ORIGIN_OVERRIDE_NO_FIX_TIMEOUT_MS);
      }
    },
    [language],
  );

  /** Accetta la gemma: la meta attuale diventa "da riprendere", si naviga
   *  verso la gemma (dal punto d'arrivo/porta, come per ogni POI). Se si era
   *  gia' in deviazione, la meta da riprendere resta quella originale. */
  const deviaVersoGemma = useCallback(async () => {
    const g = gemmaVicina;
    const t = targetRef.current;
    if (!g || !t) return;
    if (!ripresaRef.current) {
      ripresaRef.current = t;
      setMetaDaRiprendere(t);
      // FIX WIPNAV-8: si salva la lista POI ORIGINALE prima che startNavigation
      // la sovrascriva per la deviazione, altrimenti si perdeva per sempre.
      pendingPoisOriginaliRef.current = pendingPoisRef.current.slice();
    }
    setGemmaVicina(null);
    const arrivo = puntoArrivo(g.poi as any);
    await startNavigation({
      lat: arrivo.lat, lon: arrivo.lon,
      poiId: g.poi.id, poiName: g.poi.name || g.poi.nome,
      country: (g.poi as any).country ?? t.country ?? null,
    }, null, pendingPoisOriginaliRef.current);
  }, [gemmaVicina, startNavigation]);

  const ignoraGemma = useCallback(() => {
    if (gemmaVicina) gemmeViste.current.add(String(gemmaVicina.poi.id));
    setGemmaVicina(null);
  }, [gemmaVicina]);

  /** Dopo la gemma: si riparte verso la meta originale e la deviazione si chiude. */
  const riprendiMeta = useCallback(async () => {
    const meta = ripresaRef.current;
    if (!meta) return;
    ripresaRef.current = null;
    setMetaDaRiprendere(null);
    // FIX WIPNAV-8: si riprendono anche i POI originali lungo il percorso,
    // non un array vuoto — altrimenti le audioguide lungo la strada verso la
    // meta originale non scattavano piu' dopo la deviazione.
    await startNavigation(meta, null, pendingPoisOriginaliRef.current);
  }, [startNavigation]);

  // Cleanup su unmount
  useEffect(() => () => {
    unsubRef.current?.();
    // Smontaggio a navigazione attiva: il banner non deve restare appeso.
    // Solo se QUESTA navigazione era in corso — non si tocca quello del giro.
    if (targetRef.current) {
      bannerFirmaRef.current = '';
      locationService.updateNavBanner('', '', false)
        .catch(() => {})
        .finally(() => { locationService.rilasciaServizioNativoPerNav().catch(() => {}); });
    }
    unsubRef.current = null;
    releaseWakeLock();
    emitRoute([], false);
  }, []);

  return {
    state,
    currentInstruction,
    currentManeuver,
    distanceToNext,
    distanceToDestination,
    etaSeconds,
    progress,
    routeGeometry,
    startNavigation,
    stopNavigation,
    repeatInstruction,
    recalculateRoute,
    recalculating,
    routeSummary,
    gemmaVicina,
    deviaVersoGemma,
    ignoraGemma,
    metaDaRiprendere,
    riprendiMeta,
  };
}
